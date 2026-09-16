# 2D Physics, Collision Systems & Spatial Partitioning Reference

This module covers production 2D physics, collision detection, spatial partitioning, and slope handling algorithms for Ebitengine games.

---

## 1. Axis-Aligned Bounding Box (AABB) & Sweep Tests

AABB is the foundational collision primitive for 2D platformers and action games.

### 1.1 Static AABB Overlap Test
Two rectangles $A$ and $B$ overlap if and only if their projections overlap on both axes:

```go
type Rect struct {
	X, Y, Width, Height float64
}

func (r Rect) Overlaps(other Rect) bool {
	return r.X < other.X+other.Width &&
		r.X+r.Width > other.X &&
		r.Y < other.Y+other.Height &&
		r.Y+r.Height > other.Y
}
```

### 1.2 Swept AABB & Axis-Separated Resolution
To prevent tunneling (passing through thin walls at high velocities), separate velocity updates into X and Y axes and resolve collisions after each axis movement:

```go
type Entity struct {
	Bounds Rect
	VX, VY float64
	Grounded bool
}

func (e *Entity) MoveAndSlide(dt float64, solids []Rect) {
	// 1. Move X axis
	e.Bounds.X += e.VX * dt
	for _, solid := range solids {
		if e.Bounds.Overlaps(solid) {
			if e.VX > 0 {
				e.Bounds.X = solid.X - e.Bounds.Width
			} else if e.VX < 0 {
				e.Bounds.X = solid.X + solid.Width
			}
			e.VX = 0
			break
		}
	}

	// 2. Move Y axis
	e.Grounded = false
	e.Bounds.Y += e.VY * dt
	for _, solid := range solids {
		if e.Bounds.Overlaps(solid) {
			if e.VY > 0 { // Falling down
				e.Bounds.Y = solid.Y - e.Bounds.Height
				e.Grounded = true
			} else if e.VY < 0 { // Jumping up
				e.Bounds.Y = solid.Y + solid.Height
			}
			e.VY = 0
			break
		}
	}
}
```

---

## 2. Spatial Partitioning: Spatial Hashing & Quadtree

When managing $N > 100$ moving entities, naive pair-wise checks require $O(N^2)$ calculations. Spatial partitioning reduces checks to $O(N)$.

### 2.1 Spatial Hash Grid Pattern

Divide the world into a grid of uniform cell size (e.g. $64\times64$ pixels):

```go
type SpatialHash struct {
	CellSize float64
	Grid     map[int64][]int // CellKey -> Entity IDs
}

func NewSpatialHash(cellSize float64) *SpatialHash {
	return &SpatialHash{
		CellSize: cellSize,
		Grid:     make(map[int64][]int),
	}
}

func (sh *SpatialHash) key(cx, cy int) int64 {
	return (int64(cx) << 32) | (int64(cy) & 0xFFFFFFFF)
}

func (sh *SpatialHash) Clear() {
	for k := range sh.Grid {
		sh.Grid[k] = sh.Grid[k][:0]
	}
}

func (sh *SpatialHash) Insert(id int, bounds Rect) {
	minX := int(bounds.X / sh.CellSize)
	maxX := int((bounds.X + bounds.Width) / sh.CellSize)
	minY := int(bounds.Y / sh.CellSize)
	maxY := int((bounds.Y + bounds.Height) / sh.CellSize)

	for x := minX; x <= maxX; x++ {
		for y := minY; y <= maxY; y++ {
			k := sh.key(x, y)
			sh.Grid[k] = append(sh.Grid[k], id)
		}
	}
}
```

---

## 3. Platformer & Slope Physics

### 3.1 Variable Jump Gravity Curve
Apply higher gravity when the player releases the jump key early to give responsive platformer feel:

```go
const (
	Gravity          = 900.0 // Pixels/sec^2
	JumpForce        = -350.0
	JumpReleaseFactor = 0.5   // Cut vertical velocity on early release
)

func (e *Entity) UpdateJump(dt float64, jumpPressed, jumpJustReleased bool) {
	if e.Grounded && jumpPressed {
		e.VY = JumpForce
		e.Grounded = false
	}
	if jumpJustReleased && e.VY < 0 {
		e.VY *= JumpReleaseFactor
	}
	e.VY += Gravity * dt
}
```

### 3.2 Tilemap Raycast Slope Alignment
For 45-degree and 26-degree ramps, calculate target Y offset based on horizontal position within the slope tile:

```go
func GetSlopeY(tileX, tileY, tileSize float64, playerX float64, slopeType string) float64 {
	relX := playerX - tileX
	if relX < 0 { relX = 0 }
	if relX > tileSize { relX = tileSize }

	switch slopeType {
	case "slope_up_right": // 0 -> tileSize
		return (tileY + tileSize) - relX
	case "slope_up_left":  // tileSize -> 0
		return tileY + relX
	default:
		return tileY
	}
}
```
