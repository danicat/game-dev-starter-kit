# Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`) Model Card

## Overview
**Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`) is Google's ultra-high-velocity, cost-efficient image generation model designed for real-time consumer applications, conversational image editing, and high-volume generation pipelines.

- **Model Code**: `gemini-3.1-flash-lite-image`
- **Release Date**: June 2026
- **Status**: General Availability (GA)
- **DeepMind Model Card**: [gemini-3-1-flash-lite-image](https://deepmind.google/models/model-cards/gemini-3-1-flash-lite-image/)

---

## Technical Specifications

| Property | Value |
| :--- | :--- |
| **Input Modalities** | Text, Image / PDF |
| **Output Modalities** | Image and Text (Interleaved) |
| **Input Token Limit** | 65,536 tokens |
| **Output Token Limit** | 4,096 tokens |
| **Max Resolution** | **1K only** (1024px bounding box; 2K/4K unsupported) |
| **Generation Latency** | Sub-2 seconds (< 2s) end-to-end |
| **Function Calling** | Supported |
| **Thinking Mode** | Supported (`minimal` [default], `high`) |
| **Search Grounding** | ❌ Not Supported |
| **Watermarking** | SynthID (Always On) + C2PA Metadata |

---

## Supported Aspect Ratios & Resolutions (1K Fixed)

Nano Banana 2 Lite generates images within a 1K bounding box across 14 discrete aspect ratios:

| Aspect Ratio | Output Resolution | Description / Best For |
| :---: | :---: | :--- |
| **`1:1`** | 1024 × 1024 | Standard square, avatars, profile icons |
| **`2:3`** | 848 × 1264 | Classic portrait photography |
| **`3:2`** | 1264 × 848 | Classic landscape photography |
| **`3:4`** | 896 × 1200 | Vertical mobile screens, social stories |
| **`4:3`** | 1200 × 896 | Standard landscape monitor display |
| **`4:5`** | 928 × 1152 | Social media feed portrait |
| **`5:4`** | 1152 × 928 | Medium format display |
| **`9:16`** | 768 × 1376 | Vertical video stills, mobile wallpaper |
| **`16:9`** | 1376 × 768 | Widescreen presentations, YouTube thumbnails |
| **`21:9`** | 1584 × 672 | Ultrawide cinematic banners |
| **`1:4`** | 512 × 2048 | Tall vertical bookmarks and sidebars |
| **`4:1`** | 2048 × 512 | Wide horizontal headers and website banners |
| **`1:8`** | 384 × 3072 | Extreme tall vertical infographics |
| **`8:1`** | 3072 × 384 | Extreme wide horizontal panorama headers |

---

## Capabilities & Limitations

### Strengths
1. **Ultra-Low Latency**: Optimized for real-time interaction, UI mockups, stickers, and fast conversational iteration.
2. **Cost Efficiency**: Lowest compute and token consumption in the Nano Banana family.
3. **Conversational Multi-Turn Edits**: Fast local modifications (e.g. "change hair color to blue", "add sunglasses").
4. **Function Calling**: Fully integrated with tool-calling workflows.

### Limitations
- **Resolution Capped at 1K**: Cannot generate 2K (`2048px`) or 4K (`4096px`) images. Use **Nano Banana 2** or **Nano Banana Pro** for 2K/4K.
- **No Search Grounding**: Does not support real-time web or image search grounding tools.
- **Single/Local Reference Focus**: Best for single-image edits; not optimized for complex multi-character cross-scene consistency.

---

## API Code Examples

### 1. Python SDK (`google-genai`) - Interactions API

```python
import base64
from google import genai

client = genai.Client()

# Ultra-fast text-to-image generation
interaction = client.interactions.create(
    model="gemini-3.1-flash-lite-image",
    input="A vibrant sticker of a cute robot drinking bubble tea, white background",
    response_format={
        "type": "image",
        "aspect_ratio": "1:1",
        "image_size": "1K",
    },
)

if interaction.output_image:
    with open("robot_sticker.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```

### 2. Python SDK (`google-genai`) - Models API (`generate_content`)

```python
from google import genai
from PIL import Image

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-image",
    contents="A kawaii watercolor illustration of a sleeping kitten in a teacup",
)

for part in response.candidates[0].content.parts:
    if part.inline_data:
        with open("kitten.png", "wb") as f:
            f.write(part.inline_data.data)
        break
```

### 3. JavaScript / TypeScript SDK (`@google/genai`)

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({});

async function generate() {
  const interaction = await ai.interactions.create({
    model: "gemini-3.1-flash-lite-image",
    input: "Minimalist geometric icon of a rocket launching",
    response_format: {
      type: "image",
      aspect_ratio: "1:1",
      image_size: "1K",
    },
  });

  if (interaction.output_image) {
    fs.writeFileSync("rocket.png", Buffer.from(interaction.output_image.data, "base64"));
  }
}

generate();
```

### 4. REST / cURL

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-lite-image",
    "input": "A clean flat design icon of a coffee cup with steam",
    "response_format": {
      "type": "image",
      "aspect_ratio": "1:1",
      "image_size": "1K"
    }
  }'
```
