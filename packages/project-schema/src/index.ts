import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';

export const PROJECT_VERSION = '1.0.0' as const;
export const PROJECT_FILE = 'aiediting.project.json';

const idSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'invalid id');
const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected a hex color');
const secondsSchema = z.number().finite().min(0);
const positiveSecondsSchema = z.number().finite().positive();
const relativePathSchema = z.string().min(1).max(2048).refine(
  value => !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]/).includes('..'),
  'asset paths must be relative and must not traverse outside the project',
);

export const assetKindSchema = z.enum(['video', 'audio', 'image', 'font', 'subtitle', 'other']);
export const colorSpaceSchema = z.enum(['srgb', 'rec709', 'rec2020', 'display-p3']);
export const easingSchema = z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step']);

export const mediaMetadataSchema = z.object({
  duration: secondsSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  channels: z.number().int().positive().optional(),
  sampleRate: z.number().int().positive().optional(),
  bitrate: z.number().int().nonnegative().optional(),
  size: z.number().int().nonnegative().optional(),
  container: z.string().optional(),
  rotation: z.number().optional(),
}).strict();

export const assetSchema = z.object({
  id: idSchema,
  kind: assetKindSchema,
  path: relativePathSchema,
  name: z.string().min(1).max(512),
  hash: z.string().optional(),
  metadata: mediaMetadataSchema.default({}),
  tags: z.array(z.string().max(64)).default([]),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  proxyPath: relativePathSchema.optional(),
}).strict();

export const transformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().max(20).default(1),
  rotation: z.number().min(-3600).max(3600).default(0),
  opacity: z.number().min(0).max(1).default(1),
  anchorX: z.number().min(0).max(1).default(0.5),
  anchorY: z.number().min(0).max(1).default(0.5),
}).strict();

export const effectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('eq'),
    contrast: z.number().min(0).max(4).default(1),
    brightness: z.number().min(-1).max(1).default(0),
    saturation: z.number().min(0).max(4).default(1),
    gamma: z.number().positive().max(10).default(1),
  }).strict(),
  z.object({
    type: z.literal('blur'),
    sigma: z.number().positive().max(100).default(2),
  }).strict(),
  z.object({
    type: z.literal('sharpen'),
    amount: z.number().min(0).max(5).default(1),
  }).strict(),
  z.object({
    type: z.literal('vignette'),
    angle: z.number().min(0).max(Math.PI * 2).default(Math.PI / 4),
  }).strict(),
  z.object({
    type: z.literal('hue'),
    degrees: z.number().min(-360).max(360).default(0),
  }).strict(),
  z.object({
    type: z.literal('chromakey'),
    color: hexColorSchema.default('#00ff00'),
    similarity: z.number().min(0).max(1).default(0.15),
    blend: z.number().min(0).max(1).default(0.05),
  }).strict(),
]);

export const keyframeSchema = z.object({
  time: secondsSchema,
  value: z.number(),
  easing: easingSchema.default('linear'),
}).strict();

export const animationTrackSchema = z.object({
  property: z.enum(['opacity', 'x', 'y', 'scale', 'rotation', 'volume']),
  keyframes: z.array(keyframeSchema).min(2),
}).strict();

export const transitionSchema = z.object({
  type: z.enum([
    'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
    'slideleft', 'slideright', 'slideup', 'slidedown',
    'circleopen', 'circleclose', 'dissolve', 'pixelize', 'radial',
  ]).default('fade'),
  duration: z.number().positive().max(10).default(0.5),
}).strict();

export const textStyleSchema = z.object({
  fontFamily: z.string().default('Inter'),
  fontSize: z.number().positive().max(1000).default(64),
  color: hexColorSchema.default('#ffffff'),
  backgroundColor: hexColorSchema.optional(),
  backgroundOpacity: z.number().min(0).max(1).default(0.55),
  align: z.enum(['left', 'center', 'right']).default('center'),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  lineHeight: z.number().positive().max(5).default(1.2),
  maxWidth: z.number().positive().optional(),
  strokeColor: hexColorSchema.optional(),
  strokeWidth: z.number().min(0).max(50).default(0),
  shadow: z.boolean().default(false),
  letterSpacing: z.number().min(-20).max(100).default(0),
}).strict();

export const textContentSchema = z.object({
  content: z.string().max(10000),
  style: textStyleSchema.default({}),
}).strict();

export const rendererHintSchema = z.object({
  engine: z.string().min(1),
  template: z.string().optional(),
  scene: z.record(z.unknown()).optional(),
  options: z.record(z.unknown()).optional(),
}).strict();

export const clipSchema = z.object({
  id: idSchema,
  name: z.string().max(512).optional(),
  type: z.enum(['video', 'image', 'audio', 'text', 'subtitle', 'color', 'composition']),
  start: secondsSchema,
  duration: positiveSecondsSchema,
  in: secondsSchema.optional(),
  out: secondsSchema.optional(),
  speed: z.number().min(0.1).max(10).default(1),
  assetId: idSchema.optional(),
  compositionId: idSchema.optional(),
  transform: transformSchema.default({}),
  effects: z.array(effectSchema).default([]),
  animations: z.array(animationTrackSchema).default([]),
  transitionOut: transitionSchema.optional(),
  text: textContentSchema.optional(),
  subtitle: textContentSchema.optional(),
  color: hexColorSchema.optional(),
  volume: z.number().min(0).max(4).default(1),
  fadeIn: secondsSchema.default(0),
  fadeOut: secondsSchema.default(0),
  renderer: rendererHintSchema.optional(),
  engineMetadata: z.record(z.unknown()).default({}),
}).strict().superRefine((clip, ctx) => {
  if (['video', 'image', 'audio'].includes(clip.type) && !clip.assetId) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: `${clip.type} clips require assetId`, path: ['assetId']});
  }
  if (clip.type === 'composition' && !clip.compositionId) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'composition clips require compositionId', path: ['compositionId']});
  }
  if (['text', 'subtitle'].includes(clip.type) && !clip.text && !clip.subtitle) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: `${clip.type} clips require text or subtitle`, path: ['text']});
  }
  if (clip.in != null && clip.out != null && clip.out <= clip.in) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'out must be greater than in', path: ['out']});
  }
  if (clip.transitionOut && clip.transitionOut.duration >= clip.duration) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'transition must be shorter than the clip', path: ['transitionOut', 'duration']});
  }
});

export const trackTypeSchema = z.enum(['video', 'audio', 'text', 'subtitle', 'overlay']);
export const trackSchema = z.object({
  id: idSchema,
  name: z.string().max(512).optional(),
  type: trackTypeSchema,
  index: z.number().int().min(0).default(0),
  clips: z.array(clipSchema).default([]),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  volume: z.number().min(0).max(4).default(1),
}).strict();

export const compositionSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(512),
  duration: positiveSecondsSchema.optional(),
  tracks: z.array(trackSchema).default([]),
  engineMetadata: z.record(z.unknown()).default({}),
}).strict();

export const exportSettingsSchema = z.object({
  format: z.enum(['mp4', 'mov', 'webm']).default('mp4'),
  videoCodec: z.enum(['h264', 'h265', 'prores', 'vp9']).default('h264'),
  audioCodec: z.enum(['aac', 'pcm_s16le', 'opus']).default('aac'),
  crf: z.number().int().min(0).max(51).default(18),
  bitrate: z.string().regex(/^\d+(?:\.\d+)?[kKmM]?$/).optional(),
  preset: z.enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']).default('medium'),
  pixelFormat: z.enum(['yuv420p', 'yuv422p', 'yuv444p', 'yuv420p10le', 'yuva444p10le']).default('yuv420p'),
  faststart: z.boolean().default(true),
  width: z.number().int().min(16).max(7680).optional(),
  height: z.number().int().min(16).max(7680).optional(),
  fps: z.number().min(1).max(120).optional(),
  loudnessTarget: z.number().min(-40).max(-5).default(-16),
}).strict();

export const projectSettingsSchema = z.object({
  width: z.number().int().min(16).max(7680).refine(value => value % 2 === 0, 'width must be even'),
  height: z.number().int().min(16).max(7680).refine(value => value % 2 === 0, 'height must be even'),
  fps: z.number().min(1).max(120).default(30),
  sampleRate: z.number().int().min(8000).max(192000).default(48000),
  colorSpace: colorSpaceSchema.default('srgb'),
  background: hexColorSchema.default('#000000'),
  duration: positiveSecondsSchema.optional(),
  export: exportSettingsSchema.default({}),
}).strict();

export const markerSchema = z.object({
  id: idSchema,
  time: secondsSchema,
  label: z.string().max(512),
  color: hexColorSchema.optional(),
}).strict();

export const projectSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(PROJECT_VERSION),
  id: idSchema,
  name: z.string().min(1).max(512),
  description: z.string().max(10000).default(''),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
  settings: projectSettingsSchema,
  assets: z.array(assetSchema).default([]),
  tracks: z.array(trackSchema).default([]),
  compositions: z.array(compositionSchema).default([]),
  markers: z.array(markerSchema).default([]),
  engineMetadata: z.record(z.unknown()).default({}),
}).strict();

export type AIEDITINGProject = z.infer<typeof projectSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetKind = z.infer<typeof assetKindSchema>;
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export type Track = z.infer<typeof trackSchema>;
export type TrackType = z.infer<typeof trackTypeSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type ClipType = Clip['type'];
export type Transform = z.infer<typeof transformSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type AnimationTrack = z.infer<typeof animationTrackSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type TextContent = z.infer<typeof textContentSchema>;
export type RendererHint = z.infer<typeof rendererHintSchema>;
export type Composition = z.infer<typeof compositionSchema>;
export type Marker = z.infer<typeof markerSchema>;

export interface ValidationIssue {
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  success: boolean;
  project?: AIEDITINGProject;
  issues: ValidationIssue[];
}

const allowedClipTypes: Record<Track['type'], Clip['type'][]> = {
  video: ['video', 'image', 'color', 'composition'],
  overlay: ['video', 'image', 'color', 'composition'],
  audio: ['audio'],
  text: ['text'],
  subtitle: ['subtitle'],
};

export function validateProject(input: unknown): ValidationResult {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(issue => ({
        path: issue.path.join('.'),
        severity: 'error' as const,
        message: issue.message,
      })),
    };
  }
  const project = parsed.data;
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) => issues.push({path, severity: 'error', message});
  const warn = (path: string, message: string) => issues.push({path, severity: 'warning', message});

  const ids = new Map<string, string>();
  const remember = (path: string, id: string) => {
    const previous = ids.get(id);
    if (previous) error(path, `duplicate id ${id} (already used by ${previous})`);
    else ids.set(id, path);
  };

  project.assets.forEach((asset, index) => remember(`assets.${index}.id`, asset.id));
  project.compositions.forEach((composition, index) => remember(`compositions.${index}.id`, composition.id));
  const assetIds = new Set(project.assets.map(asset => asset.id));
  const compositionIds = new Set(project.compositions.map(composition => composition.id));

  const checkTracks = (tracks: Track[], prefix: string) => {
    tracks.forEach((track, trackIndex) => {
      remember(`${prefix}.${trackIndex}.id`, track.id);
      const seen = new Set<string>();
      const sorted = [...track.clips].sort((a, b) => a.start - b.start);
      for (const [clipIndex, clip] of sorted.entries()) {
        const path = `${prefix}.${trackIndex}.clips.${clipIndex}`;
        remember(`${path}.id`, clip.id);
        if (!allowedClipTypes[track.type].includes(clip.type)) {
          error(path, `${clip.type} clip is not allowed on a ${track.type} track`);
        }
        if (clip.assetId && !assetIds.has(clip.assetId)) error(`${path}.assetId`, `unknown asset ${clip.assetId}`);
        if (clip.compositionId && !compositionIds.has(clip.compositionId)) {
          error(`${path}.compositionId`, `unknown composition ${clip.compositionId}`);
        }
        if (['video', 'image', 'audio'].includes(clip.type)) {
          const asset = project.assets.find(item => item.id === clip.assetId);
          if (asset?.metadata.duration != null && clip.out != null && clip.out > asset.metadata.duration + 0.05) {
            warn(`${path}.out`, `out ${clip.out}s exceeds asset duration ${asset.metadata.duration}s`);
          }
          if (asset?.metadata.duration != null && clip.in != null && clip.in >= asset.metadata.duration) {
            error(`${path}.in`, `in ${clip.in}s is outside asset duration ${asset.metadata.duration}s`);
          }
        }
        if (clip.type === 'text' && !clip.text) error(`${path}.text`, 'text clip requires text');
        if (clip.type === 'subtitle' && !clip.subtitle) error(`${path}.subtitle`, 'subtitle clip requires subtitle');
        if (clip.type === 'color' && !clip.color) error(`${path}.color`, 'color clip requires color');
        if (clip.animations.some(animation => animation.keyframes.some(frame => frame.time > clip.duration + 0.001))) {
          warn(`${path}.animations`, 'keyframe is after the clip ends');
        }
        const next = sorted[clipIndex + 1];
        if (next && next.start < clip.start + clip.duration - 0.001) {
          const overlap = clip.start + clip.duration - next.start;
          const transition = clip.transitionOut?.duration ?? 0;
          if (overlap > transition + 0.01) {
            warn(path, `clips overlap by ${overlap.toFixed(3)}s on track ${track.id}`);
          }
        }
      }
    });
  };

  checkTracks(project.tracks, 'tracks');
  project.compositions.forEach((composition, index) => {
    if (composition.duration != null && composition.duration <= 0) error(`compositions.${index}.duration`, 'duration must be positive');
    checkTracks(composition.tracks, `compositions.${index}.tracks`);
  });

  return {
    success: issues.every(issue => issue.severity !== 'error'),
    project,
    issues,
  };
}

export function assertValidProject(input: unknown): AIEDITINGProject {
  const result = validateProject(input);
  if (!result.success || !result.project) {
    const errors = result.issues.filter(issue => issue.severity === 'error');
    const detail = errors.slice(0, 12).map(issue => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`Invalid AIEDITING project:\n${detail}`);
  }
  return result.project;
}

export function projectJsonSchema() {
  return zodToJsonSchema(projectSchema, {
    name: 'AIEDITINGProject',
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
}
