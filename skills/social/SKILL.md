---
name: social
description: AIEDITING social/vertical short-form (Reels, TikTok, Shorts) — 9:16 build, hook-first structure, burned captions, quick cuts. Use when the user wants short vertical content.
---

# AIEDITING: social vertical

## Setup

`create_project {dir, name, width:1080, height:1920, fps:30, duration:≤60}` — vertical from the start.

## Structure (hook → payoff)

1. 0–1.5s: hook clip. Use the most dynamic frame; `trim_clip` to start mid-action.
2. 1.5–4s: context. One shot, one idea.
3. 4s–end: payoff list / steps / result.
4. Last 1s: CTA text (`add_text` bottom third, `transform {y:0.35}`).

## Captions are mandatory

`add_subtitle {text, start, duration}` per spoken beat — burned in on render, no captions toggle needed. Keep cues ≤ 32 chars, 1–2.5s each.

## Fast cuts

- `analyze_media` on source footage → reuse detected `sceneCuts` as edit points.
- `change_speed 1.4–2.0` on establishing shots; never on dialogue.
- Transitions: only hard cuts or 0.2s `fade`. Wipe/slide reads dated on social.

## Render

- `render_video {outputPath}` — check `width×height` in response equals 1080×1920.
- If an animated sticker/graphic beat is wanted: `set_clip_renderer {engine:'remotion', template:'stat'}`.
- For auto-generated narration shorts: engine **mpt** (`scripts/setup-mpt.mjs` availability via `list_engines`); it takes a script + local materials and returns a finished vertical piece. Voice name examples: `tr-TR-EmelNeural-Female`, or `no-voice` to skip TTS.

## Verify

`aiediting verify dist/*.mp4` (or trust `render_video`'s verified response). Publish only after both.
