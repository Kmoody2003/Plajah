// comicScript — turn a script into laid-out comic panels via Cinema-to-Graphic-Novel Transliteration.
//
// Act as a veteran Graphic Novel Editor (Writers Council + Comic & Art Council):
// 1. Transliterates film/stage directions rather than dumping camera jargon ("Wide Shot of...",
//    "The camera pans...", "CUT TO:") into comic caption boxes.
// 2. Breaks long dialogue strings into breath-sized comic clauses (<= 105 chars / ~18 words)
//    across sequential panels so speech balloons never obscure the panel artwork.
// 3. Chooses dynamic, story-driven editorial page layouts (diagonal slashes, inset reveals,
//    asymmetric widescreen + reaction strips, interlocking L-wraps) instead of boring uniform grids.
import { v4 as uuidv4 } from 'uuid';
import type { StudioPage, StudioPanel, SpeechBubble } from '../types';
import { layoutsFor, type LayoutPanelSpec } from '../data/comicLayouts';
import {
  splitSpokenLineIntoComicClauses,
  transliterateActionToComicCaption,
  computeSafeBalloonPlacement,
  type SafeAnchorZone,
} from './council/comicMangaCouncil';
import {
  parsePanelTimecode,
  formatPanelTimecode,
  extractMuxPlaybackId,
  getPanelOverrideById,
  DEFAULT_PUMPKIN_PATCH_MUX_ID,
  DEFAULT_PUMPKIN_PATCH_STREAM_URL,
} from './comicVideoLoopEngine';

export interface ScriptBeat {
  kind: 'dialogue' | 'caption' | 'sfx';
  character?: string;
  text: string;
  imageUrl?: string;
  newPanel?: boolean;   // an explicit PANEL/PAGE break started this beat
}

export interface ScriptCharacter { name: string; imageUrl?: string; look?: string; role?: string; }

const PANEL_BREAK = /^(panel|page|scene|shot)\b|^[-–—=*]{3,}$/i;
const SLUGLINE = /^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*(.+)$/i;
const CAMERA_ONLY_DIRECTION = /^(?:cut\s+to|smash\s+cut|dissolve\s+to|fade\s+in|fade\s+out|angle\s+on|back\s+to|continuous)\b/i;
const DIALOGUE = /^([A-Z][A-Z0-9 .'’\-]{0,28}?)\s*(?:\([^)]*\))?:\s*(.+)$/;   // NAME: line
const SFX = /^(?:sfx|sound)\s*:\s*(.+)$/i;
const CAPTION = /^(?:caption|narration|narr|cap)\s*:\s*(.+)$/i;
const IMAGE_TAG = /^(?:image|art|still|frame)\s*:\s*(\S+)$/i;

/**
 * Parse raw script text into ordered Graphic Novel beats:
 * - Strips pure camera/editing transitions ("CUT TO:", "ANGLE ON:")
 * - Transliterates scene sluglines into location anchor captions
 * - Splits long spoken dialogue lines into breath-sized sequential comic clauses
 *   so no single balloon ever becomes a wall of text covering the art.
 */
export function parseScript(text: string): ScriptBeat[] {
  const beats: ScriptBeat[] = [];
  let pendingBreak = false;
  let pendingImageUrl: string | undefined;
  let currentSlugline = '';
  let isFirstBeatOfScene = true;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const imgMatch = line.match(IMAGE_TAG);
    if (imgMatch) {
      pendingImageUrl = imgMatch[1].trim();
      continue;
    }

    if (CAMERA_ONLY_DIRECTION.test(line)) {
      continue;
    }

    const slugMatch = line.match(SLUGLINE);
    if (slugMatch) {
      currentSlugline = slugMatch[1].replace(/\s*-\s*/g, ' // ').trim();
      isFirstBeatOfScene = true;
      pendingBreak = true;
      continue;
    }

    if (PANEL_BREAK.test(line)) {
      pendingBreak = true;
      const desc = line.split(':').slice(1).join(':').trim();
      if (desc) {
        const capObj = transliterateActionToComicCaption(desc, currentSlugline, isFirstBeatOfScene, false);
        if (capObj) {
          beats.push({
            kind: 'caption',
            text: capObj.header ? `${capObj.header}: ${capObj.body}` : capObj.body,
            imageUrl: pendingImageUrl,
            newPanel: true,
          });
          pendingBreak = false;
          isFirstBeatOfScene = false;
        }
      }
      continue;
    }

    const sfx = line.match(SFX);
    const cap = line.match(CAPTION);
    const dlg = line.match(DIALOGUE);

    if (sfx) {
      beats.push({
        kind: 'sfx',
        text: sfx[1].trim(),
        imageUrl: pendingImageUrl,
        newPanel: pendingBreak,
      });
      pendingBreak = false;
    } else if (cap) {
      const capObj = transliterateActionToComicCaption(cap[1].trim(), currentSlugline, isFirstBeatOfScene, false);
      const cleanCap = capObj
        ? capObj.header
          ? `${capObj.header}: ${capObj.body}`
          : capObj.body
        : cap[1].trim().slice(0, 95);
      beats.push({
        kind: 'caption',
        text: cleanCap,
        imageUrl: pendingImageUrl,
        newPanel: pendingBreak,
      });
      pendingBreak = false;
      isFirstBeatOfScene = false;
    } else if (dlg && dlg[2]) {
      const speaker = dlg[1].trim();
      const rawSpeech = dlg[2].replace(/^["“]|["”]$/g, '').trim();
      // Split long dialogue strings into breath-sized comic clauses (<= 100 chars)
      // and force a panel break after every 2 clauses so balloons never obscure the art!
      const clauses = splitSpokenLineIntoComicClauses(rawSpeech, 100);
      clauses.forEach((clauseText, idx) => {
        beats.push({
          kind: 'dialogue',
          character: speaker,
          text: clauseText,
          imageUrl: pendingImageUrl,
          newPanel: idx === 0 ? pendingBreak : idx % 2 === 0,
        });
      });
      pendingBreak = false;
      isFirstBeatOfScene = false;
    } else {
      // Raw action description from a screenplay — transliterate it, stripping camera jargon!
      const capObj = transliterateActionToComicCaption(line, currentSlugline, isFirstBeatOfScene, false);
      if (capObj) {
        beats.push({
          kind: 'caption',
          text: capObj.header ? `${capObj.header} — ${capObj.body}` : capObj.body,
          imageUrl: pendingImageUrl,
          newPanel: pendingBreak,
        });
        pendingBreak = false;
        isFirstBeatOfScene = false;
      }
    }
  }
  return beats;
}

const bubbleTypeFor = (b: ScriptBeat): SpeechBubble['type'] => {
  if (b.kind === 'sfx') return 'sfx';
  if (b.kind === 'caption') return 'narration';
  if (b.text.endsWith('!') && b.text.length < 48) return 'shout';
  return 'speech';
};

/**
 * Group beats into panels like a real Comic Book Editor:
 * - Never allow more than 2 dialogue balloons in a single panel!
 * - Honor explicit `newPanel` breaks.
 */
function groupBeatsForEditorialPanels(beats: ScriptBeat[]): ScriptBeat[][] {
  const groups: ScriptBeat[][] = [];
  let currentGroup: ScriptBeat[] = [];
  let currentDialogueCount = 0;

  for (const b of beats) {
    const startsNew =
      b.newPanel ||
      (b.kind === 'dialogue' && currentDialogueCount >= 2) ||
      currentGroup.length >= 3;

    if (startsNew && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
      currentDialogueCount = 0;
    }
    currentGroup.push(b);
    if (b.kind === 'dialogue') currentDialogueCount++;
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

/**
 * Selects a dynamic, non-boring editorial layout template that matches the target panel count
 * and story energy (preferring diagonal slashes, cinematic asymmetric tiers, and inset reveals
 * over static rectangular grids).
 */
function selectDynamicLayoutSpecs(targetCount: number, isManga: boolean): LayoutPanelSpec[] {
  const all = layoutsFor(isManga);
  const dynamicIds = isManga
    ? ['manga-dynamic', 'manga-reaction', 'manga-action', 'manga-silence', 'manga-4', 'action-diagonal', 'cinematic-5']
    : ['action-diagonal', 'cinematic-5', 'hero-strip', 'inset-reveal', 'classic', 'manga-dynamic', 'manga-reaction'];

  // Prefer dynamic layouts with matching or close panel count
  for (const id of dynamicIds) {
    const found = all.find((l) => l.id === id && l.panels.length === targetCount);
    if (found) return found.panels;
  }

  if (targetCount <= 3) {
    const found = all.find((l) => l.id === (isManga ? 'manga-romance' : 'inset-reveal')) || all.find((l) => l.panels.length === 3);
    if (found) return found.panels;
  }
  if (targetCount === 4) {
    const found = all.find((l) => l.id === (isManga ? 'manga-action' : 'hero-strip'));
    if (found) return found.panels;
  }
  if (targetCount === 5) {
    const found = all.find((l) => l.id === (isManga ? 'manga-dynamic' : 'action-diagonal'));
    if (found) return found.panels;
  }

  // For 6+ panels on a dense page, build an asymmetric graphic-novel multi-tier layout
  // with diagonal cuts and varied aspect ratios rather than a uniform grid!
  const specs: LayoutPanelSpec[] = [];
  const tiers: number[] = [];
  let rem = Math.min(targetCount, 8);
  while (rem > 0) {
    if (tiers.length === 0) {
      tiers.push(1); // Widescreen establishing top tier
      rem -= 1;
    } else if (rem >= 3) {
      tiers.push(3);
      rem -= 3;
    } else {
      tiers.push(rem);
      rem = 0;
    }
  }
  const tierH = 100 / tiers.length;
  tiers.forEach((cols, tIdx) => {
    const y = tIdx * tierH;
    if (cols === 1) {
      specs.push({ x: 0, y, width: 100, height: tierH, shape: 'rect' });
    } else if (cols === 2) {
      specs.push({ x: 0, y, width: 54, height: tierH, shape: 'diag-right' });
      specs.push({ x: 54, y, width: 46, height: tierH, shape: 'diag-left' });
    } else {
      specs.push({ x: 0, y, width: 32, height: tierH, shape: 'rect' });
      specs.push({ x: 32, y, width: 38, height: tierH, shape: 'rect' });
      specs.push({ x: 70, y, width: 30, height: tierH, shape: 'rect' });
    }
  });
  return specs;
}

/**
 * Flow parsed beats onto a page's panels like a human Graphic Novel Editor:
 * - Automatically expands/re-choreographs the page's panel layout if the existing page
 *   has a boring layout or too few panels for the dialogue beats.
 * - Places speech balloons at opposite perimeter corners (top-left vs. bottom-right, width <= 44%)
 *   so the central character artwork is NEVER obscured.
 * - Auto-fills panel artwork from beat `imageUrl` or speaking character reference art.
 */
export function applyScriptToPage(
  page: StudioPage,
  beats: ScriptBeat[],
  opts: { isManga?: boolean; characters?: ScriptCharacter[]; assets?: { name: string; url: string }[] } = {},
): StudioPage {
  if (!beats.length) return page;
  const groups = groupBeatsForEditorialPanels(beats);
  const existingPanels = page.panels ?? [];

  // Re-choreograph panel layout if the page doesn't match the editorial beat count
  // or if it's using a basic 1-3 panel placeholder
  let workingPanels: StudioPanel[] = existingPanels;
  if (existingPanels.length < groups.length || existingPanels.length <= 2) {
    const specs = selectDynamicLayoutSpecs(groups.length, !!opts.isManga);
    workingPanels = specs.map((s, i) => ({
      id: existingPanels[i]?.id ?? uuidv4(),
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      shape: s.shape ?? 'rect',
      bgColor: existingPanels[i]?.bgColor ?? '#111111',
      imageUrl: existingPanels[i]?.imageUrl,
      bubbles: [],
      borderStyle: 'solid',
    }));
  }

  const order = opts.isManga
    ? [...workingPanels].sort((a, b) => (a.y !== b.y ? a.y - b.y : b.x - a.x))
    : [...workingPanels].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const charImg = new Map(
    (opts.characters ?? []).filter((c) => c.imageUrl).map((c) => [c.name.toLowerCase(), c.imageUrl!])
  );
  const assetUrls = (opts.assets ?? []).map((a) => a.url).filter(Boolean);

  const updated = new Map<string, StudioPanel>();
  order.forEach((panel, i) => {
    const group = groups[i] ?? [];
    if (!group.length) {
      updated.set(panel.id, panel);
      return;
    }
    const bubbles: SpeechBubble[] = [];
    let caption: string | undefined;
    let sfxText: string | undefined;
    let speaker: string | undefined;
    let beatImageUrl: string | undefined;
    let dlgSlotIdx = 0;
    const usedZones: SafeAnchorZone[] = [];

    for (const b of group) {
      if (b.imageUrl && !beatImageUrl) beatImageUrl = b.imageUrl;
      if (b.kind === 'sfx') {
        sfxText = b.text;
        continue;
      }
      if (b.kind === 'caption' && !b.character) {
        if (!caption) caption = b.text.slice(0, 95);
        continue;
      }
      if (b.character && !speaker) speaker = b.character;

      const safe = computeSafeBalloonPlacement({
        balloonIndex: dlgSlotIdx,
        totalBalloonsOnPanel: group.filter((g) => g.kind === 'dialogue').length,
        hasOpeningCaption: !!caption,
        framing: i === 0 ? 'WS' : dlgSlotIdx > 0 ? 'MCU' : 'MS',
        actionText: caption || '',
        alreadyUsedZones: usedZones,
      });
      usedZones.push(safe.anchorZone);
      dlgSlotIdx++;

      const tailMap: Record<typeof safe.tailDirection, SpeechBubble['tailDir']> = {
        'down-left': 'bl',
        'down-right': 'br',
        'up-left': 'tl',
        'up-right': 'tr',
      };

      bubbles.push({
        id: uuidv4(),
        type: bubbleTypeFor(b),
        text: b.text,
        originalScriptText: b.text,
        useAltTextLayer: false,
        character: b.character,
        x: safe.x,
        y: safe.y,
        width: safe.width,
        tailDir: tailMap[safe.tailDirection] || 'bl',
        fontSize: 10.5,
      });
    }

    // If the panel has 2 dialogue balloons, omit the caption bar so the art stays unobstructed
    if (bubbles.length >= 2) {
      caption = undefined;
    }

    let imageUrl = panel.imageUrl || beatImageUrl;
    if (!imageUrl && speaker) {
      const url = charImg.get(speaker.toLowerCase());
      if (url) imageUrl = url;
    }
    if (!imageUrl && assetUrls.length > 0) {
      imageUrl = assetUrls[i % assetUrls.length];
    }

    updated.set(panel.id, {
      ...panel,
      bubbles,
      caption,
      originalScriptCaption: caption,
      useAltCaptionLayer: false,
      captionPos: i === 0 ? 'top' : 'bottom',
      sfxText,
      originalScriptSfx: sfxText,
      useAltSfxLayer: false,
      textLayerMode: 'script',
      imageUrl,
    });
  });

  return { ...page, panels: workingPanels.map((p) => updated.get(p.id) ?? p) };
}

/** Distinct speaking characters found in a script (for a quick cast preview). */
export function charactersInScript(beats: ScriptBeat[]): string[] {
  const seen = new Set<string>();
  for (const b of beats) if (b.character) seen.add(b.character);
  return [...seen];
}

/**
 * Converts a Fabula / Story Intelligence multi-page Graphic Novel artifact (`prod.artifacts.comics[0].pages`)
 * into an array of interactive `StudioPage` objects for BookAuthoringStudio & ComicPanelBuilder.
 * Enforces:
 * - Dynamic non-repeating editorial layouts (diagonal slashes, hero strips, inset reveals, multi-tier cascades)
 * - Zero Face or Key-Action Obstruction on every speech balloon via `computeSafeBalloonPlacement`
 */
export function convertFabulaComicPagesToStudioPages(
  fabulaPages: any[],
  opts: { isManga?: boolean } = {}
): StudioPage[] {
  if (!Array.isArray(fabulaPages) || !fabulaPages.length) return [];

  return fabulaPages.map((fp, pageIdx) => {
    const rawPanels: any[] = Array.isArray(fp.panels) ? rpList(fp.panels) : [];
    function rpList(arr: any[]) { return arr; }
    const specs = selectDynamicLayoutSpecs(Math.max(1, rawPanels.length), !!opts.isManga);

    // If rawPanels has more panels than specs (e.g. > 8 panels on a dense scene page),
    // generate an asymmetric multi-tier graphic novel layout that fits every panel cleanly.
    const layoutSpecs: LayoutPanelSpec[] =
      rawPanels.length <= specs.length
        ? specs
        : (() => {
            const custom: LayoutPanelSpec[] = [];
            const total = rawPanels.length;
            const rows: number[] = [];
            let rem = total;
            while (rem > 0) {
              if (rows.length === 0) {
                rows.push(Math.min(2, rem));
                rem -= Math.min(2, rem);
              } else if (rem >= 3) {
                rows.push(3);
                rem -= 3;
              } else {
                rows.push(rem);
                rem = 0;
              }
            }
            const rH = 100 / rows.length;
            rows.forEach((cols, rIdx) => {
              const y = rIdx * rH;
              if (cols === 1) {
                custom.push({ x: 0, y, width: 100, height: rH, shape: 'rect' });
              } else if (cols === 2) {
                const diag = (rIdx + pageIdx) % 2 === 0;
                custom.push({ x: 0, y, width: 52, height: rH, shape: diag ? 'diag-right' : 'rect' });
                custom.push({ x: 52, y, width: 48, height: rH, shape: diag ? 'diag-left' : 'rect' });
              } else {
                custom.push({ x: 0, y, width: 33, height: rH, shape: 'rect' });
                custom.push({ x: 33, y, width: 34, height: rH, shape: 'rect' });
                custom.push({ x: 67, y, width: 33, height: rH, shape: 'rect' });
              }
            });
            return custom;
          })();

    const studioPanels: StudioPanel[] = rawPanels.map((rp, pIdx) => {
      const spec = layoutSpecs[pIdx] || { x: 0, y: 0, width: 50, height: 33, shape: 'rect' };
      const rawBubbles: any[] = Array.isArray(rp.bubbles) ? rp.bubbles : [];
      const hasOpeningCaption = !!(rp.caption && rawBubbles.length < 2);
      const usedZones: SafeAnchorZone[] = [];

      const panelId = rp.id || `panel_p${fp.pageNumber || pageIdx + 1}_${rp.panelNumber || pIdx + 1}`;
      const savedOverride = getPanelOverrideById(panelId);

      const bubbles: SpeechBubble[] = rawBubbles.slice(0, 2).map((rb, bIdx) => {
        const safe = computeSafeBalloonPlacement({
          balloonIndex: bIdx,
          totalBalloonsOnPanel: Math.min(2, rawBubbles.length),
          hasOpeningCaption,
          framing: rp.framing || (pIdx === 0 ? 'WS' : 'MCU'),
          actionText: rp.description || rp.caption || '',
          alreadyUsedZones: usedZones,
        });
        usedZones.push(safe.anchorZone);

        const tailMap: Record<typeof safe.tailDirection, SpeechBubble['tailDir']> = {
          'down-left': 'bl',
          'down-right': 'br',
          'up-left': 'tl',
          'up-right': 'tr',
        };

        const scriptText = rb.originalScriptText ?? rb.text ?? '';
        const savedBubble = Array.isArray(savedOverride?.bubbles)
          ? savedOverride!.bubbles[bIdx]
          : undefined;
        const useAlt = savedBubble?.useAltTextLayer ?? rb.useAltTextLayer ?? false;
        const altTxt = savedBubble?.altText ?? rb.altText;

        return {
          id: savedBubble?.id || rb.id || `${panelId}_b${bIdx + 1}`,
          type:
            savedBubble?.type ||
            (rb.style === 'shout'
              ? 'shout'
              : rb.style === 'whisper'
              ? 'whisper'
              : rb.style === 'thought'
              ? 'thought'
              : 'speech'),
          text: useAlt && altTxt !== undefined ? altTxt : scriptText,
          originalScriptText: scriptText,
          altText: altTxt,
          useAltTextLayer: useAlt,
          character: savedBubble?.character ?? rb.speaker ?? undefined,
          x: typeof savedBubble?.x === 'number' ? savedBubble.x : typeof rb.x === 'number' ? rb.x : safe.x,
          y: typeof savedBubble?.y === 'number' ? savedBubble.y : typeof rb.y === 'number' ? rb.y : safe.y,
          width:
            typeof savedBubble?.width === 'number'
              ? savedBubble.width
              : typeof rb.width === 'number'
              ? rb.width
              : safe.width,
          scale: savedBubble?.scale ?? rb.scale ?? 1,
          tailDir: savedBubble?.tailDir || tailMap[safe.tailDirection] || 'bl',
          fontSize: savedBubble?.fontSize ?? 10,
        };
      });

      const rawImg = rp.imageUrl || rp.fallbackImageUrl || undefined;
      // Extract timecode in seconds from rp.timecodeSeconds, rp.timecode, or ?time=X in URL
      const urlTimeMatch = rawImg?.match(/[?&]time=([0-9.]+)/);
      const baseTimeSec =
        typeof rp.timecodeSeconds === 'number'
          ? rp.timecodeSeconds
          : urlTimeMatch
          ? parseFloat(urlTimeMatch[1])
          : parsePanelTimecode(rp.timecode || fp.timecodeRange) + pIdx * 4.5;

      const effectiveTimeSec = savedOverride?.timecodeSeconds ?? baseTimeSec;
      const muxId = extractMuxPlaybackId(rawImg, rp.muxPlaybackId || DEFAULT_PUMPKIN_PATCH_MUX_ID);

      const origCap = hasOpeningCaption ? rp.caption : undefined;
      const useAltCap = savedOverride?.useAltCaptionLayer ?? false;
      const altCap = savedOverride?.altCaption;

      return {
        id: panelId,
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        shape: (savedOverride?.shape as any) ?? spec.shape ?? 'rect',
        bgColor: '#111111',
        imageUrl: savedOverride?.imageUrl || rawImg,
        bubbles:
          Array.isArray(savedOverride?.bubbles) && savedOverride!.bubbles.length > bubbles.length
            ? savedOverride!.bubbles
            : bubbles,
        caption: useAltCap && altCap !== undefined ? altCap : origCap,
        originalScriptCaption: origCap,
        altCaption: altCap,
        useAltCaptionLayer: useAltCap,
        captionPos: pIdx === 0 ? 'top' : 'bottom',
        captionX: savedOverride?.captionX,
        captionY: savedOverride?.captionY,
        captionWidth: savedOverride?.captionWidth,
        sfxText:
          savedOverride?.useAltSfxLayer && savedOverride?.altSfx !== undefined
            ? savedOverride.altSfx
            : savedOverride?.sfxText ?? rp.sfxText,
        originalScriptSfx: rp.sfxText,
        altSfx: savedOverride?.altSfx,
        useAltSfxLayer: savedOverride?.useAltSfxLayer ?? false,
        sfxX: savedOverride?.sfxX,
        sfxY: savedOverride?.sfxY,
        textLayerMode: savedOverride?.textLayerMode ?? 'script',
        borderStyle: (savedOverride?.borderStyle as any) ?? 'solid',
        aiPrompt: rp.description || rp.caption || '',
        timecodeSeconds: effectiveTimeSec,
        anchorTimecodeSeconds: baseTimeSec,
        timecode: savedOverride?.timecode || rp.timecode || formatPanelTimecode(effectiveTimeSec),
        sourceVideoUrl: rp.sourceVideoUrl || DEFAULT_PUMPKIN_PATCH_STREAM_URL,
        muxPlaybackId: muxId,
        imageOffsetX: savedOverride?.imageOffsetX ?? rp.imageOffsetX ?? 0,
        imageOffsetY: savedOverride?.imageOffsetY ?? rp.imageOffsetY ?? 0,
        imageScale: savedOverride?.imageScale ?? rp.imageScale ?? 1,
        isVideoLoop: savedOverride?.isVideoLoop ?? rp.isVideoLoop ?? false,
        loopInSeconds: savedOverride?.loopInSeconds ?? rp.loopInSeconds ?? effectiveTimeSec,
        loopOutSeconds: savedOverride?.loopOutSeconds ?? rp.loopOutSeconds ?? +(effectiveTimeSec + 4).toFixed(2),
        cinemagraphMode: savedOverride?.cinemagraphMode ?? rp.cinemagraphMode ?? 'loop',
      };
    });

    return {
      id: fp.id || uuidv4(),
      order: pageIdx,
      type: opts.isManga ? 'MANGA' : 'COMIC',
      chapterTitle: `Page ${fp.pageNumber || pageIdx + 1} · ${fp.title || fp.slugline || ''}`.trim(),
      panels: studioPanels,
      panelGutter: 6,
      colorMode: 'color',
    };
  });
}


