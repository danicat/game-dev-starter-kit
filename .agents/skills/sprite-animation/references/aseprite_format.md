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

## 7. Recommended Ebitengine Library: `goaseprite`

For Ebitengine applications, use [SolarLune/goaseprite](https://github.com/SolarLune/goaseprite) to load exported Aseprite JSON manifests and sprite sheet images seamlessly:

```bash
go get github.com/SolarLune/goaseprite
```

Example integration:
```go
import "github.com/SolarLune/goaseprite"

// Load Aseprite JSON definition
anim := goaseprite.New("assets/player.json")

// Update animation state in Ebiten Update(dt)
anim.Update(float32(dt))

// Play specific animation tag
anim.Play("run")

// Draw current animation frame in Ebiten Draw()
op := &ebiten.DrawImageOptions{}
op.GeoM.Translate(x, y)
screen.DrawImage(anim.Image.SubImage(anim.CurrentFrameBounds()).(*ebiten.Image), op)
```
