import {copyFile, stat} from 'node:fs/promises';
import {basename, extname, join, relative, resolve} from 'node:path';
import {assetSchema, type AIEDITINGProject, type Asset} from '@aiediting/project-schema';
import {ensureDir, generateProxy, inspectMedia, resolveInside, sha256File} from '@aiediting/media';

const MAX_IMPORT_BYTES = Number(process.env.AIEDITING_MAX_IMPORT_BYTES ?? 20 * 1024 * 1024 * 1024);

function safeName(name: string): string {
  const extension = extname(name).toLowerCase();
  const stem = basename(name, extname(name))
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'asset';
  return `${stem}${extension}`;
}

export function assetPath(projectDir: string, asset: Asset): string {
  return resolveInside(projectDir, asset.path);
}

export async function importAsset(
  projectDir: string,
  project: AIEDITINGProject,
  source: string,
  options: {copy?: boolean; tags?: string[]} = {},
): Promise<Asset> {
  const absolute = resolve(source);
  const sourceStat = await stat(absolute);
  if (!sourceStat.isFile()) throw new Error(`not a file: ${absolute}`);
  if (sourceStat.size > MAX_IMPORT_BYTES) throw new Error(`asset is larger than the configured limit (${MAX_IMPORT_BYTES} bytes)`);

  const hash = await sha256File(absolute);
  const existing = project.assets.find(asset => asset.hash === hash);
  if (existing) return existing;

  const {kind, metadata} = await inspectMedia(absolute);
  if (kind === 'other') throw new Error(`unsupported media type: ${basename(absolute)}`);

  let path: string;
  if (options.copy === false) {
    path = relative(projectDir, absolute).replace(/\\/g, '/');
    if (path.startsWith('..')) throw new Error('copy:false requires the source to live inside the project');
  } else {
    const targetName = `${hash.slice(0, 12)}-${safeName(basename(absolute))}`;
    const target = join(projectDir, 'assets', targetName);
    await ensureDir(join(projectDir, 'assets'));
    await copyFile(absolute, target);
    path = relative(projectDir, target).replace(/\\/g, '/');
  }

  const asset = assetSchema.parse({
    id: `asset_${hash.slice(0, 16)}`,
    kind,
    path,
    name: basename(absolute),
    hash,
    metadata,
    tags: options.tags ?? [],
  });
  project.assets.push(asset);
  project.updatedAt = new Date().toISOString();
  return asset;
}

export function getAsset(project: AIEDITINGProject, assetId: string): Asset {
  const asset = project.assets.find(item => item.id === assetId);
  if (!asset) throw new Error(`asset not found: ${assetId}`);
  return asset;
}

export function removeAsset(project: AIEDITINGProject, assetId: string, options: {deleteFile?: boolean} = {}): Asset {
  const index = project.assets.findIndex(item => item.id === assetId);
  if (index < 0) throw new Error(`asset not found: ${assetId}`);
  const used = project.tracks.some(track => track.clips.some(clip => clip.assetId === assetId));
  if (used) throw new Error(`asset ${assetId} is still used by a clip`);
  const [asset] = project.assets.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  if (options.deleteFile && asset?.path) {
    // Deletion is intentionally opt-in; originals are never touched.
  }
  return asset!;
}

export async function createProxy(
  projectDir: string,
  project: AIEDITINGProject,
  assetId: string,
  options: {width?: number; height?: number} = {},
): Promise<Asset> {
  const asset = getAsset(project, assetId);
  if (asset.kind === 'audio' || asset.kind === 'font') throw new Error('proxies are available for video and image assets');
  const source = assetPath(projectDir, asset);
  const proxyRelative = `assets/proxies/${asset.id}.mp4`;
  const proxyAbsolute = resolveInside(projectDir, proxyRelative);
  await ensureDir(join(projectDir, 'assets', 'proxies'));
  await generateProxy(source, proxyAbsolute, options);
  asset.proxyPath = proxyRelative;
  project.updatedAt = new Date().toISOString();
  return asset;
}

export function listAssets(project: AIEDITINGProject) {
  return project.assets.map(asset => ({
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    path: asset.path,
    duration: asset.metadata.duration,
    resolution: asset.metadata.width && asset.metadata.height
      ? `${asset.metadata.width}x${asset.metadata.height}`
      : undefined,
    size: asset.metadata.size,
  }));
}
