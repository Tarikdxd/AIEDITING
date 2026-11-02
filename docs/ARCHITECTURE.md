# AIEDITING — Architecture

Monorepo (pnpm workspaces). TypeScript sources are consumed directly via tsx (`exports.map` points at `./src/index.ts`); `tsup build` scripts exist but are optional.

## Layers

```
apps/cli            ── aiediting CLI (bin.mjs → src/index.ts main())
packages/mcp-server ── thin stdio wrapper (@modelcontextprotocol/sdk)
packages/mcp-tools  ── 32 shared tools (the CLI calls the same ToolSpecs)
packages/agent-runtime ─ high-level AgentRuntime facade
──────────────────────────────────────────────────────────────────
packages/core       ─ project open/save/inspect (writes guarded, atomic)
packages/project-schema ─ zod schema + JSON schema + validation
packages/timeline   ─ add/trim/split/move/speed/keyframes/reorder/transitions
packages/media      ─ ffmpeg/ffprobe wrappers (ffmpeg-static), inspect/thumbs/analyze
packages/asset-manager ─ hash-deduped asset import into assets/
packages/planner    ─ planBrief (scene plates, captions); planWithLlm hook
packages/renderer   ─ RenderManager: engine scenes → ffmpeg compose → ffprobe verify
packages/engines    ─ default registry wiring all adapters
packages/adapters/* ─ per-engine adapters implementing the adapter SDK
```

## Data flow

1. `plan_video`/editing tools mutate an **in-memory project** persisted to `aiediting.project.json` (atomic write: tmp file + rename after validation).
2. On `render_video`, RenderManager:
   - walks the timeline, resolving each clip to `engine scene renders` (via the clip's `renderer` hint if any) or plain ffmpeg primitives;
   - composes the full track graph onto one canvas;
   - **verifies** the output with ffprobe (container, codecs, duration) before answering.
3. Job records persist to `renders/jobs/<id>.json` for `render_status`.

## Engine routing

`@aiediting/adapter-sdk` defines `EngineAdapter` (health, capabilities, validate, render). `AdapterRegistry` selects the default (ffmpeg) engine and per-clip engines. Health checks are explicit queries — nothing is assumed installed.

## Conventions

- ESM only, no glob re-exports
- Synthetic UUID ids (`project_`, `track_`, `clip_`, `asset_`, `job_`)
- Path safety: all engine-side writable paths resolve inside the project dir (`resolveInside`)
