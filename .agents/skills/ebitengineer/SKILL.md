---
name: ebitengineer
description: Best practices and guidelines for building production-grade 2D games in Go using Ebitengine (v2). Activate when designing game architecture, state machines, cycle timing, WASM audio sync, camera viewports, shaders, or custom typography.
---

# Ebitengine 2D Game Development Guide (ebitengineer)

Comprehensive engineering guidelines for building modular, high-performance, cross-platform 2D games in Go using [Ebitengine v2](https://ebitengine.org/).

---

## Trigger Conditions
Activate this skill whenever:
- Designing or implementing 2D game architecture, scene flow, or rendering in Go.
- Working with Ebitengine interfaces (`ebiten.Game`), state machines, input management, audio, or custom typography.
- Optimizing cycle timing, WASM audio synchronization, touch controls, server architecture, or writing unit tests for Go game components.

---

## Core Architecture & Guidelines

### 1. Modular Architecture (`internal/`)
Organize the codebase into modular subsystems under `internal/`. Avoid monolithic single-file games.
- For complete directory tree and package responsibilities, see [`references/project_structure.md`](references/project_structure.md).

---

## Engine Reference Modules

For deep technical patterns, Go code implementations, and mathematical algorithms, consult these modular reference guides:

| Module | Reference File | Key Topics Covered |
| :--- | :--- | :--- |
| **Project Structure** | [`references/project_structure.md`](references/project_structure.md) | Package tree and `internal/` subsystem responsibilities. |
| **Server & Cloud Run** | [`references/server_architecture.md`](references/server_architecture.md) | WebAssembly build, Docker multi-stage, and Cloud Run REST API. |
| **Physics & Collision** | [`references/physics_and_collision.md`](references/physics_and_collision.md) | AABB sweep tests, spatial hashing grid, and platformer slope math. |
| **Tilemaps & Levels** | [`references/tilemaps_and_levels.md`](references/tilemaps_and_levels.md) | Tiled/LDtk parsing, 16-pipe autotiling, and frustum tile culling. |
| **UI & HUD System** | [`references/ui_and_hud.md`](references/ui_and_hud.md) | 9-slice panel scaling, flex anchoring, progress bars, and widget FSM. |
| **Input Action Mapping** | [`references/input_action_mapping.md`](references/input_action_mapping.md) | Rebindable action maps, analog deadzones, and input device abstraction. |
| **Entity Management** | [`references/entity_management.md`](references/entity_management.md) | Slice pools, deferred deletion buffers, and light component ECS. |
| **Pathfinding & AI** | [`references/pathfinding_and_ai.md`](references/pathfinding_and_ai.md) | A* grid pathfinding, steering behaviors (seek/arrive), and enemy FSM. |

### 2. Asset Embedding & Validation Standards
- **Zero-Dependency Embedding**: Embed all game assets (sprites, TTF fonts, audio MP3s/OGGs, Kage shaders) directly into the compiled Go binary using Go 1.16+ `embed.FS` (`assets.FS`).
- **Mandatory Asset Validation**: AI agents and developers must **always validate asset files using file identifying tools** (such as the `file` CLI utility, `mimetype` inspection tools, or `http.DetectContentType` in Go) during asset ingestion and preloading. Unvalidated or misrepresented asset files will cause silent decoding failures or a black screen on WebAssembly (WASM). Always convert or correct misrepresented files to match the codebase's intended image format.

### 3. Aspect Ratio & Virtual Pixel Canvas
- **16:9 Widescreen Priority**: Unless explicitly specified otherwise, always target a **16:9 aspect ratio** (`320x180`, `640x360`, `1280x720`, `1920x1080`).
- **Virtual Pixel Canvas**: Operating on a fixed internal virtual pixel resolution. All entity physics, collision math, camera coordinates, and UI layouts operate strictly in this virtual coordinate system.
- **Automatic Multi-Resolution Scaling**: `Layout(outsideWidth, outsideHeight int)` returns constant virtual dimensions (`virtualWidth, virtualHeight`). Ebitengine handles scaling to fit any display configuration.

### 4. Cycle Timing & Frame Synchronization
- **Target Frame Rate**: Standard target is **60 FPS** (`ebiten.SetTPS(60)`).
- **Cycle Timing over Tick Sync**: Use delta time / cycle timing ($dt$) to calculate movement deltas to ensure identical game speed across varying hardware and refresh rates (e.g. 144Hz monitors).
- **Frame Skipping**: Accumulate elapsed cycle time in `Update()` and handle catch-up physics steps if rendering lags behind logic updates.

### 5. Windowing & Fullscreen Toggle
Support windowed and fullscreen modes with a toggle hotkey (`F11` or `Alt+Enter`):
```go
if inpututil.IsKeyJustPressed(ebiten.KeyF11) || (ebiten.IsKeyPressed(ebiten.KeyAlt) && inpututil.IsKeyJustPressed(ebiten.KeyEnter)) {
    ebiten.SetFullscreen(!ebiten.IsFullscreen())
}
```

---

## Game State Machine & Scene Flow

### Finite State Machine (FSM) Lifecycle
Model all scenes using a State interface with strict lifecycle hooks (`Enter()`, `Update(dt)`, `Draw(screen)`, `Exit()`).

### Standard Scene Progression
```text
Boot (Company Logo) -> Intro -> Title Screen -> Game Play -> Game Win (or Game Over) -> Title Screen
```

### Transition Cleanliness (No Leaks)
Upon `Exit()`, every state **must**:
- Stop or fade out BGM/SFX channels belonging to that scene.
- Flush active particle emitters, animations, and camera shakes.
- Reset transient input buffers so button presses do not carry over into the next state.

### Attract / Demo Mode (Arcade Style)
1. **Idle Timeout**: On `Title Screen`, if no input is received after a timeout (e.g. 10s), transition to `Demo Mode` (CPU plays the game).
2. **Interrupt**: Any user input in `Demo Mode` interrupts execution immediately back to `Title Screen`.
3. **Alternating Flow**: Consecutive Title Screen idle timeouts alternate between launching `Demo Mode` and re-playing `Intro`.

---

## WebAssembly (WASM) & Server Architecture

### Audio Context Initialization & Late-Sync
- **Browser Autoplay Restriction**: WebAudio contexts are blocked until the user performs their first gesture (touch, click, keypress).
- **Late Touch Synchronization**: Game timers continue running during silent load. When unlocked upon first interaction, BGM playback must **skip ahead** (seek to current elapsed game time $dt$) rather than starting at `0:00`, preventing audio-visual desynchronization.

### Touch Controls & WASM Server
- **Touch Input**: Query touch points via `ebiten.AppendTouchIDs(nil)`. Virtual D-pads and virtual keyboards are optional.
- **Cloud Run Hosting & High Score API**: Target **Google Cloud Run** for serverless hosting of embedded WASM static assets (`//go:embed web/*`) and REST API endpoints (e.g. `/api/v1/scores`) for global leaderboards and cloud state.
- For complete Cloud Run server architecture, multi-stage Dockerfile, and Go server implementation, see [`references/server_architecture.md`](references/server_architecture.md).

---

## Input, Camera, Shaders & Typography

- **Input & Gamepads**: Detect gamepads via `ebiten.AppendGamepadIDs(nil)` and map buttons/axes in `internal/input`.
- **Camera & Viewport**: Decouple world coordinates from screen coordinates. Use camera lerp for smooth tracking and transient offsets for screen shake.
- **Audio Channels**: Maintain separate volume multipliers for Master, BGM (`audio.NewInfiniteLoop`), and SFX channels.
- **Custom Shaders**: Write post-processing effects (CRT scanlines, palette swapping, screen flash) using custom Kage shaders (`ebiten.NewShader`).
- **Save State Persistence**: Use `os.UserConfigDir()` on desktop, `localStorage` on WASM, or server API for cloud saves.
- **Custom Typography (No Debug Prints)**: Do **NOT** use `ebitenutil.DebugPrint` for user-facing game text. Load custom TTF/OTF fonts matching game vibe using `golang.org/x/image/font` or `ebiten/v2/text`.

---

## Unit Testing Requirements
Write unit tests for all testable non-rendering logic components:
- State Machine transitions and scene sequence flow.
- Physics, collision detection, and math.
- Score tracking, inventory, and stats.
- AI / CPU controller logic for `Demo Mode`.
- Input mapping and server API score sorting.

---

## Core Performance Rules
1. **Zero Allocations in `Draw()`**: Never allocate `ebiten.NewImage()`, slices, or format strings inside `Draw()`. Pre-allocate all buffers.
2. **Decouple Logic & Render**: Keep logic strictly in `Update()`. `Draw()` must be read-only relative to game state.
3. **Preload Assets**: Load images, fonts, and audio during `Boot` state initialization.
