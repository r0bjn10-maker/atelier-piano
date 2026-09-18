# Atelier — Piano Studio

The existing Atelier / Concert Grand interface, now a **sheet music + full 88-key piano practice workstation**. Built with HTML, CSS, native JavaScript modules, Web Audio, and a locally bundled PDF.js renderer. No framework, account, backend, CDN, or build step.

## Practice mode — version 3

For the current iPad/GitHub Pages setup, follow [the step-by-step deployment guide](DEPLOYMENT.md). Version 3.1 adds repository-isolated shell caching, explicit service-worker scope, bounded offline downloads, scoped Safari gesture guards, visual-viewport resizing and an offline readiness message in the existing Settings panel. The audio engine, samples and visual design are unchanged.

- Sheet music sits above one compact piano control bar and the full A0–C8 keyboard. The dark charcoal, warm gold and ivory styling remains; the large decorative header and cabinet have been removed to recover playing space. The acoustic engine and recordings are unchanged.
- Tap **Open Sheet Music** and choose a JPG/JPEG, PNG, WEBP or PDF using the device's native file picker. The full page is fitted and centered initially. Files are decoded locally and never uploaded.
- **− / +** zoom, **Fit** centers the whole current page, and **Reset** returns to page 1 at Fit. Pinch to zoom and drag to pan. Zoom ranges from 100% to 500% of the fitted page size.
- PDF **Previous / Next** buttons have 44px touch targets. Swipe horizontally at Fit to turn pages. Settings can enable taps in the outer 15% of the score. Pinch gestures, panning and zoomed views cannot turn pages accidentally.
- Drag the thin divider, use its keyboard arrows, or choose **More Music / Balanced / More Piano** in Settings. The three presets allocate approximately 50% / 40% / 30% to music; Balanced is the default. The ratio persists locally. The layout uses dynamic viewport height and all four safe-area insets without page or keyboard scrolling.
- A copy of the most recent score is saved in **IndexedDB**, with page, zoom and normalized pan position in local storage. Raw file bytes are stored for WebKit compatibility; previously saved Blobs still reopen. This is a local copy, not persistent access to the original file. **Remove saved sheet music** deletes the app's copy. When storage is unavailable or evicted, reopening the same file restores the saved reading position where possible.
- PDF.js **6.3.289 legacy build**, worker, fonts, CMaps, image decoders and ICC profile are bundled under `assets/vendor/pdfjs/` (about 7 MB). Only the current page is rendered, with a maximum 4-million-pixel / 4096px backing canvas. Zoom uses immediate CSS transforms and a deferred sharp redraw after the gesture; PDF drawing yields between batches.
- Target current iPadOS Safari; PDF.js's [published compatibility table](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#which-browsersenvironments-are-supported) lists Safari 18+ for the legacy build. Actual iPad testing remains necessary; see validation notes.

The PDF renderer and supporting assets are cached with the app shell for offline use. The existing 122 MB sample cache is retained across this UI update. Offline score restoration depends on successful device storage; a PDF never needs a remote viewer.

## What changed in version 2

- The keyboard always spans **A0 to C8, MIDI 21–108**: 52 white keys and 36 black keys, fitted to 100% of the keybed width. No scrolling, range selection, dragging, octave switching, or miniature keyboard.
- The existing ivory/ebony surfaces, key travel, dark cabinet, Atelier branding, typography, and warm accents are preserved. Freed navigation space makes the keys taller.
- **30 actual acoustic piano recordings are bundled.** These are Alexander Holm's Salamander Grand Piano v3, velocity layer 8, converted losslessly from the upstream FLAC files to **48 kHz / 24-bit stereo WAV**. No trimming, lossy compression, or normalization. The WAV PCM was checked bit-for-bit against the decoded originals.
- Recordings are spaced every three semitones, so all 88 notes require at most **one semitone** of pitch shifting. **128 active voices**, natural recorded decays, sustain, smooth release, repeated-note tails, and subtle room ambience.
- A loading progress screen waits until every required recording is decoded. A missing or corrupt recording blocks playing and offers retry. **There is no synthesized piano fallback.** The metronome alone uses an oscillator.
- One recorded velocity layer ships today; the engine supports additional soft/medium/hard layers through configuration. It does not claim to bundle the upstream library's complete 16-layer collection.

The original recordings are distributed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution, the full license, and file provenance accompany the app. See [sample attribution](assets/audio/piano/ATTRIBUTION.md).

## Run locally

With Node.js 20 or later installed, run from this directory:

```sh
node scripts/serve.js
```

Open **http://localhost:5173**. Wait for **30 of 30 recordings ready**, then tap **Tap to Start Piano**. `npm start` is equivalent if npm is installed. Do not open `index.html` using `file://`; modules, audio fetching, and service workers need HTTP or HTTPS.

The lossless recordings total approximately **121.7 MB**. The first load downloads and decodes them; later loads can use the local PWA cache. Decoded buffers use approximately **162 MB at 48 kHz**, plus browser/audio overhead. Three concurrent download/decode tasks bound peak loading work. Actual memory usage depends on the audio device's sample rate.

On an iPad connected to the same Wi-Fi, open `http://YOUR-COMPUTER-LAN-IP:5173` in Safari. The computer's firewall must permit the port. This LAN HTTP address supports playing but not service workers; use an HTTPS deployment for offline installation. The Node server is a local development helper, not a production backend.

## GitHub Pages and iPad installation

1. Upload the project to a GitHub repository, including `assets/audio/piano/medium/` and `.nojekyll`. Do not upload `test-results/`, temporary tools, or source-download working files; `.gitignore` excludes them.
2. Open **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Choose the branch containing the project, usually `main`, and **/(root)**. Save and wait for deployment.
4. Open the HTTPS URL GitHub provides in Safari on your iPad. All paths are relative, so a GitHub Pages project subdirectory works.
5. Wait for the recordings to load, then tap to start. Use **Share → Add to Home Screen**, keep **Open as Web App** enabled if offered, and tap **Add**.
6. Launch Atelier from the Home Screen. After successful shell and sample caching, it also works offline.

The fullscreen control uses the browser API where available and shows the Home Screen alternative otherwise. The manifest prefers landscape, but the full keyboard also fits portrait. See [GitHub's publishing guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [Apple's web-app guide](https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/ipados).

## Playing

- **Touch:** independently tracked fingers support chords and glissandos. Coordinate hit testing uses the rendered key geometry, gives black keys priority in their overlapping area, and ignores animation displacement. Repeated movement within one key does not retrigger it. Pointer cancellation and lost capture release the affected note.
- **Full instrument:** all 88 notes stay visible at every screen size. White-key width is exactly the available keyboard width divided by 52; black keys are 61% as wide and 63% as long. Small screens necessarily have narrow touch targets; there is no hidden range or alternate navigation mode.
- **Sustain:** tap to latch the pedal or hold Space on a computer. Pedal-up releases sustained notes while preserving notes still held.
- **Labels:** off by default. Settings can show just the eight C-note octave markers, keeping the keyboard uncluttered.
- **Volume/ambience:** adjust the toolbar or Settings. The room effect is short and subtle; it is not a simulated string-resonance system.
- **Record/playback:** records MIDI-style pitch, onset, release, velocity, duration, timing, and sustain events. Playback uses the same acoustic sample engine. One take is stored locally; starting a new take replaces it. The existing saved-recording format is preserved. If browser storage is restricted, recording still works in memory.
- **Metronome:** 30–240 BPM, with an accent every four beats. It runs independently of piano voices and is not included in the recorded event sequence.
- **Recovery:** focus loss, page hiding, and app switching release notes and stop the active take/metronome. Safari audio suspension shows the start overlay again. Settings also has Release all notes.

Computer keys begin at **middle C, C4 / MIDI 60**:

| Note | C | C♯ | D | D♯ | E | F | F♯ | G | G♯ | A | A♯ | B | C | C♯ | D | D♯ | E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Key | A | W | S | E | D | F | T | G | Y | H | U | J | K | O | L | P | ; |

Tab to a piano key and hold Enter to play the focused key. Controls have accessible names and focus indicators; key animation respects reduced-motion preferences. Finger and computer-key velocity default to 0.75; pen pressure is used when available.

## Change the piano library

No additional files are needed for the bundled instrument. To replace it, edit **`assets/audio/piano/samples.json`** and place the recordings alongside that file. Playback logic is independent of the filenames and velocity-layer layout. See [the full sample mapping guide](assets/audio/piano/README.md) for all filenames and multi-layer examples.

## Project structure

```text
Piano/
├── index.html
├── css/
│   ├── style.css
│   ├── practice.css           # Score panel, compact controls, safe-area layout
│   └── keyboard.css
├── js/
│   ├── app.js                 # Controls, loading UI, lifecycle, metronome
│   ├── practice-layout.js     # Divider and persistent layout presets
│   ├── sheet-viewer.js        # Local file import, PDF rendering, gestures, storage
│   ├── notes.js               # Exact A0–C8 metadata and count assertions
│   ├── piano.js               # All 88 keys, fixed geometry and hit testing
│   ├── sample-library.js      # Mapping validation and velocity/pitch selection
│   ├── audio-engine.js        # AudioBuffer playback, loading, 128 voices, sustain
│   ├── touch-controller.js    # Independent fingers and shared-note ownership
│   └── recorder.js            # MIDI-style events, persistence and playback
├── assets/
│   ├── vendor/pdfjs/          # Pinned offline renderer and original licenses
│   ├── audio/piano/
│   │   ├── medium/            # 30 bundled acoustic WAV recordings
│   │   ├── samples.json       # Central library configuration
│   │   ├── provenance.json   # Hashes, source names, formats and durations
│   │   ├── ATTRIBUTION.md
│   │   ├── LICENSE-CC-BY-3.0.txt
│   │   ├── SOURCE-README.md
│   │   └── README.md
│   └── icons/
│       ├── icon.svg
│       ├── icon-192.png
│       ├── icon-512.png
│       └── apple-touch-icon.png
├── scripts/
│   ├── serve.js
│   ├── verify-browser.cjs
│   ├── verify-practice.cjs    # Score fixtures, gestures, persistence and offline tests
│   └── prepare-samples.py     # Developer-only lossless conversion utility
├── tests/core.test.js
├── manifest.json
├── service-worker.js
├── package.json
├── .gitignore
├── .nojekyll
├── VALIDATION.md
└── README.md
```

## Offline updates

The shell and recordings use separate caches. Audio is cached after successful decoding even on the first visit, before a service worker has taken control. Corrupt recordings are removed from the cache so retry can recover. Storage failures do not force synthesis or prevent online playback; offline availability still depends on successful browser storage and can be affected by eviction.

For a UI update, increment `SHELL_CACHE` in `service-worker.js`. For changed recording bytes under existing URLs, increment `SAMPLE_CACHE` in **both** `js/sample-library.js` and `service-worker.js`. Old sample caches can be removed through browser site-data controls when no longer needed. The updated worker activates after its complete shell is cached; reload to run the updated UI. No external fonts, runtime libraries, or sample servers are required by the deployed app.

## Verification

```sh
node --test tests/core.test.js
```

For browser integration, install Playwright as a development tool, run the local server, and execute:

```sh
npm install --no-save playwright pdf-lib sharp
node scripts/verify-browser.cjs
node scripts/verify-practice.cjs
```

The script uses installed Microsoft Edge by default; set `BROWSER_CHANNEL=chrome` for installed Chrome. The app itself does not require Playwright or Python. Reports and screenshots are written to ignored `test-results/`. See [VALIDATION.md](VALIDATION.md) for verified behavior and the remaining physical-iPad check.
