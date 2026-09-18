// One owner per finger or physical keyboard key; a pitch releases only after its last owner.
export class NoteController {
  constructor({ onPress, onRelease }) {
    this.owners = new Map();
    this.pitches = new Map();
    this.onPress = onPress;
    this.onRelease = onRelease;
  }
  press(owner, midi, velocity = 0.75) {
    if (this.owners.get(owner) === midi) return;
    this.release(owner);
    this.owners.set(owner, midi);
    const count = this.pitches.get(midi) || 0;
    this.pitches.set(midi, count + 1);
    if (!count) this.onPress(midi, velocity);
  }
  release(owner) {
    if (!this.owners.has(owner)) return;
    const midi = this.owners.get(owner);
    this.owners.delete(owner);
    const count = this.pitches.get(midi) - 1;
    if (count > 0) this.pitches.set(midi, count);
    else { this.pitches.delete(midi); this.onRelease(midi); }
  }
  releaseAll() { for (const owner of [...this.owners.keys()]) this.release(owner); }
}

export class TouchController {
  constructor(element, notes, { enabled = () => true, hitTest } = {}) {
    this.element = element;
    this.notes = notes;
    this.enabled = enabled;
    this.hitTest = hitTest;
    this.pointers = new Set();
    element.addEventListener('pointerdown', event => this.down(event));
    element.addEventListener('pointermove', event => this.move(event));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, event => this.end(event));
    }
    element.addEventListener('contextmenu', event => event.preventDefault());
  }
  hit(x, y) {
    if (this.hitTest) return this.hitTest(x, y);
    const key = document.elementFromPoint(x, y)?.closest('[data-midi]');
    return key && this.element.contains(key) ? Number(key.dataset.midi) : null;
  }
  down(event) {
    if (!this.enabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const midi = this.hit(event.clientX, event.clientY);
    if (midi === null) return;
    this.element.setPointerCapture(event.pointerId);
    this.pointers.add(event.pointerId);
    // iPad touch pressure is not reliable. Keep finger dynamics consistent.
    this.notes.press(`pointer:${event.pointerId}`, midi, event.pointerType === 'pen' ? Math.max(.25, event.pressure) : .75);
  }
  move(event) {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    const midi = this.hit(event.clientX, event.clientY);
    if (midi === null) this.notes.release(`pointer:${event.pointerId}`);
    else this.notes.press(`pointer:${event.pointerId}`, midi);
  }
  end(event) {
    this.notes.release(`pointer:${event.pointerId}`);
    this.pointers.delete(event.pointerId);
  }
  cancelAll() {
    for (const id of this.pointers) {
      this.notes.release(`pointer:${id}`);
      if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
    }
    this.pointers.clear();
  }
}
