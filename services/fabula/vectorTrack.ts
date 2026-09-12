/** Serializable Phase 2 motion-data contract. Coordinates are normalized so a
 * track survives proxy/full-resolution swaps and maps cleanly to OFX parameters. */
export interface TrackSample {
  frame: number; x: number; y: number; confidence: number; error: number;
  manual?: boolean; occluded?: boolean;
}
export interface VectorTrackAsset {
  id: string; name: string; version: 1; kind: 'point' | 'planar';
  sourceAssetId: string; fps: number; width: number; height: number;
  samples: TrackSample[];
  settings: { patchRadius: number; searchRadius: number; minConfidence: number };
}
export interface GrayFrame { width: number; height: number; data: Uint8Array | Float32Array; }

export function createVectorTrack(sourceAssetId: string, fps: number, width: number, height: number, name = 'Vector Track', id = `track-${Date.now()}`): VectorTrackAsset {
  return { id, name, version: 1, kind: 'point', sourceAssetId, fps, width, height, samples: [], settings: { patchRadius: 7, searchRadius: 24, minConfidence: .55 } };
}

function pixel(frame: GrayFrame, x: number, y: number) {
  x = Math.max(0, Math.min(frame.width - 1, x)); y = Math.max(0, Math.min(frame.height - 1, y));
  const value = frame.data[y * frame.width + x]; return frame.data instanceof Uint8Array ? value / 255 : value;
}

function patchError(a: GrayFrame, b: GrayFrame, ax: number, ay: number, bx: number, by: number, radius: number) {
  let sumA=0,sumB=0,count=0;
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){sumA+=pixel(a,ax+x,ay+y);sumB+=pixel(b,bx+x,by+y);count++;}
  const meanA=sumA/count,meanB=sumB/count;let error=0,energy=0;
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){const va=pixel(a,ax+x,ay+y)-meanA,vb=pixel(b,bx+x,by+y)-meanB;const d=va-vb;error+=d*d;energy+=va*va+vb*vb;}
  return error/Math.max(1e-7,energy);
}

/** Zero-mean patch energy — flat patches (sky, walls) carry no trackable texture. 0..1-ish. */
export function patchTexture(frame: GrayFrame, x: number, y: number, radius = 7) {
  const px=Math.round(x*(frame.width-1)),py=Math.round(y*(frame.height-1));let sum=0,count=0;
  for(let j=-radius;j<=radius;j++)for(let i=-radius;i<=radius;i++){sum+=pixel(frame,px+i,py+j);count++;}
  const mean=sum/count;let v=0;for(let j=-radius;j<=radius;j++)for(let i=-radius;i<=radius;i++){const d=pixel(frame,px+i,py+j)-mean;v+=d*d;}
  return Math.sqrt(v/count);
}

export interface TrackPointResult { x: number; y: number; error: number; confidence: number; }

/** Translation point tracker with brightness-invariant normalized patch error,
 * second-best ambiguity confidence and subpixel parabolic refinement.
 * The patch is taken around (x,y) in `previous`; the search window in `next` is centred
 * on `predicted` when given (constant-velocity or homography prediction), else on (x,y). */
export function trackPoint(previous: GrayFrame, next: GrayFrame, x: number, y: number, patchRadius = 7, searchRadius = 24, predicted?: { x: number; y: number }): TrackPointResult {
  const px=Math.round(x*(previous.width-1)),py=Math.round(y*(previous.height-1));
  const cx0=Math.round((predicted?.x ?? x)*(next.width-1)),cy0=Math.round((predicted?.y ?? y)*(next.height-1));
  const span=2*searchRadius+1,errors=new Float32Array(span*span);let best=Infinity,bi=0;
  for(let dy=-searchRadius;dy<=searchRadius;dy++)for(let dx=-searchRadius;dx<=searchRadius;dx++){
    const e=patchError(previous,next,px,py,cx0+dx,cy0+dy,patchRadius);const idx=(dy+searchRadius)*span+(dx+searchRadius);errors[idx]=e;
    if(e<best){best=e;bi=idx;}
  }
  const bdx=(bi%span)-searchRadius,bdy=Math.floor(bi/span)-searchRadius,bx=cx0+bdx,by=cy0+bdy;
  // Second-best is measured against the FINAL winner, excluding its 3×3 neighbourhood, so a
  // sharp single minimum reads as unambiguous and a repeated texture reads as ambiguous.
  let second=Infinity;
  for(let i=0;i<errors.length;i++){const ddx=(i%span)-searchRadius-bdx,ddy=Math.floor(i/span)-searchRadius-bdy;if(Math.abs(ddx)<=1&&Math.abs(ddy)<=1)continue;if(errors[i]<second)second=errors[i];}
  const at=(dx:number,dy:number)=>{const ix=bdx+dx+searchRadius,iy=bdy+dy+searchRadius;return ix>=0&&iy>=0&&ix<span&&iy<span?errors[iy*span+ix]:patchError(previous,next,px,py,bx+dx,by+dy,patchRadius);};
  const refine=(lo:number,mid:number,hi:number)=>{const d=lo-2*mid+hi;return Math.abs(d)<1e-8?0:Math.max(-.5,Math.min(.5,.5*(lo-hi)/d));};
  const sx=bx+refine(at(-1,0),best,at(1,0)),sy=by+refine(at(0,-1),best,at(0,1));
  const ambiguity=Number.isFinite(second)?Math.max(0,Math.min(1,(second-best)/Math.max(second,1e-7))):1;
  const quality=Math.exp(-best*8);return{x:sx/(next.width-1),y:sy/(next.height-1),error:best,confidence:Math.sqrt(ambiguity*quality)};
}

export function upsertTrackSample(asset: VectorTrackAsset, sample: TrackSample): VectorTrackAsset {
  const samples=asset.samples.filter((candidate)=>candidate.frame!==sample.frame).concat(sample).sort((a,b)=>a.frame-b.frame);
  return { ...asset, samples };
}

/** Translation that keeps the tracked point at the chosen reference sample. */
export function stabilizationAt(asset: VectorTrackAsset, frame: number, referenceFrame = asset.samples[0]?.frame ?? 0) {
  const sample=sampleTrackAt(asset,frame),reference=sampleTrackAt(asset,referenceFrame);
  return sample&&reference?{x:reference.x-sample.x,y:reference.y-sample.y,confidence:sample.confidence}:{x:0,y:0,confidence:0};
}

export function sampleTrackAt(asset: VectorTrackAsset, frame: number): TrackSample | null {
  const samples=asset.samples;if(!samples.length)return null;if(frame<=samples[0].frame)return samples[0];if(frame>=samples[samples.length-1].frame)return samples[samples.length-1];
  let hi=1;while(hi<samples.length&&samples[hi].frame<frame)hi++;const a=samples[hi-1],b=samples[hi],t=(frame-a.frame)/Math.max(1,b.frame-a.frame);return{frame,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,confidence:Math.min(a.confidence,b.confidence),error:a.error+(b.error-a.error)*t,manual:a.manual&&b.manual};
}

/** Rec.709 luma of an RGBA buffer as a GrayFrame — shared by every decode runner. */
export function grayFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayFrame {
  const data=new Uint8Array(width*height);for(let i=0;i<data.length;i++)data[i]=Math.round(rgba[i*4]*.2126+rgba[i*4+1]*.7152+rgba[i*4+2]*.0722);return{width,height,data};
}
