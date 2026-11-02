import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {
  BaseAdapter,
  type EngineCapabilities,
  type EngineHealth,
  type RenderJob,
  type RenderRequest,
  type SceneRenderRequest,
  type ValidationResult,
} from '@aiediting/adapter-sdk';
import {launchBrowser} from '@aiediting/browser';
import {ensureDir, ffmpeg, inspectMedia, resolveInside} from '@aiediting/media';
import type {AIEDITINGProject} from '@aiediting/project-schema';

const VERSION = '0.1.0';
const DEFAULT_URL = 'https://app.stykanimate.com';

export class StykanimateAdapter extends BaseAdapter {
  readonly id = 'styk';
  readonly name = 'StykAnimate';
  readonly version = VERSION;

  override async getHealth(): Promise<EngineHealth> {
    const url = process.env.STYK_URL ?? DEFAULT_URL;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(url, {signal: controller.signal});
      clearTimeout(timer);
      return {
        available: response.ok,
        path: url,
        reasons: response.ok ? [] : [`StykAnimate returned HTTP ${response.status}`],
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {available: false, path: url, reasons: [(error as Error).message], checkedAt: new Date().toISOString()};
    }
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['scene.render', 'animation.2d', 'character.animation'],
      formats: ['mp4', 'webm'],
      maxWidth: 1920,
      maxHeight: 1080,
      maxFps: 60,
      supportsAlpha: false,
      supportsAudio: false,
      deterministic: false,
      gpu: false,
      sceneTemplates: ['clip'],
      requirements: ['StykAnimate web app (hosted or STYK_URL)', 'Chrome/Edge', 'ffmpeg'],
      license: 'GPL-3.0-or-later (separate application)',
      notes: 'Drives StykAnimate’s own WebM export in a headless browser, then normalizes with FFmpeg.',
    };
  }

  override async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    const health = await this.getHealth();
    return {valid: health.available, errors: health.available ? [] : health.reasons, warnings: []};
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'scene') throw new Error('StykAnimate renders scenes; the renderer composes the project');
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
    const temp = await mkdtemp(join(tmpdir(), 'aiediting-styk-'));
    let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
    try {
      const url = process.env.STYK_URL ?? DEFAULT_URL;
      const props = request.scene.props ?? {};
      const sourceRelative = (props.source ?? request.scene.engineMetadata?.source) as string | undefined;
      const source = sourceRelative ? resolveInside(request.projectDir, sourceRelative) : undefined;
      const output = resolve(request.outputPath);
      await ensureDir(dirname(output));
      const raw = join(temp, 'source.webm');

      browser = await launchBrowser();
      const page = await browser.newPage({acceptDownloads: true});
      await page.addInitScript(() => {
        try {
          Object.defineProperty(window, 'showSaveFilePicker', {value: undefined, configurable: true});
        } catch {}
      });
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90_000});
      await page.waitForFunction(() => (window as any).styk?.ready === true, undefined, {timeout: 90_000});
      if (source) {
        const input = page.locator('#file-input');
        if (!(await input.count())) throw new Error('StykAnimate import input not found');
        await input.setInputFiles(source);
        await page.waitForFunction(
          () => (window as any).styk?.state?.importing !== true && (window as any).styk?.editor?.totalTicks > 0,
          undefined,
          {timeout: 120_000},
        );
        await page.waitForTimeout(400);
      }
      job.progress = 0.35;
      request.onProgress?.(0.35, 'stykanimate export');
      const downloadPromise = page.waitForEvent('download', {timeout: 180_000});
      const result = await page.evaluate(async () => {
        try {
          const value = await (window as any).styk.actions['export-video']();
          return {ok: true, value: String(value)};
        } catch (error) {
          return {ok: false, error: (error as Error).message};
        }
      });
      if (!result.ok) throw new Error(`StykAnimate export failed: ${result.error}`);
      const download = await downloadPromise;
      await download.saveAs(raw);
      await browser.close();
      browser = undefined;

      const speed = Number(props.speed ?? 0.5);
      const keyed = props.key !== 'none';
      const theme = (request.scene.engineMetadata?.theme as {bg?: string} | undefined) ?? {};
      const bg = theme.bg ?? '#08080d';
      const filters = [
        `setpts=${1 / speed}*PTS`,
        `fps=${request.fps}`,
        `scale=${request.width}:${request.height}:force_original_aspect_ratio=increase`,
        `crop=${request.width}:${request.height}`,
        ...(keyed ? ['colorkey=0xFFFFFF:0.3:0.1', 'format=rgba'] : ['format=yuv420p']),
      ];
      const args = [
        '-stream_loop', '-1', '-i', raw,
        ...(keyed ? ['-f', 'lavfi', '-i', `color=c=${bg}:s=${request.width}x${request.height}:r=${request.fps}:d=${request.duration}`] : []),
        '-filter_complex',
        keyed
          ? `[0:v]${filters.join(',')}[fg];[1:v]setpts=PTS-STARTPTS[bg];[bg][fg]overlay=0:0:shortest=1,format=yuv420p[v]`
          : `[0:v]${filters.join(',')}[v]`,
        '-map', '[v]', '-r', String(request.fps), '-t', String(request.duration),
        '-c:v', 'libx264', '-preset', request.preview ? 'veryfast' : 'medium', '-crf', request.preview ? '24' : '18',
        '-pix_fmt', 'yuv420p', '-an', output,
      ];
      job.progress = 0.7;
      request.onProgress?.(0.7, 'stykanimate transcode');
      await ffmpeg(args, {timeoutMs: 15 * 60_000, signal: request.signal});
      const info = await inspectMedia(output);
      if (!info.metadata.duration || info.metadata.duration < request.duration - 0.35) {
        throw new Error(`StykAnimate output duration ${info.metadata.duration ?? 'unknown'}s`);
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
      await browser?.close().catch(() => {});
      await rm(temp, {recursive: true, force: true});
    }
  }
}

export default StykanimateAdapter;
