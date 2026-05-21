'use client';
import React, { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, RotateCcw, Layers, X, ChevronRight, Info } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Gender = 'MALE' | 'FEMALE';
type Phase  = 'SELECT' | 'BODY';
type Tab    = 'FULL' | 'SKELETAL' | 'ORGANS' | 'CIRCULATORY' | 'NERVOUS' | 'RESPIRATORY';
type DetailTab = 'OVERVIEW' | 'FUNCTIONS' | 'FACTS';

interface OrganDef {
  id: string; name: string; latin: string;
  color: string; emissiveColor: string;
  position: [number, number, number];
  scale: [number, number, number];
  explodeOffset: [number, number, number];
  shape: 'brain' | 'capsule' | 'flat-sphere' | 'torus' | 'blob';
  systems: Tab[]; genders: Gender[];
  animationType: 'pulse' | 'breathe' | 'neutral' | 'flow';
  description: string; functions: string[]; funFacts: string[];
}

// ─── Data ───────────────────────────────────────────────────────────────────────

const ORGANS: OrganDef[] = [
  {
    id:'brain', name:'Brain', latin:'Cerebrum', color:'#9B72CF', emissiveColor:'#5A2A8A',
    position:[0,1.28,0.02], scale:[0.21,0.2,0.21], explodeOffset:[0,0.9,0.7],
    shape:'brain', systems:['FULL','NERVOUS'], genders:['MALE','FEMALE'], animationType:'pulse',
    description:'The brain houses 86 billion neurons forming up to 100 trillion synaptic connections — the most complex structure in the known universe. Despite being only 2% of body weight, it consumes 20% of all oxygen.',
    functions:['Controls all voluntary movement and reflexes','Processes every sensory signal','Forms and retrieves memory','Regulates hormones via the hypothalamus','Drives emotion, language, and abstract thought'],
    funFacts:['86 billion neurons — comparable to stars in the Milky Way','Generates ~23 watts of electricity when awake','Has no pain receptors — cannot feel pain itself','Continues developing until age 25'],
  },
  {
    id:'heart', name:'Heart', latin:'Cor', color:'#E8354A', emissiveColor:'#A0101E',
    position:[-0.1,0.46,0.06], scale:[0.14,0.16,0.13], explodeOffset:[-0.8,0.55,0.85],
    shape:'blob', systems:['FULL','ORGANS','CIRCULATORY'], genders:['MALE','FEMALE'], animationType:'pulse',
    description:'The heart beats 100,000 times a day, moving 5 litres of blood per minute through 100,000 km of blood vessels — enough to circle Earth twice.',
    functions:['Pumps oxygenated blood to every cell','Returns blood to lungs for re-oxygenation','Regulates blood pressure via rate and force','Releases hormones affecting kidney function'],
    funFacts:['Beats ~3 billion times in a lifetime','Left ventricle wall is 3× thicker than the right','Can continue beating outside the body if oxygenated'],
  },
  {
    id:'left-lung', name:'Left Lung', latin:'Pulmo sinister', color:'#F4A0B8', emissiveColor:'#9A3060',
    position:[-0.27,0.42,0.0], scale:[0.13,0.23,0.1], explodeOffset:[-1.1,0.35,0.6],
    shape:'capsule', systems:['FULL','ORGANS','RESPIRATORY'], genders:['MALE','FEMALE'], animationType:'breathe',
    description:'Slightly smaller than the right lung to accommodate the heart. Contains 300 million alveoli where oxygen crosses into the blood and CO₂ exits.',
    functions:['Absorbs oxygen into the bloodstream','Expels carbon dioxide','Filters small blood clots','Regulates blood pH via CO₂ balance'],
    funFacts:['Has 2 lobes vs the right lung\'s 3','Total lung surface area equals a tennis court','You breathe ~22,000 times per day'],
  },
  {
    id:'right-lung', name:'Right Lung', latin:'Pulmo dexter', color:'#F4B0C4', emissiveColor:'#9A3060',
    position:[0.27,0.44,0.0], scale:[0.14,0.25,0.11], explodeOffset:[1.1,0.35,0.6],
    shape:'capsule', systems:['FULL','ORGANS','RESPIRATORY'], genders:['MALE','FEMALE'], animationType:'breathe',
    description:'The larger of the two lungs with three lobes, performing the gas exchange that keeps every cell alive — processing roughly 500 litres of air per hour at rest.',
    functions:['Absorbs oxygen into the bloodstream','Expels carbon dioxide','Filters micro-emboli from circulation','Works with diaphragm to create inhalation pressure'],
    funFacts:['3 lobes — superior, middle, and inferior','Processes ~500 litres of air per hour at rest'],
  },
  {
    id:'liver', name:'Liver', latin:'Hepar', color:'#8B2218', emissiveColor:'#4A0E08',
    position:[0.18,0.08,0.0], scale:[0.22,0.11,0.12], explodeOffset:[1.0,0.05,0.75],
    shape:'flat-sphere', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'At 1.5 kg the largest internal organ, performing over 500 functions. Uniquely, it can fully regenerate even if 70% is surgically removed.',
    functions:['Detoxifies drugs, alcohol, and metabolic waste','Produces bile for fat digestion','Synthesises blood clotting factors','Regulates blood glucose via glycogen','Makes albumin and essential blood proteins'],
    funFacts:['Can regenerate from just 30% of its tissue','Receives blood from two sources simultaneously','Generates significant body heat'],
  },
  {
    id:'stomach', name:'Stomach', latin:'Gaster', color:'#5A9A3C', emissiveColor:'#2A5A10',
    position:[-0.12,0.0,0.07], scale:[0.13,0.12,0.1], explodeOffset:[-0.75,-0.25,0.85],
    shape:'blob', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'A muscular J-shaped bag that churns food with acid at pH 1.5–3.5. Can expand from 75 mL empty to over 1 litre after a meal.',
    functions:['Mechanical churning of food into chyme','Secretes acid to sterilise food and activate enzymes','Begins protein digestion via pepsin','Controls food delivery rate to the intestine'],
    funFacts:['Stomach acid can dissolve certain metals','Its lining is replaced every 3–5 days to resist acid damage'],
  },
  {
    id:'left-kidney', name:'Left Kidney', latin:'Ren sinister', color:'#A0522D', emissiveColor:'#5A2008',
    position:[-0.24,-0.1,-0.07], scale:[0.08,0.13,0.08], explodeOffset:[-1.05,-0.55,-0.65],
    shape:'capsule', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'Bean-shaped filter that cleans the entire blood volume ~50 times per day, producing urine while precisely regulating electrolytes, pH, and blood pressure.',
    functions:['Filter waste and excess fluid from blood','Regulate sodium, potassium, and calcium balance','Produce erythropoietin to stimulate red blood cells','Activate vitamin D for bone health','Regulate blood pressure via renin–angiotensin'],
    funFacts:['Contains ~1 million nephrons (filtering units)','Filters ~180 litres of blood daily','A single kidney can fully compensate for two'],
  },
  {
    id:'right-kidney', name:'Right Kidney', latin:'Ren dexter', color:'#A0522D', emissiveColor:'#5A2008',
    position:[0.24,-0.1,-0.07], scale:[0.08,0.13,0.08], explodeOffset:[1.05,-0.55,-0.65],
    shape:'capsule', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'Sits slightly lower than the left kidney to accommodate the liver. Both kidneys maintain the body\'s precise chemical balance 24 hours a day.',
    functions:['Filter waste products from blood','Regulate electrolytes and blood pH','Produce erythropoietin','Activate vitamin D'],
    funFacts:['Sits lower due to the liver above it','Kidneys receive 25% of total cardiac output'],
  },
  {
    id:'intestines', name:'Small Intestine', latin:'Intestinum tenue', color:'#C89A3C', emissiveColor:'#7A5808',
    position:[0.02,-0.28,0.06], scale:[0.28,0.22,0.18], explodeOffset:[0,-1.25,0.95],
    shape:'torus', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'A 6–7 metre coiled tube where 90% of nutrient absorption occurs. Millions of tiny finger-like villi massively increase its absorptive surface area.',
    functions:['Absorbs 90% of nutrients — glucose, amino acids, fatty acids','Secretes digestive enzymes for carbohydrates, fats, proteins','Mixes food with bile and pancreatic enzymes','Delivers nutrients into blood and lymph'],
    funFacts:['6–7 metres long — longer than most rooms','Surface area with villi equals half a badminton court','Digestion takes 2–6 hours to complete'],
  },
];

const SYSTEMS: { id: Tab; label: string; color: string }[] = [
  { id:'FULL',        label:'All Systems',  color:'#22d3ee' },
  { id:'SKELETAL',    label:'Skeletal',     color:'#d4d4cc' },
  { id:'ORGANS',      label:'Organs',       color:'#f97316' },
  { id:'CIRCULATORY', label:'Circulatory',  color:'#ef4444' },
  { id:'NERVOUS',     label:'Nervous',      color:'#a78bfa' },
  { id:'RESPIRATORY', label:'Respiratory',  color:'#f9a8d4' },
];

// ─── Geometry Hook ──────────────────────────────────────────────────────────────

function useOrganGeometry(shape: OrganDef['shape']) {
  return useMemo(() => {
    if (shape === 'brain') {
      const geo = new THREE.SphereGeometry(1, 48, 48);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = Math.sin(x * 9 + 1.2) * Math.cos(y * 7 - 0.5) * Math.sin(z * 8 + 2.1) * 0.07
                + Math.sin(x * 15) * Math.cos(z * 12) * 0.025;
        const l = Math.sqrt(x * x + y * y + z * z) || 1;
        pos.setXYZ(i, x / l * (1 + n), y / l * (1 + n), z / l * (1 + n));
      }
      geo.computeVertexNormals();
      return geo;
    }
    if (shape === 'capsule') return new THREE.CapsuleGeometry(0.5, 1, 8, 16);
    if (shape === 'torus')   return new THREE.TorusGeometry(1, 0.38, 12, 48);
    return new THREE.SphereGeometry(1, 24, 24);
  }, [shape]);
}

// ─── Organ Mesh ─────────────────────────────────────────────────────────────────

function OrganMesh({ organ, isExploded, isSelected, isVisible, onClick }: {
  organ: OrganDef; isExploded: boolean; isSelected: boolean;
  isVisible: boolean; onClick: (o: OrganDef) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef   = useRef<THREE.MeshPhysicalMaterial>(null!);
  const [hovered, setHovered] = useState(false);
  const geo     = useOrganGeometry(organ.shape);
  const timeRef = useRef(Math.random() * 100);

  const restPos    = useMemo(() => new THREE.Vector3(...organ.position), [organ.position]);
  const explodePos = useMemo(() => new THREE.Vector3(
    organ.position[0] + organ.explodeOffset[0],
    organ.position[1] + organ.explodeOffset[1],
    organ.position[2] + organ.explodeOffset[2],
  ), [organ.position, organ.explodeOffset]);

  useFrame((_, delta) => {
    if (!groupRef.current || !matRef.current) return;
    timeRef.current += delta;
    const t = timeRef.current;
    groupRef.current.position.lerp(isExploded ? explodePos : restPos, 0.06);

    if (organ.animationType === 'pulse') {
      const s = 1 + Math.sin(t * 2.5) * 0.03;
      groupRef.current.scale.setScalar(s);
    } else if (organ.animationType === 'breathe') {
      const b = Math.sin(t * 0.75);
      groupRef.current.scale.set(1 - b * 0.018, 1 + b * 0.055, 1 - b * 0.018);
    } else if (organ.animationType === 'flow') {
      groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.18;
    }

    matRef.current.emissiveIntensity = (isSelected || hovered)
      ? 0.35 + Math.sin(t * 3.5) * 0.12
      : 0.08;
  });

  const meshScale: [number, number, number] = organ.shape === 'flat-sphere'
    ? [organ.scale[0], organ.scale[1] * 0.42, organ.scale[2]]
    : organ.scale;

  if (!isVisible) return null;

  return (
    <group ref={groupRef} position={restPos.toArray() as [number, number, number]}>
      <mesh
        geometry={geo}
        scale={meshScale}
        onClick={(e) => { e.stopPropagation(); onClick(organ); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <meshPhysicalMaterial
          ref={matRef}
          color={organ.color}
          emissive={organ.emissiveColor}
          emissiveIntensity={0.08}
          roughness={0.52}
          metalness={0}
          clearcoat={0.65}
          clearcoatRoughness={0.22}
        />
      </mesh>

      {(isSelected || hovered) && (
        <mesh geometry={geo} scale={meshScale.map(s => s * 1.07) as [number, number, number]}>
          <meshBasicMaterial color={organ.color} transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>
      )}

      {(isSelected || hovered) && (
        <Html center distanceFactor={5}
          position={[0, (meshScale[1] ?? 0.15) * 1.6, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(2,4,10,0.92)', border: `1px solid ${organ.color}60`,
            borderRadius: 6, padding: '3px 10px', color: organ.color,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            {organ.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Body Silhouette ────────────────────────────────────────────────────────────

function BodySilhouette({ gender }: { gender: Gender }) {
  const geo = useMemo(() => {
    const male: [number, number][] = [
      [0.0,-1.72],[0.12,-1.6],[0.17,-1.18],[0.14,-0.88],[0.19,-0.48],
      [0.26,-0.13],[0.21,0.16],[0.27,0.5],[0.30,0.76],[0.20,0.88],
      [0.11,0.99],[0.19,1.1],[0.23,1.28],[0.20,1.46],[0.0,1.56],
    ];
    const female: [number, number][] = [
      [0.0,-1.72],[0.13,-1.6],[0.18,-1.18],[0.15,-0.88],[0.24,-0.44],
      [0.30,-0.1],[0.18,0.19],[0.26,0.5],[0.28,0.76],[0.19,0.88],
      [0.11,0.99],[0.19,1.1],[0.22,1.28],[0.19,1.46],[0.0,1.56],
    ];
    return new THREE.LatheGeometry(
      (gender === 'FEMALE' ? female : male).map(([r, y]) => new THREE.Vector2(r, y)), 48
    );
  }, [gender]);

  return (
    <mesh geometry={geo}>
      <meshPhysicalMaterial color="#1e8aff" opacity={0.055} transparent roughness={0.9}
        side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ─── Skeleton Layer ─────────────────────────────────────────────────────────────

function SkeletonLayer() {
  const c = '#d0d0c6';
  return (
    <group>
      <mesh position={[0, 0.05, -0.05]}>
        <cylinderGeometry args={[0.018, 0.022, 1.55, 8]} />
        <meshStandardMaterial color={c} roughness={0.75} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const y = 0.22 + i * 0.095;
        const r = 0.23 - i * 0.013;
        return (
          <mesh key={i} position={[0, y, 0]}>
            <torusGeometry args={[r, 0.011, 6, 28, Math.PI]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
        );
      })}
      <mesh position={[0, -0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.23, 0.04, 8, 28, Math.PI * 1.6]} />
        <meshStandardMaterial color={c} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.28, 0]}>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshPhysicalMaterial color={c} roughness={0.85} opacity={0.35} transparent />
      </mesh>
    </group>
  );
}

// ─── Circulatory Layer ──────────────────────────────────────────────────────────

function CirculatoryLayer() {
  return (
    <group>
      <mesh position={[0, 0.22, 0.06]}>
        <cylinderGeometry args={[0.024, 0.024, 0.65, 8]} />
        <meshStandardMaterial color="#cc1122" roughness={0.45} />
      </mesh>
      {[[-0.18, 0.18, 0.06], [0.18, 0.18, 0.06], [-0.1, -0.3, 0.04], [0.1, -0.3, 0.04]].map(([x,y,z],i) => (
        <mesh key={i} position={[x,y,z]}>
          <cylinderGeometry args={[0.012, 0.012, 0.4, 6]} />
          <meshStandardMaterial color="#aa0011" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Main 3D Scene ──────────────────────────────────────────────────────────────

function BodyScene({ gender, systemTab, isExploded, selectedOrgan, onSelectOrgan }: {
  gender: Gender; systemTab: Tab; isExploded: boolean;
  selectedOrgan: OrganDef | null; onSelectOrgan: (o: OrganDef | null) => void;
}) {
  const visibleOrgans = useMemo(() =>
    ORGANS.filter(o =>
      o.genders.includes(gender) && o.systems.includes(systemTab)
    ), [gender, systemTab]);

  return (
    <>
      <color attach="background" args={['#010509']} />
      <ambientLight intensity={0.35} color="#1a2040" />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color="#ffffff" castShadow />
      <pointLight position={[-3, 2, 2]} intensity={1.8} color="#3366ff" />
      <pointLight position={[2, -2, 2]} intensity={0.6} color="#ff3322" />
      <pointLight position={[0, 3, -2]} intensity={0.5} color="#ffffff" />

      <BodySilhouette gender={gender} />
      {systemTab === 'SKELETAL'    && <SkeletonLayer />}
      {systemTab === 'CIRCULATORY' && <CirculatoryLayer />}

      {ORGANS.map(organ => (
        <OrganMesh
          key={organ.id}
          organ={organ}
          isExploded={isExploded}
          isSelected={selectedOrgan?.id === organ.id}
          isVisible={visibleOrgans.some(o => o.id === organ.id)}
          onClick={o => onSelectOrgan(selectedOrgan?.id === o.id ? null : o)}
        />
      ))}

      <OrbitControls
        enableDamping dampingFactor={0.05}
        minDistance={1.6} maxDistance={5.5}
        minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.88}
        target={[0, 0.2, 0]}
      />

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.55} radius={0.45} />
        <Vignette offset={0.38} darkness={0.52} />
      </EffectComposer>
    </>
  );
}

// ─── Organ Detail Panel ─────────────────────────────────────────────────────────

function OrganDetailPanel({ organ, onClose }: { organ: OrganDef; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('OVERVIEW');

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 200 }}
      className="absolute top-0 right-0 h-full w-[340px] flex flex-col z-30"
      style={{ background: 'rgba(2,4,12,0.94)', backdropFilter: 'blur(20px)', borderLeft: `1px solid ${organ.color}25` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-3" style={{ borderBottom: `1px solid ${organ.color}20` }}>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: organ.color }}>
            {organ.latin}
          </p>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">{organ.name}</h2>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full mt-1 transition-colors"
          style={{ background: `${organ.color}15`, color: organ.color }}>
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-3">
        {(['OVERVIEW','FUNCTIONS','FACTS'] as DetailTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
            style={{
              background: tab === t ? organ.color : `${organ.color}10`,
              color: tab === t ? '#000' : `${organ.color}90`,
            }}>
            {t === 'OVERVIEW' ? 'Overview' : t === 'FUNCTIONS' ? 'Functions' : 'Facts'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 scrollbar-thin" style={{ scrollbarColor: `${organ.color}30 transparent` }}>
        <AnimatePresence mode="wait">
          {tab === 'OVERVIEW' && (
            <motion.div key="ov" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}>
              {/* Animated dot representing organ */}
              <div className="flex justify-center my-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: `radial-gradient(circle, ${organ.color}40, ${organ.color}10)`, border: `2px solid ${organ.color}40` }}>
                  <div className="w-6 h-6 rounded-full animate-pulse" style={{ background: organ.color }} />
                </div>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">{organ.description}</p>
            </motion.div>
          )}
          {tab === 'FUNCTIONS' && (
            <motion.div key="fn" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}
              className="mt-2 flex flex-col gap-2">
              {organ.functions.map((f, i) => (
                <div key={i} className="flex gap-3 items-start p-3 rounded-lg"
                  style={{ background: `${organ.color}0C`, border: `1px solid ${organ.color}20` }}>
                  <ChevronRight size={12} className="mt-0.5 shrink-0" style={{ color: organ.color }} />
                  <p className="text-white/75 text-xs leading-relaxed">{f}</p>
                </div>
              ))}
            </motion.div>
          )}
          {tab === 'FACTS' && (
            <motion.div key="fc" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}
              className="mt-2 flex flex-col gap-3">
              {organ.funFacts.map((f, i) => (
                <div key={i} className="p-3 rounded-lg"
                  style={{ background: `${organ.color}0C`, border: `1px solid ${organ.color}25` }}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: organ.color }}>
                    Fact {String(i + 1).padStart(2, '0')}
                  </p>
                  <p className="text-white/75 text-xs leading-relaxed">{f}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Gender Select ──────────────────────────────────────────────────────────────

function GenderSelectScreen({ onSelect }: { onSelect: (g: Gender) => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative" style={{ background: '#010509' }}>
      {/* Grid bg */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center mb-12">
        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-cyan-400 mb-3">Classroom Module</p>
        <h1 className="text-4xl font-black uppercase tracking-tighter text-white mb-2">The Human Body</h1>
        <p className="text-white/40 text-sm tracking-widest uppercase">Select a body to explore</p>
      </motion.div>

      <div className="flex gap-8">
        {(['MALE', 'FEMALE'] as Gender[]).map((g, idx) => (
          <motion.button
            key={g}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + idx * 0.1 }}
            onClick={() => onSelect(g)}
            className="group flex flex-col items-center gap-4 p-8 rounded-3xl transition-all duration-300"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            {/* SVG body silhouette icon */}
            <svg width="80" height="160" viewBox="0 0 80 160" fill="none">
              {g === 'MALE' ? (
                <path d="M40 8 C50 8 56 16 56 24 C56 32 52 37 48 40 L52 55 C58 56 66 62 68 80 L62 82 L60 120 L52 120 L50 160 L30 160 L28 120 L20 120 L18 82 L12 80 C14 62 22 56 28 55 L32 40 C28 37 24 32 24 24 C24 16 30 8 40 8Z"
                  fill="rgba(34,211,238,0.15)" stroke="rgba(34,211,238,0.5)" strokeWidth="1" />
              ) : (
                <path d="M40 8 C49 8 55 16 55 24 C55 32 51 37 47 40 L52 56 C60 58 70 66 72 82 L64 84 L60 120 L52 120 L50 160 L30 160 L28 120 L20 120 L16 84 L8 82 C10 66 20 58 28 56 L33 40 C29 37 25 32 25 24 C25 16 31 8 40 8Z"
                  fill="rgba(244,160,184,0.15)" stroke="rgba(244,160,184,0.5)" strokeWidth="1" />
              )}
            </svg>
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.25em]"
                style={{ color: g === 'MALE' ? '#22d3ee' : '#f9a8d4' }}>
                {g === 'MALE' ? 'Male Body' : 'Female Body'}
              </p>
              <p className="text-[10px] text-white/30 mt-1">9 organs · 6 systems</p>
            </div>
          </motion.button>
        ))}
      </div>

      <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }}
        className="absolute bottom-8 text-[9px] font-bold uppercase tracking-[0.3em] text-white/20">
        Drag to rotate · Scroll to zoom · Click organs to explore
      </motion.p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function HumanBodyExperience({ onBack }: { onBack: () => void }) {
  const [phase,         setPhase]         = useState<Phase>('SELECT');
  const [gender,        setGender]        = useState<Gender>('MALE');
  const [systemTab,     setSystemTab]     = useState<Tab>('FULL');
  const [isExploded,    setIsExploded]    = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState<OrganDef | null>(null);

  const handleGenderSelect = (g: Gender) => {
    setGender(g);
    setPhase('BODY');
  };

  const activeSystem = SYSTEMS.find(s => s.id === systemTab)!;

  return (
    <div className="w-full h-screen relative overflow-hidden bg-[#010509] text-white">

      {/* Back Button — always visible */}
      <button onClick={onBack}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
        <ArrowLeft size={12} /> Back
      </button>

      <AnimatePresence mode="wait">
        {phase === 'SELECT' ? (
          <motion.div key="select" className="absolute inset-0" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <GenderSelectScreen onSelect={handleGenderSelect} />
          </motion.div>
        ) : (
          <motion.div key="body" className="absolute inset-0" initial={{ opacity:0 }} animate={{ opacity:1 }}>

            {/* 3D Canvas */}
            <Canvas
              camera={{ position: [0, 0.3, 3.4], fov: 45, near: 0.1, far: 100 }}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
              style={{ width: '100%', height: '100%' }}
            >
              <Suspense fallback={null}>
                <BodyScene
                  gender={gender}
                  systemTab={systemTab}
                  isExploded={isExploded}
                  selectedOrgan={selectedOrgan}
                  onSelectOrgan={setSelectedOrgan}
                />
              </Suspense>
            </Canvas>

            {/* System tab bar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex gap-1 p-1 rounded-2xl"
              style={{ background: 'rgba(2,4,12,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {SYSTEMS.map(s => (
                <button key={s.id} onClick={() => { setSystemTab(s.id); setSelectedOrgan(null); }}
                  className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  style={{
                    background: systemTab === s.id ? s.color : 'transparent',
                    color: systemTab === s.id ? '#000' : 'rgba(255,255,255,0.4)',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Controls — bottom left */}
            <div className="absolute bottom-6 left-6 z-40 flex flex-col gap-2">
              <button onClick={() => { setIsExploded(e => !e); setSelectedOrgan(null); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                style={{
                  background: isExploded ? activeSystem.color : 'rgba(2,4,12,0.85)',
                  color: isExploded ? '#000' : activeSystem.color,
                  border: `1px solid ${activeSystem.color}40`,
                  backdropFilter: 'blur(12px)',
                }}>
                <Layers size={12} />
                {isExploded ? 'Collapse' : 'Explode View'}
              </button>

              <button onClick={() => { setGender(g => g === 'MALE' ? 'FEMALE' : 'MALE'); setSelectedOrgan(null); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest"
                style={{ background: 'rgba(2,4,12,0.85)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}>
                <RotateCcw size={12} />
                {gender === 'MALE' ? 'Female Body' : 'Male Body'}
              </button>
            </div>

            {/* Hint — bottom right */}
            <div className="absolute bottom-6 right-6 z-40 flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.2)' }}>
              <Info size={11} />
              <p className="text-[9px] font-bold uppercase tracking-widest">Click organs to inspect</p>
            </div>

            {/* Organ detail panel */}
            <AnimatePresence>
              {selectedOrgan && (
                <OrganDetailPanel
                  key={selectedOrgan.id}
                  organ={selectedOrgan}
                  onClose={() => setSelectedOrgan(null)}
                />
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
