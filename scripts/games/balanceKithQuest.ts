/**
 * Kith Quest mix-engineer pass (Music Council follow-up, 2026-11-13). The council's orchestration was written but the
 * stems showed it buried: string desks 10–17 dB under the lead, TONOS figures ~20 dB under. Gains in the score are
 * guesses against instruments whose loudness differs by 20 dB, so this measures every track and sets it by role.
 *
 *   1. per cue: node scripts/kith-quest-stems.mjs <cue>     (lab on :3255; solo dry render of every track → <cache>/bounce/<cue>--solo-<key>.f32)
 *   2. node node_modules/tsx/dist/cli.mjs scripts/games/balanceKithQuest.ts
 *      → data/gameScores/kithQuestMix.ts (a trim in dB per cue/part, added to the part's gain by the Chora builder)
 *
 * Level = RMS over the frames where the track is actually playing (gated at −50 dB below its peak window), so a part
 * that plays for 8 bars is judged on those bars. Targets are relative to the cue's loudest melody track (the tune).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QUEST_CUES, type Cue, type CuePart } from '../../data/gameScores/kithQuest';
import { KITH_QUEST_MIX } from '../../data/gameScores/kithQuestMix';

const CACHE = process.env.KITHQUEST_AUDIO_CACHE || (fs.existsSync('D:/Plajah Runtime') ? 'D:/Plajah Runtime/cache/kith-quest-audio' : path.join(os.tmpdir(), 'kith-quest-audio'));
const BOUNCE = path.join(CACHE, 'bounce');

/** Active level of a stem (dB): mean power of 50 ms windows within 30 dB of the loudest window. */
function activeDb(file: string): number | null {
  if (!fs.existsSync(file)) return null;
  const x = new Float32Array(new Uint8Array(fs.readFileSync(file)).buffer);
  const win = 4800, pw: number[] = [];
  for (let s = 0; s + win * 2 <= x.length; s += win * 2) { let e = 0; for (let i = s; i < s + win * 2; i++) e += x[i] * x[i]; pw.push(e / (win * 2)); }
  const top = Math.max(...pw);
  if (top <= 1e-12) return null;
  const act = pw.filter((e) => e > top / 1000);
  return 10 * Math.log10(act.reduce((a, b) => a + b, 0) / act.length);
}

/** Target level relative to the tune (dB), by what the part does. null = leave as written. */
function target(c: Cue, p: CuePart): number | null {
  if (p.inst === 'soma') return null;                         // drums keep their written balance
  if (p.src === 'melody') return null;                        // the tune and its doublings: as written
  if (p.src === 'divisi' && /horn|trombone|tuba|trumpet|flugel/.test(p.preset)) return -10; // brass chorale voices
  if (p.src === 'divisi' && ['lyra'].includes(p.inst)) return -11; // each string desk (five together ≈ −5)
  if (p.src === 'root') return -12;
  if (p.src === 'divisi') return /choir|hum|Choir/i.test(p.label) ? -12 : -14; // choirs, tremolo, breath
  if (p.src === 'figure') return p.inst === 'tonos' || /piccolo/.test(p.preset) ? -12 : -8; // TONOS/piccolo colour sits back (film, not chiptune); string ostinatos drive
  if (p.src === 'harp' || p.src === 'arp') return -12;
  if (p.src === 'counter') return -6;                         // the lantern answers, canons, echoes
  if (p.src === 'stab' || p.src === 'pizz' || p.src === 'spic' || p.src === 'tick') return -10;
  if (p.src === 'line') {
    if (p.inst === 'ison' || /Drone|drone|Breath/.test(p.label)) return -15;
    if (/sigh|High Violins/i.test(p.label)) return -12;
    if (/sweep/i.test(p.label)) return -6;
    if (/descant/i.test(p.label)) return -4;
    return -7;                                                // written solo lines (motif calls, breath accents, counters)
  }
  if (p.src === 'bass') return -8;
  return null;
}

const out: Record<string, Record<string, number>> = {};
const report: string[] = [];
for (const c of QUEST_CUES) {
  const levels = new Map<string, number>();
  for (const p of c.parts) { const db = activeDb(path.join(BOUNCE, `${c.id}--solo-${p.key}.f32`)); if (db !== null) levels.set(p.key, db); }
  if (!levels.size) { report.push(`${c.id}: no stems (skipped)`); continue; }
  const prev = KITH_QUEST_MIX[c.id] ?? {};
  const tune = Math.max(...c.parts.filter((p) => p.src === 'melody' && levels.has(p.key)).map((p) => levels.get(p.key)!));
  const trims: Record<string, number> = {};
  for (const p of c.parts) {
    const t = target(c, p), lv = levels.get(p.key);
    if (t === null || lv === undefined) { if (prev[p.key]) trims[p.key] = prev[p.key]; continue; }
    // the stem was rendered with the previous trim already in its gain, so the new trim builds on it
    const trim = Math.max(-8, Math.min(20, (prev[p.key] ?? 0) + (tune + t - lv)));
    if (Math.abs(trim) >= 0.5) trims[p.key] = Math.round(trim * 2) / 2;
    report.push(`${c.id.padEnd(16)} ${p.key.padEnd(10)} ${lv.toFixed(1).padStart(6)} dB  rel ${(lv - tune).toFixed(1).padStart(6)}  want ${String(t).padStart(4)}  trim ${(trims[p.key] ?? 0).toFixed(1)}`);
  }
  // keep every fader at or under +4 dB: if a quiet instrument needs more, the whole cue comes down together
  // (the master is loudness-normalised afterwards, so only the balance matters)
  const over = Math.max(0, ...c.parts.map((p) => (p.gainDb ?? -10) + (trims[p.key] ?? 0) - 4));
  if (over > 0) for (const p of c.parts) trims[p.key] = Math.round(((trims[p.key] ?? 0) - over) * 2) / 2;
  out[c.id] = trims;
}

const body = Object.entries(out).map(([id, t]) => `  '${id}': {${Object.entries(t).map(([k, v]) => `${/^[a-z]\w*$/i.test(k) ? k : `'${k}'`}: ${v}`).join(', ')}},`).join('\n');
fs.writeFileSync('data/gameScores/kithQuestMix.ts', `/**
 * Kith Quest mix trims (dB per cue → part key), added to each part's gain by the Chora builder.
 * GENERATED by scripts/games/balanceKithQuest.ts from solo stems of every track — do not edit by hand; re-run it after
 * changing parts. Targets (relative to the tune): string desks −11 each, brass chorale −10, basses −12, string
 * ostinatos −8, TONOS colour −12, harp −12, answers/canons −6, choirs −12, drones −15, written solo lines −7.
 */
export const KITH_QUEST_MIX: Record<string, Record<string, number>> = {
${body}
};
`);
console.log(report.join('\n'));
console.log(`\nwrote data/gameScores/kithQuestMix.ts (${Object.keys(out).length} cues)`);
