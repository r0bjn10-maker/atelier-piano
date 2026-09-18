// Development-only integration suite. Requires Playwright, pdf-lib and sharp.
const { chromium } = require('playwright');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = process.env.TEST_URL || 'http://localhost:5173';

async function fixtures() {
  await fs.mkdir('test-results', { recursive:true });
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.TimesRoman);
  for (let pageNo = 1; pageNo <= 3; pageNo++) {
    const page = pdf.addPage([842,595]);
    page.drawText('ATELIER', { x:55,y:547,size:12,font,color:rgb(.4,.35,.25) });
    page.drawText('An afternoon at the piano', { x:55,y:512,size:26,font });
    page.drawText(`Practice study — ${pageNo}`, { x:55,y:488,size:11,font });
    for (let system = 0; system < 3; system++) {
      const top = 430 - system * 130;
      for (let staff = 0; staff < 2; staff++) {
        for (let line = 0; line < 5; line++) page.drawLine({ start:{x:55,y:top-staff*52-line*7},end:{x:787,y:top-staff*52-line*7},thickness:.5 });
        for (let bar = 0; bar <= 4; bar++) page.drawLine({ start:{x:55+bar*183,y:top-staff*52},end:{x:55+bar*183,y:top-staff*52-28},thickness:.7 });
        for (let note = 0; note < 16; note++) {
          const x = 80+note*44, y = top-staff*52-7*((note+pageNo+system)%5);
          page.drawEllipse({ x,y,xScale:4,yScale:2.8 });
          page.drawLine({ start:{x:x+4,y},end:{x:x+4,y:y+23},thickness:.7 });
        }
      }
    }
    page.drawText(`${pageNo}`, {x:417,y:24,size:10,font});
  }
  await fs.writeFile('test-results/practice-score.pdf',await pdf.save());
  const svg = `<svg width="842" height="595" xmlns="http://www.w3.org/2000/svg"><rect width="842" height="595" fill="white"/><text x="50" y="60" font-size="28" fill="#222">Afternoon study</text>${Array.from({length:30},(_,i)=>`<path d="M50 ${110+Math.floor(i/5)*70+i%5*7}H790" stroke="#444"/>`).join('')}</svg>`;
  for (const format of ['png','jpeg','webp']) await sharp(Buffer.from(svg)).toFormat(format).toFile(`test-results/score.${format}`);
}

(async () => {
  await fixtures();
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  const report = [], errors = []; let page;
  report.push = (...items) => { console.log(...items); return Array.prototype.push.apply(report, items); };
  try {
    const context = await browser.newContext({ viewport:{width:1194,height:834}, hasTouch:true, isMobile:true });
    await context.addInitScript(() => {
      localStorage.setItem('atelier-keyboard-view-v1', JSON.stringify({ mode:'full', start:48 }));
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext { constructor(...args) { super(...args); window.testAudio = this; } };
    });
    page = await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{ if (message.type()==='warning' || message.type()==='error') console.log('BROWSER',message.text()); });
    await page.goto(url);
    await page.getByRole('button',{name:'Tap to Start Piano'}).click({timeout:60000});
    await page.waitForFunction(()=>!document.querySelector('#welcome').open);
    const upload = async file => {
      const chooser = page.waitForEvent('filechooser');
      await page.locator(await page.locator('#sheet-toolbar').isVisible() ? '#replace-sheet' : '#open-sheet').click();
      await (await chooser).setFiles(path.resolve(file));
    };
    for (const format of ['png','jpeg','webp']) {
      await upload(`test-results/score.${format}`);
      await page.waitForFunction(name=>document.querySelector('#sheet-filename').textContent===name && document.querySelector('#sheet-paper img')?.naturalWidth>0,`score.${format}`);
      const dimensions = await page.locator('#sheet-paper').boundingBox();
      assert.ok(Math.abs(dimensions.width/dimensions.height-842/595)<.01);
      await page.locator('#sheet-zoom-in').click();
      assert.equal(await page.locator('#sheet-zoom-value').textContent(),'125%');
      await page.locator('#sheet-fit').click();
    }
    report.push('Native file input imports PNG, JPEG and WEBP; aspect ratio, zoom and fit are correct.');
    await upload('test-results/practice-score.pdf');
    await page.locator('#sheet-paper canvas').waitFor();
    await page.waitForFunction(()=>document.querySelector('#sheet-message').hidden);
    assert.equal(await page.locator('#sheet-page-count').textContent(),'Page 1 / 3');
    await page.screenshot({path:'test-results/practice-balanced.png'});
    await page.locator('#sheet-next').click();
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 2');
    await page.locator('#sheet-prev').click();
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 1');
    report.push('Bundled PDF.js opens a three-page score and renders previous/next pages.');

    const cdp = await context.newCDPSession(page);
    const rect = await page.locator('#sheet-viewport').boundingBox();
    const cx = rect.x+rect.width/2, cy = rect.y+rect.height/2;
    const keyPoints = await page.locator('.white-key').evaluateAll(keys=>keys.slice(20,25).map((key,i)=>{const r=key.getBoundingClientRect(); return {id:i+10,x:r.x+r.width/2,y:r.y+r.height*.85};}));
    await page.locator('#sustain').click();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:keyPoints});
    assert.equal(await page.locator('.pressed').count(),5);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...keyPoints,{id:1,x:cx-40,y:cy},{id:2,x:cx+40,y:cy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[...keyPoints,{id:1,x:cx-100,y:cy},{id:2,x:cx+100,y:cy}]});
    assert.equal(await page.locator('.pressed').count(),5);
    assert.equal(await page.locator('#sheet-zoom-value').textContent(),'250%');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('.pressed').count(),0);
    assert.equal(await page.locator('#sheet-page-count').textContent(),'Page 1 / 3');
    assert.equal(await page.locator('#sustain').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>window.testAudio.state),'running');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:cx,y:cy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:cx+100,y:cy+40}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('#sheet-page-count').textContent(),'Page 1 / 3');
    assert.notEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('atelier-sheet-state-v1'))).y,0);
    await page.locator('#sheet-fit').click();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:cx+100,y:cy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:cx-100,y:cy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 2');
    report.push('Five piano fingers plus two sheet fingers: pinch/pan isolated, sustain retained, audio context running; fit-page swipe advances.');

    await page.locator('#settings-toggle').click();
    await page.locator('#edge-turns').check();
    for (const [label,ratio] of [['More Music',.5],['More Piano',.3],['Balanced',.4]]) {
      await page.getByRole('button',{name:label,exact:true}).click();
      const val = await page.locator('#practice-divider').getAttribute('aria-valuenow'); assert.equal(Number(val),ratio*100);
    }
    await page.locator('#settings-close').click();
    await page.touchscreen.tap(rect.x+rect.width-20,cy);
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 3');
    await page.locator('#sheet-zoom-in').click();
    await page.touchscreen.tap(rect.x+20,cy);
    assert.equal(await page.locator('#sheet-page-count').textContent(),'Page 3 / 3');
    const divider = await page.locator('#practice-divider').boundingBox();
    await page.mouse.move(divider.x+divider.width/2,divider.y+6); await page.mouse.down();
    await page.mouse.move(divider.x+divider.width/2,divider.y+70,{steps:6}); await page.mouse.up();
    assert.ok(Number(await page.locator('#practice-divider').getAttribute('aria-valuenow'))>40);
    report.push('Presets, draggable split, optional edge turns and zoomed page-turn protection work.');

    for (const [width,height] of [[1194,834],[1366,1024],[1180,820],[1024,768],[1133,744],[1024,600],[834,1194],[390,844]]) {
      await page.setViewportSize({width,height}); await page.waitForTimeout(150);
      const geometry = await page.evaluate(()=>{
        const keys=[...document.querySelectorAll('.piano-key')], keyboard=document.querySelector('#keyboard').getBoundingClientRect(), sheet=document.querySelector('#sheet-panel').getBoundingClientRect();
        const controls=[...document.querySelectorAll('.toolbar button,.toolbar input,.sheet-toolbar button')].filter(e=>e.getClientRects().length);
        return {count:keys.length,white:keys.filter(k=>k.classList.contains('white-key')).length,visible:keys.every(k=>{const r=k.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),scroll:document.documentElement.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight,keyHeight:keyboard.height,sheetAbove:sheet.bottom<keyboard.top,controlsFit:controls.every(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth;})};
      });
      assert.equal(geometry.count,88); assert.equal(geometry.white,52); assert.ok(geometry.visible,JSON.stringify({width,height,geometry}));
      assert.equal(geometry.scroll,false); assert.equal(geometry.sheetAbove,true); assert.ok(geometry.controlsFit,JSON.stringify({width,height,geometry}));
      report.push(`${width}×${height}: 88 keys visible; keyboard ${Math.round(geometry.keyHeight)}px; controls fit; no page scrolling.`);
    }
    await page.setViewportSize({width:1194,height:834});
    await page.locator('#sheet-next').isDisabled();
    await page.locator('#sheet-reset').click();
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 1');
    await page.locator('#sheet-next').click(); await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 2');
    await page.locator('#sheet-zoom-in').click();
    await page.waitForFunction(()=>navigator.serviceWorker.controller);
    await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('ready offline'));
    await page.evaluate(async()=>{const prefix=`atelier-piano-shell-${encodeURIComponent(new URL((await navigator.serviceWorker.ready).scope).pathname)}-`; const cache=await caches.open((await caches.keys()).find(key=>key.startsWith(prefix))); const files=await (await fetch('./assets/vendor/pdfjs/cache-files.json')).json(); for (const file of files) if (!await cache.match(file)) throw Error('Offline dependency missing: '+file);});
    await context.setOffline(true); await page.reload();
    await page.getByRole('button',{name:'Tap to Start Piano'}).click({timeout:60000});
    await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 2');
    assert.equal(await page.locator('#sheet-zoom-value').textContent(),'125%');
    await page.locator('#sheet-next').click(); await page.waitForFunction(()=>document.querySelector('#sheet-paper canvas')?.getAttribute('aria-label')==='Sheet music page 3');
    assert.equal(await page.evaluate(()=>window.testAudio.state),'running');
    report.push('Offline reload restores the locally stored PDF, page and zoom; next page renders with piano audio active.');
    await context.setOffline(false);
    await upload('test-results/score.png'); await page.locator('#sheet-paper img').waitFor();
    await page.locator('#settings-toggle').click(); await page.locator('#forget-sheet').click(); await page.locator('#settings-close').click();
    assert.equal(await page.locator('#open-sheet').isVisible(),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('atelier-sheet-state-v1')),null);
    assert.deepEqual(errors,[]);
    await fs.writeFile('test-results/practice-report.json',JSON.stringify({report,errors},null,2));
    console.log(JSON.stringify({report,errors},null,2));
  } catch (error) {
    if (page) { console.log('PAGE STATE',await page.locator('#sheet-message').textContent(),await page.locator('#sheet-filename').textContent(),errors); await page.screenshot({path:'test-results/practice-failure.png'}); }
    throw error;
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
