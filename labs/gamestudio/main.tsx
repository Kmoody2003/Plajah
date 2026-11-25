// The Game Studio room with no app around it (docs/game-studio-unified-plan.md Phase 0).
//   npx vite --config gamestudio-lab.vite.config.mjs  ->  http://127.0.0.1:3262/
//   ?game=<origin> points at the Rift Realm dev server (default http://127.0.0.1:4335). ?pro opens Pro.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import GameStudioRoom from '../../components/gamestudio/GameStudioRoom';
import * as ops from '../../services/gamestudio/ops';
import * as runtime from '../../services/gamestudio/runtime';
import { validateProject } from '../../services/gamestudio/validate';

const q = new URLSearchParams(location.search);
// one dev server per runtime: ?game= overrides Rift Realm's, ?lexicon= Lexicon's
const origin = { 'rift-realm': q.get('game') ?? 'http://127.0.0.1:4335', lexicon: q.get('lexicon') ?? 'http://127.0.0.1:4392' };
(window as any).gameStudio = { ops, runtime, validateProject };

function Lab() {
  const [level, setLevel] = useState<'simple' | 'pro'>(q.has('pro') ? 'pro' : 'simple');
  return <GameStudioRoom level={level} onLevel={setLevel} runtimeOrigin={origin}/>;
}
createRoot(document.getElementById('root')!).render(<Lab/>);
