import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneProps, Theme} from './types';

const font = (theme: Theme) => `"${theme.font}", "Segoe UI", system-ui, sans-serif`;

function Backdrop({theme, width, height}: {theme: Theme; width: number; height: number}) {
  const u = Math.min(width, height) / 1080;
  return (
    <AbsoluteFill style={{background: theme.bg, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `radial-gradient(60% 70% at 15% 12%, ${theme.accent}44 0%, transparent 62%), radial-gradient(50% 60% at 88% 82%, ${theme.accent2}33 0%, transparent 64%), linear-gradient(140deg, #000 0%, ${theme.bg} 55%, ${theme.accent}22 100%)`}} />
      <AbsoluteFill style={{opacity: 0.12, backgroundImage: `linear-gradient(${theme.fg}44 1px, transparent 1px), linear-gradient(90deg, ${theme.fg}44 1px, transparent 1px)`, backgroundSize: `${86 * u}px ${86 * u}px`, transform: 'perspective(900px) rotateX(58deg) translateY(18%)', maskImage: 'radial-gradient(closest-side, #000 30%, transparent 78%)'}} />
      <div style={{position: 'absolute', width: 520 * u, height: 520 * u, borderRadius: 999, background: theme.accent, filter: `blur(${70 * u}px)`, opacity: 0.32, top: -0.08 * height, right: 0.06 * width}} />
      <div style={{position: 'absolute', width: 420 * u, height: 420 * u, borderRadius: 999, background: theme.accent2, filter: `blur(${70 * u}px)`, opacity: 0.2, bottom: -0.12 * height, left: 0.02 * width}} />
    </AbsoluteFill>
  );
}

function Eyebrow({text, theme, u}: {text: string; theme: Theme; u: number}) {
  return <div style={{display: 'flex', alignItems: 'center', gap: 14 * u, color: theme.accent2, fontSize: 24 * u, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase'}}><span style={{width: 38 * u, height: 2, background: theme.accent2, opacity: 0.8}} />{text}</div>;
}

export function Scene({template, duration, width, height, theme, data}: SceneProps) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const enter = spring({frame, fps, config: {damping: 200, mass: 0.6}, durationInFrames: Math.round(Math.min(45, duration * fps * 0.5))});
  const fade = interpolate(frame, [0, 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  if (template === 'stat') {
    const raw = String(data.value ?? '0');
    const numeric = Number(raw.replace(/[^\d.]/g, ''));
    const number = Number.isFinite(numeric) && numeric > 0 ? interpolate(enter, [0, 1], [0, numeric]) : 0;
    const shown = Number.isFinite(numeric) && numeric > 0 ? Math.round(number).toString() : raw;
    return (
      <AbsoluteFill style={{fontFamily: font(theme), color: theme.fg}}>
        <Backdrop theme={theme} width={width} height={height} />
        <div style={{position: 'absolute', inset: 0, padding: `${92 * u}px ${112 * u}px`, display: 'flex', flexDirection: 'column'}}>
          <div style={{opacity: fade, marginTop: 6 * u}}><Eyebrow text={data.eyebrow ?? 'VERİ'} theme={theme} u={u} /></div>
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 * u}}>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 16 * u}}>
              {data.prefix ? <span style={{fontSize: 74 * u, color: theme.accent2, fontWeight: 500}}>{data.prefix}</span> : null}
              <span style={{fontSize: 300 * u, lineHeight: 0.9, fontWeight: 800, letterSpacing: '-0.06em', background: `linear-gradient(120deg, ${theme.fg}, ${theme.accent} 62%, ${theme.accent2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', transform: `translateY(${(1 - enter) * 30 * u}px)`, opacity: enter}}>{shown}</span>
              {data.suffix ? <span style={{fontSize: 80 * u, color: theme.muted, fontWeight: 500}}>{data.suffix}</span> : null}
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 20 * u, opacity: enter}}>
              <span style={{width: 120 * u, height: 5 * u, borderRadius: 99, background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`}} />
              <span style={{fontSize: 35 * u, color: theme.fg, fontWeight: 500}}>{data.label ?? ''}</span>
            </div>
            {data.note ? <div style={{fontSize: 25 * u, color: theme.muted, opacity: fade, maxWidth: 1100 * u}}>{data.note}</div> : null}
          </div>
          <div style={{fontSize: 18 * u, color: theme.muted, letterSpacing: '0.18em', opacity: 0.7}}>REMOTION</div>
        </div>
      </AbsoluteFill>
    );
  }

  if (template === 'engines') {
    const items = data.items ?? [];
    const columns = width < height ? 1 : 2;
    return (
      <AbsoluteFill style={{fontFamily: font(theme), color: theme.fg}}>
        <Backdrop theme={theme} width={width} height={height} />
        <div style={{position: 'absolute', inset: 0, padding: `${86 * u}px ${104 * u}px`, display: 'flex', flexDirection: 'column'}}>
          <div style={{opacity: fade, marginBottom: 26 * u}}><Eyebrow text={data.eyebrow ?? 'MOTORLAR'} theme={theme} u={u} /></div>
          <div style={{fontSize: 66 * u, fontWeight: 760, letterSpacing: '-0.04em', opacity: enter, marginBottom: 34 * u}}>{data.title ?? ''}</div>
          <div style={{flex: 1, display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 20 * u, alignContent: 'center'}}>
            {items.map((item: any, index: number) => {
              const s = spring({frame: frame - 10 - index * 7, fps, config: {damping: 18, mass: 0.7}});
              return <div key={item.name} style={{border: `1px solid ${theme.fg}20`, borderRadius: 20 * u, padding: `${26 * u}px ${30 * u}px`, background: `${theme.bg}99`, opacity: s, transform: `translateY(${(1 - s) * 26 * u}px)`, display: 'flex', flexDirection: 'column', gap: 10 * u}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 14 * u}}><span style={{width: 12 * u, height: 12 * u, borderRadius: 99, background: item.color ?? theme.accent, boxShadow: `0 0 24px ${item.color ?? theme.accent}`}} /><span style={{fontSize: 38 * u, fontWeight: 680, letterSpacing: '-0.02em'}}>{item.name}</span></div>
                <div style={{fontSize: 24 * u, color: theme.muted, lineHeight: 1.35}}>{item.note}</div>
              </div>;
            })}
          </div>
          <div style={{fontSize: 18 * u, color: theme.muted, letterSpacing: '0.18em', opacity: 0.7}}>REMOTION</div>
        </div>
      </AbsoluteFill>
    );
  }

  const items = data.items ?? [];
  return (
    <AbsoluteFill style={{fontFamily: font(theme), color: theme.fg}}>
      <Backdrop theme={theme} width={width} height={height} />
      <div style={{position: 'absolute', inset: 0, padding: `${92 * u}px ${112 * u}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <div style={{opacity: fade, marginBottom: 22 * u}}><Eyebrow text={data.eyebrow ?? 'ADIMLAR'} theme={theme} u={u} /></div>
        <div style={{fontSize: 62 * u, fontWeight: 760, letterSpacing: '-0.04em', opacity: enter, marginBottom: 36 * u}}>{data.title ?? ''}</div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 16 * u}}>
          {items.map((item: string, index: number) => {
            const s = spring({frame: frame - 12 - index * 8, fps, config: {damping: 18, mass: 0.7}});
            return <div key={item} style={{display: 'flex', gap: 24 * u, alignItems: 'baseline', opacity: s, transform: `translateX(${(1 - s) * -22 * u}px)`}}><span style={{fontSize: 24 * u, color: theme.accent2, fontFamily: '"Cascadia Mono", Consolas, monospace'}}>{String(index + 1).padStart(2, '0')}</span><span style={{fontSize: 34 * u}}>{item}</span></div>;
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
