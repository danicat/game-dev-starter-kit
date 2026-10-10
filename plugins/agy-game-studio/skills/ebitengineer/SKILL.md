---
name: ebitengineer
description: >
  Engineering architecture and best practices for building 2D games in Go using
  Ebitengine (v2). Covers modular game architecture, scene state machines,
  virtual resolution scaling, delta-time physics, zero-allocation draw loops,
  Kage shaders, and WebAssembly audio synchronization. Activate when designing,
  building, optimizing, or debugging 2D games in Go, implementing game systems
  with Ebitengine, or compiling games to WebAssembly.
license: Apache-2.0
metadata:
  category: game-dev
  tags: "ebitengine, go, golang, game-dev, 2d, wasm, shaders"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.0"
  catalog: https://skills.danicat.dev
---

# Ebitengine 2D Game Development Guide (ebitengineer)

Comprehensive, genre-agnostic engineering guidelines for building modular, high-performance, cross-platform 2D games (top-down, tactics, shmup, puzzle, isometric, and platformer) in Go using [Ebitengine v2](https://ebitengine.org/).

---

## Trigger Conditions
Activate this skill whenever:
- Designing or implementing 2D game architecture, scene flow, camera systems, or rendering pipelines in Go.
- Working with Ebitengine interfaces (`ebiten.Game`), state machines, input management, audio, Kage shaders, or `ebiten/v2/text/v2` typography.
- Optimizing cycle timing, WASM audio synchronization, build-tagged save persistence, Cloud Run hosting, or writing unit tests for Go game components.

---

## Core Architecture & Fail-Fast Engineering Rules

### 1. Modular Architecture (`internal/`)
Organize the codebase into modular subsystems under `internal/`. Never build monolithic single-file games.
- For the complete directory tree and package responsibilities, see [`references/project_structure.md`](references/project_structure.md).

### 2. Fail-Fast Asset Embedding & Validation (No Silent Fallbacks)
- **Zero-Dependency Embedding**: Embed all game assets (sprites, TTF/OTF fonts, audio streams, Kage shaders) directly into the compiled Go binary using `embed.FS` (`internal/assets`).
- **No Silent Fallbacks**: Never ignore errors (`_ = err`), never substitute dummy 1×1 fallback textures when an asset fails to decode, and never silently clamp out-of-bounds tile or frame IDs. Always fail fast and return rich `fmt.Errorf` diagnostics during `Boot` initialization.
- **Mandatory Binary Format Validation**: Always validate asset files using file identification tools (`file`, `mimetype`, or `http.DetectContentType` in Go) during asset ingestion. Misnamed or corrupt asset files cause decoding failures or black screens on WebAssembly.

### 3. Premultiplied Alpha Invariant (`color.RGBA` vs. `color.NRGBA`)
- In Go's `image/color` and Ebitengine, `color.RGBA` is **alpha-premultiplied**: every channel must satisfy $R \le A$, $G \le A$, $B \le A$.
- Never construct non-premultiplied literals like `color.RGBA{255, 0, 0, 100}` (where $R > A$). Use valid premultiplied `color.RGBA{100, 0, 0, 100}` or straight-alpha `color.NRGBA{255, 0, 0, 100}`.

### 4. Aspect Ratio & Virtual Pixel Canvas
- **16:9 Widescreen Priority**: Unless explicitly specified otherwise, target a **16:9 virtual resolution** (`320x180`, `640x360`, `1280x720`, `1920x1080`).
- **Virtual Pixel Canvas**: All entity physics, collision math, camera coordinates, Kage shader pixel units, and UI layouts operate strictly in virtual canvas coordinates.
- **Automatic Multi-Resolution Scaling**: `Layout(outsideWidth, outsideHeight int)` returns constant virtual dimensions (`virtualWidth, virtualHeight`).

### 5. Cycle Timing & Frame Synchronization
- **Target Frame Rate**: Standard target is **60 TPS** (`ebiten.SetTPS(60)`).
- **Delta-Time Integration**: Integrate movement, camera exponential decay, and timers using delta time ($dt = 1.0 / 60.0$ or measured frame delta) for consistent behavior across refresh rates.
- **Windowing & Fullscreen Toggle**: Support fullscreen toggling via `F11` or `Alt+Enter`:
```go
if inpututil.IsKeyJustPressed(ebiten.KeyF11) || (ebiten.IsKeyPressed(ebiten.KeyAlt) && inpututil.IsKeyJustPressed(ebiten.KeyEnter)) {
    ebiten.SetFullscreen(!ebiten.IsFullscreen())
}
```

---

## Engine Reference Modules

Consult these deep technical reference guides for complete, zero-allocation, fail-fast Go implementations:

| Module | Reference File | Key Topics Covered |
| :--- | :--- | :--- |
| **Project Structure** | [`references/project_structure.md`](references/project_structure.md) | Package tree and `internal/` subsystem responsibilities. |
| **Camera & Game Feel ("Juice")** | [`references/camera_and_juice.md`](references/camera_and_juice.md) | 2D `ebiten.GeoM` camera, frame-rate independent exponential lerp, trauma screen shake, hitstop freeze frames, and spring squash-and-stretch. |
| **Kage Shaders & `text/v2`** | [`references/shaders_and_text_v2.md`](references/shaders_and_text_v2.md) | Kage `//kage:unit pixels` shaders (2D lighting, CRT, hit-flash) and `ebiten/v2/text/v2` font loading and aligned layout. |
| **WASM Audio & Save Storage** | [`references/wasm_audio_and_persistence.md`](references/wasm_audio_and_persistence.md) | 4-byte aligned PCM `Seek()` math for browser autoplay unlock and build-tagged desktop vs. WASM fail-fast save storage. |
| **UI & HUD System** | [`references/ui_and_hud.md`](references/ui_and_hud.md) | Premultiplied alpha invariant (`R <= A`), pre-sliced 9-slice panels, anchoring math, zero-alloc progress bars, and `text/v2` buttons. |
| **Physics & Collision** | [`references/physics_and_collision.md`](references/physics_and_collision.md) | Genre-agnostic Circle & AABB overlap, axis-separated sweep resolution, spatial hash grids, and slope math. |
| **Tilemaps & Levels** | [`references/tilemaps_and_levels.md`](references/tilemaps_and_levels.md) | Pre-sliced tileset validation, camera frustum culling, isometric projection, and 16-pipe bitmask autotiling. |
| **Input Action Mapping** | [`references/input_action_mapping.md`](references/input_action_mapping.md) | Rebindable action maps, radial analog deadzones, and zero-alloc gamepad polling. |
| **Entity Management** | [`references/entity_management.md`](references/entity_management.md) | Pre-allocated slice pools, deferred deletion buffers, and Structure-of-Arrays (SoA) Light ECS. |
| **Pathfinding & AI** | [`references/pathfinding_and_ai.md`](references/pathfinding_and_ai.md) | Fail-fast A* grid pathfinding, steering behaviors (seek/arrive), and enemy decision FSM. |
| **Server & Cloud Run** | [`references/server_architecture.md`](references/server_architecture.md) | WebAssembly build, multi-stage Dockerfile, and Cloud Run leaderboard REST API. |

---

## Game State Machine & Scene Flow

### Finite State Machine (FSM) Lifecycle
Model all scenes using a `State` interface with strict lifecycle hooks (`Enter() error`, `Update(dt float64) error`, `Draw(screen *ebiten.Image)`, `Exit() error`).

### Standard Scene Progression
```text
Boot (Logo & Asset Preload) -> Intro -> Title Screen -> Game Play -> Game Win / Game Over -> Title Screen
```

### Transition Cleanliness (No Leaks)
Upon `Exit()`, every state **must**:
- Stop or fade out BGM/SFX channels belonging to that scene.
- Flush active particle emitters, animations, hitstop timers, and camera trauma.
- Reset transient input buffers so button presses do not bleed into the next state.

### Attract / Demo Mode (Arcade Style)
1. **Idle Timeout**: On `Title Screen`, if no input is received after a timeout (e.g. 10s), transition to `Demo Mode` (autonomous AI/CPU plays the game).
2. **Instant Interrupt**: Any user input in `Demo Mode` interrupts execution immediately back to `Title Screen`.
3. **Alternating Flow**: Consecutive `Title Screen` idle timeouts alternate between launching `Demo Mode` and re-playing `Intro`.

---

## WebAssembly (WASM), Shaders & Typography Rules

- **Audio Late-Sync (4-Byte PCM Alignment)**: Browser WebAudio contexts remain locked until the first user gesture. Track elapsed time during silent load and `Seek()` to a **4-byte aligned** stereo PCM byte offset (`(samples * 4) % loopLengthBytes`) on first interaction. See [`references/wasm_audio_and_persistence.md`](references/wasm_audio_and_persistence.md).
- **Custom Typography (`ebiten/v2/text/v2` Only)**: Never use `ebitenutil.DebugPrint` for game UI and never use deprecated `ebiten/v2/text` v1. Always load TTF/OTF fonts via `text.NewGoTextFaceSource`, `text.GoTextFace`, and `text.Draw` from `github.com/hajimehoshi/ebiten/v2/text/v2`. See [`references/shaders_and_text_v2.md`](references/shaders_and_text_v2.md).
- **Kage Shaders (`//kage:unit pixels`)**: Always include `//kage:unit pixels` in Kage shaders and pre-allocate `ebiten.DrawRectShaderOptions` and uniform maps at load time. See [`references/shaders_and_text_v2.md`](references/shaders_and_text_v2.md).
- **Build-Tagged Save Persistence**: Implement separate `//go:build !js` (atomic file write in `os.UserConfigDir()`) and `//go:build js && wasm` (`window.localStorage`) storage backends behind a common fail-fast interface. See [`references/wasm_audio_and_persistence.md`](references/wasm_audio_and_persistence.md).

---

## Unit Testing & Performance Rules

1. **Zero Allocations in `Draw()`**: Never call `ebiten.NewImage()`, `SubImage()`, `ebiten.NewShader()`, or allocate slices/maps inside `Draw()`. Pre-allocate all `ebiten.DrawImageOptions`, `text.DrawOptions`, and `SubImage` frame slices during initialization.
2. **Decouple Logic & Render**: Keep all state mutation strictly inside `Update()`. `Draw()` must be a read-only projection of current game state.
3. **Unit Test Coverage**: Write deterministic unit tests for state transitions, collision/spatial hash math, camera lerp/trauma decay, 4-byte PCM alignment, A* pathfinding, and save serialization.
