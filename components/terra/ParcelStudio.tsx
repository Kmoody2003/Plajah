/**
 * Parcel Studio — zoning-aware massing.
 *
 * Compute the LEGAL buildable envelope from a parcel's dimensions and its zoning
 * district × use, then let you place a massing inside it and check compliance
 * live. A shadow study approximates the sun across the day.
 *
 * What it deliberately does NOT do: guess. When an overlay, a historic district,
 * a planned-development district, missing dimensions, or an un-encoded rule would
 * make the envelope unreliable, it shows the blocker instead of a confident wrong
 * answer. And every result carries the "not a zoning determination" disclaimer —
 * this is a thinking tool, not a permit.
 *
 * Reuses the platform's R3F stack (three + @react-three/fiber + drei), the same
 * one behind the architecture studio and the 3D stadiums.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { motion } from 'motion/react';
import {
  ArrowLeft, Ruler, Building2, Sun, AlertTriangle, CheckCircle2, Info, Layers, MapPin, Home,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import type { TerraParcel } from '../../services/terra/terraTypes';
import { computeEnvelope, checkCompliance, FLOOR_TO_FLOOR_FT, type ProposedMassing } from '../../services/terra/zoning/envelopeEngine';
import { findDetroitRule, detroitUsesFor } from '../../services/terra/zoning/detroitZoning';
import { fetchParcel } from '../../services/terra/terraService';

const ACCENT = '#FF8C00';
const MEASURE = '#4FC3D6';   // dimension / envelope lines
const MASS = '#FF8C00';      // proposed massing

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';

/** A demo lot so the tool is explorable with zero ingested data (33×102, R2). */
const DEMO_PARCEL: TerraParcel = {
  id: 'detroit:demo-rosedale',
  jurisdiction: 'detroit',
  parcelNumber: '16004044.',
  address: '4218 Rosedale St',
  city: 'Detroit', stateOrProvince: 'MI', postalCode: '48204',
  frontageFt: 33, depthFt: 102, lotSqFt: 3366,
  zoningDistrict: 'R2', isImproved: true, yearBuilt: 1926,
  sources: [{ system: 'terra:demo', label: 'Demo parcel', retrievedAt: Date.now(), observed: 'estimated' }],
  updatedAt: Date.now(),
};

const BLOCKER_COPY: Record<string, { title: string; body: string }> = {
  PLANNED_DEVELOPMENT: { title: 'Planned-development district', body: 'Standards here are negotiated per project, not set by a table — so there is no fixed envelope to compute.' },
  HISTORIC_DISTRICT:   { title: 'Local historic district', body: 'Design review governs, and overlay rules can override the base zoning. Computing an envelope would be misleading.' },
  MAIN_STREET_OVERLAY: { title: 'Main-street overlay', body: 'An overlay supersedes the base setbacks, and its geometry is not published as data — we flag rather than guess.' },
  NO_RULE_ENCODED:     { title: 'Not encoded yet', body: 'Dimensional standards for this district and use are hand-encoded, and this pair is not in the set yet. Detroit residential districts come first.' },
  NO_PARCEL_DIMENSIONS:{ title: 'Missing lot dimensions', body: 'This parcel has no frontage/depth on record, so the buildable area cannot be derived.' },
};

// ─── 3D scene ────────────────────────────────────────────────────────────────

const FT = 0.1; // three.js units per foot — keeps the scene at a comfy scale

const MassingScene: React.FC<{
  lotW: number; lotD: number;
  bW: number; bD: number;           // buildable rectangle
  envH: number;                     // envelope max height
  bldgW: number; bldgD: number; bldgH: number; roof: 'flat' | 'gable';
  frontSet: number;
  sunHour: number; shadows: boolean;
}> = ({ lotW, lotD, bW, bD, envH, bldgW, bldgD, bldgH, roof, frontSet, sunHour, shadows }) => {
  // Sun: east at 6h → south/up at 12h → west at 18h. Approximate, for a shadow feel.
  const t = Math.max(0, Math.min(1, (sunHour - 6) / 12));
  const az = Math.PI * (1 - t);                 // east→west
  const el = Math.sin(t * Math.PI) * 0.9 + 0.1; // low at ends, high at noon
  const r = Math.max(lotW, lotD) * FT * 2.2;
  const sun: [number, number, number] = [
    Math.cos(az) * r,
    Math.max(2, el * r),
    Math.sin(az) * r * 0.6 + 0.001,
  ];

  // Building sits centred left-right, pushed back from the front by the setback.
  const zOffset = (frontSet - (lotD - bldgD) / 2) * FT * -1;

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cfe0ff', '#20242e', 0.5]} />
      <directionalLight
        position={sun}
        intensity={1.15}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-r} shadow-camera-right={r}
        shadow-camera-top={r} shadow-camera-bottom={-r}
        shadow-camera-far={r * 3}
      />

      {/* Parcel plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[lotW * FT, lotD * FT]} />
        <meshStandardMaterial color="#12151d" roughness={0.95} />
      </mesh>
      {/* Parcel outline */}
      <lineSegments position={[0, 0.002, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(lotW * FT, lotD * FT)]} />
        <lineBasicMaterial color="#4a5163" />
      </lineSegments>

      {/* Buildable rectangle (setback inset) — dashed cyan on the ground */}
      <lineSegments position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(bW * FT, bD * FT)]} />
        <lineDashedMaterial color={MEASURE} dashSize={0.12} gapSize={0.08} />
      </lineSegments>

      {/* Legal envelope volume — translucent wireframe box at max height */}
      <mesh position={[0, (envH * FT) / 2, 0]}>
        <boxGeometry args={[bW * FT, envH * FT, bD * FT]} />
        <meshBasicMaterial color={MEASURE} transparent opacity={0.06} />
      </mesh>
      <lineSegments position={[0, (envH * FT) / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(bW * FT, envH * FT, bD * FT)]} />
        <lineBasicMaterial color={MEASURE} transparent opacity={0.55} />
      </lineSegments>

      {/* Proposed massing */}
      <group position={[0, 0, zOffset]}>
        <mesh position={[0, (bldgH * FT) / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bldgW * FT, bldgH * FT, bldgD * FT]} />
          <meshStandardMaterial color={MASS} roughness={0.6} metalness={0.05} />
        </mesh>
        {roof === 'gable' && (
          <mesh position={[0, bldgH * FT + (Math.min(bldgW, bldgD) * FT) / 4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[(Math.max(bldgW, bldgD) * FT) / 1.7, (Math.min(bldgW, bldgD) * FT) / 2, 4]} />
            <meshStandardMaterial color="#c96f00" roughness={0.7} />
          </mesh>
        )}
        {/* floor lines */}
        {Array.from({ length: Math.max(0, Math.round(bldgH / FLOOR_TO_FLOOR_FT) - 1) }).map((_, i) => (
          <lineSegments key={i} position={[0, (i + 1) * FLOOR_TO_FLOOR_FT * FT, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(bldgW * FT, bldgD * FT)]} />
            <lineBasicMaterial color="#7a4a00" transparent opacity={0.5} />
          </lineSegments>
        ))}
      </group>

      <Grid
        args={[lotW * FT * 6, lotD * FT * 6]}
        cellSize={FT * 10} cellColor="#20242e"
        sectionSize={FT * 50} sectionColor="#2b3040"
        fadeDistance={r * 4} infiniteGrid position={[0, -0.01, 0]}
      />
      <OrbitControls enablePan makeDefault minDistance={lotD * FT} maxDistance={lotD * FT * 6} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
};

// ─── Shell ───────────────────────────────────────────────────────────────────

const Stat: React.FC<{ k: string; used: React.ReactNode; max: React.ReactNode; ok: boolean }> = ({ k, used, max, ok }) => (
  <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
    <span className={label}>{k}</span>
    <span className={`text-[11px] font-black tabular-nums ${ok ? 'text-white/80' : 'text-red-400'}`}>
      {used}<span className="text-white/25 font-semibold"> / {max}</span>
    </span>
  </div>
);

export interface ParcelStudioProps {
  parcelId?: string;
  currentUser?: UserProfile | null;
  onBack?: () => void;
}

export const ParcelStudio: React.FC<ParcelStudioProps> = ({ parcelId, onBack }) => {
  const [parcel, setParcel] = useState<TerraParcel | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  const [useKey, setUseKey] = useState<string>('single_family');
  const [storeys, setStoreys] = useState(2);
  const [fill, setFill] = useState(0.75);
  const [roof, setRoof] = useState<'flat' | 'gable'>('gable');
  const [sunHour, setSunHour] = useState(14);
  const [shadows, setShadows] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let p: TerraParcel | null = null;
      if (parcelId) p = await fetchParcel(parcelId);
      if (!p) { p = DEMO_PARCEL; if (!cancelled) setIsDemo(true); }
      if (cancelled) return;
      setParcel(p);
      const uses = detroitUsesFor(p.zoningDistrict);
      if (uses.length) setUseKey(uses[0].key);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [parcelId]);

  const uses = useMemo(() => detroitUsesFor(parcel?.zoningDistrict), [parcel?.zoningDistrict]);
  const rule = useMemo(() => findDetroitRule(parcel?.zoningDistrict, useKey), [parcel?.zoningDistrict, useKey]);
  const env = useMemo(() => (parcel ? computeEnvelope(parcel, rule) : null), [parcel, rule]);

  const proposed: ProposedMassing = { storeys, footprintFill: fill, roof };
  const compliance = useMemo(() => (env ? checkCompliance(env, proposed) : null), [env, storeys, fill, roof]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-3 text-white/30">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        <span className="text-xs">Loading parcel…</span>
      </div>
    );
  }

  const blocked = !env || env.blockers.length > 0 || env.buildableAreaSqFt == null;
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF8C00]/50';

  return (
    <div className="h-full flex flex-col bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0" title="Back to Terra">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: `${ACCENT}20`, borderColor: `${ACCENT}40` }}>
            <Ruler size={16} style={{ color: ACCENT }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-widest text-white">Parcel Studio</h1>
            <p className="text-[10px] font-bold truncate" style={{ color: ACCENT }}>
              {parcel?.address || parcel?.parcelNumber} · {parcel?.zoningDistrict || '—'}
              {isDemo && <span className="text-white/30"> · demo parcel</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[210px_minmax(0,1fr)_244px] grid-cols-1">
        {/* Zoning + massing controls */}
        <div className="border-r border-white/[0.06] p-4 overflow-y-auto custom-scrollbar space-y-4">
          <div>
            <p className={`${label} mb-2`}>Zoning · {parcel?.zoningDistrict || '—'}</p>
            {uses.length > 1 && (
              <select value={useKey} onChange={e => setUseKey(e.target.value)} className={inputCls + ' mb-3'}>
                {uses.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
              </select>
            )}
            {rule && !blocked ? (
              <div className={`${card} p-3`}>
                <div className="flex items-center justify-between py-1"><span className={label}>Min lot</span><span className="text-[11px] text-white/70 tabular-nums">{rule.minLotSqFt?.toLocaleString()} sf</span></div>
                <div className="flex items-center justify-between py-1"><span className={label}>Front</span><span className="text-[11px] text-white/70 tabular-nums">{env?.frontSetbackFt} ft</span></div>
                <div className="flex items-center justify-between py-1"><span className={label}>Side</span><span className="text-[11px] text-white/70 tabular-nums">{env?.sideSetbackFt} ft</span></div>
                <div className="flex items-center justify-between py-1"><span className={label}>Rear</span><span className="text-[11px] text-white/70 tabular-nums">{env?.rearSetbackFt} ft</span></div>
                <div className="flex items-center justify-between py-1"><span className={label}>Max height</span><span className="text-[11px] text-white/70 tabular-nums">{env?.maxHeightFt} ft</span></div>
                {rule.maxLotCoveragePct != null && <div className="flex items-center justify-between py-1"><span className={label}>Coverage</span><span className="text-[11px] text-white/70 tabular-nums">{rule.maxLotCoveragePct}%</span></div>}
                {rule.maxFar != null && <div className="flex items-center justify-between py-1"><span className={label}>FAR</span><span className="text-[11px] text-white/70 tabular-nums">{rule.maxFar}</span></div>}
              </div>
            ) : (
              <p className="text-[11px] text-white/30 leading-relaxed">Standards unavailable for this parcel — see the note on the model.</p>
            )}
            {rule && <p className="text-[9px] text-white/25 mt-2 leading-relaxed">Hand-encoded · rules v{rule.effectiveDate}</p>}
          </div>

          {!blocked && (
            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              <p className={label}>Massing</p>
              <div>
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-white/40">Storeys</span><span className="text-[11px] font-black text-white tabular-nums">{storeys}</span></div>
                <input type="range" min={1} max={Math.max(1, env?.maxStoreys ?? 3)} step={1} value={storeys} onChange={e => setStoreys(Number(e.target.value))} className="w-full accent-[#FF8C00]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-white/40">Footprint</span><span className="text-[11px] font-black text-white tabular-nums">{Math.round(fill * 100)}%</span></div>
                <input type="range" min={0.3} max={1} step={0.05} value={fill} onChange={e => setFill(Number(e.target.value))} className="w-full accent-[#FF8C00]" />
              </div>
              <div className="flex gap-2">
                {(['flat', 'gable'] as const).map(r => (
                  <button key={r} onClick={() => setRoof(r)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${roof === r ? 'text-black' : 'bg-white/5 text-white/40'}`} style={roof === r ? { background: ACCENT } : {}}>{r}</button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <p className={label}>☀ Shadow study</p>
              <button onClick={() => setShadows(s => !s)} className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${shadows ? 'text-black' : 'bg-white/5 text-white/40'}`} style={shadows ? { background: MEASURE } : {}}>{shadows ? 'On' : 'Off'}</button>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-white/40">Time</span><span className="text-[11px] font-black text-white tabular-nums">{String(Math.floor(sunHour)).padStart(2, '0')}:00</span></div>
              <input type="range" min={6} max={18} step={1} value={sunHour} onChange={e => setSunHour(Number(e.target.value))} className="w-full accent-[#4FC3D6]" />
            </div>
            <p className="text-[9px] text-white/25 leading-relaxed">Approximate sun path — a feel for shadow, not a solar calculation.</p>
          </div>
        </div>

        {/* 3D view */}
        <div className="relative min-h-[320px] bg-[#07080B]">
          {blocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-3xl border border-dashed border-white/15 flex items-center justify-center" style={{ color: '#E8B33D' }}>
                <AlertTriangle size={22} />
              </div>
              <div className="max-w-md">
                {(env?.blockers || ['NO_RULE_ENCODED']).slice(0, 2).map(b => {
                  const c = BLOCKER_COPY[b] || { title: b, body: '' };
                  return (
                    <div key={b} className="mb-3">
                      <p className="text-sm font-black uppercase tracking-widest text-white/50 mb-1">{c.title}</p>
                      <p className="text-xs text-white/30 leading-relaxed">{c.body}</p>
                    </div>
                  );
                })}
                <p className="text-[10px] text-white/25 mt-2">We flag these rather than compute a confident wrong answer.</p>
              </div>
            </div>
          ) : (
            <Canvas shadows camera={{ position: [(env!.lotWidthFt || 40) * FT * 1.6, (env!.maxHeightFt || 35) * FT * 2.4, (env!.lotDepthFt || 100) * FT * 1.5], fov: 42 }} dpr={[1, 2]}>
              <color attach="background" args={['#07080B']} />
              <MassingScene
                lotW={env!.lotWidthFt || 33} lotD={env!.lotDepthFt || 102}
                bW={env!.buildableWidthFt || 1} bD={env!.buildableDepthFt || 1}
                envH={env!.maxHeightFt || 35}
                bldgW={compliance?.buildingWidthFt || 1} bldgD={compliance?.buildingDepthFt || 1} bldgH={compliance?.heightFt || 10} roof={roof}
                frontSet={env!.frontSetbackFt || 0}
                sunHour={sunHour} shadows={shadows}
              />
            </Canvas>
          )}
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between pointer-events-none">
            <span className="text-[9px] font-mono text-white/25 tracking-wider">— — legal envelope · ■ proposed massing</span>
            <span className="text-[9px] font-mono text-white/20 tracking-wider">drag to orbit</span>
          </div>
        </div>

        {/* Compliance */}
        <div className="border-l border-white/[0.06] p-4 overflow-y-auto custom-scrollbar space-y-4">
          {blocked ? (
            <div className={`${card} p-4`}>
              <p className={`${label} mb-2`}>No envelope</p>
              <p className="text-[11px] text-white/40 leading-relaxed">This parcel can't be modelled — the panel on the model explains why.</p>
            </div>
          ) : compliance && (
            <>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`${card} p-4`} style={compliance.withinEnvelope ? { borderColor: 'rgba(61,214,140,.3)', background: 'rgba(61,214,140,.05)' } : { borderColor: 'rgba(232,179,61,.3)', background: 'rgba(232,179,61,.05)' }}>
                <div className="flex items-center gap-2">
                  {compliance.withinEnvelope
                    ? <><CheckCircle2 size={15} className="text-emerald-400" /><span className="text-xs font-black uppercase tracking-widest text-emerald-400">Within envelope</span></>
                    : <><AlertTriangle size={15} className="text-yellow-400" /><span className="text-xs font-black uppercase tracking-widest text-yellow-400">Exceeds envelope</span></>}
                </div>
                <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed">
                  {compliance.withinEnvelope ? 'The massing fits the legal limits.' : 'Reduce height or footprint to fit.'}
                </p>
              </motion.div>

              <div className={`${card} p-4`}>
                <Stat k="Height" used={`${compliance.heightFt} ft`} max={`${compliance.maxHeightFt} ft`} ok={compliance.heightOk} />
                <Stat k="Storeys" used={compliance.storeys} max={compliance.maxStoreys} ok={compliance.storeysOk} />
                <Stat k="Coverage" used={`${compliance.coveragePct}%`} max={compliance.maxCoveragePct != null ? `${compliance.maxCoveragePct}%` : '—'} ok={compliance.coverageOk} />
                <Stat k="Footprint" used={`${compliance.footprintSqFt.toLocaleString()}`} max={`${compliance.maxFootprintSqFt.toLocaleString()} sf`} ok={compliance.footprintOk} />
                <Stat k="Floor area" used={`${compliance.floorAreaSqFt.toLocaleString()}`} max={compliance.maxFloorAreaSqFt != null ? `${compliance.maxFloorAreaSqFt.toLocaleString()} sf` : '—'} ok={compliance.farOk} />
              </div>

              <div className={`${card} p-4`}>
                <p className={`${label} mb-2`}>The lot</p>
                <div className="flex items-center justify-between py-1"><span className="text-[10px] text-white/40">Dimensions</span><span className="text-[11px] text-white/70 tabular-nums">{env?.lotWidthFt} × {env?.lotDepthFt} ft</span></div>
                <div className="flex items-center justify-between py-1"><span className="text-[10px] text-white/40">Area</span><span className="text-[11px] text-white/70 tabular-nums">{env?.lotAreaSqFt?.toLocaleString()} sf</span></div>
                <div className="flex items-center justify-between py-1"><span className="text-[10px] text-white/40">Buildable</span><span className="text-[11px] text-white/70 tabular-nums">{env?.buildableWidthFt} × {env?.buildableDepthFt} ft</span></div>
              </div>
            </>
          )}

          {/* Persistent, non-negotiable disclaimer */}
          <div className="flex items-start gap-2 px-1">
            <Info size={11} className="text-white/25 mt-0.5 shrink-0" />
            <p className="text-[10px] text-white/30 leading-relaxed">
              Estimated from published zoning standards, for guidance only — not a zoning determination.
              Overlays, variances and site conditions can change these limits. Confirm with the city before design work.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParcelStudio;
