# Ebitengine Project Structure & Package Reference

A clean, modular Go game project layout keeps dependencies decoupled and prevents monolithic single-file codebases.

---

## Recommended Directory Tree

```text
mygame/
├── cmd/
│   ├── game/
│   │   └── main.go          # Desktop entrypoint (window configuration & RunGame)
│   └── server/
│       └── main.go          # HTTP server for WASM static files & High Score API
├── internal/
│   ├── game/
│   │   └── game.go          # ebiten.Game implementation & top-level game loop
│   ├── state/
│   │   ├── machine.go       # Finite State Machine (FSM) manager
│   │   ├── state.go         # State interface definitions
│   │   ├── boot.go          # Company Logo / Preloader state
│   │   ├── intro.go         # Cinematic Intro state
│   │   ├── title.go         # Main Title Screen state
│   │   ├── play.go          # Active Gameplay state
│   │   ├── win.go           # Victory state
│   │   ├── gameover.go      # Game Over state
│   │   └── demo.go          # Arcade CPU Attract Mode state
│   ├── entity/
│   │   ├── player.go        # Player entity & controls
│   │   ├── enemy.go         # Enemy AI & movement
│   │   └── entity.go        # Entity component interfaces
│   ├── input/
│   │   └── input.go         # Cross-platform input manager (Keyboard, Gamepad, Touch)
│   ├── audio/
│   │   └── audio.go         # BGM/SFX player, volume channels, late-touch sync
│   ├── camera/
│   │   └── camera.go        # World vs. Screen viewport, lerp tracking, screen shake
│   ├── physics/
│   │   └── collision.go     # AABB / Circle collision detection & resolution
│   ├── ui/
│   │   └── font.go          # Custom typography & HUD rendering (no debug prints)
│   └── assets/
│       └── assets.go        # Embedded game assets (go:embed)
├── web/
│   ├── index.html           # WASM web page wrapper
│   └── wasm_exec.js         # Go WebAssembly JS glue
├── go.mod
└── go.sum
```

---

## Package Responsibilities

- **`cmd/game`**: Entrypoint for desktop native builds (`go run ./cmd/game`).
- **`cmd/server`**: Entrypoint for hosting WASM builds and High Score REST API endpoints.
- **`internal/game`**: Implements `ebiten.Game` (`Update`, `Draw`, `Layout`). Delegates lifecycle updates to `internal/state`.
- **`internal/state`**: Manages state transitions and scene lifecycles. Ensures audio and particles stop cleanly upon scene exit.
- **`internal/input`**: Abstracts raw keys, gamepad buttons/axes, and touch events into game action intents (e.g. `ActionJump`, `ActionPause`).
- **`internal/audio`**: Manages BGM loops, SFX playback, volume multipliers, and late-touch audio unlock synchronization in WASM.
- **`internal/assets`**: Uses `//go:embed` to package sprites, audio files, TTF fonts, and Kage shaders into the Go binary.
