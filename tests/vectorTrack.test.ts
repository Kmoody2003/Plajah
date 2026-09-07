import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createVectorTrack, stabilizationAt, trackPoint, upsertTrackSample } from '../services/fabula/vectorTrack';

const frame=(dx:number,dy:number)=>{const width=48,height=40,data=new Uint8Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const qx=x-dx,qy=y-dy;data[y*width+x]=(qx>=15&&qx<25&&qy>=12&&qy<22)?Math.round(80+(qx-15)*13+(qy-12)*4):12;}return{width,height,data};};

describe('VectorTrack foundation',()=>{
  it('tracks a translated textured patch with normalized coordinates',()=>{const a=frame(0,0),b=frame(4,-3);const result=trackPoint(a,b,20/47,17/39,5,8);assert.ok(Math.abs(result.x-24/47)<.02);assert.ok(Math.abs(result.y-14/39)<.02);assert.ok(result.confidence>.5);});
  it('persists manual corrections and derives inverse stabilization',()=>{let asset=createVectorTrack('clip-1',24,1920,1080,'Track','track-1');asset=upsertTrackSample(asset,{frame:0,x:.4,y:.5,confidence:1,error:0,manual:true});asset=upsertTrackSample(asset,{frame:1,x:.45,y:.47,confidence:.9,error:.01});assert.deepEqual(stabilizationAt(asset,1),{x:-.04999999999999999,y:.030000000000000027,confidence:.9});assert.equal(asset.samples.length,2);});
});
