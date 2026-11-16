import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Users, Clock, Smartphone } from 'lucide-react';
import type { UserProfile } from '../../types';
import { PLAJAH_GAMES_CATALOG, type PlajahGameEntry } from '../../data/plajahGamesCatalog';
import type { GameId as KithGameId } from '../kithParty/catalog';
import { useTvGrid } from '../../hooks/useTvGrid';
import { auth } from '../../services/firebase';
import { tvCardRing, RAIL_GUTTER, TV_ACCENT } from './tvFocusRing';

const KithParty = React.lazy(() => import('../kithParty/KithParty'));
const EraClashFrame = React.lazy(() => import('../games/EraClashFrame'));
const EraClash3DFrame = React.lazy(() => import('../games/EraClash3DFrame'));
const RavencrestGameFrame = React.lazy(() => import('../taleo/RavencrestGameFrame').then(m => ({ default: m.RavencrestGameFrame })));
const CyberTicTacToe = React.lazy(() => import('../games/CyberTicTacToe'));
const LiveGamesStudio = React.lazy(() => import('../liveGames/LiveGamesStudio'));

/**
 * Plajah Games for television: the Full Screen Experience for the couch.
 *
 * Same shape as every other TV screen here: rows of big cards, steered by the declared grid (hooks/useTvGrid),
 * OK to launch, Back to leave. Games that run in an iframe get `?tv=1` (see EraClash3DFrame) so they draw the
 * ten-foot layout, and every game takes a gamepad or the remote's D-pad; the party games are played with phones
 * as controllers, which is what a living-room TV is for.
 */

type Playing =
  | null
  | { kind: 'era2d' }
  | { kind: 'era3d' }
  | { kind: 'ravencrest' }
  | { kind: 'ttt' }
  | { kind: 'kith'; gameId?: KithGameId }
  | { kind: 'live'; liveKind: any };

const launchOf = (g: PlajahGameEntry): Playing => {
  switch (g.launch.type) {
    case 'era-clash-2d': return { kind: 'era2d' };
    case 'era-clash-3d': return { kind: 'era3d' };
    case 'ravencrest': return { kind: 'ravencrest' };
    case 'iframe': return null;                       // keyboard racing games are not on the TV grid yet
    case 'cyber-ttt': return { kind: 'ttt' };
    case 'kith-party': return { kind: 'kith', gameId: g.launch.gameId };
    case 'live-game': return { kind: 'live', liveKind: g.launch.kind };
  }
};

/** What to plug in before you start: shown on the card so nobody opens a fighter with only a remote. */
const needsPad = (g: PlajahGameEntry) => g.launch.type === 'era-clash-2d' || g.launch.type === 'era-clash-3d' || g.launch.type === 'ravencrest';
const phoneParty = (g: PlajahGameEntry) => g.launch.type === 'live-game';

const GamesTvView: React.FC<{ userProfile: UserProfile | null }> = ({ userProfile }) => {
  const [playing, setPlaying] = useState<Playing>(null);
  const exit = () => setPlaying(null);

  const groups = useMemo(() => {
    const LABELS: Record<string, string> = { ERA_CLASH: 'Era Clash', ADVENTURE_3D: 'Adventures', KITH_PARTY: 'Kith Party', PARLOR_BOARD_WORD: 'Parlor, Board & Word' };
    const order: string[] = [];
    const by = new Map<string, PlajahGameEntry[]>();
    for (const g of PLAJAH_GAMES_CATALOG) {
      if (!by.has(g.category)) { by.set(g.category, []); order.push(g.category); }
      by.get(g.category)!.push(g);
    }
    return order.map(cat => ({ id: cat, label: LABELS[cat] ?? by.get(cat)![0].categoryLabel, games: by.get(cat)! }));
  }, []);

  // A new array each render makes the grid re-clamp its position every time: keep it stable.
  const rows = useMemo(() => groups.map(g => ({ id: g.id, count: g.games.length })), [groups]);
  const grid = useTvGrid({
    rows,
    enabled: !playing,
    onSelect: (p, rowId) => {
      const game = groups.find(g => g.id === rowId)?.games[p.col];
      if (game) setPlaying(launchOf(game));
    },
  });

  // Android TV's Back button arrives as plajah:hardware-back: close the game and stay in Games.
  useEffect(() => {
    if (!playing) return;
    const onBack = (e: Event) => { e.preventDefault(); exit(); };
    window.addEventListener('plajah:hardware-back', onBack);
    return () => window.removeEventListener('plajah:hardware-back', onBack);
  }, [playing]);

  // Keep the selected card on screen.
  const cardRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const id = groups[grid.pos.row]?.games[grid.pos.col]?.id;
    cardRefs.current.get(id ?? '')?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [grid.pos.row, grid.pos.col, groups]);

  const focusedGame = groups[grid.pos.row]?.games[grid.pos.col];

  if (playing) {
    const fallback = <div className="fixed inset-0 z-[10000] bg-black grid place-items-center text-orange-400 font-mono text-2xl">Loading…</div>;
    return (
      <React.Suspense fallback={fallback}>
        {playing.kind === 'era2d' && <EraClashFrame onExit={exit} />}
        {playing.kind === 'era3d' && <EraClash3DFrame onExit={exit} />}
        {playing.kind === 'ravencrest' && <RavencrestGameFrame onBack={exit} classic={<div className="min-h-screen bg-black text-white grid place-items-center text-2xl">Ravencrest needs WebGPU, which this TV doesn't have.<button className="ml-6 px-6 py-3 bg-white text-black rounded-xl" onClick={exit}>Back</button></div>} />}
        {playing.kind === 'ttt' && <CyberTicTacToe onExit={exit} onOpenLeaderboard={exit} />}
        {playing.kind === 'kith' && <KithParty initialGame={playing.gameId} onBack={exit} profile={userProfile as any} uid={auth.currentUser?.uid ?? null} />}
        {playing.kind === 'live' && <LiveGamesStudio initialKind={playing.liveKind === 'pick' ? undefined : playing.liveKind} onExit={exit} />}
      </React.Suspense>
    );
  }

  return (
    <div className="h-screen w-full text-white flex flex-col overflow-hidden" style={{ background: 'radial-gradient(ellipse at 30% 0%, #1b0d33 0%, #07010f 60%)' }}>
      {/* The focused game: big, so it reads from the sofa */}
      <div className="relative flex-none overflow-hidden px-16 pt-10 pb-6" style={{ height: '40vh' }}>
        {focusedGame && (
          <>
            <div aria-hidden className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: `url(${focusedGame.thumbnailUrl})`, maskImage: 'linear-gradient(90deg, transparent, #000 60%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 60%)' }} />
            <div className="relative max-w-3xl">
              <div className="flex items-center gap-3 text-[22px] tracking-[0.2em] uppercase" style={{ color: TV_ACCENT }}><Gamepad2 size={28} /> Plajah Games</div>
              <h1 className="mt-3 text-[52px] leading-tight font-black line-clamp-2">{focusedGame.title}</h1>
              <p className="mt-2 text-[26px] text-white/75 line-clamp-2">{focusedGame.subtitle}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[22px] text-white/70">
                <span className="flex items-center gap-2"><Users size={24} /> {focusedGame.playersLabel}</span>
                <span className="flex items-center gap-2"><Clock size={24} /> {focusedGame.duration}</span>
                {needsPad(focusedGame) && <span className="flex items-center gap-2"><Gamepad2 size={24} /> Best with a controller</span>}
                {phoneParty(focusedGame) && <span className="flex items-center gap-2"><Smartphone size={24} /> Everyone joins on their phone</span>}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-2">
      {groups.map((group, r) => (
        <section key={group.id} className="px-16 pb-8">
          <h2 className="mb-4 text-[30px] font-bold tracking-wide text-white/90">{group.label}</h2>
          <div className={`flex gap-8 overflow-x-hidden ${RAIL_GUTTER}`}>
            {group.games.map((g, c) => {
              const focused = grid.pos.row === r && grid.pos.col === c;
              return (
                <button
                  key={g.id}
                  type="button"
                  ref={el => { if (el) cardRefs.current.set(g.id, el); }}
                  onClick={() => { grid.setPos(r, c); setPlaying(launchOf(g)); }}
                  className="relative shrink-0 w-[420px] text-left rounded-2xl overflow-hidden bg-black/40 outline-none transition-transform duration-150"
                  style={{ transform: focused ? 'scale(1.05)' : 'scale(1)', boxShadow: tvCardRing(focused) }}
                >
                  <div className="aspect-video w-full bg-cover bg-center" style={{ backgroundImage: `url(${g.thumbnailUrl})`, backgroundColor: g.accentColor }} />
                  <div className="px-5 py-4">
                    <div className="text-[28px] font-bold leading-tight truncate">{g.title}</div>
                    <div className="text-[20px] text-white/60 truncate">{g.badge} · {g.playersLabel}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div className="px-16 pb-12 text-[20px] text-white/45">OK to play · Back to leave a game · A gamepad works in every game</div>
      </div>
    </div>
  );
};

export default GamesTvView;
