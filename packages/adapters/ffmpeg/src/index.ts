import {existsSync} from 'node:fs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  BaseAdapter,
  type EngineCapabilities,
  type EngineHealth,
  type ProjectRenderRequest,
  type RenderJob,
  type RenderRequest,
  type ValidationResult,
} from '@aiediting/adapter-sdk';
import {
  ensureDir,
  escapeFilterPath,
  ffmpeg,
  formatSeconds,
  inspectMedia,
  probeMedia,
  resolveInside,
} from '@aiediting/media';
import {
  validateProject,
  type AIEDITINGProject,
  type Clip,
  type ExportSettings,
  type TextContent,
  type Track,
} from '@aiediting/project-schema';

const VERSION = '0.1.0';
const FONT_CANDIDATES = [
  process.env.AIEDITING_FONT,
  fileURLToPath(new URL('../assets/Inter.ttf', import.meta.url)),
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
].filter(Boolean) as string[];

function findFont(): string | undefined {
  return FONT_CANDIDATES.find(candidate => existsSync(candidate));
}

function colorHex(value: string): string {
  return `0x${value.replace('#', '').slice(0, 6)}`;
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

function assTime(value: number): string {
  const cs = Math.max(0, Math.round(value * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function assText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, '\\N');
}

function codecArgs(settings: ExportSettings, preview: boolean): string[] {
  if (settings.format === 'webm' || settings.videoCodec === 'vp9') {
    return ['-c:v', 'libvpx-vp9', '-crf', String(preview ? 32 : settings.crf), '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k'];
  }
  if (settings.videoCodec === 'prores') {
    return ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuva444p10le', '-c:a', 'pcm_s16le'];
  }
  if (settings.videoCodec === 'h265') {
    return ['-c:v', 'libx265', '-preset', preview ? 'veryfast' : settings.preset, '-crf', String(preview ? 24 : settings.crf), '-pix_fmt', settings.pixelFormat, '-c:a', 'aac', '-b:a', '192k'];
  }
  return [
    '-c:v', 'libx264',
    '-preset', preview ? 'veryfast' : settings.preset,
    '-crf', String(preview ? 24 : settings.crf),
    '-pix_fmt', preview ? 'yuv420p' : settings.pixelFormat,
    '-c:a', 'aac',
    '-b:a', preview ? '128k' : '192k',
  ];
}

function isVisual(clip: Clip): boolean {
  return ['video', 'image', 'color', 'composition'].includes(clip.type);
}

function assetMap(project: AIEDITINGProject) {
  return new Map(project.assets.map(asset => [asset.id, asset]));
}

interface JobControl {
  controller: AbortController;
  job: RenderJob;
}

export class FfmpegAdapter extends BaseAdapter {
  readonly id = 'ffmpeg';
  readonly name = 'FFmpeg';
  readonly version = VERSION;
  private readonly jobs = new Map<string, JobControl>();

  override async getHealth(): Promise<EngineHealth> {
    try {
      const result = await ffmpeg(['-version'], {timeoutMs: 15_000});
      return {
        available: true,
        version: result.stdout.split('\n')[0]?.split(' ')[2] ?? VERSION,
        path: process.env.AIEDITING_FFMPEG ?? 'ffmpeg-static',
        reasons: [],
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {available: false, reasons: [(error as Error).message], checkedAt: new Date().toISOString()};
    }
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['project.render', 'media.inspect', 'media.transcode', 'media.audio', 'compositing', 'encoding', 'subtitles'],
      formats: ['mp4', 'mov', 'webm', 'png-sequence'],
      maxWidth: 7680,
      maxHeight: 4320,
      maxFps: 120,
      supportsAlpha: false,
      supportsAudio: true,
      deterministic: true,
      gpu: false,
      sceneTemplates: [],
      requirements: ['ffmpeg', 'ffprobe'],
      license: 'LGPL-2.1-or-later (build dependent)',
      notes: 'Backbone compositor and encoder. Renders the canonical project.',
    };
  }

  override async validate(project: AIEDITINGProject): Promise<ValidationResult> {
    const result = validateProject(project);
    return {
      valid: result.success,
      errors: result.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.path}: ${issue.message}`),
      warnings: result.issues.filter(issue => issue.severity === 'warning').map(issue => `${issue.path}: ${issue.message}`),
    };
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'project') throw new Error('the FFmpeg adapter renders projects, not isolated scenes');
    return this.renderProject(request);
  }

  override async cancel(jobId: string): Promise<void> {
    const control = this.jobs.get(jobId);
    if (!control) return;
    control.controller.abort();
    control.job.status = 'cancelled';
    control.job.finishedAt = new Date().toISOString();
  }

  private async renderProject(request: ProjectRenderRequest): Promise<RenderJob> {
    const jobId = `job_${crypto.randomUUID()}`;
    const controller = new AbortController();
    const job: RenderJob = {
      id: jobId,
      engineId: this.id,
      status: 'running',
      progress: 0,
      outputPath: request.outputPath,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    this.jobs.set(jobId, {controller, job});
    const log = (line: string) => {
      job.logs.push(line);
      if (job.logs.length > 200) job.logs.shift();
    };

    const temp = await mkdtemp(join(tmpdir(), 'aiediting-ffmpeg-'));
    try {
      const project = request.project;
      await ensureDir(dirname(resolve(request.outputPath)));
      const duration = Math.max(0.1, request.duration);
      const settings = request.exportSettings;
      const assets = assetMap(project);
      const inputs: string[] = [];
      const filters: string[] = [];
      let inputIndex = 0;
      const clipInputs = new Map<string, {index: number; path: string; hasAudio: boolean; sourceDuration: number}>();

      const addVisualInput = async (clip: Clip) => {
        const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
        if (!asset) throw new Error(`clip ${clip.id} has no asset`);
        const path = resolveInside(request.projectDir, asset.path);
        const sourceDuration = asset.metadata.duration ?? clip.duration * clip.speed;
        if (clip.type === 'image') {
          inputs.push('-loop', '1', '-t', formatSeconds(clip.duration + 0.5), '-i', path);
        } else {
          const start = clip.in ?? 0;
          const needed = Math.min(sourceDuration - start, clip.duration * clip.speed + 0.5);
          if (needed <= 0) throw new Error(`clip ${clip.id} has no source media left after in=${start}`);
          inputs.push('-ss', formatSeconds(start), '-t', formatSeconds(needed), '-i', path);
        }
        clipInputs.set(clip.id, {
          index: inputIndex++,
          path,
          hasAudio: Boolean(asset.metadata.audioCodec),
          sourceDuration,
        });
      };

      for (const track of project.tracks) {
        if (track.muted || track.hidden) continue;
        for (const clip of track.clips) {
          if (isVisual(clip) && clip.type !== 'color' && clip.type !== 'composition') await addVisualInput(clip);
          else if (clip.type === 'audio') {
            const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
            if (!asset) throw new Error(`audio clip ${clip.id} has no asset`);
            const path = resolveInside(request.projectDir, asset.path);
            const start = clip.in ?? 0;
            const needed = Math.min((asset.metadata.duration ?? clip.duration * clip.speed) - start, clip.duration * clip.speed + 0.5);
            inputs.push('-ss', formatSeconds(start), '-t', formatSeconds(Math.max(0.1, needed)), '-i', path);
            clipInputs.set(clip.id, {index: inputIndex++, path, hasAudio: true, sourceDuration: asset.metadata.duration ?? clip.duration * clip.speed});
          }
        }
      }

      const visualStream = (clip: Clip, offset = 0): string => {
        const ref = clipInputs.get(clip.id)!;
        const stream = `[${ref.index}:v]`;
        const transform = clip.transform;
        const scale = Math.max(0.01, transform.scale);
        const fit = (clip.engineMetadata?.fit as string | undefined) ?? 'cover';
        const parts: string[] = [];
        if (clip.type !== 'image') parts.push(`setpts=(PTS-STARTPTS)/${clip.speed}`);
        parts.push(`fps=${request.fps}`);
        if (fit === 'contain') {
          parts.push(`scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease`);
          parts.push(`pad=${request.width}:${request.height}:(ow-iw)/2:(oh-ih)/2:color=${colorHex((clip.engineMetadata?.padColor as string) ?? '#000000')}`);
        } else {
          parts.push(`scale=${request.width}:${request.height}:force_original_aspect_ratio=increase`);
          parts.push(`crop=${request.width}:${request.height}`);
        }
        if (scale !== 1) parts.push(`scale=iw*${scale}:ih*${scale}`);
        if (transform.rotation) parts.push(`rotate=${transform.rotation}*PI/180:fillcolor=black@0:ow=rotw(iw):oh=roth(ih)`);
        for (const effect of clip.effects) {
          if (effect.type === 'eq') parts.push(`eq=contrast=${effect.contrast}:brightness=${effect.brightness}:saturation=${effect.saturation}:gamma=${effect.gamma}`);
          else if (effect.type === 'blur') parts.push(`gblur=sigma=${effect.sigma}`);
          else if (effect.type === 'sharpen') parts.push(`unsharp=5:5:${effect.amount}`);
          else if (effect.type === 'vignette') parts.push(`vignette=angle=${effect.angle}`);
          else if (effect.type === 'hue') parts.push(`hue=h=${effect.degrees}`);
          else if (effect.type === 'chromakey') parts.push(`chromakey=${colorHex(effect.color)}:${effect.similarity}:${effect.blend}`);
        }
        parts.push('format=rgba');
        if (transform.opacity < 1) parts.push(`colorchannelmixer=aa=${transform.opacity}`);
        if (clip.fadeIn > 0) parts.push(`fade=t=in:st=0:d=${clip.fadeIn}:alpha=1`);
        if (clip.fadeOut > 0) parts.push(`fade=t=out:st=${Math.max(0, clip.duration - clip.fadeOut)}:d=${clip.fadeOut}:alpha=1`);
        parts.push('tpad=stop_mode=clone:stop_duration=1');
        parts.push(`trim=duration=${formatSeconds(clip.duration)}`);
        parts.push('settb=AVTB', 'setpts=PTS-STARTPTS');
        if (offset > 0) parts.push(`setpts=PTS+${formatSeconds(offset)}/TB`);
        return `${stream}${parts.join(',')}[${clip.id}_v]`;
      };

      const visualTracks = project.tracks.filter(track => (track.type === 'video' || track.type === 'overlay') && !track.muted && !track.hidden);
      const primary = visualTracks.sort((a, b) => a.index - b.index)[0];
      const overlays = visualTracks.filter(track => track !== primary);
      const primaryClips = primary ? [...primary.clips].filter(isVisual).sort((a, b) => a.start - b.start) : [];
      const base = `color=c=${colorHex(project.settings.background)}:s=${request.width}x${request.height}:r=${request.fps}:d=${formatSeconds(duration)}[base]`;
      if (!primaryClips.length) filters.push(base);
      let videoLabel = 'base';

      if (primaryClips.length) {
        for (const clip of primaryClips) {
          if (clip.type === 'color') {
            filters.push(`color=c=${colorHex(clip.color ?? project.settings.background)}:s=${request.width}x${request.height}:r=${request.fps}:d=${formatSeconds(clip.duration)},format=rgba,settb=AVTB,setpts=PTS-STARTPTS[${clip.id}_v]`);
          } else if (clip.type === 'composition') {
            throw new Error('nested composition clips must be flattened by the renderer before the FFmpeg adapter');
          } else {
            filters.push(visualStream(clip));
          }
        }

        let acc = '';
        let accLen = 0;
        const first = primaryClips[0]!;
        if (first.start > 0.001) {
          filters.push(`color=c=${colorHex(project.settings.background)}:s=${request.width}x${request.height}:r=${request.fps}:d=${formatSeconds(first.start)}[lead]`);
          acc = '[lead]';
          accLen = first.start;
        }
        acc = acc ? `${acc}[${first.id}_v]concat=n=2:v=1:a=0[p0]` : `[${first.id}_v]null[p0]`;
        filters.push(acc);
        let label = 'p0';
        accLen += first.duration;
        let prev = first;
        for (let i = 1; i < primaryClips.length; i++) {
          const clip = primaryClips[i]!;
          const gap = clip.start - (prev.start + prev.duration);
          if (gap > 0.001) {
            filters.push(`color=c=${colorHex(project.settings.background)}:s=${request.width}x${request.height}:r=${request.fps}:d=${formatSeconds(gap)}[gap${i}]`);
            filters.push(`[${label}][gap${i}]concat=n=2:v=1:a=0[p${i}a]`);
            label = `p${i}a`;
            accLen += gap;
          }
          const transition = prev.transitionOut?.duration ?? 0;
          if (transition > 0.001) {
            const d = Math.min(transition, Math.max(0.05, accLen - 0.05), clip.duration - 0.05);
            const offset = Math.max(0, accLen - d);
            filters.push(`[${label}][${clip.id}_v]xfade=transition=${prev.transitionOut!.type}:duration=${formatSeconds(d)}:offset=${formatSeconds(offset)}[p${i}]`);
            label = `p${i}`;
            accLen = accLen + clip.duration - d;
          } else {
            filters.push(`[${label}][${clip.id}_v]concat=n=2:v=1:a=0[p${i}]`);
            label = `p${i}`;
            accLen += clip.duration;
          }
          prev = clip;
        }
        filters.push(`[${label}]tpad=stop_mode=clone:stop_duration=${formatSeconds(Math.max(0.5, duration - accLen + 0.5))},trim=duration=${formatSeconds(duration)},setpts=PTS-STARTPTS[primary]`);
        videoLabel = 'primary';
      }

      let overlayIndex = 0;
      for (const track of overlays) {
        const clips = [...track.clips].filter(isVisual).sort((a, b) => a.start - b.start);
        for (const clip of clips) {
          if (clip.type === 'composition') continue;
          if (clip.type === 'color') {
            filters.push(`color=c=${colorHex(clip.color ?? '#000000')}:s=${request.width}x${request.height}:r=${request.fps}:d=${formatSeconds(clip.duration)},format=rgba,settb=AVTB,setpts=PTS-STARTPTS+${formatSeconds(clip.start)}/TB[${clip.id}_v]`);
          } else {
            filters.push(visualStream(clip, clip.start));
          }
          const scale = clip.transform.scale;
          const x = Math.round((request.width - request.width * scale) / 2 + clip.transform.x);
          const y = Math.round((request.height - request.height * scale) / 2 + clip.transform.y);
          const start = clip.start;
          const end = clip.start + clip.duration;
          filters.push(`[${videoLabel}][${clip.id}_v]overlay=x=${x}:y=${y}:enable='between(t,${formatSeconds(start)},${formatSeconds(end)})':shortest=0[ov${overlayIndex}]`);
          videoLabel = `ov${overlayIndex}`;
          overlayIndex++;
        }
      }

      const font = findFont();
      const textClips = project.tracks
        .filter(track => track.type === 'text' && !track.muted && !track.hidden)
        .flatMap(track => track.clips)
        .filter(clip => clip.type === 'text' && clip.text)
        .sort((a, b) => a.start - b.start);
      for (const [index, clip] of textClips.entries()) {
        if (!font) throw new Error('no font available for text rendering; set AIEDITING_FONT');
        const content = clip.text!;
        const style = content.style;
        const textFile = join(temp, `text-${index}.txt`);
        await writeFile(textFile, content.content, 'utf8');
        const box = style.backgroundColor
          ? `:box=1:boxcolor=${colorHex(style.backgroundColor)}@${style.backgroundOpacity}:boxborderw=${Math.round(style.fontSize * 0.25)}`
          : '';
        const stroke = style.strokeWidth > 0 && style.strokeColor
          ? `:borderw=${Math.round(style.strokeWidth)}:bordercolor=${colorHex(style.strokeColor)}`
          : '';
        const shadow = style.shadow ? ':shadowx=3:shadowy=3:shadowcolor=black@0.5' : '';
        const x = style.align === 'left' ? `${Math.round(style.fontSize * 0.5)}+${clip.transform.x}` : style.align === 'right' ? `w-text_w-${Math.round(style.fontSize * 0.5)}+${clip.transform.x}` : `(w-text_w)/2+${clip.transform.x}`;
        const y = `(h-text_h)/2+${clip.transform.y}`;
        const alpha = clip.fadeIn > 0 || clip.fadeOut > 0
          ? `:alpha='if(lt(t,${formatSeconds(clip.start)}),0,if(lt(t,${formatSeconds(clip.start + clip.fadeIn)}),(t-${formatSeconds(clip.start)})/${formatSeconds(Math.max(0.01, clip.fadeIn))},if(gt(t,${formatSeconds(clip.start + clip.duration - clip.fadeOut)}),(${formatSeconds(clip.start + clip.duration)}-t)/${formatSeconds(Math.max(0.01, clip.fadeOut))},1)))'`
          : '';
        filters.push(
          `[${videoLabel}]drawtext=fontfile='${escapeFilterPath(font)}':textfile='${escapeFilterPath(textFile)}':expansion=none:fontsize=${Math.round(style.fontSize)}:fontcolor=${colorHex(style.color)}@${clip.transform.opacity}:x=${x}:y=${y}:enable='between(t,${formatSeconds(clip.start)},${formatSeconds(clip.start + clip.duration)})'${box}${stroke}${shadow}${alpha}[tx${index}]`,
        );
        videoLabel = `tx${index}`;
      }

      const subtitleClips = project.tracks
        .filter(track => track.type === 'subtitle' && !track.muted && !track.hidden)
        .flatMap(track => track.clips)
        .filter(clip => clip.type === 'subtitle' && clip.subtitle);
      if (subtitleClips.length) {
        const assFile = join(temp, 'subtitles.ass');
        const firstStyle = subtitleClips[0]!.subtitle!.style;
        const fontName = firstStyle.fontFamily;
        const playW = request.width;
        const playH = request.height;
        const style = `Style: Default,${fontName},${Math.round(request.height * 0.042)},&H00FFFFFF,&H00FFFFFF,&H00101016,&H80000000,-1,0,0,0,100,100,0,0,3,${Math.round(request.height * 0.012)},0,2,${Math.round(request.width * 0.06)},${Math.round(request.width * 0.06)},${Math.round(request.height * 0.07)},1`;
        const events = subtitleClips.map(clip => {
          const c = clip.subtitle!;
          const s = c.style;
          return `Dialogue: 0,${assTime(clip.start)},${assTime(clip.start + clip.duration)},Default,,0,0,0,,${assText(c.content)}`;
        }).join('\n');
        await writeFile(assFile, `[Script Info]\nScriptType: v4.00+\nPlayResX: ${playW}\nPlayResY: ${playH}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${style}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`, 'utf8');
        filters.push(`[${videoLabel}]ass=filename='${escapeFilterPath(assFile)}'${font ? `:fontsdir='${escapeFilterPath(dirname(font))}'` : ''}[subs]`);
        videoLabel = 'subs';
      }
      if (videoLabel !== 'subs') filters.push(`[${videoLabel}]null[vout]`);
      else {
        // "subs" is already a label; alias it for the output map.
        filters.push('[subs]null[vout]');
      }

      const audioLabels: string[] = [];
      for (const track of project.tracks) {
        if (track.type !== 'audio' || track.muted) continue;
        for (const clip of track.clips) {
          if (clip.type !== 'audio') continue;
          const ref = clipInputs.get(clip.id);
          if (!ref) continue;
          const label = `aud${audioLabels.length}`;
          const tempo = clip.speed !== 1 ? `,atempo=${clip.speed}` : '';
          const fadeIn = clip.fadeIn > 0 ? `,afade=t=in:st=0:d=${clip.fadeIn}` : '';
          const fadeOut = clip.fadeOut > 0 ? `,afade=t=out:st=${Math.max(0, clip.duration - clip.fadeOut)}:d=${clip.fadeOut}` : '';
          filters.push(`[${ref.index}:a]atrim=0:${formatSeconds(clip.duration * clip.speed)},asetpts=PTS-STARTPTS${tempo},volume=${track.volume * clip.volume}${fadeIn}${fadeOut},adelay=${Math.round(clip.start * 1000)}:all=1[${label}]`);
          audioLabels.push(label);
        }
      }
      if (!audioLabels.length) {
        filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${formatSeconds(duration)},asetpts=PTS-STARTPTS[aout]`);
      } else {
        filters.push(`${audioLabels.map(label => `[${label}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,loudnorm=I=${settings.loudnessTarget}:TP=-1.5:LRA=11,aresample=48000[aout]`);
      }

      const filterFile = join(temp, 'filters.txt');
      await writeFile(filterFile, `${filters.join(';\n')}\n`, 'utf8');
      const out = resolve(request.outputPath);
      const args = [
        ...inputs,
        '-filter_complex_script', filterFile,
        '-map', '[vout]', '-map', '[aout]',
        '-t', formatSeconds(duration),
        '-r', String(request.fps),
        ...codecArgs(settings, Boolean(request.preview)),
        '-max_muxing_queue_size', '1024',
        '-progress', 'pipe:1',
        '-nostats',
        ...(settings.format === 'mp4' && settings.faststart ? ['-movflags', '+faststart'] : []),
        out,
      ];
      const progress = (stdout: string) => {
        for (const match of stdout.matchAll(/out_time_(?:ms|us)=(\d+)/g)) {
          const value = Number(match[1]);
          job.progress = Math.max(0, Math.min(0.99, value / 1_000_000 / duration));
          request.onProgress?.(job.progress, 'encoding');
        }
        for (const match of stdout.matchAll(/progress=(\w+)/g)) {
          if (match[1] === 'end') job.progress = 0.99;
        }
      };
      log(`ffmpeg: ${request.width}x${request.height}@${request.fps} ${duration}s`);
      await ffmpeg(args, {
        signal: controller.signal,
        timeoutMs: 60 * 60_000,
        onStdout: progress,
      });

      const info = await inspectMedia(out);
      if (info.kind !== 'video' || !info.metadata.duration || info.metadata.duration < duration - 0.5) {
        throw new Error(`render validation failed: output duration ${info.metadata.duration ?? 'unknown'}s, expected ${duration}s`);
      }
      job.status = 'succeeded';
      job.progress = 1;
      job.finishedAt = new Date().toISOString();
      request.onProgress?.(1, 'done');
      this.jobs.delete(jobId);
      return job;
    } catch (error) {
      const message = (error as Error).message;
      job.status = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = message;
      job.finishedAt = new Date().toISOString();
      this.jobs.delete(jobId);
      throw error;
    } finally {
      await rm(temp, {recursive: true, force: true});
    }
  }
}

export default FfmpegAdapter;

