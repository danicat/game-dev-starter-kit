# Unified Input Action Mapping & Rebinding Reference

This module covers input device abstraction, action rebind mapping, analog stick radial deadzone filtering, and zero-allocation multi-input state handling across keyboard, mouse, gamepad, and touch for Ebitengine.

---

## 1. Action Mapping Abstraction Layer

Decouple raw physical keys/gamepad buttons from logical game actions (`ActionMoveUp`, `ActionMoveDown`, `ActionMoveLeft`, `ActionMoveRight`, `ActionPrimary`, `ActionSecondary`, `ActionPause`) with a pre-allocated gamepad ID buffer to avoid per-frame allocations:

```go
package input

import (
	"encoding/json"
	"fmt"
	"math"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
)

type Action int

const (
	ActionMoveUp Action = iota
	ActionMoveDown
	ActionMoveLeft
	ActionMoveRight
	ActionPrimary
	ActionSecondary
	ActionPause
)

type Binding struct {
	Keys    []ebiten.Key                   `json:"keys"`
	Buttons []ebiten.StandardGamepadButton `json:"buttons"`
	Mouses  []ebiten.MouseButton           `json:"mouses"`
}

type InputManager struct {
	Bindings   map[Action]Binding
	gamepadIDs []ebiten.GamepadID
}

func NewInputManager() *InputManager {
	im := &InputManager{
		Bindings:   make(map[Action]Binding, 8),
		gamepadIDs: make([]ebiten.GamepadID, 0, 4),
	}
	im.Bindings[ActionMoveUp] = Binding{Keys: []ebiten.Key{ebiten.KeyW, ebiten.KeyUp}}
	im.Bindings[ActionMoveDown] = Binding{Keys: []ebiten.Key{ebiten.KeyS, ebiten.KeyDown}}
	im.Bindings[ActionMoveLeft] = Binding{Keys: []ebiten.Key{ebiten.KeyA, ebiten.KeyLeft}}
	im.Bindings[ActionMoveRight] = Binding{Keys: []ebiten.Key{ebiten.KeyD, ebiten.KeyRight}}
	im.Bindings[ActionPrimary] = Binding{
		Keys:    []ebiten.Key{ebiten.KeySpace, ebiten.KeyZ, ebiten.KeyJ},
		Mouses:  []ebiten.MouseButton{ebiten.MouseButtonLeft},
		Buttons: []ebiten.StandardGamepadButton{ebiten.StandardGamepadButtonRightBottom},
	}
	im.Bindings[ActionSecondary] = Binding{
		Keys:    []ebiten.Key{ebiten.KeyX, ebiten.KeyK},
		Mouses:  []ebiten.MouseButton{ebiten.MouseButtonRight},
		Buttons: []ebiten.StandardGamepadButton{ebiten.StandardGamepadButtonRightLeft},
	}
	im.Bindings[ActionPause] = Binding{
		Keys:    []ebiten.Key{ebiten.KeyEscape, ebiten.KeyP},
		Buttons: []ebiten.StandardGamepadButton{ebiten.StandardGamepadButtonCenterRight},
	}
	return im
}
```

---

## 2. Zero-Allocation Action State Evaluation

Query whether an action is currently held or just pressed across all assigned physical inputs while reusing `im.gamepadIDs[:0]`:

```go
func (im *InputManager) IsActionPressed(action Action) (bool, error) {
	binding, ok := im.Bindings[action]
	if !ok {
		return false, fmt.Errorf("input: unmapped action ID %d", action)
	}

	for _, k := range binding.Keys {
		if ebiten.IsKeyPressed(k) {
			return true, nil
		}
	}
	for _, m := range binding.Mouses {
		if ebiten.IsMouseButtonPressed(m) {
			return true, nil
		}
	}

	im.gamepadIDs = ebiten.AppendGamepadIDs(im.gamepadIDs[:0])
	for _, id := range im.gamepadIDs {
		for _, b := range binding.Buttons {
			if ebiten.IsStandardGamepadButtonPressed(id, b) {
				return true, nil
			}
		}
	}
	return false, nil
}

func (im *InputManager) IsActionJustPressed(action Action) (bool, error) {
	binding, ok := im.Bindings[action]
	if !ok {
		return false, fmt.Errorf("input: unmapped action ID %d", action)
	}

	for _, k := range binding.Keys {
		if inpututil.IsKeyJustPressed(k) {
			return true, nil
		}
	}
	for _, m := range binding.Mouses {
		if inpututil.IsMouseButtonJustPressed(m) {
			return true, nil
		}
	}

	im.gamepadIDs = ebiten.AppendGamepadIDs(im.gamepadIDs[:0])
	for _, id := range im.gamepadIDs {
		for _, b := range binding.Buttons {
			if inpututil.IsStandardGamepadButtonJustPressed(id, b) {
				return true, nil
			}
		}
	}
	return false, nil
}
```

---

## 3. Gamepad Analog Stick Radial Deadzone Filtering

Analog thumbsticks exhibit hardware drift near center. Apply radial deadzone filtering and rescale the active range `[deadzone, 1.0]` smoothly onto `[0.0, 1.0]`:

```go
func ApplyRadialDeadzone(axisX, axisY, deadzone float64) (float64, float64, error) {
	if deadzone < 0.0 || deadzone >= 1.0 {
		return 0, 0, fmt.Errorf("input: deadzone must be in [0.0, 1.0), got %f", deadzone)
	}
	magnitude := math.Hypot(axisX, axisY)
	if magnitude < deadzone || magnitude == 0 {
		return 0, 0, nil
	}
	normalizedMag := math.Min(1.0, (magnitude-deadzone)/(1.0-deadzone))
	nx := (axisX / magnitude) * normalizedMag
	ny := (axisY / magnitude) * normalizedMag
	return nx, ny, nil
}
```

---

## 4. Input Rebinding & Fail-Fast Persistence

Serialize and deserialize custom keybindings with explicit error wrapping:

```go
func (im *InputManager) SaveBindings(filepath string) error {
	if filepath == "" {
		return fmt.Errorf("input: bindings filepath must not be empty")
	}
	data, err := json.MarshalIndent(im.Bindings, "", "  ")
	if err != nil {
		return fmt.Errorf("input: marshal bindings: %w", err)
	}
	if err := os.WriteFile(filepath, data, 0o600); err != nil {
		return fmt.Errorf("input: write bindings to %q: %w", filepath, err)
	}
	return nil
}

func (im *InputManager) LoadBindings(filepath string) error {
	if filepath == "" {
		return fmt.Errorf("input: bindings filepath must not be empty")
	}
	data, err := os.ReadFile(filepath)
	if err != nil {
		return fmt.Errorf("input: read bindings from %q: %w", filepath, err)
	}
	var loaded map[Action]Binding
	if err := json.Unmarshal(data, &loaded); err != nil {
		return fmt.Errorf("input: unmarshal bindings from %q: %w", filepath, err)
	}
	if len(loaded) == 0 {
		return fmt.Errorf("input: loaded bindings map from %q is empty", filepath)
	}
	im.Bindings = loaded
	return nil
}
```
