import {spawn, execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {copyFile, mkdtemp, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  BaseAdapter,
  type EngineCapabilities,
  type EngineHealth,
  type RenderJob,
  type RenderRequest,
  type SceneRenderRequest,
  type ValidationResult,
} from '@aiediting/adapter-sdk';
import {findBrowser, freePort, launchBrowser, waitForHttp} from '@aiediting/browser';
import {ensureDir, inspectMedia, probeMedia} from '@aiediting/media';
import type {AIEDITINGProject} from '@aiediting/project-schema';

const VERSION = '0.1.0';
const ENGINE = fileURLToPath(new URL('../engine', import.meta.url));
const THEME = {bg: '#08080d', fg: '#f7f7fb', muted: '#9a9ab0', accent: '#8b5cf6', accent2: '#22d3ee', font: 'Inter'};

function findViteCli(): string | null {
  try {
    const require = createRequire(import.meta.url);
    let dir = dirname(require.resolve('vite'));
    for (let i = 0; i < 5; i++) {
      const candidate = join(dir, 'bin', 'vite.js');
      if (existsSync(candidate)) return candidate;
      dir = dirname(dir);
    }
  } catch {}
  return null;
}

function stopTree(pid?: number) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {stdio: 'ignore'});
    } catch {}
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
  }
}

async function waitForVideo(file: string, duration: number, timeoutMs = 15 * 60_000, check?: () => void) {
  const started = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    check?.();
    const size = await stat(file).then(info => info.size).catch(() => 0);
    if (size > 0 && size === last) stable++;
    else stable = 0;
    last = size;
    if (size > 0 && stable >= 3) {
      try {
        const data = await probeMedia(file);
        const actual = Number(data.format?.duration ?? 0);
        if (actual >= duration - 0.35) return;
      } catch {}
      stable = 0;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`motion-canvas did not produce a complete video: ${file}`);
}

export class MotionCanvasAdapter extends BaseAdapter {
  readonly id = 'motion-canvas';
  readonly name = 'Motion Canvas';
  readonly version = VERSION;

  override async getHealth(): Promise<EngineHealth> {
    const vite = findViteCli();
    const browser = findBrowser();
    const core = existsSync(join(ENGINE, 'src', 'project.ts'));
    const reasons: string[] = [];
    if (!vite) reasons.push('vite is not installed');
    if (!browser) reasons.push('no Chrome/Edge browser found (set AIEDITING_BROWSER)');
    if (!core) reasons.push('motion-canvas engine project is missing');
    return {available: Boolean(vite && browser && core), path: vite ?? undefined, reasons, checkedAt: new Date().toISOString()};
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['scene.render', 'graphics.vector', 'animation.2d'],
      formats: ['mp4', 'webm', 'mov'],
      maxWidth: 3840,
      maxHeight: 2160,
      maxFps: 120,
      supportsAlpha: false,
      supportsAudio: false,
      deterministic: true,
      gpu: false,
      sceneTemplates: ['flow'],
      requirements: ['motion-canvas', 'vite', 'Chrome/Edge', 'ffmpeg'],
      license: 'MIT',
      notes: 'Official Motion Canvas renderer via ?render and the ffmpeg exporter.',
    };
  }

  override async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    const health = await this.getHealth();
    return {valid: health.available, errors: health.available ? [] : health.reasons, warnings: []};
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'scene') throw new Error('Motion Canvas renders scenes; the renderer composes the project');
    return this.renderScene(request);
  }

  private async renderScene(request: SceneRenderRequest): Promise<RenderJob> {
    const job: RenderJob = {
      id: `job_${crypto.randomUUID()}`,
      engineId: this.id,
      status: 'running',
      progress: 0.1,
      outputPath: request.outputPath,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    const outDir = await mkdtemp(join(tmpdir(), 'aiediting-mc-out-'));
    let child: ReturnType<typeof spawn> | undefined;
    let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
    let stderr = '';
    try {
      const vite = findViteCli();
      if (!vite) throw new Error('vite not installed');
      const output = resolve(request.outputPath);
      await ensureDir(dirname(output));
      const theme = {...THEME, ...((request.scene.engineMetadata?.theme as Record<string, string> | undefined) ?? {})};
      const props = request.scene.props ?? {};
      const scene = {
        width: request.width,
        height: request.height,
        duration: request.duration,
        title: props.title ?? 'AIEDITING',
        eyebrow: props.eyebrow ?? 'FLOW',
        theme,
        nodes: props.nodes ?? [
          {label: 'Brief', note: 'intent', color: theme.accent},
          {label: 'Plan', note: 'timeline', color: theme.accent2},
          {label: 'Render', note: 'engines', color: '#a78bfa'},
          {label: 'QA', note: 'verify', color: '#34d399'},
        ],
      };
      await writeFile(join(ENGINE, 'src', 'scene.json'), JSON.stringify(scene, null, 2), 'utf8');
      await writeFile(join(ENGINE, 'src', 'project.meta'), JSON.stringify({
        version: 0,
        shared: {background: theme.bg, range: [0, request.duration], size: {x: request.width, y: request.height}, audioOffset: 0},
        preview: {fps: request.fps, resolutionScale: 1},
        rendering: {
          fps: request.fps,
          resolutionScale: 1,
          colorSpace: 'srgb',
          exporter: {name: '@motion-canvas/ffmpeg', options: {fastStart: true, includeAudio: false}},
        },
      }, null, 2), 'utf8');

      const port = await freePort();
      child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
        cwd: ENGINE,
        env: {...process.env, MC_OUT: outDir},
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
      child.stderr?.on('data', chunk => (stderr += chunk));
      await waitForHttp(`http://localhost:${port}/`);
      browser = await launchBrowser();
      const page = await browser.newPage();
      let pageError: Error | undefined;
      page.on('pageerror', error => {
        pageError = error;
      });
      job.progress = 0.3;
      request.onProgress?.(0.3, 'motion-canvas render');
      await page.goto(`http://localhost:${port}/?render`, {waitUntil: 'domcontentloaded', timeout: 60_000});
      const expected = join(outDir, 'project.mp4');
      await waitForVideo(expected, request.duration, 15 * 60_000, () => {
        if (pageError) throw new Error(`motion-canvas page error: ${pageError.message}`);
      });
      const files = await readdir(outDir);
      const mp4 = files.find(file => file.endsWith('.mp4'));
      if (!mp4) throw new Error('motion-canvas produced no mp4');
      await copyFile(join(outDir, mp4), output);
      const info = await inspectMedia(output);
      if (!info.metadata.duration || info.metadata.duration < request.duration - 0.35) {
        throw new Error(`motion-canvas output duration ${info.metadata.duration ?? 'unknown'}s`);
      }
      job.status = 'succeeded';
      job.progress = 1;
      job.finishedAt = new Date().toISOString();
      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = `${(error as Error).message}${stderr ? `\n${stderr.slice(-2000)}` : ''}`;
      job.finishedAt = new Date().toISOString();
      throw error;
    } finally {
      await browser?.close().catch(() => {});
      stopTree(child?.pid);
      await rm(outDir, {recursive: true, force: true});
    }
  }
}

export default MotionCanvasAdapter;
