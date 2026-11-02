# Engines / adapters

Same adapter SDK, per engine. Query availability — nothing is assumed installed.

| id | What it is | Needs | License |
|---|---|---|---|
| `ffmpeg` | Backbone compositor & encoder; renders the canonical project timeline (xfade, drawtext, ASS subtitles, audio mix, loudnorm) | none (bundled static build) | LGPL-2.1-or-later (build-dependent) |
| `hyperframes` | HTML/CSS + GSAP scenes via the official HyperFrames CLI | HyperFrames CLI on PATH | Apache-2.0 |
| `remotion` | React scenes via the official Remotion CLI | Remotion CLI | Remotion license (commercial terms) |
| `motion-canvas` | Vector 2D animation via the official Motion Canvas renderer (vite + `?render`, ffmpeg exporter) | node | MIT |
| `styk` | 2D/character animation driven through app.stykanimate.com in a headless browser | network | GPL-3.0 (separate application) |
| `blender` | Headless scene → PNG frames → encode (template `text3d`) | Blender install or `AIEDITING_BLENDER` | GPL-3.0-or-later |
| `mpt` | MoneyPrinterTurbo: script → TTS → subtitles → materials → finished short | Python 3.11 venv, vendored clone | MIT (upstream), see THIRD_PARTY_NOTICES |

## Querying

```
aiediting engines doctor              # CLI: ok/missing + reasons per engine
list_engines                          # MCP: capabilities + availability
check_engine_health {id:'remotion'}
get_engine_capabilities {id:'mpt'}
```

## Assigning an engine to a clip

```
set_clip_renderer {clipId, engine:'hyperframes', template:'title', props:{...}}
```

On render: engine renders the scene, the ffmpeg backbone composes + encodes the project. Engine stderr lands in the failure payload (render/`{status:'failed', error}`) — never in an exception.

## MoneyPrinterTurbo setup

```powershell
node scripts/setup-mpt.mjs   # clones (pinned revision) → vendor/MoneyPrinterTurbo
                             # writes config.toml from config.example.toml
                             # creates vendor/.mpt-venv (Python 3.11) + pip install -r requirements.txt
```

Adapter maps `scene.props` onto the upstream CLI (`--stop-at video`): `script|subject`, `language`, `materials` (local assets, absolute + guarded), `voiceName` (`no-voice` supported), `subtitleEnabled/…`, `bgm*`, `clipDuration/clipSpeed`, `transitionMode`, `fitMode`. Output is copied to the requested path and ffprobe-verified like any other engine.

Everything under `vendor/` is ignored by git; upstream code is never copied into this repo.
