// Plajah Vegetation — the Species document (docs/plajah-vegetation.md §2.1).
//
// A species is a small parameter set, not an asset: the grower regenerates any number of distinct trees from it at
// any detail level, and every Plajah world reads the same shape. Pure data — no three.js — so growth, measuring and
// validation run in node tests.

/** Radius of the crown at a height, both as fractions of the tree's height (0 = ground, 1 = top). */
export interface ProfilePoint { y: number; r: number }

export interface TreeSpecies {
  kind: 'tree';
  id: string;
  name: string;
  /** Mature height in metres (instances scale ±20% around it). */
  height: number;
  trunk: {
    /** Where the crown starts, as a fraction of the height (below it: bare trunk). */
    crownBase: number;
    /** Trunk radius at the ground, metres (before flare). */
    radius: number;
    /** Root flare: extra radius at the ground as a multiple of the radius. */
    flare: number;
    /** Lean of the trunk's top from vertical, as a fraction of the height. */
    lean: number;
    /** How much the trunk wanders (0 straight … 1 twisty). */
    wobble: number;
    /** Twisted trunks (spiralling strands in the art): turns over the trunk's length. */
    twist: number;
    /** Roots above ground: count and reach (multiple of the trunk radius). */
    roots: number; rootReach: number;
  };
  crown: {
    /** The crown's silhouette from the front: radius against height. Measured from the art (fromArt/profile). */
    profile: ProfilePoint[];
    /** Depth of the crown relative to its width (side view width / front view width). */
    depthScale: number;
    /** Space colonization: attractor count, kill distance and influence radius (metres), node step (metres). */
    attractors: number; kill: number; influence: number; step: number;
    /** + branches turn up toward the light, − they droop (willow). */
    gravitropism: number;
  };
  branches: {
    /** Pipe model exponent (Leonardo ~2–2.5): parent r^n = Σ child r^n. */
    pipe: number;
    /** Radius of the finest twig, metres. */
    tipRadius: number;
  };
  leaves: {
    /** Leaf-cluster card texture (cut from the art) with alpha; cells across × down in the atlas. */
    atlas: string; cells: [number, number];
    /** Cards per twig tip, card size (metres) and ±jitter. */
    perTip: number; size: number; sizeJitter: number;
    /** Hanging strands (willow): cards hang down from the tips instead of facing out. */
    hang?: boolean;
    /** Colour multiplier, light-through colour, and the glow from the art (bioluminescent species). */
    tint: number; transmission: number;
    glow?: { color: number; strength: number; beat: number };
  };
  bark: {
    map: string; normal?: string; tint: number;
    /** Glowing conduit veins in the bark (Cyber Forest). */
    veins?: { map: string; color: number; strength: number };
  };
  wind: {
    /** 0 rigid … 1 floppy: trunk bow, branch sway, leaf flutter. */
    trunk: number; branch: number; flutter: number;
  };
  provenance: {
    /** The art this species was measured from, and the sources of its textures (with licence lines). */
    art: string[];
    textures?: { file: string; source: string; licence: string }[];
    /** Art-fidelity score per view (0–1), written by the fromArt fitter. */
    scores?: Record<string, number>;
  };
}

export type Species = TreeSpecies;

/** Crown radius (fraction of height) at height y (fraction), linearly between the profile's points; 0 outside. */
export function profileAt(profile: ProfilePoint[], y: number): number {
  if (!profile.length || y < profile[0].y || y > profile[profile.length - 1].y) return 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if (y >= a.y && y <= b.y) { const t = (y - a.y) / Math.max(1e-6, b.y - a.y); return a.r + (b.r - a.r) * t; }
  }
  return profile[profile.length - 1].r;
}

/** Problems with a species document (empty = valid). */
export function validateSpecies(s: Species): string[] {
  const e: string[] = [];
  if (!(s.height > 0)) e.push('height must be > 0');
  if (s.trunk.crownBase < 0 || s.trunk.crownBase >= 1) e.push('trunk.crownBase must be in [0, 1)');
  const p = s.crown.profile;
  if (p.length < 2) e.push('crown.profile needs at least 2 points');
  for (let i = 1; i < p.length; i++) if (p[i].y <= p[i - 1].y) { e.push('crown.profile must rise in y'); break; }
  if (p.some((q) => q.r < 0)) e.push('crown.profile radii must be ≥ 0');
  if (s.crown.kill >= s.crown.influence) e.push('crown.kill must be smaller than crown.influence');
  if (s.crown.step <= 0) e.push('crown.step must be > 0');
  return e;
}

// ── grass (docs/plajah-vegetation.md §2.1, phase 3) ─────────────────────────────────────────────────────────────

/** A grass species: blades placed on the GPU from the world cell's own hash (grass/field.ts) — nothing stored per blade. */
export interface GrassSpecies {
  kind: 'grass';
  id: string;
  name: string;
  blade: {
    /** Metres, and ± fraction per blade. */
    height: number; heightJitter: number;
    /** Width at the base, metres. */
    width: number;
    /** Forward curl of the tip (fraction of the height it bows over). */
    curve: number;
    /** Lean away from the clump's centre, radians. */
    splay: number;
  };
  /** Blades per m² where the ground says this species grows at full strength. */
  density: number;
  /** Clumping: noise cell size (metres) and how strongly density and height follow it (0 even … 1 tufty). */
  clump: { size: number; strength: number };
  color: {
    base: number; mid: number; tip: number;
    /** ± brightness per blade. */
    jitter: number;
    /** Bright streak down the blade's middle (the art's striated blades), 0…1. */
    streak: number;
  };
  /** Glowing tips (bioluminescent grass): colour, strength, from what fraction of the blade up, and beat response. */
  glow?: { color: number; strength: number; from: number; beat: number };
  /** Light through the blade when seen against the light / edge-on, 0…1. */
  translucency: number;
  wind: {
    /** Lean in the wind (0 stiff … 1 limp). */
    sway: number;
    /** Quick per-blade flutter. */
    flutter: number;
  };
  provenance: { art: string[]; scores?: Record<string, number> };
}

export function validateGrass(s: GrassSpecies): string[] {
  const e: string[] = [];
  if (!(s.blade.height > 0)) e.push('blade.height must be > 0');
  if (!(s.blade.width > 0)) e.push('blade.width must be > 0');
  if (s.blade.heightJitter < 0 || s.blade.heightJitter >= 1) e.push('blade.heightJitter must be in [0, 1)');
  if (!(s.density > 0)) e.push('density must be > 0');
  if (s.clump.strength < 0 || s.clump.strength > 1) e.push('clump.strength must be in [0, 1]');
  if (!(s.clump.size > 0)) e.push('clump.size must be > 0');
  return e;
}

export type AnySpecies = TreeSpecies | GrassSpecies | PlantSpecies;

// ── plants (ferns, bushes, flowers — docs/plajah-vegetation.md §2.1, phase 3) ───────────────────────────────────

/** A small plant grown as one mesh per variant (plants/build.ts) and instanced (plants/field.ts). */
export interface PlantSpecies {
  kind: 'plant';
  id: string;
  name: string;
  form: 'fern' | 'bush' | 'flower';
  /** Overall height (m) and spread radius (m). */
  height: number; spread: number;
  /** Fern: fronds; bush: stems; flower: blooms. */
  count: number;
  /** Fern: leaflet pairs per frond; bush: leaves per stem; flower: petals per bloom. */
  parts: number;
  /** Leaf / leaflet / petal size (m). */
  leaf: number;
  color: { stem: number; leaf: number; tip: number; vein?: number };
  /** Glow (flower petals, glowing leaf edges), colour and strength, plus the beat response. */
  glow?: { color: number; strength: number; beat: number; center?: number };
  wind: { sway: number; flutter: number };
  provenance: { art: string[] };
}

export function validatePlant(s: PlantSpecies): string[] {
  const e: string[] = [];
  if (!(s.height > 0)) e.push('height must be > 0');
  if (!(s.spread > 0)) e.push('spread must be > 0');
  if (!(s.count >= 1)) e.push('count must be ≥ 1');
  if (!(s.parts >= 1)) e.push('parts must be ≥ 1');
  if (!(s.leaf > 0)) e.push('leaf must be > 0');
  return e;
}
