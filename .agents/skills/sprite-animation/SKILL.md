---
name: sprite-animation
description: >-
  Use this skill when developing, validating, slicing, or managing 2D sprite sheets, animation sequences, frame durations, tag loops, and Aseprite files (.ase/.aseprite) for Ebitengine games. Serves as the specialized Animator Agent role for game development teams.
---

# 2D Sprite Animation & Aseprite Integration Guide (Animator Role)

This skill equips AI agents acting in the **Animator Agent Role** with the tools, specifications, and Go controllers required to design, validate, slice, and manage 2D character sprite sheets, animation frame sequences, tag loops, and Aseprite files (`.ase` / `.aseprite`) for Ebitengine v2 games.

---

## 1. Animator Agent Role & Core Responsibilities

In a game development team, the **Animator Agent** owns all 2D sprite animation pipelines:
1. **Asset Validation & Format Verification**: Inspects sprite sheet images (from `nano-banana` or artist files) using file identification tools (`file`, `mimetype`, `http.DetectContentType`) to verify binary integrity and grid dimensions before slicing.
2. **Animation Tag & State Specification**: Defines animation tags (`idle`, `walk`, `run`, `attack`, `hurt`, `death`, `cast`), frame duration timings ($50\text{ms} - 200\text{ms}$), and loop directions (`LoopForward`, `LoopReverse`, `LoopPingPong`, `LoopOnce`).
3. **Aseprite Integration & Slicing**: Loads Aseprite files (`.ase` / `.aseprite` / `.json`) using recommended Go libraries ([`SolarLune/goaseprite`](https://github.com/SolarLune/goaseprite)) or pure-code Ebitengine `SubImage` grid slicing.
4. **Animation Controller Code Generation**: Authors clean, GC-friendly Ebitengine animation controllers that manage frame timers, state switches, directional flips, and completion callbacks (`OnComplete`).

---

## 2. Technical Reference Standards & Specifications

For complete binary format specifications, GIMP RGBA palette specifications, and production Go code implementations, consult:

| Module | Reference File | Key Topics Covered |
| :--- | :--- | :--- |
| **Aseprite Binary Format & GPL** | [`references/aseprite_format.md`](references/aseprite_format.md) | Header, frame headers, cel chunks (`0x2005`), tag chunks (`0x2018`), 9-patch slices (`0x2022`), and GIMP `.gpl` RGBA palette format extension. |
| **Go Animation Controller** | [`references/animation_controller.go`](references/animation_controller.go) | Complete, production-grade Ebitengine `AnimationController` and `GridSpriteSheet` implementation with delta time ($dt$) updating and horizontal flipping. |

---

## 3. Asset Validation & Grid Slicing Workflow

Never assume a generated image is a valid PNG or has correct dimensions based solely on filename extension:

```bash
# 1. Validate actual file type using file identification tools
file assets/sprites/player_sheet.png
# Expected output: PNG image data, 256 x 128, 8-bit/color RGBA

# 2. Verify grid dimensions (e.g. 256x128 image with 32x32 frames = 8 columns x 4 rows = 32 frames)
```

---

## 4. Animation State Machine Benchmark Table

When authoring animation sequences for characters and entities, enforce standard frame count and duration benchmarks:

| Animation Tag | Frame Range / Count | Frame Duration | Loop Mode | Gameplay Trigger / Transition |
| :--- | :--- | :--- | :--- | :--- |
| **`idle`** | $4 - 8\text{ frames}$ | $120\text{ms} - 180\text{ms}$ | `LoopForward` | Default state when velocity is zero ($VX=0, VY=0$). |
| **`walk` / `run`** | $8 - 12\text{ frames}$ | $60\text{ms} - 100\text{ms}$ | `LoopForward` | Active when moving horizontally ($VX \neq 0$). |
| **`jump` / `fall`** | $2 - 4\text{ frames}$ | $100\text{ms}$ | `LoopOnce` / Hold | Triggered on jump start; holds final frame during airborne fall. |
| **`attack`** | $6 - 10\text{ frames}$ | $40\text{ms} - 80\text{ms}$ | `LoopOnce` | Triggered on attack keypress. Invokes `OnComplete` callback back to `idle`. |
| **`hurt`** | $3 - 5\text{ frames}$ | $50\text{ms}$ | `LoopOnce` | Triggered on damage hit. Flash red/white overlay. |
| **`death`** | $6 - 10\text{ frames}$ | $100\text{ms}$ | `LoopOnce` | Triggered on zero health. Holds final collapse frame without looping. |

---

## 5. Integration Patterns in Ebitengine

### 5.1 Using SolarLune's `goaseprite` Library
```go
import "github.com/SolarLune/goaseprite"

type Player struct {
	Anim *goaseprite.File
	X, Y float32
}

func NewPlayer() *Player {
	return &Player{
		Anim: goaseprite.New("assets/player.json"),
	}
}

func (p *Player) Update(dt float32) {
	p.Anim.Update(dt)
}

func (p *Player) Draw(screen *ebiten.Image) {
	op := &ebiten.DrawImageOptions{}
	op.GeoM.Translate(float64(p.X), float64(p.Y))
	
	// Draw current frame sub-image from Aseprite atlas
	sub := p.Anim.Image.SubImage(p.Anim.CurrentFrameBounds()).(*ebiten.Image)
	screen.DrawImage(sub, op)
}
```

### 5.2 Using Pure-Code Grid Slicing Controller
```go
sheet := &GridSpriteSheet{
	Image:       embeddedSpriteImage,
	FrameWidth:  32,
	FrameHeight: 32,
	Columns:     8,
	TotalFrames: 32,
}

controller := NewAnimationController(sheet)
controller.AddTag(AnimationTag{Name: "idle", StartFrame: 0, EndFrame: 5, FrameDuration: 150 * time.Millisecond, Loop: LoopForward})
controller.AddTag(AnimationTag{Name: "run", StartFrame: 8, EndFrame: 15, FrameDuration: 80 * time.Millisecond, Loop: LoopForward})
controller.Play("run")
```

---

## 6. Animator Agent Pre-Flight Checklist

Before confirming animation code or sprite assets:
- [ ] **Validated File Format**: Verified image using `file` CLI tool (ensuring RGBA format and no corrupted/misnamed extensions).
- [ ] **Grid Math Verified**: Image width and height are exact integer multiples of frame width and height.
- [ ] **All Animation Tags Defined**: Included `idle`, `run`/`walk`, `attack`, and `death` states.
- [ ] **No Allocation in `Draw()`**: `SubImage` bounds calculations use pre-computed rectangles or persistent `DrawImageOptions`.
- [ ] **Horizontal Flipping Handled**: Configured negative matrix scale ($Scale(-1, 1)$) for left-facing direction without duplicating sprite assets.
