// Interactive 3D Rig & Animation Inspector for Vesselbound / Rift Realm characters, mounts, bosses, fauna & gear.
// Open via Vite dev server: /rig-viewer.html (supports ?id=dragon_knight&clip=hero_idle)
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initKTX2, getKTX2 } from './textures';
import { CHARACTER_ROSTER, CREATURE_ROSTER, WEAPON_ROSTER, WARDROBE_ROSTER, FLORA_ROSTER, STRUCTURE_ROSTER } from './characters';
import { forgeRig, type ForgeRig } from '../../../playkit/character/forgeRig';
import { buildSecondary, windAt } from './secondary';
import type { SoftRegions } from '../../../playkit/character/softRegions';
import type { BatWings } from '../../../playkit/character/batWings';

type GroupKey = 'all' | 'vessel' | 'boss' | 'warden' | 'hero' | 'enemy' | 'mount' | 'fauna' | 'weapon' | 'wardrobe' | 'flora' | 'structure';
type ClipGrade = 'good' | 'mocap' | 'usable' | 'poor' | 'authored';

interface ClipMeta {
  grade: ClipGrade;
  note?: string;
}

interface ViewerEntry {
  id: string;
  name: string;
  group: Exclude<GroupKey, 'all'>;
  subtitle: string;
  heightM: number;
  url: string;
  gpuUrl?: string;
  clipsUrl?: string;
}

const ENTRIES: ViewerEntry[] = [
  ...CHARACTER_ROSTER.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.category as Exclude<GroupKey, 'all'>,
    subtitle: `${c.category} · ${c.rig}`,
    heightM: c.heightM,
    url: `/games/rift-realm/assets/characters/${c.id}.glb`,
    gpuUrl: `/games/rift-realm/assets/characters/gpu/${c.id}.glb`,
    clipsUrl: c.clipsJson ? `/games/rift-realm/assets/characters/clips/${c.id}.json` : undefined,
  })),
  ...CREATURE_ROSTER.map((cr) => ({
    id: cr.id,
    name: cr.name,
    group: 'fauna' as const,
    subtitle: `fauna · ${cr.arch}`,
    heightM: cr.heightM,
    url: cr.url,
  })),
  ...WEAPON_ROSTER.map((w) => ({
    id: w.id,
    name: w.name,
    group: 'weapon' as const,
    subtitle: `weapon · ${w.kind}`,
    heightM: w.lengthM,
    url: w.url,
  })),
  ...WARDROBE_ROSTER.map((a) => ({
    id: a.id,
    name: a.name,
    group: 'wardrobe' as const,
    subtitle: `armor · ${a.slot} (${a.mountBone})`,
    heightM: a.heightM,
    url: a.url,
  })),
  ...FLORA_ROSTER.map((fl) => ({
    id: fl.id,
    name: fl.name,
    group: 'flora' as const,
    subtitle: `flora · ${fl.sub}`,
    heightM: fl.heightM,
    url: fl.url,
  })),
  ...STRUCTURE_ROSTER.map((st) => ({
    id: st.id,
    name: st.name,
    group: 'structure' as const,
    subtitle: `structure · ${st.sub}`,
    heightM: st.heightM,
    url: st.url,
  })),
];

const CATEGORIES: { key: GroupKey; label: string }[] = [
  { key: 'all', label: `All (${ENTRIES.length})` },
  { key: 'vessel', label: 'Vessels' },
  { key: 'boss', label: 'Bosses' },
  { key: 'warden', label: 'Wardens (12)' },
  { key: 'hero', label: 'Heroes' },
  { key: 'enemy', label: 'Enemies' },
  { key: 'mount', label: 'Mounts' },
  { key: 'fauna', label: 'Fauna (24)' },
  { key: 'weapon', label: 'Weapons (14)' },
  { key: 'wardrobe', label: 'Wardrobe (21)' },
  { key: 'flora', label: 'Flora (18)' },
  { key: 'structure', label: 'Structures (18)' },
];

const q = new URLSearchParams(location.search);

// ── Scene & WebGPU Renderer ──────────────────────────────────────────────────────────────────────────────────
const viewport = document.getElementById('viewport')!;
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1018);

const cam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 120);
const controls = new OrbitControls(cam, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

/** Procedural studio softbox lightbox baked into a PMREM cubemap for realistic metallic/roughness PBR reflections. */
function buildStudioEnvironment(r: THREE.WebGPURenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x111722);
  const panel = (color: number, intensity: number, pos: [number, number, number], size: [number, number], lookAt: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    envScene.add(m);
  };
  // Overhead key softbox
  panel(0xfff8ee, 3.2, [0, 6.5, 1.5], [7, 5]);
  // Front-right warm key reflector
  panel(0xffe7cc, 2.4, [5.5, 3.2, 5.5], [4.5, 5.5]);
  // Left-back cool cyan studio rim strip
  panel(0x7dd3fc, 2.8, [-6.0, 3.0, -4.5], [4.5, 6.0]);
  // Right-back violet-blue accent fill
  panel(0xa5b4fc, 1.6, [5.5, 2.5, -5.0], [4.0, 5.0]);
  // Front-left neutral bounce card
  panel(0xcbd5e1, 1.2, [-5.5, 1.8, 4.5], [5.0, 4.0]);
  // Subtle slate ground bounce
  panel(0x283244, 0.7, [0, -4.0, 0], [14, 14]);
  const pmrem = new THREE.PMREMGenerator(r);
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

// Three-point studio lighting + rim light
scene.add(new THREE.HemisphereLight(0xc9dfff, 0x1d2330, 0.95));
const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.1);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x66c2ff, 1.35);
rimLight.position.set(-4, 4, -5);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.55);
fillLight.position.set(-4, 2, 4);
scene.add(fillLight);

// Ground pedestal & studio grid
const groundGroup = new THREE.Group();
const disc = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardNodeMaterial({ color: 0x151b27, roughness: 0.75, metalness: 0.25 }),
);
disc.rotation.x = -Math.PI / 2;
disc.receiveShadow = true;
groundGroup.add(disc);
const grid = new THREE.GridHelper(12, 24, 0x334155, 0x1e293b);
grid.position.y = 0.002;
groundGroup.add(grid);
scene.add(groundGroup);

// ── State ────────────────────────────────────────────────────────────────────────────────────────────────────
let activeGroup: GroupKey = 'all';
let activeEntry: ViewerEntry | null = null;
let modelGroup: THREE.Group | null = null;
let loadedRoot: THREE.Object3D | null = null;
let equippedRightObj: THREE.Object3D | null = null;
let equippedLeftObj: THREE.Object3D | null = null;
let equippedArmorObjs: THREE.Object3D[] = [];
let gearToken = 0;
const weaponGlbCache = new Map<string, Promise<THREE.Object3D | null>>();
let activeForge: ForgeRig | null = null;
let activeSoft: SoftRegions | null = null;
let activeWings: BatWings | null = null;
let skelHelper: THREE.SkeletonHelper | null = null;
let mixer: THREE.AnimationMixer | null = null;
let activeAction: THREE.AnimationAction | null = null;
let activeClips: THREE.AnimationClip[] = [];
let activeClipMeta: Record<string, ClipMeta> = {};
let playing = true;
let playbackSpeed = 1.0;
let glowBoost = 1.2;
let showBones = false;
let showWire = false;
let turntable = false;
let cleanClipsOnly = true;
let useHqSource = true;
let currentHeight = 2.0;
let loadToken = 0;
let secTime = 0;
const windVec = new THREE.Vector3();
const zeroVel = new THREE.Vector3();

// ── DOM Elements ─────────────────────────────────────────────────────────────────────────────────────────────
const searchEl = document.getElementById('search') as HTMLInputElement;
const catsEl = document.getElementById('cats')!;
const listEl = document.getElementById('roster-list')!;
const countBadge = document.getElementById('count-badge')!;
const loadingEl = document.getElementById('loading')!;
const clipListEl = document.getElementById('clip-list')!;
const clipsHeading = document.getElementById('clips-heading')!;
const hudName = document.getElementById('hud-name')!;
const hudCat = document.getElementById('hud-cat')!;
const hudMeta = document.getElementById('hud-meta')!;
const btnPlay = document.getElementById('btn-play')!;
const btnBind = document.getElementById('btn-bind')!;
const btnBones = document.getElementById('btn-bones')!;
const btnWire = document.getElementById('btn-wire')!;
const btnGrid = document.getElementById('btn-grid')!;
const btnSpin = document.getElementById('btn-spin')!;
const btnTex = document.getElementById('btn-tex')!;
const btnCleanClips = document.getElementById('btn-clean-clips')!;
const scrubEl = document.getElementById('scrub') as HTMLInputElement;
const timeLabel = document.getElementById('time-label')!;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedVal = document.getElementById('speed-val')!;
const glowSlider = document.getElementById('glow-slider') as HTMLInputElement;
const glowVal = document.getElementById('glow-val')!;
const selEquipRight = document.getElementById('equip-right') as HTMLSelectElement | null;
const selEquipLeft = document.getElementById('equip-left') as HTMLSelectElement | null;
const selEquipArmor = document.getElementById('equip-armor') as HTMLSelectElement | null;

function loadWeaponScene(url: string): Promise<THREE.Object3D | null> {
  let p = weaponGlbCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene).catch(() => null);
    weaponGlbCache.set(url, p);
  }
  return p;
}

function findRigBone(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  for (const target of names) {
    root.traverse((o) => {
      if (found) return;
      const clean = o.name.replace(/^.*[:|]/, '');
      if (clean === target) found = o;
    });
    if (found) return found;
  }
  return null;
}

async function applyEquippedGear() {
  const token = ++gearToken;
  if (equippedRightObj) { equippedRightObj.removeFromParent(); equippedRightObj = null; }
  if (equippedLeftObj) { equippedLeftObj.removeFromParent(); equippedLeftObj = null; }
  for (const obj of equippedArmorObjs) obj.removeFromParent();
  equippedArmorObjs = [];
  if (!loadedRoot) return;
  const targetRoot = loadedRoot;

  const rId = selEquipRight?.value ?? '';
  if (rId) {
    const w = WEAPON_ROSTER.find((x) => x.id === rId);
    const bone = findRigBone(targetRoot, ['RightHand', 'hand_r_weapon']);
    if (w && bone) {
      const src = await loadWeaponScene(w.url);
      if (src && token === gearToken && loadedRoot === targetRoot) {
        const clone = src.clone(true);
        clone.scale.setScalar(0.86);
        clone.position.set(-0.02, -0.04, 0.05);
        clone.rotation.set(0.24, 0, -0.24);
        bone.add(clone);
        equippedRightObj = clone;
        applyMaterialSettings();
      }
    }
  }

  const lId = selEquipLeft?.value ?? '';
  if (lId) {
    const w = WEAPON_ROSTER.find((x) => x.id === lId);
    const bone = findRigBone(targetRoot, ['LeftForeArm', 'LeftHand', 'hand_l_weapon']);
    if (w && bone) {
      const src = await loadWeaponScene(w.url);
      if (src && token === gearToken && loadedRoot === targetRoot) {
        const clone = src.clone(true);
        const isShield = w.kind === 'shield';
        clone.scale.setScalar(isShield ? 0.82 : 0.84);
        if (isShield) {
          clone.position.set(0.14, -0.14, 0.05);
          clone.rotation.set(0, 1.43, -0.21);
        } else {
          clone.position.set(0.02, -0.04, 0.05);
          clone.rotation.set(0.24, 0, 0.24);
        }
        bone.add(clone);
        equippedLeftObj = clone;
        applyMaterialSettings();
      }
    }
  }

  const aId = selEquipArmor?.value ?? '';
  if (aId) {
    const a = WARDROBE_ROSTER.find((x) => x.id === aId);
    if (a) {
      const src = await loadWeaponScene(a.url);
      if (src && token === gearToken && loadedRoot === targetRoot) {
        const mountOne = (
          boneNames: string[],
          pos: [number, number, number],
          rot: [number, number, number] = [0, 0, 0],
          scl: [number, number, number] = [1, 1, 1],
        ) => {
          const bone = findRigBone(targetRoot, boneNames);
          if (!bone) return;
          const clone = src.clone(true);
          if (scl[0] * scl[1] * scl[2] < 0) {
            clone.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!m.isMesh || !m.material) return;
              const fix = (mat: THREE.Material) => {
                const c = mat.clone();
                c.side = THREE.DoubleSide;
                return c;
              };
              m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
            });
          }
          clone.position.set(...pos);
          clone.rotation.set(...rot);
          clone.scale.set(...scl);
          bone.add(clone);
          equippedArmorObjs.push(clone);
        };

        if (a.slot === 'head') {
          const pos: [number, number, number] =
            a.id === 'lumen_halo' ? [0, 0.20, -0.10] :
            a.id === 'nyx_visor' ? [0, 0.06, 0.11] :
            a.id.includes('crown') ? [0, 0.14, 0.0] :
            [0, -0.06, 0.02];
          mountOne(['Head', a.mountBone], pos, [0, 0, 0], [0.96, 0.96, 0.96]);
        } else if (a.slot === 'chest') {
          mountOne(['Spine2', a.mountBone], [0, -0.18, 0.04], [0, 0, 0], [0.96, 0.96, 0.96]);
        } else if (a.slot === 'back') {
          mountOne(['Spine2', a.mountBone], [0, -0.22, -0.14], [0, 0, 0], [1.0, 1.0, 1.0]);
        } else if (a.slot === 'belt') {
          mountOne(['Hips', a.mountBone], [0, -0.09, 0.01], [0, 0, 0], [1.0, 1.0, 1.0]);
        } else if (a.slot === 'shoulder') {
          mountOne(['LeftArm', 'LeftShoulder'], [0.04, -0.08, 0.0], [0, 0, 0], [0.95, 0.95, 0.95]);
          mountOne(['RightArm', 'RightShoulder'], [-0.04, -0.08, 0.0], [0, 0, 0], [-0.95, 0.95, 0.95]);
        } else if (a.slot === 'gauntlet') {
          mountOne(['LeftForeArm', 'LeftHand'], [0, -0.12, 0.0], [0, 0, 0], [0.92, 0.92, 0.92]);
          mountOne(['RightForeArm', 'RightHand'], [0, -0.12, 0.0], [0, 0, 0], [-0.92, 0.92, 0.92]);
        } else if (a.slot === 'greave') {
          mountOne(['LeftLeg', 'LeftUpLeg'], [0, -0.20, 0.02], [0, 0, 0], [0.94, 0.94, 0.94]);
          mountOne(['RightLeg', 'RightUpLeg'], [0, -0.20, 0.02], [0, 0, 0], [-0.94, 0.94, 0.94]);
        } else if (a.slot === 'weapon') {
          mountOne(['RightHand', 'hand_r_weapon'], [-0.02, -0.04, 0.05], [0.24, 0, -0.24], [0.86, 0.86, 0.86]);
        } else {
          mountOne([a.mountBone], [0, 0, 0]);
        }
        applyMaterialSettings();
      }
    }
  }
}

// ── Camera Helpers ───────────────────────────────────────────────────────────────────────────────────────────
function frameCamera(mode: 'three' | 'front' | 'side' | 'back') {
  const h = Math.max(1.2, currentHeight);
  const d = h * 2.25;
  const cy = h * 0.48;
  if (mode === 'front') cam.position.set(0, cy, d);
  else if (mode === 'back') cam.position.set(0, cy, -d);
  else if (mode === 'side') cam.position.set(d, cy, 0);
  else cam.position.set(d * 0.72, h * 0.62, d * 0.78);
  controls.target.set(0, cy, 0);
  controls.update();
}

function applyMaterialSettings() {
  if (!modelGroup) return;
  modelGroup.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if ('wireframe' in mat) (mat as THREE.MeshStandardMaterial).wireframe = showWire;
      if ('emissiveIntensity' in mat) (mat as THREE.MeshStandardMaterial).emissiveIntensity = glowBoost;
    }
  });
}

// ── Roster Sidebar ───────────────────────────────────────────────────────────────────────────────────────────
function renderCategories() {
  catsEl.innerHTML = '';
  for (const c of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'cat-btn' + (c.key === activeGroup ? ' on' : '');
    b.textContent = c.label;
    b.onclick = () => { activeGroup = c.key; renderCategories(); renderList(); };
    catsEl.appendChild(b);
  }
}

function renderList() {
  const term = searchEl.value.trim().toLowerCase();
  const filtered = ENTRIES.filter((e) => {
    if (activeGroup !== 'all' && e.group !== activeGroup) return false;
    if (!term) return true;
    return e.name.toLowerCase().includes(term) || e.id.toLowerCase().includes(term) || e.subtitle.toLowerCase().includes(term);
  });
  countBadge.textContent = String(filtered.length);
  listEl.innerHTML = '';
  for (const e of filtered) {
    const b = document.createElement('button');
    b.className = 'item' + (activeEntry?.id === e.id ? ' on' : '');
    b.innerHTML = `<div><div class="item-name">${e.name}</div><div class="item-sub">${e.subtitle}</div></div><span class="item-sub">${e.heightM.toFixed(1)}m</span>`;
    b.onclick = () => selectEntry(e);
    listEl.appendChild(b);
  }
}

// ── Animation Playback ───────────────────────────────────────────────────────────────────────────────────────
function clipGradeOf(name: string): ClipGrade {
  return activeClipMeta[name.toLowerCase()]?.grade ?? 'authored';
}

function playClip(clip: THREE.AnimationClip | null) {
  if (!mixer) return;
  mixer.stopAllAction();
  activeAction = null;
  if (clip) {
    activeAction = mixer.clipAction(clip);
    activeAction.reset().play();
    playing = true;
    btnPlay.textContent = 'Pause';
    btnPlay.classList.add('on');
    btnBind.classList.remove('on');
  } else {
    // Reset skeleton cleanly to rest/bind pose
    modelGroup?.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.pose();
    });
    activeSoft?.reset();
    activeWings?.reset();
    playing = false;
    btnPlay.textContent = 'Play';
    btnPlay.classList.remove('on');
    btnBind.classList.add('on');
  }
  renderClips();
}

function renderClips() {
  const visible = activeClips.filter((c) => {
    if (!cleanClipsOnly) return true;
    const g = clipGradeOf(c.name);
    return g !== 'poor';
  });
  const hiddenCount = activeClips.length - visible.length;
  clipsHeading.textContent = `Clips (${visible.length}${hiddenCount > 0 ? ` · ${hiddenCount} poor hidden` : ''})`;
  clipListEl.innerHTML = '';
  for (const c of visible) {
    const meta = activeClipMeta[c.name.toLowerCase()];
    const g = meta?.grade ?? 'authored';
    const dotClass = g === 'poor' ? 'poor' : g === 'usable' ? 'usable' : 'good';
    const b = document.createElement('button');
    const isOn = activeAction?.getClip().name === c.name;
    b.className = 'clip-btn' + (isOn ? ' on' : '');
    b.title = meta?.note ? `[${g}] ${meta.note}` : `[${g}] ${c.name}`;
    b.innerHTML = `<span class="clip-dot ${dotClass}"></span><span>${c.name} (${c.duration.toFixed(1)}s)</span>`;
    b.onclick = () => {
      playClip(c);
      const u = new URL(location.href);
      u.searchParams.set('clip', c.name);
      history.replaceState(null, '', u.toString());
    };
    clipListEl.appendChild(b);
  }
}

// ── Model Loading ────────────────────────────────────────────────────────────────────────────────────────────
async function selectEntry(entry: ViewerEntry, initialClip?: string) {
  const token = ++loadToken;
  activeEntry = entry;
  renderList();
  loadingEl.style.display = 'block';
  loadingEl.textContent = `LOADING ${entry.name.toUpperCase()}…`;

  const u = new URL(location.href);
  u.searchParams.set('id', entry.id);
  if (!initialClip) u.searchParams.delete('clip');
  history.replaceState(null, '', u.toString());

  try {
    const loader = new GLTFLoader();
    const k = getKTX2();
    let gltf;
    let loadedKind = 'WebP/Source';
    if (!useHqSource && k && entry.gpuUrl) {
      loader.setKTX2Loader(k);
      gltf = await loader.loadAsync(entry.gpuUrl).catch(() => null);
      if (gltf) loadedKind = 'GPU KTX2';
    }
    if (!gltf) {
      gltf = await loader.loadAsync(entry.url);
    }
    if (token !== loadToken) return;

    let clips: THREE.AnimationClip[] = [...(gltf.animations ?? [])];
    const clipMeta: Record<string, ClipMeta> = {};
    if (entry.clipsUrl) {
      try {
        const res = await fetch(entry.clipsUrl);
        if (res.ok) {
          const data = await res.json() as {
            clips?: THREE.AnimationClipJSON[];
            source?: Record<string, { grade?: ClipGrade; note?: string }>;
          };
          for (const [kName, s] of Object.entries(data.source ?? {})) {
            clipMeta[kName.toLowerCase()] = { grade: s.grade ?? 'usable', note: s.note };
          }
          for (const cj of data.clips ?? []) {
            const parsed = THREE.AnimationClip.parse(cj);
            clips = clips.filter((x) => x.name.toLowerCase() !== parsed.name.toLowerCase());
            clips.push(parsed);
          }
        }
      } catch { /* fallback to embedded clips */ }
    }
    if (token !== loadToken) return;

    // Tear down previous scene graph
    if (modelGroup) scene.remove(modelGroup);
    if (skelHelper) { scene.remove(skelHelper); skelHelper = null; }
    mixer = null;
    activeAction = null;
    activeForge = null;
    activeSoft = null;
    activeWings = null;

    const wrapper = new THREE.Group();
    const root = gltf.scene;
    let tris = 0;
    let bones = 0;
    const sockets: string[] = [];

    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      }
      if ((o as THREE.Bone).isBone) bones++;
      if (/weapon|socket/i.test(o.name)) sockets.push(o.name);
    });

    // Normalize display height to ~2.1m for comfortable inspection regardless of colossal boss scale
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    const scale = 2.1 / maxDim;
    root.scale.setScalar(scale);
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    wrapper.add(root);

    modelGroup = wrapper;
    loadedRoot = root;
    currentHeight = Math.max(0.8, box.max.y - box.min.y);
    scene.add(wrapper);
    void applyEquippedGear();

    // Wire Character Forge runtime (drives ArmTwist/ForeArmTwist + hand grips + bearing!) & Secondary cloth/wings!
    activeForge = forgeRig(root);
    try {
      const sec = buildSecondary(root);
      activeSoft = sec.soft;
      activeWings = sec.wings;
    } catch { /* non-humanoid or no secondary regions */ }

    skelHelper = new THREE.SkeletonHelper(root);
    skelHelper.visible = showBones;
    scene.add(skelHelper);

    applyMaterialSettings();

    activeClipMeta = clipMeta;
    activeClips = clips.sort((a, b) => a.name.localeCompare(b.name));
    mixer = new THREE.AnimationMixer(root);

    const findClip = (n: string) => activeClips.find((c) => c.name.toLowerCase() === n);
    const prefer = initialClip
      ? findClip(initialClip.toLowerCase())
      : findClip('hero_idle')
        ?? findClip('aim_idle')
        ?? findClip('walk')
        ?? findClip('run')
        ?? findClip('fly')
        ?? findClip('idle')
        ?? activeClips[0]
        ?? null;
    playClip(prefer ?? null);
    frameCamera('three');

    const runtimeTag = activeForge ? ' · ForgeRig ON' : '';
    hudName.textContent = entry.name;
    hudCat.textContent = `${entry.subtitle} · ${entry.heightM}m · ${loadedKind}${runtimeTag}`;
    hudMeta.textContent = `${Math.round(tris).toLocaleString()} tris · ${bones} bones · ${activeClips.length} clips${sockets.length ? ` · sockets: ${sockets.join(', ')}` : ''}`;
  } catch (err) {
    console.error('[rig-viewer] Failed to load', entry.id, err);
    hudMeta.textContent = `Load error: ${String(err)}`;
  } finally {
    if (token === loadToken) loadingEl.style.display = 'none';
  }
}

// ── UI Wiring ────────────────────────────────────────────────────────────────────────────────────────────────
searchEl.addEventListener('input', renderList);
document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
  b.onclick = () => frameCamera(b.dataset.cam as 'three' | 'front' | 'side' | 'back');
});
btnSpin.onclick = () => { turntable = !turntable; btnSpin.classList.toggle('on', turntable); };
btnBones.onclick = () => { showBones = !showBones; btnBones.classList.toggle('on', showBones); if (skelHelper) skelHelper.visible = showBones; };
btnWire.onclick = () => { showWire = !showWire; btnWire.classList.toggle('on', showWire); applyMaterialSettings(); };
btnGrid.onclick = () => { groundGroup.visible = !groundGroup.visible; btnGrid.classList.toggle('on', groundGroup.visible); };
btnTex.onclick = () => {
  useHqSource = !useHqSource;
  btnTex.textContent = useHqSource ? 'HQ Source' : 'GPU KTX2';
  btnTex.classList.toggle('on', useHqSource);
  if (activeEntry) selectEntry(activeEntry, activeAction?.getClip().name);
};
btnCleanClips.onclick = () => {
  cleanClipsOnly = !cleanClipsOnly;
  btnCleanClips.textContent = cleanClipsOnly ? 'Clean Only' : 'All Clips';
  btnCleanClips.classList.toggle('on', cleanClipsOnly);
  renderClips();
};
btnPlay.onclick = () => {
  if (!activeAction && activeClips.length) { playClip(activeClips[0]); return; }
  playing = !playing;
  btnPlay.textContent = playing ? 'Pause' : 'Play';
  btnPlay.classList.toggle('on', playing);
};
btnBind.onclick = () => playClip(null);
scrubEl.addEventListener('input', () => {
  if (!activeAction || !mixer) return;
  playing = false;
  btnPlay.textContent = 'Play';
  btnPlay.classList.remove('on');
  const dur = Math.max(0.001, activeAction.getClip().duration);
  activeAction.time = parseFloat(scrubEl.value) * dur;
  mixer.update(0);
  activeForge?.update(0);
});
speedSlider.addEventListener('input', () => {
  playbackSpeed = parseFloat(speedSlider.value);
  speedVal.textContent = `${playbackSpeed.toFixed(2)}×`;
});
glowSlider.addEventListener('input', () => {
  glowBoost = parseFloat(glowSlider.value);
  glowVal.textContent = `${glowBoost.toFixed(1)}×`;
  applyMaterialSettings();
});
window.addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (selEquipRight) {
  for (const w of WEAPON_ROSTER) {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name;
    selEquipRight.appendChild(opt);
  }
  selEquipRight.addEventListener('change', () => { void applyEquippedGear(); });
}
if (selEquipLeft) {
  for (const w of WEAPON_ROSTER) {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name;
    selEquipLeft.appendChild(opt);
  }
  selEquipLeft.addEventListener('change', () => { void applyEquippedGear(); });
}
if (selEquipArmor) {
  for (const a of WARDROBE_ROSTER) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.slot})`;
    selEquipArmor.appendChild(opt);
  }
  selEquipArmor.addEventListener('change', () => { void applyEquippedGear(); });
}

// ── Boot ─────────────────────────────────────────────────────────────────────────────────────────────────────
await renderer.init();
scene.environment = buildStudioEnvironment(renderer);
scene.environmentIntensity = 1.05;
initKTX2(renderer);
renderCategories();
renderList();

const startId = q.get('id') ?? 'dragon_knight';
const startEntry = ENTRIES.find((e) => e.id === startId) ?? ENTRIES[0];
await selectEntry(startEntry, q.get('clip') ?? undefined);

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mixer && activeAction) {
    if (playing) mixer.update(dt * playbackSpeed);
    const dur = Math.max(0.001, activeAction.getClip().duration);
    const t = ((activeAction.time % dur) + dur) % dur;
    scrubEl.value = String(t / dur);
    timeLabel.textContent = `${t.toFixed(2)}s / ${dur.toFixed(2)}s`;
    // Always run Character Forge twist drivers & hand grips right after the mixer!
    activeForge?.update(playing ? dt * playbackSpeed : 0);
  } else {
    timeLabel.textContent = 'bind';
  }
  if (activeSoft || activeWings) {
    secTime += dt;
    windAt(zeroVel, secTime, windVec);
    if (activeSoft) {
      activeSoft.wind.copy(windVec);
      activeSoft.bodyVel.set(0, 0, 0);
      activeSoft.update(dt);
    }
    if (activeWings) {
      activeWings.wind.copy(windVec);
      activeWings.bodyVel.set(0, 0, 0);
      activeWings.update(dt);
    }
  }
  if (turntable && modelGroup) modelGroup.rotation.y += dt * 0.65;
  controls.update();
  renderer.render(scene, cam);
});
