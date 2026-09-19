import { clamp } from './notes.js';

const $ = id => document.getElementById(id);
const STATE_KEY = 'atelier-sheet-state-v1';
const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; } };
const fingerprint = file => `${file.name}:${file.size}:${file.lastModified || 0}`;

// Store a copy of the selected file, never a persistent handle to the user's file.
async function sheetStore(action, value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('atelier-sheet-music', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local storage is busy.'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('files', action === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('files');
      const request = action === 'put' ? store.put(value, 'last') : action === 'delete' ? store.delete('last') : store.get('last');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export class SheetViewer {
  constructor({ toast }) {
    this.toast = toast;
    this.viewport = $('sheet-viewport'); this.paper = $('sheet-paper');
    this.zoom = 1; this.pan = { x:0, y:0 }; this.page = 1;
    this.pointers = new Map(); this.generation = 0; this.renderGeneration = 0;
    this.storageQueue = Promise.resolve();
    this.edgeTurns = false;
    try { this.edgeTurns = localStorage.getItem('atelier-sheet-edge-turns') === 'true'; } catch {}
    $('edge-turns').checked = this.edgeTurns;
    $('edge-turns').addEventListener('change', event => {
      this.edgeTurns = event.target.checked;
      try { localStorage.setItem('atelier-sheet-edge-turns', String(this.edgeTurns)); } catch {}
    });
    for (const id of ['open-sheet', 'replace-sheet']) $(id).addEventListener('click', () => $('sheet-file').click());
    $('sheet-file').addEventListener('change', event => {
      const file = event.target.files[0]; event.target.value = '';
      if (file) this.open(file);
    });
    $('sheet-zoom-in').addEventListener('click', () => this.setZoom(this.zoom * 1.25));
    $('sheet-zoom-out').addEventListener('click', () => this.setZoom(this.zoom / 1.25));
    $('sheet-fit').addEventListener('click', () => this.fit());
    $('sheet-reset').addEventListener('click', () => { this.fit(); if (this.pdf && this.page !== 1) this.goTo(1); });
    $('sheet-prev').addEventListener('click', () => this.goTo(this.page - 1));
    $('sheet-next').addEventListener('click', () => this.goTo(this.page + 1));
    $('forget-sheet').addEventListener('click', () => this.forget());
    this.viewport.addEventListener('pointerdown', event => this.pointerDown(event));
    this.viewport.addEventListener('pointermove', event => this.pointerMove(event));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.viewport.addEventListener(type, event => this.pointerEnd(event));
    this.viewport.addEventListener('wheel', event => {
      if (!this.file) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) this.setZoom(this.zoom * Math.exp(-event.deltaY * .008), this.point(event));
      else if (this.zoom > 1) { this.pan.x -= event.deltaX; this.pan.y -= event.deltaY; this.draw(); this.save(); }
    }, { passive:false });
    this.viewport.addEventListener('keydown', event => {
      if (!this.file) return;
      const actions = { ArrowLeft:() => this.goTo(this.page - 1), ArrowRight:() => this.goTo(this.page + 1), '+':() => this.setZoom(this.zoom * 1.25), '-':() => this.setZoom(this.zoom / 1.25), '0':() => this.fit() };
      if (actions[event.key]) { event.preventDefault(); event.stopPropagation(); actions[event.key](); }
    });
    new ResizeObserver(() => { this.measure(); this.scheduleRender(); }).observe(this.viewport);
    this.restore();
  }
  message(text = '') { $('sheet-message').textContent = text; $('sheet-message').hidden = !text; }
  async restore() {
    const generation = this.generation;
    try {
      const stored = await sheetStore('get');
      if (this.generation !== generation) return;
      if (stored?.bytes || stored?.blob) await this.open(new File([stored.bytes || stored.blob], stored.name, { type:stored.type, lastModified:stored.lastModified }), true);
      else if (readState().name) this.message(`Reopen ${readState().name} to resume your place.`);
    } catch { if (this.generation === generation && readState().name) this.message('Reopen your sheet music to resume your place.'); }
  }
  async open(file, restoring = false) {
    const generation = ++this.generation;
    let candidatePDF, candidateURL, candidateTask;
    this.message('Opening sheet music…');
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      if (!['jpg','jpeg','png','webp','pdf'].includes(extension)) throw new Error('Choose a JPG, PNG, WEBP image or PDF.');
      const saved = readState(), resume = saved.id === fingerprint(file);
      let content, width, height, page = 1, pageProxy;
      if (extension === 'pdf') {
        const pdfjs = await import('../assets/vendor/pdfjs/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('../assets/vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
        const base = new URL('../assets/vendor/pdfjs/', import.meta.url).href;
        candidateTask = pdfjs.getDocument({ data:new Uint8Array(await file.arrayBuffer()), cMapUrl:base + 'cmaps/', cMapPacked:true, standardFontDataUrl:base + 'standard_fonts/', wasmUrl:base + 'wasm/', iccUrl:base + 'iccs/', isEvalSupported:false, enableXfa:false });
        candidatePDF = await candidateTask.promise;
        page = resume ? clamp(Math.round(Number(saved.page) || 1), 1, candidatePDF.numPages) : 1;
        pageProxy = await candidatePDF.getPage(page);
        const size = pageProxy.getViewport({ scale:1 }); width = size.width; height = size.height;
      } else {
        candidateURL = URL.createObjectURL(file); content = new Image(); content.alt = `Sheet music: ${file.name}`; content.draggable = false;
        content.src = candidateURL; await content.decode(); width = content.naturalWidth; height = content.naturalHeight;
      }
      if (generation !== this.generation) { candidateTask?.destroy().catch(() => {}); if (candidateURL) URL.revokeObjectURL(candidateURL); return; }
      this.disposeDocument(); this.pdf = candidatePDF; this.loadingTask = candidateTask; this.objectURL = candidateURL; this.file = file;
      this.page = page; this.pageProxy = pageProxy; this.width = width; this.height = height;
      this.zoom = resume ? clamp(Number(saved.zoom) || 1, 1, 5) : 1;
      this.pan = { x:0, y:0 }; this.paper.replaceChildren(...(content ? [content] : []));
      $('sheet-panel').classList.add('has-sheet'); $('sheet-empty').hidden = true; $('sheet-toolbar').hidden = false; this.paper.hidden = false;
      $('sheet-filename').textContent = file.name; $('sheet-filename').title = file.name;
      $('sheet-navigation').hidden = !this.pdf; $('forget-sheet').disabled = false;
      this.measure();
      if (resume) { this.pan = { x:(Number(saved.x) || 0) * this.fitWidth * this.zoom, y:(Number(saved.y) || 0) * this.fitHeight * this.zoom }; this.draw(); }
      this.updateControls();
      if (this.pdf) await this.render(); else this.message();
      if (generation !== this.generation) return;
      this.save();
      if (!restoring) this.queueStore('put', { blob:file, name:file.name, type:file.type, lastModified:file.lastModified });
    } catch (error) {
      console.warn('Sheet music could not be opened:', error);
      if (candidateTask !== this.loadingTask) candidateTask?.destroy().catch(() => {});
      if (candidateURL && candidateURL !== this.objectURL) URL.revokeObjectURL(candidateURL);
      if (generation !== this.generation) return;
      this.message(error.name === 'PasswordException' ? 'This PDF is password protected. Open an unlocked copy.' : error.message?.startsWith('Choose') ? error.message : 'This file could not be opened. Try another image or PDF.');
    }
  }
  queueStore(action, value) {
    this.storageQueue = this.storageQueue.catch(() => {}).then(async () => {
      // Raw bytes also work in WebKit ports that cannot clone File/Blob into IndexedDB.
      if (action === 'put') {
        const { blob, ...metadata } = value;
        value = { ...metadata, bytes:await blob.arrayBuffer() };
      }
      return sheetStore(action, value);
    }).catch(() => this.toast('Your score is open. Device storage is unavailable; reopen the file next time.'));
  }
  disposeDocument() {
    clearTimeout(this.renderTimer); this.renderGeneration++; this.renderTask?.cancel(); this.renderTask = null;
    this.loadingTask?.destroy().catch(() => {}); this.loadingTask = null; this.pdf = null; this.pageProxy = null;
    if (this.objectURL) URL.revokeObjectURL(this.objectURL); this.objectURL = null;
    this.pointers.clear(); this.gesture = null;
  }
  forget() {
    this.generation++; this.disposeDocument(); this.file = null; this.paper.replaceChildren(); this.paper.hidden = true;
    $('sheet-panel').classList.remove('has-sheet'); $('sheet-empty').hidden = false; $('sheet-toolbar').hidden = true; $('forget-sheet').disabled = true;
    this.message(); try { localStorage.removeItem(STATE_KEY); } catch {}
    this.queueStore('delete'); this.toast('Sheet music removed from this device.');
  }
  measure() {
    if (!this.file || !this.viewport.clientHeight) return;
    const oldWidth = this.fitWidth || 1, oldHeight = this.fitHeight || 1;
    this.fitScale = Math.min(Math.max(1, this.viewport.clientWidth - 24) / this.width, Math.max(1, this.viewport.clientHeight - 16) / this.height);
    this.fitWidth = this.width * this.fitScale; this.fitHeight = this.height * this.fitScale;
    this.pan.x *= this.fitWidth / oldWidth; this.pan.y *= this.fitHeight / oldHeight;
    this.paper.style.width = `${this.fitWidth}px`; this.paper.style.height = `${this.fitHeight}px`; this.draw();
  }
  draw() {
    const limitX = Math.max(0, (this.fitWidth * this.zoom - this.viewport.clientWidth) / 2 + 12);
    const limitY = Math.max(0, (this.fitHeight * this.zoom - this.viewport.clientHeight) / 2 + 8);
    this.pan.x = clamp(this.pan.x, -limitX, limitX); this.pan.y = clamp(this.pan.y, -limitY, limitY);
    this.paper.style.transform = `translate(calc(-50% + ${this.pan.x}px), calc(-50% + ${this.pan.y}px)) scale(${this.zoom})`;
    this.viewport.style.cursor = this.zoom > 1 ? 'grab' : 'default';
    this.updateControls();
  }
  updateControls() {
    $('sheet-zoom-in').disabled = this.zoom >= 5; $('sheet-zoom-out').disabled = this.zoom <= 1;
    $('sheet-fit').title = `Fit page · ${Math.round(this.zoom * 100)}%`;
    $('sheet-zoom-value').textContent = `${Math.round(this.zoom * 100)}%`;
    $('sheet-page-count').textContent = `Page ${this.page} / ${this.pdf?.numPages || 1}`;
    $('sheet-prev').disabled = !this.pdf || this.page <= 1;
    $('sheet-next').disabled = !this.pdf || this.page >= this.pdf.numPages;
  }
  save() {
    if (!this.file) return;
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ id:fingerprint(this.file), name:this.file.name, page:this.page, zoom:this.zoom, x:this.pan.x / (this.fitWidth * this.zoom), y:this.pan.y / (this.fitHeight * this.zoom) })); } catch {}
  }
  setZoom(value, anchor = { x:0, y:0 }) {
    if (!this.file) return;
    const zoom = clamp(value, 1, 5), factor = zoom / this.zoom;
    this.pan.x = anchor.x - (anchor.x - this.pan.x) * factor; this.pan.y = anchor.y - (anchor.y - this.pan.y) * factor;
    this.zoom = zoom; this.draw(); this.save(); this.scheduleRender();
  }
  fit() { this.zoom = 1; this.pan = { x:0, y:0 }; this.draw(); this.save(); this.scheduleRender(); }
  scheduleRender() {
    clearTimeout(this.renderTimer);
    if (this.pdf) this.renderTimer = setTimeout(() => this.render(), 220);
  }
  async goTo(page) {
    if (!this.pdf || page < 1 || page > this.pdf.numPages || page === this.page) return;
    const pdf = this.pdf, generation = this.generation;
    this.page = page; this.updateControls(); this.message('Turning page…');
    this.renderGeneration++; this.renderTask?.cancel(); clearTimeout(this.renderTimer);
    try {
      const proxy = await pdf.getPage(page);
      if (generation !== this.generation || this.page !== page) return;
      this.pageProxy?.cleanup(); this.pageProxy = proxy;
      const size = proxy.getViewport({ scale:1 }); this.width = size.width; this.height = size.height;
      this.zoom = 1; this.pan = { x:0, y:0 }; this.paper.replaceChildren(); this.measure(); this.save(); await this.render();
    } catch { if (generation === this.generation) this.message('This page could not be rendered. Try another page.'); }
  }
  async render() {
    if (!this.pdf || !this.pageProxy || this.pointers.size || !this.viewport.clientHeight) return;
    const generation = ++this.renderGeneration;
    this.renderTask?.cancel();
    // Cap the backing canvas at four million pixels; only one page is retained.
    const scale = Math.min(this.fitScale * this.zoom * Math.min(devicePixelRatio || 1, 2), Math.sqrt(4000000 / (this.width * this.height)), 4096 / Math.max(this.width, this.height));
    const viewport = this.pageProxy.getViewport({ scale });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.setAttribute('aria-label', `Sheet music page ${this.page}`); canvas.setAttribute('role', 'img');
    const task = this.pageProxy.render({ canvasContext:canvas.getContext('2d', { alpha:false }), viewport, background:'rgb(255,255,255)' });
    this.renderTask = task;
    // Let input and audio scheduling run between PDF.js drawing batches.
    task.onContinue = continueRendering => { setTimeout(() => { if (generation === this.renderGeneration) continueRendering(); }, 0); };
    try {
      await task.promise;
      if (generation !== this.renderGeneration) return;
      this.paper.replaceChildren(canvas); this.message();
    } catch (error) { if (generation === this.renderGeneration && error.name !== 'RenderingCancelledException') this.message('Unable to render this page. Try another PDF.'); }
    finally { if (this.renderTask === task) this.renderTask = null; }
  }
  point(event) { const rect = this.viewport.getBoundingClientRect(); return { x:event.clientX - rect.left - rect.width / 2, y:event.clientY - rect.top - rect.height / 2 }; }
  pointerDown(event) {
    if (!this.file || event.button !== 0) return;
    event.preventDefault(); this.viewport.setPointerCapture(event.pointerId);
    const point = this.point(event); this.pointers.set(event.pointerId, point);
    if (this.pointers.size === 1) this.gesture = { start:point, previous:point, time:performance.now(), moved:0, multiple:false };
    else { this.gesture.multiple = true; this.pinch = this.pinchState(); }
    clearTimeout(this.renderTimer);
  }
  pinchState() {
    const [a,b] = [...this.pointers.values()];
    return { distance:Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center:{ x:(a.x+b.x)/2, y:(a.y+b.y)/2 } };
  }
  pointerMove(event) {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault(); const point = this.point(event); this.pointers.set(event.pointerId, point);
    this.gesture.moved = Math.max(this.gesture.moved, Math.hypot(point.x - this.gesture.start.x, point.y - this.gesture.start.y));
    if (this.pointers.size >= 2) {
      const next = this.pinchState(), old = this.pinch;
      const zoom = clamp(this.zoom * next.distance / old.distance, 1, 5), factor = zoom / this.zoom;
      this.pan.x = next.center.x - (old.center.x - this.pan.x) * factor;
      this.pan.y = next.center.y - (old.center.y - this.pan.y) * factor;
      this.zoom = zoom; this.pinch = next;
    } else if (this.zoom > 1) {
      this.pan.x += point.x - this.gesture.previous.x; this.pan.y += point.y - this.gesture.previous.y;
    }
    this.gesture.previous = point; this.draw();
  }
  pointerEnd(event) {
    if (!this.pointers.has(event.pointerId)) return;
    const point = this.point(event), gesture = this.gesture;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size >= 2) this.pinch = this.pinchState();
    else if (this.pointers.size === 1) this.gesture.previous = [...this.pointers.values()][0];
    else {
      if (event.type === 'pointerup' && !gesture.multiple && this.zoom === 1 && this.pdf) {
        const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && performance.now() - gesture.time < 700) this.goTo(this.page + (dx < 0 ? 1 : -1));
        else if (this.edgeTurns && gesture.moved < 8 && Math.abs(point.x) > this.viewport.clientWidth * .35) this.goTo(this.page + (point.x > 0 ? 1 : -1));
      }
      this.gesture = null; this.save(); this.scheduleRender();
    }
  }
}
