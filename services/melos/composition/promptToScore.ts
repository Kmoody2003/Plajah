// promptToScore — Composer P2: a text direction ("dreamy 8-bar synth line in A minor") → MIDI notes.
// Asks the model (server-proxied Gemini) for a JSON note list, then a DETERMINISTIC post-pass parses it
// and snaps every note to the key's scale — so the output is always musical + in-key even if the model
// drifts. The parse + snap are pure and unit-tested; only the model call needs the network.
import { snapToScale, nameToPc } from '../theory';
import { grooveUid, type NoteEvent } from '../beats/grooveDoc';
import { callGemini } from '../../geminiService';

export interface ScoreResult { notes: NoteEvent[]; key: string; mode: 'major' | 'minor'; }
interface RawNote { midi?: number; note?: string; start?: number; startBeats?: number; len?: number; lengthBeats?: number; dur?: number; vel?: number; velocity?: number; }

/** Pull the notes JSON out of a model response — tolerant of ```json fences and surrounding prose. */
export function parseScoreJson(text: string): { key?: string; mode?: string; notes: RawNote[] } {
  if (!text) return { notes: [] };
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const o = JSON.parse(s);
    return { key: o.key, mode: o.mode, notes: Array.isArray(o.notes) ? o.notes : [] };
  } catch { return { notes: [] }; }
}

const NOTE_RE = /^([A-Ga-g])([#b♯♭]?)(-?\d+)$/;
/** "C4" / "F#3" / "Bb5" → MIDI (C4 = 60). Returns null if unparseable. */
export function nameToMidi(name: string): number | null {
  const m = NOTE_RE.exec(String(name).trim());
  if (!m) return null;
  const pc = nameToPc(m[1].toUpperCase() + (m[2] || '').replace('♯', '#').replace('♭', 'b'));
  if (!Number.isFinite(pc)) return null;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

/** Parsed note list → NoteEvents, snapping each note into the key's scale (deterministic clean-up). */
export function toNoteEvents(raw: RawNote[], rootPc: number, scaleId: string, snap = true): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const n of raw || []) {
    let key = typeof n.midi === 'number' ? Math.round(n.midi) : (typeof n.note === 'string' ? nameToMidi(n.note) : null);
    if (key == null || !Number.isFinite(key)) continue;
    key = Math.max(0, Math.min(127, key));
    if (snap) key = snapToScale(key, rootPc, scaleId, 'nearest');
    const start = Math.max(0, Number(n.start ?? n.startBeats ?? 0));
    const len = Math.max(0.125, Number(n.len ?? n.lengthBeats ?? n.dur ?? 1));
    const vel = Math.max(1, Math.min(127, Math.round(Number(n.vel ?? n.velocity ?? 90))));
    if (!Number.isFinite(start) || !Number.isFinite(len)) continue;
    out.push({ id: grooveUid(), startBeats: start, lengthBeats: len, key, vel });
  }
  return out.sort((a, b) => a.startBeats - b.startBeats);
}

export function buildComposePrompt(direction: string, opts: { key: string; mode: string; bars: number; progression?: string }): string {
  return `You are a MIDI composer. Write ONE musical part as JSON only — no prose, no explanation.
Direction: ${direction}
Key: ${opts.key} ${opts.mode}. Length: ${opts.bars} bars of 4 beats.${opts.progression ? ` Follow this chord progression: ${opts.progression}.` : ''}
Return EXACTLY this shape:
{"key":"${opts.key}","mode":"${opts.mode}","notes":[{"midi":60,"start":0,"len":1,"vel":90}]}
Rules: midi 0-127; start and len are in beats (start 0 = the beginning of the clip); vel 1-127.
Stay strictly in the key. Make it musical and playable, not random. Keep the register around MIDI 55-79.`;
}

/** Full path: direction → model → parsed, in-key NoteEvents. Throws if the model call fails. */
export async function promptToScore(
  direction: string,
  opts: { key?: string; mode?: 'major' | 'minor'; bars?: number; progression?: string; snap?: boolean } = {},
): Promise<ScoreResult> {
  const key = opts.key || 'C';
  const mode = opts.mode || 'major';
  const bars = Math.max(1, Math.min(32, opts.bars || 4));
  const text = await callGemini(buildComposePrompt(direction, { key, mode, bars, progression: opts.progression }), { temperature: 0.85 });
  const parsed = parseScoreJson(typeof text === 'string' ? text : (text?.text ?? ''));
  const outKey = parsed.key || key;
  const outMode: 'major' | 'minor' = (parsed.mode === 'minor' || parsed.mode === 'major') ? parsed.mode : mode;
  const rootPc = nameToPc(outKey);
  const notes = toNoteEvents(parsed.notes, Number.isFinite(rootPc) ? rootPc : 0, outMode === 'minor' ? 'minor' : 'major', opts.snap ?? true);
  return { notes, key: outKey, mode: outMode };
}
