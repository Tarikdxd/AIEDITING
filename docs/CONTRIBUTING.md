# Contributing

Tiny area, strong opinions. Before touching code:

## Project rules

- **Verify everything.** A change to rendering needs an actual rendered file (`pnpm test` covers one; smoke scripts per engine live in `scripts/smoke-*.ts`).
- TypeScript sources are runtime: keep `exports` pointing at `./src/index.ts`; don't introduce build-required intermediate steps.
- No `any` in public APIs; internal calls that need casts keep them local (`as any` at the call site, never in exported types).
- New MCP tool ⇒ also usable from the CLI (they share `@aiediting/mcp-tools`) and reflected in `docs/MCP.md` + `README.md` counts.
- Schema changes require: zod schema + `projectJsonSchema()` regeneration (`pnpm schema`) + stored fixture/`tests/schema.test.ts` update + cross-check vs `timeline` ops.

## Workflow

```powershell
corepack pnpm install
corepack pnpm test          # includes an ffmpeg render integration test
node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json
aiediting engines doctor    # what your machine can verify
```

## Commits

One concern per commit: `feat: render_status lists persisted jobs`, `fix(core): mkdir before atomic save`. Mention verification in the commit body (`verified by ...`).

## Don't

- Don't vendor engine sources; use the `scripts/setup-*` pattern (clone → pin → gitignore).
- Don't add null-safe denote-able code (`if (!x) throw` already dominates); prefer fail-fast Tools errors for agent-driven flows.
- Don't widen the schema before checking the downstream adapters (ffmpeg compositor + every engine's `props` mapping).
