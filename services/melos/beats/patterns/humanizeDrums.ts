// Play a MEKA drum pattern like the band's drummer would: the written pattern becomes a four-bar
// phrase with accents from the beat, the drummer's pocket and per-voice lean, velocity scatter by
// how tight they are, ghost notes on the snare for players who talk under the groove, small bar-to-
// bar variations, and a fill into the next phrase. The persona comes from roster.ts (Marcus's three
// sides, chosen by genre). Deterministic for a seed. Pure.

import type { Pattern, Step } from '../grooveDoc';
import type { Persona, PersonaTraits } from '../band/roster';

/** DEFAULT_KIT pads (grooveDoc.ts): kick 0 · kick2 1 · sub 2 · snare 4 · clap 5 · snare2 6 · rim 7 · hats 8–11 · perc 12–13. */
const SNARE = 4, KICK = 0, TOM_LIKE = [12, 13];
const HATS = new Set([8, 9, 10, 11]);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The persona whose affinity names this genre, else the first. */
export function personaForGenre(personas: Persona[], genre: string): Persona {
  const g = genre.toLowerCase().replace(/[^a-z]/g, '');
  return personas.find((p) => p.affinity.genres?.some((x) => g.includes(x) || x.includes(g))) ?? personas[0];
}

/** `bars` — how long a phrase to play it as; `fills: false` keeps the written ending (feel only). */
export function humanizeDrumPattern(src: Pattern, t: PersonaTraits, seed: number, bars = 4, fills = true): Pattern {
  const rand = rng(seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const barLen = src.length;
  const length = clamp(barLen * bars, 16, 64) as Pattern['length'];
  const out: Pattern['steps'] = {};
  const put = (pad: number, step: number, s: Step) => { if (step < length) (out[pad] || (out[pad] = {}))[step] = s; };
  const accent = (pos: number) => (pos % 16 === 0 ? 1 : pos % 4 === 0 ? 0.55 : pos % 2 === 0 ? 0.2 : 0);
  // Per-voice lean: hats a hair ahead, the backbeat sits back for laid-back players, kicks on the grid.
  const lean = (pad: number) => (HATS.has(pad) ? -0.02 : pad === SNARE || pad === 5 ? Math.max(0, t.pocket) * 6 : 0);
  const fillBar = length / barLen - 1;

  for (let bar = 0; bar * barLen < length; bar++) {
    const fill = fills && bar === fillBar && rand() < 0.35 + t.fills * 0.65;
    for (const [padKey, row] of Object.entries(src.steps)) {
      const pad = Number(padKey);
      for (const [stepKey, st] of Object.entries(row)) {
        const pos = Number(stepKey);
        if (fill && pos >= barLen - 4 && !HATS.has(pad) && pad !== KICK) continue; // room for the fill
        if (bar > 0 && pos % 4 !== 0 && rand() < (1 - t.tightness) * 0.08) continue; // a dropped note now and then
        const v = st.v * (0.86 + accent(pos) * 0.2 * (0.5 + t.dynamics)) + gauss() * (1 - t.tightness) * 14;
        const micro = clamp((st.micro ?? 0) + t.pocket * 4 + lean(pad) + gauss() * (1 - t.tightness) * 0.1, -0.45, 0.45);
        put(pad, bar * barLen + pos, { ...st, v: Math.round(clamp(v, 12, 127)), micro: Math.round(micro * 1000) / 1000 });
      }
    }
    // Ghost notes: soft snare strokes in the gaps, for players who talk under the groove.
    // (Feel-only passes add nothing: pad 4 is the snare only in the default kit.)
    const ghostP = fills ? clamp((t.complexity - 0.4) * 0.5 + t.density * 0.15, 0, 0.35) : 0;
    for (let pos = 0; pos < barLen; pos++) {
      if (pos % 2 === 0 || src.steps[SNARE]?.[pos] || rand() > ghostP) continue;
      if (fill && pos >= barLen - 4) continue;
      put(SNARE, bar * barLen + pos, { v: Math.round(24 + rand() * 18), micro: Math.round(gauss() * 0.06 * 1000) / 1000 });
    }
    if (fill) {
      const from = bar * barLen + barLen - 4;
      for (let k = 0; k < 4; k++) {
        const pad = t.complexity > 0.6 && k % 2 ? TOM_LIKE[k % 2] : SNARE;
        put(pad, from + k, { v: Math.round(clamp(78 + k * 10 + gauss() * 6, 1, 127)), micro: Math.round(gauss() * (1 - t.tightness) * 0.08 * 1000) / 1000 });
      }
    }
  }
  return { ...src, length, steps: out };
}
