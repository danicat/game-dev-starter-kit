---
name: procedural-composer
description: >-
  Use this skill when designing, implementing, or optimizing pure-code procedural audio synthesis engines, sound effects (SFX), or polyphonic background music (BGM) without external assets. Activate for any questions or tasks involving audio DSP math, FM synthesis, ADSR envelopes, sound chip emulation (YM2612, SPC700, PS1 SPU), chiptunes, multi-track audio mixing, or game sound system code.
---

# Procedural Composer: Pure-Code Audio Synthesis & Chiptune/Game Sound Engine Guide

This skill provides complete mathematical, musical, and software architecture patterns for generating high-quality sound effects (SFX) and polyphonic background music (BGM) purely in code—without relying on external `.wav`, `.mp3`, or `.ogg` audio files.

> [!TIP]
> **Example Sound Driver & CLI Tool Suite**:
> All driver, test, and player components reside together in [`scripts/`](./scripts/):
> * **Sound Engine Driver & JSON Parser**: [`scripts/sound.go`](./scripts/sound.go)
> * **Masterclass BGM/SFX Examples (`ExampleXxx`)**: [`scripts/sound_test.go`](./scripts/sound_test.go)
> * **Lean CLI Audio Player**: [`scripts/play.go`](./scripts/play.go)

---

## 1. Core Architectural Principles & DSP Foundations

### 1.1 Zero-Asset Engine Strategy
Procedural audio synthesizes audio samples on-the-fly or bakes them into PCM buffers in memory at application startup:
* **Zero disk I/O**: Eliminates asset loading failures and missing file errors.
* **Minimal footprint**: Thousands of sounds and complex soundtracks require only kilobytes of code.
* **Dynamic runtime control**: Real-time manipulation of pitch, tempo, filter cutoff, vibrato, and volume based on game state.

### 1.2 Output Format Standard
Standard audio output uses 16-bit signed Little-Endian PCM stereo at 44,100 Hz (or 48,000 Hz):
* **Sample Rate ($f_s$)**: $44,100 \text{ Hz}$ (44,100 samples per second per channel).
* **Channels**: 2 (Stereo: Left [bytes 0–1], Right [bytes 2–3]).
* **Bits Per Sample**: 16-bit signed integer range $[-32,768 \text{ to } +32,767]$.

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

The audio playback subsystem (`SoundSystem` in [`scripts/sound.go`](./scripts/sound.go)) explicitly supports two distinct playback modes:
* **Looped Playback (`Play(pcm, true)`)**: For stage themes, boss battles, title screens, and menus where music must loop seamlessly without gaps using an infinite reader wrapper (`audio.NewInfiniteLoop`).
* **One-Off / Single Play (`Play(pcm, false)`)**: Default mode for game over music, stage clear fanfares, calamity alerts, and victory stingers that play once to completion and then stop without looping.

---

### 2.3 Style-Based Reference Baselines for Duration & Tempo (BPM)

Tempo (BPM) and track length are **heavily dictated by game style, genre, narrative mood, and scene context** (e.g., bullet-hell shmup vs. ambient puzzle vs. epic RPG). The table below offers flexible reference baselines rather than rigid rules:

#### BPM to Note Duration Calculation
$$t_{\text{beat}} = \frac{60}{\text{BPM}}$$
* **Quarter Note ($1/4$)**: $t_{\text{beat}}$
* **Eighth Note ($1/8$)**: $t_{\text{beat}} / 2$
* **Sixteenth Note ($1/16$)**: $t_{\text{beat}} / 4$
* **Measure ($4/4$ time)**: $240 / \text{BPM}$ seconds

#### Flexible Scene Reference Table

| Scene / Event Type | Playback Mode | Typical Duration Baseline | Typical BPM Range | Composition Style & Musical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Stage / Gameplay** | **Looped** | $60\text{s} - 180\text{s}+$ | $100 - 160\text{ BPM}$ | Multi-part structure (*Intro $\rightarrow$ Theme A $\rightarrow$ Theme B $\rightarrow$ Climax $\rightarrow$ Loop*) to prevent loop fatigue during long play sessions. |
| **Boss Battle** | **Looped** | $45\text{s} - 120\text{s}$ | $140 - 180+\text{ BPM}$ | Fast-paced, driving syncopation, diminished/phrygian modes, aggressive YM2612-style FM leads. |
| **Title / Menu** | **Looped** | $20\text{s} - 60\text{s}$ | $80 - 130\text{ BPM}$ | Catchy theme or ambient melody setting the game atmosphere. |
| **Game Over** | **One-Off** | $4\text{s} - 15\text{s}$ | $60 - 90\text{ BPM}$ | **Non-looping single play**. Sad descending chromatic slide or minor chord resolution. Keeps restart friction low. |
| **Stage Clear / Fanfare** | **One-Off** | $5\text{s} - 15\text{s}$ | $120 - 160\text{ BPM}$ | **Non-looping single play**. Triumphant ascending major arpeggio fanfare celebrating completion. |

---

## 3. SECTION 2: JSON Sound Format & CLI Player (`play.go`)

To test sound effects and multi-track compositions outside game runtimes, use the declarative **JSON Sound Format** parsed natively by [`scripts/sound.go`](./scripts/sound.go).

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

The CLI player [`scripts/play.go`](./scripts/play.go) allows developers and testing agents to play or export audio definitions. Note: adjust the path to be relative to the skill directory

```bash
# 1. Play JSON sound effect or song (one-off by default)
go run . play sound.json

# 2. Play JSON sound effect or song in a loop
go run . play -loop song_stage.json

# 3. Play built-in 6-channel Genesis style demo soundtrack (one-off or -loop)
go run . demo
go run . demo -loop

# 4. Synthesize JSON definition and export directly to a 16-bit 44.1kHz Stereo .wav file
go run . export song_stage.json stage_theme.wav
```

---

## 4. Mandatory Quality Directives for AI Generation

When an AI agent uses this skill to compose audio or generate sound driver code:

1. **NEVER Generate Short 1-Bar or 2-Bar Musical Loops**:
   * Any BGM generated MUST be a complete composition spanning at least **8 to 16 bars** with chord progressions, theme development, and harmonic transitions.
2. **MANDATORY 6-Channel Polyphony**:
   * Every background soundtrack MUST feature at least **6 distinct polyphonic instrument tracks** (Lead, Counter-Melody, Harmony Pad, Bass, Arpeggiator, Drums/Percussion).
3. **MANDATORY Expressive Parameterization**:
   * Every note/track MUST specify tailored `DutyCycle` ($0.125 - 0.5$), `Pan` (stereo field distribution), `VibratoFreq`/`VibratoDepth` for lead instruments, and distinct ADSR envelope ramps.
4. **MANDATORY 32-Bit Summation & Clamping**:
   * Multi-track audio mixing MUST sum in 32-bit integers (`int32`) and hard-clamp to `[-32768, +32767]` to eliminate wrap-around distortion.
5. **No Monophonic Beeps**:
   * Sound effects must use frequency modulation sweeps, noise filters, or 2-stage note sequences (`GenerateSequencePCM`) to sound crisp, punchy, and retro-console authentic.

---

## 5. Gotchas & Engineering Best Practices

* **Integer Overflow Wrap-Around**: Summing track samples directly in `int16` causes violent digital clipping and speaker crackle. Always sum tracks in `int32` and hard-clamp to `[-32768, +32767]`.
* **Audio Popping & Clicks**: Instantly stopping a waveform oscillator creates a steep DC offset jump that sounds like a loud "pop" or click. Always apply a release envelope ramp (at least $5\text{--}10\text{ ms}$).
* **Memory & Frame GC Spikes**: Avoid instantiating or generating PCM slices inside main frame rendering functions (`Update`/`Draw`). Pre-render all audio buffers during system initialization.
* **Audio Channel Choking**: High-frequency user events (e.g. clicking 50 times/sec) will choke audio players. Implement cooldown rate limiters ($30\text{--}50\text{ ms}$) on interactive triggers.

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
- **Exploration / Ambient**: Low BPM ($60\text{--}90$), sparse instrumentation, soft pads, subtle woodwinds, key of C Major.
- **Tension / Stealth**: Medium BPM ($90\text{--}110$), staccato strings, muted sub-bass, ticking percussion.
- **Combat / Action / Boss**: High BPM ($120\text{--}160+$), driving drums, heavy bassline, intense brass/synths, key of D minor.
