// cleanSpeech — Stage's clean speech filter for on-screen transcription.
//
// Every path that puts transcribed words on a screen (live captions, live lyrics, typo
// visualizer channels) runs through cleanTranscript() at publish time. Profane words are
// OMITTED — no blur, no ★ mask — so the audience sees the sentence as if the word was never
// said. The operator's own views (the listen-bar waveform transcript, the live-lyrics panel)
// read the raw transcriber tap and stay accurate.
//
// Settings live in the user's Content & Safety settings (services/contentSafetyService):
// `stageCleanSpeech` (undefined = on for church / nonprofit org accounts) and
// `stageCleanWords` (the operator's added words/phrases). Read synchronously from the
// localStorage mirror so this module stays Firebase-free (output windows, node tests).
import { PROFANITY_SET, normalizeForMatch, isAsteriskCensored } from '../profanityLexicon';

const SETTINGS_KEY = 'plajah_safety_settings_v1';        // = SAFETY_SETTINGS_LS_KEY
const DEFAULT_KEY = 'plajah_stage_clean_default_v1';      // = STAGE_CLEAN_DEFAULT_LS_KEY

interface Resolved { on: boolean; words: Set<string>; phrases: RegExp[] }
let memoRaw: string | null | undefined;
let memoDef: string | null | undefined;
let memo: Resolved = { on: false, words: new Set(), phrases: [] };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function resolve(): Resolved {
  let raw: string | null = null, def: string | null = null;
  try { raw = localStorage.getItem(SETTINGS_KEY); def = localStorage.getItem(DEFAULT_KEY); } catch { /* node / blocked storage */ }
  if (raw === memoRaw && def === memoDef) return memo;
  memoRaw = raw; memoDef = def;
  let s: { stageCleanSpeech?: boolean; stageCleanWords?: string[] } = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* */ }
  const words = new Set<string>(), phrases: RegExp[] = [];
  for (const w of s.stageCleanWords ?? []) {
    const t = String(w).trim().toLowerCase();
    if (!t) continue;
    if (/\s/.test(t)) phrases.push(new RegExp(`(^|[^\\w'])${t.split(/\s+/).map(escapeRe).join('\\s+')}(?=$|[^\\w'])`, 'gi'));
    else words.add(normalizeForMatch(t));
  }
  memo = { on: typeof s.stageCleanSpeech === 'boolean' ? s.stageCleanSpeech : def === '1', words, phrases };
  return memo;
}

/** Is the filter on for this device's signed-in account right now? */
export const stageCleanSpeechOn = () => resolve().on;

/** Should this single token be omitted? (exported for tests) */
export function isFilteredWord(token: string, extra: Set<string> = resolve().words): boolean {
  if (isAsteriskCensored(token)) return true;
  const n = normalizeForMatch(token);
  return !!n && (PROFANITY_SET.has(n) || extra.has(n));
}

/** Omit profanity + custom words from one transcript string. No-op when the filter is off. */
export function cleanTranscript(text: string, force?: boolean): string {
  const r = resolve();
  if (!(force ?? r.on) || !text) return text;
  let t = text;
  for (const re of r.phrases) t = t.replace(re, '$1');
  const out: string[] = [];
  for (const tok of t.split(/\s+/)) {
    if (!tok) continue;
    const m = /^([("“'[]*)(.*?)([.,!?;:"”')\]]*)$/.exec(tok)!;
    const core = m[2];
    if (!core || !isFilteredWord(core, r.words)) { out.push(tok); continue; }
    // dropped: keep a sentence end so the line still reads naturally ("…this is." not "…this is")
    const end = /[.?!]/.exec(m[3])?.[0];
    if (end && out.length && !/[.?!]["”')\]]*$/.test(out[out.length - 1])) out[out.length - 1] = out[out.length - 1].replace(/[,;:]+$/, '') + end;
  }
  return out.join(' ');
}

/** Clean caption lines; a line that was nothing but filtered words disappears. */
export function cleanLines(lines: string[], force?: boolean): string[] {
  if (!(force ?? resolve().on)) return lines;
  return lines.map(l => cleanTranscript(l, true)).filter(l => l.trim());
}

/** Studio startup: work out the church / nonprofit default for the signed-in account. */
export function primeCleanSpeech(): void {
  void import('../contentSafetyService').then(m => m.primeStageCleanSpeech()).catch(() => {});
}
