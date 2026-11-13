// characterIntel — what the edit and the bins already know about each character.
//
// A character exists in a production long before anyone writes them a sheet: they're in clips on the
// timeline, in stills in the bins, speaking lines the cut already has. This module gathers that
// evidence per cast member and turns it into three things:
//
//   • a VOICE LOCK plan — the clean stretches of that character speaking, picked from the timeline, so
//     a voice can be locked from the performance that's already there and then reused on any voice
//     model. The lock is a model-independent record (samples + description + delivery range); each
//     provider's cloned voice id hangs off it.
//   • a CHARACTER SHEET plan — which views of the character the production has (and from which
//     assets), which it lacks, and a still ShotSpec to generate each missing view from the ones found.
//   • the RELATIONSHIP evidence — who shares scenes, who answers whom, how often — which is what the
//     Story Intelligence pass reasons over to infer relationships and motivations.
//
// Pure. Reads the production shape Fabula already saves (cast, mediaPool, acts) and the timeline clips.

import type { CutClip, GenRef, ShotSpec } from '../genAgent';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lc = (s: any) => String(s || '').toLowerCase();
const mentions = (text: string, name: string) => !!name && new RegExp(`\\b${esc(name)}\\b`, 'i').test(text || '');

export interface LookRef { assetId: string; name?: string; type: 'image' | 'video'; source: 'cast' | 'bin' | 'timeline'; /** Seconds into the asset to grab a frame from, for video. */ atSec?: number; locked?: boolean }
export interface VoiceSample { assetId: string; clipId?: string; srcIn: number; duration: number; line?: string; shotId?: string; source: 'timeline' | 'bin' }

export interface CharacterEvidence {
  castId: string;
  name: string;
  looks: LookRef[];
  voice: VoiceSample[];
  /** Scenes this character is in, by id. */
  sceneIds: string[];
  shotCount: number;
  lineCount: number;
  /** Seconds of picture in the cut attributed to them. */
  screenSec: number;
}

const mediaAssetId = (m: any): string | undefined => (typeof m === 'string' ? m : m?.assetId);

/** Gather everything the production holds about each cast member. */
export function gatherCharacterEvidence(prod: any, clips: CutClip[]): CharacterEvidence[] {
  const pool: any[] = prod?.mediaPool || [];
  const assetById = new Map<string, any>(pool.map((a) => [a.id, a]));
  const shotIndex = new Map<string, { shot: any; scene: any }>();
  for (const act of prod?.acts || []) for (const sc of act?.scenes || []) for (const sh of sc?.shots || []) shotIndex.set(sh.id, { shot: sh, scene: sc });
  const live = (clips || []).filter((c) => c && !c.disabled && c.assetId);

  return (prod?.cast || []).filter((c: any) => c?.name).map((member: any): CharacterEvidence => {
    const name: string = member.name;
    const looks: LookRef[] = [];
    const voice: VoiceSample[] = [];
    const seenLook = new Set<string>(), sceneIds = new Set<string>();
    const pushLook = (a: any, source: LookRef['source'], extra: Partial<LookRef> = {}) => {
      if (!a || (a.type !== 'image' && a.type !== 'video') || seenLook.has(a.id)) return;
      seenLook.add(a.id); looks.push({ assetId: a.id, name: a.name, type: a.type, source, ...extra });
    };

    // 1) What's already filed against the cast member.
    for (const m of member.media || []) {
      const a = assetById.get(mediaAssetId(m) || '');
      if (!a) continue;
      if (a.type === 'audio') voice.push({ assetId: a.id, srcIn: 0, duration: Number(a.duration) || 0, source: 'bin' });
      else pushLook(a, 'cast', { locked: typeof m === 'object' ? !!m.locked : false });
    }
    // 2) The bins: tagged to them, or named for them.
    for (const a of pool) {
      const tagged = a.castId === member.id || (a.tags || []).some((t: string) => lc(t) === lc(name)) || mentions(a.name || '', name);
      if (!tagged) continue;
      if (a.type === 'audio') { if (!voice.some((v) => v.assetId === a.id)) voice.push({ assetId: a.id, srcIn: 0, duration: Number(a.duration) || 0, source: 'bin' }); }
      else pushLook(a, 'bin');
    }
    // 3) The cut: clips whose shot is theirs.
    let shotCount = 0, lineCount = 0, screenSec = 0;
    for (const c of live) {
      const hit = c.shotId ? shotIndex.get(c.shotId) : undefined;
      if (!hit) continue;
      const speaks = lc(hit.shot.character) === lc(name);
      const inShot = speaks || mentions(`${hit.shot.subject || ''} ${hit.shot.type || ''}`, name);
      if (!inShot) continue;
      const a = assetById.get(c.assetId as string);
      const picture = !String(c.trackId || '').startsWith('a');
      if (picture) {
        sceneIds.add(hit.scene.id); shotCount++; screenSec += Number(c.duration) || 0;
        // Mid-clip is the safest frame: past the cut-in, before the cut-out.
        pushLook(a, 'timeline', { atSec: (Number(c.srcIn) || 0) + (Number(c.duration) || 0) / 2 });
      }
      const line = (hit.shot.lines || '').trim();
      if (speaks && line && a && (a.type === 'video' || a.type === 'audio')) {
        lineCount++;
        // Prefer the dedicated voice clip over the picture clip's sync sound for the same shot.
        const dupe = voice.findIndex((v) => v.shotId === c.shotId);
        const sample: VoiceSample = { assetId: a.id, clipId: c.id, srcIn: Number(c.srcIn) || 0, duration: Number(c.duration) || 0, line, shotId: c.shotId, source: 'timeline' };
        if (dupe < 0) voice.push(sample);
        else if (!picture) voice[dupe] = sample;
      }
    }
    // Scenes they're written into even where nothing is cut yet.
    for (const act of prod?.acts || []) for (const sc of act?.scenes || []) {
      if ((sc.bible?.characters || []).some((x: any) => lc(x?.name) === lc(name))) sceneIds.add(sc.id);
    }
    return { castId: member.id, name, looks, voice, sceneIds: [...sceneIds], shotCount, lineCount, screenSec: Math.round(screenSec * 10) / 10 };
  });
}

// ── voice lock ──────────────────────────────────────────────────────────────────

export type VoiceLockReadiness = 'ready' | 'thin' | 'insufficient';

export interface VoiceLock {
  castId: string;
  name: string;
  samples: VoiceSample[];
  totalSec: number;
  readiness: VoiceLockReadiness;
  /** Text description of the voice — travels to models that design a voice from words. */
  profile: string;
  /** The performer agreed to this voice being cloned. A lock is not usable until this is true. */
  consent: boolean;
  /** Cloned voice ids, per provider, once created. The lock itself is provider-independent. */
  providerVoices: Record<string, string>;
  notes: string[];
}

export const VOICE_LOCK_MIN_SEC = 10;
export const VOICE_LOCK_GOOD_SEC = 30;
const VOICE_LOCK_MAX_SEC = 120;

/** Choose the samples a voice lock should be built from: longest clean stretches first, spread across
 *  different source clips so the lock hears range and not one mood, capped at two minutes. */
export function planVoiceLock(ev: CharacterEvidence, member?: any): VoiceLock {
  const usable = ev.voice.filter((v) => v.duration >= 1.5).sort((a, b) => b.duration - a.duration);
  const samples: VoiceSample[] = [];
  const perAsset = new Map<string, number>();
  let totalSec = 0;
  // Two passes: first one sample per source for spread, then fill.
  for (const pass of [1, 4]) {
    for (const v of usable) {
      if (totalSec >= VOICE_LOCK_MAX_SEC) break;
      if (samples.includes(v) || (perAsset.get(v.assetId) || 0) >= pass) continue;
      samples.push(v); perAsset.set(v.assetId, (perAsset.get(v.assetId) || 0) + 1); totalSec += v.duration;
    }
  }
  totalSec = Math.round(totalSec * 10) / 10;
  const readiness: VoiceLockReadiness = totalSec >= VOICE_LOCK_GOOD_SEC ? 'ready' : totalSec >= VOICE_LOCK_MIN_SEC ? 'thin' : 'insufficient';
  const notes: string[] = [];
  if (readiness === 'insufficient') notes.push(`${totalSec}s of ${ev.name} speaking found — a lock needs at least ${VOICE_LOCK_MIN_SEC}s. Tag more dialogue clips to this character, or record a reference.`);
  if (readiness === 'thin') notes.push(`${totalSec}s found — usable, but ${VOICE_LOCK_GOOD_SEC}s or more gives a steadier voice.`);
  if (samples.some((s) => s.source === 'timeline')) notes.push('Timeline samples include whatever else is on the clip — isolate dialogue (stem separation) before cloning.');
  return {
    castId: ev.castId, name: ev.name, samples, totalSec, readiness,
    profile: member?.voice || member?.voice_profile || '',
    consent: false, providerVoices: {}, notes,
  };
}

// ── character sheet ─────────────────────────────────────────────────────────────

export const SHEET_VIEWS = [
  { id: 'front', label: 'Front', ask: 'front view, eye level, neutral expression, even soft light' },
  { id: 'three_quarter', label: 'Three-quarter', ask: 'three-quarter view, eye level, neutral expression' },
  { id: 'profile', label: 'Profile', ask: 'strict side profile, eye level' },
  { id: 'full_body', label: 'Full body', ask: 'full body standing, head to toe in frame, full wardrobe visible' },
  { id: 'expressions', label: 'Expression range', ask: 'expression sheet: joy, anger, fear, grief — same face, same framing' },
  { id: 'wardrobe', label: 'Wardrobe detail', ask: 'wardrobe detail: fabric, colour and defining accessories' },
] as const;
export type SheetViewId = typeof SHEET_VIEWS[number]['id'];

export interface CharacterSheetPlan {
  castId: string;
  name: string;
  /** References the sheet can be built from, best first. */
  refs: LookRef[];
  /** Views the production already has, by the filmmaker's own filing (cast.sheet[viewId] = assetId). */
  have: Partial<Record<SheetViewId, string>>;
  missing: SheetViewId[];
  /** One still spec per missing view, carrying the look lock and the found refs. */
  requests: { view: SheetViewId; spec: ShotSpec }[];
  notes: string[];
}

/** Plan a character sheet from what the clips and bins hold. Locked cast references outrank bin
 *  assets, which outrank frames pulled from the cut. */
export function planCharacterSheet(ev: CharacterEvidence, member: any, opts: { aspect?: string } = {}): CharacterSheetPlan {
  const rank = (l: LookRef) => (l.locked ? 0 : l.source === 'cast' ? 1 : l.source === 'bin' ? 2 : 3) + (l.type === 'image' ? 0 : 0.5);
  const refs = [...ev.looks].sort((a, b) => rank(a) - rank(b));
  const have: Partial<Record<SheetViewId, string>> = { ...(member?.sheet || {}) };
  const missing = SHEET_VIEWS.map((v) => v.id).filter((id) => !have[id]);
  const lock: string = member?.looks || member?.visual_lock || '';
  const notes: string[] = [];
  if (!refs.length && !lock) notes.push(`Nothing shows ${ev.name} yet — no tagged media, no clips in the cut, no written look. Tag a clip or describe them first.`);
  else if (!refs.length) notes.push(`No picture of ${ev.name} found — the sheet will be generated from the written look alone, so expect to pick between variations.`);
  if (refs.length && !lock) notes.push(`${ev.name} has reference picture but no written look — have Story Intelligence describe them from the references so text-only models hold the identity too.`);

  // Stills first as references; a video ref contributes the frame at `atSec`.
  const refPack: GenRef[] = refs.slice(0, 4).map((r) => ({ role: 'character', assetId: r.assetId, name: `${ev.name} ref`, lock: lock || undefined }));
  const requests = missing.map((view) => {
    const v = SHEET_VIEWS.find((x) => x.id === view)!;
    return {
      view,
      spec: {
        prompt: `Character sheet — ${ev.name}, ${v.ask}. Plain neutral backdrop, no props, consistent with every other view.${lock ? ` ${lock}` : ''}`,
        refs: refPack.length ? refPack : (lock ? [{ role: 'character', name: ev.name, lock } as GenRef] : []),
        aspect: opts.aspect || (view === 'full_body' ? '2:3' : '1:1'),
        slug: `${ev.name} · ${v.label}`,
      } as ShotSpec,
    };
  });
  return { castId: ev.castId, name: ev.name, refs, have, missing, requests, notes };
}

// ── relationship evidence ───────────────────────────────────────────────────────

export interface RelationshipEdge {
  a: string; b: string;
  sharedScenes: number;
  /** Times one speaks directly after the other — a rough count of exchanges. */
  exchanges: number;
  sceneTitles: string[];
}

/** Who shares scenes and who trades lines, from the script as broken down. This is evidence, not a
 *  conclusion — the Story Intelligence pass reads it alongside the scenes to say what the relationship
 *  IS. Edges come back strongest first. */
export function relationshipEvidence(prod: any): RelationshipEdge[] {
  const names: string[] = (prod?.cast || []).map((c: any) => c?.name).filter(Boolean);
  const canon = (n: string) => names.find((x) => lc(x) === lc(n));
  const edges = new Map<string, RelationshipEdge>();
  const edge = (x: string, y: string) => {
    const [a, b] = [x, y].sort();
    const k = `${a}\u0000${b}`;
    if (!edges.has(k)) edges.set(k, { a, b, sharedScenes: 0, exchanges: 0, sceneTitles: [] });
    return edges.get(k)!;
  };
  for (const act of prod?.acts || []) for (const sc of act?.scenes || []) {
    const present = new Set<string>();
    for (const c of sc.bible?.characters || []) { const n = canon(c?.name || ''); if (n) present.add(n); }
    let prevSpeaker: string | undefined;
    for (const sh of sc.shots || []) {
      const sp = canon(sh.character || '');
      if (sp) present.add(sp);
      for (const n of names) if (mentions(sh.subject || '', n)) present.add(n);
      if (sp && (sh.lines || '').trim()) {
        if (prevSpeaker && prevSpeaker !== sp) edge(prevSpeaker, sp).exchanges++;
        prevSpeaker = sp;
      }
    }
    const list = [...present];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const e = edge(list[i], list[j]);
      e.sharedScenes++;
      if (e.sceneTitles.length < 6) e.sceneTitles.push(sc.slugline || sc.title || 'Scene');
    }
  }
  return [...edges.values()].sort((x, y) => (y.sharedScenes * 2 + y.exchanges) - (x.sharedScenes * 2 + x.exchanges));
}
