import {existsSync} from 'node:fs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
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
import {findBrowser} from '@aiediting/browser';
import {ensureDir, formatSeconds, inspectMedia, run} from '@aiediting/media';
import type {AIEDITINGProject} from '@aiediting/project-schema';

const VERSION = '0.1.0';
const THEME = {bg: '#08080d', fg: '#f7f7fb', muted: '#9a9ab0', accent: '#8b5cf6', accent2: '#22d3ee', font: 'Inter'};

function findRemotionCli(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve('@remotion/cli');
    let dir = dirname(entry);
    for (let i = 0; i < 5; i++) {
      const candidate = join(dir, 'remotion-cli.js');
      if (existsSync(candidate)) return candidate;
      dir = dirname(dir);
    }
  } catch {}
  return null;
}

export class RemotionAdapter extends BaseAdapter {
  readonly id = 'remotion';
  readonly name = 'Remotion';
  readonly version = VERSION;

  override async getHealth(): Promise<EngineHealth> {
    const cli = findRemotionCli();
    const browser = findBrowser();
    const reasons: string[] = [];
    if (!cli) reasons.push('@remotion/cli is not installed');
    if (!browser) reasons.push('no Chrome/Edge browser found (set AIEDITING_BROWSER)');
    return {available: Boolean(cli && browser), path: cli ?? undefined, reasons, checkedAt: new Date().toISOString()};
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['scene.render', 'graphics.react', 'animation.2d'],
      formats: ['mp4', 'mov', 'webm'],
      maxWidth: 3840,
      maxHeight: 2160,
      maxFps: 120,
      supportsAlpha: false,
      supportsAudio: false,
      deterministic: true,
      gpu: false,
      sceneTemplates: ['stat', 'engines', 'bullets'],
      requirements: ['@remotion/cli', 'react', 'Chrome/Edge'],
      license: 'Remotion License (commercial terms may apply)',
      notes: 'React/Remotion scenes rendered through the official CLI.',
    };
  }

  override async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    const health = await this.getHealth();
    return {valid: health.available, errors: health.available ? [] : health.reasons, warnings: []};
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'scene') throw new Error('Remotion renders scenes; the renderer composes the project');
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
    const temp = await mkdtemp(join(tmpdir(), 'aiediting-remotion-'));
    try {
      const cli = findRemotionCli();
      const browser = findBrowser();
      if (!cli) throw new Error('@remotion/cli not installed');
      if (!browser) throw new Error('no browser found');
      const output = resolve(request.outputPath);
      await ensureDir(dirname(output));
      const propsFile = join(temp, 'props.json');
      const theme = {...THEME, ...((request.scene.engineMetadata?.theme as Record<string, string> | undefined) ?? {})};
      await writeFile(propsFile, JSON.stringify({
        template: request.scene.template,
        duration: request.duration,
        fps: request.fps,
        width: request.width,
        height: request.height,
        theme,
        data: request.scene.props ?? {},
      }, null, 2), 'utf8');
      const entry = fileURLToPath(new URL('../engine/src/index.ts', import.meta.url));
      const cwd = dirname(dirname(entry));
      job.progress = 0.3;
      request.onProgress?.(0.3, 'remotion render');
      await run(process.execPath, [
        cli, 'render', entry, 'Scene', output,
        `--props=${propsFile}`,
        '--codec=h264',
        '--crf=18',
        '--overwrite',
        '--log=error',
        `--browser-executable=${browser}`,
      ], {
        cwd,
        timeoutMs: 20 * 60_000,
        signal: request.signal,
        onStderr: chunk => {
          if (chunk.trim()) job.logs.push(chunk.trim().slice(0, 500));
          if (job.logs.length > 100) job.logs.shift();
        },
      });
      const info = await inspectMedia(output);
      if (!info.metadata.duration || info.metadata.duration < request.duration - 0.35) {
        throw new Error(`remotion output duration ${info.metadata.duration ?? 'unknown'}s (${formatSeconds(request.duration)}s expected)`);
      }
      job.status = 'succeeded';
      job.progress = 1;
      job.finishedAt = new Date().toISOString();
      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.finishedAt = new Date().toISOString();
      throw error;
    } finally {
      await rm(temp, {recursive: true, force: true});
    }
  }
}

export default RemotionAdapter;
