---
name: nano-banana
description: >
  Conversational image generation and multimodal image editing tool using Google
  Nano Banana models. Generates high-resolution images (512px, 1K, 2K, 4K), performs
  style transfers and mask-based image edits ("banana this"), and maintains character or
  style consistency using multi-image reference inputs. Activate when generating
  illustrations, editing or transforming images, creating visual assets, or
  maintaining character consistency across scenes.
license: Apache-2.0
metadata:
  category: media
  tags: "image-generation, images, art, generative-ai"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.0"
  catalog: https://skills.danicat.dev
---

# Nano Banana Skill

Generate, edit, and iterate on visual imagery conversationally using Google's native **Nano Banana** image generation foundation models (`gemini-nano-banana-2.1`, `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`).

---

## Available scripts

- `scripts/banana.py`: Production CLI tool for text-to-image generation, multimodal editing, and consistency anchoring with strict model capability validation.
- `scripts/test_banana.py`: Test suite verifying CLI argument parsing and capability validation guards.

---

## Trigger Conditions
Activate this skill whenever the user asks to:
- Generate new images, sprites, tilesets, or illustrations from text prompts.
- Edit, transform, style, or combine existing images.
- Use **"banana" as a verb** (e.g., "please banana this image", "banana this character into anime style", "banana this photo into chibi style").
- Maintain character, subject, or style consistency across generated imagery using reference images (including the bundled Dani reference anchors).
- Create 4K high-resolution visual assets or seamless extreme aspect-ratio banners (`1:4`, `4:1`, `1:8`, `8:1`).

---

## Model Selection & Capability Matrix

| Capability / Feature | Nano Banana 2.1 (`nano-banana-2.1`) | Nano Banana 2 Lite (`nano-banana-2-lite`) | Nano Banana 2 (`nano-banana-2`) | Nano Banana Pro (`nano-banana-pro`) |
| :--- | :--- | :--- | :--- | :--- |
| **Model ID** | `gemini-nano-banana-2.1` | `gemini-3.1-flash-lite-image` | `gemini-3.1-flash-image` | `gemini-3-pro-image` |
| **Architecture** | Gemini 3.6 Flash (Oct 2026) | Gemini 3.1 Flash Lite | Gemini 3.1 Flash | Gemini 3 Pro |
| **Primary Focus** | **Primary recommended workhorse**; speed, 4K, seamless panoramas, mask editing | Ultra-low latency (<2s), high volume | Generalist multimodal generation + 4K | Studio precision & multi-style asset production |
| **Resolutions** | `512px` (0.5K), `1K`, `2K`, `4K` | `1K` (1024px) only | `512px` (0.5K), `1K`, `2K`, `4K` | `1K`, `2K`, `4K` |
| **Aspect Ratios** | All 14 discrete ratios (improved seam/tiling elimination on `1:4`, `4:1`, `1:8`, `8:1`) | 14 discrete ratios | 14 discrete ratios (incl. `1:4`, `4:1`, `1:8`, `8:1`) | 10 standard ratios |
| **Search Grounding** | **Web Search + Image Search** | ❌ Not Supported | **Web Search + Image Search** | **Web Search** |
| **Thinking Mode** | Supported (`minimal`, `medium`, `high`) | Supported (`minimal`, `high`) | Supported (`minimal`, `high`) | Enabled by Default |
| **Video Context** | YouTube URLs & MP4 files | ❌ Not Supported | YouTube URLs & MP4 files | ❌ Not Supported |
| **Reference Anchors** | Up to 14 (up to 10 objects + 4 characters) + mask editing | Up to 14 (Local/Single edit focus) | Up to 10 objects + 4 characters | Up to 6 objects + 5 characters + 3 styles |
| **Function Calling**| ❌ Not Supported | Supported | ❌ Not Supported | ❌ Not Supported |
| **Reference Guide** | [nano-banana-2-1.md](references/nano-banana-2-1.md) | [nano-banana-2-lite.md](references/nano-banana-2-lite.md) | [nano-banana-2.md](references/nano-banana-2.md) | [nano-banana-pro.md](references/nano-banana-pro.md) |

---

## Deep Technical References

Consult dedicated reference cards in `references/` for full specs, exact token counts, and pixel dimensions:

- **[references/nano-banana-2-1.md](references/nano-banana-2-1.md)**: Consult for the primary workhorse (`gemini-nano-banana-2.1`), `medium` thinking level, seamless `1:4`/`4:1`/`1:8`/`8:1` panoramas, mask-based conversational editing, and Python/JS/Go SDK patterns.
- **[references/nano-banana-2-lite.md](references/nano-banana-2-lite.md)**: Consult when building real-time UI tools, fast prototyping, or cost-critical high-frequency pipelines (`1K` resolution).
- **[references/nano-banana-2.md](references/nano-banana-2.md)**: Consult for `gemini-3.1-flash-image` 4K generation, Google Image Search Grounding, and video-to-image workflows.
- **[references/nano-banana-pro.md](references/nano-banana-pro.md)**: Consult for studio asset production, multi-reference consistency across 14 anchors (6 objects + 5 characters + 3 artistic styles), and storyboards.
- **[references/README.md](references/README.md)**: Index and guidelines for using the bundled Dani character consistency reference anchors.

---

## Bundled Dani Character Consistency Reference Anchors

The `references/` directory includes 4 ready-to-use PNG reference anchors for **Dani** that can be passed via `-i` / `--input-image` to maintain character identity or transfer visual style across scenes:

- `references/chibi-dani.png`: Full-body 2D chibi illustration (primary character identity & proportion anchor).
- `references/celebrating-dani.png`: Expressive celebratory pose (facial expression & color palette anchor).
- `references/speaker-dani.png`: Conference speaker pose at podium (wardrobe & upper-body angle anchor).
- `references/chibi_dani_manga.png`: Monochrome manga ink illustration (line-art / manga style transfer anchor).

```bash
# Multi-reference character consistency across 3 Dani anchors with Nano Banana 2.1
uv run scripts/banana.py \
  -p "banana this character: render Chibi Dani as a 16-bit pixel-art space captain on a starship bridge, keeping her exact glasses, purple hair, and proportions" \
  -i "references/chibi-dani.png" \
  -i "references/celebrating-dani.png" \
  -i "references/speaker-dani.png" \
  -f "dani_space_captain.png" \
  -m "nano-banana-2.1" \
  -r "2K" \
  -a "16:9" \
  --thinking-level "medium"

# Character + manga style transfer using chibi-dani.png and chibi_dani_manga.png
uv run scripts/banana.py \
  -p "Render the character from the first image coding furiously at a multi-monitor setup in the exact black-and-white manga ink style of the second image" \
  -i "references/chibi-dani.png" \
  -i "references/chibi_dani_manga.png" \
  -f "dani_manga_coder.png" \
  -m "nano-banana-2.1" \
  -r "2K" \
  -a "3:4"
```

---

## Core Execution Workflows

### 1. CLI Execution via `scripts/banana.py`

Run `scripts/banana.py` with `uv run` to generate or edit images:

```bash
# Primary creative workhorse generation with Nano Banana 2.1 (Default) and medium thinking
uv run scripts/banana.py \
  -p "A seamless 2D side-scrolling pixel-art parallax background of a synthwave city skyline" \
  -f "synthwave_parallax.png" \
  -m "nano-banana-2.1" \
  -r "2K" \
  -a "4:1" \
  --thinking-level "medium" \
  --image-search

# High-velocity 1K generation with Nano Banana 2 Lite
uv run scripts/banana.py \
  -p "A minimalist flat illustration of a coffee cup on a wooden table" \
  -f "coffee_lite.png" \
  -m "nano-banana-2-lite" \
  -a "1:1"

# Studio-quality 4K generation with Nano Banana Pro
uv run scripts/banana.py \
  -p "An authentic architectural photograph of a modern library atrium with skylights" \
  -f "library_4k.png" \
  -m "nano-banana-pro" \
  -r "4K" \
  -a "16:9" \
  --search

# Conversational Image Editing ("banana this") with Multi-Reference Consistency
uv run scripts/banana.py \
  -p "banana this character: place the character into an astronaut suit on Mars" \
  -i "references/chibi-dani.png" \
  -i "references/celebrating-dani.png" \
  -f "astronaut_dani.png" \
  -m "nano-banana-2.1" \
  -r "2K"
```

#### CLI Argument Reference
- `-p`, `--prompt`: Text prompt describing generation or edit instructions (required).
- `-f`, `--filename`: Output file path for generated PNG/JPEG (required).
- `-i`, `--input-image`: Path to input/reference image(s). Can be specified up to 14 times.
- `-m`, `--model`: `nano-banana-2.1` (default, alias `nano-banana-2-1`), `nano-banana-2`, `nano-banana-2-lite` (alias `nano-banana-lite`), `nano-banana-pro`.
- `-r`, `--resolution`: `512px`, `1K` (default), `2K`, `4K`.
- `-a`, `--aspect-ratio`: `1:1` (default), `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`.
- `--thinking-level`: `minimal`, `medium` (Nano Banana 2.1 only), or `high`.
- `--search`: Enable Google Web Search Grounding (`nano-banana-2.1`, `nano-banana-2`, `nano-banana-pro`).
- `--image-search`: Enable Google Image Search Grounding (`nano-banana-2.1` and `nano-banana-2`).
- `--api`: `interactions` (default, Interactions API) or `models` (`generate_content`).
- `--dry-run`: Validate model capabilities and CLI arguments without calling the API.

---

### 2. Dual SDK Integration Patterns

#### Interactions API (`client.interactions.create`) — Recommended
Best for multi-turn editing, search grounding, controllable thinking, and stateful iteration:

```python
import base64
from google import genai

client = genai.Client()

# Text-to-Image Generation with Nano Banana 2.1, 4K Resolution, Medium Thinking & Search Grounding
interaction = client.interactions.create(
    model="gemini-nano-banana-2.1",
    input="An infographic chart showing the timeline of space exploration milestones",
    tools=[{"type": "google_search", "search_types": ["web_search", "image_search"]}],
    generation_config={"thinking_level": "medium"},
    response_format={
        "type": "image",
        "aspect_ratio": "16:9",
        "image_size": "4K",
    },
)

if interaction.output_image:
    with open("space_milestones.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```

#### Models API (`client.models.generate_content`)
Direct stateless multimodal generation:

```python
from google import genai
from PIL import Image

client = genai.Client()

img = Image.open("references/chibi-dani.png")
response = client.models.generate_content(
    model="gemini-nano-banana-2.1",
    contents=[img, "Place this character in a cozy pixel-art game developer studio with warm desk lighting."],
)

for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open("dani_studio.png", "wb") as f:
            f.write(part.inline_data.data)
        break
```

---

## Prompting Best Practices
1. **Be Hyper-Specific**: Define materials, surface textures, lighting setups, and camera angles (`three-point softbox`, `macro lens`, `shallow depth of field`, `16-bit SNES pixel art`).
2. **Context & Intent**: State the functional purpose (`2D game sprite sheet with solid #FF00FF chroma key background`, `seamless 4:1 parallax background`, `app store icon`).
3. **Conversational Inpainting**: When editing, clearly describe what to modify while instructing to preserve unchanged surroundings (`"Change only the sofa to brown vintage leather. Keep all lighting and room decor untouched."`).
4. **Positive Framing**: Describe what should appear instead of using negative constraints (`"an empty street with no signs of vehicles"` rather than `"no cars"`).
