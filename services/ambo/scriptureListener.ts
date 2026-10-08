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

import { findRefs, normalizeSpoken, refId, formatRef, isSameRef, type ScriptureRef } from '../scriptureRef';

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

  const evaluate = (now: number) => {
    const text = words.join(' ');
    const found = detectSpoken(text, minConfidence, requireCue);
    if (!found.length) { pend = null; return; }
    // The newest reference in the window is the one being spoken.
    const last = found[found.length - 1];
    const id = refId(last.ref);
    if (recent(id, now) || covered(last.ref, now)) { pend = null; return; }
    if (pend && refId(pend.hit.ref) === id) return; // unchanged; settle clock keeps running
    pend = {
      hit: { ref: last.ref, refId: id, label: formatRef(last.ref), heard: last.heard, confidence: last.confidence, at: now },
      settledAt: now,
    };
  };

  return {
    feed(text, now, final) {
      // Callers hand over NEW words only (stable ASR words / final segments).
      const next = norm(text).split(' ').filter(Boolean);
      if (!next.length) return;
      words = words.concat(next).slice(-windowWords);
      lastChange = now;
      finalSeen = !!final;
      evaluate(now);
      if (pend) pend.settledAt = now;
    },
    poll(now) {
      if (!pend) return [];
      const quiet = now - lastChange;
      if (quiet < settleMs && !(finalSeen && quiet >= settleMs / 3)) return [];
      const hit = pend.hit;
      pend = null;
      fired.set(hit.refId, now);
      lastFiredRefs.push({ ref: hit.ref, at: now });
      if (lastFiredRefs.length > 24) lastFiredRefs.shift();
      return [hit];
    },
    reset() { words = []; pend = null; finalSeen = false; },
    pending() { return pend ? pend.hit : null; },
  };
}
