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

package main

import (
	"fmt"
	"image/color"
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

// TestPremultiplyRGBA verifies the premultiplied alpha invariant R, G, B <= A.
func TestPremultiplyRGBA(t *testing.T) {
	c := PremultiplyRGBA(255, 128, 0, 100)
	if err := ValidatePremultipliedRGBA(c); err != nil {
		t.Fatalf("expected valid premultiplied color, got error: %v", err)
	}
	if c.R != 100 || c.A != 100 {
		t.Fatalf("expected R=100, A=100, got R=%d, A=%d", c.R, c.A)
	}

	invalid := color.RGBA{R: 255, G: 0, B: 0, A: 100}
	if err := ValidatePremultipliedRGBA(invalid); err == nil {
		t.Fatalf("expected error for non-premultiplied color.RGBA{255, 0, 0, 100}")
	}
}

// TestSDFPrimitives verifies SDFCircle, SDFBox, SDFCapsule, and SDFSmoothMin.
func TestSDFPrimitives(t *testing.T) {
	if d := SDFCircle(10, 10, 10, 10, 5); d != -5.0 {
		t.Fatalf("expected SDFCircle center distance -5.0, got %f", d)
	}
	if d := SDFBox(10, 10, 10, 10, 4, 4, 1); d >= 0 {
		t.Fatalf("expected interior point of SDFBox to be negative, got %f", d)
	}
	if d := SDFCapsule(5, 0, 0, 0, 10, 0, 2); math.Abs(d+2.0) > 1e-6 {
		t.Fatalf("expected midpoint of SDFCapsule to have distance -2.0, got %f", d)
	}
	smin := SDFSmoothMin(0.2, 0.2, 1.0)
	if smin >= 0.2 {
		t.Fatalf("expected SDFSmoothMin to blend below 0.2, got %f", smin)
	}
}

// TestMaterialRampShading verifies 4-step material ramp sampling.
func TestMaterialRampShading(t *testing.T) {
	pal := NewGenesisPalette()
	ramp := pal.Ramps["steel"]
	if SampleMaterialRamp(ramp, 0.1) != ramp[0] {
		t.Fatalf("expected step 0 (Deep Shadow)")
	}
	if SampleMaterialRamp(ramp, 0.4) != ramp[1] {
		t.Fatalf("expected step 1 (Base Tone)")
	}
	if SampleMaterialRamp(ramp, 0.8) != ramp[2] {
		t.Fatalf("expected step 2 (Light Highlight)")
	}
	if SampleMaterialRamp(ramp, 0.95) != ramp[3] {
		t.Fatalf("expected step 3 (High Specular)")
	}
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
			if err := ValidatePremultipliedRGBA(ps.pool[i].StartColor); err != nil {
				t.Fatalf("StartColor invalid: %v", err)
			}
			if err := ValidatePremultipliedRGBA(ps.pool[i].EndColor); err != nil {
				t.Fatalf("EndColor invalid: %v", err)
			}
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
