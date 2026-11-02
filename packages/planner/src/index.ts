import {createProject} from '@aiediting/core';
import type {AIEDITINGProject} from '@aiediting/project-schema';
import {addClip, addSubtitle, addText, addTrack, ensureTrack} from '@aiediting/timeline';

export interface PlannedScene {
  heading: string;
  body?: string;
  duration: number;
  engine?: string;
  template?: string;
  tone?: 'intro' | 'body' | 'outro';
}

export interface VideoBrief {
  title: string;
  prompt: string;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  language?: string;
  tone?: 'cinematic' | 'documentary' | 'social' | 'corporate' | 'tutorial' | 'energetic';
  scenes?: PlannedScene[];
  captions?: Array<{start: number; end: number; text: string}>;
  musicAssetId?: string;
  voiceAssetId?: string;
  enginePreference?: string[];
}

export interface PlanResult {
  project: AIEDITINGProject;
  scenes: PlannedScene[];
  notes: string[];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function defaultScenes(brief: VideoBrief): PlannedScene[] {
  const total = Math.max(3, brief.duration);
  const count = Math.min(8, Math.max(3, Math.round(total / 4.5)));
  const each = Math.round((total / count) * 1000) / 1000;
  const sentences = splitSentences(brief.prompt);
  const scenes: PlannedScene[] = [];
  for (let i = 0; i < count; i++) {
    const isFirst = i === 0;
    const isLast = i === count - 1;
    scenes.push({
      heading: isFirst ? brief.title : isLast ? 'Kapanış' : `Bölüm ${i + 1}`,
      body: sentences[i - 1] ?? (isFirst ? brief.prompt.slice(0, 140) : undefined),
      duration: each,
      tone: isFirst ? 'intro' : isLast ? 'outro' : 'body',
    });
  }
  return scenes;
}

export function planBrief(brief: VideoBrief): PlanResult {
  if (!brief.title?.trim()) throw new Error('brief.title is required');
  if (!brief.prompt?.trim()) throw new Error('brief.prompt is required');
  if (!Number.isFinite(brief.duration) || brief.duration < 1) throw new Error('brief.duration must be >= 1 second');

  const scenes = brief.scenes?.length ? brief.scenes : defaultScenes(brief);
  const sum = scenes.reduce((value, scene) => value + scene.duration, 0);
  if (Math.abs(sum - brief.duration) > 0.35) {
    throw new Error(`scene durations sum to ${sum}s, brief asks for ${brief.duration}s (tolerance 0.35s)`);
  }

  const project = createProject({
    name: brief.title,
    width: brief.width ?? 1920,
    height: brief.height ?? 1080,
    fps: brief.fps ?? 30,
    duration: brief.duration,
    background: brief.tone === 'cinematic' ? '#08080d' : '#101014',
  });

  const videoTrack = addTrack(project, {type: 'video', name: 'Primary', index: 0});
  const textTrack = addTrack(project, {type: 'text', name: 'Titles', index: 2});
  const hasCaptions = Boolean(brief.captions?.length);
  if (hasCaptions) addTrack(project, {type: 'subtitle', name: 'Subtitles', index: 3});
  const audioTrack = brief.musicAssetId || brief.voiceAssetId
    ? addTrack(project, {type: 'audio', name: 'Audio', index: 4})
    : null;

  let cursor = 0;
  scenes.forEach((scene, index) => {
    const start = Math.round(cursor * 1000) / 1000;
    const duration = Math.round(scene.duration * 1000) / 1000;
    const isFirst = index === 0;
    const isLast = index === scenes.length - 1;

    // A solid plate is the safe default. The agent can replace it with footage
    // or an engine-rendered clip after inspecting the project.
    addClip(project, videoTrack.id, {
      type: 'color',
      color: index % 2 === 0 ? '#0d0d14' : '#12121c',
      start,
      duration,
      engineMetadata: {fit: 'cover'},
    });

    addText(project, {
      text: scene.heading,
      start: start + Math.min(0.25, duration * 0.08),
      duration: Math.max(0.5, duration - 0.5),
      style: {
        fontFamily: 'Inter',
        fontSize: isFirst ? 92 : isLast ? 72 : 58,
        color: '#f7f7fb',
        align: 'left',
        bold: true,
        maxWidth: brief.width ? brief.width * 0.8 : undefined,
      },
      transform: {x: 0, y: isFirst ? 0 : -20, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5},
    });

    if (scene.body && duration > 2.2) {
      addText(project, {
        text: scene.body,
        start: start + Math.min(1.0, duration * 0.25),
        duration: Math.max(0.6, duration - 1.2),
        style: {
          fontFamily: 'Inter',
          fontSize: 28,
          color: '#a9a9bd',
          align: 'left',
          maxWidth: brief.width ? brief.width * 0.7 : undefined,
        },
        transform: {x: 0, y: 90, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5},
      });
    }
    cursor += duration;
  });

  for (const cue of brief.captions ?? []) {
    const subtitleTrack = ensureTrack(project, 'subtitle', 'Subtitles');
    addSubtitle(project, {trackId: subtitleTrack.id, text: cue.text, start: cue.start, duration: Math.max(0.2, cue.end - cue.start)});
  }

  if (audioTrack && brief.musicAssetId) {
    addClip(project, audioTrack.id, {
      type: 'audio',
      assetId: brief.musicAssetId,
      start: 0,
      duration: brief.duration,
      volume: 0.25,
      fadeIn: 0.5,
      fadeOut: 1,
    });
  }
  if (audioTrack && brief.voiceAssetId) {
    addClip(project, audioTrack.id, {
      type: 'audio',
      assetId: brief.voiceAssetId,
      start: 0,
      duration: brief.duration,
      volume: 1,
    });
  }

  const notes = [
    'Default plan uses FFmpeg-rendered plates and text; replace plates with footage or engine scenes where appropriate.',
    `Scenes: ${scenes.length}. Resolution ${project.settings.width}x${project.settings.height} @ ${project.settings.fps}fps.`,
  ];
  if (!brief.captions?.length) notes.push('No captions were supplied; add them before final export for social platforms.');
  if (brief.enginePreference?.length) notes.push(`Preferred engines: ${brief.enginePreference.join(', ')} (assign clip.renderer to use them).`);

  return {project, scenes, notes};
}

export interface LlmPlanConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

interface LlmScene {
  heading: string;
  body?: string;
  duration: number;
  engine?: string;
  template?: string;
}

export async function planWithLlm(brief: VideoBrief, config: LlmPlanConfig = {}): Promise<PlanResult> {
  const baseUrl = config.baseUrl ?? process.env.AIEDITING_LLM_BASE_URL;
  const apiKey = config.apiKey ?? process.env.AIEDITING_LLM_API_KEY;
  const model = config.model ?? process.env.AIEDITING_LLM_MODEL ?? 'gpt-4o-mini';
  if (!baseUrl || !apiKey) {
    throw new Error('LLM planning needs AIEDITING_LLM_BASE_URL and AIEDITING_LLM_API_KEY; falling back is the caller\'s job');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 90_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: {type: 'json_object'},
        messages: [
          {
            role: 'system',
            content: 'You are a professional video editor. Return only JSON with a "scenes" array. Each scene: heading (string), body (string, optional), duration (seconds), engine (ffmpeg|hyperframes|remotion|motion-canvas), template (string, optional). The durations must sum exactly to the requested duration.',
          },
          {role: 'user', content: JSON.stringify(brief)},
        ],
      }),
    });
    if (!response.ok) throw new Error(`LLM planner failed: HTTP ${response.status} ${await response.text()}`);
    const data = await response.json() as {choices?: Array<{message?: {content?: string}}>};
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM planner returned no content');
    const parsed = JSON.parse(content) as {scenes?: LlmScene[]};
    if (!parsed.scenes?.length) throw new Error('LLM planner returned no scenes');
    const scenes: PlannedScene[] = parsed.scenes.map((scene, index) => ({
      heading: String(scene.heading),
      body: scene.body ? String(scene.body) : undefined,
      duration: Number(scene.duration),
      engine: scene.engine,
      template: scene.template,
      tone: index === 0 ? 'intro' : index === parsed.scenes!.length - 1 ? 'outro' : 'body',
    }));
    return planBrief({...brief, scenes});
  } finally {
    clearTimeout(timer);
  }
}
