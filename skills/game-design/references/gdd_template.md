# Game Design Document (GDD) Template

> **Game Title**: [Insert Title]  
> **Target Genre**: [e.g., Arcade, Puzzle, Platformer, Shmup, Strategy, Rhythm, Action]  
> **Target Platform**: Desktop (Windows/macOS/Linux) & WebAssembly (Google Cloud Run)  
> **Target Aspect Ratio & Resolution**: 16:9 Widescreen (`320x180` or `640x360` Virtual Pixel Canvas)  
> **Author / Lead Designer**: [User Name / Agent]  

---

## 1. Executive Summary & Elevator Pitch
- **Elevator Pitch**: [1–2 sentence hook describing the core player fantasy and main gameplay twist]
- **Core Inspiration**: [e.g. *Space Invaders meets Match-3*, *Flappy Bird with gravity reversal*]
- **Target Audience / Mood**: [e.g. Fast-paced arcade action, relaxing ambient puzzle, tense survival]

---

## 2. Core Gameplay Loop & Mechanics
- **Primary Gameplay Loop**: [Step-by-step description of player action $\rightarrow$ challenge $\rightarrow$ reward/feedback cycle]
- **Core Mechanics**:
  - **Player Abilities / Actions**: [e.g., Move, Jump, Shoot, Dash, Rotate Tile, Swap Gem]
  - **Interactions / Hazards**: [e.g., Enemy AI, Falling Obstacles, Timer Pressure, Spikes]
- **Win & Loss Conditions**:
  - **Win Condition**: [e.g., Reaching target score, clearing level 10, defeating boss]
  - **Loss Condition**: [e.g., Health reaches 0, timer expires, grid fills up]

---

## 3. Controls & Input Mapping Scheme
- **Primary Input Devices**: Keyboard / Mouse / Gamepad / Mobile Touch
- **Default Control Scheme**:
  | Logical Action | Keyboard / Mouse | Gamepad Button | Touch Gesture |
  | :--- | :--- | :--- | :--- |
  | `ActionMove` | `A` / `D` or `Left` / `Right` | D-Pad / Left Stick | On-screen Virtual D-Pad |
  | `ActionPrimary` | `Space` / `J` / Left Click | Button South (`A` / `X`) | Tap Screen Region |
  | `ActionPause` | `Escape` / `P` | Start Button | Pause Icon Button |

---

## 4. Visual Style & Asset Strategy
- **Aesthetic Direction**: [e.g. 16-bit Retro-HD, Cyberpunk Neon, Chibi Pixel Art, Minimalist Vector]
- **Asset Creation Approach**:
  - **Procedural Pure-Code (`procedural-art`)**: [e.g., UI panels, particle systems, Kage shaders, vector shapes]
  - **Generative AI Assets (`nano-banana`)**: [e.g., Character sprite sheets, background concept art, item icons]
- **Animation Sequence Needs**:
  - Character States: `idle` ($6\text{f}$), `run` ($8\text{f}$), `attack` ($8\text{f}$), `death` ($6\text{f}$)

---

## 5. Audio & Soundscape Strategy
- **Background Music (BGM)**:
  - Style & Mood: [e.g. High-energy synthwave, ambient lo-fi, 8-bit FM chiptune]
  - Creation Engine: `lyria` (CD-quality 44.1 kHz stereo) OR `procedural-composer` (pure-code DSP chiptune)
- **Sound Effects (SFX)**:
  - Required SFX: Button clicks, action discharge, collision/impact, coin pick-up, game over fanfare
  - Creation Engine: `procedural-composer` (code-synthesized waveforms and noise bursts)

---

## 6. Game State Sequence & HUD Layout
- **Scene Flow**: `Boot` (Logo) $\rightarrow$ `Intro` $\rightarrow$ `Title Screen` (w/ Attract Demo Mode) $\rightarrow$ `Gameplay` $\rightarrow$ `Game Over / Victory`
- **HUD & UI Overlay**:
  - Displayed Metrics: [e.g. Score counter, timer, health bar, level indicator]
  - Layout Anchoring: Top-Left (Score/Lives), Top-Right (Timer), Center (Game Over Modal)

---

## 7. Technical Scope & Architecture Notes
- **Ebitengine Subsystem Plan**:
  - Physics/Collision: [AABB / Spatial Hash / Tile Raycast]
  - Level Layout: [Tilemap autotiling / Procedural grid / Fixed arena]
  - Server Backend: High score submission to Cloud Run REST API (`/api/v1/scores`)
