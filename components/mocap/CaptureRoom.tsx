// Motion Capture room: record with the camera or upload a video, see the solved skeleton beside the footage,
// fix it (smoothing, trim, moves), then save it to the Motion Library or export it (BVH for any 3D tool, or
// straight into a game). Engine: services/mocap/* (solve.ts has the pipeline).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SkeletonView from './SkeletonView';
import { captureVideo, LiveCapture } from '../../services/mocap/capture';
import { solveTake } from '../../services/mocap/solve';
import { loadLifter, type Lifter } from '../../services/mocap/lifter';
import { clipToBvh } from '../../services/mocap/bvh';
import { detectStrikes, findLoop } from '../../services/mocap/moves';
import { saveMotion, listMotions, loadMotion } from '../../services/mocap/library';
import type { MotionClip, MotionMove, RawTake, RawFrame } from '../../services/mocap/types';

export interface SendToGame { (name: string, bvh: string, moves: MotionMove[], fps: number): Promise<string> }

interface Props {
  /** Optional: hand a clip to a game (the lab wires Era Clash 3D's dev sink here). */
  sendToGame?: SendToGame;
  /** Lab/testing: process this video URL as soon as the room opens. */
  autoVideo?: string | null;
}

// Body connections for drawing landmarks over the footage.
const LINKS: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30], [0, 7], [0, 8]];

const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-40';
const primary = `${btn} bg-violet-500 hover:bg-violet-400 text-white`;
const ghost = `${btn} bg-white/5 hover:bg-white/10 text-white/90 border border-white/10`;

function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'take';

export default function CaptureRoom({ sendToGame, autoVideo }: Props) {
  const [mode, setMode] = useState<'idle' | 'camera' | 'processing' | 'review'>('idle');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [take, setTake] = useState<RawTake | null>(null);
  const [clip, setClip] = useState<MotionClip | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** null = Auto (each body point smoothed by its own measured noise); a number overrides it everywhere. */
  const [smooth, setSmooth] = useState<number | null>(null);
  /** Straighten a take that walks in a circle (or turns around for the camera) into a straight line. */
  const [straight, setStraight] = useState(false);
  const straightRef = useRef(false); straightRef.current = straight;
  /** Body correction: the Plajah pose lifter fixes MediaPipe's one-camera depth guesses before solving
   *  (services/mocap/lifter.ts; it fades itself out on frames it is unsure of). On by default once loaded. */
  const [lift, setLift] = useState(true);
  const liftRef = useRef(true); liftRef.current = lift;
  const lifterRef = useRef<Lifter | null>(null);
  const [lifterReady, setLifterReady] = useState(false);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [moveSel, setMoveSel] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [library, setLibrary] = useState<Awaited<ReturnType<typeof listMotions>>>([]);
  const [recording, setRecording] = useState(false);
  const [livePose, setLivePose] = useState<RawFrame | null>(null);
  const [saved, setSaved] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<LiveCapture | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let on = true;
    loadLifter().then((l) => { if (on) { lifterRef.current = l; setLifterReady(true); } }).catch(() => undefined);
    return () => { on = false; };
  }, []);

  const refreshLibrary = useCallback(() => { listMotions().then(setLibrary).catch(() => undefined); }, []);
  useEffect(refreshLibrary, [refreshLibrary]);

  // ── Solve (and re-solve when the smoothing changes) ─────────────────────────────────────────────────
  const solve = useCallback((t: RawTake, s: number | null, keep?: MotionClip) => {
    try {
      const src = liftRef.current && lifterRef.current ? lifterRef.current.apply(t) : t;
      const c = solveTake(src, { smooth: s ?? undefined, straighten: straightRef.current, name: keep?.name ?? t.source.label, id: keep?.id, rights: keep?.rights.performer });
      c.moves = detectStrikes(c);
      setClip(c); setSaved(false);
      setTrim((tr) => (keep && tr[1] > 0 ? tr : [0, c.frames - 1]));
      setMode('review'); setStatus('');
    } catch (e) { setStatus((e as Error).message); setMode('idle'); }
  }, []);

  // ── Camera ──────────────────────────────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    live.current?.close(); live.current = null;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    setLivePose(null);
  }, []);
  useEffect(() => () => { stopCamera(); abort.current?.abort(); }, [stopCamera]);
  // A take solved before the lifter finished loading gets corrected once it arrives.
  useEffect(() => { if (lifterReady && take && clip && liftRef.current) solve(take, smooth, clip); }, [lifterReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCamera = async () => {
    setStatus('Starting the camera…'); setClip(null); setTake(null);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
      stream.current = s;
      const v = videoRef.current!;
      v.srcObject = s; v.muted = true; await v.play();
      setMode('camera');
      setStatus('Loading the pose model…');
      const lc = new LiveCapture(v, 'full');
      lc.onFrame = (f) => setLivePose(f);
      await lc.open();
      live.current = lc;
      setStatus('Step back until your whole body, feet included, is in the picture.');
    } catch (e) { setStatus(`The camera could not start: ${(e as Error).message}`); stopCamera(); setMode('idle'); }
  };

  const toggleRecord = () => {
    const lc = live.current; if (!lc) return;
    if (!lc.isRecording) {
      chunks.current = [];
      try {
        const r = new MediaRecorder(stream.current!, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
        r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        r.start(); recorder.current = r;
      } catch { recorder.current = null; }
      lc.start(); setRecording(true); setStatus('Recording…');
      return;
    }
    const t = lc.stop(`Camera take ${new Date().toLocaleTimeString()}`);
    setRecording(false);
    const finish = () => {
      if (chunks.current.length) setVideoUrl(URL.createObjectURL(new Blob(chunks.current, { type: 'video/webm' })));
      stopCamera();
      if (!t.frames.some(Boolean)) { setStatus('Nobody was found in that take. Try more light and step back.'); setMode('idle'); return; }
      { setSmooth(null); setTake(t); setFrame(0); solve(t, null); }
    };
    if (recorder.current && recorder.current.state !== 'inactive') { recorder.current.onstop = finish; recorder.current.stop(); } else finish();
  };

  // ── Upload ──────────────────────────────────────────────────────────────────────────────────────────
  const onFile = async (file: File) => {
    stopCamera(); setClip(null); setTake(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setMode('processing'); setProgress(0); setStatus('Loading the pose model…');
    abort.current = new AbortController();
    try {
      const t = await captureVideo(file, {
        model: 'heavy', signal: abort.current.signal, label: file.name.replace(/\.[^.]+$/, ''),
        onProgress: (d, n, f) => { setProgress(d / n); setStatus(`Reading frame ${d} of ${n}`); setLivePose(f); },
      });
      setLivePose(null);
      if (!t.frames.some(Boolean)) { setStatus('Nobody was found in this video.'); setMode('idle'); return; }
      { setSmooth(null); setTake(t); setFrame(0); solve(t, null); }
    } catch (e) {
      setStatus((e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message); setMode('idle');
    }
  };

  useEffect(() => {
    if (!autoVideo) return;
    fetch(autoVideo).then((r) => r.blob()).then((b) => onFile(new File([b], autoVideo.split('/').pop() || 'video.mp4', { type: b.type })))
      .catch((e) => setStatus(`Could not load ${autoVideo}: ${(e as Error).message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVideo]);

  // ── Playback: the footage is the clock when there is footage ────────────────────────────────────────
  useEffect(() => {
    if (!playing || !clip) return;
    const v = videoRef.current;
    const useVideo = !!videoUrl && !!v && mode === 'review';
    if (useVideo) { v!.currentTime = trim[0] / clip.fps; v!.play().catch(() => undefined); }
    let raf = 0, last = performance.now(), f = Math.max(trim[0], frame);
    const loopEnd = moveSel !== null ? clip.moves[moveSel].end : trim[1];
    const loopStart = moveSel !== null ? clip.moves[moveSel].start : trim[0];
    const tick = (now: number) => {
      if (useVideo) {
        f = v!.currentTime * clip.fps;
        if (f >= loopEnd) { v!.currentTime = loopStart / clip.fps; f = loopStart; }
      } else {
        f += ((now - last) / 1000) * clip.fps; last = now;
        if (f >= loopEnd) f = loopStart;
      }
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (useVideo) v!.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, clip, videoUrl, trim, moveSel]);

  const scrub = (f: number) => {
    setPlaying(false); setFrame(f);
    const v = videoRef.current;
    if (v && videoUrl && clip) v.currentTime = f / clip.fps;
  };

  // ── Landmarks over the footage ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = overlayRef.current, v = videoRef.current; if (!cv || !v) return;
    const w = v.clientWidth, h = v.clientHeight;
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d')!; g.clearRect(0, 0, w, h);
    const fr = mode === 'review' && take ? take.frames[Math.round(frame)] ?? null : livePose;
    if (!fr || fr.pts.length !== 33) return;
    // object-fit: contain mapping
    const vw = v.videoWidth || 16, vh = v.videoHeight || 9, s = Math.min(w / vw, h / vh), ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
    const P = (i: number) => [ox + fr.pts[i].x * vw * s, oy + fr.pts[i].y * vh * s] as const;
    g.lineWidth = 3; g.strokeStyle = 'rgba(167,139,250,0.9)';
    for (const [a, b] of LINKS) {
      if (fr.pts[a].v < 0.3 || fr.pts[b].v < 0.3) continue;
      g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke();
    }
    g.fillStyle = '#fff';
    for (let i = 0; i < 33; i++) if (fr.pts[i].v > 0.3) { const [x, y] = P(i); g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  }, [frame, livePose, take, mode]);

  // ── Actions ─────────────────────────────────────────────────────────────────────────────────────────
  const trimmed = useMemo(() => {
    if (!clip) return null;
    const [a, b] = trim;
    if (a <= 0 && b >= clip.frames - 1) return clip;
    const J = clip.skeleton.joints.length;
    return {
      ...clip, frames: b - a + 1,
      rot: clip.rot.slice(a * J * 4, (b + 1) * J * 4),
      root: clip.root.slice(a * 3, (b + 1) * 3).map((v, i) => (i % 3 === 1 ? v : v - clip.root[a * 3 + (i % 3)])),
      contacts: { l: clip.contacts.l.slice(a, b + 1), r: clip.contacts.r.slice(a, b + 1) },
      seen: clip.seen?.slice(a, b + 1),
      moves: clip.moves.filter((m) => m.start >= a && m.end <= b).map((m) => ({ ...m, start: m.start - a, end: m.end - a, hit: m.hit !== undefined ? m.hit - a : undefined })),
    } as MotionClip;
  }, [clip, trim]);

  const setRights = (performer: MotionClip['rights']['performer']) => clip && setClip({ ...clip, rights: { performer } });
  const rename = (name: string) => clip && setClip({ ...clip, name });

  const save = async () => {
    if (!trimmed) return;
    await saveMotion(trimmed, take ?? undefined);
    setSaved(true); refreshLibrary();
    setStatus(trimmed.rights.performer === 'unknown' ? 'Saved privately. Confirm who is performing before sharing it.' : 'Saved to your Motion Library.');
  };

  const exportBvh = (move?: MotionMove) => {
    if (!trimmed) return;
    download(`${safeName(trimmed.name)}${move ? `_${safeName(move.name)}` : ''}.bvh`, clipToBvh(trimmed, move ? { start: move.start, end: move.end } : undefined));
  };

  const send = async () => {
    if (!trimmed || !sendToGame) return;
    setStatus('Sending to the game…');
    try { setStatus(await sendToGame(safeName(trimmed.name), clipToBvh(trimmed), trimmed.moves, trimmed.fps)); }
    catch (e) { setStatus(`Could not send: ${(e as Error).message}`); }
  };

  const openSaved = async (id: string) => {
    const rec = await loadMotion(id); if (!rec) { setStatus('That clip could not be opened.'); return; }
    stopCamera(); if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl);
    // Replay the footage when the clip remembers where it came from.
    setVideoUrl(rec.clip.source.url ?? null);
    setStraight(!!rec.clip.stats?.straightened); straightRef.current = !!rec.clip.stats?.straightened;
    setTake(rec.raw ?? null); setTrim([0, rec.clip.frames - 1]); setFrame(0); setMoveSel(null);
    // Re-solve from the raw take with today's solver (results and moves stay current); otherwise show it as saved.
    if (rec.raw) { setSmooth(null); solve(rec.raw, null, rec.clip); } else { setClip(rec.clip); setMode('review'); }
    setSaved(true);
  };

  const loop = () => {
    if (!clip) return;
    const l = findLoop(clip);
    if (l) { setTrim([l.start, l.end]); setMoveSel(null); setStatus(`Loop found: frames ${l.start}–${l.end}.`); }
  };

  const q = clip?.quality;
  const gradeColor = q?.grade === 'good' ? 'text-emerald-300 bg-emerald-500/10' : q?.grade === 'usable' ? 'text-amber-300 bg-amber-500/10' : 'text-rose-300 bg-rose-500/10';
  const f = Math.round(frame);

  return (
    <div className="h-full w-full flex flex-col bg-[#0b0a0f] text-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/10">
        <h1 className="text-lg font-semibold mr-3">Motion Capture</h1>
        {mode !== 'camera'
          ? <button className={primary} onClick={openCamera} disabled={mode === 'processing'}>Use camera</button>
          : <button className={ghost} onClick={() => { stopCamera(); setMode(clip ? 'review' : 'idle'); setStatus(''); }}>Close camera</button>}
        <button className={ghost} onClick={() => fileInput.current?.click()} disabled={mode === 'processing' || recording}>Upload video</button>
        <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) onFile(fl); e.target.value = ''; }} />
        {mode === 'processing' && <button className={ghost} onClick={() => abort.current?.abort()}>Stop</button>}
        <div className="ml-auto flex items-center gap-2">
          <select className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm" value="" onChange={(e) => e.target.value && openSaved(e.target.value)}>
            <option value="">Motion Library ({library.length})</option>
            {library.map((m) => <option key={m.id} value={m.id}>{m.name}{m.frames ? ` · ${(m.frames / m.fps).toFixed(1)} s` : ''}</option>)}
          </select>
        </div>
      </header>

      {status && <div className="px-4 py-2 text-sm text-white/80 bg-white/[0.03] border-b border-white/5" role="status">{status}</div>}
      {mode === 'processing' && <div className="h-1 bg-white/5"><div className="h-full bg-violet-500 transition-all" style={{ width: `${progress * 100}%` }} /></div>}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2 p-2">
        <div className="relative rounded-xl overflow-hidden bg-black min-h-[220px]">
          <video ref={videoRef} src={mode === 'camera' ? undefined : videoUrl ?? undefined} className="absolute inset-0 w-full h-full object-contain" playsInline muted
            style={{ transform: mode === 'camera' ? 'scaleX(-1)' : undefined }} />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: mode === 'camera' ? 'scaleX(-1)' : undefined }} />
          {mode === 'idle' && !clip && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6 text-white/70">
              <p className="text-base text-white">Capture motion from a camera or a video.</p>
              <p className="text-sm max-w-md">Whole body in the picture, feet included, in good light. One person at a time. You'll get a skeleton animation you can save, cut into moves and export.</p>
            </div>
          )}
          {mode === 'camera' && (
            <div className="absolute bottom-3 inset-x-0 flex justify-center">
              <button className={`${btn} px-5 py-2.5 ${recording ? 'bg-rose-500 hover:bg-rose-400' : 'bg-white text-black hover:bg-white/90'}`} onClick={toggleRecord} disabled={!live.current}>
                {recording ? 'Stop recording' : 'Record'}
              </button>
            </div>
          )}
        </div>
        <SkeletonView clip={clip} frame={frame} className="rounded-xl min-h-[220px]" />
      </div>

      {clip && mode === 'review' && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <button className={ghost} onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={0} max={clip.frames - 1} value={f} onChange={(e) => scrub(+e.target.value)} className="flex-1 accent-violet-500" aria-label="Frame" />
            <span className="text-xs tabular-nums text-white/60 w-24 text-right">{(f / clip.fps).toFixed(2)} s / {(clip.frames / clip.fps).toFixed(2)} s</span>
          </div>
          <TakeReport clip={clip} />
          <ContactStrip clip={clip} frame={f} trim={trim} onSeek={scrub} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/60">Trim</span>
            <button className={ghost} onClick={() => setTrim([f, Math.max(f, trim[1])])}>Start here</button>
            <button className={ghost} onClick={() => setTrim([Math.min(trim[0], f), f])}>End here</button>
            <button className={ghost} onClick={() => setTrim([0, clip.frames - 1])}>Whole take</button>
            <button className={ghost} onClick={loop}>Find a loop</button>
            <span className="ml-auto text-white/60">Smoothing</span>
            <input type="range" min={0} max={3.5} step={0.1} value={smooth ?? 1.1} disabled={!take}
              onChange={(e) => setSmooth(+e.target.value)} onPointerUp={() => take && solve(take, smooth, clip)} onKeyUp={() => take && solve(take, smooth, clip)} className="w-28 accent-violet-500" aria-label="Smoothing" />
            <button className={`${btn} py-1 ${smooth === null ? 'bg-violet-500/30 text-white' : 'bg-white/5 text-white/70 border border-white/10'}`} disabled={!take}
              onClick={() => { setSmooth(null); if (take) solve(take, null, clip ?? undefined); }} title="Each body point smoothed by its own measured noise">Auto</button>
          </div>
          {lifterReady && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button className={`${btn} py-1 ${lift ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/80 border border-white/10'}`} disabled={!take}
                onClick={() => { const v = !lift; setLift(v); liftRef.current = v; if (take) solve(take, smooth, clip ?? undefined); }}>
                {lift ? 'Body correction: on' : 'Body correction: off'}</button>
              <span className="text-xs text-white/50">Fixes one-camera depth mistakes (arms and legs pointing the wrong way toward or away from the camera).</span>
            </div>
          )}
          {clip.stats && ((clip.stats.turnDeg > 90 && clip.stats.pathSpeed > 0.25) || clip.stats.straightened) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-white/70">The performer turns {clip.stats.turnDeg}° over this take.</span>
              <button className={`${btn} py-1 ${straight ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/80 border border-white/10'}`} disabled={!take}
                onClick={() => { const v = !straight; setStraight(v); straightRef.current = v; if (take) solve(take, smooth, clip); }}>
                {straight ? 'Straightened: walking in a line' : 'Straighten path'}</button>
              <span className="text-xs text-white/50">For walk and run cycles filmed as a turnaround or in a circle.</span>
            </div>
          )}
          {clip.moves.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-sm text-white/60 mr-1">Moves</span>
              {clip.moves.map((m, i) => (
                <button key={i} className={`${btn} py-1 ${moveSel === i ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/80 border border-white/10'}`}
                  onClick={() => { setMoveSel(moveSel === i ? null : i); scrub(m.start); }}>{m.name}</button>
              ))}
              {moveSel !== null && <button className={ghost} onClick={() => exportBvh(clip.moves[moveSel])}>Export this move</button>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input value={clip.name} onChange={(e) => rename(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm w-56" aria-label="Name" />
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${gradeColor}`}>{q?.grade === 'good' ? 'Good take' : q?.grade === 'usable' ? 'Usable take' : 'Poor take'}</span>
            <span className="text-xs text-white/50">shake {q?.jitter.toFixed(1)} mm · foot slide {q?.skate.toFixed(1)} cm/s · hidden {Math.round((q?.occlusion ?? 0) * 100)}%</span>
            <label className="text-sm text-white/70 flex items-center gap-2 ml-auto">Who is performing?
              <select value={clip.rights.performer} onChange={(e) => setRights(e.target.value as MotionClip['rights']['performer'])} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
                <option value="unknown">Not confirmed</option>
                <option value="self">Me</option>
                <option value="permission">Someone who gave permission</option>
              </select>
            </label>
          </div>
          {q?.notes.length ? <ul className="text-xs text-amber-200/80 list-disc pl-5">{q.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={save}>{saved ? 'Saved' : 'Save to library'}</button>
            <button className={ghost} onClick={() => exportBvh()}>Export BVH</button>
            {sendToGame && <button className={ghost} onClick={send}>Send to Era Clash 3D</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** How the take went, in plain words: one tile per thing the solver read, coloured good / watch / problem. */
function TakeReport({ clip }: { clip: MotionClip }) {
  const q = clip.quality, st = clip.stats;
  const tone = (t: 'ok' | 'warn' | 'bad' | 'info') => ({ ok: 'border-emerald-400/30 bg-emerald-500/[0.07]', warn: 'border-amber-400/30 bg-amber-500/[0.07]', bad: 'border-rose-400/30 bg-rose-500/[0.08]', info: 'border-white/10 bg-white/[0.03]' }[t]);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const kicks = clip.moves.filter((m) => m.effector?.endsWith('Foot')).length, hits = clip.moves.length - kicks;
  const tiles: { label: string; value: string; hint: string; t: 'ok' | 'warn' | 'bad' | 'info' }[] = [
    { label: 'Grade', value: q.grade === 'good' ? 'Good' : q.grade === 'usable' ? 'Usable' : 'Poor', hint: q.notes[0] ?? 'Clean enough to use as is.', t: q.grade === 'good' ? 'ok' : q.grade === 'usable' ? 'warn' : 'bad' },
    { label: 'Performer found', value: st ? pct(st.found) : pct(1 - q.occlusion), hint: 'Frames where the body was detected.', t: (st?.found ?? 1 - q.occlusion) > 0.95 ? 'ok' : (st?.found ?? 1) > 0.8 ? 'warn' : 'bad' },
    { label: 'Shake', value: `${q.jitter.toFixed(1)} mm`, hint: 'Tracking noise left after smoothing. Under 4 is clean.', t: q.jitter <= 4 ? 'ok' : q.jitter <= 9 ? 'warn' : 'bad' },
    { label: 'Foot slide', value: `${q.skate.toFixed(1)} cm/s`, hint: 'How much a pinned foot still slides. Under 2 looks planted.', t: q.skate <= 2 ? 'ok' : q.skate <= 5 ? 'warn' : 'bad' },
  ];
  if (st) tiles.push(
    { label: 'Camera', value: st.followedCamera ? 'Follows the performer' : 'Still', hint: st.followedCamera ? 'Travel comes from the feet, not the picture.' : 'Travel comes from the picture and the feet.', t: 'info' },
    { label: 'Feet', value: `${st.plants.l} L · ${st.plants.r} R plants`, hint: `Airborne ${pct(st.airborne)} · both down ${pct(st.bothFeet)} · pinned ${pct(st.pinned)}`, t: 'info' },
    { label: 'Travel', value: `${st.netSpeed.toFixed(2)} m/s`, hint: `Along the path ${st.pathSpeed.toFixed(2)} m/s · turns ${st.turnDeg}°${st.straightened ? ' (straightened)' : ''} · hips ${st.hipHeight[0].toFixed(2)}–${st.hipHeight[1].toFixed(2)} m`, t: 'info' },
    { label: 'Moves found', value: clip.moves.length ? `${hits} strike${hits === 1 ? '' : 's'} · ${kicks} kick${kicks === 1 ? '' : 's'}` : 'None', hint: 'Blows thrown with a snap: the arm straightens, the foot rises fast.', t: 'info' },
  );
  if (st && st.limbSwapsFixed) tiles.push({ label: 'Left/right fixed', value: `${st.limbSwapsFixed}`, hint: 'Frames where the tracker mixed up left and right limbs.', t: st.limbSwapsFixed > clip.frames * 0.1 ? 'warn' : 'info' });
  return (
    <div className="grid gap-1.5 grid-cols-[repeat(auto-fit,minmax(132px,1fr))]" aria-label="Take results">
      {tiles.map((x) => (
        <div key={x.label} className={`rounded-lg border px-2.5 py-1.5 ${tone(x.t)}`} title={x.hint}>
          <div className="text-[10px] uppercase tracking-wide text-white/50">{x.label}</div>
          <div className="text-sm font-medium text-white leading-tight">{x.value}</div>
          <div className="text-[11px] text-white/55 leading-snug line-clamp-2">{x.hint}</div>
        </div>
      ))}
    </div>
  );
}

/** Foot contacts over time (green = planted), move ranges, the trim window and the playhead. */
function ContactStrip({ clip, frame, trim, onSeek }: { clip: MotionClip; frame: number; trim: [number, number]; onSeek: (f: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const w = cv.clientWidth, h = 40;
    cv.width = w * devicePixelRatio; cv.height = h * devicePixelRatio;
    const g = cv.getContext('2d')!; g.scale(devicePixelRatio, devicePixelRatio);
    const x = (f: number) => (f / Math.max(1, clip.frames - 1)) * w;
    g.fillStyle = '#16141d'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(139,108,255,0.12)'; g.fillRect(x(trim[0]), 0, x(trim[1]) - x(trim[0]), h);
    for (const m of clip.moves) {
      g.fillStyle = 'rgba(255,170,90,0.25)'; g.fillRect(x(m.start), 26, Math.max(2, x(m.end) - x(m.start)), 12);
      if (m.hit !== undefined) { g.fillStyle = '#ffb35c'; g.fillRect(x(m.hit) - 1, 24, 2, 16); }
    }
    const row = (arr: number[], y: number, label: string) => {
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '10px system-ui'; g.fillText(label, 3, y + 8);
      g.fillStyle = '#3ee08f';
      for (let i = 0; i < arr.length; i++) if (arr[i]) g.fillRect(x(i), y, Math.max(1, w / clip.frames + 0.5), 9);
    };
    row(clip.contacts.l, 3, ''); row(clip.contacts.r, 14, '');
    g.fillStyle = '#fff'; g.fillRect(x(frame) - 1, 0, 2, h);
  }, [clip, frame, trim]);
  return (
    <canvas ref={ref} className="w-full h-10 rounded-md cursor-pointer" aria-label="Foot contacts and moves"
      onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.round(((e.clientX - r.left) / r.width) * (clip.frames - 1))); }} />
  );
}
