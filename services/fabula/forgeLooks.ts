// forgeLooks — a LOOK is a named, ordered stack of Forge effects (the Magic Bullet Looks idea).
//
// Single effects get you parts; a look gets you a result. A look is pure data — effect id,
// optional preset, optional param overrides, optional mix — so applying one is just building
// the same ForgeEffectInstance array the inspector already edits. Nothing new reaches the
// renderer, which means monitor/export parity comes for free.
//
// Built-in looks ship with the app; user looks are captured from whatever stack is on the
// selected clip and persisted per browser. Both are validated by tests: every step must name a
// real effect, a real preset, and parameter values inside the declared range.
import { FX_EFFECTS } from '../../components/plajahPixels/engine/fx/effects';
import { createEffectInstance, type ForgeEffectInstance } from './forgeEffects';
import type { TelaChartStyle } from '../../types';

export type LookCategory = 'cinematic' | 'vintage' | 'music' | 'documentary' | 'genre' | 'graphic';
export const LOOK_CATEGORIES: { id: LookCategory; label: string }[] = [
  { id: 'cinematic', label: 'CINEMATIC' }, { id: 'vintage', label: 'VINTAGE' }, { id: 'music', label: 'MUSIC' },
  { id: 'documentary', label: 'DOC' }, { id: 'genre', label: 'GENRE' }, { id: 'graphic', label: 'GRAPHIC' },
];

export interface LookStep {
  effectId: string;
  presetId?: string;
  /** Overrides applied on top of the preset (or the effect defaults). */
  params?: Record<string, number>;
  /** 0..1 blend of this effect over its input. */
  mix?: number;
}
export interface ForgeLook {
  id: string; name: string; category: LookCategory; description: string;
  steps: LookStep[];
  builtIn?: boolean;
  councilStyle?: TelaChartStyle;
  /** Epoch ms; user looks only. */
  saved?: number;
}

export const FORGE_LOOKS: ForgeLook[] = [
  // ── cinematic ────────────────────────────────────────────────────────────────────────────
  { id: 'prestige-drama', name: 'Prestige Drama', category: 'cinematic', builtIn: true, councilStyle: 'BAROQUE',
    description: 'Dense blacks, restrained colour and a whisper of halation — the streaming-drama house style.',
    steps: [{ effectId: 'looksdesigner', presetId: 'prestige' }, { effectId: 'filmhalation', presetId: 'subtle-stock', mix: .7 }, { effectId: 'mistdiffusion', presetId: 'black-mist-quarter', mix: .6 }, { effectId: 'regrain', presetId: 'fine-35' }] },
  { id: 'teal-amber', name: 'Teal & Amber', category: 'cinematic', builtIn: true, councilStyle: 'EDITORIAL',
    description: 'Controlled complementary separation with a premium bloom — the blockbuster trailer grade.',
    steps: [{ effectId: 'cinematiccolor', presetId: 'teal-amber' }, { effectId: 'opticalglow', presetId: 'premium', mix: .5 }, { effectId: 'mistdiffusion', presetId: 'black-mist-quarter', mix: .5 }, { effectId: 'regrain', presetId: 'fine-35' }] },
  { id: 'golden-hour', name: 'Golden Hour', category: 'cinematic', builtIn: true, councilStyle: 'CLASSICAL',
    description: 'Low warm sun, glowing skin and soft atmosphere, whatever time you actually shot.',
    steps: [{ effectId: 'atmosphericglow', presetId: 'morning' }, { effectId: 'cineglow', presetId: 'golden-hour', mix: .8 }, { effectId: 'skinrefine', presetId: 'golden' }, { effectId: 'filmhalation', presetId: '35mm', mix: .6 }] },
  { id: 'dream-portrait', name: 'Dream Portrait', category: 'cinematic', builtIn: true, councilStyle: 'CLASSICAL',
    description: 'Silk diffusion and a gentle beauty pass — flattering without turning plastic.',
    steps: [{ effectId: 'silkdiffusion', presetId: 'silk-heavy', mix: .75 }, { effectId: 'beautyblur', presetId: 'soft-glam', mix: .6 }, { effectId: 'skinrefine', presetId: 'natural' }, { effectId: 'cineglow', presetId: 'silk', mix: .5 }] },
  { id: 'anamorphic-night', name: 'Anamorphic Night', category: 'cinematic', builtIn: true, councilStyle: 'NEON',
    description: 'Blue streak flares on the practicals, deep mist and a cool falloff.',
    steps: [{ effectId: 'looksdesigner', presetId: 'night-neon' }, { effectId: 'flarerig', presetId: 'anamorphic-blue', mix: .8 }, { effectId: 'mistdiffusion', presetId: 'black-mist-1', mix: .7 }, { effectId: 'regrain', presetId: 'fine-35' }] },
  // ── vintage ──────────────────────────────────────────────────────────────────────────────
  { id: 'super8-memory', name: 'Super 8 Memory', category: 'vintage', builtIn: true, councilStyle: 'INK',
    description: 'Gate weave, faded dye and warm halation — a home movie found in the attic.',
    steps: [{ effectId: 'retrograde', presetId: 'super8' }, { effectId: 'filmhalation', presetId: 'super8', mix: .8 }, { effectId: 'softdiffusion', presetId: 'vintage-glass', mix: .6 }, { effectId: 'regrain', presetId: 'organic-16' }] },
  { id: 'vhs-rewind', name: 'VHS Rewind', category: 'vintage', builtIn: true, councilStyle: 'INK',
    description: 'Worn tape, chroma bleed and tracking damage from a cassette played too often.',
    steps: [{ effectId: 'vhscrt', presetId: 'worn-tape' }, { effectId: 'analogdamage', presetId: 'broken-tape', mix: .7 }, { effectId: 'chromaticfringe', presetId: 'music-split', mix: .5 }] },
  { id: 'kodachrome-slide', name: 'Kodachrome Slide', category: 'vintage', builtIn: true, councilStyle: 'WORLD_ATLAS',
    description: 'Cardboard slide mount, rich reds and projector dust.',
    steps: [{ effectId: 'carousel', presetId: 'kodachrome' }, { effectId: 'filmhalation', presetId: '35mm', mix: .6 }, { effectId: 'regrain', presetId: 'fine-35' }] },
  { id: 'sixteen-doc', name: '16 mm Documentary', category: 'vintage', builtIn: true, councilStyle: 'INK',
    description: 'Clean reversal stock with organic grain and just enough gate movement.',
    steps: [{ effectId: 'retrograde', presetId: 'sixteen' }, { effectId: 'regrain', presetId: 'organic-16' }, { effectId: 'parametriccurve', presetId: 'rich-print', mix: .8 }] },
  // ── music ────────────────────────────────────────────────────────────────────────────────
  { id: 'music-punch', name: 'Music Video Punch', category: 'music', builtIn: true, councilStyle: 'PLAJAH',
    description: 'Saturated split-tone, hard glow and a chromatic streak on every highlight.',
    steps: [{ effectId: 'prismgrade', presetId: 'royal-citrus' }, { effectId: 'ultraglow', presetId: 'energy', mix: .7 }, { effectId: 'rgbseparationpro', presetId: 'music-streak', mix: .6 }] },
  { id: 'neon-club', name: 'Neon Club', category: 'music', builtIn: true, councilStyle: 'NEON',
    description: 'Aurora glow over neon contours with a heavy black mist — late-night performance.',
    steps: [{ effectId: 'looksdesigner', presetId: 'night-neon' }, { effectId: 'glofi', presetId: 'aurora-glow', mix: .65 }, { effectId: 'neoncontours', presetId: 'electric-violet', mix: .45 }, { effectId: 'mistdiffusion', presetId: 'black-mist-1', mix: .6 }] },
  { id: 'strobe-cut', name: 'Strobe Cut', category: 'music', builtIn: true, councilStyle: 'REBEL',
    description: 'Stop-motion cadence with light trails — performance footage on the beat.',
    steps: [{ effectId: 'strobefreeze', presetId: 'stop-motion' }, { effectId: 'trails', presetId: 'light-paint', mix: .6 }, { effectId: 'ultraglow', presetId: 'neon', mix: .5 }] },
  // ── documentary ──────────────────────────────────────────────────────────────────────────
  { id: 'doc-clean', name: 'Documentary Clean', category: 'documentary', builtIn: true, councilStyle: 'SWISS',
    description: 'Neutral balance, noise cleaned up and detail recovered — honest and broadcast-safe.',
    steps: [{ effectId: 'autobalance', presetId: 'warm-fix' }, { effectId: 'spatialdenoise', presetId: 'clean-iso' }, { effectId: 'detailsharpen', presetId: 'clean-detail', mix: .8 }, { effectId: 'parametriccurve', presetId: 'gentle-s' }] },
  { id: 'interview-beauty', name: 'Interview Beauty', category: 'documentary', builtIn: true, councilStyle: 'SWISS',
    description: 'A flattering sit-down: soft skin, protected detail and a gentle centre spot.',
    steps: [{ effectId: 'beautyblur', presetId: 'natural' }, { effectId: 'skinrefine', presetId: 'natural' }, { effectId: 'softdiffusion', presetId: 'clean-skin', mix: .6 }, { effectId: 'centerspot', presetId: 'portrait', mix: .5 }] },
  { id: 'archive-restore', name: 'Archive Restore', category: 'documentary', builtIn: true, councilStyle: 'WORLD_ATLAS',
    description: 'Steadies exposure, removes dust and lifts detail out of old footage.',
    steps: [{ effectId: 'deflicker', presetId: 'archive-film' }, { effectId: 'temporalrepair', presetId: 'film-dust' }, { effectId: 'spatialdenoise', presetId: 'gentle' }, { effectId: 'detailsharpen', presetId: 'soft-source', mix: .7 }] },
  // ── genre ────────────────────────────────────────────────────────────────────────────────
  { id: 'noir', name: 'Noir', category: 'genre', builtIn: true, councilStyle: 'MONO',
    description: 'Silver bleach, deep mist and a tight pool of light on the subject.',
    steps: [{ effectId: 'bleachbypass', presetId: 'fashion-silver' }, { effectId: 'mistdiffusion', presetId: 'black-mist-1', mix: .7 }, { effectId: 'centerspot', presetId: 'tight', mix: .6 }, { effectId: 'regrain', presetId: 'organic-16' }] },
  { id: 'sci-fi-hologram', name: 'Sci-Fi Hologram', category: 'genre', builtIn: true, councilStyle: 'FUTURIST',
    description: 'Scanned signal, violet edge contours and a quantum glow — projected, not filmed.',
    steps: [{ effectId: 'analogtv', presetId: 'lost-signal', mix: .6 }, { effectId: 'neoncontours', presetId: 'electric-violet' }, { effectId: 'glofi', presetId: 'quantum', mix: .6 }, { effectId: 'chromaticfringe', presetId: 'prism-edge', mix: .5 }] },
  { id: 'winter-blizzard', name: 'Winter Blizzard', category: 'genre', builtIn: true, councilStyle: 'TOPOGRAPHIC',
    description: 'Driving snow over a cold silver grade with white mist in the air.',
    steps: [{ effectId: 'dayfornight', presetId: 'silver-night', mix: .7 }, { effectId: 'particlefield', presetId: 'blizzard' }, { effectId: 'mistdiffusion', presetId: 'white-mist', mix: .6 }] },
  { id: 'campfire', name: 'Campfire', category: 'genre', builtIn: true, councilStyle: 'CEREMONIAL',
    description: 'Embers drifting up through warm stage haze and gentle halation.',
    steps: [{ effectId: 'atmosphericglow', presetId: 'stage' }, { effectId: 'particlefield', presetId: 'embers' }, { effectId: 'filmhalation', presetId: '35mm', mix: .7 }] },
  { id: 'heat-mirage', name: 'Heat Mirage', category: 'genre', builtIn: true, councilStyle: 'TOPOGRAPHIC',
    description: 'Air shimmering off hot ground with a bleached, sun-punished grade.',
    steps: [{ effectId: 'heatwave', presetId: 'road' }, { effectId: 'bleachbypass', presetId: 'war-drama', mix: .6 }, { effectId: 'doublefog', presetId: 'double-fog-1', mix: .5 }] },
  // ── graphic ──────────────────────────────────────────────────────────────────────────────
  { id: 'comic-ink', name: 'Comic Ink', category: 'graphic', builtIn: true, councilStyle: 'REBEL',
    description: 'Flat inked cells with a four-colour rosette screen — a panel, not a photograph.',
    steps: [{ effectId: 'graphiccartoon', presetId: 'bold-comic' }, { effectId: 'editorialprint', presetId: 'comic-ink', mix: .7 }, { effectId: 'halftonepro', presetId: 'cmyk-comic', mix: .5 }] },
  { id: 'terminal-feed', name: 'Terminal Feed', category: 'graphic', builtIn: true, councilStyle: 'MONO',
    description: 'Green ASCII on a dying signal with a targeting overlay — surveillance fiction.',
    steps: [{ effectId: 'symbolmapper', presetId: 'terminal' }, { effectId: 'analogtv', presetId: 'lost-signal', mix: .5 }, { effectId: 'hudrings', presetId: 'targeting', mix: .7 }] },
  { id: 'blueprint', name: 'Blueprint', category: 'graphic', builtIn: true, councilStyle: 'TOPOGRAPHIC',
    description: 'White line work on drafting blue — technical, schematic, deliberate.',
    steps: [{ effectId: 'sketchify', presetId: 'blueprint' }, { effectId: 'neoncontours', presetId: 'subtle-edge', mix: .4 }] },
  { id: 'handheld-console', name: 'Handheld Console', category: 'graphic', builtIn: true, councilStyle: 'RADICAL_MINIMAL',
    description: 'Four-tone dithered pixels — a cartridge running on a scratched screen.',
    steps: [{ effectId: 'ditherpalettes', presetId: 'gameboy' }, { effectId: 'vhscrt', presetId: 'clean-vhs', mix: .35 }] },
];

// ── instantiate ─────────────────────────────────────────────────────────────────────────────
let seq = 0;
const defaultId = (effectId: string) => `${effectId}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Build the effect-stack instances for a look. `mkId` keeps ids unique/deterministic in tests. */
export function instantiateLook(look: ForgeLook, mkId: (effectId: string, index: number) => string = defaultId): ForgeEffectInstance[] {
  return look.steps.map((step, i) => {
    const instance = createEffectInstance(step.effectId, step.presetId, mkId(step.effectId, i));
    return {
      ...instance,
      ...(step.params ? { params: { ...instance.params, ...step.params }, presetId: undefined } : {}),
      ...(step.mix != null ? { mix: Math.max(0, Math.min(1, step.mix)) } : {}),
    };
  });
}

/** Capture the clip's current stack as a reusable look (param values are frozen in). */
export function lookFromStack(stack: ForgeEffectInstance[], name: string, category: LookCategory = 'cinematic', description = ''): ForgeLook {
  return {
    id: `user-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'look'}-${Date.now().toString(36)}`,
    name, category, description, saved: Date.now(),
    steps: stack.filter(i => i && i.effectId).map(i => ({ effectId: i.effectId, params: { ...i.params }, ...(i.mix != null && i.mix !== 1 ? { mix: i.mix } : {}) })),
  };
}

/** Every step names a real effect, a real preset (if given) and in-range params. */
export function validateLook(look: ForgeLook): string[] {
  const problems: string[] = [];
  if (!look.steps.length) problems.push(`${look.id}: no steps`);
  for (const step of look.steps) {
    const effect = FX_EFFECTS.find(e => e.id === step.effectId);
    if (!effect) { problems.push(`${look.id}: unknown effect "${step.effectId}"`); continue; }
    if (step.presetId && !(effect.presets || []).some(p => p.id === step.presetId)) problems.push(`${look.id}/${step.effectId}: unknown preset "${step.presetId}"`);
    for (const [key, value] of Object.entries(step.params || {})) {
      const param = effect.params.find(p => p.key === key);
      if (!param) { problems.push(`${look.id}/${step.effectId}: unknown param "${key}"`); continue; }
      if (value < param.min || value > param.max) problems.push(`${look.id}/${step.effectId}/${key}: ${value} outside [${param.min}, ${param.max}]`);
    }
    if (step.mix != null && (step.mix < 0 || step.mix > 1)) problems.push(`${look.id}/${step.effectId}: mix ${step.mix} outside [0, 1]`);
  }
  return problems;
}

// ── user looks (per browser; the project keeps its own copy when saved with the production) ──
const STORE_KEY = 'fabula:looks:v1';

export function loadUserLooks(): ForgeLook[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(l => l && typeof l.id === 'string' && Array.isArray(l.steps)) : [];
  } catch { return []; }
}
function writeUserLooks(looks: ForgeLook[]) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify(looks)); } catch { /* private mode / quota */ }
}
export function saveUserLook(look: ForgeLook): ForgeLook[] {
  const next = [...loadUserLooks().filter(l => l.id !== look.id), look].sort((a, b) => (b.saved || 0) - (a.saved || 0));
  writeUserLooks(next); return next;
}
export function deleteUserLook(id: string): ForgeLook[] {
  const next = loadUserLooks().filter(l => l.id !== id);
  writeUserLooks(next); return next;
}
export function allLooks(): ForgeLook[] { return [...FORGE_LOOKS, ...loadUserLooks()]; }
