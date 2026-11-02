---
name: cinematic
description: AIEDITING cinematic look — pacing, pacing curves, letterboxing, color grade and audio bed choices for film-like pieces. Use when the user wants a cinematic/trailer-style video.
---

# AIEDITING: cinematic direction

## Recipe

1. **Plan** the beat structure: `plan_video {title, prompt, duration, scenes:[...]}` — scenes with `tone:'intro'|'body'|'outro'` map to hook/build/payoff.
2. **Pacing**: open long, tighten mid-section.
   - `analyze_media` each shot for scene cuts; reuse natural cut points as `trim_clip`/`move_clip` anchors.
   - Keep first shot ≥ 2.5s; mid-section cuts 1.0–1.8s.
3. **Grade**: `add_effect {type:'eq', contrast, brightness, saturation, gamma}` on every visual clip to lock a common curve (e.g. contrast 1.08, saturation 0.95, gamma 1.02). Then one unified `add_transition {type:'fade', duration:0.6}` out and fade-in via keyframes on intro opacity.
4. **Letterbox feel**: keep `settings.width/height` at 1920x1080 and let `add_effect {type:'vignette'}` do the framing.
5. **Sound**: put music on the Audio track with `volume` keyframes (`set_keyframe property:'volume'` dips for VO). Check final mix against `media analyze` loudness.

## Engine notes

- Keep the base composition on **ffmpeg** (deterministic, exact durations).
- A title beat: `set_clip_renderer {engine:'hyperframes', template:'title'}`.
- For slow vector reveals: `motion-canvas`.

## Checklist before render

- [ ] `validate_project` clean
- [ ] transitions ≤ clip durations
- [ ] subtitle track empty unless captions requested
- [ ] `render_video` → response states verified `duration` ≈ timeline length (± 0.5s)
