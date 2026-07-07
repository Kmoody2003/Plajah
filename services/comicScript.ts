// comicScript — turn a script into laid-out comic panels.
//
// Parses a character-tagged script (works for a Lorea book excerpt or a Fabula scene
// export) into beats, then auto-flows them onto a page's panels as speech bubbles,
// captions and SFX — keyed by character. If a beat's speaker has a reference image
// (e.g. a Fabula world character), it can auto-fill an empty panel.
import { v4 as uuidv4 } from 'uuid';
import type { StudioPage, StudioPanel, SpeechBubble } from '../types';

export interface ScriptBeat {
  kind: 'dialogue' | 'caption' | 'sfx';
  character?: string;
  text: string;
  newPanel?: boolean;   // an explicit PANEL/PAGE break started this beat
}

export interface ScriptCharacter { name: string; imageUrl?: string; }

const PANEL_BREAK = /^(panel|page|scene)\b|^[-–—=*]{3,}$/i;
const DIALOGUE = /^([A-Z][A-Z0-9 .'’\-]{0,28}?)\s*(?:\([^)]*\))?:\s*(.+)$/;   // NAME: line
const SFX = /^(?:sfx|sound)\s*:\s*(.+)$/i;
const CAPTION = /^(?:caption|narration|narr|cap)\s*:\s*(.+)$/i;

/** Parse raw script text into ordered beats with panel-break markers. */
export function parseScript(text: string): ScriptBeat[] {
  const beats: ScriptBeat[] = [];
  let pendingBreak = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (PANEL_BREAK.test(line)) {
      pendingBreak = true;
      // A "PANEL 1: description" line may also carry a caption after the colon.
      const desc = line.split(':').slice(1).join(':').trim();
      if (desc) { beats.push({ kind: 'caption', text: desc, newPanel: true }); pendingBreak = false; }
      continue;
    }
    let beat: ScriptBeat;
    const sfx = line.match(SFX);
    const cap = line.match(CAPTION);
    const dlg = line.match(DIALOGUE);
    if (sfx) beat = { kind: 'sfx', text: sfx[1].trim() };
    else if (cap) beat = { kind: 'caption', text: cap[1].trim() };
    else if (dlg && dlg[2]) beat = { kind: 'dialogue', character: dlg[1].trim(), text: dlg[2].trim() };
    else beat = { kind: 'caption', text: line };
    if (pendingBreak) { beat.newPanel = true; pendingBreak = false; }
    beats.push(beat);
  }
  return beats;
}

const bubbleTypeFor = (b: ScriptBeat): SpeechBubble['type'] =>
  b.kind === 'sfx' ? 'sfx' : b.kind === 'caption' ? 'narration' : 'speech';

// Split beats into one group per panel: honor explicit PANEL breaks, else chunk evenly.
function groupBeats(beats: ScriptBeat[], panelCount: number): ScriptBeat[][] {
  const hasBreaks = beats.some(b => b.newPanel);
  if (hasBreaks) {
    const groups: ScriptBeat[][] = [];
    for (const b of beats) { if (b.newPanel || groups.length === 0) groups.push([]); groups[groups.length - 1].push(b); }
    return groups;
  }
  const n = Math.max(1, panelCount);
  const per = Math.ceil(beats.length / n);
  const groups: ScriptBeat[][] = [];
  for (let i = 0; i < beats.length; i += per) groups.push(beats.slice(i, i + per));
  return groups;
}

/**
 * Flow parsed beats onto a page's panels. Panels are filled in reading order; each
 * beat becomes a bubble/caption/SFX tagged with its character. If a panel has no image
 * and its main speaker has a reference image, that image auto-fills the panel.
 */
export function applyScriptToPage(
  page: StudioPage,
  beats: ScriptBeat[],
  opts: { isManga?: boolean; characters?: ScriptCharacter[] } = {},
): StudioPage {
  const panels = page.panels ?? [];
  if (!panels.length || !beats.length) return page;
  const order = opts.isManga
    ? [...panels].sort((a, b) => a.x !== b.x ? b.x - a.x : a.y - b.y)
    : [...panels].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const charImg = new Map((opts.characters ?? []).map(c => [c.name.toLowerCase(), c.imageUrl]));
  const groups = groupBeats(beats, order.length);

  const updated = new Map<string, StudioPanel>();
  order.forEach((panel, i) => {
    const group = groups[i] ?? (i === order.length - 1 ? groups.slice(order.length - 1).flat() : []);
    if (!group?.length) { updated.set(panel.id, panel); return; }
    let y = 6;
    const bubbles: SpeechBubble[] = [];
    let caption = panel.caption;
    let sfxText = panel.sfxText;
    let speaker: string | undefined;
    for (const b of group) {
      if (b.kind === 'sfx') { sfxText = b.text; continue; }
      if (b.kind === 'caption' && !b.character) { caption = caption ? `${caption} ${b.text}` : b.text; continue; }
      if (b.character && !speaker) speaker = b.character;
      bubbles.push({
        id: uuidv4(), type: bubbleTypeFor(b), text: b.text, character: b.character,
        x: 6, y, width: 58, tailDir: 'br',
      });
      y = Math.min(80, y + 22);
    }
    // Character-image auto-fill (Fabula world characters follow into the art).
    let imageUrl = panel.imageUrl;
    if (!imageUrl && speaker) { const url = charImg.get(speaker.toLowerCase()); if (url) imageUrl = url; }
    updated.set(panel.id, { ...panel, bubbles: [...panel.bubbles, ...bubbles], caption, sfxText, imageUrl });
  });

  return { ...page, panels: panels.map(p => updated.get(p.id) ?? p) };
}

/** Distinct speaking characters found in a script (for a quick cast preview). */
export function charactersInScript(beats: ScriptBeat[]): string[] {
  const seen = new Set<string>();
  for (const b of beats) if (b.character) seen.add(b.character);
  return [...seen];
}
