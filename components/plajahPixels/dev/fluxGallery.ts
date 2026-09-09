import { renderFlux, renderFluxLatest } from '../engine/core/flux';
import { FLUX_SCENES, fluxBandsFromFreq, SILENT_AUDIO, type FluxSceneId } from '../../../services/fabula/fluxNode';

const ids:FluxSceneId[]=['tapestry-ii','lattice','tunnel','aurora'];
const subtitles=['Brass / enamel / woven light','Porcelain / copper / orbital motion','Vermilion / monumental rhythm','Jade / violet / spectral silk'];
const $ = <T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('screen'),ctx=canvas.getContext('2d')!;
let selected:FluxSceneId='tapestry-ii', paused=false,demo=true,t=0,last=performance.now(),dirty=true;
let audio:HTMLAudioElement|undefined, audioCtx:AudioContext|undefined,analyser:AnalyserNode|undefined, bins:Uint8Array<ArrayBuffer>|undefined,url:string|undefined;
const nav=document.querySelector('nav')!;
for(const [i,id] of ids.entries()) {
  const info=FLUX_SCENES.find(s=>s.id===id)!;
  const b=document.createElement('button');b.className='tile';b.role='tab';b.dataset.scene=id;
  b.innerHTML=`<span class="n">0${i+1} / ${info.cat.toUpperCase()}</span><strong>${info.name}</strong><span>${subtitles[i]}</span>`;
  b.onclick=()=>select(id);nav.append(b);
}
function select(id:FluxSceneId){selected=id;t=0;dirty=true;const info=FLUX_SCENES.find(s=>s.id===id)!;
  $('title').textContent=info.name;$('description').textContent=info.line;$('category').textContent=`${info.cat.toUpperCase()} / FLUX COLLECTION`;
  nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.scene===id)));
  $('original').textContent=id==='tapestry'?'Return to Deco Tapestry II':'Compare original Deco Tapestry';
}
$('original').onclick=()=>select(selected==='tapestry'?'tapestry-ii':'tapestry');
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Play':'Pause';$('pause').setAttribute('aria-pressed',String(paused));if(audio){if(paused)audio.pause();else void audio.play().catch(showError);}};
$('demo').onclick=()=>{demo=!demo;dirty=true;$('demo').setAttribute('aria-pressed',String(demo));if(demo)audio?.pause();else if(audio&&!paused)void audio.play().catch(showError);};
$('fullscreen').onclick=()=>void document.querySelector('.stage')!.requestFullscreen().catch(showError);
function showError(e:unknown){$('status').textContent=e instanceof Error?e.message:String(e);}
document.querySelector<HTMLElement>('.upload')!.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('audio').click();}};
$<HTMLInputElement>('audio').onchange=async e=>{
  const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
  try {
    audio?.pause();if(url)URL.revokeObjectURL(url);await audioCtx?.close();
    audioCtx=new AudioContext();await audioCtx.resume();audio=new Audio();url=URL.createObjectURL(file);audio.src=url;audio.loop=true;
    const source=audioCtx.createMediaElementSource(audio);analyser=audioCtx.createAnalyser();analyser.fftSize=1024;
    source.connect(analyser);analyser.connect(audioCtx.destination);bins=new Uint8Array(analyser.frequencyBinCount);
    demo=false;paused=false;$('demo').setAttribute('aria-pressed','false');$('pause').textContent='Pause';$('pause').setAttribute('aria-pressed','false');await audio.play();
  }catch(e){showError(e);}
};
function bands(time:number){
  if(demo){const beat=Math.exp(-(time*2%1)*9);return {bass:.28+beat*.55,mid:.3+.18*Math.sin(time*.8),treble:.16+.2*Math.pow(Math.sin(time*3),2),level:.5,beat};}
  if(analyser&&bins){analyser.getByteFrequencyData(bins);return fluxBandsFromFreq(bins);}return SILENT_AUDIO;
}
function size(){const box=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio,1.5);const w=Math.min(1920,Math.round(box.width*dpr)),h=Math.max(2,Math.round(box.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}}
select(selected);size();
try { const first=await renderFlux({scene:selected},canvas.width,canvas.height,t,bands(t));if(!first)throw new Error('Flux needs WebGL2. Check browser GPU acceleration.');ctx.drawImage(first,0,0,canvas.width,canvas.height); }
catch(e){showError(e);}
function tick(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;if(!paused)t+=dt;
  if(!document.hidden){size();if(!paused||dirty){const result=renderFluxLatest({scene:selected},canvas.width,canvas.height,t,bands(t));if(result){ctx.drawImage(result,0,0,canvas.width,canvas.height);dirty=false;}}
    $('status').textContent=paused?'PAUSED':demo?'DEMO RHYTHM · 120 BPM':audio&&!audio.paused?'YOUR AUDIO · LIVE':'SILENT · TIME DRIVEN';}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// Expose the production renderer to the development-only GPU verification script.
(window as any).fluxProof={renderFlux,ids,select,pause:()=>{paused=true;}};
window.addEventListener('pagehide',()=>{audio?.pause();void audioCtx?.close();if(url)URL.revokeObjectURL(url);});
