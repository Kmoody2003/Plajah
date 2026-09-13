import React, { useEffect, useRef, useState } from 'react';
import { Film, Music2, Video, User, Play, Pause, Search, Radio } from 'lucide-react';
import { TV_NAV_VIEWS } from '../../services/tvCapabilities';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import Logo from '../Logo';

/**
 * TvSpine — the persistent left rail that IS the channel lineup.
 *
 * This is "Lineup", the hybrid direction actually picked from the four TV
 * redesign mockups (Evolution/Spine/Channels/Lineup — see the artifacts
 * linked from project memory), not plain Spine. Lineup's own words for why:
 * "Channels gave you flip-speed but full-screen surfaces cost you
 * orientation... Spine gave you orientation but only listed apps, with no
 * flip. Fused, the spine IS the lineup, always visible: apps and live feeds
 * as peers, and Ch+/Ch- surfs the whole thing." Critically, Lineup has NO
 * guide overlay — the permanent, always-expanded rail replaces the need for
 * one, which is why this never collapses to icon-only the way the desktop
 * Command Split pillar or the first Spine draft did.
 *
 * WHAT DIFFERS FROM THE MOCKUP, AND WHY — read before assuming parity:
 *
 * The mockup's rail lists every individual live channel (41, 42, 42.1, 77,
 * 88...) with live "now playing" text, sourced from a static demo array. The
 * real channel list is dynamic, per-account, EPG-driven state that today
 * lives inside LiveTvPlus, fed by props from LiveHubView — it is not safely
 * duplicable up into this always-mounted global shell without either a new
 * shared data layer or a second copy of that fetching running globally on
 * every TV screen, which is a real cost on a 2 GB device. So Live is ONE row
 * here, not an expanded per-channel list; entering it hands off to the real,
 * already-working LiveTvPlus surface (dial, EPG, and — as of this session —
 * fixed Channel Up/Down). Expanding every channel into this rail with live
 * "now" text is real additional scope, not done here.
 *
 * What Lineup's most-requested property — "Ch+/Ch- and typed numbers work
 * from anywhere" — DOES ship, for real: see the global key handler below.
 * Within the app group (rows with a real, safe, static ordering) Ch+/Ch-
 * steps between peers exactly as the mockup shows. A typed number that isn't
 * 1/2/3/90 is handed to Live Hub's existing deep-link mechanism
 * (`liveChannelFocus`), which already resolves it against the real channel
 * list — so jumping straight to channel 42 from inside Taleo works via the
 * same address-resolution LiveTvPlus already trusted before tonight, not a
 * new parallel one.
 */

export interface LineupRow {
  num: string;
  name: string;
  view: string;
  group: 'apps' | 'live' | 'system';
}

/** The rows with a genuinely static, safe-to-hardcode number: the three apps
 *  and Settings. Exported so App.tsx's global number-entry handoff can check
 *  "is this number one of the known static rows" without duplicating the list. */
export const LINEUP_ROWS: LineupRow[] = [
  { num: '1', name: 'Taleo', view: 'MOVIES_TV', group: 'apps' },
  { num: '2', name: 'Chora', view: 'MUSIC', group: 'apps' },
  { num: '3', name: 'Reello', view: 'VIDEOS', group: 'apps' },
  { num: '41+', name: 'Live Channels', view: 'LIVE_HUB', group: 'live' },
  { num: '90', name: 'Settings', view: 'USER_PROFILE', group: 'system' },
];

const GROUP_META: Record<LineupRow['group'], { label: string; color: string }> = {
  apps: { label: 'Apps', color: '#FF8C00' },
  live: { label: 'Live', color: '#ef4444' },
  system: { label: 'System', color: '#D0BCFF' },
};

const ROW_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  MOVIES_TV: Film,
  MUSIC: Music2,
  VIDEOS: Video,
  LIVE_HUB: Radio,
  USER_PROFILE: User,
};

/** The rail's fixed width. Single value — Lineup's rail is always fully
 *  expanded, never an icon-only collapsed state, matching the mockup's own
 *  "always on screen" design intent (that permanence is what replaces the
 *  need for a guide overlay). Exported for LiveTvPlus and the App.tsx flow
 *  wrappers, so it can never drift out of sync with what's actually drawn. */
export const TV_SPINE_W = 224;

const TvSpine: React.FC<{
  activeView: string;
  onSelect: (view: string) => void;
  onOpenNowPlaying?: () => void;
  onOpenSearch?: () => void;
  focused?: boolean;
  onExitDown?: () => void;
  /** Global number entry resolved to something other than a known static row
   *  (1/2/3/90) — hand it to Live Hub's existing channel deep-link. */
  onTuneChannel?: (num: string) => void;
}> = ({ activeView, onSelect, onOpenNowPlaying, onOpenSearch, focused = false, onExitDown, onTuneChannel }) => {
  const { currentTrack, currentAlbum, isPlaying } = useGlobalPlayer();
  const art = (currentTrack as any)?.albumCover || (currentAlbum as any)?.coverImage;

  // Utility rows (Search, Now Playing) sit outside the numbered lineup — they
  // are app chrome, not channels, so giving them a number would break the
  // clean 1/2/3/41+/90 addressing the whole point of Lineup is to keep.
  const items: Array<{ kind: 'util'; key: 'SEARCH' | 'NOW_PLAYING' } | { kind: 'row'; row: LineupRow }> = [
    { kind: 'util', key: 'SEARCH' },
    ...LINEUP_ROWS.map(row => ({ kind: 'row' as const, row })),
    ...(currentTrack ? [{ kind: 'util' as const, key: 'NOW_PLAYING' as const }] : []),
  ];
  const [idx, setIdx] = useState(0);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());

  const focusedRef = useRef(focused); focusedRef.current = focused;
  const idxRef = useRef(idx); idxRef.current = idx;
  const itemsRef = useRef(items); itemsRef.current = items;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  useEffect(() => {
    if (!focused) return;
    const i = items.findIndex(it => it.kind === 'row' && it.row.view === activeView);
    setIdx(i >= 0 ? i : 1);  // default to the first real row (index 0 is Search), not Search itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, activeView]);

  // This rail uses a virtual highlight instead of DOM focus, so browsers do not
  // automatically reveal the selected row. Keep remote navigation visible.
  useEffect(() => {
    if (!focused) return;
    itemRefs.current.get(idx)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [focused, idx]);

  // ── Rail navigation, while the shell holds focus. ──────────────────────────
  // Up/Down move the highlight AND navigate immediately — the pane "tunes
  // live" as you scroll the lineup, which is the mockup's whole point (flip
  // speed) and is safe here because there are only five real destinations,
  // not hundreds of channels to scroll past.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const kc = e.keyCode || e.which;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const go = (next: number) => {
        stop();
        const clamped = Math.max(0, Math.min(itemsRef.current.length - 1, next));
        setIdx(clamped);
        const item = itemsRef.current[clamped];
        if (item.kind === 'row') onSelectRef.current(item.row.view);
      };
      if (e.key === 'ArrowDown' || kc === 40 || kc === 20) { go(idxRef.current + 1); return; }
      if (e.key === 'ArrowUp'   || kc === 38 || kc === 19) { go(idxRef.current - 1); return; }
      if (e.key === 'ArrowRight' || kc === 39 || kc === 22) { stop(); onExitDown?.(); return; }
      if (e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23) {
        stop();
        const item = itemsRef.current[idxRef.current];
        if (item.kind === 'util' && item.key === 'NOW_PLAYING') onOpenNowPlaying?.();
        else if (item.kind === 'util' && item.key === 'SEARCH') { onOpenSearch?.(); onExitDown?.(); }
        else onExitDown?.();   // a row: already navigated on the way here, just enter its content
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onOpenNowPlaying, onOpenSearch, onExitDown]);

  // ── Global Channel Up/Down + number entry — "from anywhere", per the
  // mockup, working whether the rail or the content below it holds focus. ──
  //
  // Skips entirely while already on the Live surface: LiveTvPlus owns its own
  // capture-phase channel-key handler there (fixed this session), and this
  // listener acting too would double-step every press. Off Live, Ch+/Ch-
  // steps between the app rows — a real, safe, statically-known ordering — and
  // a typed number outside {1,2,3,90} is handed to Live Hub's existing
  // channel deep-link, which resolves it against the real, live channel list.
  const activeViewRef = useRef(activeView); activeViewRef.current = activeView;
  const onTuneChannelRef = useRef(onTuneChannel); onTuneChannelRef.current = onTuneChannel;
  useEffect(() => {
    let numBuf = '';
    let numTimer: ReturnType<typeof setTimeout> | null = null;

    const stepApp = (d: 1 | -1) => {
      const appRows = LINEUP_ROWS.filter(r => r.group === 'apps' || r.group === 'system');
      const curPos = appRows.findIndex(r => r.view === activeViewRef.current);
      const from = curPos >= 0 ? curPos : 0;
      const next = appRows[(from + d + appRows.length) % appRows.length];
      onSelectRef.current(next.view);
    };

    const onKey = (e: KeyboardEvent) => {
      if (activeViewRef.current === 'LIVE_HUB') return;   // LiveTvPlus owns channel keys here
      const kc = e.keyCode || e.which;
      const isChUp = kc === 166 || e.key === 'ChannelUp' || e.key === 'PageUp' || e.key === ']';
      const isChDown = kc === 167 || e.key === 'ChannelDown' || e.key === 'PageDown' || e.key === '[';
      if (isChUp) { e.preventDefault(); stepApp(1); return; }
      if (isChDown) { e.preventDefault(); stepApp(-1); return; }

      if (/^[0-9.]$/.test(e.key)) {
        // Never fight a text field (e.g. the channel-rename input elsewhere on TV).
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        numBuf += e.key;
        if (numTimer) clearTimeout(numTimer);
        numTimer = setTimeout(() => {
          const staticRow = LINEUP_ROWS.find(r => r.num === numBuf || r.num === `${numBuf}+`);
          if (staticRow) onSelectRef.current(staticRow.view);
          else onTuneChannelRef.current?.(numBuf);   // not 1/2/3/90 — a real channel number
          numBuf = '';
        }, 900);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (numTimer) clearTimeout(numTimer); };
  }, []);

  const active = items[idx];

  return (
    <nav
      className="fixed left-0 top-0 bottom-0 z-[70] flex flex-col gap-0.5 py-4 px-2.5 bg-[#0a0a0c] border-r border-white/10 overflow-hidden"
      style={{ width: TV_SPINE_W }}
      data-tv-navbar
      role="tablist"
      aria-orientation="vertical"
    >
      <div className="flex items-center gap-3 px-1.5 mb-2 h-10 shrink-0">
        <Logo size={24} />
        <span className="text-[10px] font-black uppercase tracking-[0.32em] text-white/35">Lineup</span>
      </div>

      {/* Search — utility, unnumbered, above the lineup proper. */}
      <button
        data-tv-focusable
        onClick={onOpenSearch}
        className={`flex items-center gap-3 h-10 px-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shrink-0 mb-1 ${
          active.kind === 'util' && active.key === 'SEARCH' ? 'bg-white/[0.1] text-white' : 'text-white/45 hover:text-white hover:bg-white/[0.06]'
        }`}
        style={focused && active.kind === 'util' && active.key === 'SEARCH'
          ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)' } : undefined}
      >
        <Search size={16} className="shrink-0" />
        <span className="whitespace-nowrap">Search</span>
      </button>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col [scrollbar-width:none]">
        {(['apps', 'live', 'system'] as const).map((group) => {
          const rows = LINEUP_ROWS.filter(r => r.group === group);
          const meta = GROUP_META[group];
          return (
            <div key={group} className="shrink-0">
              <p className="px-2.5 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.22em] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                {meta.label}
              </p>
              {rows.map((row) => {
                const itemIndex = items.findIndex(it => it.kind === 'row' && it.row.view === row.view);
                const Icon = ROW_ICON[row.view];
                const isCurrentView = activeView === row.view;
                const isHighlighted = active.kind === 'row' && active.row.view === row.view;
                return (
                  <button
                    key={row.view}
                    ref={(node) => {
                      if (node) itemRefs.current.set(itemIndex, node);
                      else itemRefs.current.delete(itemIndex);
                    }}
                    role="tab"
                    aria-selected={isCurrentView}
                    data-tv-focusable
                    onClick={() => onSelect(row.view)}
                    className={`w-full flex items-center gap-2.5 h-11 px-2.5 rounded-xl transition-all mb-0.5 ${
                      isHighlighted ? 'bg-white/[0.1]' : isCurrentView ? 'bg-white/[0.05]' : 'hover:bg-white/[0.06]'
                    }`}
                    style={focused && isHighlighted ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)' } : undefined}
                  >
                    <span
                      className="font-mono font-extrabold text-[12px] w-8 text-right shrink-0 tabular-nums"
                      style={{ color: isCurrentView ? '#fff' : 'rgba(255,255,255,0.38)' }}
                    >
                      {row.num}
                    </span>
                    {Icon && <Icon size={15} className="shrink-0" style={isCurrentView ? { color: meta.color } : { color: 'rgba(255,255,255,0.45)' }} />}
                    <span
                      className="text-left text-[12px] font-bold truncate"
                      style={isCurrentView ? { color: '#fff' } : { color: 'rgba(255,255,255,0.6)' }}
                    >
                      {row.name}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Now Playing — utility, unnumbered, pinned to the foot of the rail. */}
      {currentTrack && (
        <button
          data-tv-focusable
          onClick={onOpenNowPlaying}
          title="Back to what's playing"
          className={`flex items-center gap-3 h-14 px-2.5 rounded-2xl transition-all shrink-0 mt-2 ${
            active.kind === 'util' && active.key === 'NOW_PLAYING' ? 'bg-white text-black' : 'bg-white/[0.06] text-white hover:bg-white/[0.12]'
          }`}
          style={focused && active.kind === 'util' && active.key === 'NOW_PLAYING'
            ? { boxShadow: '0 0 0 4px #FF8C00, 0 0 0 7px rgba(0,0,0,0.7)' } : undefined}
        >
          <span className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center">
            {art ? <img src={thumb(art, THUMB.micro)} alt="" className="w-full h-full object-cover" />
                 : <Music2 size={14} className="text-white/50" />}
          </span>
          {isPlaying ? <Play size={12} className="shrink-0" /> : <Pause size={12} className="shrink-0 opacity-60" />}
          <span className="min-w-0 text-left overflow-hidden">
            <span className="block text-[10px] font-bold truncate">{(currentTrack as any)?.title || 'Now playing'}</span>
          </span>
        </button>
      )}
    </nav>
  );
};

export default TvSpine;
