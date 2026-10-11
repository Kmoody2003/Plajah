import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist-kith-party');const out=path.resolve('artifacts/kith-party');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 await page.route('http://kith.local/**',async route=>{const pathname=new URL(route.request().url()).pathname;const file=path.resolve(root,'.'+(pathname==='/'?'/kith-party.html':pathname));try{assert.ok(file.startsWith(root+path.sep));const body=await fs.readFile(file);const ext=path.extname(file);await route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[ext]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.clock.install();
 await page.goto('http://kith.local/');
 await page.locator('.kp-hero h1').waitFor();
 await page.evaluate(()=>Promise.all([...document.images].map(im=>im.decode().catch(()=>{}))));
 assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).length),0);
 await page.screenshot({path:path.join(out,'gallery-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Racing',exact:true}).click();assert.equal(await page.locator('.kp-game-card').count(),1);
 await page.getByRole('button',{name:'All games',exact:true}).click();assert.equal(await page.locator('.kp-game-card').count(),3);
 await page.getByRole('button',{name:'How to play',exact:true}).click();await page.getByRole('button',{name:'Got it',exact:false}).click();
 for(const [id,name,duration] of [['circuit','Kith Circuit',53000],['crystals','Crystal Scramble',64000],['rhythm','Chora’s Beat Garden',49000]]) {
  console.log(`Checking ${name}`);
  await page.locator('.kp-game-card').filter({has:page.getByRole('heading',{name,exact:true})}).click();
  assert.equal(await page.locator('.kp-roster-grid>button').count(),10);
  if(id==='crystals'){await page.getByRole('button',{name:'Two local players',exact:false}).click();await page.locator('.kp-player-tabs>button').nth(1).click();await page.locator('.kp-roster-grid>button').filter({hasText:'Nori'}).click();}
  await page.screenshot({path:path.join(out,`setup-${id}.png`),fullPage:true});
  await page.getByRole('button',{name:'Let’s play',exact:false}).click();await page.getByRole('button',{name:'Ready, let’s go',exact:false}).click();
  await page.clock.runFor(3300);
  if(id==='circuit')await page.keyboard.down('ArrowUp');
  if(id==='crystals'){await page.keyboard.down('ArrowRight');await page.keyboard.down('KeyA');}
  if(id==='rhythm'){await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');}
  await page.clock.runFor(1600);await page.screenshot({path:path.join(out,`game-${id}.png`)});
  await page.keyboard.up('ArrowRight');await page.keyboard.up('KeyA');
  await page.getByRole('button',{name:'Pause game',exact:true}).click();const before=await page.locator('.kp-timer').innerText();await page.clock.runFor(2000);assert.equal(await page.locator('.kp-timer').innerText(),before);await page.getByRole('button',{name:'Back to the fun',exact:false}).click();
  if(id==='circuit')await page.keyboard.down('ArrowUp');
  await page.clock.runFor(duration);await page.keyboard.up('ArrowUp');await page.locator('.kp-results').waitFor();await page.screenshot({path:path.join(out,`results-${id}.png`)});
  await page.getByRole('button',{name:'Back to the playground',exact:false}).click();
 }
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kith-party-best-v1')));assert.ok(saved.circuit>0);assert.ok(Number.isFinite(saved.crystals));assert.ok(Number.isFinite(saved.rhythm));
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(out,'gallery-mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Let’s have a party',exact:false}).click();await page.screenshot({path:path.join(out,'roster-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Let’s play',exact:false}).click();await page.getByRole('button',{name:'Ready, let’s go',exact:false}).click();await page.clock.runFor(3500);await page.screenshot({path:path.join(out,'game-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({passed:true,checks:['desktop/mobile layout','all portraits load','gallery filters','10-character roster','two-player selection','three games start and finish','pause freezes timer','local best scores','no browser errors'],errors},null,2));console.log('Browser proof passed. Screenshots: artifacts/kith-party');
}finally{await browser.close();}
