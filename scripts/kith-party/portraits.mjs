import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import {buildSync} from 'esbuild';
const code=buildSync({entryPoints:['components/mascots/mascot2dRuntime.ts'],bundle:true,write:false,format:'iife',globalName:'KithMascots'}).outputFiles[0].text;
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
try {
 const page=await browser.newPage();
 await page.setContent('<html><body></body></html>');
 await page.addScriptTag({content:code});
 const sprites=await page.evaluate(async()=>{
  const {createMascot2D}=window.KithMascots;
  return ['reello','chora'].map(who=>{const host=document.createElement('div');document.body.append(host);const mascot=createMascot2D(host,{who,mood:'idle',energy:0,followPointer:false,reducedMotion:true});mascot.advance(.1);const svg=mascot.el.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','480');svg.setAttribute('height','510');const data=new XMLSerializer().serializeToString(svg);mascot.destroy();host.remove();return {id:who==='reello'?'rello':who,data};});
 });
 for(const sprite of sprites)await fs.writeFile(`public/kith-party/characters/${sprite.id}.svg`,sprite.data);
 console.log('Exported canonical Rello and Chora portraits from the existing mascot runtime.');
} finally {await browser.close();}
