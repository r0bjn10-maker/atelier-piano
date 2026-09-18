import { noteForMidi, clamp } from './notes.js';
import { SAMPLE_MANIFEST_URL, SAMPLE_CACHE, validateLibrary, selectSample } from './sample-library.js';

export class AudioEngine {
  constructor() {
    this.context = null;
    this.voices = new Set();
    this.retiring = new Set();
    this.held = new Map();
    this.samples = new Map();
    this.sustain = false;
    this.volume = .72;
    this.ambience = .14;
    this.maxVoices = 128;
    this.ready = false;
    this.loadPromise = null;
  }
  ensureContext() {
    if (this.context) return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('This browser does not support Web Audio.');
    // Decoding is allowed before activation; Safari playback still resumes in a user gesture.
    this.context = new Context({ latencyHint: 'interactive' });
    const ctx = this.context;
    this.bus = ctx.createGain(); this.bus.gain.value = .65;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = .003;
    this.compressor.release.value = .2;
    this.reverb = ctx.createConvolver(); this.wet = ctx.createGain();
    this.wet.gain.value = this.ambience;
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.15), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      let filtered = 0;
      for (let i = 0; i < data.length; i++) {
        filtered = filtered * .55 + (Math.random() * 2 - 1) * .45;
        data[i] = filtered * (1 - i / data.length) ** 3 * .3;
      }
    }
    this.reverb.buffer = impulse;
    this.bus.connect(this.compressor);
    this.bus.connect(this.reverb);
    this.reverb.connect(this.wet).connect(this.compressor);
    this.compressor.connect(this.master).connect(ctx.destination);
  }
  async load(onProgress = () => {}) {
    if (this.ready) { onProgress({ loaded: this.samples.size, total: this.samples.size, percent: 100 }); return; }
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadLibrary(onProgress);
    try { await this.loadPromise; } finally { this.loadPromise = null; }
  }
  async loadLibrary(onProgress) {
    this.ensureContext();
    const result = await fetch(SAMPLE_MANIFEST_URL, { signal: AbortSignal.timeout(30000) });
    if (!result.ok) throw new Error('The piano sample configuration could not be loaded.');
    const library = validateLibrary(await result.json());
    const files = [...new Set(library.layers.flatMap(layer => layer.entries.map(entry => entry.file)))];
    const total = files.length;
    let completed = 0;
    const failures = [];
    let cache;
    this.offlineReady = true;
    try { if ('caches' in globalThis) cache = await caches.open(SAMPLE_CACHE); } catch {}
    if (!cache) this.offlineReady = false;
    onProgress({ loaded: 0, total, percent: 0 });
    const queue = [...files];
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift();
        try {
          if (!this.samples.has(file)) {
            const url = new URL(file, SAMPLE_MANIFEST_URL);
            const cached = cache && await cache.match(url);
            const response = cached || await fetch(url, { signal: AbortSignal.timeout(90000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const cacheCopy = !cached && cache ? response.clone() : null;
            const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
            if (!buffer.length || !buffer.numberOfChannels) throw new Error('Empty recording');
            if (cacheCopy) {
              try { await cache.put(url, cacheCopy); } catch { this.offlineReady = false; }
            }
            this.samples.set(file, buffer);
          }
        } catch {
          failures.push(file);
          // A corrupt response must not poison subsequent offline loads or retries.
          try { await cache?.delete(new URL(file, SAMPLE_MANIFEST_URL)); } catch {}
        }
        completed++;
        onProgress({ loaded: completed - failures.length, total, percent: Math.floor((completed - failures.length) / total * 100) });
      }
    };
    // Bound decode memory and network concurrency on iPad; retain successful buffers on retry.
    await Promise.all([worker(), worker(), worker()]);
    if (failures.length) {
      const error = new Error(`${failures.length} piano recording${failures.length === 1 ? '' : 's'} could not load. Check your connection and retry.`);
      error.files = failures; throw error;
    }
    this.library = library;
    this.ready = true;
  }
  async activate() {
    this.ensureContext();
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Tap again to enable sound.');
    if (!this.ready) throw new Error('Please wait for the piano recordings to finish loading.');
  }
  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .02);
  }
  setAmbience(value) {
    this.ambience = clamp(value, 0, .6);
    if (this.context) this.wet.gain.setTargetAtTime(this.ambience, this.context.currentTime, .08);
  }
  noteOn(midi, velocity = .75) {
    if (!this.ready || this.context?.state !== 'running' || !noteForMidi(midi)) return;
    const sample = selectSample(this.library, midi, velocity);
    const buffer = sample && this.samples.get(sample.file);
    // No synthesized substitute: production notes are exclusively recorded piano audio.
    if (!buffer) return;
    const existing = this.held.get(midi);
    if (existing) { existing.held = false; if (!this.sustain) this.releaseVoice(existing); }
    while (this.voices.size >= this.maxVoices) {
      const oldest = [...this.voices].find(voice => voice.released) || [...this.voices].find(voice => !voice.held) || this.voices.values().next().value;
      this.steal(oldest);
    }
    const ctx = this.context, now = ctx.currentTime;
    const gain = ctx.createGain();
    const level = Math.pow(clamp(velocity, .01, 1), .7) * sample.gain;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + .001);
    gain.connect(this.bus);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((midi - sample.midi) / 12);
    source.connect(gain);
    const voice = { midi, gain, source, sample, held: true, released: false };
    this.voices.add(voice); this.held.set(midi, voice);
    source.onended = () => this.dispose(voice);
    source.start(now);
    return voice;
  }
  noteOff(midi) {
    const voice = this.held.get(midi);
    if (!voice) return;
    this.held.delete(midi); voice.held = false;
    if (!this.sustain) this.releaseVoice(voice);
  }
  releaseVoice(voice) {
    if (voice.released || !this.voices.has(voice)) return;
    voice.released = true;
    const now = this.context.currentTime;
    const release = voice.midi >= 89 ? .7 : .18 + (89 - voice.midi) / 160;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, release / 4);
    voice.source.stop(now + release * 2);
  }
  setSustain(enabled) {
    this.sustain = enabled;
    if (!enabled) for (const voice of this.voices) if (!voice.held) this.releaseVoice(voice);
  }
  steal(voice) {
    this.voices.delete(voice);
    if (this.held.get(voice.midi) === voice) this.held.delete(voice.midi);
    this.retiring.add(voice);
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, .003);
    voice.source.stop(now + .02);
    // A bounded 20ms fade avoids clicks when voice stealing, even during stress input.
    if (this.retiring.size > 8) this.dispose(this.retiring.values().next().value);
  }
  dispose(voice) {
    const active = this.voices.delete(voice), retiring = this.retiring.delete(voice);
    if (!active && !retiring) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch {}
    voice.source.disconnect(); voice.gain.disconnect();
    if (this.held.get(voice.midi) === voice) this.held.delete(voice.midi);
  }
  panic() {
    for (const voice of [...this.voices, ...this.retiring]) this.dispose(voice);
    this.held.clear(); this.sustain = false;
  }
  click(time, accent = false) {
    if (!this.context || this.context.state !== 'running') return;
    // The metronome alone uses an oscillator; the piano never does.
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.frequency.value = accent ? 1300 : 950;
    gain.gain.setValueAtTime(.1, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .035);
    osc.connect(gain).connect(this.master);
    osc.start(time); osc.stop(time + .04);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
