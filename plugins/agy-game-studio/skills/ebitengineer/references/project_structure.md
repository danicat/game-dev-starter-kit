# Ebitengine Project Structure & Package Reference

A clean, modular Go game project layout keeps dependencies decoupled across any 2D genre (top-down, tactics, shmup, puzzle, isometric, or platformer) and prevents monolithic single-file codebases.

---

## Recommended Directory Tree

```text
mygame/
├── cmd/
│   ├── game/
│   │   └── main.go               # Desktop/WASM entrypoint (window config & ebiten.RunGame)
│   └── server/
│       └── main.go               # HTTP server for WASM static files & High Score API
├── internal/
│   ├── game/
│   │   └── game.go               # ebiten.Game implementation & top-level game loop
│   ├── state/
│   │   ├── machine.go            # Finite State Machine (FSM) manager
│   │   ├── state.go              # State interface definitions (Enter, Update, Draw, Exit)
│   │   ├── boot.go               # Company Logo / Fail-fast asset preloader state
│   │   ├── intro.go              # Cinematic Intro state
│   │   ├── title.go              # Main Title Screen state
│   │   ├── play.go               # Active Gameplay state
│   │   ├── win.go                # Victory state
│   │   ├── gameover.go           # Game Over state
│   │   └── demo.go               # Arcade CPU Attract Mode state
│   ├── entity/
│   │   ├── manager.go            # Pre-allocated slice pool or Light ECS
│   │   ├── player.go             # Player entity & controls
│   │   └── enemy.go              # Enemy AI & steering/pathfinding
│   ├── input/
│   │   └── input.go              # Action mapping (Keyboard, Gamepad, Mouse, Touch)
│   ├── audio/
│   │   └── audio.go              # BGM/SFX player & 4-byte aligned WASM late-touch sync
│   ├── camera/
│   │   └── camera.go             # GeoM viewport, exponential lerp, trauma shake, hitstop
│   ├── physics/
│   │   └── collision.go          # Circle/AABB collision & spatial hash grid
│   ├── render/
│   │   └── shaders.go            # Kage shaders (//kage:unit pixels) & post-processing
│   ├── save/
│   │   ├── storage.go            # Shared save contract & JSON validation
│   │   ├── storage_desktop.go    # //go:build !js atomic file persistence
│   │   └── storage_wasm.go       # //go:build js && wasm localStorage persistence
│   ├── ui/
│   │   ├── font.go               # ebiten/v2/text/v2 typography (zero debug prints)
│   │   └── widgets.go            # 9-slice panels, anchored layout, progress bars
│   └── assets/
│       └── assets.go             # Fail-fast embedded game assets (go:embed)
├── web/
│   ├── index.html                # WASM web page wrapper
│   └── wasm_exec.js              # Go WebAssembly JS glue
├── go.mod
└── go.sum
```

---

## Package Responsibilities

- **`cmd/game`**: Entrypoint for native desktop and WASM builds (`go run ./cmd/game`).
- **`cmd/server`**: Entrypoint for hosting WASM builds and High Score REST API endpoints.
- **`internal/game`**: Implements `ebiten.Game` (`Update`, `Draw`, `Layout`). Delegates lifecycle updates to `internal/state` and propagates errors visibly.
- **`internal/state`**: Manages state transitions and scene lifecycles. Ensures audio, particles, and camera trauma reset cleanly upon scene exit.
- **`internal/input`**: Abstracts raw keys, gamepad buttons/axes, mouse, and touch events into rebindable game action intents.
- **`internal/audio`**: Manages BGM loops, SFX playback, volume multipliers, and 4-byte aligned PCM `Seek()` synchronization on first user gesture in WASM.
- **`internal/camera`**: Manages world-to-screen `ebiten.GeoM` transforms, frame-rate independent exponential damping, trauma screen shake, hitstop, and spring squash-and-stretch.
- **`internal/render`**: Compiles and executes Kage shaders (`//kage:unit pixels`) for lighting, hit-flash, and CRT effects.
- **`internal/save`**: Build-tagged fail-fast save persistence (`os.UserConfigDir()` on desktop, `localStorage` on WASM).
- **`internal/ui`**: Renders HUD components with premultiplied `color.RGBA` and `github.com/hajimehoshi/ebiten/v2/text/v2`.
- **`internal/assets`**: Uses `//go:embed` to package sprites, audio files, TTF/OTF fonts, and Kage shaders into the Go binary, failing fast with `fmt.Errorf` if any asset fails validation or decoding.
