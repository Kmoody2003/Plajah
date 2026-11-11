// Real motion capture for the fights. Each strike is cut out of a CMU take (scripts/eraclash3d/fetchMocap.mjs) at
// the moment its hand or foot moves fastest, with its wind-up before and follow-through after, then retargeted
// onto the warrior's own skeleton (in place: the forward travel is replaced by the game's lunge).
// Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217).
//
// Each fighter's set follows their Combat Atlas art (data/combatAtlasData.ts):
//   Haru, kenjutsu → kendo: katana cuts from the swordplay takes; karate's lunge punch and kicks for the empty hand.
//   Chen, Shaolin kung fu: fast boxing combinations, the karate kicks, and the Heian kata for his whirlwind.
//   Roland, Armizare (Fiore): the longsword cuts, heavier and slower; the knife-hand block for his guard.
//   Raiders: brawler's swings and the punch-and-kick takes.
import * as THREE from 'three/webgpu';
import { retarget, CMU_TO_CONTRACT } from './core/character';

export const MOCAP = '/games/era-clash/3d/assets/mocap/';
type Effector = 'rHand' | 'lHand' | 'rFoot' | 'lFoot';
export interface MoveDef {
  take: string;
  /** Which limbs to look for the blow on (the fastest of them wins). */
  eff: Effector[];
  /** Which blow in the take (0 = the fastest), after spacing peaks apart. */
  pick: number;
  /** Seconds kept before the blow lands (wind-up) and after it (follow-through). */
  pre: number; post: number;
}
export interface CutMove { clip: THREE.AnimationClip; hitAt: number }

const fbxCache = new Map<string, Promise<THREE.Group>>();
export function loadTake(id: string) {
  if (!fbxCache.has(id)) fbxCache.set(id, import('three/addons/loaders/FBXLoader.js').then(({ FBXLoader }) => new FBXLoader().loadAsync(`${MOCAP}${id}.fbx`) as unknown as Promise<THREE.Group>));
  return fbxCache.get(id)!;
}

/** Blows in a take, best first: frames where a limb reaches full extension *in front of the body* (punches,
 *  cuts, kicks), not merely where it moves fastest: in sparring takes the fastest hand is often a slip or a
 *  step. Each candidate is scored by extension (limb length fraction) × forwardness × the speed it arrived with,
 *  all measured relative to the hips so footwork doesn't count. */
export function peaks(root: THREE.Object3D, clip: THREE.AnimationClip, eff: Effector[], fps = 30, gap = 18) {
  const g = (n: string) => root.getObjectByName(n) as THREE.Object3D | undefined;
  const chain: Record<Effector, [string, string, string]> = { rHand: ['rShldr', 'rForeArm', 'rHand'], lHand: ['lShldr', 'lForeArm', 'lHand'], rFoot: ['rThigh', 'rShin', 'rFoot'], lFoot: ['lThigh', 'lShin', 'lFoot'] };
  const limbs = eff.map((e) => ({ e, j: chain[e].map(g) })).filter((l) => l.j.every(Boolean)) as { e: Effector; j: THREE.Object3D[] }[];
  const hip = g('hip'), lT = g('lThigh'), rT = g('rThigh'), chest = g('chest') ?? g('abdomen');
  if (!limbs.length || !hip || !lT || !rT || !chest) return [];
  const W = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const n = Math.floor(clip.duration * fps);
  // per frame, per limb: extension fraction, forward reach (limb root → end along the body's facing), end pos rel. hips
  const ext: number[][] = [], fwd: number[][] = [], rel: THREE.Vector3[][] = [], lift: number[][] = [];
  const len = limbs.map(() => 0);
  for (let f = 0; f <= n; f++) {
    mixer.setTime(f / fps); root.updateMatrixWorld(true);
    const hp = W(hip), face = W(lT).sub(W(rT)).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
    ext.push([]); fwd.push([]); rel.push([]); lift.push([]);
    limbs.forEach((l, i) => {
      const [a, m, e] = l.j.map(W);
      const L = a.distanceTo(m) + m.distanceTo(e);
      len[i] = Math.max(len[i], L);
      ext[f].push(a.distanceTo(e) / L);
      fwd[f].push(e.clone().sub(l.e.endsWith('Hand') ? W(chest) : a).setY(0).dot(face) / L);
      rel[f].push(e.clone().sub(hp));
      lift[f].push((e.y - hp.y) / L);
    });
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const cands: { f: number; v: number }[] = [];
  for (let f = 3; f < n - 3; f++) limbs.forEach((l, i) => {
    const e = ext[f][i];
    if (!(e >= ext[f - 1][i] && e >= ext[f + 1][i])) return;          // a local maximum of extension
    const hand = l.e.endsWith('Hand');
    if (e < (hand ? 0.86 : 0.8)) return;                                 // arm / leg nearly straight
    const side = Math.abs(rel[f][i].clone().setY(0).cross(new THREE.Vector3(0, 1, 0)).length()) / len[i];
    if (fwd[f][i] < (hand ? 0.45 : 0.25) && !(!hand && side > 0.6)) return;   // out in front; kicks may go to the side (yoko-geri)
    if (!hand && lift[f][i] < -0.55) return;                             // a kick: the foot well off the floor
    const speed = rel[f][i].distanceTo(rel[f - 3][i]) / len[i];          // how fast it arrived, relative to the hips
    cands.push({ f, v: e * (0.5 + fwd[f][i]) * speed * (hand ? 1 : 1 + Math.max(0, lift[f][i] + 0.55)) });
  });
  cands.sort((a, b) => b.v - a.v);
  const out: typeof cands = [];
  for (const c of cands) {
    if (c.f < 14 || c.f > n - 16) continue;
    if (out.some((q) => Math.abs(q.f - c.f) < gap)) continue;
    out.push(c);
  }
  return out;
}

/** Cut one move out of its take and retarget it onto `model` (a contract-skeleton warrior). */
export async function cutMove(model: THREE.Object3D, name: string, d: MoveDef): Promise<CutMove | null> {
  const fbx = await loadTake(d.take);
  const src = fbx.animations[0]; if (!src) return null;
  const fps = 30;
  const pk = peaks(fbx, src, d.eff, fps)[d.pick];
  if (!pk) return null;
  const a = Math.max(0, pk.f - Math.round(d.pre * fps)), b = Math.min(Math.floor(src.duration * fps), pk.f + Math.round(d.post * fps));
  const sub = THREE.AnimationUtils.subclip(src, `${name}_src`, a, b, fps);
  const clip = retarget(model, fbx, sub, name, CMU_TO_CONTRACT);
  return { clip, hitAt: (pk.f - a) / Math.max(1, b - a) };
}

const H: Effector[] = ['rHand', 'lHand'], RH: Effector[] = ['rHand'], F: Effector[] = ['rFoot', 'lFoot'], RF: Effector[] = ['rFoot'];
/** The hero's strings (keys match main.ts STRINGS slots). */
export const HARU_MOVES: Record<string, MoveDef> = {
  // empty hand: oi-zuki lunge punch and the boxing jab/cross
  punch_0: { take: '13_17', eff: H, pick: 0, pre: 0.3, post: 0.32 },
  punch_1: { take: '13_17', eff: H, pick: 1, pre: 0.3, post: 0.32 },
  punch_2: { take: '135_09', eff: H, pick: 0, pre: 0.4, post: 0.36 },
  punch_3: { take: '13_18', eff: H, pick: 0, pre: 0.32, post: 0.4 },
  // karate kicks: front kick, mawashi-geri, yoko-geri
  kick_0: { take: '135_04', eff: RF, pick: 0, pre: 0.42, post: 0.46 },
  kick_1: { take: '135_07', eff: F, pick: 0, pre: 0.46, post: 0.5 },
  kick_2: { take: '135_11', eff: F, pick: 0, pre: 0.5, post: 0.55 },
  // katana: three cuts from the swordplay takes
  blade_0: { take: '02_07', eff: RH, pick: 0, pre: 0.4, post: 0.42 },
  blade_1: { take: '02_08', eff: RH, pick: 0, pre: 0.4, post: 0.45 },
  blade_2: { take: '02_09', eff: RH, pick: 0, pre: 0.45, post: 0.55 },
};

/** Up to `n` real blows from a take (hands, then feet), as source subclips: what the mob AI plays as its attacks. */
export function strikeCutsByExtension(root: THREE.Object3D, clip: THREE.AnimationClip, n = 3): THREE.AnimationClip[] {
  const fps = 30;
  const hands = peaks(root, clip, ['rHand', 'lHand'], fps), feet = peaks(root, clip, ['rFoot', 'lFoot'], fps);
  const picks = [...hands.slice(0, n), ...feet.slice(0, 1)].slice(0, n);
  return picks.map((p, i) => THREE.AnimationUtils.subclip(clip, `strike_${i}`, Math.max(0, p.f - 11), p.f + 12, fps));
}
