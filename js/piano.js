import { NOTES, clamp } from './notes.js';

const BLACK_WIDTH = .61;
const BLACK_LENGTH = .63;
const BLACK_OFFSETS = { 1: -.045, 3: .045, 6: -.055, 8: 0, 10: .055 };

// Rendering and hit testing share geometry. Key travel never moves a touch target.
export function createKeyGeometry(notes = NOTES) {
  let whiteIndex = 0;
  return notes.map(note => {
    const left = note.black ? whiteIndex - BLACK_WIDTH / 2 + BLACK_OFFSETS[note.midi % 12] : whiteIndex++;
    return { ...note, left, width: note.black ? BLACK_WIDTH : 1 };
  });
}
export const KEY_GEOMETRY = createKeyGeometry();
export function keyboardView(mode = 'full', start = 48) {
  mode = ['2', '3', 'full', 'two-rows'].includes(String(mode)) ? String(mode) : '2';
  const span = mode === '3' ? 36 : 24;
  start = Number.isFinite(Number(start)) ? Number(start) : 48;
  start = start <= 21 ? 21 : clamp(Math.round(start / 12) * 12, 24, 108 - span);
  const fullRange = mode === 'full' || mode === 'two-rows';
  const notes = fullRange ? NOTES : NOTES.filter(note => note.midi >= start && note.midi <= start + span);
  const geometry = createKeyGeometry(notes);
  const rows = mode === 'two-rows' ? [NOTES.filter(note => note.midi <= 64), NOTES.filter(note => note.midi >= 65)].map(notes => {
    const geometry = createKeyGeometry(notes);
    return { geometry, whites:geometry.filter(note => !note.black), blacks:geometry.filter(note => note.black) };
  }) : null;
  return { mode, start, first:notes[0], last:notes.at(-1), geometry, rows,
    whites:geometry.filter(note => !note.black), blacks:geometry.filter(note => note.black),
    canLower:!fullRange && start > 21, canHigher:!fullRange && start + span < 108 };
}
const FULL_VIEW = keyboardView('full');

export function hitTestPiano(x, y, width, height, view = FULL_VIEW) {
  if (x < 0 || x >= width || y < 0 || y >= height || width <= 0 || height <= 0) return null;
  if (view.rows) {
    const rowHeight = (height - 18) / 2;
    if (y < rowHeight) return hitTestPiano(x, y, width, rowHeight, view.rows[0]);
    if (y < rowHeight + 18) return null;
    return hitTestPiano(x, y - rowHeight - 18, width, rowHeight, view.rows[1]);
  }
  const position = x / (width / view.whites.length);
  if (y < height * BLACK_LENGTH) {
    const black = view.blacks.find(key => position >= key.left && position < key.left + key.width);
    if (black) return black.midi;
  }
  return view.whites[Math.floor(position)]?.midi ?? null;
}

export class Piano {
  constructor(element) {
    this.element = element;
    this.keyElements = new Map();
    this.render();
    this.setView('full');
  }
  resize(height) { this.element.style.setProperty('--key-height', `${height}px`); }
  hit(x, y) {
    // One container measurement, no per-key layout reads or DOM changes on movement.
    const rect = this.element.getBoundingClientRect();
    return hitTestPiano(x - rect.left, y - rect.top, rect.width, rect.height, this.view);
  }
  setView(mode, start = 48) {
    this.view = keyboardView(mode, start);
    const { whites, first, last, geometry } = this.view;
    this.element.dataset.mode = this.view.mode;
    this.element.setAttribute('aria-label', `Piano keyboard, ${first.label} to ${last.label}, ${geometry.length} visible keys`);
    this.element.style.setProperty('--white-width', `${100 / whites.length}%`);
    for (const [midi, key] of this.keyElements) key.hidden = midi < first.midi || midi > last.midi;
    for (const key of this.keyElements.values()) { key.style.top = ''; key.style.height = ''; delete key.dataset.row; }
    for (const note of geometry) {
      const key = this.keyElements.get(note.midi);
      key.style.left = `${note.left / whites.length * 100}%`;
      key.style.width = `${note.width / whites.length * 100}%`;
    }
    if (this.view.rows) {
      this.element.style.setProperty('--white-width', `${100 / 26}%`);
      this.view.rows.forEach((row, index) => row.geometry.forEach(note => {
        const key = this.keyElements.get(note.midi);
        key.dataset.row = String(index);
        key.style.left = `${note.left / 26 * 100}%`;
        key.style.width = `${note.width / 26 * 100}%`;
        key.style.top = index ? 'calc((var(--key-height) + 18px) / 2)' : '0px';
        key.style.height = note.black ? 'calc((var(--key-height) - 18px) * .315)' : 'calc((var(--key-height) - 18px) / 2 - 4px)';
      }));
      this.element.setAttribute('aria-label', '88-key piano in two rows: top A0 to E4; bottom F4 to C8');
    }
    this.element.dispatchEvent(new Event('keyboardviewchange'));
    return this.view;
  }
  shift(direction) {
    const start = this.view.start;
    return this.setView(this.view.mode, direction > 0 ? (start === 21 ? 24 : start + 12) : (start === 24 ? 21 : start - 12));
  }
  render() {
    const fragment = document.createDocumentFragment();
    this.element.style.setProperty('--white-width', `${100 / 52}%`);
    for (const note of KEY_GEOMETRY) {
      const key = document.createElement('button');
      key.className = `piano-key ${note.black ? 'black-key' : 'white-key'}`;
      key.dataset.midi = note.midi;
      key.dataset.note = note.label;
      key.setAttribute('aria-label', `${note.name.replace('#', ' sharp ')} ${note.octave}`);
      key.setAttribute('aria-pressed', 'false');
      key.style.left = `${note.left / 52 * 100}%`;
      key.style.width = `${note.width / 52 * 100}%`;
      if (note.name === 'C') {
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = note.label;
        key.append(label);
      }
      fragment.append(key);
      this.keyElements.set(note.midi, key);
    }
    this.element.replaceChildren(fragment);
  }
  setPressed(midi, pressed) {
    const key = this.keyElements.get(midi);
    key?.classList.toggle('pressed', pressed);
    key?.setAttribute('aria-pressed', String(pressed));
  }
  get computerBase() { return ['full', 'two-rows'].includes(this.view.mode) ? 60 : this.view.first.midi; }
}
