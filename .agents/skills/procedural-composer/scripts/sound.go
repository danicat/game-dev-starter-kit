package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"math"
	"math/rand"
	"os"

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

// GenerateNotePCM synthesizes a single NoteJSON into raw 16-bit 44100Hz stereo PCM.
func GenerateNotePCM(n NoteJSON) []byte {
	const sampleRate = 44100
	const numChannels = 2
	const bytesPerSample = 2

	numSamples := int(n.Duration * sampleRate)
	if numSamples <= 0 {
		return nil
	}

	buf := make([]byte, numSamples*numChannels*bytesPerSample)

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

// GenerateSequencePCM chains multiple notes sequentially into a single PCM buffer.
func GenerateSequencePCM(notes []NoteJSON) []byte {
	var total []byte
	for _, n := range notes {
		total = append(total, GenerateNotePCM(n)...)
	}
	return total
}

// MixTracksPCM sums multiple stereo 16-bit PCM byte slices with 32-bit hard clamping.
func MixTracksPCM(tracks [][]byte) []byte {
	maxLen := 0
	for _, t := range tracks {
		if len(t) > maxLen {
			maxLen = len(t)
		}
	}
	result := make([]byte, maxLen)

	for i := 0; i < maxLen; i += 2 {
		var sum int32
		for _, t := range tracks {
			if i+1 < len(t) {
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

// SynthesizeAudio parses AudioDefJSON and renders the complete PCM buffer.
func SynthesizeAudio(def AudioDefJSON) []byte {
	if def.Type == "sfx" || len(def.Sequence) > 0 {
		return GenerateSequencePCM(def.Sequence)
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
	return MixTracksPCM(trackPCMs)
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

// Play plays a PCM buffer once or in an infinite loop.
func (s *SoundSystem) Play(pcm []byte, loop bool) error {
	if s.context == nil || len(pcm) == 0 {
		return nil
	}
	s.Stop()

	if loop {
		loopStream := audio.NewInfiniteLoop(bytes.NewReader(pcm), int64(len(pcm)))
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

// ExportWAV writes a 16-bit 44100Hz stereo PCM buffer to a .wav file.
func ExportWAV(filename string, pcm []byte) error {
	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()

	const sampleRate = 44100
	const numChannels = 2
	const bitsPerSample = 16
	const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
	const blockAlign = numChannels * (bitsPerSample / 8)

	dataSize := uint32(len(pcm))
	chunkSize := 36 + dataSize

	f.WriteString("RIFF")
	binary.Write(f, binary.LittleEndian, chunkSize)
	f.WriteString("WAVE")

	f.WriteString("fmt ")
	binary.Write(f, binary.LittleEndian, uint32(16))
	binary.Write(f, binary.LittleEndian, uint16(1))
	binary.Write(f, binary.LittleEndian, uint16(numChannels))
	binary.Write(f, binary.LittleEndian, uint32(sampleRate))
	binary.Write(f, binary.LittleEndian, uint32(byteRate))
	binary.Write(f, binary.LittleEndian, uint16(blockAlign))
	binary.Write(f, binary.LittleEndian, uint16(bitsPerSample))

	f.WriteString("data")
	binary.Write(f, binary.LittleEndian, dataSize)
	_, err = f.Write(pcm)
	return err
}
