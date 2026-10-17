/**
 * storyIntelBridge — Phase 2 Creator Workflows for Taleo Story Intelligence.
 *
 * Bridges a completed Reverse Screenplay (`StoryReport`) into:
 *   1. A full **Fabula Studio Production** (`studio:prod:${prodId}`) with a
 *      **Clip-Linked Timecode Script** timeline (`edits[0].timeline.clips`)
 *      where every scene, shot, and dialogue line is bound to its timeline
 *      clip's `(start, srcIn, duration)`. When a creator trims, splits, or
 *      re-orders clips on the timeline, the screenplay dynamically re-flows
 *      and re-times to follow the edit.
 *   2. **Plajah World & Cross-Movie Universe Resolution** (`ip_worlds`,
 *      `world_characters`, `world_lore`), automatically populating characters,
 *      locations, and MacGuffins, detecting when two or more of a creator's
 *      films belong to the same cinematic universe, merging shared character
 *      identities across films, and stamping `worldId` + `characterIds` onto
 *      the Album/Video docs for `TaleoUniverseBrowser`.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { saveProjectCloud } from './fabulaProjects';
import {
  transliterateActionToComicCaption,
  splitSpokenLineIntoComicClauses,
  selectEditorialPageLayout,
  type PageLayoutArchetype,
} from './council/comicMangaCouncil';
import {
  buildFountainFromStoryReport,
  stillUrl,
  type StoryReport,
  type StoryReportCharacter,
  type StoryReportShot,
} from './storyIntelService';
import {
  upsertEntities,
  detectDuplicates,
  mergeEntries,
  publishSource,
  type IncomingCharacter,
  type IncomingLore,
  type SyncSource,
} from './worldHub';
import {
  addAssetToWorld,
  addCharactersToWorld,
  createIPWorld,
  fetchUserWorlds,
  fetchWorldCharacters,
  fetchWorldLore,
  updateCharacter,
  updateIPWorld,
} from './backendService';
import type { Character, IPWorld } from '../types';

const INDEX_KEY = 'studio:index';
const HANDOFF_KEY = 'studio:handoff';
const prodKey = (id: string) => `studio:prod:${id}`;

const PLATFORM_ARCHITECT_EMAILS = new Set(['kmoody2003@gmail.com']);

/**
 * Creator-Exclusivity & Platform-Architect Gate:
 * Story Intelligence reverse-script tools (Fabula project generation, Timecode Script,
 * and Plajah World auto-population) are strictly gated to the creator who owns the work,
 * plus the platform architect account for technical verification.
 */
export function isPlatformArchitectUser(user?: { email?: string | null; isAdmin?: boolean } | null): boolean {
  if (!user) return false;
  if ((user as any).isAdmin === true) return true;
  const email = (user.email || '').toLowerCase().trim();
  return PLATFORM_ARCHITECT_EMAILS.has(email);
}

export function canAccessStoryIntelTools(
  ownerId?: string | null,
  user?: { uid?: string | null; email?: string | null; isAdmin?: boolean } | null
): boolean {
  const activeUser = user ?? auth.currentUser;
  if (!activeUser?.uid) return false;
  if (ownerId && activeUser.uid === ownerId) return true;
  return isPlatformArchitectUser(activeUser);
}

const norm = (s?: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slugify = (s: string) =>
  norm(s).replace(/\s+/g, '_') || 'untitled';

export const formatTimecode = (sec: number, includeHours = false): string => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0 || includeHours) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLIP-LINKED TIMECODE SCRIPT ENGINE (Used by Fabula Timeline & Script Tab)
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveScriptDialogueLine {
  id: string;
  speaker: string;
  parenthetical?: string;
  text: string;
  /** Original timestamp in source media (seconds). */
  srcSec: number;
  /** Live timestamp on the edited timeline (seconds). */
  liveStartSec: number;
  liveEndSec: number;
  isTrimmedOut: boolean;
  isActive: boolean;
  clipId?: string;
}

export interface LiveScriptShot {
  id: string;
  clipId?: string;
  shotId?: string;
  shotNumber: number;
  slug?: string;
  framing: string;
  camera: string;
  action: string;
  srcStartSec: number;
  srcEndSec: number;
  liveStartSec: number;
  liveEndSec: number;
  isTrimmedOut: boolean;
  isReordered?: boolean;
  isActive: boolean;
  dialogue: LiveScriptDialogueLine[];
}

export interface LiveScriptSegment {
  clipId: string;
  sceneClipId?: string;
  sceneId: string;
  sceneIndex: number;
  act: number;
  slugline: string;
  title: string;
  summary: string;
  clipStartSec: number;
  clipEndSec: number;
  clipDurationSec: number;
  srcInSec: number;
  srcOutSec: number;
  origStartSec: number;
  origEndSec: number;
  isReordered: boolean;
  isTrimmed: boolean;
  isSplitPart: boolean;
  splitPartIndex?: number;
  isActive: boolean;
  shots: LiveScriptShot[];
  trimmedShotsCount: number;
  trimmedLinesCount: number;
}

export interface ClipLinkedScriptState {
  segments: LiveScriptSegment[];
  activeSegment: LiveScriptSegment | null;
  activeShot: LiveScriptShot | null;
  activeLine: LiveScriptDialogueLine | null;
  totalLiveDurationSec: number;
  totalSceneCuts: number;
  totalShotCuts: number;
  totalActiveLines: number;
  totalTrimmedLines: number;
  reorderedCount: number;
  trimmedClipsCount: number;
}

/**
 * Pure, reactive mapper from Fabula's live timeline `clips` + `acts` + `playhead`
 * to a clip-linked screenplay breakdown.
 *
 * Supports BOTH:
 *   - **Shot-Cut Timelines (`V1` = Shot Cuts, `V2` = Scene Cuts)**: Every individual
 *     shot is bound to its own `V1` clip `(clip.start, clip.srcIn, clip.duration)`,
 *     and contiguous shots from the same scene are grouped under their Scene Slugline
 *     (automatically breaking into intercut headers if shots from another scene are
 *     cut in between, or updating shot order/trim state when any shot clip is edited).
 *   - **Scene-Cut Timelines (`V1` = Scene Cuts)**: Every scene clip maps its internal
 *     shots and dialogue lines via `liveSec = clip.start + (srcSec - clip.srcIn)`.
 */
export function computeClipLinkedScript(
  clips: any[],
  acts: any[],
  playheadSec: number = 0
): ClipLinkedScriptState {
  const allScenesById = new Map<string, any>();
  const allScenesOrdered: any[] = [];

  for (const act of acts || []) {
    for (const sc of act?.scenes || []) {
      allScenesById.set(sc.id, sc);
      allScenesOrdered.push(sc);
    }
  }
  allScenesOrdered.sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));

  const videoClips = (clips || [])
    .filter(
      (c) =>
        c &&
        !c.disabled &&
        (c.trackId === 'v1' || c.trackId === 'v2') &&
        c.kind !== 'fx' &&
        c.kind !== 'caption' &&
        c.kind !== 'subtitle' &&
        c.kind !== 'title'
    )
    .sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));

  const v1Clips = videoClips.filter((c) => c.trackId === 'v1');
  const v2Clips = videoClips.filter((c) => c.trackId === 'v2');

  // Check if V1 carries granular shot-level cuts
  const hasV1ShotCuts = v1Clips.some(
    (c) => c.cutLevel === 'shot' || Boolean(c.shotId) || Boolean(c.scriptData?.shot)
  );

  let lastSceneIndex = 0;
  let reorderedCount = 0;
  let trimmedClipsCount = 0;
  let totalActiveLines = 0;
  let totalTrimmedLines = 0;
  const segments: LiveScriptSegment[] = [];

  if (hasV1ShotCuts && v1Clips.length > 0) {
    // ── MODE A: Granular Shot-Cut + Scene-Cut Timeline ──────────────────────
    // Group contiguous V1 shot clips by sceneId so the screenplay reads cleanly
    // scene-by-scene, while immediately reflecting any reordered/intercut/trimmed
    // or deleted shots on V1.
    interface ShotGroup {
      sceneId: string;
      shotClips: any[];
    }
    const groups: ShotGroup[] = [];
    for (const scClip of v1Clips) {
      const sid =
        scClip.sceneId ||
        scClip.scriptData?.sceneId ||
        allScenesOrdered.find(
          (sc) =>
            (Number(scClip.srcIn) || 0) >= (Number(sc.startSec) || 0) &&
            (Number(scClip.srcIn) || 0) < (Number(sc.endSec) || 0)
        )?.id ||
        'sc_unknown';
      const prevGroup = groups[groups.length - 1];
      if (prevGroup && prevGroup.sceneId === sid) {
        prevGroup.shotClips.push(scClip);
      } else {
        groups.push({ sceneId: sid, shotClips: [scClip] });
      }
    }

    const sceneGroupCounts = new Map<string, number>();
    for (const g of groups) {
      sceneGroupCounts.set(g.sceneId, (sceneGroupCounts.get(g.sceneId) || 0) + 1);
    }
    const sceneGroupSeen = new Map<string, number>();

    // Track which shotIds exist anywhere on V1 so we can also surface deleted shots when SHOW CUTS is on
    const presentShotIds = new Set<string>();
    for (const scClip of v1Clips) {
      if (scClip.shotId) presentShotIds.add(scClip.shotId);
      if (scClip.scriptData?.shot?.id) presentShotIds.add(scClip.scriptData.shot.id);
    }

    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const group = groups[gIdx];
      const firstClip = group.shotClips[0];
      const lastClip = group.shotClips[group.shotClips.length - 1];
      const matchedScene = allScenesById.get(group.sceneId) || null;
      const sd = firstClip.scriptData || {};

      const sceneId = group.sceneId;
      const sceneIndex = Number(sd.sceneIndex || matchedScene?.index || gIdx + 1);
      const act = Number(sd.act || matchedScene?.act || 1);
      const slugline =
        sd.slugline || matchedScene?.slugline || firstClip.label || `SCENE ${sceneIndex}`;
      const title = sd.title || matchedScene?.title || `Scene ${sceneIndex}`;
      const summary = sd.summary || matchedScene?.synopsis || matchedScene?.summary || '';

      const clipStart = Number(firstClip.start) || 0;
      const clipEnd =
        (Number(lastClip.start) || 0) + Math.max(0.1, Number(lastClip.duration) || 1);
      const clipDur = Math.max(0.1, clipEnd - clipStart);
      const srcIn = Number(firstClip.srcIn) || 0;
      const srcOut =
        (Number(lastClip.srcIn) || 0) + Math.max(0.1, Number(lastClip.duration) || 1);

      const origStartSec = Number(
        sd.sceneOrigStartSec ?? matchedScene?.startSec ?? sd.origStartSec ?? srcIn
      );
      const origEndSec = Number(
        sd.sceneOrigEndSec ?? matchedScene?.endSec ?? sd.origEndSec ?? srcOut
      );

      // Find matching V2 Scene Cut clip if present
      const v2SceneClip = v2Clips.find(
        (vc) =>
          (vc.sceneId || vc.scriptData?.sceneId) === sceneId &&
          Math.abs((Number(vc.start) || 0) - clipStart) < 30
      );

      const isReordered = sceneIndex < lastSceneIndex;
      if (isReordered) reorderedCount++;
      lastSceneIndex = sceneIndex;

      const splitTotal = sceneGroupCounts.get(sceneId) || 1;
      const splitPartIndex = (sceneGroupSeen.get(sceneId) || 0) + 1;
      sceneGroupSeen.set(sceneId, splitPartIndex);
      const isSplitPart = splitTotal > 1;

      let trimmedShotsCount = 0;
      let trimmedLinesCount = 0;
      let segmentHasTrimmedClip = false;
      let lastShotNum = 0;

      const liveShots: LiveScriptShot[] = [];

      for (let sIdx = 0; sIdx < group.shotClips.length; sIdx++) {
        const shClip = group.shotClips[sIdx];
        const shClipStart = Number(shClip.start) || 0;
        const shClipDur = Math.max(0.1, Number(shClip.duration) || 1);
        const shClipEnd = shClipStart + shClipDur;
        const shSrcIn = Number(shClip.srcIn) || 0;
        const shSrcOut = shSrcIn + shClipDur;

        const rawShot: any =
          shClip.scriptData?.shot ||
          shClip.scriptData?.shots?.[0] ||
          (matchedScene?.shots || []).find(
            (s: any) => s.id === shClip.shotId || s.clipId === shClip.id
          ) ||
          {};

        const shOrigStart = Number(
          rawShot.startSec ?? shClip.scriptData?.origStartSec ?? shSrcIn
        );
        const shOrigEnd = Math.max(
          shOrigStart + 0.5,
          Number(rawShot.endSec ?? shClip.scriptData?.origEndSec ?? shSrcOut)
        );
        const shOrigDur = Math.max(0.2, shOrigEnd - shOrigStart);

        const shotTrimmed =
          Math.abs(shSrcIn - shOrigStart) > 0.35 || Math.abs(shClipDur - shOrigDur) > 0.35;
        if (shotTrimmed) {
          trimmedClipsCount++;
          segmentHasTrimmedClip = true;
        }

        const shotNum =
          Number(rawShot.shotNumber) ||
          Number(String(rawShot.slug || '').replace(/\D+/g, '')) ||
          sIdx + 1;
        const shotReordered = shotNum < lastShotNum;
        if (shotReordered) reorderedCount++;
        lastShotNum = shotNum;

        const isShotActive = playheadSec >= shClipStart && playheadSec < shClipEnd;

        const rawDialogue: any[] = Array.isArray(rawShot.dialogue) ? rawShot.dialogue : [];
        const liveDialogue: LiveScriptDialogueLine[] = rawDialogue.map((d, dIdx) => {
          const lineSrcSec = Number(d.tSec ?? shOrigStart);
          const nextLineSrcSec =
            dIdx + 1 < rawDialogue.length
              ? Number(rawDialogue[dIdx + 1].tSec ?? lineSrcSec + 3)
              : shOrigEnd;
          const estDur = Math.max(1.5, Math.min(8, nextLineSrcSec - lineSrcSec));

          const isLineTrimmed = lineSrcSec < shSrcIn - 0.35 || lineSrcSec > shSrcOut + 0.35;
          if (isLineTrimmed) {
            trimmedLinesCount++;
            totalTrimmedLines++;
          } else {
            totalActiveLines++;
          }

          const liveLineStart = Math.max(shClipStart, shClipStart + (lineSrcSec - shSrcIn));
          const liveLineEnd = Math.min(shClipEnd, liveLineStart + estDur);
          const isLineActive =
            !isLineTrimmed && playheadSec >= liveLineStart && playheadSec < liveLineEnd;

          return {
            id: `${shClip.id}_dlg_${dIdx}`,
            clipId: shClip.id,
            speaker: d.speaker || 'UNKNOWN',
            parenthetical: d.parenthetical || undefined,
            text: d.text || '',
            srcSec: lineSrcSec,
            liveStartSec: liveLineStart,
            liveEndSec: liveLineEnd,
            isTrimmedOut: isLineTrimmed,
            isActive: isLineActive,
          };
        });

        liveShots.push({
          id: `${shClip.id}_shot_${shotNum}_${sIdx}`,
          clipId: shClip.id,
          shotId: shClip.shotId || rawShot.id,
          shotNumber: shotNum,
          slug: rawShot.slug || `S${shotNum}`,
          framing: rawShot.framing || rawShot.type || 'MED',
          camera: rawShot.camera || 'Static',
          action: rawShot.action || rawShot.purpose || shClip.label || '',
          srcStartSec: shOrigStart,
          srcEndSec: shOrigEnd,
          liveStartSec: shClipStart,
          liveEndSec: shClipEnd,
          isTrimmedOut: false,
          isReordered: shotReordered,
          isActive: isShotActive,
          dialogue: liveDialogue,
        });
      }

      // If this is the first part of a scene and any original shots from matchedScene
      // were completely removed from V1, append them as trimmed-out shots so SHOW CUTS displays them
      if (splitPartIndex === 1 && Array.isArray(matchedScene?.shots)) {
        for (let mIdx = 0; mIdx < matchedScene.shots.length; mIdx++) {
          const origSh = matchedScene.shots[mIdx];
          const origShId = origSh.id || `${sceneId}_sh_${mIdx + 1}`;
          if (!presentShotIds.has(origShId)) {
            trimmedShotsCount++;
            segmentHasTrimmedClip = true;
            const shOrigStart = Number(origSh.startSec ?? origStartSec);
            const shOrigEnd = Number(origSh.endSec ?? shOrigStart + 4);
            const cutDialogue: LiveScriptDialogueLine[] = (origSh.dialogue || []).map(
              (d: any, dIdx: number) => {
                trimmedLinesCount++;
                totalTrimmedLines++;
                const tSec = Number(d.tSec ?? shOrigStart);
                return {
                  id: `cut_${origShId}_dlg_${dIdx}`,
                  speaker: d.speaker || 'UNKNOWN',
                  parenthetical: d.parenthetical || undefined,
                  text: d.text || '',
                  srcSec: tSec,
                  liveStartSec: clipStart,
                  liveEndSec: clipStart,
                  isTrimmedOut: true,
                  isActive: false,
                };
              }
            );
            const shotNum =
              Number(origSh.shotNumber) ||
              Number(String(origSh.slug || '').replace(/\D+/g, '')) ||
              mIdx + 1;
            liveShots.push({
              id: `cut_${origShId}`,
              shotId: origShId,
              shotNumber: shotNum,
              slug: origSh.slug || `S${shotNum}`,
              framing: origSh.framing || origSh.type || 'MED',
              camera: origSh.camera || 'Static',
              action: origSh.action || origSh.purpose || '',
              srcStartSec: shOrigStart,
              srcEndSec: shOrigEnd,
              liveStartSec: clipStart,
              liveEndSec: clipStart,
              isTrimmedOut: true,
              isActive: false,
              dialogue: cutDialogue,
            });
          }
        }
      }

      const isSegmentActive = playheadSec >= clipStart && playheadSec < clipEnd;

      segments.push({
        clipId: v2SceneClip?.id || firstClip.id,
        sceneClipId: v2SceneClip?.id,
        sceneId,
        sceneIndex,
        act,
        slugline,
        title,
        summary,
        clipStartSec: clipStart,
        clipEndSec: clipEnd,
        clipDurationSec: clipDur,
        srcInSec: srcIn,
        srcOutSec: srcOut,
        origStartSec,
        origEndSec,
        isReordered,
        isTrimmed: segmentHasTrimmedClip,
        isSplitPart,
        splitPartIndex: isSplitPart ? splitPartIndex : undefined,
        isActive: isSegmentActive,
        shots: liveShots,
        trimmedShotsCount,
        trimmedLinesCount,
      });
    }
  } else {
    // ── MODE B: Scene-Cut Timeline (or Virtual Fallback) ────────────────────
    const sceneClipsSource = v1Clips.length > 0 ? v1Clips : v2Clips;
    const sceneClipCounts = new Map<string, number>();
    for (const c of sceneClipsSource) {
      const sid = c.sceneId || c.scriptData?.sceneId || '';
      if (sid) sceneClipCounts.set(sid, (sceneClipCounts.get(sid) || 0) + 1);
    }
    const sceneClipSeen = new Map<string, number>();

    const effectiveClips =
      sceneClipsSource.length > 0
        ? sceneClipsSource
        : allScenesOrdered.map((sc, i) => ({
            id: `virtual_${sc.id || i}`,
            trackId: 'v1',
            start: Number(sc.startSec) || 0,
            duration: Math.max(1, (Number(sc.endSec) || 0) - (Number(sc.startSec) || 0)),
            srcIn: Number(sc.startSec) || 0,
            sceneId: sc.id,
            sceneIndex: sc.index || i + 1,
            scriptData: {
              sceneId: sc.id,
              sceneIndex: sc.index || i + 1,
              act: sc.act || 1,
              slugline: sc.slugline || sc.title || `SCENE ${i + 1}`,
              title: sc.title || `Scene ${i + 1}`,
              summary: sc.synopsis || sc.summary || '',
              origStartSec: Number(sc.startSec) || 0,
              origEndSec: Number(sc.endSec) || 0,
              shots: sc.shots || [],
            },
          }));

    for (let idx = 0; idx < effectiveClips.length; idx++) {
      const c = effectiveClips[idx];
      const clipStart = Number(c.start) || 0;
      const clipDur = Math.max(0.1, Number(c.duration) || 1);
      const clipEnd = clipStart + clipDur;
      const srcIn = Number(c.srcIn) || 0;
      const srcOut = srcIn + clipDur;

      let matchedScene =
        (c.sceneId && allScenesById.get(c.sceneId)) ||
        (c.scriptData?.sceneId && allScenesById.get(c.scriptData.sceneId)) ||
        null;

      if (!matchedScene && allScenesOrdered.length > 0) {
        const midSrc = srcIn + clipDur * 0.5;
        matchedScene =
          allScenesOrdered.find(
            (sc) => midSrc >= (Number(sc.startSec) || 0) && midSrc <= (Number(sc.endSec) || 0)
          ) || allScenesOrdered[Math.min(idx, allScenesOrdered.length - 1)];
      }

      const sd = c.scriptData || {};
      const sceneId = sd.sceneId || matchedScene?.id || `sc_${idx + 1}`;
      const sceneIndex = Number(sd.sceneIndex || matchedScene?.index || idx + 1);
      const act = Number(sd.act || matchedScene?.act || 1);
      const slugline = sd.slugline || matchedScene?.slugline || c.label || `SCENE ${sceneIndex}`;
      const title = sd.title || matchedScene?.title || c.label || `Scene ${sceneIndex}`;
      const summary = sd.summary || matchedScene?.synopsis || matchedScene?.summary || '';
      const origStartSec = Number(sd.origStartSec ?? matchedScene?.startSec ?? srcIn);
      const origEndSec = Number(sd.origEndSec ?? matchedScene?.endSec ?? srcOut);
      const origDur = Math.max(0.1, origEndSec - origStartSec);

      const rawShots: StoryReportShot[] =
        (Array.isArray(sd.shots) && sd.shots.length > 0 ? sd.shots : matchedScene?.shots) || [];

      const isReordered = sceneIndex < lastSceneIndex;
      if (isReordered) reorderedCount++;
      lastSceneIndex = sceneIndex;

      const isTrimmed =
        Math.abs(srcIn - origStartSec) > 0.75 || Math.abs(clipDur - origDur) > 0.75;
      if (isTrimmed) trimmedClipsCount++;

      const splitTotal = sceneClipCounts.get(sceneId) || 1;
      const splitPartIndex = (sceneClipSeen.get(sceneId) || 0) + 1;
      sceneClipSeen.set(sceneId, splitPartIndex);
      const isSplitPart = splitTotal > 1;

      const isSegmentActive = playheadSec >= clipStart && playheadSec < clipEnd;

      let trimmedShotsCount = 0;
      let trimmedLinesCount = 0;

      const liveShots: LiveScriptShot[] = rawShots.map((sh, shIdx) => {
        const shSrcStart = Number(sh.startSec ?? origStartSec);
        const shSrcEnd = Math.max(shSrcStart + 1, Number(sh.endSec ?? shSrcStart + 4));

        const isShotTrimmedOut = shSrcEnd <= srcIn + 0.25 || shSrcStart >= srcOut - 0.25;
        if (isShotTrimmedOut) trimmedShotsCount++;

        const clampedSrcStart = Math.max(srcIn, Math.min(srcOut, shSrcStart));
        const clampedSrcEnd = Math.max(clampedSrcStart + 0.5, Math.min(srcOut, shSrcEnd));

        const liveShotStart = clipStart + (clampedSrcStart - srcIn);
        const liveShotEnd = clipStart + (clampedSrcEnd - srcIn);

        const isShotActive =
          !isShotTrimmedOut && playheadSec >= liveShotStart && playheadSec < liveShotEnd;

        const rawDialogue = Array.isArray(sh.dialogue) ? sh.dialogue : [];
        const liveDialogue: LiveScriptDialogueLine[] = rawDialogue.map((d, dIdx) => {
          const lineSrcSec = Number(d.tSec ?? shSrcStart);
          const nextLineSrcSec =
            dIdx + 1 < rawDialogue.length
              ? Number(rawDialogue[dIdx + 1].tSec ?? lineSrcSec + 3)
              : shSrcEnd;
          const estDur = Math.max(1.8, Math.min(8, nextLineSrcSec - lineSrcSec));

          const isLineTrimmed = lineSrcSec < srcIn - 0.35 || lineSrcSec > srcOut + 0.35;
          if (isLineTrimmed) {
            trimmedLinesCount++;
            totalTrimmedLines++;
          } else {
            totalActiveLines++;
          }

          const liveLineStart = clipStart + (lineSrcSec - srcIn);
          const liveLineEnd = Math.min(clipEnd, liveLineStart + estDur);
          const isLineActive =
            !isLineTrimmed && playheadSec >= liveLineStart && playheadSec < liveLineEnd;

          return {
            id: `${c.id}_sh_${(sh as any).shotNumber || sh.slug || shIdx + 1}_dlg_${dIdx}`,
            clipId: (sh as any).clipId || c.id,
            speaker: d.speaker || 'UNKNOWN',
            parenthetical: d.parenthetical || undefined,
            text: d.text || '',
            srcSec: lineSrcSec,
            liveStartSec: liveLineStart,
            liveEndSec: liveLineEnd,
            isTrimmedOut: isLineTrimmed,
            isActive: isLineActive,
          };
        });

        const shotNum =
          Number((sh as any).shotNumber) ||
          Number(String(sh.slug || '').replace(/\D+/g, '')) ||
          shIdx + 1;
        return {
          id: `${c.id}_sh_${shotNum}_${shIdx}`,
          clipId: (sh as any).clipId || c.id,
          shotId: (sh as any).id,
          shotNumber: shotNum,
          slug: sh.slug || `S${shotNum}`,
          framing: (sh as any).framing || sh.type || 'MED',
          camera: sh.camera || 'Static',
          action: sh.action || (sh as any).purpose || '',
          srcStartSec: shSrcStart,
          srcEndSec: shSrcEnd,
          liveStartSec: liveShotStart,
          liveEndSec: liveShotEnd,
          isTrimmedOut: isShotTrimmedOut,
          isActive: isShotActive,
          dialogue: liveDialogue,
        };
      });

      segments.push({
        clipId: c.id,
        sceneId,
        sceneIndex,
        act,
        slugline,
        title,
        summary,
        clipStartSec: clipStart,
        clipEndSec: clipEnd,
        clipDurationSec: clipDur,
        srcInSec: srcIn,
        srcOutSec: srcOut,
        origStartSec,
        origEndSec,
        isReordered,
        isTrimmed,
        isSplitPart,
        splitPartIndex: isSplitPart ? splitPartIndex : undefined,
        isActive: isSegmentActive,
        shots: liveShots,
        trimmedShotsCount,
        trimmedLinesCount,
      });
    }
  }

  const activeSegment = segments.find((s) => s.isActive) || null;
  const activeShot =
    activeSegment?.shots.find((sh) => sh.isActive) ||
    segments.flatMap((s) => s.shots).find((sh) => sh.isActive) ||
    null;
  const activeLine =
    activeShot?.dialogue.find((d) => d.isActive) ||
    activeSegment?.shots.flatMap((sh) => sh.dialogue).find((d) => d.isActive) ||
    null;

  const totalLiveDurationSec =
    segments.length > 0 ? Math.max(...segments.map((s) => s.clipEndSec)) : 0;

  const totalShotCuts = segments.reduce(
    (sum, seg) => sum + seg.shots.filter((sh) => !sh.isTrimmedOut).length,
    0
  );

  return {
    segments,
    activeSegment,
    activeShot,
    activeLine,
    totalLiveDurationSec,
    totalSceneCuts: segments.length,
    totalShotCuts,
    totalActiveLines,
    totalTrimmedLines,
    reorderedCount,
    trimmedClipsCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEED FABULA STUDIO PROJECT FROM STORY REPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedFabulaOptions {
  albumId: string;
  ownerId: string;
  title: string;
  report: StoryReport;
  muxPlaybackId?: string;
  videoUrl?: string;
  coverImageUrl?: string;
  worldId?: string;
  openInFabula?: boolean;
  targetWorkspace?: 'script' | 'edit';
}

export interface SeedFabulaResult {
  prodId: string;
  sceneCount: number;
  shotCount: number;
  dialogueCount: number;
  castCount: number;
}

/**
 * Generates or updates a complete Fabula Production (`studio:prod:prod_storyintel_${albumId}`)
 * from a Reverse Screenplay `StoryReport`, complete with:
 *   - 3-Act Structure & Scene Cards (with Fountain script bodies, SLATE Scene Bibles,
 *     SLATE Shot Cards, and per-scene Shot-Cut timelines `scene.timeline.clips`)
 *   - Character Bible (`cast`) & World Bible (`worldCats.places`, `props`, `lore`)
 *   - Media Pool (`feature-master`, `scene-cuts`, `shot-cuts`, and `stills` bins)
 *   - Master Scene & Shot Cut (`edits[0]`):
 *       • Track `V2` (`V2 · SCENE CUTS`): All Scene Boundary Cuts matching the screenplay
 *       • Track `V1` (`V1 · SHOT CUTS`): Every individual Shot Cut (`srcIn`, `duration`, `shotId`, `sceneId`)
 *       • Track `A1` (`A1 · DIALOGUE`): Linked Shot & Spoken Dialogue audio cuts
 *   - Scene Assembly Cut (`edits[1]`): Macro scene-level cut on `V1`/`A1`
 */
export async function seedFabulaProjectFromStoryReport(
  opts: SeedFabulaOptions
): Promise<SeedFabulaResult> {
  const {
    albumId,
    ownerId,
    title,
    report,
    openInFabula = true,
    targetWorkspace = 'script',
  } = opts;

  if (!canAccessStoryIntelTools(ownerId)) {
    throw new Error(
      'Creator Exclusivity: Story Intelligence and Reverse Script tools can only be used on your own creations.'
    );
  }

  let muxPlaybackId = opts.muxPlaybackId || '';
  let videoUrl = opts.videoUrl || '';
  let coverImageUrl = opts.coverImageUrl || '';
  let worldId = opts.worldId || '';

  // Resolve muxPlaybackId / videoUrl / coverImageUrl from Firestore albums/{albumId} if not passed
  if (!muxPlaybackId && !videoUrl) {
    try {
      const albumSnap = await getDoc(doc(db, 'albums', albumId));
      if (albumSnap.exists()) {
        const data = albumSnap.data() as any;
        muxPlaybackId =
          data.muxPlaybackId ||
          data.movieData?.muxPlaybackId ||
          data.tracks?.[0]?.muxPlaybackId ||
          data.episodes?.[0]?.muxPlaybackId ||
          '';
        videoUrl =
          data.videoUrl ||
          data.movieData?.videoUrl ||
          data.tracks?.[0]?.url ||
          data.episodes?.[0]?.videoUrl ||
          '';
        coverImageUrl = coverImageUrl || data.coverImageUrl || data.coverImage || data.posterUrl || '';
        worldId = worldId || data.worldId || '';
      }
    } catch (err) {
      console.warn('[storyIntelBridge] Could not read album doc for stream URL:', err);
    }
  }

  // Use Mux static MP4 rendition (medium.mp4) when available so HTML5 <video>,
  // WebCodecs IndexedVideoCanvas, ScrubThumb, and Web Audio decode natively on all browsers.
  const streamUrl =
    videoUrl ||
    (muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}/medium.mp4` : '');

  const activeUser = auth.currentUser;
  const isArchitectVerification = Boolean(
    activeUser?.uid && ownerId && activeUser.uid !== ownerId
  );
  const prodId = isArchitectVerification
    ? `prod_storyintel_${albumId}_verify`
    : `prod_storyintel_${albumId}`;
  const now = Date.now();

  // Resolve character & scene still URLs (best-effort)
  const stillById = new Map<string, string>();
  await Promise.all(
    (report.stills || []).slice(0, 40).map(async (st) => {
      try {
        const u = await stillUrl(ownerId, albumId, st.path);
        if (u) stillById.set(st.id, u);
      } catch {
        // ignore
      }
    })
  );

  // Build Cast
  const castById = new Map<string, any>();
  const cast = (report.characters || []).map((c: any, idx) => {
    const firstSceneId = c.appearances?.[0]?.sceneId;
    const firstStill = firstSceneId
      ? report.stills?.find((st) => st.sceneId === firstSceneId && stillById.has(st.id))
      : undefined;
    const id = c.refId || `char_${idx + 1}`;
    const entry = {
      id,
      name: c.name,
      role:
        c.tier === 'MAIN'
          ? 'Protagonist'
          : c.tier === 'SUPPORTING'
          ? 'Supporting'
          : 'Minor',
      tier: c.tier,
      aka: c.aka || [],
      archetype: c.tier,
      looks: c.description || '',
      voice: c.tier === 'MAIN' ? 'Lead principal dialogue voice' : 'Supporting character voice',
      personality: c.description || '',
      summary: c.description || '',
      bio: c.description || '',
      traits: c.aka || [],
      screenTimeSec: c.screenTimeSec || 0,
      dialogueLines: c.dialogueLines || 0,
      fromWorld: true,
      fromAnalysis: true,
      media: [],
      wardrobe: [],
      avatar:
        c.imageUrl ||
        (c.portraitStillId && stillById.get(c.portraitStillId)) ||
        (c.stillIds?.[0] && stillById.get(c.stillIds[0])) ||
        stillById.get(`${id}_portrait`) ||
        (firstStill && stillById.get(firstStill.id)) ||
        coverImageUrl ||
        '',
    };
    castById.set(id, entry);
    return entry;
  });

  // Build World Categories
  const placesById = new Map<string, any>();
  const places = (report.locations || []).map((l: any, idx) => {
    const id = l.refId || `loc_${idx + 1}`;
    const entry = {
      id,
      name: l.name,
      kind: l.kind || l.intExt || 'EXT',
      notes: l.description || '',
      summary: l.description || '',
      sceneIds: l.sceneIds || [],
      tags: ['story-intel', (l.kind || l.intExt || 'location').toLowerCase()],
      avatar:
        l.imageUrl ||
        (l.stillIds?.[0] && stillById.get(l.stillIds[0])) ||
        stillById.get(`${id}_still`) ||
        '',
    };
    placesById.set(id, entry);
    return entry;
  });

  const props = (report.macguffins || []).map((m: any, idx) => ({
    id: m.refId || `prop_${idx + 1}`,
    name: m.name,
    kind: m.narrativeRole || 'KEY_PROP',
    notes: m.description || '',
    summary: m.description || '',
    sceneIds: m.sceneIds || [],
    tags: ['story-intel', (m.narrativeRole || 'prop').toLowerCase()],
    avatar:
      m.imageUrl ||
      (m.stillIds?.[0] && stillById.get(m.stillIds[0])) ||
      stillById.get(`${m.refId || `obj_${idx + 1}`}_still`) ||
      '',
  }));

  const lore = (report.themes || []).map((th, idx) => ({
    id: `theme_${idx + 1}`,
    name: `Theme: ${th}`,
    kind: 'Theme',
    notes: `Core narrative theme identified in ${title}: ${th}.`,
    summary: `Core narrative theme identified in ${title}: ${th}.`,
    tags: ['theme', 'story-intel'],
  }));

  // Build 3-Act Structure with Scene Cards, SLATE Bibles, Shot Cards & Per-Scene Shot Timelines
  const reportActs: any[] = report.structure?.acts?.length
    ? report.structure.acts
    : [
        { number: 1, title: 'Act I — Setup', startSec: 0, endSec: 1100, summary: 'Setup' },
        { number: 2, title: 'Act II — Confrontation', startSec: 1100, endSec: 2500, summary: 'Confrontation' },
        { number: 3, title: 'Act III — Resolution', startSec: 2500, endSec: 3500, summary: 'Resolution' },
      ];

  const actColor = ['#f59e0b', '#8b5cf6', '#06b6d4'];
  const scenes = [...(report.scenes || [])].sort(
    (a, b) => (a.startSec || 0) - (b.startSec || 0)
  );

  const totalDurationSec =
    scenes.length > 0
      ? Math.max(...scenes.map((s) => Number(s.endSec) || 0))
      : 3491;

  // Master Film Asset + Scene Cut Assets + Shot Cut Assets + Stills in Media Pool
  const masterVideoAssetId = `a_film_${albumId}`;
  const mediaPool: any[] = [
    {
      id: masterVideoAssetId,
      name: `${title} — Full Feature Master`,
      type: 'video',
      duration: totalDurationSec,
      durationLabel: formatTimecode(totalDurationSec, true),
      fps: 24,
      res: '1920x1080',
      codec: muxPlaybackId ? 'Mux HLS' : 'H.264',
      color: '#f59e0b',
      scene: 'Full Feature',
      take: 1,
      good: true,
      url: streamUrl,
      cloudUrl: streamUrl,
      muxPlaybackId,
      thumbnailUrl: coverImageUrl,
      sourceFilmId: albumId,
      bin: 'feature-master',
      tags: ['reverse-script', 'feature', 'master'],
    },
  ];

  // Master timeline clips (V2 = Scene Cuts, V1 = Shot Cuts, A1 = Linked Shot/Dialogue Audio)
  const masterTimelineClips: any[] = [];
  // Macro Scene Assembly timeline clips (V1 = Scene Cuts, A1 = Scene Audio)
  const sceneAssemblyClips: any[] = [];
  // Timeline markers (scenes + key dialogue shots)
  const timelineMarkers: any[] = [];

  let totalShots = 0;
  let totalDialogue = 0;
  let globalShotCounter = 0;

  const formattedScenesById = new Map<string, any>();

  for (const sc of scenes as any[]) {
    const scId = sc.id || `sc_${sc.index}`;
    const scStart = Number(sc.startSec) || 0;
    const scEnd = Math.max(scStart + 1, Number(sc.endSec) || scStart + 10);
    const scDur = +(scEnd - scStart).toFixed(2);
    const scAct = sc.actNumber ?? sc.act ?? 1;

    const matchedStill = report.stills?.find(
      (st) => st.sceneId === sc.id && stillById.has(st.id)
    );
    const scStill =
      (sc.stillIds?.[0] && stillById.get(sc.stillIds[0])) ||
      (matchedStill && stillById.get(matchedStill.id)) ||
      coverImageUrl ||
      '';

    const charIds: string[] = sc.characterRefIds || sc.characterIds || [];
    const locObj = sc.locationRefId ? placesById.get(sc.locationRefId) : null;

    // Add Scene Subclip to Media Pool ('scene-cuts' bin)
    const sceneAssetId = `a_sc_${scId}`;
    mediaPool.push({
      id: sceneAssetId,
      name: `SC ${String(sc.index).padStart(2, '0')} — ${sc.title || sc.slugline}`,
      type: 'video',
      duration: scDur,
      durationLabel: formatTimecode(scDur),
      inPoint: scStart,
      outPoint: scEnd,
      srcIn: scStart,
      fps: 24,
      res: '1920x1080',
      color: actColor[(scAct - 1) % actColor.length],
      scene: `SC ${sc.index}`,
      take: 1,
      good: true,
      url: streamUrl,
      cloudUrl: streamUrl,
      muxPlaybackId,
      thumbnailUrl: scStill,
      sourceFilmId: albumId,
      bin: 'scene-cuts',
      tags: ['scene-cut', `act-${scAct}`, `sc-${sc.index}`],
    });

    // Ensure every scene has at least 1 shot even if the report had 0 for a brief transition
    const rawShots: any[] =
      Array.isArray(sc.shots) && sc.shots.length > 0
        ? sc.shots
        : [
            {
              id: `${scId}_sh_1`,
              slug: 'S1',
              type: 'WIDE',
              startSec: scStart,
              endSec: scEnd,
              camera: 'Static establishing frame',
              action: sc.summary || sc.title || 'Establishing shot.',
              purpose: sc.purpose || 'Establish scene geography',
              characters: charIds,
              dialogue: [],
            },
          ];

    const sceneShotsFormatted: any[] = [];
    const perSceneTimelineClips: any[] = [];
    let sceneLocalCursor = 0;

    for (let shIdx = 0; shIdx < rawShots.length; shIdx++) {
      const sh = rawShots[shIdx];
      globalShotCounter++;
      totalShots++;

      const shId = sh.id || `${scId}_sh_${shIdx + 1}`;
      const shStart = Number(sh.startSec ?? scStart);
      const nextShStart =
        shIdx + 1 < rawShots.length ? Number(rawShots[shIdx + 1].startSec ?? scEnd) : scEnd;
      const shEnd = Math.max(
        shStart + 0.5,
        Number(sh.endSec ?? nextShStart ?? shStart + 4)
      );
      const shDur = +(shEnd - shStart).toFixed(2);
      const shSlug = sh.slug || `S${shIdx + 1}`;
      const shType = sh.framing || sh.type || 'MED';
      const shCamera = sh.camera || 'Static';
      const shAction = sh.action || sh.purpose || '';
      const shDialogue: any[] = Array.isArray(sh.dialogue) ? sh.dialogue : [];
      totalDialogue += shDialogue.length;

      const dialogueSummary = shDialogue
        .map((d) => `${d.speaker}: "${d.text}"`)
        .join(' / ');
      const primarySpeaker =
        shDialogue[0]?.speaker ||
        (Array.isArray(sh.characters) && sh.characters[0]) ||
        '';

      const masterShotClipId = `c_v1_${shId}`;
      const masterAudioClipId = `c_a1_${shId}`;
      const shotLinkId = `lk_sh_${shId}`;

      // Add Shot Subclip to Media Pool ('shot-cuts' bin)
      mediaPool.push({
        id: `a_sh_${shId}`,
        name: `SC ${String(sc.index).padStart(2, '0')} · ${shSlug} [${shType}] — ${(
          dialogueSummary ||
          shAction ||
          sc.title
        ).slice(0, 48)}`,
        type: 'video',
        duration: shDur,
        durationLabel: formatTimecode(shDur),
        inPoint: shStart,
        outPoint: shEnd,
        srcIn: shStart,
        fps: 24,
        res: '1920x1080',
        scene: `SC ${sc.index}`,
        take: shIdx + 1,
        shotType: shType,
        camera: shCamera,
        good: true,
        url: streamUrl,
        cloudUrl: streamUrl,
        muxPlaybackId,
        thumbnailUrl: scStill,
        sourceFilmId: albumId,
        bin: 'shot-cuts',
        tags: ['shot-cut', `sc-${sc.index}`, shType.toLowerCase()],
      });

      const formattedShot = {
        id: shId,
        clipId: masterShotClipId,
        shotNumber: shIdx + 1,
        globalShotNumber: globalShotCounter,
        slug: shSlug,
        type: shType,
        framing: shType,
        subject: (shAction || sc.title || '').slice(0, 80),
        character: primarySpeaker,
        lines: dialogueSummary || shAction || '',
        camera: shCamera,
        purpose: sh.purpose || shAction || sc.purpose || 'Advance scene beat',
        action: shAction,
        dialogue: shDialogue,
        characters: sh.characters || [],
        startSec: shStart,
        endSec: shEnd,
        durationSec: shDur,
        status: 'ready',
        frameUrl: scStill,
        still: `${sc.slugline}. ${shType} shot, ${shCamera}. ${shAction}`,
        video: `${shType} (${shCamera}): ${shAction}`,
        voice: dialogueSummary,
        continuity: `Scene ${sc.index} (${formatTimecode(shStart)}–${formatTimecode(shEnd)})`,
        notes: `Reverse-engineered from master cut [${formatTimecode(shStart)}–${formatTimecode(shEnd)}]`,
      };
      sceneShotsFormatted.push(formattedShot);

      // 1) Master Timeline V1 Shot Cut Clip
      masterTimelineClips.push({
        id: masterShotClipId,
        trackId: 'v1',
        start: shStart,
        duration: shDur,
        srcIn: shStart,
        kind: 'media',
        cutLevel: 'shot',
        assetId: masterVideoAssetId,
        linkId: shotLinkId,
        av: true,
        shotId: shId,
        sceneId: scId,
        sceneIndex: sc.index,
        label: `SC ${sc.index} · ${shSlug} [${shType}] ${
          primarySpeaker ? `· ${primarySpeaker}` : `· ${(shAction || sc.title).slice(0, 28)}`
        }`,
        scriptData: {
          sceneId: scId,
          sceneIndex: sc.index,
          act: scAct,
          slugline: sc.slugline,
          title: sc.title,
          summary: sc.summary,
          origStartSec: shStart,
          origEndSec: shEnd,
          sceneOrigStartSec: scStart,
          sceneOrigEndSec: scEnd,
          shot: formattedShot,
          shots: [formattedShot],
        },
      });

      // 2) Master Timeline A1 Shot / Dialogue Audio Clip
      masterTimelineClips.push({
        id: masterAudioClipId,
        trackId: 'a1',
        start: shStart,
        duration: shDur,
        srcIn: shStart,
        kind: 'audio',
        cutLevel: 'shot',
        assetId: masterVideoAssetId,
        linkId: shotLinkId,
        shotId: shId,
        sceneId: scId,
        sceneIndex: sc.index,
        gainDb: 0,
        pan: 0,
        label: dialogueSummary
          ? `🎙 ${dialogueSummary.slice(0, 54)}`
          : `SC ${sc.index} · ${shSlug} · Audio`,
      });

      // 3) Per-Scene Local Timeline Clips (for editing this scene in isolation in SLATE -> EDIT)
      const localLinkId = `lk_local_${shId}`;
      perSceneTimelineClips.push({
        id: `c_sc_v1_${shId}`,
        trackId: 'v1',
        start: +sceneLocalCursor.toFixed(2),
        duration: shDur,
        srcIn: shStart,
        kind: 'media',
        cutLevel: 'shot',
        assetId: masterVideoAssetId,
        linkId: localLinkId,
        av: true,
        shotId: shId,
        sceneId: scId,
        sceneIndex: sc.index,
        label: `${shSlug} · ${shType}${primarySpeaker ? ` (${primarySpeaker})` : ''}`,
        scriptData: {
          sceneId: scId,
          sceneIndex: sc.index,
          act: scAct,
          slugline: sc.slugline,
          title: sc.title,
          summary: sc.summary,
          origStartSec: shStart,
          origEndSec: shEnd,
          sceneOrigStartSec: scStart,
          sceneOrigEndSec: scEnd,
          shot: formattedShot,
          shots: [formattedShot],
        },
      });
      perSceneTimelineClips.push({
        id: `c_sc_a1_${shId}`,
        trackId: 'a1',
        start: +sceneLocalCursor.toFixed(2),
        duration: shDur,
        srcIn: shStart,
        kind: 'audio',
        cutLevel: 'shot',
        assetId: masterVideoAssetId,
        linkId: localLinkId,
        shotId: shId,
        sceneId: scId,
        sceneIndex: sc.index,
        gainDb: 0,
        pan: 0,
        label: dialogueSummary
          ? `🎙 ${dialogueSummary.slice(0, 48)}`
          : `${shSlug} · Audio`,
      });
      sceneLocalCursor += shDur;
    }

    // 4) Master Timeline V2 Scene Cut Ribbon Clip (spans the entire scene above its V1 Shot Cuts)
    masterTimelineClips.push({
      id: `c_v2_${scId}`,
      trackId: 'v2',
      start: scStart,
      duration: scDur,
      srcIn: scStart,
      kind: 'script',
      cutLevel: 'scene',
      sceneId: scId,
      sceneIndex: sc.index,
      label: `SC ${String(sc.index).padStart(2, '0')}: ${sc.title} (${rawShots.length} shots)`,
      scriptData: {
        sceneId: scId,
        sceneIndex: sc.index,
        act: scAct,
        slugline: sc.slugline,
        title: sc.title,
        summary: sc.summary,
        origStartSec: scStart,
        origEndSec: scEnd,
        shots: sceneShotsFormatted,
      },
    });

    // 5) Scene Assembly Cut (`edits[1]`) V1 + A1 Scene-Level Clips
    const scLinkId = `lk_sc_${scId}`;
    sceneAssemblyClips.push({
      id: `c_v1_${scId}`,
      trackId: 'v1',
      start: scStart,
      duration: scDur,
      srcIn: scStart,
      kind: 'media',
      cutLevel: 'scene',
      assetId: masterVideoAssetId,
      linkId: scLinkId,
      av: true,
      label: `SC ${sc.index}: ${sc.title}`,
      sceneId: scId,
      sceneIndex: sc.index,
      scriptData: {
        sceneId: scId,
        sceneIndex: sc.index,
        act: scAct,
        slugline: sc.slugline,
        title: sc.title,
        summary: sc.summary,
        origStartSec: scStart,
        origEndSec: scEnd,
        shots: sceneShotsFormatted,
      },
    });
    sceneAssemblyClips.push({
      id: `c_a1_${scId}`,
      trackId: 'a1',
      start: scStart,
      duration: scDur,
      srcIn: scStart,
      kind: 'audio',
      cutLevel: 'scene',
      assetId: masterVideoAssetId,
      linkId: scLinkId,
      label: `SC ${sc.index} · Scene Dialogue Stem`,
      gainDb: 0,
      pan: 0,
      sceneId: scId,
    });

    timelineMarkers.push({
      id: `mk_${scId}`,
      time: scStart,
      label: `SC ${sc.index}: ${sc.title} (${sceneShotsFormatted.length} shots)`,
      color: scAct === 1 ? '#f59e0b' : scAct === 2 ? '#8b5cf6' : '#06b6d4',
    });

    // Build SLATE Scene Bible so SLATE Step 2 (BIBLE) and Step 3 (SHOTS) are unlocked
    const sceneBible = {
      intent: sc.purpose || sc.summary || `Dramatic beat for ${sc.title}.`,
      subtext_read: sc.mood
        ? `Emotional tone: ${sc.mood}. ${sc.summary || ''}`
        : sc.summary || 'Visual storytelling and character progression.',
      suggestions: [
        `Maintain visual continuity across all ${sceneShotsFormatted.length} shots in ${sc.slugline}.`,
        sc.transitionOut
          ? `Honor outgoing transition: ${sc.transitionOut}.`
          : 'Cut on action between wide geography and close reactions.',
      ],
      characters: charIds
        .map((cid) => castById.get(cid))
        .filter(Boolean)
        .map((c) => ({
          name: c.name,
          visual_lock: c.looks || c.summary || '',
          voice_profile: c.voice || 'Natural dramatic delivery',
          arc_in_scene: `Active in ${sc.title}`,
        })),
      environment_lock:
        locObj?.summary ||
        `${sc.slugline} — authentic setting and atmosphere matching the master cut.`,
      lighting_plan: sc.timeOfDay
        ? `${sc.timeOfDay} lighting motivated by ${sc.slugline}.`
        : 'Motivated cinematic lighting matching the reverse-engineered frame.',
      palette: sc.mood || 'Warm cinematic contrast',
    };

    formattedScenesById.set(scId, {
      id: scId,
      index: sc.index,
      act: scAct,
      title: sc.title || `Scene ${sc.index}`,
      slugline: sc.slugline || `INT./EXT. SCENE ${sc.index} - DAY`,
      mode: sceneShotsFormatted.some((s) => s.dialogue?.length > 0) ? 'dialogue' : 'action',
      tone: sc.mood || sc.purpose || '',
      environment: locObj?.summary || sc.slugline || '',
      styleNotes: 'Reverse-engineered from master feature film',
      beat: sc.purpose || sc.mood || 'Story Beat',
      status: 'locked',
      pov: charIds[0] || '',
      location: sc.locationRefId || '',
      time: `${formatTimecode(scStart)} – ${formatTimecode(scEnd)}`,
      startSec: scStart,
      endSec: scEnd,
      durationSec: scDur,
      synopsis: sc.summary || '',
      summary: sc.summary || '',
      body: sc.script || sc.summary || '',
      script: sc.script || sc.summary || '',
      bible: sceneBible,
      shots: sceneShotsFormatted,
      cast: charIds,
      places: sc.locationRefId ? [sc.locationRefId] : [],
      props: sc.objectRefIds || [],
      thumbnail: scStill,
      notes: sc.transitionOut ? `Transition Out: ${sc.transitionOut}` : '',
      timeline: {
        clips: perSceneTimelineClips,
        trackSettings: {},
      },
      updatedAt: now,
    });
  }

  // Add resolved stills to Media Pool ('stills' bin)
  for (const st of (report.stills || []).slice(0, 35)) {
    const resolvedUrl = stillById.get(st.id);
    if (!resolvedUrl) continue;
    mediaPool.push({
      id: `a_still_${st.id}`,
      name: `Still · ${formatTimecode(st.tSec)} — ${(st.caption || st.sceneId || 'Frame').slice(0, 40)}`,
      type: 'image',
      designation: 'frame',
      duration: 0,
      url: resolvedUrl,
      cloudUrl: resolvedUrl,
      thumbnailUrl: resolvedUrl,
      bin: 'stills',
      tags: ['still', st.sceneId || 'frame'].filter(Boolean),
    });
  }

  const acts = reportActs.map((a: any, idx) => {
    const actNum = a.number ?? a.act ?? idx + 1;
    const actLabel = a.title || a.label || `Act ${actNum}`;
    const actScenes = scenes
      .filter((s: any) => (s.actNumber ?? s.act ?? 1) === actNum)
      .map((s: any) => formattedScenesById.get(s.id || `sc_${s.index}`))
      .filter(Boolean);

    return {
      id: `act_${actNum}`,
      act: actNum,
      number: actNum,
      title: `ACT ${actNum} — ${String(actLabel).toUpperCase()}`,
      name: `ACT ${actNum} — ${String(actLabel).toUpperCase()}`,
      color: actColor[idx % actColor.length],
      summary: a.summary || '',
      startSec: a.startSec,
      endSec: a.endSec,
      scenes: actScenes,
    };
  });

  const masterEditItem = {
    id: `ed_storyintel_${albumId}`,
    title: `${title} — Master Scene & Shot Cut`,
    status: 'In Progress',
    fps: 24,
    aspect: '16:9',
    duration: formatTimecode(totalDurationSec, true),
    notes: `Reverse-engineered Master Cut (${scenes.length} Scene Cuts on V2, ${totalShots} Shot Cuts on V1, ${totalDialogue} Dialogue Lines on A1). All scene and shot cuts are live-linked to the Timecode Script view.`,
    updatedAt: now,
    sourceFilmId: albumId,
    sourceStreamUrl: streamUrl,
    muxPlaybackId,
    timeline: {
      clips: masterTimelineClips,
      trackSettings: {},
      markers: timelineMarkers,
    },
  };

  const sceneAssemblyEditItem = {
    id: `ed_storyintel_scenes_${albumId}`,
    title: `${title} — Scene Assembly Cut`,
    status: 'In Progress',
    fps: 24,
    aspect: '16:9',
    duration: formatTimecode(totalDurationSec, true),
    notes: `Macro Scene-by-Scene Cut (${scenes.length} scenes on V1/A1) for high-level act and scene restructuring.`,
    updatedAt: now,
    sourceFilmId: albumId,
    sourceStreamUrl: streamUrl,
    muxPlaybackId,
    timeline: {
      clips: sceneAssemblyClips,
      trackSettings: {},
      markers: timelineMarkers,
    },
  };

  const projectTracks = [
    { id: 'v2', name: 'V2 · SCENE CUTS', type: 'video' },
    { id: 'v1', name: 'V1 · SHOT CUTS', type: 'video' },
    { id: 'a1', name: 'A1 · DIALOGUE & SHOT AUDIO', type: 'audio' },
    { id: 'a2', name: 'A2 · MUSIC & STEMS', type: 'audio' },
  ];

  // Load existing prod if present so we don't clobber custom artifacts
  const existingRaw = await idbGet(prodKey(prodId));
  let prod: any =
    typeof existingRaw === 'string'
      ? JSON.parse(existingRaw)
      : existingRaw || null;

  const fullFountain =
    report.screenplay || buildFountainFromStoryReport(report, title);

  const defaultFormat = {
    style: '',
    aspect: '16:9',
    service: 'kling',
    stillTarget: 'mj_magnific',
    format: {
      preset: 'hd1080',
      label: 'HD 1080p',
      w: 1920,
      h: 1080,
      fps: 24,
      drop: false,
    },
  };

  const bins = ['feature-master', 'scene-cuts', 'shot-cuts', 'stills'];

  // Build complete Graphic Novel artifact via Cinema-to-Graphic-Novel Transliteration:
  // - Long dialogue strings are split into breath-sized comic clauses and distributed across sequential beat panels (max 2 balloons per panel, never obscuring focal art)
  // - Cinematic camera/script directions are stripped from comic frames and transliterated into literary Graphic Novel captions only where needed
  // - Non-repeating editorial page layout archetypes are assigned across all pages
  let globalComicPanelNum = 0;
  let prevLayout: PageLayoutArchetype | undefined;

  const comicPages = scenes.map((sc: any) => {
    const scId = sc.id || `sc_${sc.index}`;
    const scObj = formattedScenesById.get(scId) || {};
    const scShots: any[] = Array.isArray(scObj.shots) ? scObj.shots : [];
    const pagePanels: any[] = [];

    for (let sIdx = 0; sIdx < scShots.length; sIdx++) {
      const sh = scShots[sIdx];
      const shStart = Number(sh.startSec || 0);
      const shEnd = Math.max(shStart + 0.5, Number(sh.endSec || shStart + 3));
      const shDur = shEnd - shStart;

      // Expand any long dialogue lines into breath-sized comic clauses (<= 110 chars)
      const expandedClauses: Array<{
        speaker: string;
        speakerRefId: string;
        parenthetical: string;
        text: string;
        startSec: number;
        endSec: number;
      }> = [];

      const rawDlg: any[] = Array.isArray(sh.dialogue) ? sh.dialogue : [];
      for (const d of rawDlg) {
        const clauses = splitSpokenLineIntoComicClauses(d.text || '', 110);
        const dStart = Number(d.startSec ?? shStart);
        const dEnd = Number(d.endSec ?? shEnd);
        const cDur = Math.max(0.4, (dEnd - dStart) / Math.max(1, clauses.length));
        clauses.forEach((clauseText, cIdx) => {
          expandedClauses.push({
            speaker: d.speaker || 'SPEAKER',
            speakerRefId: d.speakerRefId || '',
            parenthetical: cIdx === 0 ? d.parenthetical || '' : '',
            text: clauseText,
            startSec: dStart + cIdx * cDur,
            endSec: dStart + (cIdx + 1) * cDur,
          });
        });
      }

      // Group clauses into max 2 compact balloons per sequential beat panel so we NEVER obscure the artwork!
      const clauseGroups: Array<typeof expandedClauses> = [];
      if (expandedClauses.length === 0) {
        clauseGroups.push([]);
      } else {
        for (let i = 0; i < expandedClauses.length; i += 2) {
          clauseGroups.push(expandedClauses.slice(i, i + 2));
        }
      }

      const subBeatCount = clauseGroups.length;
      const subBeatDur = shDur / subBeatCount;

      clauseGroups.forEach((group, subIdx) => {
        globalComicPanelNum++;
        const pNumOnPage = pagePanels.length + 1;
        const beatStart = shStart + subIdx * subBeatDur;
        const beatEnd = beatStart + subBeatDur;
        const midSec = 0.5 * (beatStart + beatEnd);
        const muxFrame = muxPlaybackId
          ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=${midSec.toFixed(1)}&width=960`
          : sh.stillUrl || coverImageUrl;

        const captionObj =
          subIdx === 0
            ? transliterateActionToComicCaption(
                sh.action || '',
                scObj.slugline || '',
                pNumOnPage === 1,
                group.length >= 2
              )
            : null;

        const bubbles = group.map((g, bIdx) => ({
          id: `bub_${sh.id}_${subIdx + 1}_${bIdx + 1}`,
          speaker: g.speaker,
          speakerRefId: g.speakerRefId,
          parenthetical: g.parenthetical,
          text: g.text,
          style: 'speech',
          startSec: g.startSec,
          endSec: g.endSec,
          anchorCorner: bIdx === 0 ? 'top-left' : 'bottom-right',
          x: bIdx === 0 ? 8 : 56,
          y: bIdx === 0 ? 10 : 72,
        }));

        pagePanels.push({
          id: subBeatCount > 1 ? `pan_${sh.id}_b${subIdx + 1}` : `pan_${sh.id}`,
          panelNumber: pNumOnPage,
          globalPanelNumber: globalComicPanelNum,
          shotId: sh.id,
          subBeatIndex: subIdx + 1,
          subBeatTotal: subBeatCount,
          framing: subIdx === 0 ? sh.framing || 'MS' : subIdx % 2 === 1 ? 'MCU' : 'CU',
          camera: sh.camera || 'Static',
          startSec: beatStart,
          endSec: beatEnd,
          caption: captionObj
            ? captionObj.header
              ? `${captionObj.header} — ${captionObj.body}`
              : captionObj.body
            : '',
          description: sh.action || '',
          prompt: sh.still || '',
          imageUrl: muxFrame,
          fallbackImageUrl: sh.stillUrl || coverImageUrl,
          videoLoopUrl: muxPlaybackId
            ? `https://stream.mux.com/${muxPlaybackId}/low.mp4#t=${beatStart.toFixed(1)},${Math.min(beatEnd, beatStart + 5).toFixed(1)}`
            : '',
          bubbles,
        });
      });
    }

    const layoutArchetype = selectEditorialPageLayout(
      sc.index || 1,
      scObj.emotionalTone || '',
      pagePanels.length,
      prevLayout
    );
    prevLayout = layoutArchetype;

    return {
      id: `cpage_${sc.index}`,
      pageNumber: sc.index,
      sceneId: scId,
      act: scObj.act || 1,
      title: scObj.title || `Page ${sc.index}`,
      slugline: scObj.slugline || '',
      summary: scObj.summary || '',
      tone: scObj.emotionalTone || '',
      layoutArchetype,
      timecode: `${formatTimecode(scObj.startSec || 0)} – ${formatTimecode(scObj.endSec || 0)}`,
      panelCount: pagePanels.length,
      panels: pagePanels,
    };
  });

  const totalComicPanels = comicPages.reduce((acc, p) => acc + p.panelCount, 0);

  const graphicNovelItem = {
    id: `cmc_storyintel_${albumId}`,
    title: `${title} — Complete Graphic Novel (${comicPages.length} Pages · ${totalComicPanels} Panels)`,
    status: 'Final',
    format: 'Living Graphic Novel (Council V4)',
    creatorOwnerId: ownerId,
    pageCount: comicPages.length,
    panelCount: totalComicPanels,
    dialogueCount: totalDialogue,
    coverImageUrl,
    pages: comicPages,
    updatedAt: now,
  };

  if (!prod) {
    prod = {
      id: prodId,
      title,
      type: 'film',
      description: report.synopsis || report.logline || '',
      logline: report.logline || '',
      synopsis: report.synopsis || '',
      themes: (report.themes || []).join(', '),
      world: worldId || '',
      format: 'Feature Film',
      genre: (report.themes || []).slice(0, 3).join(' / ') || 'Cinema',
      status: 'Post / Reverse Script',
      worldId: worldId || undefined,
      sourceAlbumId: albumId,
      creatorOwnerId: ownerId,
      muxPlaybackId,
      streamUrl,
      coverImageUrl,
      defaults: defaultFormat,
      createdAt: now,
      updatedAt: now,
      tracks: projectTracks,
      acts,
      edits: [masterEditItem, sceneAssemblyEditItem],
      cast,
      bins,
      worldCats: {
        environments: places.filter((p) => p.kind === 'EXT'),
        places,
        props,
        logic: [],
        lore,
        sets: places.filter((p) => p.kind === 'INT'),
        factions: [],
        rules: [],
      },
      design: {},
      mediaPool,
      screenplayFountain: fullFountain,
      artifacts: {
        scripts: [
          {
            id: `scr_storyintel_${albumId}`,
            title: `${title} — Reverse Screenplay`,
            status: 'Final',
            pages: Math.max(1, Math.round(totalDurationSec / 60)),
            fountain: fullFountain,
            updatedAt: now,
          },
        ],
        comics: [graphicNovelItem],
        books: [graphicNovelItem],
        decks: [],
        tracks: [],
        games: [],
        edits: [masterEditItem, sceneAssemblyEditItem],
      },
    };
  } else {
    prod.title = title || prod.title;
    prod.description = report.synopsis || prod.description || '';
    prod.logline = report.logline || prod.logline;
    prod.synopsis = report.synopsis || prod.synopsis;
    prod.worldId = worldId || prod.worldId;
    prod.sourceAlbumId = albumId;
    prod.creatorOwnerId = ownerId;
    prod.muxPlaybackId = muxPlaybackId || prod.muxPlaybackId;
    prod.streamUrl = streamUrl || prod.streamUrl;
    prod.defaults = prod.defaults || defaultFormat;
    prod.tracks = projectTracks;
    prod.acts = acts;
    prod.cast = cast;
    prod.bins = bins;
    prod.worldCats = {
      ...(prod.worldCats || {}),
      environments: places.filter((p) => p.kind === 'EXT'),
      places,
      props,
      lore,
      sets: places.filter((p) => p.kind === 'INT'),
    };
    prod.mediaPool = mediaPool;
    prod.screenplayFountain = fullFountain;
    prod.updatedAt = now;
    const existingEdits: any[] = Array.isArray(prod.edits) ? prod.edits : [];
    const filteredEdits = existingEdits.filter(
      (e) => e.id !== masterEditItem.id && e.id !== sceneAssemblyEditItem.id
    );
    prod.edits = [masterEditItem, sceneAssemblyEditItem, ...filteredEdits];
    prod.artifacts = prod.artifacts || {};
    prod.artifacts.edits = prod.edits;
    prod.artifacts.comics = [graphicNovelItem];
    prod.artifacts.books = [graphicNovelItem];
  }

  await idbSet(prodKey(prodId), prod);

  // Persist to Fabula Cloud for the active signed-in user as well (best-effort)
  try {
    await saveProjectCloud(prod);
  } catch {
    // local IndexedDB is already updated
  }

  // Update studio:index (supports both { list: [...] } and array formats)
  const rawIdx: any = await idbGet(INDEX_KEY);
  const parsedIdx = typeof rawIdx === 'string' ? JSON.parse(rawIdx) : rawIdx;
  const indexList: any[] = Array.isArray(parsedIdx)
    ? parsedIdx
    : Array.isArray(parsedIdx?.list)
    ? parsedIdx.list
    : [];
  const meta = {
    id: prod.id,
    title: prod.title,
    type: 'film',
    format: prod.format || 'Feature Film',
    genre: prod.genre || 'Cinema',
    logline: prod.logline || '',
    status: prod.status || 'Post / Reverse Script',
    worldId: prod.worldId || undefined,
    sceneCount: scenes.length,
    shotCount: totalShots,
    updated: now,
    updatedAt: now,
  };
  const nextIndex = [meta, ...indexList.filter((p) => p.id !== prod.id)];
  await idbSet(INDEX_KEY, { list: nextIndex });

  // Write handoff so Fabula opens directly into the Edit Mode -> Timecode Script tab
  await idbSet(HANDOFF_KEY, {
    prodId: prod.id,
    editId: masterEditItem.id,
    editWs: targetWorkspace,
    mode: 'edit',
    artifactKind: 'edits',
    artifactId: masterEditItem.id,
    ts: now,
  });

  if (openInFabula && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('OPEN_FABULA', {
        detail: {
          prodId: prod.id,
          albumId,
          editId: masterEditItem.id,
          editWs: targetWorkspace,
        },
      })
    );
  }

  return {
    prodId,
    sceneCount: scenes.length,
    shotCount: totalShots,
    dialogueCount: totalDialogue,
    castCount: cast.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PLAJAH WORLD AUTO-POPULATION & CROSS-MOVIE UNIVERSE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface UniverseSyncOptions {
  albumId: string;
  ownerId: string;
  title: string;
  report: StoryReport;
  coverImageUrl?: string;
  targetWorldId?: string;
  publishImmediately?: boolean;
}

export interface UniverseMatchCandidate {
  world: IPWorld;
  score: number;
  sharedCharacters: string[];
  sharedLocations: string[];
  sharedThemes: string[];
}

export interface UniverseSyncResult {
  worldId: string;
  worldName: string;
  isExistingUniverse: boolean;
  matchScore: number;
  sharedCharacters: string[];
  sharedLocations: string[];
  charactersSynced: number;
  loreSynced: number;
  crossMovieCharacterIds: string[];
}

/**
 * Evaluates all existing `IPWorld` universes owned by `ownerId` to determine if
 * the analyzed film belongs to an existing cinematic universe.
 *
 * Scoring signals:
 *   - Canonical or alias (`aka`) character match: +35 pts (+50 pts for MAIN/SUPPORTING)
 *   - Shared location name: +20 pts
 *   - Shared MacGuffin / prop: +20 pts
 *   - Shared narrative themes / keywords: up to +25 pts
 */
export async function findMatchingUniverseForReport(
  ownerId: string,
  title: string,
  report: StoryReport
): Promise<UniverseMatchCandidate | null> {
  const worlds = await fetchUserWorlds(ownerId);
  if (!worlds.length) return null;

  const reportCharNames = new Map<string, StoryReportCharacter>();
  for (const c of report.characters || []) {
    if (norm(c.name)) reportCharNames.set(norm(c.name), c);
    for (const alias of c.aka || []) {
      if (norm(alias)) reportCharNames.set(norm(alias), c);
    }
  }

  const reportLocNames = new Set(
    (report.locations || []).map((l) => norm(l.name)).filter(Boolean)
  );
  const reportPropNames = new Set(
    (report.macguffins || []).map((m) => norm(m.name)).filter(Boolean)
  );
  const reportThemeTokens = new Set(
    (report.themes || [])
      .flatMap((t) => norm(t).split(' '))
      .filter((w) => w.length >= 4)
  );

  let best: UniverseMatchCandidate | null = null;

  for (const world of worlds) {
    let score = 0;
    const sharedCharacters: string[] = [];
    const sharedLocations: string[] = [];
    const sharedThemes: string[] = [];

    // Direct title/world-name stem match (e.g. "Pumpkin Patch" <-> "Pumpkin Patch Universe")
    const cleanTitle = norm(title.replace(/\(.*?\)/g, ''));
    const cleanWorld = norm(world.name.replace(/universe|world|chronicles/gi, ''));
    if (
      cleanTitle &&
      cleanWorld &&
      (cleanTitle.includes(cleanWorld) || cleanWorld.includes(cleanTitle))
    ) {
      score += 45;
    }

    const [worldChars, worldLore] = await Promise.all([
      fetchWorldCharacters(world.id, false),
      fetchWorldLore(world.id, false),
    ]);

    for (const wc of worldChars as any[]) {
      const nName = norm(wc.name);
      const nAlias = norm(wc.alias);
      const matched =
        (nName && reportCharNames.get(nName)) ||
        (nAlias && reportCharNames.get(nAlias));
      if (matched) {
        sharedCharacters.push(wc.name);
        score += matched.tier === 'MAIN' || matched.tier === 'SUPPORTING' ? 50 : 35;
      }
    }

    for (const wl of worldLore) {
      const nTitle = norm(wl.title);
      if (!nTitle) continue;
      if (reportLocNames.has(nTitle)) {
        sharedLocations.push(wl.title);
        score += 20;
      } else if (reportPropNames.has(nTitle)) {
        sharedLocations.push(wl.title);
        score += 20;
      }
    }

    const worldTokens = new Set(
      norm(`${(world as any).tagline || ''} ${world.description || ''}`)
        .split(' ')
        .filter((w) => w.length >= 4)
    );
    Array.from(reportThemeTokens).forEach((tok) => {
      if (worldTokens.has(tok)) {
        sharedThemes.push(tok);
        score += 5;
      }
    });

    if (!best || score > best.score) {
      best = {
        world,
        score,
        sharedCharacters: Array.from(new Set(sharedCharacters)),
        sharedLocations: Array.from(new Set(sharedLocations)),
        sharedThemes: Array.from(new Set(sharedThemes)),
      };
    }
  }

  // Require a meaningful affinity score (>= 30) to auto-connect two movies into the same universe
  return best && best.score >= 30 ? best : null;
}

/**
 * Populates Plajah World entries (`Character`, `LoreEntry` for locations, MacGuffins,
 * and themes) from a movie's `StoryReport`, resolves cross-movie universe membership,
 * merges recurring crossover characters so they share a single canonical `Character.id`
 * across all of the creator's films, and stamps `worldId` + `characterIds` onto the
 * Firestore `albums/{albumId}` and `videos` documents.
 */
export async function syncStoryReportToWorldAndUniverse(
  opts: UniverseSyncOptions
): Promise<UniverseSyncResult> {
  const {
    albumId,
    ownerId,
    title,
    report,
    coverImageUrl = '',
    targetWorldId,
    publishImmediately = true,
  } = opts;

  if (!canAccessStoryIntelTools(ownerId)) {
    throw new Error(
      'Creator Exclusivity: Plajah World sync from Story Intelligence can only be run on your own creations.'
    );
  }

  let world: IPWorld | null = null;
  let isExistingUniverse = false;
  let matchScore = 0;
  let sharedCharacters: string[] = [];
  let sharedLocations: string[] = [];

  if (targetWorldId) {
    const worlds = await fetchUserWorlds(ownerId);
    world = worlds.find((w) => w.id === targetWorldId) || null;
    if (world) {
      isExistingUniverse = true;
      matchScore = 100;
    }
  }

  if (!world) {
    const match = await findMatchingUniverseForReport(ownerId, title, report);
    if (match) {
      world = match.world;
      isExistingUniverse = true;
      matchScore = match.score;
      sharedCharacters = match.sharedCharacters;
      sharedLocations = match.sharedLocations;
    }
  }

  const cleanBaseTitle = title.replace(/\s*\(.*?\)\s*/g, '').trim() || title;

  if (!world) {
    world = await createIPWorld({
      creatorId: ownerId,
      name: `${cleanBaseTitle} Universe`,
      description: report.synopsis || report.logline || `Cinematic universe of ${title}`,
      coverImage: coverImageUrl || '',
      worldType: 'FICTION',
      status: publishImmediately ? 'PUBLISHED' : 'DRAFT',
      themeConfig: {
        primaryColor: '#FF8C00',
        secondaryColor: '#8b5cf6',
        backgroundId: '',
        useFrostedGlassDefault: true,
      },
    });
  }

  // Resolve portrait URLs for characters and locations
  const stillUrlMap = new Map<string, string>();
  await Promise.all(
    (report.stills || []).slice(0, 30).map(async (st) => {
      try {
        const u = await stillUrl(ownerId, albumId, st.path);
        if (u) stillUrlMap.set(st.id, u);
      } catch {
        // ignore
      }
    })
  );

  const syncSource: SyncSource = {
    app: 'FABULA',
    projectId: albumId,
  };

  const incomingCharacters: IncomingCharacter[] = (report.characters || []).map(
    (c: any) => {
      const role: Character['role'] =
        c.tier === 'MAIN'
          ? 'Protagonist'
          : c.tier === 'SUPPORTING'
          ? 'Deuteragonist'
          : 'Supporting';
      return {
        refId: c.refId || slugify(c.name),
        name: c.name,
        role,
        bio: c.description || '',
        imageUrl:
          c.imageUrl ||
          (c.portraitStillId && stillUrlMap.get(c.portraitStillId)) ||
          (c.stillIds?.[0] && stillUrlMap.get(c.stillIds[0])) ||
          stillUrlMap.get(`${c.refId}_portrait`) ||
          coverImageUrl ||
          '',
        tags: ['story-intel', c.tier, ...(c.aka || [])].filter(Boolean),
      };
    }
  );

  const incomingLore: IncomingLore[] = [
    ...(report.locations || []).map((loc: any) => ({
      refId: `loc_${loc.refId || slugify(loc.name)}`,
      title: loc.name,
      type: 'LOCATION' as const,
      content: `${loc.kind || loc.intExt || 'EXT'}. ${loc.name} — ${loc.description || ''}${
        loc.sceneIds?.length ? ` (Featured in scenes: ${loc.sceneIds.join(', ')})` : ''
      }`,
      imageUrl:
        loc.imageUrl ||
        (loc.stillIds?.[0] && stillUrlMap.get(loc.stillIds[0])) ||
        stillUrlMap.get(`${loc.refId}_still`) ||
        '',
      tags: ['story-intel', 'location'],
    })),
    ...(report.macguffins || []).map((m: any) => ({
      refId: `item_${m.refId || slugify(m.name)}`,
      title: m.name,
      type: 'ITEM' as const,
      content: `${m.description || ''} [Role: ${m.narrativeRole || 'KEY_PROP'}]${
        m.sceneIds?.length ? ` (Scenes: ${m.sceneIds.join(', ')})` : ''
      }`,
      imageUrl:
        m.imageUrl ||
        (m.stillIds?.[0] && stillUrlMap.get(m.stillIds[0])) ||
        stillUrlMap.get(`${m.refId}_still`) ||
        '',
      tags: ['story-intel', (m.narrativeRole || 'prop').toLowerCase()],
    })),
  ];

  await upsertEntities(world.id, syncSource, {
    characters: incomingCharacters,
    lore: incomingLore,
  });

  if (publishImmediately) {
    await publishSource(world.id, 'FABULA', albumId);
  }

  // Auto-merge duplicate characters across movies in the same universe so crossover
  // characters share a single canonical Character ID across films!
  try {
    const dupGroups = await detectDuplicates(world.id);
    for (const group of dupGroups) {
      if (group.kind === 'character' && group.entries.length > 1) {
        const primary = group.entries[0];
        const dupIds = group.entries.slice(1).map((d) => d.id);
        await mergeEntries(world.id, 'character', primary.id, dupIds);
      }
    }
  } catch (err) {
    console.warn('[storyIntelBridge] Duplicate character merge skipped:', err);
  }

  // Fetch canonical world characters & record cross-movie appearances
  const canonicalWorldChars = await fetchWorldCharacters(world.id, false);
  const canonicalCharIdsForFilm: string[] = [];

  for (const wc of canonicalWorldChars as any[]) {
    if (wc.discarded) continue;
    const nName = norm(wc.name);
    const nAlias = norm(wc.alias);
    const matchesReport = (report.characters || []).some(
      (rc) =>
        norm(rc.name) === nName ||
        (nAlias && norm(rc.name) === nAlias) ||
        (rc.aka || []).some((a) => norm(a) === nName)
    );
    if (matchesReport) {
      canonicalCharIdsForFilm.push(wc.id);
      if (publishImmediately && wc.isPublished === false) {
        await updateCharacter(wc.id, {
          worldId: world.id,
          isPublished: true,
        } as any).catch(() => {});
      }
    }
  }

  // Link asset and canonical characterIds to the World document
  await addAssetToWorld(world.id, albumId).catch(() => {});
  if (canonicalCharIdsForFilm.length > 0) {
    await addCharactersToWorld(world.id, canonicalCharIdsForFilm).catch(() => {});
  }

  // Stamp worldId and canonical characterIds onto albums/{albumId} and any matching videos doc
  try {
    await setDoc(
      doc(db, 'albums', albumId),
      {
        worldId: world.id,
        characterIds: canonicalCharIdsForFilm,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[storyIntelBridge] Could not patch albums doc with worldId:', err);
  }

  try {
    const vSnap = await getDocs(
      query(collection(db, 'videos'), where('albumId', '==', albumId))
    );
    for (const vDoc of vSnap.docs) {
      await updateDoc(doc(db, 'videos', vDoc.id), {
        worldId: world.id,
        characterIds: canonicalCharIdsForFilm,
      });
    }
  } catch {
    // ignore if no videos doc
  }

  // Ensure world is published if requested
  if (publishImmediately) {
    await updateIPWorld(world.id, { status: 'PUBLISHED' }).catch(() => {});
  }

  return {
    worldId: world.id,
    worldName: world.name,
    isExistingUniverse,
    matchScore,
    sharedCharacters,
    sharedLocations,
    charactersSynced: incomingCharacters.length,
    loreSynced: incomingLore.length,
    crossMovieCharacterIds: canonicalCharIdsForFilm,
  };
}
