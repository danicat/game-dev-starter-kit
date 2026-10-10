# Tilemaps, Level Design & Autotiling Reference

This module covers multi-layer tilemap architecture, pre-sliced tileset validation, camera frustum tile culling (orthogonal and isometric), and 16-pipe bitmask autotiling algorithms across 2D genres (top-down RPGs, tactics grids, puzzle boards, isometric strategy, and platformers).

---

## 1. Multi-Layer Tilemap Structure & Fail-Fast Pre-Slicing

Pre-slice all tileset `SubImage` references during `NewTilemap` initialization and validate every layer and tile ID. Never silently clamp or ignore out-of-bounds tile IDs:

```go
package tilemap

import (
	"fmt"
	"image"

	"github.com/hajimehoshi/ebiten/v2"
)

type LayerType int

const (
	LayerBackground LayerType = iota
	LayerTerrain
	LayerCollision
	LayerForeground
)

type Tilemap struct {
	Width, Height int             // Map dimensions in tiles
	TileSize      int             // Pixels per tile (e.g. 16 or 32)
	Layers        [][]int         // Layer index -> Tile ID array (length = Width * Height)
	Tileset       *ebiten.Image   // Source atlas
	TileImages    []*ebiten.Image // Pre-sliced tile sub-images (1-indexed; 0 = empty)
	drawOp        ebiten.DrawImageOptions
}

func NewTilemap(width, height, tileSize int, numLayers int, tileset *ebiten.Image) (*Tilemap, error) {
	if width <= 0 || height <= 0 || tileSize <= 0 {
		return nil, fmt.Errorf("tilemap: invalid dimensions (%dx%d, tileSize=%d)", width, height, tileSize)
	}
	if numLayers <= 0 {
		return nil, fmt.Errorf("tilemap: numLayers must be > 0, got %d", numLayers)
	}
	if tileset == nil {
		return nil, fmt.Errorf("tilemap: nil tileset image")
	}

	b := tileset.Bounds()
	if b.Dx()%tileSize != 0 || b.Dy()%tileSize != 0 {
		return nil, fmt.Errorf("tilemap: tileset dimensions (%dx%d) are not evenly divisible by tileSize (%d)", b.Dx(), b.Dy(), tileSize)
	}

	cols := b.Dx() / tileSize
	rows := b.Dy() / tileSize
	totalTiles := cols * rows

	// Pre-slice all tile sub-images at load time (index 0 is nil/empty)
	tileImages := make([]*ebiten.Image, totalTiles+1)
	for id := 1; id <= totalTiles; id++ {
		idx := id - 1
		sx := b.Min.X + (idx%cols)*tileSize
		sy := b.Min.Y + (idx/cols)*tileSize
		rect := image.Rect(sx, sy, sx+tileSize, sy+tileSize)
		tileImages[id] = tileset.SubImage(rect).(*ebiten.Image)
	}

	layers := make([][]int, numLayers)
	for i := range layers {
		layers[i] = make([]int, width*height)
	}

	return &Tilemap{
		Width:      width,
		Height:     height,
		TileSize:   tileSize,
		Layers:     layers,
		Tileset:    tileset,
		TileImages: tileImages,
	}, nil
}

// GetTile returns the tile ID at (x, y) on the specified layer, failing fast on invalid coordinates or layer.
func (tm *Tilemap) GetTile(layer LayerType, x, y int) (int, error) {
	if int(layer) < 0 || int(layer) >= len(tm.Layers) {
		return 0, fmt.Errorf("tilemap: layer %d out of bounds [0, %d)", layer, len(tm.Layers))
	}
	if x < 0 || x >= tm.Width || y < 0 || y >= tm.Height {
		return 0, fmt.Errorf("tilemap: tile coordinates (%d, %d) out of bounds (%dx%d)", x, y, tm.Width, tm.Height)
	}
	return tm.Layers[layer][y*tm.Width+x], nil
}

// SetTile assigns a validated tile ID at (x, y) on the specified layer.
func (tm *Tilemap) SetTile(layer LayerType, x, y, tileID int) error {
	if int(layer) < 0 || int(layer) >= len(tm.Layers) {
		return fmt.Errorf("tilemap: layer %d out of bounds [0, %d)", layer, len(tm.Layers))
	}
	if x < 0 || x >= tm.Width || y < 0 || y >= tm.Height {
		return fmt.Errorf("tilemap: tile coordinates (%d, %d) out of bounds (%dx%d)", x, y, tm.Width, tm.Height)
	}
	if tileID < 0 || tileID >= len(tm.TileImages) {
		return fmt.Errorf("tilemap: invalid tileID %d at (%d, %d): valid range is [0, %d]", tileID, x, y, len(tm.TileImages)-1)
	}
	tm.Layers[layer][y*tm.Width+x] = tileID
	return nil
}
```

---

## 2. Camera Frustum Tile Culling & Zero-Allocation Rendering

To maintain 60 FPS on large maps (e.g., 1000×1000 tiles), only iterate over the visible tile window intersecting the camera viewport and reuse `tm.drawOp` and pre-sliced `tm.TileImages`:

```go
func (tm *Tilemap) DrawLayer(screen *ebiten.Image, layer LayerType, camX, camY, screenW, screenH float64) error {
	if int(layer) < 0 || int(layer) >= len(tm.Layers) {
		return fmt.Errorf("tilemap: cannot draw invalid layer %d", layer)
	}

	minTileX := int(camX/float64(tm.TileSize)) - 1
	maxTileX := int((camX+screenW)/float64(tm.TileSize)) + 1
	minTileY := int(camY/float64(tm.TileSize)) - 1
	maxTileY := int((camY+screenH)/float64(tm.TileSize)) + 1

	// Frustum intersection with map bounds
	if minTileX < 0 {
		minTileX = 0
	}
	if maxTileX > tm.Width {
		maxTileX = tm.Width
	}
	if minTileY < 0 {
		minTileY = 0
	}
	if maxTileY > tm.Height {
		maxTileY = tm.Height
	}

	layerData := tm.Layers[layer]
	for y := minTileY; y < maxTileY; y++ {
		rowOffset := y * tm.Width
		for x := minTileX; x < maxTileX; x++ {
			tileID := layerData[rowOffset+x]
			if tileID == 0 {
				continue // Empty/transparent cell
			}
			if tileID < 0 || tileID >= len(tm.TileImages) {
				return fmt.Errorf("tilemap: corrupt tileID %d at (%d, %d) on layer %d", tileID, x, y, layer)
			}

			tm.drawOp.GeoM.Reset()
			tm.drawOp.GeoM.Translate(float64(x*tm.TileSize)-camX, float64(y*tm.TileSize)-camY)
			screen.DrawImage(tm.TileImages[tileID], &tm.drawOp)
		}
	}
	return nil
}
```

### 2.1 Isometric Grid Coordinate Conversion (2:1 Projection)
For isometric tactics, city-builders, and dungeon crawlers, convert between grid coordinates $(gx, gy)$ and screen coordinates $(sx, sy)$:

```go
func GridToIso(gx, gy, tileW, tileH float64) (sx, sy float64) {
	sx = (gx - gy) * (tileW * 0.5)
	sy = (gx + gy) * (tileH * 0.5)
	return sx, sy
}

func IsoToGrid(sx, sy, tileW, tileH float64) (gx, gy float64, err error) {
	if tileW <= 0 || tileH <= 0 {
		return 0, 0, fmt.Errorf("tilemap: invalid isometric tile dimensions (%.1fx%.1f)", tileW, tileH)
	}
	halfW := tileW * 0.5
	halfH := tileH * 0.5
	gx = (sx/halfW + sy/halfH) * 0.5
	gy = (sy/halfH - sx/halfW) * 0.5
	return gx, gy, nil
}
```

---

## 3. 16-Pipe Bitmask Autotiling Algorithm

Autotiling automatically selects the correct terrain edge/corner graphic based on 4 cardinal neighbor tiles (North, West, East, South):

### 3.1 Bitmask Directional Values
* **North (Top)** = `1` (`1 << 0`)
* **West (Left)** = `2` (`1 << 1`)
* **East (Right)** = `4` (`1 << 2`)
* **South (Bottom)** = `8` (`1 << 3`)

```go
func (tm *Tilemap) CalculateAutotileMask(layer LayerType, x, y int, terrainID int) (int, error) {
	if int(layer) < 0 || int(layer) >= len(tm.Layers) {
		return 0, fmt.Errorf("tilemap: layer %d out of bounds", layer)
	}
	if x < 0 || x >= tm.Width || y < 0 || y >= tm.Height {
		return 0, fmt.Errorf("tilemap: coordinates (%d, %d) out of bounds", x, y)
	}

	matches := func(nx, ny int) bool {
		if nx < 0 || nx >= tm.Width || ny < 0 || ny >= tm.Height {
			return false
		}
		return tm.Layers[layer][ny*tm.Width+nx] == terrainID
	}

	mask := 0
	if matches(x, y-1) {
		mask |= 1 // North
	}
	if matches(x-1, y) {
		mask |= 2 // West
	}
	if matches(x+1, y) {
		mask |= 4 // East
	}
	if matches(x, y+1) {
		mask |= 8 // South
	}
	return mask, nil
}
```

### 3.2 16-Value Autotile Mapping Table
Map calculated mask values (`0–15`) to tileset column/row offsets:

| Mask Value | Neighbors Present | Autotile Tile Type |
| :--- | :--- | :--- |
| `0` | None | Isolated Pillar / Island Tile |
| `15` | N + W + E + S | Full Center Filling Tile |
| `1` | N | Bottom Dead-End Cap |
| `8` | S | Top Dead-End Cap |
| `2` | W | Right Dead-End Cap |
| `4` | E | Left Dead-End Cap |
| `5` | N + E | Bottom-Left Corner Tile |
| `3` | N + W | Bottom-Right Corner Tile |
| `10` | S + W | Top-Right Corner Tile |
| `12` | S + E | Top-Left Corner Tile |
