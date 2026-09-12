import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const source=readFileSync('components/Fabula/Fabula.jsx','utf8');
const css=source.slice(source.indexOf('.tl-scroll{'),source.indexOf('.splash{'));
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}.tl-scroll{width:600px;height:180px}.tl-inner{position:relative;width:2000px}${css}</style>
 <div class="tl-scroll"><div class="tl-inner"><div class="ruler"><div class="trackhead rh">Ruler</div><div class="ruler-track"></div></div>
 ${Array.from({length:6},(_,i)=>`<div class="track audio"><div class="trackhead">Track ${i}<button>Mute</button></div><div class="trackbody"><div class="clip sel" style="left:0;width:1200px;background:red">Selected clip</div><div class="transwedge" style="left:0;width:300px">Transition</div></div></div>`).join('')}
 <div class="phline" style="left:550px"></div></div></div>`);
 await page.locator('.tl-scroll').evaluate(el=>{el.scrollLeft=500;el.scrollTop=60;});
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 const result=await page.evaluate(()=>({header:!!document.elementFromPoint(50,75)?.closest('.trackhead'),ruler:!!document.elementFromPoint(50,10)?.closest('.ruler'),lane:!!document.elementFromPoint(200,75)?.closest('.trackbody'),background:getComputedStyle(document.querySelector('.trackhead')).backgroundColor}));
 assert.equal(result.header,true,'selected clips and transitions cannot cover scrolled headers');
 assert.equal(result.ruler,true,'sticky ruler remains above vertically scrolled clips');
 assert.equal(result.lane,true,'clip lane remains interactive');
 assert.equal(result.background,'rgb(22, 22, 28)','headers are opaque');
 console.log('PASS: selected clips, transitions and playhead remain behind opaque headers during both-axis scrolling');
} finally {await browser.close();}
