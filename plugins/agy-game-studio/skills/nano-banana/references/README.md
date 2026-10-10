# Nano Banana References & Model Cards

This directory contains technical model cards, capability specifications, resolution matrices, and guidance for storing consistency anchors and reference images.

## Model Cards & Technical References

- **[Nano Banana 2.1 (`gemini-nano-banana-2.1`)](nano-banana-2-1.md)**: Primary recommended creative workhorse built on Gemini 3.6 Flash (`512px`/`1K`/`2K`/`4K`, 14 aspect ratios with panoramic seam elimination, `minimal`/`medium`/`high` thinking levels, Google Web + Image Search grounding, mask-based editing, and up to 14 reference anchors).
- **[Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`)](nano-banana-2-lite.md)**: Ultra-low latency (<2s), high-throughput model (`1K` resolution across 14 aspect ratios).
- **[Nano Banana 2 (`gemini-3.1-flash-image`)](nano-banana-2.md)**: Multimodal creative model with `512px`/`1K`/`2K`/`4K` output, 14 aspect ratios, and Google Web + Image Search grounding.
- **[Nano Banana Pro (`gemini-3-pro-image`)](nano-banana-pro.md)**: Studio asset production, 4K rendering, multi-reference consistency (up to 14 anchors: 6 objects, 5 characters, 3 styles), and default pre-generation thinking.

---

## Reference Images & Consistency Anchors

Place reusable reference images (characters, mascots, style targets, tileset templates) in this directory or reference them from your workspace assets.

Pass reference images to `scripts/banana.py` using `-i` or `--input-image`:

```bash
uv run scripts/banana.py \
  -p "Keep the exact character identity from the reference image: render our mascot in a pilot jacket flying a vintage biplane" \
  -f "pilot_mascot.png" \
  -i "references/mascot.png" \
  -m "nano-banana-2.1" \
  -r "2K" \
  -a "16:9" \
  --thinking-level "medium"
```
