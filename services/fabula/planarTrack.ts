// planarTrack — homography maths for VectorTrack's planar surfaces.
//
// Conventions (the contract every consumer relies on):
//   • Points are NORMALIZED image coordinates: x,y in 0..1, origin TOP-LEFT, y DOWN
//     (the same space the analysis raster, the DOM monitor and OFX corner-pin params use).
//   • A Mat3 is ROW-MAJOR [a,b,c, d,e,f, g,h,i] applying as (x',y',w') = M·(x,y,1).
//   • A track sample's `matrix` maps REFERENCE-frame points → CURRENT-frame points.
//     "Where did this surface point go?"  current = H · reference.
//   • Renderers consume a SAMPLING matrix S: output(p) = input(S·p). For stabilisation
//     S = H (fetch the surface from where it is now, place it where it was); for a
//     corner pin S = (H·Q)⁻¹ where Q maps the unit square onto the reference quad.
export interface Point2 { x: number; y: number; }
export type Mat3 = [number,number,number,number,number,number,number,number,number];
export type Quad = [Point2, Point2, Point2, Point2];
export interface PlanarSolve { matrix: Mat3; rmsError: number; confidence: number; corners: Quad; }

export const MAT3_IDENTITY: Mat3 = [1,0,0, 0,1,0, 0,0,1];
/** Unit square in the corner order every quad in VectorTrack uses: TL, TR, BR, BL. */
export const UNIT_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

function solveLinear(a:number[][],b:number[]){const n=b.length,m=a.map((row,i)=>[...row,b[i]]);for(let c=0;c<n;c++){let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[pivot][c]))pivot=r;[m[c],m[pivot]]=[m[pivot],m[c]];const d=m[c][c];if(Math.abs(d)<1e-10)return null;for(let j=c;j<=n;j++)m[c][j]/=d;for(let r=0;r<n;r++){if(r===c)continue;const f=m[r][c];for(let j=c;j<=n;j++)m[r][j]-=f*m[c][j];}}return m.map(row=>row[n]);}
export function transformPoint(m:Mat3,p:Point2):Point2{const w=m[6]*p.x+m[7]*p.y+m[8];return{x:(m[0]*p.x+m[1]*p.y+m[2])/w,y:(m[3]*p.x+m[4]*p.y+m[5])/w};}

/** a·b — apply b first, then a. */
export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as unknown as Mat3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
/** Scale so m[8] === 1 (a homography is defined up to scale). */
export function normalizeMat3(m: Mat3): Mat3 { const s = Math.abs(m[8]) < 1e-12 ? 1 : 1 / m[8]; return m.map(v => v * s) as Mat3; }
export function isIdentityMat3(m: Mat3 | null | undefined, eps = 1e-9): boolean {
  if (!m) return true; const n = normalizeMat3(m);
  for (let i = 0; i < 9; i++) if (Math.abs(n[i] - MAT3_IDENTITY[i]) > eps) return false; return true;
}

/** Exact/least-squares homography from four or more normalized correspondences. */
export function solveHomography(from:Point2[],to:Point2[]):PlanarSolve|null{
  if(from.length!==to.length||from.length<4)return null;const rows:number[][]=[],rhs:number[]=[];
  for(let i=0;i<from.length;i++){const{x,y}=from[i],u=to[i].x,v=to[i].y;rows.push([x,y,1,0,0,0,-u*x,-u*y]);rhs.push(u);rows.push([0,0,0,x,y,1,-v*x,-v*y]);rhs.push(v);}
  // Normal equations allow >4 correspondence points while preserving a compact solver.
  const ata=Array.from({length:8},()=>Array(8).fill(0)),atb=Array(8).fill(0);for(let r=0;r<rows.length;r++)for(let i=0;i<8;i++){atb[i]+=rows[r][i]*rhs[r];for(let j=0;j<8;j++)ata[i][j]+=rows[r][i]*rows[r][j];}
  const q=solveLinear(ata,atb);if(!q)return null;const matrix=[q[0],q[1],q[2],q[3],q[4],q[5],q[6],q[7],1] as Mat3;
  let err=0;for(let i=0;i<from.length;i++){const p=transformPoint(matrix,from[i]);err+=(p.x-to[i].x)**2+(p.y-to[i].y)**2;}const rmsError=Math.sqrt(err/from.length),confidence=Math.exp(-rmsError*40);
  return{matrix,rmsError,confidence,corners:UNIT_QUAD.map(p=>transformPoint(matrix,p)) as Quad};
}

/** Homography that maps the unit square (TL,TR,BR,BL) onto `quad`. */
export function unitToQuad(quad: Quad): Mat3 | null { return solveHomography(UNIT_QUAD, quad)?.matrix ?? null; }

/** Decompose the affine portion for ordinary Fabula transform binding. Perspective
 * remains in the full matrix for corner-pin/surface consumers. */
export function decomposePlanar(m:Mat3){const tx=m[2],ty=m[5],scaleX=Math.hypot(m[0],m[3]),rotation=Math.atan2(m[3],m[0]);const determinant=m[0]*m[4]-m[1]*m[3];const scaleY=determinant/Math.max(1e-9,scaleX);const shear=(m[0]*m[1]+m[3]*m[4])/Math.max(1e-9,scaleX*scaleX);return{tx,ty,scaleX,scaleY,rotation,shear,perspectiveX:m[6],perspectiveY:m[7]};}

export function invertHomography(m:Mat3):Mat3|null{const[a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=c*h-b*i,C=b*f-c*e,D=f*g-d*i,E=a*i-c*g,F=c*d-a*f,G=d*h-e*g,H=b*g-a*h,I=a*e-b*d,det=a*A+b*D+c*G;if(Math.abs(det)<1e-10)return null;return[A/det,B/det,C/det,D/det,E/det,F/det,G/det,H/det,I/det];}

/** Re-express a normalized-space matrix in a space where y runs UP (WebGL UVs after a
 * flipped upload). F·M·F with F = flip-y is its own inverse, so this converts both ways. */
export function flipYMat3(m: Mat3): Mat3 { const F: Mat3 = [1,0,0, 0,-1,1, 0,0,1]; return multiplyMat3(F, multiplyMat3(m, F)); }

/** Re-express a normalized-space matrix in PIXEL space over a content box (x,y,w,h):
 * S·M·S⁻¹ where S maps normalized → pixels. Used by the DOM monitor. */
export function toPixelSpace(m: Mat3, box: { x: number; y: number; w: number; h: number }): Mat3 {
  const S: Mat3 = [box.w,0,box.x, 0,box.h,box.y, 0,0,1];
  const Si: Mat3 = [1/Math.max(1e-6,box.w),0,-box.x/Math.max(1e-6,box.w), 0,1/Math.max(1e-6,box.h),-box.y/Math.max(1e-6,box.h), 0,0,1];
  return multiplyMat3(S, multiplyMat3(m, Si));
}

/** CSS `matrix3d(...)` for a 2-D projective matrix (pixel space, transform-origin 0 0). */
export function mat3ToCssMatrix3d(m: Mat3): string {
  const n = normalizeMat3(m); const [a,b,c,d,e,f,g,h,i] = n;
  const v = [a,d,0,g, b,e,0,h, 0,0,1,0, c,f,0,i].map(x => (Math.abs(x) < 1e-12 ? 0 : x));
  return `matrix3d(${v.map(x => x.toFixed(6)).join(',')})`;
}

/** Object-fit:contain box of a `srcW×srcH` image inside a `boxW×boxH` element (pixels). */
export function containBox(srcW: number, srcH: number, boxW: number, boxH: number) {
  if (!srcW || !srcH || !boxW || !boxH) return { x: 0, y: 0, w: boxW || 1, h: boxH || 1 };
  const s = Math.min(boxW / srcW, boxH / srcH); const w = srcW * s, h = srcH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
