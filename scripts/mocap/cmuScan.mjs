// CMU take scan: hip path, facing and lowest foot every 0.25-0.5 s, to pick cut points for game clips.
//   node scripts/mocap/cmuScan.mjs 41_02 127_13 ...   (takes from D:/Plajah Models/mocap/cmu-fbx/animations; units 1e-4 m)
//   --arms adds each hand's reach forward / height from its shoulder in torso lengths (R fwd/up, L fwd/up) and the lean.
import fs from 'node:fs';
globalThis.self = globalThis; globalThis.window = globalThis;
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const arms = process.argv.includes('--arms');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
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
    let extra = '';
    if (arms) {
      const neck = P(fbx.getObjectByName('neck')), k = 1 / Math.max(1e-6, neck.y - h.y);
      const rel = (hand, sh) => { const d = P(fbx.getObjectByName(hand)).sub(P(fbx.getObjectByName(sh))); return `${(d.dot(f) * k).toFixed(1)}/${(d.y * k).toFixed(1)}`; };
      extra = ` R${rel('rHand', 'rShldr')} L${rel('lHand', 'lShldr')} lean${Math.round(Math.acos(neck.clone().sub(h).normalize().y) * 57.3)}`;
    }
    line.push(`${t.toFixed(2)}:${h.x.toFixed(0)},${h.y.toFixed(0)},${h.z.toFixed(0)} y${yaw} f${fy.toFixed(0)}${extra}`);
  }
  console.log(`== ${id} dur ${clip.duration.toFixed(2)} tracks ${clip.tracks.length}`);
  console.log(line.join(' | '));
}
