# Salamander Grand Piano recordings

**Original author:** Alexander Holm  
**Library:** Salamander Grand Piano v3  
**Instrument:** recorded acoustic grand piano  
**License:** Creative Commons Attribution 3.0 Unported (CC BY 3.0)  
**License URL:** https://creativecommons.org/licenses/by/3.0/  
**Source:** https://github.com/sfzinstruments/SalamanderGrandPiano  
**Original archive:** https://archive.org/details/SalamanderGrandPianoV3

The source repository's README and full license are included as `SOURCE-README.md` and `LICENSE-CC-BY-3.0.txt`.

Atelier includes the 30 minor-third-spaced note recordings from velocity layer 8 (`A0v8.flac` through `C8v8.flac`). The source library contains 16 recorded velocity layers; this app ships **one** of them. The other layers, hammer-release sounds, pedal sounds, and string-resonance recordings are not bundled.

**Changes:** lossless format conversion from the upstream FLAC files to 48 kHz, 24-bit, stereo PCM WAV; filenames use `s` in place of `#` and the layer is named `medium`. No resampling, compression, trimming, normalization, or synthesized audio was applied. The converted PCM was compared to decoded source PCM bit-for-bit. Original recording levels and full decay tails are retained. The source repository's SFZ mapping is not used.

`provenance.json` records source filenames, source/output SHA-256 hashes, duration, format, and file sizes. `scripts/prepare-samples.py` reproduces the conversion from the original layer-8 FLAC files.

Preserve this attribution and the license when distributing the recordings. Attribution does not imply endorsement by Alexander Holm or the upstream maintainers.
