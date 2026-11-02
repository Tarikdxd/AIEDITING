# CLI

`aiediting` — same tool implementations as the MCP server.

```powershell
corepack pnpm link --global   # or run via: corepack pnpm cli / tsx apps/cli/src/index.ts
```

## Commands

```
aiediting init [dir] [--name n] [--width w] [--height h] [--fps f] [--duration d]
aiediting project inspect [dir]
aiediting project validate [dir]
aiediting media import <file> [--dir projectDir] [--tags a,b]
aiediting media inspect <file>          # ffprobe report
aiediting media analyze <file>          # LUFS + silences + scene cuts
aiediting media thumbnail <file> [--out out.jpg] [--time t] [--width w]
aiediting timeline [dir]                # project summary
aiediting plan [dir] --title t --prompt p --duration s [--width w --height h]
aiediting render [dir] [--preview] [--out file.mp4]
aiediting engines list | engines doctor [engineId]
aiediting mcp                           # start the stdio MCP server
aiediting verify <file.mp4>             # ffprobe-verify a deliverable
```

## Conventions

- Output is JSON (one object per command); exit code `1` + `aiediting: <message>` on stderr on failure — fail loudly, parse robustly.
- `plan` without `--title/--prompt/--duration` fails with usage, never silently.
- `verify` re-probes the file: duration ≥ 0.5s and non-empty payload, else exit 1.
- `render` prints the verified result of the job (duration/resolution measured, not claimed).

## Examples

```powershell
aiediting init tutorial --name "Node Ladder" --duration 180
aiediting media import C:\clips\intro.mp4 --dir tutorial --tags intro
aiediting media analyze C:\clips\intro.mp4
aiediting plan tutorial --title "Node Ladder" --prompt "explain modules in 6 scenes" --duration 180
aiediting render tutorial --out out\final.mkv      # use .mp4 unless you know why
aiediting verify out\final.mp4
```
