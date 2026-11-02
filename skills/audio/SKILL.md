---
name: audio
description: AIEDITING audio — loudness targeting, silence trimming, ducking via volume keyframes, narration/voiceover clips. Use when the sound needs to be repaired, mixed or analyzed.
---

# AIEDITING: audio

## Analyze first

`analyze_media {path}` → integrated loudness (LUFS), `silences[]`, loudness graph is implicit via LUFS numbers. Use it to:
- target loudness (YouTube −14 LUFS, podcast-ish −16, social −12.5)
- find fat to cut: silence spans > 0.5s between speech

## Repair

- `import_media` audio; `add_clip {type:'audio', assetId ...}` on the Audio track.
- Tighten gaps: `trim_clip`/`move_clip` rather than speeding up speech.
- `generate_thumbnail` is video-only — preview audio timing via `inspect_media` durations.

## Mix discipline

- Duck music under narration with two keyframes per beat: `set_keyframe {property:'volume', time:t0-0.2, value:0.25}` → `{time:t1, value:1.0}`.
- Hard cap: never stack more than 2 audio sources at 100% volume.
- Final pass: loudness check on the rendered file (`aiediting verify` + `media analyze`).

## Voiceover options

- Narration asset: import and place; keep `fadeIn/fadeOut` 0.15s.
- Auto-narrated shorts: engine **mpt** generates TTS + mixes inside its pipeline (`voiceName`, `voiceRate`, `customAudioFile` props). Confirm via `check_engine_health {id:'mpt'}`.
