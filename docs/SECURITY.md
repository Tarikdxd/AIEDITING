# Security

## Principles

1. **Project files can't execute code.** The `aiediting.project.json` format carries data only (schema-validated). Rendering pipeline never spawns interpreters/eval from user content.
2. **Path containment.** Engine-adapters and asset imports resolve user paths through a guard `resolveInside(projectDir, ...)`; attempts to reach outside (`../`, absolute, UNC) are rejected.
3. **Verify before claiming.** Every render success is ffprobe-verified (container, duration, codecs). Failures are structured (`{status:'failed', error}`), not protocol errors.
4. **Bounded subprocesses.** Engine adapters run external CLIs with explicit args (no shell interpolation), timeouts, and captured stdout/stderr; secrets are never passed.

## Vendored engines

- `vendor/MoneyPrinterTurbo` is a pin-pinned upstream clone; upstream code is **never copied** into this repo (see `THIRD_PARTY_NOTICES`).
- Vendor directory contents (including upstream `config.toml` with API keys) are git-ignored. Config lives there, not here.

## What to keep local

- `vendor/MoneyPrinterTurbo/config.toml` — credentials. Never commit; never paste into issues.
- `assets/`, `renders/` — content, per project.

## Attacker surface to review when contributing

- any new `spawn`/`exec` in `packages/media`, `packages/adapters/*`
- new schema fields that reach a subprocess argv
- new filesystem writes outside the project dir
