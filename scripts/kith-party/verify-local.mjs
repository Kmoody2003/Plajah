import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:3188/',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
 await page.locator('.kp-hero h1').waitFor();
 await page.getByRole('button',{name:'How to play',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'Let’s have a party',exact:false}).click();await page.getByRole('button',{name:'Let’s play',exact:false}).click();await page.getByRole('button',{name:'Ready, let’s go',exact:false}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('Live local server, mobile launch, and keyboard dialog dismissal passed.');
}finally{await browser.close();}
