---
name: vibe-game-developer
description: >-
  Master orchestrator and request router for 2D game development in Go using Ebitengine and Gemini AI models. Activate when handling user requests for game creation, game architecture, asset generation (procedural code vs. generative AI audio/images), Go code quality, or WebAssembly deployment.
---

# Vibe Game Developer: Master Orchestrator & Request Router

This master skill teaches the agent how to analyze, classify, and route user game development requests to the specialized skill best suited for the task.

> [!NOTE]
> **Genre-Agnostic Design Principle**:
> All skills and reference modules in this suite provide **generic, highly adaptable building blocks suitable for any 2D game genre** (puzzle, arcade, strategy, platformer, racing, rhythm, RPG, shmup, or simulation). Specific code examples (such as progress bars, jump gravity curves, or A* pathfinding) are illustrative patterns—apply and adapt only the components that fit the game's unique design and mechanics.

---

## 1. Skill Selection & Intent Routing Matrix

When responding to user requests, evaluate the underlying engineering need and activate the primary specialized skill according to this decision matrix:

| User Intent / Request Type | Primary Specialized Skill | Key Technical Characteristics |
| :--- | :--- | :--- |
| **Game Design & Concept Probing** | **[`game-design`](../game-design/SKILL.md)** | Game Designer role: interactive `/grill-me` probing interview, mechanics, controls, art/audio strategy, and `GDD.md` creation. |
| **Ebitengine 2D Game Architecture** | **[`ebitengineer`](../ebitengineer/SKILL.md)** | Ebitengine game loop, 16:9 canvas, FSM scene flow, WASM touch, Cloud Run deployment, plus 6 core engine modules: Physics/Collisions (`AABB`/Spatial Hash), Tilemaps/Autotiling, UI/HUD (9-slice/anchors), Action Mapping, Entity Pools/ECS, and A* Pathfinding/AI. |
| **Pure-Code DSP Audio Synthesis** | **[`procedural-composer`](../procedural-composer/SKILL.md)** | Zero-asset runtime DSP sound engine (`sound.go`), YM2612 6-channel polyphony, FM synthesis, ADSR envelopes, JSON sound format, and CLI player (`play.go`). |
| **Generative CD-Quality AI Music** | **[`lyria`](../lyria/SKILL.md)** | High-fidelity 44.1 kHz stereo music (`lyria-3-clip-preview` & `lyria-3-pro-preview`), custom lyrics, section tags (`[Verse]`, `[Chorus]`), multimodal image-to-music, and `.mp3`/`.wav` export. |
| **Pure-Code Procedural 2D Graphics** | **[`procedural-art`](../procedural-art/SKILL.md)** | Pure-code Go texture generation (`art.go`), 2D matrix transformation math (`GeoM`), 32-bit RGBA color ramps, non-linear easing, pre-allocated particle pools, and Kage shaders. |
| **Generative AI Images & Pixel Art** | **[`nano-banana`](../nano-banana/SKILL.md)** | Conversational image generation via Gemini Nano Banana models (`gemini-3.1-flash-image`, `gemini-3.1-pro-image`), pixel art prompts, and character consistency (Anime Dani / Chibi Dani). |
| **2D Sprite Animation (Animator Role)** | **[`sprite-animation`](../sprite-animation/SKILL.md)** | Animator subagent role: sprite sheet grid slicing, animation tag state machines, Aseprite `.ase`/`.aseprite` parsing, `SolarLune/goaseprite` integration, and Go controllers. |
| **Go Code Quality & Testing** | **[`godoctor`](../godoctor/SKILL.md)** | Go style guidelines, flat package architecture, `smart_build`, `smart_edit`, TestQuery SQL test log analyzer, and Selene mutation testing. |
| **Parallel Feature Swarm Orchestration** | **[`swarm-coding`](../swarm-coding/SKILL.md)** | Multi-agent parallel task decomposition for full-stack features or large refactorings. |

---

## 2. Decision Rules: Pure-Code Procedural vs. Generative AI Assets

A critical responsibility of this master skill is determining whether an asset request should be built **procedurally in pure Go code** or **generated using Gemini AI models**:

### 2.1 Audio & Music Routing Rules

* **Choose [`procedural-composer`](../procedural-composer/SKILL.md)** when:
  - The user requests **Game Sound Effects (SFX)**: button clicks, coin pick-ups, laser blasts, jumps, explosions, or UI audio cues.
  - The user requests retro chiptune audio, synthesized waveforms, or lightweight FM audio.
  - The game requires zero external `.mp3`/`.wav` dependencies or real-time dynamic pitch/filter manipulation during gameplay.
  - The user requests a JSON sound specification or code-driven audio engine implementation (`sound.go`).

* **Choose [`lyria`](../lyria/SKILL.md)** when:
  - The user requests **Background Music (BGM)**: CD-quality 44.1 kHz stereo music tracks, full songs with custom lyrics, instrumental score beds, or BGM loops.
  - The user wants to compose background music matching a visual reference image or photo.
  - Output music must be exported as standalone `.mp3` or `.wav` audio files.

---

### 2.2 Graphics & Visual Routing Rules

* **Choose [`procedural-art`](../procedural-art/SKILL.md)** when:
  - The user requests pure-code texture generation (`art.go`), vector geometry, dynamic particle systems (explosions, fire, magic), or custom Kage post-processing shaders.
  - The game requires zero disk I/O, infinite resolution scaling, or real-time palette swapping in Go memory.
  - The request involves matrix transformation ordering, sub-frame interpolation curves, or direct bitmap pixel crafting.

* **Choose [`nano-banana`](../nano-banana/SKILL.md)** when:
  - The user requests AI-generated concept art, character avatars, item icons, or AI pixel art sprites (`16x16`, `32x32`, `64x64`).
  - The request specifies character visual consistency for recurring characters (**Anime Dani**, **Daniela**, or **Chibi Dani**).
  - The output is an image file (`.png`/`.jpg`).

---

## 3. Standard End-to-End Game Workflow

When guiding the user through building a complete 2D game from scratch:

1. **Game Concept & GDD**: Activate `game-design` (`/grill-me`) to probe player vision, define core mechanics, controls, art/audio strategy, and save `GDD.md`.
2. **Architecture & Scope**: Activate `ebitengineer` to set up package structure (`internal/`), 16:9 virtual pixel canvas, delta time ($dt$) 60 FPS timing, and FSM scene progression.
3. **Visual Art & Sprites**:
   - For UI/particle FX/vector geometry $\rightarrow$ Activate `procedural-art`.
   - For character concept art / AI pixel sprite sheets $\rightarrow$ Activate `nano-banana` + `sprite-animation`.
4. **Sound Effects & Music**:
   - For retro SFX & synthesized chiptunes $\rightarrow$ Activate `procedural-composer`.
   - For high-fidelity background music beds $\rightarrow$ Activate `lyria`.
5. **Code Review & Quality Gate**: Activate `godoctor` (`smart_build`, unit testing, Selene mutation testing) to ensure code correctness and test coverage.
6. **Deployment**: Activate `ebitengineer` to compile to WebAssembly and configure Google Cloud Run deployment with multi-stage Docker builds.
