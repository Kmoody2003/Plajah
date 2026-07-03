import React, { useState, useRef, useEffect, useMemo, Suspense, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Center, Bounds } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { motion } from 'motion/react';
import { Upload, Box, AlertTriangle, RotateCcw, Ruler, Layers } from 'lucide-react';

type Ext = 'glb' | 'gltf' | 'obj' | 'stl';

interface ModelStats {
  vertices: number;
  triangles: number;
  size: THREE.Vector3; // bounding-box dimensions, model units
  meshes: number;
}

interface LoadedModel {
  object: THREE.Object3D;
  stats: ModelStats;
}

// ── loader dispatch ───────────────────────────────────────────────────────────
function extOf(name: string): Ext | null {
  const e = name.split('.').pop()?.toLowerCase();
  if (e === 'glb' || e === 'gltf') return e;
  if (e === 'obj') return 'obj';
  if (e === 'stl') return 'stl';
  return null;
}

function computeStats(root: THREE.Object3D): ModelStats {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as any).isMesh && m.geometry) {
      meshes += 1;
      const g = m.geometry as THREE.BufferGeometry;
      const pos = g.getAttribute('position');
      if (pos) vertices += pos.count;
      if (g.index) triangles += g.index.count / 3;
      else if (pos) triangles += pos.count / 3;
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { vertices, triangles: Math.round(triangles), size, meshes };
}

// Give raw geometry/loaded scenes a consistent, lit material so STL/OBJ (which
// carry none) render, while preserving materials GLTF already provides.
function ensureMaterials(root: THREE.Object3D, accent: string) {
  const fallback = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent),
    metalness: 0.15,
    roughness: 0.6,
    flatShading: false,
  });
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as any).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      const hasMat = Array.isArray(m.material) ? m.material.length > 0 : !!m.material;
      if (!hasMat) m.material = fallback;
      const g = m.geometry as THREE.BufferGeometry;
      if (g && !g.getAttribute('normal')) g.computeVertexNormals();
    }
  });
}

async function loadFile(file: File, accent: string): Promise<LoadedModel> {
  const url = URL.createObjectURL(file);
  const ext = extOf(file.name);
  try {
    if (!ext) throw new Error('Unsupported file type. Use .glb, .gltf, .obj or .stl');

    let object: THREE.Object3D;
    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      object = gltf.scene;
    } else if (ext === 'obj') {
      const loader = new OBJLoader();
      object = await loader.loadAsync(url);
    } else {
      const loader = new STLLoader();
      const geometry = await loader.loadAsync(url);
      const mesh = new THREE.Mesh(geometry);
      object = new THREE.Group();
      object.add(mesh);
    }

    ensureMaterials(object, accent);
    const stats = computeStats(object);
    return { object, stats };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── the 3D scene ──────────────────────────────────────────────────────────────
function ModelScene({ object, accent }: { object: THREE.Object3D; accent: string }) {
  return (
    <>
      <hemisphereLight args={['#cfe0ff', '#1a1a20', 0.75]} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-8, 6, -8]} intensity={0.35} color="#88aaff" />
      <Bounds fit clip observe margin={1.25}>
        <Center>
          <primitive object={object} />
        </Center>
      </Bounds>
      <Grid
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2a2a33"
        sectionSize={5}
        sectionThickness={1}
        sectionColor={accent}
        fadeDistance={45}
        fadeStrength={1}
        infiniteGrid
        position={[0, -0.001, 0]}
      />
      <OrbitControls enableDamping dampingFactor={0.08} makeDefault />
    </>
  );
}

// ── error boundary around the Canvas ──────────────────────────────────────────
class CanvasGuard extends React.Component<
  { children: React.ReactNode; onError: (m: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message || 'Render error');
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// ── main component ────────────────────────────────────────────────────────────
export default function ModelViewer({ accent }: { accent: string }) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentObj = useRef<THREE.Object3D | null>(null);

  const disposeObject = useCallback((obj: THREE.Object3D | null) => {
    if (!obj) return;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as any).isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mt) => mt?.dispose());
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      disposeObject(currentObj.current);
    };
  }, [disposeObject]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      setFileName(file.name);
      try {
        const loaded = await loadFile(file, accent);
        disposeObject(currentObj.current);
        currentObj.current = loaded.object;
        setModel(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load model');
        setModel(null);
      } finally {
        setLoading(false);
      }
    },
    [accent, disposeObject]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const reset = useCallback(() => {
    disposeObject(currentObj.current);
    currentObj.current = null;
    setModel(null);
    setError(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [disposeObject]);

  const dims = useMemo(() => {
    if (!model) return null;
    const s = model.stats.size;
    return { x: s.x, y: s.y, z: s.z };
  }, [model]);

  return (
    <div className="space-y-4">
      {/* dropzone / uploader */}
      {!model && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-[1.4rem] border-2 border-dashed px-6 py-16 text-center transition-colors cursor-pointer ${
            dragging ? 'border-white/40 bg-white/[0.06]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".glb,.gltf,.obj,.stl,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: `${accent}22`, color: accent }}
          >
            <Upload className="h-6 w-6" />
          </div>
          <div className="text-sm font-bold text-white/90">Drop a model here, or click to browse</div>
          <div className="text-[8px] font-black uppercase tracking-widest text-white/40">
            .glb · .gltf · .obj · .stl
          </div>
          {loading && <div className="mt-2 text-xs text-white/60">Loading {fileName}…</div>}
        </label>
      )}

      {/* error */}
      {error && (
        <div className="flex items-start gap-3 rounded-[1.4rem] border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="text-xs text-red-200/90">
            <div className="font-bold">Could not load{fileName ? ` ${fileName}` : ''}</div>
            <div className="text-red-200/60">{error}</div>
          </div>
          <button
            onClick={reset}
            className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      )}

      {/* viewer */}
      {model && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white/80">
              <Box className="h-4 w-4" style={{ color: accent }} />
              {fileName}
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" /> New file
            </button>
          </div>

          <div
            className="relative h-[420px] overflow-hidden rounded-[1.4rem] border border-white/8 bg-black/40"
            style={{ touchAction: 'none' }}
          >
            <CanvasGuard onError={(m) => setError(m)}>
              <Canvas
                shadows
                dpr={[1, 1.8]}
                camera={{ position: [6, 5, 8], fov: 45 }}
                gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
              >
                <Suspense fallback={null}>
                  <ModelScene object={model.object} accent={accent} />
                </Suspense>
              </Canvas>
            </CanvasGuard>
            <div className="pointer-events-none absolute bottom-2 left-3 text-[8px] font-black uppercase tracking-widest text-white/30">
              Drag to orbit · scroll to zoom
            </div>
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Layers className="h-3.5 w-3.5" />} label="Meshes" value={model.stats.meshes.toLocaleString()} accent={accent} />
            <Stat icon={<Box className="h-3.5 w-3.5" />} label="Vertices" value={model.stats.vertices.toLocaleString()} accent={accent} />
            <Stat icon={<Box className="h-3.5 w-3.5" />} label="Triangles" value={model.stats.triangles.toLocaleString()} accent={accent} />
            <Stat
              icon={<Ruler className="h-3.5 w-3.5" />}
              label="Bounding box (units)"
              value={dims ? `${dims.x.toFixed(2)} × ${dims.y.toFixed(2)} × ${dims.z.toFixed(2)}` : '—'}
              accent={accent}
            />
          </div>

          <p className="text-[11px] leading-relaxed text-white/40">
            This is a viewer / inspector. Bounding-box dimensions are shown in the file's own units (no unit is
            embedded in OBJ/STL — confirm whether your model is in metres or millimetres). Heavy FEA / CFD runs on
            the connected engines in the next tab.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-3 py-3"
    >
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-white/90">{value}</div>
    </motion.div>
  );
}
