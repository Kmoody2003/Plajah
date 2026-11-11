// Sketch Rush lab: the REAL /api/live-game + /api/gamer routers on an in-memory store, sign-in stubbed by ?as=.
//   npx vite --config live-game-lab.vite.config.mjs  ->  http://127.0.0.1:3247/?as=hana&view=studio  (host)
//                                                        http://127.0.0.1:3247/?as=amy                (a feed with the live game)
//                                                        http://127.0.0.1:3247/?as=guest-1            (signed-out viewer → guest)
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import SketchRushStudio from '../../components/liveGames/SketchRushStudio';
import LiveGameCard from '../../components/liveGames/LiveGameCard';
import LiveNowStrip from '../../components/liveGames/LiveNowStrip';
import { liveGame, failed } from '../../services/liveGames/client';
import type { LiveGameDoc } from '../../services/liveGames/core';

function Feed() {
  const [games, setGames] = useState<LiveGameDoc[]>([]);
  useEffect(() => {
    const load = async () => { const r = await liveGame.live(); if (!failed(r)) setGames(r.games); };
    void load(); const t = setInterval(load, 3000); return () => clearInterval(t);
  }, []);
  const me = new URLSearchParams(location.search).get('as') || 'signed out';
  return (
    <div className="mx-auto max-w-xl p-3">
      <div className="mb-3 text-xs text-white/50">Lab feed · you are <b>{me}</b></div>
      <LiveNowStrip />
      {games.length === 0 && <p className="mt-6 text-sm text-white/60">No live games. Open <code>?as=hana&amp;view=studio</code> in another tab and host one.</p>}
      {games.map(g => (
        <article key={g.id} className="mt-4 rounded-2xl bg-neutral-900 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-2"><div className="h-9 w-9 rounded-full bg-violet-600" /><div><b>{g.hostName}</b><div className="text-xs text-white/50">just now</div></div></div>
          <p className="mt-2 text-sm">🎨 I'm live with Sketch Rush — guess what I'm drawing and score points! Jump in right here.</p>
          <LiveGameCard embed={{ v: 1, kind: 'sketch', gid: g.id }} />
        </article>
      ))}
    </div>
  );
}

const view = new URLSearchParams(location.search).get('view');
createRoot(document.getElementById('root')!).render(view === 'studio' ? <SketchRushStudio onExit={() => { location.search = location.search.replace('view=studio', 'view=feed'); }} /> : <Feed />);
