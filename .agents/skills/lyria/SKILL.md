---
name: lyria
description: Generate high-fidelity 44.1 kHz stereo music and audio from text prompts or images using Google's Lyria 3 models (lyria-3-clip-preview, lyria-3-pro-preview) with ADC authentication.
---

# Lyria Music Generation Skill

Generate high-fidelity **44.1 kHz stereo audio**, full songs, instrumental tracks, and soundtrack compositions from text prompts or images using Google's **Lyria 3** models (`lyria-3-clip-preview` and `lyria-3-pro-preview`) with Application Default Credentials (ADC) authentication.

---

## Trigger Conditions
Activate this skill whenever the user asks to:
- Generate music, songs, soundtracks, or background tracks.
- Compose audio inspired by an image or photo.
- Create 30-second music clips, loops, or full-length songs with custom lyrics.
- Trigger keywords: "lyria", "generate music", "compose a song", "make a track", "create a soundtrack", "background music".

---

## Model Selection & Comparison Matrix

| Model | Model ID | CLI Choice | Best For | Fixed Duration | Audio Output Formats |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Lyria 3 Clip** | `lyria-3-clip-preview` | `clip` / `lyria-3-clip-preview` | Short clips, loops, previews, fast experimentation | Exactly 30 seconds | MP3 |
| **Lyria 3 Pro** | `lyria-3-pro-preview` | `pro` / `lyria-3-pro-preview` | Full-length songs, multi-section compositions, professional production | A couple of minutes (controllable via prompt) | MP3, WAV |

### Recommendations
- **Experimentation**: Start with **Lyria 3 Clip** (`clip`) to test prompts and musical styles rapidly.
- **Full Production**: Upgrade to **Lyria 3 Pro** (`pro`) for multi-verse songs, custom lyrics, timestamp control, or WAV format outputs.

---

## Capabilities & Features

1. **High-Fidelity Audio**: Generates crisp, full 44.1 kHz stereo audio with structural coherence.
2. **Multimodal Generation**: Accepts up to **10 reference images** alongside text prompts to compose music matching visual mood and color scheme.
3. **Custom Lyrics & Structure**: Parses section tags (`[Verse 1]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]`) to align lyrics and vocals.
4. **Timestamp & Timing Control**: Supports explicit timestamps (e.g. `[0:00 - 0:10] Intro: soft lo-fi beat`) to define arrangement milestones.
5. **Instrumental Tracks**: Prompt with "Instrumental only, no vocals" to generate pure music beds without vocals.
6. **Multilingual Vocal Support**: Generates vocals and lyrics natively in the prompt's language (e.g., French, Spanish, Japanese).
7. **SynthID Watermarking**: All generated audio includes an imperceptible SynthID audio watermark for responsible AI attribution.

---

## Prompting Guide & Best Practices

### Recommended Prompt Structure
For optimal results, specify:
- **Genre & Blend**: e.g., "lo-fi hip hop", "cinematic orchestral", "synthwave pop".
- **Instruments**: e.g., "Fender Rhodes piano", "acoustic guitar", "TR-808 drum machine".
- **BPM / Tempo**: e.g., "120 BPM", "slow tempo around 70 BPM".
- **Musical Key / Scale**: e.g., "in G major", "in D minor".
- **Mood & Atmosphere**: e.g., "nostalgic", "soaring", "dark and ethereal".
- **Duration & Structure**: Use section tags or timestamps.

### Example Prompts

#### 1. Short Lo-Fi Instrumental Clip
> "A 30-second lofi hip hop beat with dusty vinyl crackle, mellow Rhodes piano chords, a slow boom-bap drum pattern at 85 BPM, and a jazzy upright bass line. Instrumental only."

#### 2. Full Pop Song with Custom Lyrics
```text
Create an upbeat, feel-good pop song in G major at 120 BPM with bright acoustic guitar and warm vocal harmonies:

[Verse 1]
Walking through the neon glow,
city lights reflect below.

[Chorus]
We are the echoes in the night,
burning brighter than the light.
```

#### 3. Timestamp-Controlled Cinematic Score
```text
[0:00 - 0:10] Intro: Begin with a soft lo-fi beat and vinyl crackle.
[0:10 - 0:30] Verse: Warm Rhodes piano melody with gentle vocals about a rainy morning.
[0:30 - 0:50] Chorus: Full orchestra with soaring synth leads and uplifting vocals.
[0:50 - 1:00] Outro: Fade out with piano melody alone.
```

---

## SDK Integration Examples

### Python (`google-genai`)

```python
import base64
from google import genai

client = genai.Client()

# Generate a 30-second clip
interaction = client.interactions.create(
    model="lyria-3-clip-preview",
    input="An energetic synthwave track with driving 808 drums at 128 BPM. Instrumental only."
)

# Extract audio and lyrics
if interaction.output_audio:
    with open("synthwave.mp3", "wb") as f:
        f.write(base64.b64decode(interaction.output_audio.data))

if interaction.output_text:
    print("Lyrics / Structure:\n", interaction.output_text)
```

### Multimodal Image-to-Music (Python)

```python
with open("landscape.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode("utf-8")

interaction = client.interactions.create(
    model="lyria-3-pro-preview",
    input=[
        {"type": "text", "text": "An atmospheric ambient orchestral track inspired by this scenery."},
        {"type": "image", "mime_type": "image/jpeg", "data": img_b64}
    ]
)
```

---

## Usage & Execution via CLI

Note: `{baseDir}` refers to the root directory of the installed skill.

Use `uv run` to execute the music generation script at `{baseDir}/scripts/lyria.py`.

### CLI Arguments
- `-p`, `--prompt`: Text prompt describing the music to generate (required).
- `-f`, `--filename`: Output audio file path (default: `music.mp3`).
- `-m`, `--model`: Model choice (`clip` / `lyria-3-clip-preview` or `pro` / `lyria-3-pro-preview`). Default: `pro`.
- `-i`, `--input-image`: Path to input image(s) for visual inspiration (up to 10).
- `--format`: Audio output format (`mp3` or `wav`).
- `--lyrics-file`: File path to save generated lyrics/structure text.
- `--project`: GCP Project ID for Vertex AI (optional).
- `--location`: GCP Location for Vertex AI (optional, default: `us-central1`).

### Example CLI Commands

```bash
# Generate a 30-second instrumental clip
uv run {baseDir}/scripts/lyria.py -p "A bright 8-bit retro video game chiptune melody in C major. Instrumental only." -f "chiptune.mp3" -m "clip"

# Generate a full-length song with lyrics
uv run {baseDir}/scripts/lyria.py -p "An epic cinematic orchestral song about a hero's return" -f "hero_journey.mp3" -m "pro" --lyrics-file "lyrics.txt"

# Generate music inspired by an image
uv run {baseDir}/scripts/lyria.py -p "Ambient relaxing soundscape matching the mood of this sunset" -i "sunset.jpg" -f "sunset_ambient.mp3" -m "pro"

# Generate high-quality WAV audio
uv run {baseDir}/scripts/lyria.py -p "Solo grand piano performance in A minor" -f "piano.wav" -m "pro" --format "wav"
```

---

## Key Limitations
- **Safety Filters**: Prompts requesting specific artist vocal clones or copyrighted lyrics will be blocked.
- **Single-Turn Generation**: Music generation is single-turn; multi-turn sequential editing of generated audio is not currently supported.
- **Duration**: Clip model is strictly 30 seconds. Pro model duration is controlled via prompt instructions or timestamps.
