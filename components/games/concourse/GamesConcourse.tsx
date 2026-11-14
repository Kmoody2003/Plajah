// Plajah Games home · Concourse layout (picked by Kenne 2026-11-13 from two concepts).
// Flagship hero (Ravencrest is the launch title), "Jump back in" from the player's own ledger,
// category shelves, and a Gamer Network rail with the real score, live party games, top players and ledger.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, UserPlus, X, Radio } from 'lucide-react';
import { PLAJAH_GAMES_CATALOG, getPlajahGameById, type PlajahGameEntry } from '../../../data/plajahGamesCatalog';
import { gamer, failed, isSignedIn, type GamerProfile, type LeaderRow } from '../../../services/gamerNet/client';
import type { GamerEntry } from '../../../services/gamerNet/ledger';
import { liveGame, failed as liveFailed } from '../../../services/liveGames/client';
import type { LiveGameDoc } from '../../../services/liveGames/core';
import { SHELVES, FLAGSHIP_IDS, shortTitle, copyInvite, GameThumb, Avatar } from './shared';

const LiveGamePlay = React.lazy(() => import('../../liveGames/LiveGamePlay'));

interface Props {
  profile: GamerProfile | null;
  onOpenGame: (g: PlajahGameEntry) => void;
  onPlay: (g: PlajahGameEntry) => void;
  onHostLive: () => void;
  onOpenPassport: () => void;
  onOpenLeaderboards: () => void;
  /** Extra shelves under the first-party ones (creator-uploaded games, admin prototypes). */
  children?: React.ReactNode;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const hashShort = (h: string) => (h && h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h || '—');
const ago = (t: number) => {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function describe(e: GamerEntry): { text: string; icon: string } {
  const g = e.game ? getPlajahGameById(e.game)?.title ?? (e.game === 'ttt' ? 'Cyber Tic Tac Toe' : e.game) : '';
  switch (e.event) {
    case 'MATCH_RESULT': return { icon: e.result === 'win' ? '🏆' : '⚔', text: `${e.result === 'win' ? 'Won' : e.result === 'draw' ? 'Drew' : 'Lost'} a ranked match · ${g}` };
    case 'ACHIEVEMENT': return { icon: '★', text: `Achievement unlocked · ${g}` };
    case 'LIVE_GAME': return { icon: '◉', text: `Placed #${e.rank ?? '?'} of ${e.players ?? '?'} · ${g}` };
    case 'EXTERNAL_IMPORT': return { icon: '⇩', text: `Imported from ${e.platform ?? 'a linked platform'}` };
    default: return { icon: '▶', text: `Played ${g}` };
  }
}

export default function GamesConcourse({ profile, onOpenGame, onPlay, onHostLive, onOpenPassport, onOpenLeaderboards, children }: Props) {
  const flagships = useMemo(() => FLAGSHIP_IDS.map(id => getPlajahGameById(id)).filter(Boolean) as PlajahGameEntry[], []);
  const [hi, setHi] = useState(0);
  const [slide, setSlide] = useState(0);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<GamerEntry[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [live, setLive] = useState<LiveGameDoc[]>([]);
  const [openLive, setOpenLive] = useState<LiveGameDoc | null>(null);
  const hero = flagships[hi] ?? flagships[0];
  const heroShots = hero?.screenshots.length ? hero.screenshots : [{ url: hero?.thumbnailUrl ?? '', caption: '' }];
  const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    setSlide(0);
    if (reduceMotion.current || heroShots.length < 2) return;
    const t = window.setInterval(() => setSlide(s => (s + 1) % heroShots.length), 3800);
    return () => window.clearInterval(t);
  }, [hi, heroShots.length]);

  useEffect(() => {
    let alive = true;
    void gamer.leaderboard('all', 5).then(r => { if (alive && !failed(r)) setLeaders(r.players ?? []); });
    const loadLive = async () => { const r = await liveGame.live(); if (alive && !liveFailed(r)) setLive(Array.isArray(r.games) ? r.games : []); };
    void loadLive();
    const t = window.setInterval(loadLive, 20_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!profile?.uid || !isSignedIn()) { setHistory([]); return; }
    let alive = true;
    void gamer.history(profile.uid, 40).then(r => { if (alive && !failed(r)) setHistory(r.entries ?? []); });
    return () => { alive = false; };
  }, [profile?.uid]);

  // Most recent distinct catalog games from the player's own ledger.
  const recent = useMemo(() => {
    const seen = new Set<string>(); const out: { game: PlajahGameEntry; at: number }[] = [];
    for (const e of [...history].sort((a, b) => b.at - a.at)) {
      const g = e.game ? getPlajahGameById(e.game === 'ttt' ? 'cyber-ttt' : e.game) : undefined;
      if (g && !seen.has(g.id)) { seen.add(g.id); out.push({ game: g, at: e.at }); }
      if (out.length === 3) break;
    }
    return out;
  }, [history]);

  const liveCount = (g: PlajahGameEntry) => g.launch.type === 'live-game' ? live.filter(l => l.kind === (g.launch as any).kind).length : 0;

  const invite = async (g: PlajahGameEntry) => setNotice(await copyInvite(g));

  const card = (g: PlajahGameEntry) => {
    const n = liveCount(g);
    return (
      <button key={g.id} type="button" className="gcx-card" style={{ ['--gx-hue' as any]: g.accentColor }} onClick={() => onOpenGame(g)}>
        <div className="gcx-thumb">
          <GameThumb game={g} />
          <span className="gcx-badge">{g.id === 'ravencrest' ? 'Launch title' : g.categoryLabel}</span>
          {n > 0 && <span className="gcx-badge r">● {n} live</span>}
        </div>
        <div className="gcx-meta">
          <h3>{shortTitle(g)}</h3>
          <p>{g.description}</p>
          <div className="gcx-foot"><span>{g.playersLabel.split(' (')[0]}</span><span>{g.duration}</span></div>
        </div>
      </button>
    );
  };

  const sc = profile?.scoreCard;
  const parts = sc ? ([['Play', sc.play], ['Skill', sc.skill], ['Achievements', sc.achievements], ['Live games', sc.live ?? 0], ['Linked platforms', sc.external]] as const).filter(p => p[1] > 0) : [];
  const partMax = Math.max(1, ...parts.map(p => p[1]));

  return (
    <>
      {hero && (
        <section className="gcx-hero" aria-label="Featured games">
          <div className="gcx-slides" aria-hidden>
            {heroShots.map((s, k) => <img key={hero.id + k} src={s.url} alt="" className={k === slide ? 'on' : ''} />)}
          </div>
          <div className="gcx-hero-copy">
            <div className="gcx-eyebrow">{hero.id === 'ravencrest' ? 'Launch title · now playing on Plajah' : `Plajah original · ${hero.categoryLabel}`}</div>
            <h1>{shortTitle(hero)}</h1>
            <p>{hero.description}</p>
            <div className="gcx-cta">
              <button type="button" className="gcx-btn play" onClick={() => onPlay(hero)}><Play size={16} fill="currentColor" /> Play now</button>
              <button type="button" className="gcx-btn ghost" onClick={() => onOpenGame(hero)}>Game page</button>
              <button type="button" className="gcx-btn ghost" onClick={() => invite(hero)}><UserPlus size={15} /> Invite a friend</button>
            </div>
            <div className="gcx-stat" aria-live="polite">
              <span><b>{hero.playersLabel}</b></span><span>{hero.duration}</span><span>{hero.engine}</span>
              {notice && <span style={{ color: 'var(--gx-mint)' }}>{notice}</span>}
            </div>
          </div>
          <div className="gcx-picks">
            {flagships.map((f, k) => (
              <button key={f.id} type="button" className={`gcx-pick ${k === hi ? 'on' : ''}`} aria-pressed={k === hi} onClick={() => { setHi(k); setNotice(''); }}>
                <img src={f.thumbnailUrl} alt="" />
                <span><b>{shortTitle(f).replace('Era Clash: ', '')}{f.id === 'ravencrest' && <span className="gcx-launch">LAUNCH</span>}</b><small>{f.categoryLabel}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="gcx-main">
        <div style={{ minWidth: 0 }}>
          {recent.length > 0 && (
            <section className="gcx-shelf">
              <div className="gcx-shelf-h"><h2>Jump back in</h2><span>From your gamer ledger, on every device</span></div>
              <div className="gcx-cont">
                {recent.map(({ game, at }) => (
                  <button key={game.id} type="button" className="gcx-card" style={{ ['--gx-hue' as any]: game.accentColor }} onClick={() => onPlay(game)}>
                    <div className="gcx-thumb"><GameThumb game={game} /></div>
                    <div className="gcx-meta"><h3>{shortTitle(game)}</h3><p>Played {ago(at)}</p><div className="gcx-foot"><span style={{ color: 'var(--gx-amber)', fontWeight: 700 }}>▶ Resume</span></div></div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {SHELVES.map(sh => {
            const list = PLAJAH_GAMES_CATALOG.filter(sh.match).sort((a, b) => Number(b.id === 'ravencrest') - Number(a.id === 'ravencrest'));
            if (!list.length) return null;
            return (
              <section key={sh.id} className="gcx-shelf" id={`gcx-shelf-${sh.id}`}>
                <div className="gcx-shelf-h"><h2>{sh.label}</h2><span>{sh.note}</span>{sh.id === 'parlor' && <button type="button" onClick={onHostLive}>Host a live game →</button>}</div>
                <div className="gcx-row">{list.map(card)}</div>
              </section>
            );
          })}

          {children}
        </div>

        <aside className="gcx-rail" aria-label="Gamer Network">
          <section className="gcx-panel gcx-gcard">
            <h4>Gamer Network <button type="button" onClick={onOpenPassport}>Open passport</button></h4>
            {profile ? (
              <>
                <div className="gcx-gtop"><Avatar name={profile.name} photo={profile.photo} /><span><b>{profile.name}</b><small>{profile.platforms?.length ? `Linked: ${profile.platforms.join(', ')}` : 'No linked platforms yet'}</small></span></div>
                <div className="gcx-score">{fmt(profile.score)}</div>
                <div className="gcx-gsub"><span>{profile.achievements?.length ?? 0} achievements</span><span>{profile.localPlays ?? 0} casual plays</span></div>
                {parts.length > 0 && (
                  <div className="gcx-src">
                    {parts.map(([label, v]) => <div key={label}><span>{label}</span><b>{fmt(v)}</b><i style={{ ['--w' as any]: `${Math.round((v / partMax) * 100)}%` }} /></div>)}
                  </div>
                )}
                <div className="gcx-ledger">◆ {profile.ledger.length} ledger entries · head {hashShort(profile.ledger.head)}</div>
              </>
            ) : (
              <p className="gcx-signin">Sign in to start your gamer score. Wins, achievements and live games go onto a ledger you own, and you can link Steam to bring your history with you.</p>
            )}
          </section>

          <section className="gcx-panel">
            <h4>Live now <button type="button" onClick={onHostLive}>Host one</button></h4>
            {live.length ? (
              <ul className="gcx-list">
                {live.slice(0, 5).map(l => (
                  <li key={l.id}>
                    <Avatar name={l.hostName} photo={l.hostPhoto} />
                    <span className="txt"><b>{l.title}</b><small>{l.hostName} · {l.players} playing</small></span>
                    <button type="button" className="mini" onClick={() => setOpenLive(l)}>Join</button>
                  </li>
                ))}
              </ul>
            ) : <p className="gcx-empty"><Radio size={13} style={{ verticalAlign: -2 }} /> No live games right now. Host Sketch Rush or Brain Rush and your audience joins from the feed.</p>}
          </section>

          <section className="gcx-panel">
            <h4>Top players <button type="button" onClick={onOpenLeaderboards}>Leaderboards</button></h4>
            {leaders.length ? (
              <ul className="gcx-list">
                {leaders.map(p => (
                  <li key={p.uid}><span className="gcx-ico">{p.rank}</span><Avatar name={p.name} photo={p.photo} /><span className="txt"><b>{p.name}</b></span><em>{fmt(p.score)}</em></li>
                ))}
              </ul>
            ) : <p className="gcx-empty">The board fills as players finish ranked matches.</p>}
          </section>

          {history.length > 0 && (
            <section className="gcx-panel">
              <h4>Your ledger <button type="button" onClick={onOpenPassport}>Verify</button></h4>
              <ul className="gcx-list">
                {[...history].sort((a, b) => b.seq - a.seq).slice(0, 5).map(e => {
                  const d = describe(e);
                  return <li key={e.seq}><span className="gcx-ico">{d.icon}</span><span className="txt"><span style={{ color: 'var(--gx-fg)' }}>{d.text}</span><small>{ago(e.at)} · {hashShort(e.hash)}</small></span>{e.points ? <em>+{e.points}</em> : null}</li>;
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {openLive && createPortal(
        <div className="fixed inset-0 z-[180] overflow-y-auto bg-black/80 p-2 backdrop-blur sm:p-6">
          <div className="mx-auto max-w-5xl">
            <button type="button" onClick={() => setOpenLive(null)} className="mb-2 ml-auto flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white"><X size={16} /> Close</button>
            <React.Suspense fallback={<div className="p-8 text-white/60">Joining…</div>}><LiveGamePlay gid={openLive.id} kind={openLive.kind} /></React.Suspense>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
