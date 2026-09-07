import type { TelaChartStyle } from '../types';
import { DATA_VIZ_ART_DIRECTIONS, type DataVizGrid, type DataVizMark } from './fabula/dataVizArtDirection';

export type FabulaLottieCategory = 'LOWER_THIRD' | 'FULL_PAGE' | 'DATA_VIZ' | 'TRANSITION';

/**
 * The COMPOSITION a piece is built from, as opposed to the palette it is painted in.
 *
 * The first cut of this library drove layout from the asset's index alone, so every lower third
 * was the same three diagonal bars and every transition the same rounded square — eighteen of the
 * twenty-four differed from a sibling only by colour, and none of them matched the motion their
 * own description promised. A motif is what makes "twelve luminous blades close and release"
 * actually generate twelve blades.
 */
export type FabulaLottieMotif =
  | 'RULE_PLATE' | 'FAN' | 'CONFETTI' | 'PULSE_RINGS' | 'WAVE_BANDS' | 'SLASH'
  | 'ORBIT' | 'CASCADE' | 'HALO' | 'PORTAL' | 'RHYTHM_FRAME' | 'LEAF_RING'
  | 'BARS' | 'NETWORK' | 'RADIAL_BARS' | 'STREAM' | 'GAUGE' | 'TILES'
  | 'IRIS' | 'MOSAIC' | 'CHROMA_BANDS' | 'RIBBONS' | 'BLADES' | 'CONVERGE';

/** Each piece's own composition. Set once here so the gallery and the foundry agree. */
const MOTIFS: Record<string, FabulaLottieMotif> = {
  'swiss-signal': 'RULE_PLATE', 'deco-halo': 'FAN', 'memphis-bounce': 'CONFETTI',
  'afrofuture-pulse': 'PULSE_RINGS', 'ukiyo-tide': 'WAVE_BANDS', 'constructivist-cut': 'SLASH',
  'bauhaus-orbit': 'ORBIT', 'editorial-cascade': 'CASCADE', 'byzantine-luminous': 'HALO',
  'vaporwave-portal': 'PORTAL', 'harlem-rhythm': 'RHYTHM_FRAME', 'botanical-field': 'LEAF_RING',
  'prism-bars': 'BARS', 'constellation-network': 'NETWORK', 'radial-bloom': 'RADIAL_BARS',
  'stream-graph': 'STREAM', 'signal-gauge': 'GAUGE', 'modular-metrics': 'TILES',
  'iris-bloom': 'IRIS', 'mosaic-fold': 'MOSAIC', 'chromatic-wipe': 'CHROMA_BANDS',
  'ribbon-current': 'RIBBONS', 'shutter-star': 'BLADES', 'particle-converge': 'CONVERGE',
};

export interface FabulaLottieAsset {
  id: string;
  name: string;
  category: FabulaLottieCategory;
  styleEra: string;
  description: string;
  duration: number;
  width: number;
  height: number;
  colors: string[];
  license: 'CC0-1.0';
  url: string;
  /** Links this asset to a Council of Art Directors member */
  artDirector?: TelaChartStyle;
  /** Grid pattern from the art direction spec */
  grid?: DataVizGrid;
  /** Mark shape from the art direction spec */
  mark?: DataVizMark;
  /** Texture type from the art direction spec */
  texture?: string;
  /** The art director's design premise */
  premise?: string;
  /** Stroke/line width from the art direction spec */
  lineWidth?: number;
  /** The composition this piece is built from, independent of its palette. */
  motif: FabulaLottieMotif;
}

const asset = (
  id: string, name: string, category: FabulaLottieCategory, styleEra: string,
  description: string, duration: number, width: number, height: number, originalColors: string[],
  artDirector?: TelaChartStyle
): FabulaLottieAsset => {
  const ad = artDirector ? DATA_VIZ_ART_DIRECTIONS[artDirector] : null;
  const colors = ad ? [ad.bg, ad.fg, ...ad.series] : originalColors;
  return {
    id, name, category, styleEra, description, duration, width, height, colors,
    license: 'CC0-1.0', url: `/fabula/lottie/${id}.lottie`,
    motif: MOTIFS[id] || 'BARS',
    ...(ad ? {
      artDirector: ad.id,
      grid: ad.grid,
      mark: ad.mark,
      texture: ad.texture,
      premise: ad.premise,
      lineWidth: ad.lineWidth
    } : {})
  };
};

/**
 * Original Fabula motion systems. No third-party artwork is embedded; the
 * generated .lottie packages are dedicated to the public domain under CC0.
 *
 * Each asset is now linked to a Council of Art Directors member via `artDirector`,
 * which drives grid, mark, texture, lineWidth, and exact palette matching.
 */
export const FABULA_LOTTIE_LIBRARY: FabulaLottieAsset[] = [
  // ─── LOWER THIRDS ────────────────────────────────────────────────────
  asset('swiss-signal', 'Swiss Signal', 'LOWER_THIRD', 'International Typographic', 'A measured grid reveal with an exact red signal rule.', 3, 1280, 240, ['#F7F7F3','#161616','#E12D2D'], 'SWISS'),
  asset('deco-halo', 'Deco Halo', 'LOWER_THIRD', 'Art Deco', 'Gold fan geometry frames a poised broadcast identifier.', 4, 1280, 240, ['#101522','#D8B55B','#F4EAD5'], 'BAROQUE'),
  asset('memphis-bounce', 'Memphis Bounce', 'LOWER_THIRD', 'Memphis', 'Playful geometry arrives with elastic but disciplined rhythm.', 3, 1280, 240, ['#191735','#FF4F8B','#22D3C5','#FFD166'], 'NEON'),
  asset('afrofuture-pulse', 'Afrofuture Pulse', 'LOWER_THIRD', 'Afrofuturist Imagination', 'An ancestral-future pulse maps title, role, and live status.', 4, 1280, 240, ['#15102B','#6F3CC3','#E6B84A','#18A6A6'], 'CEREMONIAL'),
  asset('ukiyo-tide', 'Ukiyo Tide', 'LOWER_THIRD', 'Ukiyo-e', 'Layered wave bands settle into a calm nameplate.', 5, 1280, 240, ['#F1E5C8','#183B56','#D85A45','#6FA3A1'], 'WORLD_ATLAS'),
  asset('constructivist-cut', 'Constructivist Cut', 'LOWER_THIRD', 'Constructivist', 'Hard diagonals and a kinetic locator slash cut onto screen.', 3, 1280, 240, ['#E8DFC9','#161616','#C52F28'], 'REBEL'),

  // ─── FULL PAGE ────────────────────────────────────────────────────────
  asset('bauhaus-orbit', 'Bauhaus Orbit', 'FULL_PAGE', 'Bauhaus', 'Primary forms orbit an editorial title field without losing hierarchy.', 6, 1080, 1080, ['#F1E7D2','#D93A32','#185AA6','#E2B52F'], 'BAUHAUS'),
  asset('editorial-cascade', 'Editorial Cascade', 'FULL_PAGE', 'Contemporary Editorial', 'A restrained modular cascade for chapter cards and full-page facts.', 5, 1080, 1080, ['#F2EFE8','#191919','#7B2CBF','#00A7B5'], 'EDITORIAL'),
  asset('byzantine-luminous', 'Byzantine Luminous', 'FULL_PAGE', 'Byzantine Luminous', 'Jewel-toned rings illuminate a centered, ceremonial composition.', 7, 1080, 1080, ['#1B2038','#C99A2E','#6A3B74','#1D7180'], 'GLASS'),
  asset('vaporwave-portal', 'Vaporwave Portal', 'FULL_PAGE', 'Vaporwave', 'A chromatic horizon and nested portal breathe in parallax.', 6, 1080, 1080, ['#120C2C','#FF4FD8','#48E5FF','#806BFF'], 'FUTURIST'),
  asset('harlem-rhythm', 'Harlem Rhythm', 'FULL_PAGE', 'Harlem Renaissance Editorial', 'Warm portrait framing moves with a syncopated literary cadence.', 6, 1080, 1080, ['#231B19','#E9D7B0','#9D3A30','#C69C43'], 'INK'),
  asset('botanical-field', 'Botanical Field', 'FULL_PAGE', 'Arts and Crafts', 'Leaves unfurl around a generous central reading field.', 8, 1080, 1080, ['#172B24','#D8C9A3','#759A72','#B95B45'], 'TOPOGRAPHIC'),

  // ─── DATA VIZ ─────────────────────────────────────────────────────────
  asset('prism-bars', 'Prism Bars', 'DATA_VIZ', 'Spectral Modernism', 'A ranked bar system rises in harmonic color order.', 5, 960, 540, ['#101425','#00DAF3','#6F3CC3','#D40055','#FF8C00'], 'PLAJAH'),
  asset('constellation-network', 'Constellation Network', 'DATA_VIZ', 'Afrofuturist Imagination', 'Nodes discover their relationships, then hold as a legible network.', 7, 960, 540, ['#101026','#18A6A6','#E6B84A','#8F5BE8'], 'CEREMONIAL'),
  asset('radial-bloom', 'Radial Bloom', 'DATA_VIZ', 'Islamic Geometric Design', 'Concentric measures resolve into a repeating radial comparison.', 6, 960, 540, ['#F1E5C8','#155A63','#243B73','#B98A32'], 'RADICAL_MINIMAL'),
  asset('stream-graph', 'Stream Graph', 'DATA_VIZ', 'Organic Modern', 'Soft data bands flow through time with clear relative weight.', 6, 960, 540, ['#0B2630','#50C6C8','#F0B65A','#ED6A5A'], 'GLASS'),
  asset('signal-gauge', 'Signal Gauge', 'DATA_VIZ', 'Industrial Instrument', 'A precision gauge sweeps, confirms, and gently breathes.', 4, 960, 540, ['#171B21','#E8ECEF','#FFB000','#39D98A'], 'SPORTS'),
  asset('modular-metrics', 'Modular Metrics', 'DATA_VIZ', 'International Typographic', 'Metric tiles assemble into a calm, responsive dashboard rhythm.', 5, 960, 540, ['#F7F7F3','#161616','#E12D2D','#3573C4'], 'SWISS'),

  // ─── TRANSITIONS ──────────────────────────────────────────────────────
  asset('iris-bloom', 'Iris Bloom', 'TRANSITION', 'Organic Modern', 'A layered iris opens with soft optical overlap.', 2, 1920, 1080, ['#11142B','#6F3CC3','#D40055','#FFB24A'], 'PLAJAH'),
  asset('mosaic-fold', 'Mosaic Fold', 'TRANSITION', 'Roman Mosaic', 'Tessera-like tiles fold through the frame in a measured wave.', 2, 1920, 1080, ['#233D3D','#E7D2A7','#6D3025','#C48A45'], 'CLASSICAL'),
  asset('chromatic-wipe', 'Chromatic Wipe', 'TRANSITION', 'Spectral Modernism', 'Separated color bands race together into a clean cut.', 1.5, 1920, 1080, ['#0B1020','#00DAF3','#6F3CC3','#D40055','#FF8C00'], 'FUTURIST'),
  asset('ribbon-current', 'Ribbon Current', 'TRANSITION', 'Ukiyo-e', 'Broad ribbons travel like water and reveal the next scene.', 2.5, 1920, 1080, ['#102A43','#2F80A0','#82C7C9','#E9D7AE'], 'WORLD_ATLAS'),
  asset('shutter-star', 'Shutter Star', 'TRANSITION', 'Art Deco', 'Twelve luminous blades close and release with geometric precision.', 2, 1920, 1080, ['#101522','#D8B55B','#F4EAD5'], 'BAROQUE'),
  asset('particle-converge', 'Particle Converge', 'TRANSITION', 'Digital Contemporary', 'A field of points converges into a bright editorial seam.', 2.5, 1920, 1080, ['#090D18','#00DAF3','#D40055','#F7F7F3'], 'BROADCAST'),
];

export const fabulaLottieAsMediaAsset = (item: FabulaLottieAsset) => ({
  id: `fabula_lottie_${item.id}`,
  name: item.name,
  type: 'lottie',
  url: item.url,
  duration: item.duration,
  width: item.width,
  height: item.height,
  bin: 'Fabula Originals · CC0',
  license: item.license,
  styleEra: item.styleEra,
});
