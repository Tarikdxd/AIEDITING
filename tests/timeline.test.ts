import {describe, expect, it} from 'vitest';
import {createProject} from '@aiediting/core';
import {type AIEDITINGProject} from '@aiediting/project-schema';
import {
  addClip,
  addEffect,
  addSubtitle,
  addText,
  addTrack,
  addTransition,
  changeSpeed,
  clipEnd,
  moveClip,
  projectDuration,
  removeEffect,
  reorderClips,
  setKeyframe,
  setTransform,
  splitClip,
  trackDuration,
  trimClip,
} from '@aiediting/timeline';

function newProject(): {project: AIEDITINGProject; video: string; text: string; subtitles: string} {
  const project = createProject({name: 'timeline-test', duration: 30});
  const video = addTrack(project, {type: 'video', name: 'V', index: 0});
  const text = addTrack(project, {type: 'text', name: 'T', index: 1});
  const subtitles = addTrack(project, {type: 'subtitle', name: 'S', index: 2});
  return {project, video: video.id, text: text.id, subtitles: subtitles.id};
}

describe('timeline operations', () => {
  it('appends clips after the current track end by default', () => {
    const {project, video} = newProject();
    const first = addClip(project, video, {type: 'color', duration: 4, color: '#111111'});
    const second = addClip(project, video, {type: 'color', duration: 2, color: '#222222'});
    expect(first.start).toBe(0);
    expect(second.start).toBe(4);
    expect(trackDuration(project.tracks[0]!)).toBe(6);
    expect(projectDuration(project)).toBe(30); // settings duration acts as floor
  });

  it('trims within clip bounds and keeps source trim in sync', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 6, color: '#333333'});
    trimClip(project, clip.id, {start: 1, end: 4});
    expect(clip.start).toBe(1);
    expect(clip.duration).toBe(3);
    expect(() => trimClip(project, clip.id, {end: 0.5})).toThrow();
  });

  it('splits a clip into two adjacent halves', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 6, color: '#444444'});
    const [left, right] = splitClip(project, clip.id, 2.5);
    expect(left.duration).toBe(2.5);
    expect(right.start).toBe(2.5);
    expect(right.duration).toBe(3.5);
    expect(project.tracks[0]!.clips).toHaveLength(2);
  });

  it('moves clips and re-sorts the track', () => {
    const {project, video} = newProject();
    const a = addClip(project, video, {type: 'color', duration: 2, color: '#555555'});
    addClip(project, video, {type: 'color', duration: 2, color: '#666666'});
    moveClip(project, a.id, 5);
    const starts = project.tracks[0]!.clips.map(clip => clip.start);
    expect(starts).toEqual([2, 5]);
  });

  it('changes speed while preserving source length', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 4, color: '#777777'});
    changeSpeed(project, clip.id, 0.5);
    expect(clip.speed).toBe(0.5);
    expect(clip.duration).toBe(8);
    expect(() => changeSpeed(project, clip.id, 20)).toThrow();
  });

  it('collects keyframes sorted by time and dedupes timestamps', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 4, color: '#888888'});
    setKeyframe(project, clip.id, 'opacity', {time: 1, value: 0});
    setKeyframe(project, clip.id, 'opacity', {time: 3, value: 1, easing: 'ease-out'});
    const twice = setKeyframe(project, clip.id, 'opacity', {time: 1, value: 0.5});
    expect(twice.keyframes).toEqual([
      {time: 1, value: 0.5, easing: 'linear'},
      {time: 3, value: 1, easing: 'ease-out'},
    ]);
  });

  it('only allows transitions on visual clips and rejects impossible durations', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 4, color: '#999999'});
    addTransition(project, clip.id, {type: 'fade', duration: 0.5});
    expect(clip.transitionOut).toEqual({type: 'fade', duration: 0.5});
    expect(() => addTransition(project, clip.id, {type: 'fade', duration: 9})).toThrow();
  });

  it('adds and removes effects', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 2, color: '#aaaaaa'});
    addEffect(project, clip.id, {type: 'eq', contrast: 1, brightness: 0.05, saturation: 1, gamma: 1});
    expect(clip.effects).toHaveLength(1);
    expect(removeEffect(project, clip.id, 0)).toMatchObject({type: 'eq'});
    expect(clip.effects).toHaveLength(0);
  });

  it('creates text and subtitle clips with content payloads', () => {
    const {project, video, text, subtitles} = newProject();
    addClip(project, video, {type: 'color', duration: 4, color: '#bbbbbb'});
    const title = addText(project, {trackId: text, text: 'Hello', start: 1, duration: 2, style: {fontSize: 96}});
    expect(title.text?.content).toBe('Hello');
    const cue = addSubtitle(project, {text: 'hi', start: 1, duration: 2});
    expect(cue.subtitle?.content).toBe('hi');
    expect(project.tracks.find(track => track.id === text)?.clips).toHaveLength(1);
    expect(project.tracks.find(track => track.id === subtitles)?.clips).toHaveLength(1);
  });

  it('reorders clips resequencing from zero', () => {
    const {project, video} = newProject();
    const a = addClip(project, video, {type: 'color', duration: 2, color: '#cccccc'});
    const b = addClip(project, video, {type: 'color', duration: 3, color: '#dddddd'});
    const c = addClip(project, video, {type: 'color', duration: 1, color: '#eeeeee'});
    reorderClips(project, video, [c.id, a.id, b.id]);
    expect(project.tracks[0]!.clips.map(clip => clip.start)).toEqual([0, 1, 3]);
    expect(project.tracks[0]!.clips.map(clip => clip.id)).toEqual([c.id, a.id, b.id]);
  });

  it('patches transforms and exposes clip end helper', () => {
    const {project, video} = newProject();
    const clip = addClip(project, video, {type: 'color', duration: 2, color: '#ffffff'});
    setTransform(project, clip.id, {x: 0.5, scale: 1.2});
    expect(clip.transform.x).toBe(0.5);
    expect(clipEnd(clip)).toBe(2);
  });
});
