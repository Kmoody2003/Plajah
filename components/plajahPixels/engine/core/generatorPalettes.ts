// generatorPalettes — art-directed defaults for GEN_GLSL modes that have their own look.
//
// Dependency-free on purpose: the parameter panel (visualizerParams), Ambo's
// GeneratorSource and the generator lab all read it, and none of them should
// pull the shader catalogue in just to learn a default colour.
//
// A mode listed here starts on its own palette instead of the shared
// purple / crimson / orange; the operator can still recolour it freely.

import { STAGE_RIGS, STAGE_PARAM_LABELS } from './stageRigs';

export type GenPalette = [string, string, string];

export const GEN_PALETTES: Record<string, GenPalette> = {
  // ── Cosmos: nebulae and aurorae ──
  COSMIC_PILLARS:     ['#18B7C9', '#F2A33A', '#FF5A36'],  // teal gas, gold wisps, ember rims
  COSMIC_AURORA_VEIL: ['#2BFF88', '#8A3BFF', '#FF3D9A'],  // oxygen green, violet crown, pink fringe
  COSMIC_ORION:       ['#FF2E88', '#33CFFF', '#FFD27A'],  // H-alpha magenta, OIII cyan, hot gold core
  COSMIC_REMNANT:     ['#FF3355', '#2EE6D6', '#FFC24B'],  // H-alpha, OIII, sulphur
  COSMIC_GALAXY:      ['#5EA8FF', '#FFC870', '#FF4FA0'],  // blue arms, golden bulge, pink HII knots
  COSMIC_CORONA:      ['#36FF9B', '#A040FF', '#FF4D88'],  // green rays, violet zenith, pink hem
  COSMIC_MILKYWAY:    ['#6B8CFF', '#FFCF8A', '#FF5C8A'],  // blue haze, core gold, emission pink
  COSMIC_PLANETARY:   ['#2FD8FF', '#FF5A3C', '#B04BFF'],  // OIII eye, red ring, violet halo
  COSMIC_NURSERY:     ['#FF3FA0', '#3DA5FF', '#FFB347'],  // rose, sapphire, amber
  COSMIC_AURORA_LAKE: ['#3BFF9E', '#5B3BFF', '#FF4FB0'],  // green, indigo, rose

  // ── Fluid: colours mixing like liquids ──
  FLUID_INK:        ['#FF2D7A', '#00C2FF', '#FFC400'],
  FLUID_MARBLE:     ['#12D6C5', '#FF4F9A', '#FFB627'],
  FLUID_LAMP:       ['#FF5A1F', '#FF1F8E', '#3A1CFF'],    // two waxes + the liquid
  FLUID_OILFILM:    ['#0B2A6B', '#7A2CFF', '#00E5B0'],    // substrate + two film tints
  FLUID_VORTEX:     ['#FF3D6E', '#2BD9FF', '#B8FF3A'],
  FLUID_DENSITY:    ['#FF2E63', '#FFB000', '#20C4FF'],
  FLUID_SILK:       ['#7B2FFF', '#FF3FA4', '#00D4FF'],
  FLUID_SHEAR:      ['#FF6A00', '#2A6BFF', '#FF2EC4'],
  FLUID_CONVECTION: ['#FFD000', '#FF2A5F', '#3A5BFF'],
  FLUID_CAUSTIC:    ['#00E0D0', '#3A7BFF', '#FF5FD2'],

  // ── Planes: folding, interleaving sheets ──
  PLANES_PLEATS:   ['#F08A5D', '#F5D06A', '#3EA6A0'],    // coral, gold, teal cotton paper
  PLANES_WEAVE:    ['#D9A64A', '#2F7F8A', '#B55A7A'],    // gold warp, teal and rose weft
  PLANES_STAINED:  ['#E04A5A', '#F2C14E', '#2E7BD6'],    // ruby, amber, sapphire glass
  PLANES_TIDE:     ['#1D6B74', '#58C2B0', '#F7B267'],    // deep sea, foam, sunset
  PLANES_FAN:      ['#D98A7A', '#F7EDE4', '#8E4A68'],    // rose gold, ivory, plum
  PLANES_CHEVRON:  ['#C9743A', '#2E7F86', '#8A8F96'],    // copper, teal, pewter foil
  PLANES_LATTICE:  ['#7FB7E8', '#1E2F5A', '#F2B35E'],    // sky front, indigo ground, amber back
  PLANES_LAYERS:   ['#3A2A5E', '#A4789C', '#F3A779'],    // lavender, dusk, apricot card
  PLANES_BRAID:    ['#D9A441', '#7A2238', '#F7EBD9'],    // gold, burgundy, ivory satin
  PLANES_TAPESTRY: ['#2A1650', '#E05A9A', '#56C6E8'],    // indigo, magenta, cyan

  // ── Optics: properties of light ──
  OPTIC_HALO:     ['#0F2A4A', '#FFD9A0', '#DCEBFF'],     // deep sky, sun gold, halo white
  OPTIC_PRISM:    ['#101428', '#9FD8FF', '#FFF4D6'],     // dark, glass blue, beam white
  OPTIC_FLARE:    ['#0A1220', '#6FC3FF', '#FFE9B8'],     // night, coating blue, warm source
  OPTIC_LEAKS:    ['#2A1A10', '#F26B2A', '#FFD98A'],     // emulsion, orange halation, amber veil
  OPTIC_STREAKS:  ['#0F1A33', '#3F7FE0', '#FFD9A0'],     // night, anamorphic blue, candle
  OPTIC_CAUSTIC:  ['#4A3524', '#E8785A', '#F2B45C'],     // linen, red fringe, afternoon sun
  OPTIC_FILM:     ['#1A1428', '#D7A6FF', '#FFF0F8'],     // dark, lilac sky, rose highlight
  OPTIC_FLUTED:   ['#1A1030', '#FF7A59', '#4FB3E8'],     // night, coral sunset, sky blue
  OPTIC_RAYS:     ['#2A2216', '#E8B965', '#B9D6F2'],     // stone, gold sun, ice fill
  OPTIC_SPHERE:   ['#182A48', '#FFB38A', '#8FD3FF'],     // night wall, peach cloud, ice blue
};

/** What iParam0..3 mean for these modes (the panel shows these names). */
export const GEN_PARAM_LABELS: Record<string, [string, string, string, string]> = {
  COSMIC_PILLARS:     ['Pillar height', 'Detail', 'Music response', 'Composition'],
  COSMIC_AURORA_VEIL: ['Curtain folds', 'Detail', 'Music response', 'Variation'],
  COSMIC_ORION:       ['Turbulence', 'Detail', 'Music response', 'Camera angle'],
  COSMIC_REMNANT:     ['Shell size', 'Detail', 'Music response', 'Variation'],
  COSMIC_GALAXY:      ['Tilt', 'Detail', 'Music response', 'Rotation'],
  COSMIC_CORONA:      ['Swirl', 'Detail', 'Music response', 'Variation'],
  COSMIC_MILKYWAY:    ['Band width', 'Detail', 'Music response', 'Angle'],
  COSMIC_PLANETARY:   ['Ellipticity', 'Detail', 'Music response', 'Rotation'],
  COSMIC_NURSERY:     ['Cloud density', 'Detail', 'Music response', 'Variation'],
  COSMIC_AURORA_LAKE: ['Curtain folds', 'Detail', 'Music response', 'Variation'],
  FLUID_INK:        ['Turbulence', 'Detail', 'Music response', 'Variation'],
  FLUID_MARBLE:     ['Flow', 'Detail', 'Music response', 'Cells'],
  FLUID_LAMP:       ['Blob size', 'Blob count', 'Music response', 'Variation'],
  FLUID_OILFILM:    ['Swirl', 'Detail', 'Music response', 'Film thickness'],
  FLUID_VORTEX:     ['Stir', 'Detail', 'Music response', 'Variation'],
  FLUID_DENSITY:    ['Slosh', 'Detail', 'Music response', 'Variation'],
  FLUID_SILK:       ['Folds', 'Detail', 'Music response', 'Colour flow'],
  FLUID_SHEAR:      ['Roll strength', 'Detail', 'Music response', 'Variation'],
  FLUID_CONVECTION: ['Heat', 'Detail', 'Music response', 'Variation'],
  FLUID_CAUSTIC:    ['Waves', 'Detail', 'Music response', 'Variation'],
  PLANES_PLEATS:   ['Pace', 'Detail', 'Music response', 'Pleat count'],
  PLANES_WEAVE:    ['Pace', 'Detail', 'Music response', 'Weave pitch'],
  PLANES_STAINED:  ['Pace', 'Detail', 'Music response', 'Angle'],
  PLANES_TIDE:     ['Pace', 'Detail', 'Music response', 'Wave height'],
  PLANES_FAN:      ['Pace', 'Detail', 'Music response', 'Spread'],
  PLANES_CHEVRON:  ['Pace', 'Detail', 'Music response', 'Chevron count'],
  PLANES_LATTICE:  ['Pace', 'Detail', 'Music response', 'Tile size'],
  PLANES_LAYERS:   ['Pace', 'Detail', 'Music response', 'Layer spacing'],
  PLANES_BRAID:    ['Pace', 'Detail', 'Music response', 'Braid tightness'],
  PLANES_TAPESTRY: ['Pace', 'Detail', 'Music response', 'Crossing angle'],
  OPTIC_HALO:     ['Lens', 'Detail', 'Music response', 'Sun height'],
  OPTIC_PRISM:    ['Pace', 'Detail', 'Music response', 'Prism angle'],
  OPTIC_FLARE:    ['Pace', 'Detail', 'Music response', 'Source offset'],
  OPTIC_LEAKS:    ['Pace', 'Grain', 'Music response', 'Leak size'],
  OPTIC_STREAKS:  ['Pace', 'Light count', 'Music response', 'Arrangement'],
  OPTIC_CAUSTIC:  ['Pace', 'Detail', 'Music response', 'Glass size'],
  OPTIC_FILM:     ['Pace', 'Detail', 'Music response', 'Drain level'],
  OPTIC_FLUTED:   ['Pace', 'Detail', 'Music response', 'Reed width'],
  OPTIC_RAYS:     ['Pace', 'March steps', 'Music response', 'Camera yaw'],
  OPTIC_SPHERE:   ['Pace', 'Detail', 'Music response', 'Sphere size'],
};

// Concert-stage rigs (RIG_*) — catalogue in stageRigs.ts.
// Each rig's Director, Empty and Empty Director versions share its palette and sliders.
for (const r of STAGE_RIGS) for (const v of ['', '_DIRECTOR', '_EMPTY', '_EMPTY_DIRECTOR']) { GEN_PALETTES[r.mode + v] = r.palette; GEN_PARAM_LABELS[r.mode + v] = STAGE_PARAM_LABELS; }

// Director versions (MODE_DIRECTOR) share their standard version's palette and sliders.
for (const k of Object.keys(GEN_PALETTES)) GEN_PALETTES[k + '_DIRECTOR'] = GEN_PALETTES[k];
for (const k of Object.keys(GEN_PARAM_LABELS)) GEN_PARAM_LABELS[k + '_DIRECTOR'] = GEN_PARAM_LABELS[k];

/** Modes whose audio uniforms are envelope-smoothed (slow attack, slower release).
 *  Stage rigs light to the beat, so only the mellow ones are smoothed. */
const PUNCHY = new Set(STAGE_RIGS.filter(r => r.tier !== 'mellow').flatMap(r => [r.mode, r.mode + '_DIRECTOR', r.mode + '_EMPTY', r.mode + '_EMPTY_DIRECTOR']));
export const CALM_AUDIO_MODES = new Set(Object.keys(GEN_PALETTES).filter(m => !PUNCHY.has(m)));

export function genPalette(mode: string | null | undefined): GenPalette | undefined {
  return mode ? GEN_PALETTES[mode] : undefined;
}
