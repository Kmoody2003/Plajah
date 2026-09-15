import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:3101/firstlight.html',{waitUntil:'domcontentloaded'});
await page.locator('#menu-play-drive-btn').click();
await page.locator('#enter-field-btn').click();
await page.waitForTimeout(1200);
await page.screenshot({path:'firstlight-upgraded-field.png'});
await page.getByLabel('Player appearance').selectOption('BLOCK');
await page.waitForTimeout(300);
await page.getByLabel('Player appearance').selectOption('ATHLETE');
await page.keyboard.press('Space');await page.waitForTimeout(600);await page.keyboard.press('Digit1');
await page.waitForTimeout(2200);
console.log(JSON.stringify({errors,text:(await page.locator('body').innerText()).slice(-1800)}));
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'firstlight-upgraded-mobile.png'});
await browser.close();if(errors.length)process.exitCode=1;

