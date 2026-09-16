import fs from 'node:fs';import * as T from 'three';import{FBXLoader}from 'three/addons/loaders/FBXLoader.js';
const out={};
for(const [name,file,start,end]of [['run','02_03',0,1.433333],['throw','33_01',.25,.9],['catch','33_01',1.25,1.75]]){
 const b=fs.readFileSync('public/firstlight/assets/mocap/'+file+'.fbx');const root=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const mix=new T.AnimationMixer(root);mix.clipAction(root.animations[0]).play();
 const pos=n=>root.getObjectByName(n).getWorldPosition(new T.Vector3());const frames=[];
 for(let i=0;i<=Math.ceil((end-start)*60);i++){
  mix.setTime(Math.min(end,start+i/60));root.updateMatrixWorld(true);
  const up=pos('neck').sub(pos('hip')).normalize(),right=pos('rShldr').sub(pos('lShldr')).normalize(),forward=new T.Vector3().crossVectors(right,up).normalize();right.crossVectors(up,forward).normalize();
  const dir=(a,b)=>{const d=pos(b).sub(pos(a)).normalize();return new T.Vector3(d.dot(right),d.dot(up),d.dot(forward)).normalize();};
  const q=(d)=>new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),d);
  const frame=[];
  for(const [a,b,c]of [['lShldr','lForeArm','lHand'],['rShldr','rForeArm','rHand'],['lThigh','lShin','lFoot'],['rThigh','rShin','rFoot']]){
   const upper=q(dir(a,b)),lower=q(dir(b,c).applyQuaternion(upper.clone().invert()));frame.push(upper.toArray().map(v=>+v.toFixed(5)),lower.toArray().map(v=>+v.toFixed(5)));
  }
  frames.push(frame);
 }
 out[name]={duration:end-start,fps:60,frames};console.log(name,frames.length);
}
fs.writeFileSync('components/sports/firstlight/game/MocapClips.ts','// Retargeted from CMU clips via the credited FBX mirror. See public/firstlight/assets/mocap/SOURCE-LICENSE.md.\nexport const mocapClips = '+JSON.stringify(out)+';\n');
