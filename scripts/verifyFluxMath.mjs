import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:5176/flux-gallery.html',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.fluxProof,{timeout:60000});
  const results=await page.evaluate(async()=>{
    const p=window.fluxProof, out=[];
    document.getElementById('pause').click();
    const silent={bass:0,mid:0,treble:0,level:0,beat:0};
    const loud={bass:1,mid:.8,treble:.9,level:.9,beat:1,voice:.7};
    const read=c=>{const ctx=document.createElement('canvas');ctx.width=320;ctx.height=180;const g=ctx.getContext('2d');g.drawImage(c,0,0,320,180);return Array.from(g.getImageData(0,0,320,180).data);};
    for(const id of p.ids.filter(id=>id.startsWith('math-'))){
      const a=read(await p.renderFlux({scene:id,director:false},320,180,0,silent));
      const b=read(await p.renderFlux({scene:id,director:false},320,180,24,silent));
      const c=read(await p.renderFlux({scene:id,director:false},320,180,24,loud));
      let visible=0,loop=0,response=0;for(let i=0;i<a.length;i+=4){if(a[i]+a[i+1]+a[i+2]>65)visible++;loop+=Math.abs(a[i]-b[i]);response+=Math.abs(c[i]-b[i]);}
      out.push({id,visible,loop,response});
    }
    const base=read(await p.renderFlux({scene:'math-hopf',director:false},320,180,0,silent));
    for(let band=0;band<16;band++){
      const spectrum=Array(16).fill(0);spectrum[band]=1;
      const img=read(await p.renderFlux({scene:'math-hopf',director:false},320,180,24*(band+1),{...silent,spectrum}));
      let delta=0;for(let i=0;i<img.length;i+=4)delta+=Math.abs(img[i]-base[i]);
      if(delta<1000)throw new Error('Frequency region '+band+' failed to move the image');
    }
    // Director and moving volume must also render at multiple live shot times.
    const signatures=new Set();
    for(const [name,audio] of Object.entries({kick:{beat:1},snare:{treble:1},bass:{bass:.7},harmony:{harmony:1,harmonicHue:.4},voice:{voice:1}})){
      const quiet=read(await p.renderFlux({scene:'math-hopf',director:false},320,180,0,silent));
      const img=read(await p.renderFlux({scene:'math-hopf',director:false},320,180,1/60,{...silent,...audio}));
      let delta=0,signature=0;for(let i=0;i<img.length;i+=4){delta+=Math.abs(img[i]-quiet[i]);signature=(signature+img[i]*(i+1))%1000000007;}
      if(delta<500)throw new Error(name+' has no visible isolated response');
      signatures.add(signature);
    }
    if(signatures.size!==5)throw new Error('Music roles did not produce distinct images');
    for(let t=0;t<=40;t++){
      const img=read(await p.renderFlux({scene:'math-morph'},320,180,t,loud));
      let detail=0;for(let i=0;i<img.length;i+=4)if(img[i]+img[i+1]+img[i+2]>400)detail++;
      if(detail<30)throw new Error('Empty or badly framed director shot at '+t);
    }
    return out;
  });
  for(const r of results){assert.ok(r.visible>100,`${r.id}: visible geometry`);assert.ok(r.response>100,`${r.id}: music changes image`);if(r.id!=='math-morph')assert.ok(r.loop<1000,`${r.id}: closed base cycle`);}
  assert.equal(errors.length,0,errors.join('\n'));
  const wav=await page.evaluate(()=>Array.from(new Uint8Array(window.fluxProof.createFluxTestWav())));
  await page.locator('#audio').setInputFiles({name:'upload-proof.wav',mimeType:'audio/wav',buffer:Buffer.from(wav)});
  await page.waitForFunction(()=>window.fluxProof.getAudio().currentTime>.3&&window.fluxProof.getAudio().level>.025,{timeout:30000});
  assert.match(await page.locator('#audio-state').textContent(),/upload-proof/);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Local upload, decoding, playback and measured audio response passed.');
  await page.locator('[data-scene="math-hopf"]').click();
  await page.screenshot({path:'flux-math-preview.png',fullPage:true});
  console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
