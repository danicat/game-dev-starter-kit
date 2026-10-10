---
name: game-design
description: >
  Interactive game design workflow and Game Design Document (GDD) authoring
  guide for 2D games. Structures game ideation through interactive probing
  interviews, defining core gameplay loops, win and loss conditions, control
  schemes, visual asset pipelines, and audio strategies into a clean GDD.md.
  Activate when conceptualizing a new game, defining gameplay mechanics,
  conducting game design interviews (/grill-me), or authoring a Game Design
  Document.
license: Apache-2.0
metadata:
  category: game-dev
  tags: "gdd, mechanics, game-dev, prototyping"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.0"
  catalog: https://skills.danicat.dev
---

# Game Design & Interactive GDD Creation Guide (Game Designer Role)

This skill equips AI agents acting in the **Game Designer Role** with structured Socratic interview protocols, probing frameworks, and templates to guide users from initial 2D game ideas to a production-ready **Game Design Document (`GDD.md`)**.

> [!IMPORTANT]
> **100% Genre-Agnostic 2D Design Principle**:
> Never assume a 2D game uses side-scrolling gravity or platforming physics. This workflow supports **every 2D game genre**, including **Top-Down RPGs**, **Bullet-Heavens / Auto-Shooters**, **Twin-Stick & Vertical/Horizontal Shmups**, **Turn-Based Tactics**, **Roguelike Deckbuilders**, **Grid & Physics Puzzle Games**, **Visual Novels & Narrative Adventures**, **Rhythm & Arcade Games**, and **Side-Scrolling Platformers / Metroidvanias**. Always tailor spatial, simulation, control, and asset questions to the chosen genre.

---

## 1. Game Designer Role & Socratic Interview Protocol (`/grill-me`)

The **Game Designer Agent** aligns the user's creative and technical vision before any code or assets are generated:
1. **Interactive Socratic Interview (`/grill-me`)**: When starting a new game project or refining an idea, activate the `/grill-me` interview workflow (asking targeted, one-at-a-time probing questions) to systematically explore each branch of the game design tree.
2. **Provide Concrete Recommendations**: For every probing question, offer an expert recommendation tailored to the user's chosen 2D genre and Ebitengine runtime (e.g., *"Recommendation for a deckbuilder: 640x360 virtual resolution for crisp card typography and hover inspection"* or *"Recommendation for a retro bullet-heaven: 320x180 virtual canvas with spatial hash collision"*).
3. **Explicit Asset Pipeline Selection (Procedural vs. AI vs. Hybrid)**: Always ask the user to explicitly choose between **Pure-Code Procedural** (`procedural-art` / `procedural-composer`), **AI-Generated Media** (`nano-banana` / `lyria`), or a **Hybrid Pipeline** for both visuals and audio.
4. **Resolve Dependencies Sequentially**: Resolve genre, perspective, and core loop decisions before asking about art pipelines, and resolve mechanics before asking about audio.
5. **Produce Authoritative `GDD.md`**: Synthesize all agreed decisions into a structured `GDD.md` saved in the workspace root using [`references/gdd_template.md`](references/gdd_template.md).

---

## 2. Genre-Agnostic Socratic Interview Tree (`/grill-me` Workflow)

Follow this sequential branching tree when interviewing the user:

```text
Branch 1: Core Concept, Genre & Perspective
  ├── What is the 1-sentence hook / elevator pitch and primary inspiration?
  ├── What is the 2D genre? (Top-Down RPG, Bullet-Heaven, Shmup, Turn-Based Tactics, Deckbuilder, Puzzle, Visual Novel, Platformer)
  └── What is the camera perspective & spatial topology? (Top-down 2D plane, Isometric/Orthogonal Grid, Card Table/UI Canvas, Dialogue Stage, Side-View Arena)

Branch 2: Simulation Model, Core Loop & Win/Loss Conditions
  ├── Is simulation Real-Time Continuous (delta-time), Turn-Based / Phase-Driven, Discrete Grid-Step, or Event/Narrative-Driven?
  ├── What is the primary player loop? (Decision/Action -> Systemic Challenge -> Feedback/Progression)
  └── What are the exact quantitative win and loss conditions (or narrative endings)?

Branch 3: Controls & Input Mapping
  ├── What input devices are targeted? (Mouse/Pointer, Keyboard, Gamepad, Mobile Touch)
  └── What are the abstract logical actions? (e.g., Navigate/Move, Select/Primary, Cancel/Secondary, Context/Deck/Inventory, Pause)

Branch 4: Visual Art & Asset Pipeline Strategy (Explicit Choice Required)
  ├── What is the target visual aesthetic & virtual resolution? (e.g., 320x180 pixel art, 640x360 crisp tactical UI, neon vector)
  └── Which Visual Asset Pipeline should we use?
       ├── Option A: Pure-Code Procedural (`procedural-art`) — zero external image files; code-rendered sprites, vector shapes, particle pools, Kage shaders
       ├── Option B: AI-Generated Media (`nano-banana` + `sprite-animation`) — sprite sheets, portraits, card art, and tilesets via Nano Banana 2.1
       └── Option C: Hybrid Visual Pipeline — `nano-banana` for characters/cards/backgrounds + `procedural-art` for UI, particles, and Kage VFX shaders

Branch 5: Audio & Soundscape Pipeline Strategy (Explicit Choice Required)
  ├── Which Audio Pipeline should we use for BGM and SFX?
  │    ├── Option A: Pure-Code Procedural (`procedural-composer`) — zero external audio files; 16-bit stereo PCM synthesized in memory (6-channel BGM + FM/noise SFX)
  │    ├── Option B: AI-Generated Soundtrack (`lyria`) — 44.1 kHz stereo music tracks/loops via Lyria 3.5 (`lyria-3.5` / `lyria-3-clip-preview`)
  │    └── Option C: Hybrid Audio Pipeline — `lyria` for studio-quality BGM tracks/loops + `procedural-composer` for zero-latency procedural SFX and UI cues
  └── What specific musical mood, BPM range, and gameplay SFX triggers are needed?

Branch 6: Scene Flow, UI/HUD & Persistence
  ├── What scenes and HUD overlays are required? (Title, Gameplay, Tactical Overlay/Deck View, Dialogue Box, Victory/Game Over)
  └── What state persistence or backend integration is needed? (Local save state, run history, or Cloud Run leaderboard)
```

---

## 3. Template & Technical Standards

For the complete, genre-agnostic Game Design Document template, consult:

| Module | Reference File | Key Topics Covered |
| :--- | :--- | :--- |
| **GDD Template** | [`references/gdd_template.md`](references/gdd_template.md) | Genre-agnostic 7-section markdown template covering elevator pitch, spatial/simulation model, core loop, input mapping, explicit visual & audio asset pipeline choices (`nano-banana`/`lyria` vs. `procedural-art`/`procedural-composer` vs. hybrid), scene flow, and Ebitengine architecture notes. |

---

## 4. Probing Question Templates with Genre-Agnostic Recommendations

Use these Socratic question templates during the `/grill-me` session:

### Question 1: Genre, Perspective & Core Loop
> *"What is the 1-sentence hook for your game, what 2D genre and camera perspective does it use, and is it real-time or turn-based?"*
> **Recommendation**: *"Pick a tight, high-clarity 2D loop suited to your genre—for example, a top-down bullet-heaven with automatic weapon firing and spatial-hash swarm evasion; a turn-based grid tactics game on an 8x8 board with deterministic action points; a roguelike deckbuilder with mana/synergy combos; or a branching visual novel with character portrait expressions."*

### Question 2: Progression, Win & Loss Conditions
> *"How does a session progress, what triggers victory, and what causes defeat (or a failed run)?"*
> **Recommendation**: *"Define explicit, testable state thresholds—such as surviving a 5-minute escalating swarm and defeating the boss (Bullet-Heaven/Shmup), clearing 3 encounter nodes with HP > 0 (Deckbuilder/RPG), solving all grid constraints within the move par (Puzzle), or reaching a key narrative branch (Visual Novel)."*

### Question 3: Explicit Visual Asset Pipeline Choice (`procedural-art` vs. `nano-banana` vs. Hybrid)
> *"For visuals, do you want a Pure-Code Procedural pipeline (`procedural-art`), an AI-Generated asset pipeline (`nano-banana` + `sprite-animation`), or a Hybrid pipeline?"*
> **Recommendation**: *"Choose **Pure-Code Procedural (`procedural-art`)** for zero-asset geometric/neon games, puzzle grids, and particle-heavy effects; choose **AI-Generated (`nano-banana` + `sprite-animation`)** for rich character portraits, visual novels, card illustrations, and animated pixel sprite sheets; or choose **Hybrid** (`nano-banana` for hero/enemy sprites and backgrounds + `procedural-art` for UI panels, projectiles, particles, and Kage shaders)."*

### Question 4: Explicit Audio Pipeline Choice (`procedural-composer` vs. `lyria` vs. Hybrid)
> *"For audio, do you want Pure-Code Procedural synthesis (`procedural-composer`), AI-Generated studio music (`lyria`), or a Hybrid audio pipeline?"*
> **Recommendation**: *"Choose **Hybrid** (`lyria` using `lyria-3.5` / `lyria-3-clip-preview` for atmospheric 44.1 kHz stereo BGM loops + `procedural-composer` for instant, zero-latency gameplay SFX and UI clicks), or choose **Pure-Code Procedural (`procedural-composer`)** if you want a 100% self-contained zero-asset binary with YM2612-style 6-channel chiptune BGM and synthesized SFX."*

---

## 5. GDD Generation Checklist

Before handing off the generated `GDD.md` to downstream skills (`ebitengineer`, `procedural-art`, `nano-banana`, `sprite-animation`, `lyria`, `procedural-composer`):

- [ ] **Elevator Pitch & Genre Defined**: Clear 1-sentence hook, 2D genre, camera perspective, and simulation model (real-time vs. turn-based/grid/narrative) established without unstated platformer assumptions.
- [ ] **Core Loop & Win/Loss Explicit**: Player decisions/actions, systemic rules, and quantitative win/loss triggers mapped out.
- [ ] **Controls Mapped**: Logical actions bound to appropriate devices (Mouse/Pointer, Keyboard, Gamepad, Touch).
- [ ] **Visual Pipeline Explicitly Selected**: Documented as Pure-Code (`procedural-art`), AI-Generated (`nano-banana` + `sprite-animation`), or Hybrid with per-asset breakdown.
- [ ] **Audio Pipeline Explicitly Selected**: Documented as Pure-Code (`procedural-composer`), AI-Generated (`lyria`), or Hybrid with BGM and SFX assignments.
- [ ] **Saved to Disk**: Document committed as `GDD.md` in workspace root.
