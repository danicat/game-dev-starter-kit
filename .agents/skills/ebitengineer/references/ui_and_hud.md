# UI, HUD & GUI Component Architecture Reference

This module covers 9-slice panel rendering, flexbox anchoring math, generic status/progress indicators (e.g. health, stamina, fuel, charge level, timer, or score progress), and widget state machines for Ebitengine games.

---

## 1. 9-Slice Panel Scaling

9-slice rendering scales UI dialogs and containers to any width/height without stretching or distorting corner pixels:

```go
type NineSlice struct {
	Image                 *ebiten.Image
	CornerW, CornerH      int
	CenterW, CenterH      int
}

func (ns *NineSlice) Draw(screen *ebiten.Image, destX, destY, width, height float64) {
	cw, ch := float64(ns.CornerW), float64(ns.CornerH)
	sw := width - (cw * 2)
	sh := height - (ch * 2)

	op := &ebiten.DrawImageOptions{}

	// Draw 9 grid patches: 4 corners (unscaled), 4 borders (scaled 1D), 1 center (scaled 2D)
	patches := []struct {
		srcRect image.Rectangle
		dx, dy, dw, dh float64
	}{
		// Top-Left Corner
		{image.Rect(0, 0, ns.CornerW, ns.CornerH), destX, destY, cw, ch},
		// Top Border
		{image.Rect(ns.CornerW, 0, ns.CornerW+ns.CenterW, ns.CornerH), destX + cw, destY, sw, ch},
		// Top-Right Corner
		{image.Rect(ns.CornerW+ns.CenterW, 0, ns.CornerW*2+ns.CenterW, ns.CornerH), destX + cw + sw, destY, cw, ch},
		// Left Border
		{image.Rect(0, ns.CornerH, ns.CornerW, ns.CornerH+ns.CenterH), destX, destY + ch, cw, sh},
		// Center Fill
		{image.Rect(ns.CornerW, ns.CornerH, ns.CornerW+ns.CenterW, ns.CornerH+ns.CenterH), destX + cw, destY + ch, sw, sh},
		// Right Border
		{image.Rect(ns.CornerW+ns.CenterW, ns.CornerH, ns.CornerW*2+ns.CenterW, ns.CornerH+ns.CenterH), destX + cw + sw, destY + ch, cw, sh},
		// Bottom-Left Corner
		{image.Rect(0, ns.CornerH+ns.CenterH, ns.CornerW, ns.CornerH*2+ns.CenterH), destX, destY + ch + sh, cw, ch},
		// Bottom Border
		{image.Rect(ns.CornerW, ns.CornerH+ns.CenterH, ns.CornerW+ns.CenterW, ns.CornerH*2+ns.CenterH), destX + cw, destY + ch + sh, sw, ch},
		// Bottom-Right Corner
		{image.Rect(ns.CornerW+ns.CenterW, ns.CornerH+ns.CenterH, ns.CornerW*2+ns.CenterW, ns.CornerH*2+ns.CenterH), destX + cw + sw, destY + ch + sh, cw, ch},
	}

	for _, p := range patches {
		if p.dw <= 0 || p.dh <= 0 { continue }
		sub := ns.Image.SubImage(p.srcRect).(*ebiten.Image)
		op.GeoM.Reset()
		op.GeoM.Scale(p.dw/float64(p.srcRect.Dx()), p.dh/float64(p.srcRect.Dy()))
		op.GeoM.Translate(p.dx, p.dy)
		screen.DrawImage(sub, op)
	}
}
```

---

## 2. Anchoring & Layout Math

Anchor UI elements relative to screen corners or virtual canvas edges:

```go
type AnchorType int

const (
	AnchorTopLeft AnchorType = iota
	AnchorTopCenter
	AnchorTopRight
	AnchorCenter
	AnchorBottomLeft
	AnchorBottomRight
)

func GetAnchoredPosition(anchor AnchorType, screenW, screenH, elementW, elementH, offsetX, offsetY float64) (float64, float64) {
	switch anchor {
	case AnchorTopLeft:
		return offsetX, offsetY
	case AnchorTopCenter:
		return (screenW-elementW)/2 + offsetX, offsetY
	case AnchorTopRight:
		return screenW - elementW - offsetX, offsetY
	case AnchorCenter:
		return (screenW-elementW)/2 + offsetX, (screenH-elementH)/2 + offsetY
	case AnchorBottomLeft:
		return offsetX, screenH - elementH - offsetY
	case AnchorBottomRight:
		return screenW - elementW - offsetX, screenH - elementH - offsetY
	default:
		return offsetX, offsetY
	}
}
```

---

## 3. Generic Progress & Status Indicators

Render smooth filled HUD bars (adaptable for health, stamina, boost fuel, charge timers, or progress meters) with border outlines and lerp animations:

```go
type ProgressBar struct {
	X, Y, Width, Height float64
	CurrentVal, MaxVal  float64
	FillColor, BgColor  color.Color
}

func (pb *ProgressBar) Draw(screen *ebiten.Image) {
	// Background
	bgImg := ebiten.NewImage(int(pb.Width), int(pb.Height))
	bgImg.Fill(pb.BgColor)
	op := &ebiten.DrawImageOptions{}
	op.GeoM.Translate(pb.X, pb.Y)
	screen.DrawImage(bgImg, op)

	// Fill ratio
	ratio := pb.CurrentVal / pb.MaxVal
	if ratio < 0 { ratio = 0 }
	if ratio > 1 { ratio = 1 }

	fillW := pb.Width * ratio
	if fillW > 0 {
		fillImg := ebiten.NewImage(int(fillW), int(pb.Height))
		fillImg.Fill(pb.FillColor)
		screen.DrawImage(fillImg, op)
	}
}
```

---

## 4. Interactive Button Widget State Machine

Manage Normal, Hover, Pressed, and Disabled states:

```go
type ButtonState int

const (
	StateNormal ButtonState = iota
	StateHover
	StatePressed
	StateDisabled
)

type Button struct {
	Bounds Rect
	State  ButtonState
	Text   string
}

func (b *Button) Update(cursorX, cursorY float64, isClicked bool) bool {
	if b.State == StateDisabled {
		return false
	}

	isHovered := b.Bounds.X <= cursorX && cursorX <= b.Bounds.X+b.Bounds.Width &&
		b.Bounds.Y <= cursorY && cursorY <= b.Bounds.Y+b.Bounds.Height

	if isHovered {
		if isClicked {
			b.State = StatePressed
			return true // Action triggered!
		}
		b.State = StateHover
	} else {
		b.State = StateNormal
	}
	return false
}
```
