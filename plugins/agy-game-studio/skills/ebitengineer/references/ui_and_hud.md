# UI, HUD & GUI Component Architecture Reference

This module covers premultiplied alpha color invariants, 9-slice panel rendering, flexbox anchoring math, zero-allocation progress/status indicators, and interactive widget state machines using `github.com/hajimehoshi/ebiten/v2/text/v2`.

---

## 1. Premultiplied Alpha Invariant (`color.RGBA` vs. `color.NRGBA`)

In Go's standard `image/color` package and Ebitengine's rendering pipeline, `color.RGBA` represents **alpha-premultiplied** 8-bit color channels, whereas `color.NRGBA` represents **non-premultiplied** (straight alpha) channels.

### 1.1 The `R, G, B <= A` Invariant
For every valid `color.RGBA{R, G, B, A}`, the color channels **must** satisfy:

$$
R \le A, \quad G \le A, \quad B \le A
$$

Passing a non-premultiplied literal such as `color.RGBA{255, 0, 0, 100}` violates $R \le A$ ($255 > 100$), causing additive blowout, corrupted blending, or glowing artifacts in Ebitengine shaders and `ColorScale` operations.

```go
package ui

import (
	"fmt"
	"image/color"
)

// Premultiplied Alpha Examples:
var (
	// WRONG: R (255) > A (100) violates premultiplied alpha invariant!
	// InvalidTranslucentRed = color.RGBA{255, 0, 0, 100}

	// CORRECT Option A: Use premultiplied color.RGBA where R, G, B <= A
	ValidTranslucentRedRGBA = color.RGBA{R: 100, G: 0, B: 0, A: 100}

	// CORRECT Option B: Use straight-alpha color.NRGBA (Ebitengine converts on ColorScale)
	ValidTranslucentRedNRGBA = color.NRGBA{R: 255, G: 0, B: 0, A: 100}
)

// NewPremultipliedRGBA constructs a valid premultiplied color.RGBA from straight RGB and alpha,
// failing fast if any channel is out of bounds.
func NewPremultipliedRGBA(r, g, b, a uint8) color.RGBA {
	alpha := uint16(a)
	return color.RGBA{
		R: uint8((uint16(r)*alpha + 127) / 255),
		G: uint8((uint16(g)*alpha + 127) / 255),
		B: uint8((uint16(b)*alpha + 127) / 255),
		A: a,
	}
}

// ValidatePremultipliedRGBA fails fast if a color.RGBA violates R, G, B <= A.
func ValidatePremultipliedRGBA(c color.RGBA) error {
	if c.R > c.A || c.G > c.A || c.B > c.A {
		return fmt.Errorf("ui: invalid premultiplied color.RGBA{%d, %d, %d, %d}: RGB channels must not exceed A (%d)", c.R, c.G, c.B, c.A, c.A)
	}
	return nil
}
```

---

## 2. Zero-Allocation 9-Slice Panel Scaling

9-slice rendering scales UI dialogs and containers to any width/height without stretching corner pixels. Pre-slice the 9 sub-images once at construction time (`NewNineSlice`) so `Draw()` performs zero heap allocations:

```go
package ui

import (
	"fmt"
	"image"

	"github.com/hajimehoshi/ebiten/v2"
)

type NineSlice struct {
	patches          [9]*ebiten.Image
	CornerW, CornerH int
	CenterW, CenterH int
	drawOp           ebiten.DrawImageOptions
}

func NewNineSlice(img *ebiten.Image, cornerW, cornerH, centerW, centerH int) (*NineSlice, error) {
	if img == nil {
		return nil, fmt.Errorf("ui: nil source image for NineSlice")
	}
	if cornerW <= 0 || cornerH <= 0 || centerW <= 0 || centerH <= 0 {
		return nil, fmt.Errorf("ui: invalid NineSlice dimensions (corner=%dx%d, center=%dx%d)", cornerW, cornerH, centerW, centerH)
	}
	totalW := cornerW*2 + centerW
	totalH := cornerH*2 + centerH
	b := img.Bounds()
	if b.Dx() < totalW || b.Dy() < totalH {
		return nil, fmt.Errorf("ui: image bounds (%dx%d) smaller than required NineSlice grid (%dx%d)", b.Dx(), b.Dy(), totalW, totalH)
	}

	x0, x1, x2, x3 := b.Min.X, b.Min.X+cornerW, b.Min.X+cornerW+centerW, b.Min.X+totalW
	y0, y1, y2, y3 := b.Min.Y, b.Min.Y+cornerH, b.Min.Y+cornerH+centerH, b.Min.Y+totalH

	rects := [9]image.Rectangle{
		image.Rect(x0, y0, x1, y1), // 0: Top-Left
		image.Rect(x1, y0, x2, y1), // 1: Top-Center
		image.Rect(x2, y0, x3, y1), // 2: Top-Right
		image.Rect(x0, y1, x1, y2), // 3: Middle-Left
		image.Rect(x1, y1, x2, y2), // 4: Center
		image.Rect(x2, y1, x3, y2), // 5: Middle-Right
		image.Rect(x0, y2, x1, y3), // 6: Bottom-Left
		image.Rect(x1, y2, x2, y3), // 7: Bottom-Center
		image.Rect(x2, y2, x3, y3), // 8: Bottom-Right
	}

	ns := &NineSlice{
		CornerW: cornerW,
		CornerH: cornerH,
		CenterW: centerW,
		CenterH: centerH,
	}
	for i, r := range rects {
		ns.patches[i] = img.SubImage(r).(*ebiten.Image)
	}
	return ns, nil
}

func (ns *NineSlice) Draw(screen *ebiten.Image, destX, destY, width, height float64) {
	cw, ch := float64(ns.CornerW), float64(ns.CornerH)
	sw := width - (cw * 2)
	sh := height - (ch * 2)
	if sw <= 0 || sh <= 0 {
		return
	}

	coords := [9][4]float64{
		{destX, destY, cw, ch},
		{destX + cw, destY, sw, ch},
		{destX + cw + sw, destY, cw, ch},
		{destX, destY + ch, cw, sh},
		{destX + cw, destY + ch, sw, sh},
		{destX + cw + sw, destY + ch, cw, sh},
		{destX, destY + ch + sh, cw, ch},
		{destX + cw, destY + ch + sh, sw, ch},
		{destX + cw + sw, destY + ch + sh, cw, ch},
	}

	for i, c := range coords {
		patch := ns.patches[i]
		pb := patch.Bounds()
		ns.drawOp.GeoM.Reset()
		ns.drawOp.GeoM.Scale(c[2]/float64(pb.Dx()), c[3]/float64(pb.Dy()))
		ns.drawOp.GeoM.Translate(c[0], c[1])
		screen.DrawImage(patch, &ns.drawOp)
	}
}
```

---

## 3. Anchoring & Layout Math

Anchor UI elements relative to virtual canvas edges with fail-fast validation on anchor types:

```go
type AnchorType int

const (
	AnchorTopLeft AnchorType = iota
	AnchorTopCenter
	AnchorTopRight
	AnchorCenter
	AnchorBottomLeft
	AnchorBottomCenter
	AnchorBottomRight
)

func GetAnchoredPosition(anchor AnchorType, screenW, screenH, elementW, elementH, offsetX, offsetY float64) (float64, float64, error) {
	switch anchor {
	case AnchorTopLeft:
		return offsetX, offsetY, nil
	case AnchorTopCenter:
		return (screenW-elementW)*0.5 + offsetX, offsetY, nil
	case AnchorTopRight:
		return screenW - elementW - offsetX, offsetY, nil
	case AnchorCenter:
		return (screenW-elementW)*0.5 + offsetX, (screenH-elementH)*0.5 + offsetY, nil
	case AnchorBottomLeft:
		return offsetX, screenH - elementH - offsetY, nil
	case AnchorBottomCenter:
		return (screenW-elementW)*0.5 + offsetX, screenH - elementH - offsetY, nil
	case AnchorBottomRight:
		return screenW - elementW - offsetX, screenH - elementH - offsetY, nil
	default:
		return 0, 0, fmt.Errorf("ui: unsupported AnchorType %d", anchor)
	}
}
```

---

## 4. Zero-Allocation Progress & Status Indicators

Never call `ebiten.NewImage` inside `Draw()`. Pre-allocate a shared 1×1 white pixel image at boot and scale/tint it via `ebiten.DrawImageOptions`:

```go
type ProgressBar struct {
	X, Y, Width, Height float64
	CurrentVal, MaxVal  float64
	FillColor, BgColor  color.RGBA
	whitePixel          *ebiten.Image
	drawOp              ebiten.DrawImageOptions
}

func NewProgressBar(whitePixel *ebiten.Image, x, y, width, height, maxVal float64, fillColor, bgColor color.RGBA) (*ProgressBar, error) {
	if whitePixel == nil {
		return nil, fmt.Errorf("ui: nil whitePixel texture for ProgressBar")
	}
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("ui: ProgressBar dimensions must be > 0 (got %.1fx%.1f)", width, height)
	}
	if maxVal <= 0 {
		return nil, fmt.Errorf("ui: ProgressBar maxVal must be > 0 (got %.2f)", maxVal)
	}
	if err := ValidatePremultipliedRGBA(fillColor); err != nil {
		return nil, fmt.Errorf("ui: ProgressBar fillColor: %w", err)
	}
	if err := ValidatePremultipliedRGBA(bgColor); err != nil {
		return nil, fmt.Errorf("ui: ProgressBar bgColor: %w", err)
	}
	return &ProgressBar{
		X:          x,
		Y:          y,
		Width:      width,
		Height:     height,
		CurrentVal: maxVal,
		MaxVal:     maxVal,
		FillColor:  fillColor,
		BgColor:    bgColor,
		whitePixel: whitePixel,
	}, nil
}

func (pb *ProgressBar) Draw(screen *ebiten.Image) {
	// 1. Background bar (scaled 1x1 white pixel, zero allocations)
	pb.drawOp.GeoM.Reset()
	pb.drawOp.GeoM.Scale(pb.Width, pb.Height)
	pb.drawOp.GeoM.Translate(pb.X, pb.Y)
	pb.drawOp.ColorScale.Reset()
	pb.drawOp.ColorScale.ScaleWithColor(pb.BgColor)
	screen.DrawImage(pb.whitePixel, &pb.drawOp)

	// 2. Foreground fill bar
	ratio := pb.CurrentVal / pb.MaxVal
	if ratio < 0 {
		ratio = 0
	} else if ratio > 1 {
		ratio = 1
	}

	fillW := pb.Width * ratio
	if fillW > 0 {
		pb.drawOp.GeoM.Reset()
		pb.drawOp.GeoM.Scale(fillW, pb.Height)
		pb.drawOp.GeoM.Translate(pb.X, pb.Y)
		pb.drawOp.ColorScale.Reset()
		pb.drawOp.ColorScale.ScaleWithColor(pb.FillColor)
		screen.DrawImage(pb.whitePixel, &pb.drawOp)
	}
}
```

---

## 5. Interactive Button Widget with `ebiten/v2/text/v2`

Manage `StateNormal`, `StateHover`, `StatePressed`, and `StateDisabled` states and render centered button labels using `github.com/hajimehoshi/ebiten/v2/text/v2`:

```go
import (
	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/text/v2"
)

type ButtonState int

const (
	StateNormal ButtonState = iota
	StateHover
	StatePressed
	StateDisabled
)

type Button struct {
	X, Y, Width, Height float64
	State               ButtonState
	Label               string
	Face                *text.GoTextFace
	textOp              text.DrawOptions
}

func (b *Button) Update(cursorX, cursorY float64, isClicked bool) bool {
	if b.State == StateDisabled {
		return false
	}

	isHovered := b.X <= cursorX && cursorX <= b.X+b.Width &&
		b.Y <= cursorY && cursorY <= b.Y+b.Height

	if isHovered {
		if isClicked {
			b.State = StatePressed
			return true
		}
		b.State = StateHover
	} else {
		b.State = StateNormal
	}
	return false
}

func (b *Button) DrawLabel(screen *ebiten.Image, textColor color.RGBA) {
	b.textOp.GeoM.Reset()
	b.textOp.GeoM.Translate(b.X+b.Width*0.5, b.Y+b.Height*0.5)
	b.textOp.ColorScale.Reset()
	b.textOp.ColorScale.ScaleWithColor(textColor)
	b.textOp.LayoutOptions.PrimaryAlign = text.AlignCenter
	b.textOp.LayoutOptions.SecondaryAlign = text.AlignCenter
	text.Draw(screen, b.Label, b.Face, &b.textOp)
}
```
