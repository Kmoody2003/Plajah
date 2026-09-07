import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import PanelDivider from './components/Fabula/PanelDivider.jsx';
import * as engine from './services/fabula/playbackEngine.ts';
import {putBytes} from './services/fabula/mediaStore.ts';
import {resolveMediaSource} from './services/fabula/mediaSource.ts';
window.api = {...engine, putBytes, resolveMediaSource};
function Layout() { const [width,setWidth] = React.useState(224); return <div style={{display:'flex',height:300}}><div data-testid="panel" style={{width,flex:'none'}}>Effects</div><PanelDivider label="Effects width" value={width} onChange={setWidth}/><div>Viewer</div></div>; }
createRoot(document.getElementById('root')).render(<Layout/>);
`, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, format: 'iife' });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.route('http://localhost:9876/**', (route) => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://localhost:9876/');
  await page.addStyleTag({ content: '.panel-divider{width:8px;flex:0 0 8px;touch-action:none;cursor:col-resize}' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const handle = page.getByRole('separator', { name: 'Effects width' });
  await handle.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await handle.getAttribute('aria-valuenow'), '234');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 4, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 84, box.y + 20); await page.mouse.up();
  assert.equal(await handle.getAttribute('aria-valuenow'), '314');
  const result = await page.evaluate(async () => {
    const a = window.api;
    // A real PCM WAV exercises Chromium's actual audio decoder and scheduling nodes.
    const bytes = new ArrayBuffer(44 + 48000 * 2); const d = new DataView(bytes);
    const str = (o,s) => [...s].forEach((c,i) => d.setUint8(o+i,c.charCodeAt(0)));
    str(0,'RIFF'); d.setUint32(4,bytes.byteLength-8,true); str(8,'WAVE'); str(12,'fmt ');
    d.setUint32(16,16,true); d.setUint16(20,1,true); d.setUint16(22,1,true); d.setUint32(24,48000,true);
    d.setUint32(28,96000,true); d.setUint16(32,2,true); d.setUint16(34,16,true); str(36,'data'); d.setUint32(40,96000,true);
    for(let i=0;i<48000;i++) d.setInt16(44+i*2, Math.sin(i*440*2*Math.PI/48000)*8000,true);
    const blob = new Blob([bytes],{type:'audio/wav'});
    await a.putBytes('studio:blob:local',blob);
    let requests = 0;
    const fetchOriginal = window.fetch;
    window.fetch = (...args) => { requests++; return fetchOriginal(...args); };
    const source = await a.resolveMediaSource({id:'local',url:'https://invalid.example/file.wav'});
    const local = source.local; source.release();
    const pool = [{id:'local',type:'audio',url:'https://invalid.example/file.wav'}, {id:'future',type:'audio',url:'https://invalid.example/future.wav'}];
    const clips = [{id:'now',assetId:'local',trackId:'a1',start:0,duration:1}, {id:'later',assetId:'future',trackId:'a1',start:200,duration:1}];
    const before = a.enginePlayable(pool[0].url,'now');
    const started = a.startPlayback({clips,mediaPool:pool,t0:0});
    await new Promise((r)=>setTimeout(r,250));
    const owns = a.enginePlayable(pool[0].url,'now'); const stats = a.engineStats();
    a.stopPlayback(); const after = a.enginePlayable(pool[0].url,'now');
    window.fetch = fetchOriginal;
    return {local,requests,before,started,owns,after,stats};
  });
  assert.equal(result.local, true);
  assert.equal(result.requests, 0, 'local audio must not request cloud; far clips must stay outside decode horizon');
  assert.equal(result.before, false); assert.equal(result.started, true); assert.equal(result.owns, true); assert.equal(result.after, false);
  assert.equal(result.stats.scheduled, 1);
  console.log('PASS: keyboard/pointer resizing, real browser WAV decode, local-before-cloud resolution, scheduled audio ownership, rolling look-ahead and stop cleanup');
} finally { await browser.close(); }
