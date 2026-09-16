import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await page.goto('http://127.0.0.1:3101/firstlight.html',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(5000);
console.log((await page.locator('body').innerText()).slice(0,4000));
await page.screenshot({path:'firstlight-upgraded-menu.png'});
await browser.close();


