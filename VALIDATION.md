# Version 3.4 — C4 split and collapsible sheet

The two-row split now runs A0–B3 / C4–C8 (23 / 29 white keys), each filling the keybed width. All 88 pitches remain unique. The divider allows zero sheet height in all modes, stays visible for reopening, and retains the loaded document. Hidden PDF views skip unnecessary rendering.

22 unit tests and the Chromium two-row integration suite pass, including drag-to-hide/reopen in both two-row and single-row layouts, preservation of the loaded score element, chords, glissando, sustain, recording, playback, mode switches and offline restoration.

# Version 3.3 — additional two-row mode

22 unit tests pass, including the exact A0–E4 / F4–C8 split, 26 white keys per row, every pitch hit-tested in both rows, and the inactive separation between rows.

`scripts/verify-two-rows.cjs` passes in Chromium: five fingers across both rows, cross-row glissando, sustain and recording preserved through all four modes, unchanged score image element and no additional sample downloads, balanced recorded note events, playback during a mode change, sheet expand/collapse, restoration of the old sheet size, and offline two-row preference restoration. Five iPad-sized viewports fit; landscape white-key widths range from 38.3 to 51.5 CSS pixels. The sheet occupies approximately 20% of the screen, with remaining space shared equally by the keyboards after existing controls and spacing.

The original wide-key regression suite also passes. WebKit passes all four mode selections, equal row counts, sheet expansion, image/PDF loading and viewer persistence with no page errors. Windows WebKit cannot validate Web Audio or offline navigation; actual iPad audio and touch comfort still require physical-device testing. The existing piano engine and sample assets are unchanged.

# Version 3.2 — wide touch keyboard

The user approved replacing the all-88-keys default on iPad with a playable two-octave window. Touch devices default to C3–C5 (25 notes / 15 white keys); desktop retains full view. Users can switch to 3 octaves or All 88 keys, shift toward A0/C8, and restore the saved view offline. Audio samples and the audio engine were not changed.

`node --test tests/*.test.js`: **21 passed**. New geometry tests hit every key in 2-, 3-octave and full views and check range limits and unclipped white endpoints.

`scripts/verify-wide-keys.cjs`: **passed in Chromium**, including a five-finger chord, live note cleanup while changing range, uninterrupted recording with balanced note-on/off events, playback across a view change, navigation limits, all three modes and offline preference restoration. No browser exceptions. Measured white-key widths in CSS pixels:

| Viewport | Two-octave white-key width |
| --- | ---: |
| 1024 × 768 | 66.4 px |
| 1133 × 744 | 73.7 px |
| 1180 × 820 | 76.8 px |
| 1194 × 834 | 77.7 px |
| 1366 × 1024 | 89.2 px |
| 834 × 1194 portrait | 53.7 px |

All tested layouts fit without page scrolling. The existing audio and sheet-viewer suites explicitly select full view and both passed. WebKit also passed the 2/3-octave selector, octave navigation and full-view checks; its Windows audio/offline limitations remain documented below. Physical touch comfort still needs the user's iPad; the measured CSS width is not a physical millimeter measurement.

## Historical version 3.1 — iPad / GitHub Pages validation

Verified on 18 September 2026. Current implementation preserves the sample engine, all 88 keys and existing visual design. Apple touch icon (180×180) and PWA icons (192×192, 512×512) were verified from PNG headers; manifest/start/scope/icon/PDF asset URLs resolve under a repository prefix.

- `node --test tests/*.test.js`: **19 passed**, including synchronous audio resume from the tap handler and isolation of service-worker cleanup between repositories on the same origin.
- `scripts/verify-browser.cjs` with `TEST_URL=http://localhost:5174/Piano/`: **passed**. Full audio, ten-touch input, sustain, recording/playback, metronome, sample integrity, all 88 keys, responsive layout and offline sample loading work beneath a repository subpath.
- `scripts/verify-practice.cjs` at the same subpath: **passed**. Images, PDF worker and dependencies, seven simultaneous sheet/piano touches, page turns, presets, panning, zoom and offline file/state restoration work. Eight viewport sizes fit without scrolling or hidden keys.
- `scripts/verify-webkit.cjs`: **layout/viewer checks passed in Playwright WebKit 26.5 on Windows**. Native image/PDF selection, page rendering, zoom, repository-scoped registration and saved PDF/page/zoom restoration passed. Four iPad viewport sizes fit. Raw file bytes replace File/Blob writes for reliable IndexedDB persistence across WebKit ports; existing Blob records still open.

WebKit resize notifications can settle later than CSS viewport dimensions. Tests wait for layout to settle, rather than assuming a fixed 150ms delay. The normal layout follows CSS `dvh`; a pixel-height override is used only while a numeric/text input needs room for the software keyboard.

**WebKit test limitations:** this Windows port does not implement Web Audio, so its audio checks were explicitly skipped; audio was not mocked or claimed to pass. Its offline navigation returned an internal browser error, so offline navigation is verified in Chromium only. Reports record these limitations. A physical iPad remains necessary to verify actual Safari audio latency, iPadOS gestures, Home Screen installation, safe-area behavior and offline launch. Use iPadOS 18+ with the current bundled PDF.js legacy renderer.

Reproduce the WebKit checks after generating score fixtures with `verify-practice.cjs`: install the development dependencies (`playwright`, `pdf-lib`, `sharp`), run `npx playwright install webkit`, start the development server with `BASE_PATH=/Piano/` and `PORT=5174`, then run `node scripts/verify-webkit.cjs`. The local run stored the downloaded browser in ignored `test-results/browsers` using `PLAYWRIGHT_BROWSERS_PATH`.

Deployment and Home Screen instructions: [DEPLOYMENT.md](DEPLOYMENT.md).

## Historical version 3 — sheet music practice validation

Verified on 18 September 2026 in Windows using Microsoft Edge / Chromium and Playwright. No physical iPad or Safari runtime was available.

`node --test tests/core.test.js`: **16 passed**. `node scripts/verify-browser.cjs`: **passed**, including all existing audio, 88-key geometry, ten-touch, recording, sustain, metronome, sample-integrity and offline checks. The sample engine and keyboard touch controller were not modified.

`node scripts/verify-practice.cjs`: **passed**:

- Real native file chooser imports PNG, JPEG and WEBP, preserving aspect ratio and full-page fit.
- A generated three-page PDF renders with the bundled PDF.js worker; previous/next controls render the correct page.
- Five held piano touch points plus two score touch points zoom the PDF to 250% while retaining exactly five pressed keys, sustain and a running Web Audio context. Releasing the touches clears keys correctly.
- Zoomed panning does not turn pages or trigger notes. Fit-page swiping turns one page. Optional left/right edge turns work at Fit and are blocked when zoomed.
- Divider dragging and all three presets change the allocation while keeping every key visible. No keyboard DOM rebuild or range navigation is introduced.
- Offline reload restores the actual PDF Blob, page 2 and 125% zoom. Page 3 renders offline with the audio context running. The suite verifies every entry in the PDF dependency cache manifest.
- Replacing the restored PDF with an image and removing the stored score both succeed. No unexpected browser exceptions.

| Viewport | Keys visible | Whole page fits | Control targets fit horizontally |
| --- | ---: | --- | --- |
| 1194 × 834 | 88 | Yes | Yes |
| 1366 × 1024 | 88 | Yes | Yes |
| 1180 × 820 | 88 | Yes | Yes |
| 1024 × 768 | 88 | Yes | Yes |
| 1133 × 744 | 88 | Yes | Yes |
| 1024 × 600 | 88 | Yes | Yes |
| 834 × 1194 portrait | 88 | Yes | Yes |
| 390 × 844 portrait | 88 | Yes | Yes |

Tests exercise both the default Balanced layout and a larger music allocation chosen by dragging. At the default 1194 × 834 viewport, the score panel is 327px tall and keys are about 391px tall. The score includes its 48px control row. Screenshots and the detailed report are in ignored `test-results/practice-balanced.png` and `test-results/practice-report.json`.

The manifest requests standalone landscape display; CSS uses `100dvh` and four safe-area insets. Browser tests establish layout, functional gesture separation and uninterrupted AudioContext state, **not measured iPad audio latency or a guarantee against audio stutter on physical hardware**. On an iPad running Safari 18 or later, verify native Files selection, pinch response, PDF readability, speaker/headphone output during page turns, safe areas, Home Screen launch and airplane-mode restoration. The original decoded samples use roughly 162 MB at 48 kHz; PDF canvases are capped at 4 million pixels and only the current page is rendered.

## Historical version 2 validation

Verified on 18 September 2026 in the local Windows environment.

## Automated tests

`node --test tests/core.test.js`: **16 tests passed**.

- Exact 88-note range A0–C8, MIDI 21–108, 52 white keys, 36 black keys, and C4 = MIDI 60.
- Exact beginning A0 / A#0 / B0 / C1 … C2 and ending C7 … C8 sequences.
- Full-keyboard geometry at five widths; black-key overlap priority, edge hits, and out-of-bounds handling.
- Independent fingers, held chords, shared-note ownership, glides, pointer cancellation, and lost capture.
- Sustain, release, recording durations, persistence, time limits, invalid data, and playback cleanup.
- PWA shell, manifest, and icon assets.
- All 30 root recordings cover every note with at most one semitone of transposition.
- Velocity-layer selection and rejection of incomplete libraries or velocity gaps.
- Every WAV has a stereo, 48 kHz, 24-bit PCM header and matches its recorded SHA-256 provenance.

Separately, the conversion script verified that the decoded WAV PCM exactly matches the decoded source FLAC PCM. The recordings total approximately 121.7 MB; they have not been shortened or lossily compressed.

## Browser integration

`node scripts/verify-browser.cjs`: **passed in Microsoft Edge / Chromium**, driven by Playwright.

- All 88 keys visible before and after loading; no octave controls, range navigator, scrolling, or hidden notes.
- White-key width matches keyboard width / 52. A0 and C8 remain fully inside the keybed.
- Playing remains disabled until all 30 required recordings decode; progress reaches 100%.
- Ten simultaneous browser touch points, independent release, cancellation, glissando, and individual coordinate hits on **every one of the 88 keys**.
- Middle-C computer mapping, rapid retriggers, recorded MIDI-style events/durations and playback.
- Labels disabled by default; enabling labels shows only eight C markers.
- Sustain control, metronome/tempo, fullscreen entry and exit.
- Every tested piano voice is an `AudioBufferSourceNode` with a stereo recording; **zero piano oscillators created**.
- Three-note acoustic chord signal peak approximately 0.198. This establishes functional, non-clipping output in the test; it is not a subjective listening assessment.
- Pedal-up releases sustained notes while preserving a held note. Twenty repeated sustained strikes preserve twenty separate tails.
- A 400-note sustain stress passage stays within 128 active voices, plus at most eight short retirement fades; all voices clean up after release.
- First-visit caching includes all 30 WAV files. Fully offline reload decodes the entire library, activates the acoustic piano, and restores the saved take.
- A deliberately corrupt required WAV keeps the instrument blocked; retry fetches a valid recording and restores operation. No synthesized substitution.
- No unexpected browser exceptions or failed requests on the successful loading/playback path.

| Viewport | Visible keys | Key height | Page fits |
| --- | ---: | ---: | --- |
| iPad landscape, 1194 × 834 | 88 | 315 px | Yes |
| Small iPad landscape, 1024 × 768 | 88 | 307 px | Yes |
| Large iPad landscape, 1366 × 1024 | 88 | 359 px | Yes |
| iPad portrait, 834 × 1194 | 88 | 520 px | Yes |
| Phone portrait, 390 × 844 | 88 | 252 px | Yes |
| Phone landscape, 844 × 390 | 88 | 174 px | Yes |
| Desktop, 1440 × 900 | 88 | 381 px | Yes |

Resize/orientation checks also verified that the original key elements remain in place; the keyboard is not rebuilt. At 1194 × 834, keys increased from the previous version's 261 px to **315 px**. Screenshots of loading, the piano, a ten-note chord, settings, and responsive layouts are generated in ignored `test-results/`.

## Physical-device limits

A physical iPad and Safari/WebKit runtime were not available. Chromium emulation verifies layout and browser input logic but does not certify iPad audio latency, Safari gesture behavior, installation behavior, memory pressure, or sustained 60 FPS performance.

On an actual iPad, confirm first-tap activation, speaker/headphone balance, five-finger chords and glissandos, app-switch recovery, landscape safe areas, Home Screen installation, and a subsequent airplane-mode launch. The decoded library uses about 162 MB at a 48 kHz audio-device rate plus overhead. Full-range keys are intentionally narrow on small displays, as required; touch comfort remains a physical-device consideration.
