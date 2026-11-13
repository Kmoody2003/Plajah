// storyBrain — the questions Story Intelligence asks of a production, and how it reads the answers.
//
// The other modules in this folder are deterministic: they count, line up and carry state. This one is
// where judgement comes in. Each task below is a (system, user) prompt pair plus a normaliser for the
// reply, so the caller — Fabula, Tela, the agent — runs it through whatever model it has and gets a
// typed result it can store on the production and feed back into generation:
//
//   relationshipsTask   who these people are to each other, and what each one wants and fears
//   binReasoningTask    what the unused clips in the bins could do for a scene: alternates, rebuilds
//   gapFillTask         scenes and shots for a hole in the story — the writer's-block pass
//   critiqueTask        notes on story, writing and cinematography, tied to specific scenes
//
// Every task reasons from a digest of the production as it IS (script, cut, coverage), and is told to
// cite what it saw. An editor that invents events to critique is worse than no editor.

import type { CharacterMotivation } from './performance';
import type { CoverageMap } from './coverage';
import type { RelationshipEdge } from './characterIntel';
import { describeAnalysis } from './clipVision';

export interface BrainTask { system: string; user: string }

const VOICE = `You are Fabula's Story Intelligence: an editor, script supervisor and story analyst working inside a film's edit. You reason from what the production actually contains — the script as written and the cut as it stands. You never invent events, lines or characters that the material does not support; when you infer, you say what you inferred it from. You are specific and practical: name the scene, name the shot, say what to do.`;

const JSON_ONLY = `Respond with valid JSON only — no preamble, no code fences. Escape double quotes inside strings. No raw line breaks inside string values. Keep the whole response compact enough that it never truncates.`;

const clip = (s: any, n: number) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
const str = (x: any): string => (typeof x === 'string' ? x.trim() : '');

/** A compact, model-readable picture of the production: premise, cast, and every scene in story order
 *  with its intent, its lines and how much of it is actually in the cut. Bounded so a feature fits. */
export function digestProduction(prod: any, coverage?: CoverageMap, opts: { maxScenes?: number; scriptChars?: number } = {}): string {
  const maxScenes = opts.maxScenes ?? 60, scriptChars = opts.scriptChars ?? 420;
  const cov = new Map((coverage?.scenes || []).map((s) => [s.sceneId, s]));
  const lines: string[] = [];
  lines.push(`TITLE: ${prod?.title || 'Untitled'}`);
  if (prod?.description) lines.push(`LOGLINE: ${clip(prod.description, 300)}`);
  if (prod?.themes) lines.push(`THEMES: ${clip(prod.themes, 200)}`);
  if (prod?.world) lines.push(`WORLD: ${clip(prod.world, 400)}`);
  const cast = arr(prod?.cast).filter((c) => c?.name);
  if (cast.length) lines.push(`CAST:\n${cast.map((c) => `- ${c.name}${c.looks ? `: ${clip(c.looks, 120)}` : ''}${c.personality ? ` | ${clip(c.personality, 100)}` : ''}`).join('\n')}`);
  let n = 0;
  for (const act of arr(prod?.acts)) {
    for (const sc of arr(act?.scenes)) {
      if (n++ >= maxScenes) break;
      const c = cov.get(sc.id);
      const state = c ? `${c.state}${c.shots.length ? ` (${c.counts.shot + c.counts.boarded}/${c.shots.length} shots in the cut)` : ''}` : 'unknown';
      const who = arr(sc.bible?.characters).map((x) => `${x.name}${x.arc_in_scene ? ` [${x.arc_in_scene}]` : ''}`).join(', ');
      lines.push([
        `\n[${sc.id}] ${act.title || `ACT ${act.number || ''}`} — ${sc.slugline || sc.title || 'SCENE'} · cut: ${state}`,
        sc.bible?.intent && `  intent: ${clip(sc.bible.intent, 200)}`,
        sc.bible?.subtext_read && `  subtext: ${clip(sc.bible.subtext_read, 200)}`,
        sc.tone && `  tone: ${clip(sc.tone, 120)}`,
        who && `  characters: ${who}`,
        sc.script ? `  script: ${clip(sc.script, scriptChars)}` : '  script: (none written)',
        arr(sc.shots).length ? `  shots: ${arr(sc.shots).map((s) => `${s.slug} ${s.type}${s.camera ? ` (${clip(s.camera, 40)})` : ''}`).join('; ')}` : '',
      ].filter(Boolean).join('\n'));
    }
  }
  return lines.join('\n');
}

// ── relationships + motivations ─────────────────────────────────────────────────

export interface CharacterRead extends CharacterMotivation { name: string; arc?: string; evidence?: string }
export interface RelationshipRead { a: string; b: string; kind: string; dynamic: string; tension?: string; evidence?: string }
export interface RelationshipsResult { characters: CharacterRead[]; relationships: RelationshipRead[] }

export function relationshipsTask(prod: any, edges: RelationshipEdge[], coverage?: CoverageMap): BrainTask {
  return {
    system: `${VOICE}\n\nTASK: Read the story taking place in this edit and say who these characters are to each other and what drives each of them. Work from behaviour — what they do and say to each other across scenes — not from labels.\n\n${JSON_ONLY}\nSchema:\n{"characters":[{"name":"exact cast name","want":"conscious goal, under 16 words","need":"what they actually need, under 16 words","fear":"under 12 words","obstacle":"who or what is in the way","arc":"start → end across the story","evidence":"scene ids or lines this rests on"}],"relationships":[{"a":"name","b":"name","kind":"e.g. siblings, rivals, mentor and student, strangers","dynamic":"who holds power and how it moves, under 20 words","tension":"the unresolved thing between them, under 16 words","evidence":"scene ids"}]}\nOnly include characters and pairs the material supports. Leave a field empty rather than guess.`,
    user: `${digestProduction(prod, coverage)}\n\nWHO SHARES THE STORY (counted from the breakdown — strongest pairs first):\n${edges.slice(0, 24).map((e) => `- ${e.a} + ${e.b}: ${e.sharedScenes} shared scene${e.sharedScenes === 1 ? '' : 's'}, ${e.exchanges} exchanges`).join('\n') || '(no pairs found yet)'}`,
  };
}

export function normalizeRelationships(raw: any, castNames: string[] = []): RelationshipsResult {
  const canon = (n: any) => castNames.find((x) => x.toLowerCase() === str(n).toLowerCase()) || str(n);
  return {
    characters: arr(raw?.characters).filter((c) => str(c?.name)).map((c) => ({
      name: canon(c.name), want: str(c.want) || undefined, need: str(c.need) || undefined, fear: str(c.fear) || undefined,
      obstacle: str(c.obstacle) || undefined, arc: str(c.arc) || undefined, evidence: str(c.evidence) || undefined,
    })),
    relationships: arr(raw?.relationships).filter((r) => str(r?.a) && str(r?.b)).map((r) => ({
      a: canon(r.a), b: canon(r.b), kind: str(r.kind), dynamic: str(r.dynamic), tension: str(r.tension) || undefined, evidence: str(r.evidence) || undefined,
    })),
  };
}

/** Motivations keyed by character name — the shape the performance engine takes. */
export function motivationsFrom(result: RelationshipsResult | undefined): Record<string, CharacterMotivation> {
  const out: Record<string, CharacterMotivation> = {};
  for (const c of result?.characters || []) out[c.name] = { want: c.want, need: c.need, fear: c.fear, obstacle: c.obstacle };
  return out;
}

// ── reasoning over the bins ─────────────────────────────────────────────────────

export interface BinClipNote { assetId: string; name: string; bin?: string; type?: string; durationSec?: number; tags?: string[]; note?: string; /** What a vision pass saw in it, when one has run. */ seen?: string; inCut: boolean }
export interface BinSuggestion { kind: 'alternate_take' | 'insert' | 'rebuild' | 'unused_story'; sceneId?: string; shotSlug?: string; assetIds: string[]; idea: string; why: string }

/** The bins as the model should see them: every asset with what's known about it and whether it's
 *  already in the cut. */
export function describeBins(prod: any, clips: any[]): BinClipNote[] {
  const used = new Set(arr(clips).filter((c) => c && !c.disabled).map((c) => c.assetId).filter(Boolean));
  return arr(prod?.mediaPool).filter((a) => a?.type === 'video' || a?.type === 'image').map((a) => ({
    assetId: a.id, name: a.name, bin: a.bin, type: a.type, durationSec: Number(a.duration) || undefined,
    tags: arr(a.tags).slice(0, 8), note: str(a.note) || undefined, seen: describeAnalysis(a.analysis) || str(a.seen) || undefined, inCut: used.has(a.id),
  }));
}

export function binReasoningTask(prod: any, bins: BinClipNote[], coverage?: CoverageMap, focusSceneId?: string): BrainTask {
  const list = bins.slice(0, 160).map((b) => `- ${b.assetId} | ${b.name} | ${b.type}${b.durationSec ? ` ${b.durationSec.toFixed(1)}s` : ''} | bin: ${b.bin || '—'} | ${b.inCut ? 'IN CUT' : 'unused'}${b.tags?.length ? ` | tags: ${b.tags.join(', ')}` : ''}${b.seen ? ` | shows: ${clip(b.seen, 260)}` : ' | NOT WATCHED'}${b.note ? ` | note: ${clip(b.note, 100)}` : ''}`).join('\n');
  return {
    system: `${VOICE}\n\nTASK: Look across the media bins against the story and the cut. Find where footage that is NOT in the cut could serve the story: an alternate take for a shot that's already cut, an insert or reaction a scene is missing, a different way to build a scene from the coverage that exists, or material that suggests a story beat the script doesn't have. Reason about story, action and scene progression — what each clip shows and where in the scene's movement it belongs.\n\n${JSON_ONLY}\nSchema:\n{"suggestions":[{"kind":"alternate_take|insert|rebuild|unused_story","sceneId":"scene id from the digest, or empty","shotSlug":"shot slug it relates to, or empty","assetIds":["asset ids from the bin list, in cut order"],"idea":"what to do, under 30 words","why":"what it does for the story, under 24 words"}]}\nUp to 12 suggestions, most valuable first. Only use asset ids from the list. A clip marked NOT WATCHED has not been seen: judge it only from its name, tags and bin, say so in "why", and prefer watched clips when both could do the job.`,
    user: `${digestProduction(prod, coverage)}\n\n${focusSceneId ? `FOCUS ON SCENE: ${focusSceneId}\n\n` : ''}MEDIA BINS:\n${list || '(empty)'}`,
  };
}

export function normalizeBinSuggestions(raw: any, bins: BinClipNote[]): BinSuggestion[] {
  const known = new Set(bins.map((b) => b.assetId));
  const kinds = ['alternate_take', 'insert', 'rebuild', 'unused_story'];
  return arr(raw?.suggestions).map((s) => ({
    kind: (kinds.includes(s?.kind) ? s.kind : 'insert') as BinSuggestion['kind'],
    sceneId: str(s?.sceneId) || undefined, shotSlug: str(s?.shotSlug) || undefined,
    // Drop any asset id the model made up — a suggestion pointing at nothing is noise.
    assetIds: arr(s?.assetIds).map(str).filter((id) => known.has(id)),
    idea: str(s?.idea), why: str(s?.why),
  })).filter((s) => s.idea && s.assetIds.length);
}

// ── writer's block: filling a hole ──────────────────────────────────────────────

export interface GapFill {
  options: { title: string; slugline: string; premise: string; script: string; whyItWorks: string; shots: { type: string; subject: string; character?: string; lines?: string; camera?: string; purpose?: string }[] }[];
}

/** Ask for ways across a hole in the story: the scene before, the scene after, and what has to change
 *  between them. `sceneId` may be an unwritten scene, or omitted with `afterSceneId` to bridge a jump. */
export function gapFillTask(prod: any, target: { sceneId?: string; afterSceneId?: string; ask?: string }, coverage?: CoverageMap): BrainTask {
  const flat: any[] = [];
  for (const act of arr(prod?.acts)) for (const sc of arr(act?.scenes)) flat.push(sc);
  const i = flat.findIndex((s) => s.id === (target.sceneId || target.afterSceneId));
  const before = target.sceneId ? flat[i - 1] : flat[i];
  const here = target.sceneId ? flat[i] : undefined;
  const after = flat[i + 1];
  const show = (label: string, sc?: any) => (sc ? `${label}: ${sc.slugline || sc.title || 'SCENE'}\n${clip(sc.script || sc.bible?.intent || '(nothing written)', 900)}` : `${label}: (none — this is the ${label === 'BEFORE' ? 'opening' : 'ending'})`);
  return {
    system: `${VOICE}\n\nTASK: The filmmaker is stuck on a gap in the story. Offer THREE genuinely different ways across it — different in what happens, not just in wording. Each must grow out of what the characters already want and must hand off cleanly to the scene that follows. Write in the voice and register the existing script uses. Do not resolve anything the later scenes still depend on.\n\n${JSON_ONLY}\nSchema:\n{"options":[{"title":"short","slugline":"INT./EXT. LOCATION - TIME","premise":"what happens, under 30 words","script":"the scene, written out — action and dialogue, under 180 words","whyItWorks":"what it sets up or pays off, under 24 words","shots":[{"type":"shot size + setup","subject":"3-8 words","character":"speaker or empty","lines":"verbatim line or action beat","camera":"lens, angle, move","purpose":"under 12 words"}]}]}\n4-8 shots per option.`,
    user: `${digestProduction(prod, coverage, { scriptChars: 220 })}\n\n— THE GAP —\n${show('BEFORE', before)}\n\n${here ? `THE SCENE TO WRITE: ${here.slugline || here.title || 'UNTITLED'}${here.tone ? ` (tone: ${here.tone})` : ''}${here.script ? `\nWhat exists so far: ${clip(here.script, 600)}` : ''}` : 'THE SCENE TO WRITE: a new scene bridging these two'}\n\n${show('AFTER', after)}${target.ask ? `\n\nTHE FILMMAKER'S NOTE: ${clip(target.ask, 400)}` : ''}`,
  };
}

export function normalizeGapFill(raw: any): GapFill {
  return {
    options: arr(raw?.options).filter((o) => str(o?.script) || str(o?.premise)).slice(0, 3).map((o) => ({
      title: str(o.title) || 'Option', slugline: str(o.slugline), premise: str(o.premise), script: str(o.script), whyItWorks: str(o.whyItWorks),
      shots: arr(o.shots).map((s) => ({ type: str(s?.type) || 'MED', subject: str(s?.subject), character: str(s?.character) || undefined, lines: str(s?.lines) || undefined, camera: str(s?.camera) || undefined, purpose: str(s?.purpose) || undefined })),
    })),
  };
}

// ── critique ────────────────────────────────────────────────────────────────────

export type CritiqueArea = 'story' | 'writing' | 'cinematography' | 'edit';
export interface CritiqueNote { area: CritiqueArea; sceneId?: string; severity: 'strength' | 'note' | 'problem'; observation: string; suggestion: string }
export interface Critique { summary: string; notes: CritiqueNote[] }

export function critiqueTask(prod: any, coverage?: CoverageMap, areas: CritiqueArea[] = ['story', 'writing', 'cinematography', 'edit']): BrainTask {
  return {
    system: `${VOICE}\n\nTASK: Give the filmmaker honest, usable notes on this production as it stands — the notes a trusted editor gives in the room. Cover: ${areas.join(', ')}.\n- story: structure, stakes, cause and effect, what each scene turns, where momentum drops.\n- writing: dialogue that explains instead of playing, scenes that start early or end late, voices that blur together.\n- cinematography: whether the coverage serves the scene's intent — shot size against emotional distance, eyelines and axis, where the plan repeats itself.\n- edit: scenes the cut is missing, scenes that could go, order.\nSay what is working as well as what isn't. Tie every note to a scene id where you can. A note with no suggestion is not a note.\n\n${JSON_ONLY}\nSchema:\n{"summary":"3 sentences: what this film is, what's strongest, the one thing to fix first","notes":[{"area":"story|writing|cinematography|edit","sceneId":"scene id or empty","severity":"strength|note|problem","observation":"what you see, under 28 words","suggestion":"what to do about it, under 28 words"}]}\n8-16 notes, most important first.`,
    user: digestProduction(prod, coverage),
  };
}

export function normalizeCritique(raw: any): Critique {
  const areas = ['story', 'writing', 'cinematography', 'edit'], sev = ['strength', 'note', 'problem'];
  return {
    summary: str(raw?.summary),
    notes: arr(raw?.notes).filter((n) => str(n?.observation)).map((n) => ({
      area: (areas.includes(n.area) ? n.area : 'story') as CritiqueArea,
      sceneId: str(n.sceneId) || undefined,
      severity: (sev.includes(n.severity) ? n.severity : 'note') as CritiqueNote['severity'],
      observation: str(n.observation), suggestion: str(n.suggestion),
    })),
  };
}
