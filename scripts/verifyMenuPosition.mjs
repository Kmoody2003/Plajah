import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const bundle = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {useContextMenu} from './components/ui/ContextMenu';
import ChoraQualityButton from './components/ChoraQualityButton';
function Fixture() {
  const menu = useContextMenu(() => [
    {kind:'header',label:'Heading'}, {id:'plain',label:'Plain'}, {kind:'separator'},
    {id:'parent',label:'Parent',submenu:[{kind:'header',label:'Child heading'}, {id:'nested',label:'Nested',submenu:[{id:'action',label:'Final action',onSelect:()=>window.selected=true}]}]},
    ...Array.from({length:30},(_,i)=>({id:'row'+i,label:'Extra '+i}))
  ]);
  return <><div style={{height:800}}/><div style={{transform:'translateZ(0)',overflow:'hidden',height:500}}>
    <button id="trigger" style={{marginLeft:530,marginTop:260}} onClick={e=>menu.openFrom(e.currentTarget)}>Commands</button>
    <div style={{position:'absolute',right:8,bottom:8}}><ChoraQualityButton variant="full"/></div>
  </div>{menu.node}</>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
`, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, format: 'iife', plugins: [{ name: 'quality-store-fixture', setup(b) {
  b.onResolve({filter:/choraStreamService$/},()=>({path:'quality',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"let q='high'; export const getQuality=()=>q; export const setQuality=(v)=>{q=v; window.dispatchEvent(new Event('chora:quality-changed'));};"}));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: {width:900,height:650} });
  await page.route('http://localhost:9877/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://localhost:9877/');
  await page.addStyleTag({content:readFileSync('styles/plajah-ds.css','utf8') + '\nbody{margin:0}.pj-menu{background:#151515;color:white}.pj-menu__item{min-height:30px}.w-64{width:256px}[data-anchored-popover] button{display:block;min-height:44px}'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>window.scrollTo(0,750));
  await page.locator('#trigger').click();
  await page.getByRole('menuitem',{name:'Parent',exact:true}).hover();
  const parent = await page.getByRole('menuitem',{name:'Parent',exact:true}).boundingBox();
  const child = await page.locator('.pj-menu[data-depth="1"]').boundingBox();
  assert.ok(child && Math.abs(child.y-parent.y)<2, 'first submenu must anchor to its exact row, not page top');
  await page.keyboard.press('ArrowRight');
  const nested = await page.getByRole('menuitem',{name:'Nested',exact:true}).boundingBox();
  const grandchild = await page.locator('.pj-menu[data-depth="2"]').boundingBox();
  assert.ok(grandchild && Math.abs(grandchild.y-nested.y)<2);
  const boxes = await page.getByRole('menu').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const r of boxes) assert.ok(r.x>=7 && r.y>=7 && r.right<=893 && r.bottom<=643,JSON.stringify(r));
  await page.keyboard.press('Enter'); assert.equal(await page.evaluate(()=>window.selected),true);
  const scroll = await page.evaluate(()=>window.scrollY);
  await page.locator('#trigger').click(); await page.keyboard.press('End');
  assert.equal(await page.getByRole('menu').count(),1);
  assert.ok(await page.getByRole('menu').evaluate(e=>e.scrollTop>0));
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>window.scrollY),scroll);
  const quality = page.getByRole('button',{name:'Audio quality: High',exact:true});
  await quality.click();
  const popover = page.locator('[data-anchored-popover]');
  const q = await quality.boundingBox(), p = await popover.boundingBox();
  assert.ok(p.y<q.y,'bottom-edge Chora menu flips above trigger');
  assert.ok(p.x>=8 && p.x+p.width<=892 && p.y>=8 && p.y+p.height<=642);
  await popover.getByRole('button',{name:/Lossless/}).click();
  await page.getByRole('button',{name:'Audio quality: Lossless',exact:true}).waitFor();
  await page.setViewportSize({width:280,height:220});
  await page.evaluate(()=>{const t=document.querySelector('#trigger'); t.style.marginLeft='20px';t.style.marginTop='20px';window.scrollTo(0,800);});
  await page.locator('#trigger').click();
  const small = await page.getByRole('menu').boundingBox();
  assert.ok(small.x>=8 && small.y>=8 && small.x+small.width<=272 && small.y+small.height<=212);
  console.log('PASS: exact first-open submenu anchors, three levels, edge flipping, internal keyboard scrolling, no focus/page jump, Chora dropdown in transformed/scrolled container, selection, narrow viewport');
} finally { await browser.close(); }
