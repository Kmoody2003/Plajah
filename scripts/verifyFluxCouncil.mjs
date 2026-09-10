import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const output='artifacts/flux-council';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  const errors=[],externalErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{
    if(m.type()!=='error')return;
    // Catalog imports initialize Firebase; its debug token is not authorized in this test browser.
    if(m.location().url.startsWith('https://content-firebaseappcheck.googleapis.com/'))externalErrors.push('Firebase App Check rejected the test browser');
    else errors.push(m.text());
  });
  await page.goto('http://localhost:3000/flux-gallery.html');
  await page.waitForFunction(()=>window.fluxProof,{timeout:60000});
  await page.getByRole('button',{name:'Play test groove',exact:true}).click();
  const grooveHandle=await page.waitForFunction(()=>{const a=window.fluxProof.getAudio();return a.level>.12?a:false;},null,{timeout:30000});
  const grooveSignal=await grooveHandle.jsonValue();
  assert.ok(grooveSignal.currentTime>0 && grooveSignal.sourceName.includes('Test groove'),'actual PCM playback feeds analyser');
  const wav=await page.evaluate(()=>btoa(Array.from(new Uint8Array(window.fluxProof.createFluxTestWav()),v=>String.fromCharCode(v)).join('')));
  await page.locator('#audio').setInputFiles({name:'flux-audio-proof.wav',mimeType:'audio/wav',buffer:Buffer.from(wav,'base64')});
  const fileHandle=await page.waitForFunction(()=>{const a=window.fluxProof.getAudio();return a.sourceName==='flux-audio-proof.wav'&&a.level>.18?a:false;},null,{timeout:30000});
  const fileSignal=await fileHandle.jsonValue();
  await writeFile(`${output}/audio-input-proof.json`,JSON.stringify({grooveSignal,fileSignal},null,2));
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Play',exact:true}).getAttribute('aria-pressed'),'true');
  const results=[];
  const registrations=await page.evaluate(async()=>{
    const {presetShelf,filterItems}=await import('/services/universalLibrary/libraryModel.ts');
    const {MODE_TO_FLUX_SCENE}=await import('/components/plajahPixels/types.ts');
    return filterItems(presetShelf(),'templates','').filter(item=>['tapestry-ii','porcelain-tide','velvet-bloom','prism-archive'].includes(MODE_TO_FLUX_SCENE[item.preview.genMode])).map(item=>({name:item.name,mode:item.preview.genMode}));
  });
  assert.equal(registrations.length,4,'all four visualizers are selectable generator presets');
  await writeFile(`${output}/preset-registrations.json`,JSON.stringify(registrations,null,2));
  for(const [index,name] of Array.from({length:24},(_,i)=>'seed-'+String(i+1).padStart(2,'0')).entries()){
    const png=await page.evaluate(async({index,fileSignal})=>{
      const a={...fileSignal,beatPosition:index*16,intensity:.7,voice:.35};
      await window.fluxProof.renderFlux({scene:'tapestry-ii',decoSeed:index},960,540,19,a);
      const c=await window.fluxProof.renderFlux({scene:'tapestry-ii',decoSeed:index},960,540,20,a);
      return c.toDataURL();
    },{index,fileSignal});
    await writeFile(`${output}/deco-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
  }
  for(const id of ['tapestry-ii','porcelain-tide','velvet-bloom','prism-archive']){
    const r=await page.evaluate(async ({id,fileSignal})=>{
      const {renderFlux}=window.fluxProof;
      const silent={bass:0,mid:0,treble:0,level:0,beat:0};
      const loud=fileSignal;
      const capture=async(t,a)=>{
        // A seek primes the driver's documented snap behaviour, independent of the gallery.
        await renderFlux({scene:id,sensitivity:1.5},960,540,t-1,a);
        const c=await renderFlux({scene:id,sensitivity:1.5},960,540,t,a);if(!c)throw Error(`${id}: no canvas`);
        const copy=document.createElement('canvas');copy.width=960;copy.height=540;
        const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);return {pixels:ctx.getImageData(0,0,960,540).data,png:copy.toDataURL()};
      };
      const quiet=await capture(8,silent),active=await capture(8,loud),later=await capture(14,loud);
      let lit=0,audioDiff=0,timeDiff=0,sum=0;
      for(let i=0;i<active.pixels.length;i+=4){const l=(active.pixels[i]+active.pixels[i+1]+active.pixels[i+2])/3;sum+=l;if(l>30)lit++;
        for(let j=0;j<3;j++){audioDiff+=Math.abs(active.pixels[i+j]-quiet.pixels[i+j]);timeDiff+=Math.abs(active.pixels[i+j]-later.pixels[i+j]);}}
      const n=960*540;return {id,lit:lit/n,mean:sum/n,audioDiff:audioDiff/(n*3),timeDiff:timeDiff/(n*3),png:active.png,quiet:quiet.png,later:later.png};
    },{id,fileSignal});
    for(const key of ['png','quiet','later']){await writeFile(`${output}/${id}${key==='png'?'':'-'+key}.png`,Buffer.from(r[key].split(',')[1],'base64'));delete r[key];}
    console.log(JSON.stringify(r));
    assert.ok(r.lit>.025,`${id}: visible geometry`);assert.ok(r.audioDiff>2,`${id}: substantial real-audio response`);assert.ok(r.timeDiff>(id==='tapestry-ii'?.01:.5),`${id}: transformation over time`);results.push(r);
  }
  // Gallery selection and pause controls work on both desktop and phone sizes.
  await page.getByRole('tab',{name:/Prism Archive/}).click();await page.waitForFunction(()=>document.getElementById('title').textContent==='Prism Archive');
  await page.getByRole('tab',{name:/Deco Tapestry II/}).click();
  await page.getByRole('button',{name:'Compare original Deco Tapestry',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('title').textContent==='Deco Tapestry');
  await page.screenshot({path:`${output}/original-comparison.png`});
  await page.getByRole('button',{name:'Return to Deco Tapestry II',exact:true}).click();
  await page.screenshot({path:`${output}/gallery-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
  await page.screenshot({path:`${output}/gallery-phone.png`,fullPage:true});
  assert.deepEqual(errors,[],'No browser or GPU shader errors');
  await writeFile(`${output}/external-service-notes.json`,JSON.stringify(externalErrors));
  await writeFile(`${output}/gpu-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
