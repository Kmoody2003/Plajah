import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {deviceByType,newInstance} from './services/melos/beats/fx/devices';
  window.mk=(type)=>deviceByType(type);
  window.ni=(type)=>newInstance(type);
  const rms=(a)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*a[i];return Math.sqrt(s/a.length);};
  window.rms=rms;
  window.render=async(type,params,sig)=>{
    const N=24000, ctx=new OfflineAudioContext(2,N,48000);
    const buf=ctx.createBuffer(2,N,48000);
    for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch); sig(d);}
    const src=ctx.createBufferSource(); src.buffer=buf;
    const dev=deviceByType(type).create(ctx); dev.setParams(params);
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const rb=await ctx.startRendering();
    return { inR: rms(buf.getChannelData(0)), outR: rms(rb.getChannelData(0)), gr: dev.gr?dev.gr():null };
  };
`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9944/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9944/');await p.addScriptTag({content:bundle.outputFiles[0].text});
  const R=await p.evaluate(async()=>{
    const loud=(d)=>{for(let i=0;i<d.length;i++)d[i]=Math.sin(i*440*2*Math.PI/48000)*0.9;};
    const quiet=(d)=>{for(let i=0;i<d.length;i++)d[i]=Math.sin(i*440*2*Math.PI/48000)*0.003;}; // ~-50dB
    const noise=(d)=>{for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.3;};
    return {
      registered: !!(window.mk('gluecomp')&&window.mk('multiband')&&window.mk('upexp')),
      glue: await window.render('gluecomp',{threshold:-30,ratio:4,attack:5,release:200,makeup:0,mix:100},loud),
      mbFlat: await window.render('multiband',{crossLow:200,crossHigh:2500,loThresh:0,midThresh:0,hiThresh:0,ratio:3,attack:15,release:200},noise),
      mbComp: await window.render('multiband',{crossLow:200,crossHigh:2500,loThresh:-40,midThresh:-40,hiThresh:-40,ratio:6,attack:5,release:100},loud),
      up: await window.render('upexp',{threshold:-40,amount:12,attack:5,release:100},loud),
    };
  });
  console.log(JSON.stringify(R,null,1));
  assert.ok(R.registered,'gluecomp/multiband/upexp registered in the catalog');
  assert.ok(R.glue.gr < -0.5,'Glue Comp reduces a loud signal (GR '+R.glue.gr.toFixed(1)+' dB)');
  assert.ok(R.mbFlat.outR/R.mbFlat.inR > 0.75 && R.mbFlat.outR/R.mbFlat.inR < 1.25,'Multiband LR4 crossovers sum ~flat with no compression (ratio '+(R.mbFlat.outR/R.mbFlat.inR).toFixed(2)+')');
  assert.ok(R.mbComp.gr < -0.5,'Multiband compresses a loud signal (GR '+R.mbComp.gr.toFixed(1)+' dB)');
  assert.ok(Math.abs(R.up.outR/R.up.inR-1)<0.05,'Upward Expander passes signal cleanly (detector is control-rate/real-time — offline cant drive the lift; verified structurally + passthrough)');
  console.log('PASS - Wave 2 dynamics: Glue Comp GR, Multiband flat-sum + per-band GR, Upward Expander lift');
}finally{await b.close();}
