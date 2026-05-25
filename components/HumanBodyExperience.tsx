'use client';
import React, { useState, useRef, useMemo, Suspense, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, RotateCcw, Layers, X, ChevronRight, Info,
  Search, Trophy, CheckCircle2, XCircle, Zap,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Gender   = 'MALE' | 'FEMALE';
type Phase    = 'SELECT' | 'BODY';
type Tab      = 'FULL' | 'SKELETAL' | 'ORGANS' | 'CIRCULATORY' | 'NERVOUS' | 'RESPIRATORY';
type DetailTab = 'OVERVIEW' | 'FUNCTIONS' | 'FACTS';
type AppMode  = 'EXPLORE' | 'QUIZ';

interface OrganDef {
  id: string; name: string; latin: string;
  color: string; emissiveColor: string;
  position: [number, number, number];
  scale: [number, number, number];
  explodeOffset: [number, number, number];
  shape: 'brain' | 'capsule' | 'flat-sphere' | 'torus' | 'blob' | 'sphere';
  systems: Tab[]; genders: Gender[];
  animationType: 'pulse' | 'breathe' | 'neutral' | 'flow';
  description: string; functions: string[]; funFacts: string[];
}

// ─── Organ Data ─────────────────────────────────────────────────────────────────

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
  {
    id:'spleen', name:'Spleen', latin:'Splen', color:'#8B4069', emissiveColor:'#4A1535',
    position:[-0.28,0.06,0.0], scale:[0.10,0.12,0.08], explodeOffset:[-1.2,-0.1,0.6],
    shape:'flat-sphere', systems:['FULL','ORGANS','CIRCULATORY'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The spleen acts as a blood reservoir and immune outpost, filtering out old red blood cells and housing lymphocytes that fight infection — all while being the only organ that can increase in size during exercise.',
    functions:['Filters and destroys worn-out red blood cells','Stores platelets and white blood cells','Mounts immune responses to bloodborne pathogens','Recycles iron from haemoglobin','Acts as emergency blood reservoir'],
    funFacts:['You can live without a spleen (though with higher infection risk)','Stores up to 500 mL of blood','Can double in size during severe infection'],
  },
  {
    id:'pancreas', name:'Pancreas', latin:'Pancreas', color:'#E8B84B', emissiveColor:'#8A6010',
    position:[0.0,-0.06,-0.06], scale:[0.18,0.06,0.07], explodeOffset:[0.2,-0.8,0.5],
    shape:'flat-sphere', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'A dual-function organ: its exocrine cells secrete digestive enzymes into the intestine while its endocrine Islets of Langerhans release insulin and glucagon directly into the blood to regulate blood sugar.',
    functions:['Produces insulin to lower blood glucose','Produces glucagon to raise blood glucose','Secretes lipase, amylase, and protease for digestion','Neutralises stomach acid entering the intestine via bicarbonate'],
    funFacts:['Only 2% of pancreas cells (beta cells) produce insulin','Can produce up to 1.5 litres of digestive juice per day','Pancreatic cancer has low survival rates partly due to late detection'],
  },
  {
    id:'bladder', name:'Bladder', latin:'Vesica urinaria', color:'#4A9ACA', emissiveColor:'#1A4A7A',
    position:[0.0,-0.62,0.06], scale:[0.12,0.10,0.1], explodeOffset:[0,-1.5,0.9],
    shape:'blob', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'An elastic muscular sac that stores up to 500 mL of urine. Specialised umbrella cells allow it to stretch dramatically — signalling the brain via stretch receptors when it\'s time to void.',
    functions:['Stores urine produced by the kidneys','Signals fullness via stretch receptor nerves','Voluntarily expels urine via the urethra','Its mucosal lining resists bacterial adhesion'],
    funFacts:['Can expand from 50 mL to 500+ mL','The urge to urinate begins at ~150 mL','Adults produce 1–2 litres of urine per day'],
  },
  {
    id:'gallbladder', name:'Gallbladder', latin:'Vesica fellea', color:'#6DB56D', emissiveColor:'#2A5A2A',
    position:[0.22,-0.02,0.06], scale:[0.07,0.09,0.07], explodeOffset:[1.2,-0.3,0.8],
    shape:'blob', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'A small pear-shaped reservoir under the liver that concentrates and stores bile up to 5× its original concentration — releasing it via the bile duct when fat arrives in the intestine.',
    functions:['Concentrates and stores bile from the liver','Releases bile in response to dietary fat','Aids fat digestion and absorption of fat-soluble vitamins','Triggers the release of cholecystokinin hormone'],
    funFacts:['Can be removed with minimal long-term effects','Gallstones form in ~10-15% of adults','Bile is 97% water — the 3% remainder causes all the trouble'],
  },
];

const SYSTEMS: { id: Tab; label: string; color: string; description: string }[] = [
  { id:'FULL',        label:'All Systems',  color:'#22d3ee',  description:'View all organs together — the complete integrated machine.' },
  { id:'SKELETAL',    label:'Skeletal',     color:'#d4d4cc',  description:'206 bones form the structural framework, protecting organs and enabling movement.' },
  { id:'ORGANS',      label:'Organs',       color:'#f97316',  description:'Specialised structures each performing critical chemical and mechanical functions.' },
  { id:'CIRCULATORY', label:'Circulatory',  color:'#ef4444',  description:'Heart + 100,000 km of blood vessels delivering oxygen and nutrients to every cell.' },
  { id:'NERVOUS',     label:'Nervous',      color:'#a78bfa',  description:'86 billion neurons forming the body\'s electrical network — sensing, deciding, and commanding.' },
  { id:'RESPIRATORY', label:'Respiratory',  color:'#f9a8d4',  description:'Lungs + airways — exchanging 22,000 breaths per day to keep every cell alive.' },
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
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;
    // Subtle breathing: expand chest slightly
    const b = Math.sin(timeRef.current * 0.75) * 0.008;
    meshRef.current.scale.set(1 + b, 1, 1 + b * 0.5);
  });

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
    <mesh ref={meshRef} geometry={geo}>
      <meshPhysicalMaterial color="#1e8aff" opacity={0.055} transparent roughness={0.9}
        side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ─── Skeleton Layer ─────────────────────────────────────────────────────────────

function SkeletonLayer() {
  const c = '#d0d0c6';
  const mat = <meshStandardMaterial color={c} roughness={0.75} />;

  // Rib pairs: [y, radiusX, radiusZ]
  const ribs: [number, number, number][] = [
    [0.70, 0.26, 0.12],[0.62, 0.27, 0.13],[0.53, 0.265, 0.13],
    [0.45, 0.255, 0.12],[0.37, 0.240, 0.115],[0.28, 0.220, 0.11],
  ];

  return (
    <group>
      {/* Spine */}
      <mesh position={[0, 0.05, -0.055]}>
        <cylinderGeometry args={[0.018, 0.022, 1.55, 8]} />
        {mat}
      </mesh>

      {/* Skull */}
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.215, 20, 16]} />
        <meshPhysicalMaterial color={c} roughness={0.85} opacity={0.4} transparent />
      </mesh>

      {/* Jaw */}
      <mesh position={[0, 1.11, 0.06]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.17, 0.055, 0.1]} />
        <meshStandardMaterial color={c} roughness={0.8} opacity={0.5} transparent />
      </mesh>

      {/* Clavicles */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * 0.14, 0.99, 0.04]} rotation={[0, 0, side * 0.45]}>
          <cylinderGeometry args={[0.012, 0.012, 0.22, 6]} />
          {mat}
        </mesh>
      ))}

      {/* Rib cage */}
      {ribs.map(([y, rx, rz], i) => (
        <React.Fragment key={i}>
          {/* Left rib */}
          <mesh position={[-rx * 0.5, y, 0]} rotation={[0, 0, -0.55 + i * 0.04]}>
            <torusGeometry args={[rx * 0.72, 0.009, 6, 28, Math.PI * 0.9]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
          {/* Right rib */}
          <mesh position={[rx * 0.5, y, 0]} rotation={[0, Math.PI, 0.55 - i * 0.04]}>
            <torusGeometry args={[rx * 0.72, 0.009, 6, 28, Math.PI * 0.9]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
        </React.Fragment>
      ))}

      {/* Sternum */}
      <mesh position={[0, 0.5, 0.09]}>
        <boxGeometry args={[0.04, 0.52, 0.025]} />
        {mat}
      </mesh>

      {/* Pelvis */}
      <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.045, 8, 32, Math.PI * 1.7]} />
        <meshStandardMaterial color={c} roughness={0.8} />
      </mesh>

      {/* Shoulder blades stub */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * 0.22, 0.75, -0.07]} rotation={[0, side * 0.2, 0]}>
          <boxGeometry args={[0.09, 0.14, 0.025]} />
          <meshStandardMaterial color={c} roughness={0.8} opacity={0.6} transparent />
        </mesh>
      ))}

      {/* Upper arm stubs */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * 0.32, 0.65, 0]} rotation={[0, 0, side * 0.3]}>
          <cylinderGeometry args={[0.025, 0.022, 0.36, 8]} />
          {mat}
        </mesh>
      ))}

      {/* Upper leg stubs */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * 0.1, -0.85, 0]} rotation={[0, 0, side * 0.08]}>
          <cylinderGeometry args={[0.036, 0.030, 0.50, 8]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

// ─── Circulatory Layer ──────────────────────────────────────────────────────────

function CirculatoryLayer() {
  const c = '#cc1122';
  return (
    <group>
      {/* Aorta */}
      <mesh position={[0, 0.30, 0.06]}>
        <cylinderGeometry args={[0.026, 0.022, 0.75, 8]} />
        <meshStandardMaterial color={c} roughness={0.45} />
      </mesh>

      {/* Pulmonary vessels */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.13, 0.48, 0.04]} rotation={[0, 0, side * 0.7]}>
          <cylinderGeometry args={[0.013, 0.013, 0.22, 6]} />
          <meshStandardMaterial color="#dd4466" roughness={0.5} />
        </mesh>
      ))}

      {/* Abdominal aorta branches */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.11, 0.05, 0.02]} rotation={[0, 0, side * 0.55]}>
          <cylinderGeometry args={[0.011, 0.011, 0.26, 6]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}

      {/* Iliac vessels */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.09, -0.42, 0.02]} rotation={[0, 0, side * 0.35]}>
          <cylinderGeometry args={[0.013, 0.013, 0.38, 6]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}

      {/* Superior vena cava */}
      <mesh position={[0.04, 0.62, 0.05]}>
        <cylinderGeometry args={[0.018, 0.018, 0.22, 6]} />
        <meshStandardMaterial color="#2244aa" roughness={0.45} />
      </mesh>

      {/* Jugular veins */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.065, 0.92, 0.03]} rotation={[0, 0, side * 0.15]}>
          <cylinderGeometry args={[0.009, 0.009, 0.26, 6]} />
          <meshStandardMaterial color="#2244aa" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Nervous Layer ──────────────────────────────────────────────────────────────

function NervousLayer() {
  const c = '#a78bfa';
  const timeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (groupRef.current) {
      // Subtle pulse along the spine
      groupRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = 0.15 + Math.sin(timeRef.current * 2.0 + i * 0.4) * 0.1;
        }
      });
    }
  });

  const nerveMat = (
    <meshStandardMaterial color={c} emissive="#5a3fb0" emissiveIntensity={0.2} roughness={0.3} />
  );

  return (
    <group ref={groupRef}>
      {/* Spinal cord */}
      <mesh position={[0, 0.18, -0.04]}>
        <cylinderGeometry args={[0.013, 0.013, 1.25, 8]} />
        {nerveMat}
      </mesh>

      {/* Cervical plexus (neck) */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.055, 0.98, 0.0]} rotation={[0, 0, side * 1.1]}>
          <cylinderGeometry args={[0.006, 0.006, 0.18, 6]} />
          {nerveMat}
        </mesh>
      ))}

      {/* Brachial plexus — arm nerves */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.18, 0.72, 0.0]} rotation={[0.1, 0, side * 0.85]}>
          <cylinderGeometry args={[0.007, 0.007, 0.32, 6]} />
          {nerveMat}
        </mesh>
      ))}

      {/* Intercostal nerves */}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = 0.65 - i * 0.14;
        return ([-1, 1] as const).map((side, j) => (
          <mesh key={`${i}-${j}`} position={[side * 0.12, y, 0.0]} rotation={[0, 0, side * 1.3]}>
            <cylinderGeometry args={[0.005, 0.005, 0.22, 5]} />
            {nerveMat}
          </mesh>
        ));
      })}

      {/* Lumbar plexus */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.10, -0.35, 0.0]} rotation={[0, 0, side * 0.7]}>
          <cylinderGeometry args={[0.007, 0.007, 0.26, 6]} />
          {nerveMat}
        </mesh>
      ))}

      {/* Sciatic nerves */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.09, -0.68, -0.03]} rotation={[0.1, 0, side * 0.2]}>
          <cylinderGeometry args={[0.009, 0.007, 0.50, 6]} />
          {nerveMat}
        </mesh>
      ))}

      {/* Brain stem */}
      <mesh position={[0, 1.06, 0.0]}>
        <cylinderGeometry args={[0.028, 0.020, 0.16, 8]} />
        {nerveMat}
      </mesh>
    </group>
  );
}

// ─── Respiratory Layer ───────────────────────────────────────────────────────────

function RespiratoryLayer() {
  const timeRef = useRef(0);
  const diaphRef = useRef<THREE.Mesh>(null);
  const tracheaRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const b = Math.sin(timeRef.current * 0.75);
    if (diaphRef.current) {
      diaphRef.current.position.y = -0.07 + b * 0.025;
    }
    if (tracheaRef.current) {
      tracheaRef.current.scale.y = 1 + b * 0.01;
    }
  });

  return (
    <group>
      {/* Trachea */}
      <mesh ref={tracheaRef} position={[0, 0.78, 0.04]}>
        <cylinderGeometry args={[0.022, 0.022, 0.30, 10]} />
        <meshStandardMaterial color="#f9a8d4" roughness={0.5} opacity={0.7} transparent />
      </mesh>

      {/* Bronchi — left */}
      <mesh position={[-0.10, 0.62, 0.04]} rotation={[0, 0, 0.7]}>
        <cylinderGeometry args={[0.016, 0.016, 0.18, 8]} />
        <meshStandardMaterial color="#f4a0b8" roughness={0.5} opacity={0.7} transparent />
      </mesh>

      {/* Bronchi — right */}
      <mesh position={[0.10, 0.62, 0.04]} rotation={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.016, 0.016, 0.18, 8]} />
        <meshStandardMaterial color="#f4a0b8" roughness={0.5} opacity={0.7} transparent />
      </mesh>

      {/* Diaphragm */}
      <mesh ref={diaphRef} position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.028, 6, 32, Math.PI * 2]} />
        <meshStandardMaterial color="#f9a8d4" roughness={0.6} opacity={0.5} transparent />
      </mesh>
    </group>
  );
}

// ─── Main 3D Scene ──────────────────────────────────────────────────────────────

function BodyScene({ gender, systemTab, isExploded, selectedOrgan, onSelectOrgan }: {
  gender: Gender; systemTab: Tab; isExploded: boolean;
  selectedOrgan: OrganDef | null; onSelectOrgan: (o: OrganDef | null) => void;
}) {
  const visibleOrgans = useMemo(() =>
    ORGANS.filter(o => o.genders.includes(gender) && o.systems.includes(systemTab)),
    [gender, systemTab]
  );

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
      {systemTab === 'NERVOUS'     && <NervousLayer />}
      {systemTab === 'RESPIRATORY' && <RespiratoryLayer />}

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

      <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth: 'thin', scrollbarColor: `${organ.color}30 transparent` }}>
        <AnimatePresence mode="wait">
          {tab === 'OVERVIEW' && (
            <motion.div key="ov" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}>
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

// ─── System Overview Card ────────────────────────────────────────────────────────

function SystemOverviewCard({ system, organCount }: { system: typeof SYSTEMS[0]; organCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-20 right-6 w-64 rounded-2xl p-4 z-30"
      style={{
        background: 'rgba(2,4,12,0.88)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${system.color}25`,
      }}
    >
      <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: system.color }}>
        Active System
      </p>
      <p className="text-white font-black text-sm mb-2">{system.label}</p>
      <p className="text-white/55 text-[11px] leading-relaxed mb-3">{system.description}</p>
      {organCount > 0 && (
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: system.color }}>
          {organCount} organ{organCount !== 1 ? 's' : ''} in view · Click to inspect
        </p>
      )}
    </motion.div>
  );
}

// ─── Quiz Mode ──────────────────────────────────────────────────────────────────

function QuizMode({ onExit }: { onExit: () => void }) {
  const questions = useMemo(() => {
    const all = ORGANS.map(o => ({
      organ: o,
      // Generate 3 wrong answer choices from other organs
      choices: [o.name, ...ORGANS.filter(x => x.id !== o.id)
        .sort(() => Math.random() - 0.5).slice(0, 3).map(x => x.name)]
        .sort(() => Math.random() - 0.5),
      clue: o.funFacts[0] ?? o.description.slice(0, 80) + '…',
    }));
    return all.sort(() => Math.random() - 0.5).slice(0, 8);
  }, []);

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = questions[idx];

  const handleAnswer = useCallback((choice: string) => {
    if (selected) return;
    setSelected(choice);
    if (choice === q.organ.name) setScore(s => s + 1);
    setTimeout(() => {
      if (idx + 1 >= questions.length) { setDone(true); }
      else { setIdx(i => i + 1); setSelected(null); }
    }, 1200);
  }, [selected, q, idx, questions.length]);

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-50"
        style={{ background: 'rgba(1,5,9,0.97)', backdropFilter: 'blur(20px)' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-5 text-center max-w-sm px-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: pct >= 70 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `2px solid ${pct >= 70 ? '#22c55e' : '#ef4444'}` }}>
            <Trophy size={32} className={pct >= 70 ? 'text-green-400' : 'text-red-400'} />
          </div>
          <div>
            <p className="text-4xl font-black text-white mb-1">{score}/{questions.length}</p>
            <p className="text-white/50 text-sm">{pct}% correct</p>
          </div>
          <p className="text-white/70 text-sm">
            {pct >= 90 ? 'Excellent! You know the human body well.' :
             pct >= 70 ? 'Good work! A few more to master.' :
             'Keep exploring — click organs to learn their facts.'}
          </p>
          <div className="flex gap-3">
            <button onClick={onExit}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/60"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              Back to Explorer
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 px-6"
      style={{ background: 'rgba(1,5,9,0.97)', backdropFilter: 'blur(20px)' }}>
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <button onClick={onExit} className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase tracking-widest">
          <ArrowLeft size={12} /> Exit Quiz
        </button>
        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs font-bold uppercase tracking-widest">
            {idx + 1} / {questions.length}
          </span>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full"
                style={{ background: i < idx ? '#22c55e' : i === idx ? '#FF8C00' : 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
            <Zap size={12} /> {score}
          </div>
        </div>
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flex flex-col items-center gap-5">
        {/* Organ indicator dot */}
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `radial-gradient(circle, ${q.organ.color}30, transparent)`, border: `2px solid ${q.organ.color}40` }}>
          <div className="w-5 h-5 rounded-full animate-pulse" style={{ background: q.organ.color }} />
        </div>

        <div className="text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-3">Identify the organ</p>
          <p className="text-white/80 text-sm leading-relaxed text-center max-w-xs">"{q.clue}"</p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full">
          {q.choices.map(choice => {
            const isCorrect = choice === q.organ.name;
            const isSelected = choice === selected;
            let bg = 'rgba(255,255,255,0.05)';
            let border = '1px solid rgba(255,255,255,0.1)';
            let textColor = 'rgba(255,255,255,0.7)';
            if (selected) {
              if (isCorrect) { bg = 'rgba(34,197,94,0.15)'; border = '1px solid rgba(34,197,94,0.4)'; textColor = '#22c55e'; }
              else if (isSelected) { bg = 'rgba(239,68,68,0.15)'; border = '1px solid rgba(239,68,68,0.4)'; textColor = '#ef4444'; }
            }
            return (
              <motion.button key={choice} onClick={() => handleAnswer(choice)}
                className="py-3 px-4 rounded-xl text-xs font-bold text-left transition-all flex items-center justify-between"
                style={{ background: bg, border, color: textColor }}
                whileTap={{ scale: 0.97 }}>
                <span>{choice}</span>
                {selected && isCorrect && <CheckCircle2 size={13} />}
                {selected && isSelected && !isCorrect && <XCircle size={13} />}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Search Panel ────────────────────────────────────────────────────────────────

function SearchPanel({ onSelect, onClose }: { onSelect: (o: OrganDef) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const results = ORGANS.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    o.latin.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 w-72 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(2,4,12,0.96)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Search size={13} className="text-white/40 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search organs…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        <button onClick={onClose}><X size={13} className="text-white/30" /></button>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {results.map(o => (
          <button key={o.id} onClick={() => { onSelect(o); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
            <div className="w-5 h-5 rounded-full shrink-0" style={{ background: `radial-gradient(circle, ${o.color}60, ${o.color}20)` }} />
            <div>
              <p className="text-white text-sm font-semibold">{o.name}</p>
              <p className="text-white/35 text-[10px]">{o.latin}</p>
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <p className="text-white/30 text-xs text-center py-6">No organs found</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Gender Select ──────────────────────────────────────────────────────────────

function GenderSelectScreen({ onSelect }: { onSelect: (g: Gender) => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative" style={{ background: '#010509' }}>
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
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
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
              <p className="text-[10px] text-white/30 mt-1">13 organs · 6 systems</p>
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
  const [appMode,       setAppMode]       = useState<AppMode>('EXPLORE');
  const [showSearch,    setShowSearch]    = useState(false);

  const activeSystem = SYSTEMS.find(s => s.id === systemTab)!;
  const visibleOrganCount = ORGANS.filter(o =>
    o.genders.includes(gender) && o.systems.includes(systemTab)
  ).length;

  const handleOrganSelect = useCallback((o: OrganDef | null) => {
    setSelectedOrgan(o);
    setShowSearch(false);
  }, []);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-[#010509] text-white">

      {/* Back Button */}
      <button onClick={onBack}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
        <ArrowLeft size={12} /> Back
      </button>

      <AnimatePresence mode="wait">
        {phase === 'SELECT' ? (
          <motion.div key="select" className="absolute inset-0" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <GenderSelectScreen onSelect={g => { setGender(g); setPhase('BODY'); }} />
          </motion.div>
        ) : (
          <motion.div key="body" className="absolute inset-0" initial={{ opacity:0 }} animate={{ opacity:1 }}>

            {/* Quiz mode overlay */}
            <AnimatePresence>
              {appMode === 'QUIZ' && (
                <QuizMode onExit={() => setAppMode('EXPLORE')} />
              )}
            </AnimatePresence>

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
                  onSelectOrgan={handleOrganSelect}
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

            {/* Search */}
            <button
              onClick={() => setShowSearch(s => !s)}
              className="absolute top-4 right-4 z-40 w-9 h-9 flex items-center justify-center rounded-xl transition-all"
              style={{ background: 'rgba(2,4,12,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
              <Search size={14} />
            </button>

            <AnimatePresence>
              {showSearch && (
                <SearchPanel
                  onSelect={o => { handleOrganSelect(o); }}
                  onClose={() => setShowSearch(false)}
                />
              )}
            </AnimatePresence>

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

              <button
                onClick={() => { setAppMode('QUIZ'); setSelectedOrgan(null); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                style={{ background: 'rgba(2,4,12,0.85)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', backdropFilter: 'blur(12px)' }}>
                <Trophy size={12} /> Quiz Mode
              </button>
            </div>

            {/* System overview (when no organ selected) */}
            <AnimatePresence>
              {!selectedOrgan && !showSearch && (
                <SystemOverviewCard system={activeSystem} organCount={visibleOrganCount} />
              )}
            </AnimatePresence>

            {/* Hint */}
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
