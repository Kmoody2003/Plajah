import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Swords, Compass, Boxes, Clock, Users, ScrollText,
  MessageSquare, ExternalLink, ChevronRight, ChevronLeft, X, Landmark, Film, Scale,
  Activity, Layers, Play, Pause,
} from 'lucide-react';
import MuseumHall from './MuseumHall';
import AssetActions from './AssetActions';
import YouTubeEmbed from './labs/YouTubeEmbed';
import type { PlayableMotion } from './labs/motionParsers';
const PlateViewer = React.lazy(() => import('./labs/PlateViewer'));
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import { listenToGlobalPosts, createPost, auth, uploadFile } from '../services/backendService';
import { Post } from '../types';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';
import {
  COMBAT_ARTS, COMBAT_FIGURES, COMBAT_FIGURE_HALLS, COMBAT_TIMELINE,
  COMBAT_SCHOLARSHIP, COMBAT_ARCHIVES, CITATION_ONLY_SHELF, ATLAS_WINGS,
  PLAJAH_HOLDINGS, HOLDINGS_STATS, holdingUrl,
  FORM_COLORS, COMBAT_FORMS,
  ATLAS_ACCENT, ATLAS_ACCENT_2,
  type CombatArt, type CombatForm, type GlyphKind, type ArchiveImage, type WingId, type PoseKind,
} from '../data/combatAtlasData';

const ACCENT = ATLAS_ACCENT;      // harvest ochre
const ACCENT_2 = ATLAS_ACCENT_2;  // laterite red earth

// ── Kinetic glyphs — abstract motion-marks per art (from the Atlas design) ────
const Glyph: React.FC<{ kind: GlyphKind; color: string; size?: number }> = ({ kind, color, size = 52 }) => {
  const s = { stroke: color, strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' as const };
  const glyphs: Record<GlyphKind, React.ReactNode> = {
    spearFist: (
      <g {...s}>
        <path d="M10 46 Q28 8 50 18" />
        <circle cx="50" cy="18" r="4" fill={color} stroke="none" />
        <path d="M14 30 L14 46" strokeWidth={5} opacity={0.5} />
      </g>
    ),
    invertKick: (
      <g {...s}>
        <path d="M12 16 Q32 52 52 16" />
        <path d="M22 44 Q32 34 42 44" opacity={0.5} />
        <circle cx="52" cy="16" r="3.5" fill={color} stroke="none" />
      </g>
    ),
    crossSticks: (
      <g {...s}>
        <path d="M12 50 L50 12" />
        <path d="M16 14 L48 48" opacity={0.6} />
        <path d="M40 8 Q46 10 50 12" strokeWidth={4} />
      </g>
    ),
    grapplRing: (
      <g {...s}>
        <circle cx="25" cy="32" r="13" />
        <circle cx="39" cy="32" r="13" opacity={0.55} />
      </g>
    ),
    twinStick: (
      <g {...s}>
        <path d="M14 52 L36 10" />
        <path d="M26 52 L48 14" opacity={0.5} />
        <ellipse cx="46" cy="44" rx="7" ry="10" opacity={0.7} />
      </g>
    ),
    throwArc: (
      <g {...s}>
        <path d="M12 44 Q32 44 40 26 Q44 16 54 16" />
        <circle cx="12" cy="44" r="3.5" fill={color} stroke="none" />
        <path d="M46 10 L54 16 L48 24" />
      </g>
    ),
    openHand: (
      <g {...s}>
        <path d="M10 40 L34 24" />
        <path d="M18 50 L42 34" opacity={0.6} />
        <circle cx="38" cy="21" r="4" fill={color} stroke="none" />
        <circle cx="46" cy="31" r="4" fill={color} stroke="none" opacity={0.6} />
      </g>
    ),
    ashTake: (
      <g {...s}>
        <path d="M14 14 Q30 18 34 34 Q36 44 52 48" />
        <path d="M44 52 L52 48 L50 40" />
        <circle cx="14" cy="14" r="3.5" fill={color} stroke="none" />
      </g>
    ),
  };
  return <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">{glyphs[kind]}</svg>;
};

// ── Kinetic Figure System — pictogram bodies in motion, drawn from each art's
//    real mechanics: head + weighted limb strokes + motion trails.
type PoseDef = {
  head: [number, number]; limbs: string[];
  dots?: { x: number; y: number; r: number }[];
  sticks?: string[]; trail?: string;
  ghost?: { head: [number, number]; limbs: string[] };
};
const POSES: Record<PoseKind, PoseDef> = {
  spearLunge: { head: [82, 26], limbs: ['M78 34 L64 62', 'M76 40 L104 28', 'M74 42 L58 48 L62 36', 'M64 62 L82 82 L94 102', 'M64 62 L44 84 L30 102'], dots: [{ x: 106, y: 27, r: 5.5 }], trail: 'M38 16 Q78 0 108 22' },
  inverted: { head: [48, 80], limbs: ['M62 102 L58 76', 'M58 76 L56 44', 'M56 44 L30 20', 'M56 44 L84 18', 'M58 76 L78 66'], dots: [{ x: 62, y: 104, r: 3.5 }], trail: 'M20 34 Q56 -6 92 30' },
  twinSticks: { head: [54, 24], limbs: ['M54 32 L56 62', 'M54 36 L80 24', 'M54 40 L32 46', 'M56 62 L74 82 L84 102', 'M56 62 L40 84 L30 102'], sticks: ['M72 30 L104 8', 'M40 12 L22 86'], trail: 'M64 6 Q92 2 108 14' },
  throwLift: { head: [46, 42], limbs: ['M44 50 L54 76', 'M46 54 L66 42', 'M44 58 L60 60', 'M54 76 L70 90 L76 104', 'M54 76 L40 88 L32 104'], ghost: { head: [92, 28], limbs: ['M86 32 L60 44', 'M60 44 L42 28', 'M60 44 L46 18', 'M82 34 L88 48'] }, trail: 'M20 72 Q60 6 106 26' },
  lowShot: { head: [86, 56], limbs: ['M78 60 L54 70', 'M74 62 L98 74', 'M72 66 L92 84', 'M54 70 L38 84 L24 100', 'M54 70 L52 92 L60 106'], trail: 'M16 96 Q58 52 102 64' },
  overheadPole: { head: [56, 30], limbs: ['M56 38 L58 66', 'M56 42 L40 22', 'M58 42 L76 20', 'M58 66 L76 84 L88 104', 'M58 66 L42 86 L32 104'], sticks: ['M26 28 L96 8'], trail: 'M18 44 Q52 8 96 14' },
  crossPunch: { head: [60, 28], limbs: ['M58 36 L52 64', 'M58 40 L96 34', 'M56 44 L38 50', 'M52 64 L70 84 L80 104', 'M52 64 L36 82 L26 102'], dots: [{ x: 99, y: 33, r: 5 }, { x: 36, y: 50, r: 4 }], trail: 'M50 18 Q80 14 104 30' },
  collarClinch: { head: [42, 34], limbs: ['M46 42 L54 72', 'M48 44 L72 40', 'M50 50 L68 54', 'M54 72 L40 88 L34 104', 'M54 72 L64 92 L70 106'], ghost: { head: [80, 34], limbs: ['M76 42 L66 72', 'M74 44 L50 42', 'M66 72 L82 88 L90 104', 'M66 72 L60 94 L52 106'] }, trail: 'M28 20 Q60 8 94 20' },
  tahtibDance: { head: [56, 22], limbs: ['M56 30 L58 62', 'M56 34 L78 20', 'M56 38 L34 44', 'M58 62 L58 84 L56 104', 'M58 62 L76 72 L80 90'], sticks: ['M72 26 L98 6'], trail: 'M30 10 Q58 -2 94 10' },
};

const ActionFigure: React.FC<{ pose: PoseKind; color: string; size?: number; ghostColor?: string }> = ({ pose, color, size = 120, ghostColor }) => {
  const p = POSES[pose] || POSES.crossPunch;
  const gc = ghostColor || color;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      {p.trail && <path d={p.trail} stroke={color} strokeWidth={1.6} fill="none" opacity={0.35} strokeDasharray="2 7" strokeLinecap="round" />}
      {p.ghost && (
        <g opacity={0.55}>
          {p.ghost.limbs.map((d, i) => <path key={i} d={d} stroke={gc} strokeWidth={6.5} strokeLinecap="round" fill="none" />)}
          <circle cx={p.ghost.head[0]} cy={p.ghost.head[1]} r={6.5} fill={gc} />
        </g>
      )}
      {(p.sticks || []).map((d, i) => <path key={'s' + i} d={d} stroke={color} strokeWidth={3.5} strokeLinecap="round" opacity={0.9} fill="none" />)}
      {p.limbs.map((d, i) => <path key={i} d={d} stroke={color} strokeWidth={7} strokeLinecap="round" fill="none" />)}
      <circle cx={p.head[0]} cy={p.head[1]} r={7} fill={color} />
      {(p.dots || []).map((d, i) => <circle key={'d' + i} cx={d.x} cy={d.y} r={d.r} fill={color} />)}
    </svg>
  );
};

// ── Mudcloth-inspired divider (bogolanfini geometry) ─────────────────────────
const Mudcloth: React.FC<{ color?: string }> = ({ color = 'rgba(233,228,214,0.55)' }) => (
  <svg width="100%" height="16" aria-hidden="true" style={{ display: 'block', opacity: 0.5 }}>
    <defs>
      <pattern id="atlas-mud" width="48" height="16" patternUnits="userSpaceOnUse">
        <path d="M0 8 L6 2 L12 8 L6 14 Z" fill="none" stroke={color} strokeWidth="1.4" />
        <line x1="20" y1="3" x2="20" y2="13" stroke={color} strokeWidth="1.4" />
        <line x1="26" y1="3" x2="26" y2="13" stroke={color} strokeWidth="1.4" />
        <circle cx="38" cy="8" r="2.6" fill={color} />
      </pattern>
    </defs>
    <rect width="100%" height="16" fill="url(#atlas-mud)" />
  </svg>
);

// ── Plate Room — original facsimile renderings after Newberry, Beni Hasan II
//    (1893): paired wrestlers in contrasting shades, as on the east wall of
//    Tomb 15 (Baqet III). Sequence reads left→right.
const MURAL = { plaster: '#D9C8A0', red: '#A03A20', umber: '#4A3020', ink: '#2E2013', body: '#4A3A26', caption: '#6B5638' };
type PlateFig = { head: [number, number]; limbs: string[] };
const PLATE_PAIRS: { title: string; a: PlateFig; b: PlateFig }[] = [
  {
    title: 'The square-off',
    a: { head: [34, 40], limbs: ['M36 48 L42 76', 'M38 52 L58 58', 'M38 58 L56 68', 'M42 76 L32 94 L28 112', 'M42 76 L52 96 L56 112'] },
    b: { head: [106, 40], limbs: ['M104 48 L98 76', 'M102 52 L82 58', 'M102 58 L84 68', 'M98 76 L108 94 L112 112', 'M98 76 L88 96 L84 112'] },
  },
  {
    title: 'First grip',
    a: { head: [44, 38], limbs: ['M46 46 L52 76', 'M48 48 L76 44', 'M48 56 L74 60', 'M52 76 L40 94 L34 112', 'M52 76 L60 96 L64 112'] },
    b: { head: [96, 38], limbs: ['M94 46 L88 76', 'M92 48 L64 46', 'M92 56 L66 60', 'M88 76 L100 94 L106 112', 'M88 76 L80 96 L74 112'] },
  },
  {
    title: 'The waist lift',
    a: { head: [52, 34], limbs: ['M54 42 L62 74', 'M56 46 L84 52', 'M56 54 L82 66', 'M62 74 L48 92 L40 110', 'M62 74 L70 94 L74 112'] },
    b: { head: [98, 46], limbs: ['M96 54 L86 70', 'M94 56 L70 50', 'M86 70 L98 84 L108 92', 'M86 70 L92 90 L100 100'] },
  },
  {
    title: 'Thrown over the hip',
    a: { head: [56, 46], limbs: ['M58 54 L64 82', 'M58 56 L82 40', 'M60 62 L84 56', 'M64 82 L50 98 L44 114', 'M64 82 L74 100 L80 114'] },
    b: { head: [102, 22], limbs: ['M96 26 L72 42', 'M72 42 L56 30', 'M72 42 L60 20', 'M92 30 L98 44'] },
  },
  {
    title: 'Grounded',
    a: { head: [58, 52], limbs: ['M60 60 L72 82', 'M60 64 L88 74', 'M62 70 L86 84', 'M72 82 L60 98 L54 112', 'M72 82 L84 98 L92 110'] },
    b: { head: [104, 92], limbs: ['M98 94 L70 96', 'M70 96 L54 88', 'M70 96 L56 104', 'M96 96 L104 106'] },
  },
];

const PlatePair: React.FC<{ pair: (typeof PLATE_PAIRS)[number]; index: number }> = ({ pair, index }) => {
  const draw = (fig: PlateFig, color: string) => (
    <g>
      {fig.limbs.map((d, i) => <path key={i} d={d} stroke={color} strokeWidth={6} strokeLinecap="round" fill="none" />)}
      <circle cx={fig.head[0]} cy={fig.head[1]} r={6.5} fill={color} />
    </g>
  );
  return (
    <div className="text-center">
      <svg viewBox="0 0 140 126" width="100%" style={{ maxWidth: 190 }} aria-label={`Wrestling sequence ${index + 1}: ${pair.title}`}>
        <line x1="6" y1="120" x2="134" y2="120" stroke={MURAL.umber} strokeWidth={2} opacity={0.5} />
        {draw(pair.a, MURAL.red)}
        {draw(pair.b, MURAL.umber)}
      </svg>
      <p className={`${TYPE.labelSm} font-black tracking-[0.1em] mt-0.5`} style={{ color: MURAL.umber }}>
        {String(index + 1).padStart(2, '0')} · {pair.title.toUpperCase()}
      </p>
    </div>
  );
};

// ── Motion Lab — keyframed technique playback. A working prototype of the
//    capture→playback loop; in production these frames become BVH streams
//    (UMONS-TAICHI, CMU, commissioned captures) and 4DGS volumetric playback.
type MotionFrame = { head: [number, number]; torso: [number, number][]; armR: [number, number][]; armL: [number, number][]; legR: [number, number][]; legL: [number, number][] };
type MotionClip = { name: string; art: string; color: string; fps: number; frames: MotionFrame[] };
const MOTION_CLIPS: Record<string, MotionClip> = {
  meiaLua: {
    name: 'Meia lua de compasso', art: 'Engolo → Capoeira · AMA-006', color: '#5B6EA8', fps: 44,
    frames: [
      { head: [81, 44], torso: [[80, 52], [76, 88]], armR: [[80, 56], [96, 62], [104, 52]], armL: [[80, 58], [64, 64], [56, 54]], legR: [[76, 88], [92, 104], [98, 124]], legL: [[76, 88], [62, 106], [54, 124]] },
      { head: [50, 100], torso: [[56, 96], [78, 84]], armR: [[56, 96], [52, 112], [50, 124]], armL: [[60, 94], [64, 112], [66, 124]], legR: [[78, 84], [88, 104], [92, 124]], legL: [[78, 84], [64, 96], [52, 102]] },
      { head: [56, 104], torso: [[62, 98], [78, 66]], armR: [[62, 98], [58, 112], [56, 124]], armL: [[66, 96], [70, 112], [72, 124]], legR: [[78, 66], [104, 54], [130, 46]], legL: [[78, 66], [84, 96], [88, 124]] },
      { head: [85, 44], torso: [[84, 52], [80, 88]], armR: [[84, 56], [100, 60], [108, 50]], armL: [[84, 58], [68, 62], [60, 52]], legR: [[80, 88], [94, 106], [100, 124]], legL: [[80, 88], [66, 106], [58, 124]] },
    ],
  },
  cloudHands: {
    name: 'Cloud hands (yún shǒu)', art: 'Taijiquan · Vol. II', color: '#D9A441', fps: 26,
    frames: [
      { head: [81, 42], torso: [[80, 50], [80, 86]], armR: [[80, 54], [100, 58], [110, 48]], armL: [[80, 58], [66, 70], [60, 82]], legR: [[80, 86], [94, 104], [98, 124]], legL: [[80, 86], [66, 104], [60, 124]] },
      { head: [77, 42], torso: [[76, 50], [78, 86]], armR: [[76, 54], [94, 44], [86, 32]], armL: [[76, 58], [62, 54], [52, 42]], legR: [[78, 86], [92, 106], [96, 124]], legL: [[78, 86], [62, 102], [54, 124]] },
      { head: [77, 42], torso: [[76, 50], [76, 86]], armR: [[76, 58], [90, 70], [94, 84]], armL: [[76, 54], [56, 58], [46, 46]], legR: [[76, 86], [90, 106], [94, 124]], legL: [[76, 86], [62, 102], [56, 124]] },
      { head: [79, 42], torso: [[78, 50], [78, 86]], armR: [[78, 56], [90, 72], [82, 86]], armL: [[78, 56], [66, 72], [72, 86]], legR: [[78, 86], [92, 104], [96, 124]], legL: [[78, 86], [64, 104], [58, 124]] },
    ],
  },
  dambeSpear: {
    name: 'The spear crosses', art: 'Dambe · AMA-002', color: '#C24D2C', fps: 52,
    frames: [
      { head: [77, 44], torso: [[76, 52], [70, 88]], armR: [[76, 56], [92, 62], [98, 70]], armL: [[76, 58], [62, 60], [54, 50]], legR: [[70, 88], [84, 106], [90, 124]], legL: [[70, 88], [56, 106], [48, 124]] },
      { head: [73, 46], torso: [[72, 54], [70, 88]], armR: [[72, 58], [86, 50], [98, 54]], armL: [[72, 60], [58, 62], [52, 52]], legR: [[70, 88], [82, 106], [86, 124]], legL: [[70, 88], [56, 104], [46, 122]] },
      { head: [85, 42], torso: [[84, 50], [72, 86]], armR: [[84, 54], [110, 46], [132, 40]], armL: [[82, 58], [68, 62], [62, 52]], legR: [[72, 86], [92, 102], [104, 122]], legL: [[72, 86], [54, 104], [42, 122]] },
      { head: [79, 44], torso: [[78, 52], [71, 88]], armR: [[78, 56], [94, 60], [100, 66]], armL: [[78, 58], [64, 60], [56, 50]], legR: [[71, 88], [85, 106], [91, 124]], legL: [[71, 88], [57, 106], [49, 124]] },
    ],
  },
};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const easeU = (u: number) => u * u * (3 - 2 * u);
const lerpPt = (p: [number, number], q: [number, number], u: number): [number, number] => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];
const lerpLimb = (a: [number, number][], b: [number, number][], u: number) => a.map((pt, i) => lerpPt(pt, b[i], u));

function samplePose(clip: MotionClip, t: number) {
  const n = clip.frames.length;
  const x = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(x) % n;
  const j = (i + 1) % n;
  const u = easeU(x - Math.floor(x));
  const A = clip.frames[i], B = clip.frames[j];
  return {
    head: lerpPt(A.head, B.head, u),
    torso: lerpLimb(A.torso, B.torso, u),
    armR: lerpLimb(A.armR, B.armR, u),
    armL: lerpLimb(A.armL, B.armL, u),
    legR: lerpLimb(A.legR, B.legR, u),
    legL: lerpLimb(A.legL, B.legL, u),
  };
}

// Real capture clips served from /public/motion.
//
// LICENCE GATE — read before adding a clip.
// CMU Graphics Lab data is free for any use, including commercial: it ships.
// UMONS-TAICHI is CC BY-NC-SA 4.0, which a commercial platform cannot satisfy,
// so it is withheld from public builds until the authors grant terms (see
// docs/outreach/01-umons-taichi-licence-request.md). Flip SHOW_NC_PREVIEW to
// true only in local research builds, never in a deployed one.
const SHOW_NC_PREVIEW = false;

interface CaptureClip { name: string; art: string; color: string; url: string; kind: 'bvh' | 'kinect'; credit: string; nonCommercial?: boolean }
const ALL_CAPTURE_CLIPS: Record<string, CaptureClip> = {
  cmuFrontKick: { name: 'Mae-geri (front kick)', art: 'Karate · CMU Subject 135', color: '#C24D2C', url: '/motion/cmu_135_04_frontkick.bvh', kind: 'bvh', credit: 'CMU GRAPHICS LAB · FREE LICENSE' },
  cmuMawashi: { name: 'Mawashi-geri', art: 'Karate · CMU Subject 135', color: '#C24D2C', url: '/motion/cmu_135_07_mawashigeri.bvh', kind: 'bvh', credit: 'CMU GRAPHICS LAB · FREE LICENSE' },
  cmuYoko: { name: 'Yoko-geri (side kick)', art: 'Karate · CMU Subject 135', color: '#8FA08A', url: '/motion/cmu_135_11_yokogeri.bvh', kind: 'bvh', credit: 'CMU GRAPHICS LAB · FREE LICENSE' },
  cmuBoxing: { name: 'Boxing', art: 'Pugilism · CMU Subject 13', color: '#D9A441', url: '/motion/cmu_13_17_boxing.bvh', kind: 'bvh', credit: 'CMU GRAPHICS LAB · FREE LICENSE' },
  umonsTaichi: { name: 'Taijiquan (Kinect capture)', art: 'Taijiquan · UMONS-TAICHI', color: '#5B6EA8', url: '/motion/umons_taichi_sample.txt', kind: 'kinect', credit: 'UMONS-TAICHI · CC BY-NC-SA · RESEARCH PREVIEW', nonCommercial: true },
};

/** What the public build may actually play. */
const CAPTURE_CLIPS: Record<string, CaptureClip> = Object.fromEntries(
  Object.entries(ALL_CAPTURE_CLIPS).filter(([, c]) => SHOW_NC_PREVIEW || !c.nonCommercial),
);

const MotionLabPlayer: React.FC = () => {
  const [clipKey, setClipKey] = useState<string>('cmuFrontKick');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, PlayableMotion | 'loading' | 'error'>>({});
  const raf = useRef<number>(0);

  const capture = CAPTURE_CLIPS[clipKey];
  const keyframe = MOTION_CLIPS[clipKey];

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  // Lazy-load capture data the first time its clip is selected.
  useEffect(() => {
    if (!capture || loaded[clipKey]) return;
    setLoaded(prev => ({ ...prev, [clipKey]: 'loading' }));
    let alive = true;
    (async () => {
      try {
        const { parseBVH, parseKinectTxt } = await import('./labs/motionParsers');
        const res = await fetch(capture.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const motion = capture.kind === 'bvh' ? parseBVH(text) : parseKinectTxt(text);
        if (motion.frames.length === 0) throw new Error('no frames');
        if (alive) setLoaded(prev => ({ ...prev, [clipKey]: motion }));
      } catch {
        if (alive) setLoaded(prev => ({ ...prev, [clipKey]: 'error' }));
      }
    })();
    return () => { alive = false; };
  }, [clipKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setT(prev => prev + dt * (capture ? 1 : 0.28) * speed);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, capture]);

  const color = capture?.color || keyframe?.color || ATLAS_ACCENT;
  const artLabel = (capture?.art || keyframe?.art || '').toUpperCase();

  // Resolve what to draw this frame
  const motion = capture ? loaded[clipKey] : undefined;
  let boneLines: [number, number][][] = [];
  let markers: [number, number][] = [];
  let head: [number, number] | null = null;
  let statusLine = '';

  if (capture) {
    if (motion === 'loading' || motion === undefined) statusLine = 'LOADING CAPTURE…';
    else if (motion === 'error') statusLine = 'CAPTURE UNAVAILABLE';
    else {
      const m = motion as PlayableMotion;
      // Defensive: a bad frameTime (0/NaN from a malformed header) would make
      // frameIdx NaN and index off the end. Never let playback crash the museum.
      const n = m.frames.length;
      const step = m.frameTime > 0 ? Math.floor(t / m.frameTime) : 0;
      const frameIdx = n > 0 && Number.isFinite(step) ? ((step % n) + n) % n : 0;
      const pts = m.frames[frameIdx];
      if (pts) {
        boneLines = m.bones
          .filter(([a, b]) => pts[a] && pts[b])
          .map(([a, b]) => [pts[a], pts[b]]);
        markers = pts;
        head = pts[m.headIndex] ?? null;
        statusLine = `FR ${String(frameIdx).padStart(4, '0')}/${n} · ${capture.kind.toUpperCase()} STREAM`;
      } else {
        statusLine = 'CAPTURE UNAVAILABLE';
      }
    }
  } else if (keyframe) {
    const pose = samplePose(keyframe, t);
    const limbs = [pose.torso, pose.armR, pose.armL, pose.legR, pose.legL];
    boneLines = limbs.map(L => L as [number, number][]);
    markers = [pose.head, ...limbs.flat()] as [number, number][];
    head = pose.head as [number, number];
    statusLine = `FR ${String(Math.floor((((t % 1) + 1) % 1) * keyframe.fps)).padStart(3, '0')} · ${keyframe.fps}KF/CYCLE · KEYFRAME INTERP`;
  }

  const chip = (k: string, label: string, col: string, live?: boolean) => (
    <button key={k} onClick={() => { setClipKey(k); setT(0); }}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${TYPE.labelSm} font-black transition-all`}
      style={clipKey === k
        ? { background: col, color: '#12141C', border: `1px solid ${col}` }
        : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
      {live && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: clipKey === k ? '#12141C' : '#E5484D' }} />}
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03]">
      <div className="px-4 py-3 border-b border-white/6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${TYPE.labelSm} font-black tracking-[0.14em] text-white/35 mr-1`}>REAL CAPTURE</span>
          {Object.entries(CAPTURE_CLIPS).map(([k, c]) => chip(k, c.name, c.color, true))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${TYPE.labelSm} font-black tracking-[0.14em] text-white/35 mr-1`}>SKETCHES</span>
            {Object.entries(MOTION_CLIPS).map(([k, c]) => chip(k, c.name, c.color))}
          </div>
          <div className="flex items-center gap-1.5">
            {[0.5, 1, 2].map(sx => (
              <button key={sx} onClick={() => setSpeed(sx)}
                className={`px-2 py-0.5 rounded ${TYPE.labelSm} font-black transition-all`}
                style={speed === sx ? { border: `1px solid ${ATLAS_ACCENT}`, color: ATLAS_ACCENT } : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>
                {sx}×
              </button>
            ))}
            <button onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${TYPE.labelSm} font-black transition-all`}
              style={playing ? { border: `1px solid ${ATLAS_ACCENT}`, color: ATLAS_ACCENT } : { background: ATLAS_ACCENT, color: '#12141C', border: `1px solid ${ATLAS_ACCENT}` }}>
              {playing ? <><Pause size={10} /> Pause</> : <><Play size={10} /> Play</>}
            </button>
          </div>
        </div>
      </div>
      <div className="relative">
        <svg viewBox="0 0 160 140" className="w-full" style={{ maxHeight: 420, display: 'block' }} role="img" aria-label={`Motion playback: ${capture?.name || keyframe?.name}`}>
          {[...Array(9)].map((_, i) => <line key={'v' + i} x1={i * 20} y1="0" x2={i * 20} y2="140" stroke="rgba(233,228,214,0.14)" strokeWidth="0.4" />)}
          {[...Array(8)].map((_, i) => <line key={'h' + i} x1="0" y1={i * 20} x2="160" y2={i * 20} stroke="rgba(233,228,214,0.14)" strokeWidth="0.4" />)}
          <line x1="0" y1="124" x2="160" y2="124" stroke="rgba(233,228,214,0.5)" strokeWidth="0.8" opacity={0.5} />
          {boneLines.map((L, i) => (
            <polyline key={i} points={L.map(p => p.join(',')).join(' ')}
              stroke={color} strokeWidth={capture ? 2.2 : 6.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
          {head && <circle cx={head[0]} cy={head[1]} r={capture ? 4.5 : 7} fill={color} />}
          {markers.map((p, i) => <circle key={'m' + i} cx={p[0]} cy={p[1]} r={capture ? 1.1 : 1.9} fill="#E9E4D6" opacity={0.9} />)}
          {capture && statusLine.startsWith('LOADING') && (
            <text x="80" y="72" textAnchor="middle" fill="rgba(233,228,214,0.5)" fontSize="6" fontFamily="monospace" letterSpacing="1">LOADING CAPTURE…</text>
          )}
        </svg>
        <div className={`absolute top-2.5 left-3 ${TYPE.labelSm} font-black tracking-[0.14em] text-white/40`}>{artLabel}</div>
        {capture && (
          <div className={`absolute top-2.5 right-3 ${TYPE.labelSm} font-black tracking-[0.14em]`} style={{ color }}>{capture.credit}</div>
        )}
        <div className={`absolute bottom-2.5 right-3 ${TYPE.labelSm} font-black tracking-[0.14em]`} style={{ color }}>{statusLine}</div>
      </div>
    </div>
  );
};

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'collection' | 'plates' | 'motion' | 'timeline' | 'masters' | 'record' | 'feed';
type IconC = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
const TABS: { id: Tab; label: string; icon: IconC }[] = [
  { id: 'overview',   label: 'Overview',       icon: Compass },
  { id: 'collection', label: 'The Collection', icon: Boxes },
  { id: 'plates',     label: 'Plate Room',     icon: Layers },
  { id: 'motion',     label: 'Motion Lab',     icon: Activity },
  { id: 'timeline',   label: 'Timeline',       icon: Clock },
  { id: 'masters',    label: 'Masters',        icon: Users },
  { id: 'record',     label: 'The Record',     icon: ScrollText },
  { id: 'feed',       label: 'Feed',           icon: MessageSquare },
];

// ── Small shared pieces ───────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent }) => (
  <p className={`${TYPE.labelSm} font-black tracking-[0.3em]`} style={{ color: accent || ACCENT_2 }}>{children}</p>
);

const Tag: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <span className={`px-2.5 py-1 rounded-full ${TYPE.labelSm} font-black`}
    style={{ border: `1px solid ${color ? `${color}66` : 'rgba(255,255,255,0.12)'}`, color: color || 'rgba(255,255,255,0.5)', background: color ? `${color}14` : 'rgba(255,255,255,0.04)' }}>
    {children}
  </span>
);

// ── Image gallery with rights attribution ─────────────────────────────────────
const ImageGallery: React.FC<{ images: ArchiveImage[]; title: string }> = ({ images, title }) => {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;
  const img = images[Math.min(idx, images.length - 1)];
  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-black/40">
      <div className="relative aspect-video bg-black">
        <img key={img.url} src={img.url} alt={img.caption || title} loading="lazy" className="w-full h-full object-cover" />
        {images.length > 1 && (
          <>
            <button onClick={() => setIdx(i => (i - 1 + images.length) % images.length)} aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center hover:bg-black/80 transition-colors">
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => setIdx(i => (i + 1) % images.length)} aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center hover:bg-black/80 transition-colors">
              <ChevronRight size={15} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} aria-label={`Image ${i + 1}`}
                  className="w-1.5 h-1.5 rounded-full transition-all" style={{ background: i === idx ? ACCENT : 'rgba(255,255,255,0.3)' }} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="px-3.5 py-2.5 flex items-start justify-between gap-3">
        <p className="text-[11px] text-white/50 leading-snug">{img.caption}</p>
        <a href={img.pageUrl || img.url} target="_blank" rel="noreferrer"
          className="shrink-0 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors inline-flex items-center gap-1">
          {img.license} <ExternalLink size={9} />
        </a>
      </div>
      <p className="px-3.5 pb-2.5 -mt-1 text-[9px] text-white/25">{img.attribution}</p>
    </div>
  );
};

// ── Accession card ────────────────────────────────────────────────────────────
const ArtCard: React.FC<{ art: CombatArt; onOpen: () => void }> = ({ art, onOpen }) => {
  const col = FORM_COLORS[art.form];
  const hero = art.images[0];
  return (
    <motion.button layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onClick={onOpen}
      className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all flex flex-col"
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${col}66`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <div className="aspect-[16/10] bg-gradient-to-b from-white/5 to-black/50 relative overflow-hidden">
        {hero
          ? <img src={hero.url} alt={art.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : (
            <div className="w-full h-full flex items-end justify-center"
              style={{ background: `radial-gradient(120% 90% at 50% 110%, ${col}22 0%, transparent 60%)` }}>
              {art.pose
                ? <ActionFigure pose={art.pose} color={col} size={110} ghostColor="rgba(233,228,214,0.85)" />
                : <div className="w-full h-full flex items-center justify-center"><Glyph kind={art.glyph} color={col} size={64} /></div>}
            </div>
          )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <span className={`absolute top-2.5 right-3 ${TYPE.labelSm} font-black tracking-[0.14em] text-white/50`}>{art.code}</span>
        <div className="absolute bottom-2.5 left-3.5 right-3.5">
          <p className="text-lg font-black uppercase tracking-tight text-white leading-none">{art.name}</p>
          <p className={`${TYPE.labelSm} font-bold mt-1 text-white/60`}>{art.country}</p>
        </div>
      </div>
      <div className="p-3.5 flex flex-col flex-grow">
        <p className="text-[12px] text-white/50 leading-relaxed flex-grow line-clamp-3">{art.lede}</p>
        <div className="flex items-center gap-2 mt-3">
          <span className={`px-2 py-0.5 rounded-full ${TYPE.labelSm} font-black tracking-[0.08em]`} style={{ border: `1px solid ${col}`, color: col }}>
            {art.form.toUpperCase()}
          </span>
          <span className={`${TYPE.labelSm} text-white/35`}>{art.era}</span>
        </div>
      </div>
    </motion.button>
  );
};

// ── Accession detail overlay ──────────────────────────────────────────────────
const ArtDetail: React.FC<{ art: CombatArt; onClose: () => void }> = ({ art, onClose }) => {
  const col = FORM_COLORS[art.form];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const Block: React.FC<{ title: string; accent?: string; children: React.ReactNode }> = ({ title, accent, children }) => (
    <div>
      <SectionLabel accent={accent}>{title.toUpperCase()}</SectionLabel>
      <p className="text-[14px] leading-relaxed text-white/60 mt-2">{children}</p>
    </div>
  );
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <motion.div initial={{ x: 60, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${art.name} — accession detail`}
        className="h-full overflow-y-auto scrollbar-hide w-full max-w-2xl bg-[#0d0d12] border-l border-white/12">
        {/* header */}
        <div className="px-6 pt-6 pb-5 border-b border-white/8 bg-white/[0.03] sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0">
                {art.pose
                  ? <ActionFigure pose={art.pose} color={col} size={64} ghostColor="rgba(233,228,214,0.7)" />
                  : <Glyph kind={art.glyph} color={col} size={56} />}
              </div>
              <div className="min-w-0">
                <p className={`${TYPE.labelSm} font-black tracking-[0.16em] text-white/40`}>{art.code} · {art.region.toUpperCase()}</p>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none mt-0.5">{art.name}</h2>
                <p className={`${TYPE.labelSm} text-white/40 mt-1 truncate`}>{art.alt}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="tap shrink-0 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70"><X size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Tag color={col}>{art.form}</Tag>
            <Tag>{art.country}</Tag>
            <Tag>{art.people}</Tag>
            <Tag>{art.era}</Tag>
          </div>
        </div>

        <div className="px-6 py-6 space-y-7 pb-16">
          <p className="text-[16px] leading-relaxed text-white/85">{art.lede}</p>

          {art.images.length > 0 && <ImageGallery images={art.images} title={art.name} />}

          <Block title="History">{art.history}</Block>
          <Block title="Technique">{art.technique}</Block>
          <Block title="Ritual & Culture" accent={ACCENT}>{art.ritual}</Block>

          <div>
            <SectionLabel>MASTERS & KEEPERS</SectionLabel>
            <div className="space-y-2.5 mt-3">
              {art.masters.map((m, i) => (
                <div key={i} className="rounded-xl p-3.5 bg-white/[0.03] border border-white/6">
                  <p className="text-[14px] font-black text-white">{m.name}</p>
                  <p className="text-[12px] text-white/50 leading-relaxed mt-0.5">{m.note}</p>
                </div>
              ))}
            </div>
          </div>

          <Block title="Diaspora & Connections" accent="#5B6EA8">{art.diaspora}</Block>

          {art.videos.length > 0 && (
            <div>
              <SectionLabel accent={ACCENT}>WATCH</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {art.videos.map((v, i) => (
                  <YouTubeEmbed key={v.youtubeId || i} id={v.youtubeId} title={v.title} channel={v.channel} query={v.query} accent={col} compact />
                ))}
              </div>
            </div>
          )}

          {art.links.length > 0 && (
            <div className="space-y-2">
              {art.links.map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
                  className={`block rounded-xl px-4 py-3 border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all ${TYPE.labelSm} font-black tracking-[0.08em]`}
                  style={{ color: ACCENT }}>
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}

          <div>
            <SectionLabel>SOURCES ON FILE</SectionLabel>
            <ul className="mt-3 space-y-1.5">
              {art.sources.map((sx, i) => (
                <li key={i} className={`${TYPE.labelSm} text-white/40 leading-relaxed`}>— {sx}</li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-white/8">
            <AssetActions accent={ACCENT} asset={{
              kind: 'artifact', title: art.name,
              subtitle: [art.country, art.form].join(' · '),
              description: art.lede, imageUrl: art.images[0]?.url,
              sourceUrl: art.wikiSlug ? `https://en.wikipedia.org/wiki/${art.wikiSlug}` : art.links[0]?.url,
              discipline: 'Combat Atlas', interests: [art.region, art.form],
            }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; currentUser?: any }

const CombatAtlasView: React.FC<Props> = ({ onBack, currentUser }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [wing, setWing] = useState<WingId | 'all'>('all');
  const [region, setRegion] = useState<string>('All');
  const [form, setForm] = useState<CombatForm | 'All'>('All');
  const [active, setActive] = useState<CombatArt | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (tab !== 'feed') return;
    return listenToGlobalPosts(setPosts);
  }, [tab]);
  const atlasPosts = useMemo(() => posts.filter(p => p.tags?.includes('combatatlas')), [posts]);

  const wingArts = wing === 'all' ? COMBAT_ARTS : COMBAT_ARTS.filter(a => a.wing === wing);
  const wingRegions = Array.from(new Set(wingArts.map(a => a.region)));
  const filtered = wingArts.filter(a =>
    (region === 'All' || a.region === region) && (form === 'All' || a.form === form));

  const pickWing = (w: WingId | 'all') => { setWing(w); setRegion('All'); };
  const mediaCount = COMBAT_ARTS.reduce((n, a) => n + a.images.length + a.videos.length, 0);

  return (
    <div className="min-h-screen text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-60px] left-[8%] w-[460px] h-[460px] rounded-full blur-[120px]" style={{ background: `${ACCENT_2}20` }} />
          <div className="absolute bottom-[-80px] right-[4%] w-[380px] h-[380px] rounded-full blur-[100px]" style={{ background: `${ACCENT}1c` }} />
          {/* Baqet III's wrestlers, drifting behind the title — the museum's own
              holding doing the atmospheric work. Masked so the text stays clean. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-6 h-[62%] opacity-[0.09]"
            style={{
              backgroundImage: 'url(/atlas/hero-wrestlers.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
              WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 40%, #000 70%, transparent)',
              maskImage: 'linear-gradient(180deg, transparent, #000 40%, #000 70%, transparent)',
            }}
          />
        </div>
        <div className="relative px-5 sm:px-6 pt-8 pb-4 max-w-7xl mx-auto">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-5">
            <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
          </button>
          <p className={`${TYPE.labelSm} font-black tracking-[0.4em]`} style={{ color: ACCENT }}>PLAJAH HERITAGE ARCHIVE · VOLS. I–V</p>
          <h1 className="font-black uppercase tracking-tighter mt-1 flex items-center gap-3" style={{ fontSize: 'clamp(2rem, 7vw, 3rem)' }}>
            <Swords size={38} style={{ color: ACCENT_2 }} /> The Living Combat Atlas
          </h1>
          <p className="text-sm text-white/45 mt-2 max-w-2xl">
            <span style={{ color: ACCENT_2 }}>The body as the archive.</span> Humanity’s combat knowledge was written in muscle,
            rhythm, ritual — and sometimes in ink. Five wings, {COMBAT_ARTS.length} accessions: Africa’s living arts and their diaspora arc,
            Asia’s systematized canons, Europe’s fight books, the Americas’ creole inventions, and the Pacific’s warrior knowledge —
            every tradition given the same museum treatment.
          </p>
          {/* The signature band: Baqet III's wrestling registers, cut from our own
              1893 plate and tinted in the museum's laterite→ochre. Sits below the
              text so it reads at full strength without fighting the title. */}
          <div className="relative mt-6 -mx-5 sm:-mx-6">
            <div
              aria-hidden
              className="h-[92px] sm:h-[130px]"
              style={{
                WebkitMaskImage: 'url(/atlas/hero-wrestlers.png), linear-gradient(90deg, transparent, #000 8%, #000 88%, transparent)',
                maskImage: 'url(/atlas/hero-wrestlers.png), linear-gradient(90deg, transparent, #000 8%, #000 88%, transparent)',
                WebkitMaskSize: 'auto 100%, 100% 100%',
                maskSize: 'auto 100%, 100% 100%',
                WebkitMaskRepeat: 'repeat-x, no-repeat',
                maskRepeat: 'repeat-x, no-repeat',
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
                background: `linear-gradient(90deg, ${ACCENT_2} 0%, ${ACCENT_2} 30%, ${ACCENT} 72%, #E9E4D6 100%)`,
              }}
            />
            <p className={`${TYPE.labelSm} font-black tracking-[0.2em] px-5 sm:px-6 mt-1.5`} style={{ color: 'rgba(255,255,255,0.28)' }}>
              BAQET III, TOMB 15, BENI HASAN · c. 2000 BCE · PLAJAH HOLDINGS
            </p>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-black/40 border-y border-white/8">
        <div className="max-w-7xl mx-auto px-3 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(t => {
            const Icon = t.icon; const activeT = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-3.5 ${TYPE.labelSm} font-black transition-all border-b-2`}
                style={activeT ? { color: ACCENT, borderColor: ACCENT } : { color: 'rgba(255,255,255,0.4)', borderColor: 'transparent' }}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-6">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Living Arts', value: COMBAT_ARTS.length, icon: Swords, to: 'collection' as Tab },
                { label: 'Years of Record', value: '4,000+', icon: Clock, to: 'timeline' as Tab },
                { label: 'Masters & Keepers', value: COMBAT_FIGURES.length, icon: Users, to: 'masters' as Tab },
                { label: 'Archive Assets', value: `${mediaCount}+`, icon: Film, to: 'collection' as Tab },
              ].map(sx => (
                <button key={sx.label} onClick={() => setTab(sx.to)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left hover:bg-white/[0.06] transition-all">
                  <sx.icon size={18} style={{ color: ACCENT }} />
                  <p className="text-2xl font-black mt-2 tabular-nums">{sx.value}</p>
                  <p className={`${TYPE.labelSm} font-black text-white/40`}>{sx.label}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { t: 'The Collection', d: 'Every accession — from tomb-wall stick fencing to stadium wrestling — with verified imagery, documentary film, ritual context and cited sources.', icon: Boxes, to: 'collection' as Tab },
                { t: 'The Plate Room', d: 'Beni Hasan, Tomb 15: the wall that teaches wrestling. Read the real 1893 plates register by register at scan resolution — every hold, entry and throw.', icon: Layers, to: 'plates' as Tab },
                { t: 'The Motion Lab', d: 'Technique as living data — a playable motion prototype, the open mocap shelf, and the three-tier capture program toward volumetric exhibits.', icon: Activity, to: 'motion' as Tab },
                { t: 'Four Thousand Years', d: 'From the Beni Hasan murals to the Arène Nationale: the timeline from tomb wall to stadium stream.', icon: Clock, to: 'timeline' as Tab },
                { t: 'Masters & Keepers', d: 'Bimba and Pastinha, Shaka and Mandela, champions and scholars — the people who carried the arts, with living biographies.', icon: Users, to: 'masters' as Tab },
                { t: 'The Documentary Record', d: 'Where the evidence lives: the benchmark scholarship, the oldest fight manual on Earth, the diaspora’s own fight books.', icon: ScrollText, to: 'record' as Tab },
                { t: 'Open Archives', d: 'The public-domain Beni Hasan volumes, the Met’s CC0 collections, UNESCO inscriptions — every archive free to explore.', icon: Landmark, to: 'record' as Tab },
                { t: 'The Feed', d: 'The Atlas’s own community wall — share an art, a bout, a lineage, a question.', icon: MessageSquare, to: 'feed' as Tab },
              ].map(c => (
                <button key={c.t} onClick={() => setTab(c.to)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-left hover:bg-white/[0.06] transition-all group">
                  <c.icon size={22} style={{ color: ACCENT }} />
                  <p className="text-[15px] font-black mt-3 flex items-center gap-1.5">{c.t} <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" /></p>
                  <p className="text-[12px] text-white/45 leading-relaxed mt-1">{c.d}</p>
                </button>
              ))}
            </div>

            {/* The full museum — wings */}
            <div>
              <SectionLabel accent={ACCENT}>THE FULL MUSEUM — EVERY TRADITION, THE SAME TREATMENT</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {ATLAS_WINGS.map(w => {
                  const count = COMBAT_ARTS.filter(a => a.wing === w.id).length;
                  return (
                    <button key={w.id} onClick={() => { pickWing(w.id); setTab('collection'); }}
                      className="rounded-xl px-4 py-3 text-left transition-all hover:bg-white/[0.06]"
                      style={{ border: `1px solid ${ACCENT}55`, background: `${ACCENT}0d` }}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[14px] font-black">{w.name}</p>
                        <span className={`${TYPE.labelSm} font-black shrink-0`} style={{ color: ACCENT }}>{w.volume}</span>
                      </div>
                      <p className={`${TYPE.labelSm} font-black tracking-[0.16em] mt-1`} style={{ color: ACCENT }}>
                        OPEN — {count} ACCESSION{count === 1 ? '' : 'S'}
                      </p>
                      <p className="text-[11px] text-white/40 leading-relaxed mt-1.5">{w.blurb}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* COLLECTION */}
        {tab === 'collection' && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`${TYPE.labelSm} font-black tracking-[0.14em] text-white/40 mr-1`}>WING</span>
              <button onClick={() => pickWing('all')}
                className={`px-3 py-1 rounded-full ${TYPE.labelSm} font-black transition-all`}
                style={wing === 'all'
                  ? { background: ACCENT_2, color: '#12141C', border: `1px solid ${ACCENT_2}` }
                  : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
                The Full Museum
              </button>
              {ATLAS_WINGS.map(w => (
                <button key={w.id} onClick={() => pickWing(w.id)}
                  className={`px-3 py-1 rounded-full ${TYPE.labelSm} font-black transition-all`}
                  style={wing === w.id
                    ? { background: ACCENT_2, color: '#12141C', border: `1px solid ${ACCENT_2}` }
                    : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
                  {w.volume} · {w.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`${TYPE.labelSm} font-black tracking-[0.14em] text-white/40 mr-1`}>REGION</span>
              {['All', ...wingRegions].map(r => (
                <button key={r} onClick={() => setRegion(r)}
                  className={`px-3 py-1 rounded-full ${TYPE.labelSm} font-black transition-all`}
                  style={region === r
                    ? { background: ACCENT, color: '#12141C', border: `1px solid ${ACCENT}` }
                    : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
                  {r === 'All' ? 'All Regions' : r}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`${TYPE.labelSm} font-black tracking-[0.14em] text-white/40 mr-1`}>FORM</span>
              {(['All', ...COMBAT_FORMS] as const).map(f => {
                const col = f === 'All' ? ACCENT : FORM_COLORS[f as CombatForm];
                const on = form === f;
                return (
                  <button key={f} onClick={() => setForm(f as CombatForm | 'All')}
                    className={`px-3 py-1 rounded-full ${TYPE.labelSm} font-black transition-all`}
                    style={on
                      ? { background: col, color: '#12141C', border: `1px solid ${col}` }
                      : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
                    {f === 'All' ? 'All Forms' : f}
                  </button>
                );
              })}
            </div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-black uppercase tracking-tight">
                {wing === 'all' ? 'The Collection' : ATLAS_WINGS.find(w => w.id === wing)?.name}
              </h2>
              <span className={`${TYPE.labelSm} text-white/40`}>{filtered.length} of {COMBAT_ARTS.length} accessions</span>
            </div>
            <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="1rem">
              {filtered.map(a => <ArtCard key={a.id} art={a} onOpen={() => setActive(a)} />)}
            </AdaptiveGrid>
            {filtered.length === 0 && (
              <p className={`${TYPE.labelSm} text-white/35 py-8 text-center`}>No accessions match these filters — clear a filter to keep exploring.</p>
            )}
          </div>
        )}

        {/* PLATE ROOM */}
        {tab === 'plates' && (
          <div className="rounded-3xl overflow-hidden" style={{ background: MURAL.plaster, color: MURAL.umber }}>
            <div className="px-6 sm:px-8 py-10">
              <p className={`${TYPE.labelSm} font-black tracking-[0.22em]`} style={{ color: MURAL.red }}>THE PLATE ROOM</p>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1" style={{ color: MURAL.ink }}>
                Beni Hasan: the wall that teaches wrestling
              </h2>
              <p className="text-[14px] leading-relaxed mt-3 max-w-3xl" style={{ color: MURAL.body }}>
                On the east wall of Tomb 15 at Beni Hasan (c. 2000 BCE), hundreds of paired wrestlers were painted in
                contrasting shades — one figure light, one dark — so every hold, lift and throw reads clearly, frame by
                frame. Below are <span className="font-black">the actual plates</span>, drawn from Plajah’s own copy of
                Newberry’s 1893 survey and served at scan resolution: read a register left to right, or open the whole sheet.
              </p>

              {/* The real plates */}
              <div className="mt-6">
                <React.Suspense fallback={<div className="py-16 text-center" style={{ color: MURAL.caption }}>Opening the plate room…</div>}>
                  <PlateViewer />
                </React.Suspense>
              </div>

              {/* The facsimile sequence, now framed as the museum's own reading of the wall */}
              <div className="mt-10 pt-6" style={{ borderTop: `1px solid ${MURAL.umber}33` }}>
                <p className={`${TYPE.labelSm} font-black tracking-[0.22em]`} style={{ color: MURAL.red }}>THE SEQUENCE, REDRAWN</p>
                <p className="text-[13px] leading-relaxed mt-1.5 max-w-2xl" style={{ color: MURAL.body }}>
                  Five holds from the wall, redrawn clean — the throw as the painters diagrammed it, stripped of
                  four thousand years of wear.
                </p>
                <div className="grid gap-5 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  {PLATE_PAIRS.map((p, i) => <PlatePair key={i} pair={p} index={i} />)}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-8">
                  <p className={`${TYPE.labelSm} font-black tracking-[0.1em]`} style={{ color: MURAL.caption }}>
                    ORIGINAL RENDERING © PLAJAH, AFTER NEWBERRY · TOMB 15, BAQET III, EAST WALL
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a href={holdingUrl('beni-hasan/beni-hasan-v.-2/Beni Hasan v.2.pdf')} target="_blank" rel="noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${TYPE.labelSm} font-black tracking-[0.08em]`}
                      style={{ background: MURAL.umber, color: MURAL.plaster }}>
                      FULL VOLUME — PLAJAH HOLDINGS <ExternalLink size={10} />
                    </a>
                    <a href="https://archive.org/details/beni-hasan-v.-2" target="_blank" rel="noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${TYPE.labelSm} font-black tracking-[0.08em]`}
                      style={{ border: `1px solid ${MURAL.umber}`, color: MURAL.umber }}>
                      SOURCE SCAN <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MOTION LAB */}
        {tab === 'motion' && (
          <div className="space-y-6">
            <div>
              <SectionLabel accent={ACCENT}>THE MOTION LAB</SectionLabel>
              <h2 className="text-2xl font-black uppercase tracking-tight mt-1">Technique as living data</h2>
              <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-2xl">
                The archive’s kinetic layer: techniques rendered as playable motion, not still images. The player
                streams <span className="text-white/80 font-bold">real capture data</span> — fighting sequences from the
                CMU Graphics Lab, decoded through a forward-kinematics BVH parser — alongside the original keyframe
                sketches. Next: Plajah’s own commissioned captures of the African arts, with 4D volumetric playback as
                the flagship exhibit format.
              </p>
            </div>
            <MotionLabPlayer />
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
              <div className="rounded-xl p-4 border border-white/8 bg-white/[0.02]">
                <p className={`${TYPE.labelSm} font-black tracking-[0.16em]`} style={{ color: ACCENT }}>VERIFIED OPEN DATA — NOW PLAYING</p>
                <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">
                  The karate and boxing clips above stream from the CMU Graphics Lab Motion Capture Database
                  (~2,500 motions, free for any use) — the production-legal shelf. UMONS-TAICHI, the finest kinetic
                  record of any traditional art (2,200 captures, 68 markers @ 179 Hz, skill-ranked by teachers), is
                  <span className="text-white/70"> licensed CC BY-NC-SA and therefore withheld here</span> — we have
                  asked its authors for terms rather than stretch theirs.
                </p>
                <p className="text-[10px] text-white/30 leading-relaxed mt-2">
                  Data from mocap.cs.cmu.edu, funded by NSF EIA-0196217
                </p>
              </div>
              <div className="rounded-xl p-4 border border-white/8 bg-white/[0.02]">
                <p className={`${TYPE.labelSm} font-black tracking-[0.16em]`} style={{ color: ACCENT }}>VOLUMETRIC TARGET</p>
                <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">
                  4D Gaussian Splatting playback — free-viewpoint performance video on desktop, mobile and XR,
                  capturable in the field with portable ~10-camera rigs. A Laamb arène or kalari pit, not just a lab.
                </p>
              </div>
              <div className="rounded-xl p-4 border border-white/8 bg-white/[0.02]">
                <p className={`${TYPE.labelSm} font-black tracking-[0.16em]`} style={{ color: ACCENT_2 }}>THE PLAJAH MOAT</p>
                <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">
                  No motion dataset of Dambe, Laamb, Engolo, or Nguni fighting exists anywhere. The first institution
                  to capture the kinetic record doesn’t join the field — it founds it.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <SectionLabel accent={ACCENT}>THE CAPTURE PROGRAM — THREE TIERS</SectionLabel>
              <div className="grid sm:grid-cols-3 gap-4 mt-3">
                {[
                  { t: 'Tier 1 — Video-to-motion', d: 'Own-shot or licensed multi-angle video → GVHMR-class reconstruction → BVH/FBX into this player. First targets: Taijiquan (validated against UMONS-TAICHI), then Dambe and Laamb from commissioned field video.' },
                  { t: 'Tier 2 — Field capture', d: 'Inertial-suit or markerless multi-camera capture on location: clean skeletal data for technique libraries and teacher-vs-student skill comparison, feeding the Labs education layer.' },
                  { t: 'Tier 3 — Volumetric 4DGS', d: 'Portable rig sessions with master practitioners — free-viewpoint “walk around the technique” exhibits, recorded under signed releases with revenue-share terms; masters credited as co-authors of their accessions.' },
                ].map(c => (
                  <div key={c.t}>
                    <p className="text-[13px] font-black text-white">{c.t}</p>
                    <p className="text-[11.5px] text-white/45 leading-relaxed mt-1">{c.d}</p>
                  </div>
                ))}
              </div>
            </div>
            <Mudcloth />
          </div>
        )}

        {/* TIMELINE */}
        {tab === 'timeline' && (
          <div className="space-y-3">
            <div className="mb-5">
              <SectionLabel accent={ACCENT}>FOUR THOUSAND YEARS</SectionLabel>
              <h2 className="text-2xl font-black uppercase tracking-tight mt-1">From tomb wall to stadium stream</h2>
            </div>
            {COMBAT_TIMELINE.map((t, i) => (
              <motion.div key={t.era + t.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="grid gap-3 sm:gap-5 py-3.5 border-b border-white/6" style={{ gridTemplateColumns: '110px 1fr' }}>
                <span className={`${TYPE.labelSm} font-black pt-0.5`} style={{ color: ACCENT_2 }}>{t.era}</span>
                <div>
                  <p className="text-[15px] font-black uppercase tracking-tight">{t.label}</p>
                  <p className="text-[12.5px] text-white/50 leading-relaxed mt-1">{t.note}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* MASTERS */}
        {tab === 'masters' && (
          <MuseumHall eyebrow="The Heritage Archive" title="Masters & Keepers"
            intro="The founders, champions, rulers and scholars who carried Africa’s combat knowledge — each enriched with a live biography and portrait."
            halls={COMBAT_FIGURE_HALLS} figures={COMBAT_FIGURES} accent={ACCENT} icon={Swords} shareDiscipline="Combat Atlas" />
        )}

        {/* THE RECORD */}
        {tab === 'record' && (
          <div className="space-y-8">
            <div>
              <SectionLabel accent={ACCENT}>THE DOCUMENTARY RECORD</SectionLabel>
              <h2 className="text-2xl font-black uppercase tracking-tight mt-1">Where the evidence lives</h2>
              <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-2xl">
                African martial knowledge traveled mostly by oral transmission and embodied practice — but the written and painted
                record is deeper than the myth of “no documentation” suggests. Every claim below is verified.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                {COMBAT_SCHOLARSHIP.map(sc => (
                  <div key={sc.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                    <p className={`${TYPE.labelSm} font-black tracking-[0.18em]`} style={{ color: ACCENT_2 }}>{sc.tag}</p>
                    <h3 className="text-[16px] font-black leading-tight mt-2">{sc.title}</h3>
                    <p className="text-[12.5px] text-white/50 leading-relaxed mt-2">{sc.body}</p>
                    {sc.url && (
                      <a href={sc.url} target="_blank" rel="noreferrer"
                        className={`inline-flex items-center gap-1.5 mt-3 ${TYPE.labelSm} font-black text-white/40 hover:text-white transition-colors`}>
                        Open source <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel accent={ACCENT}>PLAJAH HOLDINGS — ACCESSIONED & SELF-HOSTED</SectionLabel>
              <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-2xl">
                The museum no longer only points at other institutions’ servers. {HOLDINGS_STATS.assets} assets
                ({HOLDINGS_STATS.volumes} public-domain Beni Hasan volumes and {HOLDINGS_STATS.metObjects} CC0 Met
                artifact photographs, {HOLDINGS_STATS.sizeLabel}) are ingested into Plajah’s own storage, each indexed
                with its rights record — licence, attribution and verification date — so provenance travels with the file.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
                {PLAJAH_HOLDINGS.map(h => (
                  <a key={h.path} href={holdingUrl(h.path)} target="_blank" rel="noreferrer"
                    className="rounded-2xl border bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block"
                    style={{ borderColor: `${ACCENT}44` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers size={14} className="shrink-0" style={{ color: ACCENT }} />
                        <p className="text-[14px] font-black text-white truncate">{h.label}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${TYPE.labelSm} font-black text-white/45 shrink-0`}>{h.access}</span>
                    </div>
                    <p className="text-[12px] text-white/45 mt-1.5 leading-relaxed">{h.note}</p>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel accent={ACCENT}>OPEN ARCHIVES — THE ACQUISITIONS SHELF</SectionLabel>
              <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-2xl">
                The museum’s first holdings: public-domain and CC0 collections, every one free to explore and legally clear to build on.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
                {COMBAT_ARCHIVES.map(sx => (
                  <a key={sx.name} href={sx.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0"><ScrollText size={14} className="shrink-0" style={{ color: ACCENT }} /><p className="text-[14px] font-black text-white truncate">{sx.name}</p></div>
                      <span className={`px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${TYPE.labelSm} font-black text-white/45 shrink-0`}>{sx.access}</span>
                    </div>
                    <p className="text-[10px] text-white/35 mt-0.5">{sx.org}</p>
                    <p className="text-[12px] text-white/45 mt-1.5 leading-relaxed">{sx.desc}</p>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="flex items-center gap-2"><Scale size={14} style={{ color: ACCENT }} /><SectionLabel accent={ACCENT}>RIGHTS & THE CITATION-ONLY SHELF</SectionLabel></div>
              <p className="text-[12px] text-white/45 leading-relaxed mt-2 max-w-3xl">
                Every image in the Atlas carries its license and credit inline — only public-domain, CC0 and Creative Commons
                attribution licenses are accessioned. The works below are under copyright: the Atlas cites and summarizes them, never ingests them.
              </p>
              <ul className="mt-3 space-y-1.5">
                {CITATION_ONLY_SHELF.map(c => (
                  <li key={c.title} className={`${TYPE.labelSm} text-white/40`}>— {c.title} <span className="text-white/25">({c.use})</span></li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* FEED */}
        {tab === 'feed' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder="Share an art, a bout, a lineage, or a question about Africa’s fighting traditions…"
                avatarUrl={auth.currentUser.photoURL || undefined}
                onPost={async (data: any) => {
                  const media = (await Promise.all((data.attachments || []).map(async (att: any) => {
                    if (att.file && att.url?.startsWith('blob:')) {
                      try { const url = await uploadFile(`posts/${auth.currentUser!.uid}/${Date.now()}_${att.file.name}`, att.file); return { type: att.type, url, title: att.title }; }
                      catch { return null; }
                    }
                    return { type: att.type, url: att.url, title: att.title };
                  }))).filter(Boolean) as { type: 'PHOTO' | 'VIDEO' | 'AUDIO'; url: string; title?: string }[];
                  await createPost({
                    text: `#CombatAtlas ${data.text}`,
                    isPublic: true,
                    tags: ['combatatlas'],
                    ...(data.theme && data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                    ...(media.length > 0 ? { media } : {}),
                  } as any);
                }}
              />
            )}
            {atlasPosts.length > 0 ? (
              <div className="space-y-3">{atlasPosts.map(p => <PostCard key={p.id} post={p} />)}</div>
            ) : (
              <div className="py-16 text-center">
                <MessageSquare size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No Combat Atlas posts yet</p>
                <p className="text-[10px] text-white/15 mt-1">Be the first to share something about Africa’s fighting traditions</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="max-w-7xl mx-auto px-5 sm:px-6 pb-10">
        <p className={`${TYPE.labelSm} text-white/25 border-t border-white/6 pt-4`}>
          PLAJAH HERITAGE ARCHIVE — a study repository, not a training substitute. Sources cited per accession; media licensed PD / CC0 / CC-BY(-SA) with credit inline.
        </p>
      </div>

      <AnimatePresence>
        {active && <ArtDetail art={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default CombatAtlasView;
