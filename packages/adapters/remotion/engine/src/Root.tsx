import React from 'react';
import {Composition} from 'remotion';
import {Scene} from './scenes';
import type {SceneProps} from './types';

const defaultProps: SceneProps = {
  template: 'stat',
  duration: 4,
  fps: 30,
  width: 1920,
  height: 1080,
  theme: {bg: '#08080d', fg: '#f7f7fb', muted: '#9a9ab0', accent: '#8b5cf6', accent2: '#22d3ee', font: 'Inter'},
  data: {eyebrow: 'VERİ', value: '1', label: 'brief, tek video'},
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Scene"
    component={Scene}
    durationInFrames={120}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={defaultProps}
    calculateMetadata={({props}) => ({
      durationInFrames: Math.max(1, Math.round(props.duration * props.fps)),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
);
