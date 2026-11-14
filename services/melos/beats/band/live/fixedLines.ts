// The lines a character can say that have no live value in them — what scripts/band/renderBandLines.ts
// records in their designed voice. Blanks with a known set of fillings are expanded: {name}; {zone}
// (the four SOMA zones); {intro} (every SOMA drum's intro for Amara, LYRA's seat openers for Theo).
// Built with the director's own spacing rule so the app finds the clip for exactly what it says.

import { CHARACTER_SHEETS } from '../character/sheets';
import { DRUMS } from '../../../instruments/soma/drumKnowledge';
import { LYRA_SEAT_INTROS, normalizeLine } from './lineAudio';

const ZONES = ['centre bass', 'open tone', 'rim slap', 'muted stroke'];
/** The {intro}s each character can be given by the hosts they sit in. */
function introsFor(id: string): string[] {
  if (id === 'amara') return Object.values(DRUMS).map((d) => d.intro);
  if (id === 'theo') return [LYRA_SEAT_INTROS.tine, LYRA_SEAT_INTROS.piano, ''];
  return [''];
}

/** Every line this character can say that has no live value left in it. */
export function fixedLines(id: string): string[] {
  const sheet = CHARACTER_SHEETS.find((s) => s.id === id)!;
  const name = sheet.displayName.split(' ')[0];
  const out = new Set<string>();
  for (const r of sheet.reactions) for (const raw of r.say) {
    for (const intro of raw.includes('{intro}') ? introsFor(id) : ['']) {
      for (const zone of raw.includes('{zone}') ? ZONES : ['']) {
        const t = normalizeLine(raw.replace(/\{name\}/g, name).replace(/\{intro\}/g, intro).replace(/\{zone\}/g, zone));
        if (t && !/\{\w+\}/.test(t)) out.add(t);
      }
    }
  }
  return [...out];
}

