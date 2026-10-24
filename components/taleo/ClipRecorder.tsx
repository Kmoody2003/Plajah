import React, { useEffect, useRef, useState } from 'react';
import { Circle, Download, Send, Square, RotateCcw } from 'lucide-react';

/**
 * Records a short clip (default 30 s) of a live canvas plus the microphone, then lets the person
 * post it to chat or save it to their device. Used by the fan room's webcam booth and the 3D
 * character studio.
 */
interface ClipRecorderProps {
  /** The canvas being performed on (2D or WebGL with preserveDrawingBuffer). */
  getCanvas: () => HTMLCanvasElement | null;
  maxSeconds?: number;
  /** False hides "Post" (guests can still save locally). */
  canPost: boolean;
  onPost: (clip: Blob, mimeType: string, seconds: number) => Promise<void>;
  /** Download name stem, e.g. "halloween-vault-jack". */
  filenameBase: string;
}

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export const ClipRecorder: React.FC<ClipRecorderProps> = ({
  getCanvas,
  maxSeconds = 30,
  canPost,
  onPost,
  filenameBase,
}) => {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review' | 'posting'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; mime: string; seconds: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopTracks = () => {
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopTracks();
    },
    []
  );
  useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url);
  }, [clip]);

  const start = async () => {
    setNotice(null);
    const canvas = getCanvas();
    const mime = pickMime();
    if (!canvas || !mime || typeof canvas.captureStream !== 'function') {
      setNotice('Recording isn’t supported in this browser.');
      return;
    }
    const video = canvas.captureStream(30);
    const tracks: MediaStreamTrack[] = [...video.getVideoTracks()];
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      tracks.push(...mic.getAudioTracks());
    } catch {
      setNotice('No microphone — recording video only.');
    }
    tracksRef.current = tracks;

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const startedAt = performance.now();
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stopTracks();
      const seconds = Math.min(maxSeconds, Math.round((performance.now() - startedAt) / 100) / 10);
      const type = mime.split(';')[0];
      const blob = new Blob(chunks, { type });
      setClip({ blob, url: URL.createObjectURL(blob), mime: type, seconds });
      setPhase('review');
    };
    recorderRef.current = rec;
    rec.start(250);
    setElapsed(0);
    setPhase('recording');
    timerRef.current = window.setInterval(() => {
      const s = (performance.now() - startedAt) / 1000;
      setElapsed(s);
      if (s >= maxSeconds && rec.state === 'recording') rec.stop();
    }, 200);
  };

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const discard = () => {
    setClip(null);
    setPhase('idle');
    setNotice(null);
  };

  const save = () => {
    if (!clip) return;
    const ext = clip.mime.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = clip.url;
    a.download = `${filenameBase}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
    a.click();
    setNotice('Saved to your downloads.');
  };

  const post = async () => {
    if (!clip) return;
    setPhase('posting');
    try {
      await onPost(clip.blob, clip.mime, clip.seconds);
      setNotice('Posted to the chat!');
      setClip(null);
      setPhase('idle');
    } catch {
      setNotice('Couldn’t post the clip — you can still save it.');
      setPhase('review');
    }
  };

  const pct = Math.min(100, (elapsed / maxSeconds) * 100);

  return (
    <div className="rounded-2xl bg-black/50 border border-rose-500/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">
          🎬 Record a message · up to {maxSeconds}s
        </span>
        {phase === 'idle' && (
          <button
            onClick={() => void start()}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
          >
            <Circle size={11} className="fill-current" /> Record
          </button>
        )}
        {phase === 'recording' && (
          <button
            onClick={stop}
            className="px-3 py-1.5 rounded-xl bg-white text-black font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
          >
            <Square size={11} className="fill-current" /> Stop · {Math.ceil(maxSeconds - elapsed)}s left
          </button>
        )}
      </div>

      {phase === 'recording' && (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-rose-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}

      {(phase === 'review' || phase === 'posting') && clip && (
        <div className="space-y-2">
          <video src={clip.url} controls playsInline className="w-full rounded-xl bg-black aspect-video" />
          <div className="flex flex-wrap gap-1.5">
            {canPost && (
              <button
                onClick={() => void post()}
                disabled={phase === 'posting'}
                className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={11} /> {phase === 'posting' ? 'Posting…' : 'Post to chat'}
              </button>
            )}
            <button
              onClick={save}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={11} /> Save
            </button>
            <button
              onClick={discard}
              disabled={phase === 'posting'}
              className="px-3 py-1.5 rounded-xl bg-transparent hover:bg-white/10 border border-white/15 text-white/70 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={11} /> Retake
            </button>
          </div>
          {!canPost && <p className="text-[10px] text-white/50">Sign in to post clips to the chat.</p>}
        </div>
      )}

      {notice && <p className="text-[11px] text-amber-200 font-semibold">{notice}</p>}
    </div>
  );
};
