// scriptBridge — the screenplay and the production stay the same story.
//
// The script is written in the platform's screenplay editor (ScriptData: typed elements — scene
// heading, action, character, dialogue…). Fabula works in scenes with a free-text `script` and a shot
// list. This bridge moves between the two without either side losing work:
//
//   pull   the screenplay's scenes into the production. A scene is matched to the one it came from
//          (by the heading element it was linked to, then by slugline). Its text is updated; its shot
//          list, bible and prompts are KEPT and the scene is marked revised so the filmmaker can
//          re-run the breakdown when they choose. New scenes are added in script order. A scene the
//          script no longer has is flagged, never deleted — it may still have footage cut to it.
//   push   a scene written in Fabula (a gap-fill option, a scene built from the cut) into screenplay
//          elements, inserted after the scene that precedes it in the production.
//
// Pure. Firestore reads and writes are the caller's.

import type { ScriptElement, ScriptElementType } from '../../../types';

export interface ScriptScene {
  /** The SCENE_HEADING element's id — the stable link between the two sides. */
  headingId: string;
  slugline: string;
  /** 1-based act, from SECTION elements ("ACT II"); 1 when the script has none. */
  act: number;
  script: string;
  characters: string[];
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const actOf = (text: string): number | null => {
  const m = text.toUpperCase().match(/\bACT\s+([IV]+|\d+|ONE|TWO|THREE|FOUR|FIVE)\b/);
  return m ? (ROMAN[m[1]] || Number(m[1]) || null) : null;
};
const key = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Split screenplay elements into scenes with readable text (the layout Fabula's SLATE reads). */
export function scenesFromScriptElements(elements: ScriptElement[]): ScriptScene[] {
  const scenes: ScriptScene[] = [];
  let act = 1, cur: (ScriptScene & { lines: string[] }) | null = null;
  const close = () => { if (cur) { const { lines, ...rest } = cur; scenes.push({ ...rest, script: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }); } };
  for (const el of elements || []) {
    const text = (el.text || '').trim();
    if (el.type === 'SECTION') { const a = actOf(text); if (a) act = a; continue; }
    if (el.type === 'SCENE_HEADING') {
      close();
      cur = { headingId: el.id, slugline: text.toUpperCase(), act, script: '', characters: [], lines: [] };
      continue;
    }
    if (!cur || !text || el.type === 'NOTE') continue;
    if (el.type === 'CHARACTER') {
      const name = text.toUpperCase().replace(/\s*\((V\.?O\.?|O\.?S\.?|CONT'?D)\)\s*/g, '').trim();
      if (name && !cur.characters.includes(name)) cur.characters.push(name);
      cur.lines.push('', text.toUpperCase());
    } else if (el.type === 'PARENTHETICAL') cur.lines.push(text.startsWith('(') ? text : `(${text})`);
    else if (el.type === 'DIALOGUE') cur.lines.push(text);
    else if (el.type === 'TRANSITION') cur.lines.push('', text.toUpperCase());
    else cur.lines.push('', text);       // ACTION, SHOT
  }
  close();
  return scenes;
}

export interface PullReport { added: number; updated: number; unchanged: number; flagged: number; total: number }

/** Bring a screenplay into a production. Mutates `prod` — call inside the production's update.
 *  `blankScene` makes an empty Fabula scene; `mkId` mints ids. */
export function pullScriptIntoProduction(prod: any, elements: ScriptElement[], mkId: () => string, blankScene: () => any, now = Date.now()): PullReport {
  const incoming = scenesFromScriptElements(elements);
  const report: PullReport = { added: 0, updated: 0, unchanged: 0, flagged: 0, total: incoming.length };
  prod.acts = prod.acts?.length ? prod.acts : [{ id: mkId(), number: 1, title: 'ACT I', scenes: [] }];
  const numerals = ['I', 'II', 'III', 'IV', 'V'];
  const actFor = (n: number) => {
    while (prod.acts.length < n) prod.acts.push({ id: mkId(), number: prod.acts.length + 1, title: `ACT ${numerals[prod.acts.length] || prod.acts.length + 1}`, scenes: [] });
    return prod.acts[Math.max(0, n - 1)];
  };
  const existing: any[] = prod.acts.flatMap((a: any) => a.scenes || []);
  const claimed = new Set<any>();

  for (const sc of incoming) {
    const match = existing.find((x) => !claimed.has(x) && x.scriptElementId === sc.headingId)
      || existing.find((x) => !claimed.has(x) && !x.scriptElementId && key(x.slugline || x.title) === key(sc.slugline));
    if (match) {
      claimed.add(match);
      match.scriptElementId = sc.headingId;
      delete match.notInScript;
      const changed = (match.script || '').trim() !== sc.script || key(match.slugline) !== key(sc.slugline);
      if (changed) {
        match.script = sc.script; match.slugline = sc.slugline;
        // The breakdown was made from the old text. Keep it — the footage and prompts hang off it —
        // but say it's behind.
        if ((match.shots || []).length) match.scriptRevisedAt = now;
        report.updated++;
      } else report.unchanged++;
    } else {
      const act = actFor(sc.act);
      act.scenes = act.scenes || [];
      act.scenes.push({ ...blankScene(), id: mkId(), title: sc.slugline, slugline: sc.slugline, script: sc.script, scriptElementId: sc.headingId });
      report.added++;
    }
  }
  for (const x of existing) {
    if (claimed.has(x) || !x.scriptElementId) continue;      // scenes never linked to the script are the editor's own
    if (!x.notInScript) { x.notInScript = true; report.flagged++; }
  }
  return report;
}

/** One Fabula scene as screenplay elements. The scene's free text is read line by line: a short
 *  upper-case line followed by speech is a character cue, a bracketed line a parenthetical. */
export function scriptElementsFromScene(scene: any, mkId: () => string): ScriptElement[] {
  const el = (type: ScriptElementType, text: string): ScriptElement => ({ id: mkId(), type, text });
  const out: ScriptElement[] = [el('SCENE_HEADING', (scene?.slugline || scene?.title || 'INT. LOCATION - DAY').toUpperCase())];
  const lines = String(scene?.script || '').split(/\r?\n/).map((l) => l.trim());
  let speaking = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) { speaking = false; continue; }
    const cue = /^[A-Z0-9 .'\-()]{2,32}$/.test(l) && /[A-Z]/.test(l) && !/^(INT|EXT|INT\.\/EXT|I\/E)[. ]/.test(l) && !!lines[i + 1];
    const inline = l.match(/^([A-Z][A-Z0-9 .'\-]{1,30}):\s+(.+)$/);
    if (/^(CUT TO|FADE (IN|OUT)|DISSOLVE TO|SMASH CUT)\b.*[:.]?$/.test(l)) { out.push(el('TRANSITION', l)); speaking = false; }
    else if (inline) { out.push(el('CHARACTER', inline[1].trim()), el('DIALOGUE', inline[2].trim())); speaking = false; }
    else if (cue) { out.push(el('CHARACTER', l)); speaking = true; }
    else if (speaking && /^\(.*\)$/.test(l)) out.push(el('PARENTHETICAL', l));
    else if (speaking) out.push(el('DIALOGUE', l));
    else out.push(el('ACTION', l));
  }
  return out;
}

/** Insert a Fabula scene into a screenplay's elements, after the scene that precedes it in the
 *  production (or at the end). Returns new elements and the heading id to link the scene with. If the
 *  scene is already linked and still present, its elements are replaced in place. */
export function pushSceneToScript(elements: ScriptElement[], scene: any, prevScene: any | undefined, mkId: () => string): { elements: ScriptElement[]; headingId: string; replaced: boolean } {
  const fresh = scriptElementsFromScene(scene, mkId);
  const src = elements || [];
  const sceneEnd = (start: number) => { let j = start + 1; while (j < src.length && src[j].type !== 'SCENE_HEADING' && src[j].type !== 'SECTION') j++; return j; };
  const own = scene?.scriptElementId ? src.findIndex((e) => e.id === scene.scriptElementId) : -1;
  if (own >= 0) {
    fresh[0] = { ...fresh[0], id: src[own].id };     // keep the link stable
    return { elements: [...src.slice(0, own), ...fresh, ...src.slice(sceneEnd(own))], headingId: src[own].id, replaced: true };
  }
  const prev = prevScene?.scriptElementId ? src.findIndex((e) => e.id === prevScene.scriptElementId) : -1;
  const at = prev >= 0 ? sceneEnd(prev) : src.length;
  return { elements: [...src.slice(0, at), ...fresh, ...src.slice(at)], headingId: fresh[0].id, replaced: false };
}
