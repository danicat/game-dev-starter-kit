# Lyria 3 Pro (`lyria-3-pro-preview`) Model Card

## Overview
**Lyria 3 Pro** (`lyria-3-pro-preview`) is Google's flagship music generation model. It is architected for full-length songs and complex musical compositions featuring multi-section structures (intro, verse, chorus, bridge, solo, outro), explicit timestamp controls, dynamic intensity shaping, and multilingual vocal synthesis.

- **Model Code**: `lyria-3-pro-preview`
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
| **Audio Output Duration** | **Up to 184 seconds** (~3 minutes, controllable via prompt) |
| **Audio Quality** | 44.1 kHz stereo, 192 kbps bitrate |
| **Supported MIME Types** | `audio/mp3`, `audio/wav` |
| **Supported Languages** | English, German, Spanish, French, Hindi, Japanese, Korean, Portuguese |
| **Structural Controls** | Timestamps, BPM, Key, Section Tags, Dynamic Intensity |
| **Watermarking** | SynthID (Audio) + C2PA Content Credentials |

---

## Advanced Composition Features

### 1. Timestamp & Section Arrangement Control
Lyria 3 Pro interprets precise timestamp blocks to coordinate instrument entrances, vocal delivery, and dynamic transitions:

```text
[0:00 - 0:15] Intro: Slow atmospheric synthesizer pad in D minor with light rain sounds.
[0:15 - 0:45] Verse 1: Acoustic guitar enters with introspective male vocals singing about twilight.
[0:45 - 1:15] Chorus: Full drums and soaring electric guitar with high energy vocal harmonies.
[1:15 - 1:35] Bridge: Stripped-down piano melody building tension.
[1:35 - 2:05] Final Chorus: Maximum intensity with orchestra and choir backing.
[2:05 - 2:20] Outro: Slow guitar strumming fading to silence.
```

### 2. User-Provided Lyrics & Section Tags
You can pass complete original lyrics structured by section:

```text
Create a modern indie rock anthem at 125 BPM in A Major:

[Verse 1]
Midnight shadows on the pavement wall
Waiting for the summer rain to fall

[Chorus]
We run through the electric haze
Counting down the golden days
```

### 3. Multimodal Image-to-Song Generation
Pass up to 10 images (e.g. concept art, character designs, landscapes) to generate a customized thematic soundtrack that captures the emotional tone and aesthetic mood.

---

## SDK Code Examples

### 1. Full Song with Timestamps & Structure (Python)

```python
import base64
from google import genai

client = genai.Client()

prompt = """
An emotional cinematic folk song in E Minor at 90 BPM with fingerpicked acoustic guitar and cello:

[0:00 - 0:20] Intro: Gentle fingerpicked acoustic guitar with subtle cello harmony.
[0:20 - 0:50] Verse 1: Warm vocals singing about distant mountains under winter skies.
[0:50 - 1:20] Chorus: Swelling strings and acoustic rhythm with resonant vocal harmonies.
[1:20 - 1:40] Outro: Soft solo cello fading out.
"""

interaction = client.interactions.create(
    model="lyria-3-pro-preview",
    input=prompt,
    response_format={"type": "audio"},
)

if interaction.output_audio:
    with open("mountain_folk.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))

if interaction.output_text:
    with open("mountain_folk_lyrics.txt", "w") as f:
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
    model="lyria-3-pro-preview",
    input=[
        {"type": "image", "data": read_b64("concept_art.jpg"), "mime_type": "image/jpeg"},
        {
            "type": "text",
            "text": "Compose a sweeping orchestral film score reflecting the epic scale and mysterious mood of this landscape. Instrumental only.",
        },
    ],
)

if interaction.output_audio:
    with open("film_score.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))
```
