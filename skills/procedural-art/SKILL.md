---
name: procedural-art
description: >-
  Use this skill when designing, generating, or optimizing pure-code procedural 2D sprites, tilemaps, vector graphics, particle systems, or visual effects without external image files. Activate for any tasks involving procedural rasterization, color palette theory, 2D matrix transformations, order of operations (scale, rotate, translate), particle pools, sub-frame interpolation/easing curves, or bitmap pixel crafting in game development.
---

# Procedural Art: Pure-Code 2D Sprites, Tiles, Particle Systems & Vector Graphics Guide

This skill provides complete mathematical, graphical, and software architecture patterns for generating high-quality 2D sprites, tilesets, vector shapes, particle systems, and visual effects (VFX) purely in code—without relying on external `.png`, `.jpg`, or `.svg` asset files.

> [!TIP]
> **Production Reference Implementation**:
> * **Procedural Art Driver**: [`references/art.go`](./references/art.go)
> * **Matrix Order & Easing Tests**: [`references/art_test.go`](./references/art_test.go)

---

## 1. Core Architectural Principles & Zero-Asset Strategy

Procedural art generates graphical textures in memory at startup or renders vector shapes dynamically during game frames:
* **Zero disk I/O**: Eliminates asset loading delays, missing file errors, and large download sizes.
* **Infinite Resolution Scaling**: Vector math and Signed Distance Fields (SDFs) scale cleanly to high-DPI displays.
* **Dynamic Palette Tinting**: Real-time palette swapping for elemental states (poison, frozen, lava, shadow, elite buff).

---

## 2. "Retro-HD" Visual Style Benchmark & Color Theory

We target the aesthetic richness of classic 16-bit/32-bit console art (SNES, Sega Saturn, Neo Geo, PS1) **combined with modern "Retro-HD" rendering capabilities**:
* **Relaxing Color Limits**: Rather than restricting sprites to strict 16-color indexed hardware palettes, use **full 32-bit truecolor RGBA** for smooth lighting gradients, soft ambient occlusion, sub-pixel antialiasing, and alpha glow overlays—while preserving crisp pixel outlines and strong silhouettes.

### 2.1 Color Ramp Structure
Every material in a procedural sprite (metal, cloth, wood, skin, fire) should use a 4-to-5 step color ramp:
1. **Dark Outline / Ambient Occlusion**: Very dark, low saturation (e.g. `#0F0C1C`).
2. **Deep Shadow**: Primary color tinted towards cool blue/purple.
3. **Base Tone**: Core material color.
4. **Light Highlight**: Primary color shifted towards warm yellow/white.
5. **High Specular**: Crisp 1-pixel highlight dot for metallic/glossy surfaces.

---

## 3. Transformation Mathematics & Order of Operations (CRITICAL)

In 2D graphics programming (e.g., Ebitengine `ebiten.GeoM`), **the order in which transformation matrices are multiplied is mathematically non-commutative**. Applying operations in the wrong order will cause sprites to orbit wildly or scale off-screen!

### 3.1 Why Order of Operations Matters

* **Correct Sequence: Pivot $\rightarrow$ Scale $\rightarrow$ Rotate $\rightarrow$ World Translation**:
  $$\mathbf{M}_{\text{correct}} = \mathbf{T}(X + O_x, Y + O_y) \cdot \mathbf{R}(\theta) \cdot \mathbf{S}(S_x, S_y) \cdot \mathbf{T}(-O_x, -O_y)$$
  1. Translate sprite origin to center pivot $(-O_x, -O_y)$.
  2. Scale dimensions relative to the pivot $(S_x, S_y)$.
  3. Rotate around the pivot $(\theta)$.
  4. Translate the scaled and rotated sprite to world coordinate $(X, Y)$.

* **Incorrect Sequence: World Translation $\rightarrow$ Scale**:
  $$\mathbf{M}_{\text{wrong}} = \mathbf{S}(S_x, S_y) \cdot \mathbf{T}(X, Y)$$
  Translating to $(X, Y)$ *before* scaling causes the scaling matrix to multiply the translation vector itself ($X' = X \cdot S_x, Y' = Y \cdot S_y$), flinging the sprite away from its intended position on screen!

---

## 4. Animations, Fluid Motion & Sub-Frame Interpolation

Fluid animations require sub-frame delta time ($dt$) integration and non-linear easing curves rather than linear step jumps.

### 4.1 Transition Frames & Easing Functions

Always use easing functions to model physical weight, momentum, and elasticity:
* **Linear**: $f(t) = t$ (Constant motion; suitable for conveyor belts or UI tickers).
* **Ease-In Quadratic**: $f(t) = t^2$ (Slow start, accelerating; falling under gravity).
* **Ease-Out Quadratic**: $f(t) = t(2 - t)$ (Fast start, decelerating; sliding friction).
* **Ease-InOut Cubic**: $f(t) = 4t^3 \text{ if } t < 0.5 \text{ else } 1 - \frac{(-2t+2)^3}{2}$ (Smooth natural organic motion).
* **Elastic Overshoot**: $f(t) = 2^{-10t} \sin\left(\frac{(t - 0.075) \cdot 2\pi}{0.3}\right) + 1$ (Springy UI pop-ups, sword swings).

---

## 5. Retro-HD Sprite Sheet Architecture & Frame Requirements

To generate fluid, professional character animations, AI models must produce complete sprite sheet frame sets spanning all cardinal directions and action states.

### 5.1 Standard Directional Layouts
* **4-Directional Grid**: Down (0), Left (1), Right (2), Up (3).
* **8-Directional Grid**: Down (0), Down-Left (1), Left (2), Up-Left (3), Up (4), Up-Right (5), Right (6), Down-Right (7).
* **Grid Storage**: Matrix array `[State][Direction][Frame]*ebiten.Image` or a combined sprite sheet texture (`ImageWidth = FrameWidth * NumFrames`, `ImageHeight = FrameHeight * NumDirections`).

### 5.2 Mandatory Animation States & Frame Count Benchmark

| Animation State | Required Frames / Dir | Keyframes & Pose Progression | Easing / Timing Guidelines |
| :--- | :--- | :--- | :--- |
| **Idle / Breathing** | $4 - 8\text{ frames}$ | Subtle chest rise, shoulder dip, weapon idle shimmer. | Slow, smooth Ease-InOut Cubic ($1.2\text{s} - 1.8\text{s}$ cycle). |
| **Walk / Run Cycle** | $8 - 12\text{ frames}$ | Contact $\rightarrow$ Recoil $\rightarrow$ Passing $\rightarrow$ High Point (both left & right legs). | Rhythmic, continuous loop ($0.6\text{s} - 0.9\text{s}$ cycle). |
| **Attack / Strike** | $6 - 10\text{ frames}$ | 1. Wind-up/Anticipation (pull back) $\rightarrow$ 2. Fast Strike/Impact $\rightarrow$ 3. Follow-through $\rightarrow$ 4. Recovery. | **Fast Ease-In to Impact** ($1-2\text{ frames}$), then Ease-Out Recovery ($3-4\text{ frames}$). |
| **Hurt / Hit Recoil** | $3 - 5\text{ frames}$ | Sharp backward tilt, flash white/red frame, recovery. | High speed ($0.15\text{s} - 0.25\text{s}$ total). |
| **Death / Collapse** | $6 - 10\text{ frames}$ | Stagger back $\rightarrow$ Knees buckle $\rightarrow$ Ground impact $\rightarrow$ Dissolve/Settle. | Heavy Ease-In gravity drop, non-looping final resting frame. |
| **Cast / Special Skill**| $8 - 12\text{ frames}$ | Energy gather (glow aura) $\rightarrow$ Power release pose $\rightarrow$ Dissipation hold. | Pulse aura w/ additive particles, smooth hold pose. |

---

## 6. Particle Systems & Graphical Effects (VFX)

High-performance visual effects (explosions, magic trails, sparks, fire) require pre-allocated particle pools to avoid memory allocation spikes and Garbage Collection frame stutters.

### 6.1 Pre-Allocated Particle Pool Pattern

```go
type Particle struct {
	X, Y       float64
	VX, VY     float64
	Life, Age  float64
	StartSize, EndSize float64
	StartColor, EndColor color.RGBA
	Additive   bool
	Active     bool
}

type ParticleSystem struct {
	pool []Particle
}

func (ps *ParticleSystem) Update(dt float64) {
	for i := range ps.pool {
		p := &ps.pool[i]
		if p.Active {
			p.Age += dt
			if p.Age >= p.Life {
				p.Active = false
				continue
			}
			p.X += p.VX * dt
			p.Y += p.VY * dt
		}
	}
}
```

### 6.2 Additive Blending for Energy Glows
For fire, lasers, explosions, and magic spells, use **Additive Blending** (`ebiten.BlendLighter`).

---

## 7. Direct Bitmap Pixel Crafting & Procedural Rasterization

When procedural vector drawing is insufficient, craft pixel textures directly in memory by manipulating RGBA byte buffers.

### 7.1 Direct Bitmap Techniques
* **Perlin / Simplex Noise**: Generate natural ground tiles (grass, sand, obsidian, water ripples).
* **2D Signed Distance Fields (SDFs)**: Mathematically render crisp circles, rounded rectangles, and polygons.
* **4-Neighbor Outline Algorithm (`ApplyPixelOutline`)**: Automatically draw a 1-pixel dark border around solid pixels to give retro pixel-art definition.

> [!IMPORTANT]
> **Direct Memory Pixel Generation**:
> Direct memory pixel manipulation (`image.NewRGBA` and `ebiten.NewImageFromImage`) allows rasterizing custom shapes, procedural noise, and raw byte buffers into Ebitengine images at startup.

---

## 8. Mandatory Quality Directives for AI Art Generation

When an AI agent uses this skill to generate procedural graphics or sprite rendering code:

1. **MANDATORY Full Sprite Sheet Frame Sets**:
   * Character generators MUST output complete frame sets ($8\text{--}12\text{ frames}$ for walk/run, $6\text{--}10\text{ frames}$ for attack, $4\text{--}8\text{ frames}$ for idle) across all required directions.
2. **MANDATORY Correct Matrix Transformation Order**:
   * Transformations MUST execute in order: `Translate(-pivot) -> Scale -> Rotate -> Translate(+pivot + pos)`.
3. **MANDATORY Pre-Allocated Particle Pools**:
   * Particle systems MUST allocate fixed particle array slices on boot. Never instantiate `new Particle` or slices during frame `Update`/`Draw`.
4. **MANDATORY Retro-HD Color Ramps**:
   * Sprites MUST use 32-bit truecolor RGBA with 4-step material shading ramps and cool shadow / warm highlight shifts.
5. **MANDATORY Non-Linear Motion Easing**:
   * Animations MUST integrate delta time ($dt$) and easing curves (Ease-Out, Elastic) for fluid sub-frame movement.

---

## 9. Gotchas & Engineering Best Practices

* **Allocation Spikes in Render Loop**: Calling `image.NewRGBA` or `ebiten.NewImage` inside `Draw()` or `Update()` causes massive GC frame drops. Always pre-render textures into a persistent cache at boot.
* **Premultiplied Alpha Artifacts**: In Ebitengine, custom RGBA pixel buffers drawn with alpha must properly premultiply color channels ($R' = R \cdot A / 255$) to avoid dark fringe borders around semi-transparent pixels.
* **Matrix Order Flaws**: Scaling after world translation multiplies world coordinates, causing sprites to fly off-screen. Always scale before translating!

---

## 10. Summary Checklist for Procedural Art Quality

1. **Pre-render Full Animation Frame Sheets at Boot**: Pre-generate all Idle ($4-8\text{f}$), Walk ($8-12\text{f}$), Attack ($6-10\text{f}$), and Death ($6-10\text{f}$) frame sets across cardinal directions.
2. **Apply Retro-HD Truecolor Shading**: Use 32-bit RGBA color ramps with cool shadow / warm highlight shifts.
3. **Verify Matrix Order**: Enforce `Pivot -> Scale -> Rotate -> World Translation` on every `ebiten.GeoM` call.
4. **Pre-allocate VFX Particle Pools**: Use fixed particle arrays with zero heap allocations during frame updates.
5. **Apply Additive Blending to Spells**: Enable `ebiten.BlendLighter` for fire, lasers, and magical energy glows.
