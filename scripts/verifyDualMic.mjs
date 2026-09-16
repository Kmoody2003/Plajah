import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {deviceByType} from './services/melos/beats/fx/devices';
  window.hi=async(blend)=>{
    const N=24000, ctx=new OfflineAudioContext(1,N,48000);
    const buf=ctx.createBuffer(1,N,48000); const d=buf.getChannelData(0);
    for(let i=0;i<N;i++)d[i]=(Math.random()*2-1)*0.4;
    const src=ctx.createBufferSource();src.buffer=buf;
    const dev=deviceByType('amprig').create(ctx);
    dev.setParams({amp:0,gain:0.25,bass:0.5,mid:0.5,treble:0.5,presence:0.5,resonance:0.4,sagAmt:0.2,master:0.7,cab:3,mic:0,micEdge:0.4,mic2:2,micBlend:blend,pedal1On:0,pedal1:0,pedal1Drive:0.4,pedal2On:0,pedal2:3,pedal2Drive:0.4});
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=4000; hp.Q.value=0.7;
    src.connect(dev.input); dev.output.connect(hp); hp.connect(ctx.destination); src.start();
    const rb=await ctx.startRendering(); const o=rb.getChannelData(0);
    let s=0; for(let i=0;i<o.length;i++)s+=o[i]*o[i]; return Math.sqrt(s/o.length);
  };`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9977/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9977/');await p.addScriptTag({content:bundle.outputFiles[0].text});
  const R=await p.evaluate(async()=>({mic1:await window.hi(0),mid:await window.hi(0.5),mic2:await window.hi(1)}));
  console.log(JSON.stringify(R));
  assert.ok(R.mic1>0&&R.mic2>0,'both mic settings pass audio');
  assert.ok(Math.abs(R.mic2-R.mic1)/R.mic1 > 0.05,'blending to mic 2 changes the top end (dual-mic is real): '+((R.mic2/R.mic1-1)*100|0)+'% high-band shift');
  const lo=Math.min(R.mic1,R.mic2), hi=Math.max(R.mic1,R.mic2);
  assert.ok(R.mid>=lo*0.9 && R.mid<=hi*1.1,'50/50 blend sits between the two mics');
  console.log('PASS - dual-mic: blend crossfades two distinct mic responses (mic1 57 vs mic2 condenser), 50/50 in between');
}finally{await b.close();}
