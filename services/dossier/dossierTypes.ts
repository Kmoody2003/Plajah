/**
 * Dossier — types for museum/biography/documentary experiences.
 *
 * Three invariants hold the whole system together:
 *  1. Every claim is backed by a ledger entry (source + confidence). No ledger entry, no exhibit text.
 *  2. Every asset carries a rights record. Unknown rights = blocked.
 *  3. Every depiction of a person goes through that person's CharacterBible, never free text,
 *     so the likeness stays consistent across stills, video, 3D and infographics.
 */

export type DepthLevel = 'early' | 'elementary' | 'middle' | 'high' | 'university';
export const DEPTH_LEVELS: DepthLevel[] = ['early', 'elementary', 'middle', 'high', 'university'];
export const DEPTH_LABEL: Record<DepthLevel, string> = {
  early: 'Pre-K – 2',
  elementary: 'Grades 3 – 5',
  middle: 'Grades 6 – 8',
  high: 'Grades 9 – 12',
  university: 'University',
};

export type Confidence = 'established' | 'probable' | 'contested' | 'tradition';

export interface SourceRef {
  id: string;
  kind: 'primary' | 'secondary' | 'archive' | 'scholarly';
  citation: string;
  url?: string;
}

/** One verifiable statement. Exhibit text references claims by id. */
export interface Claim {
  id: string;
  text: string;
  /** ISO date or year string when it applies, for timelines. */
  when?: string;
  where?: string;
  confidence: Confidence;
  sourceIds: string[];
  /** Required when confidence is contested or tradition: what the disagreement is. */
  note?: string;
}

export interface EvidenceLedger {
  subjectId: string;
  sources: SourceRef[];
  claims: Claim[];
}

// ── Rights ────────────────────────────────────────────────────────────────

export type RightsStatus = 'public-domain' | 'cc0' | 'cc-by' | 'cc-by-sa' | 'generated' | 'unknown';

export interface Rights {
  status: RightsStatus;
  credit: string;
  /** Where the licence/status was verified (archive record URL). */
  verifiedAt?: string;
}

/** Statuses a Dossier may publish. cc-by-sa is allowed but forces share-alike credit. */
export const PUBLISHABLE: RightsStatus[] = ['public-domain', 'cc0', 'cc-by', 'cc-by-sa', 'generated'];

export type AssetKind = 'photo' | 'document' | 'illustration' | 'audio' | 'video' | 'model3d' | 'infographic' | 'recreation';

export interface DossierAsset {
  id: string;
  kind: AssetKind;
  title: string;
  url: string;
  rights: Rights;
  claimIds: string[];
  /** Recreated or AI-generated depictions must say so on screen. */
  reconstruction?: { characterIds: string[]; basis: string; generator: string };
  /** Hide this image below this reading level (e.g. distressing historical photographs). */
  minDepth?: DepthLevel;
}

// ── Character consistency ─────────────────────────────────────────────────

export interface LikenessVariant {
  /** e.g. "young-1840s", "orator-1860s", "elder-1890s". */
  id: string;
  ageRange: [number, number];
  descriptor: string;
  /** Real, rights-cleared reference photos/portraits that anchor this variant. */
  referenceAssetIds: string[];
}

export interface CharacterBible {
  id: string;
  name: string;
  /** Locked, identity-defining description reused verbatim in every prompt. */
  coreDescriptor: string;
  /** Things generations must never do (anachronism, caricature, distortion). */
  forbidden: string[];
  variants: LikenessVariant[];
  /** Fixed generation seed so repeat renders start from the same point. */
  seed: number;
  /** Lets the hall match a room's years to the person's age (and say when no photograph exists yet). */
  birthYear?: number;
  /** Provider-side trained character/reference id, once created (e.g. Magnific custom character). */
  providerCharacterId?: string;
  /** Wardrobe/props per scene era, so clothing stays period-correct and stable. */
  wardrobe?: Record<string, string>;
}

// ── Exhibit structure ─────────────────────────────────────────────────────

/** Text for one node at every depth. All five must exist; they differ in depth, never in fact. */
export type DepthText = Record<DepthLevel, string>;

/** Interactive pieces a node can host. Only the ones DossierHall maps to a component render; the rest are reserved. */
export type DossierExperience =
  | 'model-t-exploded'
  | 'ford-moving-line'
  | 'douglass-composing-stick'
  | 'persia-road'
  | 'partition-pen'
  | 'founding-timeline';

export interface ExhibitNode {
  id: string;
  title: string;
  kind: 'story' | 'artifact' | 'timeline' | 'film' | 'infographic' | 'source-reading';
  text: DepthText;
  claimIds: string[];
  assetIds: string[];
  /** Fabula project id / Tela doc id once produced. */
  fabulaProjectId?: string;
  telaDocId?: string;
  /** Optional interactive experience rendered inside the node card (lazy-loaded). */
  experience?: DossierExperience;
}

export interface Room {
  id: string;
  title: string;
  years?: string;
  nodes: ExhibitNode[];
}

/** Cinematic opening sequence data. Montage frames are real, rights-cleared assets in chronological order. */
export interface DossierEntrance {
  tagline: string;
  dates: string;
  epigraph: { text: string; cite: string };
  /** focus = where the face sits in the image (0..1) and how large to frame it (% of screen height). */
  montage: Array<{ assetId: string; label: string; focus?: { x: number; y: number; scale: number } }>;
  /** Optional original score (public path). The entrance works silently without it. */
  scoreUrl?: string;
}

export interface Dossier {
  id: string;
  subject: string;
  kind: 'biography' | 'topic';
  rooms: Room[];
  ledger: EvidenceLedger;
  assets: DossierAsset[];
  characters: CharacterBible[];
  entrance?: DossierEntrance;
  /** Optional named groups of rooms, shown as headings in the hall's plan strip. Rooms not listed sit after the last wing. */
  wings?: Array<{ id: string; title: string; roomIds: readonly string[] }>;
}

// ── Validation ────────────────────────────────────────────────────────────

export interface DossierIssue {
  severity: 'error' | 'warn';
  where: string;
  message: string;
}

/** Hard rules the pipeline enforces before anything is published. */
export function validateDossier(d: Dossier): DossierIssue[] {
  const issues: DossierIssue[] = [];
  const claimIds = new Set(d.ledger.claims.map(c => c.id));
  const sourceIds = new Set(d.ledger.sources.map(s => s.id));
  const assetIds = new Set(d.assets.map(a => a.id));
  const charIds = new Set(d.characters.map(c => c.id));

  for (const c of d.ledger.claims) {
    if (!c.sourceIds.length) issues.push({ severity: 'error', where: c.id, message: 'claim has no source' });
    for (const s of c.sourceIds) if (!sourceIds.has(s)) issues.push({ severity: 'error', where: c.id, message: `unknown source ${s}` });
    if ((c.confidence === 'contested' || c.confidence === 'tradition') && !c.note)
      issues.push({ severity: 'error', where: c.id, message: `${c.confidence} claim needs a note explaining the disagreement` });
  }
  for (const a of d.assets) {
    if (!PUBLISHABLE.includes(a.rights.status)) issues.push({ severity: 'error', where: a.id, message: `rights ${a.rights.status} are not publishable` });
    if (!a.rights.credit) issues.push({ severity: 'error', where: a.id, message: 'missing credit line' });
    if ((a.kind === 'recreation' || a.rights.status === 'generated') && !a.reconstruction)
      issues.push({ severity: 'error', where: a.id, message: 'generated/recreated asset must declare reconstruction basis' });
    for (const cid of a.reconstruction?.characterIds ?? [])
      if (!charIds.has(cid)) issues.push({ severity: 'error', where: a.id, message: `unknown character ${cid}` });
  }
  for (const room of d.rooms) for (const n of room.nodes) {
    for (const lvl of DEPTH_LEVELS) if (!n.text[lvl]?.trim()) issues.push({ severity: 'error', where: n.id, message: `missing ${lvl} text` });
    if (!n.claimIds.length) issues.push({ severity: 'warn', where: n.id, message: 'node cites no claims' });
    for (const c of n.claimIds) if (!claimIds.has(c)) issues.push({ severity: 'error', where: n.id, message: `unknown claim ${c}` });
    for (const a of n.assetIds) if (!assetIds.has(a)) issues.push({ severity: 'error', where: n.id, message: `unknown asset ${a}` });
  }
  for (const ch of d.characters) {
    if (!ch.variants.length) issues.push({ severity: 'error', where: ch.id, message: 'character bible has no variants' });
    for (const v of ch.variants) if (!v.referenceAssetIds.length)
      issues.push({ severity: 'error', where: `${ch.id}/${v.id}`, message: 'variant has no real reference asset' });
  }
  return issues;
}
