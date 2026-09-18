import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { AudioEngine } from '../js/audio-engine.js';

test('Web Audio resume happens synchronously inside the tap call before awaiting', async () => {
  const audio = new AudioEngine();
  let resumed = false;
  audio.ready = true;
  audio.context = { state:'suspended', resume() { resumed = true; this.state = 'running'; return Promise.resolve(); } };
  const activation = audio.activate();
  assert.equal(resumed, true);
  await activation;
  assert.equal(audio.context.state, 'running');
});

test('all install paths resolve beneath a GitHub Pages repository, with correctly sized PNG icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
  const root = 'https://example.github.io/Piano/';
  for (const file of [manifest.id, manifest.scope, manifest.start_url, ...manifest.icons.map(icon=>icon.src)]) assert.ok(new URL(file, root).href.startsWith(root));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape');
  for (const [name,size] of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]) {
    const data = await readFile(new URL(`../assets/icons/${name}`, import.meta.url));
    assert.equal(data.readUInt32BE(16),size); assert.equal(data.readUInt32BE(20),size);
  }
  const files = JSON.parse(await readFile(new URL('../assets/vendor/pdfjs/cache-files.json', import.meta.url)));
  for (const file of files) { assert.ok(new URL(file,root).href.startsWith(root)); await readFile(new URL(`../${file}`,import.meta.url)); }
});

test('activating one repository only removes its own obsolete shell caches', async () => {
  const source = await readFile(new URL('../service-worker.js', import.meta.url),'utf8');
  const removed = [], events = {};
  const keys = ['atelier-piano-shell-%2FPiano%2F-v3.0', 'atelier-piano-shell-%2FPiano%2F-v3.1', 'atelier-piano-shell-%2FOther%2F-v3.0', 'atelier-piano-shell-v3.0.1', 'atelier-piano-samples-v2'];
  vm.runInNewContext(source, { URL, self:{ registration:{scope:'https://example.github.io/Piano/'}, addEventListener:(type,fn)=>events[type]=fn, clients:{claim:async()=>{}} }, caches:{keys:async()=>keys,delete:async key=>removed.push(key)} });
  let complete; events.activate({waitUntil:promise=>complete=promise}); await complete;
  assert.deepEqual(removed,['atelier-piano-shell-%2FPiano%2F-v3.0']);
});
