package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/hajimehoshi/ebiten/v2/audio"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "play":
		playCmd := flag.NewFlagSet("play", flag.ExitOnError)
		loopFlag := playCmd.Bool("loop", false, "Loop BGM audio playback")
		playCmd.Parse(os.Args[2:])

		if playCmd.NArg() < 1 {
			fmt.Println("Error: Missing JSON audio definition file.")
			fmt.Println("Usage: play play [-loop] <sound.json>")
			os.Exit(1)
		}
		jsonFile := playCmd.Arg(0)
		def, err := LoadAudioDefJSON(jsonFile)
		if err != nil {
			fmt.Printf("Error loading JSON file '%s': %v\n", jsonFile, err)
			os.Exit(1)
		}

		pcm := SynthesizeAudio(def)
		fmt.Printf("Playing audio: '%s' (%s, %.2fs duration, loop=%v)...\n",
			def.Title, def.Type, float64(len(pcm))/176400.0, *loopFlag)
		playAudio(pcm, *loopFlag)

	case "demo":
		demoCmd := flag.NewFlagSet("demo", flag.ExitOnError)
		loopFlag := demoCmd.Bool("loop", false, "Loop BGM audio playback")
		demoCmd.Parse(os.Args[2:])

		def := getDemoSoundtrack()
		pcm := SynthesizeAudio(def)

		fmt.Printf("Playing Demo Soundtrack: '%s' (6-Channel Genesis Style, %.2fs duration, loop=%v)...\n",
			def.Title, float64(len(pcm))/176400.0, *loopFlag)
		playAudio(pcm, *loopFlag)

	case "export":
		exportCmd := flag.NewFlagSet("export", flag.ExitOnError)
		exportCmd.Parse(os.Args[2:])

		if exportCmd.NArg() < 2 {
			fmt.Println("Error: Missing arguments.")
			fmt.Println("Usage: play export <sound.json> <output.wav>")
			os.Exit(1)
		}
		jsonFile := exportCmd.Arg(0)
		wavFile := exportCmd.Arg(1)

		def, err := LoadAudioDefJSON(jsonFile)
		if err != nil {
			fmt.Printf("Error loading JSON file '%s': %v\n", jsonFile, err)
			os.Exit(1)
		}

		pcm := SynthesizeAudio(def)
		err = ExportWAV(wavFile, pcm)
		if err != nil {
			fmt.Printf("Error exporting WAV: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Successfully exported '%s' (%.2fs duration) to '%s'\n",
			def.Title, float64(len(pcm))/176400.0, wavFile)

	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Procedural Audio Player CLI")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  go run . play [-loop] <sound.json>     Play JSON sound/song (one-off default)")
	fmt.Println("  go run . demo [-loop]                  Play built-in 6-channel demo soundtrack")
	fmt.Println("  go run . export <sound.json> <out.wav> Export JSON sound/song to WAV file")
}

func playAudio(pcm []byte, loop bool) {
	audioCtx := audio.NewContext(44100)
	sys := NewSoundSystem(audioCtx)
	err := sys.Play(pcm, loop)
	if err != nil {
		fmt.Printf("Playback error: %v\n", err)
		return
	}

	if loop {
		fmt.Println("Looping playback active. Press ENTER to stop...")
		var input string
		fmt.Scanln(&input)
		sys.Stop()
	} else {
		// Wait for one-off playback duration to finish
		duration := time.Duration(float64(len(pcm))/176400.0*1000) * time.Millisecond
		time.Sleep(duration + 100*time.Millisecond)
	}
}

func getDemoSoundtrack() AudioDefJSON {
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

			counter := []float64{fifth, chord[1], root * 2, fifth, chord[1], root * 2, fifth, chord[2]}
			for _, freq := range counter {
				ch2Counter = append(ch2Counter, NoteJSON{
					WaveType: "square", Duration: 0.2307, StartFreq: freq, EndFreq: freq,
					DutyCycle: 0.25, Volume: 0.08, Attack: 0.02, Decay: 0.05, Sustain: 0.6, Release: 0.05, Pan: 0.25,
				})
			}

			ch3Pad = append(ch3Pad, NoteJSON{
				WaveType: "sawtooth", Duration: 1.8461, StartFreq: fifth, EndFreq: fifth,
				Volume: 0.05, Attack: 0.2, Decay: 0.2, Sustain: 0.85, Release: 0.25, Pan: 0.0,
			})

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

	return AudioDefJSON{
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
}
