import {randomUUID} from 'node:crypto';
import {readFile, rename, stat, mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {
  PROJECT_FILE,
  PROJECT_VERSION,
  assertValidProject,
  projectSchema,
  validateProject,
  type AIEDITINGProject,
  type ValidationIssue,
} from '@aiediting/project-schema';
import {timelineSummary} from '@aiediting/timeline';

export interface OpenedProject {
  project: AIEDITINGProject;
  path: string;
  dir: string;
}

export interface CreateProjectOptions {
  name: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  background?: string;
  exportFormat?: 'mp4' | 'mov' | 'webm';
}

export function createProject(options: CreateProjectOptions): AIEDITINGProject {
  const now = new Date().toISOString();
  const project: AIEDITINGProject = projectSchema.parse({
    $schema: 'https://raw.githubusercontent.com/Tarikdxd/AIEDITING/main/schema/aiediting.project.schema.json',
    version: PROJECT_VERSION,
    id: `project_${randomUUID()}`,
    name: options.name,
    createdAt: now,
    updatedAt: now,
    settings: {
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      fps: options.fps ?? 30,
      background: options.background ?? '#000000',
      duration: options.duration,
      export: {format: options.exportFormat ?? 'mp4'},
    },
    assets: [],
    tracks: [],
    compositions: [],
    markers: [],
    engineMetadata: {},
  });
  return project;
}

export async function loadProject(fileOrDir: string): Promise<OpenedProject> {
  const absolute = resolve(fileOrDir);
  const info = await stat(absolute).catch(() => null);
  if (!info) throw new Error(`project not found: ${absolute}`);
  const path = info.isDirectory() ? join(absolute, PROJECT_FILE) : absolute;
  const dir = info.isDirectory() ? absolute : dirname(absolute);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`project file not found: ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON in ${path}: ${(error as Error).message}`);
  }
  const project = assertValidProject(json);
  return {project, path, dir};
}

export async function saveProject(project: AIEDITINGProject, path: string): Promise<string> {
  const validation = validateProject(project);
  if (!validation.success) {
    const errors = validation.issues.filter(issue => issue.severity === 'error');
    throw new Error(`cannot save invalid project:\n${errors.slice(0, 12).map(issue => `${issue.path}: ${issue.message}`).join('\n')}`);
  }
  project.updatedAt = new Date().toISOString();
  const target = resolve(path);
  await mkdir(dirname(target), {recursive: true});
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  await rename(temp, target);
  return target;
}

export function validateProjectDocument(input: unknown): {success: boolean; issues: ValidationIssue[]} {
  const result = validateProject(input);
  return {success: result.success, issues: result.issues};
}

export function inspectProject(project: AIEDITINGProject) {
  const summary = timelineSummary(project);
  return {
    ...summary,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    colorSpace: project.settings.colorSpace,
    background: project.settings.background,
    tracks: summary.tracks,
    assets: project.assets.map(asset => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      path: asset.path,
      duration: asset.metadata.duration,
    })),
    compositions: project.compositions.map(composition => ({
      id: composition.id,
      name: composition.name,
      tracks: composition.tracks.length,
    })),
  };
}

export function cloneProject(project: AIEDITINGProject): AIEDITINGProject {
  return assertValidProject(structuredClone(project));
}
