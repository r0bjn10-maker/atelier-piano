// Safari-engine smoke test against a repository subpath; physical iPad testing remains separate.
const { webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async()=>{
  const browser = await webkit.launch({headless:true});
  let page;
  const report=[],errors=[],failed=[];
  try {
    const context=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    await context.addInitScript(()=>localStorage.setItem('atelier-keyboard-view-v1',JSON.stringify({mode:'full',start:48})));
    await context.addInitScript(()=>{const Native=window.AudioContext||window.webkitAudioContext; if(Native) window.AudioContext=class extends Native {constructor(...args){super(...args);window.testAudio=this;}};});
    page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    await page.goto(process.env.TEST_URL || 'http://localhost:5174/Piano/');
    const supportsAudio=await page.evaluate(()=>!!(window.AudioContext||window.webkitAudioContext));
    if(supportsAudio) {
    await page.getByRole('button',{name:'Tap to Start Piano'}).click({timeout:90000});
    await page.waitForFunction(()=>!document.querySelector('#welcome').open);
    assert.equal(await page.evaluate(()=>window.testAudio.state),'running');
    assert.equal(await page.locator('.piano-key').count(),88);
    await page.locator('#record').click(); await page.keyboard.press('a'); await page.keyboard.press('d'); await page.locator('#record').click();
    await page.locator('#playback').click();
    await page.waitForFunction(()=>document.querySelector('#playback').getAttribute('aria-label')==='Play recording');
    await page.locator('#sustain').tap(); assert.equal(await page.locator('#sustain').getAttribute('aria-pressed'),'true');
    await page.locator('#metronome').tap(); assert.equal(await page.locator('#metronome').getAttribute('aria-pressed'),'true');
    await page.locator('#metronome').tap();
    report.push('First-tap Web Audio activation, 88 keys, sustain, metronome, recording and playback pass in WebKit.');
    } else {
      // Playwright's Windows WebKit port has no Web Audio implementation.
      // Dismiss only the loading gate in this test, without mocking any audio results.
      await page.locator('#keyboard .piano-key').first().waitFor({state:'attached'});
      await page.evaluate(()=>document.querySelector('#welcome').close());
      report.push('Windows WebKit has no Web Audio: audio/touch-piano checks are explicitly skipped here and covered by Chromium, not claimed as Safari-device validation.');
    }
    const choose=async file=>{const chooser=page.waitForEvent('filechooser'); await page.locator(await page.locator('#sheet-toolbar').isVisible()?'#replace-sheet':'#open-sheet').click(); await(await chooser).setFiles(path.resolve(file));};
    await choose('test-results/score.png'); await page.locator('#sheet-paper img').waitFor();
    await choose('test-results/practice-score.pdf'); await page.locator('#sheet-paper canvas').waitFor();
    await page.locator('#sheet-next').tap(); await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 2');
    await page.locator('#sheet-zoom-in').tap(); assert.equal(await page.locator('#sheet-zoom-value').textContent(),'125%');
    if(supportsAudio) assert.equal(await page.evaluate(()=>window.testAudio.state),'running');
    await page.screenshot({path:'test-results/ipad-webkit.png'});
    report.push('Native picker opens images and PDF under /Piano/; PDF worker, next page and zoom work.');
    for (const [width,height] of [[1024,768],[1180,820],[1366,1024],[834,1194]]) {
      await page.setViewportSize({width,height});
      await page.waitForFunction(()=>document.querySelector('#keyboard').getBoundingClientRect().bottom<=innerHeight,null,{timeout:5000});
      const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,vh:visualViewport.height,scale:visualViewport.scale,studio:document.querySelector('.studio').getBoundingClientRect().height,keyboard:document.querySelector('#keyboard').getBoundingClientRect().toJSON(),body:document.body.scrollHeight,scrollWidth:document.documentElement.scrollWidth,visible:[...document.querySelectorAll('.piano-key')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})}));
      assert.ok(geometry.visible && geometry.body<=geometry.height && geometry.scrollWidth<=geometry.width,JSON.stringify(geometry));
    }
    report.push('Four iPad landscape/portrait sizes fit all keys without page scrolling.');
    await page.setViewportSize({width:1194,height:834});
    await page.locator('#keyboard-mode').selectOption('2');
    assert.equal(await page.locator('.piano-key:visible').count(),25);
    assert.equal(await page.locator('.white-key:visible').count(),15);
    await page.locator('#keyboard-higher').tap();
    assert.equal(await page.locator('#keyboard-range').textContent(),'C4 – C6');
    await page.locator('#keyboard-mode').selectOption('3');
    assert.equal(await page.locator('.piano-key:visible').count(),37);
    await page.locator('#keyboard-mode').selectOption('full');
    assert.equal(await page.locator('.piano-key:visible').count(),88);
    await page.locator('#keyboard-mode').selectOption('two-rows');
    assert.equal(await page.locator('.white-key[data-row="0"]').count(),26);
    assert.equal(await page.locator('.white-key[data-row="1"]').count(),26);
    const rows=await page.locator('.white-key').evaluateAll(keys=>keys.map(k=>k.getBoundingClientRect()));
    assert.ok(rows.every(r=>r.width>0&&r.bottom<=834));
    await page.locator('#sheet-size-toggle').click();
    assert.equal(await page.locator('#sheet-size-toggle').getAttribute('aria-expanded'),'true');
    await page.locator('#sheet-size-toggle').click();
    await page.locator('#keyboard-mode').selectOption('full');
    report.push('All four keyboard modes, two balanced rows, sheet expansion and octave navigation pass in WebKit.');
    if(supportsAudio) await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('ready offline'),null,{timeout:60000});
    const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);
    assert.ok(scope.endsWith('/Piano/'));
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    let offlineReload=true;
    await context.setOffline(true);
    try { await page.reload(); }
    catch(error) {
      if(!error.message.includes('WebKit encountered an internal error')) throw error;
      offlineReload=false; await context.setOffline(false); await page.goto(process.env.TEST_URL || 'http://localhost:5174/Piano/');
      report.push('Windows WebKit returned an internal browser error for offline navigation; offline navigation is not validated by this port.');
    }
    if(supportsAudio) await page.getByRole('button',{name:'Tap to Start Piano'}).click({timeout:90000});
    else await page.evaluate(()=>document.querySelector('#welcome').close());
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 2');
    assert.equal(await page.locator('#sheet-zoom-value').textContent(),'125%');
    if(supportsAudio) assert.equal(await page.evaluate(()=>window.testAudio.state),'running');
    report.push(`Repository-scoped service worker and ${offlineReload?'offline':'online'} PDF, page and zoom restoration pass in WebKit.`);
    assert.deepEqual(errors,[]); assert.deepEqual(failed,[]);
    await fs.writeFile('test-results/webkit-report.json',JSON.stringify({report,errors,failed},null,2)); console.log(JSON.stringify({report,errors,failed},null,2));
  } catch(error) { console.log({errors,failed}); if(page) {console.log(await page.locator('#start-hint').textContent(),await page.locator('#sheet-message').textContent()); await page.screenshot({path:'test-results/webkit-failure.png'});} throw error; }
  finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
