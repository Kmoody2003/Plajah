import { exportArchitecture } from './export-architecture.mjs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'artifacts/ravencrest-review/phase2';
await mkdir(output, { recursive:true });
let browser;
try {
  const url = pathToFileURL(await exportArchitecture()).href;
  console.log('Standalone architecture viewer: '+url);
  browser = await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
  const page = await browser.newPage({viewport:{width:1600,height:1100}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>Boolean(window.ravencrestReview),{timeout:30000});
  await page.waitForTimeout(1200);
  await page.screenshot({path:`${output}/ground-cutaway.png`});
  for (const [index,id] of [[0,'basement'],[2,'queens'],[3,'kings'],[4,'observatory']]) {
    await page.selectOption('#floor',String(index));
    await page.click('#plan');
    await page.waitForTimeout(350);
    await page.screenshot({path:`${output}/${id}-plan.png`});
  }
  await page.click('#overview'); await page.waitForTimeout(600);
  await page.screenshot({path:`${output}/whole-castle.png`});
  await page.selectOption('#floor','1');
  await page.click('#walk');
  const before = await page.evaluate(()=>({...window.ravencrestReview.player}));
  await page.keyboard.down('w'); await page.waitForTimeout(800); await page.keyboard.up('w');
  const after = await page.evaluate(()=>({...window.ravencrestReview.player}));
  await page.screenshot({path:`${output}/walk.png`});
  const [artwork] = await Promise.all([page.waitForEvent('popup'),page.click('#art')]);
  await artwork.waitForLoadState('load');
  const artworkLoaded = await artwork.evaluate(()=>Boolean(document.querySelector('img')?.naturalWidth));
  await artwork.close();
  const result = {artworkLoaded,errors,canvases:await page.locator('canvas').count(),before,after,moved:after.z<before.z,status:await page.locator('#status').innerText()};
  await writeFile(`${output}/browser-check.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  if(errors.length || !result.moved || !artworkLoaded)process.exitCode=1;
} finally {
  await browser?.close();

}
