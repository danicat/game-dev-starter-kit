// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package references

import (
	"fmt"
	"image"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
)

// LoopMode defines how an animation tag behaves at sequence completion.
type LoopMode int

const (
	LoopForward LoopMode = iota
	LoopReverse
	LoopPingPong
	LoopOnce
)

// AnimationTag defines a named animation sequence range (e.g., "idle", "run", "attack").
type AnimationTag struct {
	Name          string
	StartFrame    int
	EndFrame      int
	FrameDuration time.Duration // Duration per frame (must be > 0, e.g. 100ms)
	Loop          LoopMode
}

// GridSpriteSheet represents a validated N x M sprite sheet grid with pre-sliced frame sub-images.
type GridSpriteSheet struct {
	Image       *ebiten.Image
	Frames      []*ebiten.Image
	FrameWidth  int
	FrameHeight int
	Columns     int
	Rows        int
	TotalFrames int
}

// NewGridSpriteSheet validates sheet dimensions and pre-slices all frame SubImage references at load time.
// Never call SubImage inside Draw().
func NewGridSpriteSheet(img *ebiten.Image, frameWidth, frameHeight int) (*GridSpriteSheet, error) {
	if img == nil {
		return nil, fmt.Errorf("sprite-animation: nil source sprite sheet image")
	}
	if frameWidth <= 0 || frameHeight <= 0 {
		return nil, fmt.Errorf("sprite-animation: invalid frame dimensions (%dx%d): must be > 0", frameWidth, frameHeight)
	}

	b := img.Bounds()
	sheetW, sheetH := b.Dx(), b.Dy()
	if sheetW <= 0 || sheetH <= 0 {
		return nil, fmt.Errorf("sprite-animation: empty sprite sheet bounds (%dx%d)", sheetW, sheetH)
	}
	if sheetW%frameWidth != 0 || sheetH%frameHeight != 0 {
		return nil, fmt.Errorf(
			"sprite-animation: sprite sheet dimensions (%dx%d) are not evenly divisible by frame size (%dx%d)",
			sheetW, sheetH, frameWidth, frameHeight,
		)
	}

	cols := sheetW / frameWidth
	rows := sheetH / frameHeight
	total := cols * rows

	frames := make([]*ebiten.Image, total)
	for i := 0; i < total; i++ {
		col := i % cols
		row := i / cols
		x0 := b.Min.X + col*frameWidth
		y0 := b.Min.Y + row*frameHeight
		rect := image.Rect(x0, y0, x0+frameWidth, y0+frameHeight)
		frames[i] = img.SubImage(rect).(*ebiten.Image)
	}

	return &GridSpriteSheet{
		Image:       img,
		Frames:      frames,
		FrameWidth:  frameWidth,
		FrameHeight: frameHeight,
		Columns:     cols,
		Rows:        rows,
		TotalFrames: total,
	}, nil
}

// GetFrame returns the pre-sliced ebiten.Image for a 0-indexed frame, failing fast if out of bounds.
func (ss *GridSpriteSheet) GetFrame(frameIndex int) (*ebiten.Image, error) {
	if frameIndex < 0 || frameIndex >= len(ss.Frames) {
		return nil, fmt.Errorf("sprite-animation: frame index %d out of bounds [0, %d)", frameIndex, len(ss.Frames))
	}
	return ss.Frames[frameIndex], nil
}

// AnimationController manages state transitions, timers, and zero-allocation frame rendering.
type AnimationController struct {
	SpriteSheet  *GridSpriteSheet
	Tags         map[string]AnimationTag
	CurrentTag   string
	CurrentFrame int
	FrameTimer   time.Duration
	IsPlaying    bool
	PingPongRev  bool
	OnComplete   func(tagName string)
	drawOp       ebiten.DrawImageOptions
}

// NewAnimationController initializes a fail-fast controller for a validated GridSpriteSheet.
func NewAnimationController(sheet *GridSpriteSheet) (*AnimationController, error) {
	if sheet == nil || len(sheet.Frames) == 0 {
		return nil, fmt.Errorf("sprite-animation: cannot initialize AnimationController with nil or empty GridSpriteSheet")
	}
	return &AnimationController{
		SpriteSheet: sheet,
		Tags:        make(map[string]AnimationTag, 8),
		IsPlaying:   false,
	}, nil
}

// AddTag validates and registers a named animation sequence tag.
func (ac *AnimationController) AddTag(tag AnimationTag) error {
	if tag.Name == "" {
		return fmt.Errorf("sprite-animation: animation tag name must not be empty")
	}
	if tag.FrameDuration <= 0 {
		return fmt.Errorf("sprite-animation: tag %q has non-positive FrameDuration (%v)", tag.Name, tag.FrameDuration)
	}
	if tag.StartFrame < 0 || tag.EndFrame < tag.StartFrame || tag.EndFrame >= ac.SpriteSheet.TotalFrames {
		return fmt.Errorf(
			"sprite-animation: tag %q frame range [%d, %d] out of bounds [0, %d)",
			tag.Name, tag.StartFrame, tag.EndFrame, ac.SpriteSheet.TotalFrames,
		)
	}
	ac.Tags[tag.Name] = tag
	return nil
}

// Play switches animation state to the given tag name, failing fast if the tag is unknown.
func (ac *AnimationController) Play(tagName string) error {
	tag, exists := ac.Tags[tagName]
	if !exists {
		return fmt.Errorf("sprite-animation: unknown animation tag %q", tagName)
	}
	if ac.CurrentTag == tagName && ac.IsPlaying {
		return nil
	}

	ac.CurrentTag = tagName
	ac.CurrentFrame = tag.StartFrame
	if tag.Loop == LoopReverse {
		ac.CurrentFrame = tag.EndFrame
	}
	ac.FrameTimer = 0
	ac.IsPlaying = true
	ac.PingPongRev = false
	return nil
}

// Update advances the animation timer by delta time dt. Call inside Ebiten Update().
func (ac *AnimationController) Update(dt time.Duration) error {
	if !ac.IsPlaying || ac.CurrentTag == "" {
		return nil
	}

	tag, exists := ac.Tags[ac.CurrentTag]
	if !exists {
		return fmt.Errorf("sprite-animation: active tag %q no longer registered", ac.CurrentTag)
	}

	ac.FrameTimer += dt
	for ac.FrameTimer >= tag.FrameDuration && ac.IsPlaying {
		ac.FrameTimer -= tag.FrameDuration
		ac.stepFrame(tag)
	}
	return nil
}

func (ac *AnimationController) stepFrame(tag AnimationTag) {
	if tag.StartFrame == tag.EndFrame {
		if tag.Loop == LoopOnce {
			ac.IsPlaying = false
			if ac.OnComplete != nil {
				ac.OnComplete(ac.CurrentTag)
			}
		}
		return
	}

	switch tag.Loop {
	case LoopPingPong:
		if ac.PingPongRev {
			ac.CurrentFrame--
			if ac.CurrentFrame < tag.StartFrame {
				ac.CurrentFrame = tag.StartFrame + 1
				ac.PingPongRev = false
			}
		} else {
			ac.CurrentFrame++
			if ac.CurrentFrame > tag.EndFrame {
				ac.CurrentFrame = tag.EndFrame - 1
				ac.PingPongRev = true
			}
		}

	case LoopReverse:
		ac.CurrentFrame--
		if ac.CurrentFrame < tag.StartFrame {
			ac.CurrentFrame = tag.EndFrame
		}

	case LoopOnce:
		ac.CurrentFrame++
		if ac.CurrentFrame > tag.EndFrame {
			ac.CurrentFrame = tag.EndFrame
			ac.IsPlaying = false
			if ac.OnComplete != nil {
				ac.OnComplete(ac.CurrentTag)
			}
		}

	default: // LoopForward
		ac.CurrentFrame++
		if ac.CurrentFrame > tag.EndFrame {
			ac.CurrentFrame = tag.StartFrame
		}
	}
}

// Draw renders the current pre-sliced animation frame reusing ac.drawOp (zero heap allocations).
func (ac *AnimationController) Draw(screen *ebiten.Image, x, y float64, flipX bool) error {
	subImg, err := ac.SpriteSheet.GetFrame(ac.CurrentFrame)
	if err != nil {
		return err
	}

	ac.drawOp.GeoM.Reset()
	if flipX {
		ac.drawOp.GeoM.Scale(-1, 1)
		ac.drawOp.GeoM.Translate(float64(ac.SpriteSheet.FrameWidth), 0)
	}
	ac.drawOp.GeoM.Translate(x, y)

	screen.DrawImage(subImg, &ac.drawOp)
	return nil
}
