// motionBuild — the Motion Council BUILDS. Give it assets (from Fabula's media pool) and say what you want; it casts
// a crew, and each crew member directs one OPTION: a real, beat-timed edit assembled from your sources in their style
// (cut pacing, in-cut camera move, Forge look + effects, transitions, title animation, grade, on-twos stepping).
// Each option keeps the council's method: a LEAD (the member's grammar), a COUNTERPOINT (one move from a rival, used
// once — a choice, not a compromise) and an EDITOR (the member's council seat, who keeps everything on frames/beats).
//
// "The model chooses, the engine builds": planBuild() may ask the model to pick crew, titles and per-option choices
// — but only from valid catalog ids — and the same deterministic assembler (assembleOption) turns every choice into
// a recipe. A bad or missing model response can never produce a broken timeline; with no keys it is fully local.
//
// Recipes are host-neutral (tracks named by role, assets by SLOT index) so the same recipe is (1) built into Fabula
// by recipeToFabulaClips and (2) saved as a reusable motion template (motionTemplates.ts) and rebuilt on new assets.
import { callGemini } from '../../geminiService';
import { stepKeyframes } from './motionApply';
import { grammarFor, type BuildGrammar, type MoveId } from './motionBuildGrammar';
import { castCrew, rosterMember, rosterTension, ROSTER_TENSIONS, type RosterMember } from './motionRoster';
import { MOTION_PERSONAS } from './motionCouncilPersonas';
import type { MotionPersonaId, MotionMedium } from './motionCouncilTypes';
import type { KfMap, KfTrack, Ease } from '../../fabula/keyframes';
import type { TitleAnimType } from '../../fabula/titleAnimators';

// ─────────────────────────────── types ───────────────────────────────

export type BuildAssetType = 'video' | 'image' | 'graphic' | 'lottie' | 'audio' | string;
export interface BuildAsset { id: string; name: string; type: BuildAssetType; duration?: number; }

export interface BuildBrief {
  ask: string;
  assets: BuildAsset[];
  fps: number;
  aspect?: string;
  tempo?: number;        // BPM; default 120
  targetSec?: number;    // overrides a length parsed from the ask
  crew?: string[];       // roster/director ids to lead options; otherwise cast from the ask
  optionCount?: number;  // default 3
  titleText?: string;    // overrides a title parsed from the ask
  medium?: MotionMedium;
}

export type RecipeRole = 'picture' | 'title' | 'music' | 'sourceAudio';
export interface RecipeEffect { effectId: string; mix: number; }
export interface RecipeClip {
  role: RecipeRole;
  slot?: number;              // index into the visual (picture) or audio (music) asset list
  start: number;              // seconds from the build's start
  duration: number;
  srcIn: number;
  label: string;
  fx?: Record<string, any>;   // static fx keys (grade/blend/fades)
  kf?: KfMap;
  look?: string;              // FORGE_LOOKS id
  effects?: RecipeEffect[];
  trans?: { forgeId: string; dur: number };
  counterpoint?: boolean;     // this cut carries the rival's move
  title?: { text: string; subtitle?: string; titleStyle: 'modern' | 'classic' | 'minimal'; tAnim: { type: TitleAnimType; duration: number; delay: number; out: number; stagger: number }; tx: number; ty: number; tSize: number };
}
export interface BuildRecipe { duration: number; bpm: number; fps: number; clips: RecipeClip[]; markers: number[]; visualSlots: number; audioSlots: number; }

export interface BuildOption {
  id: string;
  leadId: string;
  counterId?: string;
  editorId: MotionPersonaId;
  title: string;
  rationale: string;
  summary: string[];
  grammar: BuildGrammar;
  recipe: BuildRecipe;
  source: 'ai' | 'local';
}

// ─────────────────────────────── parsing the ask ───────────────────────────────

/** A quoted phrase, or what follows "title:" / "saying", becomes the title text. */
export function parseTitleText(ask: string): string | undefined {
  const q = ask.match(/[“"']([^“”"']{2,80})[”"']/);
  if (q) return q[1].trim();
  const m = ask.match(/(?:title|titled|saying|that says|reads?)\s*[:\-]?\s*([A-Za-z0-9][^,.;!?]{1,60})/i);
  return m ? m[1].trim() : undefined;
}

/** "a 15 second promo", "30s", "1 minute", "8 bars". */
export function parseTargetSec(ask: string, bpm: number): number | undefined {
  const s = ask.match(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(s|sec|secs|second|seconds)\b/i);
  if (s) return parseFloat(s[1]);
  const m = ask.match(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(min|mins|minute|minutes)\b/i);
  if (m) return parseFloat(m[1]) * 60;
  const b = ask.match(/(\d+)\s*(bars?)\b/i);
  if (b) return parseInt(b[1], 10) * 4 * (60 / bpm);
  return undefined;
}

function wantsTitle(ask: string, medium?: MotionMedium): boolean {
  return medium === 'title' || medium === 'logo-sting' || medium === 'lower-third' || /\b(title|opening|opener|intro|logo|credits?|name card|lower third|caption)\b/i.test(ask);
}
function isLowerThird(ask: string, medium?: MotionMedium) { return medium === 'lower-third' || /lower[- ]third/i.test(ask); }

// ─────────────────────────────── in-cut moves (keyframes) ───────────────────────────────

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const key = (t: number, v: number, ease: Ease = 'smooth') => ({ t: r3(t), v: r3(v), ease });

/** Keyframes for one cut of length d. Small, honest moves — the style lives in timing, not in amplitude. */
export function moveKeyframes(move: MoveId, d: number, i: number): KfMap {
  const dir = i % 2 === 0 ? 1 : -1;
  switch (move) {
    case 'push': return { sc: [key(0, 1, 'smooth'), key(d, 1.1)] };
    case 'drift': return { x: [key(0, -3 * dir, 'linear'), key(d, 3 * dir)], sc: [key(0, 1.06, 'linear'), key(d, 1.06)] };
    case 'snap': { const a = Math.min(0.25, d / 3); return { sc: [key(0, 1.22, 'out'), key(a, 1, 'linear'), key(d, 1.03)] }; }
    case 'float': return { y: [key(0, 2.5, 'smooth'), key(d, -2.5)], rot: [key(0, -0.8 * dir, 'smooth'), key(d, 0.8 * dir)], sc: [key(0, 1.05, 'linear'), key(d, 1.05)] };
    case 'shake': { const s = Math.min(0.4, d / 2); const k: KfTrack = []; for (let j = 0; j <= 6; j++) k.push(key((s * j) / 6, j === 6 ? 0 : (j % 2 ? -1 : 1) * 3 * (1 - j / 6), 'hold')); k.push(key(d, 0, 'linear')); return { x: k }; }
    case 'bounce': { const q = d / 4; return { y: [key(0, 0, 'out'), key(q, -3, 'in'), key(2 * q, 0, 'out'), key(3 * q, -2, 'in'), key(d, 0, 'linear')] }; }
    case 'scrollUp': return { y: [key(0, 6, 'smooth'), key(d, -6)], sc: [key(0, 1.14, 'linear'), key(d, 1.14)] };
    default: return {};
  }
}

// ─────────────────────────────── assembling an option ───────────────────────────────

const isVisual = (a: BuildAsset) => a.type !== 'audio';
const isAudio = (a: BuildAsset) => a.type === 'audio';
const nameOf = (id: string) => rosterMember(id)?.name || MOTION_PERSONAS[id as MotionPersonaId]?.name || id;
const short = (id: string) => nameOf(id).replace(/^The /, '');

/** Overrides the model (or a template) may set on top of a member's grammar. Ids are validated by the caller. */
export interface OptionOverrides { pace?: number | number[]; move?: MoveId; look?: string | null; effects?: string[]; trans?: string; title?: TitleAnimType; titleText?: string; rationale?: string; label?: string; }

/** Pick the rival a lead argues with — inside the crew first, then anywhere on the roster. */
export function rivalOf(leadId: string, crew: string[]): string | undefined {
  const inCrew = crew.find(id => id !== leadId && rosterTension(leadId, id));
  if (inCrew) return inCrew;
  for (const [a, b] of ROSTER_TENSIONS) { if (a === leadId) return b; if (b === leadId) return a; }
  // no standing argument: the crew member from the most different school (other guild, other seat) counters
  const lead = rosterMember(leadId);
  if (!lead) return undefined;
  return crew.find(id => { const m = rosterMember(id); return m && m.guild !== lead.guild && m.seat !== lead.seat; })
    || crew.find(id => { const m = rosterMember(id); return m && m.guild !== lead.guild; });
}

/**
 * Deterministically assemble one option. Visual assets rotate through the cuts (video advances its in-point so
 * repeats show new footage); the first audio asset becomes the music bed and sets the length when no target is
 * given; cuts land on the beat grid; transitions sit on the incoming cut; the rival's first effect lands on ONE
 * cut (the middle — where a drop usually sits).
 */
export function assembleOption(brief: BuildBrief, leadId: string, counterId: string | undefined, ov: OptionOverrides = {}, idx = 0): BuildOption {
  const base = grammarFor(leadId);
  if (!base) throw new Error(`No build grammar for ${leadId}`);
  const gr: BuildGrammar = {
    ...base,
    ...(ov.pace != null ? { pace: ov.pace } : {}), ...(ov.move ? { move: ov.move } : {}),
    ...(ov.look !== undefined ? { look: ov.look || undefined } : {}), ...(ov.effects ? { effects: ov.effects } : {}),
    ...(ov.trans ? { trans: ov.trans } : {}), ...(ov.title ? { title: ov.title } : {}),
  };
  const bpm = brief.tempo && brief.tempo > 0 ? brief.tempo : 120;
  const beat = 60 / bpm, bar = beat * 4;
  const fps = brief.fps || 24;
  const frame = 1 / fps;
  const snapF = (t: number) => Math.round(t * fps) / fps;
  const visuals = brief.assets.filter(isVisual);
  const audios = brief.assets.filter(isAudio);
  const music = audios[0];
  const pattern = Array.isArray(gr.pace) ? gr.pace : [gr.pace];
  const avgBeats = pattern.reduce((a, b) => a + b, 0) / pattern.length;
  // the structural/pixilation floor: never more than 3 cuts a second (photosensitivity)
  const minCut = Math.max(0.34, 2 * frame);

  let total = brief.targetSec ?? parseTargetSec(brief.ask, bpm);
  if (!total && music?.duration) total = Math.min(60, music.duration);
  if (!total) total = Math.max(6, Math.min(30, Math.max(1, visuals.length) * avgBeats * beat * 2));
  total = Math.max(bar, Math.round(total / bar) * bar); // whole bars

  const clips: RecipeClip[] = [];
  const counter = counterId ? grammarFor(counterId) : undefined;
  const counterFx = counter?.effects.find(e => !gr.effects.includes(e));
  const srcPos = new Map<number, number>();
  let t = 0, i = 0;
  const cutCount = Math.max(1, Math.round(total / (avgBeats * beat)));
  const counterAt = Math.floor(cutCount / 2);
  const transEvery = gr.transEvery ?? (avgBeats >= 3 ? 1 : 4);
  const stepOn = rosterMember(leadId)?.timing.on;
  while (visuals.length && t < total - 1e-6) {
    let len = Math.max(minCut, pattern[i % pattern.length] * beat);
    // a remainder shorter than the floor is absorbed into this cut rather than left as a flash frame
    if (total - t - len < minCut) len = total - t;
    len = snapF(Math.min(len, total - t));
    if (len < minCut) {
      const prev = clips.filter(c => c.role === 'picture' || c.role === 'sourceAudio').filter(c => Math.abs(c.start + c.duration - t) < 1e-3);
      prev.forEach(c => { c.duration = r3(c.duration + len); });
      t = snapF(t + len);
      break;
    }
    const slot = i % visuals.length;
    const a = visuals[slot];
    let srcIn = 0;
    if (a.type === 'video' && a.duration && a.duration > len) {
      const p = srcPos.get(slot) ?? 0;
      srcIn = p + len <= a.duration ? p : 0;
      srcPos.set(slot, snapF(srcIn + len));
    }
    let kf = moveKeyframes(gr.move, len, i);
    if (stepOn === 2 || stepOn === 3) kf = stepKeyframes(kf, stepOn, fps);
    const effects: RecipeEffect[] = gr.effects.map(e => ({ effectId: e, mix: gr.mix ?? 0.6 }));
    const isCounter = !!counterFx && i === counterAt && cutCount > 1;
    if (isCounter) effects.push({ effectId: counterFx!, mix: 0.7 });
    const transDur = Math.min(len / 2, (gr.transBeats ?? 1) * beat);
    const trans = i > 0 && gr.trans !== 'cut' && i % transEvery === 0 ? { forgeId: gr.trans, dur: r3(Math.max(2 * frame, transDur)) } : undefined;
    clips.push({
      role: 'picture', slot, start: r3(t), duration: r3(len), srcIn: r3(srcIn), label: `${a.name} · ${short(leadId)} ${i + 1}`,
      fx: gr.grade ? { ...gr.grade } : undefined, kf, look: gr.look, effects, trans, counterpoint: isCounter || undefined,
    });
    if (a.type === 'video' && !music) clips.push({ role: 'sourceAudio', slot, start: r3(t), duration: r3(len), srcIn: r3(srcIn), label: `${a.name} · A` });
    t = snapF(t + len); i++;
  }
  const builtLen = r3(t || total);

  const titleText = ov.titleText ?? brief.titleText ?? parseTitleText(brief.ask);
  if (titleText || wantsTitle(brief.ask, brief.medium)) {
    const lower = isLowerThird(brief.ask, brief.medium);
    const dur = r3(Math.min(builtLen, Math.max(3, 2 * bar)));
    clips.push({
      role: 'title', start: lower ? r3(bar) : 0, duration: lower ? r3(Math.min(dur, builtLen - bar)) : dur, srcIn: 0, label: `Title · ${short(leadId)}`,
      fx: { blend: 'normal', fadeIn: 0, fadeOut: 0 },
      title: {
        text: titleText || 'YOUR TITLE', titleStyle: gr.titleStyle,
        tAnim: { type: gr.title, duration: r3(Math.min(1.5, Math.max(0.4, 2 * beat))), delay: 0, out: 0.4, stagger: 0.6 },
        tx: 50, ty: lower ? 82 : 50, tSize: lower ? 4.2 : 7,
      },
    });
  }
  if (music) clips.push({ role: 'music', slot: 0, start: 0, duration: builtLen, srcIn: 0, label: `${music.name} · bed` });

  const markers: number[] = [];
  for (let m = 0; m <= builtLen + 1e-6; m += bar) markers.push(r3(m));

  const member = rosterMember(leadId);
  const editorId = (member?.seat || (MOTION_PERSONAS[leadId as MotionPersonaId] ? leadId : 'KINETIC')) as MotionPersonaId;
  const pics = clips.filter(c => c.role === 'picture');
  const paceWords = Array.isArray(gr.pace) ? `cuts in a ${gr.pace.join('-')} beat pattern` : gr.pace <= 1 ? 'a cut on every beat' : `a cut every ${gr.pace} beats`;
  const summary = [
    `${pics.length} cuts · ${paceWords} at ${bpm} BPM · ${builtLen.toFixed(1)}s`,
    `In-cut move: ${gr.move}${stepOn === 2 || stepOn === 3 ? ` on ${stepOn === 2 ? 'twos' : 'threes'}` : ''}`,
    [gr.look && `look ${gr.look}`, gr.effects.length && `fx ${gr.effects.join(' + ')}`].filter(Boolean).join(' · ') || 'clean picture, no effects',
    gr.trans === 'cut' ? 'straight cuts' : `transition ${gr.trans}${transEvery > 1 ? ` on every ${transEvery}th cut` : ''}`,
    ...(clips.some(c => c.role === 'title') ? [`title animates ${gr.title} (${gr.titleStyle})`] : []),
    ...(counterFx && counterId ? [`counterpoint: ${short(counterId)}'s ${counterFx} on one cut`] : []),
    ...(music ? [`${music.name} is the bed — length follows it`] : []),
  ];
  const rationale = ov.rationale || (member
    ? `${member.name} leads: ${member.ethos} ${counterId ? `${nameOf(counterId)} gets one move, once.` : ''} ${MOTION_PERSONAS[editorId].name} edits it to the frame and the beat.`
    : `${nameOf(leadId)} leads, cutting on the beat.`);

  return {
    id: `opt-${idx}-${leadId}`, leadId, counterId, editorId,
    title: ov.label || `${short(leadId)} cut`,
    rationale: rationale.replace(/\s+/g, ' ').trim(), summary, grammar: gr,
    recipe: { duration: builtLen, bpm, fps, clips, markers, visualSlots: visuals.length, audioSlots: audios.length },
    source: 'local',
  };
}

/** Who leads each option: the given crew, else cast from the ask; each lead gets a rival as counterpoint. */
export function leadsFor(brief: BuildBrief): { leads: string[]; crew: string[] } {
  const n = Math.max(1, Math.min(6, brief.optionCount ?? 3));
  const crew = (brief.crew?.length ? brief.crew : castCrew({ ask: brief.ask, medium: brief.medium, size: Math.max(n, 3) }).map(m => m.id)).filter(id => grammarFor(id));
  return { leads: crew.slice(0, n), crew };
}

/** Local, deterministic options — always works, no keys. */
export function localBuildOptions(brief: BuildBrief): BuildOption[] {
  if (!brief.assets.some(isVisual)) return [];
  const { leads, crew } = leadsFor(brief);
  return leads.map((id, i) => assembleOption(brief, id, rivalOf(id, crew), {}, i));
}

// ─────────────────────────────── the model chooses (validated) ───────────────────────────────

export interface BuildCatalog { effects: string[]; transitions: string[]; looks: string[]; }
const TITLE_TYPES: TitleAnimType[] = ['none', 'typeOn', 'fadeUp', 'fadeIn', 'tracking', 'scramble', 'wordSlide', 'blurIn', 'dropIn'];
const MOVES: MoveId[] = ['hold', 'push', 'drift', 'snap', 'float', 'shake', 'scrollUp', 'bounce'];

/** Keep only overrides that name real catalog ids and sane values. */
export function sanitizeOverrides(o: any, cat: BuildCatalog): OptionOverrides {
  const out: OptionOverrides = {};
  if (!o || typeof o !== 'object') return out;
  const pace = Array.isArray(o.pace) ? o.pace.map(Number).filter((n: number) => n >= 0.5 && n <= 16).slice(0, 6) : Number(o.pace);
  if (Array.isArray(pace) ? pace.length : pace >= 0.5 && pace <= 16) out.pace = pace as any;
  if (MOVES.includes(o.move)) out.move = o.move;
  if (o.look === null || o.look === 'none') out.look = null; else if (cat.looks.includes(o.look)) out.look = o.look;
  if (Array.isArray(o.effects)) { const fx = o.effects.filter((e: string) => cat.effects.includes(e)).slice(0, 3); if (fx.length || o.effects.length === 0) out.effects = fx; }
  if (o.trans === 'cut' || cat.transitions.includes(o.trans)) out.trans = o.trans;
  if (TITLE_TYPES.includes(o.title)) out.title = o.title;
  if (typeof o.titleText === 'string' && o.titleText.trim()) out.titleText = o.titleText.trim().slice(0, 80);
  if (typeof o.rationale === 'string') out.rationale = o.rationale.slice(0, 400);
  if (typeof o.label === 'string') out.label = o.label.slice(0, 48);
  return out;
}

function buildPrompt(brief: BuildBrief, leads: string[], crew: string[], cat: BuildCatalog): string {
  const assets = brief.assets.map((a, i) => `${i}. ${a.name} (${a.type}${a.duration ? `, ${a.duration.toFixed(1)}s` : ''})`).join('\n');
  const who = leads.map(id => { const m = rosterMember(id); const gr = grammarFor(id)!; return `- ${id}: ${nameOf(id)}${m ? ` — ${m.ethos} Signature: ${m.signature.slice(0, 2).join('; ')}` : ''} Default grammar: ${JSON.stringify({ pace: gr.pace, move: gr.move, look: gr.look, effects: gr.effects, trans: gr.trans, title: gr.title })}`; }).join('\n');
  return `You are the Motion Council building edit OPTIONS in Fabula from the user's own assets. Each option is led by one member below and must feel like their hand. Answer ONLY JSON.
Assets:
${assets}
Ask: ${brief.ask}
Tempo ${brief.tempo || 120} BPM · ${brief.fps} fps${brief.aspect ? ` · ${brief.aspect}` : ''}
Leads (one option each, in this order):
${who}
Crew: ${crew.join(', ')}
You may adjust each lead's grammar ONLY with these values:
pace: beats per cut (0.5–16) or a pattern array; move: ${MOVES.join('|')}; title: ${TITLE_TYPES.join('|')}; trans: cut|${cat.transitions.join('|')}; look: none|${cat.looks.join('|')}; effects: up to 3 of ${cat.effects.join('|')}.
Return {"options":[{"leadId":"…","label":"short name","rationale":"why this option serves the ask, in the lead's voice, 1–2 sentences","titleText":"title text if the ask implies one","pace":…,"move":"…","look":"…","effects":["…"],"trans":"…","title":"…"}]}`;
}

/**
 * Ask the model to choose (within the catalogs), then assemble locally. Any failure → localBuildOptions.
 * `catalog` comes from the host (Fabula passes its FX/transition/look ids) so this module stays render-free.
 */
export async function planBuild(brief: BuildBrief, catalog: BuildCatalog): Promise<BuildOption[]> {
  const local = localBuildOptions(brief);
  if (!local.length) return local;
  const { leads, crew } = leadsFor(brief);
  try {
    const text = await callGemini(buildPrompt(brief, leads, crew, catalog), { temperature: 0.8 });
    const s = String(typeof text === 'string' ? text : (text as any)?.text ?? '');
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const o = JSON.parse(fence ? fence[1] : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    if (!Array.isArray(o.options) || !o.options.length) throw new Error('empty');
    return leads.map((id, i) => {
      const pick = o.options.find((x: any) => x?.leadId === id) || o.options[i];
      const opt = assembleOption(brief, id, rivalOf(id, crew), sanitizeOverrides(pick, catalog), i);
      return { ...opt, source: 'ai' as const };
    });
  } catch {
    return local;
  }
}

// ─────────────────────────────── recipe → Fabula clips ───────────────────────────────

export interface FabulaTracks { picture: string; overlay: string; music: string; sourceAudio: string; }
export interface FabulaBuildDeps {
  uid: () => string;
  /** createEffectInstance(effectId, presetId?, instanceId) from services/fabula/forgeEffects */
  mkEffect: (effectId: string, presetId: string | undefined, id: string) => any;
  /** createForgeTransition(id, presetId?, dur) from services/fabula/forgeTransitions */
  mkTransition: (id: string, presetId: string | undefined, dur: number) => any;
  /** returns instantiateLook(FORGE_LOOKS.find(id)) or [] */
  lookStack: (lookId: string) => any[];
}

/**
 * Turn a recipe into Fabula timeline clips at `at` seconds, binding slots to the given assets (visual list and
 * audio list, in order). Pure: the host commits the result once through applyClips (so a build is one undo step).
 */
export function recipeToFabulaClips(recipe: BuildRecipe, visuals: BuildAsset[], audios: BuildAsset[], at: number, tracks: FabulaTracks, deps: FabulaBuildDeps, buildId: string): any[] {
  const out: any[] = [];
  const linkFor = new Map<string, string>();
  for (const c of recipe.clips) {
    const start = r3(at + c.start);
    const base = { id: deps.uid(), start, duration: c.duration, srcIn: c.srcIn, label: c.label, councilBuild: buildId };
    if (c.role === 'picture') {
      const a = visuals[(c.slot ?? 0) % Math.max(1, visuals.length)];
      if (!a) continue;
      const stack = [
        ...(c.look ? deps.lookStack(c.look) : []),
        ...(c.effects || []).map(e => ({ ...deps.mkEffect(e.effectId, undefined, `${e.effectId}-${deps.uid()}`), mix: e.mix })),
      ];
      const fx: any = { ...(c.fx || {}), ...(c.kf && Object.keys(c.kf).length ? { kf: c.kf } : {}), ...(stack.length ? { stack } : {}) };
      const clip: any = { ...base, trackId: tracks.picture, kind: a.type === 'multicam' ? 'multicam' : 'media', assetId: a.id, fx };
      if (c.trans) clip.trans = deps.mkTransition(c.trans.forgeId, undefined, c.trans.dur);
      if (a.type === 'video' && recipe.clips.some(x => x.role === 'sourceAudio' && x.start === c.start)) {
        const linkId = deps.uid(); clip.linkId = linkId; clip.av = true; linkFor.set(`${c.start}`, linkId);
      }
      out.push(clip);
    } else if (c.role === 'sourceAudio') {
      const a = visuals[(c.slot ?? 0) % Math.max(1, visuals.length)];
      if (!a) continue;
      out.push({ ...base, trackId: tracks.sourceAudio, kind: 'media', assetId: a.id, linkId: linkFor.get(`${c.start}`) });
    } else if (c.role === 'music') {
      const a = audios[c.slot ?? 0];
      if (!a) continue;
      out.push({ ...base, trackId: tracks.music, kind: 'media', assetId: a.id });
    } else if (c.role === 'title' && c.title) {
      out.push({ ...base, trackId: tracks.overlay, kind: 'title', text: c.title.text, subtitle: c.title.subtitle || '', titleStyle: c.title.titleStyle, tAnim: c.title.tAnim, tx: c.title.tx, ty: c.title.ty, tSize: c.title.tSize, fx: c.fx || { blend: 'normal', fadeIn: 0, fadeOut: 0 } });
    }
  }
  return out;
}

/** Every effect / transition / look id a recipe uses — for validation against a host's catalogs. */
export function recipeIds(recipe: BuildRecipe) {
  const effects = new Set<string>(), transitions = new Set<string>(), looks = new Set<string>();
  for (const c of recipe.clips) {
    c.effects?.forEach(e => effects.add(e.effectId));
    if (c.trans) transitions.add(c.trans.forgeId);
    if (c.look) looks.add(c.look);
  }
  return { effects: [...effects], transitions: [...transitions], looks: [...looks] };
}

export type { RosterMember };
