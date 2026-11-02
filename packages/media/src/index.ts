import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, join, resolve, sep} from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import type {AssetKind, MediaMetadata} from '@aiediting/project-schema';

export const FFMPEG = process.env.AIEDITING_FFMPEG ?? (ffmpegStatic as unknown as string);
export const FFPROBE = process.env.AIEDITING_FFPROBE ?? ffprobeStatic.path;

if (!FFMPEG || !FFPROBE) {
  throw new Error('ffmpeg/ffprobe not found. Install dependencies or set AIEDITING_FFMPEG/AIEDITING_FFPROBE.');
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mts', '.m2ts']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.opus']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.svg']);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  input?: string;
  env?: Record<string, string>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export function run(command: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
  const {cwd, timeoutMs = 30 * 60_000, signal, input, env} = options;
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new Error('command aborted'));
      return;
    }
    const child = spawn(command, args, {
      cwd,
      env: {...process.env, ...env},
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: Error, result?: CommandResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolvePromise(result!);
    };
    const abort = () => {
      child.kill('SIGKILL');
      finish(new Error(`command aborted: ${basename(command)}`));
    };
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          child.kill('SIGKILL');
          finish(new Error(`command timed out after ${timeoutMs} ms: ${basename(command)} ${args.slice(0, 4).join(' ')}`));
        }, timeoutMs)
      : null;
    signal?.addEventListener('abort', abort, {once: true});
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.stdout.on('data', chunk => options.onStdout?.(String(chunk)));
    child.stderr.on('data', chunk => options.onStderr?.(String(chunk)));
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (code === 0) finish(undefined, {stdout, stderr});
      else finish(new Error(`command failed (${code}): ${basename(command)} ${args.slice(0, 8).join(' ')}\n${(stderr || stdout).slice(-4000)}`));
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function ffmpeg(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return run(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], options);
}

export function ffprobe(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return run(FFPROBE, args, options);
}

export interface ProbeResult {
  streams: Array<Record<string, any>>;
  format: Record<string, any>;
}

export async function probeMedia(file: string, options: RunOptions = {}): Promise<ProbeResult> {
  await stat(file);
  const result = await ffprobe([
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ], {timeoutMs: 60_000, ...options});
  return JSON.parse(result.stdout) as ProbeResult;
}

function parseFps(value?: string): number | undefined {
  if (!value || value === '0/0') return undefined;
  const [a, b] = value.split('/').map(Number);
  if (!a || !b) return undefined;
  return Math.round((a / b) * 1000) / 1000;
}

export async function inspectMedia(file: string, options: RunOptions = {}): Promise<{kind: AssetKind; metadata: MediaMetadata}> {
  const data = await probeMedia(file, options);
  const video = data.streams.find(stream => stream.codec_type === 'video');
  const audio = data.streams.find(stream => stream.codec_type === 'audio');
  const extension = extname(file).toLowerCase();
  const kind: AssetKind = IMAGE_EXTENSIONS.has(extension)
    ? 'image'
    : FONT_EXTENSIONS.has(extension)
      ? 'font'
      : audio && !video
        ? 'audio'
        : video
          ? 'video'
          : 'other';
  const metadata: MediaMetadata = {
    duration: Number(data.format?.duration ?? video?.duration ?? 0) || undefined,
    width: video?.width,
    height: video?.height,
    fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    channels: audio?.channels,
    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    bitrate: data.format?.bit_rate ? Number(data.format.bit_rate) : undefined,
    size: data.format?.size ? Number(data.format.size) : undefined,
    container: data.format?.format_name,
    rotation: video?.tags?.rotate ? Number(video.tags.rotate) : undefined,
  };
  return {kind, metadata};
}

export function mediaKindFromExtension(file: string): AssetKind {
  const extension = extname(file).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (FONT_EXTENSIONS.has(extension)) return 'font';
  if (['.srt', '.vtt', '.ass'].includes(extension)) return 'subtitle';
  return 'other';
}

export async function sha256File(file: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, {recursive: true});
  return dir;
}

export async function makeTempDir(prefix = 'aiediting-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, {recursive: true, force: true});
}

export function resolveInside(root: string, relative: string): string {
  const base = resolve(root);
  const target = resolve(base, relative);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`path escapes the project root: ${relative}`);
  }
  return target;
}

export function assertSafeOutput(root: string, output: string): string {
  const target = resolve(root, output);
  if (target !== resolve(root) && !target.startsWith(resolve(root) + sep)) {
    throw new Error(`output path escapes the project: ${output}`);
  }
  return target;
}

export function escapeFilterPath(file: string): string {
  return file
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,');
}

export function formatSeconds(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

export async function generateThumbnail(
  file: string,
  output: string,
  options: {time?: number; width?: number; signal?: AbortSignal} = {},
): Promise<string> {
  const {time = 0, width = 480, signal} = options;
  await ensureDir(dirname(output));
  await ffmpeg([
    '-ss', formatSeconds(Math.max(0, time)),
    '-i', file,
    '-frames:v', '1',
    '-vf', `scale=${width}:-2`,
    '-q:v', '3',
    output,
  ], {signal, timeoutMs: 120_000});
  return output;
}

export async function extractAudio(
  file: string,
  output: string,
  options: {sampleRate?: number; channels?: number; signal?: AbortSignal} = {},
): Promise<string> {
  const {sampleRate = 48000, channels = 2, signal} = options;
  await ensureDir(dirname(output));
  await ffmpeg([
    '-i', file,
    '-vn',
    '-ac', String(channels),
    '-ar', String(sampleRate),
    '-c:a', extname(output).toLowerCase() === '.mp3' ? 'libmp3lame' : 'pcm_s16le',
    output,
  ], {signal, timeoutMs: 10 * 60_000});
  return output;
}

export async function extractFrames(
  file: string,
  outputDir: string,
  options: {fps?: number; start?: number; duration?: number; format?: 'png' | 'jpg'; width?: number; signal?: AbortSignal} = {},
): Promise<string> {
  const {fps = 1, start = 0, duration, format = 'jpg', width = 480, signal} = options;
  await ensureDir(outputDir);
  const pattern = join(outputDir, `frame-%05d.${format}`);
  const args: string[] = ['-ss', formatSeconds(start), '-i', file];
  if (duration != null) args.push('-t', formatSeconds(duration));
  args.push('-vf', `fps=${fps},scale=${width}:-2`, '-q:v', '3', pattern);
  await ffmpeg(args, {signal, timeoutMs: 10 * 60_000});
  return outputDir;
}

export async function generateProxy(
  file: string,
  output: string,
  options: {width?: number; height?: number; crf?: number; signal?: AbortSignal} = {},
): Promise<string> {
  const {width = 960, height = 540, crf = 28, signal} = options;
  await ensureDir(dirname(output));
  await ffmpeg([
    '-i', file,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ], {signal, timeoutMs: 20 * 60_000});
  return output;
}

export interface SilenceSpan {
  start: number;
  end: number;
  duration: number;
}

export async function detectSilence(
  file: string,
  options: {thresholdDb?: number; minDuration?: number; signal?: AbortSignal} = {},
): Promise<SilenceSpan[]> {
  const {thresholdDb = -40, minDuration = 0.5, signal} = options;
  const result = await ffmpeg([
    '-i', file,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${minDuration}`,
    '-vn', '-f', 'null', '-',
  ], {signal, timeoutMs: 10 * 60_000});
  const spans: SilenceSpan[] = [];
  const pattern = /silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
  let match;
  while ((match = pattern.exec(result.stderr))) {
    spans.push({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])});
  }
  return spans;
}

export async function detectScenes(
  file: string,
  options: {threshold?: number; signal?: AbortSignal} = {},
): Promise<number[]> {
  const {threshold = 0.4, signal} = options;
  const result = await ffmpeg([
    '-i', file,
    '-vf', `select='gt(scene,${threshold})',showinfo`,
    '-an', '-f', 'null', '-',
  ], {signal, timeoutMs: 20 * 60_000});
  const times: number[] = [];
  for (const match of result.stderr.matchAll(/pts_time:([\d.]+)/g)) times.push(Number(match[1]));
  return times;
}

export async function measureLoudness(
  file: string,
  options: {signal?: AbortSignal} = {},
): Promise<{integratedLufs?: number; truePeakDb?: number; lra?: number}> {
  const {signal} = options;
  const result = await ffmpeg([
    '-i', file,
    '-af', 'ebur128',
    '-f', 'null', '-',
  ], {signal, timeoutMs: 10 * 60_000});
  const integrated = [...result.stderr.matchAll(/I:\s*(-?[\d.]+)\s*LUFS/g)].at(-1)?.[1];
  const truePeak = [...result.stderr.matchAll(/Peak:\s*(-?[\d.]+)\s*dBFS/g)].at(-1)?.[1];
  const lra = [...result.stderr.matchAll(/LRA:\s*(-?[\d.]+)\s*LU/g)].at(-1)?.[1];
  return {
    integratedLufs: integrated ? Number(integrated) : undefined,
    truePeakDb: truePeak ? Number(truePeak) : undefined,
    lra: lra ? Number(lra) : undefined,
  };
}

