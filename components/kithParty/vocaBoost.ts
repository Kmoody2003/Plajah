/**
 * Voca Word Boost for Kith Racing.
 *
 * On a launch into the air (race.ts maybeVocaCue, at most VOCA_MAX per race) the world drops into bullet time,
 * Voca says a word and the player gets one try, VOCA_REACT seconds, to say it. Heard → a super boost (vocaAnswer).
 * Kids get Voca reading-level words; adults get Lexicon words (curated story-words + their saved journal). It reuses Voca's own
 * stack: the voice (vocaVoice), the ears (vocaSpeech.createRecognizer, echo-proof suspend/resume), the
 * forgiving matcher (vocaAlign.wordsMatch / nearMiss), the reader's level + spaced-review words
 * (vocaProgress) and the content gate (vocaContentSafety). On by default; the player can turn it off.
 *
 * Privacy matches Voca: a child account listens only with a guardian's speech-recognition consent.
 */
import { passagesForLevel, VOCA_PASSAGES, type VocaPassage } from '../../data/vocaPassages';
import { normalize, wordsMatch, nearMiss, syllabify } from '../../services/voca/vocaAlign';
import { checkPassageSafety } from '../../services/voca/vocaContentSafety';
import { dueReview, loadLocal, reviewResult, saveLocal, startLevelFor } from '../../services/voca/vocaProgress';
import { createRecognizer, listeningAvailable, type Recognizer } from '../../services/voca/vocaSpeech';
import { speak, cancelSpeech, initVoice, ttsSupported } from '../../services/voca/vocaVoice';
import { VOCA_REACT } from './race';
import { WORDS_OF_THE_DAY } from '../../services/lexicon/wordOfTheDay';

const PREF = 'kith.vocaWordBoost';
/** The player's switch — ON unless they turned it off. */
export function vocaPref(): boolean { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } }
export function setVocaPref(on: boolean) { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage blocked */ } }

const isChild = (p: any) => !!(p?.isChild || p?.accountType === 'CHILD');
/** Same rule as Voca: children need a guardian's speech-recognition consent before the mic is used. */
export const vocaConsent = (profile?: any) => !isChild(profile) || profile?.parentalControls?.speechRecognition === true;
/** Why Word Boost can't run here (null = it can). */
export function vocaBlocker(profile?: any): string | null {
  if (!listeningAvailable()) return 'Needs a browser that can listen (Chrome, Edge or Safari).';
  if (!vocaConsent(profile)) return 'A parent or guardian needs to allow speech recognition first.';
  return null;
}

/** Small words that make a dull "say it" moment. */
const SKIP = new Set('the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what into then there their would could should about which these those where after again'.split(' '));

export interface RaceWord { word: string; syllables: string[]; review: boolean; level: number; source: WordSource }

/** Candidate words for a level: from Voca's own passages, letters only, safe, not filler. */
export function wordsForLevel(level: number): { word: string; passage: VocaPassage }[] {
  const pool = passagesForLevel(level).length ? passagesForLevel(level) : VOCA_PASSAGES.filter(p => Math.abs(p.level - level) <= 1);
  const [minLen, maxLen] = level <= 2 ? [3, 5] : level <= 4 ? [4, 7] : level <= 7 ? [5, 9] : [6, 11];
  const out = new Map<string, VocaPassage>();
  for (const p of pool) for (const raw of p.text.split(/\s+/)) {
    const w = normalize(raw);
    if (!/^[a-z]+$/.test(w) || w.length < minLen || w.length > maxLen || SKIP.has(w) || out.has(w)) continue;
    if (!checkPassageSafety(w, level).ok) continue;
    out.set(w, p);
  }
  return [...out].map(([word, passage]) => ({ word, passage }));
}

/** Pick this challenge's word: a due review word first (real practice), else a fresh word at the reader's level. */
export function pickRaceWord(opts: { level: number; review: string[]; used: Set<string>; rand?: () => number }): RaceWord {
  const rand = opts.rand ?? Math.random;
  const rev = opts.review.map(normalize).filter(w => /^[a-z]+$/.test(w) && w.length >= 3 && !opts.used.has(w) && checkPassageSafety(w, opts.level).ok);
  if (rev.length) { const w = rev[Math.floor(rand() * rev.length)]; return { word: w, syllables: syllabify(w), review: true, level: opts.level, source: 'reading' }; }
  let pool = wordsForLevel(opts.level).filter(c => !opts.used.has(c.word));
  if (!pool.length) pool = wordsForLevel(3);
  const c = pool[Math.floor(rand() * pool.length)] ?? { word: 'rocket', passage: undefined as unknown as VocaPassage };
  return { word: c.word, syllables: syllabify(c.word, c.passage?.syllables), review: false, level: opts.level, source: 'reading' };
}

/** Did any heard word (or a recogniser alternative) say the target? Racing is loud: be generous. */
export function heardIt(target: string, heard: string[], level: number): boolean {
  const t = normalize(target);
  return heard.map(normalize).some(h => h && (wordsMatch(t, h, Math.min(level, 3)) || nearMiss(t, h) || (t.length >= 6 && h.length >= 5 && (t.startsWith(h) || h.startsWith(t)))));
}

/** The reader: their Voca level and review words (guest profile in the stand-alone game). */
export function vocaReader(uid?: string | null, profile?: any) {
  const prog = loadLocal(uid);
  return { level: prog?.level ?? (profile ? startLevelFor(profile) : 3), review: prog ? dueReview(prog, Date.now(), 8) : [], uid };
}
/** A review word said in the race counts as a correct review in Voca (misses don't — the race is noisy). */
export function recordRaceWord(word: RaceWord, uid?: string | null) {
  if (!word.review) return;
  const prog = loadLocal(uid); if (!prog) return;
  saveLocal(reviewResult(prog, word.word, true), uid);
}

export type ChallengePhase = 'speaking' | 'listening' | 'ok' | 'miss';
export interface ChallengeView { word: string; syllables: string[]; phase: ChallengePhase; heard: string; endsAt: number; meaning?: string; source: WordSource }

/**
 * One word challenge, one try: the world drops into bullet time, Voca says the word, then the player has
 * VOCA_REACT seconds to say it. The first thing they say decides it (a short beat lets a long word finish).
 * The recogniser only starts after Voca stops talking, so her own voice never counts.
 */
export class WordChallenge {
  private rec: Recognizer | null = null;
  private timers: number[] = [];
  private done = false;
  private heard: string[] = [];
  private judging = 0;
  constructor(private word: RaceWord, private onView: (v: ChallengeView) => void, private onEnd: (ok: boolean) => void) {}
  private view: ChallengeView = { word: '', syllables: [], phase: 'speaking', heard: '', endsAt: 0, source: 'reading' };
  private set(p: Partial<ChallengeView>) { this.view = { ...this.view, ...p }; this.onView(this.view); }

  async start() {
    const w = this.word;
    this.set({ word: w.word, syllables: w.syllables, phase: 'speaking', heard: '', endsAt: 0, source: w.source });
    if (w.source === 'lexicon') void wordMeaning(w.word).then(m => { if (m) this.set({ meaning: m }); });
    try {
      this.rec = createRecognizer({ vocabulary: [w.word] });
      this.rec.onWords = words => {
        if (this.done) return;
        this.heard.push(...words.flatMap(x => [x.text, ...x.alts]));
        this.set({ heard: [this.view.heard, ...words.map(x => x.text)].filter(Boolean).join(' ') });
        if (heardIt(w.word, this.heard, w.level)) { this.finish(true); return; }
        // one try — but give a long word a beat to finish arriving before calling it a miss
        clearTimeout(this.judging); this.judging = window.setTimeout(() => this.finish(false), 650);
      };
    } catch { this.rec = null; }
    // Voca says it (capped, so a slow voice can't eat the moment)
    if (ttsSupported()) { await initVoice().catch(() => {}); await Promise.race([speak(`${w.word}!`, { rate: 1, pitch: 1.12 }), wait(1600)]); cancelSpeech(); }
    if (this.done) return;
    try { this.rec?.start(); } catch { /* no mic */ }
    this.set({ phase: 'listening', endsAt: performance.now() + VOCA_REACT * 1000 });
    // the visible clock is VOCA_REACT; a hidden half-second covers the recogniser's own lag
    this.timers.push(window.setTimeout(() => { if (!this.heard.length) this.finish(false); }, VOCA_REACT * 1000 + 550));
  }

  private finish(ok: boolean) {
    if (this.done) return; this.done = true;
    clearTimeout(this.judging); this.timers.forEach(t => clearTimeout(t)); this.timers = [];
    try { this.rec?.stop(); } catch { /* already stopped */ } this.rec = null;
    cancelSpeech();
    this.set({ phase: ok ? 'ok' : 'miss' });
    if (ok) void speak(['Boost!', 'Yes! Go go go!', 'Super boost!', 'Nailed it!'][Math.floor(Math.random() * 4)], { rate: 1.05, pitch: 1.2 });
    this.onEnd(ok);
  }
  /** Abort without a result (race left / paused). */
  cancel() { if (this.done) return; this.done = true; clearTimeout(this.judging); this.timers.forEach(t => clearTimeout(t)); try { this.rec?.stop(); } catch { /* */ } this.rec = null; cancelSpeech(); }
}
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ---- Lexicon words (adults / "for fun") ----
/** Where challenge words come from: Voca's reading level, or the Lexicon (dictionary + word database). */
export type WordSource = 'reading' | 'lexicon';
const SOURCE_PREF = 'kith.vocaWordSource';
/** Auto: children and young students read at their Voca level; everyone else gets Lexicon words. The player can switch. */
export function defaultWordSource(profile?: any): WordSource {
  const by = Number(profile?.birthYear), age = by > 1900 ? new Date().getFullYear() - by : NaN;
  if (isChild(profile) || age < 13) return 'reading';
  return 'lexicon';
}
export function wordSourcePref(profile?: any): WordSource { try { const v = localStorage.getItem(SOURCE_PREF); if (v === 'reading' || v === 'lexicon') return v; } catch { /* */ } return defaultWordSource(profile); }
export function setWordSourcePref(v: WordSource) { try { localStorage.setItem(SOURCE_PREF, v); } catch { /* */ } }

/** The Lexicon pool: the curated story-words, plus (signed in) the player's own saved Lexicon journal words. */
export async function lexiconPool(uid?: string | null): Promise<{ words: string[]; saved: string[] }> {
  const words = WORDS_OF_THE_DAY.filter(w => /^[a-z]+$/.test(w) && checkPassageSafety(w, 10).ok);
  let saved: string[] = [];
  if (uid) {
    try {
      const lex = await import('../../services/lexicon/client');
      const rows = await Promise.race([lex.journal(), wait(2500).then(() => [] as { word: string; lang?: string }[])]);
      saved = rows.filter(r => (!r.lang || r.lang === 'en') && /^[a-z]+$/i.test(r.word) && r.word.length >= 3 && checkPassageSafety(r.word, 10).ok).map(r => r.word.toLowerCase());
    } catch { /* offline / signed out: curated words only */ }
  }
  return { words, saved };
}
/** A Lexicon word: half the time one of the player's own saved words (when they have some). */
export function pickLexiconWord(pool: { words: string[]; saved: string[] }, used: Set<string>, rand: () => number = Math.random): RaceWord {
  const saved = pool.saved.filter(w => !used.has(w)), all = pool.words.filter(w => !used.has(w));
  const list = saved.length && (rand() < .5 || !all.length) ? saved : all.length ? all : pool.words;
  const w = list[Math.floor(rand() * list.length)] ?? 'serendipity';
  return { word: w, syllables: syllabify(w), review: false, level: 6, source: 'lexicon' };
}

/** One line of meaning from the Lexicon (Wiktionary-backed) for the card after the moment; null offline. */
export async function wordMeaning(word: string): Promise<string | null> {
  try {
    const r = await Promise.race([fetch(`/api/lexicon/entry?w=${encodeURIComponent(word)}`), wait(2500).then(() => null)]);
    if (!r || !r.ok) return null;
    const e = await r.json();
    const en = e?.langs?.find((l: any) => l.lang === 'en') ?? e?.langs?.[0];
    for (const et of en?.etymologies ?? []) for (const pos of et.pos ?? []) for (const sense of pos.senses ?? []) {
      const t = (sense.text ?? []).map((x: any) => x.t).join('').replace(/\s+/g, ' ').trim();
      if (t && !(sense.labels ?? []).some((l: string) => /vulgar|offensive|slang|obsolete|archaic/i.test(l))) return `${pos.pos ? pos.pos.toLowerCase() + ' · ' : ''}${t.length > 120 ? t.slice(0, 117) + '…' : t}`;
    }
  } catch { /* offline */ }
  return null;
}

/** Ask for the mic once, on the Ready button's tap, so the browser prompt never lands mid-jump. */
export async function primeMic(): Promise<boolean> {
  try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); return true; } catch { return false; }
}
