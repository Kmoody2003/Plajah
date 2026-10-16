// services/ambo/worshipVisualizers/types.ts
// Core types, Art Director Council lenses, liturgical audio intelligence,
// and multi-plane rendering toolkit for the 72 Church, Worship, Praise, Hymnal & Scripture Visualizers.

import type { LyricLine, LyricFrame, LyricWord } from '../lyricStyles';
import { WORSHIP_BUILDS } from './builds';
import {
  punchHex,
  drawCinematicBokeh,
  drawFilmLightLeaks,
  drawOpticalLensFlare,
  drawPrismCaustics,
  drawTactileTextureOverlay,
  drawGothicRoseWindow,
  drawCathedralArcade,
  drawKintsugiFractureNetwork,
  drawSacredAstrolabe,
  drawSanctuaryCenserLamp,
  renderCouncilOpticalPass,
} from './cinematicFx';

export {
  punchHex,
  drawCinematicBokeh,
  drawFilmLightLeaks,
  drawOpticalLensFlare,
  drawPrismCaustics,
  drawTactileTextureOverlay,
  drawGothicRoseWindow,
  drawCathedralArcade,
  drawKintsugiFractureNetwork,
  drawSacredAstrolabe,
  drawSanctuaryCenserLamp,
  renderCouncilOpticalPass,
};

export type CouncilDirector =
  | 'Classical Mind'
  | 'Baroque Dramatist'
  | 'Radical Minimalist'
  | 'Futurist'
  | 'World-Eclectic Traveller'
  | 'Rebellious Hand';

export const COUNCIL_DIRECTORS: CouncilDirector[] = [
  'Classical Mind',
  'Baroque Dramatist',
  'Radical Minimalist',
  'Futurist',
  'World-Eclectic Traveller',
  'Rebellious Hand',
];

export function buildWorshipLyricFrame(
  lines: LyricLine[],
  pos: number,
  w: number,
  h: number,
  meta: { title?: string; artist?: string; bpm?: number } = {},
): LyricFrame {
  const safeLines = lines.length ? lines : [{ time: 0, text: '' }];
  let idx = 0;
  for (let i = 0; i < safeLines.length; i++) {
    if (safeLines[i].time <= pos) idx = i;
  }
  const nextTime = safeLines[idx + 1]?.time ?? safeLines[idx].time + 4.2;
  const dur = Math.max(0.8, nextTime - safeLines[idx].time);
  const tIn = Math.max(0, pos - safeLines[idx].time);
  const prog = Math.min(1, tIn / dur);
  const parts = safeLines[idx].text.split(/\s+/).filter(Boolean);
  const words: LyricWord[] = parts.map((text, wi) => {
    const start = (wi / Math.max(1, parts.length)) * dur * 0.85;
    const end = ((wi + 1) / Math.max(1, parts.length)) * dur * 0.85;
    const p = tIn <= start ? 0 : tIn >= end ? 1 : (tIn - start) / Math.max(0.05, end - start);
    return { text, start, end, p };
  });
  const beat = meta.bpm ? ((pos * meta.bpm) / 60) % 1 : undefined;
  return {
    w,
    h,
    pos,
    lines: safeLines,
    idx,
    tIn,
    dur,
    prog,
    words,
    titleCard: false,
    titleAlpha: 0,
    title: meta.title,
    artist: meta.artist,
    beat,
  };
}

export type WorshipCategory = 'calm-lyric' | 'uptempo-lyric' | 'scripture-reading';

export type WorshipSubgenre =
  | 'Scenic Nature'
  | 'Sacred Architecture'
  | 'Contemporary Abstract'
  | 'Contemplative Light'
  | 'Joyful Praise'
  | 'Gospel & Choir'
  | 'Hymnal & Pipe Organ'
  | 'Acoustic & Revival'
  | 'Illuminated Manuscript'
  | 'Biblical Landscape'
  | 'Sanctuary & Cloister'
  | 'Sacred Geometry';

export interface WorshipAudioState {
  /** Smoothed slow breathing envelope (0..1) — never strobes. */
  swell: number;
  /** Low-end warmth / bass foundation (0..1). */
  bass: number;
  /** Warm vocal / midrange formant presence (0..1). */
  vocal: number;
  /** Harmonic chord fullness / organ / pad sustain (0..1). */
  harmonic: number;
  /** High-frequency shimmer: acoustic strings, tambourine, air, room reverb (0..1). */
  shimmer: number;
  /** Spring-damped rhythmic pulse for uptempo praise & hymns (0..1). */
  pulse: number;
  /** Handclap / snare / backbeat warm accent (0..1). */
  clap: number;
  /** Continuous beat phase (0..1) locked to tempo. */
  beatPhase: number;
  /** Total beat count since start. */
  beatCount: number;
  /** 16-band smoothed spectrum (0..1) for harmonic/organ/choir bars. */
  bands: number[];
}

export interface WorshipScriptureSample {
  reference: string;
  translation: string;
  text: string;
  context: string[];
}

export interface WorshipRenderParams {
  /** Motion speed multiplier (0..1, default 0.5). */
  motion: number;
  /** Color temperature shift: 0 = cool dawn, 0.5 = neutral, 1 = candlelit gold. */
  warmth: number;
  /** Audio reactivity intensity (0..1, default 0.75). */
  reactivity: number;
  /** Text-safe center/reading band dimming (0..1, default 0.45). */
  textSafe: number;
  /** Whether to render the lyric / scripture typography overlay (default true). */
  showText: boolean;
  /** 35mm Kodak film light leaks & prismatic edge bleed intensity (0..1, default 0.72). */
  lightLeaks?: number;
  /** Anamorphic lens flare & polygonal aperture bokeh intensity (0..1, default 0.76). */
  bokehFlare?: number;
  /** Tactile 35mm film grain, linen weave & gold-leaf texture intensity (0..1, default 0.58). */
  textureGrain?: number;
  /** Contemporary chromatic punch & vibrance boost (0..1, default 0.78). */
  colorPunch?: number;
  /** Automatic optical & Gemini art plate compositing blend (0..1, default 0.38). */
  plateBlend?: number;
}

export interface WorshipRenderContext {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Elapsed time in seconds. */
  t: number;
  audio: WorshipAudioState;
  params: WorshipRenderParams;
  /** Optional reference to the active visualizer definition for Council optical passes. */
  visualizer?: WorshipVisualizerDef;
  /** Active lyric frame (for calm-lyric and uptempo-lyric visualizers). */
  lyricFrame?: LyricFrame;
  /** Active scripture sample (for scripture-reading visualizers). */
  scripture?: WorshipScriptureSample;
  /** Active word highlight index during scripture reading (-1 if none). */
  scriptureWordIndex?: number;
}

export interface WorshipVisualizerDef {
  id: string;
  number: number; // 1..72
  category: WorshipCategory;
  subgenre: WorshipSubgenre;
  /**
   * Hand override of the Council voice. Normally unset: the lead the Art Council cast in this visualizer's
   * deliberation (`WORSHIP_COUNCIL_BUILDS`, see councilBuilds.ts) is the director of record.
   */
  director?: CouncilDirector;
  /** Hand override of the Art Council critique. Normally unset: Aria's direction from the council build is used. */
  councilNote?: string;
  name: string;
  subtitle: string;
  description: string;
  lightingNote: string;
  serviceUse: string;
  palette: [string, string, string, string];
  /** Optional Gemini-generated concept art reference plate path. */
  conceptImage?: string;
  /** Audio-reactive mapping badges shown in the gallery. */
  audioMappings: [string, string][];
  /** Main render function drawing both the audio-reactive scene and integrated typography. */
  render: (rc: WorshipRenderContext) => void;
}

export const COUNCIL_DIRECTOR_META: Record<CouncilDirector, {
  icon: string;
  title: string;
  ethos: string;
  color: string;
}> = {
  'Classical Mind': {
    icon: '🏛️',
    title: 'Classical Mind',
    ethos: 'Palladian & Gothic proportion, ashlar stone masonry, Romanesque arches, Trajanic rules.',
    color: '#D4AF37',
  },
  'Baroque Dramatist': {
    icon: '🕯️',
    title: 'Baroque Dramatist',
    ethos: 'Caravaggio & La Tour chiaroscuro, single-source beeswax candle grazing, volumetric incense.',
    color: '#F29F38',
  },
  'Radical Minimalist': {
    icon: '◯',
    title: 'Radical Minimalist',
    ethos: 'Turrell & Zumthor negative space, 3-plane bokeh motes, single breathing horizon.',
    color: '#88C8F7',
  },
  'Futurist': {
    icon: '✦',
    title: 'Futurist',
    ethos: 'Harmonic standing waves, astrolabe verniers, Cauchy prism refraction, sacred geometry.',
    color: '#5CE1E6',
  },
  'World-Eclectic Traveller': {
    icon: '🌿',
    title: 'World-Eclectic Traveller',
    ethos: 'Biblical landscapes of Galilee, Gethsemane, Qumran linen, Byzantine gold & Coptic weave.',
    color: '#5CE6B8',
  },
  'Rebellious Hand': {
    icon: '✒️',
    title: 'Rebellious Hand',
    ethos: 'Artisanal Kintsugi gold seams, pressed botanical ink, hand-scribed marginalia & embers.',
    color: '#F28B82',
  },
};

/**
 * What the Council of Art Directors produced for one visualizer: the session it was built in, the casting Aria made
 * (lead / counterpoint / editor), the lead's winning proposal, and Aria's synthesis. Generated into councilBuilds.ts by
 * scripts/council/applyWorshipVisualizerCouncil.ts from the sessions under docs/ambo/council.
 */
export interface WorshipCouncilBuild {
  /** Visualizer id this session built. */
  id: string;
  number: number;
  /** Council session id: users/{uid}/council_sessions/{sessionId} in Firestore, mirrored to docs/ambo/council/sessions. */
  sessionId: string;
  builtAt: number;
  /** Lead voice Aria cast; drives the kit's material weave and Council optical pass for this visualizer. */
  director: CouncilDirector;
  counterpoint: CouncilDirector;
  editor: CouncilDirector;
  /** The lead director's winning proposal. */
  title: string;
  idea: string;
  geometry: string;
  typography: string;
  imageLogic: string;
  texture: string;
  motion: string;
  /** Aria's synthesis: the direction, what survives from the counterpoint, what the editor cut, the user's open decision. */
  direction: string;
  keepFromCounterpoint: string;
  editorCut: string;
  openDecision: string;
  /** At most two directors quoted in their own words. */
  quotes: Array<{ director: CouncilDirector; line: string }>;
  /** True for the hand-authored builds (authored*Builds.ts): written in the council's shape, not from a session. */
  authored?: true;
}

/** The council's build for a visualizer, if it has been taken to the council. */
export function getWorshipCouncilBuild(vis: Pick<WorshipVisualizerDef, 'id'>): WorshipCouncilBuild | undefined {
  return WORSHIP_BUILDS[vis.id];
}

/** The Council voice of record: the lead the Art Council cast, else an explicit override, else the deterministic rule. */
export function resolveDirector(vis: WorshipVisualizerDef): CouncilDirector {
  const built = WORSHIP_BUILDS[vis.id];
  if (built) return built.director;
  if (vis.director) return vis.director;
  const even = vis.number % 2 === 0;
  switch (vis.subgenre) {
    case 'Sacred Architecture':
      return even ? 'Classical Mind' : 'Baroque Dramatist';
    case 'Hymnal & Pipe Organ':
      return even ? 'Classical Mind' : 'Baroque Dramatist';
    case 'Illuminated Manuscript':
      return even ? 'Classical Mind' : 'Rebellious Hand';
    case 'Contemplative Light':
      return even ? 'Radical Minimalist' : 'Baroque Dramatist';
    case 'Contemporary Abstract':
      return even ? 'Futurist' : 'Rebellious Hand';
    case 'Sacred Geometry':
      return even ? 'Futurist' : 'Radical Minimalist';
    case 'Scenic Nature':
      return even ? 'World-Eclectic Traveller' : 'Radical Minimalist';
    case 'Biblical Landscape':
      return even ? 'World-Eclectic Traveller' : 'Baroque Dramatist';
    case 'Sanctuary & Cloister':
      return even ? 'Baroque Dramatist' : 'Classical Mind';
    case 'Gospel & Choir':
      return even ? 'Baroque Dramatist' : 'World-Eclectic Traveller';
    case 'Joyful Praise':
      return even ? 'Futurist' : 'Rebellious Hand';
    case 'Acoustic & Revival':
      return even ? 'Rebellious Hand' : 'World-Eclectic Traveller';
    default:
      return COUNCIL_DIRECTORS[(vis.number - 1) % COUNCIL_DIRECTORS.length];
  }
}

/** The Art Council critique: Aria's direction from the council build, else an explicit override, else a generic line. */
export function resolveCouncilNote(vis: WorshipVisualizerDef): string {
  const built = WORSHIP_BUILDS[vis.id];
  if (built) return `“${built.title}” — led by the ${built.director}, counterpoint the ${built.counterpoint}, edited by the ${built.editor}. ${built.direction}`;
  if (vis.councilNote) return vis.councilNote;
  const dir = resolveDirector(vis);
  const meta = COUNCIL_DIRECTOR_META[dir];
  return `${meta.title} (${vis.subgenre}): ${vis.lightingNote} Multi-plane depth motes & text-safe sanctuary framing.`;
}

// ── Default Sample Content ───────────────────────────────────────────────────

export const CALM_WORSHIP_LYRICS: LyricLine[] = [
  { time: 0.0, text: 'Be still my soul the Lord is on thy side' },
  { time: 4.5, text: 'Bear patiently the cross of grief or pain' },
  { time: 9.0, text: 'Leave to thy God to order and provide' },
  { time: 13.5, text: 'In every change He faithful will remain' },
  { time: 18.0, text: 'Holy Holy Holy Lord God Almighty' },
  { time: 22.5, text: 'All Thy works shall praise Thy Name in earth and sky and sea' },
];

export const UPTEMPO_PRAISE_LYRICS: LyricLine[] = [
  { time: 0.0, text: 'Praise God from whom all blessings flow' },
  { time: 3.2, text: 'Lift every voice with joyful sound and sing' },
  { time: 6.4, text: 'Let all creation rise to bless the King' },
  { time: 9.6, text: 'Clap your hands all ye people shout unto God with joy' },
  { time: 12.8, text: 'Hallelujah forever and ever Amen' },
  { time: 16.0, text: 'Crown Him with many crowns the Lamb upon His throne' },
];

export const SAMPLE_SCRIPTURES: WorshipScriptureSample[] = [
  {
    reference: 'PSALM 23 : 1–4',
    translation: 'ESV',
    text: 'The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.',
    context: [
      '1 The Lord is my shepherd; I shall not want.',
      '2 He makes me lie down in green pastures. He leads me beside still waters.',
      '3 He restores my soul. He leads me in paths of righteousness for his name’s sake.',
      '4 Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me.',
      '5 You prepare a table before me in the presence of my enemies; you anoint my head with oil; my cup overflows.',
      '6 Surely goodness and mercy shall follow me all the days of my life, and I shall dwell in the house of the Lord forever.',
    ],
  },
  {
    reference: 'ISAIAH 40 : 31',
    translation: 'NIV',
    text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.',
    context: [
      '28 Do you not know? Have you not heard? The Lord is the everlasting God, the Creator of the ends of the earth.',
      '29 He gives strength to the weary and increases the power of the weak.',
      '30 Even youths grow tired and weary, and young men stumble and fall;',
    ],
  },
  {
    reference: 'JOHN 1 : 1–5',
    translation: 'NRSV',
    text: 'In the beginning was the Word, and the Word was with God, and the Word was God. In him was life, and the life was the light of all people. The light shines in the darkness, and the darkness did not overcome it.',
    context: [
      '1 In the beginning was the Word, and the Word was with God, and the Word was God.',
      '2 He was in the beginning with God.',
      '3 All things came into being through him, and without him not one thing came into being.',
    ],
  },
  {
    reference: 'REVELATION 22 : 1–2',
    translation: 'KJV',
    text: 'And he shewed me a pure river of water of life, clear as crystal, proceeding out of the throne of God and of the Lamb.',
    context: [
      '1 And he shewed me a pure river of water of life, clear as crystal.',
      '2 In the midst of the street of it, and on either side of the river, was there the tree of life.',
      '5 And there shall be no night there; and they need no candle, neither light of the sun.',
    ],
  },
];

// ── Shared Mathematical & Color Helpers ──────────────────────────────────────

export const W_SERIF = '"Noto Serif", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
export const W_SANS = '"Outfit", "Inter", "Segoe UI", -apple-system, sans-serif';
export const W_DISPLAY = '"Cinzel", "Palatino Linotype", Georgia, serif';
export const W_MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};

export function hash11(p: number): number {
  const x = Math.sin(p * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function hash21(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function noise2D(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm2D(x: number, y: number, octaves = 3): number {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2D(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
    : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function hexRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}

export function mixHex(hexA: string, hexB: string, t: number, alpha = 1): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const k = clamp01(t);
  const r = Math.round(lerp(r1, r2, k));
  const g = Math.round(lerp(g1, g2, k));
  const b = Math.round(lerp(b1, b2, k));
  return alpha >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}

// ── Art Director Council Multi-Plane Rendering Primitives ───────────────────

/**
 * Draws a rich, high-dynamic-range sanctuary background strictly honoring the
 * visualizer's own curated palette (`topHex`, `midHex`, `botHex`) without
 * contaminating it with generic colors.
 */
export function drawSanctuaryBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  topHex: string,
  midHex: string,
  botHex: string,
  warmth = 0.5,
) {
  const punchedTop = punchHex(topHex, 1.32, 0.01);
  const punchedMid = punchHex(midHex, 1.48, 0.05);
  const punchedBot = punchHex(botHex, 1.38, 0.03);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, punchedTop);
  g.addColorStop(0.32, mixHex(punchedTop, punchedMid, 0.55));
  g.addColorStop(0.62, punchedMid);
  g.addColorStop(1, punchedBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Palette-true chiaroscuro key-light bloom (uses midHex & botHex, never generic pink/cyan)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const brightMid = punchHex(midHex, 1.65, 0.22);
  const aura = ctx.createRadialGradient(w * 0.5, h * 0.26, 0, w * 0.5, h * 0.26, Math.max(w, h) * 0.65);
  aura.addColorStop(0, hexRgba(brightMid, 0.34));
  aura.addColorStop(0.55, hexRgba(punchedMid, 0.14));
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (Math.abs(warmth - 0.5) > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = warmth > 0.5
      ? `rgba(255, 185, 95, ${(warmth - 0.5) * 0.42})`
      : `rgba(95, 195, 255, ${(0.5 - warmth) * 0.42})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

/**
 * CLASSICAL MIND:
 * Draws authentic Jerusalem/Cathedral ashlar stone masonry courses with
 * per-block tonal relief, beveled key-light top edges, and recessed mortar joints.
 */
export function drawAshlarMasonry(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colorHex: string,
  alpha = 0.16,
) {
  ctx.save();
  const rows = 11;
  const cols = 7;
  const rh = h / rows;
  const cw = w / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const offset = (r % 2) * (cw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cw + offset;
      const stoneShade = hash11(r * 19.3 + c * 31.7);
      // Subtle block relief fill
      ctx.fillStyle = hexRgba(colorHex, alpha * (0.18 + stoneShade * 0.28));
      ctx.fillRect(x + 1.5, y + 1.5, cw - 3, rh - 3);

      // Top & left raked key-light bevel
      ctx.strokeStyle = hexRgba('#FFF4D8', alpha * (0.35 + stoneShade * 0.35));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + rh - 2);
      ctx.lineTo(x + 2, y + 2);
      ctx.lineTo(x + cw - 2, y + 2);
      ctx.stroke();

      // Recessed dark mortar shadow on bottom & right
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.moveTo(x + 1, y + rh - 1);
      ctx.lineTo(x + cw - 1, y + rh - 1);
      ctx.lineTo(x + cw - 1, y + 1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draws volumetric god-ray shafts slanting from a key source with chromatic prism dispersion & core halation. */
export function drawGodRays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    originX: number;
    originY: number;
    angle: number;
    spread: number;
    count: number;
    color: string;
    intensity: number;
    t: number;
  },
) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const maxLen = Math.hypot(w, h) * 1.38;
  const punchedColor = punchHex(opts.color, 1.45, 0.06);
  const warmCore = mixHex(punchedColor, '#FFF8E7', 0.55);

  // Source halation bloom at origin
  const srcR = Math.min(w, h) * 0.32;
  const sg = ctx.createRadialGradient(opts.originX, opts.originY, 0, opts.originX, opts.originY, srcR);
  sg.addColorStop(0, hexRgba('#FFFFFF', clamp01(opts.intensity * 0.62)));
  sg.addColorStop(0.28, hexRgba(punchedColor, clamp01(opts.intensity * 0.42)));
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(opts.originX, opts.originY, srcR, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < opts.count; i++) {
    const fi = i / Math.max(1, opts.count - 1) - 0.5;
    const drift = Math.sin(opts.t * 0.35 + i * 1.9) * 0.035;
    const a = opts.angle + fi * opts.spread + drift;
    const beamW = (0.038 + 0.032 * hash11(i * 7.3)) * Math.min(w, h);
    const shimmer = 0.62 + 0.38 * Math.sin(opts.t * 0.65 + i * 2.3);
    const alpha = clamp01(opts.intensity * shimmer * (1 - Math.abs(fi) * 0.62));

    ctx.save();
    ctx.translate(opts.originX, opts.originY);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, maxLen, 0);
    g.addColorStop(0, hexRgba('#FFF8E8', alpha * 0.92));
    g.addColorStop(0.25, hexRgba(warmCore, alpha * 0.58));
    g.addColorStop(0.62, hexRgba(punchedColor, alpha * 0.22));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -beamW * 0.22);
    ctx.lineTo(maxLen, -beamW * 2.5);
    ctx.lineTo(maxLen, beamW * 2.5);
    ctx.lineTo(0, beamW * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draws 4-Plane Cinema Depth-of-Field Bokeh & Sparkle Motes:
 * Plane 0 (Far): crisp starlight pinpoints
 * Plane 1 (Mid): warm golden focus motes with soft corona
 * Plane 2 (Near): hexagonal 6-blade cinema aperture bokeh rings
 * Plane 3 (Foreground): dreamy large out-of-focus bokeh orbs
 */
export function drawMotes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    count: number;
    color: string;
    t: number;
    riseSpeed: number;
    sway: number;
    sizeRange: [number, number];
    glow: number;
    seed?: number;
  },
) {
  const seed = opts.seed ?? 17;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const scale = Math.min(w, h) / 720;
  const punched = punchHex(opts.color, 1.45, 0.06);
  const warmTint = mixHex(punched, '#FFF3D1', 0.45);

  for (let i = 0; i < opts.count; i++) {
    const plane = i % 8 === 0 ? 3 : i % 3 === 2 ? 2 : i % 2 === 1 ? 1 : 0;
    const h1 = hash11(i * 13.7 + seed);
    const h2 = hash11(i * 29.3 + seed);
    const h3 = hash11(i * 53.1 + seed);
    const spdMult = plane === 0 ? 0.45 : plane === 1 ? 1.0 : plane === 2 ? 1.35 : 1.75;
    const px = ((h1 + Math.sin(opts.t * 0.4 * spdMult + h2 * 6.28) * opts.sway) % 1 + 1) % 1;
    const py = ((h2 - opts.t * opts.riseSpeed * spdMult * (0.5 + h3 * 0.8)) % 1 + 1) % 1;
    const x = px * w;
    const y = py * h;
    const baseR = lerp(opts.sizeRange[0], opts.sizeRange[1], h3) * scale;
    const r =
      plane === 0
        ? baseR * 0.55
        : plane === 1
        ? baseR * 1.25
        : plane === 2
        ? baseR * 4.2
        : baseR * 8.2;
    const twinkle = 0.5 + 0.5 * Math.sin(opts.t * (1.2 + h1 * 1.5) + h2 * 10);
    const planeAlpha = plane === 0 ? 0.65 : plane === 1 ? 0.92 : plane === 2 ? 0.36 : 0.20;
    const alpha = clamp01(opts.glow * twinkle * Math.sin(py * Math.PI) * planeAlpha);
    if (alpha < 0.02) continue;

    const col = i % 3 === 0 ? warmTint : punched;

    if (plane >= 2) {
      const sides = plane === 3 ? 8 : 6;
      const rot = h1 * Math.PI + opts.t * 0.12;
      const rg = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      rg.addColorStop(0, hexRgba(col, alpha * 0.15));
      rg.addColorStop(0.75, hexRgba(col, alpha * 0.32));
      rg.addColorStop(0.92, hexRgba('#FFF8EA', alpha * 0.72));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      for (let s = 0; s < sides; s++) {
        const a = rot + (s / sides) * Math.PI * 2;
        const bx = x + Math.cos(a) * r;
        const by = y + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 3.0);
      rg.addColorStop(0, hexRgba('#FFFFFF', alpha * 0.95));
      rg.addColorStop(0.35, hexRgba(col, alpha * 0.72));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Applies a subtle, high-contrast sanctuary vignette without muddying the artwork's center. */
export function applySanctuaryFinish(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  textSafe = 0.45,
  centerYRatio = 0.5,
) {
  if (textSafe > 0.01) {
    const cy = h * centerYRatio;
    const rx = w * 0.44;
    const ry = h * 0.24;
    ctx.save();
    ctx.translate(w * 0.5, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(5, 4, 10, ${(textSafe * 0.44).toFixed(3)})`);
    g.addColorStop(0.65, `rgba(5, 4, 10, ${(textSafe * 0.22).toFixed(3)})`);
    g.addColorStop(1, 'rgba(5, 4, 10, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Subtle perimeter cinema vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.58);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,3,8,0.40)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ═════════════════════════════════════════════════════════════════════════════
// ART COUNCIL DESIGNER TYPOGRAPHY ENGINE FOR WORSHIP & PRAISE LYRICS (8 MODES)
// ═════════════════════════════════════════════════════════════════════════════

export interface WorshipLyricStyleOpts {
  fontFamily?: string;
  fontWeight?: number | string;
  italic?: boolean;
  uppercase?: boolean;
  letterSpacingEm?: number;
  primaryColor?: string;
  sungColor?: string;
  nextLineColor?: string;
  glowColor?: string;
  glowStrength?: number;
  yRatio?: number;
  mode?:
    | 'centered-grace'
    | 'word-sweep'
    | 'hymnal-stanza'
    | 'praise-banner'
    | 'cathedral-arch'
    | 'lower-sanctuary'
    | 'minimal-editorial'
    | 'choir-anthem';
  accentColor?: string;
}

export function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rows: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${cur} ${words[i]}`;
    if (ctx.measureText(test).width <= maxW) {
      cur = test;
    } else {
      rows.push(cur);
      cur = words[i];
    }
  }
  rows.push(cur);
  return rows;
}

export function renderWorshipLyrics(
  rc: WorshipRenderContext,
  opts: WorshipLyricStyleOpts = {},
) {
  renderCouncilOpticalPass(rc, rc.visualizer);

  const { ctx, w, h, audio, params } = rc;
  if (!params.showText) return;

  const lines = rc.lyricFrame?.lines ?? CALM_WORSHIP_LYRICS;
  const f = rc.lyricFrame ?? buildWorshipLyricFrame(lines, rc.t % 26, w, h, {
    title: 'Amazing Grace (Sanctuary Arrangement)',
    artist: 'Chora Worship Collective',
    bpm: rc.audio.pulse > 0.2 ? 118 : 72,
  });

  const font = opts.fontFamily ?? W_SERIF;
  const weight = opts.fontWeight ?? 500;
  const italic = opts.italic ? 'italic ' : '';
  const primary = opts.primaryColor ?? '#FAF6EE';
  const sung = opts.sungColor ?? '#FFD98E';
  const accent = opts.accentColor ?? '#D4AF37';
  const glowCol = opts.glowColor ?? accent;

  // Give each visualizer a deterministic designer layout variation if it used generic defaults
  const visNum = rc.visualizer?.number ?? 1;
  let mode = opts.mode ?? 'centered-grace';
  if (mode === 'centered-grace' && visNum % 5 === 0) mode = 'minimal-editorial';
  if (mode === 'centered-grace' && visNum % 7 === 0) mode = 'lower-sanctuary';

  const yCenter = mode === 'lower-sanctuary' ? h * 0.78 : h * (opts.yRatio ?? 0.5);

  const curLineRaw = f.idx >= 0 && f.lines[f.idx] ? f.lines[f.idx].text : f.lines[0]?.text ?? '';
  const nextLineRaw = f.idx + 1 < f.lines.length ? f.lines[f.idx + 1].text : f.lines[0]?.text ?? '';
  const prevLineRaw = f.idx > 0 ? f.lines[f.idx - 1].text : '';

  const curText = opts.uppercase ? curLineRaw.toUpperCase() : curLineRaw;
  const nextText = opts.uppercase ? nextLineRaw.toUpperCase() : nextLineRaw;
  const prevText = opts.uppercase ? prevLineRaw.toUpperCase() : prevLineRaw;

  const enterFade = clamp01(f.tIn / 0.42);
  const vocalLift = audio.vocal * 0.28 * params.reactivity;

  ctx.save();

  // ── MODE A: RADICAL MINIMALIST — Swiss Asymmetric Flush-Left Editorial Grid ──
  if (mode === 'minimal-editorial') {
    const leftX = w * 0.09;
    const maxW = w * 0.76;
    const baseSize = Math.max(16, Math.min(h * 0.064, w * 0.046));
    ctx.font = `${italic}${weight} ${baseSize}px ${font}`;
    const rows = wrapCanvasLines(ctx, curText, maxW);
    const lineH = baseSize * 1.26;
    const blockH = rows.length * lineH;
    const topY = yCenter - blockH * 0.5;

    // Giant faint architectural verse numeral in the right negative space
    ctx.save();
    ctx.font = `700 ${Math.min(w, h) * 0.24}px ${W_DISPLAY}`;
    ctx.fillStyle = hexRgba(accent, 0.08 + audio.swell * 0.05);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0${(f.idx % 9) + 1}`, w * 0.93, yCenter);
    ctx.restore();

    // Vertical gold/cyan Swiss editorial bar on the left margin
    const barH = blockH + baseSize * 1.1;
    ctx.fillStyle = hexRgba(accent, 0.32);
    ctx.fillRect(leftX - baseSize * 0.55, topY - baseSize * 0.35, 3, barH);
    ctx.fillStyle = sung;
    ctx.fillRect(leftX - baseSize * 0.55, topY - baseSize * 0.35, 3, barH * clamp01(f.prog));

    // Top micro-label
    const tagSz = Math.max(9, baseSize * 0.28);
    ctx.font = `600 ${tagSz}px ${W_MONO}`;
    ctx.fillStyle = hexRgba(accent, 0.82);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`STANZA 0${(f.idx % 9) + 1}  //  SANCTUARY LYRIC`, leftX, topY - baseSize * 0.35);

    // Main flush-left lines with active word sweep
    ctx.font = `${italic}${weight} ${baseSize}px ${font}`;
    ctx.textBaseline = 'middle';
    rows.forEach((rText, rIdx) => {
      const ry = topY + rIdx * lineH + lineH * 0.35;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = baseSize * 0.35;
      ctx.fillStyle = hexRgba(primary, 0.95 * enterFade);
      ctx.fillText(rText, leftX, ry);
      ctx.restore();

      const rowProg = clamp01(f.prog * rows.length - rIdx);
      if (rowProg > 0) {
        const tw = ctx.measureText(rText).width;
        ctx.save();
        ctx.beginPath();
        ctx.rect(leftX - 4, ry - lineH * 0.55, (tw + 8) * rowProg, lineH * 1.1);
        ctx.clip();
        ctx.fillStyle = sung;
        ctx.shadowColor = glowCol;
        ctx.shadowBlur = baseSize * 0.3;
        ctx.fillText(rText, leftX, ry);
        ctx.restore();
      }
    });

    if (nextText) {
      ctx.font = `400 ${baseSize * 0.50}px ${W_SANS}`;
      ctx.fillStyle = hexRgba(primary, 0.46 * enterFade);
      const nextRows = wrapCanvasLines(ctx, nextText, maxW);
      ctx.fillText(nextRows[0] ?? '', leftX, topY + blockH + baseSize * 0.45);
    }
    ctx.restore();
    return;
  }

  // ── MODE B: LOWER SANCTUARY — 2.39:1 Cinema Widescreen Broadcast Lower-Third ──
  if (mode === 'lower-sanctuary') {
    const barH = h * 0.085;
    ctx.fillStyle = 'rgba(4, 4, 8, 0.72)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);
    ctx.strokeStyle = hexRgba(accent, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, barH);
    ctx.lineTo(w, barH);
    ctx.moveTo(0, h - barH);
    ctx.lineTo(w, h - barH);
    ctx.stroke();

    const baseSize = Math.max(15, Math.min(h * 0.054, w * 0.042));
    ctx.font = `${italic}600 ${baseSize}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rows = wrapCanvasLines(ctx, curText, w * 0.84);
    const lineH = baseSize * 1.24;
    const startY = h * 0.75 - ((rows.length - 1) * lineH) * 0.5;

    rows.forEach((rText, rIdx) => {
      const ry = startY + rIdx * lineH;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.92)';
      ctx.shadowBlur = baseSize * 0.45;
      ctx.fillStyle = sung;
      ctx.fillText(rText, w * 0.5, ry);
      ctx.restore();
    });

    if (nextText) {
      ctx.font = `500 ${Math.max(10, baseSize * 0.44)}px ${W_DISPLAY}`;
      ctx.fillStyle = hexRgba(primary, 0.62);
      const nextRows = wrapCanvasLines(ctx, nextText.toUpperCase(), w * 0.84);
      ctx.fillText(nextRows[0] ?? '', w * 0.5, h - barH * 0.5);
    }
    ctx.restore();
    return;
  }

  // ── MODE C: CHOIR ANTHEM — Stacked Kinetic Condensed Praise Typography ──
  if (mode === 'choir-anthem') {
    const pulseScale = 1 + audio.pulse * 0.038 * params.reactivity;
    ctx.translate(w / 2, yCenter);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-w / 2, -yCenter);

    const words = f.words.length ? f.words : curText.split(/\s+/).map(t => ({ text: t, p: 1, start: 0, end: 1 }));
    // Group into 2 or 3 high-impact stacked rows
    const perRow = Math.max(2, Math.ceil(words.length / 2));
    const wordRows: typeof words[] = [];
    for (let i = 0; i < words.length; i += perRow) {
      wordRows.push(words.slice(i, i + perRow));
    }

    const baseSize = Math.max(18, Math.min(h * 0.078, w * 0.054));
    const lineH = baseSize * 1.18;
    const totalH = wordRows.length * lineH;

    // Dramatic backlit stage frame behind stacked anthem
    const frameW = w * 0.78;
    const frameH = totalH + baseSize * 0.9;
    ctx.strokeStyle = hexRgba(accent, 0.42 + audio.pulse * 0.35);
    ctx.lineWidth = 1.8;
    ctx.strokeRect((w - frameW) / 2, yCenter - frameH / 2, frameW, frameH);

    ctx.font = `800 ${baseSize}px ${W_SANS}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    wordRows.forEach((wRow, rIdx) => {
      const rowStr = wRow.map(w => w.text.toUpperCase()).join('  ');
      const rowW = ctx.measureText(rowStr).width;
      let cx = w * 0.5 - rowW * 0.5;
      const ry = yCenter - ((wordRows.length - 1) * lineH) / 2 + rIdx * lineH;
      const spW = ctx.measureText('  ').width;

      for (const wd of wRow) {
        const up = wd.text.toUpperCase();
        const ww = ctx.measureText(up).width;
        const active = wd.p > 0 && wd.p < 1;
        const done = wd.p >= 1;
        const lift = active ? -baseSize * 0.06 * Math.sin(wd.p * Math.PI) : 0;

        ctx.save();
        ctx.shadowColor = active ? glowCol : 'rgba(0,0,0,0.88)';
        ctx.shadowBlur = active ? baseSize * 0.55 : baseSize * 0.32;
        ctx.fillStyle = active ? sung : done ? primary : hexRgba(primary, 0.58);
        ctx.fillText(up, cx, ry + lift);
        ctx.restore();

        cx += ww + spW;
      }
    });

    ctx.restore();
    return;
  }

  // ── MODES D–H: Cathedral-Arch, Hymnal-Stanza, Praise-Banner, Word-Sweep, Centered-Grace ──
  const pulseScale = mode === 'praise-banner'
    ? 1 + audio.pulse * 0.028 * params.reactivity
    : 1 + audio.swell * 0.012 * params.reactivity;

  ctx.translate(w / 2, yCenter);
  ctx.scale(pulseScale, pulseScale);
  ctx.translate(-w / 2, -yCenter);

  const baseSize = Math.max(16, Math.min(h * (mode === 'praise-banner' ? 0.068 : 0.060), w * 0.046));
  ctx.font = `${italic}${weight} ${baseSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxW = w * 0.80;
  const rows = wrapCanvasLines(ctx, curText, maxW);
  const lineH = baseSize * 1.28;
  const blockH = rows.length * lineH;

  if (mode === 'cathedral-arch') {
    // Classical Mind: True pointed/Romanesque architectural arch crown above the lyric block
    const archW = Math.min(w * 0.54, baseSize * 11.5);
    const topY = yCenter - blockH * 0.5 - baseSize * 0.65;
    const botY = yCenter + blockH * 0.5 + baseSize * 0.98;
    ctx.strokeStyle = hexRgba(accent, 0.58 + vocalLift);
    ctx.lineWidth = Math.max(1.3, h * 0.0024);
    ctx.beginPath();
    ctx.moveTo(w / 2 - archW / 2, topY + baseSize * 0.25);
    ctx.lineTo(w / 2 - archW * 0.18, topY);
    ctx.quadraticCurveTo(w / 2, topY - baseSize * 0.45, w / 2 + archW * 0.18, topY);
    ctx.lineTo(w / 2 + archW / 2, topY + baseSize * 0.25);
    ctx.moveTo(w / 2 - archW * 0.36, botY);
    ctx.lineTo(w / 2 + archW * 0.36, botY);
    ctx.stroke();

    // Keystone diamond boss at crown of arch
    const dSz = Math.max(4, h * 0.0075);
    ctx.fillStyle = sung;
    ctx.beginPath();
    ctx.moveTo(w / 2, topY - baseSize * 0.22 - dSz);
    ctx.lineTo(w / 2 + dSz, topY - baseSize * 0.22);
    ctx.lineTo(w / 2, topY - baseSize * 0.22 + dSz);
    ctx.lineTo(w / 2 - dSz, topY - baseSize * 0.22);
    ctx.closePath();
    ctx.fill();
  } else if (mode === 'hymnal-stanza') {
    // Classical Mind: Multi-line Hymnal Stave Watermark & Stanza Number Badge
    const staveW = Math.min(w * 0.68, baseSize * 13);
    ctx.strokeStyle = hexRgba(accent, 0.13 + audio.harmonic * 0.08);
    ctx.lineWidth = 1;
    for (let s = -2; s <= 2; s++) {
      const sy = yCenter + s * (baseSize * 0.26);
      ctx.beginPath();
      ctx.moveTo(w / 2 - staveW / 2, sy);
      ctx.lineTo(w / 2 + staveW / 2, sy);
      ctx.stroke();
    }
    // Stanza Roman numeral badge at top
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    ctx.font = `600 ${Math.max(10, baseSize * 0.30)}px ${W_DISPLAY}`;
    ctx.fillStyle = hexRgba(accent, 0.85);
    ctx.fillText(`HYMNAL STANZA · ${numerals[f.idx % numerals.length]}`, w / 2, yCenter - blockH * 0.5 - baseSize * 0.85);
  } else if (mode === 'praise-banner') {
    // World-Eclectic / Rebellious Hand: Double-offset architectural praise slab with corner brackets
    const padX = baseSize * 1.05;
    const padY = baseSize * 0.62;
    const plateW = Math.min(w * 0.86, Math.max(...rows.map(r => ctx.measureText(r).width), w * 0.44) + padX * 2);
    const plateH = blockH + padY * 2;
    const px = (w - plateW) / 2;
    const py = yCenter - plateH / 2;

    // Offset gold shadow frame
    ctx.strokeStyle = hexRgba(accent, 0.32);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(px + 5, py + 5, plateW, plateH);

    ctx.fillStyle = 'rgba(8, 7, 15, 0.64)';
    ctx.strokeStyle = hexRgba(accent, 0.65 + audio.pulse * 0.35);
    ctx.lineWidth = Math.max(1.6, h * 0.0028);
    ctx.fillRect(px, py, plateW, plateH);
    ctx.strokeRect(px, py, plateW, plateH);

    // Active phrase progress sweep at bottom of banner
    const progW = plateW * clamp01(f.prog);
    const barG = ctx.createLinearGradient(px, 0, px + plateW, 0);
    barG.addColorStop(0, hexRgba(accent, 0.25));
    barG.addColorStop(0.5, hexRgba(sung, 0.95));
    barG.addColorStop(1, hexRgba(accent, 0.45));
    ctx.fillStyle = barG;
    ctx.fillRect(px + 2, py + plateH - Math.max(3, h * 0.0055), Math.max(0, progW - 4), Math.max(3, h * 0.0055));
  } else if (mode === 'word-sweep') {
    // Futurist: Horizon laser sweep + monospace sync readout
    const lineW = Math.min(w * 0.46, baseSize * 9.5);
    const lineY = yCenter + blockH * 0.5 + baseSize * 0.32;
    ctx.fillStyle = hexRgba(accent, 0.22);
    ctx.fillRect(w / 2 - lineW / 2, lineY, lineW, 1.5);
    ctx.fillStyle = sung;
    ctx.fillRect(w / 2 - lineW / 2, lineY - 0.5, lineW * clamp01(f.prog), 2.5);
  } else {
    // Baroque Dramatist (`centered-grace`): Gilded Bezier scroll flourishes above & below
    const flW = Math.min(w * 0.26, baseSize * 5.2);
    const topY = yCenter - blockH * 0.5 - baseSize * 0.55;
    ctx.strokeStyle = hexRgba(accent, 0.52 + vocalLift);
    ctx.lineWidth = 1.4;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, topY);
      ctx.bezierCurveTo(
        w / 2 + dir * flW * 0.35,
        topY - baseSize * 0.22,
        w / 2 + dir * flW * 0.65,
        topY + baseSize * 0.18,
        w / 2 + dir * flW,
        topY,
      );
      ctx.stroke();
    }
  }

  // Previous line whisper (for hymnal-stanza)
  if (mode === 'hymnal-stanza' && prevText) {
    ctx.save();
    ctx.font = `${italic}400 ${baseSize * 0.50}px ${font}`;
    ctx.fillStyle = hexRgba(primary, 0.36 * enterFade);
    ctx.fillText(prevText, w / 2, yCenter - blockH / 2 - baseSize * 0.42);
    ctx.restore();
  }

  // Main current lyric line(s)
  const slideY = (1 - enterFade) * baseSize * 0.20;
  ctx.font = `${italic}${weight} ${baseSize}px ${font}`;

  rows.forEach((rowText, rIdx) => {
    const ry = yCenter - ((rows.length - 1) * lineH) / 2 + rIdx * lineH + slideY;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
    ctx.shadowBlur = baseSize * 0.40;
    ctx.shadowOffsetY = baseSize * 0.06;
    ctx.fillStyle = hexRgba(primary, 0.96 * enterFade);
    ctx.fillText(rowText, w / 2, ry);
    ctx.restore();

    // Sung / vocal highlight pass
    if (mode === 'word-sweep' || mode === 'praise-banner') {
      const rowProg = clamp01(f.prog * rows.length - rIdx);
      if (rowProg > 0) {
        const tw = ctx.measureText(rowText).width;
        const leftX = w / 2 - tw / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(leftX - 8, ry - lineH * 0.6, (tw + 16) * rowProg, lineH * 1.2);
        ctx.clip();
        ctx.shadowColor = hexRgba(glowCol, 0.8);
        ctx.shadowBlur = baseSize * (0.30 + vocalLift);
        ctx.fillStyle = sung;
        ctx.fillText(rowText, w / 2, ry);
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.globalAlpha = clamp01((0.24 + vocalLift * 0.85) * (opts.glowStrength ?? 0.6));
      ctx.shadowColor = glowCol;
      ctx.shadowBlur = baseSize * 0.55;
      ctx.fillStyle = sung;
      ctx.fillText(rowText, w / 2, ry);
      ctx.restore();
    }
  });

  // Next line preview below
  if (nextText) {
    ctx.save();
    const nextSize = baseSize * 0.52;
    ctx.font = mode === 'cathedral-arch' ? `600 ${nextSize * 0.88}px ${W_DISPLAY}` : `400 ${nextSize}px ${W_SANS}`;
    ctx.fillStyle = opts.nextLineColor ?? hexRgba(primary, 0.50 * enterFade);
    ctx.shadowColor = 'rgba(0,0,0,0.78)';
    ctx.shadowBlur = nextSize * 0.3;
    const nextRows = wrapCanvasLines(ctx, mode === 'cathedral-arch' ? nextText.toUpperCase() : nextText, maxW);
    const ny = yCenter + blockH / 2 + baseSize * 0.66;
    ctx.fillText(nextRows[0] ?? '', w / 2, ny);
    ctx.restore();
  }

  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// ART COUNCIL DESIGNER TYPOGRAPHY & TABLET ENGINE FOR SCRIPTURE READING (7 MODES)
// ═════════════════════════════════════════════════════════════════════════════

export interface ScripturePlateOpts {
  fontFamily?: string;
  plateStyle?:
    | 'vellum-dark'
    | 'frosted-sanctuary'
    | 'gold-bordered'
    | 'arch-tablet'
    | 'minimal-lectern'
    | 'scroll-column'
    | 'side-codex';
  accentColor?: string;
  textColor?: string;
  plateTint?: string;
  showDropCap?: boolean;
}

export function renderScriptureOverlay(
  rc: WorshipRenderContext,
  opts: ScripturePlateOpts = {},
) {
  renderCouncilOpticalPass(rc, rc.visualizer);

  const { ctx, w, h, t, audio, params } = rc;
  const sample = rc.scripture ?? SAMPLE_SCRIPTURES[0];
  const accent = opts.accentColor ?? '#D4AF37';
  const textCol = opts.textColor ?? '#FAF6EE';
  const font = opts.fontFamily ?? W_SERIF;

  // Deterministically diversify plate styles across the 24 scripture cards so every Council Director's layout shines
  const visNum = rc.visualizer?.number ?? 49;
  const dir = rc.visualizer ? resolveDirector(rc.visualizer) : 'Classical Mind';
  let style = opts.plateStyle ?? 'vellum-dark';
  if (style === 'vellum-dark') {
    if (dir === 'Radical Minimalist') style = 'minimal-lectern';
    else if (dir === 'Rebellious Hand') style = 'side-codex';
    else if (dir === 'World-Eclectic Traveller' && visNum % 2 === 1) style = 'scroll-column';
    else if (dir === 'Futurist') style = 'frosted-sanctuary';
  }

  const spd = lerp(0.25, 1.3, params.motion);

  // ── Layer 1: Director-Specific Ambient Chapter Context Surround ──────────
  ctx.save();
  if (style === 'frosted-sanctuary') {
    // FUTURIST (`type-orbit` style): Counter-rotating circular rings of chapter text around the sanctuary
    const cx = w * 0.5;
    const cy = h * 0.5;
    const orbitR = Math.min(w, h) * 0.44;
    ctx.font = `600 ${Math.max(9, Math.min(w, h) * 0.018)}px ${W_DISPLAY}`;
    ctx.fillStyle = hexRgba(accent, 0.16 + audio.vocal * 0.12);
    const ringStr = `${sample.reference}  ·  ${sample.text.toUpperCase()}  ·  `;
    const chars = ringStr.slice(0, 72);
    for (let i = 0; i < chars.length; i++) {
      const ang = (i / chars.length) * Math.PI * 2 + t * 0.04 * spd;
      ctx.save();
      ctx.translate(cx + Math.cos(ang) * orbitR, cy + Math.sin(ang) * orbitR);
      ctx.rotate(ang + Math.PI / 2);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
  } else {
    // Surrounding horizontal chapter calligraphy in upper & lower margins
    const ctxSize = Math.max(10, h * 0.017);
    ctx.font = `italic ${ctxSize}px ${W_SERIF}`;
    ctx.fillStyle = hexRgba(accent, 0.10 + audio.swell * 0.05);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const ctxBody = (sample.context?.length ? sample.context.join('   ✦   ') : sample.text) + '   ✦   ';
    for (let row = 0; row < 14; row++) {
      const ry = (row / 14) * h;
      if (ry > h * 0.17 && ry < h * 0.83) continue;
      const xScroll = -((t * 14 * spd * (row % 2 === 0 ? 1 : -0.8) + row * 120) % Math.max(200, w * 0.6));
      ctx.fillText(ctxBody.repeat(3), xScroll, ry);
    }
  }
  ctx.restore();

  if (!params.showText) return;

  // Comfortable auditorium reading measure
  const plateW = Math.min(w * 0.80, h * 1.38);
  const plateH = Math.min(h * 0.66, Math.max(h * 0.48, w * 0.35));
  const px = (w - plateW) / 2;
  const py = (h - plateH) / 2;
  const voiceGlow = audio.vocal * 0.38 * params.reactivity;

  ctx.save();

  // ── Layer 2: Bespoke Council Tablet / Scroll / Lectern Geometry ──────────
  const tint = opts.plateTint ?? 'rgba(10, 9, 16, 0.80)';
  ctx.fillStyle = tint;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
  ctx.shadowBlur = Math.min(w, h) * 0.045;

  if (style === 'arch-tablet') {
    // BAROQUE DRAMATIST: True Pointed / Romanesque Arched Stone & Vellum Tablet
    const archRise = plateH * 0.16;
    ctx.beginPath();
    ctx.moveTo(px, py + archRise);
    ctx.quadraticCurveTo(px, py, px + plateW * 0.22, py);
    ctx.quadraticCurveTo(w * 0.5, py - archRise * 0.55, px + plateW * 0.78, py);
    ctx.quadraticCurveTo(px + plateW, py, px + plateW, py + archRise);
    ctx.lineTo(px + plateW, py + plateH);
    ctx.lineTo(px, py + plateH);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexRgba(accent, 0.62 + voiceGlow * 0.38);
    ctx.lineWidth = Math.max(1.6, h * 0.0028);
    ctx.stroke();

    // Inner arched moulding line + keystone ornament
    const ins = Math.max(6, h * 0.012);
    ctx.strokeStyle = hexRgba(accent, 0.28);
    ctx.lineWidth = 1;
    ctx.strokeRect(px + ins, py + archRise * 0.6, plateW - ins * 2, plateH - archRise * 0.6 - ins);
  } else if (style === 'side-codex') {
    // REBELLIOUS HAND: Hand-Torn Deckle-Edge Parchment Polygon + Molten Kintsugi Gold Seam
    ctx.beginPath();
    const stepsX = 24;
    const stepsY = 16;
    for (let i = 0; i <= stepsX; i++) {
      const x = px + (i / stepsX) * plateW;
      const jag = (hash11(i * 7.3 + visNum) - 0.5) * 4.5;
      if (i === 0) ctx.moveTo(x, py + jag);
      else ctx.lineTo(x, py + jag);
    }
    for (let i = 1; i <= stepsY; i++) {
      const y = py + (i / stepsY) * plateH;
      const jag = (hash11(i * 11.7 + visNum) - 0.5) * 4.5;
      ctx.lineTo(px + plateW + jag, y);
    }
    for (let i = stepsX - 1; i >= 0; i--) {
      const x = px + (i / stepsX) * plateW;
      const jag = (hash11(i * 19.1 + visNum) - 0.5) * 4.5;
      ctx.lineTo(x, py + plateH + jag);
    }
    for (let i = stepsY - 1; i >= 1; i--) {
      const y = py + (i / stepsY) * plateH;
      const jag = (hash11(i * 23.9 + visNum) - 0.5) * 4.5;
      ctx.lineTo(px + jag, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexRgba(accent, 0.65);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing Kintsugi gold-leaf fracture repair across upper-right corner of the codex slab
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#FFE28A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + plateW * 0.78, py);
    ctx.lineTo(px + plateW * 0.84, py + plateH * 0.14);
    ctx.lineTo(px + plateW * 0.92, py + plateH * 0.19);
    ctx.lineTo(px + plateW, py + plateH * 0.28);
    ctx.stroke();
    ctx.restore();
  } else if (style === 'scroll-column') {
    // WORLD-ECLECTIC TRAVELLER: Qumran Stitched Scroll with Turned Rollers & Woven Tapestry Bands
    ctx.fillRect(px, py, plateW, plateH);
    ctx.shadowBlur = 0;

    // Top & bottom woven geometric tapestry border bands
    const bandH = Math.max(8, plateH * 0.042);
    ctx.fillStyle = hexRgba(accent, 0.22);
    ctx.fillRect(px, py, plateW, bandH);
    ctx.fillRect(px, py + plateH - bandH, plateW, bandH);

    // Geometric Coptic/Tabernacle diamond weave along top & bottom bands
    const diaCount = 22;
    const dw = plateW / diaCount;
    ctx.strokeStyle = hexRgba(accent, 0.75);
    ctx.lineWidth = 1.1;
    for (let d = 0; d < diaCount; d++) {
      const dx = px + (d + 0.5) * dw;
      for (const by of [py + bandH * 0.5, py + plateH - bandH * 0.5]) {
        ctx.beginPath();
        ctx.moveTo(dx, by - bandH * 0.38);
        ctx.lineTo(dx + dw * 0.35, by);
        ctx.lineTo(dx, by + bandH * 0.38);
        ctx.lineTo(dx - dw * 0.35, by);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Left & right cylindrical wooden/brass Torah scroll rollers
    const rollerW = Math.max(8, w * 0.012);
    for (const rx of [px - rollerW * 0.5, px + plateW - rollerW * 0.5]) {
      const rg = ctx.createLinearGradient(rx, 0, rx + rollerW, 0);
      rg.addColorStop(0, '#2B180A');
      rg.addColorStop(0.5, accent);
      rg.addColorStop(1, '#1F1107');
      ctx.fillStyle = rg;
      ctx.fillRect(rx, py - 6, rollerW, plateH + 12);
    }
  } else if (style === 'minimal-lectern') {
    // RADICAL MINIMALIST: Swiss Editorial Asymmetric Lectern with Giant Faint Chapter:Verse Numeral
    ctx.fillRect(px, py, plateW, plateH);
    ctx.shadowBlur = 0;

    // Bold architectural vertical bar on left edge
    const barW = Math.max(4, w * 0.005);
    ctx.fillStyle = accent;
    ctx.fillRect(px, py, barW, plateH);

    // Top & bottom razor hairlines
    ctx.strokeStyle = hexRgba(accent, 0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + plateW, py);
    ctx.moveTo(px, py + plateH);
    ctx.lineTo(px + plateW, py + plateH);
    ctx.stroke();

    // Giant faint chapter numeral in right corner of plate
    const numMatch = sample.reference.match(/\d+\s*:\s*\d+|\d+/);
    const bigNum = numMatch ? numMatch[0].replace(/\s+/g, '') : '23:1';
    ctx.save();
    ctx.font = `700 ${plateH * 0.36}px ${W_DISPLAY}`;
    ctx.fillStyle = hexRgba(accent, 0.07 + audio.swell * 0.04);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(bigNum, px + plateW - plateW * 0.04, py + plateH - plateH * 0.04);
    ctx.restore();
  } else {
    // CLASSICAL MIND (`gold-bordered`) & FUTURIST (`frosted-sanctuary`) & `vellum-dark`
    const radius = Math.min(w, h) * 0.018;
    ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(px, py, plateW, plateH, radius);
    else ctx.rect(px, py, plateW, plateH);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = hexRgba(accent, 0.52 + voiceGlow * 0.4);
    ctx.lineWidth = Math.max(1.4, h * 0.0024);
    ctx.stroke();

    const inset = Math.max(6, h * 0.012);
    ctx.strokeStyle = hexRgba(accent, 0.26 + voiceGlow * 0.25);
    ctx.lineWidth = 1;
    ctx.strokeRect(px + inset, py + inset, plateW - inset * 2, plateH - inset * 2);

    // Ornate corner brackets & rosette medallions
    const cLen = Math.max(12, h * 0.026);
    ctx.strokeStyle = hexRgba(accent, 0.88);
    ctx.lineWidth = Math.max(1.6, h * 0.003);
    const corners: [number, number, number, number][] = [
      [px + inset, py + inset, 1, 1],
      [px + plateW - inset, py + inset, -1, 1],
      [px + inset, py + plateH - inset, 1, -1],
      [px + plateW - inset, py + plateH - inset, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * cLen);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * cLen, cy);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(cx + dx * 4, cy + dy * 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Layer 3: Header Reference & Translation Badge ────────────────────────
  const refSize = Math.max(11, h * 0.024);
  ctx.font = `600 ${refSize}px ${W_DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent;
  const headerY = py + plateH * 0.135;

  if (style === 'minimal-lectern') {
    ctx.textAlign = 'left';
    ctx.fillText(`${sample.reference}   //   ${sample.translation}`, px + plateW * 0.07, headerY);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(`${sample.reference}  ·  ${sample.translation}`, w / 2, headerY);
    const ruleW = plateW * (0.32 + audio.swell * 0.08);
    const ruleY = headerY + refSize * 0.92;
    ctx.strokeStyle = hexRgba(accent, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - ruleW / 2, ruleY);
    ctx.lineTo(w / 2 + ruleW / 2, ruleY);
    ctx.stroke();
  }

  // ── Layer 4: Scripture Verse Body + Optional Illuminated Drop-Cap + Lector Word Highlight ──
  const useDropCap = opts.showDropCap ?? (style === 'gold-bordered');
  const textMaxW = plateW * (style === 'minimal-lectern' ? 0.86 : 0.84);
  const textMaxH = plateH * 0.64;
  let fontSize = Math.min(h * 0.045, w * 0.031);
  const minSize = Math.max(12, h * 0.022);
  let lines: string[] = [];

  while (fontSize >= minSize) {
    ctx.font = `400 ${fontSize}px ${font}`;
    lines = wrapCanvasLines(ctx, sample.text, textMaxW);
    if (lines.length * fontSize * 1.42 <= textMaxH) break;
    fontSize -= 1.5;
  }

  const lineH = fontSize * 1.42;
  const totalTextH = lines.length * lineH;
  const startY = py + plateH * 0.24 + (textMaxH - totalTextH) / 2 + lineH * 0.35;

  // Optional dry-point scribe ruling lines on scroll-column
  if (style === 'scroll-column') {
    ctx.strokeStyle = hexRgba(accent, 0.14);
    ctx.lineWidth = 0.8;
    lines.forEach((_, idx) => {
      const ry = startY + idx * lineH + fontSize * 0.38;
      ctx.beginPath();
      ctx.moveTo(px + plateW * 0.06, ry);
      ctx.lineTo(px + plateW * 0.94, ry);
      ctx.stroke();
    });
  }

  // Illuminated Psalter Drop-Cap badge on the first line for Classical Mind (`gold-bordered`)
  if (useDropCap && lines.length > 0 && w >= 420) {
    const firstChar = sample.text.trim().charAt(0).toUpperCase();
    const dcSize = fontSize * 1.85;
    const dcX = px + plateW * 0.055;
    const dcY = startY - fontSize * 0.55;
    const dcG = ctx.createLinearGradient(dcX, dcY, dcX + dcSize, dcY + dcSize);
    dcG.addColorStop(0, hexRgba(accent, 0.38));
    dcG.addColorStop(1, 'rgba(20, 12, 8, 0.85)');
    ctx.fillStyle = dcG;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.fillRect(dcX, dcY, dcSize, dcSize);
    ctx.strokeRect(dcX, dcY, dcSize, dcSize);

    ctx.font = `700 ${dcSize * 0.72}px ${W_DISPLAY}`;
    ctx.fillStyle = '#FFF5D6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(firstChar, dcX + dcSize * 0.5, dcY + dcSize * 0.52);
  }

  const allWords = sample.text.split(/\s+/).filter(Boolean);
  const activeWordIdx = rc.scriptureWordIndex !== undefined
    ? rc.scriptureWordIndex
    : Math.floor((rc.t * 1.85) % Math.max(1, allWords.length + 4));

  let globalWordCounter = 0;
  ctx.font = `400 ${fontSize}px ${font}`;
  ctx.textBaseline = 'middle';

  lines.forEach((lineStr, lIdx) => {
    const ly = startY + lIdx * lineH;
    const lineWords = lineStr.split(/\s+/).filter(Boolean);
    const fullLineW = ctx.measureText(lineStr).width;
    let curX = style === 'minimal-lectern'
      ? px + plateW * 0.07
      : w / 2 - fullLineW / 2;
    const spaceW = ctx.measureText(' ').width;

    ctx.textAlign = 'left';
    for (const wd of lineWords) {
      const ww = ctx.measureText(wd).width;
      const isSpoken = globalWordCounter === activeWordIdx;
      const isPast = globalWordCounter < activeWordIdx;

      if (isSpoken) {
        ctx.save();
        ctx.fillStyle = hexRgba(accent, 0.28 + voiceGlow * 0.35);
        ctx.beginPath();
        if ((ctx as any).roundRect) (ctx as any).roundRect(curX - 4, ly - fontSize * 0.58, ww + 8, fontSize * 1.16, 4);
        else ctx.rect(curX - 4, ly - fontSize * 0.58, ww + 8, fontSize * 1.16);
        ctx.fill();
        ctx.shadowColor = hexRgba(accent, 0.85);
        ctx.shadowBlur = fontSize * 0.42;
        ctx.fillStyle = '#FFF8DE';
        ctx.fillText(wd, curX, ly);
        ctx.restore();
      } else {
        ctx.fillStyle = isPast ? textCol : hexRgba(textCol, 0.88);
        ctx.fillText(wd, curX, ly);
      }

      curX += ww + spaceW;
      globalWordCounter++;
    }
  });

  ctx.restore();
}

// ── Procedural Audio State Simulator (for previews & zero-config live demo) ─

export function synthesizeWorshipAudioState(
  t: number,
  category: WorshipCategory,
  reactivity = 0.65,
): WorshipAudioState {
  if (category === 'uptempo-lyric') {
    const bpm = 122;
    const beatFloat = (t * bpm) / 60;
    const beatPhase = beatFloat % 1;
    const beatCount = Math.floor(beatFloat);
    const pulse = Math.pow(Math.max(0, 1 - beatPhase * 2.2), 2.2) * reactivity;
    const isBackbeat = beatCount % 2 === 1;
    const clap = isBackbeat ? Math.pow(Math.max(0, 1 - beatPhase * 3.0), 2.5) * reactivity : 0;
    const swell = clamp01((0.58 + 0.28 * Math.sin(t * 0.65) + 0.14 * pulse) * reactivity);
    const bass = clamp01((0.45 + 0.45 * pulse + 0.1 * Math.sin(t * 2.1)) * reactivity);
    const vocal = clamp01((0.5 + 0.38 * Math.sin(t * 1.7 + 0.8) * Math.sin(t * 0.45)) * reactivity);
    const harmonic = clamp01((0.62 + 0.25 * Math.sin(t * 0.5 + 1.2)) * reactivity);
    const shimmer = clamp01((0.4 + 0.35 * Math.abs(Math.sin(beatFloat * Math.PI * 2)) + 0.25 * clap) * reactivity);
    const bands = Array.from({ length: 16 }, (_, i) => {
      const freqWave = Math.sin(t * (2.2 + i * 0.35) + i * 0.7) * 0.5 + 0.5;
      const lowBoost = i < 4 ? pulse * 0.6 : i > 10 ? shimmer * 0.5 : vocal * 0.5;
      return clamp01((freqWave * 0.55 + lowBoost) * reactivity);
    });
    return { swell, bass, vocal, harmonic, shimmer, pulse, clap, beatPhase, beatCount, bands };
  }

  if (category === 'scripture-reading') {
    const phraseGate = Math.max(0, Math.sin(t * 0.55) * 0.8 + 0.35);
    const syllableMod = (Math.sin(t * 4.8) * 0.5 + 0.5) * (Math.cos(t * 2.9) * 0.4 + 0.6);
    const vocal = clamp01(phraseGate * syllableMod * 0.85 * reactivity);
    const swell = clamp01((0.35 + 0.22 * Math.sin(t * 0.28) + vocal * 0.25) * reactivity);
    const bass = clamp01((0.22 + 0.15 * Math.sin(t * 0.35)) * reactivity);
    const harmonic = clamp01((0.45 + 0.2 * Math.sin(t * 0.22 + 1.1)) * reactivity);
    const shimmer = clamp01((0.2 + vocal * 0.3) * reactivity);
    const beatFloat = (t * 60) / 60;
    const bands = Array.from({ length: 16 }, (_, i) => {
      const speechBand = i >= 3 && i <= 10 ? vocal * (0.7 + 0.3 * Math.sin(t * 5 + i)) : swell * 0.35;
      return clamp01(speechBand);
    });
    return {
      swell,
      bass,
      vocal,
      harmonic,
      shimmer,
      pulse: vocal * 0.35,
      clap: 0,
      beatPhase: beatFloat % 1,
      beatCount: Math.floor(beatFloat),
      bands,
    };
  }

  const bpm = 68;
  const beatFloat = (t * bpm) / 60;
  const beatPhase = beatFloat % 1;
  const beatCount = Math.floor(beatFloat);
  const breathCycle = 0.5 + 0.5 * Math.sin(t * 0.42);
  const swell = clamp01((0.42 + 0.44 * breathCycle) * reactivity);
  const vocal = clamp01((0.38 + 0.48 * Math.max(0, Math.sin(t * 0.85 + 0.4))) * reactivity);
  const bass = clamp01((0.35 + 0.32 * Math.sin(t * 0.55) + 0.15 * (1 - beatPhase)) * reactivity);
  const harmonic = clamp01((0.55 + 0.35 * Math.sin(t * 0.31 + 1.7)) * reactivity);
  const shimmer = clamp01((0.3 + 0.35 * Math.sin(t * 1.1 + 2.4)) * reactivity);
  const pulse = Math.pow(Math.max(0, 1 - beatPhase * 1.6), 2) * 0.35 * reactivity;
  const bands = Array.from({ length: 16 }, (_, i) => {
    const bell = Math.exp(-Math.pow((i - 6) / 4.5, 2));
    return clamp01((bell * vocal * 0.7 + swell * 0.4 * (0.6 + 0.4 * Math.sin(t * 1.2 + i * 0.5))) * reactivity);
  });
  return { swell, bass, vocal, harmonic, shimmer, pulse, clap: 0, beatPhase, beatCount, bands };
}
