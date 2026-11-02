import {randomUUID} from 'node:crypto';
import {
  clipSchema,
  trackSchema,
  type AIEDITINGProject,
  type AnimationTrack,
  type Clip,
  type ClipType,
  type Effect,
  type Track,
  type TrackType,
  type Transform,
} from '@aiediting/project-schema';

export type NewClip = Partial<Omit<Clip, 'id'>> & {
  id?: string;
  type: ClipType;
  duration: number;
};

export type NewTrack = {
  id?: string;
  name?: string;
  type: TrackType;
  index?: number;
};

const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

export function clipEnd(clip: Pick<Clip, 'start' | 'duration'>): number {
  return clip.start + clip.duration;
}

export function projectDuration(project: AIEDITINGProject): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clipEnd(clip));
  }
  end = Math.max(end, project.settings.duration ?? 0);
  return Math.round(end * 1000) / 1000;
}

export function trackDuration(track: Track): number {
  return track.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}

export function getTrack(project: AIEDITINGProject, trackId: string): Track {
  const track = project.tracks.find(item => item.id === trackId);
  if (!track) throw new Error(`track not found: ${trackId}`);
  return track;
}

export function getClip(project: AIEDITINGProject, clipId: string): {track: Track; clip: Clip} {
  for (const track of project.tracks) {
    const clip = track.clips.find(item => item.id === clipId);
    if (clip) return {track, clip};
  }
  throw new Error(`clip not found: ${clipId}`);
}

export function addTrack(project: AIEDITINGProject, input: NewTrack): Track {
  const track = trackSchema.parse({
    id: input.id ?? newId('track'),
    name: input.name,
    type: input.type,
    index: input.index ?? project.tracks.length,
    clips: [],
  });
  project.tracks.push(track);
  project.updatedAt = new Date().toISOString();
  return track;
}

export function removeTrack(project: AIEDITINGProject, trackId: string): void {
  const index = project.tracks.findIndex(track => track.id === trackId);
  if (index < 0) throw new Error(`track not found: ${trackId}`);
  project.tracks.splice(index, 1);
  project.updatedAt = new Date().toISOString();
}

export function ensureTrack(project: AIEDITINGProject, type: TrackType, name?: string): Track {
  const existing = project.tracks
    .filter(track => track.type === type)
    .sort((a, b) => a.index - b.index)[0];
  return existing ?? addTrack(project, {type, name});
}

export function addClip(project: AIEDITINGProject, trackId: string, input: NewClip): Clip {
  const track = getTrack(project, trackId);
  const start = input.start ?? trackDuration(track);
  if (start < 0) throw new Error('clip start must be >= 0');
  const clip = clipSchema.parse({
    ...input,
    id: input.id ?? newId('clip'),
    start,
    transform: input.transform ?? {},
    effects: input.effects ?? [],
    animations: input.animations ?? [],
    engineMetadata: input.engineMetadata ?? {},
  });
  track.clips.push(clip);
  sortTrack(track);
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function removeClip(project: AIEDITINGProject, clipId: string): Clip {
  const {track, clip} = getClip(project, clipId);
  track.clips = track.clips.filter(item => item.id !== clipId);
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function moveClip(project: AIEDITINGProject, clipId: string, start: number): Clip {
  if (!Number.isFinite(start) || start < 0) throw new Error('start must be a finite number >= 0');
  const {track, clip} = getClip(project, clipId);
  clip.start = start;
  sortTrack(track);
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function trimClip(
  project: AIEDITINGProject,
  clipId: string,
  bounds: {start?: number; end?: number},
): Clip {
  const {clip} = getClip(project, clipId);
  const oldEnd = clipEnd(clip);
  const nextStart = bounds.start ?? clip.start;
  const nextEnd = bounds.end ?? oldEnd;
  if (nextStart < 0) throw new Error('start must be >= 0');
  if (nextEnd <= nextStart) throw new Error('end must be greater than start');
  const head = nextStart - clip.start;
  const tail = oldEnd - nextEnd;
  if (head < 0 || tail < 0) throw new Error('trim bounds must stay inside the clip');
  if (clip.in != null && head > 0) clip.in += head * clip.speed;
  clip.start = nextStart;
  clip.duration = nextEnd - nextStart;
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function splitClip(project: AIEDITINGProject, clipId: string, at: number): [Clip, Clip] {
  const {track, clip} = getClip(project, clipId);
  const end = clipEnd(clip);
  if (at <= clip.start || at >= end) throw new Error('split point must be inside the clip');
  const leftDuration = at - clip.start;
  const rightDuration = end - at;
  const right = clipSchema.parse({
    ...structuredClone(clip),
    id: newId('clip'),
    start: at,
    duration: rightDuration,
    in: clip.in != null ? clip.in + leftDuration * clip.speed : clip.in,
    out: clip.out != null ? clip.out : undefined,
    transitionOut: clip.transitionOut,
  });
  clip.duration = leftDuration;
  clip.transitionOut = undefined;
  track.clips.push(right);
  sortTrack(track);
  project.updatedAt = new Date().toISOString();
  return [clip, right];
}

export function changeSpeed(project: AIEDITINGProject, clipId: string, speed: number): Clip {
  if (!Number.isFinite(speed) || speed < 0.1 || speed > 10) throw new Error('speed must be between 0.1 and 10');
  const {clip} = getClip(project, clipId);
  const sourceDuration = clip.duration * clip.speed;
  clip.speed = speed;
  clip.duration = Math.round((sourceDuration / speed) * 1000) / 1000;
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function addTransition(
  project: AIEDITINGProject,
  clipId: string,
  transition: NonNullable<Clip['transitionOut']>,
): Clip {
  const {track, clip} = getClip(project, clipId);
  if (!['video', 'image', 'color', 'composition', 'overlay'].includes(clip.type)) {
    throw new Error('transitions are only supported on visual clips');
  }
  if (transition.duration >= clip.duration) throw new Error('transition must be shorter than the clip');
  clip.transitionOut = transition;
  const next = [...track.clips].sort((a, b) => a.start - b.start).find(item => item.start >= clipEnd(clip) - transition.duration - 0.001 && item.id !== clip.id);
  if (next && next.start >= clipEnd(clip) - 0.001) {
    const shift = clipEnd(clip) - transition.duration - next.start;
    const later = track.clips.filter(item => item.start >= next.start);
    for (const item of later) item.start = Math.max(0, item.start + shift);
    sortTrack(track);
  }
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function addEffect(project: AIEDITINGProject, clipId: string, effect: Effect): Clip {
  const {clip} = getClip(project, clipId);
  clip.effects.push(effect);
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function removeEffect(project: AIEDITINGProject, clipId: string, index: number): Effect | undefined {
  const {clip} = getClip(project, clipId);
  const [removed] = clip.effects.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  return removed;
}

export function setTransform(project: AIEDITINGProject, clipId: string, patch: Partial<Transform>): Clip {
  const {clip} = getClip(project, clipId);
  clip.transform = {...clip.transform, ...patch};
  project.updatedAt = new Date().toISOString();
  return clip;
}

export function addText(
  project: AIEDITINGProject,
  input: {
    trackId?: string;
    text: string;
    start: number;
    duration: number;
    style?: Record<string, unknown>;
    transform?: Partial<Transform>;
  },
): Clip {
  const track = input.trackId ? getTrack(project, input.trackId) : ensureTrack(project, 'text', 'Text');
  if (track.type !== 'text') throw new Error('text clips need a text track');
  return addClip(project, track.id, {
    type: 'text',
    start: input.start,
    duration: input.duration,
    text: {content: input.text, style: input.style},
    transform: input.transform,
  } as NewClip);
}

export function addSubtitle(
  project: AIEDITINGProject,
  input: {
    trackId?: string;
    text: string;
    start: number;
    duration: number;
    style?: Record<string, unknown>;
  },
): Clip {
  const track = input.trackId ? getTrack(project, input.trackId) : ensureTrack(project, 'subtitle', 'Subtitles');
  if (track.type !== 'subtitle') throw new Error('subtitle clips need a subtitle track');
  return addClip(project, track.id, {
    type: 'subtitle',
    start: input.start,
    duration: input.duration,
    subtitle: {content: input.text, style: input.style},
    transform: {x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 1},
  } as NewClip);
}

export function setKeyframe(
  project: AIEDITINGProject,
  clipId: string,
  property: AnimationTrack['property'],
  frame: {time: number; value: number; easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step'},
): AnimationTrack {
  const {clip} = getClip(project, clipId);
  let animation = clip.animations.find(item => item.property === property);
  if (!animation) {
    animation = {property, keyframes: []};
    clip.animations.push(animation);
  }
  const keyframe = {time: frame.time, value: frame.value, easing: frame.easing ?? 'linear'};
  const existing = animation.keyframes.findIndex(item => Math.abs(item.time - frame.time) < 0.0005);
  if (existing >= 0) animation.keyframes[existing] = keyframe;
  else animation.keyframes.push(keyframe);
  animation.keyframes.sort((a, b) => a.time - b.time);
  project.updatedAt = new Date().toISOString();
  return animation;
}

export function reorderClips(project: AIEDITINGProject, trackId: string, orderedIds: string[]): Track {
  const track = getTrack(project, trackId);
  if (orderedIds.length !== track.clips.length) throw new Error('orderedIds must contain every clip in the track');
  const map = new Map(track.clips.map(clip => [clip.id, clip]));
  let cursor = 0;
  track.clips = orderedIds.map((id, index) => {
    const clip = map.get(id);
    if (!clip) throw new Error(`unknown clip ${id}`);
    const next = {...clip, start: cursor};
    cursor += next.duration;
    return next;
  });
  project.updatedAt = new Date().toISOString();
  return track;
}

export function sortTrack(track: Track): Track {
  track.clips.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return track;
}

export function timelineSummary(project: AIEDITINGProject) {
  return {
    id: project.id,
    name: project.name,
    duration: projectDuration(project),
    resolution: {width: project.settings.width, height: project.settings.height},
    fps: project.settings.fps,
    tracks: project.tracks.map(track => ({
      id: track.id,
      name: track.name ?? track.type,
      type: track.type,
      clips: track.clips.length,
      duration: trackDuration(track),
    })),
    assets: project.assets.length,
  };
}
