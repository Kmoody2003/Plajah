// Games, launched from inside a live stream. The streamer taps Games in the dock, picks one, and the room opens
// tied to this stream: it's posted to their feed so viewers can play, the board is burned into the video, and a
// small panel over the camera holds the game and the host controls.
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import LiveGamePlay, { GAME_TITLES, HostControls, useProgramOverlay } from './LiveGamePlay';
import { GamePicker } from './LiveGamesStudio';
import { createLiveGame } from './createLiveGame';
import type { AnyLiveKind } from '../../services/liveGames/client';

type Drawer = (ctx: CanvasRenderingContext2D, W: number, H: number, dt: number) => void;

export default function LiveGameDock({ streamId, open, onClose, setOverlay }: {
  streamId: string; open: boolean; onClose: () => void;
  /** Install (or clear, with null) the program overlay on the stream's composer. */
  setOverlay: (fn: Drawer | null) => void;
}) {
  const [room, setRoom] = useState<{ gid: string; kind: AnyLiveKind } | null>(null);
  const [busy, setBusy] = useState<AnyLiveKind | null>(null);
  const [err, setErr] = useState('');
  const [post, setPost] = useState(true);
  const [folded, setFolded] = useState(false);
  const overlay = useProgramOverlay(room?.gid ?? null);

  useEffect(() => { setOverlay(overlay); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [overlay]);
  useEffect(() => () => setOverlay(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (kind: AnyLiveKind) => {
    setBusy(kind); setErr('');
    const r = await createLiveGame(kind, { streamId, post });
    setBusy(null);
    if ('error' in r) { setErr(r.error); return; }
    setRoom({ gid: r.gid, kind }); setFolded(false); onClose();
  };

  return (
    <>
      {open && !room && (
        <div className="pointer-events-auto absolute inset-x-2 bottom-28 z-30 rounded-3xl bg-black/80 p-3 text-white backdrop-blur" role="dialog" aria-label="Start a live game">
          <div className="mb-2 flex items-center"><b className="text-sm">Play a game with your viewers</b><button onClick={onClose} aria-label="Close" className="ml-auto rounded-full p-1 hover:bg-white/10"><X size={18} /></button></div>
          {busy ? <div className="flex h-32 items-center justify-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} /> Opening {GAME_TITLES[busy]}…</div> : <GamePicker compact onPick={start} />}
          <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={post} onChange={e => setPost(e.target.checked)} className="accent-violet-500" /> Post it to my feed so people can join</label>
          {err && <div className="mt-2 rounded-lg bg-red-600/80 px-2 py-1 text-xs">{err}</div>}
        </div>
      )}
      {room && (
        <div className="pointer-events-auto absolute inset-x-2 top-24 z-20 max-h-[58vh] overflow-y-auto rounded-2xl bg-black/40 p-2 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <HostControls gid={room.gid} kind={room.kind} compact onEnded={() => setRoom(null)} />
            <button onClick={() => setFolded(f => !f)} aria-label={folded ? 'Show game' : 'Hide game'} className="ml-auto rounded-full bg-white/15 p-1.5 text-white">{folded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
          </div>
          {!folded && <LiveGamePlay gid={room.gid} kind={room.kind} compact />}
        </div>
      )}
    </>
  );
}
