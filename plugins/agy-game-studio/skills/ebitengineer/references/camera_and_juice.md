# 2D Camera Systems, Viewport Transforms & Game Feel ("Juice") Reference

This module covers genre-agnostic 2D camera math using `ebiten.GeoM`, frame-rate independent exponential damping (lerp), Squirrel Eiserloh's trauma-based screen shake, hitstop (freeze frames), and spring-driven squash-and-stretch deformation.

---

## 1. 2D Camera Architecture with `ebiten.GeoM`

A 2D camera decouples **World Space** (where entities live across top-down maps, tactics grids, shmup stages, isometric boards, or platformer levels) from **Virtual Screen Space** (e.g. `640x360` or `320x180`).

### 1.1 Exact Transformation Order
To render world entities through a camera with position $(X, Y)$, zoom $Z$, rotation $\theta$, and viewport dimensions $(W, H)$:
1. **Translate world to camera focus**: `Translate(-cam.X, -cam.Y)`
2. **Scale for zoom**: `Scale(cam.Zoom, cam.Zoom)`
3. **Rotate for camera roll/tilt**: `Rotate(cam.Rotation)`
4. **Translate to screen center + shake offset**: `Translate(W/2 + shakeX, H/2 + shakeY)`

```go
package camera

import (
	"fmt"
	"math"

	"github.com/hajimehoshi/ebiten/v2"
)

type Camera struct {
	X, Y               float64 // Current world center position
	TargetX, TargetY   float64 // Desired world target position
	ViewportW          float64 // Virtual screen width
	ViewportH          float64 // Virtual screen height
	Zoom               float64 // 1.0 = 100%
	Rotation           float64 // Radians
	FollowSharpness    float64 // Exponential damping rate (e.g., 10.0)
	ShakeOffsetX       float64
	ShakeOffsetY       float64
	ShakeAngle         float64

	// Optional world boundary clamping
	HasBounds                  bool
	MinX, MinY, MaxX, MaxY     float64
}

func NewCamera(viewportW, viewportH float64) (*Camera, error) {
	if viewportW <= 0 || viewportH <= 0 {
		return nil, fmt.Errorf("camera: invalid viewport dimensions (%.1f x %.1f): must be > 0", viewportW, viewportH)
	}
	return &Camera{
		ViewportW:       viewportW,
		ViewportH:       viewportH,
		Zoom:            1.0,
		FollowSharpness: 12.0,
	}, nil
}

// ViewMatrix returns the World -> Screen transformation matrix.
func (c *Camera) ViewMatrix() ebiten.GeoM {
	var m ebiten.GeoM
	m.Translate(-c.X, -c.Y)
	m.Scale(c.Zoom, c.Zoom)
	m.Rotate(c.Rotation + c.ShakeAngle)
	m.Translate(c.ViewportW*0.5+c.ShakeOffsetX, c.ViewportH*0.5+c.ShakeOffsetY)
	return m
}

// ScreenToWorld converts virtual screen coordinates (e.g., mouse/touch) into world coordinates.
func (c *Camera) ScreenToWorld(screenX, screenY float64) (float64, float64, error) {
	view := c.ViewMatrix()
	if !view.IsInvertible() {
		return 0, 0, fmt.Errorf("camera: view matrix is non-invertible (zoom=%.4f)", c.Zoom)
	}
	view.Invert()
	wx, wy := view.Apply(screenX, screenY)
	return wx, wy, nil
}
```

---

## 2. Frame-Rate Independent Exponential Lerp

Never use `c.X += (c.TargetX - c.X) * 0.1` directly without delta time $dt$, as camera speed will change between 60Hz, 120Hz, and variable WASM frame timings. Use continuous exponential decay:

$$
x(t + \Delta t) = \text{target} + (x(t) - \text{target}) \cdot e^{-\lambda \Delta t}
$$

```go
// ExpDecay performs frame-rate independent exponential interpolation.
// sharpness typically ranges from 4.0 (cinematic float) to 25.0 (snappy lock).
func ExpDecay(current, target, sharpness, dt float64) float64 {
	return target + (current-target)*math.Exp(-sharpness*dt)
}

func (c *Camera) UpdateFollow(dt float64) {
	c.X = ExpDecay(c.X, c.TargetX, c.FollowSharpness, dt)
	c.Y = ExpDecay(c.Y, c.TargetY, c.FollowSharpness, dt)

	if c.HasBounds && c.Zoom > 0 {
		halfW := (c.ViewportW * 0.5) / c.Zoom
		halfH := (c.ViewportH * 0.5) / c.Zoom
		c.X = math.Max(c.MinX+halfW, math.Min(c.MaxX-halfW, c.X))
		c.Y = math.Max(c.MinY+halfH, math.Min(c.MaxY-halfH, c.Y))
	}
}
```

---

## 3. Trauma-Based Screen Shake

Instead of adding raw random pixel offsets, accumulate normalized **Trauma** $\in [0, 1]$ and compute **Shake** $= \text{Trauma}^2$ (or $\text{Trauma}^3$). Quadratic/cubic scaling makes small hits feel subtle while heavy explosions feel dramatic, with smooth decay back to rest:

```go
type TraumaShaker struct {
	Trauma       float64 // Normalized [0.0, 1.0]
	DecayRate    float64 // Trauma lost per second (e.g., 1.5)
	MaxOffsetPx  float64 // Maximum translational offset in virtual pixels (e.g., 12.0)
	MaxAngleRad  float64 // Maximum rotational roll in radians (e.g., 0.05)
	Time         float64 // Elapsed time for deterministic wave sampling
}

func NewTraumaShaker(decayRate, maxOffsetPx, maxAngleRad float64) (*TraumaShaker, error) {
	if decayRate <= 0 {
		return nil, fmt.Errorf("camera: trauma decayRate must be > 0, got %f", decayRate)
	}
	return &TraumaShaker{
		DecayRate:   decayRate,
		MaxOffsetPx: maxOffsetPx,
		MaxAngleRad: maxAngleRad,
	}, nil
}

// AddTrauma injects impact energy (e.g., 0.2 for light hit, 0.6 for explosion).
func (ts *TraumaShaker) AddTrauma(amount float64) {
	if amount <= 0 {
		return
	}
	ts.Trauma = math.Min(1.0, ts.Trauma+amount)
}

// Update decays trauma and applies non-linear shake offsets to the camera.
func (ts *TraumaShaker) Update(dt float64, cam *Camera) {
	if ts.Trauma <= 0 {
		cam.ShakeOffsetX = 0
		cam.ShakeOffsetY = 0
		cam.ShakeAngle = 0
		return
	}

	ts.Time += dt
	shake := ts.Trauma * ts.Trauma // Quadratic intensity curve

	// Pseudo-perlin multi-frequency trigonometric noise (zero allocations)
	nx := math.Sin(ts.Time*37.0)*0.6 + math.Cos(ts.Time*73.0)*0.4
	ny := math.Cos(ts.Time*41.0)*0.6 + math.Sin(ts.Time*89.0)*0.4
	nr := math.Sin(ts.Time*53.0)*0.7 + math.Cos(ts.Time*97.0)*0.3

	cam.ShakeOffsetX = ts.MaxOffsetPx * shake * nx
	cam.ShakeOffsetY = ts.MaxOffsetPx * shake * ny
	cam.ShakeAngle = ts.MaxAngleRad * shake * nr

	ts.Trauma = math.Max(0.0, ts.Trauma-ts.DecayRate*dt)
}
```

---

## 4. Hitstop (Freeze Frames) & Time Dilation

Hitstop briefly pauses gameplay simulation (e.g., `30ms–90ms`) on critical impacts, parries, puzzle line clears, or boss kills while keeping camera shake and HUD effects active:

```go
type TimeController struct {
	HitstopRemaining float64 // Seconds remaining in freeze-frame
	TimeScale        float64 // 1.0 = normal speed, 0.25 = slow-mo
}

func NewTimeController() *TimeController {
	return &TimeController{TimeScale: 1.0}
}

// TriggerHitstop freezes world simulation for durationSeconds.
func (tc *TimeController) TriggerHitstop(durationSeconds float64) {
	if durationSeconds > tc.HitstopRemaining {
		tc.HitstopRemaining = durationSeconds
	}
}

// Step computes the effective world delta time.
// Camera shake and UI animations should still receive rawDt.
func (tc *TimeController) Step(rawDt float64) (worldDt float64, frozen bool) {
	if tc.HitstopRemaining > 0 {
		tc.HitstopRemaining -= rawDt
		if tc.HitstopRemaining < 0 {
			tc.HitstopRemaining = 0
		}
		return 0, true
	}
	return rawDt * tc.TimeScale, false
}
```

---

## 5. Spring-Driven Squash & Stretch

Apply damped harmonic oscillator springs to sprite scale $(S_x, S_y)$ while conserving 2D area ($S_x \cdot S_y \approx 1$) so entities deform organically when firing, landing, selecting tiles, or taking hits:

```go
type ScaleSpring struct {
	ScaleX, ScaleY float64
	VelX, VelY     float64
	Stiffness      float64 // e.g., 320.0
	Damping        float64 // e.g., 18.0
}

func NewScaleSpring(stiffness, damping float64) (*ScaleSpring, error) {
	if stiffness <= 0 || damping <= 0 {
		return nil, fmt.Errorf("camera: spring stiffness (%f) and damping (%f) must be > 0", stiffness, damping)
	}
	return &ScaleSpring{
		ScaleX:    1.0,
		ScaleY:    1.0,
		Stiffness: stiffness,
		Damping:   damping,
	}, nil
}

// Impulse deforms the sprite while preserving volume (e.g., sx=1.35, sy=1/1.35).
func (s *ScaleSpring) Impulse(scaleX float64) {
	if scaleX <= 0.1 {
		scaleX = 0.1
	}
	s.ScaleX = scaleX
	s.ScaleY = 1.0 / scaleX
}

func (s *ScaleSpring) Update(dt float64) {
	// Hooke's Law + velocity damping toward rest scale (1.0, 1.0)
	forceX := (1.0 - s.ScaleX) * s.Stiffness
	forceY := (1.0 - s.ScaleY) * s.Stiffness

	s.VelX = (s.VelX + forceX*dt) * math.Exp(-s.Damping*dt)
	s.VelY = (s.VelY + forceY*dt) * math.Exp(-s.Damping*dt)

	s.ScaleX += s.VelX * dt
	s.ScaleY += s.VelY * dt
}
```
