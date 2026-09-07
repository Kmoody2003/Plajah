// Creative wave DSP proof (OfflineAudioContext in headless chromium):
//  - Freq Shifter: a real single-sideband shift suppresses the mirror image (SSB, not ring-mod).
//  - Vocoder: the modulator (channel) gates the internal carrier + tracks its spectrum.
//  - Freeze Cloud: sustains energy after the input stops (the hold/feedback).
//  - Console EQ: the shelf boosts the target band + the drive adds harmonics.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'ts', contents: `
  import {deviceByType} from './services/melos/beats/fx/devices';
  // Goertzel magnitude of frequency f over o[start..end)
  function mag(o, f, sr, start, end){
    const w=2*Math.PI*f/sr, cw=Math.cos(w), coeff=2*cw; let s0=0,s1=0,s2=0;
    for(let i=start;i<end;i++){ s0=o[i]+coeff*s1-s2; s2=s1; s1=s0; }
    const re=s1-s2*cw, im=s2*Math.sin(w); return Math.sqrt(re*re+im*im)/(end-start);
  }
  function rms(o,start,end){ let s=0; for(let i=start;i<end;i++)s+=o[i]*o[i]; return Math.sqrt(s/(end-start)); }

  // ── Frequency Shifter: 2 kHz sine, +300 Hz shift ⇒ energy at 2300, image at 1700 suppressed ──
  window.freqShift=async()=>{
    const sr=48000, N=sr*0.4, ctx=new OfflineAudioContext(1,N,sr);
    const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=2000;
    const dev=deviceByType('freqshift').create(ctx);
    dev.setParams({shift:300,feedback:0,mix:100});
    osc.connect(dev.input); dev.output.connect(ctx.destination); osc.start();
    const o=(await ctx.startRendering()).getChannelData(0);
    const a=4096, b=N-1; // skip FIR settling
    return { upper: mag(o,2300,sr,a,b), image: mag(o,1700,sr,a,b), carrier: mag(o,2000,sr,a,b) };
  };

  // integrate Goertzel magnitude across a band (lands on the carrier's discrete harmonics regardless of spacing)
  function bandE(o,f0,f1,sr,start,end){ let s=0; for(let f=f0;f<=f1;f+=25) s+=mag(o,f,sr,start,end); return s; }
  // ── Vocoder: modulator drives the carrier. Silence ⇒ ~0 out; noise ⇒ out; the OPENED band follows the modulator's pitch ──
  window.vocoder=async(mode)=>{
    const sr=48000, N=sr*0.5, ctx=new OfflineAudioContext(1,N,sr);
    let src;
    if(mode==='silence'){ const buf=ctx.createBuffer(1,N,sr); src=ctx.createBufferSource(); src.buffer=buf; }
    else if(mode==='noise'){ const buf=ctx.createBuffer(1,N,sr); const d=buf.getChannelData(0); for(let i=0;i<N;i++)d[i]=(Math.random()*2-1)*0.5; src=ctx.createBufferSource(); src.buffer=buf; }
    else { const hz=(mode==='hi')?2200:250; const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=hz; src=o2; }
    const dev=deviceByType('vocoder').create(ctx);
    dev.setParams({carrier:110,detune:8,breath:0.05,tightness:6,depth:9,mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const o=(await ctx.startRendering()).getChannelData(0);
    const a=Math.floor(sr*0.15); // let envelope followers settle
    return { out: rms(o,a,N), hiBand: bandE(o,1700,2700,sr,a,N), loBand: bandE(o,160,360,sr,a,N) };
  };

  // ── Freeze Cloud: 0.1 s noise burst then silence; measure the TAIL (0.6–1.0 s). High hold ⇒ sustain ──
  window.freeze=async(hold)=>{
    const sr=48000, N=sr*1.0, ctx=new OfflineAudioContext(1,N,sr);
    const buf=ctx.createBuffer(1,N,sr); const d=buf.getChannelData(0);
    const burst=Math.floor(sr*0.1); for(let i=0;i<burst;i++)d[i]=(Math.random()*2-1)*0.5;
    const src=ctx.createBufferSource(); src.buffer=buf;
    const dev=deviceByType('freeze').create(ctx);
    dev.setParams({size:300,spray:0.3,rate:0.3,freeze:hold,tone:6000,mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const o=(await ctx.startRendering()).getChannelData(0);
    return rms(o,Math.floor(sr*0.6),N); // tail energy long after the input stopped
  };

  // ── Console EQ: air shelf boost lifts the top; drive on a 100 Hz sine adds harmonics ──
  window.consoleEq=async()=>{
    const sr=48000, N=sr*0.4;
    // (1) shelf: noise, air +10 dB vs flat ⇒ high-band RMS rises
    async function band(air){
      const ctx=new OfflineAudioContext(1,N,sr);
      const buf=ctx.createBuffer(1,N,sr); const d=buf.getChannelData(0); for(let i=0;i<N;i++)d[i]=(Math.random()*2-1)*0.3;
      const src=ctx.createBufferSource(); src.buffer=buf;
      const dev=deviceByType('consoleeq').create(ctx);
      dev.setParams({lowFreq:90,lowBoost:0,lowCut:0,lowMidFreq:500,lowMid:0,highMidFreq:3000,highMid:0,highFreq:12000,high:air,drive:0,output:0});
      const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=9000;
      src.connect(dev.input); dev.output.connect(hp); hp.connect(ctx.destination); src.start();
      const o=(await ctx.startRendering()).getChannelData(0); return rms(o,2048,N);
    }
    // (2) drive harmonics: 100 Hz sine, heavy drive ⇒ energy at 200/300 Hz
    async function harm(drive){
      const ctx=new OfflineAudioContext(1,N,sr);
      const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=100;
      const dev=deviceByType('consoleeq').create(ctx);
      dev.setParams({lowFreq:90,lowBoost:0,lowCut:0,lowMidFreq:500,lowMid:0,highMidFreq:3000,highMid:0,highFreq:12000,high:0,drive,output:0});
      osc.connect(dev.input); dev.output.connect(ctx.destination); osc.start();
      const o=(await ctx.startRendering()).getChannelData(0);
      const h1=mag(o,100,sr,2048,N), h2=mag(o,200,sr,2048,N), h3=mag(o,300,sr,2048,N);
      return (h2+h3)/h1; // total harmonic-to-fundamental ratio
    }
    return { flat: await band(0), boosted: await band(10), thdLow: await harm(0.02), thdHigh: await harm(0.9) };
  };
` }, bundle: true, write: false, format: 'iife',
});

const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage();
  await p.route('http://localhost:9977/**', (r) => r.fulfill({ body: '<div></div>', contentType: 'text/html' }));
  await p.goto('http://localhost:9977/');
  await p.addScriptTag({ content: bundle.outputFiles[0].text });

  const fs = await p.evaluate(() => window.freqShift());
  const ssbDb = 20 * Math.log10(fs.upper / fs.image);
  console.log('freqshift', JSON.stringify(fs), 'SSB suppression', ssbDb.toFixed(1), 'dB');
  assert.ok(fs.upper > fs.image * 2, 'upper sideband (2300) dominates the image (1700) — a real SSB shift, not ring-mod');
  assert.ok(fs.upper > fs.carrier, 'the shifted tone is stronger than the original 2000 Hz (signal moved)');

  const vSil = await p.evaluate(() => window.vocoder('silence'));
  const vNoise = await p.evaluate(() => window.vocoder('noise'));
  const vHi = await p.evaluate(() => window.vocoder('hi'));
  const vLo = await p.evaluate(() => window.vocoder('lo'));
  console.log('vocoder silence', vSil.out.toExponential(2), 'noise', vNoise.out.toFixed(4),
    '| hi-mod hi/lo', (vHi.hiBand / vHi.loBand).toFixed(2), '| lo-mod hi/lo', (vLo.hiBand / vLo.loBand).toFixed(2));
  assert.ok(vNoise.out > vSil.out * 20, 'the modulator gates the carrier: noise opens the bands, silence keeps them shut');
  assert.ok(vHi.hiBand > vHi.loBand && vLo.loBand > vLo.hiBand, 'the opened band tracks the modulator pitch: a high tone lights the high band, a low tone the low band (spectral transfer)');

  const fzLow = await p.evaluate(() => window.freeze(0.1));
  const fzHigh = await p.evaluate(() => window.freeze(0.97));
  console.log('freeze tail low-hold', fzLow.toExponential(2), 'high-hold', fzHigh.toFixed(4));
  assert.ok(fzHigh > fzLow * 5, 'high Hold sustains the tail long after the input stops (the freeze)');

  const ceq = await p.evaluate(() => window.consoleEq());
  console.log('consoleeq', JSON.stringify({ flat: ceq.flat.toFixed(4), boosted: ceq.boosted.toFixed(4), thdLow: ceq.thdLow.toFixed(3), thdHigh: ceq.thdHigh.toFixed(3) }));
  assert.ok(ceq.boosted > ceq.flat * 1.5, 'the air shelf lifts the high band (musical EQ works)');
  assert.ok(ceq.thdHigh > ceq.thdLow * 2, 'the drive adds harmonics (transformer colour is real)');

  console.log('\nPASS — creative wave: SSB freq shifter ' + ssbDb.toFixed(0) + 'dB image rejection; vocoder gates+tracks; freeze sustains; console EQ shelves+saturates');
} finally { await b.close(); }
