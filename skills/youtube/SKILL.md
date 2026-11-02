---
name: youtube
description: AIEDITING YouTube longform — 16:9 explainer/tutorial build with chapters, B-roll, title cards and subtitle polish. Use when the user's target is YouTube.
---

# AIEDITING: YouTube longform

## Project

`create_project {dir, name, width:1920, height:1080, fps:30}` — 16:9.

## Structure

1. **Chapter the brief** with `plan_video` and explicit `scenes` (each ≤ 60s, durations must sum to the target length — the planner enforces ±0.35s).
2. **Intro ≤ 20s**: problem + promise. Titles on `hyperframes` `title`/`statement` templates.
3. **Body chapters**: talking head / screen capture / B-roll. `media analyze` scans for silence (tighten) and scene cuts (clean cut points).
4. **Outro ≤ 15s**: summary + next-video card (`hyperframes` `end` or `remotion` `bullet`).

## Text & subtitles

- Chapter titles: `add_text` big center, 2–4s each.
- Spoken narration: full `add_subtitle` pass (bottom, `style {align:'center'}` default is fine).
- Lower thirds for speakers: `add_text {y:0.3}` with keyframed opacity in/out.

## Safety checks

- `list_engines` before assigning any non-ffmpeg scene (offline machines lack blender/mpt/styk).
- Loudness analysis on the final mix; YouTube normalizes to −14 LUFS — aim there.
- `render_video`, then confirm response `duration` ≈ planned length and `outputPath` lives inside the project dir.
