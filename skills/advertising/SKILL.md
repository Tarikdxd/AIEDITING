---
name: advertising
description: AIEDITING advertising — product/lifestyle specs, hero moments, call-to-action compliance and hook-first cutdown variants. Use for promo/ads work.
---

# AIEDITING: advertising

## Variants come first

Ads need sizes. Decide per campaign: 16:9 (YouTube PreRoll), 9:16 (Reels/Stories), 1:1 (image clips feed). Create sibling projects per ratio; keep edits identical in `prompt`/scene order, differing in `width/height` and text positions.

## Beat sheet (≤ 30s)

1. 0–3s hero moment: best light/motion. Brand colored plate + `add_text` logo lockup.
2. 3–10s problem → product: b-roll with `add_effect {type:'sharpen'}` on product frames.
3. 10–20s proof: stats card via `remotion {template:'stat'}` or `hyperframes {template:'statement'}`.
4. 20–30s CTA card: `hyperframes {template:'end'}` + CTA copy ≤ 6 words.

## Compliance habits

- CTA appears by ≥ 70% of runtime.
- Text legible: min fontSize relative to 1080-height: 72 on 9:16, 64 on 16:9.
- One idea per card; never more than 2 typefaces in props.

## Ship checklist

- [ ] `list_engines` before engine-scene assignment
- [ ] `validate_project` clean per variant
- [ ] `render_video` per variant; each response's `width×height` matches the spec
- [ ] real-frame sanity: the poster frame is the hero product shot
