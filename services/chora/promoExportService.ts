import { zipSync, strToU8 } from 'fflate';
import type { PromoRecipe, PromoRelease, PromoFormat, PromoTemplateId } from './promoTypes';
import { PROMO_FORMATS, PROMO_SUITES } from './promoTypes';
import { createPromoScene, promoSceneSvg, promoTelaDocument, type PromoArtwork, type PromoScene } from './promoPresets';
import { layoutTextLines, fontShorthand } from '../tela/telaText';
import { ensureFontsForObjects } from '../tela/telaFonts';
import { objectsToSvg } from '../tela/telaSvg';
import { promoCaption } from './promoGeneratorService';
import type { TelaVectorObject } from '../../types';

export const promoFilename = (s: string) => s.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'chora-release';
export function downloadPromo(blob: Blob, name: string): void {
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function abortCheck(signal?: AbortSignal): void { signal?.throwIfAborted(); }
export function loadImage(src:string,signal?:AbortSignal):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const cleanup=()=>{signal?.removeEventListener('abort',abort);clearTimeout(timer);image.onload=null;image.onerror=null;};
    const abort=()=>{cleanup();image.src='';reject(new DOMException('Export canceled.','AbortError'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error('Artwork took too long to load. Try again.'));},20000);
    image.onload=()=>{cleanup();resolve(image);};
    image.onerror=()=>{cleanup();reject(new Error('Artwork could not be decoded. Use a PNG, JPEG, or WebP cover.'));};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}image.src=src;
  });
}
/** Rasterize remote artwork once. Self-contained SVG/ZIP/Tela assets can then
 * travel without an expired URL or a browser CORS dependency. */
export async function preparePromoArtwork(url:string,signal?:AbortSignal):Promise<PromoArtwork>{
  if(!url)throw new Error('Add cover artwork to this release first.');
  const result=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
  if(!result.ok)throw new Error('Cover artwork could not be loaded ('+result.status+').');
  const blob=await result.blob();
  if(blob.size>30*1024*1024)throw new Error('Cover artwork must be smaller than 30 MB.');
  const objectUrl=URL.createObjectURL(blob);
  try{
    const image=await loadImage(objectUrl,signal),scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);abortCheck(signal);
    return {url:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height};
  }finally{URL.revokeObjectURL(objectUrl);}
}
export async function readyPromoFonts(objects:TelaVectorObject[]):Promise<void>{
  ensureFontsForObjects(objects);
  if(!document.fonts)return;
  // Explicit loads initiate fetching; fonts.ready alone can resolve before a new stylesheet.
  const requests=Array.from(new Set(objects.filter(o=>o.kind==='TEXT').map(fontShorthand)));
  await Promise.race([
    Promise.all(requests.map(font=>document.fonts.load(font))),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('The design fonts are still loading. Try the export again.')),12000)),
  ]);
}
/** Render non-text vectors with the canonical SVG renderer, then native canvas
 * text using loaded fonts. SVG-as-image does not reliably load web fonts. */
export async function promoCanvas(scene:PromoScene,signal?:AbortSignal):Promise<HTMLCanvasElement>{
  abortCheck(signal);await readyPromoFonts(scene.objects);
  const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
  const svg=objectsToSvg(scene.objects.filter(o=>o.kind!=='TEXT'),scene.width,scene.height);
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{const image=await loadImage(url,signal);ctx.drawImage(image,0,0);}finally{URL.revokeObjectURL(url);}
  for(const o of scene.objects.filter(o=>o.kind==='TEXT')){
    ctx.save();ctx.globalAlpha=o.opacity;ctx.font=fontShorthand(o);ctx.textBaseline='alphabetic';
    ctx.textAlign=o.textAlign||'left';
    if('letterSpacing' in ctx)(ctx as CanvasRenderingContext2D & {letterSpacing:string}).letterSpacing=((o.letterSpacing||0)*(o.fontSize||24))+'px';
    if(o.gradient){
      const g=o.gradient.kind==='RADIAL'?ctx.createRadialGradient(o.x+o.w/2,o.y+o.h/2,0,o.x+o.w/2,o.y+o.h/2,Math.max(o.w,o.h)/2):ctx.createLinearGradient(o.x,o.y,o.x+o.w,o.y+o.h);
      o.gradient.stops.forEach(s=>g.addColorStop(s.offset,s.color));ctx.fillStyle=g;
    }else ctx.fillStyle=o.fill;
    if(o.rotation){ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.rotate(o.rotation*Math.PI/180);ctx.translate(-o.x-o.w/2,-o.y-o.h/2);}
    const size=o.fontSize||24,x=o.textAlign==='center'?o.x+o.w/2:o.textAlign==='right'?o.x+o.w:o.x;
    layoutTextLines(o).forEach((line,i)=>ctx.fillText(line,x,o.y+size+i*size*(o.lineHeight||1.22),o.w));
    ctx.restore();
  }
  abortCheck(signal);return canvas;
}
export function canvasBlob(canvas:HTMLCanvasElement):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed.')),'image/png'));
}
export async function exportPromoPng(scene:PromoScene,signal?:AbortSignal):Promise<Blob>{return canvasBlob(await promoCanvas(scene,signal));}
export async function exportPromoBundle(release:PromoRelease,recipe:PromoRecipe,directUrl:string,artwork:PromoArtwork,onProgress:(label:string)=>void,signal?:AbortSignal):Promise<Blob>{
  const files:Record<string,Uint8Array>={},scenes:PromoScene[]=[];
  for(const suite of PROMO_SUITES)for(const format of Object.keys(PROMO_FORMATS) as PromoFormat[]){
    abortCheck(signal);onProgress(suite.name+' · '+PROMO_FORMATS[format].label);
    const scene=createPromoScene(release,recipe,suite.id,format,directUrl,artwork);scenes.push(scene);
    const png=await exportPromoPng(scene,signal), stem=suite.id+'/'+format;
    files[stem+'.png']=new Uint8Array(await png.arrayBuffer());
    files[stem+'.svg']=strToU8(promoSceneSvg(scene));
  }
  const doc=promoTelaDocument(release,scenes,'promo-'+crypto.randomUUID());
  files['editable-promo-board.tela']=strToU8(JSON.stringify({format:'plajah-tela',version:1,document:doc}));
  files['caption.txt']=strToU8(promoCaption(recipe,directUrl));
  files['recipe.json']=strToU8(JSON.stringify(recipe,null,2));
  files['README.txt']=strToU8('Plajah Chora promo package\n12 full-resolution PNGs, 12 editable SVGs, and one native Tela board.\nSVGs use Outfit, Inter, and JetBrains Mono. PNGs embed the rendered appearance.\nEach QR links to the release with suite/format UTM parameters.\nMotion videos are exported separately from the studio.\n');
  abortCheck(signal);onProgress('Packing your promo kit');
  return new Blob([zipSync(files,{level:0}) as BlobPart],{type:'application/zip'});
}
export function printablePromoHtml(scene:PromoScene):string{
  // RGB vector print proof. Deliberately does not claim a press-certified CMYK PDF.
  const svg=promoSceneSvg(scene);
  return '<!doctype html><html><head><meta charset="utf-8"><title>Chora print proof</title><style>@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap");@page{size:11in 17in;margin:.25in}body{margin:0;background:#100b17}svg{display:block;width:100%;height:16.5in;object-fit:contain}button{margin:12px;padding:12px 20px}@media print{button{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><button onclick="document.fonts.ready.then(()=>print())">Print / save PDF</button>'+svg+'</body></html>';
}

export interface MotionOptions{
  seconds:8|15|30; signal?:AbortSignal; onProgress?:(value:number)=>void;
}
/** Freeze the whole conversion area in every aspect ratio, including landscape. */
export function promoMotionFooterY(scene: PromoScene): number {
  const divider=scene.objects.find(o=>o.objectLabel==='Conversion divider');
  return Math.max(0,(divider?.y??scene.height*.7)-scene.width/(scene.format==='landscape'?640:400)*4);
}
/** One composition for every frame. Bumpers use 3 artist-adjustable hooks and a
 * final conversion slate. MediaRecorder codec is reported honestly by its MIME. */
export async function exportPromoMotion(scene:PromoScene,release:PromoRelease,recipe:PromoRecipe,options:MotionOptions):Promise<{blob:Blob;extension:'mp4'|'webm'}>{
  if(typeof MediaRecorder==='undefined')throw new Error('This browser cannot export video. Download the stills or open this studio in a current desktop browser.');
  const mime=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw new Error('No supported video encoder is available in this browser.');
  const {signal,seconds}=options;abortCheck(signal);
  const audio=new AudioContext();await audio.resume();
  let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,raf=0;
  const sources:AudioBufferSourceNode[]=[];
  const hidden=()=>{if(document.hidden)stopWithError(new Error('Video export paused because this tab was hidden. Keep it visible and try again.'));};
  let stopWithError:(e:Error)=>void=()=>{};
  try{
    const base=await promoCanvas(scene,signal),canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
    ctx.drawImage(base,0,0);
    const audioDest=audio.createMediaStreamDestination();
    const buffers=new Map<string,AudioBuffer>();
    const clips=recipe.snippets.map(s=>({snippet:s,track:release.tracks.find(t=>t.id===s.trackId)})).filter(c=>!!c.track);
    if(!clips.length)throw new Error('Select at least one playable track for a motion export.');
    for(const clip of clips){
      const track=clip.track!,url=track.browserCompatUrl||track.url;
      if(!buffers.has(track.id)){
        const r=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
        if(!r.ok)throw new Error('Could not load '+track.title+' for the motion export.');
        const bytes=await r.arrayBuffer();
        if(bytes.byteLength>100*1024*1024)throw new Error('This track is too large for an in-browser motion export. Use a compressed preview track.');
        buffers.set(track.id,await audio.decodeAudioData(bytes));
      }
    }
    abortCheck(signal);stream=canvas.captureStream(30);audioDest.stream.getAudioTracks().forEach(t=>stream!.addTrack(t));
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000,audioBitsPerSecond:192_000});
    const chunks:Blob[]=[];let settled=false;
    const completion=new Promise<Blob>((resolve,reject)=>{
      stopWithError=(error:Error)=>{if(settled)return;settled=true;if(recorder?.state!=='inactive')recorder?.stop();reject(error);};
      recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder!.onerror=()=>stopWithError(new Error('Video encoding failed. Try a shorter export.'));
      recorder!.onstop=()=>{if(!settled){settled=true;resolve(new Blob(chunks,{type:mime}));}};
    });
    const abort=()=>stopWithError(new DOMException('Export canceled.','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);
    try{
      recorder.start(500);
      const started=audio.currentTime+.08,slot=seconds===8?8:(seconds-3)/3;
      const count=seconds===8?1:3;
      for(let i=0;i<count;i++){
        const clip=clips[i%clips.length],buffer=buffers.get(clip.track!.id)!;
        const source=audio.createBufferSource(),gain=audio.createGain();
        source.buffer=buffer;source.connect(gain);gain.connect(audioDest);sources.push(source);
        const start=Math.min(Math.max(0,clip.snippet.start),Math.max(0,buffer.duration-.1));
        const length=Math.min(slot,buffer.duration-start),at=started+i*slot;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.82,at+Math.min(.04,length/4));
        gain.gain.setValueAtTime(.82,at+Math.max(.04,length-.22));gain.gain.linearRampToValueAtTime(0,at+length);
        source.start(at,start,length);
      }
      const finishAt=started+seconds;
      const draw=()=>{
        if(settled)return;
        const elapsed=Math.max(0,audio.currentTime-started);
        const scale=1+.008*(1+Math.sin(elapsed*.7)),dx=(canvas.width-canvas.width*scale)/2,dy=(canvas.height-canvas.height*scale)/2;
        // Keep the CTA/QR stationary and scannable while the artwork breathes.
        ctx.drawImage(base,dx,dy,canvas.width*scale,canvas.height*scale);
        const footerY=promoMotionFooterY(scene);ctx.drawImage(base,0,footerY,canvas.width,canvas.height-footerY,0,footerY,canvas.width,canvas.height-footerY);
        if(seconds!==8&&elapsed>=seconds-3){
          ctx.fillStyle='rgba(16,11,23,.94)';ctx.fillRect(0,0,canvas.width,footerY);
          ctx.textAlign='center';ctx.fillStyle='#FAF5FF';ctx.font='900 '+Math.round(canvas.width*.056)+'px Outfit';ctx.fillText('PLAJAH CHORA',canvas.width/2,canvas.height*.36,canvas.width*.86);
          ctx.font='500 '+Math.round(canvas.width*.027)+'px Inter';ctx.fillText(recipe.title,canvas.width/2,canvas.height*.43,canvas.width*.84);
          ctx.fillStyle='#FF8C00';ctx.font='700 '+Math.round(canvas.width*.024)+'px Outfit';ctx.fillText(release.isScheduled&&release.releaseDate!>Date.now()?'COMING SOON':'LISTEN NOW',canvas.width/2,canvas.height*.52);
        }
        options.onProgress?.(Math.min(1,elapsed/seconds));
        if(audio.currentTime>=finishAt){recorder!.stop();return;}raf=requestAnimationFrame(draw);
      };
      draw();return {blob:await completion,extension:mime.startsWith('video/mp4')?'mp4':'webm'};
    }finally{signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);}
  }finally{
    cancelAnimationFrame(raf);sources.forEach(s=>{try{s.stop();}catch{}s.disconnect();});
    if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());await audio.close();
  }
}
