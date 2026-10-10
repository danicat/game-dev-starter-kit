---
name: lyria
description: >
  Generative music and audio synthesis from text prompts or reference images
  using Google Lyria models. Generates 44.1 kHz stereo music clips, full songs
  with custom lyrics, and instrumental soundtracks using lyria-3.5 and
  lyria-3-clip-preview, with support for multimodal image inputs and MP3/WAV
  export. Activate when composing background music, generating songs, creating
  soundtracks from images, or producing AI audio clips.
license: Apache-2.0
metadata:
  category: media
  tags: "music, audio, generative-ai, sound"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.1"
  catalog: https://skills.danicat.dev
---

# Lyria Music Generation Skill

Generate high-fidelity **44.1 kHz stereo audio**, full songs with structured lyrics, instrumental soundtracks, and thematic compositions from text prompts or visual reference images using Google's **Lyria** foundation models (`lyria-3.5` / `lyria-3-pro-preview` and `lyria-3-clip` / `lyria-3-clip-preview`).

---

## Available scripts

- `scripts/lyria.py`: CLI tool for text-to-music and image-to-music generation, lyric export, and audio format conversion.
- `scripts/test_lyria.py`: Test suite verifying Lyria argument parsing, model aliases, fail-fast credential checks, and multimodal input limit enforcement.

---

## Trigger Conditions
Activate this skill whenever the user asks to:
- Generate music, songs, soundtracks, game audio beds, or background music.
- Compose musical themes inspired by artwork, concept photos, or screenshots.
- Create 30-second audio loops or multi-minute structured songs with verses, choruses, and custom lyrics.
- Synthesize instrumental audio tracks (`"Instrumental only, no vocals"`).

---

## Model Selection & Comparison Matrix

| Model | Model ID | CLI Name / Aliases | Primary Use Case | Duration | Audio Format | Reference Guide |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Lyria 3.5** | `lyria-3.5` (`lyria-3-pro-preview`) | `lyria-3.5`, `3.5`, `pro`, `lyria-pro`, `lyria-3-pro-preview` | Flagship: full songs, expressive vocals, multi-section arrangements, film/game scoring | Controllable (up to ~3m / 184s) | MP3, WAV | [lyria-3-5.md](references/lyria-3-5.md), [lyria-3-pro.md](references/lyria-3-pro.md) |
| **Lyria 3 Clip** | `lyria-3-clip-preview` | `lyria-3-clip`, `clip`, `lyria-clip`, `lyria-3-clip-preview` | Short clips, seamless 30s loops, previews, rapid style testing | Exactly 30s | MP3, WAV | [lyria-3-clip.md](references/lyria-3-clip.md) |

### Model Selection & Fail-Fast Policy
- **Full Song Production**: Use **Lyria 3.5** (`lyria-3.5` / `lyria-3-pro-preview`, default) for complete tracks with timestamped transitions (`[0:00 - 0:15] Intro...`), multi-verse vocal delivery, or cinematic thematic development.
- **Rapid Prototyping & Loops**: Start with **Lyria 3 Clip** (`lyria-3-clip` / `lyria-3-clip-preview`) to iterate quickly on genre combinations, tempos, and 30-second loops.
- **Zero Silent Fallbacks**: `scripts/lyria.py` never silently falls back between models, API endpoints, or authentication providers. Missing `GEMINI_API_KEY` (when Vertex AI is not explicitly requested via `--project` or `GOOGLE_GENAI_USE_VERTEXAI=true`), invalid model names, >10 reference images, or empty audio responses fail immediately with descriptive `stderr` diagnostics and a non-zero exit code.

---

## Deep Technical References

Consult dedicated reference cards in `references/` for detailed audio parameters, timing controls, and API schemas:

- **[references/lyria-3-5.md](references/lyria-3-5.md)**: Flagship specifications for full-length songs, rich vocal synthesis, and arrangements (`lyria-3.5`).
- **[references/lyria-3-clip.md](references/lyria-3-clip.md)**: Specifications for 30-second clips, loops, and rapid prototyping (`lyria-3-clip-preview`).
- **[references/lyria-3-pro.md](references/lyria-3-pro.md)**: Specifications for full-length preview endpoint (`lyria-3-pro-preview`), timestamp controls, and scoring.
- **[references/README.md](references/README.md)**: Musical composition prompt reference and index.

---

## Core Execution Workflows

### 1. CLI Execution via `scripts/lyria.py`

Execute `scripts/lyria.py` with `uv run`:

```bash
# Generate a full song with Lyria 3.5 (default model)
uv run scripts/lyria.py \
  -p "An energetic pop-rock song with driving drums and upbeat vocals" \
  -f "song.mp3" \
  -m "lyria-3.5" \
  --lyrics-file "lyrics.txt"

# Generate a 30-second chiptune arcade loop with Lyria 3 Clip
uv run scripts/lyria.py \
  -p "An energetic 8-bit chiptune arcade melody at 140 BPM in C major. Instrumental only." \
  -f "chiptune.mp3" \
  -m "lyria-3-clip"

# Multimodal Image-to-Music (compose music inspired by an image)
uv run scripts/lyria.py \
  -p "Ambient relaxing soundscape matching the mood of this landscape. Instrumental only." \
  -i "landscape.jpg" \
  -f "landscape_theme.mp3" \
  -m "lyria-3.5"
```

#### CLI Argument Reference
- `-p`, `--prompt`: Text prompt describing style, genre, instruments, BPM, and structure (required).
- `-f`, `--filename`: Output audio file path (default: `music.mp3`).
- `-m`, `--model`: `lyria-3.5` / `3.5` (default), `lyria-3-clip` / `clip` / `lyria-3-clip-preview`, or `pro` / `lyria-3-pro-preview`.
- `-i`, `--input-image`: Path to input image(s) for visual mood inspiration (up to 10).
- `--format`: Audio container format (`mp3` or `wav`).
- `--lyrics-file`: Optional path to write generated lyric transcription / structure text.
- `--api`: `interactions` (default) or `models`.

---

### 2. Dual SDK Integration Patterns

#### Interactions API (`client.interactions.create`) — Recommended

```python
import base64
from google import genai

client = genai.Client()

# Generate full-length song with timestamp structure
prompt = """
An atmospheric lo-fi beat in D Minor at 80 BPM:
[0:00 - 0:15] Intro: Dusty vinyl crackle and mellow electric piano chords.
[0:15 - 0:45] Verse: Warm boom-bap drum groove enters with subtle bassline.
[0:45 - 1:15] Chorus: Full melodic progression with saxophone accents.
[1:15 - 1:30] Outro: Slow fade out with piano alone.
"""

interaction = client.interactions.create(
    model="lyria-3.5",
    input=prompt,
)

if interaction.output_audio:
    with open("lofi_track.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))

if interaction.output_text:
    print("Generated Lyrics / Structure:\n", interaction.output_text)
```

#### Multimodal Image-to-Audio (Python)

```python
import base64
from google import genai

client = genai.Client()

with open("art_concept.png", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode("utf-8")

interaction = client.interactions.create(
    model="lyria-3.5",
    input=[
        {"type": "image", "data": img_b64, "mime_type": "image/png"},
        {"type": "text", "text": "Compose an ethereal cyberpunk synth soundtrack matching this neon cityscape. Instrumental only."},
    ],
)

if interaction.output_audio:
    with open("cyberpunk_theme.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))
```

---

## Prompting Best Practices
1. **Genre & Subgenre**: Be specific (e.g. `synthwave`, `delta blues`, `chamber pop`, `lo-fi hip-hop`).
2. **Instrumentation**: Name specific instruments (`Fender Rhodes`, `TR-808 drums`, `nylon-string guitar`, `cello`).
3. **Tempo & Key**: Include BPM and musical key (`120 BPM`, `in A Minor`).
4. **Vocal Control**: For instrumental tracks, explicitly specify `"Instrumental only, no vocals"`. For vocals, provide bracketed lyrics (`[Verse]`, `[Chorus]`).
5. **Timestamp Arrangements**: For Pro models, use bracketed timestamps (`[0:00 - 0:20]`) to direct transitions and builds.
