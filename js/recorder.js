const STORAGE_KEY = 'atelier-recording-v1';
export class Recorder {
  constructor({ emit, onChange = () => {}, storage = globalThis.localStorage, now = () => performance.now() }) {
    this.emit = emit; this.onChange = onChange; this.storage = storage; this.now = now;
    this.events = []; this.duration = 0; this.recording = false; this.playing = false;
    this.timers = []; this.active = new Map(); this.sustained = false;
    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY));
      if (saved && Number.isFinite(saved.duration) && saved.duration >= 0 && saved.duration <= 3600000 && Array.isArray(saved.events) && saved.events.length <= 100000 && saved.events.every(event => this.validEvent(event, saved.duration))) {
        this.events = saved.events.sort((a, b) => a.time - b.time); this.duration = saved.duration;
      }
    } catch { /* Private browsing and unavailable storage still support in-memory takes. */ }
  }
  validEvent(event, duration) {
    return event && ['on', 'off', 'sustain'].includes(event.type) && Number.isFinite(event.time) && event.time >= 0 && event.time <= duration && (event.type === 'sustain' ? typeof event.enabled === 'boolean' : Number.isInteger(event.midi) && event.midi >= 21 && event.midi <= 108 && (event.type !== 'on' || Number.isFinite(event.velocity) && event.velocity > 0 && event.velocity <= 1));
  }
  start(sustain = false) {
    this.stopPlayback();
    this.events = []; this.duration = 0; this.active.clear(); this.sustained = false;
    this.started = this.now(); this.recording = true;
    if (sustain) this.capture({ type: 'sustain', enabled: true });
    this.onChange();
  }
  capture(event) {
    if (!this.recording) return;
    const time = Math.max(0, this.now() - this.started);
    if (time > 3600000 || this.events.length >= 99900) { this.stop(); return; }
    const entry = { ...event, time };
    if (event.type === 'on') this.active.set(event.midi, entry);
    if (event.type === 'off') {
      const start = this.active.get(event.midi);
      if (start) start.duration = time - start.time;
      this.active.delete(event.midi);
    }
    if (event.type === 'sustain') this.sustained = event.enabled;
    this.events.push(entry);
  }
  stop() {
    if (!this.recording) return;
    this.duration = Math.min(3600000, Math.max(0, this.now() - this.started));
    for (const [midi, start] of this.active) {
      start.duration = Math.max(0, this.duration - start.time);
      this.events.push({ type: 'off', midi, time: this.duration });
    }
    this.active.clear();
    if (this.sustained) this.events.push({ type: 'sustain', enabled: false, time: this.duration });
    this.sustained = false;
    this.recording = false;
    // A performance with no notes is not a playable take.
    if (!this.events.some(event => event.type === 'on')) { this.events = []; this.duration = 0; }
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify({ events: this.events, duration: this.duration })); } catch {}
    this.onChange();
  }
  play() {
    if (this.recording || this.playing || !this.events.length) return;
    this.playing = true; this.playStarted = this.now(); this.nextEvent = 0;
    // A bounded queue avoids thousands of long-lived timers for lengthy takes.
    const tick = () => {
      if (!this.playing) return;
      const elapsed = this.now() - this.playStarted;
      while (this.nextEvent < this.events.length && this.events[this.nextEvent].time <= elapsed) this.emit(this.events[this.nextEvent++]);
      if (elapsed >= this.duration) this.stopPlayback();
      else this.timers = [setTimeout(tick, 4)];
    };
    this.onChange(); tick();
  }
  stopPlayback() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    if (this.playing) {
      this.playing = false;
      this.emit({ type: 'reset' });
      this.onChange();
    }
  }
  clear() {
    this.stopPlayback(); this.events = []; this.duration = 0;
    try { this.storage.removeItem(STORAGE_KEY); } catch {}
    this.onChange();
  }
  get elapsed() { return this.recording ? this.now() - this.started : this.playing ? this.now() - this.playStarted : this.duration; }
}
