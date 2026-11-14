// Story Intelligence → Worlds. Pure (no I/O): shared by the Tela workspace (Inbox + Desk), the API
// that files findings into a World (routes/reelloIntel.ts) and the tests.
//
// A "finding" is one thing Story Intelligence read in a video that could live in a World:
//   person → Character · place/thing/group/idea → Lore · stated year or chapter → Timeline event
//   the video and its posted Shorts → World assets · products stay with the store (shown, never filed).
//
// Every entry it makes carries sourceApp 'STORY_INTEL' + sourceRefId `${videoId}:${key}` (the same
// World Hub tagging Lorea and Fabula use), so filing again updates that entry instead of adding a copy,
// and a person or place that already exists in the World by name is added to, not duplicated.

import type { IntelPerson, ReelloIntelJob, WorldFiling } from '../reello/intel/types';

export type FindingKind = 'character' | 'lore' | 'timeline' | 'asset' | 'relation' | 'product';
export type EntryCollection = 'characters' | 'lore' | 'timeline' | 'asset' | 'graph';

export interface FindingMoment { tSec: number; text?: string }

export interface Finding {
  key: string;
  kind: FindingKind;
  title: string;
  summary: string;
  /** Plain-language reason it was proposed, shown in the Inbox. */
  why: string;
  moments: FindingMoment[];
  stillUrl?: string;
  confidence: 'high' | 'medium';
  /** character: role · lore: LoreEntry type · timeline: year · asset: videoId */
  role?: string;
  loreType?: LoreType;
  year?: number;
  assetId?: string;
  /** Where the asset doc lives (default videos). */
  assetCollection?: 'videos' | 'albums';
  mentionedOnly?: boolean;
  /** relation only: the two findings it connects (each is added too if it isn't yet). */
  ends?: [string, string];
  relationshipType?: string;
  /** product only: where it stands in the store. */
  storeState?: string;
}

export type LoreType = 'LOCATION' | 'ENVIRONMENT' | 'ITEM' | 'PLOT_POINT' | 'BACKSTORY' | 'EVENT' | 'FACTION' | 'CREATURE';

export const STORY_INTEL_APP = 'STORY_INTEL' as const;
export const FINDING_KEY_RE = /^(person|lore|date|chapter|asset|rel|product):[\w.~-]{1,120}$/;

const LORE_TYPE: Record<string, LoreType> = { place: 'LOCATION', thing: 'ITEM', group: 'FACTION', idea: 'BACKSTORY' };
const LORE_WORD: Record<string, string> = { place: 'Place', thing: 'Thing', group: 'Group', idea: 'Idea' };
export const RELATION_WORD: Record<string, string> = {
  FAMILY: 'Family', FRIEND: 'Friends', MENTOR: 'Mentor', COLLEAGUE: 'Work together', RIVAL: 'Rivals', PARTNER: 'Partners',
  OWNS: 'Owns', FOUNDED: 'Founded', LIVES_IN: 'Lives in', WORKS_AT: 'Works at', MEMBER_OF: 'Member of', APPEARS_WITH: 'Appear together',
};
const ROLE_WORD: Record<string, string> = { host: 'Host', guest: 'Guest', interviewee: 'Interviewee', performer: 'Performer', mentioned: 'Mentioned', other: 'Appears' };

export const nameKey = (s: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

/** Everything a finished job offers a World, in reading order: people, lore, timeline, assets, products. */
export function findingsFromJob(job: Pick<ReelloIntelJob, 'videoId' | 'videoTitle' | 'report' | 'drafts' | 'createdAt'>): Finding[] {
  const r = job.report;
  if (!r) return [];
  const out: Finding[] = [];
  const quotes = r.quotes || [];
  const year = new Date(job.createdAt || Date.now()).getFullYear();

  // People. Newer reports list them; older ones only have quote speakers.
  const people: IntelPerson[] = r.people?.length ? r.people : speakersFromQuotes(quotes);
  for (const p of people) {
    const said = quotes.filter(q => q.speaker && nameKey(q.speaker) === nameKey(p.name));
    const moments: FindingMoment[] = [
      ...said.map(q => ({ tSec: q.startSec, text: `"${q.text}"` })),
      ...p.moments.filter(t => !said.some(q => Math.abs(q.startSec - t) < 3)).slice(0, 6).map(t => ({ tSec: t })),
    ].sort((a, b) => a.tSec - b.tSec);
    const role = ROLE_WORD[p.role] || 'Appears';
    out.push({
      key: `person:${p.id}`, kind: 'character', title: p.name,
      summary: p.description || (p.onScreen ? `${role} in "${job.videoTitle}"` : `Mentioned in "${job.videoTitle}"`),
      why: [
        p.onScreen ? `${role}.` : 'Talked about, never on screen.',
        said.length ? `${said.length} quote${said.length === 1 ? '' : 's'}.` : '',
        p.moments.length > 1 ? `Comes up ${p.moments.length} times.` : '',
      ].filter(Boolean).join(' '),
      moments, stillUrl: p.stillUrl || said[0]?.stillUrl,
      confidence: p.onScreen && (said.length || p.moments.length > 1) ? 'high' : 'medium',
      role, mentionedOnly: !p.onScreen,
    });
  }

  // Lore. Newer reports list places, things, groups and ideas; older ones fall back to topics.
  if (r.lore?.length) {
    for (const l of r.lore) out.push({
      key: `lore:${l.id}`, kind: 'lore', title: l.title,
      summary: l.description || `${LORE_WORD[l.kind]} from "${job.videoTitle}"`,
      why: `${LORE_WORD[l.kind]} the video names${l.description ? '' : ', with no description yet'}.`,
      moments: l.tSec != null ? [{ tSec: l.tSec }] : [], stillUrl: l.stillUrl,
      confidence: l.description ? 'high' : 'medium', loreType: LORE_TYPE[l.kind] || 'BACKSTORY',
    });
  } else {
    for (const t of r.topics || []) out.push({
      key: `lore:t-${slug(t)}`, kind: 'lore', title: t, summary: `Topic of "${job.videoTitle}"`,
      why: 'A topic from the summary. Older reading, so no description.', moments: [], confidence: 'medium', loreType: 'BACKSTORY',
    });
  }

  // Timeline: years the video states, then its chapters (placed in the year it was posted).
  for (const d of r.dates || []) out.push({
    key: `date:${d.id}`, kind: 'timeline', title: d.what, summary: `${d.year}`,
    why: `The video says this happened in ${d.year}.`, moments: d.tSec != null ? [{ tSec: d.tSec }] : [],
    confidence: 'high', year: d.year,
  });
  const chs = r.chapters || [];
  chs.forEach((c, i) => {
    const end = chs[i + 1]?.tSec;
    out.push({
      key: `chapter:${Math.round(c.tSec)}`, kind: 'timeline', title: c.title,
      summary: end != null ? `${clock(c.tSec)} to ${clock(end)}` : `From ${clock(c.tSec)}`,
      why: `Chapter ${i + 1} of the video.`, moments: [{ tSec: c.tSec }],
      stillUrl: r.stills?.find(s => Math.abs(s.tSec - c.tSec) < 6)?.url, confidence: 'medium', year,
    });
  });

  // Relationships: what the video states, else who shares a chapter (weaker, so medium confidence).
  const keyByName = new Map(out.filter(f => f.kind === 'character' || f.kind === 'lore').map(f => [nameKey(f.title), f]));
  const rels = r.relations || [];
  for (const rel of rels) {
    const a = keyByName.get(nameKey(rel.a)); const b = keyByName.get(nameKey(rel.b));
    if (!a || !b) continue;
    out.push({
      key: `rel:${rel.id}`, kind: 'relation', title: `${a.title} and ${b.title}`, summary: RELATION_WORD[rel.type] || 'Connected',
      why: rel.evidence ? `The video says: ${rel.evidence}` : 'The video connects them.', moments: rel.tSec != null ? [{ tSec: rel.tSec }] : [],
      confidence: 'high', ends: [a.key, b.key], relationshipType: rel.type,
    });
  }
  if (!rels.length) {
    const ppl = out.filter(f => f.kind === 'character' && !f.mentionedOnly && f.moments.length);
    const bounds = chs.map((c, i) => [c.tSec, chs[i + 1]?.tSec ?? Number.MAX_SAFE_INTEGER] as const);
    const inChapters = (f: Finding) => new Set(f.moments.map(m => bounds.findIndex(([s0, e0]) => m.tSec >= s0 && m.tSec < e0)).filter(i => i >= 0));
    for (let i = 0; i < ppl.length; i++) for (let j = i + 1; j < ppl.length; j++) {
      const A = inChapters(ppl[i]), B = inChapters(ppl[j]);
      const shared = [...A].filter(x => B.has(x));
      if (!shared.length) continue;
      out.push({
        key: `rel:with~${ppl[i].key.slice(7, 50)}~${ppl[j].key.slice(7, 50)}`, kind: 'relation', title: `${ppl[i].title} and ${ppl[j].title}`,
        summary: 'Appear together', why: `Both appear in ${shared.length === 1 ? `"${chs[shared[0]].title}"` : `${shared.length} chapters`}.`,
        moments: [{ tSec: chs[shared[0]].tSec }], confidence: 'medium', ends: [ppl[i].key, ppl[j].key], relationshipType: 'APPEARS_WITH',
      });
    }
  }

  // Assets: the video itself and every Short already posted from it.
  out.push({
    key: 'asset:video', kind: 'asset', title: job.videoTitle || 'This video', summary: 'The full video',
    why: 'Add the video to the World so it shows with the World\'s content.', moments: [], confidence: 'high', assetId: job.videoId,
    stillUrl: r.stills?.[0]?.url,
  });
  for (const q of quotes) {
    const d = job.drafts?.[`clip:${q.id}`];
    if (d?.status !== 'POSTED' || !d.postedId) continue;
    out.push({
      key: `asset:short-${q.id}`, kind: 'asset', title: `Short: "${q.text.slice(0, 60)}${q.text.length > 60 ? '…' : ''}"`,
      summary: `${Math.round(q.endSec - q.startSec)}s, posted`, why: 'A Short already posted from this video.',
      moments: [{ tSec: q.startSec, text: `"${q.text}"` }], stillUrl: q.stillUrl, confidence: 'high', assetId: d.postedId,
    });
  }

  // Products stay in the store; listed so nothing it read is hidden.
  for (const o of r.offers || []) {
    const d = job.drafts?.[`product:${o.id}`];
    out.push({
      key: `product:${o.id}`, kind: 'product', title: o.name,
      summary: o.packages?.[o.packages.length - 1]?.label || (o.price != null ? `$${o.price}` : 'No price given'),
      why: 'Something the video sells. Products go to your store, not a World.',
      moments: [{ tSec: o.tSec }], stillUrl: o.stillUrl, confidence: o.confidence >= 0.7 ? 'high' : 'medium',
      storeState: d?.status === 'POSTED' ? 'Listed in your store' : d?.status === 'DISCARDED' ? 'Discarded' : 'Draft listing',
    });
  }
  return out;
}

function speakersFromQuotes(quotes: NonNullable<ReelloIntelJob['report']>['quotes']): IntelPerson[] {
  const seen = new Map<string, IntelPerson>();
  for (const q of quotes) {
    const n = (q.speaker || '').trim();
    if (!n || n.length < 2 || /^(speaker|host|narrator|unknown|man|woman)\b/i.test(n)) continue;
    const k = nameKey(n);
    const cur = seen.get(k) || { id: `p-${slug(n)}`, name: n, role: 'other', onScreen: true, moments: [] };
    cur.moments.push(Math.round(q.startSec));
    seen.set(k, cur);
  }
  return [...seen.values()];
}

// ── Filing ────────────────────────────────────────────────────────────────────

export interface FindingEdits { title?: string; summary?: string; year?: number }

export const collectionFor = (kind: FindingKind): EntryCollection | null =>
  kind === 'character' ? 'characters' : kind === 'lore' ? 'lore' : kind === 'timeline' ? 'timeline' : kind === 'asset' ? 'asset' : kind === 'relation' ? 'graph' : null;

export const sourceRefFor = (videoId: string, key: string) => `${videoId}:${key}`;

export interface WorldEntryLite {
  id: string;
  name?: string; title?: string;
  sourceApp?: string; sourceRefId?: string;
  /** Names Story Intelligence knew this entry by, so a rename in Worlds still matches the next video. */
  storyIntelNames?: string[];
  discarded?: boolean;
}

/** Which existing World entry this finding lands in: the one an earlier filing made, else (people and
 *  lore only) a live entry with the same name from anywhere — Lorea, Fabula, another video. */
export function matchEntry(f: Finding, videoId: string, entries: WorldEntryLite[]): { id: string; by: 'source' | 'name'; name: string } | null {
  const ref = sourceRefFor(videoId, f.key);
  const bySource = entries.find(e => e.sourceApp === STORY_INTEL_APP && e.sourceRefId === ref);
  if (bySource) return { id: bySource.id, by: 'source', name: bySource.name || bySource.title || '' };
  if (f.kind !== 'character' && f.kind !== 'lore') return null;
  const k = nameKey(f.title);
  const byName = entries.find(e => !e.discarded && (nameKey(e.name || e.title || '') === k || (e.storyIntelNames || []).some(n => nameKey(n) === k)));
  return byName ? { id: byName.id, by: 'name', name: byName.name || byName.title || '' } : null;
}

const clampText = (s: string, n: number) => (s || '').trim().slice(0, n);

/** Fields for a NEW entry (Firestore rules: name < 200, bio < 10000, title < 500, description < 5000). */
export function newEntryFields(f: Finding, videoId: string, edits: FindingEdits = {}): Record<string, unknown> {
  const title = clampText(edits.title || f.title, 190) || 'Untitled';
  const summary = clampText(edits.summary ?? f.summary, 4800);
  const src = { sourceApp: STORY_INTEL_APP, sourceProjectId: videoId, sourceRefId: sourceRefFor(videoId, f.key), isPublished: false, storyIntelNames: [f.title] };
  const gallery = f.stillUrl ? [f.stillUrl] : [];
  if (f.kind === 'character') return {
    ...src, name: title, bio: summary, role: f.role || 'Appears', imageUrl: f.stillUrl || '',
    tags: ['story-intelligence', ...(f.mentionedOnly ? ['mentioned-only'] : [])],
    appearanceAt: f.moments.slice(0, 20).map(m => ({ projectId: videoId, timestamp: m.tSec })), gallery,
  };
  if (f.kind === 'lore') return {
    ...src, title, content: summary, type: f.loreType || 'BACKSTORY', tags: ['story-intelligence'], conflictsDetected: [], gallery,
  };
  return {
    ...src, title, description: summary, year: Number.isInteger(edits.year) ? edits.year : (f.year ?? new Date().getFullYear()),
    timelineId: 'main', linkedCharacterIds: [], linkedLoreIds: [], linkedAssetIds: [videoId], gallery,
  };
}

/** Fields to merge into an entry that already exists. Story Intelligence's own text never overwrites
 *  what's there: it only fills blanks and adds this video's appearances and stills. Edits the creator
 *  typed (only changed fields are sent) are their own words, so those always apply. */
export function mergeEntryFields(f: Finding, videoId: string, existing: Record<string, any>, by: 'source' | 'name', edits: FindingEdits = {}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const gallery = [...new Set([...(Array.isArray(existing.gallery) ? existing.gallery : []), ...(f.stillUrl ? [f.stillUrl] : [])])].slice(0, 40);
  if (gallery.length !== (existing.gallery?.length || 0)) patch.gallery = gallery;
  const names = Array.isArray(existing.storyIntelNames) ? existing.storyIntelNames : [];
  if ((f.kind === 'character' || f.kind === 'lore') && !names.some((n: string) => nameKey(n) === nameKey(f.title))) patch.storyIntelNames = [...names, f.title].slice(-20);
  void by;
  if (f.kind === 'character') {
    const keep = (Array.isArray(existing.appearanceAt) ? existing.appearanceAt : []).filter((a: any) => a?.projectId !== videoId);
    patch.appearanceAt = [...keep, ...f.moments.slice(0, 20).map(m => ({ projectId: videoId, timestamp: m.tSec }))].slice(0, 200);
    if (edits.title) patch.name = clampText(edits.title, 190);
    if (edits.summary != null || !existing.bio) patch.bio = clampText(edits.summary ?? f.summary, 9000);
    if (!existing.imageUrl && f.stillUrl) patch.imageUrl = f.stillUrl;
  } else if (f.kind === 'lore') {
    if (edits.title) patch.title = clampText(edits.title, 190);
    if (edits.summary != null || !existing.content) patch.content = clampText(edits.summary ?? f.summary, 4800);
  } else if (f.kind === 'timeline') {
    if (edits.title) patch.title = clampText(edits.title, 190);
    if (edits.summary != null) patch.description = clampText(edits.summary, 4800);
    if (Number.isInteger(edits.year)) patch.year = edits.year;
  }
  return patch;
}

// ── Inbox state ───────────────────────────────────────────────────────────────

export type FindingState = 'NEW' | 'FILED' | 'SKIPPED' | 'STORE';

export function stateOf(f: Finding, filing?: Record<string, WorldFiling>): FindingState {
  if (f.kind === 'product') return 'STORE';
  const s = filing?.[f.key]?.status;
  return s === 'FILED' ? 'FILED' : s === 'SKIPPED' ? 'SKIPPED' : 'NEW';
}

/** What the Inbox still asks about for one job. */
export const waitingCount = (job: Pick<ReelloIntelJob, 'videoId' | 'videoTitle' | 'report' | 'drafts' | 'createdAt' | 'worldFiling'>) =>
  findingsFromJob(job).filter(f => stateOf(f, job.worldFiling) === 'NEW').length;

// ── Auto-file rules ───────────────────────────────────────────────────────────
// Per kind: 'ask' = always wait in the Inbox · 'known' = add on its own only when it joins something
// already in the World (the same person in a new episode) · 'all' = add high-confidence ones on their own.

export type RuleMode = 'ask' | 'known' | 'all';
export type RuleKind = Exclude<FindingKind, 'product'>;
export const RULE_KINDS: RuleKind[] = ['character', 'lore', 'timeline', 'asset', 'relation'];

export interface StoryIntelRules {
  enabled: boolean;
  /** The World things are added to on their own. */
  worldId: string;
  modes: Record<RuleKind, RuleMode>;
  updatedAt?: number;
}

export const DEFAULT_RULES: StoryIntelRules = {
  enabled: false, worldId: '',
  // Media stays 'ask': a film or album rarely belongs in every World, so it's the creator's call.
  modes: { character: 'known', lore: 'ask', timeline: 'ask', asset: 'ask', relation: 'known' },
};

export function sanitizeRules(raw: any): StoryIntelRules {
  const modes = { ...DEFAULT_RULES.modes };
  for (const k of RULE_KINDS) {
    const m = raw?.modes?.[k];
    if (m === 'ask' || m === 'known' || m === 'all') modes[k] = m;
  }
  const worldId = typeof raw?.worldId === 'string' && /^[\w-]{1,128}$/.test(raw.worldId) ? raw.worldId : '';
  return { enabled: raw?.enabled === true && !!worldId, worldId, modes };
}

/** Which waiting findings the rules add without asking. `known` = keys that already have a World match. */
export function autoFileKeys(findings: Finding[], filing: Record<string, WorldFiling> | undefined, known: Set<string>, rules: StoryIntelRules): string[] {
  if (!rules.enabled || !rules.worldId) return [];
  return findings.filter(f => {
    if (f.kind === 'product' || stateOf(f, filing) !== 'NEW') return false;
    const mode = rules.modes[f.kind as RuleKind] || 'ask';
    if (mode === 'all') return f.confidence === 'high' || known.has(f.key);
    if (mode === 'known') return known.has(f.key);
    return false;
  }).map(f => f.key);
}
