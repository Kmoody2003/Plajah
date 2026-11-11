// Sketch Rush host studio. Set up a room (pack, rounds, round length, who draws), post it to the timeline so
// anyone scrolling past can jump in, run the rounds, and go live: the phone streamer burns the drawing, the
// hint, the clock and the top three into the video, with the drawing pad floating over the camera.

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Flag, Loader2, Play, Radio, Share2, SkipForward } from 'lucide-react';
import SketchRushPlay from './SketchRushPlay';
import { useLiveGame } from './useLiveGame';
import { paintStrokes } from './sketchPaint';
import { CANVAS_H, CANVAS_W, foldStrokes, type LiveGameDoc, type PenMode, type StrokeBatch } from '../../services/liveGames/core';
import { liveGame, failed, postLiveGame } from '../../services/liveGames/client';

const MobileLiveStreamer = lazy(() => import('../MobileLiveStreamer'));

interface Props { onExit: () => void; initialGid?: string }

export default function SketchRushStudio({ onExit, initialGid }: Props) {
  const [gid, setGid] = useState<string | null>(initialGid ?? null);
  return (
    <div className="min-h-full bg-[#0b0820] p-3 text-white sm:p-6">
      <div className="mx-auto max-w-6xl">
        <button onClick={onExit} className="mb-3 flex items-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft size={16} /> Games</button>
        {gid ? <Room gid={gid} /> : <Setup onCreated={setGid} />}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── setup
function Setup({ onCreated }: { onCreated: (gid: string) => void }) {
  const [packs, setPacks] = useState<Array<{ id: string; title: string; size: number }>>([]);
  const [title, setTitle] = useState('');
  const [pack, setPack] = useState('everyday');
  const [rounds, setRounds] = useState(6);
  const [secs, setSecs] = useState(75);
  const [pen, setPen] = useState<PenMode>('host');
  const [post, setPost] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { void liveGame.packs().then(r => { if (!failed(r)) setPacks(r.packs); }); }, []);

  const create = async () => {
    setBusy(true); setErr('');
    const r = await liveGame.create({ title: title.trim() || undefined, settings: { pack, rounds, roundMs: secs * 1000, penMode: pen } });
    if (failed(r)) { setErr(r.error); setBusy(false); return; }
    if (post) await postLiveGame(r.game);
    onCreated(r.game.id);
  };

  const field = 'w-full rounded-xl bg-white/10 px-3 py-2.5 outline-none ring-violet-400 focus:ring-2';
  return (
    <div className="mx-auto max-w-xl rounded-3xl bg-gradient-to-br from-[#2a1458] to-[#0d1a3a] p-5 shadow-2xl ring-1 ring-white/10 sm:p-8">
      <div className="mb-1 text-xs font-black uppercase tracking-widest text-pink-300">Host a live game</div>
      <h1 className="text-3xl font-black">Sketch Rush</h1>
      <p className="mt-1 text-sm text-white/70">You draw, your audience guesses. Anyone who sees your post in their feed can jump in and score points, no sign-up needed.</p>
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Room name<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Friday Night Sketch Rush" className={`${field} mt-1`} /></label>
        <label className="block text-sm font-semibold">Word pack
          <select value={pack} onChange={e => setPack(e.target.value)} className={`${field} mt-1`}>
            {(packs.length ? packs : [{ id: 'everyday', title: 'Everyday', size: 0 }]).map(p => <option key={p.id} value={p.id} className="text-black">{p.title}{p.size ? ` (${p.size} words)` : ''}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">Rounds
            <select value={rounds} onChange={e => setRounds(Number(e.target.value))} className={`${field} mt-1`}>{[3, 4, 6, 8, 10, 12].map(n => <option key={n} value={n} className="text-black">{n}</option>)}</select>
          </label>
          <label className="block text-sm font-semibold">Time to draw
            <select value={secs} onChange={e => setSecs(Number(e.target.value))} className={`${field} mt-1`}>{[45, 60, 75, 90, 120].map(n => <option key={n} value={n} className="text-black">{n} seconds</option>)}</select>
          </label>
        </div>
        <fieldset className="text-sm">
          <legend className="mb-1 font-semibold">Who draws?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['host', 'I draw every round'], ['top-guesser', 'Pass the pen to the fastest guesser']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setPen(v)} className={`rounded-xl p-3 text-left ring-1 ${pen === v ? 'bg-violet-600 ring-violet-300' : 'bg-white/5 ring-white/10'}`}>{label}</button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={post} onChange={e => setPost(e.target.checked)} className="h-4 w-4 accent-violet-500" /> Post it to my feed so people can jump in</label>
        {err && <div className="rounded-xl bg-red-600/80 px-3 py-2 text-sm">{err}</div>}
        <button onClick={create} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-black uppercase tracking-widest text-black disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />} Open the room
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── running room
function Room({ gid }: { gid: string }) {
  const L = useLiveGame(gid);
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState('');
  const g = L.game;

  // Latest state for the program overlay (it runs in the composer's frame loop, outside React).
  const snap = useRef<{ game: LiveGameDoc | null; strokes: StrokeBatch[]; secs: number }>({ game: null, strokes: [], secs: 0 });
  snap.current = { game: g, strokes: L.strokes, secs: L.secondsLeft };
  const drawer = useMemo(() => makeProgramOverlay(() => snap.current), []);

  const act = async (fn: () => Promise<any>, ok?: string) => { const r = await fn(); setMsg(failed(r) ? r.error : ok ?? ''); };
  const share = async () => { if (g) { const id = await postLiveGame(g); setMsg(id ? 'Posted to your feed' : 'Could not post'); } };

  if (!g) return <div className="flex h-60 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto truncate text-xl font-black">{g.title}</h1>
        {g.status === 'lobby' && <Btn onClick={() => act(() => liveGame.start(gid))} primary><Play size={15} fill="currentColor" /> Start game</Btn>}
        {(g.status === 'drawing' || g.status === 'choosing') && <Btn onClick={() => act(() => liveGame.skip(gid))}><SkipForward size={15} /> End round</Btn>}
        {g.status !== 'ended' && <Btn onClick={() => setLive(true)} live><Radio size={15} /> Go live</Btn>}
        <Btn onClick={share}><Share2 size={15} /> Post</Btn>
        {g.status !== 'ended' && <Btn onClick={() => { if (confirm('End the game for everyone?')) void act(() => liveGame.end(gid), 'Game ended — points are on everyone’s gamer card'); }}><Flag size={15} /> End</Btn>}
      </div>
      {msg && <div className="mb-3 rounded-xl bg-white/10 px-3 py-2 text-sm">{msg}</div>}
      {g.status === 'lobby' && <p className="mb-3 text-sm text-white/70">{g.players} {g.players === 1 ? 'person has' : 'people have'} joined. Start when you’re ready. People can keep joining mid-game.</p>}
      <SketchRushPlay gid={gid} />

      {live && (
        <Suspense fallback={null}>
          <MobileLiveStreamer
            mode="streamer" initialTitle={`🎨 ${g.title} · guess what I'm drawing!`} programOverlay={drawer}
            onLive={id => { void liveGame.setStream(gid, id); }}
            onClose={() => setLive(false)}
            liveOverlay={() => <div className="pointer-events-auto absolute inset-x-2 bottom-28 z-10 max-h-[60vh] overflow-y-auto"><SketchRushPlay gid={gid} compact /></div>}
          />
        </Suspense>
      )}
    </>
  );
}

function Btn({ children, onClick, primary, live }: { children: React.ReactNode; onClick: () => void; primary?: boolean; live?: boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${primary ? 'bg-white text-black' : live ? 'bg-red-600' : 'bg-white/10 hover:bg-white/15'}`}>{children}</button>;
}

/** Draws the game into every program frame: the board on the right, hint + clock above it, the top three below. */
function makeProgramOverlay(get: () => { game: LiveGameDoc | null; strokes: StrokeBatch[]; secs: number }) {
  return (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const { game, strokes, secs } = get(); if (!game) return;
    const portrait = H > W;
    const bw = portrait ? W * 0.92 : W * 0.46, bh = (bw * CANVAS_H) / CANVAS_W;
    const x = portrait ? (W - bw) / 2 : W - bw - W * 0.03, y = portrait ? H * 0.16 : (H - bh) / 2;
    const pad = Math.round(bw * 0.012);
    ctx.save();
    ctx.fillStyle = 'rgba(20,10,50,0.82)';
    ctx.fillRect(x - pad, y - bh * 0.16 - pad, bw + pad * 2, bh * 1.32 + pad * 2);
    paintStrokes(ctx, foldStrokes(strokes), x, y, bw, bh);
    const fs = Math.round(bh * 0.09);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const head = game.status === 'drawing' ? game.hint.split('').join(' ') : game.status === 'reveal' ? game.revealWord.toUpperCase() : game.status === 'ended' ? 'GAME OVER' : 'SKETCH RUSH';
    ctx.textAlign = 'left'; ctx.fillText(head, x, y - bh * 0.08);
    if (secs > 0) { ctx.textAlign = 'right'; ctx.fillStyle = secs <= 10 ? '#ff5252' : '#fff'; ctx.fillText(`${secs}s`, x + bw, y - bh * 0.08); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd54f'; ctx.font = `800 ${Math.round(fs * 0.7)}px system-ui, sans-serif`;
    const top = game.top.slice(0, 3).map((t, i) => `${i + 1}. ${t.name} ${t.score}`).join('   ');
    ctx.fillText(top || 'Guess in the feed or chat to score!', x, y + bh + bh * 0.08);
    ctx.restore();
  };
}
