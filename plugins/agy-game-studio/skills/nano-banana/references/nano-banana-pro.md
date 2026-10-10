# Nano Banana Pro (`gemini-3-pro-image`) Model Card

## Overview
**Nano Banana Pro** (`gemini-3-pro-image`) is Google's state-of-the-art visual foundation model designed for professional studio asset production, complex multi-reference character and style consistency, high-precision typography rendering, and interleaved multi-image narrative composition.

- **Model Code**: `gemini-3-pro-image`
- **Release Date**: November 2025
- **Status**: General Availability (GA)
- **DeepMind Model Card**: [gemini-3-pro-image](https://deepmind.google/models/model-cards/gemini-3-pro-image/)

---

## Technical Specifications

| Property | Value |
| :--- | :--- |
| **Input Modalities** | Text, Images (up to 14), PDF |
| **Output Modalities** | Image and Text (Interleaved) |
| **Input Token Limit** | 65,536 tokens |
| **Output Token Limit** | 32,768 tokens |
| **Supported Resolutions** | `1K` (1024px), `2K` (2048px), `4K` (4096px) |
| **Aspect Ratios** | 10 standard professional ratios |
| **Thinking Mode** | **Enabled by Default** (deep visual reasoning prior to synthesis) |
| **Search Grounding** | **Web Search Grounding** supported |
| **Multi-Reference Anchors** | Up to 14 total: up to 6 objects + up to 5 characters + up to 3 style references |
| **Interleaved Output** | Supported (multi-scene storyboard / illustrated narrative) |
| **Watermarking** | SynthID (Always On) + C2PA Metadata |

---

## Resolution Grid & Token Consumption

| Aspect Ratio | 1K Resolution | 1K Tokens | 2K Resolution | 2K Tokens | 4K Resolution | 4K Tokens |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`1:1`** | 1024 × 1024 | 1,120 | 2048 × 2048 | 1,120 | 4096 × 4096 | 2,000 |
| **`2:3`** | 848 × 1264 | 1,120 | 1696 × 2528 | 1,120 | 3392 × 5056 | 2,000 |
| **`3:2`** | 1264 × 848 | 1,120 | 2528 × 1696 | 1,120 | 5056 × 3392 | 2,000 |
| **`3:4`** | 896 × 1200 | 1,120 | 1792 × 2400 | 1,120 | 3584 × 4800 | 2,000 |
| **`4:3`** | 1200 × 896 | 1,120 | 2400 × 1792 | 1,120 | 4800 × 3584 | 2,000 |
| **`4:5`** | 928 × 1152 | 1,120 | 1856 × 2304 | 1,120 | 3712 × 4608 | 2,000 |
| **`5:4`** | 1152 × 928 | 1,120 | 2304 × 1856 | 1,120 | 4608 × 3712 | 2,000 |
| **`9:16`** | 768 × 1376 | 1,120 | 1536 × 2752 | 1,120 | 3072 × 5504 | 2,000 |
| **`16:9`** | 1376 × 768 | 1,120 | 2752 × 1536 | 1,120 | 5504 × 3072 | 2,000 |
| **`21:9`** | 1584 × 672 | 1,120 | 3168 × 1344 | 1,120 | 6336 × 2688 | 2,000 |

---

## Capabilities & Key Features

### 1. Multi-Reference Character & Style Consistency
Nano Banana Pro excels at maintaining exact facial, anatomical, and wardrobe consistency across varied poses, while simultaneously adhering to an artistic style defined by separate reference images:
- **Object Anchors (up to 6)**: Maintain exact physical proportions and logo placements.
- **Character Anchors (up to 5)**: Preserve identity across 360-degree viewpoints and emotional expressions.
- **Style References (up to 3)**: Match custom painterly or graphic art styles.

### 2. Built-in Visual Thinking Reasoning
Nano Banana Pro runs pre-generation reasoning cycles that evaluate composition, lighting angles, focal depth, and spatial consistency before emitting pixels.

### 3. Interleaved Storyboard & Multi-Image Generation
Can produce multi-panel graphic novels, children's book spreads, or technical step-by-step illustrations with matching text in a single generation call.

---

## SDK Code Examples

### 1. Studio-Quality 4K Asset Production with Search Grounding

```python
import base64
from google import genai

client = genai.Client()

interaction = client.interactions.create(
    model="gemini-3-pro-image",
    input="An authentic photographic architectural render of the newly constructed Grand Egyptian Museum at sunset, with precise structural accuracy.",
    tools=[{"type": "google_search"}],
    response_format={
        "type": "image",
        "aspect_ratio": "16:9",
        "image_size": "4K",
    },
)

if interaction.output_image:
    with open("gem_museum_4k.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```

### 2. Multi-Reference Style & Character Consistency

```python
import base64
from google import genai

client = genai.Client()

def read_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

interaction = client.interactions.create(
    model="gemini-3-pro-image",
    input=[
        {"type": "image", "data": read_b64("references/character_face.png"), "mime_type": "image/png"},
        {"type": "image", "data": read_b64("references/character_body.png"), "mime_type": "image/png"},
        {"type": "image", "data": read_b64("references/art_style.png"), "mime_type": "image/png"},
        {
            "type": "text",
            "text": "Render the character from images 1 and 2 wearing a leather flight jacket and aviator goggles, standing beside a vintage plane. Recreate the entire scene in the exact watercolor and ink style of image 3.",
        },
    ],
    response_format={"type": "image", "aspect_ratio": "3:2", "image_size": "2K"},
)

if interaction.output_image:
    with open("character_rendered.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```
