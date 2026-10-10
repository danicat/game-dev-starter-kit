// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	"fmt"
	"image"
	"image/color"
	"math"
	"math/rand"

	"github.com/hajimehoshi/ebiten/v2"
)

// ============================================================================
// 1. PREMULTIPLIED ALPHA & 4-STEP MATERIAL COLOR RAMPS
// ============================================================================

// MaterialRamp defines a 4-step Retro-HD shading ramp:
// [0] Deep Shadow (cool shift), [1] Base Tone, [2] Light Highlight (warm shift), [3] High Specular.
type MaterialRamp [4]color.RGBA

// Palette represents a curated set of premultiplied RGBA colors and 4-step material ramps.
type Palette struct {
	Name    string
	Outline color.RGBA
	Colors  []color.RGBA
	Ramps   map[string]MaterialRamp
}

// PremultiplyRGBA converts straight (non-premultiplied) 8-bit RGB + Alpha into a valid
// alpha-premultiplied color.RGBA where R, G, B <= A.
// In Go's image/color and Ebitengine, image.RGBA pixels MUST be alpha-premultiplied.
func PremultiplyRGBA(r, g, b, a uint8) color.RGBA {
	alpha := uint16(a)
	return color.RGBA{
		R: uint8((uint16(r)*alpha + 127) / 255),
		G: uint8((uint16(g)*alpha + 127) / 255),
		B: uint8((uint16(b)*alpha + 127) / 255),
		A: a,
	}
}

// ValidatePremultipliedRGBA fails fast if a color.RGBA violates the R, G, B <= A invariant.
func ValidatePremultipliedRGBA(c color.RGBA) error {
	if c.R > c.A || c.G > c.A || c.B > c.A {
		return fmt.Errorf("procedural-art: invalid premultiplied color.RGBA{%d, %d, %d, %d}: RGB channels must not exceed A (%d)", c.R, c.G, c.B, c.A, c.A)
	}
	return nil
}

// SampleMaterialRamp selects one of the 4 material shading steps based on normalized illumination
// intensity in [0.0, 1.0] (0 = Deep Shadow, 1 = High Specular).
func SampleMaterialRamp(ramp MaterialRamp, illumination float64) color.RGBA {
	switch {
	case illumination < 0.25:
		return ramp[0] // Step 0: Deep Shadow
	case illumination < 0.65:
		return ramp[1] // Step 1: Base Tone
	case illumination < 0.90:
		return ramp[2] // Step 2: Light Highlight
	default:
		return ramp[3] // Step 3: High Specular
	}
}

// NewGenesisPalette returns a 32-bit Retro-HD palette with 4-step material ramps.
func NewGenesisPalette() Palette {
	colors := []color.RGBA{
		{15, 12, 28, 255},    // 0: Dark Obsidian Outline
		{48, 44, 72, 255},    // 1: Deep Shadow
		{85, 78, 115, 255},   // 2: Slate Grey
		{140, 130, 180, 255}, // 3: Light Slate
		{215, 210, 240, 255}, // 4: High Highlight
		{180, 35, 45, 255},   // 5: Crimson Red
		{240, 85, 40, 255},   // 6: Fiery Orange
		{255, 195, 50, 255},  // 7: Golden Yellow
		{35, 120, 60, 255},   // 8: Deep Forest Green
		{75, 190, 95, 255},   // 9: Bright Emerald Green
		{30, 80, 160, 255},   // 10: Deep Royal Blue
		{70, 160, 230, 255},  // 11: Sky Blue
		{180, 235, 255, 255}, // 12: Ice White
		{110, 65, 35, 255},   // 13: Dark Leather Brown
		{170, 115, 60, 255},  // 14: Warm Wood Tan
		{240, 220, 180, 255}, // 15: Soft Flesh Tan
	}

	return Palette{
		Name:    "Retro Genesis 16",
		Outline: colors[0],
		Colors:  colors,
		Ramps: map[string]MaterialRamp{
			"steel": {
				colors[1], // Deep Shadow
				colors[2], // Base Tone
				colors[3], // Light Highlight
				colors[4], // High Specular
			},
			"crimson": {
				{95, 20, 45, 255}, // Cool purple-red shadow
				colors[5],         // Base Crimson
				colors[6],         // Warm fiery highlight
				colors[7],         // Specular gold edge
			},
			"flesh": {
				colors[13],           // Deep warm shadow
				colors[14],           // Mid tone
				colors[15],           // Light highlight
				{255, 245, 225, 255}, // Specular brow/nose
			},
		},
	}
}

// LerpColor linearly interpolates between two premultiplied RGBA colors while preserving R, G, B <= A.
func LerpColor(c1, c2 color.RGBA, t float64) color.RGBA {
	if t <= 0 {
		return c1
	}
	if t >= 1 {
		return c2
	}
	r := uint8(float64(c1.R) + t*(float64(c2.R)-float64(c1.R)))
	g := uint8(float64(c1.G) + t*(float64(c2.G)-float64(c1.G)))
	b := uint8(float64(c1.B) + t*(float64(c2.B)-float64(c1.B)))
	a := uint8(float64(c1.A) + t*(float64(c2.A)-float64(c1.A)))
	if r > a {
		r = a
	}
	if g > a {
		g = a
	}
	if b > a {
		b = a
	}
	return color.RGBA{R: r, G: g, B: b, A: a}
}

// ============================================================================
// 2. 2D SIGNED DISTANCE FIELD (SDF) PRIMITIVES
// ============================================================================

// SDFCircle returns the signed distance from point (px, py) to a circle at (cx, cy) with radius r.
// Negative values are inside the circle; positive values are outside.
func SDFCircle(px, py, cx, cy, radius float64) float64 {
	return math.Hypot(px-cx, py-cy) - radius
}

// SDFBox returns the signed distance from (px, py) to a rounded box centered at (cx, cy)
// with half-extents (halfW, halfH) and corner rounding radius r.
func SDFBox(px, py, cx, cy, halfW, halfH, cornerRadius float64) float64 {
	dx := math.Abs(px-cx) - (halfW - cornerRadius)
	dy := math.Abs(py-cy) - (halfH - cornerRadius)
	outDist := math.Hypot(math.Max(dx, 0), math.Max(dy, 0))
	inDist := math.Min(math.Max(dx, dy), 0)
	return outDist + inDist - cornerRadius
}

// SDFCapsule returns the signed distance from (px, py) to a line segment capsule from (ax, ay) to (bx, by)
// with thickness radius r.
func SDFCapsule(px, py, ax, ay, bx, by, radius float64) float64 {
	pax, pay := px-ax, py-ay
	bax, bay := bx-ax, by-ay
	lenSq := bax*bax + bay*bay
	var h float64
	if lenSq > 0 {
		h = math.Max(0, math.Min(1, (pax*bax+pay*bay)/lenSq))
	}
	return math.Hypot(pax-bax*h, pay-bay*h) - radius
}

// SDFSmoothMin computes a polynomial smooth minimum between two SDF distances d1 and d2
// with smoothing factor k > 0 for organic metaball and limb blending.
func SDFSmoothMin(d1, d2, k float64) float64 {
	if k <= 0 {
		return math.Min(d1, d2)
	}
	h := math.Max(k-math.Abs(d1-d2), 0.0) / k
	return math.Min(d1, d2) - h*h*k*0.25
}

// ============================================================================
// 3. EASING & INTERPOLATION MATHEMATICS
// ============================================================================

// EaseLinear returns standard linear interpolation.
func EaseLinear(t float64) float64 { return t }

// EaseInQuad returns quadratic ease-in (slow start, accelerating).
func EaseInQuad(t float64) float64 { return t * t }

// EaseOutQuad returns quadratic ease-out (fast start, decelerating).
func EaseOutQuad(t float64) float64 { return t * (2.0 - t) }

// EaseInOutCubic returns smooth cubic S-curve ease-in-out.
func EaseInOutCubic(t float64) float64 {
	if t < 0.5 {
		return 4.0 * t * t * t
	}
	return 1.0 - math.Pow(-2.0*t+2.0, 3.0)/2.0
}

// EaseElasticOut returns an elastic spring overshoot effect.
func EaseElasticOut(t float64) float64 {
	if t <= 0 {
		return 0
	}
	if t >= 1 {
		return 1
	}
	p := 0.3
	return math.Pow(2.0, -10.0*t)*math.Sin((t-p/4.0)*(2.0*math.Pi)/p) + 1.0
}

// ============================================================================
// 4. TRANSFORMATION MATRIX & ORDER OF OPERATIONS PIPELINE
// ============================================================================

// Transform2D demonstrates correct 2D matrix transformation ordering.
type Transform2D struct {
	X, Y     float64 // Translation coordinates
	ScaleX   float64 // Horizontal scaling
	ScaleY   float64 // Vertical scaling
	Rotation float64 // Angle in radians
	OriginX  float64 // Pivot point offset X
	OriginY  float64 // Pivot point offset Y
}

// GetGeoM computes the exact transformation matrix.
// CRITICAL MATHEMATICAL RULE:
// Order of matrix operations MUST be:
// 1. Translate to Pivot (-OriginX, -OriginY)
// 2. Scale (ScaleX, ScaleY)
// 3. Rotate (Rotation)
// 4. Translate to Target Position (+OriginX + X, +OriginY + Y)
func (t Transform2D) GetGeoM() ebiten.GeoM {
	var m ebiten.GeoM

	// Step 1: Translate origin to pivot point (0,0)
	m.Translate(-t.OriginX, -t.OriginY)

	// Step 2: Apply Scale at origin
	m.Scale(t.ScaleX, t.ScaleY)

	// Step 3: Apply Rotation around origin
	m.Rotate(t.Rotation)

	// Step 4: Translate scaled & rotated object to final world position
	m.Translate(t.OriginX+t.X, t.OriginY+t.Y)

	return m
}

// ============================================================================
// 5. ZERO-ALLOCATION PARTICLE SYSTEM & VISUAL EFFECTS
// ============================================================================

// Particle represents a single dynamic visual effect element.
type Particle struct {
	X, Y       float64
	VX, VY     float64
	AX, AY     float64
	Life       float64 // Max lifetime in seconds
	Age        float64 // Current age in seconds
	StartSize  float64
	EndSize    float64
	StartColor color.RGBA
	EndColor   color.RGBA
	Additive   bool
	Active     bool
}

// ParticleSystem manages a pre-allocated pool of particles and a reusable DrawImageOptions
// struct to guarantee zero heap allocations inside Draw().
type ParticleSystem struct {
	pool    []Particle
	texture *ebiten.Image
	drawOp  ebiten.DrawImageOptions
}

// NewParticleSystem creates a particle system with a pre-allocated pool and premultiplied glow texture.
func NewParticleSystem(maxParticles int) *ParticleSystem {
	if maxParticles <= 0 {
		panic("procedural-art: maxParticles must be > 0")
	}
	ps := &ParticleSystem{
		pool: make([]Particle, maxParticles),
	}
	// Create a procedural soft radial glow particle texture using SDFCircle + PremultiplyRGBA
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			d := SDFCircle(float64(x)+0.5, float64(y)+0.5, 8.0, 8.0, 8.0)
			if d < 0 {
				alpha := uint8(math.Min(255.0, math.Max(0.0, (-d/8.0)*255.0)))
				img.SetRGBA(x, y, PremultiplyRGBA(255, 255, 255, alpha))
			}
		}
	}
	ps.texture = ebiten.NewImageFromImage(img)
	return ps
}

// EmitExplosion spawns an explosive burst of particles using premultiplied RGBA endpoints.
func (ps *ParticleSystem) EmitExplosion(x, y float64, count int) {
	spawned := 0
	for i := range ps.pool {
		if !ps.pool[i].Active {
			p := &ps.pool[i]
			p.Active = true
			p.X = x
			p.Y = y
			angle := rand.Float64() * 2.0 * math.Pi
			speed := 50.0 + rand.Float64()*150.0
			p.VX = math.Cos(angle) * speed
			p.VY = math.Sin(angle) * speed
			p.AX = 0
			p.AY = 40.0 // Gravity drag
			p.Life = 0.4 + rand.Float64()*0.4
			p.Age = 0
			p.StartSize = 1.2 + rand.Float64()*0.8
			p.EndSize = 0.1
			p.StartColor = PremultiplyRGBA(255, 200, 50, 255)
			p.EndColor = PremultiplyRGBA(200, 30, 10, 0) // Valid premultiplied {0, 0, 0, 0}
			p.Additive = true

			spawned++
			if spawned >= count {
				break
			}
		}
	}
}

// Update advances all active particles by dt seconds.
func (ps *ParticleSystem) Update(dt float64) {
	for i := range ps.pool {
		p := &ps.pool[i]
		if p.Active {
			p.Age += dt
			if p.Age >= p.Life {
				p.Active = false
				continue
			}
			p.VX += p.AX * dt
			p.VY += p.AY * dt
			p.X += p.VX * dt
			p.Y += p.VY * dt
		}
	}
}

// Draw renders all active particles onto the target image reusing ps.drawOp (zero heap allocations).
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
		ps.drawOp.GeoM.Translate(-8, -8) // Pivot center
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

// ============================================================================
// 6. DIRECT BITMAP PIXEL CRAFTING WITH SDFs & 4-STEP MATERIAL RAMPS
// ============================================================================

// GenerateCharacterSprite crafts a 32x32 character frame in memory using SDF primitives
// and 4-step material ramp shading.
func GenerateCharacterSprite(frameIndex int, pal Palette) (*ebiten.Image, error) {
	crimsonRamp, ok := pal.Ramps["crimson"]
	if !ok {
		return nil, fmt.Errorf("procedural-art: palette %q missing required 'crimson' material ramp", pal.Name)
	}
	fleshRamp, ok := pal.Ramps["flesh"]
	if !ok {
		return nil, fmt.Errorf("procedural-art: palette %q missing required 'flesh' material ramp", pal.Name)
	}
	steelRamp, ok := pal.Ramps["steel"]
	if !ok {
		return nil, fmt.Errorf("procedural-art: palette %q missing required 'steel' material ramp", pal.Name)
	}

	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	bobY := math.Sin(float64(frameIndex)*math.Pi/4.0) * 1.5

	// Directional light source vector (top-right-front)
	const lightX, lightY = 0.6, -0.8

	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			px, py := float64(x)+0.5, float64(y)+0.5

			// 1. Torso + Shoulder Pauldrons blended smoothly via SDFBox & SDFCapsule & SDFSmoothMin
			torsoDist := SDFBox(px, py, 16.0, 18.0+bobY, 5.5, 6.0, 2.0)
			shouldersDist := SDFCapsule(px, py, 10.0, 14.0+bobY, 22.0, 14.0+bobY, 2.2)
			bodyDist := SDFSmoothMin(torsoDist, shouldersDist, 1.5)

			if bodyDist <= 0 {
				nx := (px - 16.0) / 6.0
				ny := (py - (18.0 + bobY)) / 6.0
				illum := math.Max(0.0, math.Min(1.0, 0.5+0.5*(nx*lightX+ny*lightY)))
				if py < 15.0+bobY {
					img.SetRGBA(x, y, SampleMaterialRamp(steelRamp, illum))
				} else {
					img.SetRGBA(x, y, SampleMaterialRamp(crimsonRamp, illum))
				}
			}

			// 2. Head sculpted via SDFCircle + 4-step flesh ramp
			headCY := 9.0 + bobY
			headDist := SDFCircle(px, py, 16.0, headCY, 4.2)
			if headDist <= 0 {
				nx := (px - 16.0) / 4.2
				ny := (py - headCY) / 4.2
				illum := math.Max(0.0, math.Min(1.0, 0.55+0.45*(nx*lightX+ny*lightY)))
				img.SetRGBA(x, y, SampleMaterialRamp(fleshRamp, illum))
			}
		}
	}

	ApplyPixelOutline(img, pal.Outline)
	return ebiten.NewImageFromImage(img), nil
}

// ApplyPixelOutline iterates over pixels and applies a 1px dark border around solid pixels.
func ApplyPixelOutline(img *image.RGBA, borderCol color.RGBA) {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	solid := make([]bool, w*h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if img.RGBAAt(x, y).A > 0 {
				solid[y*w+x] = true
			}
		}
	}

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if !solid[y*w+x] {
				hasNeighbor := (x > 0 && solid[y*w+(x-1)]) ||
					(x < w-1 && solid[y*w+(x+1)]) ||
					(y > 0 && solid[(y-1)*w+x]) ||
					(y < h-1 && solid[(y+1)*w+x])
				if hasNeighbor {
					img.SetRGBA(x, y, borderCol)
				}
			}
		}
	}
}
