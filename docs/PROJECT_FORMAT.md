# The project format

One file describes a whole video: **`aiediting.project.json`** (canonical name, strict schema — see [`schema/aiediting.project.schema.json`](../schema/aiediting.project.schema.json)).

## Top level

```jsonc
{
  "version": "1.0.0",
  "id": "project_<uuid>",
  "name": "my video",
  "createdAt": "…", "updatedAt": "…",
  "settings": { "width": 1920, "height": 1080, "fps": 30, "duration": 60, "colorSpace": "srgb", "background": "#000000" },
  "tracks": [ /* ordered by index */ ],
  "assets": [ /* hash-deduped media imports */ ],
  "compositions": []
}
```

## Track types

`video · audio · text · subtitle · overlay`

## Clip kinds

`video · image · audio · text · subtitle · color · composition`

Common fields: `id, type, start, duration, in?, out?, speed` plus:

- **visual**: `transform {x,y,scale,rotation,opacity,anchorX,anchorY}` (normalized 0–1 coords), `effects[]`, `animations[]` (keyframes on opacity/x/y/scale/rotation/volume), `transitionOut {type,duration}`, `fit 'cover'|'contain'`
- **`text`**: `text {content, style {fontSize,color,align,bold,italic,lineHeight,strokeWidth,strokeColor,backgroundOpacity,fontFamily}}`
- **`subtitle`**: `subtitle {content, style}`
- **`color`**: `color '#rrggbb'`
- **engine-rendered**: `renderer {engine, template, props, options}` — RenderManager renders this scene, then composes.

## Assets

Imported only by `import_media` — copies into the project `assets/` folder, records probe results (`duration, width, height, codecs, channels`) and a content **hash**; re-imports dedupe to the same id.

## Frames of reference

- `start/duration` are **timeline seconds**.
- `in/out` are **source seconds** for the media's own stream.
- `x/y` are normalized (0 = left/top, 1 = right/bottom of frame).

## Never curated by hand

Produce files through the MCP tools or `aiediting` CLI. Both save atomically (tmp + rename) only after validation passes, and `validate_project` explains any schema issue with issue paths.
