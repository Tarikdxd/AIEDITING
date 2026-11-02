---
name: 2d-animation
description: AIEDITING 2D animation — stick-figure/character animation via StykAnimate, vector flow via Motion Canvas, HTML layers via HyperFrames. Use for animated explainers or character bits.
---

# AIEDITING: 2D animation

## Character animation — StykAnimate (`styk`)

- Renders through app.stykanimate.com in a headless browser; needs network.
- Per clip: `set_clip_renderer {clipId, engine:'styk', template:'clip', props:{...action/pose/state...}}`.
- Output is normalized (WebM export → mp4) with the ffmpeg backbone; alpha is handled internally.
- If unavailable (offline), say so plainly and pick `motion-canvas` or `hyperframes` instead — never fake it.

## Vector flow — Motion Canvas (`motion-canvas`)

- Template `flow`. Good for arrows, diagrams, path reveals.
- Keep scene durations matched to the reserved clip duration exactly; the compositor cuts to the clip.

## Layered scenes — HyperFrames (`hyperframes`)

- `statement` / `bullets` read great over flat color plates.
- Compose on `color` clip plates, engine scene above it via the clip renderer.

## Composition pattern

```
add_clip (color plate, 6s)            → Primary
add_clip reserved engine scene        → Primary (or overlay track)
set_clip_renderer {engine, template, props}
add_transition {type:'fade', duration:0.3}
```

## Ship

`validate_project` → `render_video` → verified result. Engine stderr shows on failure; reduce props complexity first.
