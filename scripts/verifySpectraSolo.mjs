import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {SpectraEQ,bandId} from './services/melos/beats/fx/spectraEq';
  window.run=async()=>{
    const render=async(solo)=>{
      const ctx=new OfflineAudioContext(1,48000,48000);
      // white noise
      const buf=ctx.createBuffer(1,48000,48000); const d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      const src=ctx.createBufferSource(); src.buffer=buf;
      const eq=new SpectraEQ(ctx);
      const bands=[{id:'b1',freq:1000,gain:0,q:1,type:'bell',on:true}];
      eq.setState({on:true,mode:5,bands,solo:solo?'b1':undefined});
      src.connect(eq.input); eq.output.connect(ctx.destination); src.start();
      const rb=await ctx.startRendering(); const o=rb.getChannelData(0);
      let s=0; for(let i=0;i<o.length;i++)s+=o[i]*o[i]; return Math.sqrt(s/o.length);
    };
    const flat=await render(false); const solo=await render(true);
    return {flat,solo,ratio:solo/flat};
  };`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9922/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9922/');await p.addScriptTag({content:bundle.outputFiles[0].text});
  const r=await p.evaluate(()=>window.run());
  console.log('RESULT',JSON.stringify(r));
  assert.ok(r.flat>0.4,'flat EQ passes broadband white noise ~unchanged');
  assert.ok(r.solo < r.flat*0.35,'band-solo band-limits to 1kHz — most broadband energy removed');
  console.log('PASS — SpectraEQ band-solo routes through a band-pass (output RMS drops '+((1-r.ratio)*100|0)+'%)');
}finally{await b.close();}
