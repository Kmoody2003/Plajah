// "Live now" — party games running this minute, for the Games page. Tap one to play full screen.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, X } from 'lucide-react';
import LiveGamePlay, { GAME_EMOJI, GAME_TITLES } from './LiveGamePlay';
import { liveGame, failed } from '../../services/liveGames/client';
import type { LiveGameDoc } from '../../services/liveGames/core';

export default function LiveNowStrip() {
  const [games, setGames] = useState<LiveGameDoc[]>([]);
  const [open, setOpen] = useState<LiveGameDoc | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { const r = await liveGame.live(); if (alive && !failed(r)) setGames(r.games); };
    void load(); const t = window.setInterval(load, 20_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  if (!games.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/60"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live now</div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {games.map(g => (
          <button key={g.id} onClick={() => setOpen(g)} className="min-w-[14rem] rounded-2xl bg-gradient-to-br from-[#2a1458] to-[#0d1a3a] p-3 text-left ring-1 ring-white/10 hover:ring-violet-400">
            <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-pink-300">{GAME_EMOJI[g.kind] ?? '🎮'} {GAME_TITLES[g.kind] ?? 'Live game'}</div>
            <div className="mt-1 truncate font-bold">{g.title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-white/60"><Users size={12} />{g.players} playing · {g.status === 'lobby' ? 'starting soon' : `round ${g.round}/${g.settings.rounds}`}</div>
          </button>
        ))}
      </div>
      {open && createPortal(
        <div className="fixed inset-0 z-[180] overflow-y-auto bg-black/80 p-2 backdrop-blur sm:p-6">
          <div className="mx-auto max-w-5xl">
            <button onClick={() => setOpen(null)} className="mb-2 ml-auto flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white"><X size={16} /> Close</button>
            <LiveGamePlay gid={open.id} kind={open.kind} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
