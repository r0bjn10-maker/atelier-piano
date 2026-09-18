import { clamp } from './notes.js';

export class PracticeLayout {
  constructor(piano) {
    this.piano = piano;
    this.studio = document.querySelector('.studio');
    this.divider = document.getElementById('practice-divider');
    this.ratio = .4;
    try { const saved = Number(localStorage.getItem('atelier-practice-ratio')); if (saved) this.ratio = clamp(saved, .25, .55); } catch {}
    this.divider.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointer !== undefined) return;
      event.preventDefault(); this.pointer = event.pointerId; this.divider.setPointerCapture(event.pointerId);
    });
    this.divider.addEventListener('pointermove', event => {
      if (event.pointerId !== this.pointer) return;
      const rect = document.getElementById('sheet-panel').getBoundingClientRect();
      this.setRatio((event.clientY - rect.top) / this.usableHeight);
    });
    const end = event => { if (event.pointerId === this.pointer) this.pointer = undefined; };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.divider.addEventListener(name, end);
    this.divider.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      this.setRatio(event.key === 'Home' ? .4 : this.ratio + (event.key === 'ArrowUp' ? -.025 : .025));
    });
    document.querySelectorAll('[data-practice-ratio]').forEach(button => button.addEventListener('click', () => this.setRatio(Number(button.dataset.practiceRatio))));
    new ResizeObserver(() => this.resize()).observe(this.studio);
    const syncViewport = () => {
      const viewport = window.visualViewport;
      // CSS dvh handles browser chrome/rotation. Only override it for the software
      // keyboard: retaining a pixel height otherwise can lag WebKit orientation changes.
      if (!viewport || Math.abs(viewport.scale - 1) > .01 || !document.activeElement?.matches('input[type="number"], textarea')) {
        this.studio.style.removeProperty('--app-height');
        return;
      }
      this.studio.style.setProperty('--app-height', `${Math.round(Math.min(innerHeight, viewport.height))}px`);
    };
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.addEventListener('resize', syncViewport);
    window.addEventListener('pageshow', syncViewport);
    document.addEventListener('focusin', syncViewport);
    document.addEventListener('focusout', () => this.studio.style.removeProperty('--app-height'));
    syncViewport();
    this.resize();
  }
  setRatio(value) {
    this.ratio = clamp(value, .25, .55);
    try { localStorage.setItem('atelier-practice-ratio', String(this.ratio)); } catch {}
    this.resize();
  }
  resize() {
    const style = getComputedStyle(this.studio);
    this.usableHeight = this.studio.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const controls = innerWidth < 700 ? 92 : clamp(this.usableHeight * .08, 48, 64);
    const sheet = Math.round(clamp(this.usableHeight * this.ratio, 110, Math.max(110, this.usableHeight - controls - 150)));
    this.studio.style.setProperty('--sheet-height', `${sheet}px`);
    this.studio.style.setProperty('--controls-height', `${controls}px`);
    this.piano.resize(Math.max(65, this.usableHeight - sheet - controls - 36));
    this.divider.setAttribute('aria-valuenow', String(Math.round(this.ratio * 100)));
    this.divider.setAttribute('aria-valuetext', `${Math.round(this.ratio * 100)} percent sheet music`);
    document.querySelectorAll('[data-practice-ratio]').forEach(button => button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.practiceRatio) - this.ratio) < .01)));
  }
}
