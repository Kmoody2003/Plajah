import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];const missing=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/firstlight/assets/')&&r.status()!==200)missing.push(r.url())});
await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto('http://127.0.0.1:3101/firstlight.html',{waitUntil:'domcontentloaded'});
await page.locator('#menu-play-drive-btn').waitFor();await page.keyboard.press('Space');await page.locator('#enter-field-btn').waitFor();await page.keyboard.press('Space');
await page.getByLabel('Pre-snap play').selectOption('PASS_VERTS');await page.locator('canvas').click({position:{x:800,y:400},force:true});await page.waitForTimeout(1200);await page.screenshot({path:'firstlight-routes-pbr.png',timeout:60000});
await page.getByLabel('Pre-snap play').selectOption('PASS_POST_OUT');await page.locator('canvas').click({position:{x:800,y:400},force:true});await page.keyboard.press('Space');await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');await page.screenshot({path:'firstlight-mocap-motion.png',timeout:60000});
await page.keyboard.press('Digit1');console.log(JSON.stringify({errors,missing,playSelectorHidden:await page.getByLabel('Pre-snap play').count()===0}));
await browser.close();if(errors.length||missing.length)process.exitCode=1;
