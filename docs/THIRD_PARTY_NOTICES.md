# Third-party notices

AIEDITING (this repository) is licensed **Apache-2.0**. Dependencies keep their own licenses.

## Vendored (separate clone, git-ignored, never copied into this repo)

| Project | License | How we use it |
|---|---|---|
| [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (© 2024 Harry) | MIT | vendored at the pinned revision `84e99b3168ccd0ce4ebe58c9703a4fea3b4f32ba`; driven by AIEDITING's adapter, installed via `scripts/setup-mpt.mjs` into an isolated venv |

## Registered tooling (installed by the user, called over CLI — not distributed here)

| Project | License |
|---|---|
| FFmpeg (static build via ffmpeg-static) | LGPL-2.1-or-later (depends on build flags) |
| HyperFrames | Apache-2.0 |
| Remotion | Remotion License (free tier / commercial terms may apply) |
| Motion Canvas | MIT |
| StykAnimate | GPL-3.0-or-later (separate hosted application) |
| Blender | GPL-3.0-or-later |

## Node dependencies (share the workspace, not redistributed as binaries)

`@modelcontextprotocol/sdk` · `zod` · `zod-to-json-schema` · `tsx` · `vitest` · `tsup` · `typescript` · `playwright-core` (system browser) · `ffmpeg-static` · `ffprobe-static` — permissive licenses, see each package.

If you redistribute AIEDITING, you must preserve this file and the license headers; the MP4/H.264 encoding path has no trademark claims implied. End-user responsibility for codec patent terms remains yours (H.264/AAC).
