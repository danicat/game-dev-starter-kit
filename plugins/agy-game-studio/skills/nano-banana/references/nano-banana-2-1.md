# Nano Banana 2.1 (`gemini-nano-banana-2.1`) Model Card

## Overview
**Nano Banana 2.1** (`gemini-nano-banana-2.1`) is Google's next-generation multimodal creative workhorse built on the **Gemini 3.6 Flash** architecture. Released on October 6, 2026, it delivers enhanced spatial composition, seamless panoramic synthesis across 14 aspect ratios, mask-based conversational editing, three-tier controllable thinking (`minimal`, `medium`, `high`), real-time Google Web and Image Search grounding, and multi-reference character consistency across up to 14 anchors.

- **Model Code**: `gemini-nano-banana-2.1`
- **Architecture**: Gemini 3.6 Flash
- **Release Date**: October 6, 2026
- **Status**: General Availability (GA)
- **CLI Aliases**: `nano-banana-2.1` (default), `nano-banana-2-1`

---

## Technical Specifications

| Property | Value |
| :--- | :--- |
| **Input Modalities** | Text, Images (up to 14), Video (YouTube URLs, MP4s), PDF |
| **Output Modalities** | Image and Text (Interleaved) |
| **Input Token Limit** | 131,072 tokens |
| **Output Token Limit** | 32,768 tokens |
| **Supported Resolutions** | `512px` (0.5K), `1K` (1024px), `2K` (2048px), `4K` (4096px) |
| **Aspect Ratios** | All 14 discrete ratios (`1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`) with panoramic seam/tiling elimination |
| **Thinking Process** | Supported (`minimal` [default], `medium`, `high`) |
| **Search Grounding** | **Google Web Search (`--search`)** + **Google Image Search (`--image-search`)** |
| **Reference Anchors** | Up to 14 reference images (up to 10 object anchors + up to 4 character resemblance anchors) |
| **Conversational Editing** | Multi-turn mask-based inpainting, outpainting, and local regional edits |
| **Watermarking** | SynthID (Always On) + C2PA Metadata |

---

## Complete Resolution Grid & Token Consumption

| Aspect Ratio | 512px (0.5K) | Tokens | 1K Resolution | Tokens | 2K Resolution | Tokens | 4K Resolution | Tokens |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`1:1`** | 512 × 512 | 747 | 1024 × 1024 | 1,120 | 2048 × 2048 | 1,680 | 4096 × 4096 | 2,520 |
| **`1:4`** | 256 × 1024 | 747 | 512 × 2048 | 1,120 | 1024 × 4096 | 1,680 | 2048 × 8192 | 2,520 |
| **`1:8`** | 192 × 1536 | 747 | 384 × 3072 | 1,120 | 768 × 6144 | 1,680 | 1536 × 12288 | 2,520 |
| **`2:3`** | 424 × 632 | 747 | 848 × 1264 | 1,120 | 1696 × 2528 | 1,680 | 3392 × 5056 | 2,520 |
| **`3:2`** | 632 × 424 | 747 | 1264 × 848 | 1,120 | 2528 × 1696 | 1,680 | 5056 × 3392 | 2,520 |
| **`3:4`** | 448 × 600 | 747 | 896 × 1200 | 1,120 | 1792 × 2400 | 1,680 | 3584 × 4800 | 2,520 |
| **`4:1`** | 1024 × 256 | 747 | 2048 × 512 | 1,120 | 4096 × 1024 | 1,680 | 8192 × 2048 | 2,520 |
| **`4:3`** | 600 × 448 | 747 | 1200 × 896 | 1,120 | 2400 × 1792 | 1,120 | 4800 × 3584 | 2,520 |
| **`4:5`** | 464 × 576 | 747 | 928 × 1152 | 1,120 | 1856 × 2304 | 1,680 | 3712 × 4608 | 2,520 |
| **`5:4`** | 576 × 464 | 747 | 1152 × 928 | 1,120 | 2304 × 1856 | 1,680 | 4608 × 3712 | 2,520 |
| **`8:1`** | 1536 × 192 | 747 | 3072 × 384 | 1,120 | 6144 × 768 | 1,680 | 12288 × 1536 | 2,520 |
| **`9:16`** | 384 × 688 | 747 | 768 × 1376 | 1,120 | 1536 × 2752 | 1,680 | 3072 × 5504 | 2,520 |
| **`16:9`** | 688 × 384 | 747 | 1376 × 768 | 1,120 | 2752 × 1536 | 1,680 | 5504 × 3072 | 2,520 |
| **`21:9`** | 792 × 168 | 747 | 1584 × 672 | 1,120 | 3168 × 1344 | 1,680 | 6336 × 2688 | 2,520 |

---

## Capabilities & Key Features

### 1. Three-Tier Controllable Thinking (`minimal`, `medium`, `high`)
Nano Banana 2.1 introduces the `medium` thinking level on top of `minimal` and `high`:
- **`"minimal"`**: Fast synthesis with minimal pre-generation reasoning latency.
- **`"medium"`**: Balanced spatial layout planning, typography verification, and perspective coherence with sub-second reasoning overhead (exclusive to `gemini-nano-banana-2.1`).
- **`"high"`**: Deep compositional planning for multi-character scenes, intricate architectural perspectives, complex lighting, and dense infographic text.

### 2. Panoramic Seam & Tiling Elimination (`1:4`, `4:1`, `1:8`, `8:1`)
Built on Gemini 3.6 Flash attention windows, Nano Banana 2.1 eliminates repetition seams and horizon discontinuities across extreme panoramic (`4:1`, `8:1`) and vertical scroll (`1:4`, `1:8`) ratios, making it ideal for 2D game parallax backgrounds, seamless level strips, and website hero banners.

### 3. Mask-Based Conversational Editing & Multi-Reference Consistency
Pass up to 14 reference images (up to 10 object references + 4 character anchors) alongside optional binary/alpha mask inputs to perform surgical regional inpainting while preserving surrounding pixels and character identity.

### 4. Google Web Search & Image Search Grounding
Query Google Web Search and Google Image Search in real time to ground generated visuals in verified facts, real-world landmarks, current events, and accurate visual taxonomy.

### 5. Video Context Understanding
Pass YouTube URLs or MP4 files to synthesize keyframe illustrations, sprite sheets, or promotional posters grounded in temporal video context.

---

## SDK Code Examples

### 1. Python SDK (`google-genai`) — 4K Panoramic Generation with `medium` Thinking & Image Search

```python
import base64
from google import genai

client = genai.Client()

interaction = client.interactions.create(
    model="gemini-nano-banana-2.1",
    input="A seamless 2D side-scrolling pixel-art parallax background of a bioluminescent crystal cavern",
    tools=[{"type": "google_search", "search_types": ["web_search", "image_search"]}],
    generation_config={"thinking_level": "medium"},
    response_format={
        "type": "image",
        "aspect_ratio": "4:1",
        "image_size": "4K",
    },
)

if interaction.output_image:
    with open("cavern_parallax_4k.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```

### 2. Python SDK (`google-genai`) — Multi-Reference Character Consistency & Mask-Based Editing

```python
import base64
from google import genai

client = genai.Client()

def encode_png(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

interaction = client.interactions.create(
    model="gemini-nano-banana-2.1",
    input=[
        {"type": "image", "data": encode_png("references/chibi-dani.png"), "mime_type": "image/png"},
        {"type": "image", "data": encode_png("references/celebrating-dani.png"), "mime_type": "image/png"},
        {"type": "image", "data": encode_png("references/speaker-dani.png"), "mime_type": "image/png"},
        {
            "type": "text",
            "text": (
                "Keep the exact character identity, purple hair, glasses, and chibi proportions from the reference images. "
                "Generate a 4-frame horizontal sprite sheet of Dani casting a glowing lightning spell, solid magenta (#FF00FF) background."
            ),
        },
    ],
    generation_config={"thinking_level": "high"},
    response_format={"type": "image", "aspect_ratio": "4:1", "image_size": "2K"},
)

if interaction.output_image:
    with open("dani_spell_sheet.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```

### 3. JavaScript / TypeScript SDK (`@google/genai`)

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({});

async function generateBanner() {
  const interaction = await ai.interactions.create({
    model: "gemini-nano-banana-2.1",
    input: "A vibrant isometric cyber-arcade cabinet with glowing neon marquee",
    generation_config: {
      thinking_level: "medium",
    },
    response_format: {
      type: "image",
      aspect_ratio: "16:9",
      image_size: "2K",
    },
  });

  if (interaction.output_image) {
    fs.writeFileSync(
      "arcade_cabinet.png",
      Buffer.from(interaction.output_image.data, "base64")
    );
  }
}

generateBanner();
```

### 4. Go SDK (`google.golang.org/genai`)

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"google.golang.org/genai"
)

func main() {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, nil)
	if err != nil {
		log.Fatalf("failed to create genai client: %v", err)
	}

	resp, err := client.Models.GenerateContent(
		ctx,
		"gemini-nano-banana-2.1",
		genai.Text("A clean 16-bit SNES style treasure chest sprite on a solid #FF00FF background"),
		&genai.GenerateContentConfig{
			ResponseModalities: []string{"IMAGE"},
		},
	)
	if err != nil {
		log.Fatalf("generation failed: %v", err)
	}

	for _, part := range resp.Candidates[0].Content.Parts {
		if part.InlineData != nil {
			if err := os.WriteFile("chest_sprite.png", part.InlineData.Data, 0644); err != nil {
				log.Fatalf("write file failed: %v", err)
			}
			fmt.Println("Saved chest_sprite.png")
			break
		}
	}
}
```
