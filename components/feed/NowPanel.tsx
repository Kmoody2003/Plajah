// The "Now" panel on Plajah Social: everything happening right now, beside the feed on wide screens and in a
// pull-up sheet on phones. Live rooms, friends' presence, On Air, debates, scores, podcasts and Today all read
// real data; a module with nothing to show says so briefly or stays out of the way.
import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clock, Mic, Music2, Radio, Swords, Trophy } from 'lucide-react';
import type { Album, Debate, LiveTalk, NowActiveEntry } from '../../types';
import { listenToFollowedPresence } from '../../services/presenceService';
import { getPulseDebates } from '../../services/debateService';
import { getDailyFigure } from '../../services/historyData';
import { useBroadcastDirectory } from '../../hooks/useBroadcastDirectory';
import { talkCapacityLabel } from '../../services/liveTalk/liveTalkCore';
import { thumb, THUMB, onThumbError } from '../../src/lib/imageThumb';
import { UserAvatar } from '../avatar/UserAvatar';

export type NowView = 'LIVETALK' | 'ONAIR' | 'NOW' | 'PULSE';
export const LEAGUE_ENDPOINTS: Record<string, string> = {
  NBA: 'basketball/nba', NFL: 'football/nfl', NHL: 'hockey/nhl', MLB: 'baseball/mlb',
  NCAA: 'basketball/mens-college-basketball', FIFA: 'soccer/eng.1', MLS: 'soccer/usa.1',
};

const nav = (target: string) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } }));
const openAlbum = (album: Album) => window.dispatchEvent(new CustomEvent('SELECT_ALBUM', { detail: { album } }));

const presenceLine = (e: NowActiveEntry) => {
  if (e.type === 'TRACK') return { title: e.trackTitle || 'A track', sub: `Listening${e.trackArtist ? `, ${e.trackArtist}` : ''}` };
  if (e.type === 'VIDEO') return { title: e.videoTitle || 'A video', sub: 'Watching' };
  if (e.type === 'RADIO') return { title: 'Radio', sub: 'Listening' };
  return { title: 'Live now', sub: 'On air' };
};

const Module: React.FC<{ icon: React.ReactNode; title: string; action?: string; onAction?: () => void; children: React.ReactNode }> = ({ icon, title, action, onAction, children }) => (
  <section className="pj-now-mod">
    <div className="pj-now-mod-head">
      {icon}<span>{title}</span>
      {action && <button type="button" onClick={onAction}>{action}</button>}
    </div>
    {children}
  </section>
);

interface Props {
  uid?: string;
  presenceEnabled?: boolean;
  followingIds: string[];
  talks: LiveTalk[];
  leagues: string[];
  podcasts: Album[];
  featured: { music: Album | null; film: Album | null; book: Album | null };
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showScrubber: boolean;
  onJoinTalk: (id: string) => void;
  onStartTalk: () => void;
  onOpenView: (view: NowView) => void;
  onOpenDebate: (id: string) => void;
  onVisitUser: (uid: string) => void;
  onEnablePresence: () => void;
  onPickLeagues: () => void;
}

const NowPanel: React.FC<Props> = ({
  uid, presenceEnabled, followingIds, talks, leagues, podcasts, featured, scrollRef, showScrubber,
  onJoinTalk, onStartTalk, onOpenView, onOpenDebate, onVisitUser, onEnablePresence, onPickLeagues,
}) => {
  // Friends right now.
  const [friends, setFriends] = useState<NowActiveEntry[]>([]);
  const followKey = followingIds.join(',');
  useEffect(() => listenToFollowedPresence(followingIds, setFriends), [followKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // On Air: shares the directory with the full guide, so the two always agree.
  const directory = useBroadcastDirectory(uid);

  // One debate worth a look: the hottest the viewer can see, preferring people they follow.
  const [debate, setDebate] = useState<Debate | null>(null);
  useEffect(() => {
    if (!uid) { setDebate(null); return; }
    let alive = true;
    getPulseDebates(uid, followingIds).then(p => {
      if (alive) setDebate(p.following[0] || p.trending[0] || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid, followKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scores for the leagues the viewer follows.
  const [scores, setScores] = useState<any[]>([]);
  const leagueKey = leagues.join(',');
  useEffect(() => {
    const paths = leagues.map(l => LEAGUE_ENDPOINTS[l]).filter(Boolean);
    if (!paths.length) { setScores([]); return; }
    let alive = true;
    Promise.all(paths.map(p =>
      fetch(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard`).then(r => (r.ok ? r.json() : null)).then(d => d?.events || []).catch(() => []),
    )).then(all => { if (alive) setScores(all.flat().slice(0, 6)); });
    return () => { alive = false; };
  }, [leagueKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock lives here so its tick does not re-render the whole feed.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);

  // 24h scrubber: tracks the page scroll and moves through it.
  const [scrub, setScrub] = useState(0);
  const dragging = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !showScrubber) return;
    const onScroll = () => {
      if (dragging.current) return;
      const posts = el.querySelectorAll('[data-post-index]');
      if (!posts.length) return;
      const top = el.getBoundingClientRect().top + el.clientHeight * 0.4;
      let idx = 0;
      posts.forEach((p, i) => { if (p.getBoundingClientRect().top <= top) idx = i; });
      setScrub((idx / Math.max(posts.length - 1, 1)) * 100);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, showScrubber]);
  const scrubTo = (pct: number) => {
    setScrub(pct);
    const el = scrollRef.current;
    if (!el) return;
    const posts = el.querySelectorAll('[data-post-index]');
    const target = posts[Math.round((pct / 100) * (posts.length - 1))] as HTMLElement | undefined;
    if (target) el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 120;
  };

  const figure = getDailyFigure('MUSIC');
  const onAir = [
    ...directory.liveStreams.slice(0, 2).map(f => ({
      key: `live-${f.id}`, title: f.title, sub: `Live, ${(f as any).ownerName || 'Plajah'}`, img: (f as any).thumbnail || (f as any).coverImage || '',
      open: () => window.dispatchEvent(new CustomEvent('PLAY_LIVE_FEED', { detail: { feed: f } })),
    })),
    ...directory.fastChannels.slice(0, 2).map(c => ({
      key: `fast-${c.ownerId}`, title: c.name, sub: c.category || 'Channel', img: c.logoUrl || '', open: () => onOpenView('ONAIR'),
    })),
  ].filter((a, i, all) => all.findIndex(b => b.title === a.title) === i).slice(0, 3);

  return (
    <>
      <Module icon={<span className="pj-now-dot" />} title="Live now" action={talks.length ? 'See all' : undefined} onAction={() => onOpenView('LIVETALK')}>
        {talks.slice(0, 3).map(t => (
          <button key={t.id} type="button" className="pj-now-row" onClick={() => onJoinTalk(t.id)}>
            <UserAvatar uid={t.hostId} src={thumb(t.hostPhoto, THUMB.micro) || null} onError={onThumbError(t.hostPhoto)} alt={t.hostName} className="pj-now-av" loading="lazy" />
            <span className="pj-now-text"><b>{t.title}</b><small>{t.hostName}</small></span>
            <span className="pj-now-count">{talkCapacityLabel(t as any)}</span>
          </button>
        ))}
        {talks.length === 0 && <button type="button" className="pj-now-empty" onClick={onStartTalk}><Radio size={14} /> No rooms live. Start one</button>}
      </Module>

      {uid && (
        <Module icon={<Music2 size={14} />} title="Friends right now" action={friends.length ? 'See all' : undefined} onAction={() => onOpenView('NOW')}>
          {friends.slice(0, 3).map(f => {
            const line = presenceLine(f);
            return (
              <button key={f.uid} type="button" className="pj-now-row" onClick={() => onVisitUser(f.uid)}>
                <UserAvatar uid={f.uid} src={thumb(f.photoURL, THUMB.micro) || null} onError={onThumbError(f.photoURL)} alt={f.displayName} className="pj-now-av" loading="lazy" />
                <span className="pj-now-text"><b>{f.displayName} · {line.title}</b><small>{line.sub}</small></span>
                <span className="pj-now-eq" aria-hidden><i /><i /><i /></span>
              </button>
            );
          })}
          {friends.length === 0 && (presenceEnabled
            ? <p className="pj-now-note">When people you follow play something, it shows up here.</p>
            : <button type="button" className="pj-now-empty" onClick={onEnablePresence}><Music2 size={14} /> Share what you're playing</button>)}
        </Module>
      )}

      {onAir.length > 0 && (
        <Module icon={<Radio size={14} />} title="On Air" action="Guide" onAction={() => onOpenView('ONAIR')}>
          {onAir.map(a => (
            <button key={a.key} type="button" className="pj-now-row" onClick={a.open}>
              {a.img
                ? <img src={thumb(a.img, THUMB.micro) || undefined} onError={onThumbError(a.img)} alt="" loading="lazy" decoding="async" className="pj-now-av square" />
                : <span className="pj-now-av square pj-now-av-blank"><Radio size={14} /></span>}
              <span className="pj-now-text"><b>{a.title}</b><small>{a.sub}</small></span>
            </button>
          ))}
        </Module>
      )}
      {onAir.length === 0 && !directory.loading && (
        <button type="button" className="pj-now-link" onClick={() => onOpenView('ONAIR')}><Radio size={14} /> On Air guide <ChevronRight size={14} /></button>
      )}

      {debate && (
        <Module icon={<Swords size={14} />} title="Debate of the hour" action="All" onAction={() => onOpenView('PULSE')}>
          <button type="button" className="pj-now-debate" onClick={() => onOpenDebate(debate.id)}>
            <b>{debate.topic}</b>
            <small>{debate.challengerName} vs {debate.defenderName}</small>
          </button>
        </Module>
      )}

      {!debate && uid && (
        <button type="button" className="pj-now-link" onClick={() => onOpenView('PULSE')}><Swords size={14} /> Debates <ChevronRight size={14} /></button>
      )}

      <Module icon={<Trophy size={14} />} title="Your teams" action={leagues.length ? 'Edit' : undefined} onAction={onPickLeagues}>
        {scores.length > 0 ? (
          <div className="pj-now-scores">
            {scores.map(ev => (
              <div key={ev.id} className="pj-now-score">
                {(ev.competitions?.[0]?.competitors || []).map((c: any) => (
                  <div key={c.id}><span>{c.team?.abbreviation}</span><span>{typeof c.score === 'object' ? c.score?.displayValue : c.score}</span></div>
                ))}
                <small>{ev.status?.type?.shortDetail}</small>
              </div>
            ))}
          </div>
        ) : leagues.length
          ? <p className="pj-now-note">No games on today.</p>
          : <button type="button" className="pj-now-empty" onClick={onPickLeagues}><Trophy size={14} /> Pick your leagues</button>}
      </Module>

      {podcasts.length > 0 && (
        <Module icon={<Mic size={14} />} title="Your podcasts">
          {podcasts.slice(0, 3).map(p => (
            <button key={p.id} type="button" className="pj-now-row" onClick={() => openAlbum(p)}>
              <img src={thumb(p.coverImage, THUMB.micro) || undefined} onError={onThumbError(p.coverImage)} alt="" loading="lazy" decoding="async" className="pj-now-av square" />
              <span className="pj-now-text"><b>{p.title}</b><small>{p.tracks?.length ?? 0} episodes</small></span>
            </button>
          ))}
        </Module>
      )}

      <section className="pj-now-mod">
        <div className="pj-now-clock">
          <b>{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</b>
          <small>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</small>
        </div>
        {[
          featured.music && { label: 'New in Chora', a: featured.music },
          featured.film && { label: 'New film', a: featured.film },
          featured.book && { label: 'From the library', a: featured.book },
        ].filter(Boolean).map((x: any) => (
          <button key={x.a.id} type="button" className="pj-now-row" onClick={() => openAlbum(x.a)}>
            <img src={thumb(x.a.coverImage, THUMB.micro) || undefined} onError={onThumbError(x.a.coverImage)} alt="" loading="lazy" decoding="async" className="pj-now-av square" />
            <span className="pj-now-text"><b>{x.a.title}</b><small>{x.label}</small></span>
          </button>
        ))}
        <button type="button" className="pj-now-row" onClick={() => nav('CHORA_HISTORY')}>
          <span className="pj-now-av square pj-now-av-blank"><Clock size={14} /></span>
          <span className="pj-now-text"><b>{figure.name}</b><small>On this day in music</small></span>
        </button>
        {showScrubber && (
          <label className="pj-now-scrub">
            <span>Now</span>
            <input
              type="range" min={0} max={100} value={scrub} aria-label="Move through your feed"
              onPointerDown={() => { dragging.current = true; }}
              onPointerUp={() => { dragging.current = false; }}
              onChange={e => scrubTo(Number(e.target.value))}
            />
            <span>Earlier</span>
          </label>
        )}
      </section>
    </>
  );
};

export default NowPanel;
