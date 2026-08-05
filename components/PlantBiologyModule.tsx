import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Sparkles, Search, BookOpen, Feather } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generatePlantInsight } from '../services/geminiService';

interface PlantBiologyModuleProps {
  onBack: () => void;
}

type Section = 'LEAF_STRUCTURE' | 'PLANT_CELL' | 'PHOTOSYNTHESIS' | 'TRANSPORT' | 'AI_INSIGHT';

// ── Sepia / aged-paper palette ────────────────────────────────────────────────
const C = {
  paper:    '#F2E8D5',
  paperDark:'#E0CFA8',
  ink:      '#1C1208',
  inkFade:  '#3A2A12',
  sepia:    '#7B4F1E',
  green:    '#3B6B30',
  greenFade:'#5A8C4E',
  amber:    '#A0611A',
  red:      '#8B2B2B',
  blue:     '#2B4A8B',
  border:   '#C4A46B',
};

// ── SVG leaf cross-section (factually accurate) ───────────────────────────────
const LeafCrossSection: React.FC<{ selectedPart: string | null; onSelect: (id: string) => void }> = ({ selectedPart, onSelect }) => {
  const w = 560, h = 380;

  const layers = [
    { id: 'cuticle',   y: 38,  h: 8,  fill: 'rgba(180,160,80,0.35)', stroke: C.amber,   label: 'Waxy Cuticle',        lx: 420, ly: 28 },
    { id: 'upper_epi', y: 46,  h: 22, fill: 'rgba(220,200,140,0.4)', stroke: C.inkFade,  label: 'Upper Epidermis',     lx: 420, ly: 55 },
    { id: 'palisade',  y: 68,  h: 90, fill: 'rgba(100,160,80,0.18)', stroke: C.green,    label: 'Palisade Mesophyll',  lx: 420, ly: 108 },
    { id: 'spongy',    y: 158, h: 80, fill: 'rgba(130,180,100,0.12)', stroke: C.greenFade,label: 'Spongy Mesophyll',   lx: 420, ly: 196 },
    { id: 'lower_epi', y: 238, h: 22, fill: 'rgba(220,200,140,0.4)', stroke: C.inkFade,  label: 'Lower Epidermis',    lx: 420, ly: 248 },
    { id: 'cuticle2',  y: 260, h: 8,  fill: 'rgba(180,160,80,0.35)', stroke: C.amber,   label: 'Lower Cuticle',       lx: 420, ly: 272 },
  ];

  const vascular = { x: 240, y: 175, w: 80, h: 40 };

  const palisadeCells = Array.from({ length: 9 }, (_, i) => ({
    x: 60 + i * 50,
    y: 68,
    w: 38,
    h: 90,
    chloroplasts: Array.from({ length: 6 }, (_, j) => ({
      cx: 60 + i * 50 + 10 + (j % 2) * 18,
      cy: 78 + Math.floor(j / 2) * 28,
    })),
  }));

  const spongyCells = [
    { cx: 90,  cy: 196, rx: 22, ry: 17 },
    { cx: 150, cy: 188, rx: 18, ry: 14 },
    { cx: 200, cy: 202, rx: 20, ry: 16 },
    { cx: 310, cy: 190, rx: 21, ry: 15 },
    { cx: 370, cy: 200, rx: 19, ry: 17 },
    { cx: 430, cy: 192, rx: 20, ry: 14 },
    { cx: 110, cy: 222, rx: 16, ry: 14 },
    { cx: 175, cy: 218, rx: 22, ry: 15 },
    { cx: 340, cy: 220, rx: 18, ry: 16 },
    { cx: 400, cy: 215, rx: 20, ry: 13 },
  ];

  const stomata = [
    { x: 120, y: 268 }, { x: 250, y: 270 }, { x: 380, y: 266 },
  ];

  return (
    <svg viewBox={`0 0 ${w} ${h + 60}`} className="w-full" style={{ fontFamily: 'Georgia, serif' }}>
      {/* Hatching pattern */}
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.amber} strokeWidth="0.4" strokeOpacity="0.3" />
        </pattern>
        <pattern id="greenHatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(30)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={C.green} strokeWidth="0.4" strokeOpacity="0.25" />
        </pattern>
        <filter id="inkShadow">
          <feDropShadow dx="1" dy="1" stdDeviation="1" floodColor={C.ink} floodOpacity="0.3" />
        </filter>
      </defs>

      {/* ── Layers ── */}
      {layers.map(l => (
        <g key={l.id} onClick={() => onSelect(l.id)} style={{ cursor: 'pointer' }}>
          <rect x={50} y={l.y} width={560 - 100} height={l.h}
            fill={selectedPart === l.id ? 'rgba(160,97,26,0.2)' : l.fill}
            stroke={l.stroke} strokeWidth={selectedPart === l.id ? 1.5 : 0.8} />
        </g>
      ))}

      {/* ── Palisade cells (columnar, tightly packed) ── */}
      {palisadeCells.map((cell, i) => (
        <g key={i} onClick={() => onSelect('palisade')} style={{ cursor: 'pointer' }}>
          <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h}
            fill="none" stroke={C.green} strokeWidth="0.7" />
          {cell.chloroplasts.map((cp, j) => (
            <ellipse key={j} cx={cp.cx} cy={cp.cy} rx="6" ry="3.5"
              fill={C.green} fillOpacity="0.7" stroke={C.green} strokeWidth="0.3" />
          ))}
        </g>
      ))}

      {/* ── Spongy mesophyll cells (irregular, air spaces between) ── */}
      {spongyCells.map((cell, i) => (
        <ellipse key={i} cx={cell.cx} cy={cell.cy} rx={cell.rx} ry={cell.ry}
          fill="rgba(120,170,90,0.15)" stroke={C.greenFade} strokeWidth="0.8"
          onClick={() => onSelect('spongy')} style={{ cursor: 'pointer' }} />
      ))}

      {/* ── Vascular bundle (midrib) ── */}
      <g onClick={() => onSelect('xylem')} style={{ cursor: 'pointer' }}>
        <rect x={vascular.x} y={vascular.y} width={vascular.w} height={vascular.h / 2}
          fill="rgba(43,74,139,0.25)" stroke={C.blue} strokeWidth="1" />
        <text x={vascular.x + vascular.w / 2} y={vascular.y + 11} textAnchor="middle"
          fontSize="7" fill={C.blue} fontWeight="bold">XYLEM</text>
      </g>
      <g onClick={() => onSelect('phloem')} style={{ cursor: 'pointer' }}>
        <rect x={vascular.x} y={vascular.y + vascular.h / 2} width={vascular.w} height={vascular.h / 2}
          fill="rgba(139,43,43,0.22)" stroke={C.red} strokeWidth="1" />
        <text x={vascular.x + vascular.w / 2} y={vascular.y + vascular.h / 2 + 11} textAnchor="middle"
          fontSize="7" fill={C.red} fontWeight="bold">PHLOEM</text>
      </g>
      {/* Bundle sheath */}
      <ellipse cx={vascular.x + vascular.w / 2} cy={vascular.y + vascular.h / 2}
        rx={vascular.w / 2 + 8} ry={vascular.h / 2 + 8}
        fill="none" stroke={C.sepia} strokeWidth="1" strokeDasharray="3,2" />

      {/* ── Stomata ── */}
      {stomata.map((s, i) => (
        <g key={i} onClick={() => onSelect('stomata')} style={{ cursor: 'pointer' }}>
          <ellipse cx={s.x} cy={s.y} rx="16" ry="7" fill="rgba(0,0,0,0.08)" stroke={C.inkFade} strokeWidth="0.8" />
          <ellipse cx={s.x - 8} cy={s.y} rx="5" ry="4" fill="rgba(80,130,60,0.5)" stroke={C.green} strokeWidth="0.7" />
          <ellipse cx={s.x + 8} cy={s.y} rx="5" ry="4" fill="rgba(80,130,60,0.5)" stroke={C.green} strokeWidth="0.7" />
          <text x={s.x} y={s.y + 18} textAnchor="middle" fontSize="5.5" fill={C.inkFade} fontStyle="italic">stoma</text>
        </g>
      ))}

      {/* ── Annotation lines ── */}
      {[
        { from: [50, 42], to: [44, 30], label: 'Cuticle', id: 'cuticle' },
        { from: [50, 57], to: [44, 57], label: 'Upper Epidermis', id: 'upper_epi' },
        { from: [50, 113], to: [44, 113], label: 'Palisade Mesophyll', id: 'palisade' },
        { from: [50, 198], to: [44, 198], label: 'Spongy Mesophyll', id: 'spongy' },
        { from: [50, 249], to: [44, 249], label: 'Lower Epidermis', id: 'lower_epi' },
        { from: [50, 268], to: [44, 268], label: 'Stomata', id: 'stomata' },
        { from: [vascular.x, vascular.y + 10], to: [vascular.x - 8, vascular.y + 10], label: 'Xylem', id: 'xylem' },
        { from: [vascular.x, vascular.y + 30], to: [vascular.x - 8, vascular.y + 30], label: 'Phloem', id: 'phloem' },
      ].map((ann, i) => (
        <g key={i} onClick={() => onSelect(ann.id)} style={{ cursor: 'pointer', opacity: selectedPart === ann.id ? 1 : 0.55 }}>
          <line x1={ann.from[0]} y1={ann.from[1]} x2={ann.to[0]} y2={ann.to[1]}
            stroke={C.inkFade} strokeWidth="0.7" />
          <text x={ann.to[0] - 3} y={ann.to[1] + 3} textAnchor="end" fontSize="8" fill={C.ink} fontStyle="italic">
            {ann.label}
          </text>
        </g>
      ))}

      {/* ── Scale bar ── */}
      <g transform={`translate(50,${h + 20})`}>
        <line x1="0" y1="0" x2="50" y2="0" stroke={C.inkFade} strokeWidth="1" />
        <line x1="0" y1="-5" x2="0" y2="5" stroke={C.inkFade} strokeWidth="1" />
        <line x1="50" y1="-5" x2="50" y2="5" stroke={C.inkFade} strokeWidth="1" />
        <text x="25" y="15" textAnchor="middle" fontSize="8" fill={C.inkFade} fontStyle="italic">50 µm</text>
      </g>

      {/* ── Title ── */}
      <text x={w / 2} y={h + 48} textAnchor="middle" fontSize="10" fill={C.inkFade} fontStyle="italic">
        Fig. I — Transverse section of a Dicotyledon leaf (Magnolia sp.)
      </text>
    </svg>
  );
};

// ── SVG Plant cell diagram ────────────────────────────────────────────────────
const PlantCellDiagram: React.FC<{ selectedPart: string | null; onSelect: (id: string) => void }> = ({ selectedPart, onSelect }) => {
  return (
    <svg viewBox="0 0 500 420" className="w-full" style={{ fontFamily: 'Georgia, serif' }}>
      <defs>
        <radialGradient id="vacGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(100,160,220,0.15)" />
          <stop offset="100%" stopColor="rgba(60,120,180,0.08)" />
        </radialGradient>
      </defs>

      {/* Cell wall */}
      <rect x="60" y="30" width="380" height="360" rx="40" ry="40"
        fill="rgba(160,100,30,0.12)" stroke={C.amber} strokeWidth="10"
        onClick={() => onSelect('wall')} style={{ cursor: 'pointer' }} />
      {/* Cell membrane (inside wall) */}
      <rect x="72" y="42" width="356" height="336" rx="34" ry="34"
        fill="none" stroke={C.sepia} strokeWidth="1.5" strokeDasharray="4,3"
        onClick={() => onSelect('membrane')} style={{ cursor: 'pointer' }} />

      {/* Cytoplasm fill */}
      <rect x="74" y="44" width="352" height="332" rx="33" ry="33"
        fill="rgba(230,220,190,0.2)" />

      {/* Large central vacuole */}
      <ellipse cx="250" cy="215" rx="130" ry="110"
        fill="url(#vacGrad)" stroke="#5B8EC4" strokeWidth="1.2"
        onClick={() => onSelect('vacuole')} style={{ cursor: 'pointer' }} />
      <text x="250" y="210" textAnchor="middle" fontSize="8" fill={C.blue} fontStyle="italic">Central</text>
      <text x="250" y="222" textAnchor="middle" fontSize="8" fill={C.blue} fontStyle="italic">Vacuole</text>

      {/* Nucleus */}
      <ellipse cx="150" cy="120" rx="42" ry="32"
        fill="rgba(139,43,43,0.15)" stroke={C.red} strokeWidth="1.5"
        onClick={() => onSelect('nucleus')} style={{ cursor: 'pointer' }} />
      <ellipse cx="150" cy="120" rx="16" ry="12"
        fill="rgba(139,43,43,0.3)" stroke={C.red} strokeWidth="0.8" />
      <text x="150" y="163" textAnchor="middle" fontSize="8" fill={C.red} fontStyle="italic">Nucleus</text>

      {/* Chloroplasts */}
      {[
        { cx: 115, cy: 290 }, { cx: 160, cy: 310 }, { cx: 100, cy: 240 },
        { cx: 360, cy: 280 }, { cx: 390, cy: 200 }, { cx: 355, cy: 340 },
        { cx: 420, cy: 130 }, { cx: 100, cy: 170 },
      ].map((cp, i) => (
        <g key={i} onClick={() => onSelect('chloroplast')} style={{ cursor: 'pointer' }}>
          <ellipse cx={cp.cx} cy={cp.cy} rx="22" ry="14"
            fill="rgba(60,120,60,0.4)" stroke={C.green} strokeWidth="1" />
          {/* Thylakoid stacks (grana) */}
          {[-6, 0, 6].map((dx, j) => (
            <rect key={j} x={cp.cx + dx - 2} y={cp.cy - 6} width="4" height="12"
              fill="rgba(40,100,40,0.6)" />
          ))}
        </g>
      ))}

      {/* Mitochondria */}
      {[{ cx: 390, cy: 320 }, { cx: 120, cy: 355 }].map((m, i) => (
        <g key={i} onClick={() => onSelect('mitochondria')} style={{ cursor: 'pointer' }}>
          <ellipse cx={m.cx} cy={m.cy} rx="20" ry="12"
            fill="rgba(180,80,30,0.2)" stroke={C.sepia} strokeWidth="1" />
          <path d={`M ${m.cx - 10} ${m.cy} Q ${m.cx} ${m.cy - 8} ${m.cx + 10} ${m.cy}`}
            fill="none" stroke={C.sepia} strokeWidth="0.7" />
        </g>
      ))}

      {/* Endoplasmic reticulum */}
      <path d="M 200 80 Q 230 70 260 85 Q 290 100 310 90 Q 330 82 350 90"
        fill="none" stroke={C.amber} strokeWidth="1.5"
        onClick={() => onSelect('er')} style={{ cursor: 'pointer' }} />
      <path d="M 200 90 Q 230 80 260 95 Q 290 110 310 100 Q 330 92 350 100"
        fill="none" stroke={C.amber} strokeWidth="1" />

      {/* Golgi apparatus */}
      {[0,1,2,3].map(i => (
        <path key={i} d={`M 390 ${60 + i * 10} Q 415 ${55 + i * 10} 440 ${62 + i * 10}`}
          fill="none" stroke={C.inkFade} strokeWidth="1.2"
          onClick={() => onSelect('golgi')} style={{ cursor: 'pointer' }} />
      ))}

      {/* Annotation lines */}
      {[
        { x: 70, y: 215, label: 'Cell Wall', anchor: 'end', id: 'wall' },
        { x: 100, y: 118, label: 'Nucleus', anchor: 'end', id: 'nucleus' },
        { x: 250, y: 350, label: 'Vacuole', anchor: 'middle', id: 'vacuole' },
        { x: 80, y: 290, label: 'Chloroplast', anchor: 'end', id: 'chloroplast' },
        { x: 430, y: 355, label: 'Mitochondrion', anchor: 'start', id: 'mitochondria' },
        { x: 200, y: 65, label: 'Endoplasmic Reticulum', anchor: 'middle', id: 'er' },
        { x: 440, y: 50, label: 'Golgi', anchor: 'start', id: 'golgi' },
      ].map((a, i) => (
        <text key={i} x={a.x} y={a.y} textAnchor={a.anchor as any}
          fontSize="8.5" fill={selectedPart === a.id ? C.sepia : C.inkFade}
          fontStyle="italic" fontWeight={selectedPart === a.id ? 'bold' : 'normal'}
          onClick={() => onSelect(a.id)} style={{ cursor: 'pointer' }}>
          {a.label}
        </text>
      ))}

      <text x="250" y="412" textAnchor="middle" fontSize="10" fill={C.inkFade} fontStyle="italic">
        Fig. II — Generalised plant cell, showing major organelles
      </text>
    </svg>
  );
};

// ── SVG Photosynthesis diagram ─────────────────────────────────────────────────
const PhotosynthesisDiagram: React.FC = () => (
  <svg viewBox="0 0 580 400" className="w-full" style={{ fontFamily: 'Georgia, serif' }}>
    <defs>
      <marker id="arrowInk" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill={C.inkFade} />
      </marker>
      <marker id="arrowGreen" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill={C.green} />
      </marker>
    </defs>

    {/* Chloroplast outline */}
    <ellipse cx="290" cy="195" rx="250" ry="160" fill="rgba(80,140,70,0.07)" stroke={C.green} strokeWidth="1.5" />
    <text x="290" y="375" textAnchor="middle" fontSize="11" fill={C.green} fontStyle="italic">Chloroplast</text>

    {/* Thylakoid membrane region */}
    <rect x="90" y="110" width="200" height="150" rx="20" fill="rgba(60,120,50,0.12)" stroke={C.green} strokeWidth="1" strokeDasharray="4,3" />
    <text x="190" y="105" textAnchor="middle" fontSize="9" fill={C.green} fontStyle="italic">Thylakoid</text>

    {/* Stroma region */}
    <rect x="310" y="110" width="190" height="150" rx="20" fill="rgba(120,160,90,0.1)" stroke={C.greenFade} strokeWidth="1" strokeDasharray="4,3" />
    <text x="405" y="105" textAnchor="middle" fontSize="9" fill={C.greenFade} fontStyle="italic">Stroma</text>

    {/* ── LIGHT REACTIONS ── */}
    {/* Sun → Thylakoid */}
    <circle cx="55" cy="60" r="24" fill="rgba(240,190,20,0.3)" stroke={C.amber} strokeWidth="1.5" />
    <text x="55" y="57" textAnchor="middle" fontSize="8" fill={C.amber} fontWeight="bold">Light</text>
    <text x="55" y="68" textAnchor="middle" fontSize="7" fill={C.amber}>Energy</text>
    <line x1="78" y1="75" x2="120" y2="140" stroke={C.amber} strokeWidth="1.2" markerEnd="url(#arrowInk)" />

    {/* H₂O splits */}
    <text x="105" y="155" fontSize="10" fill={C.blue} fontStyle="italic">H₂O</text>
    <text x="138" y="155" fontSize="8" fill={C.inkFade}>→ O₂ + 2H⁺ + 2e⁻</text>
    <text x="115" y="173" fontSize="8" fill={C.inkFade} fontStyle="italic">(Photolysis)</text>

    {/* ATP + NADPH produced */}
    <text x="105" y="210" fontSize="10" fill={C.red} fontWeight="bold">ADP→ATP</text>
    <text x="105" y="225" fontSize="10" fill={C.red} fontWeight="bold">NADP⁺→NADPH</text>
    <text x="120" y="242" fontSize="8" fill={C.inkFade} fontStyle="italic">(Photophosphorylation)</text>

    {/* Arrow from light reactions to Calvin */}
    <line x1="290" y1="185" x2="315" y2="185" stroke={C.red} strokeWidth="1.5" markerEnd="url(#arrowInk)" />
    <text x="302" y="178" textAnchor="middle" fontSize="7.5" fill={C.red} fontStyle="italic">ATP</text>
    <line x1="290" y1="200" x2="315" y2="200" stroke={C.red} strokeWidth="1.5" markerEnd="url(#arrowInk)" />
    <text x="302" y="213" textAnchor="middle" fontSize="7.5" fill={C.red} fontStyle="italic">NADPH</text>

    {/* ── CALVIN CYCLE ── */}
    <text x="405" y="135" textAnchor="middle" fontSize="10" fill={C.ink} fontWeight="bold">Calvin Cycle</text>

    {/* CO₂ enters */}
    <text x="480" y="158" fontSize="10" fill={C.inkFade} fontStyle="italic">CO₂</text>
    <line x1="475" y1="162" x2="455" y2="170" stroke={C.inkFade} strokeWidth="1" markerEnd="url(#arrowInk)" />
    <text x="485" y="175" fontSize="8" fill={C.inkFade} fontStyle="italic">(Carbon</text>
    <text x="485" y="185" fontSize="8" fill={C.inkFade} fontStyle="italic">fixation)</text>

    {/* RuBP + CO₂ → 3-PGA */}
    <text x="370" y="165" fontSize="8.5" fill={C.inkFade}>RuBP + CO₂</text>
    <text x="390" y="180" fontSize="8" fill={C.inkFade}>↓ RuBisCO</text>
    <text x="378" y="196" fontSize="8.5" fill={C.inkFade}>3-PGA (×2)</text>
    <text x="378" y="214" fontSize="8" fill={C.inkFade}>↓ ATP/NADPH</text>
    <text x="375" y="230" fontSize="8.5" fill={C.inkFade}>G3P (glucose</text>
    <text x="375" y="243" fontSize="8.5" fill={C.inkFade}>precursor)</text>

    {/* G3P → output */}
    <line x1="405" y1="248" x2="405" y2="275" stroke={C.green} strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
    <text x="415" y="268" fontSize="8.5" fill={C.green} fontStyle="italic">→ Glucose (C₆H₁₂O₆)</text>

    {/* O₂ output */}
    <line x1="140" y1="162" x2="60" y2="130" stroke={C.blue} strokeWidth="1" markerEnd="url(#arrowInk)" />
    <text x="48" y="125" textAnchor="middle" fontSize="9" fill={C.blue} fontStyle="italic">O₂</text>
    <text x="48" y="137" textAnchor="middle" fontSize="8" fill={C.blue} fontStyle="italic">released</text>

    {/* Overall equation */}
    <rect x="60" y="312" width="460" height="48" rx="6"
      fill="rgba(60,100,40,0.08)" stroke={C.green} strokeWidth="1" strokeDasharray="5,3" />
    <text x="290" y="330" textAnchor="middle" fontSize="11" fill={C.ink} fontStyle="italic">Overall equation:</text>
    <text x="290" y="350" textAnchor="middle" fontSize="11" fill={C.ink}>
      6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂
    </text>

    <text x="290" y="395" textAnchor="middle" fontSize="10" fill={C.inkFade} fontStyle="italic">
      Fig. III — The two stages of photosynthesis (Z-scheme & Calvin cycle)
    </text>
  </svg>
);

// ── Water/nutrient transport diagram ──────────────────────────────────────────
const TransportDiagram: React.FC = () => (
  <svg viewBox="0 0 400 500" className="w-full max-w-sm mx-auto" style={{ fontFamily: 'Georgia, serif' }}>
    {/* Plant silhouette */}
    {/* Stem */}
    <rect x="185" y="180" width="30" height="200" fill="rgba(80,120,50,0.3)" stroke={C.green} strokeWidth="1" />
    {/* Roots */}
    <path d="M 200 380 L 200 460 M 200 420 L 160 460 M 200 420 L 240 460 M 200 440 L 140 490 M 200 440 L 260 490"
      fill="none" stroke={C.amber} strokeWidth="2" />
    {/* Leaves */}
    <path d="M 200 220 Q 140 180 120 130 Q 160 140 200 220" fill="rgba(70,130,60,0.4)" stroke={C.green} strokeWidth="1" />
    <path d="M 200 220 Q 260 180 280 130 Q 240 140 200 220" fill="rgba(70,130,60,0.4)" stroke={C.green} strokeWidth="1" />
    <path d="M 200 260 Q 120 240 90 190 Q 140 205 200 260" fill="rgba(70,130,60,0.4)" stroke={C.green} strokeWidth="1" />
    <path d="M 200 260 Q 280 240 310 190 Q 260 205 200 260" fill="rgba(70,130,60,0.4)" stroke={C.green} strokeWidth="1" />

    {/* Xylem (water up) */}
    <rect x="192" y="185" width="8" height="195" fill="rgba(43,74,139,0.35)" stroke={C.blue} strokeWidth="0.8" />
    {[200,215,230,245,260,275,290,305,320,335,350].map((y, i) => (
      <line key={i} x1="196" y1={y} x2="196" y2={y - 8} stroke={C.blue} strokeWidth="1"
        markerEnd="url(#arrowGreen)" />
    ))}

    {/* Phloem (sugars down) */}
    <rect x="200" y="185" width="8" height="195" fill="rgba(139,43,43,0.3)" stroke={C.red} strokeWidth="0.8" />

    {/* Water entry at roots */}
    <text x="140" y="455" fontSize="9" fill={C.blue} fontStyle="italic">H₂O & mineral ions</text>
    <path d="M 165 450 L 185 390" fill="none" stroke={C.blue} strokeWidth="1"
      markerEnd="url(#arrowInk)" />

    {/* Transpiration at leaves */}
    <text x="50" y="110" fontSize="9" fill={C.blue} fontStyle="italic">Transpiration</text>
    <text x="50" y="123" fontSize="9" fill={C.blue} fontStyle="italic">(H₂O vapour)</text>
    <path d="M 110 118 L 130 155" fill="none" stroke={C.blue} strokeWidth="1"
      markerEnd="url(#arrowInk)" />

    {/* Sucrose down via phloem */}
    <text x="260" y="290" fontSize="9" fill={C.red} fontStyle="italic">Sucrose →</text>
    <text x="260" y="303" fontSize="9" fill={C.red} fontStyle="italic">growing</text>
    <text x="260" y="316" fontSize="9" fill={C.red} fontStyle="italic">regions</text>

    {/* Labels */}
    <text x="170" y="305" textAnchor="end" fontSize="9" fill={C.blue}>Xylem</text>
    <text x="230" y="305" textAnchor="start" fontSize="9" fill={C.red}>Phloem</text>

    {/* Sun */}
    <circle cx="340" cy="60" r="28" fill="rgba(240,190,20,0.25)" stroke={C.amber} strokeWidth="1" />
    <text x="340" y="56" textAnchor="middle" fontSize="8" fill={C.amber} fontWeight="bold">Solar</text>
    <text x="340" y="68" textAnchor="middle" fontSize="8" fill={C.amber}>Energy</text>

    <text x="200" y="498" textAnchor="middle" fontSize="10" fill={C.inkFade} fontStyle="italic">
      Fig. IV — Vascular transport systems in a dicot
    </text>
  </svg>
);

// ── Part info panel ────────────────────────────────────────────────────────────
const PART_INFO: Record<string, { name: string; latin: string; desc: string }> = {
  cuticle:     { name: 'Waxy Cuticle', latin: 'Cuticula cerosa', desc: 'A non-cellular layer of cutin and wax secreted by the epidermal cells. Reduces transpirational water loss and provides a physical barrier against pathogens. Thickness varies with habitat — xerophytes have a markedly thickened cuticle.' },
  cuticle2:    { name: 'Lower Cuticle', latin: 'Cuticula inferior', desc: 'A thinner cuticle on the abaxial (lower) surface, frequently interrupted by stomatal apertures to facilitate gas exchange.' },
  upper_epi:   { name: 'Upper Epidermis', latin: 'Epidermis adaxialis', desc: 'A single layer of transparent, tightly packed parenchyma cells lacking chloroplasts. Their flat, peg-like surfaces reduce light scatter, maximising photon penetration to the underlying palisade layer.' },
  lower_epi:   { name: 'Lower Epidermis', latin: 'Epidermis abaxialis', desc: 'Similar in composition to the upper epidermis, but bearing a greater density of stomata — particularly in mesophytes — permitting CO₂ entry and O₂ egress.' },
  palisade:    { name: 'Palisade Mesophyll', latin: 'Parenchyma palissadicum', desc: 'Elongated columnar cells densely packed with 30–80 chloroplasts each. Arranged in one to three tiers perpendicular to the leaf surface to intercept maximum solar radiation. The primary locus of photosynthesis.' },
  spongy:      { name: 'Spongy Mesophyll', latin: 'Parenchyma spongiosum', desc: 'Irregularly shaped parenchyma cells with large intercellular air spaces constituting 25–40% of the mesophyll volume. Facilitates diffusion of CO₂ to palisade cells and O₂ away from them.' },
  xylem:       { name: 'Xylem', latin: 'Xylema', desc: 'A vascular tissue composed of vessel elements and tracheids — dead, hollow cells with lignified walls. Conducts water and dissolved mineral salts from root to leaf by a passive mechanism driven by transpirational pull (cohesion-tension theory).' },
  phloem:      { name: 'Phloem', latin: 'Phloema', desc: 'Living vascular tissue comprising sieve tube elements and companion cells. Translocates photosynthetic assimilates (principally sucrose) from source (mature leaf) to sink (roots, developing fruits, meristems) by pressure-flow.' },
  stomata:     { name: 'Stomata & Guard Cells', latin: 'Stomata, cellulae ostiolis', desc: 'Elliptical pores flanked by a pair of sausage-shaped guard cells whose turgor changes modulate aperture. Aperture opens in daylight (when K⁺ accumulates in guard cells) and closes at night or under water stress, balancing CO₂ uptake with transpiration.' },
  chloroplast: { name: 'Chloroplast', latin: 'Chloroplastum', desc: 'A double-membrane-bound plastid, 4–8 µm long, containing an inner thylakoid membrane system organised into grana (stacks) and stroma lamellae. The light reactions occur in the thylakoids; the Calvin cycle in the stroma.' },
  vacuole:     { name: 'Large Central Vacuole', latin: 'Vacuolum centrale', desc: 'A water-filled organelle bounded by the tonoplast, occupying up to 90% of the mature cell volume. Maintains turgor pressure, stores pigments (anthocyanins), sequesters waste metabolites, and drives cell elongation during growth.' },
  nucleus:     { name: 'Nucleus & Nucleolus', latin: 'Nucleus cellularis', desc: 'The membrane-bound organelle containing the plant\'s genomic DNA (typically 2n). The nucleolus — a dense sub-region — is the site of ribosomal RNA synthesis. Governs all heritable characteristics and co-ordinates metabolic activity.' },
  wall:        { name: 'Cell Wall', latin: 'Paries cellularis', desc: 'A rigid exoskeletal layer of cellulose microfibrils embedded in hemicellulose and pectin. Provides structural integrity, determines cell shape, and resists turgor pressure. The primary wall is flexible; the secondary wall (in specialised cells) is heavily lignified.' },
  mitochondria:{ name: 'Mitochondria', latin: 'Mitochondria', desc: 'Oval double-membrane organelles where aerobic respiration converts organic molecules into ATP via the Krebs cycle and oxidative phosphorylation. Contain their own circular DNA — evidence of ancient endosymbiotic origin.' },
  membrane:    { name: 'Plasma Membrane', latin: 'Membrana plasmatica', desc: 'A fluid-mosaic phospholipid bilayer controlling selective transport of ions and molecules. Contains receptor proteins, channel proteins, and carrier proteins including H⁺-ATPases that establish electrochemical gradients for nutrient uptake.' },
  er:          { name: 'Endoplasmic Reticulum', latin: 'Reticulum endoplasmicum', desc: 'An interconnected network of membrane-bound tubules and flattened sacs (cisternae). Rough ER (studded with ribosomes) synthesises secretory proteins; smooth ER is involved in lipid synthesis and calcium storage.' },
  golgi:       { name: 'Golgi Apparatus', latin: 'Apparatus Golgiensis', desc: 'A stack of flattened membrane sacs (cisternae) receiving vesicles from the ER and processing, sorting, and packaging proteins and polysaccharides for secretion. In plants, it is the primary site of hemicellulose and pectin synthesis for cell wall assembly.' },
};

// ── Main Component ─────────────────────────────────────────────────────────────
const PlantBiologyModule: React.FC<PlantBiologyModuleProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<Section>('LEAF_STRUCTURE');
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [insight, setInsight] = useState<{ summary: string; fact: string } | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [query, setQuery] = useState('');

  const fetchInsight = async (topic: string) => {
    if (!topic.trim()) return;
    setLoadingInsight(true);
    const data = await generatePlantInsight(topic);
    setInsight(data);
    setLoadingInsight(false);
  };

  useEffect(() => { fetchInsight('Photosynthesis — light and dark reactions'); }, []);

  const partInfo = selectedPart ? PART_INFO[selectedPart] : null;

  const nav = [
    { id: 'LEAF_STRUCTURE',  label: 'Leaf Section',    roman: 'I'   },
    { id: 'PLANT_CELL',      label: 'Plant Cell',       roman: 'II'  },
    { id: 'PHOTOSYNTHESIS',  label: 'Photosynthesis',   roman: 'III' },
    { id: 'TRANSPORT',       label: 'Vascular Transport', roman: 'IV' },
    { id: 'AI_INSIGHT',      label: 'Field Inquiry',    roman: 'V'   },
  ];

  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 20% 30%, rgba(160,130,70,0.08) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 70%, rgba(80,120,50,0.06) 0%, transparent 60%),
          #F2E8D5
        `,
        color: C.ink,
        fontFamily: "'EB Garamond', Georgia, 'Times New Roman', serif",
      }}
    >
      {/* Ruled-paper lines */}
      <div
        className="fixed inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: `repeating-linear-gradient(transparent, transparent 31px, ${C.border} 32px)`,
          backgroundSize: '100% 32px',
        }}
      />
      {/* Left margin line */}
      <div
        className="fixed inset-y-0 pointer-events-none"
        style={{ left: '80px', width: '1.5px', background: C.red, opacity: 0.25 }}
      />

      {/* ── Header ── */}
      <header
        className="relative z-10 border-b px-8 lg:px-16 py-5 flex items-center justify-between"
        style={{ borderColor: C.border, background: 'rgba(242,232,213,0.85)', backdropFilter: 'blur(4px)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[10px] uppercase tracking-widest"
          style={{ color: C.sepia }}
        >
          <ArrowLeft size={14} /> Botanical Archives
        </button>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.4em]" style={{ color: C.sepia }}>
            Plajah Natural Sciences — Botanical Series
          </p>
          <h1 className="text-2xl lg:text-4xl font-bold italic" style={{ color: C.ink, letterSpacing: '-0.02em' }}>
            The Plant Kingdom
          </h1>
        </div>
        <div className="text-[9px] uppercase tracking-widest text-right" style={{ color: C.sepia }}>
          <p>Vol. III, No. 4</p>
          <p>Est. MDCCCXLVII</p>
        </div>
      </header>

      {/* ── Section tabs ── */}
      <nav
        className="relative z-10 px-8 lg:px-16 flex gap-1 border-b overflow-x-auto no-scrollbar py-2"
        style={{ borderColor: C.border }}
      >
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => { setActiveSection(item.id as Section); setSelectedPart(null); }}
            className="px-4 py-2 text-[10px] uppercase tracking-widest whitespace-nowrap transition-all"
            style={{
              color: activeSection === item.id ? C.paper : C.sepia,
              background: activeSection === item.id ? C.sepia : 'transparent',
              borderRadius: '3px',
              fontWeight: activeSection === item.id ? 700 : 400,
              borderBottom: activeSection === item.id ? `2px solid ${C.amber}` : 'none',
            }}
          >
            § {item.roman}. {item.label}
          </button>
        ))}
      </nav>

      {/* ── Main content ── */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

        {/* Diagram area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.4 }}
            className="flex-1 p-8 lg:p-12 flex flex-col items-center justify-center overflow-y-auto"
          >
            {/* Section watermark */}
            <div
              className="absolute top-8 right-8 text-[7rem] font-bold italic pointer-events-none select-none"
              style={{ color: `${C.border}40`, lineHeight: 1 }}
            >
              {nav.find(n => n.id === activeSection)?.roman}
            </div>

            {activeSection === 'LEAF_STRUCTURE' && (
              <div className="w-full max-w-2xl">
                <h2 className="text-xl font-bold italic mb-1" style={{ color: C.inkFade }}>
                  Anatomy of the Dicotyledon Leaf
                </h2>
                <p className="text-[10px] uppercase tracking-widest mb-6" style={{ color: C.sepia }}>
                  Select a structure to examine — click any labelled region
                </p>
                <div className="rounded" style={{ border: `1px solid ${C.border}` }}>
                  <LeafCrossSection selectedPart={selectedPart} onSelect={setSelectedPart} />
                </div>
              </div>
            )}

            {activeSection === 'PLANT_CELL' && (
              <div className="w-full max-w-2xl">
                <h2 className="text-xl font-bold italic mb-1" style={{ color: C.inkFade }}>
                  The Generalised Plant Cell
                </h2>
                <p className="text-[10px] uppercase tracking-widest mb-6" style={{ color: C.sepia }}>
                  Select an organelle to reveal its function
                </p>
                <div className="rounded" style={{ border: `1px solid ${C.border}` }}>
                  <PlantCellDiagram selectedPart={selectedPart} onSelect={setSelectedPart} />
                </div>
              </div>
            )}

            {activeSection === 'PHOTOSYNTHESIS' && (
              <div className="w-full max-w-2xl">
                <h2 className="text-xl font-bold italic mb-1" style={{ color: C.inkFade }}>
                  The Mechanism of Photosynthesis
                </h2>
                <p className="text-[10px] uppercase tracking-widest mb-6" style={{ color: C.sepia }}>
                  Light-dependent reactions & the Calvin cycle (Benson–Calvin, 1950)
                </p>
                <div className="rounded" style={{ border: `1px solid ${C.border}` }}>
                  <PhotosynthesisDiagram />
                </div>
              </div>
            )}

            {activeSection === 'TRANSPORT' && (
              <div className="w-full max-w-md">
                <h2 className="text-xl font-bold italic mb-1" style={{ color: C.inkFade }}>
                  Vascular Transport Systems
                </h2>
                <p className="text-[10px] uppercase tracking-widest mb-6" style={{ color: C.sepia }}>
                  Xylem (cohesion-tension) and phloem (pressure-flow) pathways
                </p>
                <div className="rounded" style={{ border: `1px solid ${C.border}` }}>
                  <TransportDiagram />
                </div>
              </div>
            )}

            {activeSection === 'AI_INSIGHT' && (
              <div className="w-full max-w-xl">
                <h2 className="text-xl font-bold italic mb-1" style={{ color: C.inkFade }}>
                  Field Inquiry — AI Botanical Correspondent
                </h2>
                <p className="text-[10px] uppercase tracking-widest mb-8" style={{ color: C.sepia }}>
                  Submit a query to the natural sciences correspondent
                </p>

                {/* Query box styled as a field-notes entry */}
                <div
                  className="p-6 rounded-sm mb-6"
                  style={{
                    background: 'rgba(230,215,185,0.6)',
                    border: `1px solid ${C.border}`,
                    boxShadow: `inset 0 0 0 1px rgba(160,130,70,0.1)`,
                  }}
                >
                  <p className="text-[9px] uppercase tracking-widest mb-3" style={{ color: C.sepia }}>
                    <Feather size={10} className="inline mr-1" /> Enter your botanical query:
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') fetchInsight(query); }}
                      placeholder="e.g., Why do leaves change colour in autumn?"
                      className="flex-1 bg-transparent border-b text-sm italic outline-none"
                      style={{ borderColor: C.border, color: C.ink }}
                    />
                    <button
                      onClick={() => fetchInsight(query)}
                      className="px-4 py-1 text-[10px] uppercase tracking-widest transition-all"
                      style={{ background: C.sepia, color: C.paper, borderRadius: '2px' }}
                    >
                      Inquire
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {loadingInsight ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-center py-12">
                      <div className="text-[10px] uppercase tracking-[0.4em] italic animate-pulse"
                        style={{ color: C.sepia }}>
                        Consulting the herbarium records...
                      </div>
                    </motion.div>
                  ) : insight && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      className="p-8 rounded-sm"
                      style={{
                        background: 'rgba(235,220,190,0.7)',
                        border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${C.sepia}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen size={13} style={{ color: C.sepia }} />
                        <span className="text-[9px] uppercase tracking-[0.4em]" style={{ color: C.sepia }}>
                          Correspondent's Note
                        </span>
                      </div>
                      <p className="text-sm italic leading-loose mb-6" style={{ color: C.inkFade }}>
                        "{insight.summary}"
                      </p>
                      <div
                        className="p-4 rounded-sm"
                        style={{ background: 'rgba(160,130,70,0.1)', border: `1px solid ${C.border}` }}
                      >
                        <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: C.sepia }}>
                          Specimen Note:
                        </p>
                        <p className="text-xs italic" style={{ color: C.inkFade }}>{insight.fact}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Right panel: selected-part detail ── */}
        {activeSection !== 'AI_INSIGHT' && (
          <aside
            className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col overflow-y-auto"
            style={{
              borderColor: C.border,
              background: 'rgba(235,220,188,0.65)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <div className="p-6 border-b" style={{ borderColor: C.border }}>
              <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: C.sepia }}>
                Structure Notes
              </p>
              <h3 className="text-base font-bold italic" style={{ color: C.ink }}>
                {partInfo ? partInfo.name : 'Select a structure'}
              </h3>
              {partInfo && (
                <p className="text-[9px] italic mt-0.5" style={{ color: C.sepia }}>
                  {partInfo.latin}
                </p>
              )}
            </div>

            <div className="flex-1 p-6">
              {partInfo ? (
                <motion.div
                  key={selectedPart}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <p className="text-sm leading-loose italic" style={{ color: C.inkFade }}>
                    {partInfo.desc}
                  </p>
                </motion.div>
              ) : (
                <p className="text-xs italic" style={{ color: `${C.sepia}80` }}>
                  Hover or click any labelled region in the diagram to reveal detailed anatomical notes, as recorded by our field correspondents.
                </p>
              )}
            </div>

            {/* Index of structures */}
            <div className="p-6 border-t" style={{ borderColor: C.border }}>
              <p className="text-[9px] uppercase tracking-widest mb-3" style={{ color: C.sepia }}>
                Index of Structures
              </p>
              <div className="space-y-1">
                {Object.entries(PART_INFO)
                  .filter((_, i) => {
                    if (activeSection === 'LEAF_STRUCTURE') return i < 9;
                    if (activeSection === 'PLANT_CELL') return i >= 9;
                    return false;
                  })
                  .map(([id, info]) => (
                    <button
                      key={id}
                      onClick={() => setSelectedPart(id)}
                      className="w-full text-left px-3 py-2 rounded-sm text-[10px] italic transition-all"
                      style={{
                        color: selectedPart === id ? C.paper : C.inkFade,
                        background: selectedPart === id ? C.sepia : 'transparent',
                      }}
                    >
                      {info.name}
                    </button>
                  ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default PlantBiologyModule;
