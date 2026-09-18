// Optional: install Playwright, start scripts/serve.js, then run this integration suite.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const url = process.env.TEST_URL || 'http://localhost:5173';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startPiano(page) {
  await page.getByRole('button', { name: 'Tap to Start Piano' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Tap to Start Piano' }).click();
  await page.waitForFunction(() => !document.querySelector('#welcome').open);
}
async function checkFullKeyboard(page) {
  const geometry = await page.evaluate(() => {
    const keys = [...document.querySelectorAll('.piano-key')];
    const keyboard = document.querySelector('#keyboard').getBoundingClientRect();
    return {
      count: keys.length, white: keys.filter(e => e.classList.contains('white-key')).length,
      black: keys.filter(e => e.classList.contains('black-key')).length,
      first: keys[0].dataset.note, last: keys.at(-1).dataset.note,
      allVisible: keys.every(key => { const r = key.getBoundingClientRect(); return r.width > 0 && r.x >= keyboard.x - 1 && r.right <= keyboard.right + 1; }),
      width: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight,
      body: document.body.scrollHeight, keyHeight: keyboard.height,
      keyboardWidth: keyboard.width, whiteWidth: keys[0].getBoundingClientRect().width,
      removedControls: document.querySelectorAll('#overview, #range-window, #octave-up, #octave-down, #center-keyboard, #keyboard-size').length,
    };
  });
  assert.equal(geometry.count, 88); assert.equal(geometry.white, 52); assert.equal(geometry.black, 36);
  assert.equal(geometry.first, 'A0'); assert.equal(geometry.last, 'C8');
  assert.equal(geometry.allVisible, true); assert.equal(geometry.removedControls, 0);
  assert.ok(Math.abs(geometry.whiteWidth - geometry.keyboardWidth / 52) < .1);
  assert.ok(geometry.scroll <= geometry.width, JSON.stringify(geometry));
  assert.ok(geometry.body <= geometry.height, JSON.stringify(geometry));
  return geometry;
}

(async () => {
  await mkdir('test-results', { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const report = [], errors = [], failed = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await checkFullKeyboard(page);
    assert.equal(await page.locator('#start-piano').isDisabled(), true);
    await page.keyboard.press('a'); assert.equal(await page.locator('.pressed').count(), 0);
    await page.screenshot({ path: 'test-results/loading-ipad.png' });
    await page.getByRole('button', { name: 'Tap to Start Piano' }).waitFor({ timeout: 60000 });
    assert.equal(await page.locator('#sample-progress').getAttribute('value'), '100');
    assert.equal(await page.locator('#loading-count').textContent(), '30 of 30 recordings ready');
    await page.screenshot({ path: 'test-results/welcome-ipad.png' });
    await startPiano(page);
    assert.equal(await page.locator('#keyboard').evaluate(e => e.classList.contains('show-labels')), false);
    await page.screenshot({ path: 'test-results/piano-ipad.png' });
    report.push('Initial load blocks playback until all 30 real piano recordings decode; progress reaches 100%');
    report.push('iPad landscape: all 88 keys (52 white / 36 black), A0–C8, no range UI, exact width / 52 sizing');

    const points = await page.locator('.white-key').evaluateAll(keys => keys.slice(0, 10).map((key, i) => {
      const rect = key.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height * .85, id: i + 1 };
    }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    assert.equal(await page.locator('.pressed').count(), 10);
    await page.screenshot({ path: 'test-results/chord-ipad.png' });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [points[0]] });
    assert.equal(await page.locator('.pressed').count(), 9);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await page.locator('.pressed').count(), 0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...points[1], id: 1 }] });
    assert.equal(await page.locator('[data-midi="21"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-midi="23"]').getAttribute('aria-pressed'), 'true');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Hit every key at its actual visual center (white keys below the black-key overlap).
    const targets = await page.locator('.piano-key').evaluateAll(keys => keys.map(key => {
      const r = key.getBoundingClientRect(); return { midi: Number(key.dataset.midi), x: r.x + r.width / 2, y: r.y + r.height * (key.classList.contains('black-key') ? .4 : .85), id: 1 };
    }));
    for (const target of targets) {
      const { midi, ...point } = target;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      assert.equal(await page.locator('.pressed').count(), 1);
      assert.equal(await page.locator(`[data-midi="${midi}"]`).getAttribute('aria-pressed'), 'true');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    report.push('Native browser input: ten-touch chord, independent release/cancel, glissando, and accurate hits on all 88 keys');

    await page.locator('#sustain').click(); assert.equal(await page.locator('#sustain').getAttribute('aria-pressed'), 'true');
    await page.locator('#sustain').click();
    await page.locator('#record').click();
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.keyboard.down('a'); await page.keyboard.down('d'); await page.keyboard.down('g');
    assert.equal(await page.locator('.pressed').count(), 3);
    await delay(200);
    await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('g');
    for (let i = 0; i < 8; i++) await page.keyboard.press('a');
    await page.locator('#record').click();
    const take = await page.evaluate(() => JSON.parse(localStorage.getItem('atelier-recording-v1')));
    assert.equal(take.events.filter(e => e.type === 'on').length, 11);
    assert.deepEqual(take.events.filter(e => e.type === 'on').slice(0, 3).map(e => e.midi), [60, 64, 67]);
    assert.ok(take.events.filter(e => e.type === 'on').every(e => e.duration > 0));
    await page.locator('#playback').click(); await delay(take.duration + 150);
    assert.equal(await page.locator('.pressed').count(), 0);
    assert.equal(await page.locator('#playback').getAttribute('aria-label'), 'Play recording');
    report.push('Middle-C computer mapping, rapid repeated notes, recorded note events/durations and clean playback');

    await page.locator('#settings-toggle').click(); await page.locator('#note-labels').check();
    assert.equal(await page.locator('.key-label').count(), 8);
    assert.equal(await page.locator('.black-key .key-label').count(), 0);
    await page.screenshot({ path: 'test-results/settings-ipad.png' });
    await page.locator('#note-labels').uncheck(); await page.locator('#settings-close').click();
    await page.locator('#metronome').click(); assert.equal(await page.locator('#metronome').getAttribute('aria-pressed'), 'true');
    await page.locator('#tempo').fill('120'); await page.locator('#tempo').press('Tab'); await page.locator('#metronome').click();
    await page.locator('#fullscreen').click(); assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
    await page.locator('#fullscreen').click(); assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    report.push('C-only optional labels, sustain control, metronome, tempo and fullscreen preserved');

    const sound = await page.evaluate(async () => {
      const { AudioEngine } = await import('./js/audio-engine.js');
      const engine = new AudioEngine(); await engine.load(); await engine.activate();
      let oscillators = 0;
      const oscillator = engine.context.createOscillator.bind(engine.context);
      engine.context.createOscillator = () => { oscillators++; return oscillator(); };
      const analyser = engine.context.createAnalyser(); engine.master.connect(analyser);
      analyser.fftSize = 2048; const data = new Float32Array(2048);
      const chord = [60, 64, 67].map(midi => engine.noteOn(midi));
      await new Promise(resolve => setTimeout(resolve, 100)); analyser.getFloatTimeDomainData(data);
      const peak = Math.max(...data.map(Math.abs));
      const sampled = chord.every(voice => voice.source instanceof AudioBufferSourceNode && voice.source.buffer.numberOfChannels === 2);
      engine.setSustain(true); [60, 64, 67].forEach(midi => engine.noteOff(midi));
      const sustained = [...engine.voices].every(voice => !voice.held && !voice.released);
      const held = engine.noteOn(72); engine.setSustain(false);
      const releaseCorrect = chord.every(voice => voice.released) && held.held && !held.released;
      await new Promise(resolve => setTimeout(resolve, 1550));
      const remaining = engine.voices.size; engine.panic();
      engine.setSustain(true);
      for (let i = 0; i < 20; i++) { engine.noteOn(60); engine.noteOff(60); }
      const repeatedTails = engine.voices.size; engine.panic(); engine.setSustain(true);
      for (let i = 0; i < 400; i++) { const midi = 21 + i % 88; engine.noteOn(midi); engine.noteOff(midi); }
      const polyphony = engine.voices.size, retiring = engine.retiring.size;
      engine.setSustain(false); await new Promise(resolve => setTimeout(resolve, 1650));
      const cleaned = engine.voices.size === 0 && engine.retiring.size === 0;
      const samples = engine.samples.size, decodedMB = [...engine.samples.values()].reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0) / 1e6;
      await engine.context.close();
      return { peak, sampled, sustained, releaseCorrect, remaining, repeatedTails, polyphony, retiring, cleaned, samples, decodedMB, oscillators };
    });
    assert.ok(sound.peak > .001 && sound.peak < 1); assert.equal(sound.samples, 30);
    assert.ok(sound.sampled && sound.sustained && sound.releaseCorrect && sound.cleaned);
    assert.equal(sound.remaining, 1); assert.equal(sound.repeatedTails, 20); assert.equal(sound.polyphony, 128);
    assert.ok(sound.retiring <= 8); assert.equal(sound.oscillators, 0);
    report.push('Real stereo AudioBuffer sources only: no piano oscillators, natural tails, 128 voices, bounded stealing and complete cleanup');

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const cached = await page.evaluate(async () => (await (await caches.open('atelier-piano-samples-v2')).keys()).length);
    assert.equal(cached, 30);
    await context.setOffline(true); await page.reload(); await startPiano(page);
    await checkFullKeyboard(page);
    assert.equal(await page.locator('#loading-count').textContent(), '30 of 30 recordings ready');
    assert.equal(await page.locator('#playback').isEnabled(), true);
    await context.setOffline(false);
    report.push('First-visit sample cache contains all 30 recordings; full offline reload and acoustic activation pass');

    await page.evaluate(() => { window.keyBeforeResize = document.querySelector('[data-midi="60"]'); });
    for (const [name, width, height] of [['ipad-small', 1024, 768], ['ipad-large', 1366, 1024], ['ipad-portrait', 834, 1194], ['phone-portrait', 390, 844], ['phone-landscape', 844, 390], ['desktop', 1440, 900]]) {
      await page.setViewportSize({ width, height }); await delay(150);
      const geometry = await checkFullKeyboard(page);
      assert.equal(await page.evaluate(() => window.keyBeforeResize === document.querySelector('[data-midi="60"]')), true);
      await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
      report.push(`${name}: ${width}×${height}, all 88 keys visible, ${geometry.keyHeight}px tall; no scrolling or DOM rebuild`);
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await context.close();

    const failureContext = await browser.newContext({ serviceWorkers: 'block' });
    const failurePage = await failureContext.newPage();
    let corrupt = true;
    await failurePage.route('**/medium/C4.wav', route => corrupt ? route.fulfill({ contentType: 'audio/wav', body: 'invalid WAV' }) : route.continue());
    await failurePage.goto(url);
    await failurePage.getByRole('button', { name: 'Retry loading recordings' }).waitFor({ timeout: 60000 });
    assert.equal(await failurePage.locator('#welcome').evaluate(e => e.open), true);
    assert.ok((await failurePage.locator('#start-hint').textContent()).includes('1 piano recording'));
    await failurePage.keyboard.press('a'); assert.equal(await failurePage.locator('.pressed').count(), 0);
    corrupt = false;
    await failurePage.getByRole('button', { name: 'Retry loading recordings' }).click();
    await startPiano(failurePage);
    assert.equal(await failurePage.locator('#loading-count').textContent(), '30 of 30 recordings ready');
    await failureContext.close();
    report.push('Corrupt/missing required buffer blocks the instrument; retry recovers without a synthesized fallback');
    await writeFile('test-results/browser-report.json', JSON.stringify({ passed: true, checks: report, audio: sound }, null, 2));
    console.log(report.join('\n')); console.log(JSON.stringify(sound));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
