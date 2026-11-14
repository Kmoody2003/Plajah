// coverage — the script against the cut.
//
// A production holds two versions of the film: the one that was WRITTEN (acts → scenes → SLATE shots)
// and the one that EXISTS (clips on the timeline, media in the bins). This module lines them up and
// says, shot by shot, which is which:
//
//   shot         real picture is cut in for this shot
//   boarded      a still stands in for it (a storyboard frame or a generated plate)
//   placeholder  the timeline has a slot for it, but nothing in the slot
//   missing      the script has it and the cut doesn't know it exists
//
// plus the two holes that sit above shot level — a scene that has script but was never broken into
// shots, and a scene that is only a title — and the reverse case: picture in the cut that no part of
// the script accounts for.
//
// From the gaps it builds a storyboard plan: one still ShotSpec per uncovered shot, carrying the scene
// bible's identity locks, so the hole can be boarded (or generated outright) through the same
// generation panel as everything else and land back in the slot it belongs to.
//
// Pure: takes the production's acts, the timeline clips and the media pool; touches nothing.

import type { CutClip, GenRef, ShotSpec } from '../genAgent';
import { DEFAULT_BOARD_STYLE, type ShotDirection } from './promptCompiler';

export type ShotCoverage = 'shot' | 'boarded' | 'placeholder' | 'missing';

export interface ShotCoverageRow {
  shotId: string;
  slug?: string;
  type?: string;
  status: ShotCoverage;
  /** Timeline clips standing for this shot (enabled picture clips only). */
  clipIds: string[];
  /** Pool assets tied to this shot that aren't in the cut — takes sitting unused in a bin. */
  unusedAssetIds: string[];
  hasPrompt: boolean;
}

export type SceneState = 'covered' | 'partial' | 'uncovered' | 'unbroken' | 'unwritten';

export interface SceneCoverage {
  actId?: string;
  sceneId: string;
  title: string;
  state: SceneState;
  shots: ShotCoverageRow[];
  counts: Record<ShotCoverage, number>;
}

export interface CoverageMap {
  scenes: SceneCoverage[];
  totals: Record<ShotCoverage, number> & { shots: number; scenes: number };
  /** 0 … 1 — share of scripted shots with picture (real or boarded) in the cut. */
  coveredRatio: number;
  /** Picture in the cut that traces back to no scripted shot. */
  unscriptedClipIds: string[];
  /** Scenes with script but no shot list, and scenes with neither. */
  unbrokenSceneIds: string[];
  unwrittenSceneIds: string[];
}

const isPicture = (c: CutClip) => !String(c.trackId || '').startsWith('a');
const isOverlay = (c: CutClip) => ['fx', 'caption', 'subtitle', 'title'].includes(String(c.kind || ''));
const zero = (): Record<ShotCoverage, number> => ({ shot: 0, boarded: 0, placeholder: 0, missing: 0 });

/** Line the script up against the cut. `acts` is the production's acts (each with scenes, each with
 *  SLATE shots); `clips` the active timeline; `pool` the media pool. */
export function mapCoverage(acts: any[], clips: CutClip[], pool: any[] = []): CoverageMap {
  const assetById = new Map<string, any>((pool || []).map((a) => [a.id, a]));
  const picture = (clips || []).filter((c) => c && !c.disabled && isPicture(c) && !isOverlay(c));
  const byShot = new Map<string, CutClip[]>();
  for (const c of picture) if (c.shotId) byShot.set(c.shotId, [...(byShot.get(c.shotId) || []), c]);
  const usedAssets = new Set(picture.map((c) => c.assetId).filter(Boolean));

  const scenes: SceneCoverage[] = [];
  const totals = { ...zero(), shots: 0, scenes: 0 };
  const scripted = new Set<string>();
  const unbrokenSceneIds: string[] = [], unwrittenSceneIds: string[] = [];

  for (const act of acts || []) {
    for (const sc of act?.scenes || []) {
      const counts = zero();
      const rows: ShotCoverageRow[] = (sc.shots || []).map((shot: any) => {
        scripted.add(shot.id);
        const cs = byShot.get(shot.id) || [];
        const media = cs.filter((c) => c.kind !== 'script' && c.assetId);
        const moving = media.some((c) => assetById.get(c.assetId as string)?.type !== 'image');
        const status: ShotCoverage = media.length ? (moving ? 'shot' : 'boarded') : cs.length ? 'placeholder' : 'missing';
        counts[status]++; totals[status]++; totals.shots++;
        return {
          shotId: shot.id, slug: shot.slug, type: shot.type, status,
          clipIds: cs.map((c) => c.id),
          unusedAssetIds: (pool || []).filter((a) => a.shotId === shot.id && !usedAssets.has(a.id)).map((a) => a.id),
          hasPrompt: !!(shot.still || '').trim(),
        };
      });
      const have = counts.shot + counts.boarded;
      const hasScript = !!(sc.script || '').trim();
      const state: SceneState = !rows.length ? (hasScript ? 'unbroken' : 'unwritten')
        : have === rows.length ? 'covered' : have === 0 ? 'uncovered' : 'partial';
      if (state === 'unbroken') unbrokenSceneIds.push(sc.id);
      if (state === 'unwritten') unwrittenSceneIds.push(sc.id);
      totals.scenes++;
      scenes.push({ actId: act.id, sceneId: sc.id, title: sc.slugline || sc.title || 'Scene', state, shots: rows, counts });
    }
  }

  return {
    scenes, totals,
    coveredRatio: totals.shots ? (totals.shot + totals.boarded) / totals.shots : 0,
    unscriptedClipIds: picture.filter((c) => c.kind !== 'script' && c.assetId && (!c.shotId || !scripted.has(c.shotId))).map((c) => c.id),
    unbrokenSceneIds, unwrittenSceneIds,
  };
}

export interface BoardRequest {
  actId?: string;
  sceneId: string;
  sceneTitle: string;
  shotId: string;
  slug?: string;
  status: ShotCoverage;
  spec: ShotSpec;
}

/** A plain description of a shot, for when SLATE hasn't written its still prompt yet. Enough to board
 *  from: framing, who and what, the camera, and the environment it sits in. */
export function describeShot(shot: any, scene: any): string {
  const bible = scene?.bible || {};
  return [
    shot?.type && `${shot.type}.`,
    shot?.subject && `${shot.subject}.`,
    shot?.lines && (shot?.character ? `${shot.character} speaks.` : `${shot.lines}.`),
    shot?.camera && `Camera: ${shot.camera}.`,
    bible.environment_lock,
    bible.lighting_plan && `Light: ${bible.lighting_plan}.`,
  ].filter(Boolean).join(' ');
}

/** One still spec per shot the cut is missing picture for, in story order. `directionFor` lets the
 *  caller attach performance + continuity so a board carries the same direction the final shot will. */
export function planStoryboards(
  coverage: CoverageMap,
  acts: any[],
  opts: { aspect?: string; boardStyle?: string; include?: ShotCoverage[]; directionFor?: (scene: any, shot: any) => ShotDirection | undefined;
    /** References for a shot (see characterIntel.shotRefs). Defaults to every bible lock, text only. */
    refsFor?: (scene: any, shot: any) => GenRef[] } = {},
): BoardRequest[] {
  const include = opts.include || ['missing', 'placeholder'];
  const sceneById = new Map<string, any>();
  for (const act of acts || []) for (const sc of act?.scenes || []) sceneById.set(sc.id, sc);

  const out: BoardRequest[] = [];
  for (const sc of coverage.scenes) {
    const scene = sceneById.get(sc.sceneId);
    if (!scene) continue;
    for (const row of sc.shots) {
      if (!include.includes(row.status)) continue;
      const shot = (scene.shots || []).find((s: any) => s.id === row.shotId);
      if (!shot) continue;
      let refs: GenRef[] = [];
      if (opts.refsFor) refs = opts.refsFor(scene, shot);
      else {
        for (const c of scene.bible?.characters || []) {
          if (c?.visual_lock) refs.push({ role: 'character', name: c.name, lock: c.visual_lock, worldEntityId: c.id });
        }
        if (scene.bible?.environment_lock) refs.push({ role: 'location', name: 'ENVIRONMENT', lock: scene.bible.environment_lock });
      }
      const direction: ShotDirection = { ...(opts.directionFor?.(scene, shot) || {}), boardStyle: opts.boardStyle || DEFAULT_BOARD_STYLE };
      out.push({
        actId: sc.actId, sceneId: sc.sceneId, sceneTitle: sc.title, shotId: shot.id, slug: shot.slug, status: row.status,
        spec: {
          prompt: (shot.still || '').trim() || describeShot(shot, scene),
          refs, aspect: opts.aspect, sceneId: sc.sceneId, shotId: shot.id, slug: shot.slug, direction,
        },
      });
    }
  }
  return out;
}

/** Give every shot the script has but the cut doesn't a placeholder slot, so generated boards have
 *  somewhere to land. Slots are appended after the last clip on V1 in story order — nothing already in
 *  the cut is moved. `seconds` estimates a shot's length (Fabula's pacing engine). */
export function addPlaceholdersForMissing(
  clips: CutClip[],
  coverage: CoverageMap,
  acts: any[],
  mkId: () => string,
  seconds: (shot: any, scene: any) => number = () => 3,
): { clips: CutClip[]; added: number } {
  const sceneById = new Map<string, any>();
  for (const act of acts || []) for (const sc of act?.scenes || []) sceneById.set(sc.id, sc);
  let cursor = (clips || []).filter((c) => c.trackId === 'v1').reduce((end, c) => Math.max(end, (Number(c.start) || 0) + (Number(c.duration) || 0)), 0);
  const next = [...(clips || [])];
  let added = 0;
  for (const sc of coverage.scenes) {
    const scene = sceneById.get(sc.sceneId);
    for (const row of sc.shots) {
      if (row.status !== 'missing') continue;
      const shot = (scene?.shots || []).find((s: any) => s.id === row.shotId);
      if (!shot) continue;
      const duration = Math.max(0.5, Math.round(seconds(shot, scene) * 10) / 10);
      next.push({ id: mkId(), trackId: 'v1', start: Math.round(cursor * 10) / 10, duration, kind: 'script', shotId: shot.id, label: `${shot.slug || 'SHOT'} · ${shot.type || ''}`.trim() });
      cursor += duration; added++;
    }
  }
  return { clips: added ? next : clips, added };
}

// ── laying a suggestion into the cut ────────────────────────────────────────────

export interface PlacedSuggestion {
  clips: CutClip[];
  /** alternate: laid over a shot that already had picture (previous take muted). filled: took an empty
   *  slot. appended: added at the end of V1 for the editor to place. none: nothing could be placed. */
  how: 'alternate' | 'filled' | 'appended' | 'none';
  count: number;
  shotId?: string;
}

/** Put a bin suggestion's clips where they belong. An alternate take or an insert that names a shot
 *  goes into that shot's slot — never deleting what was there. Anything else (a rebuild, an unscripted
 *  beat, an insert with no home) is appended after the last clip on V1 in the suggested order, so the
 *  cut as it stands is untouched and the editor decides where it lives. */
export function placeSuggestionInCut(
  clips: CutClip[],
  suggestion: { kind: string; sceneId?: string; shotSlug?: string; assetIds: string[] },
  acts: any[],
  pool: any[],
  mkId: () => string,
): PlacedSuggestion {
  const assets = suggestion.assetIds.map((id) => (pool || []).find((a) => a.id === id)).filter(Boolean);
  if (!assets.length) return { clips, how: 'none', count: 0 };

  let shot: any;
  for (const act of acts || []) for (const sc of act?.scenes || []) {
    if (suggestion.sceneId && sc.id !== suggestion.sceneId) continue;
    const hit = suggestion.shotSlug && (sc.shots || []).find((s: any) => String(s.slug).toLowerCase() === String(suggestion.shotSlug).toLowerCase());
    if (hit && !shot) shot = hit;
  }

  if (shot && (suggestion.kind === 'alternate_take' || suggestion.kind === 'insert')) {
    const live = (clips || []).filter((c) => c.shotId === shot.id && !String(c.trackId || '').startsWith('a'));
    if (live.length) {
      const next: CutClip[] = [];
      let filled = 0, alternates = 0;
      for (const c of clips) {
        const mine = c.shotId === shot.id && !String(c.trackId || '').startsWith('a');
        if (!mine) { next.push(c); continue; }
        if (c.kind === 'script') { next.push({ ...c, kind: 'media', assetId: assets[0].id, srcIn: 0, label: assets[0].name || c.label }); filled++; }
        else if (!c.disabled) {
          next.push({ ...c, disabled: true });
          next.push({ id: mkId(), trackId: c.trackId, start: c.start, duration: c.duration, srcIn: 0, kind: 'media', assetId: assets[0].id, label: assets[0].name || c.label, shotId: shot.id });
          alternates++;
        } else next.push(c);
      }
      if (filled || alternates) return { clips: next, how: filled ? 'filled' : 'alternate', count: filled + alternates, shotId: shot.id };
    }
  }

  let cursor = (clips || []).filter((c) => c.trackId === 'v1').reduce((end, c) => Math.max(end, (Number(c.start) || 0) + (Number(c.duration) || 0)), 0);
  const next = [...(clips || [])];
  for (const a of assets) {
    const duration = Math.max(0.5, Math.round((Number(a.duration) || 3) * 10) / 10);
    next.push({ id: mkId(), trackId: 'v1', start: Math.round(cursor * 10) / 10, duration, srcIn: 0, kind: 'media', assetId: a.id, label: a.name, ...(shot ? { shotId: shot.id } : {}) });
    cursor += duration;
  }
  return { clips: next, how: 'appended', count: assets.length, shotId: shot?.id };
}
