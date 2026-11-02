---
name: workflows
description: AIEDITING end-to-end workflows and house rules — the canonical pipelines for producing, reviewing and delivering any project type, plus delivery gates. Read this when orchestrating multi-skill work.
---

# AIEDITING: workflows

## Canonical pipeline

```
intake → plan/storyboard → import → edit → review → render → verify → deliver
```

1. **Intake**: decide format target (ratio, fps, duration), name the project dir, `create_project`.
2. **Plan**: `plan_video` (auto or explicit scenes) — sum-of-scene-durations ±0.35s enforced.
3. **Import**: every source via `import_media` (hash-deduped, probed). Tags for usage.
4. **Edit**: clips, trims, transitions, effects, text, subtitles, keyframes; engine scenes via `set_clip_renderer`.
5. **Review**: `render_video {preview:true}`; iterate. Read failures as `{status:'failed', error}` (protocol-level errors surface engine stderr).
6. **Render**: `render_video {outputPath}` — response comes back ffprobe-verified (`width/height/duration`).
7. **Verify**: `aiediting verify <file>` re-probes if the file moved; skip if you're the producer of the response in-step 6.
8. **Deliver**: report the *verified* facts (duration, resolution, path). Never claim passing without either (6) or (7).

## House rules

- One project dir = one piece. Siblings for variants, never subprojects inside `renders/`.
- Do not edit inside `vendor/` or `renders/jobs/`.
- Engine availability is always a query (`list_engines`), never an assumption.
- Renders write to `renders/<name>-<timestamp>[-preview].mp4`; `outputPath` respected when provided.
- Long-running jobs are blocking today; `render_status` reads persisted job records (`renders/jobs/*.json`).

## Failure playbook

- `mpt` → missing venv: run `scripts/setup-mpt.mjs`, re-check health.
- `styk` → network: it talks to app.stykanimate.com; explain and substitute.
- `blender` → not installed; set `AIEDITING_BLENDER` or substitute hyperframes.
- Engine scene fail → simplify props, re-check template names via `get_engine_capabilities`.
