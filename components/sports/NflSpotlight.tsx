import React, { useEffect, useState } from 'react';
import { RefreshCw, Shield, ArrowUpRight, Zap } from 'lucide-react';
import { Button } from '../ui/Button';
import { Surface, Eyebrow } from '../ui/Surface';
import { fetchNflScoreboard, NFL_SCOREBOARD_URL, type NflScoreboard } from '../../services/nflScoreboard';
import { scoreText } from '../../src/lib/scoreText';

export function NflSpotlight({ onExplore, previewCount, onSelectGame }: { onExplore: () => void; previewCount?: number; onSelectGame?: (gameId: string) => void }) {
  const [board, setBoard] = useState<NflScoreboard | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    let busy = false;
    let controller: AbortController | undefined;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      setLoading(true);
      try {
        const result = await fetchNflScoreboard(controller.signal);
        if (alive) { setBoard(result); setError(false); }
      } catch {
        if (alive) setError(true);
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, 30000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [refresh]);

  return <section aria-label="NFL scoreboard" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Eyebrow>In focus · NFL</Eyebrow>
        <h2 className="type-headline-md">Football takes the field.</h2>
        <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
          {board ? [board.season, board.seasonLabel, board.week ? `Week ${board.week}` : null].filter(Boolean).join(' · ') : 'Scores, schedules, and every team.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onExplore} icon={<Shield />}>Teams & standings</Button>
        <Button aria-label="Refresh NFL scoreboard" loading={loading} onClick={() => setRefresh(n => n + 1)} icon={<RefreshCw />}>Refresh</Button>
      </div>
    </div>
    {error && <p role="status" className="type-body-md" style={{ color: 'var(--pj-warning)' }}>
      {board ? 'Updates interrupted. Showing the last received scores; live status is unconfirmed.' : 'NFL scores are unavailable right now. Please retry.'}
    </p>}
    {!board && loading && <Surface role="status">Loading the NFL scoreboard…</Surface>}
    {board && board.events.length === 0 && <Surface>No games listed in the current NFL schedule window.</Surface>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {board?.events.slice(0, previewCount).map(event => {
        const competition = event.competitions[0];
        const status = competition.status?.type ?? event.status?.type;
        const isPre = status?.state === 'pre';
        const live = status?.state === 'in' && !error;
        const date = new Date(event.date || competition.date);
        return <Surface key={event.id} className="space-y-3">
          <p className="type-label-md" style={{ color: live ? 'var(--pj-orange)' : 'var(--text-secondary)' }}>
            {error ? 'Last reported · ' : live ? 'Live · ' : ''}{status?.shortDetail || status?.detail || 'Status unavailable'}
          </p>
          {['away', 'home'].map(side => {
            const team = competition.competitors.find((c: any) => c.homeAway === side);
            return <div key={side} className="flex items-center gap-3">
              {team.team.logo && <img src={team.team.logo} alt="" className="w-8 h-8 object-contain" />}
              <span className="type-title-sm flex-1">{team.team.displayName || team.team.abbreviation}<span className="block type-label-sm" style={{ color: 'var(--text-secondary)' }}>{side === 'home' ? 'Home' : 'Away'}</span></span>
              <span className="type-title-lg tabular-nums">{isPre ? '—' : scoreText(team.score) || '—'}</span>
            </div>;
          })}
          <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>{competition.timeValid === false || Number.isNaN(date.getTime()) ? 'Time to be announced' : date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}{competition.neutralSite ? ' · Neutral site' : ''}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {onSelectGame && <Button onClick={() => onSelectGame(event.id)} icon={<Zap />}>Game center</Button>}
            <Button as="a" href={`https://www.espn.com/nfl/game/_/gameId/${encodeURIComponent(event.id)}`} target="_blank" rel="noopener noreferrer" variant="ghost" iconRight={<ArrowUpRight />}>{onSelectGame ? 'ESPN' : 'Game details'}</Button>
          </div>
        </Surface>;
      })}
    </div>
    {previewCount && board && board.events.length > previewCount && <Button onClick={onExplore}>View all {board.events.length} NFL games</Button>}
    {board && <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>ESPN · Received {new Date(board.fetchedAt).toLocaleTimeString()} · Refreshes every 30 seconds · Times shown in your timezone. <a href={NFL_SCOREBOARD_URL} target="_blank" rel="noopener noreferrer" className="underline">Source</a></p>}
  </section>;
}
