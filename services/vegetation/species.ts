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
