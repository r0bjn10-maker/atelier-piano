const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,isMobile:true});
  const page=await context.newPage(), errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));
  await page.goto(process.env.TEST_URL||'http://localhost:5174/Piano/');
  await page.getByRole('button',{name:'Tap to Start Piano'}).click({timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('#welcome').open);
  await page.locator('#sheet-file').setInputFiles({name:'score.svg.png',mimeType:'image/png',buffer:await require('sharp')({create:{width:800,height:300,channels:3,background:'#fff'}}).png().toBuffer()});
  await page.waitForFunction(()=>document.querySelector('#sheet-paper img'));
  await page.evaluate(()=>window.originalScore=document.querySelector('#sheet-paper img'));
  const normalHeight=await page.locator('#sheet-panel').evaluate(e=>e.clientHeight);
  await page.locator('#keyboard-mode').selectOption('two-rows');
  assert.equal(await page.locator('#keyboard-mode option').count(),4);
  assert.equal(await page.locator('.piano-key:visible').count(),88);
  const sizes=[];
  for(const [width,height] of [[1024,768],[1133,744],[1194,834],[1366,1024],[834,1194]]) {
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>{const s=document.querySelector('#sheet-panel').getBoundingClientRect().height/innerHeight;return document.querySelector('#keyboard').getBoundingClientRect().bottom<=innerHeight&&s>=.18&&s<=.22;});
   const result=await page.locator('#keyboard').evaluate(k=>{
    const rows=[0,1].map(i=>[...k.querySelectorAll(`.white-key[data-row="${i}"]`)].map(e=>e.getBoundingClientRect()));
    return {counts:rows.map(r=>r.length),widths:rows.map(r=>r[0].width),heights:rows.map(r=>r[0].height),fit:rows.flat().every(r=>r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight),sheet:document.querySelector('#sheet-panel').getBoundingClientRect().height/innerHeight};
   });
   assert.deepEqual(result.counts,[23,29]);assert.ok(result.widths[0]>result.widths[1]);assert.equal(result.heights[0],result.heights[1]);assert.ok(result.fit);assert.ok(result.sheet>=.18&&result.sheet<=.22);
   sizes.push({width,height,...result});
  }
  await page.setViewportSize({width:1194,height:834});
  await page.waitForFunction(()=>{const s=document.querySelector('#sheet-panel').getBoundingClientRect().height/innerHeight;return document.querySelector('#keyboard').getBoundingClientRect().bottom<=innerHeight&&s>=.18&&s<=.22;});
  await page.locator('#sheet-size-toggle').click(); assert.equal(await page.locator('#sheet-size-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('#sheet-size-toggle').click();
  for (const mode of ['two-rows','2']) {
   await page.locator('#keyboard-mode').selectOption(mode);
   const divider=page.locator('#practice-divider');
   let r=await divider.boundingBox();
   await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
   await page.mouse.move(r.x+r.width/2,0,{steps:12});await page.mouse.up();
   await page.waitForFunction(()=>document.querySelector('.studio').style.getPropertyValue('--sheet-height')==='0px');
   assert.equal(await page.locator('#sheet-panel').isVisible(),false);
   assert.ok(await divider.isVisible());
   r=await divider.boundingBox();
   await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
   await page.mouse.move(r.x+r.width/2,200,{steps:12});await page.mouse.up();
   assert.ok(await page.locator('#sheet-panel').isVisible());
   assert.ok(await page.evaluate(()=>window.originalScore===document.querySelector('#sheet-paper img')));
   await divider.focus();await page.keyboard.press('Home');
  }
  await page.locator('#keyboard-mode').selectOption('two-rows');
  assert.equal(await page.locator('[data-midi="60"]').getAttribute('data-row'),'1');
  assert.equal(await page.locator('[data-midi="59"]').getAttribute('data-row'),'0');
  const point=async(midi,id)=>page.locator(`[data-midi="${midi}"]`).evaluate((e,id)=>{const r=e.getBoundingClientRect();return {id,x:r.x+r.width/2,y:r.y+r.height*.85};},id);
  const cdp=await context.newCDPSession(page);
  const points=await Promise.all([point(48,1),point(52,2),point(55,3),point(65,4),point(69,5)]);
  await page.locator('#record').click(); await page.locator('#sustain').click();
  const requestCount=requests.filter(u=>u.endsWith('.wav')).length;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
  assert.equal(await page.locator('.pressed').count(),5);
  points[0]=await point(72,1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points});
  assert.equal(await page.locator('[data-midi="72"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-midi="48"]').getAttribute('aria-pressed'),'false');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  for(const [mode,count] of [['2',25],['3',37],['full',88],['two-rows',88]]) {
   await page.locator('#keyboard-mode').selectOption(mode);
   assert.equal(await page.locator('.piano-key:visible').count(),count);
   assert.equal(await page.locator('#record-label').textContent(),'Stop');
   assert.equal(await page.locator('#sustain').getAttribute('aria-pressed'),'true');
   assert.ok(await page.evaluate(()=>window.originalScore===document.querySelector('#sheet-paper img')));
   if(mode!=='two-rows') {assert.equal(await page.locator('[data-row]').count(),0);assert.equal(await page.locator('#sheet-panel').evaluate(e=>e.clientHeight),normalHeight);}
  }
  assert.equal(requests.filter(u=>u.endsWith('.wav')).length,requestCount);
  await page.locator('#sustain').click();await page.locator('#record').click();
  const take=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelier-recording-v1')));
  assert.equal(take.events.filter(e=>e.type==='on').length,6);
  assert.equal(take.events.filter(e=>e.type==='off').length,6);
  await page.locator('#playback').click();await page.locator('#keyboard-mode').selectOption('full');
  await page.waitForFunction(()=>document.querySelector('#playback').getAttribute('aria-label')==='Play recording');
  await page.locator('#keyboard-mode').selectOption('two-rows');
  await page.screenshot({path:'test-results/two-rows-ipad.png'});
  await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('ready offline'));
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Tap to Start Piano'}).click({timeout:60000});
  assert.equal(await page.locator('#keyboard-mode').inputValue(),'two-rows');assert.equal(await page.locator('.piano-key:visible').count(),88);
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/two-rows-report.json',JSON.stringify({sizes,errors},null,2));console.log(JSON.stringify({sizes,errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
