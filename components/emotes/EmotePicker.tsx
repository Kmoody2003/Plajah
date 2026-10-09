// EmotePicker — the full emote library as a bottom sheet: search, favourites + recents, a tab per
// pack (Classics, Lorik & Lumi, the six council collections, the creator's channel emotes).
// Tap = send (or insert into chat). Long-press / right-click = favourite. Locked emotes say why.

import React, { useMemo, useRef, useState } from 'react';
import { Lock, Search, Star, X } from 'lucide-react';
import type { EmoteDef, EmotePackId } from '../../services/emotes/emoteTypes';
import { EMOTE_PACKS, emoteById, searchEmotes } from '../../services/emotes/emoteLibrary';
import { ACCESS_LABEL, canUseEmote, type ViewerAccess } from '../../services/emotes/emoteEngine';
import { toggleFavorite, useEmoteShelf } from '../../services/emotes/emoteShelf';
import { EmoteGlyph } from './EmoteGlyph';

export interface EmotePickerProps {
  onPick: (def: EmoteDef) => void;
  onClose: () => void;
  channelEmotes?: EmoteDef[];
  channelName?: string;
  access?: ViewerAccess;
  hiddenPacks?: EmotePackId[];
  /** 'send' fires on the stream; 'insert' types the code into chat. Only changes the hint text. */
  mode?: 'send' | 'insert';
}

type Tab = 'shelf' | EmotePackId;

export const EmotePicker: React.FC<EmotePickerProps> = ({ onPick, onClose, channelEmotes = [], channelName, access = {}, hiddenPacks = [], mode = 'send' }) => {
  const { recent, favorites } = useEmoteShelf();
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const packs = useMemo(() => {
    const base = EMOTE_PACKS.filter(p => !hiddenPacks.includes(p.id));
    return channelEmotes.length ? [{ id: 'channel' as const, name: channelName ? `${channelName}` : 'Channel', blurb: 'This creator’s own emotes.', icon: channelEmotes[0].id, emotes: channelEmotes }, ...base] : base;
  }, [channelEmotes, channelName, hiddenPacks]);
  const [tab, setTab] = useState<Tab>(favorites.length || recent.length ? 'shelf' : packs[0]?.id ?? 'core');
  const pool = useMemo(() => packs.flatMap(p => p.emotes), [packs]);

  const shelf = useMemo(() => {
    const fav = favorites.map(id => emoteById(id)).filter(Boolean) as EmoteDef[];
    const rec = recent.map(id => emoteById(id)).filter((e): e is EmoteDef => !!e && !favorites.includes(e.id));
    return { fav, rec };
  }, [favorites, recent]);

  const longPress = useRef<{ t: ReturnType<typeof setTimeout> | null; fired: boolean }>({ t: null, fired: false });
  const startPress = (id: string) => {
    longPress.current.fired = false;
    longPress.current.t = setTimeout(() => { longPress.current.fired = true; toggleFavorite(id); navigator.vibrate?.(12); }, 480);
  };
  const endPress = () => { if (longPress.current.t) clearTimeout(longPress.current.t); longPress.current.t = null; };

  const cell = (e: EmoteDef) => {
    const ok = canUseEmote(e, access);
    const fav = favorites.includes(e.id);
    return (
      <button
        key={e.id}
        type="button"
        onPointerDown={() => startPress(e.id)}
        onPointerUp={endPress}
        onPointerLeave={() => { endPress(); setHover(h => (h === e.id ? null : h)); }}
        onPointerEnter={() => setHover(e.id)}
        onContextMenu={ev => { ev.preventDefault(); toggleFavorite(e.id); }}
        onClick={() => { if (longPress.current.fired) return; if (ok) onPick(e); }}
        aria-label={`${e.name}${ok ? '' : ` (${ACCESS_LABEL[e.access ?? 'everyone']})`}`}
        className={`relative aspect-square rounded-2xl flex items-center justify-center transition-transform active:scale-90 ${ok ? 'hover:bg-white/[0.08]' : 'opacity-40'}`}
      >
        <EmoteGlyph def={e} size={44} animate={hover === e.id} title={`:${e.code}:`} />
        {!ok && <Lock className="absolute bottom-1 right-1 w-3 h-3 text-white/80" />}
        {fav && <Star className="absolute top-1 right-1 w-2.5 h-2.5 text-amber-300 fill-amber-300" />}
      </button>
    );
  };

  const results = q.trim() ? searchEmotes(q, pool, 80) : null;
  const active = packs.find(p => p.id === tab);
  const hovered = hover ? emoteById(hover) : null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-[60] flex flex-col max-h-[62%] rounded-t-[28px] bg-[#120a1c]/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.5)]"
      onClick={e => e.stopPropagation()} role="dialog" aria-label="Emotes">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="flex-1 flex items-center gap-2 h-10 rounded-full bg-white/[0.07] px-3">
          <Search className="w-4 h-4 text-white/50" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search emotes  (or type :code: in chat)"
            className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 outline-none" />
        </div>
        <button type="button" onClick={onClose} aria-label="Close emotes" className="w-10 h-10 rounded-full bg-white/[0.07] flex items-center justify-center text-white/80"><X className="w-4 h-4" /></button>
      </div>

      {!results && (
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto no-scrollbar" role="tablist">
          {(shelf.fav.length || shelf.rec.length) ? (
            <button type="button" role="tab" aria-selected={tab === 'shelf'} onClick={() => setTab('shelf')}
              className={`shrink-0 h-10 px-3 rounded-full flex items-center gap-1.5 text-[12px] font-bold ${tab === 'shelf' ? 'bg-white text-black' : 'bg-white/[0.06] text-white/75'}`}>
              <Star className="w-3.5 h-3.5" /> Yours
            </button>
          ) : null}
          {packs.map(p => {
            const icon = emoteById(p.icon) ?? p.emotes[0];
            return (
              <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} onClick={() => setTab(p.id)} title={p.blurb}
                className={`shrink-0 h-10 pl-1.5 pr-3 rounded-full flex items-center gap-1.5 text-[12px] font-bold whitespace-nowrap ${tab === p.id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/75'}`}>
                {icon && <EmoteGlyph def={icon} size={28} />} {p.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-[180px]">
        {results ? (
          results.length ? <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">{results.map(cell)}</div>
            : <p className="text-center text-white/45 text-sm py-10">No emotes match “{q}”.</p>
        ) : tab === 'shelf' ? (
          <>
            {shelf.fav.length > 0 && <><p className="text-[11px] uppercase tracking-wider text-white/40 px-1 pt-1 pb-1.5">Favourites</p><div className="grid grid-cols-6 sm:grid-cols-8 gap-1">{shelf.fav.map(cell)}</div></>}
            {shelf.rec.length > 0 && <><p className="text-[11px] uppercase tracking-wider text-white/40 px-1 pt-3 pb-1.5">Recent</p><div className="grid grid-cols-6 sm:grid-cols-8 gap-1">{shelf.rec.map(cell)}</div></>}
          </>
        ) : active ? (
          <>
            <p className="text-[12px] text-white/50 px-1 pb-2">{active.blurb}</p>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">{active.emotes.map(cell)}</div>
          </>
        ) : null}
      </div>

      <div className="h-9 px-4 flex items-center gap-2 border-t border-white/[0.06] text-[11px] text-white/45">
        {hovered ? <><EmoteGlyph def={hovered} size={20} /> <span className="text-white/80 font-semibold">{hovered.name}</span> <code className="text-white/45">:{hovered.code}:</code></>
          : <span>{mode === 'send' ? 'Tap to send · hold the tray button to spam · long-press to favourite' : 'Tap to add to your message · long-press to favourite'}</span>}
      </div>
    </div>
  );
};

export default EmotePicker;
