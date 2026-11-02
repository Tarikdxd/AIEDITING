# Installation

## Runtime

- Node ≥ 22 (`engines.node`) — 24.x used in development
- pnpm via corepack: `corepack enable && corepack pnpm --version`
- Optional: Python 3.11 for the MoneyPrinterTurbo engine (system python or `AIEDITING_PYTHON`)

## Setup

```powershell
git clone https://github.com/Tarikdxd/AIEDITING.git
cd AIEDITING
corepack pnpm install            # installs all workspaces; ffmpeg-static handled by allowBuild
corepack pnpm test               # 20 tests incl. a real ffmpeg render
corepack pnpm cli engines doctor # what's available on this machine
```

`ffmpeg`/`ffprobe` are provided by `@aiediting/media` via `ffmpeg-static`/`ffprobe-static` — no system install needed.

## Optional engines

| Engine | Setup |
|---|---|
| MoneyPrinterTurbo | `node scripts/setup-mpt.mjs` (clone→`vendor/MoneyPrinterTurbo`, pinned; config.toml; venv at `vendor/.mpt-venv`; pip install requirements) |
| HyperFrames | install the HyperFrames CLI |
| Remotion | install the Remotion CLI |
| Motion Canvas | install its node tooling |
| StykAnimate | network only (app.stykanimate.com) |
| Blender | install Blender; or `AIEDITING_BLENDER=C:\path\blender.exe` |

## Verify install

```powershell
aiediting engines doctor
aiediting init demo --name "smoke" --duration 6
aiediting render demo --preview
aiediting verify demo/renders/*.mp4
```

## Windows notes

- The repo is developed on Windows; paths are absolute-safe, but pass project dirs as plain args (no `~`).
- FFmpeg static: `node_modules\.pnpm\ffmpeg-static@*\node_modules\ffmpeg-static\ffmpeg.exe` when you call it manually.
