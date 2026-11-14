// cgPackages — the style systems behind the Fabula CG library.
//
// A package is what a broadcast design house sells: one coherent identity that
// covers every element a show needs (lower thirds, full pages, transitions,
// bugs, tickers, clocks, scoreboards…). Each package is led by an Art Council
// director (visual identity), a Motion Council director (timing & choreography)
// and a Motion Studio Roster member (the signature hand). The archetype builders
// in cgArchetypes.ts read these tokens, so every element in a package shares one
// shape language, type pairing, palette and motion signature.
import type { FontKey } from '../../tela/telaFonts';
import type { TitleAnimType } from '../titleAnimators';
import type { CgEase, CgLoopType, CgMoveType, CgPalette } from './cgTypes';

export type CgPlate = 'solid' | 'glass' | 'outline' | 'gradient' | 'duo' | 'paper' | 'none';
export type CgAccent = 'left' | 'top' | 'under' | 'block' | 'none' | 'slash';
export type CgOrnament = 'none' | 'grid' | 'glow' | 'particles' | 'ticks' | 'double-rule' | 'dots' | 'scan';

export interface CgPackage {
  id: string;
  name: string;
  group: 'News' | 'Sports' | 'Worship' | 'Corporate' | 'Creator' | 'Cinema' | 'Esports' | 'Editorial' | 'Culture' | 'Lifestyle';
  tagline: string;
  art: string;        // Art Council director id
  motionLead: string; // Motion Council director id
  hand: string;       // Motion Studio Roster member id
  palette: CgPalette;
  fonts: { display: FontKey; text: FontKey; utility: FontKey };
  shape: { radius: number; skew: number; plate: CgPlate; accent: CgAccent; stroke: number };
  type: { upper: boolean; tracking: number; titleWeight: number; subWeight: number; italic?: boolean };
  motion: {
    plateIn: CgMoveType; plateOut: CgMoveType; accentIn: CgMoveType;
    textAnim: TitleAnimType; ease: CgEase; dur: number; stagger: number; loop: CgLoopType;
  };
  ornament: CgOrnament;
}

const P = (accent: string, ink: string, paper: string, secondary: string, highlight: string, shade: string): CgPalette => ({ accent, ink, paper, secondary, highlight, shade });

export const CG_PACKAGES: CgPackage[] = [
  {
    id: 'meridian', name: 'Meridian News', group: 'News', tagline: 'Authoritative network news: navy plates, a red signal bar, hard-cut confidence.',
    art: 'CLASSICAL', motionLead: 'KINETIC', hand: 'MODERNIST_TITLE',
    palette: P('#d7262e', '#ffffff', '#0d1e3d', '#9fb3d9', '#ffd23f', '#06101f'),
    fonts: { display: 'oswald', text: 'inter', utility: 'ibmPlexMono' },
    shape: { radius: 0, skew: 0, plate: 'solid', accent: 'left', stroke: 0 },
    type: { upper: true, tracking: .02, titleWeight: 700, subWeight: 500 },
    motion: { plateIn: 'wipeR', plateOut: 'wipeL', accentIn: 'growY', textAnim: 'wordSlide', ease: 'expo', dur: .55, stagger: .4, loop: 'none' },
    ornament: 'none',
  },
  {
    id: 'apex', name: 'Apex Sports', group: 'Sports', tagline: 'Slanted, loud and fast — volt on carbon with a hard skew.',
    art: 'REBEL', motionLead: 'KINETIC', hand: 'SPORTS_BROADCAST',
    palette: P('#d4ff00', '#ffffff', '#0b0b0d', '#2a2a30', '#ff3b30', '#000000'),
    fonts: { display: 'bigShoulders', text: 'archivo', utility: 'chakra' },
    shape: { radius: 0, skew: -14, plate: 'solid', accent: 'slash', stroke: 0 },
    type: { upper: true, tracking: .04, titleWeight: 800, subWeight: 600, italic: true },
    motion: { plateIn: 'slideL', plateOut: 'slideR', accentIn: 'wipeR', textAnim: 'dropIn', ease: 'back', dur: .45, stagger: .5, loop: 'shimmer' },
    ornament: 'ticks',
  },
  {
    id: 'sanctuary', name: 'Sanctuary', group: 'Worship', tagline: 'Candle-gold serif on deep umber; reverent, slow and luminous.',
    art: 'CLASSICAL', motionLead: 'CINEMATIC', hand: 'ART_DECO',
    palette: P('#c9a45c', '#fbf5e8', '#1c140d', '#e6d3a8', '#fff1c7', '#0d0905'),
    fonts: { display: 'cormorant', text: 'tenor', utility: 'cinzel' },
    shape: { radius: 2, skew: 0, plate: 'gradient', accent: 'under', stroke: 1 },
    type: { upper: false, tracking: .01, titleWeight: 600, subWeight: 400 },
    motion: { plateIn: 'fade', plateOut: 'fade', accentIn: 'wipeCenterX', textAnim: 'tracking', ease: 'inOut', dur: 1.1, stagger: .3, loop: 'breathe' },
    ornament: 'glow',
  },
  {
    id: 'glasshouse', name: 'Glasshouse', group: 'Corporate', tagline: 'Frosted glass panes with a cool rim light — premium tech keynote.',
    art: 'FUTURIST', motionLead: 'COMPOSITOR', hand: 'UI_MOTION',
    palette: P('#5ee7ff', '#ffffff', 'rgba(20,28,44,.62)', '#b8c7e0', '#a78bfa', 'rgba(6,10,20,.75)'),
    fonts: { display: 'sora', text: 'manrope', utility: 'dmMono' },
    shape: { radius: 18, skew: 0, plate: 'glass', accent: 'top', stroke: 1.5 },
    type: { upper: false, tracking: 0, titleWeight: 600, subWeight: 400 },
    motion: { plateIn: 'blur', plateOut: 'blur', accentIn: 'growX', textAnim: 'blurIn', ease: 'quart', dur: .7, stagger: .5, loop: 'shimmer' },
    ornament: 'glow',
  },
  {
    id: 'neon-grid', name: 'Neon Grid', group: 'Esports', tagline: 'Cyan/magenta neon on a scanline grid — tournament energy.',
    art: 'FUTURIST', motionLead: 'SIGNAL', hand: 'GAME_VFX',
    palette: P('#00f0ff', '#ffffff', '#0a0618', '#ff2bd6', '#fff36b', '#04020c'),
    fonts: { display: 'orbitron', text: 'chakra', utility: 'spaceMono' },
    shape: { radius: 0, skew: -8, plate: 'outline', accent: 'block', stroke: 2 },
    type: { upper: true, tracking: .08, titleWeight: 800, subWeight: 500 },
    motion: { plateIn: 'wipeCenterX', plateOut: 'wipeCenterX', accentIn: 'pop', textAnim: 'scramble', ease: 'expo', dur: .5, stagger: .7, loop: 'sweep' },
    ornament: 'grid',
  },
  {
    id: 'swiss', name: 'Swiss Line', group: 'Editorial', tagline: 'One red rule, a grid and nothing else. Typography carries everything.',
    art: 'RADICAL_MINIMAL', motionLead: 'KINETIC', hand: 'MIDCENTURY',
    palette: P('#ff2a1a', '#111111', '#ffffff', '#6b6b6b', '#ff2a1a', '#f1f1f1'),
    fonts: { display: 'inter', text: 'inter', utility: 'jetbrains' },
    shape: { radius: 0, skew: 0, plate: 'solid', accent: 'under', stroke: 0 },
    type: { upper: false, tracking: -.01, titleWeight: 700, subWeight: 400 },
    motion: { plateIn: 'wipeR', plateOut: 'wipeR', accentIn: 'growX', textAnim: 'fadeUp', ease: 'quart', dur: .6, stagger: .3, loop: 'none' },
    ornament: 'none',
  },
  {
    id: 'atlas', name: 'Atlas', group: 'Culture', tagline: 'Terracotta, indigo and saffron — a travelling documentary voice.',
    art: 'WORLD_ECLECTIC', motionLead: 'GENERATIVE', hand: 'GEOMETRIC_CALLIGRAPHIC',
    palette: P('#d9653b', '#fff8ef', '#23305c', '#f3b33d', '#ffdba1', '#141c38'),
    fonts: { display: 'fraunces', text: 'dmSans', utility: 'spaceMono' },
    shape: { radius: 6, skew: 0, plate: 'duo', accent: 'block', stroke: 0 },
    type: { upper: false, tracking: 0, titleWeight: 700, subWeight: 400 },
    motion: { plateIn: 'slideU', plateOut: 'slideD', accentIn: 'spin', textAnim: 'fadeUp', ease: 'out', dur: .7, stagger: .4, loop: 'float' },
    ornament: 'dots',
  },
  {
    id: 'opera', name: 'Opera', group: 'Cinema', tagline: 'Crimson velvet and gilt hairlines — drama with a curtain call.',
    art: 'BAROQUE', motionLead: 'CINEMATIC', hand: 'ART_DECO',
    palette: P('#d4af37', '#fff6e5', '#4a0c16', '#e9c9a0', '#ffe9a8', '#24050a'),
    fonts: { display: 'playfair', text: 'ebGaramond', utility: 'cinzel' },
    shape: { radius: 0, skew: 0, plate: 'gradient', accent: 'top', stroke: 1.5 },
    type: { upper: false, tracking: .01, titleWeight: 800, subWeight: 400, italic: false },
    motion: { plateIn: 'wipeCenterY', plateOut: 'wipeCenterY', accentIn: 'wipeCenterX', textAnim: 'tracking', ease: 'inOut', dur: 1, stagger: .3, loop: 'shimmer' },
    ornament: 'double-rule',
  },
  {
    id: 'signal', name: 'Signal', group: 'Creator', tagline: 'RGB-split glitch, mono captions and CRT nerve.',
    art: 'REBEL', motionLead: 'SIGNAL', hand: 'DIRECT_FILM',
    palette: P('#ff1f6d', '#f4f4f4', '#0e0e10', '#19e6d4', '#fffb00', '#000000'),
    fonts: { display: 'anton', text: 'spaceMono', utility: 'vt323' },
    shape: { radius: 0, skew: 0, plate: 'solid', accent: 'block', stroke: 0 },
    type: { upper: true, tracking: .03, titleWeight: 400, subWeight: 400 },
    motion: { plateIn: 'skew', plateOut: 'skew', accentIn: 'flipY', textAnim: 'scramble', ease: 'expo', dur: .35, stagger: .8, loop: 'blink' },
    ornament: 'scan',
  },
  {
    id: 'press', name: 'Paper Press', group: 'Editorial', tagline: 'Cream newsprint, ink serif and a typewriter dateline.',
    art: 'CLASSICAL', motionLead: 'KINETIC', hand: 'LIGNE_CLAIRE',
    palette: P('#b3261e', '#1a1714', '#f4ecdc', '#5b534a', '#b3261e', '#e3d8c2'),
    fonts: { display: 'instrumentSerif', text: 'libreBaskerville', utility: 'courierPrime' },
    shape: { radius: 0, skew: 0, plate: 'paper', accent: 'top', stroke: 1 },
    type: { upper: false, tracking: 0, titleWeight: 400, subWeight: 400 },
    motion: { plateIn: 'wipeD', plateOut: 'wipeU', accentIn: 'growX', textAnim: 'typeOn', ease: 'out', dur: .6, stagger: .9, loop: 'none' },
    ornament: 'double-rule',
  },
  {
    id: 'pulse', name: 'Pulse', group: 'Creator', tagline: 'Bubbly rounded pills, candy gradients and squash-and-stretch pops.',
    art: 'REBEL', motionLead: 'CHARACTER', hand: 'BOLD_FLAT',
    palette: P('#8b5cf6', '#ffffff', '#ec4899', '#fde68a', '#22d3ee', '#3b0764'),
    fonts: { display: 'rubik', text: 'nunito', utility: 'fredoka' },
    shape: { radius: 40, skew: 0, plate: 'gradient', accent: 'block', stroke: 0 },
    type: { upper: false, tracking: 0, titleWeight: 800, subWeight: 600 },
    motion: { plateIn: 'pop', plateOut: 'pop', accentIn: 'pop', textAnim: 'dropIn', ease: 'elastic', dur: .8, stagger: .6, loop: 'pulse' },
    ornament: 'dots',
  },
  {
    id: 'boardroom', name: 'Boardroom', group: 'Corporate', tagline: 'Slate and teal, generous whitespace — investor-day calm.',
    art: 'RADICAL_MINIMAL', motionLead: 'COMPOSITOR', hand: 'EXPLAINER',
    palette: P('#14b8a6', '#0f172a', '#ffffff', '#64748b', '#f59e0b', '#e2e8f0'),
    fonts: { display: 'manrope', text: 'manrope', utility: 'ibmPlexMono' },
    shape: { radius: 8, skew: 0, plate: 'solid', accent: 'left', stroke: 0 },
    type: { upper: false, tracking: 0, titleWeight: 700, subWeight: 500 },
    motion: { plateIn: 'slideU', plateOut: 'fade', accentIn: 'growY', textAnim: 'fadeUp', ease: 'quart', dur: .6, stagger: .3, loop: 'none' },
    ornament: 'none',
  },
  {
    id: 'stadium', name: 'Stadium Night', group: 'Sports', tagline: 'Gold on black under floodlights — championship broadcast.',
    art: 'BAROQUE', motionLead: 'KINETIC', hand: 'SPORTS_BROADCAST',
    palette: P('#f5b700', '#ffffff', '#111111', '#3a3a3a', '#ffffff', '#000000'),
    fonts: { display: 'anton', text: 'oswald', utility: 'chakra' },
    shape: { radius: 0, skew: -6, plate: 'gradient', accent: 'left', stroke: 0 },
    type: { upper: true, tracking: .03, titleWeight: 400, subWeight: 500 },
    motion: { plateIn: 'growX', plateOut: 'growX', accentIn: 'slideD', textAnim: 'wordSlide', ease: 'expo', dur: .5, stagger: .4, loop: 'sweep' },
    ornament: 'particles',
  },
  {
    id: 'aurora', name: 'Aurora', group: 'Lifestyle', tagline: 'Teal-to-violet light ribbons drifting behind clean type.',
    art: 'FUTURIST', motionLead: 'GENERATIVE', hand: 'ABSTRACT_LOOP',
    palette: P('#2dd4bf', '#ffffff', '#1e1b4b', '#c4b5fd', '#f0abfc', '#0b0a24'),
    fonts: { display: 'outfit', text: 'outfit', utility: 'dmMono' },
    shape: { radius: 14, skew: 0, plate: 'gradient', accent: 'under', stroke: 0 },
    type: { upper: false, tracking: .01, titleWeight: 600, subWeight: 300 },
    motion: { plateIn: 'wipeR', plateOut: 'blur', accentIn: 'growX', textAnim: 'blurIn', ease: 'circ', dur: .9, stagger: .5, loop: 'drift' },
    ornament: 'glow',
  },
  {
    id: 'heritage', name: 'Heritage Weave', group: 'Culture', tagline: 'Bold woven colour blocks and a rhythmic pattern band.',
    art: 'WORLD_ECLECTIC', motionLead: 'CHARACTER', hand: 'AFRO_PATTERN',
    palette: P('#e8a317', '#ffffff', '#1d4d2b', '#c0392b', '#f7dc6f', '#0e2616'),
    fonts: { display: 'archivoBlack', text: 'workSans', utility: 'spaceMono' },
    shape: { radius: 0, skew: 0, plate: 'duo', accent: 'block', stroke: 0 },
    type: { upper: true, tracking: .03, titleWeight: 400, subWeight: 500 },
    motion: { plateIn: 'growY', plateOut: 'growY', accentIn: 'drop', textAnim: 'wordSlide', ease: 'back', dur: .6, stagger: .5, loop: 'none' },
    ornament: 'ticks',
  },
  {
    id: 'monowire', name: 'Mono Wire', group: 'News', tagline: 'Terminal green on black — wire-service data feed.',
    art: 'RADICAL_MINIMAL', motionLead: 'SIGNAL', hand: 'DEMOSCENE',
    palette: P('#39ff88', '#d6ffe6', '#050a07', '#1f6f43', '#ffffff', '#000000'),
    fonts: { display: 'jetbrains', text: 'jetbrains', utility: 'vt323' },
    shape: { radius: 0, skew: 0, plate: 'outline', accent: 'left', stroke: 1.5 },
    type: { upper: true, tracking: .06, titleWeight: 700, subWeight: 400 },
    motion: { plateIn: 'wipeR', plateOut: 'wipeL', accentIn: 'blur', textAnim: 'typeOn', ease: 'linear', dur: .4, stagger: 1, loop: 'blink' },
    ornament: 'scan',
  },
  {
    id: 'scope', name: 'Cinema Scope', group: 'Cinema', tagline: 'Letterboxed widescreen titles, hairline serif and slow reveals.',
    art: 'CLASSICAL', motionLead: 'CINEMATIC', hand: 'VIRTUAL_PROD',
    palette: P('#e8e2d0', '#ffffff', '#000000', '#a39e90', '#f0c987', '#000000'),
    fonts: { display: 'cormorant', text: 'tenor', utility: 'italiana' },
    shape: { radius: 0, skew: 0, plate: 'none', accent: 'under', stroke: 1 },
    type: { upper: true, tracking: .28, titleWeight: 500, subWeight: 400 },
    motion: { plateIn: 'fade', plateOut: 'fade', accentIn: 'wipeCenterX', textAnim: 'tracking', ease: 'inOut', dur: 1.4, stagger: .2, loop: 'none' },
    ornament: 'none',
  },
  {
    id: 'velocity', name: 'Velocity', group: 'Sports', tagline: 'Motorsport carbon, race red and speed-line slashes.',
    art: 'FUTURIST', motionLead: 'KINETIC', hand: 'SPORTS_BROADCAST',
    palette: P('#ff1e1e', '#ffffff', '#15161a', '#9aa0aa', '#ffd400', '#000000'),
    fonts: { display: 'michroma', text: 'exo2', utility: 'chakra' },
    shape: { radius: 0, skew: -20, plate: 'gradient', accent: 'slash', stroke: 0 },
    type: { upper: true, tracking: .06, titleWeight: 700, subWeight: 500, italic: true },
    motion: { plateIn: 'slideL', plateOut: 'slideL', accentIn: 'wipeR', textAnim: 'wordSlide', ease: 'expo', dur: .4, stagger: .5, loop: 'sweep' },
    ornament: 'ticks',
  },
  {
    id: 'bloom', name: 'Bloom', group: 'Lifestyle', tagline: 'Soft blush and sage, an elegant serif and gentle floats.',
    art: 'BAROQUE', motionLead: 'CHARACTER', hand: 'INK_WASH',
    palette: P('#e7a6a1', '#3a2e2c', '#fbf3ee', '#8fa98a', '#d98b7e', '#efe2d9'),
    fonts: { display: 'dmSerif', text: 'karla', utility: 'caveat' },
    shape: { radius: 28, skew: 0, plate: 'solid', accent: 'block', stroke: 0 },
    type: { upper: false, tracking: 0, titleWeight: 400, subWeight: 500 },
    motion: { plateIn: 'pop', plateOut: 'fade', accentIn: 'pop', textAnim: 'fadeUp', ease: 'back', dur: .8, stagger: .4, loop: 'float' },
    ornament: 'dots',
  },
  {
    id: 'civic', name: 'Civic', group: 'News', tagline: 'Election-night blue, ballot-white boards and trustworthy serif.',
    art: 'CLASSICAL', motionLead: 'COMPOSITOR', hand: 'DATA_STORY',
    palette: P('#1f4fd1', '#0b1a33', '#ffffff', '#5a6b86', '#e63946', '#eef2fa'),
    fonts: { display: 'libreBaskerville', text: 'workSans', utility: 'ibmPlexMono' },
    shape: { radius: 4, skew: 0, plate: 'solid', accent: 'top', stroke: 0 },
    type: { upper: false, tracking: 0, titleWeight: 700, subWeight: 500 },
    motion: { plateIn: 'wipeU', plateOut: 'wipeD', accentIn: 'growX', textAnim: 'fadeUp', ease: 'quart', dur: .55, stagger: .3, loop: 'none' },
    ornament: 'none',
  },
  {
    id: 'riot', name: 'Riot Zine', group: 'Creator', tagline: 'Cut-paper collage, marker scrawl and tape — punk zine energy.',
    art: 'REBEL', motionLead: 'CHARACTER', hand: 'COLLAGE',
    palette: P('#ff4f1f', '#111111', '#f2efe6', '#1f6bff', '#ffe600', '#d8d2c2'),
    fonts: { display: 'archivoBlack', text: 'permanentMarker', utility: 'specialElite' },
    shape: { radius: 0, skew: 3, plate: 'paper', accent: 'block', stroke: 0 },
    type: { upper: true, tracking: 0, titleWeight: 400, subWeight: 400 },
    motion: { plateIn: 'drop', plateOut: 'spin', accentIn: 'spin', textAnim: 'dropIn', ease: 'back', dur: .5, stagger: .7, loop: 'none' },
    ornament: 'none',
  },
  {
    id: 'lumen', name: 'Lumen', group: 'Worship', tagline: 'Modern church: black, white and warm light, condensed and confident.',
    art: 'RADICAL_MINIMAL', motionLead: 'CINEMATIC', hand: 'STRUCTURAL',
    palette: P('#f2b56b', '#ffffff', '#0c0c0c', '#bdbdbd', '#ffd9a8', '#000000'),
    fonts: { display: 'bebas', text: 'inter', utility: 'dmMono' },
    shape: { radius: 0, skew: 0, plate: 'none', accent: 'left', stroke: 0 },
    type: { upper: true, tracking: .06, titleWeight: 400, subWeight: 400 },
    motion: { plateIn: 'fade', plateOut: 'fade', accentIn: 'growY', textAnim: 'fadeIn', ease: 'inOut', dur: .9, stagger: .2, loop: 'none' },
    ornament: 'glow',
  },
  {
    id: 'tidal', name: 'Tidal', group: 'Lifestyle', tagline: 'Ocean blues and sand, rounded type and wave-like slides.',
    art: 'WORLD_ECLECTIC', motionLead: 'COMPOSITOR', hand: 'SATSUEI',
    palette: P('#0ea5e9', '#ffffff', '#0b3a5b', '#f4d9a6', '#7dd3fc', '#062236'),
    fonts: { display: 'lexend', text: 'quicksand', utility: 'dmMono' },
    shape: { radius: 22, skew: 0, plate: 'gradient', accent: 'under', stroke: 0 },
    type: { upper: false, tracking: 0, titleWeight: 700, subWeight: 500 },
    motion: { plateIn: 'slideR', plateOut: 'slideR', accentIn: 'growX', textAnim: 'fadeUp', ease: 'circ', dur: .75, stagger: .4, loop: 'float' },
    ornament: 'glow',
  },
  {
    id: 'arcade', name: 'Arcade', group: 'Esports', tagline: 'Pixel type, 8-bit palettes and attract-mode blinkers.',
    art: 'REBEL', motionLead: 'GENERATIVE', hand: 'ARCADE',
    palette: P('#ffcc00', '#ffffff', '#1a1040', '#ff3d7f', '#4dffea', '#0a0620'),
    fonts: { display: 'pressStart', text: 'silkscreen', utility: 'vt323' },
    shape: { radius: 0, skew: 0, plate: 'solid', accent: 'block', stroke: 4 },
    type: { upper: true, tracking: .02, titleWeight: 400, subWeight: 400 },
    motion: { plateIn: 'wipeR', plateOut: 'wipeL', accentIn: 'pop', textAnim: 'typeOn', ease: 'linear', dur: .35, stagger: 1, loop: 'blink' },
    ornament: 'dots',
  },
];

export function cgPackage(id: string): CgPackage | undefined { return CG_PACKAGES.find(p => p.id === id); }
