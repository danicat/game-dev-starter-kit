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
	FrameDuration time.Duration // Duration per frame (e.g. 100ms)
	Loop          LoopMode
}

// GridSpriteSheet represents a uniform N x M sprite sheet grid.
type GridSpriteSheet struct {
	Image       *ebiten.Image
	FrameWidth  int
	FrameHeight int
	Columns     int
	TotalFrames int
}

// GetFrameSubImage returns the ebiten.Image slice for a specific 0-indexed frame.
func (ss *GridSpriteSheet) GetFrameSubImage(frameIndex int) (*ebiten.Image, error) {
	if frameIndex < 0 || frameIndex >= ss.TotalFrames {
		return nil, fmt.Errorf("frame index %d out of bounds (total %d)", frameIndex, ss.TotalFrames)
	}

	col := frameIndex % ss.Columns
	row := frameIndex / ss.Columns

	x := col * ss.FrameWidth
	y := row * ss.FrameHeight

	rect := image.Rect(x, y, x+ss.FrameWidth, y+ss.FrameHeight)
	subImg := ss.Image.SubImage(rect).(*ebiten.Image)
	return subImg, nil
}

// AnimationController manages state transitions, timers, and frame calculation for Ebiten entities.
type AnimationController struct {
	SpriteSheet   *GridSpriteSheet
	Tags          map[string]AnimationTag
	CurrentTag    string
	CurrentFrame  int
	FrameTimer    time.Duration
	IsPlaying     bool
	PingPongRev   bool
	OnComplete    func(tagName string)
}

// NewAnimationController initializes a new controller for a sprite sheet.
func NewAnimationController(sheet *GridSpriteSheet) *AnimationController {
	return &AnimationController{
		SpriteSheet: sheet,
		Tags:        make(map[string]AnimationTag),
		IsPlaying:   true,
	}
}

// AddTag registers a named animation sequence tag.
func (ac *AnimationController) AddTag(tag AnimationTag) {
	ac.Tags[tag.Name] = tag
}

// Play switches animation state to the given tag name.
func (ac *AnimationController) Play(tagName string) {
	if ac.CurrentTag == tagName && ac.IsPlaying {
		return
	}

	tag, exists := ac.Tags[tagName]
	if !exists {
		return
	}

	ac.CurrentTag = tagName
	ac.CurrentFrame = tag.StartFrame
	ac.FrameTimer = 0
	ac.IsPlaying = true
	ac.PingPongRev = false
}

// Update advances the animation timer by delta time dt. Call inside Ebiten Update(dt).
func (ac *AnimationController) Update(dt time.Duration) {
	if !ac.IsPlaying || ac.CurrentTag == "" {
		return
	}

	tag, exists := ac.Tags[ac.CurrentTag]
	if !exists {
		return
	}

	ac.FrameTimer += dt
	if ac.FrameTimer < tag.FrameDuration {
		return
	}

	// Advance frame
	ac.FrameTimer -= tag.FrameDuration

	if tag.Loop == LoopPingPong {
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
		return
	}

	if tag.Loop == LoopReverse {
		ac.CurrentFrame--
		if ac.CurrentFrame < tag.StartFrame {
			ac.CurrentFrame = tag.EndFrame
		}
		return
	}

	// Default: LoopForward or LoopOnce
	ac.CurrentFrame++
	if ac.CurrentFrame > tag.EndFrame {
		if tag.Loop == LoopOnce {
			ac.CurrentFrame = tag.EndFrame
			ac.IsPlaying = false
			if ac.OnComplete != nil {
				ac.OnComplete(ac.CurrentTag)
			}
		} else {
			ac.CurrentFrame = tag.StartFrame
		}
	}
}

// Draw renders the current animation frame to the screen. Call inside Ebiten Draw().
func (ac *AnimationController) Draw(screen *ebiten.Image, x, y float64, flipX bool) {
	subImg, err := ac.SpriteSheet.GetFrameSubImage(ac.CurrentFrame)
	if err != nil {
		return
	}

	op := &ebiten.DrawImageOptions{}

	if flipX {
		op.GeoM.Scale(-1, 1)
		op.GeoM.Translate(float64(ac.SpriteSheet.FrameWidth), 0)
	}

	op.GeoM.Translate(x, y)
	screen.DrawImage(subImg, op)
}
