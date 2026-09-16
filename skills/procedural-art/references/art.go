package main

import (
	"image"
	"image/color"
	"math"
	"math/rand"

	"github.com/hajimehoshi/ebiten/v2"
)

// ============================================================================
// 1. COLOR PALETTES & TONAL CONSISTENCY
// ============================================================================

// Palette represents a curated set of colors for consistent game art styling.
type Palette struct {
	Name    string
	Colors  []color.RGBA
	Ramps   map[string][]color.RGBA
}

// NewGenesisPalette returns a 16-bit retro arcade color palette.
func NewGenesisPalette() Palette {
	return Palette{
		Name: "Retro Genesis 16",
		Colors: []color.RGBA{
			{15, 12, 28, 255},   // 0: Dark Obsidian Outline
			{48, 44, 72, 255},   // 1: Deep Shadow
			{85, 78, 115, 255},  // 2: Slate Grey
			{140, 130, 180, 255},// 3: Light Slate
			{215, 210, 240, 255},// 4: High Highlight
			{180, 35, 45, 255},  // 5: Crimson Red
			{240, 85, 40, 255},  // 6: Fiery Orange
			{255, 195, 50, 255}, // 7: Golden Yellow
			{35, 120, 60, 255},  // 8: Deep Forest Green
			{75, 190, 95, 255},  // 9: Bright Emerald Green
			{30, 80, 160, 255},  // 10: Deep Royal Blue
			{70, 160, 230, 255}, // 11: Sky Blue
			{180, 235, 255, 255},// 12: Ice White
			{110, 65, 35, 255},  // 13: Dark Leather Brown
			{170, 115, 60, 255}, // 14: Warm Wood Tan
			{240, 220, 180, 255},// 15: Soft Flesh Tan
		},
	}
}

// LerpColor linearly interpolates between two RGBA colors.
func LerpColor(c1, c2 color.RGBA, t float64) color.RGBA {
	if t <= 0 { return c1 }
	if t >= 1 { return c2 }
	return color.RGBA{
		R: uint8(float64(c1.R) + t*(float64(c2.R)-float64(c1.R))),
		G: uint8(float64(c1.G) + t*(float64(c2.G)-float64(c1.G))),
		B: uint8(float64(c1.B) + t*(float64(c2.B)-float64(c1.B))),
		A: uint8(float64(c1.A) + t*(float64(c2.A)-float64(c1.A))),
	}
}

// ============================================================================
// 2. EASING & INTERPOLATION MATHEMATICS
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
	if t <= 0 { return 0 }
	if t >= 1 { return 1 }
	p := 0.3
	return math.Pow(2.0, -10.0*t)*math.Sin((t-p/4.0)*(2.0*math.Pi)/p) + 1.0
}

// ============================================================================
// 3. TRANSFORMATION MATRIX & ORDER OF OPERATIONS PIPELINE
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
// CRITICAL MATHEMETICAL RULE:
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
// 4. PARTICLE SYSTEM & VISUAL EFFECTS
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

// ParticleSystem manages a pre-allocated pool of particles to prevent GC frame spikes.
type ParticleSystem struct {
	pool    []Particle
	texture *ebiten.Image
}

// NewParticleSystem creates a particle system with a pre-allocated pool.
func NewParticleSystem(maxParticles int) *ParticleSystem {
	ps := &ParticleSystem{
		pool: make([]Particle, maxParticles),
	}
	// Create a procedural soft radial glow particle texture
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			dx := float64(x - 8)
			dy := float64(y - 8)
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist < 8.0 {
				alpha := uint8((1.0 - dist/8.0) * 255.0)
				img.Set(x, y, color.RGBA{255, 255, 255, alpha})
			}
		}
	}
	ps.texture = ebiten.NewImageFromImage(img)
	return ps
}

// EmitExplosion spawns an explosive burst of particles.
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
			p.StartColor = color.RGBA{255, 200, 50, 255}
			p.EndColor = color.RGBA{200, 30, 10, 0}
			p.Additive = true

			spawned++
			if spawned >= count {
				break
			}
		}
	}
}

// Update updates all active particles by dt seconds.
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

// Draw renders all active particles onto the target image.
func (ps *ParticleSystem) Draw(screen *ebiten.Image) {
	for i := range ps.pool {
		p := &ps.pool[i]
		if !p.Active {
			continue
		}
		progress := p.Age / p.Life
		size := p.StartSize + progress*(p.EndSize-p.StartSize)
		curColor := LerpColor(p.StartColor, p.EndColor, progress)

		var op ebiten.DrawImageOptions
		op.GeoM.Translate(-8, -8) // Pivot center
		op.GeoM.Scale(size, size)
		op.GeoM.Translate(p.X, p.Y)

		op.ColorScale.Scale(
			float32(curColor.R)/255.0,
			float32(curColor.G)/255.0,
			float32(curColor.B)/255.0,
			float32(curColor.A)/255.0,
		)

		if p.Additive {
			op.Blend = ebiten.BlendLighter
		}

		screen.DrawImage(ps.texture, &op)
	}
}

// ============================================================================
// 5. DIRECT BITMAP PIXEL CRAFTING & RASTERIZATION
// ============================================================================

// GenerateCharacterSprite crafts a detailed 32x32 character frame in memory.
func GenerateCharacterSprite(frameIndex int, pal Palette) *ebiten.Image {
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))

	outlineCol := pal.Colors[0]
	clothCol := pal.Colors[5]  // Crimson
	shadowCol := pal.Colors[1]
	lightCol := pal.Colors[6]  // Orange
	fleshCol := pal.Colors[15]

	// Bobbing animation offset
	bobY := int(math.Sin(float64(frameIndex)*math.Pi/4.0) * 1.5)

	// Draw Torso Armor
	for y := 12; y < 24; y++ {
		for x := 10; x < 22; x++ {
			sy := y + bobY
			if sy < 0 || sy >= 32 { continue }

			// 2D Signed Distance Field (SDF) Rounded Box check
			dx := float64(x - 16)
			dy := float64(sy - 18)
			if (dx*dx)/25.0+(dy*dy)/36.0 <= 1.0 {
				c := clothCol
				if dx < -2 {
					c = shadowCol
				} else if dx > 2 {
					c = lightCol
				}
				img.Set(x, sy, c)
			}
		}
	}

	// Draw Head
	headY := 8 + bobY
	for y := headY - 4; y <= headY+4; y++ {
		for x := 12; x <= 20; x++ {
			dx := float64(x - 16)
			dy := float64(y - headY)
			if dx*dx+dy*dy <= 16.0 {
				img.Set(x, y, fleshCol)
			}
		}
	}

	// Apply dark pixel outline
	ApplyPixelOutline(img, outlineCol)

	return ebiten.NewImageFromImage(img)
}

// ApplyPixelOutline iterates over pixels and applies a 1px dark border around solid pixels.
func ApplyPixelOutline(img *image.RGBA, borderCol color.RGBA) {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	solid := make([][]bool, w)
	for x := 0; x < w; x++ {
		solid[x] = make([]bool, h)
		for y := 0; y < h; y++ {
			_, _, _, a := img.At(x, y).RGBA()
			if a > 0 {
				solid[x][y] = true
			}
		}
	}

	for x := 0; x < w; x++ {
		for y := 0; y < h; y++ {
			if !solid[x][y] {
				// Check 4-neighbor adjacency
				hasNeighbor := false
				if x > 0 && solid[x-1][y] { hasNeighbor = true }
				if x < w-1 && solid[x+1][y] { hasNeighbor = true }
				if y > 0 && solid[x][y-1] { hasNeighbor = true }
				if y < h-1 && solid[x][y+1] { hasNeighbor = true }

				if hasNeighbor {
					img.Set(x, y, borderCol)
				}
			}
		}
	}
}
