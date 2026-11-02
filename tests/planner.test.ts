import {describe, expect, it} from 'vitest';
import {planBrief, type PlannedScene, type VideoBrief} from '@aiediting/planner';

describe('planner', () => {
  it('builds default scenes that sum to the requested duration', () => {
    const brief: VideoBrief = {
      title: 'Explainer',
      prompt: 'An AI editing framework that agents can drive through MCP. It plans, edits and renders.',
      duration: 30,
    };
    const result = planBrief(brief);
    expect(result.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.project.name).toBe('Explainer');
    const sum = result.scenes.reduce((value, scene) => value + scene.duration, 0);
    expect(Math.abs(sum - brief.duration)).toBeLessThanOrEqual(0.35);
    expect(projectLength(result)).toBeGreaterThanOrEqual(brief.duration);
  });

  it('honors explicit scenes and writes captions as subtitle cues', () => {
    const scenes: PlannedScene[] = [
      {heading: 'Intro', body: 'Welcome to the demo.', duration: 5, tone: 'intro'},
      {heading: 'Demo', body: 'Editing with agents.', duration: 5, tone: 'body'},
    ];
    const brief: VideoBrief = {
      title: 'Demo',
      prompt: 'Agent editing demo',
      duration: 10,
      fps: 30,
      scenes,
      captions: [
        {start: 0, end: 2, text: 'Hero intro'},
        {start: 2, end: 4, text: 'Agent at work'},
      ],
    };
    const result = planBrief(brief);
    expect(result.scenes).toEqual(scenes);
    const subtitleTrack = result.project.tracks.find(track => track.type === 'subtitle');
    expect(subtitleTrack?.clips).toHaveLength(2);
    expect(subtitleTrack?.clips[0]?.subtitle?.content).toBe('Hero intro');
  });

  it('validates brief inputs', () => {
    expect(() => planBrief({title: '', prompt: 'x', duration: 10})).toThrow(/title/);
    expect(() => planBrief({title: 't', prompt: 'p', duration: 0})).toThrow(/duration/);
    expect(() => planBrief({
      title: 't',
      prompt: 'p',
      duration: 10,
      scenes: [{heading: 'one', duration: 4}],
    })).toThrow(/sum to 4/);
  });
});

function projectLength(result: ReturnType<typeof planBrief>): number {
  let end = 0;
  for (const track of result.project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration);
  }
  return Math.round(end * 1000) / 1000;
}
