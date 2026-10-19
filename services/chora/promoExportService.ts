import { zipSync, strToU8 } from 'fflate';
import type { PromoRecipe, PromoRelease, PromoFormat, PromoTemplateId } from './promoTypes';
import { PROMO_FORMATS, PROMO_SUITES } from './promoTypes';
import { createPromoScene, promoSceneSvg, promoAnimatedSceneSvg, promoTelaDocument, type PromoArtwork, type PromoScene } from './promoPresets';
import { layoutTextLines, fontShorthand } from '../tela/telaText';
import { ensureFontsForObjects } from '../tela/telaFonts';
import { objectsToSvg } from '../tela/telaSvg';
import { promoCaption } from './promoGeneratorService';
import { getTrackStream, pickStreamUrl } from '../choraStreamService';
import { encodeAnimatedGif, type GifFrameInput } from './gifEncoder';
import type { TelaVectorObject } from '../../types';

/**
 * Resolves the lightweight Chora streaming URL (`choraStreams/{trackId}` progressive AAC stream)
 * for a track before falling back to `browserCompatUrl` or `url`.
 */
export async function resolveChoraTrackStreamUrl(track?: { id: string; url?: string; browserCompatUrl?: string } | null): Promise<string> {
  if (!track) return '';
  if (track.id) {
    try {
      const stream = await getTrackStream(track.id);
      const pickedData = pickStreamUrl(stream, 'data');
      if (pickedData && !pickedData.isHls && pickedData.url) return pickedData.url;
      if (stream?.low) return stream.low;
      const pickedHigh = pickStreamUrl(stream, 'high');
      if (pickedHigh && !pickedHigh.isHls && pickedHigh.url) return pickedHigh.url;
    } catch {
      // Fall back to direct track URLs if Chora stream lookup fails
    }
  }
  return track.browserCompatUrl || track.url || '';
}

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
function drawTextObject(ctx: CanvasRenderingContext2D, o: TelaVectorObject, alphaMultiplier = 1, offsetY = 0) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity * alphaMultiplier));
  ctx.font = fontShorthand(o);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = o.textAlign || 'left';
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = ((o.letterSpacing || 0) * (o.fontSize || 24)) + 'px';
  }
  if (o.gradient) {
    const g = o.gradient.kind === 'RADIAL'
      ? ctx.createRadialGradient(o.x + o.w / 2, o.y + offsetY + o.h / 2, 0, o.x + o.w / 2, o.y + offsetY + o.h / 2, Math.max(o.w, o.h) / 2)
      : ctx.createLinearGradient(o.x, o.y + offsetY, o.x + o.w, o.y + offsetY + o.h);
    o.gradient.stops.forEach(s => g.addColorStop(s.offset, s.color));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = o.fill;
  }
  if (o.rotation) {
    ctx.translate(o.x + o.w / 2, o.y + offsetY + o.h / 2);
    ctx.rotate((o.rotation * Math.PI) / 180);
    ctx.translate(-o.x - o.w / 2, -(o.y + offsetY) - o.h / 2);
  }
  const size = o.fontSize || 24;
  const x = o.textAlign === 'center' ? o.x + o.w / 2 : o.textAlign === 'right' ? o.x + o.w : o.x;
  layoutTextLines(o).forEach((line, i) => ctx.fillText(line, x, o.y + offsetY + size + i * size * (o.lineHeight || 1.22), o.w));
  ctx.restore();
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
    drawTextObject(ctx, o, 1, 0);
  }
  abortCheck(signal);return canvas;
}
export function canvasBlob(canvas:HTMLCanvasElement):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed.')),'image/png'));
}
export async function exportPromoPng(scene:PromoScene,signal?:AbortSignal):Promise<Blob>{return canvasBlob(await promoCanvas(scene,signal));}

/** Freeze the whole conversion area in every aspect ratio, including landscape. */
export function promoMotionFooterY(scene: PromoScene): number {
  const divider=scene.objects.find(o=>o.objectLabel==='Conversion divider');
  return Math.max(0,(divider?.y??scene.height*.7)-scene.width/(scene.format==='landscape'?640:400)*4);
}

const ARTWORK_LABELS = new Set(['Release artwork', 'Artwork mat', 'Artwork placeholder', 'Artwork prompt', 'Monolith edge', 'Artwork depth plane']);

interface AnimatedPromoLayers {
  scene: PromoScene;
  footerY: number;
  bgCanvas: HTMLCanvasElement;
  artCanvas: HTMLCanvasElement;
  artCenter: { cx: number; cy: number };
  kineticTexts: TelaVectorObject[];
  eqBars: TelaVectorObject[];
  divider: TelaVectorObject | undefined;
}

async function prepareAnimatedPromoLayers(scene: PromoScene, signal?: AbortSignal): Promise<AnimatedPromoLayers> {
  abortCheck(signal);
  await readyPromoFonts(scene.objects);
  const footerY = promoMotionFooterY(scene);

  const artObjs = scene.objects.filter(o => ARTWORK_LABELS.has(o.objectLabel || ''));
  const eqBars = scene.objects.filter(o => (o.objectLabel || '').startsWith('Chora eq bar '));
  const kineticTexts = scene.objects.filter(o => o.kind === 'TEXT' && !ARTWORK_LABELS.has(o.objectLabel || '') && o.y < footerY - 8);
  const footerTexts = scene.objects.filter(o => o.kind === 'TEXT' && o.y >= footerY - 8);
  const bgVectors = scene.objects.filter(
    o => o.kind !== 'TEXT' && !ARTWORK_LABELS.has(o.objectLabel || '') && !(o.objectLabel || '').startsWith('Chora eq bar ')
  );

  // 1. Render background + stationary conversion footer (including QR code)
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = scene.width;
  bgCanvas.height = scene.height;
  const bgCtx = bgCanvas.getContext('2d');
  if (!bgCtx) throw new Error('Canvas is unavailable.');
  const bgSvg = objectsToSvg(bgVectors, scene.width, scene.height);
  const bgUrl = URL.createObjectURL(new Blob([bgSvg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(bgUrl, signal);
    bgCtx.drawImage(img, 0, 0);
  } finally {
    URL.revokeObjectURL(bgUrl);
  }
  for (const ft of footerTexts) {
    drawTextObject(bgCtx, ft, 1, 0);
  }

  // 2. Render artwork layer separately so it can animate-on and float smoothly
  const artCanvas = document.createElement('canvas');
  artCanvas.width = scene.width;
  artCanvas.height = scene.height;
  const artCtx = artCanvas.getContext('2d');
  if (!artCtx) throw new Error('Canvas is unavailable.');
  const artVectors = artObjs.filter(o => o.kind !== 'TEXT');
  if (artVectors.length > 0) {
    const artSvg = objectsToSvg(artVectors, scene.width, scene.height);
    const artUrl = URL.createObjectURL(new Blob([artSvg], { type: 'image/svg+xml' }));
    try {
      const img = await loadImage(artUrl, signal);
      artCtx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(artUrl);
    }
  }
  for (const at of artObjs.filter(o => o.kind === 'TEXT')) {
    drawTextObject(artCtx, at, 1, 0);
  }

  const mainArt = artObjs.find(o => o.objectLabel === 'Release artwork' || o.objectLabel === 'Artwork placeholder') || artObjs[0];
  const artCenter = mainArt
    ? { cx: mainArt.x + mainArt.w / 2, cy: mainArt.y + mainArt.h / 2 }
    : { cx: scene.width / 2, cy: scene.height * 0.45 };

  const divider = scene.objects.find(o => o.objectLabel === 'Conversion divider');
  return { scene, footerY, bgCanvas, artCanvas, artCenter, kineticTexts, eqBars, divider };
}

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Draw a single living frame with animate-on typography, floating cover artwork,
 * pulsing Chora equalizer bars, and a rock-steady scannable QR code in the footer.
 */
function drawAnimatedPromoFrame(
  ctx: CanvasRenderingContext2D,
  layers: AnimatedPromoLayers,
  elapsedSec: number,
  outW: number,
  outH: number,
) {
  const { scene, footerY, bgCanvas, artCanvas, artCenter, kineticTexts, eqBars, divider } = layers;
  ctx.save();
  ctx.clearRect(0, 0, outW, outH);
  ctx.scale(outW / scene.width, outH / scene.height);

  // 1. Base ground + ornaments (slightly breathing above footer)
  const bgScale = 1 + 0.006 * (1 + Math.sin(elapsedSec * 1.6));
  const bgDx = (scene.width - scene.width * bgScale) / 2;
  const bgDy = (scene.height - scene.height * bgScale) / 2;
  ctx.drawImage(bgCanvas, bgDx, bgDy, scene.width * bgScale, scene.height * bgScale);

  // 2. Artwork entrance pop + continuous 3D float
  const artEnter = easeOutCubic((elapsedSec - 0.05) / 0.52);
  const floatY = Math.sin(elapsedSec * 2.6) * (scene.height * 0.007);
  const artScale = (0.86 + 0.14 * artEnter) * (1 + 0.018 * Math.sin(elapsedSec * 2.6));
  ctx.save();
  ctx.globalAlpha = Math.max(0.15, artEnter);
  ctx.translate(artCenter.cx, artCenter.cy + (1 - artEnter) * 32 + floatY);
  ctx.scale(artScale, artScale);
  ctx.translate(-artCenter.cx, -artCenter.cy);
  ctx.drawImage(artCanvas, 0, 0);
  ctx.restore();

  // 3. Staggered Animate-On Typography (Title 1 -> Title 2 -> Artist -> Tagline)
  for (const tObj of kineticTexts) {
    const label = tObj.objectLabel || '';
    let delay = 0.02;
    let dur = 0.45;
    if (label === 'Release title 1') { delay = 0.04; dur = 0.46; }
    else if (label === 'Release title 2') { delay = 0.14; dur = 0.48; }
    else if (label === 'Artist name') { delay = 0.24; dur = 0.48; }
    else if (label === 'Campaign line' || label === 'Listening room line') { delay = 0.34; dur = 0.52; }
    const enter = easeOutCubic((elapsedSec - delay) / dur);
    const slideUp = (1 - enter) * (scene.height * 0.028);
    drawTextObject(ctx, tObj, Math.max(0.08, enter), slideUp);
  }

  // 4. Re-stamp the conversion footer 1:1 from bgCanvas so the QR code & Chora lockup are 100% crisp and stationary
  ctx.drawImage(
    bgCanvas,
    0, footerY, scene.width, scene.height - footerY,
    0, footerY, scene.width, scene.height - footerY
  );

  // 5. Animated glowing sweep along the Conversion divider
  if (divider) {
    const phase = (elapsedSec * 0.55) % 1;
    const sweepW = divider.w * 0.38;
    const sweepX = divider.x + (divider.w - sweepW) * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
    const grad = ctx.createLinearGradient(sweepX, divider.y, sweepX + sweepW, divider.y);
    grad.addColorStop(0, 'rgba(255,140,0,0)');
    grad.addColorStop(0.5, '#FF8C00');
    grad.addColorStop(1, 'rgba(0,218,243,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sweepX, divider.y - 1.5, sweepW, Math.max(3, divider.h * 2.5));
  }

  // 6. Animated Chora Equalizer Bars inside the Chora lockup pill
  eqBars.forEach((bar, idx) => {
    const wave = 0.38 + 0.62 * Math.abs(Math.sin(elapsedSec * (4.2 + idx * 1.15) + idx * 0.9));
    const bh = Math.max(4, bar.h * wave);
    const by = bar.y + bar.h - bh;
    ctx.fillStyle = bar.fill;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(bar.x, by, bar.w, bh, bar.rx || 2);
    } else {
      ctx.rect(bar.x, by, bar.w, bh);
    }
    ctx.fill();
  });

  ctx.restore();
}

export interface AnimatedGifOptions {
  frames?: number;
  fps?: number;
  maxWidth?: number;
  maxLongEdge?: number;
  signal?: AbortSignal;
  onProgress?: (value: number) => void;
}

/**
 * Universally shareable looping Animated GIF (`image/gif`) with animate-on text,
 * breathing cover art, pulsing Chora equalizer bars, and a crisp scannable QR code.
 */
export async function exportPromoAnimatedGif(
  scene: PromoScene,
  options: AnimatedGifOptions = {},
): Promise<Blob> {
  const { signal, onProgress } = options;
  const totalFrames = options.frames ?? 20;
  const longEdgeLimit = options.maxLongEdge ?? (scene.format === 'landscape' ? 640 : 540);
  const maxWidth = options.maxWidth ?? longEdgeLimit;
  const scale = Math.min(1, maxWidth / Math.max(scene.width, options.maxLongEdge ? scene.height : 1));
  const outW = Math.max(120, Math.round(scene.width * scale));
  const outH = Math.max(120, Math.round(scene.height * scale));

  const layers = await prepareAnimatedPromoLayers(scene, signal);
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = outW;
  frameCanvas.height = outH;
  const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable.');

  const gifFrames: GifFrameInput[] = [];
  const totalDurationSec = 2.2;

  for (let i = 0; i < totalFrames; i++) {
    abortCheck(signal);
    const elapsedSec = (i / Math.max(1, totalFrames - 1)) * totalDurationSec;
    drawAnimatedPromoFrame(ctx, layers, elapsedSec, outW, outH);
    const imgData = ctx.getImageData(0, 0, outW, outH);
    // Entrance frames run at 70ms (14fps); final settled frame holds for 360ms so text + QR are easy to read/scan
    const delayMs = i === totalFrames - 1 ? 360 : i < 10 ? 70 : 90;
    gifFrames.push({
      rgba: new Uint8ClampedArray(imgData.data),
      delayMs,
    });
    onProgress?.((i + 1) / (totalFrames + 2));
    // Yield briefly every 5 frames so UI stays responsive
    if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
  }

  abortCheck(signal);
  const blob = encodeAnimatedGif(outW, outH, gifFrames);
  onProgress?.(1);
  return blob;
}

/**
 * Interactive, self-contained Animated HTML Promo Card that animates on with text,
 * pulsing Chora equalizer, scannable QR code, clickable direct Chora song link, and
 * optional 15s Chora audio stream preview.
 */
export function shareableAnimatedPromoHtml(
  scene: PromoScene,
  release: PromoRelease,
  recipe: PromoRecipe,
  directUrl: string,
  streamUrl?: string,
): string {
  const animatedSvg = promoAnimatedSceneSvg(scene);
  const featuredTrack = release.tracks.find(t => t.id === recipe.snippets[0]?.trackId) || release.tracks[0];
  const songTitle = featuredTrack?.title ? `${featuredTrack.title} · ${release.title}` : release.title;
  const safeDirect = directUrl.replace(/"/g, '&quot;');
  const safeStream = (streamUrl || '').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${songTitle.replace(/</g, '&lt;')} — ${release.artist.replace(/</g, '&lt;')} | Plajah Chora</title>
<meta property="og:title" content="${songTitle.replace(/"/g, '&quot;')} — ${release.artist.replace(/"/g, '&quot;')}">
<meta property="og:description" content="${(recipe.tagline || 'Stream now on Plajah Chora').replace(/"/g, '&quot;')}">
<style>
  @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap");
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; background: radial-gradient(circle at 50% 15%, #260938 0%, #0b0712 70%);
    color: #FAF5FF; font-family: 'Outfit', system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 16px;
  }
  .card-wrap {
    max-width: 440px; width: 100%; border-radius: 22px; overflow: hidden;
    box-shadow: 0 28px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.14);
    cursor: pointer; transition: transform 0.25s ease;
  }
  .card-wrap:hover { transform: translateY(-3px); }
  .card-wrap svg { display: block; width: 100%; height: auto; }
  .cta-bar {
    max-width: 440px; width: 100%; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;
    background: rgba(16,11,23,0.9); border: 1px solid rgba(255,140,0,0.4); border-radius: 16px; padding: 12px 16px;
  }
  .cta-link {
    display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px;
    background: linear-gradient(90deg, #D40055, #FF8C00); color: #fff; font-weight: 800; font-size: 13px;
    text-decoration: none; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .teaser-btn {
    padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
    color: #FAF5FF; font-weight: 700; font-size: 12px; cursor: pointer; font-family: 'JetBrains Mono', monospace;
  }
</style>
</head>
<body>
  <a class="card-wrap" href="${safeDirect}" target="_blank" rel="noopener noreferrer" title="Click to listen to this song on Plajah Chora">
    ${animatedSvg}
  </a>
  <div class="cta-bar">
    ${safeStream ? `<button class="teaser-btn" id="teaserBtn" onclick="toggleTeaser()">▶ Preview 15s Chora Stream</button><audio id="choraAudio" src="${safeStream}" preload="metadata"></audio>` : `<span style="font-size:12px;font-family:monospace;color:#D0BCFF">SCAN QR OR TAP TO STREAM</span>`}
    <a class="cta-link" href="${safeDirect}" target="_blank" rel="noopener noreferrer">Open Song on Chora ↗</a>
  </div>
  <script>
    const a = document.getElementById('choraAudio');
    const b = document.getElementById('teaserBtn');
    if (a && b) {
      a.addEventListener('timeupdate', () => { if (a.currentTime >= 15) { a.pause(); a.currentTime = 0; b.textContent = '▶ Preview 15s Chora Stream'; } });
      a.addEventListener('ended', () => { b.textContent = '▶ Preview 15s Chora Stream'; });
    }
    function toggleTeaser() {
      if (!a || !b) return;
      if (a.paused) { a.currentTime = 0; a.play(); b.textContent = '⏸ Playing 15s Chora Stream…'; }
      else { a.pause(); b.textContent = '▶ Preview 15s Chora Stream'; }
    }
  </script>
</body>
</html>`;
}

export async function exportPromoBundle(release:PromoRelease,recipe:PromoRecipe,directUrl:string,artwork:PromoArtwork,onProgress:(label:string)=>void,signal?:AbortSignal):Promise<Blob>{
  const files:Record<string,Uint8Array>={},scenes:PromoScene[]=[];
  for(const suite of PROMO_SUITES)for(const format of Object.keys(PROMO_FORMATS) as PromoFormat[]){
    abortCheck(signal);onProgress(suite.name+' · '+PROMO_FORMATS[format].label);
    const scene=createPromoScene(release,recipe,suite.id,format,directUrl,artwork);scenes.push(scene);
    const png=await exportPromoPng(scene,signal), stem=suite.id+'/'+format;
    files[stem+'.png']=new Uint8Array(await png.arrayBuffer());
    files[stem+'.svg']=strToU8(promoAnimatedSceneSvg(scene));
  }
  // Include a universally shareable Animated GIF and Interactive Animated HTML card for the active template
  const activeSuiteId = recipe.template || PROMO_SUITES[0].id;
  const primaryStoryScene = scenes.find(s => s.template === activeSuiteId && s.format === 'story') || scenes[0];
  if (primaryStoryScene) {
    abortCheck(signal);
    onProgress('Encoding Animated GIF with QR & Chora link');
    const gifBlob = await exportPromoAnimatedGif(primaryStoryScene, { signal });
    files[activeSuiteId + '/story-animated.gif'] = new Uint8Array(await gifBlob.arrayBuffer());
    const primaryTrack = release.tracks.find(t => t.id === recipe.snippets[0]?.trackId) || release.tracks[0];
    const streamUrl = primaryTrack ? await resolveChoraTrackStreamUrl(primaryTrack) : '';
    files['interactive-promo-card.html'] = strToU8(shareableAnimatedPromoHtml(primaryStoryScene, release, recipe, directUrl, streamUrl));
  }
  const doc=promoTelaDocument(release,scenes,'promo-'+crypto.randomUUID());
  files['editable-promo-board.tela']=strToU8(JSON.stringify({format:'plajah-tela',version:1,document:doc}));
  files['caption.txt']=strToU8(promoCaption(recipe,directUrl));
  files['recipe.json']=strToU8(JSON.stringify(recipe,null,2));
  files['README.txt']=strToU8('Plajah Chora promo package\n12 full-resolution PNGs, 12 living animated SVGs, 1 looping Animated GIF, 1 interactive HTML card, and one native Tela board.\nEach QR links directly to the song on Plajah Chora.\n');
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

async function prepareStreamingAudioElement(url: string, startSec: number, signal?: AbortSignal): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
      el.oncanplay = null;
      el.onloadedmetadata = null;
      el.onerror = null;
    };
    const onAbort = () => {
      cleanup();
      el.pause();
      el.src = '';
      reject(new DOMException('Export canceled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Chora audio stream timed out while loading.'));
    }, 30000);
    el.onerror = () => {
      cleanup();
      reject(new Error('Could not stream track from Chora.'));
    };
    el.onloadedmetadata = () => {
      const targetStart = Math.min(Math.max(0, startSec), Math.max(0, (el.duration || startSec + 15) - 0.25));
      if (targetStart > 0.05) {
        try { el.currentTime = targetStart; } catch { /* ignore seek before canplay */ }
      }
    };
    el.oncanplay = () => {
      cleanup();
      resolve(el);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    el.src = url;
    el.load();
  });
}

/** One composition for every frame. Uses the Chora streaming version of the selected song
 * (first 15 seconds by default) and animates on text, artwork, and Chora equalizer bars while keeping the QR scannable. */
export async function exportPromoMotion(scene:PromoScene,release:PromoRelease,recipe:PromoRecipe,options:MotionOptions):Promise<{blob:Blob;extension:'mp4'|'webm'}>{
  if(typeof MediaRecorder==='undefined')throw new Error('This browser cannot export video. Download the Animated GIF or stills.');
  const mime=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw new Error('No supported video encoder is available in this browser.');
  const {signal,seconds}=options;abortCheck(signal);
  const audio=new AudioContext();await audio.resume();
  let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,raf=0;
  const sources:AudioBufferSourceNode[]=[];
  const audioElements:HTMLAudioElement[]=[];
  const timers:Array<ReturnType<typeof setTimeout>>=[];
  const hidden=()=>{if(document.hidden)stopWithError(new Error('Video export paused because this tab was hidden. Keep it visible and try again.'));};
  let stopWithError:(e:Error)=>void=()=>{};
  try{
    const layers = await prepareAnimatedPromoLayers(scene, signal);
    const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
    drawAnimatedPromoFrame(ctx, layers, 0, canvas.width, canvas.height);
    const audioDest=audio.createMediaStreamDestination();
    const buffers=new Map<string,AudioBuffer>();
    const streamUrls=new Map<string,string>();
    const clips=recipe.snippets.map(s=>({snippet:s,track:release.tracks.find(t=>t.id===s.trackId)})).filter(c=>!!c.track);
    if(!clips.length && release.tracks.length > 0) {
      const firstTrack = release.tracks[0];
      clips.push({ snippet: { trackId: firstTrack.id, start: 0, duration: 15, source: 'auto' }, track: firstTrack });
    }
    if(!clips.length)throw new Error('Select at least one playable track for a motion export.');
    for(const clip of clips){
      const track=clip.track!;
      if(!streamUrls.has(track.id)){
        const resolvedUrl = await resolveChoraTrackStreamUrl(track);
        if(!resolvedUrl) throw new Error('Could not resolve Chora stream for '+track.title+'.');
        streamUrls.set(track.id, resolvedUrl);
      }
      const url = streamUrls.get(track.id)!;
      if(!buffers.has(track.id)){
        try {
          const r=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
          const contentLength = Number(r.headers.get('content-length') || '0');
          // Decode into AudioBuffer when it's a compact Chora stream; otherwise stream via HTMLAudioElement range requests
          if(r.ok && (!contentLength || contentLength <= 28 * 1024 * 1024)){
            const bytes=await r.arrayBuffer();
            if(bytes.byteLength <= 28 * 1024 * 1024){
              buffers.set(track.id,await audio.decodeAudioData(bytes));
            }
          }
        } catch {
          // Will fallback to progressive HTMLAudioElement streaming below
        }
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
      const started=audio.currentTime+.08;
      // When a single song is selected (or for 8s/15s teasers with a 15s snippet), play the continuous 15-second window (0s–15s by default)
      const singleSongContinuous = clips.length === 1 || seconds <= 15;
      const count = singleSongContinuous ? 1 : 3;
      const slot = singleSongContinuous ? seconds : (seconds - 3) / 3;
      for(let i=0;i<count;i++){
        const clip=clips[i%clips.length], track=clip.track!;
        const buffer=buffers.get(track.id);
        const at=started+i*slot;
        if(buffer){
          const source=audio.createBufferSource(),gain=audio.createGain();
          source.buffer=buffer;source.connect(gain);gain.connect(audioDest);sources.push(source);
          const start=Math.min(Math.max(0,clip.snippet.start),Math.max(0,buffer.duration-.1));
          const desiredLength = singleSongContinuous ? Math.min(seconds, clip.snippet.duration || seconds) : slot;
          const length=Math.min(desiredLength, buffer.duration-start);
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.85,at+Math.min(.04,length/4));
          gain.gain.setValueAtTime(.85,at+Math.max(.04,length-.22));gain.gain.linearRampToValueAtTime(0,at+length);
          source.start(at,start,length);
        } else {
          const url = streamUrls.get(track.id)!;
          const start = Math.max(0, clip.snippet.start || 0);
          const desiredLength = singleSongContinuous ? Math.min(seconds, clip.snippet.duration || seconds) : slot;
          const el = await prepareStreamingAudioElement(url, start, signal);
          audioElements.push(el);
          const mediaSource = audio.createMediaElementSource(el);
          const gain = audio.createGain();
          mediaSource.connect(gain);
          gain.connect(audioDest);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(.85, at + Math.min(.06, desiredLength / 4));
          gain.gain.setValueAtTime(.85, at + Math.max(.06, desiredLength - .25));
          gain.gain.linearRampToValueAtTime(0, at + desiredLength);
          const delayMs = Math.max(0, (at - audio.currentTime) * 1000);
          timers.push(setTimeout(() => {
            el.play().catch(() => {});
          }, delayMs));
          timers.push(setTimeout(() => {
            try { el.pause(); } catch {}
          }, delayMs + desiredLength * 1000));
        }
      }
      const finishAt=started+seconds;
      const draw=()=>{
        if(settled)return;
        const elapsed=Math.max(0,audio.currentTime-started);
        drawAnimatedPromoFrame(ctx, layers, elapsed, canvas.width, canvas.height);
        if(seconds===30&&elapsed>=seconds-3){
          const footerY=promoMotionFooterY(scene);
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
    cancelAnimationFrame(raf);
    timers.forEach(t=>clearTimeout(t));
    sources.forEach(s=>{try{s.stop();}catch{}s.disconnect();});
    audioElements.forEach(el=>{try{el.pause();el.src='';}catch{}});
    if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());await audio.close();
  }
}
