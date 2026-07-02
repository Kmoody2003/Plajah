import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Film, Clapperboard, Gamepad2, Music, Play, ExternalLink, Gift } from 'lucide-react';
import { DOCUMENTARIES, MOVIES, GAMES, ANTHEM_PLAYLISTS } from '../data/soccerMedia';
import { WC26_TEAMS } from '../data/worldCup2026';

type Section = 'docs' | 'movies' | 'games' | 'playlists';
const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

const FreeBadge: React.FC<{ free: boolean }> = ({ free }) => (
  <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${free ? 'bg-[#39B54A]/20 text-[#39B54A]' : 'bg-white/8 text-white/40'}`}>
    {free ? 'Free' : 'Streaming'}
  </span>
);

const WorldCupWatch: React.FC = () => {
  const [section, setSection] = useState<Section>('docs');

  // Per-nation matchday playlists from each team's popular artists + anthem.
  const nationPlaylists = useMemo(() =>
    WC26_TEAMS
      .filter((t: any) => Array.isArray(t.popularArtists) && t.popularArtists.length)
      .map((t: any) => ({
        id: t.id, flag: t.flag, name: t.name,
        artists: (t.popularArtists as string[]).slice(0, 3),
        url: yt(`${(t.popularArtists as string[]).slice(0, 3).join(' ')} mix`),
        anthemUrl: t.anthem ? yt(`${t.anthem} national anthem`) : null,
      })),
    []);

  const tabs: { id: Section; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'docs', label: 'Documentaries', icon: Film },
    { id: 'movies', label: 'Films', icon: Clapperboard },
    { id: 'games', label: 'Games', icon: Gamepad2 },
    { id: 'playlists', label: 'Playlists', icon: Music },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#14100a] via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 opacity-10"><Clapperboard size={130} className="text-[#FF8C00]" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">Watch & Play</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">The Soccer Screening Room</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-lg">Free documentaries, the best football films, places to play, and the soundtracks of the game — everything to fall in love with soccer beyond the 90 minutes.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {tabs.map(t => {
          const Icon = t.icon; const active = section === t.id;
          return (
            <button key={t.id} onClick={() => setSection(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${active ? 'bg-[#FF8C00] text-black border-transparent' : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10'}`}>
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* DOCUMENTARIES */}
      {section === 'docs' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DOCUMENTARIES.map((d, i) => (
            <motion.a key={i} href={d.url} target="_blank" rel="noreferrer"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:border-white/20 hover:bg-white/[0.06] transition-all block">
              <div className="flex items-center gap-2 mb-2">
                <FreeBadge free={d.free} />
                {d.year && <span className="text-[8px] font-black text-white/30">{d.year}</span>}
                {d.length && <span className="text-[8px] text-white/25">· {d.length}</span>}
                <span className="ml-auto text-[8px] font-bold text-white/30">{d.where}</span>
              </div>
              <h4 className="text-sm font-black uppercase tracking-tight group-hover:text-[#FF8C00] transition-colors flex items-center gap-1.5"><Play size={12} className="shrink-0" />{d.title}</h4>
              <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">{d.blurb}</p>
            </motion.a>
          ))}
        </div>
      )}

      {/* MOVIES */}
      {section === 'movies' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MOVIES.map((m, i) => (
            <motion.a key={i} href={m.url} target="_blank" rel="noreferrer"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:border-white/20 hover:bg-white/[0.06] transition-all block">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00]/70">{m.year}</span>
                <ExternalLink size={11} className="text-white/25 group-hover:text-white/60" />
              </div>
              <h4 className="text-sm font-black uppercase tracking-tight">{m.title}</h4>
              <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">{m.blurb}</p>
            </motion.a>
          ))}
        </div>
      )}

      {/* GAMES */}
      {section === 'games' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GAMES.map((g, i) => (
            <motion.a key={i} href={g.url} target="_blank" rel="noreferrer"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:border-[#FF8C00]/30 hover:bg-white/[0.06] transition-all block">
              <div className="flex items-center gap-2 mb-1.5">
                <FreeBadge free={g.free} />
                <span className="text-[8px] font-bold text-white/30">{g.kind}</span>
                <Gamepad2 size={12} className="ml-auto text-white/25 group-hover:text-[#FF8C00]" />
              </div>
              <h4 className="text-sm font-black uppercase tracking-tight">{g.title}</h4>
              <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">{g.blurb}</p>
            </motion.a>
          ))}
        </div>
      )}

      {/* PLAYLISTS */}
      {section === 'playlists' && (
        <div className="space-y-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 flex items-center gap-2"><Music size={11} /> The Soundtrack of Football</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ANTHEM_PLAYLISTS.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer"
                  className="group rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:border-[#FF8C00]/30 transition-all block">
                  <h4 className="text-sm font-black uppercase tracking-tight flex items-center gap-1.5"><Play size={12} className="text-[#FF8C00]" />{p.title}</h4>
                  <p className="text-[12px] text-white/50 leading-relaxed mt-1.5">{p.blurb}</p>
                </a>
              ))}
            </div>
          </div>

          {nationPlaylists.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 flex items-center gap-2"><Gift size={11} /> Matchday Mixes by Nation</p>
              <p className="text-[11px] text-white/35 mb-3 -mt-1">What each country brings to the party — built from its biggest artists, plus its national anthem.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {nationPlaylists.map(n => (
                  <div key={n.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{n.flag}</span>
                      <h4 className="text-sm font-black uppercase tracking-tight">{n.name}</h4>
                    </div>
                    <p className="text-[11px] text-white/45 mt-1.5 line-clamp-1">{n.artists.join(' · ')}</p>
                    <div className="flex gap-2 mt-2.5">
                      <a href={n.url} target="_blank" rel="noreferrer" className="flex-1 text-center px-3 py-1.5 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[8px] font-black uppercase tracking-widest text-[#FF8C00] hover:bg-[#FF8C00]/25">▶ Mix</a>
                      {n.anthemUrl && <a href={n.anthemUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white">Anthem</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorldCupWatch;
