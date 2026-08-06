import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Search, Loader2 } from 'lucide-react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import type { IGif } from '@giphy/js-types';

const gf = new GiphyFetch('4Sbiygh5QwzvnHYaZm2IbqW44MSBMd4K');

export type GifMediaType = 'GIF' | 'STICKER';

interface GifStickerPickerProps {
  onSelect: (url: string, type: GifMediaType) => void;
  onClose: () => void;
  defaultTab?: GifMediaType;
  anchorClass?: string;
  /** Intimate (couples) mode — romantic quick-chips + Giphy's highest content rating. */
  intimate?: boolean;
}

// Romantic quick searches surfaced only in intimate chats.
const ROMANTIC_CHIPS = ['kiss', 'love you', 'cuddle', 'hug', 'flirty', 'miss you', 'date night', 'blush'];

const GifStickerPicker: React.FC<GifStickerPickerProps> = ({
  onSelect,
  onClose,
  defaultTab = 'GIF',
  anchorClass = 'bottom-full mb-2 left-0',
  intimate = false,
}) => {
  const [tab, setTab] = useState<GifMediaType>(defaultTab);
  const [query, setQuery] = useState(intimate ? 'love' : '');
  const [debouncedQuery, setDebouncedQuery] = useState(intimate ? 'love' : '');
  const [gifs, setGifs] = useState<IGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const rating = intimate ? 'r' : 'g'; // 'r' is Giphy's ceiling — romantic, never explicit

  // Debounce the search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 380);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch GIFs/stickers ourselves and render a plain grid — the @giphy <Grid> component
  // silently rendered nothing in some environments (the "GIF library won't load" bug). This
  // uses the same (working) API with explicit loading/error states.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    const isSticker = tab === 'STICKER';
    const req = debouncedQuery.trim()
      ? gf.search(debouncedQuery, { limit: 24, rating, ...(isSticker ? { type: 'stickers' as const } : {}) })
      : gf.trending({ limit: 24, rating, ...(isSticker ? { type: 'stickers' as const } : {}) });
    req.then(res => { if (!cancelled) { setGifs(res.data || []); setLoading(false); } })
       .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tab, debouncedQuery, rating]);

  const handleGifClick = (gif: IGif, e: React.SyntheticEvent<HTMLElement, Event>) => {
    e.preventDefault();
    const url =
      gif.images?.original?.url ||
      gif.images?.fixed_height?.url ||
      gif.images?.downsized?.url ||
      '';
    if (url) onSelect(url, tab);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 6 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className={`absolute ${anchorClass} w-80 bg-black/96 backdrop-blur-2xl border border-white/12 rounded-2xl overflow-hidden shadow-2xl z-[200]`}
      onClick={e => e.stopPropagation()}
    >
      {/* Header — tabs + close */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
        <div className="flex gap-1">
          {(['GIF', 'STICKER'] as GifMediaType[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setQuery(''); }}
              className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                tab === t ? 'bg-white text-black' : 'text-white/35 hover:text-white'
              }`}
            >
              {t === 'GIF' ? '🎞 GIFs' : '✨ Stickers'}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="text-white/25 hover:text-white transition-colors p-1">
          <X size={13} />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${tab === 'GIF' ? 'GIFs' : 'Stickers'}…`}
            className="w-full pl-7 pr-3 py-1.5 bg-white/6 border border-white/8 rounded-xl text-[11px] text-white placeholder-white/22 outline-none focus:border-white/18 transition-colors"
            autoFocus
          />
        </div>
        {intimate && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
            {ROMANTIC_CHIPS.map(c => (
              <button key={c} onClick={() => setQuery(c)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                  query === c ? 'bg-rose-500/30 text-rose-200' : 'bg-white/5 text-white/40 hover:text-white'
                }`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GIF/sticker grid (custom, reliable) */}
      <div className="px-2 pb-2 overflow-y-auto custom-scrollbar" style={{ height: 220 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white/40" /></div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-6">
            <p className="text-[11px] font-bold text-white/55">Couldn't load {tab === 'GIF' ? 'GIFs' : 'stickers'}</p>
            <button onClick={() => setDebouncedQuery(q => q + ' ')} className="text-[10px] text-rose-300 font-bold">Tap to retry</button>
          </div>
        ) : gifs.length === 0 ? (
          <div className="h-full flex items-center justify-center"><p className="text-[11px] text-white/35">No results</p></div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {gifs.map(g => (
              <button key={g.id} onClick={e => handleGifClick(g, e)}
                className="relative rounded-lg overflow-hidden bg-white/5 aspect-square hover:ring-2 hover:ring-rose-400/50 active:scale-95 transition-all">
                <img src={g.images?.fixed_width_small?.url || g.images?.fixed_width?.url || g.images?.downsized?.url}
                  alt={g.title || 'gif'} loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GIPHY attribution (required by ToS) */}
      <div className="px-3 py-1.5 border-t border-white/5 flex items-center justify-center">
        <span className="text-[7px] text-white/18 font-bold uppercase tracking-widest">
          Powered by GIPHY
        </span>
      </div>
    </motion.div>
  );
};

export default GifStickerPicker;
