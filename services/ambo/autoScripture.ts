// autoScripture — the speaker says a verse, Ambo puts it on screen.
//
// transcriber → scriptureListener (settled references) → verse text → a sink
// the presenter provides (it owns Program / Preview). A tiny external store like
// scriptureAutoCue: the Scripture tab, the header chip and the presenter all
// read it without a prop between them.
//
// The same listening session also hears GIVING intent ("let's receive today's
// tithes and offerings") and asks the presenter to bring up the giving graphic,
// and publishes a live feed — every word, tagged when it is an action word —
// plus the incoming audio, for the live-input waveform.
//
// Delivery:
//   auto    straight to Program (+ outputs). A wrong ASR guess is on the wall.
//   cue     lands in Preview, one click to Take. The safe default.
// Style:
//   overlay a transparent lower-third over whatever is live
//   look    any of the scripture looks/templates, chosen once (the operator's
//           own look is restored when auto mode stops)

import { fetchChapter } from '../bibleService';
import { formatRef, refId, expandRef, type ScriptureRef } from '../scriptureRef';
import { createScriptureListener, type ListenerHit } from './scriptureListener';
import { createGivingListener, tagTokens, type GivingHit, type WordTag } from './speechIntents';
import { startLiveTranscription, type TranscribeSource, type TranscriberHandle } from './liveTranscriber';
import { getScriptureLook, setScriptureLook } from './scriptureLook';

export interface AutoCue { refId: string; reference: string; translation: string; lines: string[]; }

export type AutoDelivery = 'auto' | 'cue';
export type AutoStyle = 'overlay' | 'look';
export type AutoSourceKind = 'mic' | 'device';

export interface AutoScripturePrefs {
  delivery: AutoDelivery;
  style: AutoStyle;
  /** Layout used when style = 'overlay'. */
  overlayLayoutId: string;
  /** Layout used when style = 'look'. */
  lookLayoutId: string;
  translation: string;
  source: AutoSourceKind;
  deviceId: string;
  /**
   * The operator's live mic stays open alongside a chosen source (the pastor's
   * mixer feed). It is a command channel: whatever reference the operator says
   * into it goes up, no "turn to…" needed. Only applies when the source is an
   * audio input — when the source IS the mic there is one channel.
   */
  operatorMic: boolean;
  minConfidence: number;
  /** Take the verse off the screen this long after it goes up. 0 = leave it. */
  autoClearSec: number;
  /** A multi-verse reference puts this many verses on one screen. */
  versesPerScreen: number;
  /** Spoken references bring up scripture. */
  listenScripture: boolean;
  /** Giving language ("tithes and offerings") brings up the giving graphic. */
  listenGiving: boolean;
}

export type AutoTriggerKind = 'scripture' | 'giving';

export interface AutoScriptureHistoryItem { at: number; label: string; delivered: AutoDelivery; ok: boolean; kind?: AutoTriggerKind; }

export interface AutoScriptureState {
  running: boolean;
  starting: boolean;
  engine: 'speech' | 'whisper' | null;
  status: string;
  error: string;
  level: number;
  /** What the room is saying right now (last ~14 words). */
  heard: string;
  /** The operator mic channel, when it runs beside an audio-input source. */
  operator: { running: boolean; level: number; heard: string; error: string };
  hearing: ListenerHit | null;
  /** A giving phrase was heard and is about to fire. */
  hearingGiving: GivingHit | null;
  history: AutoScriptureHistoryItem[];
}

export const DEFAULT_PREFS: AutoScripturePrefs = {
  delivery: 'cue', style: 'overlay', overlayLayoutId: 'lower-third', lookLayoutId: 'sanctuary',
  translation: 'kjv', source: 'mic', deviceId: '', operatorMic: true, minConfidence: 0.7, autoClearSec: 0, versesPerScreen: 3,
  listenScripture: true, listenGiving: true,
};

const KEY = 'ambo_auto_scripture_v1';
function readPrefs(): AutoScripturePrefs {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }; } catch { /* */ }
  return { ...DEFAULT_PREFS };
}

let prefs = readPrefs();
const OPERATOR_OFF = { running: false, level: 0, heard: '', error: '' };
let state: AutoScriptureState = { running: false, starting: false, engine: null, status: 'Off', error: '', level: 0, heard: '', operator: OPERATOR_OFF, hearing: null, hearingGiving: null, history: [] };
const listeners = new Set<() => void>();
const emit = () => { for (const fn of listeners) { try { fn(); } catch { /* */ } } };

export const getAutoScripturePrefs = () => prefs;
export const getAutoScriptureState = () => state;
export function subscribeAutoScripture(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setAutoScripturePrefs(patch: Partial<AutoScripturePrefs>) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* */ }
  emit();
}
const setState = (patch: Partial<AutoScriptureState>) => { state = { ...state, ...patch }; emit(); };

// ── live feed: words over the waveform ──────────────────────────────────────
// Separate from `state` so the waveform can redraw on every word without the
// whole settings panel re-rendering.

export type LiveChannel = 'room' | 'operator';
export interface LiveWord { id: number; text: string; at: number; channel: LiveChannel; tag: WordTag | null; }
export interface LiveMarker { id: number; at: number; kind: AutoTriggerKind; label: string; ok: boolean; }
export interface LiveFeed { words: LiveWord[]; markers: LiveMarker[]; }

const FEED_KEEP_MS = 40_000;
const TAG_WINDOW = 40;
let feed: LiveFeed = { words: [], markers: [] };
let feedSeq = 0;
const feedListeners = new Set<() => void>();
const emitFeed = () => { for (const fn of feedListeners) { try { fn(); } catch { /* */ } } };
export const getLiveFeed = () => feed;
export function subscribeLiveFeed(fn: () => void): () => void { feedListeners.add(fn); return () => { feedListeners.delete(fn); }; }

function pushWords(text: string, channel: LiveChannel) {
  const toks = text.split(/\s+/).filter(Boolean);
  if (!toks.length) return;
  const now = Date.now();
  const mine = feed.words.filter(w => w.channel === channel);
  const lastAt = mine.length ? mine[mine.length - 1].at : 0;
  // Words arrive a beat after they were said, often several at once. Spread
  // them back over the moments they were spoken so each sits over its audio.
  const n = toks.length;
  const added: LiveWord[] = toks.map((t, i) => ({
    id: ++feedSeq, text: t, channel, tag: null,
    at: Math.min(now, Math.max(lastAt + 90 * (i + 1), now - 250 - (n - 1 - i) * 210)),
  }));
  const all = feed.words.filter(w => now - w.at < FEED_KEEP_MS).concat(added);
  // Re-tag the recent window: "john" only becomes scripture once "three" arrives.
  const recent = all.filter(w => w.channel === channel).slice(-TAG_WINDOW);
  const tags = tagTokens(recent.map(w => w.text));
  const retag = new Map<number, WordTag | null>();
  recent.forEach((w, i) => { if (w.tag !== tags[i]) retag.set(w.id, tags[i]); });
  feed = {
    words: retag.size ? all.map(w => (retag.has(w.id) ? { ...w, tag: retag.get(w.id)! } : w)) : all,
    markers: feed.markers.filter(m => now - m.at < FEED_KEEP_MS),
  };
  emitFeed();
}

function pushMarker(kind: AutoTriggerKind, label: string, ok: boolean) {
  feed = { ...feed, markers: [...feed.markers, { id: ++feedSeq, at: Date.now(), kind, label, ok }] };
  emitFeed();
}

// ── live audio: read every frame by the waveform, never emitted ─────────────

export interface LiveAudioTap { level: number; analyser: AnalyserNode | null; }
const room: LiveAudioTap = { level: 0, analyser: null };
const operatorTap: LiveAudioTap = { level: 0, analyser: null };
/** The incoming audio right now. Mutable and polled (rAF), not a React store. */
export const getLiveAudio = () => ({ room, operator: operatorTap });

/** Where the presenter wants cues. Set once by the presenter; cleared on unmount. */
export interface AutoScriptureSink {
  fire: (cue: AutoCue) => void;
  cue: (cue: AutoCue) => void;
  clear: () => void;
  /**
   * Bring up the giving / offering graphic. Returns how it went out ('auto' =
   * on Program, 'cue' = in Preview), or null when there is nothing to show.
   */
  giving?: (delivery: AutoDelivery) => AutoDelivery | null;
}
let sink: AutoScriptureSink | null = null;
export function setAutoScriptureSink(s: AutoScriptureSink | null) { sink = s; }

/** Verses for a reference, split into screens of `per` verses. */
export async function cuesForRef(ref: ScriptureRef, translation: string, per: number): Promise<AutoCue[]> {
  const verses = await fetchChapter(translation, ref.book, ref.chapter);
  if (!verses.length) return [];
  const wanted = ref.verse === undefined
    ? verses.map(v => v.verse).slice(0, per)                       // a bare chapter opens at verse 1
    : expandRef(ref).filter(c => c.chapter === ref.chapter).map(c => c.verse);
  const pick = verses.filter(v => wanted.includes(v.verse));
  if (!pick.length) return [];
  const cues: AutoCue[] = [];
  const size = Math.max(1, per);
  for (let i = 0; i < pick.length; i += size) {
    const group = pick.slice(i, i + size);
    const sub: ScriptureRef = { ...ref, verse: group[0].verse, endVerse: group.length > 1 ? group[group.length - 1].verse : undefined, endChapter: undefined };
    cues.push({
      refId: refId(sub), reference: formatRef(sub), translation: translation.toUpperCase(),
      lines: group.map(v => (group.length > 1 ? `${v.verse} ` : '') + v.text),
    });
  }
  return cues;
}

let handle: TranscriberHandle | null = null;
let operatorHandle: TranscriberHandle | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let savedLayout: string | null = null;
let heardWords: string[] = [];
let runId = 0;

async function deliver(hit: ListenerHit, via: 'room' | 'operator' = 'room') {
  const p = prefs;
  if (!p.listenScripture) return;
  let cues: AutoCue[] = [];
  try { cues = await cuesForRef(hit.ref, p.translation, p.versesPerScreen); } catch { /* offline */ }
  const first = cues[0];
  const item: AutoScriptureHistoryItem = { at: Date.now(), label: via === 'operator' ? `🎙 ${hit.label}` : hit.label, delivered: p.delivery, ok: !!first, kind: 'scripture' };
  setState({ history: [item, ...state.history].slice(0, 12), hearing: null });
  pushMarker('scripture', hit.label, !!first);
  if (!first || !sink) return;
  // The look owns the layout while auto mode runs; the operator's own is restored on stop.
  setScriptureLook({ layoutId: p.style === 'overlay' ? p.overlayLayoutId : p.lookLayoutId });
  if (p.delivery === 'auto') sink.fire(first); else sink.cue(first);
  if (clearTimer) clearTimeout(clearTimer);
  if (p.delivery === 'auto' && p.autoClearSec > 0) clearTimer = setTimeout(() => sink?.clear(), p.autoClearSec * 1000);
}

function deliverGiving(_hit: GivingHit) {
  const p = prefs;
  if (!p.listenGiving) return;
  const went = sink?.giving?.(p.delivery) ?? null;
  const item: AutoScriptureHistoryItem = { at: Date.now(), label: 'Giving', delivered: went ?? p.delivery, ok: !!went, kind: 'giving' };
  setState({ history: [item, ...state.history].slice(0, 12), hearingGiving: null });
  pushMarker('giving', 'Giving', !!went);
}

export async function startAutoScripture(): Promise<void> {
  if (state.running || state.starting) return;
  const my = ++runId;
  setState({ starting: true, error: '', status: 'Starting…', heard: '', hearing: null, hearingGiving: null, operator: OPERATOR_OFF });
  const listener = createScriptureListener({ minConfidence: prefs.minConfidence });
  // One giving listener hears both channels: the operator saying "offering" counts too.
  const giving = createGivingListener();
  heardWords = [];
  feed = { words: [], markers: [] }; emitFeed();
  const useDevice = prefs.source === 'device' && !!prefs.deviceId;
  const source: TranscribeSource = useDevice ? { kind: 'device', deviceId: prefs.deviceId } : { kind: 'mic' };
  // The operator's mic, beside the chosen input — a command channel, so no cue
  // phrase is needed and it settles faster. It starts in parallel: the room
  // input may be downloading its speech model, and the operator should not wait.
  const opListener = useDevice && prefs.operatorMic
    ? createScriptureListener({ minConfidence: 0.6, requireCue: false, settleMs: 700, cooldownMs: 8000 })
    : null;
  savedLayout = getScriptureLook().layoutId;
  if (opListener) void startOperatorMic(my, opListener, giving);
  timer = setInterval(() => {
    const now = Date.now();
    for (const hit of listener.poll(now)) void deliver(hit);
    if (opListener) for (const hit of opListener.poll(now)) void deliver(hit, 'operator');
    for (const hit of giving.poll(now)) deliverGiving(hit);
  }, 250);
  try {
    const h = await startLiveTranscription(source, {
      onWords: (text, final) => {
        const now = Date.now();
        heardWords = heardWords.concat(text.split(/\s+/).filter(Boolean)).slice(-14);
        listener.feed(text, now, final);
        giving.feed(text, now);
        pushWords(text, 'room');
        setState({
          heard: heardWords.join(' '),
          hearing: prefs.listenScripture ? listener.pending() : null,
          hearingGiving: prefs.listenGiving ? giving.pending() : null,
        });
      },
      onStatus: s => { if (my === runId) setState({ status: s }); },
      onLevel: level => {
        if (my !== runId) return;
        room.level = level;
        if (Math.abs(level - state.level) > 0.08) setState({ level });
      },
      onError: m => setState({ error: m }),
    });
    if (my !== runId) { h.stop(); return; }
    handle = h;
    room.analyser = h.analyser;
    setState({ running: true, starting: false, engine: h.engine, status: 'Listening' });
  } catch (e) {
    if (my !== runId) return;
    const error = state.error || String((e as Error)?.message || 'Could not start listening');
    stopAutoScripture();
    setState({ error });
  }
}

async function startOperatorMic(my: number, listener: ReturnType<typeof createScriptureListener>, giving: ReturnType<typeof createGivingListener>) {
  let words: string[] = [];
  const op = (patch: Partial<AutoScriptureState['operator']>) => { if (my === runId) setState({ operator: { ...state.operator, ...patch } }); };
  try {
    const h = await startLiveTranscription({ kind: 'mic' }, {
      onWords: (text, final) => {
        words = words.concat(text.split(/\s+/).filter(Boolean)).slice(-10);
        listener.feed(text, Date.now(), final);
        giving.feed(text, Date.now());
        pushWords(text, 'operator');
        op({ heard: words.join(' ') });
        if (!state.hearing && listener.pending() && prefs.listenScripture) setState({ hearing: listener.pending() });
        if (!state.hearingGiving && giving.pending() && prefs.listenGiving) setState({ hearingGiving: giving.pending() });
      },
      onLevel: level => {
        if (my !== runId) return;
        operatorTap.level = level;
        if (Math.abs(level - state.operator.level) > 0.08) op({ level });
      },
      onError: m => op({ error: m }),
    });
    if (my !== runId) { h.stop(); return; }
    operatorHandle = h;
    operatorTap.analyser = h.analyser;
    op({ running: true, error: '' });
  } catch (e) {
    op({ running: false, error: state.operator.error || String((e as Error)?.message || 'Operator mic could not start') });
  }
}

export function stopAutoScripture(): void {
  runId++;
  if (timer) { clearInterval(timer); timer = null; }
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  try { handle?.stop(); } catch { /* */ }
  try { operatorHandle?.stop(); } catch { /* */ }
  handle = null;
  operatorHandle = null;
  room.level = 0; room.analyser = null;
  operatorTap.level = 0; operatorTap.analyser = null;
  if (savedLayout) { setScriptureLook({ layoutId: savedLayout }); savedLayout = null; }
  setState({ running: false, starting: false, engine: null, status: 'Off', level: 0, hearing: null, hearingGiving: null, operator: OPERATOR_OFF });
}
