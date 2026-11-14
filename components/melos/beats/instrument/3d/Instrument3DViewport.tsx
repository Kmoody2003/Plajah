// Interactive real-time 3D CAD Instrument Viewport for TONOS, SOMA, LYRA, and VOLTA.
// Features bounding-sphere unclipped auto-framing, articulated physical mechanics (pistons,
// trombone slide, woodwind keys, piano keys, standing-wave strings, Bessel membranes),
// translucent holographic player hands/fingers, and live acoustic airflow particle streams.

import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RotateCcw, Box, Hand, Wind } from 'lucide-react';
import type { CadModel } from '../../../../../services/cad/model';
import { modelToGroup } from '../../../../../services/cad/scene';
import type { InstrumentViewSpec } from '../../../../../services/melos/instruments/cad3d/cadUtils';
import { BeatsEngine } from '../../../../../services/melos/beats/engine/BeatsEngine';
import {
  computePerformanceKinematics,
  type PerformerArchetype,
} from '../../../../../services/melos/instruments/cad3d/performanceKinematics';

export interface KinematicsMeta {
  archetype?: PerformerArchetype;
  variant?: number;
  excitePos?: number;
  strikePos?: number;
  strikeAngle?: number;
  drumRadius?: number;
  drumHeight?: number;
  isFlute?: boolean;
  isSax?: boolean;
}

export interface Instrument3DViewportProps {
  model: CadModel;
  spec: InstrumentViewSpec;
  trackId: string;
  strikeNonce: number;
  sustained?: boolean;
  heldCount?: () => number;
  height?: number;
  fillHeight?: boolean;
  subtitle?: string;
  kinematicsMeta?: KinematicsMeta;
  onTrigger?: () => void;
}

class ViewportErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[Instrument3DViewport] WebGL fallback triggered:', err);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function disposeGroupResources(group: THREE.Group): void {
  const mats = new Set<THREE.Material>();
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) mats.add(m);
    } else if (mesh.material) {
      mats.add(mesh.material);
    }
  });
  for (const m of mats) m.dispose();
}

type AnimatedKind =
  | 'membrane'
  | 'string'
  | 'tine'
  | 'hammer'
  | 'bow'
  | 'wheel'
  | 'rattle'
  | 'bau_rod'
  | 'bell'
  | 'valve'
  | 'slide'
  | 'key'
  | 'pkey'
  | 'tube'
  | 'knob';

interface AnimatedTarget {
  kind: AnimatedKind;
  mesh: THREE.Mesh;
  basePos: Float32Array;
  baseCenter: THREE.Vector3;
  baseObjPos: THREE.Vector3;
  baseObjRot: THREE.Euler;
  maxRadius: number;
  idx: number;
}

function collectAnimatedTargets(group: THREE.Group): AnimatedTarget[] {
  const out: AnimatedTarget[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const id = String(obj.name || obj.userData?.cadMeshId || '');
    let kind: AnimatedKind | null = null;
    if (id === 'membrane' || id === 'resonant_head') kind = 'membrane';
    else if (id.startsWith('string_') || id.startsWith('taraf_')) kind = 'string';
    else if (id.startsWith('tine_')) kind = 'tine';
    else if (id.startsWith('hammer_') || id === 'striker') kind = 'hammer';
    else if (id === 'bow') kind = 'bow';
    else if (id === 'wheel') kind = 'wheel';
    else if (id === 'rattle' || id === 'jawari') kind = 'rattle';
    else if (id === 'bau_rod') kind = 'bau_rod';
    else if (id === 'bell') kind = 'bell';
    else if (id.startsWith('valve_')) kind = 'valve';
    else if (id === 'slide' || id === 'slide_brace') kind = 'slide';
    else if (id.startsWith('key_')) kind = 'key';
    else if (id.startsWith('pkey_')) kind = 'pkey';
    else if (id.startsWith('tube_') || id.startsWith('led_')) kind = 'tube';
    else if (id.startsWith('knob_')) kind = 'knob';
    if (!kind) return;

    const attr = obj.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attr || !attr.array) return;
    obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    const center = new THREE.Vector3();
    let maxRadius = 0.2;
    if (bb) {
      bb.getCenter(center);
      const sz = new THREE.Vector3();
      bb.getSize(sz);
      maxRadius = Math.max(0.05, Math.max(sz.x, sz.y) * 0.5);
    }
    if (kind === 'wheel' || kind === 'knob') {
      obj.geometry.translate(-center.x, -center.y, -center.z);
      obj.position.copy(center);
    }
    const basePos = new Float32Array(attr.array as Float32Array);
    const numMatch = /_(\d+)$/.exec(id);
    out.push({
      kind,
      mesh: obj,
      basePos,
      baseCenter: center,
      baseObjPos: obj.position.clone(),
      baseObjRot: obj.rotation.clone(),
      maxRadius,
      idx: numMatch ? Number(numMatch[1]) : 0,
    });
  });
  return out;
}

function inferArchetype(family: string, targets: AnimatedTarget[], meta?: KinematicsMeta): PerformerArchetype {
  if (meta?.archetype) return meta.archetype;
  const f = family.toLowerCase();
  if (f.includes('volta') || f.includes('synth')) return 'synth';
  if (targets.some((t) => t.kind === 'membrane')) return 'percussion';
  if (targets.some((t) => t.kind === 'slide')) return 'brass-slide';
  if (targets.some((t) => t.kind === 'valve')) return 'brass-valves';
  if (targets.some((t) => t.kind === 'key')) return 'woodwind-keys';
  if (targets.some((t) => t.kind === 'pkey' || t.kind === 'tine')) return 'keyboard';
  if (targets.some((t) => t.kind === 'bow' || t.kind === 'wheel')) return 'bowed-string';
  return 'plucked-string';
}

const MAX_FINGERS = 8;
const AIRFLOW_PARTICLES = 56;

const InstrumentScene: React.FC<{
  cadModel: CadModel;
  spec: InstrumentViewSpec;
  trackId: string;
  strikeNonce: number;
  sustained: boolean;
  heldCount?: () => number;
  kinematicsMeta?: KinematicsMeta;
  showHands: boolean;
  showAirflow: boolean;
  resetToken: number;
}> = ({
  cadModel,
  spec,
  trackId,
  strikeNonce,
  sustained,
  heldCount,
  kinematicsMeta,
  showHands,
  showAirflow,
  resetToken,
}) => {
  const { camera, size } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const pcmBuf = useMemo(() => new Float32Array(256), []);
  const strikeRef = useRef<{ time: number; vel: number }>({ time: 0, vel: 0 });
  const prevNonceRef = useRef(strikeNonce);
  const prevPeakRef = useRef(0);
  const phaseRef = useRef(0);
  const slidePosRef = useRef(0);
  const valvePosRef = useRef([0, 0, 0]);
  const boundsDistRef = useRef(1.2);
  const wasActiveRef = useRef(false);

  const { group, targets, archetype, bounds } = useMemo(() => {
    const g = modelToGroup(cadModel);
    const t = collectAnimatedTargets(g);
    const box = new THREE.Box3().setFromObject(g);
    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    if (!box.isEmpty()) {
      box.getCenter(center);
      box.getBoundingSphere(sphere);
    } else {
      sphere.radius = 0.45;
    }
    const arch = inferArchetype(spec.family, t, kinematicsMeta);
    return {
      group: g,
      targets: t,
      archetype: arch,
      bounds: { center, radius: Math.max(0.16, sphere.radius) },
    };
  }, [cadModel, spec.family, kinematicsMeta]);

  useEffect(() => {
    return () => {
      disposeGroupResources(group);
    };
  }, [group]);

  // Translucent virtual performer hand/fingertip pool
  const handRig = useMemo(() => {
    const rigGroup = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.014, 16, 12);
    const palmGeo = new THREE.SphereGeometry(0.022, 16, 12);
    const fingers: Array<{
      mesh: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      curPos: THREE.Vector3;
    }> = [];
    for (let i = 0; i < MAX_FINGERS; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#bae6fd',
        emissive: spec.accentHex,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      rigGroup.add(mesh);
      fingers.push({ mesh, mat, curPos: new THREE.Vector3() });
    }
    const leftPalmMat = new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      emissive: '#38bdf8',
      emissiveIntensity: 0.2,
      roughness: 0.35,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const rightPalmMat = leftPalmMat.clone();
    const leftPalm = new THREE.Mesh(palmGeo, leftPalmMat);
    const rightPalm = new THREE.Mesh(palmGeo, rightPalmMat);
    leftPalm.visible = false;
    rightPalm.visible = false;
    rigGroup.add(leftPalm, rightPalm);
    return { rigGroup, geo, palmGeo, fingers, leftPalm, rightPalm, leftPalmMat, rightPalmMat };
  }, [spec.accentHex]);

  useEffect(() => {
    return () => {
      handRig.geo.dispose();
      handRig.palmGeo.dispose();
      for (const f of handRig.fingers) f.mat.dispose();
      handRig.leftPalmMat.dispose();
      handRig.rightPalmMat.dispose();
    };
  }, [handRig]);

  // Volumetric acoustic airflow particle pool for brass & woodwinds
  const airflowPool = useMemo(() => {
    const positions = new Float32Array(AIRFLOW_PARTICLES * 3);
    const phases = new Float32Array(AIRFLOW_PARTICLES);
    const seeds = new Float32Array(AIRFLOW_PARTICLES * 2);
    for (let i = 0; i < AIRFLOW_PARTICLES; i++) {
      phases[i] = i / AIRFLOW_PARTICLES;
      seeds[i * 2] = Math.sin(i * 12.9898) * 0.5;
      seeds[i * 2 + 1] = Math.cos(i * 78.233) * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: '#bae6fd',
      size: 0.018,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    return { points, geo, mat, positions, phases, seeds };
  }, []);

  useEffect(() => {
    return () => {
      airflowPool.geo.dispose();
      airflowPool.mat.dispose();
    };
  }, [airflowPool]);

  useEffect(() => {
    if (strikeNonce !== prevNonceRef.current) {
      prevNonceRef.current = strikeNonce;
      strikeRef.current = { time: performance.now(), vel: 0.92 };
    }
  }, [strikeNonce]);

  // Bounding-sphere unclipped auto-framing on model switch, resize, or reset
  useEffect(() => {
    const pCam = camera as THREE.PerspectiveCamera;
    const fovRad = THREE.MathUtils.degToRad(pCam.fov || 36);
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1.25;
    const tanHalfV = Math.tan(fovRad * 0.5);
    const fovH = 2 * Math.atan(tanHalfV * Math.min(1, aspect));
    const sinHalfMin = Math.max(0.18, Math.sin(Math.min(fovRad, fovH) * 0.5));
    const fitDist = (bounds.radius / sinHalfMin) * 1.24;

    const dir = new THREE.Vector3(
      spec.cameraPos[0] - spec.target[0],
      spec.cameraPos[1] - spec.target[1],
      spec.cameraPos[2] - spec.target[2],
    );
    if (dir.lengthSq() < 1e-6) dir.set(0.55, 0.45, 0.7);
    const specDist = dir.length();
    dir.normalize();

    const finalDist = Math.max(fitDist, specDist * 0.95);
    boundsDistRef.current = finalDist;
    pCam.position.copy(bounds.center).addScaledVector(dir, finalDist);
    pCam.near = Math.max(0.01, finalDist * 0.02);
    pCam.far = Math.max(25, finalDist * 14);
    pCam.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(bounds.center);
      controlsRef.current.minDistance = Math.max(0.22, finalDist * 0.25);
      controlsRef.current.maxDistance = Math.max(3.0, finalDist * 4.2);
      controlsRef.current.update();
    } else {
      pCam.lookAt(bounds.center);
    }
  }, [camera, spec.cameraPos, spec.target, cadModel.name, bounds, size.width, size.height, resetToken]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, Math.max(0.001, delta));
    const now = performance.now();
    const engInst = BeatsEngine.get().getInstrument(trackId);
    const peak = engInst ? engInst.readWaveform(pcmBuf) : 0;
    if (peak > 0.04 && peak > prevPeakRef.current * 1.35 && now - strikeRef.current.time > 45) {
      strikeRef.current = { time: now, vel: Math.min(1, peak * 1.4) };
    }
    prevPeakRef.current = peak;

    const dtSec = Math.max(0, (now - strikeRef.current.time) * 0.001);
    const impulse = strikeRef.current.vel > 0
      ? Math.exp(-dtSec * (sustained ? 1.6 : 3.2)) * strikeRef.current.vel
      : 0;
    const heldNotes = engInst ? engInst.heldNoteNumbers() : [];
    const isHeld = heldNotes.length > 0 || (typeof heldCount === 'function' ? heldCount() > 0 : Boolean(heldCount));
    const energy = Math.min(1, Math.max(peak * 1.9, isHeld ? Math.max(0.32, impulse) : impulse));

    const kinematics = computePerformanceKinematics({
      archetype,
      heldNotes,
      lastNote: engInst?.lastNote ?? 60,
      velocity: engInst?.lastVelocity ?? 0.75,
      energy,
      pitchBend: engInst?.pitchBendValue ?? 0,
      modWheel: engInst?.modWheelValue ?? 0,
      timeSec: now * 0.001,
      excitePos: kinematicsMeta?.excitePos,
      strikePos: kinematicsMeta?.strikePos,
      strikeAngle: kinematicsMeta?.strikeAngle,
      drumRadius: kinematicsMeta?.drumRadius,
      drumHeight: kinematicsMeta?.drumHeight,
      isFlute: kinematicsMeta?.isFlute ?? spec.family.toLowerCase() === 'flute',
      isSax: kinematicsMeta?.isSax ?? spec.family.toLowerCase() === 'sax',
    });

    const isActive = energy > 0.004 || kinematics.isEngaged;
    if (!isActive) {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        for (const t of targets) {
          const attr = t.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
          (attr.array as Float32Array).set(t.basePos);
          attr.needsUpdate = true;
          t.mesh.position.copy(t.baseObjPos);
          t.mesh.rotation.copy(t.baseObjRot);
          t.mesh.scale.set(1, 1, 1);
        }
        for (const f of handRig.fingers) {
          f.mesh.visible = false;
        }
        handRig.leftPalm.visible = false;
        handRig.rightPalm.visible = false;
        airflowPool.points.visible = false;
      }
      return;
    }

    wasActiveRef.current = true;
    phaseRef.current += dt * 36;
    const ph = phaseRef.current;

    // 1) Animate physical CAD targets
    for (const t of targets) {
      if (t.kind === 'membrane') {
        const attr = t.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const base = t.basePos;
        const n = arr.length / 3;
        const invR = 1 / t.maxRadius;
        for (let i = 0; i < n; i++) {
          const bx = base[i * 3]!;
          const by = base[i * 3 + 1]!;
          const bz = base[i * 3 + 2]!;
          const dx = bx - t.baseCenter.x;
          const dy = by - t.baseCenter.y;
          const r = Math.min(1, Math.hypot(dx, dy) * invR);
          const ang = Math.atan2(dy, dx);
          const j0 = (1 - r * r * 0.92) * Math.sin(ph);
          const j1 = r * (1 - r) * 1.6 * Math.cos(ang) * Math.sin(ph * 1.59);
          arr[i * 3 + 2] = bz + energy * 0.017 * (j0 + j1);
        }
        attr.needsUpdate = true;
      } else if (t.kind === 'string' || t.kind === 'tine') {
        // Pinned nut & saddle standing wave (exaggerated 2.15x so vibrations read crisply!)
        const attr = t.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const base = t.basePos;
        const n = arr.length / 3;
        const xmin = -0.38;
        const span = 0.78;
        const activeBoost = t.idx === kinematics.stringIndex % 6 ? 1.35 : 0.9;
        const amp = energy * activeBoost * (t.kind === 'tine' ? 0.021 : 0.019);
        for (let i = 0; i < n; i++) {
          const bx = base[i * 3]!;
          const by = base[i * 3 + 1]!;
          const bz = base[i * 3 + 2]!;
          const u = Math.max(0, Math.min(1, t.kind === 'tine' ? (by + 0.14) / 0.28 : (bx - xmin) / span));
          const shape = t.kind === 'tine' ? u * u : Math.sin(Math.PI * u);
          const wave = Math.sin(ph * (1 + t.idx * 0.09)) + 0.38 * Math.cos(ph * 2.02 + t.idx);
          arr[i * 3 + 2] = bz + shape * wave * amp;
        }
        attr.needsUpdate = true;
      } else if (t.kind === 'bow') {
        t.mesh.position.y = t.baseObjPos.y + Math.sin(ph * 0.14) * energy * 0.095;
      } else if (t.kind === 'wheel') {
        t.mesh.rotation.y = (now * 0.007 * (0.4 + energy)) % (Math.PI * 2);
      } else if (t.kind === 'hammer') {
        const bounce = Math.exp(-dtSec * 16) * Math.sin(dtSec * 44) * energy;
        t.mesh.position.z = t.baseObjPos.z - bounce * 0.028;
      } else if (t.kind === 'rattle' || t.kind === 'bau_rod') {
        t.mesh.position.z = t.baseObjPos.z + Math.sin(ph * 2.3 + t.idx) * energy * 0.004;
      } else if (t.kind === 'bell') {
        const s = 1 + energy * 0.018 * Math.sin(ph * 1.4);
        t.mesh.scale.set(s, s, s);
      } else if (t.kind === 'valve') {
        const targetDep = kinematics.brassValves[t.idx % 3] ? -0.025 : 0;
        const cur = valvePosRef.current[t.idx % 3] ?? 0;
        const next = THREE.MathUtils.lerp(cur, targetDep, Math.min(1, dt * 24));
        valvePosRef.current[t.idx % 3] = next;
        t.mesh.position.z = t.baseObjPos.z + next;
      } else if (t.kind === 'slide') {
        const targetExt = kinematics.slideExtension * 0.24;
        slidePosRef.current = THREE.MathUtils.lerp(slidePosRef.current, targetExt, Math.min(1, dt * 14));
        t.mesh.position.x = t.baseObjPos.x + slidePosRef.current;
      } else if (t.kind === 'key') {
        const closed = kinematics.woodwindKeys[t.idx % 6] ?? false;
        t.mesh.position.z = THREE.MathUtils.lerp(t.mesh.position.z, t.baseObjPos.z - (closed ? 0.009 : 0), Math.min(1, dt * 24));
      } else if (t.kind === 'pkey') {
        const pressed = kinematics.pressedKeyIndices.includes(t.idx);
        const tgtZ = t.baseObjPos.z - (pressed ? 0.014 : 0);
        t.mesh.position.z = THREE.MathUtils.lerp(t.mesh.position.z, tgtZ, Math.min(1, dt * 28));
      } else if (t.kind === 'tube') {
        const mat = t.mesh.material as THREE.MeshStandardMaterial;
        if (mat && 'emissiveIntensity' in mat) {
          mat.emissiveIntensity = 0.25 + energy * 1.25;
        }
      }
    }

    // 2) Update Translucent Performer Fingertips & Palms
    let lSumX = 0, lSumY = 0, lSumZ = 0, lCount = 0;
    let rSumX = 0, rSumY = 0, rSumZ = 0, rCount = 0;
    const smoothK = Math.min(1, dt * 18);
    for (let i = 0; i < MAX_FINGERS; i++) {
      const slot = handRig.fingers[i]!;
      const ft = kinematics.fingers[i];
      if (!showHands || !ft) {
        slot.mesh.visible = false;
        continue;
      }
      slot.mesh.visible = true;
      slot.curPos.lerp(new THREE.Vector3(ft.pos[0], ft.pos[1], ft.pos[2]), smoothK);
      slot.mesh.position.copy(slot.curPos);
      slot.mat.opacity = ft.active ? 0.72 : 0.34;
      slot.mat.emissiveIntensity = ft.active ? 0.95 : 0.22;
      if (ft.hand === 'left') {
        lSumX += slot.curPos.x; lSumY += slot.curPos.y; lSumZ += slot.curPos.z; lCount++;
      } else {
        rSumX += slot.curPos.x; rSumY += slot.curPos.y; rSumZ += slot.curPos.z; rCount++;
      }
    }
    if (showHands && lCount > 0) {
      handRig.leftPalm.visible = true;
      handRig.leftPalm.position.set(lSumX / lCount, lSumY / lCount - 0.032, lSumZ / lCount + 0.028);
      handRig.leftPalmMat.opacity = 0.24;
    } else {
      handRig.leftPalm.visible = false;
    }
    if (showHands && rCount > 0) {
      handRig.rightPalm.visible = true;
      handRig.rightPalm.position.set(rSumX / rCount, rSumY / rCount + 0.025, rSumZ / rCount + 0.035);
      handRig.rightPalmMat.opacity = 0.24;
    } else {
      handRig.rightPalm.visible = false;
    }

    // 3) Volumetric Live Airflow Stream for Brass & Woodwinds
    if (showAirflow && kinematics.airflow.active) {
      airflowPool.points.visible = true;
      const { origin, dir, spread, intensity } = kinematics.airflow;
      const speed = 0.75 + intensity * 1.45;
      const posAttr = airflowPool.geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < AIRFLOW_PARTICLES; i++) {
        airflowPool.phases[i] = (airflowPool.phases[i]! + dt * speed) % 1;
        const life = airflowPool.phases[i]!;
        const s1 = airflowPool.seeds[i * 2]!;
        const s2 = airflowPool.seeds[i * 2 + 1]!;
        const travel = life * (0.28 + 0.32 * intensity);
        const coneR = life * spread * (0.55 + intensity * 0.7);
        const swirlY = (s1 + Math.sin(life * 8 + i) * 0.25) * coneR;
        const swirlZ = (s2 + Math.cos(life * 7 + i) * 0.25) * coneR;
        airflowPool.positions[i * 3] = origin[0] + dir[0] * travel;
        airflowPool.positions[i * 3 + 1] = origin[1] + dir[1] * travel + swirlY;
        airflowPool.positions[i * 3 + 2] = origin[2] + dir[2] * travel + swirlZ;
      }
      posAttr.needsUpdate = true;
      airflowPool.mat.opacity = 0.35 + 0.55 * intensity;
    } else {
      airflowPool.points.visible = false;
    }
  });

  return (
    <>
      <hemisphereLight args={['#fff5e4', '#1e1b2e', 1.0]} />
      <directionalLight position={[1.4, 2.2, 1.8]} intensity={1.7} color="#fff7ed" />
      <directionalLight position={[-1.5, 0.7, -1.2]} intensity={0.65} color="#93c5fd" />
      <primitive object={group} />
      <primitive object={handRig.rigGroup} />
      <primitive object={airflowPool.points} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} />
    </>
  );
};

export const Instrument3DViewport: React.FC<Instrument3DViewportProps> = ({
  model,
  spec,
  trackId,
  strikeNonce,
  sustained = false,
  heldCount,
  height = 240,
  fillHeight = false,
  subtitle,
  kinematicsMeta,
  onTrigger,
}) => {
  const [resetToken, setResetToken] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [showHands, setShowHands] = useState(true);
  const [showAirflow, setShowAirflow] = useState(true);

  const isWindOrBrass = spec.family.includes('trumpet')
    || spec.family.includes('brass')
    || spec.family.includes('sax')
    || spec.family.includes('flute')
    || spec.family.includes('clarinet')
    || spec.family.includes('reed');

  const containerStyle = fillHeight
    ? { background: 'radial-gradient(circle at 50% 42%, #1a1625 0%, #09080d 82%)' }
    : { height, background: 'radial-gradient(circle at 50% 42%, #1a1625 0%, #09080d 82%)' };

  const fallback = (
    <div
      className={`w-full rounded-lg border border-white/10 bg-black/50 flex flex-col items-center justify-center gap-1.5 text-center p-4 ${fillHeight ? 'h-full min-h-[280px]' : ''}`}
      style={fillHeight ? undefined : { height }}
    >
      <Box size={18} style={{ color: spec.accentHex }} />
      <p className="text-[11px] font-bold text-white/80">{model.name} (CAD Topology Ready)</p>
      <p className="text-[10px] text-white/45">
        {model.meshes.length} parametric solids · WebGL 3D preview unavailable in this browser context.
      </p>
    </div>
  );

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden border border-white/[0.1] ${fillHeight ? 'h-full min-h-[300px]' : ''}`}
      style={containerStyle}
    >
      {contextLost ? (
        fallback
      ) : (
        <ViewportErrorBoundary fallback={fallback}>
          <Canvas
            camera={{ position: spec.cameraPos, fov: 36, near: 0.02, far: 25 }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                setContextLost(true);
              });
            }}
            onDoubleClick={onTrigger}
          >
            <InstrumentScene
              cadModel={model}
              spec={spec}
              trackId={trackId}
              strikeNonce={strikeNonce}
              sustained={sustained}
              heldCount={heldCount}
              kinematicsMeta={kinematicsMeta}
              showHands={showHands}
              showAirflow={showAirflow}
              resetToken={resetToken}
            />
          </Canvas>
        </ViewportErrorBoundary>
      )}

      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-black/65 backdrop-blur flex-none"
            style={{ borderColor: `${spec.accentHex}55`, color: spec.accentHex }}
          >
            3D CAD · {spec.family}
          </span>
          {subtitle && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-white/65 bg-black/55 truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowHands((v) => !v)}
            title="Toggle translucent virtual player hands & fingertips"
            className={`px-2 py-1 rounded text-[9px] font-bold border flex items-center gap-1 transition ${
              showHands
                ? 'bg-sky-500/20 border-sky-400/45 text-sky-200'
                : 'bg-black/65 border-white/15 text-white/55 hover:text-white'
            }`}
          >
            <Hand size={10} /> Hands {showHands ? 'ON' : 'OFF'}
          </button>
          {isWindOrBrass && (
            <button
              type="button"
              onClick={() => setShowAirflow((v) => !v)}
              title="Toggle volumetric acoustic airflow particle stream"
              className={`px-2 py-1 rounded text-[9px] font-bold border flex items-center gap-1 transition ${
                showAirflow
                  ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                  : 'bg-black/65 border-white/15 text-white/55 hover:text-white'
              }`}
            >
              <Wind size={10} /> Airflow {showAirflow ? 'ON' : 'OFF'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {onTrigger && (
            <button
              type="button"
              onClick={onTrigger}
              className="px-2.5 py-1 rounded text-[9.5px] font-bold bg-black/70 hover:bg-black/90 border border-white/20 text-white/85 transition"
            >
              Audition
            </button>
          )}
          <button
            type="button"
            onClick={() => setResetToken((n) => n + 1)}
            title="Reframe 3D model to fit full viewport"
            className="px-2 py-1 rounded bg-black/70 hover:bg-black/90 border border-white/20 text-white/75 flex items-center gap-1 text-[9px] font-semibold transition"
          >
            <RotateCcw size={10} /> Reframe
          </button>
        </div>
      </div>
    </div>
  );
};
