// continuityLedger — the script supervisor for generated footage.
//
// On a real set the script supervisor keeps a running record: what each actor is wearing, what's in
// their hand, which side of frame they're on, where the key light is, what got wet / torn / bloodied
// three setups ago. Continuity Eye (services/continuityCheck.ts) does the pixel half of that job for
// live sets. Generated footage has the opposite problem — there is no physical set holding state
// between shots, so every generation starts from nothing unless the prompt carries the state in.
//
// This ledger is that state. It starts from the scene bible's locks, walks the shot list in order,
// applies the changes each shot's action implies (a prop picked up, a jacket taken off, a cut over the
// eye), and holds the 180° line so screen direction doesn't flip between setups. Every shot gets the
// state it INHERITS, which the prompt compiler writes into the prompt for whichever model is in use —
// that is what keeps shot 7 on Kling matching shot 6 on Veo.
//
// It is the same continuity system the Film Production hub runs, extended to generated footage — not
// a second one:
//   • The hub's script BREAKDOWN is the source of truth. When the Fabula project is linked to a
//     production, that scene's wardrobe, makeup/hair, props and set-dressing elements — with the
//     `continuityState` the Script Supervisor recorded — seed the ledger. Text inference only adds
//     what happens between shots; it never overrides the breakdown.
//   • Continuity Eye (services/continuityCheck.ts) is the check. The ledger says what a frame should
//     hold; Continuity Eye compares the frame that came back, and the verdict is logged as the same
//     `ContinuityCheck` record the hub's Continuity tab writes (see `toContinuityCheck`).
//
// Pure and deterministic. Where there is no breakdown the state is text-derived — a strong draft a
// filmmaker can correct, not ground truth; `continuityOverrides` on a shot always win.

import type { ContinuityScore } from '../../continuityCheck';
import type { ContinuityCheck, ProductionScene } from '../../filmProductionService';
import type { BreakdownElement } from '../../productionBreakdownService';

export type ScreenSide = 'frame-left' | 'frame-right' | 'center';

export interface CharacterContinuity {
  name: string;
  /** The identity lock, verbatim from the bible. Never rewritten here. */
  look: string;
  /** Wardrobe changes since the lock ("jacket off", "sleeves rolled"). */
  wardrobe: string[];
  /** Marks that persist until addressed: blood, bruising, wet hair, tears, dirt. */
  marks: string[];
  props: string[];
  posture?: string;
  side?: ScreenSide;
  facing?: 'left' | 'right';
}

export interface EnvironmentContinuity {
  lock: string;
  lighting: string;
  palette: string;
  timeOfDay?: string;
  weather?: string;
  /** Which side of camera the key comes from — the single most visible light mismatch between shots. */
  keySide?: 'camera-left' | 'camera-right';
  /** Changes to the set itself: a broken window, an overturned chair. */
  dressing: string[];
  /** Props and vehicles the breakdown says belong in this scene — the hub's "should be here" list. */
  required: string[];
}

export interface ShotContinuity {
  shotId: string;
  slug?: string;
  /** State as the shot BEGINS — what the frame must show to match what came before. */
  characters: CharacterContinuity[];
  environment: EnvironmentContinuity;
  /** What this shot changed, for the supervisor's notes and the next shot's inheritance. */
  changes: string[];
}

export interface ContinuityIssue {
  shotId: string;
  slug?: string;
  severity: 'break' | 'drift';
  message: string;
}

export interface SceneLedger {
  sceneId?: string;
  shots: ShotContinuity[];
  /** State after the last shot — the starting point for a scene that continues from this one. */
  out: { characters: CharacterContinuity[]; environment: EnvironmentContinuity };
  issues: ContinuityIssue[];
  /** Names of the Film Hub breakdown elements this ledger was seeded from. Empty = text-derived only. */
  fromBreakdown: string[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const add = (list: string[], item: string) => { const v = item.trim().toLowerCase(); if (v && !list.includes(v)) list.push(v); };
/** As `add`, but keeps the wording as written — breakdown names and the supervisor's notes are theirs. */
const addVerbatim = (list: string[], item: string) => { const v = item.trim(); if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v); };
const remove = (list: string[], item: string) => {
  const v = item.trim().toLowerCase();
  const i = list.findIndex((x) => x === v || x.includes(v) || v.includes(x));
  if (i >= 0) list.splice(i, 1);
  return i >= 0;
};

// A noun phrase after a verb: optional article/possessive, then up to three words, stopping at
// punctuation or a preposition so "picks up the revolver from the table" yields "revolver".
const NP = `(?:the|a|an|his|her|their|its|my|your)?\\s*([a-z][a-z'-]*(?:\\s+(?!from\\b|off\\b|on\\b|onto\\b|in\\b|into\\b|to\\b|at\\b|and\\b|with\\b|across\\b|over\\b)[a-z][a-z'-]*){0,2})`;

const TAKE = new RegExp(`\\b(?:picks? up|grabs?|takes? up|snatch(?:es)?|draws?|pulls? out|lifts?|pockets?|is handed|clutch(?:es|ing)?|carr(?:ies|ying)|hold(?:s|ing))\\s+${NP}`, 'gi');
const DROP = new RegExp(`\\b(?:drops?|puts? down|sets? down|throws?|tosses?|hands? over|hands?(?= (?:him|her|them)\\b)|discards?|holsters?|lets? go of|slams? down)\\s+(?:(?:him|her|them)\\s+)?${NP}`, 'gi');
const WEAR_OFF = new RegExp(`\\b(?:takes? off|removes?|sheds?|peels? off|rips? off|unbuttons?|loosens?)\\s+${NP}`, 'gi');
const WEAR_ON = new RegExp(`\\b(?:puts? on|pulls? on|dons?|buttons? up|zips? up|wraps? (?:himself|herself|themselves)? ?in)\\s+${NP}`, 'gi');

const MARKS: [RegExp, string][] = [
  [/\b(bleed(?:s|ing)?|blood(?:y|ied)?)\b/i, 'blood'],
  [/\b(bruis\w+|black eye)\b/i, 'bruising'],
  [/\b(soak\w*|drench\w*|dripping|rain-?soaked|wet)\b/i, 'wet hair and clothes'],
  [/\b(crying|cries|weep\w*|sob\w*|tears?)\b/i, 'tear-streaked face'],
  [/\b(mud\w*|dirt\w*|filth\w*|soot\w*|ash-covered)\b/i, 'dirt on skin and clothes'],
  [/\b(sweat\w*)\b/i, 'sweat-slick skin'],
  [/\b(cut|gash|slash\w*|wound\w*)\b(?! to\b)/i, 'visible wound'],
  [/\b(torn|ripped|shredded)\b/i, 'torn clothing'],
];
const POSTURE: [RegExp, string][] = [
  [/\b(sits?|seated|sitting|slumps? into)\b/i, 'seated'],
  [/\b(stands?|standing|rises?|gets? up|on (?:his|her|their) feet)\b/i, 'standing'],
  [/\b(kneels?|kneeling|on (?:his|her|their) knees)\b/i, 'kneeling'],
  [/\b(lies?|lying|collapses?|on the (?:floor|ground))\b/i, 'on the ground'],
  [/\b(crouch\w*)\b/i, 'crouched'],
];
const DRESSING: [RegExp, string][] = [
  [/\b(shatter\w*|smash\w*|breaks?) (?:the )?(window|glass|mirror|lamp|bottle|vase)\b/i, 'broken $2'],
  [/\b(overturns?|knocks? over|flips?) (?:the )?(chair|table|desk|lamp)\b/i, 'overturned $2'],
  [/\b(fire|flames?|burning)\b/i, 'fire burning in the space'],
  [/\b(door (?:swings?|slams?|kicked|bursts?) open|opens? the door)\b/i, 'door standing open'],
  [/\b(lights? (?:go|goes|cut|cuts) out|power (?:dies|cuts)|blackout)\b/i, 'practical lights out'],
];

const timeOfDayFrom = (s: string) => (s.match(/\b(DAWN|SUNRISE|MORNING|DAY|AFTERNOON|GOLDEN HOUR|MAGIC HOUR|DUSK|SUNSET|EVENING|NIGHT|MIDNIGHT)\b/i)?.[1] || '').toLowerCase() || undefined;
const weatherFrom = (s: string) => (s.match(/\b(rain\w*|storm\w*|snow\w*|fog\w*|mist\w*|overcast|blizzard|heat ?wave|wind\w*)\b/i)?.[1] || '').toLowerCase() || undefined;
const keySideFrom = (s: string): EnvironmentContinuity['keySide'] => {
  const m = s.match(/\b(?:camera|frame|screen)[- ](left|right)\b/i) || s.match(/\bfrom (?:the )?(left|right)\b/i);
  return m ? (`camera-${m[1].toLowerCase()}` as EnvironmentContinuity['keySide']) : undefined;
};

/** The sentences of a shot that describe what HAPPENS. Dialogue is excluded — a character saying
 *  "drop the gun" has not dropped a gun. A shot's `lines` is dialogue when it names a speaker. */
function actionText(shot: any): string {
  const spoken = !!(shot?.character || '').trim();
  return [shot?.subject, spoken ? '' : shot?.lines, shot?.notes, shot?.continuity, shot?.action].filter(Boolean).join('. ');
}

/** Split action text into the clauses that belong to each named character. A clause with no name in
 *  it belongs to the shot's speaker/subject, or to the only character present. */
function clausesFor(text: string, names: string[], fallback?: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const clause of text.split(/(?<=[.;!?])\s+|\s+—\s+|,\s+(?:and|then|while)\s+/)) {
    if (!clause.trim()) continue;
    const owners = names.filter((n) => new RegExp(`\\b${esc(n)}\\b`, 'i').test(clause));
    const who = owners.length ? [owners[0]] : fallback ? [fallback] : [];
    for (const n of who) out.set(n, [...(out.get(n) || []), clause]);
  }
  return out;
}

function matchAll(re: RegExp, text: string): string[] {
  re.lastIndex = 0;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m[1]) found.push(m[1].trim());
  return found;
}

/** The part of a Film Hub breakdown element the ledger reads. */
export type BreakdownItem = Pick<BreakdownElement, 'name' | 'category'> & Partial<Pick<BreakdownElement, 'continuityState' | 'notes' | 'status' | 'occurrences'>>;

/** The breakdown categories that carry continuity — the same set the hub's Continuity tab lists as
 *  "should be here". */
export const CONTINUITY_CATEGORIES: BreakdownElement['category'][] = ['PROPS', 'SET_DRESSING', 'WARDROBE', 'MAKEUP_HAIR', 'VEHICLES'];

/** The breakdown elements that apply to one production scene. Omitted elements are skipped. */
export function breakdownForScene(elements: BreakdownItem[] | undefined, productionSceneId: string | undefined): BreakdownItem[] {
  if (!productionSceneId) return [];
  return (elements || []).filter((el) => el.status !== 'OMITTED' && CONTINUITY_CATEGORIES.includes(el.category)
    && (el.occurrences || []).some((o) => o.sceneId === productionSceneId));
}

const sceneKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Find the production scene a SLATE scene corresponds to: an explicit `filmSceneId`, then the takes
 *  cut into it (assets from the hub carry `filmSceneId`), then the scene heading. */
export function matchProductionScene(scene: any, productionScenes: ProductionScene[], opts: { clips?: any[]; pool?: any[] } = {}): ProductionScene | undefined {
  const byId = (id?: string) => (id ? productionScenes.find((p) => p.id === id) : undefined);
  if (byId(scene?.filmSceneId)) return byId(scene.filmSceneId);
  const shotIds = new Set((scene?.shots || []).map((s: any) => s.id));
  const votes = new Map<string, number>();
  for (const c of opts.clips || []) {
    if (!c?.shotId || !shotIds.has(c.shotId)) continue;
    const id = (opts.pool || []).find((a) => a.id === c.assetId)?.filmSceneId;
    if (id) votes.set(id, (votes.get(id) || 0) + 1);
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && byId(top[0])) return byId(top[0]);
  const slug = sceneKey(scene?.slugline || scene?.title || '');
  if (!slug) return undefined;
  return productionScenes.find((p) => p.heading && sceneKey(p.heading) === slug)
    || productionScenes.find((p) => p.set && sceneKey(p.set).length > 2 && slug.includes(sceneKey(p.set)) && slug.includes(p.dayNight));
}

export interface LedgerOptions {
  /** State to inherit from a scene this one continues directly from. */
  carryIn?: { characters: CharacterContinuity[]; environment?: Partial<EnvironmentContinuity> };
  /** This scene's Film Hub breakdown elements (see `breakdownForScene`). Authoritative. */
  breakdown?: BreakdownItem[];
}

/** Build the ledger for one SLATE scene (bible + ordered shots). */
export function buildSceneLedger(scene: any, opts: LedgerOptions = {}): SceneLedger {
  const bible = scene?.bible || {};
  const shots: any[] = scene?.shots || [];
  const names: string[] = (bible.characters || []).map((c: any) => c?.name).filter(Boolean);
  const where = `${scene?.slugline || ''} ${scene?.environment || ''} ${bible.lighting_plan || ''}`;

  const env: EnvironmentContinuity = {
    lock: bible.environment_lock || '',
    lighting: bible.lighting_plan || '',
    palette: bible.palette || '',
    timeOfDay: timeOfDayFrom(where),
    weather: weatherFrom(where),
    keySide: keySideFrom(bible.lighting_plan || ''),
    dressing: [],
    required: [],
    ...(opts.carryIn?.environment || {}),
  };

  // The 180° line: the first two characters established hold opposite sides of frame for the scene.
  // Anyone further takes centre until a shot places them.
  const chars: CharacterContinuity[] = (bible.characters || []).filter((c: any) => c?.name).map((c: any, i: number) => {
    const carried = opts.carryIn?.characters.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    const side: ScreenSide = i === 0 ? 'frame-left' : i === 1 ? 'frame-right' : 'center';
    return {
      name: c.name, look: c.visual_lock || '',
      wardrobe: carried ? [...carried.wardrobe] : [], marks: carried ? [...carried.marks] : [], props: carried ? [...carried.props] : [],
      posture: carried?.posture,
      side, facing: side === 'frame-left' ? 'right' : side === 'frame-right' ? 'left' : undefined,
    };
  });

  // Seed from the Film Hub breakdown. An element is a character's when their name is on it (its name,
  // its continuity state, its notes, or the script line it was tagged from); otherwise it belongs to
  // the scene. The Script Supervisor's `continuityState` travels with it verbatim.
  const fromBreakdown: string[] = [];
  for (const el of opts.breakdown || []) {
    const label = `${el.name}${el.continuityState ? ` (${el.continuityState})` : ''}`;
    const about = `${el.name} ${el.continuityState || ''} ${el.notes || ''} ${(el.occurrences || []).map((o) => o.quote || '').join(' ')}`;
    const owner = chars.find((c) => new RegExp(`\\b${esc(c.name)}\\b`, 'i').test(about));
    if (el.category === 'WARDROBE') { if (owner) addVerbatim(owner.wardrobe, `wearing ${label}`); else addVerbatim(env.required, label); }
    else if (el.category === 'MAKEUP_HAIR') { if (owner) addVerbatim(owner.marks, label); else addVerbatim(env.required, label); }
    else if (el.category === 'SET_DRESSING') addVerbatim(env.dressing, label);
    else addVerbatim(env.required, label);
    fromBreakdown.push(el.name);
  }

  const issues: ContinuityIssue[] = [];
  const out: ShotContinuity[] = [];

  for (const shot of shots) {
    const text = actionText(shot);
    const speaker = names.find((n) => n.toLowerCase() === (shot?.character || '').trim().toLowerCase());
    const present = names.filter((n) => n === speaker || new RegExp(`\\b${esc(n)}\\b`, 'i').test(`${shot?.subject || ''} ${shot?.type || ''} ${text}`));
    const inFrame = present.length ? present : names.length === 1 ? names : [];

    // Snapshot BEFORE applying this shot's changes — the frame opens on inherited state.
    const snapshot: ShotContinuity = {
      shotId: shot?.id, slug: shot?.slug,
      characters: clone(chars.filter((c) => inFrame.includes(c.name))),
      environment: clone(env),
      changes: [],
    };

    const byChar = clausesFor(text, names, speaker || (inFrame.length === 1 ? inFrame[0] : undefined));
    for (const [name, clauses] of byChar) {
      const c = chars.find((x) => x.name === name);
      if (!c) continue;
      const t = clauses.join(' ');
      for (const p of matchAll(TAKE, t)) { if (!c.props.includes(p.toLowerCase())) snapshot.changes.push(`${name} takes ${p}`); add(c.props, p); }
      for (const p of matchAll(DROP, t)) {
        if (remove(c.props, p)) snapshot.changes.push(`${name} releases ${p}`);
        else issues.push({ shotId: shot?.id, slug: shot?.slug, severity: 'drift', message: `${name} lets go of "${p}" but was never shown holding it — establish it in an earlier shot or the cut will jump.` });
      }
      for (const w of matchAll(WEAR_OFF, t)) { add(c.wardrobe, `${w} off`); snapshot.changes.push(`${name}: ${w} off`); }
      for (const w of matchAll(WEAR_ON, t)) { if (!remove(c.wardrobe, `${w} off`)) add(c.wardrobe, `wearing ${w}`); snapshot.changes.push(`${name}: ${w} on`); }
      for (const [re, mark] of MARKS) if (re.test(t) && !c.marks.includes(mark)) { c.marks.push(mark); snapshot.changes.push(`${name}: ${mark}`); }
      for (const [re, posture] of POSTURE) if (re.test(t) && c.posture !== posture) { c.posture = posture; snapshot.changes.push(`${name} ${posture}`); break; }
    }
    for (const [re, label] of DRESSING) {
      const m = text.match(re);
      if (m) { const d = label.replace('$2', (m[2] || '').toLowerCase()); if (!env.dressing.includes(d)) { env.dressing.push(d); snapshot.changes.push(`set: ${d}`); } }
    }

    // A shot may pin state explicitly; that always beats inference.
    const o = shot?.continuityOverrides;
    if (o?.keySide) env.keySide = o.keySide;
    for (const [name, patch] of Object.entries<any>(o?.characters || {})) {
      const c = chars.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (c) Object.assign(c, patch);
    }

    out.push(snapshot);
  }

  return { sceneId: scene?.id, shots: out, out: { characters: clone(chars), environment: clone(env) }, issues, fromBreakdown };
}

/** Does this scene pick up directly from the previous one? Then its ledger should inherit state. */
export function continuesFrom(scene: any): boolean {
  return /\b(CONTINUOUS|MOMENTS LATER|SAME TIME|CONT'?D)\b/i.test(scene?.slugline || '');
}

/** Ledgers for a run of scenes in story order, carrying state across the ones that are continuous. */
export function buildProductionLedger(scenes: any[], breakdownFor: (scene: any) => BreakdownItem[] | undefined = () => undefined): SceneLedger[] {
  const ledgers: SceneLedger[] = [];
  let prev: SceneLedger | null = null;
  for (const sc of scenes) {
    const l: SceneLedger = buildSceneLedger(sc, { breakdown: breakdownFor(sc), ...(prev && continuesFrom(sc) ? { carryIn: { characters: prev.out.characters } } : {}) });
    ledgers.push(l); prev = l;
  }
  return ledgers;
}

// ── phrasing state for a prompt ─────────────────────────────────────────────────

/** Everything about a character that has CHANGED since their identity lock, in one clause. Empty when
 *  nothing has — the lock alone is then the whole truth. */
export function characterStateClause(c: CharacterContinuity, opts: { withSide?: boolean } = {}): string {
  const bits: string[] = [];
  if (opts.withSide && c.side && c.side !== 'center') bits.push(`${c.side}${c.facing ? `, facing ${c.facing}` : ''}`);
  if (c.posture) bits.push(c.posture);
  if (c.props.length) bits.push(`holding ${c.props.join(' and ')}`);
  if (c.wardrobe.length) bits.push(c.wardrobe.join(', '));
  if (c.marks.length) bits.push(c.marks.join(', '));
  return bits.length ? `${c.name} — ${bits.join('; ')}` : '';
}

/** The environment state that has to match between shots. */
export function environmentStateClause(e: EnvironmentContinuity): string {
  const bits: string[] = [];
  if (e.timeOfDay) bits.push(e.timeOfDay);
  if (e.weather) bits.push(e.weather);
  if (e.keySide) bits.push(`key light from ${e.keySide}`);
  if (e.dressing.length) bits.push(e.dressing.join(', '));
  if (e.required?.length) bits.push(`in the scene: ${e.required.join(', ')}`);
  return bits.join('; ');
}

/** What a model tends to drift on, as a negative prompt — built from what this shot is holding. */
export function continuityNegatives(s: ShotContinuity): string[] {
  const neg = ['different face', 'changed hairstyle', 'wardrobe change'];
  if (s.characters.length >= 2) neg.push('characters swapping sides of frame');
  if (s.environment.keySide) neg.push('light direction flipped');
  if (s.characters.some((c) => c.marks.length)) neg.push('clean unmarked skin and clothes');
  return neg;
}

// ── logging a check ─────────────────────────────────────────────────────────────

/** A Continuity Eye verdict as the Film Hub's `ContinuityCheck` record — the one shape for a check,
 *  whether it compared two frames on set or a generated shot against its reference. Thumbnails are
 *  not stored, same as the hub. */
export function toContinuityCheck(
  result: ContinuityScore,
  meta: { id: string; sceneId: string; sceneNum?: string; label?: string; note?: string; byMemberId?: string; byName?: string; createdAt?: number },
): ContinuityCheck {
  const row: ContinuityCheck = {
    id: meta.id, sceneId: meta.sceneId, sceneNum: meta.sceneNum || '',
    label: meta.label,
    score: result.score, propsScore: result.propsScore, lightingScore: result.lightingScore,
    lumaDelta: result.lumaDelta, colorTempNote: result.colorTempNote, flagCount: result.flags.length,
    note: meta.note, byMemberId: meta.byMemberId, byName: meta.byName,
    createdAt: meta.createdAt ?? Date.now(),
  };
  // Firestore rejects undefined fields — the hub strips them before every write, so do the same here.
  return JSON.parse(JSON.stringify(row));
}

// ── what Continuity Eye can check for a generated scene ─────────────────────────

export interface FrameRef { assetId: string; type: 'image' | 'video'; /** Seconds into the asset, for video. */ atSec: number; name?: string }

export interface ContinuityCheckPlan {
  shotId: string;
  slug?: string;
  /** take: this take against the one it replaced. first-frame: a generated clip against the still it
   *  was started from. neighbour: this shot against the one before it in the scene. */
  kind: 'take' | 'first-frame' | 'neighbour';
  scope: 'same-setup' | 'cross-setup';
  ref: FrameRef;
  cur: FrameRef;
  label: string;
}

/** The comparisons available for a scene, from what is actually in the cut and the bins. Same-setup
 *  checks come first — they are the ones where a changed region means something. Storyboard frames
 *  (assets marked `board`) are drawings and are never used as a reference. */
export function planContinuityChecks(scene: any, clips: any[], pool: any[]): ContinuityCheckPlan[] {
  const asset = (id?: string) => (pool || []).find((a) => a.id === id && (a.type === 'image' || a.type === 'video') && !a.board);
  const picture = (clips || []).filter((c) => c?.assetId && c.kind !== 'script' && !String(c.trackId || '').startsWith('a'));
  const frame = (c: any, edge: 'in' | 'out' | 'mid'): FrameRef | undefined => {
    const a = asset(c?.assetId);
    if (!a) return undefined;
    const srcIn = Number(c.srcIn) || 0, dur = Number(c.duration) || 0;
    const atSec = a.type === 'image' ? 0 : edge === 'in' ? srcIn + 0.1 : edge === 'out' ? Math.max(srcIn, srcIn + dur - 0.1) : srcIn + dur / 2;
    return { assetId: a.id, type: a.type, atSec: Math.round(atSec * 100) / 100, name: a.name };
  };

  const plans: ContinuityCheckPlan[] = [];
  let prev: { shot: any; clip: any } | null = null;
  for (const shot of scene?.shots || []) {
    const mine = picture.filter((c) => c.shotId === shot.id);
    const live = mine.find((c) => !c.disabled);
    if (!live) continue;
    const slug = shot.slug || 'shot';

    const muted = mine.find((c) => c.disabled && c.assetId !== live.assetId);
    const ref = muted && frame(muted, 'mid'), cur = frame(live, 'mid');
    if (ref && cur) plans.push({ shotId: shot.id, slug, kind: 'take', scope: 'same-setup', ref, cur, label: `${slug} · new take vs previous take` });

    const liveAsset = asset(live.assetId);
    const still = liveAsset?.type === 'video' ? (pool || []).find((a) => a.shotId === shot.id && a.type === 'image' && !a.board) : undefined;
    const first = frame(live, 'in');
    if (still && first) plans.push({ shotId: shot.id, slug, kind: 'first-frame', scope: 'same-setup', ref: { assetId: still.id, type: 'image', atSec: 0, name: still.name }, cur: first, label: `${slug} · clip vs its start frame` });

    const before = prev && frame(prev.clip, 'out');
    if (prev && before && first) plans.push({ shotId: shot.id, slug, kind: 'neighbour', scope: 'cross-setup', ref: before, cur: first, label: `${prev.shot.slug || 'previous'} → ${slug} · light across the cut` });

    prev = { shot, clip: live };
  }
  return plans;
}
