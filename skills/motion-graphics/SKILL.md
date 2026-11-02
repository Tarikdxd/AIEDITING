---
name: motion-graphics
description: AIEDITING motion graphics — engine-built animated scenes (HyperFrames/Remotion/Motion Canvas) composed into the project. Use for titles, stats, animated explains, kinetic type.
---

# AIEDITING: motion graphics

## Choose the engine per scene

| Need | Engine | Templates |
|---|---|---|
| HTML/CSS+GSAP layouts, titles, statements | **hyperframes** | `title`, `statement`, `bullets`, `end` |
| React data/stat scenes | **remotion** | `stat`, `engines`, `bullets` |
| Vector drawing/flow animation | **motion-canvas** | `flow` |

Call `list_engines` first; only assign engines reported `available: true`.

## Attach to a beat

1. Reserve a slot: `add_clip {trackId:'Primary', clip:{type:'color', duration:5, color:'#101014'}}`.
2. Point it at the engine: `set_clip_renderer {clipId, engine:'hyperframes', template:'title', props:{heading, sub, colors...}, options:{}}`.
   - `props` are engine-specific; when in doubt pass a `heading`/`body` plus duration-safe text lengths.
3. Compose: the render manager renders the scene, then the ffmpeg backbone composes it into the timeline at the clip's exact slot.

## Rhythm rules

- One idea per card; 3–6s each; 0.3–0.4s crossfades (`add_transition {type:'fade'}`).
- Animate entry via `set_keyframe {property:'scale'|'opacity'}` only when the card itself is static.
- Kill dead air: engine cards render headline text — keep `props.heading ≤ 60 chars`, `body ≤ 140`.

## Verify

`render_video` → expected engine listed as `engine:'ffmpeg'` (backbone) — per-scene renders are internal. If playback of an engine-scene fails, re-read `{status:'failed', error}` (contains the engine's stderr tail) and simplify props.
