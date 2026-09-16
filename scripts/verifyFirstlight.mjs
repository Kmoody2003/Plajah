import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Game from './components/sports/ProjectFirstlight';createRoot(document.getElementById('root')).render(<Game/>);`},bundle:true,write:false,outdir:'out',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://firstlight.test/**',r=>r.fulfill({contentType:'text/html',body:`<html><style>body{margin:0;background:#171525;color:white;font-family:Arial}button{padding:12px;background:#482564;color:white;border:1px solid #9974ac;border-radius:20px}${css}</style><div id="root"></div><script>${js}</script></html>`}));
 await page.goto('http://firstlight.test/');await page.getByRole('button',{name:'Snap the ball'}).click();
 await page.getByRole('button',{name:'Pass 1'}).click();await page.getByRole('button',{name:'Next down',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.match(/Caught|broken up/));
 await page.getByRole('button',{name:'Pause',exact:true}).click();assert.match(await page.getByRole('status').innerText(),/Paused/);
 await page.getByRole('button',{name:'Resume',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:`firstlight-${width}.png`,fullPage:true});await page.close();console.log(`Firstlight ${width}: pass, result, pause, layout passed`);
}}finally{await browser.close();}
