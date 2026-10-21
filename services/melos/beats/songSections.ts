// Melos Beats — MEKA's song structure (Maschine Ideas → Song; MPC sequences → song).
//
//   Group    — a bank of 16 pads. Each Group has its own patterns (Pattern.groupIdx; untagged
//              legacy patterns count as Group A).
//   Scene    — one pattern per Group, launched together.
//   Section  — a scene for N bars. The ordered sections ARE the song.
//
// syncSongFromSections() turns the sections into the Timeline: one managed pattern track per
// Group (`track.songGroup`), one clip per section (`clip.sectionId`) playing that Group's pattern
// for the section — so arranging scenes in MEKA (or dragging sections on the Timeline's arranger
// lane) auto-populates the arrangement, and the scheduler plays it like any other pattern clip.
// Clips a user adds to a managed track by hand are left alone; only section clips are rewritten.

import {
  BANK_LETTERS, PAD_BANK, bankCount, defaultPattern, grooveUid,
  type ArrangeTrack, type GrooveDoc, type Pattern, type Scene, type SongSection,
} from './grooveDoc';
import { songTime } from './tempoMap';

export const SCENE_COLORS = ['#B84DFF', '#00DAF3', '#FF8C00', '#06D6A0', '#FF4D8D', '#FFD166', '#5B8CFF', '#F78C6C'];

/** The Group a pattern belongs to (legacy untagged patterns → Group A). */
export const patternGroup = (p: Pattern) => p.groupIdx ?? 0;
/** The Group a pad sits in. */
export const padGroup = (padIdx: number) => Math.floor(padIdx / PAD_BANK);
export const groupLetter = (g: number) => BANK_LETTERS[g] ?? String(g + 1);

/** Patterns of one Group, in doc order. */
export function groupPatterns(doc: GrooveDoc, g: number): Pattern[] {
  return doc.patterns.filter((p) => patternGroup(p) === g);
}

/** Groups that have at least one pattern (always includes A). */
export function groupsWithPatterns(doc: GrooveDoc): number[] {
  const set = new Set<number>([0]);
  for (const p of doc.patterns) set.add(patternGroup(p));
  for (let g = 0; g < bankCount(doc.kit); g++) if (groupPatterns(doc, g).length) set.add(g);
  return [...set].sort((a, b) => a - b);
}

/** A Group's colour: its first sounding pad's colour, else a palette colour. */
export function groupColor(doc: GrooveDoc, g: number): string {
  const pad = doc.kit.slice(g * PAD_BANK, (g + 1) * PAD_BANK).find((p) => !p.empty);
  return pad?.color ?? SCENE_COLORS[g % SCENE_COLORS.length];
}

/** A new empty pattern for a Group, named "<Group> n". */
export function newGroupPattern(doc: GrooveDoc, g: number): Pattern {
  const n = groupPatterns(doc, g).length + 1;
  const p = defaultPattern(`${groupLetter(g)}${n}`);
  p.id = grooveUid() + grooveUid();
  p.groupIdx = g;
  doc.patterns.push(p);
  return p;
}

/**
 * Pattern-mode "Ideas": which pattern each Group plays. `choice` is the user's per-Group pick;
 * Groups without a pick fall back to their first pattern. Returns pattern ids, one per Group.
 */
export function ideasSet(doc: GrooveDoc, choice: Record<number, string | undefined>): string[] {
  const out: string[] = [];
  for (const g of groupsWithPatterns(doc)) {
    const list = groupPatterns(doc, g);
    if (!list.length) continue;
    const picked = choice[g] && list.find((p) => p.id === choice[g]);
    out.push((picked || list[0]).id);
  }
  return out;
}

// ── scenes ──────────────────────────────────────────────────────────────────

/** Scene slots for the current per-Group choice. */
export function slotsFromChoice(doc: GrooveDoc, choice: Record<number, string | undefined>): Record<number, string | null> {
  const slots: Record<number, string | null> = {};
  for (const id of ideasSet(doc, choice)) {
    const p = doc.patterns.find((x) => x.id === id);
    if (p) slots[patternGroup(p)] = p.id;
  }
  return slots;
}

/** Capture the current per-Group choice as a new scene. */
export function addScene(doc: GrooveDoc, choice: Record<number, string | undefined>, name?: string): Scene {
  const scenes = (doc.scenes ??= []);
  const slots = slotsFromChoice(doc, choice);
  const scene: Scene = { id: grooveUid() + grooveUid(), name: name ?? `Scene ${scenes.length + 1}`, color: SCENE_COLORS[scenes.length % SCENE_COLORS.length], slots };
  scenes.push(scene);
  return scene;
}

/** Pattern ids a scene plays (silent Groups omitted). */
export function scenePatternIds(doc: GrooveDoc, scene: Scene): string[] {
  return Object.values(scene.slots).filter((id): id is string => !!id && doc.patterns.some((p) => p.id === id));
}

export function deleteScene(doc: GrooveDoc, sceneId: string): void {
  doc.scenes = (doc.scenes ?? []).filter((s) => s.id !== sceneId);
  doc.sections = (doc.sections ?? []).filter((s) => s.sceneId !== sceneId);
  if (!doc.scenes.length) delete doc.scenes;
  syncSongFromSections(doc);
}

/** When a pattern is deleted, scenes forget it (the Group goes silent in those scenes). */
export function forgetPattern(doc: GrooveDoc, patternId: string): void {
  for (const s of doc.scenes ?? []) for (const k of Object.keys(s.slots)) if (s.slots[Number(k)] === patternId) s.slots[Number(k)] = null;
}

// ── sections (the song) ─────────────────────────────────────────────────────

/** Bars a scene naturally spans: its longest pattern (16 steps = one 4/4 bar), min 1. */
export function sceneNaturalBars(doc: GrooveDoc, scene: Scene): number {
  const lens = scenePatternIds(doc, scene).map((id) => doc.patterns.find((p) => p.id === id)!.length);
  return Math.max(1, Math.ceil(Math.max(16, ...lens) / 16));
}

export function addSection(doc: GrooveDoc, sceneId: string, bars?: number, at?: number): SongSection {
  const scene = doc.scenes?.find((s) => s.id === sceneId);
  const sec: SongSection = { id: grooveUid() + grooveUid(), sceneId, bars: Math.max(1, Math.round(bars ?? (scene ? sceneNaturalBars(doc, scene) : 1))) };
  const list = (doc.sections ??= []);
  list.splice(at === undefined ? list.length : Math.max(0, Math.min(list.length, at)), 0, sec);
  syncSongFromSections(doc);
  return sec;
}

export function moveSection(doc: GrooveDoc, from: number, to: number): void {
  const list = doc.sections ?? [];
  if (from < 0 || from >= list.length) return;
  const [s] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, s);
  syncSongFromSections(doc);
}

export function removeSection(doc: GrooveDoc, sectionId: string): void {
  doc.sections = (doc.sections ?? []).filter((s) => s.id !== sectionId);
  syncSongFromSections(doc);
}

/** Section positions on the song timeline (beats), via the meter map. */
export function sectionSpans(doc: GrooveDoc): { section: SongSection; startBeats: number; lengthBeats: number; startBar: number }[] {
  const { meter } = songTime(doc);
  let bar = 0;
  return (doc.sections ?? []).map((section) => {
    const startBeats = meter.barToBeat(bar);
    const endBeats = meter.barToBeat(bar + section.bars);
    const out = { section, startBeats, lengthBeats: endBeats - startBeats, startBar: bar };
    bar += section.bars;
    return out;
  });
}

/** Which section index sits under a song beat (or the insertion index at the end). */
export function sectionIndexAt(doc: GrooveDoc, beat: number): number {
  const spans = sectionSpans(doc);
  for (let i = 0; i < spans.length; i++) if (beat < spans[i].startBeats + spans[i].lengthBeats / 2) return i;
  return spans.length;
}

/**
 * Rewrite the managed Group tracks from the sections. Idempotent; safe to call after any edit.
 * The first time a song is built, a default untouched "Grooves" track (one clip at bar 1) is
 * adopted as Group A's track instead of being left to double the drums.
 */
export function syncSongFromSections(doc: GrooveDoc): void {
  const sections = doc.sections ?? [];
  const scenes = new Map((doc.scenes ?? []).map((s) => [s.id, s]));
  // Groups the song uses.
  const used = new Set<number>();
  for (const sec of sections) {
    const sc = scenes.get(sec.sceneId);
    if (!sc) continue;
    for (const [g, pid] of Object.entries(sc.slots)) if (pid) used.add(Number(g));
  }
  const managed = () => doc.arrangement.filter((t) => t.songGroup !== undefined);
  if (sections.length && !managed().length) adoptDefaultTrack(doc);

  // Create / keep a track per used Group.
  for (const g of [...used].sort((a, b) => a - b)) {
    if (doc.arrangement.some((t) => t.songGroup === g)) continue;
    const track: ArrangeTrack = {
      id: grooveUid(), kind: 'pattern', name: `Group ${groupLetter(g)}`, color: groupColor(doc, g),
      mute: false, solo: false, gainDb: 0, pan: 0, clips: [], songGroup: g,
    };
    // Group tracks sit together, in Group order, ahead of other tracks.
    const after = doc.arrangement.reduce((idx, t, i) => (t.songGroup !== undefined && t.songGroup < g ? i + 1 : idx), 0);
    doc.arrangement.splice(after, 0, track);
  }

  // Rewrite section clips.
  const spans = sectionSpans(doc);
  for (const track of managed()) {
    track.clips = track.clips.filter((c) => !c.sectionId);
    const g = track.songGroup!;
    for (const span of spans) {
      const pid = scenes.get(span.section.sceneId)?.slots[g];
      if (!pid || !doc.patterns.some((p) => p.id === pid)) continue;
      track.clips.push({ id: `${span.section.id}:${g}`, startBeats: span.startBeats, lengthBeats: span.lengthBeats, patternId: pid, sectionId: span.section.id });
    }
    track.clips.sort((a, b) => a.startBeats - b.startBeats);
  }
  // Managed tracks for Groups the song no longer uses: drop them if nothing hand-made remains.
  doc.arrangement = doc.arrangement.filter((t) => t.songGroup === undefined || used.has(t.songGroup) || t.clips.length > 0);
}

function adoptDefaultTrack(doc: GrooveDoc): void {
  const t = doc.arrangement.find((x) => x.kind === 'pattern' && !x.foreign && !x.isFolder && x.songGroup === undefined);
  if (!t || t.name !== 'Grooves' || t.clips.length > 1) return;
  const c = t.clips[0];
  if (c && (c.startBeats !== 0 || c.lengthBeats > 4.0001 || c.contentOffsetBeats)) return;
  t.clips = [];
  t.songGroup = 0;
  t.name = `Group ${groupLetter(0)}`;
}
