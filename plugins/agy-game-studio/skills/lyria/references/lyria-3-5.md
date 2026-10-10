# Lyria 3.5 (`lyria-3.5`) Model Card

## Overview
**Lyria 3.5** (`lyria-3.5`) is Google's state-of-the-art flagship music generation model. It produces high-fidelity **44.1 kHz stereo audio**, full songs with structural arrangements (intro, verses, chorus, bridge, solo, outro), expressive vocal synthesis, and dynamic intensity shaping from text prompts or visual reference images.

- **Model Code**: `lyria-3.5`
- **Release Date**: Mid-2026
- **Status**: Generally Available (GA)
- **Documentation**: [Google Developer Music Generation](https://ai.google.dev/gemini-api/docs/music-generation)

---

## Technical Specifications

| Property | Value |
| :--- | :--- |
| **Input Modalities** | Text, Image (up to 10 reference images) |
| **Output Modalities** | Audio (MP3 / WAV) and Text (Lyrics / Structure) |
| **Input Token Limit** | 131,072 tokens |
| **Audio Output Duration** | **Controllable multi-minute songs** (up to ~3 minutes) |
| **Audio Quality** | 44.1 kHz stereo, 192 kbps bitrate |
| **Supported MIME Types** | `audio/mp3`, `audio/wav` |
| **Supported Languages** | English, German, Spanish, French, Hindi, Japanese, Korean, Portuguese |
| **Structural Controls** | Timestamps, BPM, Key, Section Tags, Dynamic Intensity |
| **Watermarking** | SynthID (Audio) + C2PA Content Credentials |

---

## Key Features & Capabilities

### 1. Structural Arrangement & Timestamp Control
Lyria 3.5 interprets structured prompt timelines to guide instrument entrances, transitions, vocal delivery, and dynamic swells:

```text
[0:00 - 0:15] Intro: Atmospheric Rhodes electric piano with ambient vinyl crackle in D minor.
[0:15 - 0:45] Verse 1: Warm bassline and boom-bap drums enter with expressive vocals.
[0:45 - 1:15] Chorus: Full melodic progression with saxophone countermelodies and rich harmonies.
[1:15 - 1:35] Bridge: Stripped-back percussion and solo piano building tension.
[1:35 - 2:05] Final Chorus: Maximum dynamic intensity with full brass accents and rhythm section.
[2:05 - 2:20] Outro: Slow guitar strumming gently fading to silence.
```

### 2. User-Defined Lyrics & Section Tags
Provide full song lyrics structured by section:

```text
Compose an uplifting indie rock anthem at 128 BPM in G Major:

[Verse 1]
City skyline shining in the dusk
Running free on roads of copper rust

[Chorus]
We ignite the neon spark tonight
Chasing dreams until the morning light
```

### 3. Multimodal Image-to-Music Guidance
Supply up to 10 reference images (concept art, photos, storyboards) to direct the emotional palette, genre mood, and aesthetic tone of the composition.

### 4. Clean Instrumental Backing Tracks
Add `"Instrumental only, no vocals"` to synthesize pristine background beds, game soundtracks, or podcast scoring without vocal bleed or artifacts.

---

## SDK Code Examples

### 1. Full Song with Timestamps & Lyrics (Python - Interactions API)

```python
import base64
from google import genai

client = genai.Client()

prompt = """
An atmospheric lo-fi jazz track at 85 BPM in E Minor:

[0:00 - 0:20] Intro: Warm upright bass and gentle brush drums.
[0:20 - 0:50] Verse 1: Mellow electric piano melody with subtle trumpet accents.
[0:50 - 1:20] Chorus: Full ensemble with rich saxophone harmonies.
[1:20 - 1:40] Outro: Slow piano chords fading into rain sounds.
Instrumental only, no vocals.
"""

interaction = client.interactions.create(
    model="lyria-3.5",
    input=prompt,
    response_format={"type": "audio"},
)

if interaction.output_audio:
    with open("lofi_track.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))

if interaction.output_text:
    with open("lofi_track_structure.txt", "w") as f:
        f.write(interaction.output_text)
```

### 2. Multimodal Concept-to-Soundtrack (Python)

```python
import base64
from google import genai

client = genai.Client()

def read_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

interaction = client.interactions.create(
    model="lyria-3.5",
    input=[
        {"type": "image", "data": read_b64("concept_art.jpg"), "mime_type": "image/jpeg"},
        {
            "type": "text",
            "text": "Compose a sweeping cinematic orchestral film score reflecting the epic scale and mysterious tone of this concept art. Instrumental only.",
        },
    ],
)

if interaction.output_audio:
    with open("film_score.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))
```

### 3. JavaScript / TypeScript SDK (`@google/genai`)

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({});

async function generateSong() {
  const interaction = await ai.interactions.create({
    model: "lyria-3.5",
    input: "An uplifting synthwave anthem at 124 BPM in A Minor with retro analog synthesizers and punchy drum machine. Instrumental only.",
  });

  if (interaction.output_audio) {
    fs.writeFileSync("synthwave_anthem.mp3", Buffer.from(interaction.output_audio.data, "base64"));
  }
}

generateSong();
```
