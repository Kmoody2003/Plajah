// Host a live party game from Plajah Games: pick one of the four, set it up, run it, and go live with the game
// burned into the video. Sketch Rush keeps its own studio (drawing tools); the other three share this one.
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Play, Radio, Share2 } from 'lucide-react';
import SketchRushStudio from './SketchRushStudio';
import LiveGamePlay, { GAME_BLURBS, GAME_EMOJI, GAME_TITLES, HostControls, useLiveDoc, useProgramOverlay } from './LiveGamePlay';
import { createLiveGame } from './createLiveGame';
import { liveParty, failed, postLiveGame, LIVE_KINDS, type AnyLiveKind } from '../../services/liveGames/client';
import type { PartyKind } from '../../services/liveGames/party';

const MobileLiveStreamer = lazy(() => import('../MobileLiveStreamer'));

export default function LiveGamesStudio({ onExit, initialKind }: { onExit: () => void; initialKind?: AnyLiveKind }) {
  const [kind, setKind] = useState<AnyLiveKind | null>(initialKind ?? null);
  const [gid, setGid] = useState<string | null>(null);
  if (kind === 'sketch') return <SketchRushStudio onExit={() => (initialKind ? onExit() : setKind(null))} />;
  return (
    <div className="min-h-full bg-[#0b0820] p-3 text-white sm:p-6">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => (gid ? setGid(null) : kind && !initialKind ? setKind(null) : onExit())} className="mb-3 flex items-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft size={16} /> {kind && !initialKind ? 'All games' : 'Games'}</button>
        {!kind ? <GamePicker onPick={setKind} /> : gid ? <PartyRoom gid={gid} kind={kind as PartyKind} /> : <PartySetup kind={kind as PartyKind} onCreated={setGid} />}
      </div>
    </div>
  );
}

export function GamePicker({ onPick, compact }: { onPick: (k: AnyLiveKind) => void; compact?: boolean }) {
  return (
    <div>
      {!compact && <><div className="text-xs font-black uppercase tracking-widest text-pink-300">Host a live game</div><h1 className="mb-4 text-3xl font-black">Pick a game</h1></>}
      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>
        {LIVE_KINDS.map(k => (
          <button key={k} onClick={() => onPick(k)} className="rounded-2xl bg-gradient-to-br from-[#2a1458] to-[#0d1a3a] p-4 text-left ring-1 ring-white/10 transition hover:ring-violet-400 active:scale-[0.99]">
            <div className={compact ? 'text-2xl' : 'text-3xl'}>{GAME_EMOJI[k]}</div>
            <div className={`mt-1 font-black ${compact ? 'text-sm' : 'text-xl'}`}>{GAME_TITLES[k]}</div>
            <div className={`text-white/65 ${compact ? 'text-[11px] leading-snug' : 'text-sm'}`}>{GAME_BLURBS[k]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

const TIME_CHOICES: Record<PartyKind, number[]> = { trivia: [8, 10, 12, 15, 20], crowd: [15, 20, 25, 35, 45], impostor: [30, 40, 60, 90] };
const ROUND_CHOICES: Record<PartyKind, number[]> = { trivia: [5, 8, 10, 15, 20], crowd: [3, 4, 6, 8, 10], impostor: [2, 3, 4, 6, 8] };

function PartySetup({ kind, onCreated }: { kind: PartyKind; onCreated: (gid: string) => void }) {
  const [packs, setPacks] = useState<Array<{ id: string; title: string; size: number }>>([]);
  const [title, setTitle] = useState('');
  const [pack, setPack] = useState('');
  const [rounds, setRounds] = useState(ROUND_CHOICES[kind][2]);
  const [secs, setSecs] = useState(TIME_CHOICES[kind][2]);
  const [post, setPost] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { void liveParty.packs(kind).then(r => { if (!failed(r)) { setPacks(r.packs); setPack(p => p || r.packs[0]?.id || ''); } }); }, [kind]);
  const create = async () => {
    setBusy(true); setErr('');
    const r = await createLiveGame(kind, { title: title.trim() || undefined, pack, rounds, secs, post });
    if ('error' in r) { setErr(r.error); setBusy(false); return; }
    onCreated(r.gid);
  };
  const field = 'w-full rounded-xl bg-white/10 px-3 py-2.5 outline-none ring-violet-400 focus:ring-2';
  return (
    <div className="mx-auto max-w-xl rounded-3xl bg-gradient-to-br from-[#2a1458] to-[#0d1a3a] p-5 shadow-2xl ring-1 ring-white/10 sm:p-8">
      <div className="mb-1 text-xs font-black uppercase tracking-widest text-pink-300">Host a live game</div>
      <h1 className="text-3xl font-black">{GAME_EMOJI[kind]} {GAME_TITLES[kind]}</h1>
      <p className="mt-1 text-sm text-white/70">{GAME_BLURBS[kind]} Anyone who sees your post can jump in, no sign-up needed.</p>
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Room name<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder={`Friday Night ${GAME_TITLES[kind]}`} className={`${field} mt-1`} /></label>
        <label className="block text-sm font-semibold">{kind === 'trivia' ? 'Question pack' : kind === 'crowd' ? 'Prompt pack' : 'Word pack'}
          <select value={pack} onChange={e => setPack(e.target.value)} className={`${field} mt-1`}>
            {packs.map(p => <option key={p.id} value={p.id} className="text-black">{p.title} ({p.size})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">Rounds<select value={rounds} onChange={e => setRounds(Number(e.target.value))} className={`${field} mt-1`}>{ROUND_CHOICES[kind].map(n => <option key={n} value={n} className="text-black">{n}</option>)}</select></label>
          <label className="block text-sm font-semibold">{kind === 'impostor' ? 'Time for clues' : 'Time to answer'}<select value={secs} onChange={e => setSecs(Number(e.target.value))} className={`${field} mt-1`}>{TIME_CHOICES[kind].map(n => <option key={n} value={n} className="text-black">{n} seconds</option>)}</select></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={post} onChange={e => setPost(e.target.checked)} className="h-4 w-4 accent-violet-500" /> Post it to my feed so people can jump in</label>
        {err && <div className="rounded-xl bg-red-600/80 px-3 py-2 text-sm">{err}</div>}
        <button onClick={create} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-black uppercase tracking-widest text-black disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />} Open the room
        </button>
      </div>
    </div>
  );
}

function PartyRoom({ gid, kind }: { gid: string; kind: PartyKind }) {
  const { game } = useLiveDoc(gid);
  const overlay = useProgramOverlay(gid);
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState('');
  if (!game) return <div className="flex h-60 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto truncate text-xl font-black">{game.title}</h1>
        <HostControls gid={gid} kind={kind} />
        {game.status !== 'ended' && <button onClick={() => setLive(true)} className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold"><Radio size={15} /> Go live</button>}
        <button onClick={async () => setMsg((await postLiveGame(game)) ? 'Posted to your feed' : 'Could not post')} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold"><Share2 size={15} /> Post</button>
      </div>
      {msg && <div className="mb-3 rounded-xl bg-white/10 px-3 py-2 text-sm">{msg}</div>}
      <LiveGamePlay gid={gid} kind={kind} />
      {live && overlay && (
        <Suspense fallback={null}>
          <MobileLiveStreamer
            mode="streamer" initialTitle={`${GAME_EMOJI[kind]} ${game.title} · play along!`} programOverlay={overlay}
            onLive={id => { void liveParty.setStream(gid, id); }} onClose={() => setLive(false)}
            liveOverlay={() => (
              <div className="pointer-events-auto absolute inset-x-2 bottom-28 z-10 max-h-[60vh] space-y-2 overflow-y-auto">
                <HostControls gid={gid} kind={kind} compact />
                <LiveGamePlay gid={gid} kind={kind} compact />
              </div>
            )}
          />
        </Suspense>
      )}
    </>
  );
}
