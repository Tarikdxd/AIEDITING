import {resolve} from 'node:path';
import {z} from 'zod';
import {
  createProject,
  inspectProject,
  loadProject,
  saveProject,
  validateProjectDocument,
} from '@aiediting/core';
import {importAsset} from '@aiediting/asset-manager';
import {
  addClip,
  addEffect,
  addSubtitle,
  addText,
  addTrack,
  addTransition,
  changeSpeed,
  getClip,
  moveClip,
  removeClip,
  removeEffect,
  reorderClips,
  setKeyframe,
  setTransform,
  splitClip,
  trimClip,
  type NewClip,
} from '@aiediting/timeline';
import {assertValidProject, type AIEDITINGProject, type TrackType} from '@aiediting/project-schema';
import {
  detectScenes,
  detectSilence,
  ensureDir,
  generateThumbnail,
  inspectMedia,
  measureLoudness,
} from '@aiediting/media';
import {planBrief, type PlannedScene, type VideoBrief} from '@aiediting/planner';
import {RenderManager} from '@aiediting/renderer';
import {createDefaultRegistry} from '@aiediting/engines';
import type {AdapterRegistry, EngineOperation, EngineFormat} from '@aiediting/adapter-sdk';

export interface ToolContext {
  /** Directory that holds aiediting.project.json. Resolved via open_project. */
  projectDir?: string;
  current?: AIEDITINGProject;
  currentPath?: string;
  registry: AdapterRegistry;
  jobs: Map<string, unknown>;
}

export const toolContext: ToolContext = {registry: createDefaultRegistry(), jobs: new Map()};

export function resetContext(): void {
  toolContext.projectDir = undefined;
  toolContext.current = undefined;
  toolContext.currentPath = undefined;
  toolContext.jobs.clear();
}

function needProject(): AIEDITINGProject {
  if (!toolContext.current) throw new Error('no open project; call create_project or open_project first');
  return toolContext.current;
}

function needDir(): string {
  if (!toolContext.projectDir) throw new Error('no project directory set; call create_project or open_project first');
  return toolContext.projectDir;
}

const ok = (value: unknown) => ({content: [{type: 'text' as const, text: JSON.stringify(value, null, 2)}]});

async function persist(): Promise<string> {
  const project = needProject();
  const path = toolContext.projectDir
    ? resolve(toolContext.projectDir, 'aiediting.project.json')
    : toolContext.currentPath;
  if (!path) throw new Error('no save target; open a project file first');
  return saveProject(project, path);
}

export interface ToolSpec {
  name: string;
  group: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  run: (args: Record<string, any>) => unknown | Promise<unknown>;
}

const trackType = z.enum(['video', 'audio', 'text', 'subtitle', 'overlay']);
const animProperty = z.enum(['opacity', 'x', 'y', 'scale', 'rotation', 'volume']);

export const TOOLS: ToolSpec[] = [
  // ------------------------------------------------------------------ PROJECT
  {
    name: 'create_project',
    group: 'project',
    description: 'Create a new AIEDITING project (14:9 default 1920x1080@30) in the given directory.',
    schema: {
      dir: z.string().min(1),
      name: z.string().min(1),
      width: z.number().int().min(16).max(7680).optional(),
      height: z.number().int().min(16).max(7680).optional(),
      fps: z.number().min(1).max(120).optional(),
      duration: z.number().positive().optional(),
    },
    run: (a) => {
      const dir = resolve(a.dir);
      const project = createProject({
        name: a.name,
        width: a.width ?? 1920,
        height: a.height ?? 1080,
        fps: a.fps ?? 30,
        duration: a.duration,
      });
      addTrack(project, {type: 'video', name: 'Primary', index: 0});
      addTrack(project, {type: 'audio', name: 'Audio', index: 1});
      addTrack(project, {type: 'text', name: 'Titles', index: 2});
      addTrack(project, {type: 'subtitle', name: 'Subtitles', index: 3});
      toolContext.projectDir = dir;
      toolContext.currentPath = resolve(dir, 'aiediting.project.json');
      toolContext.current = project;
      return persist().then(path => ({project: inspectProject(project), savedTo: path}));
    },
  },
  {
    name: 'open_project',
    group: 'project',
    description: 'Open an existing project from a directory (or a section file) and set it as the working project.',
    schema: {dir: z.string().min(1)},
    run: async (a) => {
      const opened = await loadProject(a.dir);
      toolContext.projectDir = opened.dir;
      toolContext.current = opened.project;
      toolContext.currentPath = opened.path;
      return inspectProject(opened.project);
    },
  },
  {
    name: 'inspect_project',
    group: 'project',
    description: 'Return a summary of the current project: duration, resolution, tracks, clips, assets.',
    schema: {},
    run: () => inspectProject(needProject()),
  },
  {
    name: 'validate_project',
    group: 'project',
    description: 'Validate the current project against the canonical schema. Returns issues with paths and severities.',
    schema: {},
    run: () => validateProjectDocument(needProject()),
  },
  {
    name: 'save_project',
    group: 'project',
    description: 'Save the current project to disk (validation errors block saving).',
    schema: {},
    run: () => ({savedTo: persist()}),
  },

  // -------------------------------------------------------------------- MEDIA
  {
    name: 'import_media',
    group: 'media',
    description: 'Copy a media file into the project assets, probing duration/resolution/codecs. Deduplicates by hash.',
    schema: {
      path: z.string().min(1),
      tags: z.array(z.string()).optional(),
    },
    run: async (a) => {
      const asset = await importAsset(needDir(), needProject(), resolve(a.path), {tags: a.tags});
      await persist();
      return asset;
    },
  },
  {
    name: 'inspect_media',
    group: 'media',
    description: 'Probe any media file with ffprobe: duration, resolution, fps, codecs, audio channels, size.',
    schema: {path: z.string().min(1)},
    run: (a) => inspectMedia(resolve(a.path)),
  },
  {
    name: 'analyze_media',
    group: 'media',
    description: 'Analyze audio/video: integrated loudness (LUFS), silence spans, scene cut timestamps.',
    schema: {path: z.string().min(1)},
    run: async (a) => {
      const path = resolve(a.path);
      const [loudness, silence, scenes] = await Promise.all([
        measureLoudness(path),
        detectSilence(path),
        detectScenes(path),
      ]);
      return {loudness, silences: silence.length, silence, sceneCuts: scenes};
    },
  },
  {
    name: 'generate_thumbnail',
    group: 'media',
    description: 'Extract one video frame as a thumbnail JPEG. Returns the absolute output path.',
    schema: {
      path: z.string().min(1),
      out: z.string().min(1),
      time: z.number().min(0).optional(),
      width: z.number().int().min(16).max(3840).optional(),
    },
    run: async (a) => {
      const output = resolve(a.out);
      await ensureDir(output.replace(/[/\\][^/\\]+$/, ''));
      await generateThumbnail(resolve(a.path), output, {time: a.time, width: a.width});
      return {thumbnail: output};
    },
  },

  // ---------------------------------------------------------------- TIMELINE
  {
    name: 'add_track',
    group: 'timeline',
    description: 'Add a track to the current project.',
    schema: {
      type: trackType,
      name: z.string().optional(),
      index: z.number().int().min(0).optional(),
    },
    run: (a) => (addTrack(needProject(), a as unknown as Parameters<typeof addTrack>[1]), {tracks: inspectProject(needProject()).tracks}),
  },
  {
    name: 'add_clip',
    group: 'timeline',
    description: 'Add a clip to a track. Visual clips need assetId; text needs text; color needs color. Default start = end of the track.',
    schema: {
      trackId: z.string(),
      clip: z.object({
        type: z.enum(['video', 'image', 'audio', 'text', 'subtitle', 'color', 'composition']),
        start: z.number().min(0).optional(),
        duration: z.number().positive(),
        assetId: z.string().optional(),
        in: z.number().min(0).optional(),
        out: z.number().min(0).optional(),
        speed: z.number().min(0.1).max(10).optional(),
        color: z.string().optional(),
        text: z.string().optional(),
        style: z.record(z.unknown()).optional(),
        volume: z.number().min(0).max(4).optional(),
        fadeIn: z.number().min(0).optional(),
        fadeOut: z.number().min(0).optional(),
        transitionOut: z.object({type: z.string(), duration: z.number().positive()}).optional(),
        renderer: z.object({
          engine: z.string(),
          template: z.string().optional(),
          scene: z.record(z.unknown()).optional(),
          options: z.record(z.unknown()).optional(),
        }).optional(),
        fit: z.enum(['cover', 'contain']).optional(),
      }),
    },
    run: (a) => {
      const project = needProject();
      const clip = a.clip as NewClip;
      if (clip.type === 'text') {
        const created = addText(project, {
          trackId: a.trackId,
          text: (clip as any).text as string,
          start: clip.start ?? 0,
          duration: clip.duration,
          style: (clip as any).style,
        });
        return {clipId: created.id};
      }
      if (clip.type === 'subtitle') {
        const created = addSubtitle(project, {
          trackId: a.trackId,
          text: (clip as any).text as string,
          start: clip.start ?? 0,
          duration: clip.duration,
          style: (clip as any).style,
        });
        return {clipId: created.id};
      }
      return {clipId: addClip(project, a.trackId, clip).id};
    },
  },
  {
    name: 'trim_clip',
    group: 'timeline',
    description: 'Trim a clip: set absolute start/end times on the timeline (keeps source trim in sync).',
    schema: {
      clipId: z.string(),
      start: z.number().min(0).optional(),
      end: z.number().positive().optional(),
    },
    run: (a) => (trimClip(needProject(), a.clipId, a), inspectProject(needProject())),
  },
  {
    name: 'split_clip',
    group: 'timeline',
    description: 'Split a clip at a timeline position, producing two clips.',
    schema: {clipId: z.string(), at: z.number().positive()},
    run: (a) => (splitClip(needProject(), a.clipId, a.at), inspectProject(needProject())),
  },
  {
    name: 'move_clip',
    group: 'timeline',
    description: 'Move a clip to a new timeline start.',
    schema: {clipId: z.string(), start: z.number().min(0)},
    run: (a) => (moveClip(needProject(), a.clipId, a.start), inspectProject(needProject())),
  },
  {
    name: 'remove_clip',
    group: 'timeline',
    description: 'Remove a clip from the timeline.',
    schema: {clipId: z.string()},
    run: (a) => (removeClip(needProject(), a.clipId), inspectProject(needProject())),
  },
  {
    name: 'change_speed',
    group: 'timeline',
    description: 'Change the playback speed of a clip (0.1–10). Timeline duration adjusts, source trim is preserved.',
    schema: {clipId: z.string(), speed: z.number().min(0.1).max(10)},
    run: (a) => (changeSpeed(needProject(), a.clipId, a.speed), inspectProject(needProject())),
  },
  {
    name: 'reorder_clips',
    group: 'timeline',
    description: 'Resequence a track so clips play back-to-back in the given order.',
    schema: {trackId: z.string(), orderedIds: z.array(z.string())},
    run: (a) => (reorderClips(needProject(), a.trackId, a.orderedIds), inspectProject(needProject())),
  },

  // ----------------------------------------------------------------- EDITING
  {
    name: 'add_transition',
    group: 'editing',
    description: 'Add a transition between this clip and the next on the same track (fade, wipe*, slide*, dissolve, ...).',
    schema: {
      clipId: z.string(),
      type: z.string().default('fade'),
      duration: z.number().positive().default(0.5),
    },
    run: (a) => (addTransition(needProject(), a.clipId, {type: a.type, duration: a.duration}), inspectProject(needProject())),
  },
  {
    name: 'add_effect',
    group: 'editing',
    description: 'Attach an effect to a clip. Supported: eq, blur, sharpen, vignette, hue, chromakey.',
    schema: {
      clipId: z.string(),
      effect: z.object({type: z.string()}).passthrough(),
    },
    run: (a) => (addEffect(needProject(), a.clipId, a.effect), inspectProject(needProject())),
  },
  {
    name: 'remove_effect',
    group: 'editing',
    description: 'Remove an effect from a clip by index.',
    schema: {clipId: z.string(), index: z.number().int().min(0)},
    run: (a) => (removeEffect(needProject(), a.clipId, a.index), inspectProject(needProject())),
  },
  {
    name: 'add_text',
    group: 'editing',
    description: 'Add a styled text layer (title, lower third, callout).',
    schema: {
      text: z.string().min(1),
      start: z.number().min(0),
      duration: z.number().positive(),
      style: z.record(z.unknown()).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    },
    run: (a) => {
      const clip = addText(needProject(), {
        text: a.text,
        start: a.start,
        duration: a.duration,
        style: a.style,
        transform: {x: a.x ?? 0, y: a.y ?? 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5},
      });
      return {clipId: clip.id};
    },
  },
  {
    name: 'add_subtitle',
    group: 'editing',
    description: 'Add one subtitle cue to the dedicated subtitle track (burned in during render).',
    schema: {
      text: z.string().min(1),
      start: z.number().min(0),
      duration: z.number().positive(),
      style: z.record(z.unknown()).optional(),
    },
    run: (a) => {
      const clip = addSubtitle(needProject(), {text: a.text, start: a.start, duration: a.duration, style: a.style});
      return {clipId: clip.id};
    },
  },
  {
    name: 'set_keyframe',
    group: 'editing',
    description: 'Set an animated keyframe on a clip property (opacity, x, y, scale, rotation, volume).',
    schema: {
      clipId: z.string(),
      property: animProperty,
      time: z.number().min(0),
      value: z.number(),
      easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step']).optional(),
    },
    run: (a) => (setKeyframe(needProject(), a.clipId, a.property, {time: a.time, value: a.value, easing: a.easing}), {clip: getClip(needProject(), a.clipId).clip}),
  },
  {
    name: 'set_transform',
    group: 'editing',
    description: 'Patch the static transform of a clip (x, y, scale, rotation, opacity, anchor).',
    schema: {
      clipId: z.string(),
      patch: z.object({}).passthrough(),
    },
    run: (a) => (setTransform(needProject(), a.clipId, a.patch), {clip: getClip(needProject(), a.clipId).clip}),
  },
  {
    name: 'set_clip_renderer',
    group: 'editing',
    description: 'Assign a clip to a rendering engine (hyperframes/remotion/motion-canvas/styk/blender/mpt). The renderer renders the scene, then composes.',
    schema: {
      clipId: z.string(),
      engine: z.string(),
      template: z.string().optional(),
      props: z.record(z.unknown()).optional(),
      options: z.record(z.unknown()).optional(),
    },
    run: (a) => {
      const {clip} = getClip(needProject(), a.clipId);
      clip.renderer = {engine: a.engine, template: a.template, scene: a.props, options: a.options};
      return inspectProject(needProject());
    },
  },

  // ----------------------------------------------------------------- PLANNER
  {
    name: 'plan_video',
    group: 'planning',
    description: 'Turn a natural-language brief into a concrete timeline (scene plates, titles, optional captions) and save it.',
    schema: {
      title: z.string().min(1),
      prompt: z.string().min(1),
      duration: z.number().positive(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      captions: z.array(z.object({start: z.number(), end: z.number(), text: z.string()})).optional(),
      scenes: z.array(z.object({
        heading: z.string().min(1),
        body: z.string().optional(),
        duration: z.number().positive(),
        engine: z.string().optional(),
        template: z.string().optional(),
      })).optional(),
    },
    run: async (a) => {
      const brief: VideoBrief = {
        title: a.title,
        prompt: a.prompt,
        duration: a.duration,
        width: a.width,
        height: a.height,
        captions: a.captions,
        scenes: a.scenes as PlannedScene[] | undefined,
      };
      const result = planBrief(brief);
      toolContext.current = result.project;
      toolContext.projectDir = needDirOrCwd();
      toolContext.currentPath = resolve(toolContext.projectDir, 'aiediting.project.json');
      await persist();
      return {notes: result.notes, summary: inspectProject(result.project)};
    },
  },

  // --------------------------------------------------------------- RENDERING
  {
    name: 'render_video',
    group: 'rendering',
    description: 'Render the current project to a video file. Blocks until done; the output is ffprobe-verified before returning. Use render_status/cancel_render in a later session if needed.',
    schema: {
      preview: z.boolean().optional(),
      outputPath: z.string().optional(),
    },
    run: async (a) => {
      const project = needProject();
      const dir = needDir();
      const manager = new RenderManager(toolContext.registry, resolve(dir, 'renders', 'jobs'));
      try {
        const job = await manager.render({
          project,
          projectDir: dir,
          registry: toolContext.registry,
          preview: a.preview ?? false,
          outputPath: a.outputPath ? resolve(a.outputPath) : undefined,
        });
        toolContext.jobs.set(job.id, job);
        return {
          jobId: job.id,
          status: job.status,
          outputPath: job.outputPath,
          width: job.width,
          height: job.height,
          duration: job.duration,
          engine: job.engineId,
        };
      } catch (error) {
        return {status: 'failed', error: (error as Error).message};
      }
    },
  },
  {
    name: 'render_status',
    group: 'rendering',
    description: 'List renders recorded in the project (renders/jobs/*.json persisted by the renderer).',
    schema: {},
    run: async () => {
      const dir = needDir();
      const {readdir, readFile} = await import('node:fs/promises');
      const jobDir = resolve(dir, 'renders', 'jobs');
      try {
        const files = await readdir(jobDir);
        const jobs = [];
        for (const file of files.filter(file => file.endsWith('.json')).slice(-20)) {
          jobs.push(JSON.parse(await readFile(resolve(jobDir, file), 'utf8')));
        }
        return {jobs};
      } catch {
        return {jobs: []};
      }
    },
  },
  {
    name: 'cancel_render',
    group: 'rendering',
    description: 'Render runs are managed jobs; this tool returns the state of renders persisted under renders/jobs.',
    schema: {},
    run: async () => await renderStatusList(),
  },

  // ----------------------------------------------------------------- ENGINES
  {
    name: 'list_engines',
    group: 'engines',
    description: 'List every rendering engine, its availability and capabilities.',
    schema: {},
    run: async () => {
      const health = await toolContext.registry.health();
      const capabilities = await toolContext.registry.capabilities();
      return capabilities.map((caps: any) => ({
        id: caps.id,
        name: caps.name,
        version: caps.version,
        available: caps.health.available,
        reasons: caps.health.reasons,
        operations: caps.operations,
        templates: caps.sceneTemplates,
        license: caps.license,
        notes: caps.notes,
      }));
    },
  },
  {
    name: 'check_engine_health',
    group: 'engines',
    description: 'Detailed health/logic check for one engine (ffmpeg, hyperframes, remotion, motion-canvas, styk, blender, mpt).',
    schema: {id: z.string()},
    run: (a) => toolContext.registry.get(a.id).getHealth(),
  },
  {
    name: 'get_engine_capabilities',
    group: 'engines',
    description: 'Capabilities of one engine: operations, formats, limits, templates, license.',
    schema: {id: z.string()},
    run: (a) => toolContext.registry.get(a.id).getCapabilities(),
  },
];

function needDirOrCwd(): string {
  try {
    return needDir();
  } catch {
    return resolve(process.cwd());
  }
}

async function renderStatusList(): Promise<unknown[]> {
  const dir = needDir();
  const {readdir, readFile} = await import('node:fs/promises');
  const jobDir = resolve(dir, 'renders', 'jobs');
  try {
    const files = await readdir(jobDir);
    const jobs = [];
    for (const file of files.filter(item => item.endsWith('.json')).slice(-20)) {
      jobs.push(JSON.parse(await readFile(resolve(jobDir, file), 'utf8')));
    }
    return jobs;
  } catch {
    return [];
  }
}

export const TOOL_SPECS = TOOLS;


