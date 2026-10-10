---
name: sprite-animation
description: >
  2D sprite sheet management, frame animation sequencing, and Aseprite
  integration guide for games. Covers sprite grid slicing, animation state
  machines (idle, walk, attack, death), frame duration timing, tag loops, and Go
  animation controllers in Ebitengine. Activate when slicing sprite sheets,
  configuring character animations, integrating Aseprite files (.ase/.aseprite),
  or writing game animation controllers.
license: Apache-2.0
metadata:
  category: game-dev
  tags: "spritesheet, animation, keyframes, aseprite, game-dev, ebitengine"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.0"
  catalog: https://skills.danicat.dev
---

# 2D Sprite Animation & Aseprite Integration Guide (Animator Role)

This skill equips AI agents acting in the **Animator Agent Role** with the specifications, deterministic CLI slicing tools, and fail-fast Ebitengine v2 Go controllers required to design, validate, slice, and manage 2D character sprite sheets, animation frame sequences, tag loops, and Aseprite files (`.ase` / `.aseprite` / `.json`).

---

## 1. Animator Agent Role & Core Responsibilities

In a game development workflow, the **Animator Agent** owns all 2D sprite animation pipelines:
1. **Fail-Fast Asset Validation & Grid Slicing**: Validates sprite sheet images (from `nano-banana` or artist files) using `file` / `mimetype` and [`scripts/slice_spritesheet.py`](scripts/slice_spritesheet.py) to verify binary integrity and exact frame grid divisibility before loading.
2. **Animation Tag & State Specification**: Defines animation tags (`idle`, `walk`, `run`, `attack`, `hurt`, `death`, `cast`), positive frame durations (`40ms–200ms`), and loop modes (`LoopForward`, `LoopReverse`, `LoopPingPong`, `LoopOnce`).
3. **Zero-Allocation Frame Pre-Slicing**: Pre-slices all `ebiten.Image.SubImage` frame references at load time (`NewGridSpriteSheet`) and reuses a persistent `ebiten.DrawImageOptions` field (`ac.drawOp`) so `Draw()` performs **zero** heap allocations.
4. **Fail-Fast State Transitions**: Rejects corrupt sprite sheet dimensions, non-positive frame durations, out-of-bounds tag ranges, and unknown animation tag names with rich `fmt.Errorf` diagnostics.

---

## 2. Technical Reference Standards & Companion Scripts

| Module | Path | Key Topics Covered |
| :--- | :--- | :--- |
| **Go Animation Controller** | [`references/animation_controller.go`](references/animation_controller.go) | Fail-fast `GridSpriteSheet` (load-time `SubImage` pre-slicing) and zero-allocation `AnimationController` with delta-time (`dt`) accumulation and horizontal flipping. |
| **Aseprite Binary Format & GPL** | [`references/aseprite_format.md`](references/aseprite_format.md) | Header, frame headers, cel chunks (`0x2005`), tag chunks (`0x2018`), 9-patch slices (`0x2022`), GIMP `.gpl` RGBA palettes, and zero-alloc `goaseprite` wrapper. |
| **Deterministic Grid Slicer CLI** | [`scripts/slice_spritesheet.py`](scripts/slice_spritesheet.py) | PEP 723 (`pillow>=10.0.0`) CLI script that validates PNG dimensions against `--frame-width` / `--frame-height`, slices grid cells, and exports an Aseprite-compatible JSON manifest + optional frame PNGs. |

---

## 3. Deterministic Sprite Sheet Validation & Slicing (`scripts/slice_spritesheet.py`)

Never assume an image is a valid PNG or has evenly divisible grid dimensions based on its filename. Always validate the binary format and run `scripts/slice_spritesheet.py`:

```bash
# 1. Verify actual binary MIME/file type
file assets/sprites/player_sheet.png
# Expected: PNG image data, 256 x 128, 8-bit/color RGBA

# 2. Validate grid divisibility, define animation tags, and export Aseprite JSON manifest
uv run scripts/slice_spritesheet.py assets/sprites/player_sheet.png \
  --frame-width 32 \
  --frame-height 32 \
  --duration-ms 100 \
  --tag idle:0:5:150:forward \
  --tag run:8:15:80:forward \
  --tag attack:16:21:60:forward \
  --tag death:24:31:100:forward \
  --output-json assets/sprites/player_sheet.json \
  --export-frames-dir build/frames/player
```

If `player_sheet.png` is not an exact integer multiple of `--frame-width` and `--frame-height`, `slice_spritesheet.py` fails fast with a non-zero exit code and reports the exact pixel remainder to `stderr`.

---

## 4. Animation State Machine Benchmark Table

| Animation Tag | Frame Range / Count | Frame Duration | Loop Mode | Gameplay Trigger / Transition |
| :--- | :--- | :--- | :--- | :--- |
| **`idle`** | 4–8 frames | 120ms–180ms | `LoopForward` | Default state when velocity is zero (`VX=0, VY=0`). |
| **`walk` / `run`** | 8–12 frames | 60ms–100ms | `LoopForward` | Active when moving (`VX != 0` or `VY != 0`). |
| **`jump` / `fall`** | 2–4 frames | 100ms | `LoopOnce` | Triggered on airborne launch; holds final frame until landing. |
| **`attack`** | 6–10 frames | 40ms–80ms | `LoopOnce` | Triggered on attack action. Invokes `OnComplete` callback back to `idle`. |
| **`hurt`** | 3–5 frames | 50ms | `LoopOnce` | Triggered on damage hit alongside Kage hit-flash shader. |
| **`death`** | 6–10 frames | 100ms | `LoopOnce` | Triggered on zero health. Holds final collapse frame without looping. |

---

## 5. Fail-Fast Integration Patterns in Ebitengine

### 5.1 Pre-Sliced Grid Sprite Sheet & Controller (`references/animation_controller.go`)
```go
sheet, err := NewGridSpriteSheet(embeddedSpriteImage, 32, 32)
if err != nil {
	return fmt.Errorf("load player sprite sheet: %w", err)
}

controller, err := NewAnimationController(sheet)
if err != nil {
	return fmt.Errorf("init player animation controller: %w", err)
}

if err := controller.AddTag(AnimationTag{
	Name:          "idle",
	StartFrame:    0,
	EndFrame:      5,
	FrameDuration: 150 * time.Millisecond,
	Loop:          LoopForward,
}); err != nil {
	return err
}

if err := controller.AddTag(AnimationTag{
	Name:          "run",
	StartFrame:    8,
	EndFrame:      15,
	FrameDuration: 80 * time.Millisecond,
	Loop:          LoopForward,
}); err != nil {
	return err
}

if err := controller.Play("run"); err != nil {
	return err
}
```

### 5.2 Zero-Allocation `Update` and `Draw` Usage
```go
// In Update():
if err := p.Controller.Update(dt); err != nil {
	return err
}

// In Draw(screen *ebiten.Image):
// Uses pre-sliced sheet.Frames[currentFrame] and persistent controller.drawOp (0 allocs/op)
if err := p.Controller.Draw(screen, p.X, p.Y, p.FacingLeft); err != nil {
	panic(err)
}
```

---

## 6. Animator Agent Pre-Flight Checklist

Before completing animation code or sprite assets:
- [ ] **Validated File Format**: Verified image using `file` CLI tool (ensuring valid RGBA PNG and no misnamed JPEG/WebP headers).
- [ ] **Grid Math Verified**: Verified exact divisibility via `scripts/slice_spritesheet.py` and `NewGridSpriteSheet`.
- [ ] **All Animation Tags Validated**: Checked that `StartFrame <= EndFrame < TotalFrames` and `FrameDuration > 0`.
- [ ] **Pre-Sliced `SubImage` Frames at Load Time**: Never call `SubImage` or allocate `ebiten.DrawImageOptions` inside `Draw()`.
- [ ] **Horizontal Flipping Handled**: Configured negative matrix scale (`Scale(-1, 1)` + `Translate(FrameWidth, 0)`) for left-facing orientation without duplicating sprite sheets.
