---
name: editing
description: AIEDITING editing workflow — build or edit a video timeline from a brief or raw footage, then render and verify. Use when the user wants to cut, assemble, retime, subtitle or polish a video with the aiediting project (MCP tools or the aiediting CLI).
---

# AIEDITING: core editing

Your job: turn an intent (brief, footage, or script) into a **verified rendered video** using the AIEDITING project format. One project file, many engines.

## Ground rules

1. Work in one directory per project: it holds `aiediting.project.json`, `assets/`, `renders/`.
2. Open or create the project first; every other call assumes it is open.
3. Render **always replies with ffprobe-verified output** (duration/resolution/size). Never claim a video exists without that response or a `aiediting verify`.

## Workflow (MCP)

1. `create_project {dir, name, width, height, fps}` — creates default tracks: Primary (video), Audio, Titles, Subtitles.
2. `import_media {path, tags}` for every source file. It probes and dedupes; returned `id` is the assetId.
3. `add_clip {trackId:'Primary', clip:{type:'video', assetId, duration}}` — clips append to the track end by default.
4. Shape (each step returns the updated project):
   - `trim_clip {clipId, start, end}` / `split_clip {clipId, at}` / `move_clip {clipId, start}`
   - `change_speed {clipId, speed}` (0.1–10)
   - `add_transition {clipId, type:'fade'|'dissolve'|'wipe*', duration:0.5}`
   - `add_effect {clipId, effect:{type:'eq'|'blur'|'sharpen'|'vignette'|'hue'|'chromakey', ...}}`
   - `add_text` / `add_subtitle` for titles and captions (`style` free-form; keep it minimal)
   - `set_keyframe {clipId, property:'opacity'|'x'|'y'|'scale'|'rotation'|'volume', time, value}`
5. Before rendering: `validate_project` — fix every error-severity issue.
6. `render_video {outputPath}` (or `{preview:true}` for a fast low-res check). Success response includes `outputPath, width, height, duration`.

## Workflow (CLI, same machinery)

```
aiediting init demo --name demo
aiediting media import footage.mp4 --dir .
aiediting media analyze footage.mp4       # loudness, silences, scene cuts
aiediting timeline .                       # inspect
aiediting validate .                       # aiediting project validate .
aiediting render . --out dist/final.mp4
aiediting verify dist/final.mp4
```

## Engine routing

- Default timeline → **ffmpeg** (always available, deterministic).
- Motion graphic scenes → `set_clip_renderer {engine:'hyperframes'|'remotion'|'motion-canvas'}` per clip.
- Always run `list_engines` first; some engines are missing offline (blender, mpt, styk may be unavailable). Never assign a clip to an unavailable engine — the render will return `{status:'failed', error}`.

## Gotchas

- `add_clip` needs `assetId` for video/image/audio; `type:'text'` needs `text` (use `add_text`); `type:'color'` needs `color`.
- Text/subtitle clips must live on tracks of type text/subtitle.
- Transitions must be shorter than the clip.
- If render fails, `render_status` shows the persisted job record in `renders/jobs/`.
