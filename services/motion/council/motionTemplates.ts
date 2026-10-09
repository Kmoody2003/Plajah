// motionTemplates — the Motion Council in the TEMPLATE process.
//
// 1. Recipe templates: a council build option, saved without its media, is a reusable MOTION RECIPE — who leads, who
//    counters, the grammar choices (pace, move, look, effects, transition, title) and the title text — that can be
//    rebuilt on any new assets. The council ships a built-in recipe for every roster member and director (61), and
//    users save their own (localStorage; same shape, origin 'user').
// 2. Platform template direction: every platform lower third / full page (LOWER_THIRDS) and broadcast identity pack
//    (FABULA_BROADCAST_PACKS) gets motion direction from the council — a lead cast from the template's own name, era,
//    tags and premise, a counterpoint (the lead's standing rival), an editor (the lead's council seat), the timing it
//    should move with, and notes. scripts/council/runMotionTemplateCouncil.ts writes it to docs/motion/ for designers.
//    Art Council attribution (councilStyle) is untouched — this is the motion layer beside it.
import { assembleOption, rivalOf, type BuildBrief, type BuildOption, type OptionOverrides } from './motionBuild';
import { grammarFor } from './motionBuildGrammar';
import { MOTION_ROSTER, castCrew, castingScore, rosterMember, guildLabel, eraLabel, type RosterGuild } from './motionRoster';
import { MOTION_PERSONAS } from './motionCouncilPersonas';
import type { MotionPersonaId } from './motionCouncilTypes';

export interface RecipeTemplate {
  id: string;
  name: string;
  origin: 'council' | 'user';
  leadId: string;
  counterId?: string;
  editorId: MotionPersonaId;
  council: { lead: string; counterpoint?: string; editor: string; rationale: string };
  overrides: OptionOverrides;
  guild?: RosterGuild | 'COUNCIL';
  era?: string;
  tags: string[];
  bpm?: number;
  bars?: number;          // length the template was built at, in bars
  createdAt?: number;
}

const nameOf = (id?: string) => (id ? rosterMember(id)?.name || MOTION_PERSONAS[id as MotionPersonaId]?.name || id : '');
const seatOf = (id: string): MotionPersonaId => (rosterMember(id)?.seat || (MOTION_PERSONAS[id as MotionPersonaId] ? id : 'KINETIC')) as MotionPersonaId;

// ─────────────────────────────── built-in council recipes ───────────────────────────────

let builtins: RecipeTemplate[] | null = null;
/** One recipe per roster member and per council director — the council's starter library. */
export function councilRecipeTemplates(): RecipeTemplate[] {
  if (builtins) return builtins;
  const crewIds = MOTION_ROSTER.map(m => m.id);
  const fromRoster = MOTION_ROSTER.map<RecipeTemplate>(m => {
    const counterId = rivalOf(m.id, crewIds);
    return {
      id: `council:${m.id}`, name: `${m.name.replace(/^The /, '')} recipe`, origin: 'council', leadId: m.id, counterId, editorId: m.seat,
      council: { lead: m.name, counterpoint: counterId ? nameOf(counterId) : undefined, editor: MOTION_PERSONAS[m.seat].name, rationale: m.ethos },
      overrides: {}, guild: m.guild, era: eraLabel(m), tags: [...m.styles, guildLabel(m.guild).toLowerCase()],
    };
  });
  const fromDirectors = (Object.keys(MOTION_PERSONAS) as MotionPersonaId[]).map<RecipeTemplate>(id => ({
    id: `council:${id}`, name: `${MOTION_PERSONAS[id].name.replace(/^The /, '')} recipe`, origin: 'council', leadId: id, editorId: id,
    council: { lead: MOTION_PERSONAS[id].name, editor: MOTION_PERSONAS[id].name, rationale: MOTION_PERSONAS[id].conviction },
    overrides: {}, guild: 'COUNCIL', tags: [MOTION_PERSONAS[id].craft.toLowerCase(), 'council'],
  }));
  builtins = [...fromRoster, ...fromDirectors];
  return builtins;
}

// ─────────────────────────────── user recipes ───────────────────────────────

const KEY = 'plajah_motion_recipe_templates_v1';
function load(): RecipeTemplate[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list: RecipeTemplate[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch { /* quota / private mode */ } }

/** Capture a built option as a reusable recipe (no media — slots are rebound when it is rebuilt). */
export function templateFromOption(opt: BuildOption, name: string, brief?: Pick<BuildBrief, 'ask'>): RecipeTemplate {
  const g = opt.grammar;
  const title = opt.recipe.clips.find(c => c.role === 'title')?.title?.text;
  const lead = rosterMember(opt.leadId);
  return {
    id: `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || opt.title, origin: 'user', leadId: opt.leadId, counterId: opt.counterId, editorId: opt.editorId,
    council: { lead: nameOf(opt.leadId), counterpoint: opt.counterId ? nameOf(opt.counterId) : undefined, editor: nameOf(opt.editorId), rationale: opt.rationale },
    overrides: { pace: g.pace, move: g.move, look: g.look ?? null, effects: g.effects, trans: g.trans, title: g.title, ...(title && title !== 'YOUR TITLE' ? { titleText: title } : {}) },
    guild: lead?.guild ?? 'COUNCIL', era: lead ? eraLabel(lead) : undefined,
    tags: [...(lead?.styles.slice(0, 6) || []), ...(brief?.ask ? brief.ask.toLowerCase().split(/\W+/).filter(w => w.length > 3).slice(0, 6) : [])],
    bpm: opt.recipe.bpm, bars: Math.round(opt.recipe.duration / ((60 / opt.recipe.bpm) * 4)), createdAt: Date.now(),
  };
}

export function saveRecipeTemplate(t: RecipeTemplate): void { save([t, ...load().filter(x => x.id !== t.id)]); }
export function listSavedRecipeTemplates(): RecipeTemplate[] { return load(); }
export function deleteRecipeTemplate(id: string): void { save(load().filter(x => x.id !== id)); }

/** Rebuild a recipe on new assets. The brief's tempo/length win; otherwise the template's own. */
export function buildFromTemplate(t: RecipeTemplate, brief: BuildBrief): BuildOption {
  const bpm = brief.tempo || t.bpm || 120;
  const targetSec = brief.targetSec ?? (t.bars ? t.bars * 4 * (60 / bpm) : undefined);
  const opt = assembleOption({ ...brief, tempo: bpm, targetSec }, t.leadId, t.counterId, { ...t.overrides, label: t.name }, 0);
  return { ...opt, id: `tpl-${t.id}` };
}

/** Search built-in + saved recipes by name, lead, tags, guild and era. */
export function searchRecipeTemplates(q: string): RecipeTemplate[] {
  const all = [...load(), ...councilRecipeTemplates()];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return all;
  return all
    .map(t => {
      const hay = [t.name, t.council.lead, t.council.counterpoint, t.guild, t.era, ...t.tags].join(' ').toLowerCase();
      return { t, s: terms.filter(w => hay.includes(w)).length };
    })
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.t);
}

// ─────────────────────────────── platform template direction ───────────────────────────────

export interface TemplateDirection {
  templateId: string;
  templateName: string;
  family: 'lower-third' | 'full-page' | 'broadcast-pack';
  lead: string;
  counterpoint?: string;
  editor: MotionPersonaId;
  timing: { fps: number; on: 1 | 2 | 3 | 'mixed'; ease: string; enterSec: number; holdSec: number };
  notes: string[];
}

/** Minimal shapes so this stays independent of the Fabula registries (they are passed in). */
export interface LowerThirdLike { id: string; name: string; group?: string; family?: string; tagline?: string; tags?: string[]; format?: string; duration?: number; }
export interface BroadcastPackLike { id: string; name: string; family?: string; region?: string; period?: string; premise?: string; motionGrammar?: string; tags?: string[]; collaborationRequired?: boolean; }

function direct(templateId: string, templateName: string, family: TemplateDirection['family'], text: string, duration = 5, collab = false, saturated: Set<string> = new Set(), core = ''): TemplateDirection {
  // precision first: the template's own name + era/family decide when they match anyone; the long description
  // (premise, tags) only breaks the tie or fills in when the name says nothing about a style
  if (core) {
    const byCore = castCrew({ ask: core, size: 1 })[0];
    if (byCore && castingScore(byCore, { ask: core }) > 0 && !saturated.has(byCore.id)) text = `${core} ${core} ${text}`;
  }
  let crew = castCrew({ ask: text, size: 6 }).filter(m => grammarFor(m.id));
  if (core) {
    const coreBest = castCrew({ ask: core, size: 6 }).find(m => castingScore(m, { ask: core }) > 0 && !saturated.has(m.id));
    if (coreBest) crew = [coreBest, ...crew.filter(m => m !== coreBest)];
  }
  // diversity: a lead who already directs many templates hands this one to the next member who ALSO matches it
  const fresh = crew.find(m => !saturated.has(m.id) && castingScore(m, { ask: text }) > 0);
  if (fresh && fresh !== crew[0]) crew = [fresh, ...crew.filter(m => m !== fresh)];
  crew = crew.slice(0, 3);
  if (!crew.length || castingScore(crew[0], { ask: text }) <= 0) {
    // nothing in the template's words matches a style — pick deterministically among title-capable members
    // (hash of the id) instead of always defaulting to the first roster entry
    const pool = MOTION_ROSTER.filter(m => m.media.includes('title') || m.media.includes('lower-third'));
    let h = 0; for (const ch of templateId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pick = pool[h % pool.length];
    crew = [pick, ...castCrew({ ask: text, pinned: [pick.id], size: 3 }).filter(m => m.id !== pick.id)];
  }
  const lead = crew[0];
  const counter = rivalOf(lead.id, crew.map(m => m.id));
  const g = grammarFor(lead.id)!;
  const enterSec = Math.min(1.2, Math.max(0.35, (Array.isArray(g.pace) ? g.pace[0] : g.pace) * 0.25));
  const notes = [
    `Lead — ${lead.name}: ${lead.signature[0]}.`,
    `Title enters with ${g.title} (${g.titleStyle}), ease ${lead.timing.ease}; ${lead.timing.on === 'mixed' ? 'ones on the hit, twos on the hold' : lead.timing.on === 1 ? 'animated on ones' : `animated on ${lead.timing.on === 2 ? 'twos' : 'threes'}`}.`,
    ...(counter ? [`Counterpoint — ${nameOf(counter)}: ${rosterMember(counter)?.signature[0] || 'one contrasting move'}, once.`] : []),
    `Editor — ${MOTION_PERSONAS[lead.seat].name}: hold long enough to read twice; keep it inside title-safe.`,
    ...(lead.culturalNote || collab ? [lead.culturalNote || 'Collaboration required — credit and involve the tradition this pack draws from.'] : []),
  ];
  return {
    templateId, templateName, family, lead: lead.id, counterpoint: counter, editor: lead.seat,
    timing: { fps: lead.timing.fps, on: lead.timing.on, ease: lead.timing.ease, enterSec: Math.round(enterSec * 100) / 100, holdSec: Math.max(2, Math.round((duration - 2 * enterSec) * 10) / 10) },
    notes,
  };
}

/** Motion direction for every platform lower third / full page and broadcast pack. */
export function platformTemplateDirections(lowerThirds: LowerThirdLike[], packs: BroadcastPackLike[], maxPerLead = 8): TemplateDirection[] {
  const counts = new Map<string, number>();
  const saturated = new Set<string>();
  const take = (d: TemplateDirection) => {
    const n = (counts.get(d.lead) || 0) + 1; counts.set(d.lead, n);
    if (n >= maxPerLead) saturated.add(d.lead);
    return d;
  };
  const lt = lowerThirds.map(s => take(direct(s.id, s.name, s.format === 'full-page' ? 'full-page' : 'lower-third',
    [s.name, s.family, s.group, s.tagline, ...(s.tags || [])].filter(Boolean).join(' ').replace(/[-_]/g, ' '), s.duration || 5, false, saturated,
    [s.name, s.family].filter(Boolean).join(' ').replace(/[-_]/g, ' '))));
  const bp = packs.map(p => take(direct(p.id, p.name, 'broadcast-pack',
    [p.name, p.family, p.region, p.period, p.premise, p.motionGrammar, ...(p.tags || [])].filter(Boolean).join(' ').replace(/[-_]/g, ' '), 6, !!p.collaborationRequired, saturated,
    [p.name, p.family === 'SPORTS' ? 'sports' : ''].filter(Boolean).join(' ').replace(/[-_]/g, ' '))));
  return [...lt, ...bp];
}

/** Direction for one platform template id (memoised by the host from platformTemplateDirections). */
export function directionIndex(dirs: TemplateDirection[]): Map<string, TemplateDirection> {
  return new Map(dirs.map(d => [d.templateId, d]));
}
