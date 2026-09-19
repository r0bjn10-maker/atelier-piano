// Version shell and recordings separately so a UI update need not download 122 MB again.
// CacheStorage is shared by every repository on USERNAME.github.io.
const SHELL_PREFIX = `atelier-piano-shell-${encodeURIComponent(new URL(self.registration.scope).pathname)}-`;
const SHELL_CACHE = `${SHELL_PREFIX}v3.3`;
const SAMPLE_CACHE = 'atelier-piano-samples-v2';
const SHELL = [
  './', './index.html', './css/practice.css', './js/sheet-viewer.js', './js/practice-layout.js', './assets/vendor/pdfjs/cache-files.json', './css/style.css', './css/keyboard.css',
  './js/app.js', './js/notes.js', './js/piano.js', './js/audio-engine.js',
  './js/sample-library.js', './js/touch-controller.js', './js/recorder.js', './manifest.json',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png', './assets/audio/piano/samples.json',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
    const response = await fetch('./assets/vendor/pdfjs/cache-files.json');
    if (!response.ok) throw new Error('PDF dependency list unavailable');
    const dependencies = await response.json();
    const files = [...new Set([...SHELL, ...dependencies])];
    // Bound concurrent fetches alongside the large piano sample downloads on iPad.
    for (let index = 0; index < files.length; index += 8) await cache.addAll(files.slice(index, index + 8));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith(SHELL_PREFIX) && key !== SHELL_CACHE
  ).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname) || request.headers.has('range')) return;
  event.respondWith((async () => {
    const isSample = /\.(wav|mp3|m4a|ogg|flac)$/.test(url.pathname);
    const cache = await caches.open(isSample ? SAMPLE_CACHE : SHELL_CACHE);
    if (url.pathname.endsWith('/samples.json')) {
      try {
        const result = await fetch(request);
        if (result.ok) { await cache.put(request, result.clone()); return result; }
      } catch {}
      return (await cache.match(request)) || Response.error();
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const result = await fetch(request);
      if (isSample && result.ok) {
        try { await cache.put(request, result.clone()); } catch { /* Playback remains available if storage is full. */ }
      }
      return result;
    } catch {
      if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
