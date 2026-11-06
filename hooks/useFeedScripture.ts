// useFeedScripture — hear scripture in what the player is playing.
//
// The same detector Stage's auto scripture uses (scriptureListener on the live
// transcriber), run on the player's own audio: the <video> element's
// captureStream(), so no microphone and no permission prompt. It is a private
// listener — it never touches Stage's auto-scripture state or its Program sink,
// so a member watching at home cannot put anything on the sanctuary wall.
//
// What it cannot hear: a cross-origin embed (YouTube, Twitch, Vimeo iframes keep
// their audio to themselves). For those the panel follows the org's Stage cues only,
// and says so.

import { useEffect, useRef, useState } from 'react';
import { createScriptureListener, type ListenerHit } from '../services/ambo/scriptureListener';
import { startSpeechTranscription, type TranscriberHandle } from '../services/ambo/liveTranscriber';
import { normalizeSpoken } from '../services/scriptureRef';

export type FeedListenStatus =
  | 'off'          // turned off, or nothing to listen to
  | 'embed'        // the source is an iframe: its audio cannot be heard
  | 'waiting'      // waiting for the media to start producing audio
  | 'starting'     // the speech model is loading
  | 'listening'
  | 'error';

export interface FeedScriptureState {
  status: FeedListenStatus;
  /** Plain words for the status line ("Loading speech model…"). */
  detail: string;
  /** The last few words heard, book names spelled properly. */
  heard: string;
  /** A reference the listener is hearing but has not settled on yet. */
  hearing: ListenerHit | null;
}

const OFF: FeedScriptureState = { status: 'off', detail: '', heard: '', hearing: null };

function captureAudio(el: HTMLMediaElement): MediaStream | null {
  const cap = (el as any).captureStream ?? (el as any).mozCaptureStream;
  if (typeof cap !== 'function') return null;
  try {
    return cap.call(el) as MediaStream;
  } catch {
    return null; // a tainted (non-CORS) file source
  }
}

/**
 * @param media   the player's <video>, or null when the source is an embed / nothing plays
 * @param enabled the viewer's "listen for scripture" switch (and the org hears references at all)
 * @param isEmbed the source is an iframe
 * @param onHit   a settled reference, with the moment it was heard
 * @param sourceKey the source playing; the player reuses one <video>, so a new source restarts listening
 * @param onSpoken  every new stretch of words heard (a delta) — the read-along follows the reading with it
 */
export function useFeedScripture(
  media: HTMLVideoElement | null,
  enabled: boolean,
  isEmbed: boolean,
  onHit: (hit: ListenerHit) => void,
  sourceKey = '',
  onSpoken?: (words: string) => void,
): FeedScriptureState {
  const [state, setState] = useState<FeedScriptureState>(OFF);
  const onHitRef = useRef(onHit);
  onHitRef.current = onHit;
  const onSpokenRef = useRef(onSpoken);
  onSpokenRef.current = onSpoken;

  useEffect(() => {
    if (!enabled) { setState(OFF); return; }
    if (isEmbed) { setState({ ...OFF, status: 'embed', detail: 'This source plays in its own frame, so its audio can’t be heard here.' }); return; }
    if (!media) { setState(OFF); return; }

    let closed = false;
    let handle: TranscriberHandle | null = null;
    let words: string[] = [];
    const listener = createScriptureListener({ minConfidence: 0.7, requireCue: true, settleMs: 900, cooldownMs: 45_000 });
    // A hit carries the sentence around the reference, not just the reference itself.
    const fire = (hit: ListenerHit) => onHitRef.current({ ...hit, heard: normalizeSpoken(words.join(' ')) || hit.heard });
    const timer = window.setInterval(() => {
      const hits = listener.poll(Date.now());
      for (const hit of hits) fire(hit);
      if (hits.length && !closed) setState(s => ({ ...s, hearing: listener.pending() }));
    }, 150);

    const begin = async (stream: MediaStream) => {
      if (closed || handle) return;
      setState(s => ({ ...s, status: 'starting', detail: 'Getting ready to listen…' }));
      try {
        const h = await startSpeechTranscription({ kind: 'stream', stream }, {
          onWords: (text, final) => {
            const now = Date.now();
            if (text.trim()) words = words.concat(text.split(/\s+/).filter(Boolean)).slice(-14);
            listener.feed(text, now, final);
            if (text.trim()) onSpokenRef.current?.(text);
            for (const hit of listener.poll(now)) fire(hit);
            if (!closed) setState(s => ({ ...s, heard: normalizeSpoken(words.join(' ')), hearing: listener.pending() }));
          },
          onStatus: s => { if (!closed) setState(st => ({ ...st, status: /^Listening/.test(s) ? 'listening' : st.status, detail: s })); },
          onError: m => { if (!closed) setState(st => ({ ...st, status: 'error', detail: m })); },
        }, 'en-US', 'Player scripture');
        if (closed) { h.stop(); return; }
        handle = h;
        setState(s => ({ ...s, status: 'listening', detail: s.detail && /^Listening/.test(s.detail) ? s.detail : 'Listening' }));
      } catch (e) {
        if (!closed) setState(s => ({ ...s, status: 'error', detail: String((e as Error)?.message || 'Could not listen to this source') }));
      }
    };

    // Audio tracks appear once the media has data; try now, then again when it plays.
    const tryStart = () => {
      if (closed || handle) return;
      const stream = captureAudio(media);
      if (!stream) { setState({ ...OFF, status: 'error', detail: 'This source’s audio can’t be read by the browser.' }); return; }
      if (stream.getAudioTracks().length) { void begin(stream); return; }
      setState(s => ({ ...s, status: 'waiting', detail: 'Waiting for the stream’s audio…' }));
      const onTrack = () => { if (stream.getAudioTracks().length) { stream.removeEventListener('addtrack', onTrack); void begin(stream); } };
      stream.addEventListener('addtrack', onTrack);
    };
    setState({ ...OFF, status: 'waiting', detail: 'Waiting for the stream’s audio…' });
    if (media.readyState >= 2) tryStart();
    media.addEventListener('playing', tryStart);

    return () => {
      closed = true;
      window.clearInterval(timer);
      media.removeEventListener('playing', tryStart);
      try { handle?.stop(); } catch { /* */ }
      listener.reset();
    };
  }, [media, enabled, isEmbed, sourceKey]);

  return state;
}
