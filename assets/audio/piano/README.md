# Acoustic piano sample mapping

The production instrument ships with **30 actual acoustic grand piano recordings**, so no samples need to be supplied to play it. There is **no oscillator fallback** for piano notes.

## Bundled recordings

Original library: **Salamander Grand Piano v3 by Alexander Holm**, distributed under **CC BY 3.0**. The upstream FLAC recordings from velocity layer 8 were converted losslessly to **48 kHz, 24-bit stereo PCM WAV**. Complete transients and natural decay tails are preserved, with no normalization, trimming, resampling, or lossy encoding. See [ATTRIBUTION.md](ATTRIBUTION.md), [the included license](LICENSE-CC-BY-3.0.txt), and [provenance.json](provenance.json).

Exact filenames, all under `assets/audio/piano/medium/`:

```text
A0.wav
C1.wav  Ds1.wav  Fs1.wav  A1.wav
C2.wav  Ds2.wav  Fs2.wav  A2.wav
C3.wav  Ds3.wav  Fs3.wav  A3.wav
C4.wav  Ds4.wav  Fs4.wav  A4.wav
C5.wav  Ds5.wav  Fs5.wav  A5.wav
C6.wav  Ds6.wav  Fs6.wav  A6.wav
C7.wav  Ds7.wav  Fs7.wav  A7.wav
C8.wav
```

`s` denotes a sharp. Scientific pitch notation is used: **C4 = MIDI 60**, A0 = 21, C8 = 108. Roots occur every three semitones. Every playable pitch has a source within one semitone, selected by nearest distance; equal-distance ties choose the lower root. Playback uses `2 ** ((playedMidi - rootMidi) / 12)`.

The complete WAV library totals **121,689,228 bytes** (about 121.7 MB). Full-length decoded stereo buffers require about **162 MB at 48 kHz**, without including browser overhead. The source library contains 16 velocity layers; **only layer 8 is included here**. Hammer-release, pedal-noise, and sympathetic-resonance sample sets are not included. The short room impulse is generated separately for subtle ambience.

## Central configuration

`samples.json` is the sole source of note-to-file mappings and velocity boundaries. An abbreviated example (a production layer must map enough roots to cover all 88 notes):

```json
{
  "version": 1,
  "name": "Salamander Concert Grand",
  "maxTransposeSemitones": 2,
  "layers": [{
    "id": "medium",
    "minVelocity": 0,
    "maxVelocity": 1,
    "gain": 1,
    "samples": {
      "A0": "medium/A0.wav",
      "C1": "medium/C1.wav",
      "Ds1": "medium/Ds1.wav",
      "Fs1": "medium/Fs1.wav"
    }
  }]
}
```

Validation rejects a missing register, a pitch gap beyond the configured limit, duplicate roots, invalid paths, or velocity gaps/overlaps. The configured limit is two semitones to permit libraries sampled every four semitones; the supplied library's actual maximum is one. The validator will not permit more than three semitones of transposition.

## Add soft and hard layers

1. Record or obtain licensed soft, medium, and hard sets covering the same 30 roots.
2. Place them in `soft/`, `medium/`, and `hard/` with the filenames listed above. WAV is recommended.
3. Define three layers with adjacent velocity ranges, for example:

   | Layer | minVelocity | maxVelocity | Sample paths |
   | --- | ---: | ---: | --- |
   | soft | 0 | 0.4 | `soft/A0.wav`, etc. |
   | medium | 0.4 | 0.8 | `medium/A0.wav`, etc. |
   | hard | 0.8 | 1 | `hard/A0.wav`, etc. |

4. Give each layer its own complete `samples` object. `gain` is optional and defaults to 1. At a shared boundary, the lower-velocity layer wins. Voice gain also follows velocity within the selected layer.
5. Increment the sample cache version in both `js/sample-library.js` and `service-worker.js` when replacing existing sample URLs.

There is no playback-code rewrite required. Additional layers increase both downloads and decoded memory, so verify the expanded library on the target iPad. Finger and desktop-key velocity default to 0.75 because generic touch pressure is unreliable. Pen pressure is used when provided.

## Loading, errors and playback

Three concurrent workers load and decode all configured recordings. The start button stays unavailable until **all required buffers are ready**. Progress counts decoded recordings. Every velocity layer is required when configured; none is silently replaced by another layer or by synthesis.

On failure, the app names the number of failed recordings and offers retry. Successfully decoded buffers are retained. Corrupt cached files are removed. Successfully decoded files are cached for offline startup, including on a first visit before service-worker activation. Browser storage quota/eviction can still affect offline availability.

The engine uses independent `AudioBufferSourceNode`s and preserves overlaps and sustain tails. It supports 128 active voices; when the limit is reached it retires released/old sustained voices first with a 20 ms fade. A maximum of eight such brief fading sources may exist alongside active voices. Natural completion and release both clean up their nodes. Only the metronome uses an oscillator.

## Reproduce the conversion

Download the 30 `*v8.flac` note files from the [upstream Samples directory](https://github.com/sfzinstruments/SalamanderGrandPiano/tree/master/Samples) into `test-results/source-samples/`. Keep the original `#` names in that working folder. With Python, NumPy and SoundFile available, run:

```sh
python scripts/prepare-samples.py
```

It writes the WAV files and provenance and checks decoded PCM equality. These development dependencies and source-download working files are not needed to run or deploy the piano.
