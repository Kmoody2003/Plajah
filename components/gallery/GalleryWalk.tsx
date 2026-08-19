import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMHumanBoneName, VRMUtils } from '@pixiv/three-vrm';
import { Photo } from '../../types';

/**
 * WALK-IN (3D) — a dark, spotlit art museum you move through in first person.
 *  • Custom look controller: DRAG to look everywhere (works inside the sandboxed
 *    preview iframe where Pointer Lock is blocked); clicking still ATTEMPTS
 *    requestPointerLock so the real deployed site gets true free-look FPS, and
 *    silently falls back to drag when the lock request is refused.
 *  • WASD + Arrow keys walk/strafe relative to camera yaw, eye height ~1.6, wall collision.
 *  • Photos hang as framed pieces on both walls, each lit by its own warm spotlight.
 *  • Procedural marble floor (polished) + walls (honed), near-black ceiling.
 *  • Optional 3D models sit on plinths down the centre of the hall.
 *
 * This module is LAZY-LOADED from GalleryView so three.js only ships when the
 * visitor actually opens the Walk view. Textures are owned + disposed here.
 * There is NO cap on photo count — the hall length, spotlight count and camera
 * far-plane all scale with photos.length (the "up to 8" limit was feed-only).
 */

// ── room dimensions ─────────────────────────────────────────────────────────
const HALF_W = 4;        // side walls at x = ±HALF_W
const WALL_H = 3.4;      // ceiling height
const SPACING = 4;       // metres between hung pieces
const Z_ENTRANCE = 2.5;  // camera enters here, looking down −z
const EYE = 1.6;

// ── motion smoothing (frame-rate-independent damping) ─────────────────────────
// Movement holds a velocity that eases toward keys*speed and decays on release;
// look input sets a TARGET yaw/pitch the camera eases toward (gentle inertia).
const MOVE_SPEED = 3.9;    // metres/sec top speed (a touch quicker than before)
const MOVE_SMOOTH = 0.12;  // velocity smoothing time (s)
const LOOK_SMOOTH = 0.07;  // look-inertia smoothing time (s)
// exponential damping factor for a smoothing time τ over dt seconds: framerate-free
const damp = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

// ── media kind detection (a frame can hang a still image OR a looping video) ──
const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv|ogg)(?:[?#]|$)/i;
function isVideoPhoto(photo: Photo): boolean {
  if (photo.mediaType === 'VIDEO') return true;
  return VIDEO_RE.test(photo.originalUrl || '') || VIDEO_RE.test(photo.url || '');
}
function videoSrc(photo: Photo): string {
  const cands = [photo.url, photo.originalUrl].filter(Boolean) as string[];
  return cands.find(u => VIDEO_RE.test(u)) || cands[0] || '';
}
function fullImageSrc(photo: Photo): string {
  return photo.originalUrl || photo.url || photo.thumbUrl || '';
}

interface WallItem { photo: Photo; x: number; z: number; rotY: number; }

function buildLayout(photos: Photo[]) {
  const perSide = Math.ceil(photos.length / 2);
  const farZ = -((perSide + 1) * SPACING);
  const items: WallItem[] = [];
  photos.forEach((photo, i) => {
    const side = i % 2 === 0 ? -1 : 1;            // even → left wall, odd → right wall
    const slot = Math.floor(i / 2);
    const z = -((slot + 1) * SPACING);
    items.push({
      photo,
      x: side * (HALF_W - 0.06),
      z,
      rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2, // face into the room
    });
  });
  return { items, farZ };
}

// ── procedural marble (dark base + lighter veins on an offscreen canvas) ──────
function makeMarbleTexture(opts: {
  base: string;          // dark stone base
  base2: string;         // secondary mottling tone
  vein: string;          // vein colour
  veinAlpha: number;
  veinCount: number;
  size?: number;
}): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = opts.size ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // base gradient so the stone isn't flat
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, opts.base);
  g.addColorStop(0.5, opts.base2);
  g.addColorStop(1, opts.base);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // soft cloudy mottling — layered translucent blobs
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${0.015 + Math.random() * 0.03})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // fractal-ish veins: a wandering path perturbed by summed sines + jitter
  const drawVein = (alpha: number, width: number) => {
    const y0 = Math.random() * size;
    const amp = 12 + Math.random() * 40;
    const freq = 0.008 + Math.random() * 0.02;
    const phase = Math.random() * Math.PI * 2;
    const drift = (Math.random() - 0.5) * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    let y = y0;
    for (let x = 0; x <= size; x += 4) {
      y = y0
        + Math.sin(x * freq + phase) * amp
        + Math.sin(x * freq * 2.7 + phase) * amp * 0.35
        + x * drift
        + (Math.random() - 0.5) * 3;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = opts.vein;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  for (let i = 0; i < opts.veinCount; i++) {
    drawVein(opts.veinAlpha * (0.5 + Math.random() * 0.5), 0.6 + Math.random() * 1.8);
  }
  // a few hairline branch veins for detail
  for (let i = 0; i < Math.round(opts.veinCount * 1.5); i++) {
    drawVein(opts.veinAlpha * 0.35, 0.4 + Math.random() * 0.6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ── a single framed, textured photo ──────────────────────────────────────────
const MAX_H = 1.5;
const MAX_W = 2.4;

function artSize(photo: Photo, tex?: THREE.Texture): [number, number] {
  let ratio = 3 / 4; // w/h fallback (portrait-ish)
  if (photo.width && photo.height) ratio = photo.width / photo.height;
  else if (tex?.image?.width && tex.image.height) ratio = tex.image.width / tex.image.height;
  let h = MAX_H;
  let w = h * ratio;
  if (w > MAX_W) { w = MAX_W; h = w / ratio; }
  return [w, h];
}

// one hung piece — owns its OWN texture so it can be either a still image or a
// muted looping VideoTexture, and disposes it (and any <video>) on unmount. The
// group is tagged with `userData.galleryPhoto` so a click-raycast can identify it.
function PhotoFrame({ item }: { item: WallItem }) {
  const { photo, x, z, rotY } = item;
  const [tex, setTex] = useState<THREE.Texture | undefined>();
  const isVideo = useMemo(() => isVideoPhoto(photo), [photo]);
  const videoTexRef = useRef<THREE.VideoTexture | null>(null);

  useEffect(() => {
    let alive = true;
    if (isVideo) {
      // muted, looped, inline video texture on the wall (full audio lives in full-view)
      const src = videoSrc(photo);
      if (!src) return;
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      (video as any).playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.preload = 'auto';
      video.src = src;
      const vt = new THREE.VideoTexture(video);
      vt.colorSpace = THREE.SRGBColorSpace;
      vt.minFilter = THREE.LinearFilter;
      vt.magFilter = THREE.LinearFilter;
      videoTexRef.current = vt;
      const onError = () => { if (alive) setTex(undefined); };   // broken video → blank frame
      video.addEventListener('error', onError);
      video.play().catch(() => { /* autoplay-muted usually allowed; ignore if not */ });
      if (alive) setTex(vt);
      return () => {
        alive = false;
        video.removeEventListener('error', onError);
        try { video.pause(); } catch { /* non-fatal */ }
        try { video.removeAttribute('src'); video.load(); } catch { /* non-fatal */ }
        vt.dispose();
        videoTexRef.current = null;
      };
    }
    // still image
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const src = photo.thumbUrl || photo.url;
    if (!src) return;
    let loaded: THREE.Texture | undefined;
    loader.load(
      src,
      t => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        loaded = t;
        setTex(t);
      },
      undefined,
      () => { /* CORS/404 → the frame simply stays blank, no crash */ }
    );
    return () => { alive = false; loaded?.dispose(); };
  }, [photo, isVideo]);

  // keep the VideoTexture pumping frames each render tick
  useFrame(() => { if (videoTexRef.current) videoTexRef.current.needsUpdate = true; });

  const [w, h] = artSize(photo, tex);
  return (
    <group position={[x, EYE, z]} rotation={[0, rotY, 0]} userData={{ galleryPhoto: photo }}>
      {/* elegant brass frame — lit by the piece's spotlight */}
      <mesh position={[0, 0, -0.03]} castShadow>
        <boxGeometry args={[w + 0.14, h + 0.14, 0.06]} />
        <meshStandardMaterial color="#6a5836" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* the media — unlit so it always reads true and crisp (photos are the star) */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[w, h]} />
        {tex
          ? <meshBasicMaterial map={tex} toneMapped={false} />
          : <meshBasicMaterial color="#141019" toneMapped={false} />}
      </mesh>
      {/* small caption label */}
      {photo.title && (
        <Html position={[0, -(h / 2) - 0.18, 0]} center distanceFactor={9} occlude={false}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase',
            color: '#8a7f70', whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
          }}>{photo.title}</div>
        </Html>
      )}
    </group>
  );
}

function Paintings({ items }: { items: WallItem[] }) {
  return (
    <>
      {items.map(item => <PhotoFrame key={item.photo.id} item={item} />)}
    </>
  );
}

// ── one warm spotlight per hung piece, aimed AT the artwork ───────────────────
function ArtSpot({ x, z }: { x: number; z: number }) {
  // target lives at the artwork; adding it to the graph via <primitive/> makes
  // three aim the cone at it. Front = toward room centre (−sign of the wall x).
  const target = useMemo(() => new THREE.Object3D(), []);
  const front = x < 0 ? 1 : -1;
  return (
    <>
      <primitive object={target} position={[x, EYE, z]} />
      <spotLight
        position={[x + front * 1.25, WALL_H - 0.35, z]}
        target={target}
        color="#fff1d6"
        intensity={38}
        distance={7.5}
        angle={0.52}
        penumbra={0.5}
        decay={2}
      />
    </>
  );
}

function Spotlights({ items }: { items: WallItem[] }) {
  return (
    <>
      {items.map(({ photo, x, z }) => <ArtSpot key={photo.id} x={x} z={z} />)}
    </>
  );
}

// ── click (not drag) → identify the framed piece under the pointer ────────────
// Lives inside the Canvas so it has the live camera/scene/raycaster. Tells a
// click from a drag by movement threshold + hold time, then raycasts against the
// frame groups (tagged with userData.galleryPhoto) and reports the hit photo.
function ClickInspector({ enabledRef, onPick }: {
  enabledRef: React.MutableRefObject<boolean>;
  onPick: (photo: Photo) => void;
}) {
  const { camera, gl, scene, raycaster } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let downX = 0, downY = 0, downT = 0, downOK = false;
    const onDown = (e: PointerEvent) => {
      downOK = enabledRef.current;
      downX = e.clientX; downY = e.clientY; downT = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      if (!downOK || !enabledRef.current) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      const held = performance.now() - downT;
      if (moved > 6 || held > 400) return;               // it was a drag / long-press, not a click
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          const p = (o.userData && o.userData.galleryPhoto) as Photo | undefined;
          if (p) { onPick(p); return; }
          o = o.parent;
        }
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, scene, raycaster, enabledRef, onPick]);
  return null;
}

// ── proximity ≤30s audio notes (true spatial audio) ───────────────────────────
// One THREE.AudioListener on the camera; one PositionalAudio per frame that
// carries an audioNoteUrl, parented to an Object3D at the frame's position so the
// panner attenuates it by real distance. Each frame we play only the NEAREST note
// within the radius (so at most one overlaps) and pause the rest. Autoplay policy
// is respected: the AudioContext is resumed on the first user gesture.
const AUDIO_RADIUS = 3.5;   // metres — past this a note is silent
interface NoteRec { holder: THREE.Object3D; sound: THREE.PositionalAudio; item: WallItem; loaded: boolean; }
function ProximityAudio({ items, pausedRef }: {
  items: WallItem[];
  pausedRef: React.MutableRefObject<boolean>;
}) {
  const { camera, scene } = useThree();
  const listener = useMemo(() => new THREE.AudioListener(), []);
  const notes = useMemo(() => items.filter(i => i.photo.audioNoteUrl), [items]);
  const recsRef = useRef<NoteRec[]>([]);
  const unlockedRef = useRef(false);

  // attach listener to the camera; resume the context on the first gesture
  useEffect(() => {
    camera.add(listener);
    const unlock = () => {
      unlockedRef.current = true;
      try { (listener.context as AudioContext).resume?.(); } catch { /* non-fatal */ }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      camera.remove(listener);
    };
  }, [camera, listener]);

  // build one PositionalAudio per note; load buffers; dispose on unmount
  useEffect(() => {
    const loader = new THREE.AudioLoader();
    const created: NoteRec[] = notes.map(item => {
      const holder = new THREE.Object3D();
      holder.position.set(item.x, EYE, item.z);
      scene.add(holder);
      const sound = new THREE.PositionalAudio(listener);
      sound.setRefDistance(1.1);
      sound.setMaxDistance(AUDIO_RADIUS);
      sound.setRolloffFactor(1);           // linear fade spans refDistance→radius, silent past it
      sound.setDistanceModel('linear');
      sound.setLoop(false);
      holder.add(sound);
      const rec: NoteRec = { holder, sound, item, loaded: false };
      loader.load(
        item.photo.audioNoteUrl!,
        buf => { try { sound.setBuffer(buf); rec.loaded = true; } catch { /* non-fatal */ } },
        undefined,
        () => { /* 404/CORS → note just never plays */ },
      );
      return rec;
    });
    recsRef.current = created;
    return () => {
      created.forEach(({ holder, sound }) => {
        try { if (sound.isPlaying) sound.stop(); } catch { /* non-fatal */ }
        try { sound.disconnect(); } catch { /* non-fatal */ }
        scene.remove(holder);
      });
      recsRef.current = [];
    };
  }, [notes, listener, scene]);

  // proximity gate — nearest-within-radius plays, everything else pauses
  useFrame(() => {
    const recs = recsRef.current;
    if (!recs.length) return;
    if (pausedRef.current || !unlockedRef.current) {   // full-view open, or no gesture yet
      recs.forEach(r => { if (r.sound.isPlaying) { try { r.sound.pause(); } catch { /* non-fatal */ } } });
      return;
    }
    let nearest: NoteRec | null = null;
    let nearestD = Infinity;
    for (const r of recs) {
      const dx = camera.position.x - r.item.x;
      const dz = camera.position.z - r.item.z;
      const d = Math.hypot(dx, dz);
      if (d < nearestD) { nearestD = d; nearest = r; }
    }
    for (const r of recs) {
      const active = r === nearest && nearestD <= AUDIO_RADIUS && r.loaded;
      if (active) {
        if (!r.sound.isPlaying) { try { r.sound.play(); } catch { /* non-fatal */ } }
      } else if (r.sound.isPlaying) {
        try { r.sound.pause(); } catch { /* non-fatal */ }
      }
    }
  });

  return null;
}

// ── graceful error boundary for GLTF loads ────────────────────────────────────
class ModelBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Plinth({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={[position[0], 0.5, position[2]]} castShadow>
      <boxGeometry args={[0.9, 1, 0.9]} />
      <meshStandardMaterial color="#15151c" roughness={0.7} metalness={0.15} />
    </mesh>
  );
}

function GltfOnPlinth({ url, position }: { url: string; position: [number, number, number] }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 1.1 / maxDim;                      // fit to ~1.1 units
    clone.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(clone);
    clone.position.y -= box2.min.y;              // sit on the plinth top
    return clone;
  }, [scene]);
  return (
    <group position={[position[0], 1, position[2]]}>
      <primitive object={object} />
      {/* dedicated pool light so the model reads in the dark hall */}
      <pointLight position={[0, 1.4, 0.6]} intensity={6} distance={3.2} decay={2} color="#fff4e2" />
    </group>
  );
}

function Models({ models, farZ }: { models: { url: string; title?: string }[]; farZ: number }) {
  return (
    <>
      {models.map((m, i) => {
        const z = -SPACING * (i + 1) - SPACING / 2;
        const pos: [number, number, number] = [0, 0, Math.max(z, farZ + 1.5)];
        return (
          <group key={i}>
            <Plinth position={pos} />
            <Suspense fallback={null}>
              <ModelBoundary fallback={null}>
                <GltfOnPlinth url={m.url} position={pos} />
              </ModelBoundary>
            </Suspense>
          </group>
        );
      })}
    </>
  );
}

// ── the dark marble room ──────────────────────────────────────────────────────
function Room({ farZ }: { farZ: number }) {
  const depth = Z_ENTRANCE - farZ + 2;
  const centerZ = (Z_ENTRANCE + farZ) / 2;

  // Two marble variants, built once and disposed on unmount. Floor is a lighter
  // polished stone; walls are a darker honed stone.
  const { floorTex, wallTex } = useMemo(() => {
    const floorTex = makeMarbleTexture({
      base: '#20202a', base2: '#2b2b38', vein: '#c9c6d6', veinAlpha: 0.5, veinCount: 22,
    });
    const wallTex = makeMarbleTexture({
      base: '#101018', base2: '#17161f', vein: '#6a6478', veinAlpha: 0.4, veinCount: 16,
    });
    if (floorTex) floorTex.repeat.set(Math.max(2, (HALF_W * 2) / 2.5), Math.max(2, depth / 2.5));
    if (wallTex) wallTex.repeat.set(Math.max(2, depth / 3), Math.max(2, WALL_H / 2));
    return { floorTex, wallTex };
  }, [depth]);

  useEffect(() => () => { floorTex?.dispose(); wallTex?.dispose(); }, [floorTex, wallTex]);

  return (
    <group>
      {/* polished marble floor — faintly reflects the spotlit art via clearcoat */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, depth]} />
        <meshPhysicalMaterial
          map={floorTex ?? undefined}
          color={floorTex ? '#ffffff' : '#26262f'}
          roughness={0.25}
          metalness={0}
          clearcoat={0.6}
          clearcoatRoughness={0.2}
          envMapIntensity={0.4}
        />
      </mesh>
      {/* near-black ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H, centerZ]}>
        <planeGeometry args={[HALF_W * 2, depth]} />
        <meshStandardMaterial color="#050507" roughness={1} />
      </mesh>
      {/* left / right honed-marble walls */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-HALF_W, WALL_H / 2, centerZ]}>
        <planeGeometry args={[depth, WALL_H]} />
        <meshStandardMaterial map={wallTex ?? undefined} color={wallTex ? '#ffffff' : '#14141c'} roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[HALF_W, WALL_H / 2, centerZ]}>
        <planeGeometry args={[depth, WALL_H]} />
        <meshStandardMaterial map={wallTex ?? undefined} color={wallTex ? '#ffffff' : '#14141c'} roughness={0.7} metalness={0.05} />
      </mesh>
      {/* far feature wall + entrance wall */}
      <mesh position={[0, WALL_H / 2, farZ]}>
        <planeGeometry args={[HALF_W * 2, WALL_H]} />
        <meshStandardMaterial map={wallTex ?? undefined} color={wallTex ? '#ffffff' : '#101018'} roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]} position={[0, WALL_H / 2, Z_ENTRANCE + 1.5]}>
        <planeGeometry args={[HALF_W * 2, WALL_H]} />
        <meshStandardMaterial map={wallTex ?? undefined} color={wallTex ? '#ffffff' : '#101018'} roughness={0.75} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ── custom first-person look + move controller ────────────────────────────────
// Drag-to-look works everywhere (incl. sandboxed iframes that block Pointer
// Lock). Clicking also attempts requestPointerLock for true free-look on the
// real site; if the request is refused it silently stays in drag mode.
interface FPProps {
  farZ: number;
  reducedMotion: boolean;
  paused: boolean;
  onLockChange: (locked: boolean) => void;
  onFirstInteract: () => void;
}

const LOOK_SENS = 0.0022;                                   // rad per pixel
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);          // clamp look up/down

function FirstPerson({ farZ, paused, onLockChange, onFirstInteract }: FPProps) {
  const { camera, gl } = useThree();
  const keys = useRef({ f: false, b: false, l: false, r: false });
  const yaw = useRef(0);              // actual (eased) yaw/pitch driving the camera
  const pitch = useRef(0);
  const targetYaw = useRef(0);        // where look input is steering toward
  const targetPitch = useRef(0);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // pointer look — drag anywhere, or continuous when Pointer Lock is engaged.
  // Input only nudges the TARGET yaw/pitch; the frame loop eases the camera toward
  // it, giving gentle inertia instead of a 1:1 jitter.
  useEffect(() => {
    const el = gl.domElement;
    camera.rotation.order = 'YXZ';
    // snap back to a clean eye-level pose (the follow-cam may have moved/rolled it)
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -HALF_W + 0.5, HALF_W - 0.5);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, farZ + 0.8, Z_ENTRANCE + 1.0);
    camera.position.y = EYE;
    camera.rotation.set(0, camera.rotation.y, 0, 'YXZ');
    yaw.current = targetYaw.current = camera.rotation.y;
    pitch.current = targetPitch.current = camera.rotation.x;

    let dragging = false;
    let lastX = 0, lastY = 0;
    let interacted = false;

    const applyDelta = (dx: number, dy: number) => {
      targetYaw.current -= dx * LOOK_SENS;
      targetPitch.current -= dy * LOOK_SENS;
      targetPitch.current = THREE.MathUtils.clamp(targetPitch.current, -PITCH_LIMIT, PITCH_LIMIT);
    };

    const onDown = (e: PointerEvent) => {
      if (pausedRef.current) return;             // full-view open → ignore look/drag
      if (!interacted) { interacted = true; onFirstInteract(); }
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      // Enhancement: try to grab a real pointer lock (true FPS on the live site).
      // In the sandboxed preview this throws / is ignored → we stay in drag mode.
      try { (el.requestPointerLock as any)?.(); } catch { /* blocked → drag only */ }
      try { el.setPointerCapture?.(e.pointerId); } catch { /* non-fatal */ }
    };

    const onMove = (e: PointerEvent) => {
      if (pausedRef.current) return;
      const locked = document.pointerLockElement === el;
      if (locked) {
        applyDelta(e.movementX || 0, e.movementY || 0);
        return;
      }
      if (!dragging) return;
      let dx: number, dy: number;
      if (e.movementX || e.movementY) {          // use movement when the browser reports it…
        dx = e.movementX; dy = e.movementY;
      } else {                                    // …else fall back to client-position tracking
        dx = e.clientX - lastX; dy = e.clientY - lastY;
      }
      lastX = e.clientX; lastY = e.clientY;
      applyDelta(dx, dy);
    };

    const endDrag = (e?: PointerEvent) => {
      dragging = false;
      if (e) { try { el.releasePointerCapture?.(e.pointerId); } catch { /* non-fatal */ } }
    };

    const onLockChangeEvt = () => onLockChange(document.pointerLockElement === el);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', endDrag);
    document.addEventListener('pointerlockchange', onLockChangeEvt);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('pointerleave', endDrag);
      document.removeEventListener('pointerlockchange', onLockChangeEvt);
    };
  }, [camera, gl, onLockChange, onFirstInteract]);

  // keyboard state (WASD + arrows)
  useEffect(() => {
    const down = (e: KeyboardEvent) => set(e.code, true, e);
    const up = (e: KeyboardEvent) => set(e.code, false, e);
    const set = (code: string, v: boolean, e: KeyboardEvent) => {
      if (pausedRef.current) return;             // full-view open → ignore movement keys
      switch (code) {
        case 'KeyW': case 'ArrowUp': keys.current.f = v; e.preventDefault(); break;
        case 'KeyS': case 'ArrowDown': keys.current.b = v; e.preventDefault(); break;
        case 'KeyA': case 'ArrowLeft': keys.current.l = v; e.preventDefault(); break;
        case 'KeyD': case 'ArrowRight': keys.current.r = v; e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());     // desired velocity this frame
  const vel = useRef(new THREE.Vector3());        // eased velocity (glides + decays)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (pausedRef.current) { camera.position.y = EYE; return; }

    // ── LOOK: ease the actual yaw/pitch toward the input target (gentle inertia)
    const la = damp(dt, LOOK_SMOOTH);
    yaw.current += (targetYaw.current - yaw.current) * la;
    pitch.current += (targetPitch.current - pitch.current) * la;
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');

    // ── MOVE: build target velocity from keys, ease velocity toward it, apply v*dt
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0; fwd.current.normalize();
    right.current.crossVectors(fwd.current, camera.up).normalize();
    const k = keys.current;
    target.current.set(0, 0, 0);
    if (k.f) target.current.add(fwd.current);
    if (k.b) target.current.sub(fwd.current);
    if (k.r) target.current.add(right.current);
    if (k.l) target.current.sub(right.current);
    if (target.current.lengthSq() > 0) target.current.normalize().multiplyScalar(MOVE_SPEED);
    // exponential damping toward the target velocity (decays to 0 when keys release)
    vel.current.lerp(target.current, damp(dt, MOVE_SMOOTH));
    camera.position.addScaledVector(vel.current, dt);

    // wall collision — clamp inside the room (kills residual velocity into a wall)
    const cx = THREE.MathUtils.clamp(camera.position.x, -HALF_W + 0.5, HALF_W - 0.5);
    const cz = THREE.MathUtils.clamp(camera.position.z, farZ + 0.8, Z_ENTRANCE + 1.0);
    if (cx !== camera.position.x) vel.current.x = 0;
    if (cz !== camera.position.z) vel.current.z = 0;
    camera.position.x = cx;
    camera.position.z = cz;
    camera.position.y = EYE;
  });

  return null;
}

// ── THIRD-PERSON AVATAR MODE ──────────────────────────────────────────────────
// If the visitor has a VRM avatar (from Avatar Studio → UserProfile.avatar.modelUrl)
// they can walk it around the hall in third person. WASD/arrows move the AVATAR;
// the avatar turns to face its heading; a follow-cam sits behind + above and drag
// orbits it. Loading mirrors AvatarViewer/vrmRig: GLTFLoader + VRMLoaderPlugin, then
// vrm.update(delta) each frame. A failed/absent load falls back to a capsule mannequin.

const FOLLOW_DIST = 3.2;         // camera distance behind the avatar
const FOLLOW_HEIGHT = 1.7;       // camera base height above the floor
const AVATAR_SPEED = 2.6;        // metres / second
const GAIT_RATE = 8;             // gait phase advance (rad/s) while walking
const WALK_LEG_AMP = 0.55;       // VRM leg swing amplitude (rad)
const START_Z = Z_ENTRANCE - 2;  // avatar spawns a couple metres inside the hall

// shared, mutable gait signal written by the rig, read by the avatar each frame
interface GaitState { moving: boolean; }

// smoothly interpolate an angle taking the shortest way around the circle
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}

// pose the VRM humanoid into a simple sine gait (legs + swinging, lowered arms)
function poseVrmGait(vrm: VRM, phase: number, legAmp: number, reduced: number) {
  const h: any = vrm.humanoid;
  if (!h) return;
  const get = (n: VRMHumanBoneName) => h.getNormalizedBoneNode?.(n) as THREE.Object3D | null;
  const s = Math.sin(phase);
  const s2 = Math.sin(phase + Math.PI);
  const lUL = get(VRMHumanBoneName.LeftUpperLeg);
  const rUL = get(VRMHumanBoneName.RightUpperLeg);
  const lLL = get(VRMHumanBoneName.LeftLowerLeg);
  const rLL = get(VRMHumanBoneName.RightLowerLeg);
  const lUA = get(VRMHumanBoneName.LeftUpperArm);
  const rUA = get(VRMHumanBoneName.RightUpperArm);
  if (lUL) lUL.rotation.x = s * legAmp;
  if (rUL) rUL.rotation.x = s2 * legAmp;
  // subtle knee flex on the trailing leg so it doesn't look stiff-legged
  if (lLL) lLL.rotation.x = Math.max(0, -s) * legAmp * 0.7;
  if (rLL) rLL.rotation.x = Math.max(0, -s2) * legAmp * 0.7;
  // bring the arms down out of the T-pose and swing them opposite the legs
  if (lUA) { lUA.rotation.z = 1.15 * reduced + (1 - reduced) * 0.4; lUA.rotation.x = s2 * legAmp * 0.6; }
  if (rUA) { rUA.rotation.z = -1.15 * reduced - (1 - reduced) * 0.4; rUA.rotation.x = s * legAmp * 0.6; }
}

// the loaded VRM avatar (or, if the file has no VRM data, a mannequin fallback)
function VrmAvatar({ url, gait, reducedMotion }: { url: string; gait: React.MutableRefObject<GaitState>; reducedMotion: boolean }) {
  const gltf = useLoader(GLTFLoader, url, (loader: GLTFLoader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = (gltf as any).userData?.vrm as VRM | undefined;
  const phase = useRef(0);
  const amp = useRef(0);

  useEffect(() => {
    if (!vrm) return;
    // VRM0 models face +z; normalise so "forward" is −z like VRM1 and our heading math
    try { VRMUtils.rotateVRM0(vrm); } catch { /* non-fatal */ }
    vrm.scene.traverse((o) => { (o as any).frustumCulled = false; });
    return () => {
      try { VRMUtils.deepDispose(vrm.scene); } catch { /* non-fatal */ }
      try { (useLoader as any).clear?.(GLTFLoader, url); } catch { /* non-fatal */ }
    };
  }, [vrm, url]);

  useFrame((_, delta) => {
    if (!vrm) return;
    const dt = Math.min(delta, 0.05);
    const moving = gait.current.moving;
    const rm = reducedMotion ? 0.35 : 1;
    const targetAmp = moving ? WALK_LEG_AMP : 0;
    amp.current += (targetAmp - amp.current) * (1 - Math.exp(-8 * dt));
    if (moving) phase.current += dt * GAIT_RATE;
    poseVrmGait(vrm, phase.current, amp.current * rm, rm);
    if (!moving) {
      // gentle idle breathing when standing still
      const chest = (vrm.humanoid as any)?.getNormalizedBoneNode?.(VRMHumanBoneName.Chest) as THREE.Object3D | null;
      if (chest) chest.rotation.x = Math.sin(Date.now() * 0.0018) * 0.02 * rm;
    }
    vrm.update(dt);
  });

  if (!vrm) return <Mannequin gait={gait} reducedMotion={reducedMotion} />;
  return <primitive object={vrm.scene} />;
}

// simple capsule + sphere mannequin used when the visitor has no VRM (or it fails)
function Mannequin({ gait, reducedMotion }: { gait: React.MutableRefObject<GaitState>; reducedMotion: boolean }) {
  const root = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const amp = useRef(0);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9aa0b5', roughness: 0.6, metalness: 0.1 }), []);
  useEffect(() => () => { mat.dispose(); }, [mat]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const moving = gait.current.moving;
    const rm = reducedMotion ? 0.35 : 1;
    const targetAmp = moving ? 0.6 : 0;
    amp.current += (targetAmp - amp.current) * (1 - Math.exp(-8 * dt));
    if (moving) phase.current += dt * GAIT_RATE;
    const s = Math.sin(phase.current) * amp.current * rm;
    if (lLeg.current) lLeg.current.rotation.x = s;
    if (rLeg.current) rLeg.current.rotation.x = -s;
    if (lArm.current) lArm.current.rotation.x = -s;
    if (rArm.current) rArm.current.rotation.x = s;
    if (root.current) {
      root.current.position.y = moving
        ? Math.abs(Math.sin(phase.current)) * 0.04 * rm
        : Math.sin(Date.now() * 0.0018) * 0.01 * rm;
    }
  });

  return (
    <group ref={root}>
      {/* head */}
      <mesh position={[0, 1.55, 0]} material={mat}><sphereGeometry args={[0.16, 20, 20]} /></mesh>
      {/* torso */}
      <mesh position={[0, 1.12, 0]} material={mat}><cylinderGeometry args={[0.17, 0.19, 0.62, 12]} /></mesh>
      {/* arms — pivot at the shoulder */}
      <group ref={lArm} position={[-0.25, 1.36, 0]}>
        <mesh position={[0, -0.28, 0]} material={mat}><cylinderGeometry args={[0.06, 0.055, 0.56, 8]} /></mesh>
      </group>
      <group ref={rArm} position={[0.25, 1.36, 0]}>
        <mesh position={[0, -0.28, 0]} material={mat}><cylinderGeometry args={[0.06, 0.055, 0.56, 8]} /></mesh>
      </group>
      {/* legs — pivot at the hip */}
      <group ref={lLeg} position={[-0.1, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} material={mat}><cylinderGeometry args={[0.085, 0.07, 0.72, 8]} /></mesh>
      </group>
      <group ref={rLeg} position={[0.1, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} material={mat}><cylinderGeometry args={[0.085, 0.07, 0.72, 8]} /></mesh>
      </group>
    </group>
  );
}

// third-person controller: moves the avatar, turns it to face its heading, and
// drives an orbiting follow-cam. Drag orbits yaw/pitch; WASD/arrows move.
interface TPProps {
  vrmUrl?: string;
  farZ: number;
  reducedMotion: boolean;
  paused: boolean;
  onFirstInteract: () => void;
}

function ThirdPerson({ vrmUrl, farZ, reducedMotion, paused, onFirstInteract }: TPProps) {
  const { camera, gl } = useThree();
  const keys = useRef({ f: false, b: false, l: false, r: false });
  const camYaw = useRef(0);            // actual (eased) orbit yaw; 0 → behind avatar (+z)
  const camPitch = useRef(0.2);        // actual (eased) orbit pitch; positive looks down
  const camYawT = useRef(0);           // orbit targets the drag input steers toward
  const camPitchT = useRef(0.2);
  const facing = useRef(0);            // avatar yaw
  const avatarRef = useRef<THREE.Group>(null);
  const gait = useRef<GaitState>({ moving: false });
  const camPos = useRef(new THREE.Vector3(0, FOLLOW_HEIGHT, START_Z + FOLLOW_DIST));
  const desired = useMemo(() => new THREE.Vector3(), []);
  const vel = useRef(new THREE.Vector3());   // eased avatar velocity (glides + decays)
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // pointer drag → orbit the camera around the avatar (also grabs pointer-lock on
  // the live site for true free-orbit; falls back to drag inside sandboxed iframes).
  // Drag only moves the orbit TARGET; the frame loop eases the camera toward it.
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let interacted = false;

    const applyDelta = (dx: number, dy: number) => {
      camYawT.current -= dx * LOOK_SENS;
      camPitchT.current += dy * LOOK_SENS;
      camPitchT.current = THREE.MathUtils.clamp(camPitchT.current, -0.15, 1.0);
    };
    const onDown = (e: PointerEvent) => {
      if (pausedRef.current) return;
      if (!interacted) { interacted = true; onFirstInteract(); }
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      try { (el.requestPointerLock as any)?.(); } catch { /* blocked → drag only */ }
      try { el.setPointerCapture?.(e.pointerId); } catch { /* non-fatal */ }
    };
    const onMove = (e: PointerEvent) => {
      if (pausedRef.current) return;
      const locked = document.pointerLockElement === el;
      if (locked) { applyDelta(e.movementX || 0, e.movementY || 0); return; }
      if (!dragging) return;
      let dx: number, dy: number;
      if (e.movementX || e.movementY) { dx = e.movementX; dy = e.movementY; }
      else { dx = e.clientX - lastX; dy = e.clientY - lastY; }
      lastX = e.clientX; lastY = e.clientY;
      applyDelta(dx, dy);
    };
    const endDrag = (e?: PointerEvent) => {
      dragging = false;
      if (e) { try { el.releasePointerCapture?.(e.pointerId); } catch { /* non-fatal */ } }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', endDrag);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('pointerleave', endDrag);
    };
  }, [gl, onFirstInteract]);

  // keyboard (WASD + arrows) — identical mapping to first person
  useEffect(() => {
    const set = (code: string, v: boolean, e: KeyboardEvent) => {
      if (pausedRef.current) return;
      switch (code) {
        case 'KeyW': case 'ArrowUp': keys.current.f = v; e.preventDefault(); break;
        case 'KeyS': case 'ArrowDown': keys.current.b = v; e.preventDefault(); break;
        case 'KeyA': case 'ArrowLeft': keys.current.l = v; e.preventDefault(); break;
        case 'KeyD': case 'ArrowRight': keys.current.r = v; e.preventDefault(); break;
      }
    };
    const down = (e: KeyboardEvent) => set(e.code, true, e);
    const up = (e: KeyboardEvent) => set(e.code, false, e);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useFrame((_, delta) => {
    const av = avatarRef.current;
    if (!av) return;
    const dt = Math.min(delta, 0.05);
    if (pausedRef.current) { gait.current.moving = false; return; }

    // ease the orbit toward the drag target (gentle inertia, not 1:1)
    const la = damp(dt, LOOK_SMOOTH);
    camYaw.current += (camYawT.current - camYaw.current) * la;
    camPitch.current += (camPitchT.current - camPitch.current) * la;
    const cy = camYaw.current;
    // camera-relative ground basis (avatar forward = −z of the camera frame)
    const fx = -Math.sin(cy), fz = -Math.cos(cy);   // forward
    const rx = Math.cos(cy), rz = -Math.sin(cy);    // right
    let mx = 0, mz = 0;
    const k = keys.current;
    if (k.f) { mx += fx; mz += fz; }
    if (k.b) { mx -= fx; mz -= fz; }
    if (k.r) { mx += rx; mz += rz; }
    if (k.l) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    const hasInput = len > 0.001;
    // eased velocity: ramp toward input*speed, decay to 0 when keys release
    const tvx = hasInput ? (mx / len) * AVATAR_SPEED : 0;
    const tvz = hasInput ? (mz / len) * AVATAR_SPEED : 0;
    const ma = damp(dt, MOVE_SMOOTH);
    vel.current.x += (tvx - vel.current.x) * ma;
    vel.current.z += (tvz - vel.current.z) * ma;
    av.position.x += vel.current.x * dt;
    av.position.z += vel.current.z * dt;
    // wall collision — clamp the avatar inside the hall (kill velocity into the wall)
    const ax = THREE.MathUtils.clamp(av.position.x, -HALF_W + 0.4, HALF_W - 0.4);
    const az = THREE.MathUtils.clamp(av.position.z, farZ + 0.6, Z_ENTRANCE + 0.6);
    if (ax !== av.position.x) vel.current.x = 0;
    if (az !== av.position.z) vel.current.z = 0;
    av.position.x = ax; av.position.z = az;
    const speed = Math.hypot(vel.current.x, vel.current.z);
    const moving = speed > 0.05;
    if (hasInput) {
      // turn to face the heading (avatar forward is −z after rotateVRM0)
      const targetYaw = Math.atan2(-mx / len, -mz / len);
      facing.current = lerpAngle(facing.current, targetYaw, 1 - Math.exp(-12 * dt));
    }
    av.position.y = 0;
    av.rotation.y = facing.current;
    gait.current.moving = moving;

    // follow-cam: orbit position derived from yaw/pitch, smoothly lerped, clamped in-room
    const horiz = FOLLOW_DIST * Math.cos(camPitch.current);
    desired.set(
      av.position.x + horiz * Math.sin(cy),
      av.position.y + FOLLOW_HEIGHT + FOLLOW_DIST * Math.sin(camPitch.current),
      av.position.z + horiz * Math.cos(cy),
    );
    desired.x = THREE.MathUtils.clamp(desired.x, -HALF_W + 0.3, HALF_W - 0.3);
    desired.z = THREE.MathUtils.clamp(desired.z, farZ + 0.4, Z_ENTRANCE + 1.2);
    desired.y = THREE.MathUtils.clamp(desired.y, 0.5, WALL_H - 0.2);
    camPos.current.lerp(desired, 1 - Math.exp(-8 * dt));
    camera.position.copy(camPos.current);
    camera.lookAt(av.position.x, av.position.y + 1.4, av.position.z);
  });

  return (
    <group ref={avatarRef} position={[0, 0, START_Z]} rotation={[0, Math.PI, 0]}>
      {/* a soft personal light so the avatar reads in the dark hall, moves with it */}
      <pointLight position={[0, 2.3, 0.5]} intensity={3.2} distance={4.5} decay={2} color="#ffffff" />
      <Suspense fallback={<Mannequin gait={gait} reducedMotion={reducedMotion} />}>
        <ModelBoundary fallback={<Mannequin gait={gait} reducedMotion={reducedMotion} />}>
          {vrmUrl
            ? <VrmAvatar url={vrmUrl} gait={gait} reducedMotion={reducedMotion} />
            : <Mannequin gait={gait} reducedMotion={reducedMotion} />}
        </ModelBoundary>
      </Suspense>
    </group>
  );
}

// ── FULL VIEW overlay — inspect one piece up close ────────────────────────────
// Absolutely positioned over the canvas (inside GalleryWalk's root). Shows the
// full-res image, or a <video controls autoplay> WITH SOUND, plus title / EXIF-ish
// metadata / the photographer's note, a ▶ button for the voice note, and Close/Esc.
function FullView({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const isVideo = useMemo(() => isVideoPhoto(photo), [photo]);
  const noteRef = useRef<HTMLAudioElement | null>(null);
  const [notePlaying, setNotePlaying] = useState(false);

  // own the voice-note <audio> element (full, un-attenuated) and dispose on close
  useEffect(() => {
    if (!photo.audioNoteUrl) return;
    const a = new Audio(photo.audioNoteUrl);
    a.crossOrigin = 'anonymous';
    a.preload = 'none';
    const onEnd = () => setNotePlaying(false);
    a.addEventListener('ended', onEnd);
    noteRef.current = a;
    return () => {
      a.removeEventListener('ended', onEnd);
      try { a.pause(); } catch { /* non-fatal */ }
      a.src = '';
      noteRef.current = null;
    };
  }, [photo.audioNoteUrl]);

  const toggleNote = () => {
    const a = noteRef.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setNotePlaying(true)).catch(() => setNotePlaying(false)); }
    else { a.pause(); setNotePlaying(false); }
  };

  // EXIF-ish line assembled from whatever the Photo record carries
  const meta: string[] = [];
  if (photo.width && photo.height) meta.push(`${photo.width} × ${photo.height}`);
  if (photo.timestamp) meta.push(new Date(photo.timestamp).toLocaleDateString());

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24,
        background: 'rgba(6,6,11,.9)', backdropFilter: 'blur(10px)',
      }}
    >
      {/* media — stop propagation so clicking it doesn't close the overlay */}
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '62%', display: 'flex' }}>
        {isVideo ? (
          <video
            src={videoSrc(photo)}
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}
          />
        ) : (
          <img
            src={fullImageSrc(photo)}
            alt={photo.title || ''}
            crossOrigin="anonymous"
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,.6)', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* caption panel */}
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 560, textAlign: 'center', color: '#fff' }}>
        {photo.title && (
          <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '.02em', marginBottom: 4 }}>{photo.title}</div>
        )}
        {meta.length > 0 && (
          <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>
            {meta.join('  ·  ')}
          </div>
        )}
        {photo.description && (
          <div style={{ fontSize: '.85rem', lineHeight: 1.5, color: 'rgba(255,255,255,.82)', marginBottom: 10 }}>{photo.description}</div>
        )}
        {photo.audioNoteUrl && (
          <button
            onClick={toggleNote}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 16px',
              borderRadius: 9999, border: '1px solid rgba(255,255,255,.25)', cursor: 'pointer',
              background: notePlaying ? 'linear-gradient(135deg,#6B0099,#D40055)' : 'rgba(255,255,255,.08)',
              color: '#fff', fontWeight: 800, fontSize: '.72rem', letterSpacing: '.06em',
            }}
          >
            {notePlaying ? '❚❚ Pause note' : '▶ Play note'}
          </button>
        )}
      </div>

      {/* Close (×) */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 9999,
          border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.5)', color: '#fff',
          fontSize: '1.2rem', lineHeight: 1, cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── public component ────────────────────────────────────────────────────────
interface GalleryWalkProps {
  photos: Photo[];
  models3d?: { url: string; title?: string }[];
  onExit?: () => void;
  /** VRM avatar URL (from the visitor's Avatar Studio profile). Enables 3rd-person. */
  avatarVrmUrl?: string;
}

const GalleryWalk: React.FC<GalleryWalkProps> = ({ photos, models3d, onExit, avatarVrmUrl }) => {
  const [locked, setLocked] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [thirdPerson, setThirdPerson] = useState(false);
  const [inspected, setInspected] = useState<Photo | null>(null);   // full-view overlay target
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion:reduce)').matches,
    []
  );
  const { items, farZ } = useMemo(() => buildLayout(photos), [photos]);

  // Far-plane scales with hall length so long halls still render fully.
  const cameraFar = useMemo(() => Math.max(100, (Z_ENTRANCE - farZ) + 30), [farZ]);

  // while a piece is open we PAUSE the museum (keys + look ignored via this ref)
  const paused = inspected !== null;
  const inspectEnabledRef = useRef(true);   // ClickInspector active only when not paused
  const pausedRef = useRef(false);          // ProximityAudio pauses when true
  useEffect(() => { inspectEnabledRef.current = !paused; pausedRef.current = paused; }, [paused]);

  // opening full-view releases any pointer lock; Esc (and the ×) closes it
  useEffect(() => {
    if (!inspected) return;
    document.exitPointerLock?.();
    setLocked(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setInspected(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspected]);

  const onPick = React.useCallback((photo: Photo) => setInspected(photo), []);

  return (
    <div style={{ position: 'relative', height: 460, background: '#08080c', overflow: 'hidden' }}>
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: [0, EYE, Z_ENTRANCE], fov: 70, near: 0.1, far: cameraFar }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ touchAction: 'none' }}
      >
        <color attach="background" args={['#08080c']} />
        {/* raised base light — the hall now reads clearly BETWEEN spotlights while
            staying a dark museum; the per-art spotlights still do the dramatic work */}
        <ambientLight intensity={0.3} />
        <hemisphereLight args={['#33314a', '#070709', 0.35]} />
        {/* ONE soft, broad overhead fill from high above — dim, wide, no shadows */}
        <directionalLight position={[0, WALL_H * 6, (Z_ENTRANCE + farZ) / 2]} intensity={0.32} color="#c3c9e6" />
        {/* dim architectural accents so it's atmospheric, not pitch black */}
        <pointLight position={[0, WALL_H - 0.3, Z_ENTRANCE]} intensity={4} distance={6} decay={2} color="#cfd6ff" />
        <pointLight position={[0, WALL_H - 0.3, farZ + 1]} intensity={5} distance={7} decay={2} color="#ffe6c4" />
        <Room farZ={farZ} />
        <Paintings items={items} />
        <Spotlights items={items} />
        <ProximityAudio items={items} pausedRef={pausedRef} />
        <ClickInspector enabledRef={inspectEnabledRef} onPick={onPick} />
        {models3d && models3d.length > 0 && <Models models={models3d} farZ={farZ} />}
        {thirdPerson ? (
          <ThirdPerson
            vrmUrl={avatarVrmUrl}
            farZ={farZ}
            reducedMotion={!!reducedMotion}
            paused={paused}
            onFirstInteract={() => setShowHint(false)}
          />
        ) : (
          <FirstPerson
            farZ={farZ}
            reducedMotion={!!reducedMotion}
            paused={paused}
            onLockChange={setLocked}
            onFirstInteract={() => setShowHint(false)}
          />
        )}
      </Canvas>

      {/* 1st / 3rd person toggle — top-left, mirrors the Exit 3D pill */}
      <div
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'inline-flex',
          padding: 3, borderRadius: 9999, background: 'rgba(0,0,0,.55)',
          border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)',
        }}
      >
        {(['1st', '3rd'] as const).map(m => {
          const active = (m === '3rd') === thirdPerson;
          return (
            <button
              key={m}
              onClick={() => {
                if ((m === '3rd') === thirdPerson) return;
                document.exitPointerLock?.();
                setLocked(false);
                setShowHint(true);
                setThirdPerson(m === '3rd');
              }}
              style={{
                height: 28, padding: '0 12px', borderRadius: 9999, border: 0, cursor: 'pointer',
                fontWeight: 800, fontSize: '.66rem', letterSpacing: '.06em',
                color: active ? '#fff' : 'rgba(255,255,255,.6)',
                background: active ? 'linear-gradient(135deg,#6B0099,#D40055)' : 'transparent',
              }}
            >
              {m === '1st' ? '1st person' : '3rd person'}
            </button>
          );
        })}
      </div>

      {/* look/move hint — pointer-events:none so a drag reaches the canvas; hidden after first interaction */}
      {showHint && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            pointerEvents: 'none', background: 'rgba(8,8,15,.32)', backdropFilter: 'blur(1px)', zIndex: 4,
          }}
        >
          <div style={{
            padding: '14px 22px', borderRadius: 9999, background: 'rgba(0,0,0,.55)',
            border: '1px solid rgba(255,255,255,.18)', color: '#fff', fontWeight: 800,
            fontSize: '.72rem', letterSpacing: '.16em', textTransform: 'uppercase',
          }}>
            {thirdPerson
              ? 'Drag to orbit · WASD / Arrows to walk · click a piece for full view'
              : 'Drag to look · WASD / Arrows to move · click a piece for full view'}
          </div>
        </div>
      )}

      {/* Exit 3D affordance */}
      <button
        onClick={() => { document.exitPointerLock?.(); onExit?.(); }}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 5, height: 34, padding: '0 14px',
          borderRadius: 9999, background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.2)',
          color: '#fff', fontWeight: 700, fontSize: '.72rem', cursor: 'pointer', backdropFilter: 'blur(6px)',
        }}
      >
        Exit 3D
      </button>

      {locked && (
        <div style={{
          position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', zIndex: 5,
          fontSize: '.6rem', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,.55)', pointerEvents: 'none',
        }}>
          WASD / Arrows to move · Esc to release
        </div>
      )}

      {/* FULL VIEW overlay — inspect the clicked piece; movement/look paused above */}
      {inspected && <FullView photo={inspected} onClose={() => setInspected(null)} />}
    </div>
  );
};

export default GalleryWalk;
