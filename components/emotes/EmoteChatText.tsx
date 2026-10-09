// EmoteChatText — chat text with `:code:` emotes rendered inline; emote-only messages go jumbo.
// EmoteSuggest — the autocomplete strip shown above the chat input while typing `:fi…`.

import React, { useMemo } from 'react';
import type { EmoteDef } from '../../services/emotes/emoteTypes';
import { emoteByCode, emoteForUnicode, searchEmotes, ALL_EMOTES } from '../../services/emotes/emoteLibrary';
import { emoteQueryAt, isEmoteOnly, parseEmoteText } from '../../services/emotes/emoteEngine';
import { EmoteGlyph } from './EmoteGlyph';

export const EmoteChatText: React.FC<{ text: string; channelEmotes?: EmoteDef[]; size?: number; className?: string }> = ({ text, channelEmotes, size = 22, className }) => {
  const segs = useMemo(() => {
    // a bare legacy emoji message ("🔥") renders as the library emote
    const legacy = text.trim().length <= 8 ? emoteForUnicode(text.trim()) : null;
    if (legacy) return [{ t: 'emote' as const, e: legacy, code: legacy.code }];
    return parseEmoteText(text, c => emoteByCode(c, channelEmotes));
  }, [text, channelEmotes]);
  const jumbo = isEmoteOnly(segs) && segs.filter(s => s.t === 'emote').length <= 3;
  return (
    <span className={className}>
      {segs.map((s, i) => s.t === 'text'
        ? <React.Fragment key={i}>{s.v}</React.Fragment>
        : <EmoteGlyph key={i} def={s.e} size={jumbo ? size * 2 : size} animate={jumbo} style={{ margin: jumbo ? '2px 2px' : '-4px 1px 0' }} />)}
    </span>
  );
};

export const EmoteSuggest: React.FC<{ text: string; caret: number; onPick: (def: EmoteDef) => void; channelEmotes?: EmoteDef[] }> = ({ text, caret, onPick, channelEmotes = [] }) => {
  const q = emoteQueryAt(text, caret);
  const hits = useMemo(() => (q ? searchEmotes(q.query, [...channelEmotes, ...ALL_EMOTES()], 8) : []), [q?.query, channelEmotes]);
  if (!q || !hits.length) return null;
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar px-1 py-1 rounded-2xl bg-black/70 backdrop-blur border border-white/10" role="listbox" aria-label="Emote suggestions">
      {hits.map(e => (
        <button key={e.id} type="button" role="option" aria-selected={false}
          onPointerDown={ev => { ev.preventDefault(); onPick(e); }}
          className="shrink-0 h-9 pl-1 pr-2 rounded-xl flex items-center gap-1 text-[11px] text-white/80 hover:bg-white/10">
          <EmoteGlyph def={e} size={26} /> :{e.code}:
        </button>
      ))}
    </div>
  );
};

export default EmoteChatText;
