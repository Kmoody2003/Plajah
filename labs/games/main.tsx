// Games lab entry: ?view=hub shows the gamer card + leaderboards, ?view=concourse the Games home + game pages
// (Concourse layout, ?game=<catalog id> opens a page), otherwise Cyber Tic Tac Toe.
//   npx vite --config games-lab.vite.config.mjs  ->  http://127.0.0.1:3234/?as=alice
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import CyberTicTacToe from '../../components/games/CyberTicTacToe';
import GamerHub from '../../components/games/GamerHub';
import GamesConcourse from '../../components/games/concourse/GamesConcourse';
import GameDetailPage from '../../components/games/GameDetailPage';
import { useConcourseFont, logPlay } from '../../components/games/concourse/shared';
import { getPlajahGameById, type PlajahGameEntry } from '../../data/plajahGamesCatalog';
import { gamer, failed, type GamerProfile } from '../../services/gamerNet/client';

function ConcourseLab() {
  useConcourseFont();
  const [page, setPage] = useState<PlajahGameEntry | null>(() => getPlajahGameById(new URLSearchParams(location.search).get('game') || '') ?? null);
  const [me, setMe] = useState<GamerProfile | null>(null);
  const [said, setSaid] = useState('');
  React.useEffect(() => { void gamer.me().then(r => { if (!failed(r)) setMe(r.profile); }); }, []);
  const play = (g: PlajahGameEntry) => { logPlay(g); setSaid(`Launch: ${g.title} (${g.launch.type})`); };
  return (
    <div className="gcx" style={{ height: '100dvh', overflowY: 'auto' }}>
      <header className="gcx-bar"><div className="gcx-wrap"><button type="button" className="gcx-mark" onClick={() => setPage(null)}><i />Plajah <b>Games</b></button><span style={{ marginLeft: 'auto', color: 'var(--gx-mint)', fontSize: 13 }} data-testid="said">{said}</span></div></header>
      <div className="gcx-wrap">
        {page ? <GameDetailPage game={page} onBack={() => setPage(null)} onPlayNow={play} />
          : <GamesConcourse profile={me} onOpenGame={setPage} onPlay={play} onHostLive={() => setSaid('Host live')} onOpenPassport={() => setSaid('Passport')} onOpenLeaderboards={() => setSaid('Leaderboards')} />}
      </div>
    </div>
  );
}

function Lab() {
  const v = new URLSearchParams(location.search).get('view');
  const [view, setView] = useState(v === 'hub' ? 'hub' : v === 'concourse' ? 'concourse' : 'game');
  if (view === 'concourse') return <ConcourseLab />;
  if (view === 'hub') return <div style={{ padding: 16 }}><button onClick={() => setView('game')} style={{ marginBottom: 12 }}>← Game</button><GamerHub /></div>;
  return <CyberTicTacToe onExit={() => setView('hub')} onOpenLeaderboard={() => setView('hub')} />;
}
createRoot(document.getElementById('root')!).render(<Lab />);
