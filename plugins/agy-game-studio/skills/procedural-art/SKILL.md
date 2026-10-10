---
name: procedural-art
description: >
  Pure-code procedural graphics, sprite generation, and visual effects (VFX)
  guide for 2D games. Generates sprites, tilesets, particle systems, and vector
  shapes in memory without external image files, enforcing 2D matrix
  transformation order, sub-frame animation easing, and pre-allocated particle
  pools. Activate when creating procedural 2D sprites, building zero-asset
  games, designing particle effects, or implementing 2D matrix transformations.
license: Apache-2.0
metadata:
  category: game-dev
  tags: "game-dev, sprites, pixel-art, particles, vfx"
  author: Daniela Petruzalek (daniela@danicat.dev)
  version: "0.3.0"
  catalog: https://skills.danicat.dev
---

# Procedural Art: Pure-Code 2D Sprites, SDF Primitives, Material Ramps & VFX Guide

This skill provides mathematical, graphical, and software architecture patterns for generating high-quality 2D sprites, tilesets, Signed Distance Field (SDF) shapes, particle systems, and visual effects (VFX) purely in code—without relying on external `.png`, `.jpg`, or `.svg` asset files.

> [!TIP]
> **Reference Implementation**:
> * **Procedural Art Driver**: [`references/art.go`](references/art.go)
> * **SDF, Premultiplied Alpha, Matrix Order & Easing Tests**: [`references/art_test.go`](references/art_test.go)

---

## 1. Core Architectural Principles & Zero-Asset Strategy

Procedural art generates graphical textures in memory at startup (`Boot` state) or renders vector/particle effects dynamically during game frames:
* **Zero Disk I/O**: Eliminates asset loading delays, missing file errors, and external bundle dependencies.
* **Signed Distance Field (SDF) Rasterization**: Composes organic characters, weapons, and tiles mathematically using `SDFCircle`, `SDFBox`, `SDFCapsule`, and `SDFSmoothMin`.
* **Strict Premultiplied Alpha Invariant**: Enforces $R, G, B \le A$ on every `color.RGBA` pixel via `PremultiplyRGBA(r, g, b, a)`.

---

## 2. "Retro-HD" Visual Style, Premultiplied Alpha & 4-Step Material Ramps

Target the aesthetic richness of classic 16-bit/32-bit console art (SNES, Sega Saturn, Neo Geo) combined with modern 32-bit truecolor shading.

### 2.1 Premultiplied Alpha Invariant (`PremultiplyRGBA`)
In Go's `image/color` and Ebitengine (`image.NewRGBA` / `ebiten.NewImageFromImage`), `color.RGBA` values are **alpha-premultiplied** ($R \le A, G \le A, B \le A$). Writing non-premultiplied values like `color.RGBA{255, 255, 255, alpha}` or `color.RGBA{200, 30, 10, 0}` causes glowing halos and blending corruption. Always construct translucent colors via `PremultiplyRGBA`:

```go
func PremultiplyRGBA(r, g, b, a uint8) color.RGBA {
	alpha := uint16(a)
	return color.RGBA{
		R: uint8((uint16(r)*alpha + 127) / 255),
		G: uint8((uint16(g)*alpha + 127) / 255),
		B: uint8((uint16(b)*alpha + 127) / 255),
		A: a,
	}
}
```

### 2.2 4-Step Material Ramp Structure (`MaterialRamp`)
Every material in a procedural sprite (`steel`, `crimson`, `flesh`, `gold`, `foliage`) uses a structured **4-step shading ramp** (`[4]color.RGBA`) paired with a dark 1-pixel silhouette outline (`#0F0C1C`):
1. **Step 0 — Deep Shadow (`[0]`)**: Primary hue shifted toward cool blue/violet (`illumination < 0.25`).
2. **Step 1 — Base Tone (`[1]`)**: Core saturated material color (`0.25 <= illumination < 0.65`).
3. **Step 2 — Light Highlight (`[2]`)**: Primary hue shifted toward warm yellow/orange (`0.65 <= illumination < 0.90`).
4. **Step 3 — High Specular (`[3]`)**: Crisp specular edge or rim highlight (`illumination >= 0.90`).

---

## 3. 2D Signed Distance Field (SDF) Primitives & Smooth Blending

Instead of drawing blocky raw rectangles, sculpt multi-part sprites at startup by evaluating 2D Signed Distance Fields per pixel $(p_x, p_y)$ and blending limbs/armor plates with polynomial smooth minimum (`SDFSmoothMin`):

* **Circle (`SDFCircle`)**: $d = \|(p_x - c_x, p_y - c_y)\|_2 - r$
* **Rounded Box (`SDFBox`)**: Box centered at $(c_x, c_y)$ with half-extents $(h_w, h_h)$ and corner radius $r$.
* **Line Capsule (`SDFCapsule`)**: Swept sphere of radius $r$ along segment $\overline{AB}$ (ideal for limbs, blades, beams, and pauldrons).
* **Smooth Union (`SDFSmoothMin`)**: Blends two distance fields $d_1, d_2$ with smoothing factor $k > 0$:
  $$h = \frac{\max(k - |d_1 - d_2|, 0)}{k}, \quad \text{smin}(d_1, d_2, k) = \min(d_1, d_2) - \frac{1}{4} h^2 k$$

---

## 4. Transformation Mathematics & Order of Operations (CRITICAL)

In 2D graphics programming (`ebiten.GeoM`), **matrix multiplication is non-commutative**. Applying operations in the wrong order causes sprites to orbit wildly or scale off-screen.

### 4.1 Exact Sequence: `Pivot -> Scale -> Rotate -> World Translation`
$$M_{\text{correct}} = T(X + O_x, Y + O_y) \cdot R(\theta) \cdot S(S_x, S_y) \cdot T(-O_x, -O_y)$$
1. `m.Translate(-OriginX, -OriginY)` — Move pivot to $(0, 0)$.
2. `m.Scale(ScaleX, ScaleY)` — Scale relative to pivot.
3. `m.Rotate(Rotation)` — Rotate around pivot.
4. `m.Translate(OriginX+X, OriginY+Y)` — Translate to world position.

---

## 5. Sub-Frame Interpolation & Non-Linear Easing

Use delta time ($dt$) and non-linear easing functions to model physical weight, momentum, and elasticity:
* **Linear (`EaseLinear`)**: $f(t) = t$
* **Ease-In Quadratic (`EaseInQuad`)**: $f(t) = t^2$ (accelerating under gravity)
* **Ease-Out Quadratic (`EaseOutQuad`)**: $f(t) = t(2 - t)$ (decelerating friction slide)
* **Ease-InOut Cubic (`EaseInOutCubic`)**: Smooth S-curve for breathing idle and hover loops
* **Elastic Overshoot (`EaseElasticOut`)**: $f(t) = 2^{-10t} \sin\left(\frac{(t - 0.075) \cdot 2\pi}{0.3}\right) + 1$ (springy attacks and UI pop-ups)

---

## 6. Retro-HD Sprite Sheet Architecture & Frame Requirements

| Animation State | Required Frames / Dir | Keyframes & Pose Progression | Easing / Timing Guidelines |
| :--- | :--- | :--- | :--- |
| **Idle / Breathing** | 4–8 frames | Subtle chest rise, shoulder dip, weapon idle shimmer. | Smooth `EaseInOutCubic` (1.2s–1.8s cycle). |
| **Walk / Run Cycle** | 8–12 frames | Contact $\rightarrow$ Recoil $\rightarrow$ Passing $\rightarrow$ High Point. | Continuous loop (0.6s–0.9s cycle). |
| **Attack / Strike** | 6–10 frames | Wind-up $\rightarrow$ Fast Strike/Impact $\rightarrow$ Follow-through $\rightarrow$ Recovery. | Fast `EaseInQuad` to impact, `EaseOutQuad` recovery. |
| **Hurt / Hit Recoil** | 3–5 frames | Sharp backward tilt, hit-flash, recovery. | High speed (0.15s–0.25s total). |
| **Death / Collapse** | 6–10 frames | Stagger $\rightarrow$ Knees buckle $\rightarrow$ Ground impact $\rightarrow$ Settle. | Heavy `EaseInQuad` drop, non-looping final frame. |

---

## 7. Zero-Allocation Particle Systems & VFX

High-performance visual effects (explosions, thrusters, magic trails, sparks) require both a **pre-allocated `[]Particle` pool** and a **reusable `ebiten.DrawImageOptions` struct field (`ps.drawOp`)** so `Draw()` never allocates on the heap:

```go
func (ps *ParticleSystem) Draw(screen *ebiten.Image) {
	for i := range ps.pool {
		p := &ps.pool[i]
		if !p.Active {
			continue
		}
		progress := p.Age / p.Life
		size := p.StartSize + progress*(p.EndSize-p.StartSize)
		curColor := LerpColor(p.StartColor, p.EndColor, progress)

		ps.drawOp.GeoM.Reset()
		ps.drawOp.GeoM.Translate(-8, -8)
		ps.drawOp.GeoM.Scale(size, size)
		ps.drawOp.GeoM.Translate(p.X, p.Y)

		ps.drawOp.ColorScale.Reset()
		ps.drawOp.ColorScale.ScaleWithColor(curColor)

		if p.Additive {
			ps.drawOp.Blend = ebiten.BlendLighter
		} else {
			ps.drawOp.Blend = ebiten.BlendSourceOver
		}

		screen.DrawImage(ps.texture, &ps.drawOp)
	}
}
```

---

## 8. Mandatory Quality Directives for AI Art Generation

1. **Premultiplied Alpha Enforcement**: Every translucent `color.RGBA` pixel written to `image.RGBA` or interpolated in particle systems MUST use `PremultiplyRGBA` ($R, G, B \le A$).
2. **Zero Allocations in `Draw()`**: Pre-render all procedural `*ebiten.Image` textures at boot and reuse `ebiten.DrawImageOptions` (`Reset()`) inside `Draw()`.
3. **SDF + 4-Step Material Ramp Composition**: Combine `SDFCircle`, `SDFBox`, `SDFCapsule`, and `SDFSmoothMin` with `MaterialRamp` (`[4]color.RGBA`) surface normal illumination and 1px dark outlines (`ApplyPixelOutline`).
4. **Correct Matrix Transformation Order**: Always execute `Translate(-pivot) -> Scale -> Rotate -> Translate(+pivot + pos)`.

---

## 📚 Progressive Disclosure & References

- **Procedural Art Driver**: [`references/art.go`](references/art.go) — Premultiplied RGBA helpers, 4-step `MaterialRamp` shading, `SDFCircle`/`SDFBox`/`SDFCapsule`/`SDFSmoothMin` primitives, zero-allocation `ParticleSystem`, and character sprite rasterization.
- **Verification Test Suite**: [`references/art_test.go`](references/art_test.go) — Unit tests verifying `PremultiplyRGBA`, SDF geometry, 4-step material ramps, matrix transformation order, and particle pool lifecycle.
