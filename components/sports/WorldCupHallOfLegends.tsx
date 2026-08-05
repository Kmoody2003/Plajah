/**
 * WorldCupHallOfLegends — cinematic 3D walk through every World Cup champion.
 *
 * A photoreal night-match stadium rendered with react-three-fiber:
 *   - PBR gold trophies (physical materials, clearcoat, local HDRI via
 *     Lightformers — no network assets) on marble pedestals
 *   - procedurally textured grass, terraced stands seating a ~10,000-person
 *     instanced crowd, corner floodlight pylons with anamorphic lens flares
 *   - a reflective ceremony runner down the center line
 *   - full post pipeline: N8AO ambient occlusion, bloom, depth-of-field bokeh
 *     tracking the selected trophy, chromatic aberration, film grain, vignette
 *   - camera-flash sparkles rippling through the crowd
 *
 * Jules Rimet trophies 1930–1970, the FIFA World Cup Trophy from 1974 on,
 * dark pedestals for the WWII-cancelled years, a silver "pending" trophy for
 * a tournament still in play. Click a trophy (or Prev/Next/Tour) to fly the
 * camera; finalists from editions with squad data deep-link to their rosters.
 */

import { scoreText } from '../../src/lib/scoreText';
import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text, Environment, Lightformer, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, Vignette, ChromaticAberration, Noise, N8AO } from '@react-three/postprocessing';
import { ChevronLeft, ChevronRight, Play, Pause, Trophy, Users, Clapperboard } from 'lucide-react';
import { WC_FINALS, type WCFinal } from '../../data/wcFinalsTimeline';
import { EDITIONS, type WCYear } from '../../data/wcHistory';

// Editions with full squad data in the hub — their finalists deep-link to rosters.
const ROSTER_YEARS = new Set<number>(EDITIONS.map(e => e.year));
function finalistTeamIds(year: number): { champion: string; runnerUp: string } | null {
  const e = EDITIONS.find(ed => ed.year === year);
  return e ? { champion: e.champion, runnerUp: e.runnerUp } : null;
}

const SPACING = 13;
const COUNT = WC_FINALS.length;
const LINE_LEN = (COUNT - 1) * SPACING;
const X0 = -LINE_LEN / 2;
const PITCH_L = LINE_LEN + 50;
const PITCH_W = 60;

const xFor = (i: number) => X0 + i * SPACING;

// ─── Procedural textures (no external assets) ────────────────────────────────

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.anisotropy = 8;
  return tex;
}

function useGrassTexture() {
  return useMemo(() => canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#1e6e30';
    ctx.fillRect(0, 0, s, s);
    // blade noise
    for (let i = 0; i < 26000; i++) {
      const g = 80 + Math.random() * 70;
      ctx.fillStyle = `rgba(${g * 0.28},${g},${g * 0.36},${0.16 + Math.random() * 0.2})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 1.6, 1 + Math.random() * 2.4);
    }
    // faint wear patches
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 24 + Math.random() * 60;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(120,110,60,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, [14, 3]), []);
}

function useMarbleTexture() {
  return useMemo(() => canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#171720';
    ctx.fillRect(0, 0, s, s);
    // veins
    for (let v = 0; v < 22; v++) {
      ctx.strokeStyle = `rgba(${150 + Math.random() * 60},${150 + Math.random() * 60},${170 + Math.random() * 60},${0.05 + Math.random() * 0.09})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      let x = Math.random() * s, y = 0;
      ctx.moveTo(x, y);
      while (y < s) { x += (Math.random() - 0.5) * 26; y += 8 + Math.random() * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, [1.6, 1]), []);
}

function useFlareTexture() {
  return useMemo(() => canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(0.18, 'rgba(255,242,200,0.55)');
    g.addColorStop(0.45, 'rgba(255,230,170,0.16)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }), []);
}

function useBlobShadowTexture() {
  return useMemo(() => canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }), []);
}

// ─── Materials ───────────────────────────────────────────────────────────────

const GoldMaterial: React.FC<{ pending?: boolean }> = ({ pending }) => (
  <meshPhysicalMaterial
    color={pending ? '#d4dbe8' : '#FFC832'}
    metalness={1}
    roughness={pending ? 0.28 : 0.13}
    clearcoat={0.65}
    clearcoatRoughness={0.18}
    envMapIntensity={1.7}
  />
);

// ─── Trophy meshes (high-detail lathe profiles) ──────────────────────────────

// Smooth multi-point profile via Catmull-Rom sampling
function smoothProfile(points: [number, number][], samples = 64): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(points.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  return curve.getPoints(samples).map(p => new THREE.Vector2(Math.max(0.001, p.x), p.y));
}

// Modern FIFA World Cup Trophy — malachite-banded base, twin figures sweeping
// up to hold the globe.
const FifaTrophy: React.FC<{ pending?: boolean }> = ({ pending }) => {
  const body = useMemo(() => smoothProfile([
    [0.001, 0.5], [0.6, 0.5], [0.64, 0.6], [0.52, 0.74], [0.36, 1.0],
    [0.29, 1.3], [0.3, 1.55], [0.38, 1.8], [0.46, 2.0], [0.44, 2.18],
    [0.5, 2.35], [0.58, 2.5], [0.4, 2.6], [0.001, 2.62],
  ], 96), []);

  // The two figures: curved tubes sweeping from the body up around the globe
  const armCurves = useMemo(() => {
    const mk = (side: 1 | -1) => new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.34, 1.15, 0),
      new THREE.Vector3(side * 0.62, 1.7, 0),
      new THREE.Vector3(side * 0.72, 2.35, 0),
      new THREE.Vector3(side * 0.55, 2.9, 0),
      new THREE.Vector3(side * 0.28, 3.25, 0),
    ]);
    return [mk(1), mk(-1)];
  }, []);

  return (
    <group>
      {/* malachite base bands */}
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.72, 0.78, 0.26, 64]} />
        <meshPhysicalMaterial color="#0e5c43" metalness={0.35} roughness={0.22} clearcoat={0.8} envMapIntensity={1.1} />
      </mesh>
      <mesh position={[0, 0.305, 0]}>
        <torusGeometry args={[0.69, 0.035, 16, 64]} />
        <GoldMaterial pending={pending} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.64, 0.7, 0.14, 64]} />
        <GoldMaterial pending={pending} />
      </mesh>
      {/* sweeping body */}
      <mesh>
        <latheGeometry args={[body, 96]} />
        <GoldMaterial pending={pending} />
      </mesh>
      {/* twin figures */}
      {armCurves.map((curve, i) => (
        <mesh key={i}>
          <tubeGeometry args={[curve, 48, 0.085, 12, false]} />
          <GoldMaterial pending={pending} />
        </mesh>
      ))}
      {/* the globe with engraved continents (bump via second sphere) */}
      <mesh position={[0, 3.08, 0]}>
        <sphereGeometry args={[0.58, 64, 48]} />
        <GoldMaterial pending={pending} />
      </mesh>
      <mesh position={[0, 3.08, 0]} rotation={[0.4, 0.8, 0]}>
        <sphereGeometry args={[0.585, 24, 18]} />
        <meshPhysicalMaterial color={pending ? '#b9c2d4' : '#e8ae1e'} metalness={1} roughness={0.4} wireframe transparent opacity={0.35} />
      </mesh>
      {pending && (
        <Billboard position={[0, 3.08, 0.66]}>
          <Text fontSize={0.55} color="#0a0a12" anchorX="center" anchorY="middle" fontWeight={900}>?</Text>
        </Billboard>
      )}
    </group>
  );
};

// Jules Rimet Trophy — lapis octagonal base, winged Nike figure, octagonal cup.
const RimetTrophy: React.FC = () => {
  const cup = useMemo(() => smoothProfile([
    [0.001, 0], [0.28, 0.02], [0.33, 0.1], [0.18, 0.2], [0.13, 0.34],
    [0.15, 0.5], [0.32, 0.66], [0.42, 0.84], [0.36, 0.88], [0.001, 0.86],
  ], 64), []);
  const figure = useMemo(() => smoothProfile([
    [0.2, 0], [0.17, 0.2], [0.1, 0.5], [0.13, 0.75], [0.09, 1.0], [0.14, 1.15], [0.06, 1.3],
  ], 64), []);

  return (
    <group>
      {/* lapis lazuli stepped octagonal base with gold trims */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.55, 0.62, 0.32, 8]} />
        <meshPhysicalMaterial color="#1d3a8f" metalness={0.4} roughness={0.18} clearcoat={0.9} envMapIntensity={1.2} />
      </mesh>
      <mesh position={[0, 0.335, 0]}>
        <cylinderGeometry args={[0.5, 0.55, 0.05, 8]} />
        <GoldMaterial />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.4, 0.48, 0.12, 8]} />
        <GoldMaterial />
      </mesh>
      {/* Nike figure (smooth lathe silhouette) */}
      <group position={[0, 0.48, 0]}>
        <mesh>
          <latheGeometry args={[figure, 48]} />
          <GoldMaterial />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.36, 0]}>
          <sphereGeometry args={[0.09, 24, 18]} />
          <GoldMaterial />
        </mesh>
        {/* wings — thin curved boxes */}
        {[1, -1].map(s => (
          <mesh key={s} position={[s * 0.22, 0.95, -0.02]} rotation={[0.15, 0, s * -0.55]}>
            <boxGeometry args={[0.46, 0.2, 0.035]} />
            <GoldMaterial />
          </mesh>
        ))}
        {/* arms raised to the cup */}
        {[1, -1].map(s => (
          <mesh key={`a${s}`} position={[s * 0.12, 1.32, 0]} rotation={[0, 0, s * -0.7]}>
            <cylinderGeometry args={[0.028, 0.035, 0.42, 10]} />
            <GoldMaterial />
          </mesh>
        ))}
      </group>
      {/* octagonal cup held aloft */}
      <group position={[0, 1.92, 0]} scale={1.12}>
        <mesh>
          <latheGeometry args={[cup, 8]} />
          <GoldMaterial />
        </mesh>
      </group>
    </group>
  );
};

// ─── Pedestal + trophy + labels ──────────────────────────────────────────────

const TrophyStation: React.FC<{
  final: WCFinal;
  index: number;
  selected: boolean;
  onSelect: (i: number) => void;
  marble: THREE.Texture;
  blob: THREE.Texture;
}> = ({ final, index, selected, onSelect, marble, blob }) => {
  const x = xFor(index);
  const spin = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (spin.current && selected) spin.current.rotation.y += delta * 0.5;
  });

  return (
    <group position={[x, 0, 0]}>
      {/* grounding blob shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[5.6, 5.6]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>

      {/* marble pedestal */}
      <mesh position={[0, 1.0, 0]} onClick={(e) => { e.stopPropagation(); onSelect(index); }}>
        <cylinderGeometry args={[1.32, 1.58, 2.0, 48]} />
        <meshPhysicalMaterial
          map={marble}
          color={final.cancelled ? '#101016' : '#23232e'}
          metalness={0.25} roughness={0.32} clearcoat={0.5} clearcoatRoughness={0.3}
        />
      </mesh>
      {/* gold trim rings */}
      <mesh position={[0, 2.02, 0]}>
        <torusGeometry args={[1.36, 0.05, 16, 64]} />
        <meshPhysicalMaterial
          color={selected ? '#FF8C00' : '#6b6b7a'} metalness={1} roughness={0.25}
          emissive={selected ? '#FF8C00' : '#000000'} emissiveIntensity={selected ? 1.4 : 0}
        />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <torusGeometry args={[1.6, 0.045, 16, 64]} />
        <meshPhysicalMaterial color="#55555f" metalness={1} roughness={0.35} />
      </mesh>

      {/* engraved year plaques */}
      {[1, -1].map(s => (
        <group key={s} rotation={[0, s === 1 ? 0 : Math.PI, 0]}>
          <mesh position={[0, 1.05, 1.47]}>
            <boxGeometry args={[1.7, 0.74, 0.05]} />
            <meshPhysicalMaterial color="#0c0c12" metalness={0.7} roughness={0.25} />
          </mesh>
          <Text position={[0, 1.05, 1.51]} fontSize={0.52} color={final.cancelled ? '#4d4d5e' : '#FFD23F'} anchorX="center" anchorY="middle" fontWeight={900}>
            {String(final.year)}
          </Text>
        </group>
      ))}

      {/* trophy */}
      {!final.cancelled && (
        <group ref={spin} position={[0, 2.08, 0]} scale={selected ? 1.18 : 1}>
          {final.trophy === 'rimet' ? <RimetTrophy /> : <FifaTrophy pending={final.pending} />}
        </group>
      )}

      {/* ceremony spotlight cone on selection */}
      {selected && !final.cancelled && (
        <>
          <mesh position={[0, 9, 0]}>
            <cylinderGeometry args={[1.5, 2.6, 14, 32, 1, true]} />
            <meshBasicMaterial color="#FFD980" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <Sparkles count={26} scale={[3.4, 5, 3.4]} position={[0, 4.4, 0]} size={3.2} speed={0.25} color="#FFD23F" opacity={0.7} />
        </>
      )}

      {/* floating winner label */}
      <Billboard position={[0, final.cancelled ? 4.2 : 6.6, 0]}>
        <Text
          fontSize={selected ? 0.85 : 0.58}
          color={final.cancelled ? '#5a5a6c' : selected ? '#FFFFFF' : '#b9b9c8'}
          anchorX="center" anchorY="middle" fontWeight={900}
          outlineWidth={0.035} outlineColor="#000000" outlineOpacity={0.85}
        >
          {final.cancelled ? 'WWII' : final.pending ? 'IN PLAY' : final.winner.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
};

// ─── Stadium dressing ────────────────────────────────────────────────────────

const Pitch: React.FC = () => {
  const grass = useGrassTexture();
  const stripes = useMemo(() => Array.from({ length: Math.ceil(PITCH_L / SPACING) }, (_, i) => i), []);
  const lineMat = <meshBasicMaterial color="#eef7ef" transparent opacity={0.92} />;
  return (
    <group>
      {/* textured grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PITCH_L, PITCH_W]} />
        <meshStandardMaterial map={grass} color="#9fdc8f" roughness={0.95} />
      </mesh>
      {/* mow stripes — subtle brightness bands */}
      {stripes.map(i => i % 2 === 0 && (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-PITCH_L / 2 + (i + 0.5) * SPACING, 0.012, 0]}>
          <planeGeometry args={[SPACING, PITCH_W]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.05} depthWrite={false} />
        </mesh>
      ))}
      {/* ceremony runner under the trophies — deep navy with satin sheen */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[LINE_LEN + 18, 6.4]} />
        <meshPhysicalMaterial color="#10101c" metalness={0.55} roughness={0.22} clearcoat={0.8} clearcoatRoughness={0.25} envMapIntensity={1.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 3.5]}>
        <planeGeometry args={[LINE_LEN + 18, 0.18]} />
        <meshStandardMaterial color="#FFD23F" emissive="#FFD23F" emissiveIntensity={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, -3.5]}>
        <planeGeometry args={[LINE_LEN + 18, 0.18]} />
        <meshStandardMaterial color="#FFD23F" emissive="#FFD23F" emissiveIntensity={0.35} />
      </mesh>

      {/* boundary lines */}
      {[PITCH_W / 2 - 1, -(PITCH_W / 2 - 1)].map((z, i) => (
        <mesh key={`side${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]}>
          <planeGeometry args={[PITCH_L - 4, 0.35]} />
          {lineMat}
        </mesh>
      ))}
      {[(PITCH_L / 2 - 2), -(PITCH_L / 2 - 2)].map((x, i) => (
        <mesh key={`end${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, 0]}>
          <planeGeometry args={[0.35, PITCH_W - 2]} />
          {lineMat}
        </mesh>
      ))}
      {/* center circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[8.6, 9, 96]} />
        {lineMat}
      </mesh>
      {/* penalty boxes */}
      {[PITCH_L / 2 - 2, -(PITCH_L / 2 - 2)].map((xEnd, i) => {
        const dir = i === 0 ? -1 : 1;
        return (
          <group key={`box${i}`}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[xEnd + dir * 8, 0.02, 0]}>
              <planeGeometry args={[0.3, 30]} />
              {lineMat}
            </mesh>
            {[15, -15].map(z => (
              <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[xEnd + dir * 4, 0.02, z]}>
                <planeGeometry args={[8, 0.3]} />
                {lineMat}
              </mesh>
            ))}
          </group>
        );
      })}
      {/* goals with net hint */}
      {[PITCH_L / 2 - 2, -(PITCH_L / 2 - 2)].map((xEnd, i) => (
        <group key={`goal${i}`} position={[xEnd, 0, 0]}>
          {[6, -6].map(z => (
            <mesh key={z} position={[0, 1.3, z]}>
              <cylinderGeometry args={[0.1, 0.1, 2.6, 12]} />
              <meshStandardMaterial color="#f4f4f4" metalness={0.3} roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 2.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 12, 12]} />
            <meshStandardMaterial color="#f4f4f4" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[(i === 0 ? 1 : -1) * 0.9, 1.3, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[12, 2.6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Terraced stands: stepped concrete rows; the crowd sits on them.
const ROWS_SIDE = 14;
const ROWS_END = 9;
const ROW_H = 0.62;
const ROW_D = 1.05;

const Stands: React.FC = () => {
  const standLen = PITCH_L + 24;
  return (
    <group>
      {[1, -1].map(side => (
        <group key={side}>
          {Array.from({ length: ROWS_SIDE }, (_, r) => (
            <mesh key={r} position={[0, 0.9 + r * ROW_H, side * (PITCH_W / 2 + 6 + r * ROW_D)]}>
              <boxGeometry args={[standLen, ROW_H, ROW_D]} />
              <meshStandardMaterial color={r % 4 === 3 ? '#181822' : '#1f1f2a'} roughness={0.92} />
            </mesh>
          ))}
          {/* roof with under-glow */}
          <mesh position={[0, 0.9 + ROWS_SIDE * ROW_H + 4.4, side * (PITCH_W / 2 + 6 + ROWS_SIDE * ROW_D * 0.62)]} rotation={[side * 0.1, 0, 0]}>
            <boxGeometry args={[standLen + 6, 0.5, ROWS_SIDE * ROW_D * 0.95]} />
            <meshStandardMaterial color="#0b0b13" metalness={0.6} roughness={0.5} />
          </mesh>
          {/* roof edge light strip */}
          <mesh position={[0, 0.9 + ROWS_SIDE * ROW_H + 4.14, side * (PITCH_W / 2 + 6 + ROWS_SIDE * ROW_D * 0.18)]}>
            <boxGeometry args={[standLen + 6, 0.12, 0.12]} />
            <meshStandardMaterial color="#fff6dd" emissive="#fff0c8" emissiveIntensity={2.2} />
          </mesh>
        </group>
      ))}
      {[1, -1].map(end => (
        <group key={`e${end}`}>
          {Array.from({ length: ROWS_END }, (_, r) => (
            <mesh key={r} position={[end * (PITCH_L / 2 + 6 + r * ROW_D), 0.9 + r * ROW_H, 0]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[PITCH_W + 14, ROW_H, ROW_D]} />
              <meshStandardMaterial color="#1f1f2a" roughness={0.92} />
            </mesh>
          ))}
        </group>
      ))}
      {/* perimeter wall + PLAJAH boards */}
      {[1, -1].map(side => (
        <group key={`ad${side}`}>
          <mesh position={[0, 0.7, side * (PITCH_W / 2 + 2.5)]}>
            <boxGeometry args={[standLen - 30, 1.4, 0.3]} />
            <meshStandardMaterial color="#07070d" emissive="#161006" emissiveIntensity={0.5} />
          </mesh>
          {[-90, 0, 90].map(x => (
            <Text key={x} position={[x, 0.72, side * (PITCH_W / 2 + 2.3)]}
              rotation={[0, side === 1 ? Math.PI : 0, 0]}
              fontSize={0.8} color="#FF8C00" anchorX="center" anchorY="middle" fontWeight={900} letterSpacing={0.3}>
              PLAJAH SPORTS · HALL OF LEGENDS
            </Text>
          ))}
        </group>
      ))}
    </group>
  );
};

// Floodlight pylons with anamorphic lens flares
const Floodlights: React.FC<{ flare: THREE.Texture }> = ({ flare }) => (
  <group>
    {[1, -1].flatMap(sx => [1, -1].map(sz => {
      const pos: [number, number, number] = [sx * (PITCH_L / 2 + 14), 0, sz * (PITCH_W / 2 + 22)];
      const headPos: [number, number, number] = [pos[0] + sx * -1.4, 27, pos[2] + sz * -1.4];
      return (
        <group key={`${sx}${sz}`}>
          {/* lattice pylon */}
          <mesh position={[pos[0], 13, pos[2]]}>
            <cylinderGeometry args={[0.3, 0.7, 26, 8]} />
            <meshStandardMaterial color="#1c1c28" metalness={0.7} roughness={0.45} />
          </mesh>
          {/* lamp bank: grid of emissive lamps */}
          <group position={headPos} rotation={[sz * 0.45, sx * sz * 0.2, 0]}>
            <mesh>
              <boxGeometry args={[5.6, 3.4, 0.6]} />
              <meshStandardMaterial color="#11111a" metalness={0.6} roughness={0.4} />
            </mesh>
            {Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, col) => (
              <mesh key={`${row}-${col}`} position={[-2.2 + col * 1.1, -1.1 + row * 1.1, 0.34]}>
                <circleGeometry args={[0.4, 20]} />
                <meshStandardMaterial color="#fffdf4" emissive="#fff7d8" emissiveIntensity={5} />
              </mesh>
            )))}
          </group>
          {/* actual light contribution */}
          <spotLight position={headPos} angle={0.7} penumbra={0.6} intensity={2200} distance={320} color="#fff2d0"
            target-position={[pos[0] * 0.3, 0, 0]} />
          {/* lens flare sprites — soft core + anamorphic streak */}
          <Billboard position={headPos}>
            <mesh>
              <planeGeometry args={[16, 16]} />
              <meshBasicMaterial map={flare} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh scale={[4.4, 0.32, 1]}>
              <planeGeometry args={[16, 16]} />
              <meshBasicMaterial map={flare} color="#9db8ff" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </Billboard>
        </group>
      );
    }))}
  </group>
);

// ~10,000-person instanced crowd seated on the terraces
const Crowd: React.FC = () => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const transforms = useMemo(() => {
    const CLOTHES = ['#c0392b', '#2980b9', '#e8e8f0', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#2c3e50', '#ecf0f1', '#FF8C00', '#FFD23F', '#1a1a24', '#7f8c8d'];
    const arr: { pos: [number, number, number]; scale: number; lean: number; color: THREE.Color }[] = [];
    const standLen = PITCH_L + 18;

    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      for (let r = 0; r < ROWS_SIDE; r++) {
        const z = sgn * (PITCH_W / 2 + 6 + r * ROW_D);
        const y = 0.9 + r * ROW_H + ROW_H / 2 + 0.42;
        for (let x = -standLen / 2; x < standLen / 2; x += 1.15) {
          if (Math.random() < 0.12) continue; // empty seats
          arr.push({
            pos: [x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.12, z + (Math.random() - 0.5) * 0.4],
            scale: 0.85 + Math.random() * 0.3,
            lean: (Math.random() - 0.5) * 0.3,
            color: new THREE.Color(CLOTHES[Math.floor(Math.random() * CLOTHES.length)]).multiplyScalar(0.55 + Math.random() * 0.5),
          });
        }
      }
    }
    for (let end = 0; end < 2; end++) {
      const sgn = end === 0 ? 1 : -1;
      for (let r = 0; r < ROWS_END; r++) {
        const x = sgn * (PITCH_L / 2 + 6 + r * ROW_D);
        const y = 0.9 + r * ROW_H + ROW_H / 2 + 0.42;
        for (let z = -(PITCH_W + 10) / 2; z < (PITCH_W + 10) / 2; z += 1.15) {
          if (Math.random() < 0.12) continue;
          arr.push({
            pos: [x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.12, z + (Math.random() - 0.5) * 0.5],
            scale: 0.85 + Math.random() * 0.3,
            lean: (Math.random() - 0.5) * 0.3,
            color: new THREE.Color(CLOTHES[Math.floor(Math.random() * CLOTHES.length)]).multiplyScalar(0.55 + Math.random() * 0.5),
          });
        }
      }
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(...t.pos);
      dummy.scale.setScalar(t.scale);
      dummy.rotation.set(0, 0, t.lean);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, t.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [transforms]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, transforms.length]} frustumCulled={false}>
      <capsuleGeometry args={[0.22, 0.5, 3, 8]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
};

// Camera flashes twinkling through the stands
const CrowdFlashes: React.FC = () => (
  <group>
    {[1, -1].map(side => (
      <Sparkles key={side} count={140}
        position={[0, 0.9 + (ROWS_SIDE * ROW_H) / 2 + 1.5, side * (PITCH_W / 2 + 6 + (ROWS_SIDE * ROW_D) / 2)]}
        scale={[PITCH_L + 18, ROWS_SIDE * ROW_H + 2, ROWS_SIDE * ROW_D]}
        size={10} speed={0.18} opacity={0.85} color="#ffffff" noise={0} />
    ))}
  </group>
);

// Rack-focus controller — locks the focal plane onto the selected trophy so
// it is always tack-sharp. The focus point sits at pedestal-mid height (y=1.4)
// rather than trophy-center so the focus band covers the full trophy from base
// to globe AND everything between the camera and that point stays sharp.
// Only geometry BEHIND that depth (stands, crowd, far trophies) blurs.
const FocusRack: React.FC<{ dofRef: React.MutableRefObject<any>; targetX: number }> = ({ dofRef, targetX }) => {
  const focus = useRef(new THREE.Vector3(targetX, 1.4, 0));
  const dest  = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    // y=1.4 — pedestal mid-point. The focus band at this depth extends forward
    // toward the camera (nothing blurs there — it's open air) and back through
    // the full trophy height to the globe at y~5.5. Stands and crowd at
    // 2-3× the trophy distance fall outside the band and receive bokeh.
    dest.set(targetX, 1.4, 0);
    focus.current.lerp(dest, 0.18);

    const effect = dofRef.current;
    if (!effect) return;
    if (effect.target) effect.target.copy(focus.current);
    else effect.target = focus.current.clone();
  });
  return null;
};

// Camera fly-to controller
const CameraRig: React.FC<{ targetIndex: number; flyToken: number; controlsRef: React.MutableRefObject<any> }> = ({ targetIndex, flyToken, controlsRef }) => {
  const flying = useRef(false);
  const lastToken = useRef(-1);
  useFrame(({ camera }) => {
    if (lastToken.current !== flyToken) { lastToken.current = flyToken; flying.current = true; }
    if (!flying.current || !controlsRef.current) return;
    const x = xFor(targetIndex);
    const camGoal = new THREE.Vector3(x + 6.5, 5.2, 13.5);
    const lookGoal = new THREE.Vector3(x, 3.4, 0);
    camera.position.lerp(camGoal, 0.06);
    controlsRef.current.target.lerp(lookGoal, 0.085);
    controlsRef.current.update();
    if (camera.position.distanceTo(camGoal) < 0.22) flying.current = false;
  });
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const stop = () => { flying.current = false; };
    c.addEventListener?.('start', stop);
    return () => c.removeEventListener?.('start', stop);
  }, [controlsRef]);
  return null;
};

// ─── Main component ──────────────────────────────────────────────────────────

interface HallProps {
  /** Open a squad drill-down for editions that have full roster data (2018/2022). */
  onOpenTeam?: (teamId: string, year: WCYear) => void;
}

export const WorldCupHallOfLegends: React.FC<HallProps> = ({ onOpenTeam }) => {
  const decided = useMemo(() => WC_FINALS.map((f, i) => ({ f, i })).filter(x => !x.f.cancelled), []);
  const defaultIndex = useMemo(() => {
    const last = [...WC_FINALS].reverse().find(f => !f.cancelled && !f.pending);
    return last ? WC_FINALS.indexOf(last) : 0;
  }, []);

  const [selected, setSelected] = useState(defaultIndex);
  const [flyToken, setFlyToken] = useState(0);
  const [touring, setTouring] = useState(false);
  const [cinematic, setCinematic] = useState(true);
  const controlsRef = useRef<any>(null);
  const dofRef = useRef<any>(null);

  const marble = useMarbleTexture();
  const flare = useFlareTexture();
  const blob = useBlobShadowTexture();

  const select = (i: number) => { setSelected(i); setFlyToken(t => t + 1); };

  const step = (dir: 1 | -1) => {
    const order = decided.map(d => d.i);
    const pos = order.indexOf(selected);
    const next = order[(pos + dir + order.length) % order.length];
    select(next);
  };

  useEffect(() => {
    if (!touring) return;
    const id = setInterval(() => step(1), 4500);
    return () => clearInterval(id);
  }, [touring, selected]);

  const f = WC_FINALS[selected];

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-[2rem] overflow-hidden border border-white/10" style={{ height: 600 }}>
        <Canvas
          camera={{ position: [xFor(defaultIndex) + 26, 20, 52], fov: 45, near: 0.5, far: 1600 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true }}
          onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.15; }}
        >
          <Suspense fallback={null}>
            <color attach="background" args={['#04050c']} />
            <fog attach="fog" args={['#04050c', 240, 640]} />
            <Stars radius={420} depth={60} count={2600} factor={5} saturation={0} fade speed={0.4} />

            {/* lighting: cool night ambience + warm key + floodlights */}
            <hemisphereLight args={['#33415e', '#0a0a12', 0.5]} />
            <directionalLight position={[90, 130, 70]} intensity={1.1} color="#ffeecb" />
            <directionalLight position={[-100, 80, -60]} intensity={0.45} color="#9db4ff" />
            <pointLight position={[xFor(selected), 11, 5]} intensity={160} distance={42} color="#ffd76a" />

            {/* local HDRI from lightformers — realistic metal reflections, no network */}
            <Environment resolution={256} frames={1}>
              <Lightformer intensity={4} position={[0, 30, 0]} scale={[60, 60, 1]} rotation={[Math.PI / 2, 0, 0]} color="#fff3d0" />
              <Lightformer intensity={1.6} position={[-40, 12, -30]} scale={[30, 8, 1]} color="#aebfff" />
              <Lightformer intensity={1.6} position={[40, 12, 30]} scale={[30, 8, 1]} color="#ffd9a0" />
              <Lightformer intensity={0.8} position={[0, 6, -45]} scale={[80, 4, 1]} color="#ffffff" />
            </Environment>

            <Pitch />
            <Stands />
            <Crowd />
            <CrowdFlashes />
            <Floodlights flare={flare} />

            {/* atmosphere: faint gold dust drifting over the runner */}
            <Sparkles count={160} position={[0, 5, 0]} scale={[LINE_LEN + 10, 8, 10]} size={1.6} speed={0.12} opacity={0.35} color="#FFD23F" />

            {WC_FINALS.map((final, i) => (
              <TrophyStation key={final.year} final={final} index={i} selected={i === selected} onSelect={select} marble={marble} blob={blob} />
            ))}

            <OrbitControls ref={controlsRef} maxPolarAngle={Math.PI / 2.08} minDistance={5} maxDistance={420} />
            <CameraRig targetIndex={selected} flyToken={flyToken} controlsRef={controlsRef} />
            {/* Always track the selected trophy — keeps it tack-sharp regardless
                of camera position or which other trophies are in frame */}
            {cinematic && <FocusRack dofRef={dofRef} targetX={xFor(selected)} />}

            {/* cinematic post pipeline */}
            {cinematic && (
              <EffectComposer multisampling={0}>
                <N8AO aoRadius={2.2} intensity={2.4} distanceFalloff={1.2} halfRes />
                <Bloom intensity={0.75} luminanceThreshold={0.78} luminanceSmoothing={0.2} mipmapBlur />
                {/* FocusRack drives the target; focalLength 0.018 gives a wide-enough
                    band that the full trophy + foreground air stays sharp. bokehScale 5
                    is moderate — stands/crowd at 2-3× trophy distance blur softly while
                    the near side (camera → trophy) stays crisp. */}
                <DepthOfField ref={dofRef} target={[xFor(defaultIndex), 1.4, 0]} focalLength={0.018} bokehScale={5} height={600} />
                <ChromaticAberration offset={[0.00055, 0.0004]} />
                <Noise opacity={0.045} />
                <Vignette eskil={false} offset={0.18} darkness={0.78} />
              </EffectComposer>
            )}
          </Suspense>
        </Canvas>

        {/* Title */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">World Cup History</p>
          <h3 className="text-lg font-black uppercase tracking-tight italic text-white">Hall of Legends</h3>
          <p className="text-[8px] text-white/35 uppercase tracking-widest mt-0.5">1930 → today · every champion on the timeline</p>
        </div>

        {/* Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <button onClick={() => setCinematic(c => !c)}
            title={cinematic ? 'Cinematic mode on — click for performance mode' : 'Performance mode — click for cinematic'}
            className={`p-2.5 backdrop-blur border rounded-full transition-all ${cinematic ? 'bg-[#FF8C00]/20 border-[#FF8C00]/50 text-[#FF8C00]' : 'bg-black/60 border-white/15 text-white/50 hover:text-white'}`}>
            <Clapperboard size={14} />
          </button>
          <button onClick={() => step(-1)}
            className="p-2.5 bg-black/60 backdrop-blur border border-white/15 rounded-full text-white/70 hover:text-white hover:border-[#FF8C00]/50 transition-all">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setTouring(t => !t)}
            className={`p-2.5 backdrop-blur border rounded-full transition-all ${touring ? 'bg-[#FF8C00] border-[#FF8C00] text-black' : 'bg-black/60 border-white/15 text-white/70 hover:text-white'}`}>
            {touring ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => step(1)}
            className="p-2.5 bg-black/60 backdrop-blur border border-white/15 rounded-full text-white/70 hover:text-white hover:border-[#FF8C00]/50 transition-all">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Edition HUD card */}
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md bg-black/70 backdrop-blur-xl border border-white/12 rounded-[1.5rem] px-5 py-4">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[8px] font-black uppercase tracking-widest text-[#FF8C00]">
              {f.year} · {f.hostFlag} {f.host}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[7px] font-black uppercase tracking-widest text-white/40">
              {f.trophy === 'rimet' ? 'Jules Rimet Trophy' : 'FIFA World Cup Trophy'}
            </span>
          </div>

          {f.cancelled ? (
            <p className="text-sm font-black uppercase tracking-tight text-white/60">Tournament not held</p>
          ) : f.pending ? (
            <p className="text-sm font-black uppercase tracking-tight text-white">Champion to be crowned</p>
          ) : (() => {
            const finalists = onOpenTeam && ROSTER_YEARS.has(f.year) ? finalistTeamIds(f.year) : null;
            return (
              <div className="flex items-center gap-3 flex-wrap">
                {finalists ? (
                  <button
                    onClick={() => onOpenTeam!(finalists.champion, f.year as WCYear)}
                    className="flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded-xl hover:bg-[#FFD23F]/10 border border-transparent hover:border-[#FFD23F]/30 transition-all group">
                    <Trophy size={13} className="text-[#FFD23F]" />
                    <span className="text-base font-black uppercase tracking-tight text-white group-hover:text-[#FFD23F] transition-colors">{f.winnerFlag} {f.winner}</span>
                    <Users size={10} className="text-white/25 group-hover:text-[#FFD23F]" />
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Trophy size={13} className="text-[#FFD23F]" />
                    <span className="text-base font-black uppercase tracking-tight text-white">{f.winnerFlag} {f.winner}</span>
                  </div>
                )}
                <span className="text-sm font-black text-[#FF8C00] tabular-nums">{scoreText(f.score)}</span>
                {finalists ? (
                  <button
                    onClick={() => onOpenTeam!(finalists.runnerUp, f.year as WCYear)}
                    className="flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded-xl hover:bg-white/10 border border-transparent hover:border-white/25 transition-all group">
                    <span className="text-sm font-bold uppercase text-white/45 group-hover:text-white transition-colors">{f.runnerUpFlag} {f.runnerUp}</span>
                    <Users size={10} className="text-white/25 group-hover:text-white" />
                  </button>
                ) : (
                  <span className="text-sm font-bold uppercase text-white/45">{f.runnerUpFlag} {f.runnerUp}</span>
                )}
              </div>
            );
          })()}

          {onOpenTeam && ROSTER_YEARS.has(f.year) && !f.cancelled && !f.pending && (
            <p className="text-[7px] font-black uppercase tracking-widest text-[#FFD23F]/50 mt-1.5">
              Tap a finalist to open the full squad
            </p>
          )}

          {f.venue && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mt-1.5">
              {f.venue} · {f.city}
            </p>
          )}
          {f.note && <p className="text-[10px] text-white/50 leading-relaxed mt-1.5">{f.note}</p>}
        </div>
      </div>

      {/* Quick year scrubber */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {WC_FINALS.map((final, i) => (
          <button key={final.year} onClick={() => select(i)}
            disabled={final.cancelled}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
              final.cancelled ? 'bg-white/[0.02] border-white/5 text-white/15 cursor-not-allowed'
              : i === selected ? 'bg-[#FF8C00] text-black border-[#FF8C00]'
              : 'bg-white/5 border-white/10 text-white/45 hover:text-white'}`}>
            {final.year}{!final.cancelled && !final.pending ? ` ${final.winnerFlag}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export default WorldCupHallOfLegends;
