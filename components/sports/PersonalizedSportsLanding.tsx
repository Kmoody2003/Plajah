import React, { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw, Shield, Star, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { Eyebrow, Surface } from '../ui/Surface';
import { scoreText } from '../../src/lib/scoreText';
import { fetchFollowedSchedule, type FollowedSchedule } from '../../services/followedTeamSchedule';
import { gameStatus, localDayKey, selectSportsLanding, SCHEDULE_FRESH_MS, type FollowedGame, type FollowedTeam } from '../../services/sportsPersonalization';

interface Props {
  favorites: FollowedTeam[];
  onExplore: (league: string) => void;
  onFollow: () => void;
}

function kickoff(game: FollowedGame): string {
  const competition = game.event.competitions?.[0];
  const date = new Date(game.event.date || competition?.date);
  if (competition?.timeValid === false || Number.isNaN(date.getTime())) return 'Time to be announced';
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function PersonalizedSportsLanding({ favorites, onExplore, onFollow }: Props) {
  const [schedule, setSchedule] = useState<FollowedSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now);
  const favoritesKey = JSON.stringify(favorites);
  // Tag responses with their inputs so a newly selected account/team never sees old data.
  const [responseKey, setResponseKey] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const day = localDayKey(new Date(now));
  useEffect(() => {
    const teams: FollowedTeam[] = JSON.parse(favoritesKey);
    if (!teams.length) { setSchedule(null); setLoading(false); return; }
    let alive = true;
    let busy = false;
    let controller: AbortController | undefined;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12_000);
      setLoading(true);
      try {
        const result = await fetchFollowedSchedule(teams, controller.signal);
        if (alive) { setSchedule(result); setResponseKey(favoritesKey); setNow(Date.now()); }
      } catch {
        if (alive) {
          setSchedule({ games: [], unavailable: [...new Set(teams.map(t => t.league))], checkedAt: Date.now() });
          setResponseKey(favoritesKey);
        }
      } finally {
        clearTimeout(timeout); busy = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, 30_000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [favoritesKey, refresh, day]);

  const current = responseKey === favoritesKey ? schedule : null;
  const view = selectSportsLanding(current?.games || [], favorites, now);
  const stale = !!current && now - current.checkedAt > SCHEDULE_FRESH_MS;
  const unavailable = current?.unavailable || [];
  const hasIssue = stale || unavailable.length > 0;
  const isGameDay = view.mode === 'gameday';
  return <section aria-label="Your sports home" data-sports-mode={view.mode} className="space-y-5">
    {isGameDay ? <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Your teams · Game day</Eyebrow>
          <h2 className="type-display-sm">Your game. <span className="pj-text-ember">Your people.</span></h2>
          <p className="type-body-md" style={{ color: 'var(--text-secondary)' }}>Today’s matchups, from the first play to the final score.</p>
        </div>
        <Button onClick={onFollow} icon={<Star />}>Manage teams</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {view.today.map((game, index) => <GameDayCard key={game.id} game={game} featured={index === 0} />)}
      </div>
    </> : <Surface shape="hero" brand className="relative overflow-hidden space-y-5" style={{ padding: 'clamp(24px, 4vw, 48px)' }}>
      <Eyebrow>Plajah Sports · Your daily field of play</Eyebrow>
      <h2 className="type-display-sm">Every sport.<br /><span className="pj-text-ember">Your home team.</span></h2>
      <p className="type-body-lg max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
        {favorites.length === 0 ? 'Follow your teams. When they play, this becomes your game-day home. Until then, explore the whole world of sport.' :
          !current ? 'Checking your teams’ schedules. Explore the stories, scores, and sports around you.' :
          hasIssue ? 'Your sports hub is ready. Some team schedules could not be confirmed right now.' :
          'A day to explore. Your teams’ next matchups are below, with football and the wider world of sport in focus.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="lg" onClick={() => onExplore('NFL')} icon={<Shield />}>Explore NFL</Button>
        <Button size="lg" onClick={onFollow} icon={<Star />}>{favorites.length ? 'Manage teams' : 'Follow teams'}</Button>
        <Button variant="ghost" size="lg" onClick={() => document.getElementById('sports-leagues')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Browse sports</Button>
      </div>
    </Surface>}

    {favorites.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="type-body-sm" style={{ color: hasIssue ? 'var(--pj-warning)' : 'var(--text-secondary)' }}>
        {!current ? 'Checking your teams’ schedules…' : hasIssue ? `Schedule updates unavailable${unavailable.length ? ` for ${unavailable.join(', ')}` : ''}. Only confirmed games are featured.` :
          `ESPN · Checked ${new Date(current.checkedAt).toLocaleTimeString()} · Times in your timezone · Updates every 30 seconds`}
      </p>
      <Button variant="ghost" aria-label="Refresh followed team schedules" loading={loading} onClick={() => setRefresh(n => n + 1)} icon={<RefreshCw />}>Refresh</Button>
    </div>}

    {!isGameDay && view.next.length > 0 && <div className="space-y-3">
      <h3 className="type-title-lg">Next for your teams</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {view.next.map(({ team, game }) => <Surface key={`${team.league}:${team.name}`} className="space-y-2">
          <Eyebrow>{team.league} · {team.name}</Eyebrow>
          <p className="type-title-md">{game.event.name || game.event.shortName}</p>
          <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>{kickoff(game)}</p>
          <Button onClick={() => onExplore(team.league)} variant="ghost">Teams & standings <ArrowUpRight /></Button>
        </Surface>)}
      </div>
    </div>}
    {!isGameDay && favorites.length > 0 && current && !hasIssue && view.next.length === 0 &&
      <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>No upcoming games found for your teams in the next 14 days.</p>}
  </section>;
}

function GameDayCard({ game, featured }: { game: FollowedGame; featured: boolean }) {
  const competition = game.event.competitions[0];
  const status = gameStatus(game);
  const live = status.state === 'in';
  const final = status.state === 'post';
  return <Surface shape={featured ? 'hero' : 'card'} brand={featured} className="space-y-5" aria-label={`${game.league} ${game.event.name || 'matchup'}`}>
    <div className="flex flex-wrap justify-between gap-2">
      <Eyebrow>{game.league} · {live ? 'Live' : final ? 'Final' : 'Today'}</Eyebrow>
      <span className="type-label-md" style={{ color: live ? 'var(--pj-orange)' : 'var(--text-secondary)' }}>{status.shortDetail || status.detail || kickoff(game)}</span>
    </div>
    <div className="space-y-4">
      {['away', 'home'].map(side => {
        const competitor = competition.competitors.find((team: any) => team.homeAway === side);
        return <div key={side} className="flex items-center gap-3 sm:gap-4">
          {competitor.team.logo && <img className="w-12 h-12 object-contain" src={competitor.team.logo} alt="" />}
          <div className="flex-1 min-w-0"><p className="type-title-lg">{competitor.team.displayName || competitor.team.abbreviation}</p><p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>{side === 'home' ? 'Home' : 'Away'}</p></div>
          <span className="type-headline-lg tabular-nums">{status.state === 'pre' ? '—' : scoreText(competitor.score) || '—'}</span>
        </div>;
      })}
    </div>
    <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>{kickoff(game)}{competition.neutralSite ? ' · Neutral site' : ''}</p>
    <div className="flex flex-wrap gap-2">
      <Button as="a" href={game.detailUrl || game.sourceUrl} target="_blank" rel="noopener noreferrer" variant={featured ? 'primary' : 'secondary'} iconRight={<ArrowUpRight />}>
        {game.detailUrl ? final ? 'Recap & box score' : 'Game details' : 'View source scoreboard'}
      </Button>
      <Button icon={<Users />} onClick={() => window.dispatchEvent(new CustomEvent('plajah:open-fanroom', { detail: { matchId: String(game.event.id), match: { ...game.event, sportsLeague: game.league, sourceUrl: game.sourceUrl, detailUrl: game.detailUrl } } }))}>Fan room</Button>
    </div>
  </Surface>;
}
