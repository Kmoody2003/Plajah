// IR library proof: the loader fetches + decodes a real bundled AKRT WAV, caches it, and the Spaces
// convolution reverb uses it (a dry impulse blooms into the recorded spring's tail). Served from the
// real files in public/irs via a Playwright route.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'ts', contents: `
  import {deviceByType} from './services/melos/beats/fx/devices';
  import {loadIr, getCachedIr, IR_LIBRARY} from './services/melos/beats/fx/irLibrary';
  function rms(o,start,end){ let s=0; for(let i=start;i<end;i++)s+=o[i]*o[i]; return Math.sqrt(s/(end-start)); }
  window.decodeOne=async(id)=>{
    const ctx=new OfflineAudioContext(2,48000,48000);
    const buf=await loadIr(ctx,id);
    return buf ? { ok:true, secs:buf.duration, ch:buf.numberOfChannels, cached: !!getCachedIr(id,48000) } : { ok:false };
  };
  window.reverbTail=async(id)=>{
    const sr=48000,N=sr*2,ctx=new OfflineAudioContext(2,N,sr);
    await loadIr(ctx,id); // cache it so the device reads it synchronously (no placeholder)
    const idx=IR_LIBRARY.findIndex(d=>d.id===id);
    // dry impulse: one sample
    const b=ctx.createBuffer(1,N,sr); b.getChannelData(0)[0]=1; const src=ctx.createBufferSource(); src.buffer=b;
    const dev=deviceByType('spaces').create(ctx);
    dev.setParams({irMode:1, irIndex:idx, preDelay:0, mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const rb=await ctx.startRendering(); const L=rb.getChannelData(0);
    // energy well after the impulse = the convolved IR tail
    return { early: rms(L,0,2000), tail: rms(L,4000,Math.floor(sr*1.0)) };
  };
` }, bundle: true, write: false, format: 'iife',
});

const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage();
  await p.route('http://localhost:9977/', (r) => r.fulfill({ body: '<div></div>', contentType: 'text/html' }));
  // serve the real IR files from disk
  await p.route('**/irs/**', (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/irs\//, '');
    const file = path.join(process.cwd(), 'public', 'irs', rel);
    try { route.fulfill({ status: 200, contentType: 'audio/wav', body: fs.readFileSync(file) }); }
    catch { route.fulfill({ status: 404, body: '' }); }
  });
  await p.goto('http://localhost:9977/');
  await p.addScriptTag({ content: bundle.outputFiles[0].text });

  const dec = await p.evaluate(() => window.decodeOne('spring-medium'));
  console.log('decode spring-medium', JSON.stringify(dec));
  assert.ok(dec.ok && dec.secs > 2 && dec.secs < 4, 'a real AKRT WAV decodes to a ~3 s stereo IR');
  assert.ok(dec.cached, 'the decoded IR is cached for synchronous device reads');

  const rev = await p.evaluate(() => window.reverbTail('spring-medium'));
  console.log('spaces w/ library IR — early', rev.early.toExponential(2), 'tail', rev.tail.toExponential(2));
  assert.ok(rev.tail > 1e-4, 'a dry impulse blooms into the recorded spring tail (device is using the library IR)');

  const cab = await p.evaluate(() => window.decodeOne('cab-speaker'));
  console.log('decode cab-speaker', JSON.stringify(cab));
  assert.ok(cab.ok, 'the speaker-cab IR also decodes');

  const ham = await p.evaluate(() => window.decodeOne('hamilton-mausoleum'));
  console.log('decode hamilton-mausoleum (OpenAIR)', JSON.stringify(ham));
  assert.ok(ham.ok && ham.secs > 10 && ham.ch === 2, "the OpenAIR Hamilton Mausoleum IR decodes to its famous ~15 s stereo tail");
  const minster = await p.evaluate(() => window.decodeOne('york-minster'));
  console.log('decode york-minster (OpenAIR)', JSON.stringify(minster));
  assert.ok(minster.ok, 'the OpenAIR York Minster cathedral IR decodes');

  console.log('\nPASS — IR library: loader fetches + decodes real AKRT WAVs, caches them, Spaces convolves with them');
} finally { await b.close(); }
