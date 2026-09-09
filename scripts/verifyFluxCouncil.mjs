import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const output='artifacts/flux-council';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:3000/flux-gallery.html');
  await page.waitForFunction(()=>window.fluxProof,{timeout:60000});
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Play',exact:true}).getAttribute('aria-pressed'),'true');
  const results=[];
  for(const id of ['tapestry-ii','lattice','tunnel','aurora']){
    const r=await page.evaluate(async id=>{
      const {renderFlux}=window.fluxProof;
      const silent={bass:0,mid:0,treble:0,level:0,beat:0};
      const loud={bass:.8,mid:.65,treble:.7,level:.8,beat:.8};
      const capture=async(t,a)=>{
        // A seek primes the driver's documented snap behaviour, independent of the gallery.
        await renderFlux({scene:id},960,540,t-1,a);
        const c=await renderFlux({scene:id},960,540,t,a);if(!c)throw Error(`${id}: no canvas`);
        const copy=document.createElement('canvas');copy.width=960;copy.height=540;
        const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);return {pixels:ctx.getImageData(0,0,960,540).data,png:copy.toDataURL()};
      };
      const quiet=await capture(8,silent),active=await capture(8,loud),later=await capture(12,loud);
      let lit=0,audioDiff=0,timeDiff=0,sum=0;
      for(let i=0;i<active.pixels.length;i+=4){const l=(active.pixels[i]+active.pixels[i+1]+active.pixels[i+2])/3;sum+=l;if(l>30)lit++;
        for(let j=0;j<3;j++){audioDiff+=Math.abs(active.pixels[i+j]-quiet.pixels[i+j]);timeDiff+=Math.abs(active.pixels[i+j]-later.pixels[i+j]);}}
      const n=960*540;return {id,lit:lit/n,mean:sum/n,audioDiff:audioDiff/(n*3),timeDiff:timeDiff/(n*3),png:active.png};
    },id);
    await writeFile(`${output}/${id}.png`,Buffer.from(r.png.split(',')[1],'base64'));delete r.png;
    console.log(JSON.stringify(r));
    assert.ok(r.lit>.025,`${id}: visible geometry`);assert.ok(r.audioDiff>.1,`${id}: audio response`);assert.ok(r.timeDiff>.1,`${id}: motion`);results.push(r);
  }
  // Gallery selection and pause controls work on both desktop and phone sizes.
  await page.getByRole('tab',{name:/Flux Aurora/}).click();await page.waitForFunction(()=>document.getElementById('title').textContent==='Flux Aurora');
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
  await writeFile(`${output}/gpu-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
