// Games lab entry: ?view=hub shows the gamer card + leaderboards, otherwise Cyber Tic Tac Toe.
//   npx vite --config games-lab.vite.config.mjs  ->  http://127.0.0.1:3234/?as=alice
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import CyberTicTacToe from '../../components/games/CyberTicTacToe';
import GamerHub from '../../components/games/GamerHub';

function Lab() {
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') === 'hub' ? 'hub' : 'game');
  if (view === 'hub') return <div style={{ padding: 16 }}><button onClick={() => setView('game')} style={{ marginBottom: 12 }}>← Game</button><GamerHub /></div>;
  return <CyberTicTacToe onExit={() => setView('hub')} onOpenLeaderboard={() => setView('hub')} />;
}
createRoot(document.getElementById('root')!).render(<Lab />);
