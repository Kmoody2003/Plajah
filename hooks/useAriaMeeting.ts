import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelaBlock } from '../types';
import {
  EMPTY_NOTES, guardNotes, mergeIntoPage, notesToBlocks, parseNotes, recapMessage, rulesStep, shouldStep,
  stepPrompt, wakeRequest, type AriaLane, type AriaLine, type AriaNotes, type StepClock,
} from '../services/meetings/ariaMeetingCore';

/** Where Aria writes: the editor hands this in (Tela implements it with its own ops). */
export interface AriaNotesSink {
  /** The document's title, used as the meeting title. */
  title: string;
  /** Add Aria's notes page; returns the Writer device id. */
  createPage: (blocks: TelaBlock[], label: string) => string | null;
  /** The page's current blocks, or null if someone deleted it. */
  readPage: (deviceId: string) => TelaBlock[] | null;
  writePage: (deviceId: string, blocks: TelaBlock[]) => void;
  /** Scroll the editor to the page. */
  focusPage?: (deviceId: string) => void;
}

export const ARIA_PAGE_LABEL = 'Meeting notes · Aria';

interface Args {
  sink: AriaNotesSink | null | undefined;
  /** Team chat room for the closing recap (null = don't post). */
  roomId: string | null;
  /** Injected for the lab and tests; defaults to the real model call. */
  callModel?: (lane: 'local' | 'cloud', user: string, signal: AbortSignal) => Promise<string>;
  postRecap?: (roomId: string, text: string) => Promise<void>;
  now?: () => number;
}

export type AriaPhase = 'off' | 'listening' | 'writing' | 'closing';

/**
 * Runs Aria on this device (the host's). Feed it finished caption lines from everyone in the call;
 * it keeps a Writer page of live notes up to date in the document.
 */
export function useAriaMeeting({ sink, roomId, callModel, postRecap, now = Date.now }: Args) {
  const [phase, setPhase] = useState<AriaPhase>('off');
  const [lane, setLane] = useState<AriaLane>('rules');
  const [notes, setNotes] = useState<AriaNotes>(EMPTY_NOTES);
  const [heard, setHeard] = useState(0);
  const [error, setError] = useState('');
  const [humanEdited, setHumanEdited] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [pageId, setPageId] = useState<string | null>(null);

  const sinkRef = useRef(sink); sinkRef.current = sink;
  const s = useRef({
    active: false, lane: 'rules' as AriaLane, startedAt: 0,
    transcript: [] as AriaLine[], pending: [] as { request: string; by: string }[],
    clock: { lastStepAt: 0, cursor: 0, inFlight: false } as StepClock,
    notes: EMPTY_NOTES as AriaNotes, lastWritten: null as TelaBlock[] | null, pageId: null as string | null,
    abort: null as AbortController | null, failures: 0,
  });

  const speakers = () => [...new Set(s.current.transcript.map(l => l.name))];

  const write = useCallback((live: boolean) => {
    const st = s.current, k = sinkRef.current;
    if (!k) return;
    const next = notesToBlocks(st.notes, { title: k.title || 'Untitled', startedAt: st.startedAt, speakers: speakers(), lane: st.lane, live });
    let current = st.pageId ? k.readPage(st.pageId) : null;
    if (!st.pageId || current === null) {
      // First write, or someone deleted the page: start a fresh one.
      st.pageId = k.createPage(next, ARIA_PAGE_LABEL);
      st.lastWritten = next;
      setPageId(st.pageId);
      setHumanEdited(false);
      return;
    }
    const merged = mergeIntoPage(current, st.lastWritten, next);
    if (merged.changed) k.writePage(st.pageId, merged.blocks);
    st.lastWritten = next;
    setHumanEdited(merged.humanEdited);
  }, []);

  const step = useCallback(async (final: boolean) => {
    const st = s.current, k = sinkRef.current;
    if (!k || st.clock.inFlight) return;
    const end = st.transcript.length;
    const pending = st.pending.slice();
    st.clock.inFlight = true;
    setPhase(final ? 'closing' : 'writing');
    try {
      let next: AriaNotes | null;
      if (st.lane === 'rules') {
        next = rulesStep(st.notes, st.transcript.slice(0, end), st.clock.cursor, pending);
      } else {
        const user = stepPrompt({ title: k.title || 'Untitled', notes: st.notes, transcript: st.transcript.slice(0, end), cursor: st.clock.cursor, startedAt: st.startedAt, pending, final });
        st.abort = new AbortController();
        const call = callModel ?? (async (l, u, sig) => (await import('../services/meetings/ariaMeeting')).ariaModelCall(l, u, sig));
        const parsed = parseNotes(await call(st.lane, user, st.abort.signal));
        next = parsed ? guardNotes(st.notes, parsed) : null;
        if (!parsed) throw new Error('Aria’s answer was unusable; she will try again with the next lines.');
      }
      st.notes = next;
      st.clock.cursor = end;
      st.pending = st.pending.slice(pending.length);
      st.failures = 0;
      setNotes(next);
      setError('');
      write(!final);
      setLastUpdate(now());
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      st.failures += 1;
      setError(e?.message || 'Aria could not update the notes this time.');
      // Three cloud/local failures in a row: keep notes going without AI rather than going quiet.
      if (st.failures >= 3 && st.lane !== 'rules') {
        st.lane = 'rules'; setLane('rules');
        setError('Aria switched to notes without AI after repeated errors.');
      }
    } finally {
      st.clock.inFlight = false;
      st.clock.lastStepAt = now();
      st.abort = null;
      if (st.active) setPhase('listening');
    }
  }, [callModel, now, write]);

  /** Bring Aria into the meeting. */
  const start = useCallback((l: AriaLane) => {
    const st = s.current;
    if (!sinkRef.current || st.active) return;
    Object.assign(st, {
      active: true, lane: l, startedAt: now(), transcript: [], pending: [], notes: EMPTY_NOTES,
      lastWritten: null, pageId: null, failures: 0, clock: { lastStepAt: now(), cursor: 0, inFlight: false },
    });
    setLane(l); setNotes(EMPTY_NOTES); setHeard(0); setError(''); setHumanEdited(false); setLastUpdate(0);
    setPhase('listening');
    write(true);
    if (st.pageId) sinkRef.current?.focusPage?.(st.pageId);
  }, [now, write]);

  /** A finished caption line from anyone in the call (including you). */
  const feed = useCallback((line: AriaLine) => {
    const st = s.current;
    if (!st.active || !line.text.trim()) return;
    st.transcript.push({ ...line, text: line.text.slice(0, 600) });
    const req = wakeRequest(line.text);
    if (req) st.pending.push({ request: req, by: line.name });
    setHeard(st.transcript.length);
  }, []);

  /** Aria leaves: a closing pass, then the recap goes to the team chat. Returns the recap text. */
  const stop = useCallback(async (opts: { post?: boolean } = {}) => {
    const st = s.current;
    if (!st.active) return null;
    // Wait for a step in flight (bounded), then a closing pass if anything is unseen.
    for (let i = 0; i < 40 && st.clock.inFlight; i++) await new Promise(r => setTimeout(r, 250));
    if (st.transcript.length > st.clock.cursor || st.pending.length) await step(true);
    else write(false);
    st.active = false;
    setPhase('off');
    const text = st.transcript.length ? recapMessage(st.notes, sinkRef.current?.title || 'Untitled', now() - st.startedAt) : null;
    if (text && roomId && opts.post !== false) {
      const post = postRecap ?? (async (r, t) => (await import('../services/meetings/ariaMeeting')).postAriaRecap(r, t));
      await post(roomId, text).catch((e: any) => setError(e?.message || 'The recap could not be posted to the team chat.'));
    }
    return text;
  }, [now, postRecap, roomId, step, write]);

  // The pacing loop.
  useEffect(() => {
    if (phase === 'off') return;
    const t = window.setInterval(() => {
      const st = s.current;
      if (st.active && shouldStep(st.clock, st.transcript.length, st.pending.length, now())) void step(false);
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, now, step]);

  // Leaving the editor/call mid-meeting: stop calls, keep what's on the page.
  useEffect(() => () => { s.current.abort?.abort(); s.current.active = false; }, []);

  return {
    active: phase !== 'off', phase, lane, notes, heard, error, humanEdited, lastUpdate, pageId,
    start, stop, feed,
    focus: () => { if (s.current.pageId) sinkRef.current?.focusPage?.(s.current.pageId); },
  };
}

export type UseAriaMeeting = ReturnType<typeof useAriaMeeting>;
