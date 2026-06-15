// ThreeScene — audio-reactive 3D visualizers (React Three Fiber + three.js).
// A real 3D framework: an orbiting camera rig with presets, and scenes that
// react to the shared analyser. First scene: a reflective water body (three.js
// Water + Sky — true planar reflections) with the album art floating on it,
// day / night(moonlight) / amusement-park variants. Forest scene to follow.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export type Three3DScene = 'water';
export type Three3DVariant = 'day' | 'night' | 'park';
export type Three3DCamera = 'orbit-slow' | 'orbit-fast' | 'dolly' | 'static';

export interface Three3DConfig { scene: Three3DScene; variant: Three3DVariant; camera: Three3DCamera; }

interface Bands { bass: number; mid: number; treble: number; level: number; beat: number; beatPulse: number; }

// ── Smooth procedural water-normal map (no external asset) ───────────────────
function makeWaterNormals(): THREE.Texture {
  const N = 256;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const h = new Float32Array(N * N);
  // sum a few sine octaves into a smooth heightfield
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * Math.PI * 2, v = y / N * Math.PI * 2;
    h[y * N + x] = Math.sin(u * 3) * 0.5 + Math.sin(v * 4 + 1.3) * 0.4 + Math.sin((u + v) * 5) * 0.3 + Math.sin((u - v) * 7) * 0.2;
  }
  const img = ctx.createImageData(N, N);
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = at(x + 1, y) - at(x - 1, y);
    const dy = at(x, y + 1) - at(x, y - 1);
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const i = (y * N + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255;
    img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── Audio sampler: updates a bands ref each frame from the analyser ──────────
const AudioDriver: React.FC<{ analyser: AnalyserNode | null; bands: React.MutableRefObject<Bands> }> = ({ analyser, bands }) => {
  const data = useRef<Uint8Array>(new Uint8Array(analyser ? analyser.frequencyBinCount : 0));
  useFrame(() => {
    if (!analyser) return;
    if (data.current.length !== analyser.frequencyBinCount) data.current = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data.current as any);
    const d = data.current, L = d.length || 1;
    const band = (a: number, b: number) => { let s = 0, c = 0; for (let i = Math.floor(a * L); i < Math.floor(b * L); i++) { s += d[i]; c++; } return c ? s / c / 255 : 0; };
    const b = bands.current;
    const bass = band(0, 0.08), mid = band(0.08, 0.35), treble = band(0.35, 1), level = band(0, 1);
    b.bass = b.bass * 0.7 + bass * 0.3;
    b.mid = b.mid * 0.7 + mid * 0.3;
    b.treble = b.treble * 0.7 + treble * 0.3;
    b.level = b.level * 0.8 + level * 0.2;
    // crude beat: bass spike
    if (bass > b.bass * 1.3 && bass > 0.25) b.beatPulse = 1;
    else b.beatPulse *= 0.9;
    b.beat = bass;
  });
  return null;
};

// ── Camera rig with auto presets (and manual orbit) ──────────────────────────
const CameraRig: React.FC<{ preset: Three3DCamera; bands: React.MutableRefObject<Bands> }> = ({ preset, bands }) => {
  const { camera } = useThree();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const energy = bands.current.level;
    if (preset === 'static') return;
    const speed = preset === 'orbit-fast' ? 0.25 : 0.06;
    if (preset === 'dolly') {
      const r = 90 + Math.sin(t.current * 0.15) * 45 - energy * 15;
      camera.position.x = Math.cos(t.current * 0.04) * r;
      camera.position.z = Math.sin(t.current * 0.04) * r;
      camera.position.y = 18 + Math.sin(t.current * 0.2) * 8 + energy * 6;
    } else {
      const r = 110;
      camera.position.x = Math.cos(t.current * speed) * r;
      camera.position.z = Math.sin(t.current * speed) * r;
      camera.position.y = 22 + energy * 8;
    }
    camera.lookAt(0, 4, 0);
  });
  return null;
};

// ── Water scene ──────────────────────────────────────────────────────────────
const WaterScene: React.FC<{ variant: Three3DVariant; bands: React.MutableRefObject<Bands>; albumTex: THREE.Texture | null; palette: string[] }>
  = ({ variant, bands, albumTex, palette }) => {
  const { scene } = useThree();
  const waterNormals = useMemo(makeWaterNormals, []);
  const sun = useMemo(() => new THREE.Vector3(), []);
  const albumRef = useRef<THREE.Mesh>(null);
  const moonRef = useRef<THREE.Mesh>(null);

  const accent = useMemo(() => new THREE.Color(palette[0] || '#88aaff'), [palette]);

  const water = useMemo(() => {
    const geom = new THREE.PlaneGeometry(2000, 2000);
    const w = new Water(geom, {
      textureWidth: 512, textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e2f,
      distortionScale: 3.7,
      fog: false,
    });
    w.rotation.x = -Math.PI / 2;
    return w;
  }, [waterNormals]);

  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(10000);
    return s;
  }, []);

  // Configure sky / water / lighting per variant.
  useEffect(() => {
    const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
    const night = variant !== 'day';
    skyU['turbidity'].value = night ? 0.4 : 8;
    skyU['rayleigh'].value = night ? 0.6 : 2.2;
    skyU['mieCoefficient'].value = night ? 0.002 : 0.005;
    skyU['mieDirectionalG'].value = night ? 0.7 : 0.8;
    const elevation = night ? 6 : 28;     // sun/moon above horizon
    const azimuth = variant === 'park' ? 200 : 180;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    skyU['sunPosition'].value.copy(sun);
    (water.material as THREE.ShaderMaterial).uniforms['sunDirection'].value.copy(sun).normalize();
    (water.material as THREE.ShaderMaterial).uniforms['sunColor'].value.set(night ? 0x9fb4ff : 0xffffff);
    (water.material as THREE.ShaderMaterial).uniforms['waterColor'].value.set(night ? 0x05101e : 0x0a3a55);
    scene.background = new THREE.Color(night ? 0x02030a : 0x6fb7e6);
  }, [variant, sky, water, sun, scene]);

  useFrame((_, dt) => {
    const b = bands.current;
    const wu = (water.material as THREE.ShaderMaterial).uniforms;
    wu['time'].value += dt * (0.4 + b.level * 1.6);
    wu['distortionScale'].value = 3 + b.bass * 9 + b.beatPulse * 7;          // waves + splash on beat
    wu['size'].value = 3 + b.mid * 5;                                         // ripple scale
    if (albumRef.current) {
      albumRef.current.position.y = 7 + Math.sin(performance.now() * 0.0013) * 0.6 + b.bass * 1.4;
      albumRef.current.rotation.z = Math.sin(performance.now() * 0.0004) * 0.05;
      (albumRef.current.material as THREE.MeshBasicMaterial).opacity = 0.92;
    }
    if (moonRef.current) (moonRef.current.material as THREE.MeshBasicMaterial).color.setScalar(0.7 + b.level * 0.3);
  });

  const night = variant !== 'day';

  return (
    <>
      <primitive object={sky} />
      <primitive object={water} />
      <ambientLight intensity={night ? 0.25 : 0.6} />
      <directionalLight position={sun.clone().multiplyScalar(100)} intensity={night ? 0.4 : 1.1} color={night ? 0xaabbff : 0xffffff} />

      {/* Album art floating on the water (reflected by the Water surface) */}
      {albumTex && (
        <mesh ref={albumRef} position={[0, 7, 0]}>
          <planeGeometry args={[26, 26]} />
          <meshBasicMaterial map={albumTex} transparent side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}

      {/* Night: moon + stars */}
      {night && (
        <>
          <mesh ref={moonRef} position={sun.clone().multiplyScalar(800)}>
            <sphereGeometry args={[40, 32, 32]} />
            <meshBasicMaterial color={0xfdfbe8} toneMapped={false} />
          </mesh>
          <Stars radius={600} depth={80} count={4000} factor={6} fade speed={0.6} />
        </>
      )}

      {/* Park variant: neon shoreline (reflects in the water) */}
      {variant === 'park' && <AmusementPark accent={accent} bands={bands} />}
    </>
  );
};

// Stylised amusement-park shoreline (ferris wheel + neon) reflected in the water.
const AmusementPark: React.FC<{ accent: THREE.Color; bands: React.MutableRefObject<Bands> }> = ({ accent, bands }) => {
  const wheel = useRef<THREE.Group>(null);
  const spokes = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  useFrame((_, dt) => { if (wheel.current) wheel.current.rotation.z += dt * (0.1 + bands.current.level * 0.5); });
  const neon = (i: number) => new THREE.Color().setHSL((i * 0.13) % 1, 0.9, 0.6);
  return (
    <group position={[0, 0, -160]}>
      {/* ground/boardwalk */}
      <mesh position={[0, 0.5, -20]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400, 120]} />
        <meshStandardMaterial color={0x0a0a12} emissive={0x05050a} />
      </mesh>
      {/* ferris wheel */}
      <group ref={wheel} position={[-70, 45, -10]}>
        <mesh><torusGeometry args={[40, 1.2, 8, 48]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
        {spokes.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 40, Math.sin(a) * 40, 0]}>
            <sphereGeometry args={[2.4, 12, 12]} />
            <meshBasicMaterial color={neon(i)} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* neon towers */}
      {[-10, 30, 70, 110].map((x, i) => (
        <mesh key={i} position={[x, 18, 10]}>
          <boxGeometry args={[6, 36, 6]} />
          <meshBasicMaterial color={neon(i + 3)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
};

// ── Public component ─────────────────────────────────────────────────────────
const ThreeScene: React.FC<{ analyser: AnalyserNode | null; config: Three3DConfig; albumUrl?: string; palette: string[] }>
  = ({ analyser, config, albumUrl, palette }) => {
  const bands = useRef<Bands>({ bass: 0, mid: 0, treble: 0, level: 0, beat: 0, beatPulse: 0 });
  const [albumTex, setAlbumTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!albumUrl) { setAlbumTex(null); return; }
    let dead = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(albumUrl, (t) => { if (!dead) { t.colorSpace = THREE.SRGBColorSpace; setAlbumTex(t); } }, undefined, () => { if (!dead) setAlbumTex(null); });
    return () => { dead = true; };
  }, [albumUrl]);

  return (
    <div className="absolute inset-0" style={{ zIndex: 1 }}>
      <Canvas camera={{ position: [110, 24, 0], fov: 55, near: 1, far: 20000 }} gl={{ antialias: true, powerPreference: 'high-performance' }} dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}>
        <AudioDriver analyser={analyser} bands={bands} />
        <CameraRig preset={config.camera} bands={bands} />
        {config.scene === 'water' && <WaterScene variant={config.variant} bands={bands} albumTex={albumTex} palette={palette} />}
        <OrbitControls enablePan={false} enableZoom enableRotate target={[0, 4, 0]} maxPolarAngle={Math.PI * 0.495} />
      </Canvas>
    </div>
  );
};

export default ThreeScene;
