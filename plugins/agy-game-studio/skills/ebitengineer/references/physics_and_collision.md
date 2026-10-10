# 2D Physics, Collision Systems & Spatial Partitioning Reference

This module covers genre-agnostic 2D physics and collision primitives (AABB, Circle, axis-separated sweep resolution, spatial hashing grids, and optional platformer gravity/slope math) for Ebitengine games across top-down, shmup, tactics, puzzle, isometric, and platformer genres.

---

## 1. Collision Primitives: AABB & Circle

### 1.1 Static AABB & Circle Overlap Tests

```go
package physics

import (
	"fmt"
	"math"
)

type Rect struct {
	X, Y, Width, Height float64
}

func (r Rect) Overlaps(other Rect) bool {
	return r.X < other.X+other.Width &&
		r.X+r.Width > other.X &&
		r.Y < other.Y+other.Height &&
		r.Y+r.Height > other.Y
}

type Circle struct {
	X, Y, Radius float64
}

// OverlapsCircle tests radial overlap (ideal for shmups, twin-stick shooters, and projectiles).
func (c Circle) OverlapsCircle(other Circle) bool {
	dx := c.X - other.X
	dy := c.Y - other.Y
	rSum := c.Radius + other.Radius
	return dx*dx+dy*dy < rSum*rSum
}

// OverlapsRect tests Circle-to-AABB overlap by clamping circle center to box bounds.
func (c Circle) OverlapsRect(r Rect) bool {
	closestX := math.Max(r.X, math.Min(c.X, r.X+r.Width))
	closestY := math.Max(r.Y, math.Min(c.Y, r.Y+r.Height))
	dx := c.X - closestX
	dy := c.Y - closestY
	return (dx*dx + dy*dy) < (c.Radius * c.Radius)
}
```

### 1.2 Axis-Separated Move & Slide Resolution
To prevent corner snagging and tunneling in top-down or side-scrolling movement, resolve X and Y velocity displacements independently:

```go
type Body struct {
	Bounds   Rect
	VX, VY   float64
	Grounded bool
}

func (b *Body) MoveAndSlide(dt float64, solids []Rect) {
	// 1. Move X axis
	b.Bounds.X += b.VX * dt
	for _, solid := range solids {
		if b.Bounds.Overlaps(solid) {
			if b.VX > 0 {
				b.Bounds.X = solid.X - b.Bounds.Width
			} else if b.VX < 0 {
				b.Bounds.X = solid.X + solid.Width
			}
			b.VX = 0
			break
		}
	}

	// 2. Move Y axis
	b.Grounded = false
	b.Bounds.Y += b.VY * dt
	for _, solid := range solids {
		if b.Bounds.Overlaps(solid) {
			if b.VY > 0 {
				b.Bounds.Y = solid.Y - b.Bounds.Height
				b.Grounded = true
			} else if b.VY < 0 {
				b.Bounds.Y = solid.Y + solid.Height
			}
			b.VY = 0
			break
		}
	}
}
```

---

## 2. Spatial Partitioning: Spatial Hash Grid

When managing $N > 100$ moving entities, naive pair-wise checks require $O(N^2)$ comparisons. A uniform spatial hash grid reduces broad-phase checks to $O(N)$ without per-frame heap allocations:

```go
type SpatialHash struct {
	CellSize float64
	Grid     map[int64][]int // CellKey -> Entity IDs
}

func NewSpatialHash(cellSize float64) (*SpatialHash, error) {
	if cellSize <= 0 {
		return nil, fmt.Errorf("physics: SpatialHash cellSize must be > 0, got %f", cellSize)
	}
	return &SpatialHash{
		CellSize: cellSize,
		Grid:     make(map[int64][]int, 128),
	}, nil
}

func (sh *SpatialHash) key(cx, cy int) int64 {
	return (int64(cx) << 32) | int64(uint32(cy))
}

// Clear resets all cell slices to length 0 while preserving underlying capacity.
func (sh *SpatialHash) Clear() {
	for k := range sh.Grid {
		sh.Grid[k] = sh.Grid[k][:0]
	}
}

func (sh *SpatialHash) Insert(id int, bounds Rect) {
	minX := int(math.Floor(bounds.X / sh.CellSize))
	maxX := int(math.Floor((bounds.X + bounds.Width) / sh.CellSize))
	minY := int(math.Floor(bounds.Y / sh.CellSize))
	maxY := int(math.Floor((bounds.Y + bounds.Height) / sh.CellSize))

	for x := minX; x <= maxX; x++ {
		for y := minY; y <= maxY; y++ {
			k := sh.key(x, y)
			sh.Grid[k] = append(sh.Grid[k], id)
		}
	}
}
```

---

## 3. Side-Scrolling & Slope Physics (Platformer Subsystems)

### 3.1 Variable Jump Gravity Curve
Apply a velocity cut multiplier when the player releases the jump input early:

```go
const (
	Gravity           = 900.0 // Virtual pixels/sec^2
	JumpForce         = -350.0
	JumpReleaseFactor = 0.5   // Cut upward velocity on early release
)

func (b *Body) UpdateJump(dt float64, jumpPressed, jumpJustReleased bool) {
	if b.Grounded && jumpPressed {
		b.VY = JumpForce
		b.Grounded = false
	}
	if jumpJustReleased && b.VY < 0 {
		b.VY *= JumpReleaseFactor
	}
	b.VY += Gravity * dt
}
```

### 3.2 Tilemap Slope Surface Evaluation
Calculate the exact vertical floor coordinate along a slope tile and fail fast if an unrecognized slope type is encountered:

```go
type SlopeType string

const (
	SlopeUpRight SlopeType = "slope_up_right"
	SlopeUpLeft  SlopeType = "slope_up_left"
)

func GetSlopeY(tileX, tileY, tileSize, entityX float64, slopeType SlopeType) (float64, error) {
	if tileSize <= 0 {
		return 0, fmt.Errorf("physics: tileSize must be > 0, got %f", tileSize)
	}
	relX := math.Max(0, math.Min(tileSize, entityX-tileX))

	switch slopeType {
	case SlopeUpRight:
		return (tileY + tileSize) - relX, nil
	case SlopeUpLeft:
		return tileY + relX, nil
	default:
		return 0, fmt.Errorf("physics: unsupported slope type %q", slopeType)
	}
}
```
