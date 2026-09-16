# Tilemaps, Level Design & Autotiling Reference

This module covers parsing tilemap formats, multi-layer rendering, camera frustum culling, and 16-pipe bitmask autotiling algorithms.

---

## 1. Multi-Layer Tilemap Structure & Parsing

A 2D tilemap consists of a grid of tile IDs organized across functional layers:

```go
type LayerType int

const (
	LayerBackground LayerType = iota
	LayerTerrain
	LayerCollision
	LayerForeground
)

type Tilemap struct {
	Width, Height int      // In tiles
	TileSize      int      // Pixels per tile (e.g. 16 or 32)
	Layers        [][]int  // Layer index -> Tile ID array (length = Width * Height)
	Tileset       *ebiten.Image
	TileColumns   int      // Number of tiles per row in tileset image
}

func (tm *Tilemap) GetTile(layer LayerType, x, y int) int {
	if x < 0 || x >= tm.Width || y < 0 || y >= tm.Height {
		return 0
	}
	return tm.Layers[layer][y*tm.Width+x]
}
```

---

## 2. Camera Frustum Tile Culling

To maintain 60 FPS on large maps ($1000\times1000$ tiles), only iterate over tiles visible within the camera's viewport:

```go
func (tm *Tilemap) DrawLayer(screen *ebiten.Image, layer LayerType, camX, camY, screenW, screenH float64) {
	// Calculate tile bounds visible in camera viewport
	minTileX := int((camX) / float64(tm.TileSize)) - 1
	maxTileX := int((camX + screenW) / float64(tm.TileSize)) + 1
	minTileY := int((camY) / float64(tm.TileSize)) - 1
	maxTileY := int((camY + screenH) / float64(tm.TileSize)) + 1

	// Clamp to map boundaries
	if minTileX < 0 { minTileX = 0 }
	if maxTileX > tm.Width { maxTileX = tm.Width }
	if minTileY < 0 { minTileY = 0 }
	if maxTileY > tm.Height { maxTileY = tm.Height }

	op := &ebiten.DrawImageOptions{}

	for y := minTileY; y < maxTileY; y++ {
		for x := minTileX; x < maxTileX; x++ {
			tileID := tm.GetTile(layer, x, y)
			if tileID == 0 { continue } // Empty/transparent tile

			// Compute source rect in tileset texture
			srcX := (tileID % tm.TileColumns) * tm.TileSize
			srcY := (tileID / tm.TileColumns) * tm.TileSize
			srcRect := image.Rect(srcX, srcY, srcX+tm.TileSize, srcY+tm.TileSize)

			// Position on screen relative to camera
			op.GeoM.Reset()
			op.GeoM.Translate(float64(x*tm.TileSize)-camX, float64(y*tm.TileSize)-camY)

			subImage := tm.Tileset.SubImage(srcRect).(*ebiten.Image)
			screen.DrawImage(subImage, op)
		}
	}
}
```

---

## 3. 16-Pipe Bitmask Autotiling Algorithm

Autotiling automatically selects the correct terrain edge/corner graphic based on 4 cardinal neighbor tiles (North, South, East, West):

### 3.1 Bitmask Directional Values
Assign powers of 2 to cardinal directions:
* **North (Top)** = $1$
* **West (Left)** = $2$
* **East (Right)** = $4$
* **South (Bottom)** = $8$

```go
func (tm *Tilemap) CalculateAutotileMask(x, y int, terrainID int) int {
	mask := 0
	if tm.GetTile(LayerTerrain, x, y-1) == terrainID { mask |= 1 } // North
	if tm.GetTile(LayerTerrain, x-1, y) == terrainID { mask |= 2 } // West
	if tm.GetTile(LayerTerrain, x+1, y) == terrainID { mask |= 4 } // East
	if tm.GetTile(LayerTerrain, x, y+1) == terrainID { mask |= 8 } // South
	return mask // Resulting mask between 0 and 15
}
```

### 3.2 16-Value Autotile Mapping Table
Map calculated mask values ($0\text{--}15$) to tileset column/row offsets:

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
