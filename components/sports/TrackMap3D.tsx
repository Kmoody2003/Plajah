/**
 * TrackMap3D — interactive 3D race course viewer for F1 / NASCAR / IndyCar.
 *
 * Geometry from trackGeometryService:
 *   F1 = real circuit centerlines (f1-circuits GeoJSON),
 *   ovals = parametric models from published specs (with true banking),
 *   road/street courses = OpenStreetMap raceway geometry.
 *
 * Rendered with react-three-fiber: banked track ribbon, start/finish gantry,
 * clickable numbered turn markers, orbit + auto-rotate + flyover camera.
 */

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text } from '@react-three/drei';
import { MapPin, Rotate3d, Video, Hand, Flag, ChevronDown } from 'lucide-react';
import {
  getTrackCatalog, getTrackGeometry,
  type TrackCatalogEntry, type TrackGeometry,
} from '../../services/trackGeometryService';

const SCENE_SCALE = 1 / 18;       // meters → scene units
const TRACK_WIDTH_M = 16;         // exaggerated for visibility

// ─── Track ribbon mesh with banking ──────────────────────────────────────────

function buildRibbon(geom: TrackGeometry): THREE.BufferGeometry {
  const pts = geom.points;
  const n = pts.length;
  const half = (TRACK_WIDTH_M / 2) * SCENE_SCALE;
  const maxBank = (geom.maxBankingDeg * Math.PI) / 180;

  // Smoothed signed curvature per point (drives banking)
  const win = Math.max(2, Math.round(n / 100));
  const curv: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - win + n) % n], b = pts[i], c = pts[(i + win) % n];
    const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    curv[i] = Math.atan2(cross, dot);
  }
  // moving average to smooth banking transitions
  const smooth: number[] = curv.map((_, i) => {
    let s = 0;
    for (let k = -4; k <= 4; k++) s += curv[(i + k + n) % n];
    return s / 9;
  });
  const maxAbs = Math.max(...smooth.map(Math.abs), 1e-6);

  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const cIn = new THREE.Color('#2a2a33');
  const cOut = new THREE.Color('#3c3c46');

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n], p = pts[i];
    let tx = next.x - prev.x, ty = next.y - prev.y;
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm; ty /= tm;
    const lx = -ty, ly = tx;   // left normal

    const bank = maxBank * Math.min(1, Math.abs(smooth[i]) / (maxAbs * 0.55));
    const lift = half * Math.tan(bank) * 2;
    // turning left (smooth > 0) → outer edge is the right edge
    const zLeft  = smooth[i] > 0 ? 0 : lift;
    const zRight = smooth[i] > 0 ? lift : 0;

    positions.push(
      (p.x + lx * (TRACK_WIDTH_M / 2)) * SCENE_SCALE, zLeft + 0.02, -(p.y + ly * (TRACK_WIDTH_M / 2)) * SCENE_SCALE,
      (p.x - lx * (TRACK_WIDTH_M / 2)) * SCENE_SCALE, zRight + 0.02, -(p.y - ly * (TRACK_WIDTH_M / 2)) * SCENE_SCALE,
    );
    colors.push(cIn.r, cIn.g, cIn.b, cOut.r, cOut.g, cOut.b);

    const i2 = i * 2, j2 = ((i + 1) % n) * 2;
    indices.push(i2, i2 + 1, j2, i2 + 1, j2 + 1, j2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Racing line: a slightly elevated glowing centerline loop
function buildCenterline(geom: TrackGeometry): THREE.BufferGeometry {
  const positions = geom.points.map(p => new THREE.Vector3(p.x * SCENE_SCALE, 0.12, -p.y * SCENE_SCALE));
  positions.push(positions[0].clone());
  return new THREE.BufferGeometry().setFromPoints(positions);
}

// ─── Scene internals ─────────────────────────────────────────────────────────

const FlyoverCamera: React.FC<{ geom: TrackGeometry; active: boolean }> = ({ geom, active }) => {
  const progress = useRef(0);
  useFrame(({ camera }, delta) => {
    if (!active) return;
    progress.current = (progress.current + delta * 0.025) % 1;
    const n = geom.points.length;
    const i = Math.floor(progress.current * n);
    const p = geom.points[i];
    const q = geom.points[(i + Math.round(n / 25)) % n];
    camera.position.lerp(new THREE.Vector3(p.x * SCENE_SCALE, 14, -p.y * SCENE_SCALE + 18), 0.06);
    camera.lookAt(q.x * SCENE_SCALE, 0, -q.y * SCENE_SCALE);
  });
  return null;
};

const TurnMarker: React.FC<{
  position: [number, number, number];
  label: string;
  selected: boolean;
  onClick: () => void;
}> = ({ position, label, selected, onClick }) => (
  <Billboard position={position}>
    <mesh onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <circleGeometry args={[selected ? 3.2 : 2.2, 24]} />
      <meshBasicMaterial color={selected ? '#FF8C00' : '#1c1c24'} transparent opacity={0.92} />
    </mesh>
    <Text fontSize={selected ? 2.6 : 1.9} color={selected ? '#000000' : '#FF8C00'} anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>
      {label.replace('Turn ', 'T')}
    </Text>
  </Billboard>
);

const TrackScene: React.FC<{
  geom: TrackGeometry;
  selectedTurn: number | null;
  onSelectTurn: (i: number | null) => void;
  flyover: boolean;
  autoRotate: boolean;
}> = ({ geom, selectedTurn, onSelectTurn, flyover, autoRotate }) => {
  const ribbon = useMemo(() => buildRibbon(geom), [geom]);
  const centerline = useMemo(() => buildCenterline(geom), [geom]);

  const bounds = useMemo(() => {
    const xs = geom.points.map(p => p.x * SCENE_SCALE);
    const ys = geom.points.map(p => p.y * SCENE_SCALE);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }, [geom]);

  const start = geom.points[0];

  return (
    <>
      <color attach="background" args={['#07070c']} />
      <fog attach="fog" args={['#07070c', bounds * 1.2, bounds * 3.5]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[bounds, bounds * 1.2, bounds * 0.5]} intensity={1.4} />
      <directionalLight position={[-bounds, bounds * 0.8, -bounds * 0.4]} intensity={0.4} color="#88aaff" />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[bounds * 4, bounds * 4]} />
        <meshStandardMaterial color="#0c0e10" roughness={1} />
      </mesh>
      <gridHelper args={[bounds * 4, 40, '#16161e', '#101016']} position={[0, 0, 0]} />

      {/* Track ribbon */}
      <mesh geometry={ribbon} onClick={() => onSelectTurn(null)}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.85} metalness={0.1} />
      </mesh>

      {/* Glowing centerline */}
      <primitive object={new THREE.Line(centerline, new THREE.LineBasicMaterial({ color: '#FF8C00', transparent: true, opacity: 0.85 }))} />

      {/* Start/finish gantry */}
      <group position={[start.x * SCENE_SCALE, 0, -start.y * SCENE_SCALE]}>
        <mesh position={[0, 2.2, 0]}>
          <boxGeometry args={[2.6, 4.4, 0.4]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.25} />
        </mesh>
        <Billboard position={[0, 6.4, 0]}>
          <Text fontSize={2.4} color="#FF8C00" anchorX="center">START / FINISH</Text>
        </Billboard>
      </group>

      {/* Turn markers */}
      {geom.turns.map((t, i) => {
        const p = geom.points[t.index];
        return (
          <TurnMarker
            key={`${t.label}-${i}`}
            position={[p.x * SCENE_SCALE, 5.5, -p.y * SCENE_SCALE]}
            label={t.label}
            selected={selectedTurn === i}
            onClick={() => onSelectTurn(selectedTurn === i ? null : i)}
          />
        );
      })}

      {!flyover && (
        <OrbitControls
          autoRotate={autoRotate}
          autoRotateSpeed={0.6}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={bounds * 0.15}
          maxDistance={bounds * 2.5}
        />
      )}
      <FlyoverCamera geom={geom} active={flyover} />
    </>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  series: 'F1' | 'NASCAR' | 'INDYCAR';
}

export const TrackMap3D: React.FC<Props> = ({ series }) => {
  const [catalog, setCatalog] = useState<TrackCatalogEntry[]>([]);
  const [trackId, setTrackId] = useState<string>('');
  const [geom, setGeom] = useState<TrackGeometry | null>(null);
  const [loading, setLoading] = useState(true);
  const [geomError, setGeomError] = useState(false);
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [flyover, setFlyover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setGeom(null);
    setTrackId('');
    getTrackCatalog(series).then(list => {
      setCatalog(list);
      if (list.length) setTrackId(list[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [series]);

  useEffect(() => {
    if (!trackId) return;
    setGeom(null);
    setGeomError(false);
    setSelectedTurn(null);
    getTrackGeometry(trackId).then(g => {
      setGeom(g);
      if (!g) setGeomError(true);
    }).catch(() => setGeomError(true));
  }, [trackId]);

  const current = catalog.find(c => c.id === trackId);
  const turn = geom && selectedTurn !== null ? geom.turns[selectedTurn] : null;

  return (
    <div className="space-y-3">
      {/* Track picker + camera controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:border-[#FF8C00]/40 transition-all">
            <MapPin size={12} className="text-[#FF8C00]" />
            {current?.name ?? 'Select track'}
            <ChevronDown size={12} className="opacity-40" />
          </button>
          {pickerOpen && (
            <div className="absolute z-30 mt-2 w-80 max-h-80 overflow-y-auto bg-[#0c0c14] border border-white/10 rounded-2xl shadow-2xl">
              {catalog.map(c => (
                <button key={c.id}
                  onClick={() => { setTrackId(c.id); setPickerOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors ${c.id === trackId ? 'bg-[#FF8C00]/10' : ''}`}>
                  <p className="text-[10px] font-black uppercase tracking-wide">{c.name}</p>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest">{c.location} · {c.type}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => { setFlyover(false); setAutoRotate(a => !a); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${!flyover && autoRotate ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
            <Rotate3d size={10} /> Orbit
          </button>
          <button onClick={() => { setFlyover(false); setAutoRotate(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${!flyover && !autoRotate ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
            <Hand size={10} /> Free
          </button>
          <button onClick={() => setFlyover(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${flyover ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
            <Video size={10} /> Flyover
          </button>
        </div>
      </div>

      {/* 3D viewport */}
      <div className="relative w-full rounded-[2rem] overflow-hidden border border-white/10" style={{ height: 520 }}>
        {geom ? (
          <Canvas camera={{ position: [0, 160, 220], fov: 50, near: 0.5, far: 5000 }} dpr={[1, 1.8]}>
            <Suspense fallback={null}>
              <TrackScene geom={geom} selectedTurn={selectedTurn} onSelectTurn={setSelectedTurn} flyover={flyover} autoRotate={autoRotate} />
            </Suspense>
          </Canvas>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#07070c]">
            {geomError ? (
              <div className="text-center space-y-2">
                <Flag size={28} className="mx-auto text-white/15" />
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Track geometry unavailable</p>
                <p className="text-[8px] text-white/20">Try another circuit</p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin mx-auto" />
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">
                  {loading ? 'Loading circuits…' : 'Building 3D track…'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Track info HUD */}
        {geom && (
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 max-w-xs">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00]">{geom.type}</p>
            <p className="text-sm font-black uppercase tracking-tight leading-tight mt-0.5">{geom.name}</p>
            <p className="text-[8px] text-white/40 uppercase tracking-widest mt-1">{geom.location}</p>
            <div className="flex gap-4 mt-2">
              <div>
                <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Length</p>
                <p className="text-[11px] font-black">{geom.lengthKm ? `${geom.lengthKm.toFixed(2)} km` : '—'}</p>
              </div>
              <div>
                <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Turns</p>
                <p className="text-[11px] font-black">{geom.turns.length || '—'}</p>
              </div>
              {geom.maxBankingDeg > 0 && (
                <div>
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Banking</p>
                  <p className="text-[11px] font-black">{geom.maxBankingDeg}°</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Turn info */}
        {turn && geom && (
          <div className="absolute bottom-4 left-4 bg-[#FF8C00]/15 backdrop-blur-xl border border-[#FF8C00]/40 rounded-2xl px-4 py-3">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00]">{turn.label}</p>
            {turn.banking ? <p className="text-[10px] font-bold text-white/70 mt-0.5">Banking ≈ {turn.banking}°</p> : null}
          </div>
        )}

        {/* Attribution */}
        {geom && (
          <div className="absolute bottom-2 right-3 pointer-events-none">
            <p className="text-[6px] text-white/20">{geom.source}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackMap3D;
