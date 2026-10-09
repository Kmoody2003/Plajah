// motionBuildGrammar — how each Studio Roster member BUILDS, in Fabula's own vocabulary.
//
// motionRoster.ts says who a member is (ethos, lineage, signature in words). This file says what their hands do
// on a timeline: how long they hold a cut (in beats, or a rhythmic pattern), how the frame moves inside a cut,
// which Forge look / effects / transition they reach for, how their titles animate, and their grade. Every id here
// is a real Fabula catalog id (FX_EFFECTS, FORGE_TRANSITIONS, FORGE_LOOKS, title animators) — verifyMotionRoster.mjs
// checks that, so a grammar can never produce a clip Fabula cannot render.
import type { TitleAnimType } from '../../fabula/titleAnimators';

/** How the frame moves inside one cut. */
export type MoveId = 'hold' | 'push' | 'drift' | 'snap' | 'float' | 'shake' | 'scrollUp' | 'bounce';

export interface BuildGrammar {
  /** cut length in beats — a number, or a repeating pattern (e.g. [3,3,2] for a tresillo feel) */
  pace: number | number[];
  move: MoveId;
  /** a FORGE_LOOKS id applied to every picture cut (the house look of this member) */
  look?: string;
  /** FX_EFFECTS ids layered after the look, at `mix` */
  effects: string[];
  mix?: number;
  /** FORGE_TRANSITIONS id, or 'cut' for straight cuts */
  trans: string;
  /** transition length in beats (default 1) */
  transBeats?: number;
  /** on fast cutting, only transition on every Nth cut (default: every cut when pace ≥ 3 beats, else every 4th) */
  transEvery?: number;
  title: TitleAnimType;
  titleStyle: 'modern' | 'classic' | 'minimal';
  /** static grade on picture cuts (fx bag keys) */
  grade?: { bri?: number; con?: number; sat?: number; hue?: number; warm?: number };
}

const g = (pace: BuildGrammar['pace'], move: MoveId, trans: string, title: TitleAnimType, titleStyle: BuildGrammar['titleStyle'], effects: string[] = [], extra: Partial<BuildGrammar> = {}): BuildGrammar =>
  ({ pace, move, trans, title, titleStyle, effects, ...extra });

export const BUILD_GRAMMAR: Record<string, BuildGrammar> = {
  // ── Anime ──
  SAKUGA:            g(2, 'snap', 'camera-shake', 'dropIn', 'modern', ['directionalblur'], { look: 'music-punch', grade: { con: 1.2, sat: 1.2 }, transBeats: 0.5 }),
  PASTORAL:          g(8, 'drift', 'film-dissolve', 'fadeUp', 'classic', ['softdiffusion'], { look: 'golden-hour', grade: { sat: 1.1, warm: 0.1 }, transBeats: 2 }),
  MECHA:             g(4, 'push', 'zoom-pull', 'tracking', 'modern', ['lensflaredesigner'], { look: 'anamorphic-night', grade: { con: 1.15 } }),
  SHOUJO:            g(6, 'float', 'glint-dissolve', 'blurIn', 'classic', ['sparklefield', 'silkdiffusion'], { look: 'dream-portrait', transBeats: 2 }),
  CEL_OVA:           g(4, 'drift', 'film-dissolve', 'fadeIn', 'classic', ['regrain', 'chromaticfringe'], { look: 'vhs-rewind', mix: 0.6 }),
  SATSUEI:           g(4, 'push', 'glow-dissolve', 'blurIn', 'minimal', ['volumetricrays', 'cineglow'], { look: 'golden-hour', mix: 0.55 }),
  GAG:               g(2, 'snap', 'stretch-cut', 'dropIn', 'modern', ['halftonepro'], { grade: { sat: 1.3 }, transBeats: 0.5 }),
  // ── Cartoon ──
  TRICK_FILM:        g(4, 'hold', 'wipe-circle', 'typeOn', 'classic', ['filmdamage'], { look: 'noir', grade: { sat: 0, warm: 0.35 } }),
  RUBBER_HOSE:       g(2, 'bounce', 'wipe-circle', 'dropIn', 'classic', ['filmdamage'], { look: 'noir', grade: { sat: 0, con: 1.2 } }),
  GOLDEN_AGE:        g(8, 'drift', 'film-dissolve', 'fadeUp', 'classic', ['softdiffusion'], { look: 'kodachrome-slide', transBeats: 2 }),
  SCREWBALL:         g(2, 'snap', 'whip', 'dropIn', 'modern', ['directionalblur'], { grade: { sat: 1.25 }, transBeats: 0.5 }),
  MIDCENTURY:        g(4, 'hold', 'push-slide', 'wordSlide', 'minimal', ['editorialprint'], { grade: { sat: 0.85 } }),
  TV_LIMITED:        g(4, 'hold', 'push-slide', 'fadeIn', 'modern', ['posterizesolarize'], { mix: 0.35 }),
  BOLD_FLAT:         g(2, 'snap', 'stretch-cut', 'dropIn', 'modern', ['graphiccartoon'], { transBeats: 0.5 }),
  FLASH_INDIE:       g(2, 'drift', 'wipe-pixelate', 'typeOn', 'modern', ['ditherpalettes'], { mix: 0.5 }),
  // ── Graphic & Mograph ──
  MODERNIST_TITLE:   g(4, 'hold', 'shape-wipe', 'wordSlide', 'minimal', ['editorialprint']),
  CONSTRUCTIVIST:    g(2, 'snap', 'push-slide', 'dropIn', 'modern', ['halftonepro'], { grade: { sat: 0.6, con: 1.3 }, transBeats: 0.5 }),
  PSYCHEDELIC:       g(4, 'float', 'turbulence-dissolve', 'blurIn', 'classic', ['kaleidoprism'], { grade: { sat: 1.6 }, mix: 0.5, transBeats: 2 }),
  CHROME_80S:        g(4, 'push', 'glint-dissolve', 'tracking', 'modern', ['starglint'], { look: 'neon-club' }),
  Y2K:               g(2, 'float', 'plasma-iris', 'blurIn', 'modern', ['prismgrade'], { mix: 0.6 }),
  EXPLAINER:         g(4, 'push', 'push-slide', 'wordSlide', 'minimal', []),
  COLLAGE:           g(3, 'hold', 'dissolve-tiles', 'scramble', 'modern', ['halftonepro', 'texturelab'], { mix: 0.6 }),
  DATA_STORY:        g(6, 'push', 'film-dissolve', 'typeOn', 'minimal', [], { look: 'doc-clean' }),
  ART_DECO:          g(4, 'push', 'wipe-clock', 'tracking', 'classic', ['starglint', 'luster'], { grade: { warm: 0.2, con: 1.15 }, mix: 0.5 }),
  SPORTS_BROADCAST:  g(2, 'snap', 'swish-3d', 'wordSlide', 'modern', ['motionfieldblur'], { grade: { sat: 1.2, con: 1.15 }, mix: 0.45, transBeats: 0.5 }),
  // ── 3D / CGI ──
  FEATURE_CG:        g(6, 'push', 'film-dissolve', 'fadeUp', 'classic', ['cineglow'], { look: 'prestige-drama', mix: 0.5 }),
  STYLIZED_3D:       g(2, 'snap', 'rgb-split', 'dropIn', 'modern', ['halftonepro', 'chromaticfringe'], { look: 'comic-ink', mix: 0.6, transBeats: 0.5 }),
  SIM_TD:            g(4, 'push', 'fluid-shatter', 'blurIn', 'minimal', ['fluidwarp'], { mix: 0.4 }),
  LOWPOLY_RETRO:     g(4, 'drift', 'wipe-pixelate', 'typeOn', 'modern', ['ditherlab'], { look: 'handheld-console', mix: 0.6 }),
  ABSTRACT_LOOP:     g(8, 'float', 'blur-dissolve', 'fadeIn', 'minimal', ['softdiffusion'], { grade: { sat: 0.9 }, transBeats: 2 }),
  VIRTUAL_PROD:      g(6, 'push', 'dolly-fade', 'fadeUp', 'classic', ['filmhalation'], { look: 'anamorphic-night', mix: 0.5 }),
  // ── Stop-motion ──
  CLAY:              g(4, 'hold', 'film-dissolve', 'dropIn', 'classic', ['regrain'], { look: 'golden-hour', mix: 0.5 }),
  PUPPET:            g(6, 'drift', 'dolly-fade', 'fadeUp', 'classic', ['filmhalation'], { look: 'campfire', mix: 0.5 }),
  SILHOUETTE:        g(6, 'drift', 'ink-reveal', 'fadeIn', 'classic', ['gels'], { grade: { bri: 0.9, con: 1.6 }, mix: 0.6 }),
  PIXILATION:        g(1, 'hold', 'cut', 'typeOn', 'modern', ['filmdamage'], { mix: 0.35 }),
  SAND_GLASS:        g(8, 'float', 'ink-reveal', 'blurIn', 'classic', ['texturelab'], { grade: { warm: 0.25 }, transBeats: 2 }),
  MINIATURE:         g(4, 'drift', 'zoom-pull', 'dropIn', 'modern', ['tiltshift'], { grade: { sat: 1.3 } }),
  // ── Experimental ──
  DIRECT_FILM:       g(1, 'hold', 'film-burn', 'scramble', 'modern', ['filmdamage', 'analogdamage'], { transEvery: 4 }),
  VISUAL_MUSIC:      g(4, 'float', 'glow-dissolve', 'fadeIn', 'minimal', ['kaleidoscope'], { mix: 0.5 }),
  ROTOSCOPE:         g(4, 'drift', 'turbulence-dissolve', 'blurIn', 'classic', ['paintstudio'], { mix: 0.7 }),
  STRUCTURAL:        g(1, 'hold', 'cut', 'fadeIn', 'minimal', ['posterizesolarize'], { mix: 0.5 }),
  SURREAL:           g(4, 'drift', 'fold-turn', 'typeOn', 'classic', ['bulgepinch'], { look: 'archive-restore', mix: 0.4 }),
  INSTALLATION:      g(8, 'push', 'luma-dissolve', 'tracking', 'minimal', ['volumetricrays'], { mix: 0.5, transBeats: 2 }),
  // ── Games & Real-time ──
  PIXEL_ART:         g(2, 'hold', 'wipe-pixelate', 'typeOn', 'modern', ['ditherpalettes'], { look: 'handheld-console', mix: 0.6 }),
  GAME_VFX:          g(2, 'snap', 'burn-flash', 'dropIn', 'modern', ['edgeglow'], { mix: 0.6, transBeats: 0.5 }),
  DEMOSCENE:         g(2, 'float', 'plasma-iris', 'scramble', 'modern', ['rgbseparationpro'], { mix: 0.5 }),
  UI_MOTION:         g(3, 'push', 'push-slide', 'fadeUp', 'minimal', [], { transBeats: 0.5 }),
  LIVE2D:            g(6, 'float', 'blur-dissolve', 'fadeUp', 'modern', ['softdiffusion'], { mix: 0.4 }),
  ARCADE:            g(2, 'snap', 'channel-surf', 'typeOn', 'modern', ['vhscrt'], { mix: 0.6 }),
  // ── World traditions ──
  INK_WASH:          g(8, 'drift', 'ink-reveal', 'blurIn', 'classic', ['silkdiffusion'], { grade: { sat: 0.25, con: 1.1 }, transBeats: 2 }),
  FOLK_FABLE:        g(8, 'drift', 'dolly-fade', 'fadeUp', 'classic', ['mistdiffusion'], { look: 'sixteen-doc', mix: 0.5, transBeats: 2 }),
  LIGNE_CLAIRE:      g(4, 'push', 'push-slide', 'wordSlide', 'classic', ['graphiccartoon'], { mix: 0.45 }),
  AFRO_PATTERN:      g([3, 3, 2], 'push', 'shape-wipe', 'wordSlide', 'modern', ['luster'], { grade: { warm: 0.15, sat: 1.15 }, mix: 0.5 }),
  FOLK_GRAPHIC:      g(2, 'bounce', 'wipe-stripes', 'dropIn', 'modern', ['halftonepro'], { grade: { sat: 1.4 }, mix: 0.4 }),
  GEOMETRIC_CALLIGRAPHIC: g(4, 'push', 'wipe-star', 'typeOn', 'classic', ['kaleidoscope'], { mix: 0.35 }),
  SOUTH_ASIAN_FOLK:  g(2, 'push', 'zoom-pull', 'dropIn', 'classic', ['luster'], { grade: { sat: 1.35 }, mix: 0.5 }),
  WEBTOON:           g(4, 'scrollUp', 'push-slide', 'fadeUp', 'modern', ['softdiffusion'], { mix: 0.35 }),
};

/** The council directors also build, when no crew member is chosen (their grammars mirror their crafts). */
export const DIRECTOR_GRAMMAR: Record<string, BuildGrammar> = {
  KINETIC:    g(2, 'snap', 'push-slide', 'tracking', 'minimal', [], { transBeats: 0.5 }),
  CHARACTER:  g(4, 'bounce', 'film-dissolve', 'dropIn', 'classic', []),
  COMPOSITOR: g(6, 'push', 'film-dissolve', 'fadeIn', 'minimal', ['filmhalation'], { look: 'prestige-drama', mix: 0.4 }),
  GENERATIVE: g(4, 'float', 'turbulence-dissolve', 'scramble', 'modern', ['fluidwarp'], { mix: 0.35 }),
  SIGNAL:     g(2, 'shake', 'glitch-cut', 'scramble', 'modern', ['vhscrt', 'datamosh'], { mix: 0.5 }),
  CINEMATIC:  g(8, 'push', 'dolly-fade', 'fadeUp', 'classic', ['volumetricrays'], { look: 'anamorphic-night', mix: 0.45, transBeats: 2 }),
};

export function grammarFor(id: string): BuildGrammar | undefined {
  return BUILD_GRAMMAR[id] || DIRECTOR_GRAMMAR[id];
}
