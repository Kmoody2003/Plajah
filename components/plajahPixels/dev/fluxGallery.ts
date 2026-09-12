import { renderFlux, renderFluxLatest } from '../engine/core/flux';
import { FLUX_SCENES, SILENT_AUDIO, type FluxSceneId, type FluxAudio } from '../../../services/fabula/fluxNode';
import { createFluxTestWav } from '../../../services/fabula/fluxTestGroove';
import { FluxMusicSampler } from '../../../services/fabula/fluxMusic';
import { DECO_SEEDS } from '../../../services/fabula/decoPatterns';
let decoSeed=-1;
const seedSelect=document.createElement('select');seedSelect.setAttribute('aria-label','Deco arrangement');seedSelect.style.cssText='background:#10262b;color:#e3cca4;padding:10px;border:1px solid #536057;max-width:240px';
seedSelect.innerHTML='<option value="-1">Music conducts · 24 arrangements</option>'+DECO_SEEDS.map((name,i)=>'<option value="'+i+'">'+name+'</option>').join('');
seedSelect.onchange=()=>{decoSeed=Number(seedSelect.value);};
document.querySelector('.controls')!.append(seedSelect);
const music=new FluxMusicSampler();
let trackTempo:{bpm:number;confidence:number;firstBeatSec:number}|undefined;
async function analyseTempo(blob:Blob){
  const decoded=await audioCtx!.decodeAudioData(await blob.arrayBuffer());
  const offline=new OfflineAudioContext(1,Math.ceil(Math.min(90,decoded.duration)*12000),12000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const samples=(await offline.startRendering()).getChannelData(0);
  const worker=new Worker(new URL('../../../services/fabula/fluxTempo.worker.ts',import.meta.url),{type:'module'});
  return new Promise<typeof trackTempo>(resolve=>{
    const finish=(value:typeof trackTempo)=>{clearTimeout(timer);worker.terminate();resolve(value);};
    const timer=setTimeout(()=>finish(undefined),15000);
    worker.onmessage=e=>finish(e.data);worker.onerror=()=>finish(undefined);
    worker.postMessage({samples,sampleRate:12000},[samples.buffer]);
  });
}

const ids:FluxSceneId[]=['tapestry-ii','porcelain-tide','velvet-bloom','prism-archive'];
const subtitles=['Brass sunburst / morphing architecture','Ceramic scales / copper crests','Pleated silk / opening sculpture','Dichroic glass / spectral pages'];
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('screen'),ctx=canvas.getContext('2d')!;
let selected:FluxSceneId='tapestry-ii',paused=false,t=0,last=performance.now(),dirty=true,sensitivity=1.5;
let audio:HTMLAudioElement|undefined,audioCtx:AudioContext|undefined,analyser:AnalyserNode|undefined;
let bins:Uint8Array<ArrayBuffer>|undefined,url:string|undefined,sourceName='',failure='',loading=false;
let measured:FluxAudio={...SILENT_AUDIO};
const nav=document.querySelector('nav')!;
for(const [i,id] of ids.entries()){
  const info=FLUX_SCENES.find(s=>s.id===id)!;
  const b=document.createElement('button');b.className='tile';b.role='tab';b.dataset.scene=id;
  b.innerHTML=`<span class="n">0${i+1} / ${info.cat.toUpperCase()}</span><strong>${info.name}</strong><span>${subtitles[i]}</span>`;
  b.onclick=()=>select(id);nav.append(b);
}
function select(id:FluxSceneId){selected=id;t=0;dirty=true;const info=FLUX_SCENES.find(s=>s.id===id)!;
  $('title').textContent=info.name;$('description').textContent=info.line;$('category').textContent=`${info.cat.toUpperCase()} / FLUX ATELIER`;
  nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.scene===id)));
  $('original').textContent=id==='tapestry'?'Return to Deco Tapestry II':'Compare original Deco Tapestry';
}
function updatePause(){ $('pause').textContent=paused?'Play':'Pause';$('pause').setAttribute('aria-pressed',String(paused)); }
$('original').onclick=()=>select(selected==='tapestry'?'tapestry-ii':'tapestry');
$('pause').onclick=async()=>{paused=!paused;updatePause();if(audio){if(paused)audio.pause();else try{await audioCtx?.resume();await audio.play();}catch(e){showError(e);}}};
$('fullscreen').onclick=()=>void document.querySelector('.stage')!.requestFullscreen().catch(showError);
function showError(e:unknown){failure=e instanceof Error?e.message:String(e);}
async function playFile(blob:Blob,name:string){
  if(loading)return;loading=true;failure='';
  try{
    audio?.pause();await audioCtx?.close();if(url)URL.revokeObjectURL(url);
    audioCtx=new AudioContext();await audioCtx.resume();audio=new Audio();url=URL.createObjectURL(blob);audio.src=url;audio.loop=true;
    const source=audioCtx.createMediaElementSource(audio);analyser=audioCtx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.45;
    source.connect(analyser);analyser.connect(audioCtx.destination);bins=new Uint8Array(analyser.frequencyBinCount);
    sourceName=name;audio.onerror=()=>showError('This audio file could not be decoded. Try WAV, MP3 or M4A.');
    music.reset();trackTempo=undefined;
    try{trackTempo=await analyseTempo(blob);}catch{ /* Live estimator remains available. */ }
    await audio.play();paused=false;dirty=true;updatePause();
  }catch(e){showError(e);}finally{loading=false;}
}
$('demo').onclick=()=>void playFile(new Blob([createFluxTestWav()],{type:'audio/wav'}),'Test groove · 120 BPM');
document.querySelector<HTMLElement>('.upload')!.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('audio').click();}};
$<HTMLInputElement>('audio').onchange=e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)void playFile(file,file.name);};
$<HTMLInputElement>('response').oninput=e=>{sensitivity=Number((e.target as HTMLInputElement).value);$('response-value').textContent=sensitivity.toFixed(1)+'×';dirty=true;};
function bands():FluxAudio{
  if(analyser&&bins&&audio&&!audio.paused){
    analyser.getByteFrequencyData(bins);const result=music.sample(bins,audio.currentTime,analyser.context.sampleRate);
    if(trackTempo&&trackTempo.confidence>.2)Object.assign(result,{bpm:trackTempo.bpm,tempoConfidence:trackTempo.confidence,beatPosition:Math.max(0,(audio.currentTime-trackTempo.firstBeatSec)*trackTempo.bpm/60)});
    return result;
  }
  return {...SILENT_AUDIO};
}
function size(){const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
  const w=Math.max(2,Math.min(1600,Math.round(box.width*dpr))),h=Math.max(2,Math.round(w*box.height/Math.max(1,box.width)));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}
}
select(selected);size();
try{const first=await renderFlux({scene:selected,sensitivity,decoSeed},canvas.width,canvas.height,0,SILENT_AUDIO);if(!first)throw new Error('Flux needs WebGL2. Check browser GPU acceleration.');ctx.drawImage(first,0,0,canvas.width,canvas.height);}catch(e){showError(e);}
function tick(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;if(!paused)t+=dt;
  if(!document.hidden){size();measured=bands();
    if(!paused||dirty){const result=renderFluxLatest({scene:selected,sensitivity,decoSeed},canvas.width,canvas.height,t,measured);if(result){ctx.drawImage(result,0,0,canvas.width,canvas.height);dirty=false;}}
    for(const key of ['bass','mid','treble'] as const){$(`meter-${key}`).style.transform=`scaleX(${measured[key]})`;}

    $('music-state').textContent=sourceName?`${(measured.tempoConfidence??0)>.2?Math.round(measured.bpm??120)+' BPM':'Learning tempo'} · Intensity ${Math.round((measured.intensity??0)*100)}% · Vocal estimate ${Math.round((measured.voice??0)*100)}%${selected==='tapestry-ii'?' · '+(decoSeed<0?'24 arrangements · music conducted':DECO_SEEDS[decoSeed]):''}`:'';
    $('audio-state').textContent=failure|| (loading?'Loading audio…':sourceName?`${sourceName}${paused?' · paused':measured.level>.025?' · signal detected':' · quiet passage'}`:'No audio input. Choose your music or play the audible test groove.');
    $('status').textContent=failure?'AUDIO / RENDER ERROR':paused?'PAUSED':sourceName?'ANALYSING AUDIO':'NO AUDIO INPUT';
  }requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
(window as any).fluxProof={renderFlux,ids,select,getAudio:()=>({...measured,sourceName,currentTime:audio?.currentTime??0}),getScene:()=>selected,createFluxTestWav};
window.addEventListener('pagehide',()=>{audio?.pause();void audioCtx?.close();if(url)URL.revokeObjectURL(url);});
