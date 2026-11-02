---
name: 3d-animation
description: AIEDITING 3D — Blender headless scene renders (titles, 3D elements) when a Blender install is present. Use when 3D text/objects are requested.
---

# AIEDITING: 3D via Blender

## Availability check (do this first)

`check_engine_health {id:'blender'}` — this machine may have none. Unavailable by default; install Blender or set `AIEDITING_BLENDER` to its path, then re-check. **Never assign blender scenes when health says unavailable** — the render returns `{status:'failed'}` with the reason, which is the correct failure mode.

## Usage when healthy

1. Reserve slot: `add_clip {type:'color', duration:4}`.
2. `set_clip_renderer {clipId, engine:'blender', template:'text3d', props:{text, colors, camera...}}`.
3. The adapter bakes a scene, renders PNG frames headless, and the ffmpeg backbone encodes your clip slot.

## Composite

3D element over footage: put the real footage under, reserve the slot above, keep props background transparent/solid per scene needs (`supportsAlpha:false` on this adapter — design behind it accordingly).

## Fallbacks

- No Blender + time pressure: `hyperframes` with big type and shadows reads convincingly for 3D-ish titles.
- Re-check health after installing anything new; report the health JSON back to the user.
