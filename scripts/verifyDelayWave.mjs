// Delay wave DSP proof (OfflineAudioContext, stereo):
//  Creative Delay — feedback builds echoes; Tape mode darkens; Duck pulls the wet down under input.
//  Cosmos — the tail sustains; Shimmer adds octave-up (2f) energy; Reverse renders.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'ts', contents: `
  import {deviceByType} from './services/melos/beats/fx/devices';
  function mag(o,f,sr,start,end){ const w=2*Math.PI*f/sr,cw=Math.cos(w),coeff=2*cw; let s1=0,s2=0,s0=0; for(let i=start;i<end;i++){s0=o[i]+coeff*s1-s2;s2=s1;s1=s0;} const re=s1-s2*cw,im=s2*Math.sin(w); return Math.sqrt(re*re+im*im)/(end-start); }
  function rms(o,start,end){ let s=0; for(let i=start;i<end;i++)s+=o[i]*o[i]; return Math.sqrt(s/(end-start)); }
  function mono(rb){ const L=rb.getChannelData(0), R=rb.numberOfChannels>1?rb.getChannelData(1):L; const o=new Float32Array(L.length); for(let i=0;i<L.length;i++)o[i]=(L[i]+R[i])*0.5; return o; }
  function hf(o,sr,start,end){ let e=0; for(let f=6500;f<=15000;f+=500)e+=mag(o,f,sr,start,end); return e; }
  const noiseBuf=(ctx,N,secs)=>{ const b=ctx.createBuffer(1,N,ctx.sampleRate); const d=b.getChannelData(0); const stop=Math.floor(secs*ctx.sampleRate); for(let i=0;i<stop;i++)d[i]=(Math.random()*2-1)*0.4; return b; };

  window.echoTail=async(fb)=>{
    const sr=48000,N=sr*1.5,ctx=new OfflineAudioContext(2,N,sr);
    const src=ctx.createBufferSource(); src.buffer=noiseBuf(ctx,N,0.05);
    const dev=deviceByType('echo').create(ctx);
    dev.setParams({time:150,feedback:fb,mode:0,pingpong:0,tone:9000,lowcut:80,mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const o=mono(await ctx.startRendering());
    return rms(o,Math.floor(sr*0.3),N); // tail long after the 50ms burst ended
  };
  // tone/darkening on the clean Modern mode (no saturation confound): open tone passes 7 kHz, dark cuts it
  window.echoTone=async(tone)=>{
    const sr=48000,N=sr*1.0,ctx=new OfflineAudioContext(2,N,sr);
    const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=7000;
    const dev=deviceByType('echo').create(ctx);
    dev.setParams({time:120,feedback:0,mode:0,pingpong:0,tone,lowcut:80,wow:0,mix:100});
    osc.connect(dev.input); dev.output.connect(ctx.destination); osc.start();
    const o=mono(await ctx.startRendering());
    return mag(o,7000,sr,Math.floor(sr*0.3),N);
  };
  // saturation: Tape/Analog add harmonics to a 200 Hz tone; Modern stays clean
  window.echoSat=async(mode)=>{
    const sr=48000,N=sr*0.8,ctx=new OfflineAudioContext(2,N,sr);
    const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=200;
    const dev=deviceByType('echo').create(ctx);
    dev.setParams({time:150,feedback:60,mode,pingpong:0,tone:12000,lowcut:40,wow:0,mix:100});
    osc.connect(dev.input); dev.output.connect(ctx.destination); osc.start();
    const o=mono(await ctx.startRendering());
    const a=Math.floor(sr*0.3);
    return (mag(o,400,sr,a,N)+mag(o,600,sr,a,N))/mag(o,200,sr,a,N);
  };
  window.echoDuck=async(duck)=>{
    const sr=48000,N=sr*0.8,ctx=new OfflineAudioContext(2,N,sr);
    const src=ctx.createBufferSource(); src.buffer=noiseBuf(ctx,N,0.8); // continuous input
    const dev=deviceByType('echo').create(ctx);
    dev.setParams({time:200,feedback:30,mode:0,pingpong:0,tone:9000,lowcut:80,duck,mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const o=mono(await ctx.startRendering());
    return rms(o,Math.floor(sr*0.3),N); // steady-state wet level while input plays
  };

  window.cosmosTail=async()=>{
    const sr=48000,N=sr*2.0,ctx=new OfflineAudioContext(2,N,sr);
    const src=ctx.createBufferSource(); src.buffer=noiseBuf(ctx,N,0.1);
    const dev=deviceByType('cosmos').create(ctx);
    dev.setParams({space:6,size:1.4,time:120,feedback:60,shimmer:40,diffusion:60,tone:8000,preDelay:40,reverse:0,mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const o=mono(await ctx.startRendering());
    return rms(o,Math.floor(sr*1.0),N); // tail 1–2 s, long after the 100ms burst
  };
  window.cosmosShimmer=async(sh)=>{
    const sr=48000,N=sr*2.0,ctx=new OfflineAudioContext(2,N,sr);
    const o500=ctx.createOscillator(); o500.type='sine'; o500.frequency.value=500;
    const env=ctx.createGain(); env.gain.setValueAtTime(0.5,0); env.gain.setValueAtTime(0.5,0.4); env.gain.linearRampToValueAtTime(0,0.45);
    const dev=deviceByType('cosmos').create(ctx);
    dev.setParams({space:6,size:1.4,time:110,feedback:55,shimmer:sh,shimmerFreq:1000,diffusion:60,tone:9000,preDelay:20,reverse:0,mix:100});
    o500.connect(env); env.connect(dev.input); dev.output.connect(ctx.destination); o500.start();
    const o=mono(await ctx.startRendering());
    const a=Math.floor(sr*0.6),b=N; // measure the TAIL after the note stops
    return { oct: mag(o,1000,sr,a,b), fund: mag(o,500,sr,a,b) };
  };
  window.cosmosReverse=async()=>{
    const sr=48000,N=sr*1.5,ctx=new OfflineAudioContext(2,N,sr);
    const src=ctx.createBufferSource(); src.buffer=noiseBuf(ctx,N,0.1);
    const dev=deviceByType('cosmos').create(ctx);
    dev.setParams({space:5,size:1.2,time:120,feedback:40,shimmer:20,diffusion:60,tone:8000,preDelay:20,reverse:1,mix:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const o=mono(await ctx.startRendering());
    return rms(o,0,N);
  };
` }, bundle: true, write: false, format: 'iife',
});

const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage();
  await p.route('http://localhost:9977/**', (r) => r.fulfill({ body: '<div></div>', contentType: 'text/html' }));
  await p.goto('http://localhost:9977/');
  await p.addScriptTag({ content: bundle.outputFiles[0].text });

  const t0 = await p.evaluate(() => window.echoTail(0));
  const t70 = await p.evaluate(() => window.echoTail(70));
  console.log('echo tail fb0', t0.toExponential(2), 'fb70', t70.toFixed(4));
  assert.ok(t70 > t0 * 3, 'feedback builds a sustained echo tail');

  const toneOpen = await p.evaluate(() => window.echoTone(14000));
  const toneDark = await p.evaluate(() => window.echoTone(1800));
  console.log('echo 7kHz survival tone-open', toneOpen.toFixed(5), 'tone-dark', toneDark.toFixed(5));
  assert.ok(toneOpen > toneDark * 3, 'the Tone control shapes the repeats — a 7 kHz tone survives an open setting but a dark one cuts it');
  const satModern = await p.evaluate(() => window.echoSat(0));
  const satTape = await p.evaluate(() => window.echoSat(1));
  console.log('echo harmonics modern', satModern.toFixed(3), 'tape', satTape.toFixed(3));
  assert.ok(satTape > satModern * 1.5, 'Tape mode adds harmonic saturation to the repeats (Modern stays clean)');

  const duck0 = await p.evaluate(() => window.echoDuck(0));
  const duck100 = await p.evaluate(() => window.echoDuck(100));
  console.log('echo duck off', duck0.toFixed(4), 'on', duck100.toFixed(4));
  assert.ok(duck100 < duck0 * 0.85, 'ducking pulls the wet down while the input plays');

  const cTail = await p.evaluate(() => window.cosmosTail());
  console.log('cosmos tail', cTail.toFixed(4));
  assert.ok(cTail > 1e-3, 'Cosmos sustains a long tail after the input stops');

  const sh0 = await p.evaluate(() => window.cosmosShimmer(0));
  const sh70 = await p.evaluate(() => window.cosmosShimmer(70));
  const r0 = sh0.oct / sh0.fund, r70 = sh70.oct / sh70.fund;
  console.log('cosmos octave/fund shimmer0', r0.toFixed(3), 'shimmer70', r70.toFixed(3));
  assert.ok(r70 > r0 * 1.5, 'Shimmer adds octave-up (1 kHz) energy to a 500 Hz tail — the ascending bloom');

  const rev = await p.evaluate(() => window.cosmosReverse());
  console.log('cosmos reverse RMS', rev.toExponential(2));
  assert.ok(rev > 1e-4, 'Reverse mode renders a backwards swell (a reversed IR ramps up gradually, so it sits lower)');

  console.log('\nPASS — delay wave: Creative Delay (feedback/tape/duck) + Cosmos (sustain/shimmer/reverse)');
} finally { await b.close(); }
