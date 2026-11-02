---
name: storyboarding
description: AIEDITING storyboarding — plan scene-by-scene structure, durations and engine assignments before touching footage. Use at kickoff or restructure time.
---

# AIEDITING: storyboarding

## When

First step of any produced piece (not one-shot social cuts). Produce a reviewable board, then implement.

## Steps

1. From the brief, write scenes with **duration sums = target length**: `plan_video {title, prompt, duration, scenes:[{heading, body, duration, tone}]}` (tolerance ±0.35s is enforced).
2. Review the result: each scene became a placeholder plate on the Primary track with a matching title clip. `inspect_project` shows the flattened timing.
3. Assign engines per scene where needed: `set_clip_renderer {clipId, engine, template, props}` — check `list_engines` availability first.
4. Iterate the board (cheap): `remove_clip`/`add_text`/`trim_clip` on plates; keep the timeline duration stable so downstream timing holds.
5. Sign-off: `render_video {preview:true}` — a fast animatic. Review with the user before footage import begins.

## Board hygiene

- Heading = what the shot *is*; body = what appears (copy, spoken line, on-screen text).
- Mark tone: intro / body / outro — the planner styled the first/last accordingly.
- Any clip you won't restyle is a legal fh placeholder: color plates render fine end-to-end.
