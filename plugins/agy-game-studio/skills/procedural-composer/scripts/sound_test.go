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
	"os"
	"testing"
)

// ExampleSynthesizeAudio_stageBGM demonstrates composing a 16-bar, 6-channel 16-bit Genesis-style stage theme.
func ExampleSynthesizeAudio_stageBGM() {
	const (
		A2 = 110.00
		F2 = 87.31
		D2 = 73.42
		E2 = 82.41
		A3 = 220.00
		F3 = 174.61
		B3 = 246.94
		C4 = 261.63
		D4 = 293.66
		E4 = 329.63
		F4 = 349.23
		G4 = 392.00
		A4 = 440.00
		B4 = 493.88
		C5 = 523.25
		D5 = 587.33
		E5 = 659.25
		F5 = 698.46
		G5 = 783.99
		A5 = 880.00
		B5 = 987.77
		C6 = 1046.50
		E6 = 1318.51
	)

	chords := [][]float64{
		{A3, C4, E4, A4},     // Am
		{F2 * 2, A3, C4, F4}, // F
		{D2 * 2, F3, A3, D4}, // Dm
		{E2 * 2, G4, B3, D4}, // E7
	}

	var ch1Lead, ch2Counter, ch3Pad, ch4Bass, ch5Arp, ch6Drums []NoteJSON

	for loop := 0; loop < 4; loop++ {
		for _, chord := range chords {
			root := chord[0]
			fifth := chord[2]
			octave := chord[3]

			// Ch1: Sawtooth Lead w/ Vibrato
			melody := []float64{octave, chord[1] * 2, fifth * 2, octave * 1.5, chord[1] * 2, fifth * 2, octave, chord[2] * 2}
			if loop >= 2 {
				melody = []float64{octave * 2, chord[2] * 2, chord[1] * 2, octave * 2, E6, C6, B5, A5}
			}
			for _, freq := range melody {
				ch1Lead = append(ch1Lead, NoteJSON{
					WaveType: "sawtooth", Duration: 0.2307, StartFreq: freq, EndFreq: freq,
					VibratoFreq: 5.5, VibratoDepth: 4.5, Volume: 0.12, Attack: 0.02, Decay: 0.05, Sustain: 0.7, Release: 0.05, Pan: -0.2,
				})
			}

			// Ch2: 25% Duty Pulse Counter-Melody
			counter := []float64{fifth, chord[1], root * 2, fifth, chord[1], root * 2, fifth, chord[2]}
			for _, freq := range counter {
				ch2Counter = append(ch2Counter, NoteJSON{
					WaveType: "square", Duration: 0.2307, StartFreq: freq, EndFreq: freq,
					DutyCycle: 0.25, Volume: 0.08, Attack: 0.02, Decay: 0.05, Sustain: 0.6, Release: 0.05, Pan: 0.25,
				})
			}

			// Ch3: Sustained Pad
			ch3Pad = append(ch3Pad, NoteJSON{
				WaveType: "sawtooth", Duration: 1.8461, StartFreq: fifth, EndFreq: fifth,
				Volume: 0.05, Attack: 0.2, Decay: 0.2, Sustain: 0.85, Release: 0.25, Pan: 0.0,
			})

			// Ch4: Octave Galloping Bass
			for i := 0; i < 16; i++ {
				bFreq := root / 2
				if i%2 != 0 {
					bFreq = root
				}
				ch4Bass = append(ch4Bass, NoteJSON{
					WaveType: "square", Duration: 0.1154, StartFreq: bFreq, EndFreq: bFreq,
					DutyCycle: 0.5, Volume: 0.13, Attack: 0.01, Decay: 0.05, Sustain: 0.5, Release: 0.03, Pan: 0.0,
				})
			}

			// Ch5: Pendulum Arpeggiator Sweep
			for i := 0; i < 16; i++ {
				arpIdx := i % 4
				if (i/4)%2 != 0 {
					arpIdx = 3 - (i % 4)
				}
				ch5Arp = append(ch5Arp, NoteJSON{
					WaveType: "triangle", Duration: 0.1154, StartFreq: chord[arpIdx] * 2, EndFreq: chord[arpIdx] * 2,
					Volume: 0.07, Attack: 0.008, Decay: 0.04, Sustain: 0.35, Release: 0.02, Pan: -0.4,
				})
			}

			// Ch6: Noise Percussion
			for i := 0; i < 16; i++ {
				var noiseCoeff, vol, dur float64
				if i%4 == 0 {
					noiseCoeff = 0.1
					vol = 0.09
					dur = 0.1154
				} else if i%4 == 2 {
					noiseCoeff = 0.5
					vol = 0.07
					dur = 0.1154
				} else {
					noiseCoeff = 0.95
					vol = 0.04
					dur = 0.0577
				}
				ch6Drums = append(ch6Drums, NoteJSON{
					WaveType: "noise", Duration: dur, NoiseFilter: noiseCoeff, NoiseBlend: 1.0,
					Volume: vol, Attack: 0.003, Decay: 0.04, Sustain: 0.1, Release: 0.02, Pan: 0.3,
				})
				if dur < 0.1154 {
					ch6Drums = append(ch6Drums, NoteJSON{
						WaveType: "sine", Duration: 0.0577, StartFreq: 0, EndFreq: 0, Volume: 0,
					})
				}
			}
		}
	}

	def := AudioDefJSON{
		Title: "16-Bit Genesis Stage Theme",
		Type:  "song",
		BPM:   130,
		Tracks: []TrackJSON{
			{Name: "Ch1 Sawtooth Lead", Pan: -0.2, Notes: ch1Lead},
			{Name: "Ch2 Pulse Counter", Pan: 0.25, Notes: ch2Counter},
			{Name: "Ch3 Strings Pad", Pan: 0.0, Notes: ch3Pad},
			{Name: "Ch4 Octave Bass", Pan: 0.0, Notes: ch4Bass},
			{Name: "Ch5 Arpeggiator", Pan: -0.4, Notes: ch5Arp},
			{Name: "Ch6 Percussion", Pan: 0.3, Notes: ch6Drums},
		},
	}

	pcm := SynthesizeAudio(def)
	fmt.Printf("Synthesized Stage BGM: %s (%d bytes PCM)\n", def.Title, len(pcm))

	// Output:
	// Synthesized Stage BGM: 16-Bit Genesis Stage Theme (5211136 bytes PCM)
}

// ExampleSynthesizeAudio_bossBGM demonstrates composing an intense 170 BPM diminished boss theme.
func ExampleSynthesizeAudio_bossBGM() {
	chords := [][]float64{
		{220.00, 261.63, 311.13, 440.00}, // Adim
		{196.00, 233.08, 277.18, 392.00}, // Gdim
		{174.61, 207.65, 246.94, 349.23}, // Fdim
		{164.81, 196.00, 233.08, 329.63}, // Edim
	}

	var ch1Lead, ch2Counter, ch3Pad, ch4Bass, ch5Arp, ch6Drums []NoteJSON

	for loop := 0; loop < 4; loop++ {
		for _, chord := range chords {
			for i := 0; i < 8; i++ {
				noteFreq := chord[2] * 2
				if i%3 == 0 {
					noteFreq = chord[3] * 2
				}
				ch1Lead = append(ch1Lead, NoteJSON{
					WaveType: "square", Duration: 0.15, StartFreq: noteFreq, EndFreq: noteFreq,
					DutyCycle: 0.5, Volume: 0.13, Attack: 0.005, Decay: 0.04, Sustain: 0.7, Release: 0.04,
					VibratoFreq: 8.0, VibratoDepth: 10.0, Pan: -0.2,
				})
				ch2Counter = append(ch2Counter, NoteJSON{
					WaveType: "sawtooth", Duration: 0.15, StartFreq: chord[1] * 1.5, EndFreq: chord[1] * 1.5,
					Volume: 0.08, Attack: 0.005, Decay: 0.04, Sustain: 0.6, Release: 0.04, Pan: 0.2,
				})
			}
			ch3Pad = append(ch3Pad, NoteJSON{
				WaveType: "sawtooth", Duration: 1.2, StartFreq: chord[0], EndFreq: chord[0],
				Volume: 0.06, Attack: 0.05, Decay: 0.1, Sustain: 0.8, Release: 0.1, Pan: 0.0,
			})
			for i := 0; i < 8; i++ {
				f := chord[0] / 2
				if i%2 != 0 {
					f = chord[0]
				}
				ch4Bass = append(ch4Bass, NoteJSON{
					WaveType: "sawtooth", Duration: 0.15, StartFreq: f, EndFreq: f,
					Volume: 0.15, Attack: 0.005, Decay: 0.08, Sustain: 0.6, Release: 0.04, Pan: 0.0,
				})
			}
			for i := 0; i < 16; i++ {
				idx := i % 4
				ch5Arp = append(ch5Arp, NoteJSON{
					WaveType: "triangle", Duration: 0.075, StartFreq: chord[idx] * 2, EndFreq: chord[idx] * 2,
					Volume: 0.07, Attack: 0.005, Decay: 0.03, Sustain: 0.4, Release: 0.01, Pan: -0.3,
				})
			}
			for i := 0; i < 8; i++ {
				noiseCoeff := 0.2
				if i%2 != 0 {
					noiseCoeff = 0.6
				}
				ch6Drums = append(ch6Drums, NoteJSON{
					WaveType: "noise", Duration: 0.15, NoiseFilter: noiseCoeff, NoiseBlend: 1.0,
					Volume: 0.08, Attack: 0.002, Decay: 0.06, Sustain: 0.1, Release: 0.02, Pan: 0.2,
				})
			}
		}
	}

	def := AudioDefJSON{
		Title: "Diminished Boss Theme",
		Type:  "song",
		BPM:   170,
		Tracks: []TrackJSON{
			{Name: "Lead FM", Notes: ch1Lead},
			{Name: "Counter", Notes: ch2Counter},
			{Name: "Pad", Notes: ch3Pad},
			{Name: "Bass", Notes: ch4Bass},
			{Name: "Arp", Notes: ch5Arp},
			{Name: "Drums", Notes: ch6Drums},
		},
	}

	pcm := SynthesizeAudio(def)
	fmt.Printf("Synthesized Boss BGM: %s (%d bytes PCM)\n", def.Title, len(pcm))

	// Output:
	// Synthesized Boss BGM: Diminished Boss Theme (3386880 bytes PCM)
}

// ExampleSynthesizeAudio_laserSFX demonstrates synthesizing a punchy 25% duty pulse laser shot.
func ExampleSynthesizeAudio_laserSFX() {
	def := AudioDefJSON{
		Title: "Laser Bow Shot",
		Type:  "sfx",
		Sequence: []NoteJSON{
			{
				WaveType:  "square",
				Duration:  0.15,
				StartFreq: 950.0,
				EndFreq:   120.0,
				DutyCycle: 0.25,
				Volume:    0.3,
				Attack:    0.005,
				Decay:     0.04,
				Sustain:   0.2,
				Release:   0.085,
				Pan:       0.0,
			},
		},
	}
	pcm := SynthesizeAudio(def)
	fmt.Printf("Laser SFX Duration: %.2fs (%d bytes)\n", float64(len(pcm))/176400.0, len(pcm))

	// Output:
	// Laser SFX Duration: 0.15s (26460 bytes)
}

// ExampleSynthesizeAudio_explosionSFX demonstrates synthesizing a low-pass filtered noise rumble explosion.
func ExampleSynthesizeAudio_explosionSFX() {
	def := AudioDefJSON{
		Title: "Filtered Noise Explosion",
		Type:  "sfx",
		Sequence: []NoteJSON{
			{
				WaveType:    "noise",
				Duration:    0.85,
				NoiseFilter: 0.12,
				NoiseBlend:  1.0,
				Volume:      0.4,
				Attack:      0.01,
				Decay:       0.25,
				Sustain:     0.2,
				Release:     0.59,
				Pan:         0.0,
			},
		},
	}
	pcm := SynthesizeAudio(def)
	fmt.Printf("Explosion SFX Duration: %.2fs (%d bytes)\n", float64(len(pcm))/176400.0, len(pcm))

	// Output:
	// Explosion SFX Duration: 0.85s (149940 bytes)
}

// ExampleExportWAV demonstrates synthesizing an AudioDefJSON and writing it to a WAV file.
func ExampleExportWAV() {
	def := AudioDefJSON{
		Title: "Coin Pickup Chime",
		Type:  "sfx",
		Sequence: []NoteJSON{
			{WaveType: "square", Duration: 0.07, StartFreq: 987.77, EndFreq: 987.77, DutyCycle: 0.5, Volume: 0.2, Attack: 0.005, Decay: 0.02, Sustain: 0.5, Release: 0.045},
			{WaveType: "square", Duration: 0.22, StartFreq: 1318.51, EndFreq: 1318.51, DutyCycle: 0.5, Volume: 0.2, Attack: 0.005, Decay: 0.05, Sustain: 0.4, Release: 0.165},
		},
	}
	pcm := SynthesizeAudio(def)
	tmpFile := "/tmp/coin_test.wav"
	if err := ExportWAV(tmpFile, pcm); err != nil {
		panic(err)
	}
	fmt.Printf("Exported WAV successfully: %s\n", tmpFile)
	if err := os.Remove(tmpFile); err != nil {
		panic(err)
	}

	// Output:
	// Exported WAV successfully: /tmp/coin_test.wav
}

func TestPCMAlignmentAndDSPPostProcessing(t *testing.T) {
	if got := AlignPCMBytes(103); got != 100 {
		t.Fatalf("AlignPCMBytes(103) = %d, want 100", got)
	}
	if got := AlignPCMOffset(107); got != 104 {
		t.Fatalf("AlignPCMOffset(107) = %d, want 104", got)
	}

	// Verify MixTracksPCM enforces 4-byte alignment even on unaligned input slices
	unalignedA := []byte{1, 2, 3, 4, 5, 6, 7}
	unalignedB := []byte{10, 0, 20, 0, 30}
	mixed := MixTracksPCM([][]byte{unalignedA, unalignedB})
	if len(mixed)%4 != 0 || len(mixed) != 4 {
		t.Fatalf("MixTracksPCM length = %d, want 4-byte aligned length 4", len(mixed))
	}

	// Synthesize a 0.25s test tone and test loop slicing + DSP post-processing
	note := NoteJSON{
		WaveType:  "sawtooth",
		Duration:  0.25,
		StartFreq: 440.0,
		EndFreq:   440.0,
		Volume:    0.5,
		Attack:    0.01,
		Decay:     0.04,
		Sustain:   0.8,
		Release:   0.05,
	}
	rawPCM := GenerateNotePCM(note)
	if len(rawPCM)%4 != 0 {
		t.Fatalf("GenerateNotePCM length %d is not 4-byte aligned", len(rawPCM))
	}

	sliced, err := SliceLoopPCM(rawPCM, 0.05, 0.20)
	if err != nil {
		t.Fatalf("SliceLoopPCM failed: %v", err)
	}
	if len(sliced) == 0 || len(sliced)%4 != 0 {
		t.Fatalf("SliceLoopPCM returned unaligned or empty slice (%d bytes)", len(sliced))
	}

	lpf := ApplyLowPassFilter(sliced, 0.25)
	if len(lpf) != len(sliced) || len(lpf)%4 != 0 {
		t.Fatalf("ApplyLowPassFilter length = %d, want %d", len(lpf), len(sliced))
	}

	hpf := ApplyHighPassFilter(sliced, 0.85)
	if len(hpf) != len(sliced) || len(hpf)%4 != 0 {
		t.Fatalf("ApplyHighPassFilter length = %d, want %d", len(hpf), len(sliced))
	}

	crushed := ApplyBitcrush(sliced, 4, 4)
	if len(crushed) != len(sliced) || len(crushed)%4 != 0 {
		t.Fatalf("ApplyBitcrush length = %d, want %d", len(crushed), len(sliced))
	}
}
