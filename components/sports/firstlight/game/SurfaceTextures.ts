import * as THREE from 'three';
/** Small reusable, deterministic microdetail maps; albedo stays independently tintable. */
const textures=new Map<string,THREE.CanvasTexture>();
export function surfaceTexture(kind:'fabric'|'leather') {
  const existing=textures.get(kind);if(existing)return existing;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#777';ctx.fillRect(0,0,128,128);
  let seed=391;
  for(let y=0;y<128;y+=kind==='fabric'?2:4)for(let x=0;x<128;x+=kind==='fabric'?2:4){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const v=100+(seed>>>24)%90;ctx.fillStyle=`rgb(${v},${v},${v})`;
    if(kind==='fabric')ctx.fillRect(x,y,1,2);
    else{ctx.beginPath();ctx.ellipse(x+(y%8?2:0),y,1.5,1.2,0,0,Math.PI*2);ctx.fill();}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(kind==='fabric'?3:2,kind==='fabric'?3:2);texture.anisotropy=4;
  textures.set(kind,texture);return texture;
}
