// Living books and export. A living book's Tela doc carries a `LivingBook` (behaviours, music, narration: services/living/contracts.ts).
// None of that travels into EPUB / PDF / Markdown / HTML: every exporter draws the page's vector objects at rest and never reads `doc.living`.
// This module only DESCRIBES what was left out, so the export fidelity report (ExportReport.readerOnly, FidelityBadge) can say so in plain words.
// PURE; no React / Firebase.

import type { Action, LivingBook, Trigger } from '../living/contracts';

/** Marker on a VECTOR device (TelaVectorDevice.objectLabel): the device is one whole fixed page of a picture book, not a chapter opener.
 *  Exporters / telaDocToBook must not read a chapter title from its HEADLINE objects (the designers letter titles one glyph per object). */
export const FIXED_PAGE_MARK = 'fixed-page';

export interface LivingTally {
  pages: number; behaviors: number; interactive: number; idle: number;
  byTrigger: Partial<Record<Trigger['type'], number>>;
  drag: number; tilt: number;
  sounds: number; musicCues: number; ambience: number; narratedPages: number; goals: number; haptics: number; particles: number;
}

function walk(actions: ReadonlyArray<Action> | undefined, f: (a: Action) => void) {
  for (const a of actions ?? []) { f(a); if (a.do === 'if') { walk(a.then, f); walk(a.else, f); } }
}

export function tallyLiving(living: LivingBook | null | undefined): LivingTally {
  const t: LivingTally = { pages: 0, behaviors: 0, interactive: 0, idle: 0, byTrigger: {}, drag: 0, tilt: 0, sounds: 0, musicCues: 0, ambience: 0, narratedPages: 0, goals: 0, haptics: 0, particles: 0 };
  if (!living) return t;
  t.musicCues = Object.keys(living.scores ?? {}).length;
  for (const p of living.pages) {
    const any = p.behaviors.length > 0 || !!p.music || !!p.ambience || !!p.narration || !!p.goals?.length;
    let narrated = !!p.narration;
    if (p.ambience) t.ambience++;
    t.goals += p.goals?.length ?? 0;
    for (const b of p.behaviors) {
      t.behaviors++;
      t.byTrigger[b.on.type] = (t.byTrigger[b.on.type] ?? 0) + 1;
      if (b.on.type === 'idle' || b.on.type === 'enter' || b.on.type === 'timer') t.idle++; else t.interactive++;
      if (b.on.type === 'drag') t.drag++;
      if (b.on.type === 'tilt') t.tilt++;
      walk(b.do, a => {
        if (a.do === 'sfx' || a.do === 'note') t.sounds++;
        else if (a.do === 'ambience') t.ambience++;
        else if (a.do === 'narrate') narrated = true;
        else if (a.do === 'haptic') t.haptics++;
        else if (a.do === 'burst' || a.do === 'trail' || a.do === 'celebrate') t.particles++;
      });
    }
    if (narrated) t.narratedPages++;
    if (any) t.pages++;
  }
  return t;
}

/** Plain-language lines for the export report. Empty when the book has no living layer worth mentioning (a flat-only book). */
export function livingReaderOnlyNotes(living: LivingBook | null | undefined): string[] {
  const t = tallyLiving(living);
  if (!t.behaviors && !t.musicCues && !t.narratedPages && !t.ambience) return [];
  const out: string[] = [];
  out.push(`This is a living book: the exported pages are the flat pages, exactly as drawn. The living layer (${t.behaviors} behaviours on ${t.pages} pages) is read in the Lorea reader on Plajah and does not travel into EPUB or PDF.`);
  if (t.interactive) {
    const parts = (['tap', 'doubleTap', 'press', 'drag', 'proximity', 'hover', 'tilt', 'key', 'event', 'when'] as const).filter(k => t.byTrigger[k]).map(k => `${t.byTrigger[k]} ${k}`);
    out.push(`Touch and pointer interactions are reader-only (${parts.join(', ')}). In the file every object stays where the artist put it.`);
  }
  if (t.drag || t.tilt) out.push(`Drag and tilt interactions (${t.drag} drag, ${t.tilt} tilt) have no equivalent in a fixed file.`);
  if (t.idle) out.push(`${t.idle} idle animations (breathing, blinking, drifting, twinkling) are left out; pages are stills.`);
  if (t.musicCues || t.sounds || t.ambience) out.push(`Music and sound are reader-only: ${t.musicCues} music cues, ${t.sounds} sound effects and instruments, ${t.ambience} ambience beds. Nothing audible is embedded.`);
  if (t.narratedPages) out.push(`Read-aloud narration with word highlighting (${t.narratedPages} pages) is reader-only. The story text itself is in the file as real text.`);
  if (t.goals) out.push(`${t.goals} game goals and the celebrations that go with them are reader-only.`);
  if (t.haptics) out.push('Haptic feedback (vibration) is reader-only.');
  return out;
}
