import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Users, Clock, Smartphone, Flame, Swords, Compass, Sparkles, Grid, Play, ArrowLeft } from 'lucide-react';
import type { UserProfile } from '../../types';
import { PLAJAH_GAMES_CATALOG, type PlajahGameEntry } from '../../data/plajahGamesCatalog';
import type { GameId as KithGameId } from '../kithParty/catalog';
import { useTvGrid } from '../../hooks/useTvGrid';
import { useTvShellFocus } from '../../hooks/useTvShellFocus';
import { auth } from '../../services/firebase';
import { tvCardRing, RAIL_GUTTER, TV_ACCENT } from './tvFocusRing';

const KithParty = React.lazy(() => import('../kithParty/KithParty'));
const EraClashFrame = React.lazy(() => import('../games/EraClashFrame'));
const EraClash3DFrame = React.lazy(() => import('../games/EraClash3DFrame'));
const RavencrestGameFrame = React.lazy(() => import('../taleo/RavencrestGameFrame').then(m => ({ default: m.RavencrestGameFrame })));
const CyberTicTacToe = React.lazy(() => import('../games/CyberTicTacToe'));
const TableGame = React.lazy(() => import('../games/table/TableGame'));
const LiveGamesStudio = React.lazy(() => import('../liveGames/LiveGamesStudio'));

/**
 * Plajah Games for Android TV & Leanback: 10-foot living-room gaming hub.
 *
 * - Two-zone deterministic D-pad navigation (Left Section Rail + Right Game Rails) via useTvGrid.
 * - Marked with `data-tv-capture` and synced with `useTvShellFocus` so arrowing up returns to TvTopTabs
 *   cleanly with zero double focus rings.
 * - Supports Bluetooth/USB gamepads natively (HTML5 Gamepad API polling for hub navigation + A/B select/back).
 * - Launches every game in the catalog including WebGL/WebGPU iframe games with `?tv=1&gamepad=1`.
 * - Optimized for TV SoCs: GPU-composited transforms, instant scroll on rapid repeats, zero backdrop-blur churn.
 */

type Playing =
  | null
  | { kind: 'era2d'; title: string }
  | { kind: 'era3d'; title: string }
  | { kind: 'ravencrest'; title: string }
  | { kind: 'iframe'; url: string; title: string }
  | { kind: 'ttt'; title: string }
  | { kind: 'table'; gameId: string; title: string }
  | { kind: 'kith'; gameId?: KithGameId; title: string }
  | { kind: 'live'; liveKind: any; title: string };

const launchOf = (g: PlajahGameEntry): Playing => {
  switch (g.launch.type) {
    case 'era-clash-2d': return { kind: 'era2d', title: g.title };
    case 'era-clash-3d': return { kind: 'era3d', title: g.title };
    case 'ravencrest': return { kind: 'ravencrest', title: g.title };
    case 'iframe': {
      const sep = g.launch.url.includes('?') ? '&' : '?';
      return { kind: 'iframe', url: `${g.launch.url}${sep}tv=1&gamepad=1`, title: g.launch.title || g.title };
    }
    case 'cyber-ttt': return { kind: 'ttt', title: g.title };
    case 'table': return { kind: 'table', gameId: g.launch.gameId, title: g.title };
    case 'kith-party': return { kind: 'kith', gameId: g.launch.gameId, title: g.title };
    case 'live-game': return { kind: 'live', liveKind: g.launch.kind, title: g.title };
  }
};

const needsPad = (g: PlajahGameEntry) =>
  g.launch.type === 'era-clash-2d' ||
  g.launch.type === 'era-clash-3d' ||
  g.launch.type === 'ravencrest' ||
  g.launch.type === 'iframe';

const phoneParty = (g: PlajahGameEntry) => g.launch.type === 'live-game';

const SECTIONS = [
  { id: 'ALL', label: 'All Games', icon: Grid },
  { id: 'ERA_CLASH', label: 'Era Clash', icon: Swords },
  { id: 'ADVENTURE_3D', label: '3D Worlds', icon: Compass },
  { id: 'KITH_PARTY', label: 'Kith Party', icon: Sparkles },
  { id: 'PARLOR_BOARD_WORD', label: 'Parlor & Arcade', icon: Flame },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

const GamesTvView: React.FC<{ userProfile: UserProfile | null }> = ({ userProfile }) => {
  const [playing, setPlaying] = useState<Playing>(null);
  const [section, setSection] = useState<SectionId>('ALL');
  const [gamepadName, setGamepadName] = useState<string | null>(null);
  const [showExitHint, setShowExitHint] = useState(true);
  const shellFocused = useTvShellFocus();
  const exit = useCallback(() => setPlaying(null), []);

  // Track connected Bluetooth / USB gamepads on Android TV
  useEffect(() => {
    const refresh = () => {
      try {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        setGamepadName(pads[0]?.id ? pads[0]!.id.split('(')[0].trim() : null);
      } catch {
        setGamepadName(null);
      }
    };
    refresh();
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    return () => {
      window.removeEventListener('gamepadconnected', refresh);
      window.removeEventListener('gamepaddisconnected', refresh);
    };
  }, []);

  const allGroups = useMemo(() => {
    const LABELS: Record<string, string> = {
      ERA_CLASH: 'Era Clash · Action & Combat',
      ADVENTURE_3D: '3D Worlds & Racing',
      KITH_PARTY: 'Kith Party · Living Room Multiplayer',
      PARLOR_BOARD_WORD: 'Parlor, Board & Arcade',
    };
    const order: string[] = [];
    const by = new Map<string, PlajahGameEntry[]>();
    for (const g of PLAJAH_GAMES_CATALOG) {
      if (!by.has(g.category)) {
        by.set(g.category, []);
        order.push(g.category);
      }
      by.get(g.category)!.push(g);
    }
    return order.map(cat => ({
      id: cat,
      label: LABELS[cat] ?? by.get(cat)![0].categoryLabel,
      games: by.get(cat)!,
    }));
  }, []);

  const groups = useMemo(
    () => (section === 'ALL' ? allGroups : allGroups.filter(g => g.id === section)),
    [allGroups, section],
  );

  const rows = useMemo(() => groups.map(g => ({ id: g.id, count: g.games.length })), [groups]);

  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const handleSelect = useCallback((p: { row: number; col: number }, rowId: string) => {
    if (rowId === 'PANEL') {
      const target = SECTIONS[p.col];
      if (target) setSection(target.id);
      return;
    }
    const game = groupsRef.current.find(g => g.id === rowId)?.games[p.col];
    if (game) setPlaying(launchOf(game));
  }, []);

  const grid = useTvGrid({
    rows,
    panelCount: SECTIONS.length,
    enabled: !playing,
    onSelect: handleSelect,
  });

  // Switch section immediately as the viewer arrows up/down the left rail
  useEffect(() => {
    if (grid.zone === 'PANEL') {
      const target = SECTIONS[grid.panelIndex];
      if (target && target.id !== section) {
        setSection(target.id);
      }
    }
  }, [grid.zone, grid.panelIndex, section]);

  // Gamepad polling for couch navigation in the Games Hub (D-pad / Left Stick + A launch + B back)
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    if (playing) return;
    let raf = 0;
    let lastAction = 0;
    const poll = (ts: number) => {
      raf = requestAnimationFrame(poll);
      if (playingRef.current || ts - lastAction < 155) return;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad) continue;
        const axX = pad.axes[0] ?? 0;
        const axY = pad.axes[1] ?? 0;
        const up = pad.buttons[12]?.pressed || axY < -0.55;
        const down = pad.buttons[13]?.pressed || axY > 0.55;
        const left = pad.buttons[14]?.pressed || axX < -0.55;
        const right = pad.buttons[15]?.pressed || axX > 0.55;
        const ok = pad.buttons[0]?.pressed;
        const back = pad.buttons[1]?.pressed;
        if (up) { gridRef.current.move('up'); lastAction = ts; break; }
        if (down) { gridRef.current.move('down'); lastAction = ts; break; }
        if (left) { gridRef.current.move('left'); lastAction = ts; break; }
        if (right) { gridRef.current.move('right'); lastAction = ts; break; }
        if (ok) {
          const g = gridRef.current;
          if (g.zone === 'PANEL') {
            g.setZone('CONTENT');
          } else {
            const target = groupsRef.current[g.pos.row]?.games[g.pos.col];
            if (target) setPlaying(launchOf(target));
          }
          lastAction = ts + 140;
          break;
        }
        if (back && gridRef.current.zone === 'CONTENT') {
          gridRef.current.setZone('PANEL');
          lastAction = ts + 100;
          break;
        }
      }
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Android TV Back button closes the active game cleanly
  useEffect(() => {
    if (!playing) return;
    setShowExitHint(true);
    const timer = window.setTimeout(() => setShowExitHint(false), 4500);
    const onBack = (e: Event) => {
      e.preventDefault();
      exit();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'XF86Back' || e.keyCode === 4) {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener('plajah:hardware-back', onBack);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('plajah:hardware-back', onBack);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [playing, exit]);

  // Fast scroll to focused card (instant on rapid repeat, smooth on single tap)
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const lastScrollAt = useRef(0);
  useEffect(() => {
    if (grid.zone !== 'CONTENT') return;
    const id = groups[grid.pos.row]?.games[grid.pos.col]?.id;
    const el = cardRefs.current.get(id ?? '');
    if (!el) return;
    const now = performance.now();
    const rapid = now - lastScrollAt.current < 160;
    lastScrollAt.current = now;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: rapid ? 'auto' : 'smooth' });
  }, [grid.zone, grid.pos.row, grid.pos.col, groups]);

  const focusedGame = groups[grid.pos.row]?.games[grid.pos.col] ?? groups[0]?.games[0];

  if (playing) {
    const fallback = (
      <div className="fixed inset-0 z-[10000] bg-[#06030C] flex flex-col items-center justify-center gap-4 text-white">
        <Gamepad2 size={48} className="text-[#FF8C00] animate-pulse" />
        <div className="text-2xl font-black uppercase tracking-widest">Launching {playing.title}…</div>
        <div className="text-sm text-white/50 uppercase tracking-widest">Press Back on your remote anytime to return to Plajah Games</div>
      </div>
    );
    return (
      <div data-tv-capture className="fixed inset-0 z-[9500] bg-black">
        <React.Suspense fallback={fallback}>
          {playing.kind === 'era2d' && <EraClashFrame onExit={exit} />}
          {playing.kind === 'era3d' && <EraClash3DFrame onExit={exit} />}
          {playing.kind === 'ravencrest' && (
            <RavencrestGameFrame
              onBack={exit}
              classic={
                <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 p-12 text-center">
                  <h2 className="text-3xl font-black">Ravencrest requires WebGPU</h2>
                  <p className="text-lg text-white/60 max-w-xl">This television WebView does not expose WebGPU yet. Press Back or OK to return to the Games Hub.</p>
                  <button type="button" onClick={exit} className="px-8 py-4 rounded-full bg-[#FF8C00] text-black text-lg font-black uppercase tracking-widest">
                    Back to Games
                  </button>
                </div>
              }
            />
          )}
          {playing.kind === 'iframe' && (
            <iframe
              src={playing.url}
              title={playing.title}
              className="w-full h-full border-0 bg-black"
              allow="autoplay; fullscreen; gamepad"
              allowFullScreen
            />
          )}
          {playing.kind === 'ttt' && <CyberTicTacToe onExit={exit} onOpenLeaderboard={exit} />}
          {playing.kind === 'table' && <TableGame gameId={playing.gameId} onExit={exit} onOpenLeaderboard={exit} />}
          {playing.kind === 'kith' && (
            <KithParty
              initialGame={playing.gameId}
              onBack={exit}
              profile={userProfile as any}
              uid={auth.currentUser?.uid ?? null}
            />
          )}
          {playing.kind === 'live' && (
            <LiveGamesStudio initialKind={playing.liveKind === 'pick' ? undefined : playing.liveKind} onExit={exit} />
          )}
        </React.Suspense>

        {/* Subtle TV exit pill — fades after 4.5s, stays reachable via Back */}
        <div
          className={`fixed top-4 right-5 z-[10050] flex items-center gap-3 px-4 py-2 rounded-full bg-black/75 border border-white/15 text-white transition-opacity duration-500 ${
            showExitHint ? 'opacity-100' : 'opacity-25 hover:opacity-100'
          }`}
        >
          <button type="button" onClick={exit} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white">
            <ArrowLeft size={14} className="text-[#FF8C00]" />
            <span>Back · Exit {playing.title}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tv-capture
      className="h-[calc(100vh-64px)] w-full text-white flex overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 32% 0%, #1d0d38 0%, #070210 62%)',
        contain: 'layout style',
      }}
    >
      {/* LEFT ZONE: 10-foot Section Rail (matches ChoraTvView / MoviesTvView) */}
      <aside className="w-[260px] shrink-0 border-r border-white/10 bg-[#08050F] flex flex-col py-7 px-4 gap-2">
        <div className="px-3 pb-4 flex items-center gap-2.5">
          <Gamepad2 size={22} className="text-[#FF8C00]" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.26em] text-[#FF8C00]">Plajah TV</div>
            <div className="text-xl font-black tracking-tight text-white">Arcade &amp; Games</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5" aria-label="Game categories">
          {SECTIONS.map((s, idx) => {
            const Icon = s.icon;
            const isSelected = section === s.id;
            const isPanelFocus = !shellFocused && grid.zone === 'PANEL' && grid.panelIndex === idx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  grid.setPanelIndex(idx);
                  setSection(s.id);
                  grid.setZone('CONTENT');
                }}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left text-[15px] font-bold transition-transform duration-100 ${
                  isPanelFocus
                    ? 'bg-[#FF8C00] text-black scale-[1.03]'
                    : isSelected
                    ? 'bg-white/12 text-white'
                    : 'text-white/60 hover:text-white'
                }`}
                style={isPanelFocus ? { boxShadow: '0 0 0 3px #fff, 0 8px 24px rgba(255,140,0,0.45)' } : undefined}
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto mx-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px]">
            <span className={`w-2 h-2 rounded-full ${gamepadName ? 'bg-emerald-400' : 'bg-[#FF8C00]'}`} />
            <span className={gamepadName ? 'text-emerald-300' : 'text-white/70'}>
              {gamepadName ? 'Controller Ready' : 'Remote + Gamepad'}
            </span>
          </div>
          <p className="text-[11px] text-white/45 leading-snug">
            {gamepadName ? gamepadName : 'Pair any Bluetooth controller or play party games with phones.'}
          </p>
        </div>
      </aside>

      {/* RIGHT ZONE: Hero Preview Stage + Fast Horizontal Game Rails */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 10-foot Hero Stage */}
        <div className="relative flex-none overflow-hidden px-12 pt-7 pb-5 border-b border-white/8" style={{ height: '37vh', minHeight: 230 }}>
          {focusedGame && (
            <>
              <div
                aria-hidden
                className="absolute inset-0 opacity-35 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${focusedGame.thumbnailUrl})`,
                  maskImage: 'linear-gradient(90deg, transparent 10%, #000 65%)',
                  WebkitMaskImage: 'linear-gradient(90deg, transparent 10%, #000 65%)',
                }}
              />
              <div className="relative max-w-3xl flex flex-col justify-center h-full">
                <div className="flex items-center gap-3 text-[13px] font-black tracking-[0.22em] uppercase" style={{ color: TV_ACCENT }}>
                  <span>{focusedGame.badge}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-white/70">{focusedGame.engine}</span>
                </div>
                <h1 className="mt-2 text-[40px] leading-tight font-black line-clamp-1">{focusedGame.title}</h1>
                <p className="mt-1.5 text-[19px] text-white/75 line-clamp-2">{focusedGame.subtitle}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-white/75 font-semibold">
                  <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF8C00] text-black font-black uppercase tracking-wider text-xs">
                    <Play size={13} fill="currentColor" /> Press OK to Play
                  </span>
                  <span className="flex items-center gap-1.5"><Users size={18} /> {focusedGame.playersLabel}</span>
                  <span className="flex items-center gap-1.5"><Clock size={18} /> {focusedGame.duration}</span>
                  {needsPad(focusedGame) && <span className="flex items-center gap-1.5 text-amber-300"><Gamepad2 size={18} /> Gamepad recommended</span>}
                  {phoneParty(focusedGame) && <span className="flex items-center gap-1.5 text-cyan-300"><Smartphone size={18} /> Join with phones</span>}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Horizontal Category Rails */}
        <div className="flex-1 min-h-0 overflow-y-auto pt-4 pb-10">
          {groups.map((group, r) => (
            <section key={group.id} className="px-12 pb-7" style={{ contain: 'layout style' }}>
              <h2 className="mb-3 text-[22px] font-black tracking-wide text-white/90">{group.label}</h2>
              <div className={`flex gap-6 overflow-x-hidden ${RAIL_GUTTER}`}>
                {group.games.map((g, c) => {
                  const focused = !shellFocused && grid.zone === 'CONTENT' && grid.pos.row === r && grid.pos.col === c;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      ref={el => { if (el) cardRefs.current.set(g.id, el); }}
                      onClick={() => {
                        grid.setPos(r, c);
                        setPlaying(launchOf(g));
                      }}
                      className="relative shrink-0 w-[340px] text-left rounded-2xl overflow-hidden bg-[#100B1C] outline-none transition-transform duration-100"
                      style={{
                        transform: focused ? 'translate3d(0,0,0) scale(1.05)' : 'translate3d(0,0,0) scale(1)',
                        willChange: 'transform',
                        boxShadow: tvCardRing(focused),
                      }}
                    >
                      <div
                        className="aspect-video w-full bg-cover bg-center relative"
                        style={{ backgroundImage: `url(${g.thumbnailUrl})`, backgroundColor: g.accentColor }}
                      >
                        <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-black/75 text-[11px] font-black uppercase tracking-wider text-white/90">
                          {phoneParty(g) ? 'Phone Party' : needsPad(g) ? 'Gamepad' : 'Remote OK'}
                        </div>
                      </div>
                      <div className="px-4 py-3.5">
                        <div className="text-[20px] font-black leading-tight truncate">{g.title}</div>
                        <div className="text-[14px] text-white/60 truncate mt-0.5">{g.badge} · {g.playersLabel}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="px-12 pb-6 text-[14px] text-white/45 font-semibold">
            OK / A to launch · Left to browse categories · Up to top menu · Back / B to exit a game
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamesTvView;
