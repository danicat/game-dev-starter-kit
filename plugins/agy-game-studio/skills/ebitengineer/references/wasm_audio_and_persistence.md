# WebAssembly Audio Late-Sync & Fail-Fast Save Persistence Reference

This module covers 4-byte aligned PCM stream seeking for WebAssembly browser autoplay unlock synchronization and build-tagged fail-fast save storage across Desktop (`!js`) and WebAssembly (`js && wasm`).

---

## 1. WebAssembly Audio Autoplay Unlock & 4-Byte Aligned PCM `Seek()`

Modern browsers block WebAudio playback until the user performs an explicit interaction gesture (key press, mouse click, or touch). Meanwhile, the game's `Update()` loop and visual clocks continue running from `0:00`.

When the user finally interacts at elapsed time $T_{\text{elapsed}}$, starting BGM at `0:00` desynchronizes music from intro choreography or beat-synced visuals. Instead, compute the exact byte offset in Ebitengine's **16-bit stereo PCM format (4 bytes per sample frame: 2 channels × 2 bytes)** and `Seek()` into the loop:

$$
\text{ByteOffset} = \left\lfloor T_{\text{elapsed}} \times \text{SampleRate} \right\rfloor \times 4
$$

> **CRITICAL INVARIANT**: Ebitengine audio streams require byte offsets to be an exact multiple of `4` (4-byte frame alignment: 16-bit Left + 16-bit Right). Seeking to an unaligned byte offset corrupts stereo channels or returns an error.

```go
package audio

import (
	"fmt"
	"io"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
	ebitaudio "github.com/hajimehoshi/ebiten/v2/audio"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
)

const (
	SampleRate     = 44100
	BytesPerSample = 4 // 16-bit stereo: 2 bytes * 2 channels
)

type SyncedBGMPlayer struct {
	ctx           *ebitaudio.Context
	loopStream    *ebitaudio.InfiniteLoop
	player        *ebitaudio.Player
	loopLengthBytes int64
	elapsed       time.Duration
	unlocked      bool
}

func NewSyncedBGMPlayer(ctx *ebitaudio.Context, pcmStream io.ReadSeeker, loopLengthBytes int64) (*SyncedBGMPlayer, error) {
	if ctx == nil {
		return nil, fmt.Errorf("audio: nil audio.Context")
	}
	if loopLengthBytes <= 0 || loopLengthBytes%BytesPerSample != 0 {
		return nil, fmt.Errorf("audio: loopLengthBytes (%d) must be positive and 4-byte aligned", loopLengthBytes)
	}

	loop := ebitaudio.NewInfiniteLoop(pcmStream, loopLengthBytes)
	p, err := ctx.NewPlayer(loop)
	if err != nil {
		return nil, fmt.Errorf("audio: create BGM player: %w", err)
	}

	return &SyncedBGMPlayer{
		ctx:             ctx,
		loopStream:      loop,
		player:          p,
		loopLengthBytes: loopLengthBytes,
	}, nil
}

// AlignPCMByteOffset converts a duration into a 4-byte aligned stereo PCM byte offset
// wrapped cleanly within loopLengthBytes.
func AlignPCMByteOffset(elapsed time.Duration, sampleRate int, loopLengthBytes int64) (int64, error) {
	if sampleRate <= 0 {
		return 0, fmt.Errorf("audio: invalid sampleRate %d", sampleRate)
	}
	if loopLengthBytes <= 0 || loopLengthBytes%BytesPerSample != 0 {
		return 0, fmt.Errorf("audio: invalid loopLengthBytes %d (must be multiple of 4)", loopLengthBytes)
	}

	totalSamples := int64(elapsed.Seconds() * float64(sampleRate))
	rawByteOffset := totalSamples * BytesPerSample
	wrappedOffset := rawByteOffset % loopLengthBytes
	if wrappedOffset < 0 {
		wrappedOffset = 0
	}
	// Enforce strict 4-byte frame boundary alignment
	alignedOffset := (wrappedOffset / BytesPerSample) * BytesPerSample
	return alignedOffset, nil
}

// Update advances the internal clock and unlocks/seeks audio on first user gesture.
func (bgm *SyncedBGMPlayer) Update(dt time.Duration) error {
	bgm.elapsed += dt

	if bgm.unlocked {
		return nil
	}

	if hasUserGesture() {
		offsetBytes, err := AlignPCMByteOffset(bgm.elapsed, bgm.ctx.SampleRate(), bgm.loopLengthBytes)
		if err != nil {
			return fmt.Errorf("audio: compute late-sync offset: %w", err)
		}
		if _, err := bgm.loopStream.Seek(offsetBytes, io.SeekStart); err != nil {
			return fmt.Errorf("audio: seek BGM stream to %d bytes: %w", offsetBytes, err)
		}
		bgm.player.Play()
		bgm.unlocked = true
	}
	return nil
}

func hasUserGesture() bool {
	if len(inpututil.AppendJustPressedKeys(nil)) > 0 {
		return true
	}
	if inpututil.IsMouseButtonJustPressed(ebiten.MouseButtonLeft) ||
		inpututil.IsMouseButtonJustPressed(ebiten.MouseButtonRight) {
		return true
	}
	if len(inpututil.AppendJustPressedTouchIDs(nil)) > 0 {
		return true
	}
	return false
}
```

---

## 2. Build-Tagged Fail-Fast Save Storage (Desktop vs. WASM)

Use Go build tags (`//go:build !js` and `//go:build js && wasm`) to provide a unified, fail-fast `SaveStorage` interface without silent fallbacks or ignored errors.

### 2.1 Shared Save Contract (`internal/save/storage.go`)

```go
package save

import (
	"encoding/json"
	"fmt"
)

type GameSaveData struct {
	Version   int    `json:"version"`
	HighScore int    `json:"high_score"`
	Unlocked  []int  `json:"unlocked"`
}

type Storage interface {
	Save(slot string, data GameSaveData) error
	Load(slot string) (GameSaveData, error)
}

func MarshalSave(data GameSaveData) ([]byte, error) {
	if data.Version <= 0 {
		return nil, fmt.Errorf("save: invalid schema version %d (must be >= 1)", data.Version)
	}
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("save: marshal GameSaveData: %w", err)
	}
	return raw, nil
}

func UnmarshalSave(raw []byte) (GameSaveData, error) {
	var data GameSaveData
	if err := json.Unmarshal(raw, &data); err != nil {
		return GameSaveData{}, fmt.Errorf("save: unmarshal GameSaveData: %w", err)
	}
	if data.Version <= 0 {
		return GameSaveData{}, fmt.Errorf("save: corrupt or missing schema version %d", data.Version)
	}
	return data, nil
}
```

### 2.2 Desktop Native Atomic File Persistence (`internal/save/storage_desktop.go`)

```go
//go:build !js

package save

import (
	"fmt"
	"os"
	"path/filepath"
)

type DesktopStorage struct {
	baseDir string
}

func NewStorage(appID string) (Storage, error) {
	if appID == "" {
		return nil, fmt.Errorf("save: appID must not be empty")
	}
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("save: resolve os.UserConfigDir: %w", err)
	}
	dir := filepath.Join(cfgDir, appID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("save: create save directory %q: %w", dir, err)
	}
	return &DesktopStorage{baseDir: dir}, nil
}

func (ds *DesktopStorage) Save(slot string, data GameSaveData) error {
	if slot == "" {
		return fmt.Errorf("save: slot name must not be empty")
	}
	raw, err := MarshalSave(data)
	if err != nil {
		return err
	}
	targetPath := filepath.Join(ds.baseDir, slot+".json")
	tmpPath := targetPath + ".tmp"
	if err := os.WriteFile(tmpPath, raw, 0o600); err != nil {
		return fmt.Errorf("save: write temp save file %q: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, targetPath); err != nil {
		return fmt.Errorf("save: atomic rename %q -> %q: %w", tmpPath, targetPath, err)
	}
	return nil
}

func (ds *DesktopStorage) Load(slot string) (GameSaveData, error) {
	if slot == "" {
		return GameSaveData{}, fmt.Errorf("save: slot name must not be empty")
	}
	targetPath := filepath.Join(ds.baseDir, slot+".json")
	raw, err := os.ReadFile(targetPath)
	if err != nil {
		return GameSaveData{}, fmt.Errorf("save: read save file %q: %w", targetPath, err)
	}
	return UnmarshalSave(raw)
}
```

### 2.3 WebAssembly `localStorage` Persistence (`internal/save/storage_wasm.go`)

```go
//go:build js && wasm

package save

import (
	"fmt"
	"syscall/js"
)

type WASMStorage struct {
	appID        string
	localStorage js.Value
}

func NewStorage(appID string) (Storage, error) {
	if appID == "" {
		return nil, fmt.Errorf("save: appID must not be empty")
	}
	win := js.Global().Get("window")
	if win.IsUndefined() || win.IsNull() {
		return nil, fmt.Errorf("save: browser window object is unavailable in WASM environment")
	}
	ls := win.Get("localStorage")
	if ls.IsUndefined() || ls.IsNull() {
		return nil, fmt.Errorf("save: window.localStorage is unavailable or disabled")
	}
	return &WASMStorage{appID: appID, localStorage: ls}, nil
}

func (ws *WASMStorage) key(slot string) string {
	return ws.appID + ":" + slot
}

func (ws *WASMStorage) Save(slot string, data GameSaveData) error {
	if slot == "" {
		return fmt.Errorf("save: slot name must not be empty")
	}
	raw, err := MarshalSave(data)
	if err != nil {
		return err
	}
	ws.localStorage.Call("setItem", ws.key(slot), string(raw))
	return nil
}

func (ws *WASMStorage) Load(slot string) (GameSaveData, error) {
	if slot == "" {
		return GameSaveData{}, fmt.Errorf("save: slot name must not be empty")
	}
	val := ws.localStorage.Call("getItem", ws.key(slot))
	if val.IsNull() || val.IsUndefined() {
		return GameSaveData{}, fmt.Errorf("save: slot %q not found in localStorage", ws.key(slot))
	}
	return UnmarshalSave([]byte(val.String()))
}
```
