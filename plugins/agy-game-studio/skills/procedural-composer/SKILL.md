---
name: procedural-composer
description: >
  Pure-code procedural audio synthesis guide for sound effects (SFX) and
  polyphonic background music (BGM) in games. Generates 16-bit stereo PCM audio
  in memory without external audio files, featuring multi-channel polyphonic
  composition, ADSR envelopes, frequency modulation, and declarative JSON sound
  definitions with a CLI player and WAV exporter. Activate when synthesizing
  sound effects, composing chiptune background music, building zero-asset audio
  engines, or exporting procedural sounds to WAV.
license: Apache-2.0
metadata:
  category: game-dev
  tags: "procedural-audio, game-dev, chiptune, synth, sfx, bgm"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.0"
  catalog: https://skills.danicat.dev
---

# Procedural Composer: Pure-Code Audio Synthesis & Chiptune/Game Sound Engine Guide

This skill provides complete mathematical, musical, and software architecture patterns for generating high-quality sound effects (SFX) and polyphonic background music (BGM) purely in code—without relying on external `.wav`, `.mp3`, or `.ogg` audio files.

---

## Available scripts

- `scripts/sound.go`: Sound engine driver, 4-byte aligned PCM synthesizer, DSP post-processing pipeline (`SliceLoopPCM`, `ApplyLowPassFilter`, `ApplyHighPassFilter`, `ApplyBitcrush`), and declarative JSON audio definition parser.
- `scripts/sound_test.go`: Go unit tests and example BGM/SFX composition recipes.
- `scripts/play.go`: CLI audio player and WAV export utility.

---

## 1. Core Architectural Principles & DSP Foundations

### 1.1 Zero-Asset Engine Strategy
Procedural audio synthesizes audio samples on-the-fly or bakes them into PCM buffers in memory at application startup:
* **Zero disk I/O**: Eliminates asset loading failures and missing file errors.
* **Minimal footprint**: Thousands of sounds and complex soundtracks require only kilobytes of code.
* **Dynamic runtime control**: Real-time manipulation of pitch, tempo, filter cutoff, vibrato, and volume based on game state.

### 1.2 Output Format Standard & Mandatory 4-Byte PCM Frame Alignment (`&^ 3`)
Standard audio output uses 16-bit signed Little-Endian PCM stereo at 44,100 Hz (or 48,000 Hz):
* **Sample Rate ($f_s$)**: 44,100 Hz (44,100 stereo frames per second; `176,400` bytes/sec).
* **Channels**: 2 (Stereo: Left `[bytes 0–1]`, Right `[bytes 2–3]`).
* **Bits Per Sample**: 16-bit signed integer range `[-32,768 to +32,767]`.
* **Mandatory 4-Byte Alignment (`&^ 3`)**: Every stereo sample frame occupies exactly 4 bytes (2 bytes Left + 2 bytes Right). Ebitengine's `audio.Context`, `audio.NewInfiniteLoop`, `audio.NewInfiniteLoopWithIntro`, and stream `Seek` operations **panic at runtime** if given a buffer length or byte seek offset that is not a multiple of 4. Always mask lengths and offsets with bitwise AND-NOT 3 (`&^ 3`):
  ```go
  alignedLen := len(pcm) &^ 3
  alignedOffset := seekBytes &^ 3
  ```

### 1.3 Procedural DSP Post-Processing Pipeline
Beyond raw oscillator synthesis, [`scripts/sound.go`](scripts/sound.go) provides a pure-Go DSP post-processing pipeline for shaping synthesized or decoded 16-bit stereo PCM buffers:

1. **Loop Slicing (`SliceLoopPCM`)**:
   - Extracts a sample-accurate, 4-byte aligned sub-region `[startSec, endSec]` from a PCM buffer using `bytes.NewReader`, aligned `Seek(int64(startByte)&^3, io.SeekStart)`, and checked `io.ReadFull(reader, out)`.
   - Essential for trimming intro/outro silence or isolating seamless loop bars before passing the buffer to `audio.NewInfiniteLoop`.
2. **ADSR Amplitude Envelopes (`getEnvelope`)**:
   - Shapes note contour across four stages: **Attack** ($0 \to 1.0$ linear ramp over $t_A$), **Decay** ($1.0 \to S$ ramp over $t_D$), **Sustain** (constant amplitude $S$ while held), and **Release** ($S \to 0.0$ ramp over $t_R$).
   - Prevents DC-offset speaker clicks at note boundaries and distinguishes plucked arpeggios from swelling string pads.
3. **Single-Pole IIR Low-Pass & High-Pass Filtering (`ApplyLowPassFilter`, `ApplyHighPassFilter`)**:
   - **Low-Pass Filter (LPF)**: Attenuates harsh high-frequency harmonics via $y[n] = y[n-1] + \alpha (x[n] - y[n-1])$ where $\alpha \in (0, 1]$ controls cutoff warmth (useful for underwater muffling, warm synth pads, and explosion rumbles).
   - **High-Pass Filter (HPF)**: Removes DC offset and sub-bass mud via $y[n] = \alpha (y[n-1] + x[n] - x[n-1])$ where $\alpha \in (0, 1)$ isolates crisp transients (useful for hi-hats, radio comms, and UI clicks).
4. **Bitcrushing & Sample-Rate Decimation (`ApplyBitcrush`)**:
   - **Bit-Depth Quantization**: Right-shifts and left-shifts 16-bit samples (`(sample >> shift) << shift` where `shift = 16 - bitDepth`) to emulate gritty 4-bit or 8-bit DAC crunch.
   - **Downsampling (Sample-and-Hold)**: Holds each stereo frame for `downsample` consecutive frames to create classic retro aliasing and lo-fi metallic textures.

---

## 2. SECTION 1: Background Music (BGM) Composition & Architecture

### 2.1 Yamaha YM2612 Benchmark & Multi-Channel Richness Standard

To achieve rich, professional game soundtrack quality, procedural music generators should mimic or exceed the complexity of classic 16-bit sound chips such as the **Yamaha YM2612** (Sega Genesis) and **SNES SPC700**.

#### The YM2612 6-Channel Standard
A music track should feature **at least 6 distinct polyphonic channels/instrument layers** mixed simultaneously:

1. **FM Channel 1 (Lead Melody)**: Primary lead line (sawtooth or low-duty pulse wave with LFO vibrato).
2. **FM Channel 2 (Counter-Melody)**: Secondary counterpoint or call-and-response lead line.
3. **FM Channel 3 (Harmony Pad / Strings)**: Sustaining chord pad holding harmonic progression.
4. **FM Channel 4 (Bassline)**: Driving octave or walking bassline (square, saw, or triangle sub-bass).
5. **FM Channel 5 (Arpeggiator / Motion)**: Rapid 16th or 32nd note arpeggio runs for movement.
6. **FM Channel 6 / Noise (Drums / Percussion / SFX Stinger)**: Filtered noise bursts for snare/hi-hat or kick transients.

---

### 2.2 Dual Music Playback Architecture: One-Off vs. Looped Playback

The audio playback subsystem (`SoundSystem` in [`scripts/sound.go`](scripts/sound.go)) explicitly supports two distinct playback modes:
* **Looped Playback (`Play(pcm, true)`)**: For stage themes, boss battles, title screens, and menus where music must loop continuously without audible gaps using an infinite reader wrapper (`audio.NewInfiniteLoop`).
* **One-Off / Single Play (`Play(pcm, false)`)**: Default mode for game over music, stage clear fanfares, calamity alerts, and victory stingers that play once to completion and then stop without looping.

---

### 2.3 Style-Based Reference Baselines for Duration & Tempo (BPM)

Tempo (BPM) and track length are **heavily dictated by game style, genre, narrative mood, and scene context** (e.g., bullet-hell shmup vs. ambient puzzle vs. epic RPG). The table below offers flexible reference baselines rather than rigid rules:

#### BPM to Note Duration Calculation
```
t_beat = 60 / BPM
```
* **Quarter Note (1/4)**: `t_beat`
* **Eighth Note (1/8)**: `t_beat / 2`
* **Sixteenth Note (1/16)**: `t_beat / 4`
* **Measure (4/4 time)**: `240 / BPM` seconds

#### Flexible Scene Reference Table

| Scene / Event Type | Playback Mode | Typical Duration Baseline | Typical BPM Range | Composition Style & Musical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Stage / Gameplay** | **Looped** | 60s - 180s+ | 100 - 160 BPM | Multi-part structure (*Intro -> Theme A -> Theme B -> Climax -> Loop*) to prevent loop fatigue during long play sessions. |
| **Boss Battle** | **Looped** | 45s - 120s | 140 - 180+ BPM | Fast-paced, driving syncopation, diminished/phrygian modes, aggressive YM2612-style FM leads. |
| **Title / Menu** | **Looped** | 20s - 60s | 80 - 130 BPM | Catchy theme or ambient melody setting the game atmosphere. |
| **Game Over** | **One-Off** | 4s - 15s | 60 - 90 BPM | **Non-looping single play**. Sad descending chromatic slide or minor chord resolution. Keeps restart friction low. |
| **Stage Clear / Fanfare** | **One-Off** | 5s - 15s | 120 - 160 BPM | **Non-looping single play**. Triumphant ascending major arpeggio fanfare celebrating completion. |

---

## 3. SECTION 2: JSON Sound Format & CLI Player (`play.go`)

To test sound effects and multi-track compositions outside game runtimes, use the declarative **JSON Sound Format** parsed natively by [`scripts/sound.go`](scripts/sound.go).

### 3.1 Declarative JSON Sound Specification

#### Sound Effect JSON (`sfx_laser.json`)
```json
{
  "title": "Laser Bow Shot",
  "type": "sfx",
  "sequence": [
    {
      "wave_type": "square",
      "duration": 0.15,
      "start_freq": 800.0,
      "end_freq": 150.0,
      "duty_cycle": 0.25,
      "volume": 0.3,
      "attack": 0.01,
      "decay": 0.05,
      "sustain": 0.2,
      "release": 0.09,
      "pan": 0.0
    }
  ]
}
```

#### Multi-Track BGM Song JSON (`song_boss.json`)
```json
{
  "title": "Boss Battle Theme",
  "type": "song",
  "bpm": 150,
  "time_signature": "4/4",
  "tracks": [
    {
      "name": "Ch1 Sawtooth Lead",
      "pan": -0.2,
      "notes": [
        {
          "wave_type": "sawtooth",
          "duration": 0.2,
          "start_freq": 659.25,
          "end_freq": 659.25,
          "vibrato_freq": 8.0,
          "vibrato_depth": 10.0,
          "volume": 0.12,
          "attack": 0.02,
          "decay": 0.05,
          "sustain": 0.7,
          "release": 0.05
        }
      ]
    },
    {
      "name": "Ch4 Driving Bass",
      "pan": 0.0,
      "notes": [
        {
          "wave_type": "square",
          "duration": 0.2,
          "start_freq": 110.0,
          "end_freq": 110.0,
          "duty_cycle": 0.5,
          "volume": 0.14,
          "attack": 0.01,
          "decay": 0.1,
          "sustain": 0.5,
          "release": 0.05
        }
      ]
    }
  ]
}
```

---

### 3.2 Using the CLI Player Tool (`play.go`)

The CLI player [`scripts/play.go`](scripts/play.go) allows developers and testing agents to play or export audio definitions:

```bash
# 1. Play JSON sound effect or song (one-off by default)
go run ./scripts play sound.json

# 2. Play JSON sound effect or song in a loop
go run ./scripts play -loop song_stage.json

# 3. Play built-in 6-channel Genesis style demo soundtrack (one-off or -loop)
go run ./scripts demo
go run ./scripts demo -loop

# 4. Synthesize JSON definition and export directly to a 16-bit 44.1kHz Stereo .wav file
go run ./scripts export song_stage.json stage_theme.wav
```

---

## 4. Mandatory Quality Directives for AI Generation

When an AI agent uses this skill to compose audio or generate sound driver code:

1. **NEVER Generate Short 1-Bar or 2-Bar Musical Loops**:
   * Any BGM generated MUST be a complete composition spanning at least **8 to 16 bars** with chord progressions, theme development, and harmonic transitions.
2. **MANDATORY 6-Channel Polyphony**:
   * Every background soundtrack MUST feature at least **6 distinct polyphonic instrument tracks** (Lead, Counter-Melody, Harmony Pad, Bass, Arpeggiator, Drums/Percussion).
3. **MANDATORY Expressive Parameterization**:
   * Every note/track MUST specify tailored `DutyCycle` (0.125 - 0.5), `Pan` (stereo field distribution), `VibratoFreq`/`VibratoDepth` for lead instruments, and distinct ADSR envelope ramps.
4. **MANDATORY 32-Bit Summation & Clamping**:
   * Multi-track audio mixing MUST sum in 32-bit integers (`int32`) and hard-clamp to `[-32768, +32767]` to eliminate wrap-around distortion.
5. **No Monophonic Beeps**:
   * Sound effects must use frequency modulation sweeps, noise filters, or 2-stage note sequences (`GenerateSequencePCM`) to sound crisp, punchy, and retro-console authentic.

---

## 5. Gotchas & Engineering Best Practices

* **Integer Overflow Wrap-Around**: Summing track samples directly in `int16` causes violent digital clipping and speaker crackle. Always sum tracks in `int32` and hard-clamp to `[-32768, +32767]`.
* **Audio Popping & Clicks**: Instantly stopping a waveform oscillator creates a steep DC offset jump that sounds like a loud "pop" or click. Always apply a release envelope ramp (at least 5-10 ms).
* **Memory & Frame GC Spikes**: Avoid instantiating or generating PCM slices inside main frame rendering functions (`Update`/`Draw`). Pre-render all audio buffers during system initialization.
* **Audio Channel Choking**: High-frequency user events (e.g. clicking 50 times/sec) will choke audio players. Implement cooldown rate limiters (30-50 ms) on interactive triggers.

---

## 6. Summary Checklist for Procedural Audio Quality

1. **Pre-render SFX & Loops**: Generate PCM byte buffers on boot to keep execution overhead at zero during gameplay frames.
2. **Mimic YM2612 6-Channel Polyphony**: Layer at least 6 distinct instrument channels (Lead, Counterpoint, Pad, Bass, Arpeggio, Percussion/Noise) to achieve retro console soundtrack depth.
3. **Support Dual Playback Modes**: Provide both `Play(pcm, false)` (one-off) for stingers and `Play(pcm, true)` (infinite loop) for BGM.
4. **Hard-Clamp Mixed PCM**: Always sum in `int32` and clamp to `[-32768, +32767]` when mixing audio tracks to avoid harsh digital overflow wrap-around distortion.
5. **Declarative JSON & CLI Testing**: Use JSON sound definitions and `go run . export` to validate audio quality and generate `.wav` previews.
6. **Enforce AI Generation Quality Directives**: Enforce 16-bar length, 6-channel polyphony, and expressive parameterization on all agent outputs.

---

## 7. State-Based Adaptive BGM Composition Rules

When composing code-synthesized multi-track audio for dynamic game states:
- **Exploration / Ambient**: Low BPM (60-90), sparse instrumentation, soft pads, subtle woodwinds, key of C Major.
- **Tension / Stealth**: Medium BPM (90-110), staccato strings, muted sub-bass, ticking percussion.
- **Combat / Action / Boss**: High BPM (120-160+), driving drums, heavy bassline, intense brass/synths, key of D minor.
