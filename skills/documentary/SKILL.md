---
name: documentary
description: AIEDITING documentary editing — real-world footage assembly: detect scene cuts and silences, organize b-roll, subtitles for interview flow. Use for non-fiction footage editing.
---

# AIEDITING: documentary flow

## Intake

1. `import_media` every shot with usage tags: `--tags interview,wide,golden-hour`.
2. `analyze_media` per talky source → silences (cut candidates) + scene cuts (natural boundaries).
3. Organize facts in the project: `inspect_media` per asset for duration/codec to plan captured minutes vs target runtime.

## Structural pass

- Interviews sit on Audio track; visuals on Primary.
- Lead with visual, let speech start underneath (J-cut pattern: `move_clip` audio earlier by 0.5–1s).
- B-roll over question/answer sections; avoid b-roll longer than the beat it covers (±0.3s).
- Use detected scene cuts as in/out anchors for `trim_clip` — cuts land on exposure changes, good rhythm.

## Truthfulness

- All cuts are real content removal, no Speed-ramped retiming unless asked.
- No synthetic narration: subtitles quote speech only; on-screen text says sourced facts.

## Deliver

`validate_project` → `render_video` → check response `duration` and scan `renders/jobs/*.json` for the pre-render record. Deliver as is; don't claim a runtime beyond the verified number.
