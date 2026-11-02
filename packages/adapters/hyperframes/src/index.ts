import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
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
import {ensureDir, FFMPEG, FFPROBE, formatSeconds, inspectMedia, run} from '@aiediting/media';
import type {AIEDITINGProject} from '@aiediting/project-schema';

const VERSION = '0.1.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const GSAP = join(HERE, '..', 'assets', 'gsap.min.js');

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function words(value: string): string {
  return escapeHtml(value).split(/\s+/).filter(Boolean).map(word => `<span class="word">${word}</span>`).join(' ');
}

interface Theme {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  font: string;
}

const DEFAULT_THEME: Theme = {
  bg: '#08080d',
  fg: '#f7f7fb',
  muted: '#9a9ab0',
  accent: '#8b5cf6',
  accent2: '#22d3ee',
  font: 'Inter',
};

function themeOf(meta: Record<string, unknown> | undefined): Theme {
  return {...DEFAULT_THEME, ...(meta?.theme as Partial<Theme> | undefined)};
}

function shell(html: string, script: string, width: number, height: number, duration: number, theme: Theme) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<script src="./gsap.min.js"></script>
<style>
  :root{--bg:${theme.bg};--fg:${theme.fg};--muted:${theme.muted};--accent:${theme.accent};--accent2:${theme.accent2};--font:"${theme.font}","Segoe UI",sans-serif;--u:${Math.min(width, height) / 1080}}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${width}px;height:${height}px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font);-webkit-font-smoothing:antialiased}
  #root{position:relative;width:100%;height:100%;overflow:hidden;isolation:isolate}
  .clip{position:absolute;inset:0}
  .bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(60% 70% at 15% 10%,color-mix(in srgb,var(--accent) 32%,transparent),transparent 62%),radial-gradient(50% 60% at 88% 84%,color-mix(in srgb,var(--accent2) 26%,transparent),transparent 64%),linear-gradient(140deg,#000,var(--bg) 58%,color-mix(in srgb,var(--accent) 22%,var(--bg)))}
  .grid{position:absolute;inset:-20%;z-index:-1;opacity:.13;background-image:linear-gradient(color-mix(in srgb,var(--fg) 40%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--fg) 40%,transparent) 1px,transparent 1px);background-size:calc(88px * var(--u)) calc(88px * var(--u));transform:perspective(900px) rotateX(58deg) translateY(18%);mask-image:radial-gradient(closest-side,#000 30%,transparent 78%)}
  .stage{position:absolute;inset:0;padding:calc(92px * var(--u)) calc(112px * var(--u));display:flex;flex-direction:column;justify-content:center;gap:calc(28px * var(--u))}
  .eyebrow{display:inline-flex;align-items:center;gap:calc(14px * var(--u));font-size:calc(24px * var(--u));font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--accent2)}
  .eyebrow::before{content:"";width:calc(38px * var(--u));height:2px;background:currentColor;opacity:.8}
  .title{font-size:calc(92px * var(--u));line-height:.98;letter-spacing:-.045em;font-weight:760;max-width:88%}
  .subtitle{font-size:calc(31px * var(--u));line-height:1.4;color:var(--muted);max-width:68%}
  .rule{width:calc(120px * var(--u));height:calc(5px * var(--u));border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
  .word{display:inline-block}
  .list{display:flex;flex-direction:column;gap:calc(16px * var(--u))}
  .item{display:flex;gap:calc(22px * var(--u));align-items:baseline;padding:calc(18px * var(--u)) calc(24px * var(--u));border:1px solid color-mix(in srgb,var(--fg) 14%,transparent);border-radius:calc(14px * var(--u));background:color-mix(in srgb,var(--bg) 60%,transparent)}
  .num{color:var(--accent2);font-size:calc(22px * var(--u));font-family:Consolas,monospace}
  .itemText{font-size:calc(30px * var(--u))}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
  <div class="bg"></div><div class="grid"></div>
  <div class="clip" data-start="0" data-duration="${duration}">${html}</div>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({paused:true});
${script}
window.__timelines.main = tl;
tl.seek(0);
</script>
</body>
</html>`;
}

function renderHtml(template: string, props: Record<string, any>, meta: Record<string, unknown> | undefined, width: number, height: number, duration: number) {
  const theme = themeOf(meta);
  const eyebrow = props.eyebrow ?? 'AIEDITING';
  const title = props.title ?? '';
  if (template === 'statement') {
    const html = `<div class="stage" style="align-items:center;text-align:center"><div class="eyebrow">${escapeHtml(eyebrow)}</div><blockquote class="title" id="q" style="font-size:calc(74px * var(--u));max-width:88%">${words(props.text ?? title)}</blockquote><p class="subtitle" id="s">${escapeHtml(props.subtitle ?? '')}</p></div>`;
    return shell(html, `tl.from(".eyebrow",{opacity:0,y:-16,duration:.5},.1);tl.from("#q .word",{opacity:0,y:30,filter:"blur(8px)",duration:.7,stagger:.045,ease:"power3.out"},.25);tl.from("#s",{opacity:0,y:16,duration:.55},.8);`, width, height, duration, theme);
  }
  if (template === 'bullets') {
    const items = (props.items ?? []).map((item: string, index: number) => `<div class="item" id="i${index}"><span class="num">${String(index + 1).padStart(2, '0')}</span><span class="itemText">${escapeHtml(item)}</span></div>`).join('');
    const html = `<div class="stage"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h2 class="title" id="h" style="font-size:calc(62px * var(--u))">${words(title)}</h2><div class="list">${items}</div></div>`;
    return shell(html, `tl.from(".eyebrow",{opacity:0,x:-20,duration:.45},.05);tl.from("#h .word",{yPercent:110,opacity:0,duration:.6,stagger:.05,ease:"power3.out"},.18);tl.from(".item",{opacity:0,y:24,duration:.5,stagger:.12},.45);`, width, height, duration, theme);
  }
  if (template === 'end') {
    const html = `<div class="stage" style="align-items:center;text-align:center"><div id="mark" style="width:calc(104px * var(--u));height:calc(104px * var(--u));border-radius:calc(26px * var(--u));background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;font-size:calc(50px * var(--u));font-weight:800;color:#fff">A</div><h2 class="title" id="t" style="font-size:calc(78px * var(--u))">${words(title || 'Hazır.')}</h2><p class="subtitle" id="s">${escapeHtml(props.subtitle ?? '')}</p><div class="rule" id="r"></div></div>`;
    return shell(html, `tl.from("#mark",{scale:.6,opacity:0,duration:.7,ease:"back.out(1.7)"},.1);tl.from("#t .word",{yPercent:110,opacity:0,duration:.7,stagger:.06,ease:"power4.out"},.3);tl.from("#s",{opacity:0,y:14,duration:.5},.65);tl.from("#r",{scaleX:0,duration:.5},.8);`, width, height, duration, theme);
  }
  const html = `<div class="stage"><div class="eyebrow" id="e">${escapeHtml(eyebrow)}</div><h1 class="title" id="t">${words(title || 'AIEDITING')}</h1><div class="rule" id="r"></div><p class="subtitle" id="s">${escapeHtml(props.subtitle ?? '')}</p></div>`;
  return shell(html, `tl.from("#e",{opacity:0,x:-22,duration:.5},.1);tl.from("#t .word",{yPercent:118,opacity:0,duration:.8,stagger:.055,ease:"power4.out"},.25);tl.from("#r",{scaleX:0,duration:.55,ease:"power2.inOut"},.62);tl.from("#s",{y:20,opacity:0,duration:.6},.75);`, width, height, duration, theme);
}

function findHyperframesCli(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve('hyperframes/package.json');
    const cli = join(dirname(pkg), 'bin', 'hyperframes.mjs');
    if (existsSync(cli)) return cli;
  } catch {}
  return null;
}

export class HyperframesAdapter extends BaseAdapter {
  readonly id = 'hyperframes';
  readonly name = 'HyperFrames';
  readonly version = VERSION;

  override async getHealth(): Promise<EngineHealth> {
    const cli = findHyperframesCli();
    const browser = findBrowser();
    const reasons: string[] = [];
    if (!cli) reasons.push('hyperframes package is not installed');
    if (!browser) reasons.push('no Chrome/Edge browser found (set AIEDITING_BROWSER)');
    return {available: Boolean(cli && browser), path: cli ?? undefined, reasons, checkedAt: new Date().toISOString()};
  }

  override async getCapabilities(): Promise<EngineCapabilities> {
    return {
      id: this.id,
      name: this.name,
      version: VERSION,
      operations: ['scene.render', 'graphics.html', 'animation.2d', 'compositing'],
      formats: ['mp4', 'webm', 'mov'],
      maxWidth: 3840,
      maxHeight: 2160,
      maxFps: 120,
      supportsAlpha: true,
      supportsAudio: false,
      deterministic: true,
      gpu: false,
      sceneTemplates: ['title', 'statement', 'bullets', 'end'],
      requirements: ['hyperframes', 'Chrome/Edge', 'ffmpeg'],
      license: 'Apache-2.0',
      notes: 'HTML/CSS + GSAP compositions rendered through the official HyperFrames CLI.',
    };
  }

  override async validate(_project: AIEDITINGProject): Promise<ValidationResult> {
    const health = await this.getHealth();
    return {valid: health.available, errors: health.available ? [] : health.reasons, warnings: []};
  }

  override async render(request: RenderRequest): Promise<RenderJob> {
    if (request.mode !== 'scene') throw new Error('HyperFrames renders scenes; the renderer composes the project');
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
    const temp = await mkdtemp(join(tmpdir(), 'aiediting-hf-'));
    try {
      const cli = findHyperframesCli();
      const browser = findBrowser();
      if (!browser) throw new Error('no browser found');
      const output = resolve(request.outputPath);
      await ensureDir(dirname(output));
      await copyFile(GSAP, join(temp, 'gsap.min.js'));
      const theme = themeOf(request.scene.engineMetadata);
      const html = renderHtml(request.scene.template, request.scene.props ?? {}, request.scene.engineMetadata, request.width, request.height, request.duration);
      await writeFile(join(temp, 'index.html'), html, 'utf8');
      await writeFile(join(temp, 'hyperframes.json'), JSON.stringify({id: 'aiediting-scene', name: 'aiediting-scene'}), 'utf8');
      const args = cli
        ? [cli, 'render', temp, '--output', output, '--fps', String(request.fps), '--quality', request.preview ? 'draft' : 'high']
        : ['--yes', 'hyperframes@0.9.3', 'render', temp, '--output', output, '--fps', String(request.fps), '--quality', request.preview ? 'draft' : 'high'];
      const command = cli ? process.execPath : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
      job.progress = 0.3;
      request.onProgress?.(0.3, 'hyperframes render');
      await run(command, args, {
        cwd: temp,
        timeoutMs: 20 * 60_000,
        signal: request.signal,
        env: {
          HYPERFRAMES_BROWSER_PATH: browser,
          HYPERFRAMES_NO_TELEMETRY: '1',
          HYPERFRAMES_NO_UPDATE_CHECK: '1',
          HYPERFRAMES_SKIP_SKILLS: '1',
          HYPERFRAMES_AGENT: '1',
          DO_NOT_TRACK: '1',
          PATH: `${dirname(FFMPEG)}${process.platform === 'win32' ? ';' : ':'}${dirname(FFPROBE)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
        },
        onStderr: chunk => {
          if (chunk.trim()) job.logs.push(chunk.trim().slice(0, 500));
          if (job.logs.length > 100) job.logs.shift();
        },
      });
      const info = await inspectMedia(output);
      if (!info.metadata.duration || info.metadata.duration < request.duration - 0.35) {
        throw new Error(`hyperframes output duration ${info.metadata.duration ?? 'unknown'}s`);
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

export default HyperframesAdapter;
