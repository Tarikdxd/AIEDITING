---
name: color-grading
description: AIEDITING color — consistent grading via effect stacks on clips (eq/vignette/chromakey), time-boxed to srgb/rec709 color spaces. Use when the look needs matching or fixing.
---

# AIEDITING: color grading in AIEDITING

## Scope

Effects clip-by-clip (`eq`, `blur`, `vignette`, `hue`, `chromakey`); project `colorSpace` is `srgb` unless the delivery spec says otherwise (rec709 for broadcast-grade deliverables).

## Match a look

1. Pick the reference clip (or create a plate at the target look).
2. On every other visual clip, apply the same `eq` numbers:
   `add_effect {clipId, effect:{type:'eq', contrast, brightness, saturation, gamma}}`.
   Start: contrast 1.05–1.15, brightness −0.02…+0.02, saturation 0.9–1.1, gamma 0.98–1.05.
3. Warm/cool shifts: `hue` effect stepwise; avoid > ±0.05 unless intentional.
4. Fix exposure with `eq.brightness` in small steps; macro contrast via gamma.

## Chromakey / greenscreen

`add_effect {type:'chromakey', ...}` to key color; follow with trim of the key color spill via `eq` saturation drop. Works per clip — keep keys consistent across shots of the same setup.

## Pass order

Effects apply in list order on a clip: correct (eq) → stylize (hue) → frame (vignette). Reorder by re-adding in the wanted order.

## Verify

Grade is unverifiable by number — render preview, screenshot dense frames, compare against the reference. Only trust `render_video`'s verified metrics for format (not for look).
