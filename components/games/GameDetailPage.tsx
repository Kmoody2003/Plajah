// Plajah game page · Concourse layout (Steam-style): media viewer with the commercial first, screenshots,
// a sticky side card with Play now / Invite / Go live, then about, Plajah synergy, achievements and the board.
import React, { useEffect, useState } from 'react';
import { Play, UserPlus, Radio, Music, Swords, Share2 } from 'lucide-react';
import type { PlajahGameEntry } from '../../data/plajahGamesCatalog';
import GameCommercialPlayer from './GameCommercialPlayer';
import { PostGameButton } from './social/PostGameButton';
import { BASE_ACHIEVEMENTS } from '../../services/achievementService';
import { gamer, failed, isSignedIn, type GamerProfile, type LeaderRow } from '../../services/gamerNet/client';
import { ACHIEVEMENTS } from '../../services/gamerNet/score';
import { launchTemplateProjectInChora } from '../../services/melos/eraClashChoraLaunch';
import { CATEGORY_LABEL, copyInvite, GameThumb, shortTitle, useConcourseFont } from './concourse/shared';

interface GameDetailPageProps {
  game: PlajahGameEntry;
  onBack: () => void;
  onPlayNow: (game: PlajahGameEntry) => void;
  onGoLive?: (game: PlajahGameEntry) => void;
}

/** Gamer Network game ids that have ranked boards (registry GAMES). */
const BOARD_ID: Record<string, string> = { 'cyber-ttt': 'ttt' };

export const GameDetailPage: React.FC<GameDetailPageProps> = ({ game, onBack, onPlayNow, onGoLive }) => {
  useConcourseFont();
  const [media, setMedia] = useState(-1); // -1 = commercial
  const [me, setMe] = useState<GamerProfile | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => { setMedia(-1); setNotice(''); window.scrollTo?.(0, 0); }, [game.id]);

  useEffect(() => {
    if (!isSignedIn()) return;
    let alive = true;
    void gamer.me().then(r => { if (alive && !failed(r)) setMe(r.profile); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const id = BOARD_ID[game.id]; setBoard([]);
    if (!id) return;
    let alive = true;
    void gamer.leaderboard(id, 10).then(r => { if (alive && !failed(r)) setBoard(r.players ?? []); });
    return () => { alive = false; };
  }, [game.id]);

  const achievements = game.achievementTriggers.map(trig => {
    const base = BASE_ACHIEVEMENTS.find(a => a.triggerType === trig);
    const net = ACHIEVEMENTS.find(a => a.id === trig || a.id === trig.toLowerCase());
    const unlocked = !!me?.achievements?.some(a => a === trig || a === trig.toLowerCase());
    return { id: trig, title: base?.title ?? net?.title ?? trig, description: base?.description ?? 'Verified on your Plajah gamer ledger', points: base?.pointsValue ?? net?.points ?? 25, unlocked };
  });

  const shots = game.capturePending ? [] : game.screenshots;
  const invite = async () => setNotice(await copyInvite(game));
  const goLive = () => {
    if (onGoLive && game.launch.type === 'live-game') { onGoLive(game); return; }
    window.dispatchEvent(new CustomEvent('plajah:start-broadcast'));
    setNotice('Go Live is opening. Share your game window as the scene.');
  };

  return (
    <div className="gcx-gpage">
      <nav className="gcx-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={onBack}>Games</button><span>/</span>
        <button type="button" onClick={onBack}>{CATEGORY_LABEL[game.category]}</button><span>/</span>
        <span>{shortTitle(game)}</span>
      </nav>
      <h1 className="gcx-gtitle">{shortTitle(game)}</h1>

      <div className="gcx-gp">
        <div style={{ minWidth: 0 }}>
          <div className="gcx-viewer">
            {media < 0 ? (
              game.commercialVideoUrl
                ? <video src={game.commercialVideoUrl} poster={game.thumbnailUrl} controls playsInline muted autoPlay />
                : <GameCommercialPlayer game={game} onPlayNow={onPlayNow} autoAdvance={false} compact />
            ) : (
              <>
                <img src={shots[media]?.url} alt={shots[media]?.caption ?? game.title} />
                {shots[media]?.caption && <div className="cap">{shots[media].caption}</div>}
              </>
            )}
          </div>
          <div className="gcx-strip" role="group" aria-label="Media">
            <button type="button" aria-pressed={media < 0} onClick={() => setMedia(-1)} aria-label="Commercial"><span className="ad">▶ Commercial</span></button>
            {shots.map((s, i) => (
              <button key={s.url + i} type="button" aria-pressed={media === i} onClick={() => setMedia(i)} aria-label={`Screenshot ${i + 1}`}><img src={s.url} alt="" loading="lazy" /></button>
            ))}
          </div>

          <section className="gcx-sec">
            <h3>About this game</h3>
            <p className="long">{game.longDescription || game.description}</p>
            <ul className="gcx-feats">{game.features.map(f => <li key={f}>{f}</li>)}</ul>
            {game.controls.length > 0 && <ul className="gcx-ctrl">{game.controls.map(c => <li key={c}>{c}</li>)}</ul>}
          </section>

          <section className="gcx-sec">
            <h3>Play it the Plajah way</h3>
            <div className="gcx-syn">
              <button type="button" onClick={invite}><span className="ic"><UserPlus size={17} /></span><b>Invite a friend</b><small>The link opens this page so they can jump in</small></button>
              <button type="button" onClick={goLive}><span className="ic"><Radio size={17} /></span><b>{game.launch.type === 'live-game' ? 'Host it live' : 'Go live'}</b><small>{game.launch.type === 'live-game' ? 'Your audience joins from the stream and the feed' : 'Stream your run with chat'}</small></button>
              {game.synergy.choraProjectId && (
                <button type="button" onClick={() => { launchTemplateProjectInChora(game.synergy.choraProjectId!); setNotice('Opening the soundtrack project in Chora.'); }}><span className="ic"><Music size={17} /></span><b>Open the score in Chora</b><small>Remix the arena music</small></button>
              )}
              {game.synergy.combatAtlas && (
                <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: 'combat' } })); setNotice('Opening the Combat Atlas in Plajah Labs.'); }}><span className="ic"><Swords size={17} /></span><b>Combat Atlas</b><small>The real martial arts behind the moves</small></button>
              )}
              {game.id === 'cyber-ttt' && (
                <PostGameButton what={{ kind: 'play', game: 'ttt' }} className="gcx-synpost" label="Post to your feed · friends play in the timeline" />
              )}
            </div>
          </section>

          {achievements.length > 0 && (
            <section className="gcx-sec">
              <h3>Achievements</h3>
              <div className="gcx-ach">
                {achievements.map(a => (
                  <div key={a.id} className={a.unlocked ? 'got' : ''}>
                    <span className="gcx-medal" aria-hidden>{a.unlocked ? '🏆' : '★'}</span>
                    <span><b>{a.title}</b><small>{a.description}{a.unlocked ? ' · unlocked' : ''}</small></span>
                    <em>+{a.points}</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          {board.length > 0 && (
            <section className="gcx-sec">
              <h3>Ranked leaderboard</h3>
              <div className="gcx-tbl">
                <table className="gcx-lb">
                  <thead><tr><th>#</th><th>Player</th><th>Rating</th><th>W–L–D</th><th>Score</th></tr></thead>
                  <tbody>
                    {board.map(r => (
                      <tr key={r.uid} className={me?.uid === r.uid ? 'me' : ''}>
                        <td>{r.rank}</td><td>{r.name}</td><td>{r.rating ?? '—'}</td><td>{r.wins ?? 0}–{r.losses ?? 0}–{r.draws ?? 0}</td><td>{r.score.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="gcx-side">
          <div className="gcx-capsule"><GameThumb game={game} /></div>
          <p>{game.description}</p>
          <dl className="gcx-kv">
            <dt>Mode</dt><dd>{game.categoryLabel}</dd>
            <dt>Players</dt><dd>{game.playersLabel}</dd>
            <dt>Length</dt><dd>{game.duration}</dd>
            <dt>Engine</dt><dd>{game.engine}</dd>
          </dl>
          <div className="gcx-tags">
            {[game.badge, 'Free to play', 'Gamer Network', game.synergy.liveStream ? 'Stream-ready' : null].filter(Boolean).map(t => <span key={t as string}>{t}</span>)}
          </div>
          <div className="gcx-buy">
            <button type="button" className="gcx-btn play" onClick={() => onPlayNow(game)}><Play size={17} fill="currentColor" /> Play now</button>
            <div className="gcx-two">
              <button type="button" className="gcx-btn ghost sm" onClick={invite}><UserPlus size={14} /> Invite</button>
              <button type="button" className="gcx-btn ghost sm" onClick={goLive}><Radio size={14} /> Go live</button>
            </div>
            {game.directUrl && <a className="gcx-btn ghost sm" href={game.directUrl} target="_blank" rel="noopener noreferrer"><Share2 size={14} /> Open full window</a>}
            <div className="gcx-free">Free · plays and achievements save to your Gamer Network ledger</div>
            <div className="gcx-notice" aria-live="polite">{notice}</div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default GameDetailPage;
