import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createState} from '../../components/kithParty/engine';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
try {
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 await page.clock.install();await page.clock.pauseAt(new Date());
 await page.goto('http://127.0.0.1:3188/',{waitUntil:'networkidle'});
 await page.locator('.kp-game-card').filter({hasText:'Chora’s Beat Garden'}).click();
 await page.getByRole('button',{name:'Two local players',exact:false}).click();
 await page.getByRole('button',{name:'Let’s play',exact:false}).click();await page.getByRole('button',{name:'Ready, let’s go',exact:false}).click();
 const first=createState('rhythm',['rello','chora']).notes[0];
 await page.clock.runFor(3000+first.time*1000-35);
 await page.keyboard.down(['Digit1','Digit2','Digit3','Digit4'][first.lane]);
 await page.keyboard.down(['Digit7','Digit8','Digit9','Digit0'][first.lane]);
 await page.clock.runFor(90);
 await page.keyboard.up(['Digit1','Digit2','Digit3','Digit4'][first.lane]);await page.keyboard.up(['Digit7','Digit8','Digit9','Digit0'][first.lane]);await page.clock.runFor(100);
 const scores=await page.locator('.kp-scorebar strong').allTextContents();assert.equal(scores.length,2);assert.ok(Number(scores[0])>=100,`Player 1 digits did not score: ${scores}`);assert.ok(Number(scores[1])>=100,`Player 2 digits did not score: ${scores}`);
 await page.screenshot({path:'artifacts/kith-party/v2/number-key-controls.png'});console.log('Top-row 1–4 and 7–0 both scored perfect rhythm hits.');
}finally{await browser.close();}
