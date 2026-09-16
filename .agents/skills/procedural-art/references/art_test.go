package main

import (
	"fmt"
	"math"
	"testing"
)

// ExampleTransform2D_orderOfOperations demonstrates that Scale -> Translate produces
// a fundamentally different matrix than Translate -> Scale.
func ExampleTransform2D_orderOfOperations() {
	// Object at (100, 200) scaled by 2x
	t := Transform2D{
		X:        100,
		Y:        200,
		ScaleX:   2.0,
		ScaleY:   2.0,
		Rotation: 0,
		OriginX:  16,
		OriginY:  16,
	}

	// Correct matrix: Pivot -> Scale -> Rotate -> World Translation
	mCorrect := t.GetGeoM()

	// Incorrect matrix: World Translation -> Scale
	var mWrong MatrixGeoM
	mWrong.Translate(t.X, t.Y)
	mWrong.Scale(t.ScaleX, t.ScaleY)

	// Apply to origin point (0,0)
	x1, y1 := mCorrect.Apply(0, 0)
	x2, y2 := mWrong.Apply(0, 0)

	fmt.Printf("Correct (Scale -> Translate) (0,0) -> (%.0f, %.0f)\n", x1, y1)
	fmt.Printf("Wrong   (Translate -> Scale) (0,0) -> (%.0f, %.0f)\n", x2, y2)

	// Output:
	// Correct (Scale -> Translate) (0,0) -> (84, 184)
	// Wrong   (Translate -> Scale) (0,0) -> (200, 400)
}

// MatrixGeoM helper for test demonstration
type MatrixGeoM struct {
	tx, ty float64
	sx, sy float64
}

func (m *MatrixGeoM) Translate(x, y float64) { m.tx += x; m.ty += y }
func (m *MatrixGeoM) Scale(x, y float64)     { m.sx = x; m.sy = y; m.tx *= x; m.ty *= y }
func (m MatrixGeoM) Apply(x, y float64) (float64, float64) {
	return x*m.sx + m.tx, y*m.sy + m.ty
}

// TestEasingMathematics verifies easing functions.
func TestEasingMathematics(t *testing.T) {
	if math.Abs(EaseInOutCubic(0.5)-0.5) > 0.001 {
		t.Fatalf("EaseInOutCubic at midpoint failed")
	}
	if math.Abs(EaseInQuad(0.5)-0.25) > 0.001 {
		t.Fatalf("EaseInQuad at midpoint failed")
	}
}

// TestParticleSystemPool verifies particle pool pre-allocation and emission.
func TestParticleSystemPool(t *testing.T) {
	ps := NewParticleSystem(100)
	ps.EmitExplosion(50, 50, 20)

	activeCount := 0
	for i := range ps.pool {
		if ps.pool[i].Active {
			activeCount++
		}
	}

	if activeCount != 20 {
		t.Fatalf("expected 20 active particles, got %d", activeCount)
	}

	// Advance time beyond particle life
	ps.Update(1.0)

	activeCount = 0
	for i := range ps.pool {
		if ps.pool[i].Active {
			activeCount++
		}
	}

	if activeCount != 0 {
		t.Fatalf("expected 0 active particles after expiration, got %d", activeCount)
	}
}
