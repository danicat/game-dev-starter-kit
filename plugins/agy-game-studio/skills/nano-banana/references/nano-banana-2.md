# Nano Banana 2 (`gemini-3.1-flash-image`) Model Card

## Overview
**Nano Banana 2** (`gemini-3.1-flash-image`) is Google's flagship multimodal creative workhorse model. It delivers the optimal balance of speed, intelligence, high-fidelity visual composition, and 4K output generation, featuring native web search grounding, image search grounding, and video context understanding.

- **Model Code**: `gemini-3.1-flash-image`
- **Release Date**: February 2026
- **Status**: General Availability (GA)
- **DeepMind Model Card**: [gemini-3-1-flash-image](https://deepmind.google/models/model-cards/gemini-3-1-flash-image/)

---

## Technical Specifications

| Property | Value |
| :--- | :--- |
| **Input Modalities** | Text, Images (up to 14), Video (YouTube URLs, MP4s), PDF |
| **Output Modalities** | Image and Text (Interleaved) |
| **Input Token Limit** | 131,072 tokens |
| **Output Token Limit** | 32,768 tokens |
| **Supported Resolutions** | `512px` (0.5K), `1K` (1024px), `2K` (2048px), `4K` (4096px) |
| **Aspect Ratios** | 14 discrete ratios (incl. extreme wide/tall `1:4`, `4:1`, `1:8`, `8:1`) |
| **Thinking Process** | Supported (`minimal` [default], `high`) |
| **Search Grounding** | **Web Search Grounding** + **Google Image Search Grounding** |
| **Reference Anchors** | Up to 10 object anchors + up to 4 character resemblance anchors |
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
| **`4:3`** | 600 × 448 | 747 | 1200 × 896 | 1,120 | 2400 × 1792 | 1,680 | 4800 × 3584 | 2,520 |
| **`4:5`** | 464 × 576 | 747 | 928 × 1152 | 1,120 | 1856 × 2304 | 1,680 | 3712 × 4608 | 2,520 |
| **`5:4`** | 576 × 464 | 747 | 1152 × 928 | 1,120 | 2304 × 1856 | 1,680 | 4608 × 3712 | 2,520 |
| **`8:1`** | 1536 × 192 | 747 | 3072 × 384 | 1,120 | 6144 × 768 | 1,680 | 12288 × 1536 | 2,520 |
| **`9:16`** | 384 × 688 | 747 | 768 × 1376 | 1,120 | 1536 × 2752 | 1,680 | 3072 × 5504 | 2,520 |
| **`16:9`** | 688 × 384 | 747 | 1376 × 768 | 1,120 | 2752 × 1536 | 1,680 | 5504 × 3072 | 2,520 |
| **`21:9`** | 792 × 168 | 747 | 1584 × 672 | 1,120 | 3168 × 1344 | 1,680 | 6336 × 2688 | 2,520 |

---

## Capabilities & Key Features

### 1. Google Search & Image Search Grounding
Nano Banana 2 can query Google Search (both Web and Image Search) in real time to generate accurate images based on current events, sports scores, scientific diagrams, and real-world visual references.

```python
interaction = client.interactions.create(
    model="gemini-3.1-flash-image",
    input="An infographic summarizing yesterday's European championship match highlights",
    tools=[{"type": "google_search", "search_types": ["web_search", "image_search"]}],
    response_format={"type": "image", "aspect_ratio": "16:9", "image_size": "2K"},
)
```

### 2. Video-to-Image Generation
Pass YouTube URLs or local video files via the Files API to generate context-matched posters, scene captures, or thematic thumbnails:

```python
interaction = client.interactions.create(
    model="gemini-3.1-flash-image",
    input=[
        {"type": "text", "text": "Generate a dramatic cinematic movie poster inspired by this trailer video"},
        {"type": "video_url", "url": "https://www.youtube.com/watch?v=EXAMPLE_VIDEO_ID"},
    ],
    response_format={"type": "image", "aspect_ratio": "2:3", "image_size": "4K"},
)
```

### 3. Controllable Thinking Process
Control reasoning depth with `thinking_level`:
- `"minimal"`: Low latency, standard generation.
- `"high"`: Enhanced reasoning through composition, spatial arrangement, and complex lighting before pixel synthesis.

---

## SDK Code Examples

### 1. Python SDK (`google-genai`) - 4K High-Resolution Generation

```python
import base64
from google import genai

client = genai.Client()

interaction = client.interactions.create(
    model="gemini-3.1-flash-image",
    input="A cinematic wide-angle shot of an ancient observatory on a mountain peak under the Aurora Borealis",
    generation_config={"thinking_level": "high"},
    response_format={
        "type": "image",
        "aspect_ratio": "16:9",
        "image_size": "4K",
    },
)

if interaction.output_image:
    with open("observatory_4k.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```

### 2. Multi-Reference Character & Object Editing

```python
import base64
from google import genai

client = genai.Client()

with open("character_ref.png", "rb") as f:
    char_bytes = f.read()

with open("suit_ref.png", "rb") as f:
    suit_bytes = f.read()

interaction = client.interactions.create(
    model="gemini-3.1-flash-image",
    input=[
        {"type": "image", "data": base64.b64encode(char_bytes).decode("utf-8"), "mime_type": "image/png"},
        {"type": "image", "data": base64.b64encode(suit_bytes).decode("utf-8"), "mime_type": "image/png"},
        {"type": "text", "text": "Place the character from the first image into the cyberpunk armor from the second image, standing in a rain-soaked futuristic street."},
    ],
    response_format={"type": "image", "aspect_ratio": "16:9", "image_size": "2K"},
)

if interaction.output_image:
    with open("character_cyberpunk.png", "wb") as f:
        f.write(base64.b64decode(interaction.output_image.data))
```
