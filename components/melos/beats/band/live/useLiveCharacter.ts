// Runs one Session Band character live inside a Chora panel: builds their director with the on-device
// voice (ariaVoice, the sheet's Kokoro voice, captions-only when muted), the band mind (device → cloud
// with consent → built-in), the instrument host's demo player, and a microphone for talking back
// (Voca's recognizer — Windows / Android / browser — paused while the character speaks so it never
// hears itself).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveDirector, type Chattiness, type DirectorDeps, type LiveSnapshot } from '../../../../../services/melos/beats/band/live/director';
import type { Lens, Observation } from '../../../../../services/melos/beats/band/live/observations';
import type { CharacterSheet, Demo } from '../../../../../services/melos/beats/band/character/schema';
import { askPlayer } from '../../../../../services/melos/beats/band/bandMind';
import { loreFact } from '../../../../../services/melos/beats/band/lore';
import { ariaVoice } from '../../../../../services/voice/aria/ariaVoice';
import type { VoiceProfile } from '../../../../../services/voice/aria/types';
import { createRecognizer, listeningAvailable, type Recognizer, type RecState } from '../../../../../services/voca/vocaSpeech';

export interface LiveHost {
  lens: Lens;
  /** Play one demo step on the instrument (stroke name from the sheet's demo, 0–1 velocity). */
  playStep?: (stroke: string, velocity: number, note?: number) => void;
  enrich?: (o: Observation) => Record<string, string | number>;
  screen?: () => string;
  /** A fact about what's on this host (e.g. the current drum); defaults to the player's instrument lore. */
  trivia?: () => string | undefined;
}

const prefKey = (id: string) => `plajah.band.live.${id}`;
function loadPrefs(id: string): { voice: boolean; chattiness: Chattiness } {
  try { const j = JSON.parse(localStorage.getItem(prefKey(id)) || '{}'); return { voice: j.voice !== false, chattiness: [1, 2, 3].includes(j.chattiness) ? j.chattiness : 2 }; }
  catch { return { voice: true, chattiness: 2 }; }
}
function savePrefs(id: string, p: { voice: boolean; chattiness: Chattiness }) { try { localStorage.setItem(prefKey(id), JSON.stringify(p)); } catch { /* storage blocked */ } }

const profileFor = (s: CharacterSheet): VoiceProfile => ({
  id: `band-${s.id}`, name: s.displayName, persona: 'narrator', rate: s.voice.rate, pitch: s.voice.pitch, onDeviceOnly: true,
  providerPrefs: { kokoro: { voice: s.voice.kokoro }, webSpeech: {} }, fallbackOrder: ['kokoro', 'webSpeech'],
});

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res) => {
  const t = setTimeout(res, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
});

export function useLiveCharacter(sheet: CharacterSheet, host: LiveHost) {
  const [prefs, setPrefs] = useState(() => loadPrefs(sheet.id));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const hostRef = useRef(host);
  hostRef.current = host;
  const recRef = useRef<Recognizer | null>(null);

  const director = useMemo(() => {
    const deps: DirectorDeps = {
      sheet,
      lens: host.lens,
      clock: () => performance.now(),
      speak: async (text, onWord, signal) => {
        recRef.current?.suspend();
        try {
          if (!prefsRef.current.voice) {
            // Captions only: reveal at a natural speaking pace.
            const words = text.split(/\s+/);
            for (let i = 0; i < words.length && !signal.aborted; i++) { onWord(i); await sleep(Math.max(180, words[i].length * 55), signal); }
            return;
          }
          const prev = ariaVoice.getProfile();
          ariaVoice.setProfile(profileFor(sheet));
          const stop = () => ariaVoice.cancel();
          signal.addEventListener('abort', stop, { once: true });
          try { await ariaVoice.speak(text, { onWord: (m) => { if (typeof m.i === 'number') onWord(m.i); } }); }
          finally { signal.removeEventListener('abort', stop); if (ariaVoice.getProfile().id === `band-${sheet.id}`) ariaVoice.setProfile(prev); }
        } finally { recRef.current?.resume(); }
      },
      ask: (history, screen, signal) => askPlayer(sheet.id, history, { lesson: `In Chora right now: ${screen}` }, signal),
      perform: async (demo: Demo, signal) => {
        const play = hostRef.current.playStep;
        if (!play) return;
        const beatMs = 60000 / demo.bpm;
        const t0 = performance.now();
        for (const s of demo.steps) {
          const wait = t0 + s.at * beatMs - performance.now();
          if (wait > 0) await sleep(wait, signal);
          if (signal.aborted) return;
          play(s.stroke, s.velocity, s.note);
        }
        await sleep(beatMs, signal);
      },
      enrich: (o) => hostRef.current.enrich?.(o) ?? {},
      screen: () => hostRef.current.screen?.() ?? '',
      trivia: () => hostRef.current.trivia?.() ?? loreFact(sheet.id),
    };
    return new LiveDirector(deps);
    // The lens and sheet are the identity of this character on this host.
  }, [sheet, host.lens]); // eslint-disable-line react-hooks/exhaustive-deps

  const [snap, setSnap] = useState<LiveSnapshot>(director.snapshot);
  useEffect(() => {
    director.chattiness = prefsRef.current.chattiness;
    const off = director.onChange(setSnap);
    director.start();
    return () => { off(); director.stop(); };
  }, [director]);

  const update = useCallback((p: Partial<typeof prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      savePrefs(sheet.id, next);
      director.chattiness = next.chattiness;
      if (p.voice === false) ariaVoice.cancel();
      return next;
    });
  }, [director, sheet.id]);

  // Talking back: open the mic, gather words, send after a pause.
  const [mic, setMic] = useState<RecState>('idle');
  const [heard, setHeard] = useState('');
  const heardRef = useRef('');
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopMic = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setMic('idle');
    director.listen(false);
  }, [director]);
  const startMic = useCallback(() => {
    if (recRef.current || !listeningAvailable()) return;
    const rec = createRecognizer({ lang: 'en-US' });
    recRef.current = rec;
    heardRef.current = '';
    setHeard('');
    rec.onState = (s) => setMic(s);
    rec.onWords = (words) => {
      if (!words.length) return;
      director.listen(true);
      heardRef.current = `${heardRef.current} ${words.map((w) => w.text).join(' ')}`.trim();
      setHeard(heardRef.current);
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = setTimeout(() => {
        const q = heardRef.current;
        heardRef.current = '';
        setHeard('');
        director.listen(false);
        if (q) void director.hear(q);
      }, 1300);
    };
    rec.start();
  }, [director]);
  useEffect(() => () => { if (sendTimer.current) clearTimeout(sendTimer.current); recRef.current?.stop(); recRef.current = null; }, []);

  return {
    snap, director, prefs, update,
    mic: { state: mic, heard, available: listeningAvailable(), kind: recRef.current?.kind ?? null, start: startMic, stop: stopMic },
  };
}
