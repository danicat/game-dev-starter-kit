# Unified Input Action Mapping & Rebinding Reference

This module covers input device abstraction, action rebind mapping, analog stick deadzone filtering, and multi-input state handling for Ebitengine.

---

## 1. Action Mapping Abstraction Layer

Decouple raw physical keys/gamepad buttons from logical game actions (`ActionJump`, `ActionAttack`, `ActionPause`):

```go
type Action int

const (
	ActionMoveLeft Action = iota
	ActionMoveRight
	ActionJump
	ActionAttack
	ActionPause
)

type Binding struct {
	Keys     []ebiten.Key
	Buttons  []ebiten.StandardGamepadButton
	Mouses   []ebiten.MouseButton
}

type InputManager struct {
	Bindings map[Action]Binding
}

func NewInputManager() *InputManager {
	im := &InputManager{
		Bindings: make(map[Action]Binding),
	}
	// Default Bindings
	im.Bindings[ActionMoveLeft] = Binding{Keys: []ebiten.Key{ebiten.KeyA, ebiten.KeyLeft}}
	im.Bindings[ActionMoveRight] = Binding{Keys: []ebiten.Key{ebiten.KeyD, ebiten.KeyRight}}
	im.Bindings[ActionJump] = Binding{
		Keys: []ebiten.Key{ebiten.KeySpace, ebiten.KeyW, ebiten.KeyUp},
		Buttons: []ebiten.StandardGamepadButton{ebiten.StandardGamepadButtonSouth},
	}
	im.Bindings[ActionAttack] = Binding{
		Keys: []ebiten.Key{ebiten.KeyJ, ebiten.KeyZ},
		Mouses: []ebiten.MouseButton{ebiten.MouseButtonLeft},
		Buttons: []ebiten.StandardGamepadButton{ebiten.StandardGamepadButtonWest},
	}
	return im
}
```

---

## 2. Action State Evaluation

Query whether an action is currently held, just pressed, or just released across all assigned physical inputs:

```go
func (im *InputManager) IsActionPressed(action Action) bool {
	binding, ok := im.Bindings[action]
	if !ok { return false }

	for _, k := range binding.Keys {
		if ebiten.IsKeyPressed(k) { return true }
	}
	for _, m := range binding.Mouses {
		if ebiten.IsMouseButtonPressed(m) { return true }
	}
	
	// Gamepad support
	gamepads := ebiten.AppendGamepadIDs(nil)
	for _, id := range gamepads {
		for _, b := range binding.Buttons {
			if ebiten.IsStandardGamepadButtonPressed(id, b) { return true }
		}
	}
	return false
}

func (im *InputManager) IsActionJustPressed(action Action) bool {
	binding, ok := im.Bindings[action]
	if !ok { return false }

	for _, k := range binding.Keys {
		if inpututil.IsKeyJustPressed(k) { return true }
	}
	for _, m := range binding.Mouses {
		if inpututil.IsMouseButtonJustPressed(m) { return true }
	}

	gamepads := ebiten.AppendGamepadIDs(nil)
	for _, id := range gamepads {
		for _, b := range binding.Buttons {
			if inpututil.IsStandardGamepadButtonJustPressed(id, b) { return true }
		}
	}
	return false
}
```

---

## 3. Gamepad Analog Stick Radial Deadzone Filtering

Analog thumbsticks on gamepads exhibit hardware drift near center. Apply radial deadzone filtering:

```go
func ApplyRadialDeadzone(axisX, axisY, deadzone float64) (float64, float64) {
	magnitude := math.Sqrt(axisX*axisX + axisY*axisY)
	if magnitude < deadzone {
		return 0, 0
	}
	// Rescale remaining range [deadzone..1.0] to [0.0..1.0]
	normalizedMag := (magnitude - deadzone) / (1.0 - deadzone)
	if normalizedMag > 1.0 { normalizedMag = 1.0 }

	nx := (axisX / magnitude) * normalizedMag
	ny := (axisY / magnitude) * normalizedMag
	return nx, ny
}
```

---

## 4. Input Rebinding & Persistence

Serialize custom keybindings to disk as JSON:

```go
type SerializableBindings map[string][]string

func (im *InputManager) SaveBindings(filepath string) error {
	data, err := json.MarshalIndent(im.Bindings, "", "  ")
	if err != nil { return err }
	return os.WriteFile(filepath, data, 0644)
}
```
