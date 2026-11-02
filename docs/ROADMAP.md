# Roadmap

Done in this initial build:

- [x] Canonical project format + strict JSON schema (zod-cross-validated, JSON schema published)
- [x] Core editing ops (trim/split/move/speed/reorder/transitions/effects/text/subtitles/keyframes/transform)
- [x] Media layer: oauth-style probing, thumbnails, silence/scene-cut analysis, loudness
- [x] Asset manager with hash dedupe
- [x] Planner (`planBrief` deterministic; `planWithLlm` hook)
- [x] RenderManager: engine-scene preprocessing → ffmpeg compose → **ffprobe verification**
- [x] 7 engine adapters (ffmpeg, hyperframes, remotion, motion-canvas, styk, blender, mpt) + default registry
- [x] MCP server (32 tools, stdio) + `aiediting` CLI on shared tool implementations
- [x] 14 skills for agent driving styles
- [x] MoneyPrinterTurbo vendored + pinned + venv bootstrap script

## Next candidates (in workflow order)

- [ ] **Cancel/tabbed renders** — real cancellation via job cancellation token; concurrent render queue with progress streaming
- [ ] **Plan with LLM by default** — model-agnostic prompt call (planner hook already in place), fallback to determinist planner
- [ ] **Timeline markers & nested compositions** over `compositions[]` (schema already reserves it)
- [ ] **Subtitle import (SRT/VTT)** tool + exporters
- [ ] **OAuth Asset storage backends** (S3/CDN) behind the media package
- [ ] **Recorder**: browser + screen capture ingest skill for agents to source their own footage
- [ ] **Web UI review pane** for humans to approve animatics (`playwright` already available in `@aiediting/browser`)
- [ ] **CI**: GitHub Actions matrix (win/linux) running typecheck + vitest + engine doctor
- [ ] **English i18n pass** of planner default scene labels (currently Turkish defaults in `planBrief`)
