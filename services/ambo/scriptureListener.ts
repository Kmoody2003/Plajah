// scriptureListener — "the speaker said a verse, put it on screen".
//
// Pure detection core (no audio, no DOM, no clock of its own) so it is testable:
//   transcript text in  →  settled scripture references out.
//
// Why a settle delay: ASR streams "John three" before it has heard "sixteen".
// Firing on the first thing we can parse would put John 3 on the wall and then
// replace it a second later. So a detection waits until the text around it has
// stopped changing for `settleMs`, and a more specific reading of the same spot
// ("John 3" → "John 3:16") simply replaces the pending one.
//
// Why a cue-phrase gate: ASR output is lowercase. "acts 2 ways" must not fire,
// "turn with me to acts 2" must. A reference with an explicit chapter:verse is
// trusted on its own; a bare chapter needs a capitalised book or a cue phrase.

import { findRefs, normalizeSpoken, refId, formatRef, isSameRef, phoneticKey, type ScriptureRef } from '../scriptureRef';

export interface ListenerOptions {
  /** Detections below this confidence are dropped. Default 0.7 (a bare chapter). */
  minConfidence?: number;
  /** Text must be unchanged this long after a detection before it fires. Default 1100 ms. */
  settleMs?: number;
  /** The same reference will not fire again inside this window. Default 45 s. */
  cooldownMs?: number;
  /** Rolling transcript window, in words. Default 48. */
  windowWords?: number;
  /**
   * Bare chapters need a capitalised book or a cue phrase ("turn to Acts 2").
   * Default true — right for the room. The operator's own mic is a command
   * channel: "Psalm 23" spoken into it means Psalm 23, so it turns this off.
   */
  requireCue?: boolean;
}

export interface ListenerHit {
  ref: ScriptureRef;
  refId: string;
  label: string;
  /** What the speaker said, as heard. */
  heard: string;
  confidence: number;
  at: number;
  /** "next verse" / "verse 17" resolved against the previous reference. */
  contextual?: boolean;
}

const CUE_BEFORE = /\b(?:turn(?:ing)?\s+(?:with\s+me\s+)?(?:in\s+(?:your\s+)?(?:bibles?\s+)?)?to|open\s+(?:up\s+)?(?:your\s+)?(?:bibles?\s+)?(?:to|at)|look\s+(?:with\s+me\s+)?(?:at|in)|read(?:ing)?\s+(?:from|in)|reading\s+today\s+(?:is|from)|scripture\s+(?:is|reading)|in\s+the\s+book\s+of|the\s+book\s+of|says?\s+in|written\s+in|found\s+in|according\s+to|let'?s\s+read|go\s+to|back\s+to|over\s+in|if\s+you\s+(?:have|turn)|our\s+text\s+(?:is|today))\s+(?:the\s+)?(?:gospel\s+of\s+|book\s+of\s+|letter\s+to\s+(?:the\s+)?)?$/i;

const norm = (s: string) => s.toLowerCase().replace(/[^\w\s:.\-]/g, ' ').replace(/\s+/g, ' ').trim();

interface Pending { hit: ListenerHit; settledAt: number; }

export interface ScriptureListener {
  /** Feed NEW transcript words (stable words or a final segment). `final` flushes sooner. */
  feed(text: string, now: number, final?: boolean): void;
  /** Call on a timer. Returns references that have settled and may fire. */
  poll(now: number): ListenerHit[];
  /** Forget the window (new sermon, mic switched). Cooldowns are kept. */
  reset(): void;
  /** The pending-but-not-yet-fired reading, for a "hearing…" indicator. */
  pending(): ListenerHit | null;
  /** Sync the active reference context (e.g. when auto-advancing to the next verse). */
  setContext?(ref: ScriptureRef): void;
}

/**
 * Detect references in a rolling transcript window.
 * Exported so the same logic can be run one-shot over a whole chunk.
 */
export function detectSpoken(text: string, minConfidence = 0.7, requireCue = true): Array<{ ref: ScriptureRef; confidence: number; heard: string; end: number }> {
  const spoken = normalizeSpoken(text);
  const out: Array<{ ref: ScriptureRef; confidence: number; heard: string; end: number }> = [];
  for (const d of findRefs(spoken, { minConfidence })) {
    const { raw, start, end, confidence, ...ref } = d;
    const hasVerse = ref.verse !== undefined;
    // Nobody SAYS "is 3" or "am 40": two/three-letter aliases are for typed input only
    // ("there is 3 of them" must not become Isaiah 3). "Job" is a full name and stays.
    const bookToken = raw.replace(/\d.*$/, '').trim().split(/\s+/).pop() || '';
    if (bookToken.length <= 3 && bookToken.toLowerCase() !== 'job') continue;
    const capital = /^[A-Z0-9]/.test(raw) && /[A-Z]/.test(raw.replace(/^\d+\s*/, '').charAt(0));
    const before = spoken.slice(Math.max(0, start - 60), start);
    const cued = CUE_BEFORE.test(before);
    // chapter:verse is unmistakable; a bare chapter must be capitalised or cued.
    if (requireCue && !hasVerse && !capital && !cued) continue;
    // A bare chapter in a one-chapter-book ("Jude 5") parses as a verse — fine, it has one.
    out.push({ ref: ref as ScriptureRef, confidence: cued ? Math.min(1, confidence + 0.05) : confidence, heard: raw, end });
  }
  return out;
}

export function createScriptureListener(opts: ListenerOptions = {}): ScriptureListener {
  const minConfidence = opts.minConfidence ?? 0.7;
  const settleMs = opts.settleMs ?? 1100;
  const cooldownMs = opts.cooldownMs ?? 45_000;
  const windowWords = opts.windowWords ?? 48;
  const requireCue = opts.requireCue ?? true;

  let words: string[] = [];
  let lastChange = 0;
  let pend: Pending | null = null;
  let finalSeen = false;
  const fired = new Map<string, number>();

  const recent = (id: string, now: number): boolean => {
    for (const [k, t] of fired) if (now - t > cooldownMs) fired.delete(k);
    return fired.has(id);
  };

  const lastFiredRefs: Array<{ ref: ScriptureRef; at: number }> = [];

  const covered = (ref: ScriptureRef, now: number) =>
    lastFiredRefs.some(f => now - f.at <= cooldownMs && (isSameRef(f.ref, ref) ||
      // a bare chapter / wider reading of something that just fired
      (f.ref.book === ref.book && f.ref.chapter === ref.chapter && ref.verse === undefined)));

  let lastRef: ScriptureRef | null = null;

  /** "verse 17", "verses 16 through 18", "next verse", "previous verse" relative to the last reference that fired (including a bare chapter!). */
  const contextual = (text: string, afterEnd: number): { ref: ScriptureRef; heard: string } | null => {
    if (!lastRef) return null;
    const spoken = normalizeSpoken(text);
    const tail = spoken.slice(Math.max(0, afterEnd));
    const rel = [...tail.matchAll(/\b(next|previous|last)\s+verse\b/gi)].pop();
    const abs = [...tail.matchAll(/\b(?:verses?|vs)\s+(\d{1,3})(?:\s*(?:[-–]|through|thru|to)\s*(\d{1,3}))?\b(?!\s*:)/gi)].pop();
    const relAt = rel ? (rel.index ?? 0) : -1, absAt = abs ? (abs.index ?? 0) : -1;
    if (relAt < 0 && absAt < 0) return null;
    if (relAt > absAt) {
      const curVerse = lastRef.verse ?? 1;
      const base = lastRef.endVerse ?? curVerse;
      const verse = rel![1].toLowerCase() === 'next' ? base + 1 : Math.max(1, curVerse - 1);
      if (!verse || verse > 176) return null;
      return { ref: { ...lastRef, verse, endVerse: undefined, endChapter: undefined }, heard: rel![0] };
    }
    const verse = parseInt(abs![1], 10);
    const endVerse = abs![2] ? parseInt(abs![2], 10) : undefined;
    if (!verse || verse > 176) return null;
    return {
      ref: { ...lastRef, verse, endVerse: endVerse && endVerse > verse ? endVerse : undefined, endChapter: undefined },
      heard: abs![0],
    };
  };

  const evaluate = (now: number) => {
    const text = words.join(' ');
    const found = detectSpoken(text, minConfidence, requireCue);
    const lastFound = found.length ? found[found.length - 1] : null;
    // A verse-only follow-up spoken AFTER the last full reference (or with no new reference at all).
    const ctx = contextual(text, lastFound ? lastFound.end : 0);
    const pick = ctx
      ? { ref: ctx.ref, confidence: 0.88, heard: ctx.heard, ctxHit: true }
      : lastFound ? { ref: lastFound.ref, confidence: lastFound.confidence, heard: lastFound.heard, ctxHit: false } : null;
    if (!pick) { pend = null; return; }
    const id = refId(pick.ref);
    if (!pick.ctxHit && (recent(id, now) || covered(pick.ref, now))) { pend = null; return; }
    if (pick.ctxHit && recent(id, now)) { pend = null; return; }
    if (pend && refId(pend.hit.ref) === id) return; // unchanged; settle clock keeps running
    pend = {
      hit: { ref: pick.ref, refId: id, label: formatRef(pick.ref), heard: pick.heard, confidence: pick.confidence, at: now, contextual: pick.ctxHit },
      settledAt: now,
    };
  };

  return {
    feed(text, now, final) {
      // Callers hand over NEW words only (stable ASR words / final segments).
      if (final) finalSeen = true;
      const next = norm(text).split(' ').filter(Boolean);
      if (!next.length) return;
      words = words.concat(next).slice(-windowWords);
      lastChange = now;
      evaluate(now);
      // NB: the settle clock is NOT reset by later words — a preacher keeps talking after the reference.
    },
    poll(now) {
      if (!pend) return [];
      const quiet = now - lastChange;
      const age = now - pend.settledAt;
      const hasVerse = pend.hit.ref.verse !== undefined;
      // chapter:verse → go once it has held briefly (a range "through 30" may still extend it, and re-fires)
      // bare chapter → wait for a pause or a little longer, so "Romans 8 … verse 28" lands on the verse
      const ready = hasVerse
        ? age >= Math.min(280, settleMs) || (finalSeen && quiet >= 90)
        : quiet >= settleMs || age >= Math.max(1200, settleMs * 1.8) || (finalSeen && quiet >= settleMs / 3);
      if (!ready) return [];
      const hit = pend.hit;
      pend = null;
      finalSeen = false;
      fired.set(hit.refId, now);
      lastFiredRefs.push({ ref: hit.ref, at: now });
      if (lastFiredRefs.length > 24) lastFiredRefs.shift();
      lastRef = hit.ref;
      if (hit.contextual) words = [];            // consume "next verse" so it cannot re-fire
      return [hit];
    },
    reset() { words = []; pend = null; finalSeen = false; },
    pending() { return pend ? pend.hit : null; },
    setContext(ref: ScriptureRef) { lastRef = ref; },
  };
}

// ── Live Scripture Reading Word-by-Word Aligner & Auto-Verse Advance ────────

export interface ReadingWordToken {
  raw: string;
  norm: string;
  key: string;
  verse: number;
  verseWordIndex: number;
  globalWordIndex: number;
  totalVerseWords: number;
}

export interface ReadingTrackerResult {
  /** Updated reading position in the active on-screen passage, or null if not reading it yet. */
  reading: {
    book: number;
    chapter: number;
    verse: number;
    verseWordIndex: number;
    globalWordIndex: number;
    totalVerseWords: number;
    totalGlobalWords: number;
  } | null;
  /** When the speaker reads into the next verse not currently on screen, this fires with the next verse number and initial matched word index. */
  advanceTo: {
    verse: number;
    verseWordIndex: number;
  } | null;
}

const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');

const STOP_SHORT = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'is', 'it', 'by', 'or', 'as', 'be', 'he', 'we', 'ye', 'so', 'no', 'up', 'if', 'my']);

function wordsMatch(spokenNorm: string, spokenKey: string, targetNorm: string, targetKey: string): boolean {
  if (!spokenNorm || !targetNorm) return false;
  if (spokenNorm === targetNorm) return true;
  // Archaic KJV / modern spoken equivalents ("believeth" ↔ "believes", "hath" ↔ "has", "unto" ↔ "to", "saith" ↔ "says", "spake" ↔ "spoke")
  if (targetNorm.endsWith('eth') && spokenNorm.startsWith(targetNorm.slice(0, -3)) && spokenNorm.length >= 4) return true;
  if (targetNorm.endsWith('est') && spokenNorm.startsWith(targetNorm.slice(0, -3)) && spokenNorm.length >= 4) return true;
  if (targetNorm === 'hath' && (spokenNorm === 'has' || spokenNorm === 'had')) return true;
  if (targetNorm === 'saith' && (spokenNorm === 'says' || spokenNorm === 'said')) return true;
  if (targetNorm === 'spake' && spokenNorm === 'spoke') return true;
  if (targetNorm === 'unto' && spokenNorm === 'to') return true;
  if (targetNorm === 'ye' && spokenNorm === 'you') return true;
  if (targetNorm === 'thee' && spokenNorm === 'you') return true;
  if (targetNorm === 'thou' && spokenNorm === 'you') return true;
  if (targetNorm === 'thy' && spokenNorm === 'your') return true;
  if (targetNorm === 'thine' && (spokenNorm === 'your' || spokenNorm === 'yours')) return true;
  // Prefix / stem / compound suffix match for words >= 4 chars (e.g. "conform" ↔ "conformed", "know" ↔ "foreknow")
  if (spokenNorm.length >= 4 && targetNorm.length >= 4) {
    if (targetNorm.startsWith(spokenNorm) || spokenNorm.startsWith(targetNorm)) return true;
    if (targetNorm.endsWith(spokenNorm) || spokenNorm.endsWith(targetNorm)) return true;
    if (spokenKey && spokenKey === targetKey && spokenKey.length >= 3) return true;
  }
  return false;
}

export class ScriptureReadingTracker {
  private book = 0;
  private chapter = 0;
  private startVerse = 0;
  private endVerse = 0;
  private chapterVerses: Array<{ verse: number; text: string }> = [];
  private activeTokens: ReadingWordToken[] = [];
  private nextVerseMap = new Map<number, Array<{ raw: string; norm: string; key: string }>>();
  private cursor = -1;
  private recentSpoken: Array<{ norm: string; key: string }> = [];

  /** Check whether the tracker is already tracking this exact passage at or ahead of minWordIndex. */
  isTracking(book: number, chapter: number, startVerse: number, endVerse: number, minWordIndex = -1): boolean {
    if (this.book !== book || this.chapter !== chapter || this.startVerse !== startVerse || this.endVerse !== endVerse) {
      return false;
    }
    const cur = this.currentReading();
    const curIdx = cur ? cur.verseWordIndex : -1;
    return curIdx >= minWordIndex;
  }

  /** Configure the currently displayed passage and its chapter verses. */
  setPassage(
    book: number,
    chapter: number,
    startVerse: number,
    endVerse: number,
    chapterVerses: Array<{ verse: number; text: string }>,
    initialVerseWordIndex = -1,
  ): ReadingTrackerResult['reading'] {
    this.book = book;
    this.chapter = chapter;
    this.startVerse = startVerse;
    this.endVerse = endVerse;
    this.chapterVerses = chapterVerses;
    this.activeTokens = [];
    this.nextVerseMap.clear();
    this.recentSpoken = [];

    const multi = endVerse > startVerse;
    let globalIdx = 0;

    for (const v of chapterVerses) {
      if (v.verse >= startVerse && v.verse <= endVerse) {
        // Note: multi-verse cues prepend `${v.verse} ` in cuesForRef
        const rawWords = v.text.trim().split(/\s+/).filter(Boolean);
        if (multi) {
          this.activeTokens.push({
            raw: String(v.verse),
            norm: String(v.verse),
            key: '',
            verse: v.verse,
            verseWordIndex: -1,
            globalWordIndex: globalIdx++,
            totalVerseWords: rawWords.length,
          });
        }
        rawWords.forEach((rw, idx) => {
          const n = cleanWord(rw);
          this.activeTokens.push({
            raw: rw,
            norm: n,
            key: phoneticKey(n),
            verse: v.verse,
            verseWordIndex: idx,
            globalWordIndex: globalIdx++,
            totalVerseWords: rawWords.length,
          });
        });
      } else if (v.verse > endVerse && v.verse <= endVerse + 2) {
        const rawWords = v.text.trim().split(/\s+/).filter(Boolean);
        this.nextVerseMap.set(
          v.verse,
          rawWords.map(rw => {
            const n = cleanWord(rw);
            return { raw: rw, norm: n, key: phoneticKey(n) };
          }),
        );
      }
    }

    if (initialVerseWordIndex >= 0) {
      const found = this.activeTokens.findIndex(t => t.verse === startVerse && t.verseWordIndex === initialVerseWordIndex);
      this.cursor = found >= 0 ? found : -1;
    } else {
      this.cursor = -1;
    }

    return this.currentReading();
  }

  clear(): void {
    this.book = 0;
    this.chapter = 0;
    this.startVerse = 0;
    this.endVerse = 0;
    this.chapterVerses = [];
    this.activeTokens = [];
    this.nextVerseMap.clear();
    this.cursor = -1;
    this.recentSpoken = [];
  }

  currentReading(): ReadingTrackerResult['reading'] {
    if (this.cursor < 0 || !this.activeTokens.length) return null;
    const tok = this.activeTokens[Math.min(this.cursor, this.activeTokens.length - 1)];
    return {
      book: this.book,
      chapter: this.chapter,
      verse: tok.verse,
      verseWordIndex: Math.max(0, tok.verseWordIndex),
      globalWordIndex: tok.globalWordIndex,
      totalVerseWords: tok.totalVerseWords,
      totalGlobalWords: this.activeTokens.length,
    };
  }

  /** Feed newly spoken words and return updated per-word highlight or auto-advance trigger. */
  feed(text: string): ReadingTrackerResult {
    if (!this.activeTokens.length) return { reading: null, advanceTo: null };
    const incoming = text
      .trim()
      .split(/\s+/)
      .map(w => {
        const n = cleanWord(w);
        return { norm: n, key: phoneticKey(n) };
      })
      .filter(w => w.norm.length > 0);

    if (!incoming.length) return { reading: this.currentReading(), advanceTo: null };

    let advancedTo: ReadingTrackerResult['advanceTo'] = null;

    for (const w of incoming) {
      this.recentSpoken.push(w);
      if (this.recentSpoken.length > 10) this.recentSpoken.shift();

      // 1. Check if we should advance to the next verse (endVerse + 1) not on screen
      const nextV = this.endVerse + 1;
      const nextWords = this.nextVerseMap.get(nextV);
      if (nextWords && nextWords.length >= 2) {
        const nearEnd = this.cursor >= Math.max(0, Math.floor(this.activeTokens.length * 0.65));
        const recLen = this.recentSpoken.length;

        // When in the last 35% of the current verse, 2 consecutive matching words in the first 6 words of nextVerse advances immediately!
        if (nearEnd && recLen >= 2) {
          const s1 = this.recentSpoken[recLen - 2];
          const s2 = this.recentSpoken[recLen - 1];
          const maxStart = Math.min(5, nextWords.length - 2);
          let matchedNextIdx = -1;
          for (let j = 0; j <= maxStart; j++) {
            if (
              wordsMatch(s1.norm, s1.key, nextWords[j].norm, nextWords[j].key) &&
              wordsMatch(s2.norm, s2.key, nextWords[j + 1].norm, nextWords[j + 1].key) &&
              (!STOP_SHORT.has(s1.norm) || !STOP_SHORT.has(s2.norm) || j === 0)
            ) {
              matchedNextIdx = j + 1;
              break;
            }
          }
          if (matchedNextIdx >= 0) {
            advancedTo = { verse: nextV, verseWordIndex: matchedNextIdx };
            if (this.chapterVerses.length) {
              this.setPassage(this.book, this.chapter, nextV, nextV, this.chapterVerses, matchedNextIdx);
            }
            continue;
          }
        }

        // Even if not near the end (speaker skipped part of current verse or began reading next verse directly),
        // 3 consecutive matching words in the first 8 words of nextVerse advances immediately!
        if (recLen >= 3 && nextWords.length >= 3) {
          const s0 = this.recentSpoken[recLen - 3];
          const s1 = this.recentSpoken[recLen - 2];
          const s2 = this.recentSpoken[recLen - 1];
          const maxStart = Math.min(7, nextWords.length - 3);
          let matchedNextIdx = -1;
          for (let j = 0; j <= maxStart; j++) {
            if (
              wordsMatch(s0.norm, s0.key, nextWords[j].norm, nextWords[j].key) &&
              wordsMatch(s1.norm, s1.key, nextWords[j + 1].norm, nextWords[j + 1].key) &&
              wordsMatch(s2.norm, s2.key, nextWords[j + 2].norm, nextWords[j + 2].key)
            ) {
              const curMatch =
                this.cursor >= 0 &&
                this.cursor + 2 < this.activeTokens.length &&
                wordsMatch(s0.norm, s0.key, this.activeTokens[this.cursor].norm, this.activeTokens[this.cursor].key) &&
                wordsMatch(s1.norm, s1.key, this.activeTokens[this.cursor + 1].norm, this.activeTokens[this.cursor + 1].key) &&
                wordsMatch(s2.norm, s2.key, this.activeTokens[this.cursor + 2].norm, this.activeTokens[this.cursor + 2].key);
              if (!curMatch) {
                matchedNextIdx = j + 2;
                break;
              }
            }
          }
          if (matchedNextIdx >= 0) {
            advancedTo = { verse: nextV, verseWordIndex: matchedNextIdx };
            if (this.chapterVerses.length) {
              this.setPassage(this.book, this.chapter, nextV, nextV, this.chapterVerses, matchedNextIdx);
            }
            continue;
          }
        }
      }

      // 2. Advance per-word cursor within the active passage
      if (this.cursor < 0) {
        const firstCheck = Math.min(3, this.activeTokens.length);
        for (let j = 0; j < firstCheck; j++) {
          const tok = this.activeTokens[j];
          if (tok.verseWordIndex < 0) continue;
          if (wordsMatch(w.norm, w.key, tok.norm, tok.key) && (tok.verseWordIndex === 0 || !STOP_SHORT.has(w.norm))) {
            this.cursor = j;
            break;
          }
        }
        if (this.cursor < 0 && this.recentSpoken.length >= 2) {
          const prev = this.recentSpoken[this.recentSpoken.length - 2];
          for (let j = 0; j < this.activeTokens.length - 1; j++) {
            if (
              wordsMatch(prev.norm, prev.key, this.activeTokens[j].norm, this.activeTokens[j].key) &&
              wordsMatch(w.norm, w.key, this.activeTokens[j + 1].norm, this.activeTokens[j + 1].key) &&
              (!STOP_SHORT.has(prev.norm) || !STOP_SHORT.has(w.norm))
            ) {
              this.cursor = j + 1;
              break;
            }
          }
        }
      } else {
        // Already locked: look ahead up to 7 words from current cursor
        const from = this.cursor + 1;
        const lookAhead = Math.min(this.activeTokens.length, from + 7);
        let matchedAt = -1;
        for (let j = from; j < lookAhead; j++) {
          const tok = this.activeTokens[j];
          if (tok.verseWordIndex < 0) continue;
          const jump = j - this.cursor;
          if (jump > 3 && STOP_SHORT.has(w.norm)) continue;
          if (wordsMatch(w.norm, w.key, tok.norm, tok.key)) {
            matchedAt = j;
            break;
          }
        }
        if (matchedAt >= 0) {
          this.cursor = matchedAt;
        } else if (this.recentSpoken.length >= 2) {
          // Check if 2 consecutive spoken words match further ahead in the verse (speaker skipped a clause)
          const prev = this.recentSpoken[this.recentSpoken.length - 2];
          for (let j = from + 3; j < this.activeTokens.length - 1; j++) {
            if (
              wordsMatch(prev.norm, prev.key, this.activeTokens[j].norm, this.activeTokens[j].key) &&
              wordsMatch(w.norm, w.key, this.activeTokens[j + 1].norm, this.activeTokens[j + 1].key) &&
              (!STOP_SHORT.has(prev.norm) || !STOP_SHORT.has(w.norm))
            ) {
              this.cursor = j + 1;
              break;
            }
          }
        }
      }
    }

    return { reading: this.currentReading(), advanceTo: advancedTo };
  }
}

