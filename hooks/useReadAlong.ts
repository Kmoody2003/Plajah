// useReadAlong — the panel's side of services/readAlong: where in the open text the reader is.
// Feed it the words heard in the stream; it answers with the verse and word being read, and
// goes quiet a few seconds after the reading stops matching (the preacher is back to preaching).

import { useCallback, useEffect, useRef, useState } from 'react';
import { createReadAlong, matchStrength } from '../services/readAlong';
import { getParallel } from '../services/scriptureText';
import { EXTRA_ENGLISH_EDITIONS } from '../services/bibleService';
import type { PassageText } from '../components/elevate/VersePanel';

export interface ReadingSpot {
  /** Index into text.lines. */
  line: number;
  /** Word index within that line (whitespace split). */
  word: number;
  /** Still being read right now (matched in the last few seconds). */
  live: boolean;
}

const QUIET_MS = 6000;

export function useReadAlong(text: PassageText | null, active: boolean) {
  const tracker = useRef(createReadAlong());
  const [spot, setSpot] = useState<ReadingSpot | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // The last words heard, so a text that opens mid-reading (or a switch of edition) picks up at once.
  const recent = useRef<string[]>([]);

  // A new chapter (or translation) is a new text to follow; start where the reference pointed.
  const key = text ? `${text.title}|${text.edition ?? ''}|${text.lines.length}` : '';
  useEffect(() => {
    const lines = text?.lines ?? [];
    const start = Math.max(0, lines.findIndex(l => l.id === text?.called));
    tracker.current.setLines(lines.map(l => ({ id: l.id, text: l.text })), start);
    const p = lines.length && recent.current.length ? tracker.current.feed(recent.current.join(' '), Date.now()) : null;
    setSpot(p && activeRef.current ? { line: p.line, word: p.word, live: true } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { if (!active) setSpot(s => (s && s.live ? { ...s, live: false } : s)); }, [active]);

  // Quiet once nothing has matched for a while; the last verse read stays marked.
  useEffect(() => {
    if (!spot?.live) return;
    const t = window.setTimeout(() => setSpot(s => (s ? { ...s, live: false } : s)), QUIET_MS);
    return () => window.clearTimeout(t);
  }, [spot]);

  const feed = useCallback((words: string) => {
    if (!activeRef.current) return;
    recent.current = recent.current.concat(words.split(/\s+/).filter(Boolean)).slice(-12);
    const p = tracker.current.feed(words, Date.now());
    if (p) setSpot({ line: p.line, word: p.word, live: true });
  }, []);

  return { spot, feed };
}

// ── Which edition is the reader reading from? ──────────────────────────────

/** English editions the panel can switch between. Douay-Rheims numbers its books differently. */
const ENGLISH = ['kjv', ...EXTRA_ENGLISH_EDITIONS.map(e => e.slug)];

export interface EditionSwitch { from: string; to: string }

/**
 * Score what is heard against the same chapter in each English edition. One that matches clearly
 * better than the open edition twice in a row is the one being read: switch to it. (A reader on the
 * open edition always scores best there, so this never moves a panel that is already right.)
 * A viewer's own choice of edition is never overridden.
 */
export function useEditionMatch(opts: {
  chapter: { book: number; chapter: number } | null;
  translation: string;
  /** Listening, and the panel shows a Bible. */
  active: boolean;
  sourceKey: string;
  onSwitch: (slug: string) => void;
}) {
  const { chapter, translation, active, sourceKey } = opts;
  const [switched, setSwitchedState] = useState<EditionSwitch | null>(null);
  const switchedRef = useRef<EditionSwitch | null>(null);
  const setSwitched = (s: EditionSwitch | null) => { switchedRef.current = s; setSwitchedState(s); };
  const heard = useRef<string[]>([]);
  const since = useRef(0);
  const wins = useRef<{ slug: string; n: number }>({ slug: '', n: 0 });
  const switches = useRef(0);
  const viewerChose = useRef(false);
  const busy = useRef(false);
  const live = useRef({ chapter, translation, active, onSwitch: opts.onSwitch });
  live.current = { chapter, translation, active, onSwitch: opts.onSwitch };

  // A new source starts fresh: the viewer's choice and the switch count are per source.
  useEffect(() => { viewerChose.current = false; switches.current = 0; setSwitched(null); }, [sourceKey]);
  // A new chapter or edition: listen afresh.
  const chKey = chapter ? `${chapter.book}:${chapter.chapter}` : '';
  useEffect(() => { heard.current = []; since.current = 0; wins.current = { slug: '', n: 0 }; }, [chKey, translation]);

  const evaluate = useCallback(async () => {
    const c = live.current;
    if (busy.current || !c.chapter || !ENGLISH.includes(c.translation) && c.translation !== 'douayrheims') return;
    busy.current = true;
    try {
      const slugs = Array.from(new Set([...ENGLISH, c.translation])).filter(s => s !== 'douayrheims' || s === c.translation);
      const texts = await getParallel(c.chapter.book, c.chapter.chapter, slugs);
      const said = heard.current.join(' ');
      const score = (slug: string) => matchStrength((texts[slug] || []).map(v => ({ id: String(v.verse), text: v.text })), said);
      const current = score(c.translation);
      let best = '', bestScore = 0;
      for (const s of slugs) {
        if (s === c.translation) continue;
        const v = score(s);
        if (v > bestScore) { best = s; bestScore = v; }
      }
      const now = live.current;
      if (now.translation !== c.translation || viewerChose.current) return;
      if (best && bestScore >= 18 && bestScore >= current + 6) {
        wins.current = wins.current.slug === best ? { slug: best, n: wins.current.n + 1 } : { slug: best, n: 1 };
        if (wins.current.n >= 2 && switches.current < 3) {
          switches.current++;
          setSwitched({ from: c.translation, to: best });
          now.onSwitch(best);
        }
      } else {
        wins.current = { slug: '', n: 0 };
      }
    } catch { /* offline: stay on the open edition */ } finally {
      busy.current = false;
    }
  }, []);

  const feed = useCallback((words: string) => {
    const c = live.current;
    if (!c.active || viewerChose.current) return;
    const w = words.split(/\s+/).filter(Boolean);
    heard.current = heard.current.concat(w).slice(-40);
    since.current += w.length;
    if (heard.current.length >= 14 && since.current >= 6) { since.current = 0; void evaluate(); }
  }, [evaluate]);

  return {
    feed,
    switched,
    /** Back to the edition the viewer had; no more switching on this source. */
    undo: useCallback(() => {
      const s = switchedRef.current;
      viewerChose.current = true;
      setSwitched(null);
      if (s) live.current.onSwitch(s.from);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dismiss: useCallback(() => setSwitched(null), []),
    /** The viewer picked an edition themselves. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    viewerChose: useCallback(() => { viewerChose.current = true; setSwitched(null); }, []),
  };
}
