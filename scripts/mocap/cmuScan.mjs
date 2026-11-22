// CMU take scan: hip path, facing and lowest foot every 0.25-0.5 s, to pick cut points for game clips.
//   node scripts/mocap/cmuScan.mjs 41_02 127_13 ...   (takes from D:/Plajah Models/mocap/cmu-fbx/animations; units 1e-4 m)
import fs from 'node:fs';
globalThis.self = globalThis; globalThis.window = globalThis;
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const ids = process.argv.slice(2);
for (const id of ids) {
  const buf = fs.readFileSync(`D:/Plajah Models/mocap/cmu-fbx/animations/${id}.fbx`);
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = fbx.animations[0];
  const m = new THREE.AnimationMixer(fbx); m.clipAction(clip).play();
  const hip = fbx.getObjectByName('hip'), l = fbx.getObjectByName('lThigh'), r = fbx.getObjectByName('rThigh');
  const lf = fbx.getObjectByName('lFoot'), rf = fbx.getObjectByName('rFoot');
  let line = [];
  const step = clip.duration > 12 ? 0.5 : 0.25;
  for (let t = 0; t <= clip.duration; t += step) {
    m.setTime(t); fbx.updateMatrixWorld(true);
    const P = (o) => o.getWorldPosition(new THREE.Vector3());
    const h = P(hip), f = P(l).sub(P(r)).setY(0).normalize().cross(new THREE.Vector3(0,1,0));
    const yaw = Math.round(Math.atan2(f.x, f.z) * 57.3);
    const fy = Math.min(P(lf).y, P(rf).y);
    line.push(`${t.toFixed(2)}:${h.x.toFixed(0)},${h.y.toFixed(0)},${h.z.toFixed(0)} y${yaw} f${fy.toFixed(0)}`);
  }
  console.log(`== ${id} dur ${clip.duration.toFixed(2)} tracks ${clip.tracks.length}`);
  console.log(line.join(' | '));
}
