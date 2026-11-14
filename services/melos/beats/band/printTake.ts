// Chora Session Band — printing a take. What the band played lands on the timeline as ordinary
// Chora material you can edit: each player's notes as a clip on their seat track (articulations and
// expression kept), the drummer as MEKA patterns on a drum track with the human timing kept in each
// step's micro offset. A take never overwrites — if a seat already has a clip there, it goes on a
// take track under it. One undo step (the caller wraps it in onMutate).

import type { ArrangeTrack, GrooveDoc, NoteEvent, PadConfig, Pattern, Step } from '../grooveDoc';
import { grooveUid } from '../grooveDoc';
import { BAND, type BandPlayer } from './roster';
import type { DrumVoice } from './styles';
import type { TakeBar } from './session';

/** Which kit pad plays each drum voice (by name, then by synth voice; bank 0 first). -1 = none. */
export function kitMap(kit: PadConfig[]): Record<DrumVoice, number> {
  const find = (re: RegExp, synth?: string, not?: RegExp) => {
    const ok = (p: PadConfig) => !p.empty && !p.mute && (!not || !not.test(p.name));
    let i = kit.findIndex((p, k) => k < 16 && ok(p) && re.test(p.name));
    if (i < 0 && synth) i = kit.findIndex((p, k) => k < 16 && ok(p) && p.synthVoice === synth && !/2|3/.test(p.name));
    if (i < 0) i = kit.findIndex((p) => ok(p) && re.test(p.name));
    return i;
  };
  const kick = find(/kick|\bbd\b|bass ?drum/i, 'kick');
  const snare = find(/snare|\bsd\b/i, 'snare', /rim|2/i);
  const hatC = find(/closed|\bch\b|\bhh\b|^hat$|hi-?hat(?!.*open)/i, 'hat-closed', /open/i);
  const hatO = find(/open|\boh\b/i, 'hat-open');
  const pick = (...xs: number[]) => xs.find((x) => x >= 0) ?? -1;
  return {
    kick, snare, ghost: pick(find(/snare 2/i), snare), hatC, hatO: pick(hatO, hatC),
    ride: pick(find(/ride/i), find(/hat 3/i), hatO, hatC), crash: pick(find(/crash|cymbal/i), find(/fx/i), hatO),
    rim: pick(find(/rim|stick/i), snare), clap: pick(find(/clap/i, 'clap'), snare),
    tomH: pick(find(/hi(gh)? ?tom|tom ?1|rack|perc 1/i), find(/tom/i), snare), tomL: pick(find(/lo(w)? ?tom|floor|tom ?2|perc 2/i), find(/tom/i), kick),
    shaker: pick(find(/shak|cabasa|perc/i), hatC),
  };
}

export interface PrintOptions {
  /** Make (and push) an instrument track for a player — the caller owns instrument factories. */
  createTrack: (doc: GrooveDoc, player: BandPlayer, name: string, after?: ArrangeTrack) => ArrangeTrack;
  /** Seat track ids by player (doc.band.seats). Updated with any track created. */
  seats: Record<string, string>;
  label: string;
}

export interface PrintResult { tracks: string[]; players: string[]; bars: number }

export function printTake(doc: GrooveDoc, bars: TakeBar[], opts: PrintOptions): PrintResult {
  const result: PrintResult = { tracks: [], players: [], bars: bars.length };
  if (!bars.length) return result;
  const sorted = [...bars].sort((a, b) => a.bar - b.bar);
  const start = sorted[0].start;
  const end = sorted[sorted.length - 1].start + sorted[sorted.length - 1].beats;
  const len = end - start;
  const busy = (t: ArrangeTrack) => t.clips.some((c) => c.startBeats < end - 1e-6 && c.startBeats + c.lengthBeats > start + 1e-6);

  for (const player of BAND) {
    const has = sorted.some((b) => (b.played[player.id]?.notes.length ?? 0) + (b.played[player.id]?.hits.length ?? 0) > 0);
    if (!has) continue;
    result.players.push(player.id);
    if (player.seat.kind === 'kit') { result.tracks.push(printDrums(doc, sorted, player, start, len, opts)); continue; }
    let track = doc.arrangement.find((t) => t.id === opts.seats[player.id]);
    if (!track) { track = opts.createTrack(doc, player, `${player.name} · ${player.instrument}`); opts.seats[player.id] = track.id; }
    else if (busy(track)) {
      const seat = track;
      track = opts.createTrack(doc, player, `${player.name} · take ${opts.label}`, seat);
      if (seat.instrument) track.instrument = JSON.parse(JSON.stringify(seat.instrument));
      track.color = seat.color;
    }
    const notes: NoteEvent[] = [];
    for (const b of sorted) for (const n of b.played[player.id]?.notes ?? []) {
      const at = Math.max(0, b.start + n.at - start);
      if (at >= len - 1e-6) continue;
      notes.push({ id: grooveUid(), startBeats: at, lengthBeats: Math.max(0.03, Math.min(n.len, len - at)), key: n.key, vel: Math.max(1, Math.min(127, n.vel)), ...(n.articulation ? { articulation: n.articulation } : {}), ...(n.expr ? { expr: n.expr } : {}) });
    }
    track.clips.push({ id: grooveUid(), startBeats: start, lengthBeats: len, name: `${player.name} · take ${opts.label}`, notes, generativeEngine: 'session-band' });
    result.tracks.push(track.id);
  }
  return result;
}

/** Drums → 64-step MEKA patterns (16 beats each) on a pattern track, micro timing kept. */
function printDrums(doc: GrooveDoc, bars: TakeBar[], player: BandPlayer, start: number, len: number, opts: PrintOptions): string {
  const map = kitMap(doc.kit);
  const chunks = Math.ceil(len / 16 - 1e-9);
  const patterns: Pattern[] = [];
  for (let k = 0; k < chunks; k++) patterns.push({ id: grooveUid(), name: `${player.nickname ?? player.name} ${opts.label}${chunks > 1 ? `·${k + 1}` : ''}`, groupIdx: 0, length: 64, steps: {} });
  for (const b of bars) for (const h of b.played[player.id]?.hits ?? []) {
    const pad = map[h.voice];
    if (pad < 0) continue;
    const beat = Math.max(0, b.start + h.at - start);
    const exact = beat * 4;
    let step = Math.round(exact);
    const chunk = Math.floor(step / 64);
    if (chunk >= chunks) continue;
    const pat = patterns[chunk];
    step -= chunk * 64;
    const micro = Math.max(-0.5, Math.min(0.5, exact - Math.round(exact)));
    const row = (pat.steps[pad] ??= {});
    const prev = row[step];
    if (!prev || prev.v < h.vel) row[step] = { v: Math.max(1, Math.min(127, h.vel)), ...(Math.abs(micro) > 0.01 ? { micro: Math.round(micro * 100) / 100 } : {}) } as Step;
  }
  doc.patterns.push(...patterns);
  let track = doc.arrangement.find((t) => t.id === opts.seats[player.id] && t.kind === 'pattern');
  const busy = track?.clips.some((c) => c.startBeats < start + len - 1e-6 && c.startBeats + c.lengthBeats > start + 1e-6);
  if (!track || busy) {
    track = { id: grooveUid(), kind: 'pattern', name: `${player.name} · Drums${busy ? ` · take ${opts.label}` : ''}`, color: player.color, mute: false, solo: false, gainDb: 0, pan: 0, clips: [] };
    const after = doc.arrangement.findIndex((t) => t.id === opts.seats[player.id]);
    if (after >= 0) doc.arrangement.splice(after + 1, 0, track); else doc.arrangement.push(track);
    if (!opts.seats[player.id]) opts.seats[player.id] = track.id;
  }
  patterns.forEach((p, k) => track!.clips.push({ id: grooveUid(), startBeats: start + k * 16, lengthBeats: Math.min(16, len - k * 16), name: p.name, patternId: p.id }));
  return track.id;
}
