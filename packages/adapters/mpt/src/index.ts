import {copyFileSync, existsSync} from 'node:fs';
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
import {ensureDir, FFMPEG, FFPROBE, inspectMedia, resolveInside, run} from '@aiediting/media';
import type {AIEDITINGProject} from '@aiediting/project-schema';

const VERSION = '0.1.0';
const UPSTREAM = 'https://github.com/harry0703/MoneyPrinterTurbo';
const HERE = dirname(fileURLToPath(import.meta.url)); // packages/adapters/mpt/src
const ROOTVENDOR = resolve(HERE, '..', '..', '..', '..', 'vendor', 'MoneyPrinterTurbo');

function venvPython(vendorDir: string): string {
  return process.platform === 'win32'
    ? join(vendorDir, '..', '.mpt-venv', 'Scripts', 'python.exe')
    : join(vendorDir, '..', '.mpt-venv', 'bin', 'python');
}

function basePython(): string | undefined {
  return process.env.AIEDITING_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
}

function aspectOf(width: number, height: number): string {
  if (width > height) return '16:9';
  if (height > width) return '9:16';
  return '1:1';
}

export interface MptSceneProps {
  /** Video topic (used when no script is given; requires a configured LLM). */
  subject?: string;
  /** Full narration script. Provided scripts skip LLM generation entirely. */
  script?: string;
  /** Comma-separated material search terms (online providers only). */
  terms?: string;
  /** BCP-47 script language, e.g. tr-TR / en-US / zh-CN. */
  language?: string;
  /** Material provider from the upstream CLI list (default: local). */
  source?: string;
  /** Local material files relative to the project dir (source=local, default). */
  materials?: string[];
  /** Edge TTS voice, e.g. tr-TR-EmelNeural-Female, or "no-voice". */
  voiceName?: string;
  voiceVolume?: number;
  voiceRate?: number;
  /** Custom voiceover audio file (relative to the project dir); skips TTS. */
  customAudioFile?: string;
  subtitleEnabled?: boolean;
  subtitlePosition?: 'top' | 'center' | 'bottom' | 'two_thirds_bottom' | 'custom';
  fontSize?: number;
  textForeColor?: string;
  bgmType?: string;
  bgmFile?: string;
  bgmVolume?: number;
  clipDuration?: number;
  clipSpeed?: number;
  transitionMode?: string;
  concatMode?: 'random' | 'sequential';
  fitMode?: 'cover' | 'contain';
  threads?: number;
  /** Extra raw VideoParams fields (only fields the upstream model accepts). */
  extra?: Record<string, unknown>;
}

function shellArg(value: string): string {
  return value.replace(/^\s+|\s+$/g, '');
}

export class MptAdapter extends BaseAdapter {
  readonly id = 'mpt';
  readonly name = 'MoneyPrinterTurbo';
  readonly version = VERSION;

  override async getHealth(): Promise<EngineHealth> {
    const reasons: string[] = [];
    const vendorDir = ROOTVENDOR;
    if (!existsSync(join(vendorDir, 'cli.py'))) {
      reasons.push(`MoneyPrinterTurbo is not vendored; run node scripts/setup-mpt.mjs (clones ${UPSTREAM})`);
      return {available: false, reasons, checkedAt: new Date().toISOString()};
    }
    if (process.platform !== 'win32' && !existsSync(venvPython(vendorDir))) {
      reasons.push('python venv missing; run node scripts/setup-mpt.mjs');
    }
    if (process.platform === 'win32' && !existsSync(venvPython(vendorDir))) {
      reasons.push('python venv missing (vendor/.mpt-venv); run node scripts/setup-mpt.mjs');
    }
    return {
      available: reasons.length === 0,
      path: venvPython(vendorDir),
      reasons,
      checkedAt: new Date().toISOString(),
    };
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['scene.render', 'subtitles', 'media.audio'],
      formats: ['mp4'],
      maxWidth: 1920,
      maxHeight: 1920,
      maxFps: 30,
      supportsAlpha: false,
      supportsAudio: true,
      deterministic: false,
      gpu: false,
      sceneTemplates: ['auto-video'],
      requirements: ['Python 3.11 venv (scripts/setup-mpt.mjs)', 'vendored MoneyPrinterTurbo', 'LLM key for script generation'],
      license: 'MIT',
      notes: 'Runs the upstream MoneyPrinterTurbo CLI: script -> voiceover -> subtitles -> materials -> composed short video.',
    };
  }

  override async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    const health = await this.getHealth();
    return {valid: health.available, errors: health.available ? [] : health.reasons, warnings: []};
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'scene') throw new Error('MoneyPrinterTurbo renders scenes; the renderer composes the project');
    return this.renderScene(request);
  }

  private async renderScene(request: SceneRenderRequest): Promise<RenderJob> {
    const job: RenderJob = {
      id: `job_${crypto.randomUUID()}`,
      engineId: this.id,
      status: 'running',
      progress: 0.05,
      outputPath: request.outputPath,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    const vendorDir = ROOTVENDOR;
    const props = (request.scene.props ?? {}) as MptSceneProps;
    const python = existsSync(venvPython(vendorDir)) ? venvPython(vendorDir) : basePython();
    if (!python) {
      job.status = 'failed';
      job.error = 'no python found; install Python 3.11 or set AIEDITING_PYTHON';
      job.finishedAt = new Date().toISOString();
      throw new Error(job.error);
    }
    if (!existsSync(join(vendorDir, 'cli.py'))) {
      job.status = 'failed';
      job.error = 'MoneyPrinterTurbo is not vendored; run node scripts/setup-mpt.mjs';
      job.finishedAt = new Date().toISOString();
      throw new Error(job.error);
    }

    const args = ['cli.py', '--stop-at', 'video'];

    if (props.script) {
      args.push('--video-script', shellArg(props.script));
    } else if (props.subject) {
      args.push('--video-subject', shellArg(props.subject));
    } else {
      const error = 'mpt scene needs props.script or props.subject';
      job.status = 'failed';
      job.error = error;
      job.finishedAt = new Date().toISOString();
      throw new Error(error);
    }
    if (!props.script && props.language) args.push('--video-language', props.language);
    if (props.terms) args.push('--video-terms', props.terms);

    const source = props.source ?? 'local';
    args.push('--video-source', source);
    if (source === 'local') {
      const materials = (props.materials ?? []).map(relative => {
        const absolute = resolveInside(request.projectDir, relative);
        if (!existsSync(absolute)) throw new Error(`mpt material not found: ${relative}`);
        return absolute;
      });
      if (!materials.length) {
        const error = 'mpt with video_source=local requires props.materials (project-asset paths)';
        job.status = 'failed';
        job.error = error;
        job.finishedAt = new Date().toISOString();
        throw new Error(error);
      }
      args.push('--video-materials', materials.join(','));
    }
    if (props.extra?.confirmCharge) {
      // Charged AI providers must be opted into explicitly by the caller.
      for (const flag of String(props.extra.confirmCharge).split(' ').filter(Boolean)) args.push(flag);
    }

    args.push('--video-aspect', aspectOf(request.width, request.height));
    if (props.voiceName) args.push('--voice-name', props.voiceName);
    if (props.voiceVolume != null) args.push('--voice-volume', String(props.voiceVolume));
    if (props.voiceRate != null) args.push('--voice-rate', String(props.voiceRate));
    if (props.customAudioFile) {
      args.push('--custom-audio-file', resolve(join(request.projectDir, props.customAudioFile)));
    }
    if (props.subtitleEnabled === false) args.push('--no-subtitle-enabled');
    if (props.subtitleEnabled === true) args.push('--subtitle-enabled');
    if (props.subtitlePosition) args.push('--subtitle-position', props.subtitlePosition);
    if (props.fontSize) args.push('--font-size', String(props.fontSize));
    if (props.textForeColor) args.push('--text-fore-color', props.textForeColor);
    if (props.bgmType) args.push('--bgm-type', props.bgmType);
    if (props.bgmFile) args.push('--bgm-file', resolve(join(request.projectDir, props.bgmFile)));
    if (props.bgmVolume != null) args.push('--bgm-volume', String(props.bgmVolume));
    if (props.clipDuration) args.push('--video-clip-duration', String(Math.max(1, Math.round(props.clipDuration))));
    if (props.clipSpeed) args.push('--video-clip-speed', String(props.clipSpeed));
    if (props.transitionMode) args.push('--video-transition-mode', props.transitionMode);
    if (props.concatMode) args.push('--video-concat-mode', props.concatMode);
    if (props.fitMode) args.push('--video-fit-mode', props.fitMode);
    if (props.threads) args.push('--n-threads', String(props.threads));
    if (props.extra) {
      // Raw upstream fields such as paragraph_number / video_count.
      const names: Record<string, string> = {
        paragraphNumber: '--paragraph-number',
        scriptPrompt: '--video-script-prompt',
        videoCount: '--video-count',
        imageMotion: '--image-motion',
        matchMaterialsToScript: '--match-materials-to-script',
      };
      for (const [key, flag] of Object.entries(names)) {
        const value = (props.extra as Record<string, unknown>)[key];
        if (value != null) args.push(flag, String(value));
      }
    }

    // The vendored task service probes ffmpeg; make the static ffmpeg visible.
    const env: Record<string, string> = {};
    {
      const separator = process.platform === 'win32' ? ';' : ':';
      env.PATH = `${dirname(String(FFMPEG))}${separator}${dirname(String(FFPROBE))}${separator}${process.env.PATH ?? ''}`;
    }

    const output = resolve(request.outputPath);
    await ensureDir(dirname(output));
    job.progress = 0.1;
    request.onProgress?.(0.1, 'mpt pipeline');
    let stdout = '';
    try {
      const result = await run(python, args, {
        cwd: vendorDir,
        timeoutMs: 45 * 60_000,
        signal: request.signal,
        env,
        onStdout: chunk => {
          stdout += chunk;
          // ffmpeg progress emitted by the pipeline.
          for (const match of chunk.matchAll(/out_time_ms=(\d+)/g)) {
            job.progress = Math.max(job.progress, Math.min(0.85, 0.25 + Number(match[1]) / 1_000_000 / Math.max(1, request.duration) * 0.6));
          }
        },
        onStderr: chunk => {
          if (chunk.trim()) {
            job.logs.push(chunk.trim().split('\n').at(-1)!.slice(0, 300));
            if (job.logs.length > 60) job.logs.shift();
          }
        },
      });
      stdout += result.stdout;

      // CLI prints exactly one JSON object: {"task_id": ..., "result": {...}}.
      const jsonLine = stdout.split('\n').map(line => line.trim()).reverse().find(line => line.startsWith('{') && line.endsWith('}'));
      if (!jsonLine) throw new Error(`mpt CLI produced no result JSON:\n${(stdout || '(stdout empty)').slice(-1500)}`);
      const parsed = JSON.parse(jsonLine) as {
        task_id?: string;
        result?: {state?: string; videos?: string[]; error?: string; failed_stage?: string};
      };
      const videos = parsed.result?.videos;
      if (!videos?.length) {
        throw new Error(`mpt task failed at stage ${parsed.result?.failed_stage ?? 'unknown'}: ${parsed.result?.error ?? JSON.stringify(parsed).slice(0, 400)}`);
      }
      const video = videos[0]!;
      job.progress = 0.9;
      request.onProgress?.(0.9, 'collect output');
      copyFileSync(video, output);
      const info = await inspectMedia(output);
      if (!info.metadata.duration || info.metadata.duration < 0.5) {
        throw new Error(`mpt output validation failed: duration ${info.metadata.duration ?? 'unknown'}s`);
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
    }
  }
}

export default MptAdapter;
