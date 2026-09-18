import { NOTES, WHITE_NOTES } from './notes.js';

const BLACK_WIDTH = .61;
const BLACK_LENGTH = .63;
const BLACK_OFFSETS = { 1: -.045, 3: .045, 6: -.055, 8: 0, 10: .055 };

// Rendering and hit testing share geometry. Key travel never moves a touch target.
export function createKeyGeometry() {
  let whiteIndex = 0;
  return NOTES.map(note => {
    const left = note.black ? whiteIndex - BLACK_WIDTH / 2 + BLACK_OFFSETS[note.midi % 12] : whiteIndex++;
    return { ...note, left, width: note.black ? BLACK_WIDTH : 1 };
  });
}
export const KEY_GEOMETRY = createKeyGeometry();
const BLACK_GEOMETRY = KEY_GEOMETRY.filter(key => key.black);

export function hitTestPiano(x, y, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height || width <= 0 || height <= 0) return null;
  const position = x / (width / 52);
  if (y < height * BLACK_LENGTH) {
    const black = BLACK_GEOMETRY.find(key => position >= key.left && position < key.left + key.width);
    if (black) return black.midi;
  }
  return WHITE_NOTES[Math.floor(position)]?.midi ?? null;
}

export class Piano {
  constructor(element) {
    this.element = element;
    this.keyElements = new Map();
    this.render();
  }
  resize(height) { this.element.style.setProperty('--key-height', `${height}px`); }
  hit(x, y) {
    // One container measurement, no per-key layout reads or DOM changes on movement.
    const rect = this.element.getBoundingClientRect();
    return hitTestPiano(x - rect.left, y - rect.top, rect.width, rect.height);
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
  get computerBase() { return 60; }
}
