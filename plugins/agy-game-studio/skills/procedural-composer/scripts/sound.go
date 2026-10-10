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
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"os"
	"time"

	"github.com/hajimehoshi/ebiten/v2/audio"
)

// ============================================================================
// 1. JSON SOUND & MUSIC FORMAT DEFINITIONS
// ============================================================================

// NoteJSON represents a single synthesized note/sample parameter in JSON.
type NoteJSON struct {
	WaveType     string  `json:"wave_type"`     // "sine", "square", "triangle", "sawtooth", "noise", "fm"
	Duration     float64 `json:"duration"`      // Duration in seconds
	StartFreq    float64 `json:"start_freq"`    // Starting frequency in Hz
	EndFreq      float64 `json:"end_freq"`      // Ending frequency in Hz
	VibratoFreq  float64 `json:"vibrato_freq"`  // LFO Vibrato rate in Hz
	VibratoDepth float64 `json:"vibrato_depth"` // LFO Vibrato depth in Hz
	NoiseFilter  float64 `json:"noise_filter"`  // Low-pass filter coefficient for noise (0.0 - 1.0)
	NoiseBlend   float64 `json:"noise_blend"`   // Blend factor (0.0 pure tone -> 1.0 pure noise)
	DutyCycle    float64 `json:"duty_cycle"`    // Pulse width ratio for square waves (0.0 - 1.0)
	Pan          float64 `json:"pan"`           // Panning (-1.0 left to +1.0 right)
	ModFreq      float64 `json:"mod_freq"`      // Modulator frequency for 2-op FM
	ModIndex     float64 `json:"mod_index"`     // Modulation index for 2-op FM
	Volume       float64 `json:"volume"`        // Volume level (0.0 to 1.0)
	Attack       float64 `json:"attack"`        // ADSR Attack time in seconds
	Decay        float64 `json:"decay"`         // ADSR Decay time in seconds
	Sustain      float64 `json:"sustain"`       // ADSR Sustain amplitude (0.0 - 1.0)
	Release      float64 `json:"release"`       // ADSR Release time in seconds
}

// TrackJSON represents a single instrument track in a multi-track composition.
type TrackJSON struct {
	Name  string     `json:"name"`
	Pan   float64    `json:"pan"`
	Notes []NoteJSON `json:"notes"`
}

// AudioDefJSON represents a complete sound effect or polyphonic song JSON file.
type AudioDefJSON struct {
	Title         string      `json:"title"`
	Type          string      `json:"type"` // "sfx" or "song"
	BPM           float64     `json:"bpm,omitempty"`
	TimeSignature string      `json:"time_signature,omitempty"`
	Sequence      []NoteJSON  `json:"sequence,omitempty"` // Used if type == "sfx"
	Tracks        []TrackJSON `json:"tracks,omitempty"`   // Used if type == "song"
}

// ParseAudioDefJSON parses a raw JSON byte buffer into an AudioDefJSON struct.
func ParseAudioDefJSON(data []byte) (AudioDefJSON, error) {
	var def AudioDefJSON
	err := json.Unmarshal(data, &def)
	return def, err
}

// LoadAudioDefJSON reads and parses a .json sound/song file from disk.
func LoadAudioDefJSON(filepath string) (AudioDefJSON, error) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return AudioDefJSON{}, err
	}
	return ParseAudioDefJSON(data)
}

// ============================================================================
// 2. DSP SYNTHESIS ALGORITHMS & PCM GENERATION
// ============================================================================

// AlignPCMBytes enforces 4-byte stereo frame alignment (16-bit Left + 16-bit Right)
// required by Ebitengine's audio.Context to prevent runtime panics on odd byte counts.
func AlignPCMBytes(n int) int {
	return n &^ 3
}

// AlignPCMOffset enforces 4-byte stereo frame alignment on int64 stream seek/loop offsets.
func AlignPCMOffset(offset int64) int64 {
	return offset &^ 3
}

// GenerateNotePCM synthesizes a single NoteJSON into raw 16-bit 44100Hz stereo PCM.
func GenerateNotePCM(n NoteJSON) []byte {
	const sampleRate = 44100
	const numChannels = 2
	const bytesPerSample = 2

	numSamples := int(n.Duration * sampleRate)
	if numSamples <= 0 {
		return nil
	}

	byteLen := (numSamples * numChannels * bytesPerSample) &^ 3
	buf := make([]byte, byteLen)

	var phase float64
	var modPhase float64
	var filterVal float64

	pan := n.Pan
	if pan < -1.0 {
		pan = -1.0
	}
	if pan > 1.0 {
		pan = 1.0
	}
	leftPan := math.Cos((pan + 1.0) * math.Pi / 4.0)
	rightPan := math.Sin((pan + 1.0) * math.Pi / 4.0)

	for i := 0; i < numSamples; i++ {
		t := float64(i) / sampleRate
		progress := t / n.Duration

		var currentFreq float64
		if n.StartFreq == n.EndFreq {
			currentFreq = n.StartFreq
		} else if n.StartFreq > 0 && n.EndFreq > 0 {
			currentFreq = n.StartFreq * math.Pow(n.EndFreq/n.StartFreq, progress)
		} else {
			currentFreq = n.StartFreq + progress*(n.EndFreq-n.StartFreq)
		}

		if n.VibratoFreq > 0 && n.VibratoDepth > 0 {
			currentFreq += math.Sin(2.0*math.Pi*n.VibratoFreq*t) * n.VibratoDepth
		}

		phase += currentFreq / sampleRate
		for phase >= 1.0 {
			phase -= 1.0
		}

		if n.ModFreq > 0 {
			modPhase += n.ModFreq / sampleRate
			for modPhase >= 1.0 {
				modPhase -= 1.0
			}
		}

		var oscAmp float64
		switch n.WaveType {
		case "fm":
			modSample := math.Sin(2.0 * math.Pi * modPhase)
			oscAmp = math.Sin(2.0*math.Pi*phase + n.ModIndex*modSample)
		case "sine":
			oscAmp = math.Sin(2.0 * math.Pi * phase)
		case "square":
			duty := n.DutyCycle
			if duty <= 0 || duty >= 1.0 {
				duty = 0.5
			}
			if phase < duty {
				oscAmp = 1.0
			} else {
				oscAmp = -1.0
			}
		case "triangle":
			if phase < 0.5 {
				oscAmp = 4.0*phase - 1.0
			} else {
				oscAmp = 3.0 - 4.0*phase
			}
		case "sawtooth":
			oscAmp = 2.0*phase - 1.0
		default:
			oscAmp = math.Sin(2.0 * math.Pi * phase)
		}

		rawNoise := rand.Float64()*2.0 - 1.0
		filterCoeff := n.NoiseFilter
		if filterCoeff <= 0 {
			filterCoeff = 1.0
		}
		filterVal += filterCoeff * (rawNoise - filterVal)

		blend := n.NoiseBlend
		if blend < 0 {
			blend = 0
		}
		if blend > 1 {
			blend = 1
		}
		amp := (1.0-blend)*oscAmp + blend*filterVal

		env := getEnvelope(t, n.Duration, n.Attack, n.Decay, n.Sustain, n.Release)
		vol := n.Volume
		if vol <= 0 {
			vol = 0.2
		}
		finalAmp := amp * env * vol

		leftVal := int16(math.Max(-1.0, math.Min(1.0, finalAmp*leftPan)) * 32760)
		rightVal := int16(math.Max(-1.0, math.Min(1.0, finalAmp*rightPan)) * 32760)

		idx := i * 4
		buf[idx] = byte(leftVal)
		buf[idx+1] = byte(leftVal >> 8)
		buf[idx+2] = byte(rightVal)
		buf[idx+3] = byte(rightVal >> 8)
	}

	return buf
}

// GenerateSequencePCM chains multiple notes sequentially into a single 4-byte aligned PCM buffer.
func GenerateSequencePCM(notes []NoteJSON) []byte {
	var total []byte
	for _, n := range notes {
		total = append(total, GenerateNotePCM(n)...)
	}
	return total[:len(total)&^3]
}

// MixTracksPCM sums multiple stereo 16-bit PCM byte slices with 32-bit hard clamping and 4-byte alignment.
func MixTracksPCM(tracks [][]byte) []byte {
	maxLen := 0
	for _, t := range tracks {
		aligned := len(t) &^ 3
		if aligned > maxLen {
			maxLen = aligned
		}
	}
	maxLen &= ^3
	result := make([]byte, maxLen)

	for i := 0; i < maxLen; i += 2 {
		var sum int32
		for _, t := range tracks {
			alignedTrackLen := len(t) &^ 3
			if i+1 < alignedTrackLen {
				sample := int16(uint16(t[i]) | (uint16(t[i+1]) << 8))
				sum += int32(sample)
			}
		}
		if sum > 32767 {
			sum = 32767
		} else if sum < -32768 {
			sum = -32768
		}
		result[i] = byte(sum)
		result[i+1] = byte(sum >> 8)
	}
	return result
}

// SynthesizeAudio parses AudioDefJSON and renders the complete 4-byte aligned PCM buffer.
func SynthesizeAudio(def AudioDefJSON) []byte {
	if def.Type == "sfx" || len(def.Sequence) > 0 {
		pcm := GenerateSequencePCM(def.Sequence)
		return pcm[:len(pcm)&^3]
	}
	var trackPCMs [][]byte
	for _, tr := range def.Tracks {
		notes := make([]NoteJSON, len(tr.Notes))
		for i, n := range tr.Notes {
			if n.Pan == 0 && tr.Pan != 0 {
				n.Pan = tr.Pan
			}
			notes[i] = n
		}
		trackPCMs = append(trackPCMs, GenerateSequencePCM(notes))
	}
	pcm := MixTracksPCM(trackPCMs)
	return pcm[:len(pcm)&^3]
}

// SliceLoopPCM extracts a 4-byte aligned stereo PCM loop region between startSec and endSec.
func SliceLoopPCM(pcm []byte, startSec, endSec float64) ([]byte, error) {
	const bytesPerSecond = 44100 * 4
	alignedTotal := len(pcm) &^ 3
	if alignedTotal == 0 {
		return nil, fmt.Errorf("slice loop PCM: input buffer is empty or smaller than 4 bytes (%d bytes)", len(pcm))
	}
	if startSec < 0 || endSec <= startSec {
		return nil, fmt.Errorf("slice loop PCM: invalid time range [%.4fs, %.4fs]", startSec, endSec)
	}

	startByte := int(startSec*bytesPerSecond) &^ 3
	endByte := int(endSec*bytesPerSecond) &^ 3
	if endByte > alignedTotal {
		endByte = alignedTotal
	}
	sliceLen := (endByte - startByte) &^ 3
	if sliceLen <= 0 {
		return nil, fmt.Errorf("slice loop PCM: computed 4-byte aligned slice length is %d bytes for range [%.4fs, %.4fs]", sliceLen, startSec, endSec)
	}

	reader := bytes.NewReader(pcm[:alignedTotal])
	if _, err := reader.Seek(int64(startByte)&^3, io.SeekStart); err != nil {
		return nil, fmt.Errorf("slice loop PCM seek failed: %w", err)
	}
	out := make([]byte, sliceLen)
	if _, err := io.ReadFull(reader, out); err != nil {
		return nil, fmt.Errorf("slice loop PCM read failed: %w", err)
	}
	return out, nil
}

// ApplyLowPassFilter applies a single-pole IIR low-pass filter (alpha in (0.0, 1.0]) to a 16-bit stereo PCM buffer.
func ApplyLowPassFilter(pcm []byte, alpha float64) []byte {
	alignedLen := len(pcm) &^ 3
	if alignedLen == 0 {
		return nil
	}
	if alpha <= 0 {
		alpha = 0.01
	} else if alpha > 1.0 {
		alpha = 1.0
	}

	out := make([]byte, alignedLen)
	var prevL, prevR float64
	for i := 0; i < alignedLen; i += 4 {
		inL := float64(int16(uint16(pcm[i]) | (uint16(pcm[i+1]) << 8)))
		inR := float64(int16(uint16(pcm[i+2]) | (uint16(pcm[i+3]) << 8)))

		prevL += alpha * (inL - prevL)
		prevR += alpha * (inR - prevR)

		outL := int16(math.Max(-32768, math.Min(32767, prevL)))
		outR := int16(math.Max(-32768, math.Min(32767, prevR)))

		out[i] = byte(outL)
		out[i+1] = byte(outL >> 8)
		out[i+2] = byte(outR)
		out[i+3] = byte(outR >> 8)
	}
	return out
}

// ApplyHighPassFilter applies a single-pole IIR high-pass filter (alpha in (0.0, 1.0)) to a 16-bit stereo PCM buffer.
func ApplyHighPassFilter(pcm []byte, alpha float64) []byte {
	alignedLen := len(pcm) &^ 3
	if alignedLen == 0 {
		return nil
	}
	if alpha <= 0 {
		alpha = 0.01
	} else if alpha >= 1.0 {
		alpha = 0.999
	}

	out := make([]byte, alignedLen)
	var prevInL, prevInR, prevOutL, prevOutR float64
	for i := 0; i < alignedLen; i += 4 {
		inL := float64(int16(uint16(pcm[i]) | (uint16(pcm[i+1]) << 8)))
		inR := float64(int16(uint16(pcm[i+2]) | (uint16(pcm[i+3]) << 8)))

		prevOutL = alpha * (prevOutL + inL - prevInL)
		prevOutR = alpha * (prevOutR + inR - prevInR)
		prevInL = inL
		prevInR = inR

		outL := int16(math.Max(-32768, math.Min(32767, prevOutL)))
		outR := int16(math.Max(-32768, math.Min(32767, prevOutR)))

		out[i] = byte(outL)
		out[i+1] = byte(outL >> 8)
		out[i+2] = byte(outR)
		out[i+3] = byte(outR >> 8)
	}
	return out
}

// ApplyBitcrush reduces amplitude resolution to bitDepth (1..16) and holds samples for downsample frames (>=1).
func ApplyBitcrush(pcm []byte, bitDepth int, downsample int) []byte {
	alignedLen := len(pcm) &^ 3
	if alignedLen == 0 {
		return nil
	}
	if bitDepth < 1 {
		bitDepth = 1
	} else if bitDepth > 16 {
		bitDepth = 16
	}
	if downsample < 1 {
		downsample = 1
	}

	shift := uint(16 - bitDepth)
	out := make([]byte, alignedLen)
	var holdL, holdR int16
	frameIdx := 0

	for i := 0; i < alignedLen; i += 4 {
		if frameIdx%downsample == 0 {
			inL := int16(uint16(pcm[i]) | (uint16(pcm[i+1]) << 8))
			inR := int16(uint16(pcm[i+2]) | (uint16(pcm[i+3]) << 8))
			if shift > 0 {
				holdL = (inL >> shift) << shift
				holdR = (inR >> shift) << shift
			} else {
				holdL = inL
				holdR = inR
			}
		}
		out[i] = byte(holdL)
		out[i+1] = byte(holdL >> 8)
		out[i+2] = byte(holdR)
		out[i+3] = byte(holdR >> 8)
		frameIdx++
	}
	return out
}

func getEnvelope(t, duration, attack, decay, sustain, release float64) float64 {
	if t < 0 || t > duration {
		return 0.0
	}
	if attack+decay+release > duration {
		rampUp := duration * 0.1
		if t < rampUp {
			return t / rampUp
		}
		return 1.0 - (t-rampUp)/(duration-rampUp)
	}
	if t < attack {
		if attack > 0 {
			return t / attack
		}
		return 1.0
	}
	if t < attack+decay {
		if decay > 0 {
			progress := (t - attack) / decay
			return 1.0 - (1.0-sustain)*progress
		}
		return sustain
	}
	if t < duration-release {
		return sustain
	}
	timeInRelease := t - (duration - release)
	if release > 0 {
		progress := timeInRelease / release
		if progress > 1.0 {
			progress = 1.0
		}
		return sustain * (1.0 - progress)
	}
	return 0.0
}

// ============================================================================
// 3. SOUND SYSTEM DRIVER (PLAYBACK ENGINE)
// ============================================================================

// SoundSystem handles audio playback and player management.
type SoundSystem struct {
	context     *audio.Context
	musicPlayer *audio.Player
}

// NewSoundSystem initializes the sound system driver.
func NewSoundSystem(ctx *audio.Context) *SoundSystem {
	return &SoundSystem{context: ctx}
}

// Play plays a 4-byte aligned PCM buffer once or in an infinite loop.
func (s *SoundSystem) Play(pcm []byte, loop bool) error {
	if s.context == nil {
		return fmt.Errorf("sound system: audio.Context is nil")
	}
	alignedLen := len(pcm) &^ 3
	if alignedLen == 0 {
		return fmt.Errorf("sound system: PCM buffer is empty or smaller than 4-byte stereo frame (%d bytes)", len(pcm))
	}
	pcm = pcm[:alignedLen]
	s.Stop()

	if loop {
		loopLength := int64(alignedLen) &^ 3
		loopStream := audio.NewInfiniteLoop(bytes.NewReader(pcm), loopLength)
		player, err := s.context.NewPlayer(loopStream)
		if err != nil {
			return err
		}
		s.musicPlayer = player
		player.Play()
	} else {
		player := s.context.NewPlayerFromBytes(pcm)
		s.musicPlayer = player
		player.Play()
	}
	return nil
}

// SeekBytes seeks the active player to a 4-byte aligned byte offset in the 44.1kHz stereo PCM stream.
func (s *SoundSystem) SeekBytes(offsetBytes int64) error {
	if s.musicPlayer == nil {
		return fmt.Errorf("sound system: no active player to seek")
	}
	alignedOffset := offsetBytes &^ 3
	if alignedOffset < 0 {
		return fmt.Errorf("sound system: negative seek offset (%d)", alignedOffset)
	}
	const bytesPerSecond = 44100 * 4
	targetDuration := time.Duration(alignedOffset) * time.Second / bytesPerSecond
	return s.musicPlayer.Seek(targetDuration)
}

// PlayJSON synthesizes an AudioDefJSON definition and plays it (one-shot or loop).
func (s *SoundSystem) PlayJSON(def AudioDefJSON, loop bool) error {
	pcm := SynthesizeAudio(def)
	return s.Play(pcm, loop)
}

// Stop stops any currently playing audio player.
func (s *SoundSystem) Stop() {
	if s.musicPlayer != nil && s.musicPlayer.IsPlaying() {
		s.musicPlayer.Pause()
	}
}

// ============================================================================
// 4. WAV FILE EXPORTER
// ============================================================================

// ExportWAV writes a 4-byte aligned 16-bit 44100Hz stereo PCM buffer to a .wav file.
func ExportWAV(filename string, pcm []byte) (retErr error) {
	alignedLen := len(pcm) &^ 3
	if alignedLen == 0 {
		return fmt.Errorf("export WAV: PCM buffer is empty or smaller than 4-byte stereo frame (%d bytes)", len(pcm))
	}
	pcm = pcm[:alignedLen]

	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := f.Close(); closeErr != nil && retErr == nil {
			retErr = closeErr
		}
	}()

	const sampleRate = 44100
	const numChannels = 2
	const bitsPerSample = 16
	const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
	const blockAlign = numChannels * (bitsPerSample / 8)

	dataSize := uint32(alignedLen)
	chunkSize := 36 + dataSize

	if _, err := f.WriteString("RIFF"); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, chunkSize); err != nil {
		return err
	}
	if _, err := f.WriteString("WAVE"); err != nil {
		return err
	}

	if _, err := f.WriteString("fmt "); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint32(16)); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint16(1)); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint16(numChannels)); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint32(sampleRate)); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint32(byteRate)); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint16(blockAlign)); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint16(bitsPerSample)); err != nil {
		return err
	}

	if _, err := f.WriteString("data"); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, dataSize); err != nil {
		return err
	}
	_, err = f.Write(pcm)
	return err
}
