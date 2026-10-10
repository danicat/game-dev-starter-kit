# Kage Shaders (`//kage:unit pixels`) & `ebiten/v2/text/v2` Typography Reference

This module covers Ebitengine's Kage shading language using pixel-unit coordinates (`//kage:unit pixels`) for 2D lighting, CRT post-processing, and damage hit-flashes, alongside modern typography rendering with `github.com/hajimehoshi/ebiten/v2/text/v2`.

---

## 1. Kage Shaders (`//kage:unit pixels`)

Always declare `//kage:unit pixels` at the top of Kage shader files so `imageSrc0At(srcPos)` and uniform coordinates operate in predictable virtual pixel coordinates rather than normalized texture atlas UV fractions.

### 1.1 Sprite Damage Hit-Flash & Silhouette Tint Shader (`hit_flash.kage`)
Blends a sprite's sampled premultiplied pixel toward a solid flash color (e.g. pure white or red on hit) while preserving the original pixel's alpha silhouette:

```go
//go:build ignore

//kage:unit pixels

package main

var FlashAmount float // [0.0, 1.0]
var FlashColor vec3   // Unpremultiplied RGB in [0.0, 1.0], e.g. vec3(1.0, 1.0, 1.0)

func Fragment(dstPos vec4, srcPos vec2, color vec4) vec4 {
	px := imageSrc0At(srcPos) * color
	if px.a <= 0.0 {
		return vec4(0.0)
	}
	// Preserve premultiplied alpha invariant: RGB <= A
	targetRGB := FlashColor * px.a
	mixedRGB := mix(px.rgb, targetRGB, clamp(FlashAmount, 0.0, 1.0))
	return vec4(mixedRGB, px.a)
}
```

### 1.2 2D Radial Point Lighting & Vignette Shader (`lighting.kage`)
Applies dynamic point-light attenuation and ambient shadow tinting across any 2D scene (top-down dungeons, tactics maps, shmups, or side-scrollers):

```go
//go:build ignore

//kage:unit pixels

package main

var LightPos vec2      // Light position in virtual screen pixels
var LightRadius float  // Falloff radius in virtual pixels
var AmbientColor vec3  // Minimum ambient RGB illumination (e.g., vec3(0.15, 0.12, 0.25))
var LightColor vec3    // Point light RGB tint (e.g., vec3(1.0, 0.85, 0.55))

func Fragment(dstPos vec4, srcPos vec2, color vec4) vec4 {
	base := imageSrc0At(srcPos) * color
	if base.a <= 0.0 {
		return vec4(0.0)
	}

	// Calculate distance from current screen pixel to light center
	origin := imageDstOrigin()
	localPos := dstPos.xy - origin
	dist := distance(localPos, LightPos)

	// Smooth quadratic attenuation
	attenuation := clamp(1.0-(dist/LightRadius), 0.0, 1.0)
	attenuation = attenuation * attenuation

	illumination := AmbientColor + LightColor*attenuation
	return vec4(base.rgb*illumination, base.a)
}
```

### 1.3 CRT Scanline & Curvature Post-Processing Shader (`crt.kage`)

```go
//go:build ignore

//kage:unit pixels

package main

var ScreenSize vec2
var ScanlineIntensity float // e.g., 0.18

func Fragment(dstPos vec4, srcPos vec2, color vec4) vec4 {
	px := imageSrc0At(srcPos) * color
	// Apply horizontal scanline darkening on every odd virtual pixel row
	rowPhase := sin(srcPos.y * 3.14159265)
	scanline := 1.0 - ScanlineIntensity*(0.5-0.5*rowPhase)
	return vec4(px.rgb*scanline, px.a)
}
```

### 1.4 Compiling and Invoking Kage Shaders with Fail-Fast Validation
Compile shaders once during `Boot` initialization and reuse the pre-allocated uniform map and `ebiten.DrawRectShaderOptions` in `Draw()`:

```go
package render

import (
	"fmt"

	"github.com/hajimehoshi/ebiten/v2"
)

type ShaderPass struct {
	shader  *ebiten.Shader
	op      ebiten.DrawRectShaderOptions
}

func NewShaderPass(kageSource []byte) (*ShaderPass, error) {
	if len(kageSource) == 0 {
		return nil, fmt.Errorf("render: empty Kage shader source")
	}
	sh, err := ebiten.NewShader(kageSource)
	if err != nil {
		return nil, fmt.Errorf("render: compile Kage shader: %w", err)
	}
	sp := &ShaderPass{shader: sh}
	sp.op.Uniforms = make(map[string]any, 8)
	return sp, nil
}

func (sp *ShaderPass) DrawSpriteWithFlash(dst, src *ebiten.Image, x, y float64, flashAmount float32) {
	b := src.Bounds()
	sp.op.GeoM.Reset()
	sp.op.GeoM.Translate(x, y)
	sp.op.Images[0] = src
	sp.op.Uniforms["FlashAmount"] = flashAmount
	sp.op.Uniforms["FlashColor"] = []float32{1.0, 1.0, 1.0}
	dst.DrawRectShader(b.Dx(), b.Dy(), sp.shader, &sp.op)
}
```

---

## 2. Modern Typography with `ebiten/v2/text/v2`

> **CRITICAL RULE**: Never use `ebitenutil.DebugPrint` or `ebitenutil.DebugPrintAt` for user-facing game UI, and never import the deprecated `github.com/hajimehoshi/ebiten/v2/text` (v1) package. Always use `github.com/hajimehoshi/ebiten/v2/text/v2`.

### 2.1 Loading Embedded TTF/OTF Fonts (`text.NewGoTextFaceSource`)
Load the `text.GoTextFaceSource` once from `embed.FS` at startup and fail fast if the font binary is invalid:

```go
package ui

import (
	"bytes"
	"fmt"
	"image/color"
	"io/fs"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/text/v2"
)

type FontBank struct {
	source   *text.GoTextFaceSource
	BodyFace *text.GoTextFace
	TitleFace *text.GoTextFace
	drawOp   text.DrawOptions
}

func NewFontBank(assetsFS fs.FS, fontPath string, bodySize, titleSize float64) (*FontBank, error) {
	raw, err := fs.ReadFile(assetsFS, fontPath)
	if err != nil {
		return nil, fmt.Errorf("ui: read embedded font %q: %w", fontPath, err)
	}
	src, err := text.NewGoTextFaceSource(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("ui: parse TTF/OTF font source %q: %w", fontPath, err)
	}
	if bodySize <= 0 || titleSize <= 0 {
		return nil, fmt.Errorf("ui: font sizes must be > 0 (body=%.1f, title=%.1f)", bodySize, titleSize)
	}

	return &FontBank{
		source: src,
		BodyFace: &text.GoTextFace{
			Source: src,
			Size:   bodySize,
		},
		TitleFace: &text.GoTextFace{
			Source: src,
			Size:   titleSize,
		},
	}, nil
}
```

### 2.2 Aligned & Shadowed Text Rendering (`text.Draw`)
`text/v2` supports native horizontal/vertical alignment (`PrimaryAlign`, `SecondaryAlign`) and multiline line spacing (`LineSpacing`) directly via `text.DrawOptions`:

```go
// DrawAligned renders crisp text with a 1px drop shadow and zero heap allocations in Draw().
func (fb *FontBank) DrawAligned(
	screen *ebiten.Image,
	str string,
	face *text.GoTextFace,
	x, y float64,
	hAlign, vAlign text.Align,
	fgColor, shadowColor color.Color,
) {
	// 1. Draw drop shadow at (+1, +1)
	fb.drawOp.GeoM.Reset()
	fb.drawOp.GeoM.Translate(x+1, y+1)
	fb.drawOp.ColorScale.Reset()
	fb.drawOp.ColorScale.ScaleWithColor(shadowColor)
	fb.drawOp.LayoutOptions.PrimaryAlign = hAlign
	fb.drawOp.LayoutOptions.SecondaryAlign = vAlign
	fb.drawOp.LayoutOptions.LineSpacing = face.Size * 1.25
	text.Draw(screen, str, face, &fb.drawOp)

	// 2. Draw foreground text at (x, y)
	fb.drawOp.GeoM.Reset()
	fb.drawOp.GeoM.Translate(x, y)
	fb.drawOp.ColorScale.Reset()
	fb.drawOp.ColorScale.ScaleWithColor(fgColor)
	text.Draw(screen, str, face, &fb.drawOp)
}
```
