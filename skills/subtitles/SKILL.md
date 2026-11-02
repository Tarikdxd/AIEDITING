---
name: subtitles
description: AIEDITING subtitles/captions — add, style, position and burn subtitle cues; SRT-style timing from asr/loudness analysis. Use when captions or subtitle files are involved.
---

# AIEDITING: subtitles

## Add cues

- `add_subtitle {text, start, duration}` — one clip per cue on the Subtitles track, burned in at render.
- From audio: `analyze_media {path}` gives silence spans; speech sits between silences. Split long text into ≤ 42-char cues spanning the non-silent windows.
- From SRT: parse timings and map to `start/duration` per cue.

## Style

`style {fontSize, color, backgroundOpacity, align, bold}` — defaults are bottom-centered; keep it that way for social, top (`position:'top'`) only when lower-third graphics collide.

## Engines that can generate their own

- **mpt** (MoneyPrinterTurbo) can burn subtitles inside its pipeline: `props.subtitleEnabled, subtitlePosition 'bottom'|'two_thirds_bottom'|'custom', fontSize`. Use when the whole short is mpt-rendered.
- Timeline-level styling wins elsewhere; never mix both systems in one render.

## QA pass

1. `validate_project` (cue overlaps are invisible there — check starts: `start[i] ≥ start[i-1]+duration[i-1]`).
2. `render_video {preview:true}`, eyeball a frame near a dense caption beat.
3. Final: `render_video` → verified response, then `aiediting verify <file>`.
