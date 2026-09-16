# Nano Banana Reference Images

This directory stores reference images for character consistency when generating or editing images of Anime Dani and Chibi Dani.

## Character Reference Files
Place reference images in this directory following these standard filenames:
- **Anime Dani / Daniela**: `celebrating-dani.png` and `speaker-dani.png`
- **Chibi Dani**: `chibi-dani.png`

When the user requests image generation or editing of Anime Dani, Daniela, or Chibi Dani, these reference images are passed to `scripts/banana.py` via `-i` / `--input-image`.
