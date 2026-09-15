import fs from 'node:fs';import{FBXLoader}from 'three/addons/loaders/FBXLoader.js';
const b=fs.readFileSync('public/firstlight/assets/mocap/02_03.fbx');const root=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
console.log(root.animations.map(a=>({name:a.name,duration:a.duration,tracks:a.tracks.slice(0,10).map(t=>t.name)})));root.traverse(o=>{if(o.isBone)console.log(o.name,o.position.toArray())});
