import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
const bundle = await build({stdin:{contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {NflSpotlight} from './components/sports/NflSpotlight'; createRoot(document.getElementById('root')).render(React.createElement(NflSpotlight,{onExplore:()=>{}}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
try {
 for(const width of [390,1440]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.route('**/__nfl_bundle',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  let failed=false;
  await page.route('**/football/nfl/scoreboard',route=>failed?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({json:{season:{year:2026,type:2},week:{number:1},events:[{id:'test',date:'2026-09-13T17:00:00Z',status:{type:{state:'in',shortDetail:'3:12 - 4th Quarter'}},competitions:[{competitors:[{homeAway:'away',team:{id:'1',displayName:'Away team'},score:'0'},{homeAway:'home',team:{id:'2',displayName:'Home team'},score:{displayValue:'7'}}]}]}]}}));
  await page.route('**/__sports_verify',r=>r.fulfill({contentType:'text/html',body:`<html><head><link rel="stylesheet" href="/index.css?direct"></head><body style="margin:0;padding:16px;background:var(--bg-color);color:var(--text-primary)"><div id="root"></div><script src="/__nfl_bundle"></script></body></html>`}));
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  await page.goto('http://localhost:3000/__sports_verify',{waitUntil:'domcontentloaded'});
  await page.getByText('Away team').waitFor({timeout:60000});
  assert.equal(await page.getByText('0',{exact:true}).count(),1);
  assert.equal(await page.getByText('2026 · Regular season · Week 1',{exact:true}).count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`sports-nfl-${width}.png`,fullPage:true});
  failed=true;await page.getByRole('button',{name:'Refresh NFL scoreboard'}).click();
  await page.getByText(/Updates interrupted/).waitFor();
  assert.equal(await page.getByText(/^Live ·/).count(),0);
  assert.equal(await page.getByText('Away team').count(),1);
  assert.deepEqual(errors,[]);
  console.log(`${width}px: scores, metadata, no overflow, refresh failure and retained snapshot passed`);
  await page.close();
 }
} finally {await browser.close();}
