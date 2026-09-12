/** A tiny AAC/m4a audio proxy (~160 kbps) that stands in for a heavy WAV/FLAC/AIFF original during
 *  monitoring: ~1/10th the bytes, decodes fast, plays THROUGH the mixer. Export bypasses the proxy
 *  resolver and reads the original url, so delivery is always full-quality. Returns null (keep the
 *  original) when the source is already compact, undecodable, or too long to bother. */
export async function buildAudioProxy(blob: Blob): Promise<Blob|null> {
 // Already small/compressed? A proxy would save little and cost a re-encode. WAV/AIFF/PCM is the
 // target — those are the ones that stream badly. ~6 MB floor skips already-light MP3/AAC/Opus.
 if (blob.size < 6 * 1024 * 1024) return null;
 const {Input,ALL_FORMATS,BlobSource,Output,BufferTarget,Mp4OutputFormat,Conversion}=await import('mediabunny');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob)});
 try {
  if(await input.computeDuration()>3600)return null;            // 1 h cap — beyond this, re-encode cost > benefit
  const target=new BufferTarget();const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const conversion=await Conversion.init({input,output,audio:{codec:'aac',bitrate:160000}});
  if(!conversion.isValid || conversion.discardedTracks.length){await conversion.cancel();return null;}
  await conversion.execute();
  const out=target.buffer?new Blob([target.buffer],{type:'audio/mp4'}):null;
  // Never hand back a "proxy" that isn't actually smaller (short/dense sources can round up).
  return out && out.size < blob.size ? out : null;
 }catch {return null;}finally{input.dispose();}
}

/** A downscaled WebP picture proxy (long edge ≤ maxDim, q≈0.82) for heavy stills — big PNG/TIFF/JPEG
 *  that hitch the monitor on load. Full-res original is used on export. Returns null (keep the
 *  original) for already-small images or formats the browser can't decode (RAW/most HEIC). */
export async function buildPictureProxy(blob: Blob, maxDim = 2048): Promise<Blob|null> {
 if (blob.size < 3 * 1024 * 1024) return null;                  // small enough to load instantly — no proxy
 if (typeof createImageBitmap !== 'function') return null;
 let bmp: ImageBitmap | null = null;
 try {
  bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas: any = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  const out: Blob | null = ('convertToBlob' in canvas)
    ? await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
    : await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82));
  return out && out.size && out.size < blob.size ? out : null;
 } catch { return null; }
 finally { try { bmp?.close?.(); } catch { /* */ } }
}

/** Sequential demux/decode proxy with audio retained; never accept silent track loss. */
export async function buildEditingProxy(blob: Blob): Promise<Blob|null> {
 const {Input,ALL_FORMATS,BlobSource,Output,BufferTarget,Mp4OutputFormat,Conversion}=await import('mediabunny');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob)});
 try {
  if(await input.computeDuration()>300)return null;
  const target=new BufferTarget();const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const conversion=await Conversion.init({input,output,video:{width:960,height:540,fit:'contain',codec:'avc',bitrate:2000000,keyFrameInterval:.5,allowRotationMetadata:false},audio:{codec:'aac',bitrate:128000}});
  if(!conversion.isValid || conversion.discardedTracks.length){await conversion.cancel();return null;}
  await conversion.execute();
  return target.buffer?new Blob([target.buffer],{type:'video/mp4'}):null;
 }catch {return null;}finally{input.dispose();}
}
