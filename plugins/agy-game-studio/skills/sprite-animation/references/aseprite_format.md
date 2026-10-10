# Aseprite File Format (.ase/.aseprite) & GIMP Palette (.gpl) Specifications

Official Aseprite Specifications: [aseprite/aseprite](https://github.com/aseprite/aseprite)
Recommended Ebitengine Integration Library: [SolarLune/goaseprite](https://github.com/SolarLune/goaseprite)

---

## 1. References & Types

ASE files use Intel (little-endian) byte order.

* `BYTE`: An 8-bit unsigned integer value
* `WORD`: A 16-bit unsigned integer value
* `SHORT`: A 16-bit signed integer value
* `DWORD`: A 32-bit unsigned integer value
* `LONG`: A 32-bit signed integer value
* `FIXED`: A 32-bit fixed point (16.16) value
* `FLOAT`: A 32-bit single-precision value
* `DOUBLE`: A 64-bit double-precision value
* `QWORD`: A 64-bit unsigned integer value
* `LONG64`: A 64-bit signed integer value
* `BYTE[n]`: "n" bytes.
* `STRING`:
  - `WORD`: string length (number of bytes)
  - `BYTE[length]`: characters (in UTF-8). The `'\0'` character is not included.
* `POINT`:
  - `LONG`: X coordinate value
  - `LONG`: Y coordinate value
* `SIZE`:
  - `LONG`: Width value
  - `LONG`: Height value
* `RECT`:
  - `POINT`: Origin coordinates
  - `SIZE`: Rectangle size
* `PIXEL`: One pixel, depending on the image pixel format:
  - **RGBA**: `BYTE[4]`, each pixel has 4 bytes in order Red, Green, Blue, Alpha.
  - **Grayscale**: `BYTE[2]`, each pixel has 2 bytes in order Value, Alpha.
  - **Indexed**: `BYTE`, each pixel uses 1 byte (the index).
* `TILE`: **Tilemaps**: Each tile can be an 8-bit (`BYTE`), 16-bit (`WORD`), or 32-bit (`DWORD`) value with masks for bit meaning.
* `UUID`: A Universally Unique Identifier stored as `BYTE[16]`.

---

## 2. File Architecture

The format consists of an ASE header followed by frames. Color depth can be 8 (Indexed), 16 (Grayscale), or 32 (RGBA), compressed with ZLIB.

To read the sprite:
1. Read the **ASE Header** (128 bytes).
2. For each frame (indicated by header frame count):
   - Read the **Frame Header** (16 bytes).
   - For each chunk in this frame (indicated by frame header chunk count):
     - Read the chunk data (Layer info, Cel, Palette, Tags, Slices, or User Data).

---

## 3. Header Specification (128 Bytes)

```text
DWORD       File size
WORD        Magic number (0xA5E0)
WORD        Frames
WORD        Width in pixels
WORD        Height in pixels
WORD        Color depth (32 bpp = RGBA, 16 bpp = Grayscale, 8 bpp = Indexed)
DWORD       Flags:
              1 = Layer opacity has valid value
              2 = Layer blend mode/opacity is valid for groups
              4 = Layers have a UUID
WORD        Speed (milliseconds between frames - DEPRECATED: use frame header duration)
DWORD       Reserved (0)
DWORD       Reserved (0)
BYTE        Transparent palette index (for Indexed sprites)
BYTE[3]     Ignore
WORD        Number of colors (0 means 256 for old sprites)
BYTE        Pixel width ratio
BYTE        Pixel height ratio
SHORT       X position of grid
SHORT       Y position of grid
WORD        Grid width (default 16x16)
WORD        Grid height
BYTE[84]    For future (set to 0)
```

---

## 4. Frame Header (16 Bytes)

```text
DWORD       Bytes in this frame
WORD        Magic number (0xF1FA)
WORD        Old chunk count (if 0xFFFF, use new field)
WORD        Frame duration (in milliseconds)
BYTE[2]     Reserved (0)
DWORD       New chunk count (if 0, use old field)
```

Each chunk follows this format:
```text
DWORD       Chunk size (>= 6 bytes)
WORD        Chunk type
BYTE[]      Chunk data
```

---

## 5. Primary Chunk Types

- **Layer Chunk (`0x2004`)**: Flags (Visible, Editable, Background), Layer type (0=Normal, 1=Group, 2=Tilemap), Blend mode, Opacity, Name.
- **Cel Chunk (`0x2005`)**: Layer index, X/Y position, Opacity, Cel type (0=Raw, 1=Linked, 2=ZLIB Compressed Image, 3=ZLIB Compressed Tilemap), Z-Index.
- **Tags Chunk (`0x2018`)**: Animation tag ranges (`From frame`, `To frame`), Loop direction (`0`=Forward, `1`=Reverse, `2`=Ping-pong, `3`=Ping-pong Reverse), Repeat count, Tag name.
- **Palette Chunk (`0x2019`)**: New palette size, First/Last color index, RGBA values, optional Color name strings.
- **Slice Chunk (`0x2022`)**: Slice keys, 9-patch center bounds, pivot X/Y coordinates relative to slice origin.
- **Tileset Chunk (`0x2023`)**: Tileset ID, Tile width/height, compressed tilemap images.

---

## 6. GIMP Palette File Format Extension (`.gpl`)

Aseprite supports reading and writing GIMP Palette (`.gpl`) files extended with **RGBA alpha channel information**:

```text
GIMP Palette
Channels: RGBA
#
  0   0   0   0 Transparent
254  91  89 255 Red
247 165  71 255 Orange
243 206  82 255 Yellow
106 205  91 255 Green
 87 185 242 255 Blue
209 134 223 255 Purple
165 165 167 255 Gray
```

Header MUST specify `Channels: RGBA`, and each palette entry contains `Red Green Blue Alpha Name`.

---

## 7. Zero-Allocation `goaseprite` Integration Pattern

When using [SolarLune/goaseprite](https://github.com/SolarLune/goaseprite) with Ebitengine, pre-slice all frame sub-images at initialization time and reuse a persistent `ebiten.DrawImageOptions` field so `Draw()` performs zero heap allocations:

```go
package entity

import (
	"fmt"
	"image"

	"github.com/SolarLune/goaseprite"
	"github.com/hajimehoshi/ebiten/v2"
)

type AsepriteActor struct {
	File   *goaseprite.File
	Frames []*ebiten.Image
	X, Y   float64
	drawOp ebiten.DrawImageOptions
}

func NewAsepriteActor(jsonBytes []byte, atlas *ebiten.Image) (*AsepriteActor, error) {
	if len(jsonBytes) == 0 {
		return nil, fmt.Errorf("sprite-animation: empty Aseprite JSON manifest")
	}
	if atlas == nil {
		return nil, fmt.Errorf("sprite-animation: nil atlas image")
	}
	file := goaseprite.Read(jsonBytes)
	if file == nil || len(file.Frames) == 0 {
		return nil, fmt.Errorf("sprite-animation: failed to parse Aseprite frames from JSON")
	}

	// Pre-slice every frame at load time (zero SubImage calls in Draw)
	frames := make([]*ebiten.Image, len(file.Frames))
	for i, f := range file.Frames {
		rect := image.Rect(f.X, f.Y, f.X+f.Width, f.Y+f.Height)
		frames[i] = atlas.SubImage(rect).(*ebiten.Image)
	}

	return &AsepriteActor{
		File:   file,
		Frames: frames,
	}, nil
}

func (a *AsepriteActor) Update(dt float32) {
	a.File.Update(dt)
}

func (a *AsepriteActor) Draw(screen *ebiten.Image) error {
	idx := a.File.CurrentFrame
	if idx < 0 || idx >= len(a.Frames) {
		return fmt.Errorf("sprite-animation: frame index %d out of bounds [0, %d)", idx, len(a.Frames))
	}
	a.drawOp.GeoM.Reset()
	a.drawOp.GeoM.Translate(a.X, a.Y)
	screen.DrawImage(a.Frames[idx], &a.drawOp)
	return nil
}
```
