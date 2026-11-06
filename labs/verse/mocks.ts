// Verse lab stand-ins for the three network-backed modules the viewer reads.
// Everything else (scripture text, the listener, the notebook, the panel) is the real code.
import { useSyncExternalStore } from 'react';

type Fn = () => void;
const subs = new Set<Fn>();
const emit = () => subs.forEach(f => f());

// ── services/orgMedia ──
export type { OnAirItem, OnAirPlayback } from '../../services/orgMedia';
let sources: any[] = [];
export const __setSources = (s: any[]) => { sources = s; emit(); };
export const useOrgLive = () => [];
export const useOrgChannels = () => [];
export const useLiveHubTvPlusSources = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => sources);

// ── services/kairosService ──
export type { ScriptureSession } from '../../services/kairosService';
let session: any = null;
const sessionSubs = new Set<(s: any) => void>();
export const sessionIdFor = (orgId: string) => `svc_${orgId}_lab`;
export const listenToSession = (_sid: string, cb: (s: any) => void) => { sessionSubs.add(cb); cb(session); return () => { sessionSubs.delete(cb); }; };
export const __stage = (refId: string | null, label = '') => {
  session = { id: 'lab', orgId: 'lab', hostId: 'x', title: 'Lab', translation: 'kjv', isActive: true, startedAt: Date.now(), cues: [],
    current: refId ? { refId, label, lines: [], programTC: 0 } : null };
  sessionSubs.forEach(cb => cb(session));
};

// ── services/ambo/liveTranscriber ──
let ev: any = null;
export const __transcriber = { started: 0, stopped: 0, source: '' as string };
export const startSpeechTranscription = async (source: any, events: any) => {
  ev = events; __transcriber.started++; __transcriber.source = source.kind + ':' + (source.stream?.getAudioTracks?.().length ?? 0);
  events.onStatus?.('Listening · lab');
  return { engine: 'whisper', analyser: null, stop: () => { __transcriber.stopped++; if (ev === events) ev = null; } };
};
export const __say = (text: string) => { if (!ev) return false; ev.onWords(text, true); return true; };
/** Read text out loud at a reading pace (~2.5 words/s), in small interim chunks like the transcriber. */
export const __read = async (text: string, wordsPerSec = 2.5) => {
  const w = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < w.length; i += 2) {
    if (!ev) return false;
    ev.onWords(w.slice(i, i + 2).join(' '), false);
    await new Promise(r => setTimeout(r, (2 / wordsPerSec) * 1000));
  }
  return true;
};
