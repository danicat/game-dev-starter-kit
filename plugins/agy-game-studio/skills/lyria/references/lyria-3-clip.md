# Lyria 3 Clip (`lyria-3-clip-preview`) Model Card

## Overview
**Lyria 3 Clip** (`lyria-3-clip-preview`) is Google's high-speed music generation model optimized for short clips, loops, social audio, and rapid style prototyping. It generates fixed 30-second stereo audio tracks along with synchronized lyric transcriptions and musical structure from text prompts or visual reference images.

- **Model Code**: `lyria-3-clip-preview`
- **Release Date**: March 2026
- **Status**: Generative AI Preview
- **Documentation**: [Google Developer Music Generation](https://ai.google.dev/gemini-api/docs/music-generation)

---

## Technical Specifications

| Property | Value |
| :--- | :--- |
| **Input Modalities** | Text, Image (up to 10 reference images) |
| **Output Modalities** | Audio (MP3 / WAV) and Text (Lyrics / Structure) |
| **Input Token Limit** | 131,072 tokens |
| **Audio Output Duration** | **Fixed 30 seconds** |
| **Audio Quality** | 44.1 kHz stereo, 192 kbps bitrate |
| **Supported MIME Types** | `audio/mp3`, `audio/wav` |
| **Supported Languages** | English, German, Spanish, French, Hindi, Japanese, Korean, Portuguese |
| **Capabilities** | Text-to-Music, Image-to-Music, Vocal generation, Instrumental mode, User lyrics |
| **Watermarking** | SynthID (Audio) + C2PA Content Credentials |

---

## Capabilities & Limitations

### Strengths
1. **Fast Prototyping**: Low latency generation suited for iterating on musical genres, chord progressions, and tempos.
2. **Multimodal Composition**: Composes audio beds reflecting the palette, lighting, and mood of up to 10 input images.
3. **Instrumental Isolation**: Produces clean instrumental backing tracks without vocal artifacts when prompted with `"Instrumental only"`.
4. **Synchronized Lyrics**: Returns lyric structure in the `output_text` / steps schema.

### Limitations
- **Fixed Duration**: Always produces exactly 30 seconds. For longer compositions or multi-minute songs, use **Lyria 3 Pro** (`lyria-3-pro-preview`).
- **Single-Turn**: Does not support sequential multi-turn audio inpainting or stem editing.

---

## API Code Examples

### 1. Python SDK (`google-genai`) - Interactions API

```python
import base64
from google import genai

client = genai.Client()

# Generate a 30-second chiptune clip
interaction = client.interactions.create(
    model="lyria-3-clip-preview",
    input="An energetic 8-bit chiptune arcade melody at 140 BPM in C major. Instrumental only, no vocals.",
)

if interaction.output_audio:
    with open("chiptune.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))

if interaction.output_text:
    print("Song Structure / Lyrics:\n", interaction.output_text)
```

### 2. JavaScript / TypeScript SDK (`@google/genai`)

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({});

async function generateClip() {
  const interaction = await ai.interactions.create({
    model: "lyria-3-clip-preview",
    input: "A 30-second lo-fi hip-hop loop with vinyl crackle and mellow electric piano at 85 BPM. Instrumental only.",
  });

  if (interaction.output_audio) {
    fs.writeFileSync("lofi_loop.mp3", Buffer.from(interaction.output_audio.data, "base64"));
  }
}

generateClip();
```

### 3. REST / cURL

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "lyria-3-clip-preview",
    "input": "A bright bossa nova guitar piece in F major. Instrumental only."
  }'
```
