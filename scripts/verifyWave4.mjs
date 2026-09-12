// Wave 4 + modulation DSP proof (OfflineAudioContext):
//  Tape — saturation harmonics + head-bump low boost + HF rolloff.
//  Exciter — synthesises high harmonics only above the crossover (adds air, not to lows).
//  Ensemble — four decorrelated voices produce a wide (L≠R) chorus.
//  Phaser — more active stages carve more notches (deeper 12-stage sweep).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'ts', contents: `
  import {deviceByType} from './services/melos/beats/fx/devices';
  function mag(o,f,sr,start,end){ const w=2*Math.PI*f/sr,cw=Math.cos(w),coeff=2*cw; let s1=0,s2=0,s0=0; for(let i=start;i<end;i++){s0=o[i]+coeff*s1-s2;s2=s1;s1=s0;} const re=s1-s2*cw,im=s2*Math.sin(w); return Math.sqrt(re*re+im*im)/(end-start); }
  function rms(o,start,end){ let s=0; for(let i=start;i<end;i++)s+=o[i]*o[i]; return Math.sqrt(s/(end-start)); }
  const tone=(ctx,hz,N)=>{ const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=hz; return o; };
  const noise=(ctx,N)=>{ const b=ctx.createBuffer(1,N,ctx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<N;i++)d[i]=(Math.random()*2-1)*0.35; const s=ctx.createBufferSource(); s.buffer=b; return s; };

  // Tape harmonics: 150 Hz tone, drive high vs low → 2f/3f grow
  window.tapeHarm=async(drive)=>{
    const sr=48000,N=sr*0.5,ctx=new OfflineAudioContext(1,N,sr);
    const o=tone(ctx,150,N); const dev=deviceByType('tape').create(ctx);
    dev.setParams({drive,bias:0.1,bump:0,wow:0,flutter:0,tone:18000,hiss:0,output:0,mix:100});
    o.connect(dev.input); dev.output.connect(ctx.destination); o.start();
    const y=(await ctx.startRendering()).getChannelData(0); const a=2048;
    return (mag(y,300,sr,a,N)+mag(y,450,sr,a,N))/mag(y,150,sr,a,N);
  };
  // Tape head bump: 60 Hz tone, bump on vs off
  window.tapeBump=async(bump)=>{
    const sr=48000,N=sr*0.5,ctx=new OfflineAudioContext(1,N,sr);
    const o=tone(ctx,60,N); const g=ctx.createGain(); g.gain.value=0.1; // quiet so the shelf boost stays linear (not clipped by tape sat)
    const dev=deviceByType('tape').create(ctx);
    dev.setParams({drive:0.02,bias:0,bump,bumpFreq:90,wow:0,flutter:0,tone:18000,hiss:0,output:0,mix:100});
    o.connect(g); g.connect(dev.input); dev.output.connect(ctx.destination); o.start();
    const y=(await ctx.startRendering()).getChannelData(0);
    return mag(y,60,sr,2048,N);
  };

  // Exciter: 5 kHz tone (above 3.5k crossover) gets harmonics; 400 Hz tone (below) does NOT
  window.exciter=async(hz,amount)=>{
    const sr=48000,N=sr*0.5,ctx=new OfflineAudioContext(1,N,sr);
    const o=tone(ctx,hz,N); const dev=deviceByType('exciter').create(ctx);
    dev.setParams({freq:3500,amount,blend:0.6,tone:9000,character:0});
    o.connect(dev.input); dev.output.connect(ctx.destination); o.start();
    const y=(await ctx.startRendering()).getChannelData(0); const a=2048;
    return (mag(y,hz*2,sr,a,N)+mag(y,hz*3,sr,a,N))/mag(y,hz,sr,a,N);
  };

  // Ensemble: mono noise in → stereo width (L differs from R)
  window.ensembleWidth=async()=>{
    const sr=48000,N=sr*0.5,ctx=new OfflineAudioContext(2,N,sr);
    const s=noise(ctx,N); const dev=deviceByType('ensemble').create(ctx);
    dev.setParams({rate:0.6,depth:0.6,width:100,mix:100});
    s.connect(dev.input); dev.output.connect(ctx.destination); s.start();
    const rb=await ctx.startRendering(); const L=rb.getChannelData(0),R=rb.getChannelData(1);
    let diff=0,en=0; for(let i=4096;i<N;i++){ const d=L[i]-R[i]; diff+=d*d; en+=(L[i]*L[i]+R[i]*R[i])*0.5; }
    return Math.sqrt(diff/en); // side/mid ratio — 0 = mono, >0 = wide
  };

  // Phaser ripple: park the LFO (depth 0) so the comb notches are static, then measure the spectral
  // RIPPLE (coefficient of variation across the band). More stages = more/deeper notches = more ripple.
  window.phaserRipple=async(stages)=>{
    const sr=48000,N=sr*0.6,ctx=new OfflineAudioContext(1,N,sr);
    const s=noise(ctx,N); const dev=deviceByType('phaser').create(ctx);
    dev.setParams({rate:0.02,depth:0,center:700,stages,feedback:30,mix:100});
    s.connect(dev.input); dev.output.connect(ctx.destination); s.start();
    const y=(await ctx.startRendering()).getChannelData(0);
    const vals=[]; for(let f=250;f<=7000;f*=1.12) vals.push(mag(y,f,sr,4096,N));
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const varr=vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/vals.length;
    return Math.sqrt(varr)/mean; // coefficient of variation = how rippled the spectrum is
  };
` }, bundle: true, write: false, format: 'iife',
});

const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage();
  await p.route('http://localhost:9977/**', (r) => r.fulfill({ body: '<div></div>', contentType: 'text/html' }));
  await p.goto('http://localhost:9977/');
  await p.addScriptTag({ content: bundle.outputFiles[0].text });

  const tapeLo = await p.evaluate(() => window.tapeHarm(0.05));
  const tapeHi = await p.evaluate(() => window.tapeHarm(0.9));
  console.log('tape harmonics drive-lo', tapeLo.toFixed(4), 'drive-hi', tapeHi.toFixed(4));
  assert.ok(tapeHi > tapeLo * 1.5, 'Tape saturation adds harmonics as drive rises (over an intentional warmth floor)');
  const bump0 = await p.evaluate(() => window.tapeBump(0));
  const bump9 = await p.evaluate(() => window.tapeBump(9));
  console.log('tape 60Hz bump-off', bump0.toFixed(4), 'bump+9', bump9.toFixed(4));
  assert.ok(bump9 > bump0 * 1.5, 'Head bump lifts the lows');

  const exHi = await p.evaluate(() => window.exciter(5000, 0.8));
  const exHiClean = await p.evaluate(() => window.exciter(5000, 0));
  const exLo = await p.evaluate(() => window.exciter(400, 0.8));
  console.log('exciter 5kHz harm on', exHi.toFixed(4), 'off', exHiClean.toFixed(4), '| 400Hz harm', exLo.toFixed(4));
  assert.ok(exHi > exHiClean * 3, 'Exciter synthesises harmonics on content above the crossover');
  assert.ok(exHi > exLo * 3, 'Exciter leaves lows (below the crossover) alone — it only excites the highs');

  const width = await p.evaluate(() => window.ensembleWidth());
  console.log('ensemble side/mid width', width.toFixed(3));
  assert.ok(width > 0.3, 'Ensemble decorrelates into a wide stereo image from a mono source');

  const rip4 = await p.evaluate(() => window.phaserRipple(4));
  const rip12 = await p.evaluate(() => window.phaserRipple(12));
  console.log('phaser spectral ripple stages-4', rip4.toFixed(4), 'stages-12', rip12.toFixed(4));
  assert.ok(rip12 > rip4 * 1.15, '12 stages carve more/deeper notches than 4 (richer phaser sweep)');

  console.log('\nPASS — Wave 4: Tape (saturation+bump) + Exciter (highs-only harmonics) + Ensemble (wide) + 12-stage Phaser');
} finally { await b.close(); }
