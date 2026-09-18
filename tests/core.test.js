import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTES, WHITE_NOTES, BLACK_NOTES, midiFromFilename } from '../js/notes.js';
import { KEY_GEOMETRY, hitTestPiano } from '../js/piano.js';
import { validateLibrary, selectSample } from '../js/sample-library.js';
import { NoteController, TouchController } from '../js/touch-controller.js';
import { Recorder } from '../js/recorder.js';
import { AudioEngine } from '../js/audio-engine.js';
import { readFile } from 'node:fs/promises';

test('88 consecutive piano notes span A0–C8 with 52 white and 36 black keys', () => {
  assert.equal(NOTES.length, 88); assert.equal(WHITE_NOTES.length, 52);
  assert.equal(NOTES[0].label, 'A0'); assert.equal(NOTES.at(-1).label, 'C8');
  NOTES.forEach((note, i) => assert.equal(note.midi, 21 + i));
  assert.equal(NOTES.find(n => n.midi === 69).frequency, 440);
  assert.deepEqual(NOTES.filter(n => n.octave === 4 && n.black).map(n => n.name), ['C#', 'D#', 'F#', 'G#', 'A#']);
});
test('exact beginning and ending of the standard 88-key instrument', () => {
  assert.equal(BLACK_NOTES.length, 36);
  assert.deepEqual(NOTES.slice(0, 16).map(n => n.label), ['A0','A#0','B0','C1','C#1','D1','D#1','E1','F1','F#1','G1','G#1','A1','A#1','B1','C2']);
  assert.deepEqual(NOTES.slice(-13).map(n => n.label), ['C7','C#7','D7','D#7','E7','F7','F#7','G7','G#7','A7','A#7','B7','C8']);
  assert.equal(NOTES.find(n => n.label === 'C4').midi, 60);
});
test('all 88 key geometries fit the full keyboard and black keys win overlapping hit tests', () => {
  for (const width of [350, 810, 968, 1110, 1300]) {
    const height = 320;
    for (const key of KEY_GEOMETRY) {
      assert.ok(key.left >= 0 && key.left + key.width <= 52);
      const x = (key.left + key.width / 2) / 52 * width;
      assert.equal(hitTestPiano(x, key.black ? 80 : 280, width, height), key.midi);
    }
    assert.equal(hitTestPiano(0, 280, width, height), 21);
    assert.equal(hitTestPiano(width - .01, 280, width, height), 108);
    assert.equal(hitTestPiano(width, 280, width, height), null);
    assert.equal(hitTestPiano(-1, 50, width, height), null);
    assert.equal(hitTestPiano(5, height, width, height), null);
  }
});
test('sample names resolve sharps and pitch boundaries correctly', () => {
  assert.equal(midiFromFilename('C4.mp3'), 60); assert.equal(midiFromFilename('Cs3.mp3'), 49);
  assert.equal(midiFromFilename('Bb4.wav'), 70); assert.equal(midiFromFilename('C8.mp3'), 108);
  assert.equal(midiFromFilename('../secret.mp3'), null); assert.equal(midiFromFilename('C9.mp3'), null);
});
test('independent fingers can hold chords, glide, and share a note without early release', () => {
  const log = [], controller = new NoteController({ onPress: n => log.push(['on', n]), onRelease: n => log.push(['off', n]) });
  controller.press('one', 60); controller.press('two', 64); controller.press('three', 60);
  controller.release('one'); assert.deepEqual(log, [['on', 60], ['on', 64]]);
  controller.press('two', 65); assert.deepEqual(log.slice(-2), [['off', 64], ['on', 65]]);
  controller.release('three'); assert.deepEqual(log.at(-1), ['off', 60]);
  controller.releaseAll(); assert.equal(controller.owners.size, 0); assert.equal(controller.pitches.size, 0);
});
test('pointer cancel and lost capture release only the affected finger', () => {
  const events = {}, log = [];
  const element = { addEventListener(type, callback) { events[type] = callback; }, setPointerCapture() {}, hasPointerCapture() { return false; } };
  const notes = new NoteController({ onPress: n => log.push(['on', n]), onRelease: n => log.push(['off', n]) });
  const touch = new TouchController(element, notes);
  touch.hit = x => x;
  const event = (pointerId, clientX) => ({ pointerId, clientX, clientY: 0, pointerType: 'touch', preventDefault() {} });
  events.pointerdown(event(1, 60)); events.pointerdown(event(2, 67));
  events.pointercancel(event(1, 60)); assert.equal(notes.pitches.has(67), true);
  events.lostpointercapture(event(2, 67)); assert.equal(notes.pitches.size, 0);
  events.pointerup(event(2, 67)); assert.deepEqual(log, [['on', 60], ['on', 67], ['off', 60], ['off', 67]]);
});
test('sustain retains released voices and pedal up damps only unheld notes', () => {
  const audio = new AudioEngine(), released = [];
  const a = { midi: 60, held: true }, b = { midi: 64, held: true };
  audio.voices = new Set([a, b]); audio.held = new Map([[60, a], [64, b]]);
  audio.releaseVoice = voice => released.push(voice.midi);
  audio.setSustain(true); audio.noteOff(60); assert.deepEqual(released, []);
  assert.equal(a.held, false); assert.equal(b.held, true);
  audio.setSustain(false); assert.deepEqual(released, [60]);
  audio.noteOff(64); assert.deepEqual(released, [60, 64]);
});
const memory = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; };
test('recordings store timing, duration and sustain, and close held notes on stop', () => {
  let now = 1000; const storage = memory();
  const recorder = new Recorder({ emit() {}, storage, now: () => now });
  recorder.start(true); now += 100; recorder.capture({ type: 'on', midi: 60, velocity: .75 });
  now += 400; recorder.stop();
  assert.equal(recorder.events[1].duration, 400); assert.equal(recorder.duration, 500);
  assert.deepEqual(recorder.events.at(-2), { type: 'off', midi: 60, time: 500 });
  assert.equal(recorder.events.at(-1).enabled, false);
  const restored = new Recorder({ emit() {}, storage });
  assert.deepEqual(restored.events, recorder.events);
  restored.clear(); assert.equal(restored.events.length, 0);
});
test('recording time limit closes notes without recursion', () => {
  let now = 0;
  const recorder = new Recorder({ emit() {}, storage: memory(), now: () => now });
  recorder.start(); recorder.capture({ type: 'on', midi: 60, velocity: .7 });
  now = 3600001; recorder.capture({ type: 'off', midi: 60 });
  assert.equal(recorder.recording, false); assert.equal(recorder.duration, 3600000);
  assert.equal(recorder.events.at(-1).type, 'off');
});
test('playback delivers captured notes and a cleanup event', async () => {
  const events = [];
  const recorder = new Recorder({ emit: event => events.push(event.type), storage: memory() });
  recorder.events = [{ type: 'on', midi: 60, velocity: .75, time: 0 }, { type: 'off', midi: 60, time: 10 }];
  recorder.duration = 15; recorder.play();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(events, ['on', 'off', 'reset']); assert.equal(recorder.playing, false);
});
test('invalid saved recordings do not load', () => {
  const storage = memory(); storage.setItem('atelier-recording-v1', JSON.stringify({ duration: 10, events: [{ type: 'on', time: 0, midi: 900, velocity: .7 }] }));
  assert.equal(new Recorder({ emit() {}, storage }).events.length, 0);
});
test('PWA manifest and service worker point only at real deployable files', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`../${icon.src}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
  const sw = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  const paths = [...sw.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]);
  for (const path of paths) await readFile(new URL(`../${path}`, import.meta.url));
});

const libraryConfig = JSON.parse(await readFile(new URL('../assets/audio/piano/samples.json', import.meta.url)));
test('30 acoustic source notes cover all 88 pitches with at most one semitone of transposition', () => {
  const library = validateLibrary(libraryConfig);
  assert.equal(library.layers.length, 1);
  assert.equal(library.layers[0].entries.length, 30);
  for (const note of NOTES) for (const velocity of [.1, .5, 1]) {
    const sample = selectSample(library, note.midi, velocity);
    assert.ok(sample && Math.abs(sample.midi - note.midi) <= 1);
  }
});
test('velocity layers select real source recordings at the correct boundaries', () => {
  const config = structuredClone(libraryConfig);
  config.layers = ['soft', 'medium', 'hard'].map((id, i) => ({ ...config.layers[0], id, minVelocity: i / 3, maxVelocity: (i + 1) / 3 }));
  const library = validateLibrary(config);
  assert.equal(selectSample(library, 60, .2).layer, 'soft');
  assert.equal(selectSample(library, 60, .6).layer, 'medium');
  assert.equal(selectSample(library, 60, 1).layer, 'hard');
  config.layers[1].minVelocity = .5;
  assert.throws(() => validateLibrary(config), /gaps or overlaps/);
});
test('incomplete sample libraries are rejected instead of stretching a sample or synthesizing missing notes', () => {
  const config = structuredClone(libraryConfig);
  config.layers[0].samples = { C4: 'medium/C4.wav' };
  assert.throws(() => validateLibrary(config), /Missing sample coverage/);
  config.layers[0].samples.C4 = '../C4.wav';
  assert.throws(() => validateLibrary(config), /Invalid sample mapping/);
});
test('every bundled recording is a full-length stereo 48 kHz, 24-bit PCM WAV with matching provenance', async () => {
  const { createHash } = await import('node:crypto');
  const provenance = JSON.parse(await readFile(new URL('../assets/audio/piano/provenance.json', import.meta.url)));
  assert.equal(provenance.length, 30);
  for (const entry of provenance) {
    const data = await readFile(new URL(`../assets/audio/piano/${entry.file}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    const format = data.indexOf(Buffer.from('fmt ')) + 8;
    assert.equal(data.readUInt16LE(format), 1);
    assert.equal(data.readUInt16LE(format + 2), 2);
    assert.equal(data.readUInt32LE(format + 4), 48000);
    assert.equal(data.readUInt16LE(format + 14), 24);
    assert.ok(entry.duration > 2);
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
  }
});
