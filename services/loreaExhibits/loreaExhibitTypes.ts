// loreaExhibitTypes — the Lorea Exhibition Hall: literature's craft as walk-through exhibits.
//
// Modelled on the Academia Dossier hall (rooms → nodes, five reading depths from early years to
// university) but built for craft, not history: every room holds wall text, real passages from the
// public-domain library, and a hands-on station where the reader does the thing being taught —
// taps stresses, sorts a pyramid, rebuilds a sentence. Each exhibit also seeds "nuggets": small
// torn-paper teasers planted around Lorea and the feed, each a door back into its room.
//
// Look and feel is handmade: papers, inks and washes per exhibit (ExhibitMaterials). The Art
// Council sets those materials and the Writers Council the voice; `council.source` says whether an
// exhibit carries a council build or the hand-authored one in the council's shape.
import type { DepthLevel, DepthText } from '../dossier/dossierTypes';
import type { CouncilDirectorId } from '../council/councilTypes';

export type { DepthLevel, DepthText };

export type LoreaExhibitId = 'prose' | 'poetry' | 'journalism' | 'story' | 'character' | 'plot' | 'rhythm' | 'grammar';

export type PaperKind = 'laid' | 'cotton' | 'kraft' | 'vellum' | 'newsprint' | 'rag' | 'parchment' | 'washi';
export type InkKind = 'iron-gall' | 'sepia' | 'indigo' | 'vermilion' | 'carbon' | 'verdigris';
export type MotifGlyph = 'quill' | 'press' | 'lyre' | 'lantern' | 'mask' | 'arc' | 'metronome' | 'type-case';

export interface ExhibitMaterials {
  paper: PaperKind;
  ink: InkKind;
  /** two watercolor washes bled behind headings and stations (hex) */
  wash: [string, string];
  /** the one saturated colour — stamps, underlines, the station frame */
  accent: string;
  /** display lettering: brush script, hand-printed caps, or letterpress type */
  hand: 'script' | 'print' | 'type';
  motif: MotifGlyph;
}

/** A real passage from the public-domain library, with where to find it. */
export interface LibraryExample {
  id: string;
  work: string;
  author: string;
  year?: string;
  /** Project Gutenberg id when the work is in Lorea's classic shelf — makes "Read it in Lorea" work */
  gutenbergId?: string;
  passage: string;
  /** substrings of `passage` to ink-underline */
  marks?: string[];
  /** what to notice, one or two sentences */
  note: string;
}

// ── Hands-on stations. Data-driven, so councils and writers fill them without new code. ──

/** Put items in order. `shape` decides the drawing: a pyramid (journalism), a story arc, a timeline. */
export interface SortStation {
  kind: 'sort';
  prompt: string;
  shape: 'pyramid' | 'arc' | 'line';
  /** listed in the CORRECT order; the station shuffles them */
  items: Array<{ id: string; label: string; detail?: string }>;
  reveal: string;
}

/** Tap syllables to mark stresses; check against the scansion. */
export interface StressStation {
  kind: 'stress';
  prompt: string;
  lines: Array<{ syllables: string[]; /** indexes of stressed syllables */ stresses: number[]; meter: string; cite: string }>;
}

/** Find things in a passage by tapping words. Each target is a substring with a label. */
export interface HuntStation {
  kind: 'hunt';
  prompt: string;
  passage: string;
  cite: string;
  targets: Array<{ text: string; label: string }>;
}

/** Flip one text through versions — point of view, line breaks, active/passive, tell vs show. */
export interface RemixStation {
  kind: 'remix';
  prompt: string;
  variants: Array<{ label: string; text: string; note: string }>;
}

/** Build a sentence from tiles; each tile has a grammatical role, slots ask for roles in order. */
export interface SentenceStation {
  kind: 'sentence';
  prompt: string;
  slots: Array<{ role: string; hint: string }>;
  tiles: Array<{ text: string; role: string }>;
  /** what the finished sentence teaches */
  reveal: string;
}

/** Sentence-length bars for passages: see the music of prose. Lengths are computed live. */
export interface CadenceStation {
  kind: 'cadence';
  prompt: string;
  passages: Array<{ label: string; text: string; cite: string }>;
}

/** A check-yourself question with an explanation for every answer. */
export interface ChoiceStation {
  kind: 'choice';
  question: string;
  options: Array<{ text: string; correct?: boolean; why: string }>;
}

export type LoreaStation = SortStation | StressStation | HuntStation | RemixStation | SentenceStation | CadenceStation | ChoiceStation;

/** Ask the Story Intelligence lens to pull live examples from the library for this node. */
export type LensTag = 'dialogue' | 'alliteration' | 'long-sentence' | 'short-sentence' | 'first-person' | 'question' | 'opening-line' | 'simile' | 'exclamation';

export interface ExhibitNode {
  id: string;
  title: string;
  kind: 'wall' | 'example' | 'station' | 'timeline';
  text: DepthText;
  examples?: LibraryExample[];
  station?: LoreaStation;
  timeline?: Array<{ year: string; label: string; text: string }>;
  lens?: LensTag;
  /** below this depth the node is folded away (e.g. scansion for early readers) */
  minDepth?: DepthLevel;
}

export interface ExhibitRoom {
  id: string;
  title: string;
  /** one hand-lettered line under the room title */
  subtitle: string;
  nodes: ExhibitNode[];
}

/** A teaser planted around Lorea and the feed. Short; it should make someone want to walk in. */
export interface LoreaNugget {
  id: string;
  exhibitId: LoreaExhibitId;
  roomId?: string;
  /** the hook — under 70 characters */
  hook: string;
  /** one or two sentences that pay it off */
  body: string;
  /** optional tiny quoted passage */
  quote?: { text: string; cite: string };
  /** the reading depths this nugget suits; omitted = all */
  depths?: DepthLevel[];
}

export interface ExhibitCouncilCredit {
  source: 'authored' | 'council';
  /** Art Council: who led the look and what they decided */
  art: { lead: CouncilDirectorId; counterpoint?: CouncilDirectorId; note: string };
  /** Writers Council: the voice and the way in */
  writers: { note: string };
}

export interface LoreaExhibit {
  id: LoreaExhibitId;
  title: string;
  /** small caps line above the title, e.g. "Wing of Sound" */
  kicker: string;
  tagline: string;
  epigraph: { text: string; cite: string };
  materials: ExhibitMaterials;
  rooms: ExhibitRoom[];
  nuggets: LoreaNugget[];
  council: ExhibitCouncilCredit;
  /** Academia hooks: subject tags and the grades it is aimed at */
  academia: { subjects: string[]; bands: DepthLevel[] };
}

export function validateLoreaExhibit(e: LoreaExhibit): string[] {
  const out: string[] = [];
  const levels: DepthLevel[] = ['early', 'elementary', 'middle', 'high', 'university'];
  for (const r of e.rooms) for (const n of r.nodes) {
    for (const l of levels) if (!n.text[l]?.trim()) out.push(`${e.id}/${r.id}/${n.id}: missing ${l} text`);
    if (n.kind === 'station' && !n.station) out.push(`${e.id}/${r.id}/${n.id}: station node without station`);
    if (n.station?.kind === 'hunt') for (const t of n.station.targets) if (!n.station.passage.includes(t.text)) out.push(`${e.id}/${n.id}: hunt target "${t.text}" not in passage`);
    if (n.station?.kind === 'stress') for (const ln of n.station.lines) if (ln.stresses.some(i => i >= ln.syllables.length)) out.push(`${e.id}/${n.id}: stress index out of range`);
    if (n.station?.kind === 'sentence') for (const s of n.station.slots) if (!n.station.tiles.some(t => t.role === s.role)) out.push(`${e.id}/${n.id}: no tile for slot ${s.role}`);
    for (const ex of n.examples || []) for (const m of ex.marks || []) if (!ex.passage.includes(m)) out.push(`${e.id}/${n.id}/${ex.id}: mark "${m}" not in passage`);
  }
  for (const g of e.nuggets) if (g.hook.length > 80) out.push(`${e.id}/${g.id}: hook too long`);
  return out;
}
