# Game Design Document (GDD) Template

> **Game Title**: [Insert Title]
> **Target 2D Genre**: [e.g., Top-Down RPG, Bullet-Heaven, Shmup, Turn-Based Tactics, Deckbuilder, Puzzle, Visual Novel, Platformer, Arcade]
> **Camera Perspective & Spatial Model**: [e.g., Top-Down 2D Plane, Orthogonal/Isometric Grid, Card Table / UI Canvas, Narrative Stage, Side-View Arena]
> **Simulation Model**: [e.g., Real-Time Continuous ($\Delta t$), Turn-Based Phases, Discrete Grid-Step, Event/Dialogue-Driven]
> **Target Platform**: Desktop (Windows/macOS/Linux) & WebAssembly (Browser / Google Cloud Run)
> **Target Aspect Ratio & Virtual Canvas**: [e.g., 16:9 Widescreen (`320x180`, `640x360`, or `1280x720`) / 4:3 Retro]
> **Author / Lead Designer**: [User Name / Agent]

---

## 1. Executive Summary & Elevator Pitch
- **Elevator Pitch**: [1–2 sentence hook describing the core player fantasy, 2D genre, and primary mechanic twist]
- **Core Inspiration**: [e.g., *Vampire Survivors meets Chess*, *Slay the Spire with spatial grid positioning*, *Into the Breach*, *Celeste*, *Ace Attorney*]
- **Target Audience & Mood**: [e.g., High-intensity bullet-hell survival, cerebral turn-based strategy, cozy narrative mystery]

---

## 2. Core Gameplay Loop, Simulation & Mechanics
- **Primary Gameplay Loop**: [Step-by-step description of player decision/action -> systemic challenge -> feedback/progression cycle]
- **Spatial & Simulation Rules**:
  - **Movement / Interaction Topology**: [e.g., Free 360° vector movement, 8-way grid stepping, pointer card drag-and-drop, dialogue choice selection, or gravity-based platforming]
  - **Player Abilities / Actions**: [e.g., Auto-fire & dash, cast card from hand, command squad unit on tile, rotate puzzle cluster, present evidence]
  - **Systemic Challenges / Opponents**: [e.g., Swarming enemy waves, enemy turn AI intent, mana/turn limits, board space constraints, branching dialogue locks]
- **Win & Loss Conditions**:
  - **Win Condition**: [e.g., Surviving 10-minute swarm & defeating final boss, clearing Act 3 boss node, solving all grid constraints, reaching True Ending]
  - **Loss Condition**: [e.g., Player/Party HP reaches 0, command center destroyed, deck/moves exhausted, timer expires]

---

## 3. Controls & Input Mapping Scheme
- **Primary Input Devices**: [Mouse/Pointer, Keyboard, Gamepad, Mobile Touch]
- **Default Control Scheme**:
  | Logical Action | Keyboard / Mouse | Gamepad Button | Touch Gesture |
  | :--- | :--- | :--- | :--- |
  | `ActionNavigate / Move` | `WASD` / `Arrows` / Mouse Cursor | Left Stick / D-Pad | Virtual Stick / Drag |
  | `ActionPrimary / Confirm` | `Space` / `Enter` / Left Click | Button South (`A` / `Cross`) | Tap Target / Card |
  | `ActionSecondary / Cancel` | `Shift` / `Right Click` / `Backspace` | Button East (`B` / `Circle`) | Two-Finger Tap |
  | `ActionContext / Inspect` | `Tab` / `E` / Middle Click | Button North (`Y` / `Triangle`) | Long Press |
  | `ActionPause` | `Escape` / `P` | Start / Options | Pause Icon Button |

---

## 4. Visual Style & Asset Pipeline Strategy
- **Aesthetic Direction**: [e.g., 16-bit Pixel Art, Crisp Tactical Vector UI, Hand-Drawn Visual Novel Portraits, Neon Cyber Geometry]
- **Selected Visual Pipeline Mode** *(explicitly chosen during `/grill-me`)*: `[Pure-Code Procedural | AI-Generated Media | Hybrid Pipeline]`
  - **Pure-Code Procedural (`procedural-art`) Assignments**: [e.g., UI 9-slice panels, grid overlays, projectiles, particle pools, Kage post-processing shaders]
  - **AI-Generated Media (`nano-banana` — `gemini-nano-banana-2.1`) Assignments**: [e.g., Character sprite sheets, visual novel portraits, deckbuilder card art, seamless tilesets, background illustrations]
- **Sprite Slicing & Animation (`sprite-animation`)**:
  - **Animated Entities & States**: [e.g., Top-down unit (`idle`, `walk`, `cast`, `hit`, `defeat`), card sheen/flip states, or character portrait expressions (`neutral`, `happy`, `shocked`)]

---

## 5. Audio & Soundscape Pipeline Strategy
- **Selected Audio Pipeline Mode** *(explicitly chosen during `/grill-me`)*: `[Pure-Code Procedural | AI-Generated Music | Hybrid Pipeline]`
- **Background Music (BGM)**:
  - **Style, Tempo & Mood**: [e.g., 135 BPM dark synthwave, 85 BPM chill tactical lo-fi, 150 BPM YM2612 6-channel chiptune]
  - **BGM Engine**: `lyria` (`lyria-3.5` / `lyria-3-pro-preview` or `lyria-3-clip-preview` 44.1 kHz stereo) OR `procedural-composer` (pure-code 6-channel PCM synthesis)
- **Sound Effects (SFX)**:
  - **Required SFX Triggers**: [e.g., UI hover/confirm, card draw/play, attack impact, level-up chime, alarm stinger, victory/defeat fanfare]
  - **SFX Engine**: `procedural-composer` (4-byte aligned 16-bit stereo PCM synthesized waveforms, FM sweeps, ADSR envelopes, and LPF/HPF/bitcrush post-processing)

---

## 6. Scene Flow & UI / HUD Layout
- **Scene State Machine**: `Boot` -> `Title / Main Menu` -> `Gameplay / Encounter` -> `Overlay (Pause / Deck / Inventory / Dialogue)` -> `Victory / Game Over`
- **HUD & UI Regions**:
  - **Displayed Information**: [e.g., HP/Mana orbs, turn order timeline, wave timer & XP bar, hand of cards, dialogue speaker box]
  - **Screen Anchoring**: [e.g., Top-Left (Player Status), Top-Right (Minimap/Wave), Bottom-Center (Card Hand / Action Bar / Dialogue Box)]

---

## 7. Technical Scope & Ebitengine Architecture Notes
- **Core Ebitengine Subsystems (`ebitengineer`)**:
  - **Spatial / Collision System**: [e.g., Uniform Spatial Hash (bullet-heaven/shmup), Orthogonal/Axial Grid Coordinates (tactics/puzzle), UI Hit-Testing Rects (deckbuilder/VN), or AABB Raycast (platformer/top-down RPG)]
  - **World / Encounter Representation**: [e.g., Autotiled Tilemap, Procedural Arena, Directed Acyclic Encounter Graph, Dialogue State Graph]
  - **Zero-Allocation Hot Loop**: Pre-allocated entity/particle slices and cached `ebiten.DrawImageOptions` in `Update()`/`Draw()`
  - **Persistence / Backend**: [e.g., Local JSON/IndexedDB save state or Cloud Run REST leaderboard]
