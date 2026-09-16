import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});const p=await b.newPage();
const pending=new Set();p.on('request',r=>pending.add(r.url()));p.on('requestfinished',r=>pending.delete(r.url()));p.on('requestfailed',r=>pending.delete(r.url()));const timer=setTimeout(()=>console.log('PENDING', [...pending]),20000);
p.on('pageerror',e=>console.log('ERROR',e.message));p.on('requestfailed',r=>console.log('FAIL',r.url(),r.failure()));p.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url())});
await p.route('http://localhost:3000/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><div id=probe></div>'}));
await p.goto('http://localhost:3000',{waitUntil:'domcontentloaded'});
console.log(await p.evaluate(async()=>{try{const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/components/AppsView.tsx');return 'AppsView import OK'}catch(e){return String(e)}}));
clearTimeout(timer);await b.close();
