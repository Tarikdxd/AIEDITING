# AIEDITING

**AI-native video editing, drivable end-to-end.** One canonical project format, a set of rendering engines behind one router, and two transports (MCP + CLI) that agents can drive without a human in the loop.

- **Project format** — [`aiediting.project.json`](docs/PROJECT_FORMAT.md) with a strict JSON schema (`schema/aiediting.project.schema.json`)
- **Engines** — FFmpeg (backbone), HyperFrames, Remotion, Motion Canvas, StykAnimate, Blender, MoneyPrinterTurbo adapter (see [ADAPTERS](docs/ADAPTERS.md))
- **MCP server** — 32 tools over stdio (see [MCP](docs/MCP.md)) 
- **CLI** — `aiediting` for humans and scripts (see [CLI](docs/CLI.md))
- **Skills** — prompt-ready guides in `skills/*/SKILL.md` (editing, cinematic, social, youtube, motion-graphics, 3d, subtitles, audio, workflow, …)

## Quick start

```powershell
corepack pnpm install
aiediting init demo --name demo
aiediting media import my.mp4 --dir demo
aiediting plan demo --title "Hello" --prompt "one idea per scene" --duration 30
aiediting render demo --preview
aiediting verify demo/renders/*.mp4
```

Or as an agent through MCP:

```
node packages/mcp-server/src/bin.ts   # aiediting mcp
```

| Command | Without args | 
|---|---|
| `create_project` | 4 default tracks (video/audio/text/subtitle) |
| `render_video` | blocks until done, **ffprobe-verified** answer |
| `render_status` | reads persisted `renders/jobs/*.json` |

## Security & verification

- Every render claim is backed by an ffprobe of the actual file; failures return `{status:'failed', error}` instead of a protocol error.
- Project-relative paths are resolved with a path guard; project files never execute code.
- Vendored engine keys live outside the repo (git-ignored `vendor/`). See [SECURITY](docs/SECURITY.md).

## Docs

[ARCHITECTURE](docs/ARCHITECTURE.md) · [PROJECT_FORMAT](docs/PROJECT_FORMAT.md) · [ADAPTERS](docs/ADAPTERS.md) · [MCP](docs/MCP.md) · [CLI](docs/CLI.md) · [INSTALLATION](docs/INSTALLATION.md) · [CONTRIBUTING](docs/CONTRIBUTING.md) · [SECURITY](docs/SECURITY.md) · [ROADMAP](docs/ROADMAP.md) · [THIRD_PARTY_NOTICES](docs/THIRD_PARTY_NOTICES.md)

## Status

- Repo: `Tarikdxd/AIEDITING` (public).
- Node ≥ 22, pnpm ≥ 12, optional Python 3.11 for the MoneyPrinterTurbo engine.
