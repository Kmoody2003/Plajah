// LoreLayer — Reello's Worlds-native video overlay.
//
// A Video may carry `worldId` + `characterTimestamps` (creator-tagged character appearances on
// the timeline). When playback enters a tagged character's window, a tappable chip slides in over
// the player; tapping it opens that character's card — portrait, role, bio, lore, relationships.
//
// Degrades silently: no worldId, no timestamps, or no matching published character → renders null.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Users2, BookOpen } from 'lucide-react';
import { Video, Character } from '../../types';
import { fetchWorldCharacters } from '../../services/backendService';

/** Seconds either side of a tagged timestamp during which the chip stays on screen. */
const WINDOW_SEC = 10;

const BRAND = 'linear-gradient(115deg,#6B0099 0%,#B4008C 42%,#D40055 66%,#FF8C00 100%)';

interface Props {
  video: Video;
  /** Current playhead position in seconds. */
  currentTime: number;
  /** Called when the character card opens/closes, so the player can pause its auto-hide. */
  onCardToggle?: (open: boolean) => void;
  className?: string;
}

interface ActiveTag {
  characterId: string;
  characterName: string;
  imageUrl?: string;
}

const RELATION_LABEL: Record<string, string> = {
  FAMILY: 'Family', FRIEND: 'Friend', RIVAL: 'Rival', ALLY: 'Ally', ENEMY: 'Enemy',
  ROMANTIC: 'Romantic', COWORKER: 'Coworker', ACQUAINTANCE: 'Acquaintance',
  MENTOR: 'Mentor', STUDENT: 'Student',
};

const LoreLayer: React.FC<Props> = ({ video, currentTime, onCardToggle, className }) => {
  const worldId = video?.worldId;
  const tags = video?.characterTimestamps;

  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const loadedWorld = useRef<string | null>(null);

  // Reset per-video state.
  useEffect(() => { setOpenId(null); setDismissed(new Set()); }, [video?.id]);

  // Lazy-load the world's published characters once, only when there's something to show.
  useEffect(() => {
    if (!worldId || !tags?.length) return;
    if (loadedWorld.current === worldId) return;
    loadedWorld.current = worldId;
    let alive = true;
    (async () => {
      try {
        const list = await fetchWorldCharacters(worldId);
        if (!alive || !list?.length) return;
        const map: Record<string, Character> = {};
        for (const c of list) map[c.id] = c;
        setCharacters(map);
      } catch {
        /* silent — the lore layer is strictly additive */
      }
    })();
    return () => { alive = false; };
  }, [worldId, tags?.length]);

  // Which tagged character (if any) owns the current moment. Nearest window wins.
  const active: ActiveTag | null = useMemo(() => {
    if (!tags?.length || !(currentTime >= 0)) return null;
    let best: { tag: ActiveTag; dist: number } | null = null;
    for (const t of tags) {
      for (const ts of t.timestamps || []) {
        const dist = Math.abs(currentTime - ts);
        if (dist <= WINDOW_SEC && (!best || dist < best.dist)) {
          best = { tag: { characterId: t.characterId, characterName: t.characterName, imageUrl: t.imageUrl }, dist };
        }
      }
    }
    return best?.tag || null;
  }, [tags, currentTime]);

  const character = active ? characters[active.characterId] : undefined;
  const openCharacter = openId ? characters[openId] : undefined;
  const chipVisible = !!active && !dismissed.has(active.characterId) && !openId;

  useEffect(() => { onCardToggle?.(!!openId); }, [openId, onCardToggle]);

  // Nothing tagged on this video — render nothing at all.
  if (!worldId || !tags?.length) return null;

  const portrait = character?.imageUrl || active?.imageUrl;

  return (
    <div className={`pointer-events-none absolute inset-0 z-30 ${className || ''}`}>
      {/* ── Appearance chip ── */}
      <AnimatePresence>
        {chipVisible && active && (
          <motion.div
            key={active.characterId}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
            className="absolute left-4 top-4 pointer-events-auto flex items-center gap-1"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={e => { e.stopPropagation(); setOpenId(active.characterId); }}
              title={`Open ${active.characterName} in this world`}
              className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 hover:border-white/35 transition-all shadow-xl"
            >
              <span className="w-7 h-7 rounded-full overflow-hidden shrink-0 p-[1.5px]" style={{ background: BRAND }}>
                <span className="block w-full h-full rounded-full overflow-hidden bg-black">
                  {portrait
                    ? <img src={portrait} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    : <span className="w-full h-full flex items-center justify-center text-[10px] font-black text-white/60">{active.characterName?.[0] || '?'}</span>}
                </span>
              </span>
              <span className="text-left leading-none">
                <span className="block text-[7.5px] font-black uppercase tracking-[0.2em] text-white/40 mb-0.5">On screen</span>
                <span className="block text-[10px] font-black uppercase tracking-widest text-white truncate max-w-[10rem]">{active.characterName}</span>
              </span>
              <Sparkles size={12} className="text-small-orange shrink-0" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setDismissed(prev => new Set(prev).add(active.characterId)); }}
              title="Hide this character"
              className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Character card ── */}
      <AnimatePresence>
        {openCharacter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-auto bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
            onClick={e => { e.stopPropagation(); setOpenId(null); }}
          >
            <motion.div
              initial={{ y: 24, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 24, scale: 0.97 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md max-h-full overflow-y-auto bg-[#0a0a0a]/97 border border-white/10 rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.85)]"
            >
              {/* Header */}
              <div className="relative p-5 flex items-start gap-4">
                <div className="shrink-0 rounded-2xl p-[2px]" style={{ background: openCharacter.accentColor ? undefined : BRAND, backgroundColor: openCharacter.accentColor || undefined }}>
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/10">
                    {openCharacter.imageUrl
                      ? <img src={openCharacter.imageUrl} alt={openCharacter.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/40">{openCharacter.name?.[0] || '?'}</div>}
                  </div>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-[7.5px] font-black uppercase tracking-[0.25em] text-white/35 mb-1.5">Lore Layer</p>
                  <h3 className="text-xl font-display font-black tracking-tight text-white leading-none truncate">{openCharacter.name}</h3>
                  {openCharacter.role && (
                    <p className="mt-2 inline-block px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/60">{openCharacter.role}</p>
                  )}
                </div>
                <button onClick={() => setOpenId(null)} className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>

              <div className="px-5 pb-5 space-y-5">
                {openCharacter.bio && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Bio</p>
                    <p className="text-xs text-white/65 leading-relaxed">{openCharacter.bio}</p>
                  </div>
                )}

                {openCharacter.lore && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mb-2 flex items-center gap-1.5"><BookOpen size={10} /> Lore</p>
                    <p className="text-xs text-white/55 leading-relaxed line-clamp-6">{openCharacter.lore}</p>
                  </div>
                )}

                {!!openCharacter.relationships?.length && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mb-2 flex items-center gap-1.5"><Users2 size={10} /> Relationships</p>
                    <div className="space-y-1.5">
                      {openCharacter.relationships.slice(0, 8).map((r, i) => (
                        <div key={`${r.characterId}_${i}`} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.035] border border-white/5">
                          <span className="text-[10px] font-bold text-white/85 truncate flex-1">{r.characterName}</span>
                          <span className="text-[7.5px] font-black uppercase tracking-widest text-small-orange shrink-0">{RELATION_LABEL[r.type] || r.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!openCharacter.tags?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {openCharacter.tags.slice(0, 8).map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-[8px] font-black uppercase tracking-widest text-white/40">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoreLayer;
