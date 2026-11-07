// imageWorldDirection — the shared vocabulary between the councils and the image-world engine.
//
// The councils (Art, Game & Interactive / 3D, Motion, and the Lighting Director) look at each image
// and fill in a WorldDirection using ONLY these words; the director and the shaders read it. Anything
// the councils haven't directed falls back to DEFAULT_DIRECTION, so a scene always plays.

export const SECTION_KINDS = ['intro', 'verse', 'build', 'drop', 'breakdown', 'outro'] as const;
export type SectionKind = typeof SECTION_KINDS[number];

/** 3D world camera shots (the director owns a free camera). */
export const WORLD_SHOTS = ['wide', 'orbit', 'flythrough', 'crane', 'hero', 'top', 'macro', 'vertigo', 'truck'] as const;
export type WorldShot = typeof WORLD_SHOTS[number];
/** 2.5D plate shots (the frame must stay filled). */
export const PLATE_SHOTS = ['push', 'pull', 'pan', 'tilt', 'rack', 'snap', 'dutch', 'drift'] as const;
export type PlateShot = typeof PLATE_SHOTS[number];

/** Gestures the geometry can make on a section's arrival. Each maps to a uniform weight. */
export const DROP_GESTURES = ['explode', 'shockwave', 'flash', 'spin'] as const;
export const BUILD_GESTURES = ['gather', 'tremble', 'rise', 'brighten'] as const;
export const BREAK_GESTURES = ['slow', 'desaturate', 'flatten', 'sparse'] as const;
export type DropGesture = typeof DROP_GESTURES[number];
export type BuildGesture = typeof BUILD_GESTURES[number];
export type BreakGesture = typeof BREAK_GESTURES[number];

export interface WorldDirection {
  summary: string;
  /** Lighting Director: a look from the Plajah looks library (services/lighting/looks.ts) per section. */
  looks: Record<SectionKind, string>;
  /** Accent colours the light rig mixes with each look's palette (hex). */
  lightPalette: string[];
  shots: { world: Record<SectionKind, WorldShot[]>; plate: Record<SectionKind, PlateShot[]> };
  /** Show mode: which way plays each section. */
  show: Record<SectionKind, 'plate' | 'world'>;
  gestures: { drop: DropGesture[]; build: BuildGesture[]; breakdown: BreakGesture[] };
  /** 0.5–1.5 multipliers. */
  intensity: { camera: number; reactivity: number; glow: number };
  notes?: Partial<Record<'art' | 'threeD' | 'motion' | 'lighting' | 'performance', string>>;
}

export const DEFAULT_DIRECTION: WorldDirection = {
  summary: '',
  looks: { intro: 'Ballad Silhouette', verse: 'Arena Blue', build: 'Rock Chase', drop: 'EDM Drop', breakdown: 'Ultraviolet', outro: 'Ballad Silhouette' },
  lightPalette: ['#ffffff'],
  shots: {
    world: { intro: ['wide', 'crane'], verse: ['orbit', 'truck', 'macro', 'hero'], build: ['vertigo', 'flythrough', 'macro'], drop: ['flythrough', 'hero', 'orbit', 'wide', 'top'], breakdown: ['wide', 'top', 'crane'], outro: ['wide', 'crane'] },
    plate: { intro: ['drift', 'pull'], verse: ['pan', 'push', 'rack', 'tilt'], build: ['push', 'snap', 'dutch'], drop: ['snap', 'push', 'dutch', 'pan'], breakdown: ['drift', 'pull'], outro: ['pull', 'drift'] },
  },
  show: { intro: 'plate', verse: 'plate', build: 'plate', drop: 'world', breakdown: 'plate', outro: 'plate' },
  gestures: { drop: ['explode', 'shockwave', 'flash'], build: ['gather', 'tremble', 'brighten'], breakdown: ['slow', 'desaturate'] },
  intensity: { camera: 1, reactivity: 1, glow: 1 },
};

/** Merge a (possibly partial or slightly off-vocabulary) council answer onto the defaults. */
export function resolveDirection(d?: Partial<WorldDirection> | null): WorldDirection {
  const D = DEFAULT_DIRECTION;
  if (!d) return D;
  const pick = <T extends string>(arr: unknown, vocab: readonly T[], fb: T[]): T[] => {
    const ok = Array.isArray(arr) ? arr.filter((x): x is T => vocab.includes(x as T)) : [];
    return ok.length ? ok : fb;
  };
  const per = <T>(src: any, f: (k: SectionKind, v: any) => T): Record<SectionKind, T> =>
    Object.fromEntries(SECTION_KINDS.map(k => [k, f(k, src?.[k])])) as Record<SectionKind, T>;
  const clamp = (x: any, fb: number) => Number.isFinite(+x) ? Math.max(0.5, Math.min(1.5, +x)) : fb;
  return {
    summary: typeof d.summary === 'string' ? d.summary : '',
    looks: per(d.looks, (k, v) => typeof v === 'string' && v ? v : D.looks[k]),
    lightPalette: Array.isArray(d.lightPalette) && d.lightPalette.every(h => /^#[0-9a-f]{6}$/i.test(h)) && d.lightPalette.length ? d.lightPalette.slice(0, 4) : D.lightPalette,
    shots: {
      world: per(d.shots?.world, (k, v) => pick(v, WORLD_SHOTS, D.shots.world[k])),
      plate: per(d.shots?.plate, (k, v) => pick(v, PLATE_SHOTS, D.shots.plate[k])),
    },
    show: per(d.show, (k, v) => v === 'plate' || v === 'world' ? v : D.show[k]),
    gestures: {
      drop: pick(d.gestures?.drop, DROP_GESTURES, D.gestures.drop),
      build: pick(d.gestures?.build, BUILD_GESTURES, D.gestures.build),
      breakdown: pick(d.gestures?.breakdown, BREAK_GESTURES, D.gestures.breakdown),
    },
    intensity: { camera: clamp(d.intensity?.camera, 1), reactivity: clamp(d.intensity?.reactivity, 1), glow: clamp(d.intensity?.glow, 1) },
    notes: d.notes,
  };
}
