// Monsters and Pumpkin Patch cast.
//  • The cast (assets/characters/*.glb) is built locally from the concept sheets — Hunyuan3D-2mini shape,
//    painted from the sheet views, rigged onto Muse's contract skeleton + clips (scripts/ravencrest/
//    buildCast.py, autoRig.py); the troll and Dracula bases are Muse's. Muse's blockouts stay in muse/.
//  • Meta Muse's monsters (assets/characters/muse/*.glb — zombie, werewolf, vampire, wolf, the
//    Unknown) ship to the drop-in contract with baked clips: idle, walk, run, chase,
//    attack_1..3, hit, death. They play as-is.
//  • The ghost and the cast use the 17-joint rigs (monsters_enemy_rigs.glb,
//    pumpkin_patch_cast_rigs.glb), whose own clips only key a few finger bones, so their motion
//    is retargeted from the grindhouse rig's matching character.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { loadGLB, retarget, GRIND_TO_RIG17, GRINDHOUSE_URL, CMU_TO_CONTRACT } from './character';
import type { CollisionWorld } from './collision';

const MUSE = '/games/ravencrest/assets/characters/muse/';
const CHARS = '/games/ravencrest/assets/characters/';
const MOCAP = '/games/ravencrest/assets/mocap/';

/** New Game+: each time Dracula falls, the next playthrough's monsters are tougher (more life,
 *  harder blows). Stored per browser; `level` 0 is a first run. */
export const Difficulty = {
  level: (() => { try { return Math.min(5, Number(localStorage.getItem('ravencrest.ngplus')) || 0); } catch { return 0; } })(),
  get mul() { return 1 + 0.35 * this.level; },
  won() { try { localStorage.setItem('ravencrest.ngplus', String(this.level + 1)); } catch { /* private mode */ } },
};
/**
 * CMU takes start and stop (and wander): find one clean stride cycle in the steady middle — the span
 * whose end pose best matches its start (both thighs) — so the walk loops without a hitch.
 */
/** Cut the three hardest blows out of a punch-sequence capture: hand-speed peaks (alternating
 *  hands where it can), each from its wind-up to its follow-through. */
function strikeCuts(root: THREE.Object3D, clip: THREE.AnimationClip): THREE.AnimationClip[] {
  const fps = 30, dur = clip.duration;
  const hands = ['rHand', 'lHand'].map((n) => root.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  if (hands.length < 2) return [];
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const pos: THREE.Vector3[][] = [];
  for (let f = 0; f <= Math.floor(dur * fps); f++) {
    mixer.setTime(f / fps);
    root.updateMatrixWorld(true);
    pos.push(hands.map((h) => h.getWorldPosition(new THREE.Vector3())));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const peaks: { f: number; v: number; hand: number }[] = [];
  for (let f = 2; f < pos.length - 2; f++) for (let h = 0; h < 2; h++) {
    const v = pos[f + 1][h].distanceTo(pos[f - 1][h]);
    const vp = pos[f][h].distanceTo(pos[f - 2][h]), vn = pos[f + 2][h].distanceTo(pos[f][h]);
    if (v >= vp && v >= vn) peaks.push({ f, v, hand: h });
  }
  peaks.sort((a, b) => b.v - a.v);
  const picked: typeof peaks = [];
  for (const pk of peaks) {
    if (picked.length >= 3) break;
    if (pk.f < 12 || pk.f > pos.length - 12) continue;
    if (picked.some((q) => Math.abs(q.f - pk.f) < 18)) continue;
    if (picked.length === 1 && pk.hand === picked[0].hand && peaks.some((q) => q.hand !== pk.hand && q.v > pk.v * 0.7 && !picked.some((r) => Math.abs(r.f - q.f) < 18))) continue;
    picked.push(pk);
  }
  // Wind-up 0.36 s before the blow lands, follow-through 0.4 s after (the hit registers at ~45%).
  return picked.map((pk, i) => THREE.AnimationUtils.subclip(clip, `strike_${i}`, pk.f - 11, pk.f + 12, fps));
}

function strideCycle(root: THREE.Object3D, clip: THREE.AnimationClip, bones = ['lThigh', 'rThigh'], minS = 0.7, maxS = 2.6): THREE.AnimationClip {
  const fps = 30, dur = clip.duration;
  if (dur < 1.6) return clip;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const thighs = bones.map((n) => root.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  if (thighs.length < 2) return clip;
  const poses: THREE.Quaternion[][] = [];
  for (let f = 0; f <= Math.floor(dur * fps); f++) {
    mixer.setTime(f / fps);
    poses.push(thighs.map((t) => t.quaternion.clone()));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const dist = (a: number, b: number) => poses[a].reduce((sum, q, i) => sum + (1 - Math.abs(q.dot(poses[b][i]))), 0);
  const start = Math.floor(poses.length * 0.3);
  let best = -1, bestD = Infinity;
  for (let f = start + Math.round(minS * fps); f < Math.min(poses.length - 2, start + Math.round(maxS * fps)); f++) {
    const d = dist(start, f);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (best < 0) return clip;
  return THREE.AnimationUtils.subclip(clip, `${clip.name}_cycle`, start, best, fps);
}
const fbxCache = new Map<string, Promise<THREE.Group>>();
const loadFBX = (url: string) => {
  if (!fbxCache.has(url)) fbxCache.set(url, new FBXLoader().loadAsync(url));
  return fbxCache.get(url)!;
};

export type MobKind = 'zombie' | 'werewolf' | 'ghost' | 'vampire' | 'wolf' | 'unknown' | 'dracula' | 'pumpkin' | 'stitch' | 'miriam' | 'robobones' | 'troll';
export type Team = 'enemy' | 'ally' | 'npc';

interface KindSpec {
  url: string; rig: string; src: string; label: string;
  /** Contract GLB with baked clips (play them; no retarget). */
  baked?: boolean;
  /** Skeleton family for dismemberment. */
  skel?: 'rig17' | 'mixamo' | 'quad';
  hp: number; walk: number; run: number; dmg: number; reach: number; xp: number; aggro: number;
  height: number; ghostly?: boolean;
  /** How it dies: falls apart, beheaded, ectoplasm dissolve, or a plain sink. */
  death?: 'apart' | 'behead' | 'ecto' | 'ash' | 'sink';
  /** Gore/particle tint for its defeat. */
  fx?: number;
  /** Motion-capture locomotion (CMU, assets/mocap/*.fbx) retargeted over the baked walk/run. */
  mocap?: { walk?: string; run?: string; idle?: string };
  /** Mocap strikes: a punch-sequence capture cut into its fastest hand blows (attack / attack2 / attack3). */
  strikes?: string;
  /** Defence while on guard (not mid-swing, not reeling from a hit): chance to deflect / evade a blow. */
  guard?: { deflect: number; evade: number };
}
export const KINDS: Record<MobKind, KindSpec> = {
  zombie:   { url: `${CHARS}zombie.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Zombie', death: 'apart', fx: 0x3d5a2a, hp: 85,  walk: 0.9, run: 2.6, dmg: 11,  reach: 1.5, xp: 20, aggro: 13, height: 1.95 , mocap: { walk: '104_41', run: '120_22', idle: '137_15' }, strikes: '143_23' },
  werewolf: { url: `${CHARS}werewolf.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Werewolf', death: 'behead', fx: 0x6a0a08, hp: 170, walk: 1.4, run: 5.4, dmg: 19, reach: 2.2, xp: 50, aggro: 22, height: 2.37 , guard: { deflect: 0.1, evade: 0.3 } , mocap: { walk: '139_29', idle: '137_41' }, strikes: '144_20' },
  vampire:  { url: `${CHARS}vampire.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Vampire', death: 'ash', fx: 0x8a1010, hp: 130, walk: 1.3, run: 4.8, dmg: 16, reach: 1.7, xp: 40, aggro: 16, height: 1.99 , guard: { deflect: 0.15, evade: 0.3 }, mocap: { idle: '137_23' }, strikes: '144_21' },
  wolf:     { url: `${CHARS}wolf.glb`, rig: '', src: '', baked: true, skel: 'quad', label: 'Wolf', death: 'sink', fx: 0x5a0808, hp: 55, walk: 1.6, run: 6.4, dmg: 9, reach: 1.5, xp: 15, aggro: 20, height: 1.09 , guard: { deflect: 0, evade: 0.3 } },
  // The nightmare's boss (nightmare.ts): Muse's Dracula (characters/bases/dracula.glb), rigged onto the
  // vampire's contract skeleton + clips by scripts/ravencrest/autoRig.py.
  dracula:  { url: `${CHARS}dracula.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Count Dracula', death: 'ash', fx: 0x8a1010, hp: 9600, walk: 1.5, run: 5.6, dmg: 26, reach: 2.2, xp: 1000, aggro: 60, height: 2.25 , guard: { deflect: 0.25, evade: 0.25 } },
  unknown:  { url: `${CHARS}unknown.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'The Unknown', death: 'ash', fx: 0x6a5a8a, hp: 600, walk: 1.1, run: 3.4, dmg: 28, reach: 2.4, xp: 300, aggro: 18, height: 2.79 , guard: { deflect: 0.3, evade: 0.05 } , mocap: { walk: '104_03', idle: '137_41' }, strikes: '02_05' },
  // The bridge battle's troll (bridgeBattle.ts): Muse's bridge_troll (characters/bases), rigged onto the
  // werewolf's contract skeleton + clips by scripts/ravencrest/autoRig.py.
  troll:    { url: `${CHARS}bridge_troll.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Bridge Troll', death: 'sink', fx: 0x3a4a30, hp: 3200, walk: 1.9, run: 4.6, dmg: 22, reach: 2.9, xp: 400, aggro: 40, height: 3.2, guard: { deflect: 0.3, evade: 0 } , mocap: { walk: '120_02', idle: '137_41' } },
  ghost:    { url: `${CHARS}ghost.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Ghost', death: 'ecto', fx: 0x7dffc8, hp: 65,  walk: 1.0, run: 3.6, dmg: 10, reach: 1.7, xp: 30, aggro: 15, height: 1.9, ghostly: true, guard: { deflect: 0, evade: 0.35 } },
  pumpkin:  { url: `${CHARS}melvin.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Pumpkin Patch', hp: 999, walk: 1.6, run: 5.2, dmg: 40, reach: 2.0, xp: 0, aggro: 22, height: 1.95 , mocap: { walk: '35_01', run: '02_03' } },
  stitch:   { url: `${CHARS}stitch.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Stitch the Scarecrow', death: 'apart', fx: 0xc9a24a, hp: 400, walk: 1.2, run: 3.8, dmg: 23, reach: 2.0, xp: 200, aggro: 16, height: 2.1 , guard: { deflect: 0.2, evade: 0.1 } , mocap: { walk: '02_01', run: '02_03', idle: '137_19' }, strikes: '143_23' },
  miriam:   { url: `${CHARS}miriam.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Wicked Witch Miriam', hp: 999, walk: 1.2, run: 3.0, dmg: 0, reach: 1, xp: 0, aggro: 0, height: 1.8 , mocap: { walk: '02_01', run: '02_03', idle: '137_23' } },
  robobones:{ url: `${CHARS}crane.glb`, rig: '', src: '', baked: true, skel: 'mixamo', label: 'Commander Crane', hp: 999, walk: 1.4, run: 4, dmg: 0, reach: 1, xp: 0, aggro: 0, height: 1.95 , mocap: { walk: '02_01', run: '02_03' } },
};

type ClipName = 'idle' | 'walk' | 'run' | 'chase' | 'attack' | 'attack2' | 'attack3' | 'hit' | 'death';
interface Prototype { node: THREE.Object3D; clips: Partial<Record<ClipName, THREE.AnimationClip>>; scale: number }
const protos = new Map<MobKind, Promise<Prototype>>();

function prototype(kind: MobKind): Promise<Prototype> {
  if (!protos.has(kind)) protos.set(kind, (async () => {
    const k = KINDS[kind];
    if (k.baked) {
      // Start every capture downloading alongside the model (each awaited in turn below).
      for (const f of [...Object.values(k.mocap ?? {}), k.strikes]) if (f) loadFBX(`${MOCAP}${f}.fbx`).catch(() => {});
      const file = await loadGLB(k.url);
      const by = (n: string) => file.animations.find((a) => a.name === n);
      const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {
        idle: by('idle'), walk: by('walk'), run: by('run'), chase: by('chase'),
        attack: by('attack_1'), attack2: by('attack_2'), attack3: by('attack_3'), hit: by('hit'), death: by('death'),
      };
      const box = new THREE.Box3().setFromObject(file.scene);
      // Mocap locomotion: real captured walks/runs in place of the baked ones (falls back silently).
      if (k.mocap) {
        for (const [clip, f] of Object.entries(k.mocap) as [keyof NonNullable<KindSpec['mocap']>, string][]) {
          try {
            const fbx = await loadFBX(`${MOCAP}${f}.fbx`);
            const cyc = clip === 'idle' ? strideCycle(fbx, fbx.animations[0], ['abdomen', 'chest', 'lShldr', 'rShldr', 'lThigh', 'rThigh'], 2.5, 7) : strideCycle(fbx, fbx.animations[0]);
            const c = retarget(file.scene, fbx, cyc, clip, CMU_TO_CONTRACT);
            clips[clip] = c;
            if (clip === 'run') clips.chase = c;
          } catch (e) { console.warn(`[ravencrest] mocap ${f} → ${kind}`, e); }
        }
      }
      if (k.strikes) {
        try {
          const fbx = await loadFBX(`${MOCAP}${k.strikes}.fbx`);
          strikeCuts(fbx, fbx.animations[0]).forEach((cut, i) => {
            clips[(['attack', 'attack2', 'attack3'] as const)[i]] = retarget(file.scene, fbx, cut, `attack_${i + 1}`, CMU_TO_CONTRACT);
          });
        } catch (e) { console.warn(`[ravencrest] strikes ${k.strikes} → ${kind}`, e); }
      }
      return { node: file.scene, clips, scale: k.height / Math.max(0.3, box.max.y - box.min.y) };
    }
    const [file, grind] = await Promise.all([loadGLB(k.url), loadGLB(GRINDHOUSE_URL)]);
    const node = file.scene.getObjectByName(k.rig)!;
    const src = grind.scene.getObjectByName(k.src)!;
    const g = (suffix: string) => grind.animations.find((a) => a.name === `${k.src}_${suffix}`)!;
    const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {
      idle: retarget(node, src, g('Idle_Ready'), 'idle', GRIND_TO_RIG17),
      walk: retarget(node, src, g('Walk_Prowl'), 'walk', GRIND_TO_RIG17),
      run: retarget(node, src, g('Run_Sprint'), 'run', GRIND_TO_RIG17),
      attack: retarget(node, src, g('Bushido_Mid_Combo'), 'attack', GRIND_TO_RIG17),
      attack2: retarget(node, src, g('Bushido_High_Cleave'), 'attack2', GRIND_TO_RIG17),
    };
    const box = new THREE.Box3().setFromObject(node);
    return { node, clips, scale: k.height / Math.max(0.5, box.max.y - box.min.y) };
  })());
  return protos.get(kind)!;
}

/** Warm the shared files + retargets so the first spawn doesn't hitch. */
export const preloadMobs = (kinds: MobKind[]) => Promise.all(kinds.map(prototype));

type State = 'idle' | 'wander' | 'chase' | 'attack' | 'hurt' | 'dead' | 'follow';

export class Mob {
  readonly object = new THREE.Group();
  hp: number;
  maxHp: number;
  state: State = 'idle';
  yaw = 0;
  level: string;
  /** Seconds the mob has been in its current state. */
  private st = 0;
  private mixer!: THREE.AnimationMixer;
  private actions!: Partial<Record<ClipName, THREE.AnimationAction>>;
  private current: ClipName = 'idle';
  private mats: THREE.MeshStandardMaterial[] = [];
  private hitThisSwing = false;
  private cooldown = 0;
  private flash = 0;
  private wanderTarget = new THREE.Vector3();
  vel = new THREE.Vector3();
  private respawnIn = 0;
  private bodyY = 0;
  private baseScale = 1;
  readonly home: THREE.Vector3;
  ready = false;
  /** Allies: seconds left before they leave. */
  ttl = Infinity;
  bar: HTMLDivElement | null = null;

  /** Untouchable (Dracula's mist form). */
  shield = false;
  /** Aggro range multiplier (a horde has smelled you from far off). */
  aggroMul = 1;
  /** Part of a horde wave (the tank flattens these). */
  horde = false;
  /** Driven from outside (a cutscene owns the transform): only the animation advances. */
  scripted = false;
  /** Boss escalation (bridgeBattle/nightmare tiers): damage and speed multipliers. */
  power = 1;
  haste = 1;
  /** Seconds since it was last hit — on guard again after a short while (combos still flow). */
  sinceHit = 99;
  /** Hide: fraction of a frontal blade blow it shrugs off (the troll). Behind it, or while it's
   *  `exposed` (stunned), the blade bites in full — and harder. */
  armor = 0;
  exposed = 0;
  /** Seconds it ignores the director's turn-taking after being struck: it hits back. */
  provoked = 0;
  /** Swings left in the current combo (werewolves and the Unknown chain blows). */
  private comboLeft = 0;
  /** Blows taken in the current flurry (resets after 1.5 s without a hit). */
  chain = 0;
  /** Seconds until it can be staggered again (poise). */
  private poise = 0;
  /** Where to wait while another monster has the attack token (unit vector around the foe; set by the director). */
  flank: THREE.Vector3 | null = null;
  /** On guard: not swinging, not reeling, and either rested (1.1 s since a hit) or reading a
   *  flurry — after two blows in a row it's ready for the third (combo breaker). */
  get guarding() { return this.alive && this.state !== 'attack' && !this.scripted && (this.sinceHit > 1.1 || this.chain >= 2); }
  /** Evade: a quick hop sideways and back from `from` (a blade swinging in). */
  dodge(from: THREE.Vector3) {
    const away = this.object.position.clone().sub(from).setY(0).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    this.vel.copy(side.multiplyScalar(6.5).addScaledVector(away, 4));
    this.cooldown = Math.min(this.cooldown, 0.25);
    this.go('chase');
  }
  /** Deflect: brace and turn the blow aside, then answer at once. */
  deflect(from: THREE.Vector3) {
    const to = from.clone().sub(this.object.position);
    this.yaw = Math.atan2(to.x, to.z);
    this.cooldown = 0;
    this.go('chase');
  }

  constructor(readonly kind: MobKind, public team: Team, home: THREE.Vector3, level: string, yaw = 0) {
    const k = KINDS[kind];
    this.hp = this.maxHp = Math.round(k.hp * (k.xp > 0 ? Difficulty.mul : 1));
    this.home = home.clone();
    this.level = level;
    this.yaw = yaw;
    this.object.position.copy(home);
    this.object.name = `mob:${kind}`;
    this.object.userData.dynamic = true;
    prototype(kind).then((p) => {
      const body = cloneSkinned(p.node);
      body.position.set(0, 0, 0);
      body.scale.setScalar(p.scale);
      this.baseScale = p.scale;
      body.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
        m.castShadow = true;
        // Own materials so hit flashes and death fades stay per-mob.
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (k.ghostly) { mat.transparent = true; mat.opacity = 0.72; mat.depthWrite = false; mat.emissive = new THREE.Color(0x4a7a8a); mat.emissiveIntensity = 0.6; }
        m.material = mat;
        this.mats.push(mat);
      });
      // Feet on the ground.
      const b = new THREE.Box3().setFromObject(body);
      body.position.y = this.bodyY = -b.min.y;
      this.object.add(body);
      this.mixer = new THREE.AnimationMixer(body);
      this.actions = Object.fromEntries(Object.entries(p.clips).filter(([, c]) => !!c).map(([n, c]) => {
        const a = this.mixer.clipAction(c!);
        if (n.startsWith('attack') || n === 'hit' || n === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        return [n, a];
      })) as Partial<Record<ClipName, THREE.AnimationAction>>;
      this.actions.idle!.play();
      this.mixer.setTime(Math.random() * 2);
      this.ready = true;
    });
  }

  get alive() { return this.state !== 'dead'; }
  /** Dead but still sinking/fading out. */
  get fading() { return this.state === 'dead' && this.st < 1.6 && !this.bodyGone; }
  /** The body was handed to gore.ts (dismembered): hide the original. */
  bodyGone = false;
  get body() { return this.object.children[0] ?? null; }
  /** Granted by the director: only token holders may swing (others circle). */
  mayAttack = true;
  /** Side this mob circles on while waiting for a token (+1/−1). */
  private orbit = Math.random() < 0.5 ? 1 : -1;
  /** External push (separation from other bodies), applied next update. */
  readonly push = new THREE.Vector3();
  private faceTo: THREE.Vector3 | null = null;
  get spec() { return KINDS[this.kind]; }

  private go(s: State) { if (this.state !== s) { this.state = s; this.st = 0; } }
  private anim(want: ClipName, fade = 0.2, speed = 1) {
    if (!this.ready) return;
    // Rigs without a clip fall back: chase → run, attack3 → attack; no hit/death clip → skip.
    const name: ClipName | null = this.actions[want] ? want : want === 'chase' ? 'run' : want === 'attack3' ? 'attack' : null;
    if (!name) return;
    const a = this.actions[name]!;
    a.setEffectiveTimeScale(speed);
    const oneShot = name.startsWith('attack') || name === 'hit';
    if (this.current === name && !oneShot) return;
    const prev = this.actions[this.current];
    a.reset().play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    this.current = name;
  }
  /** Scripted pose (cutscene actors driven from outside). */
  pose(name: ClipName) { this.anim(name, 0.15); }
  /** Turn a scripted actor into a fighter. */
  makeEnemy(foe: THREE.Vector3) { this.team = 'enemy'; this.home.copy(foe); this.go('chase'); }
  /** Swing now (teleport strikes): straight into an attack, cooldown cleared. */
  strikeNow() { if (!this.alive) return; this.cooldown = 0; this.go('chase'); }
  /** Has a baked clip for this (Muse contract models). */
  has(name: ClipName) { return !!this.actions?.[name]; }

  /** Take damage; returns true if this blow killed it. */
  damage(n: number, from: THREE.Vector3): boolean {
    if (!this.alive || this.team === 'npc' || this.shield) return false;
    this.chain = this.sinceHit < 1.5 ? this.chain + 1 : 1;
    // Struck: it answers. Savage kinds swing back almost at once.
    this.provoked = 2.5;
    const savage = this.kind === 'werewolf' || this.kind === 'vampire' || this.kind === 'unknown' || this.kind === 'wolf';
    this.cooldown = Math.min(this.cooldown, savage ? 0.12 : 0.35);
    this.sinceHit = 0;
    this.hp -= n;
    this.flash = 0.18;
    // Knockback away from the hit.
    const push = this.object.position.clone().sub(from).setY(0);
    if (push.lengthSq() > 1e-4) this.vel.add(push.normalize().multiplyScalar(this.kind === 'troll' ? 0.35 : this.kind === 'werewolf' || this.kind === 'stitch' ? 1.2 : 2.2));
    if (this.hp <= 0) { this.hp = 0; this.go('dead'); this.respawnIn = this.team === 'enemy' ? 35 : Infinity; return true; }
    // Poise: the big ones shrug off ordinary blows; the rest flinch at most once a second, so a
    // flurry can't stun-lock them — they swing back through it.
    const heavy = this.kind === 'werewolf' || this.kind === 'unknown' || this.kind === 'stitch' || this.kind === 'troll' || this.kind === 'dracula';
    if (this.state !== 'attack' && this.poise <= 0 && (!heavy || n >= 30)) { this.go('hurt'); this.anim('hit', 0.05); this.poise = heavy ? 2.2 : 1.0; }
    return false;
  }

  /**
   * Per-frame AI. `foe` is the target this mob cares about (the player for enemies, the
   * nearest enemy for allies). Calls `strike` on the swing's hit frame.
   */
  update(dt: number, world: CollisionWorld | null, foe: { pos: THREE.Vector3; alive: boolean } | null, leader: THREE.Vector3 | null, strike: (m: Mob) => void) {
    if (!this.ready) return;
    if (this.scripted) { this.mixer.update(dt); return; }
    this.sinceHit += dt; this.poise -= dt; this.provoked -= dt; this.exposed -= dt;
    this.st += dt;
    this.cooldown -= dt;
    this.ttl -= dt;
    const k = this.spec;
    const p = this.object.position;
    let want = new THREE.Vector3();
    let speed = 0;

    if (this.state === 'dead') {
      // Sink and fade, then respawn at home (enemies only, once the player has moved off).
      const t = Math.min(1, this.st / 1.4);
      const body = this.object.children[0];
      if (k.death === 'ecto') {
        // Ectoplasm dissolve: the ghost twists into a narrowing column and boils away upward.
        const e = Math.min(1, this.st / 1.6);
        body.rotation.y += dt * (4 + 18 * e);
        body.scale.set(this.baseScale * (1 - 0.85 * e), this.baseScale * (1 + 0.8 * e), this.baseScale * (1 - 0.85 * e));
        body.position.y = this.bodyY + e * 0.8;
        for (const m of this.mats) { m.opacity = 0.72 * (1 - e); m.emissiveIntensity = 1.5 + 3 * e; }
      } else if (!this.bodyGone) {
        // Baked death clip first (falls, crumples), then sink and fade; 'ash' crumbles faster.
        const clip = this.has('death') ? Math.min(1.4, this.actions.death!.getClip().duration) : 0;
        if (this.st < 0.05 && clip) this.anim('death', 0.1);
        const ash = k.death === 'ash';
        const f = Math.max(0, Math.min(1, (this.st - (ash ? clip * 0.45 : clip)) / (ash ? 0.5 : 1.2)));
        body.position.y = this.bodyY - f * (ash ? 0.2 : 0.5);
        if (ash) body.scale.set(this.baseScale * (1 + 0.15 * f), this.baseScale * (1 - 0.9 * f), this.baseScale * (1 + 0.15 * f));
        for (const m of this.mats) { m.transparent = f > 0; m.opacity = 1 - f; }
        if (this.mixer) this.mixer.update(dt);
        this.respawnIn -= dt;
        if (this.respawnIn <= 0 && (!foe || foe.pos.distanceTo(this.home) > 22)) this.respawn();
        return;
      }
      this.anim('idle', 0.3, 0.3);
      this.respawnIn -= dt;
      if (this.respawnIn <= 0 && (!foe || foe.pos.distanceTo(this.home) > 22)) this.respawn();
      this.mixer.update(dt);
      return;
    }

    const toFoe = foe && foe.alive ? foe.pos.clone().sub(p).setY(0) : null;
    const dFoe = toFoe ? toFoe.length() : Infinity;
    switch (this.state) {
      case 'idle':
      case 'wander':
        if (dFoe < k.aggro * this.aggroMul && this.team !== 'npc') { this.go('chase'); break; }
        if (this.team === 'ally' && leader) { this.go('follow'); break; }
        const hunter = this.kind === 'werewolf' || this.kind === 'wolf' || this.kind === 'vampire';
        if (this.state === 'idle' && this.st > (hunter ? 0.8 + Math.random() * 1.2 : 3 + Math.random() * 3) && this.team === 'enemy') {
          this.wanderTarget.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
          this.go('wander');
        }
        if (this.state === 'wander') {
          want = this.wanderTarget.clone().sub(p).setY(0);
          if (want.length() < 0.5 || this.st > 8) this.go('idle');
          speed = k.walk;
        }
        break;
      case 'follow': {
        if (dFoe < 12) { this.go('chase'); break; }
        if (!leader) { this.go('idle'); break; }
        want = leader.clone().sub(p).setY(0);
        const d = want.length();
        speed = d > 6 ? k.run : d > 2.5 ? k.walk * 1.4 : 0;
        break;
      }
      case 'chase':
        if (!toFoe || dFoe > k.aggro * this.aggroMul * 1.8 || (this.team === 'enemy' && !this.horde && p.distanceTo(this.home) > 40)) { this.go(this.team === 'ally' ? 'follow' : 'wander'); this.wanderTarget.copy(this.home); break; }
        want = toFoe.clone();
        speed = (dFoe > 5 ? k.run : k.walk * 1.6) * this.haste;
        // Inside its reach, waiting out the swing cooldown: circle-strafe around Jack (never stand
        // still, never shove into him), drifting back to just inside striking range.
        if (dFoe < k.reach * 0.95 && this.cooldown > 0) {
          const side = new THREE.Vector3(-toFoe.z, 0, toFoe.x).normalize().multiplyScalar(this.orbit);
          const radial = toFoe.clone().normalize().multiplyScalar(dFoe - k.reach * 0.75);
          want = side.add(radial.multiplyScalar(0.9));
          speed = k.walk * 1.15 * this.haste;
          this.faceTo = toFoe.clone();
          if (Math.random() < dt * 0.5) this.orbit *= -1;
        }
        // Fast hunters close the last few metres in one leap when their swing is ready.
        const quick = this.kind === 'werewolf' || this.kind === 'wolf' || this.kind === 'vampire' || this.kind === 'dracula';
        if (quick && (this.mayAttack || this.provoked > 0) && this.cooldown <= 0 && dFoe > k.reach * 1.2 && dFoe < 6 && Math.random() < dt * 1.5) {
          this.vel.copy(toFoe.clone().normalize().multiplyScalar(this.kind === 'wolf' ? 10 : 8.5));
        }
        if (!this.mayAttack && this.provoked <= 0 && dFoe < 6) {
          // No attack token: take up a post around the foe (the director spreads them behind and
          // to the sides), ~3 m off, and keep circling, waiting for an opening.
          const post = this.flank ? foe!.pos.clone().addScaledVector(this.flank, 3.2).sub(p).setY(0) : null;
          const side = new THREE.Vector3(-toFoe.z, 0, toFoe.x).normalize().multiplyScalar(this.orbit);
          const radial = toFoe.clone().normalize().multiplyScalar(dFoe - 3.2);
          want = post && post.length() > 0.8 ? post.add(side.multiplyScalar(0.3)) : side.add(radial.multiplyScalar(0.8));
          speed = (post && post.length() > 2 ? k.run * 0.8 : k.walk * 1.2) * this.haste;
          if (Math.random() < dt * 0.3) this.orbit *= -1;
          // Keep facing the foe while strafing.
          this.faceTo = toFoe.clone();
        } else if (dFoe < k.reach && this.cooldown <= 0) {
          this.go('attack');
          this.hitThisSwing = false;
          if (this.comboLeft <= 0) this.comboLeft = this.kind === 'werewolf' ? 2 + (Math.random() < 0.5 ? 1 : 0) : this.kind === 'unknown' || this.kind === 'vampire' ? 1 + (Math.random() < 0.5 ? 1 : 0) : 1;
          this.comboLeft--;
          const r = Math.random();
          this.anim(r < 0.45 ? 'attack' : r < 0.8 ? 'attack2' : 'attack3', 0.12, (this.kind === 'werewolf' || this.kind === 'wolf' ? 1.2 : 1) * this.haste);
        }
        break;
      case 'attack': {
        if (toFoe) want = toFoe.clone().multiplyScalar(0.001); // keep facing the foe
        const cur = this.actions[this.current];
        // The swing's length from its *set* speed: a one-shot that has clamped on its last frame
        // reports an effective speed of 0, and dividing by that froze monsters mid-attack forever.
        const dur = cur ? cur.getClip().duration / Math.max(0.05, Math.abs(cur.timeScale)) : 0.8;
        if (!this.hitThisSwing && this.st > dur * 0.45) { this.hitThisSwing = true; strike(this); }
        if (this.st >= dur || this.st > 3 || (cur && !cur.isRunning() && this.st > 0.25)) {
          this.cooldown = (this.kind === 'zombie' ? 1.1 : this.kind === 'troll' ? 0.55 : this.kind === 'werewolf' ? 0.45 : 0.7) * (0.6 + Math.random() * 0.7);
          // Mid-combo: straight into the next blow.
          if (this.comboLeft > 0 && toFoe && toFoe.length() < k.reach * 1.3) this.cooldown = 0.04;
          // Quick ones hop back out of reach after a swing (then come again).
          if (k.guard && k.guard.evade > 0 && Math.random() < 0.35 && toFoe) this.vel.addScaledVector(toFoe.clone().normalize(), -4.5);
          this.go('chase');
        }
        break;
      }
      case 'hurt':
        if (this.st > 0.35) this.go(dFoe < k.aggro ? 'chase' : 'idle');
        break;
    }

    // Steering + collision.
    const look = this.faceTo ?? want;
    this.faceTo = null;
    if (look.lengthSq() > 1e-6) {
      const target = Math.atan2(look.x, look.z);
      const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += THREE.MathUtils.clamp(diff, -6 * dt, 6 * dt);
    }
    const desired = want.lengthSq() > 1e-6 && this.state !== 'attack' && this.state !== 'hurt' ? want.clone().setY(0).normalize().multiplyScalar(speed) : new THREE.Vector3();
    this.vel.lerp(desired, 1 - Math.exp(-dt * 6));
    const next = p.clone().addScaledVector(this.vel, dt).add(this.push);
    this.push.set(0, 0, 0);
    if (world) {
      const r = world.resolve(next.clone().setY(p.y + 0.05), 0.35, 1.7);
      next.x = r.pos.x; next.z = r.pos.z;
      const g = world.groundAt(next.x, next.z, p.y + 0.8, 3);
      next.y = k.ghostly ? (g ?? p.y) + 0.25 + Math.sin(this.st * 2) * 0.08 : g ?? p.y;
    }
    p.copy(next);
    this.object.rotation.y = this.yaw;

    if (this.state !== 'attack') {
      const v = Math.hypot(this.vel.x, this.vel.z);
      if (v > 2.6) this.anim(this.state === 'chase' ? 'chase' : 'run', 0.2, THREE.MathUtils.clamp(v / 4.4, 0.7, 1.3));
      else if (v > 0.25) this.anim('walk', 0.2, THREE.MathUtils.clamp(v / 1.2, 0.6, 1.6));
      else this.anim('idle', 0.3);
    }
    // Hit flash.
    this.flash = Math.max(0, this.flash - dt);
    for (const m of this.mats) m.emissiveIntensity = this.flash > 0 ? 2.5 : k.ghostly ? 0.6 : 0;
    if (this.flash > 0) for (const m of this.mats) m.emissive?.setRGB(1, 0.25, 0.1);
    else if (k.ghostly) for (const m of this.mats) m.emissive?.setHex(0x4a7a8a);
    this.mixer.update(dt);
  }

  respawn() {
    this.hp = this.maxHp;
    this.object.position.copy(this.home);
    this.vel.set(0, 0, 0);
    const body = this.object.children[0];
    if (body) { body.position.y = this.bodyY; body.scale.setScalar(this.baseScale); body.rotation.set(0, 0, 0); }
    this.bodyGone = false;
    for (const m of this.mats) { m.opacity = this.spec.ghostly ? 0.72 : 1; m.transparent = !!this.spec.ghostly; }
    this.go('idle');
  }
}
