import { clamp } from './notes.js';

export class PracticeLayout {
  constructor(piano) {
    this.piano = piano;
    this.studio = document.querySelector('.studio');
    this.divider = document.getElementById('practice-divider');
    this.ratio = .4;
    this.twoRowRatio = .2;
    piano.element.addEventListener('keyboardviewchange', () => this.resize());
    document.getElementById('sheet-size-toggle').addEventListener('click', () => this.setRatio(this.twoRowRatio > .25 ? .2 : .4));
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
      const ratio = this.piano.view.rows ? this.twoRowRatio : this.ratio;
      this.setRatio(event.key === 'Home' ? (this.piano.view.rows ? .2 : .4) : ratio + (event.key === 'ArrowUp' ? -.025 : .025));
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
    if (this.piano.view.rows) { this.twoRowRatio = clamp(value, .16, .4); this.resize(); return; }
    this.ratio = clamp(value, .25, .55);
    try { localStorage.setItem('atelier-practice-ratio', String(this.ratio)); } catch {}
    this.resize();
  }
  resize() {
    const style = getComputedStyle(this.studio);
    this.usableHeight = this.studio.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const twoRows = !!this.piano.view.rows;
    const ratio = twoRows ? this.twoRowRatio : this.ratio;
    const controls = innerWidth < 700 ? 92 : twoRows ? 48 : clamp(this.usableHeight * .08, 48, 64);
    const sheet = Math.round(clamp(this.usableHeight * ratio, twoRows ? 96 : 110, Math.max(110, this.usableHeight - controls - (twoRows ? 280 : 150))));
    this.studio.style.setProperty('--sheet-height', `${sheet}px`);
    this.studio.style.setProperty('--controls-height', `${controls}px`);
    this.piano.resize(Math.max(65, this.usableHeight - sheet - controls - 80));
    this.divider.setAttribute('aria-valuemin', twoRows ? '16' : '25');
    this.divider.setAttribute('aria-valuemax', twoRows ? '40' : '55');
    this.divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    this.divider.setAttribute('aria-valuetext', `${Math.round(ratio * 100)} percent sheet music`);
    const toggle = document.getElementById('sheet-size-toggle');
    toggle.textContent = this.twoRowRatio > .25 ? 'Collapse sheet' : 'Expand sheet';
    toggle.setAttribute('aria-expanded', String(this.twoRowRatio > .25));
    document.querySelectorAll('[data-practice-ratio]').forEach(button => button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.practiceRatio) - ratio) < .01)));
  }
}
