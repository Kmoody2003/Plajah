import { useCallback, useEffect, useRef, useState } from 'react';
import { CaptionAssembler } from '../services/meetings/meetingRecordingCore';
import { saveCaption } from '../services/meetings/meetingRecording';

export interface LiveCaption { uid: string; name: string; text: string; final: boolean; at: number }

interface Args {
  roomId: string;
  selfId: string | undefined;
  selfName: string;
  /** Your call microphone (the same track the call sends). */
  localStream: MediaStream | null;
  sendData: (type: string, payload?: any) => void;
  /** The recording in progress in this room, if any: finished lines are saved to its transcript. */
  recording: { id: string; startedAt: number } | null;
  /** You chose not to be transcribed into recordings. */
  optOut: boolean;
}

/**
 * Live captions where each person's own device transcribes their own microphone (Ambo Whisper),
 * so nothing is sent to a server and every line already knows who said it. Lines travel to the
 * others over the call's data channel; while a recording runs they are also saved to its transcript.
 */
export function useMeetingCaptions({ roomId, selfId, selfName, localStream, sendData, recording, optOut }: Args) {
  const [showCaptions, setShowCaptions] = useState(false);
  const [lines, setLines] = useState<LiveCaption[]>([]);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const recRef = useRef(recording); recRef.current = recording;
  const optRef = useRef(optOut); optRef.current = optOut;
  const sendRef = useRef(sendData); sendRef.current = sendData;
  const lastInterimSent = useRef(0);

  const push = useCallback((c: LiveCaption) => {
    setLines(prev => {
      // One interim line per speaker; a final replaces that speaker's interim.
      const rest = prev.filter(l => !(l.uid === c.uid && !l.final));
      return [...rest, c].slice(-12);
    });
  }, []);

  /** Feed a caption that arrived from another participant. */
  const receive = useCallback((uid: string, name: string, payload: any) => {
    const text = typeof payload?.text === 'string' ? payload.text.slice(0, 600) : '';
    if (!text) return;
    push({ uid, name, text, final: payload?.final === true, at: Date.now() });
  }, [push]);

  // Transcribe my mic while I want captions OR a recording needs my words.
  const transcribeMe = !!localStream && !!selfId && (showCaptions || (!!recording && !optOut));
  useEffect(() => {
    if (!transcribeMe || !localStream || !selfId) return;
    const audio = localStream.getAudioTracks();
    if (!audio.length) return;
    let handle: { stop: () => void } | null = null;
    let cancelled = false;
    const asm = new CaptionAssembler();
    setError('');
    void import('../services/ambo/liveTranscriber').then(({ startSpeechTranscription }) =>
      startSpeechTranscription({ kind: 'stream', stream: new MediaStream(audio) }, {
        onWords: (text, final) => {
          const done = asm.feed(text, final);
          const now = Date.now();
          if (done) {
            push({ uid: selfId, name: 'You', text: done, final: true, at: now });
            sendRef.current('caption', { text: done, final: true });
            const rec = recRef.current;
            if (rec && !optRef.current) void saveCaption(roomId, rec.id, { name: selfName, text: done, at: now - rec.startedAt });
          } else if (asm.interim && now - lastInterimSent.current > 400) {
            lastInterimSent.current = now;
            push({ uid: selfId, name: 'You', text: asm.interim, final: false, at: now });
            sendRef.current('caption', { text: asm.interim, final: false });
          }
        },
        onStatus: s => setStatus(s),
        onError: m => setError(m),
      }, 'en-US', 'Meeting captions'),
    ).then(h => { if (cancelled) h.stop(); else handle = h; })
      .catch(e => setError(e?.message || 'Captions could not start on this device.'));
    return () => { cancelled = true; handle?.stop(); setStatus(''); };
  }, [transcribeMe, localStream, selfId, roomId, selfName, push]);

  // Captions fade: drop finished lines after 9 s.
  useEffect(() => {
    if (!lines.length) return;
    const t = window.setTimeout(() => setLines(prev => prev.filter(l => !l.final || Date.now() - l.at < 9000)), 3000);
    return () => window.clearTimeout(t);
  }, [lines]);

  return { showCaptions, setShowCaptions, lines, receive, transcribing: transcribeMe, status, error };
}
