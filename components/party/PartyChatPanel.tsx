// PartyChatPanel — the party room: chat, polls and the room's energy in ONE panel.
//
//   layout "side"   fixed to the right edge, opaque, full height (desktop). While open it publishes its
//                   width as `--party-chat-w` on <html> so in-flow surfaces (Cinema) can make room.
//   layout "inline" a block in the page flow (phones): the chat sits right under the player, big enough
//                   to read and type in without covering the transport controls.
//
// Everything a message/reaction/vote carries is stamped with the playhead (`atSec`) and track, which is
// what the energy graph and Music Intelligence's audience sentiment are made from.
// Shared by PartyBar (watch / listen / read-along) and the Cinema watch-party theater.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Image as ImageIcon, Send, Smile, X } from 'lucide-react';
import type { UseParty } from '../../hooks/useParty';
import {
  PARTY_CHAT_MAX, PARTY_EMOJIS, PartyChatMessage, PartyMoment, listenPartyChat, listenPartyEnergy, listenPartyPolls,
  sendPartyChat, sendPartyReaction, tsToMs,
} from '../../services/partyService';
import { PartyPoll, bucketEnergy, formatMoment, pollVisible, type EnergyEvent } from '../../services/partyEngagement';
import { auth } from '../../services/backendService';
import { useSocialSafety } from '../../hooks/useSocialSafety';
import { EmotePicker } from '../emotes/EmotePicker';
import { EmoteGlyph } from '../emotes/EmoteGlyph';
import GifStickerPicker from '../GifStickerPicker';
import { emoteByCode, emoteById } from '../../services/emotes/emoteLibrary';
import { isEmoteOnly, parseEmoteText } from '../../services/emotes/emoteEngine';
import { rememberRecent, useEmoteShelf } from '../../services/emotes/emoteShelf';
import { PartyPollCard, PartyPollComposer } from './PartyPolls';
import PartyEnergyGraph from './PartyEnergyGraph';
import { partyToast } from './partyToast';

export const PARTY_CHAT_PANEL_W = 340;

export interface PartyTrackMeta { id: string; title: string; durationSec?: number }

export interface PartyChatPanelProps {
  partyId: string;
  party: UseParty;
  /** party createdAt (ms) — party ids are reused, only this session's chat shows. */
  since?: number;
  onClose?: () => void;
  layout?: 'side' | 'inline';
  /** Where in the content "now" is (listening parties pass the local player; default = the host-synced target). */
  getMoment?: () => PartyMoment;
  /** Album tracks — names the song chips and draws the energy graph (listening parties). */
  tracks?: PartyTrackMeta[];
  /** Reports the visible message count so the opener can show an unread badge. */
  onCount?: (n: number) => void;
}

const Rich: React.FC<{ m: PartyChatMessage }> = ({ m }) => {
  if (m.kind === 'gif' && m.gifUrl) {
    return <img src={m.gifUrl} alt="GIF" loading="lazy" referrerPolicy="no-referrer" className="mt-1 max-h-40 max-w-full rounded-xl" />;
  }
  const segs = parseEmoteText(m.text, c => emoteByCode(c));
  const jumbo = isEmoteOnly(segs);
  return (
    <span className="text-sm text-white/95 break-words">
      {segs.map((s, i) => s.t === 'text'
        ? <React.Fragment key={i}>{s.v}</React.Fragment>
        : <EmoteGlyph key={i} def={s.e} size={jumbo ? 44 : 22} animate={jumbo} className="inline-block align-middle" title={`:${s.code}:`} />)}
    </span>
  );
};

const PartyChatPanel: React.FC<PartyChatPanelProps> = ({ partyId, party, since = 0, onClose, layout = 'side', getMoment, tracks, onCount }) => {
  const me = auth.currentUser?.uid || null;
  const safety = useSocialSafety();
  const hostId = party.party?.hostId;
  const canHost = party.isHost || party.isCoHost;
  const moment = (): PartyMoment => (getMoment ? getMoment() : { trackId: party.playback?.contentId, atSec: party.getTarget().targetPositionSec });
  const now = moment();

  const [chat, setChat] = useState<PartyChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState<null | 'emote' | 'gif'>(null);
  const [composing, setComposing] = useState(false);
  const [graphOpen, setGraphOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const { recent } = useEmoteShelf();

  useEffect(() => {
    setChat([]); setDraft('');
    if (!me) return;
    return listenPartyChat(partyId, setChat);
  }, [partyId, me]);

  const visible = useMemo(
    () => chat.filter(m => !safety.isHidden(m.uid) && (!tsToMs(m.at) || tsToMs(m.at) >= since - 60_000)),
    [chat, safety, since],
  );
  useEffect(() => { onCount?.(visible.length); }, [visible.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [visible.length]);

  useEffect(() => {
    if (layout !== 'side') return;
    const root = document.documentElement;
    root.style.setProperty('--party-chat-w', `${PARTY_CHAT_PANEL_W}px`);
    return () => { root.style.removeProperty('--party-chat-w'); };
  }, [layout]);

  // ── polls ──
  const [polls, setPolls] = useState<PartyPoll[]>([]);
  const pollsRef = useRef<PartyPoll[]>([]);
  pollsRef.current = polls;
  useEffect(() => { if (!me) return; return listenPartyPolls(partyId, setPolls); }, [partyId, me]);
  const livePolls = polls.filter(p => pollVisible(p, { contentId: now.trackId, positionSec: now.atSec ?? 0 }));
  const titleOf = (id?: string) => tracks?.find(t => t.id === id)?.title;

  // ── energy ──
  const [events, setEvents] = useState<EnergyEvent[]>([]);
  useEffect(() => {
    if (!me || !tracks?.length) return;
    return listenPartyEnergy(partyId, setEvents, () => pollsRef.current);
  }, [partyId, me, !!tracks?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const songs = useMemo(() => (tracks || []).map(t => {
    const dur = t.durationSec && t.durationSec > 0 ? t.durationSec : 240;
    return { trackId: t.id, title: t.title, durationSec: dur, series: bucketEnergy(events, t.id, dur), bucketSec: 5 };
  }), [tracks, events]);

  // ── sending ──
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    const emotes = parseEmoteText(t, c => emoteByCode(c));
    const only = isEmoteOnly(emotes) ? emotes.filter(s => s.t === 'emote') : [];
    const extra = only.length === 1 && only[0].t === 'emote'
      ? { kind: 'emote' as const, emoteId: only[0].e.id, moment: moment() }
      : { moment: moment() };
    sendPartyChat(partyId, t, extra).catch(() => { setDraft(t); partyToast('Message not sent', 'warn'); });
  };
  const sendGif = (url: string) => {
    setPicker(null);
    sendPartyChat(partyId, 'GIF', { kind: 'gif', gifUrl: url, moment: moment() }).catch(() => partyToast('GIF not sent', 'warn'));
  };
  const react = (emoji: string, emoteId?: string) => {
    if (!me) { partyToast('Sign in to react', 'info'); return; }
    sendPartyReaction(partyId, emoji, { emoteId, moment: moment() }).catch(() => {});
  };

  const side = layout === 'side';
  return (
    <aside
      className={side
        ? 'fixed top-0 right-0 bottom-0 z-[210] flex flex-col text-white border-l border-white/10 max-w-full'
        : 'relative flex flex-col text-white rounded-2xl border border-white/10 overflow-hidden w-full'}
      style={side
        ? { width: PARTY_CHAT_PANEL_W, background: '#0B0B12', boxShadow: '-12px 0 32px rgba(0,0,0,0.5)' }
        : { height: 'min(56dvh, 520px)', minHeight: 320, background: '#0B0B12' }}
      aria-label="Party chat"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
        <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
          Party chat <span className="text-white/40 normal-case tracking-normal font-bold">· {party.viewerCount} here</span>
        </span>
        <div className="flex items-center gap-1">
          {!!tracks?.length && (
            <button onClick={() => setGraphOpen(o => !o)} aria-label={graphOpen ? 'Hide energy graph' : 'Show energy graph'} className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10">
              {graphOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          {onClose && <button onClick={onClose} aria-label="Close chat" className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10"><X size={16} /></button>}
        </div>
      </div>

      {!!tracks?.length && graphOpen && (
        <div className="px-3 pt-2 pb-1 shrink-0 border-b border-white/5">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Room energy</div>
          <PartyEnergyGraph songs={songs} currentTrackId={now.trackId} currentSec={now.atSec} height={side ? 64 : 48} />
        </div>
      )}

      {(composing || livePolls.length > 0) && (
        <div className="px-3 pt-2 space-y-2 shrink-0 max-h-[46%] overflow-y-auto">
          {composing && <PartyPollComposer partyId={partyId} getMoment={moment} trackTitle={titleOf(now.trackId)} onClose={() => setComposing(false)} />}
          {livePolls.map(p => <PartyPollCard key={p.id} partyId={partyId} poll={p} canHost={canHost} getMoment={moment} />)}
        </div>
      )}

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {!me && <p className="text-xs text-white/50 py-8 text-center">Sign in to chat with the party.</p>}
        {me && !visible.length && <p className="text-xs text-white/50 py-8 text-center">Say hi — everyone in the party sees this.</p>}
        {visible.map(m => {
          const chip = formatMoment(m.atSec);
          const where = m.trackId && m.trackId !== now.trackId ? titleOf(m.trackId) : undefined;
          return (
            <div key={m.id} className="flex items-start gap-2.5">
              {m.photo
                ? <img src={m.photo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                : <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black text-white" style={{ background: 'var(--pj-grad-brand)' }}>{(m.name || '?').charAt(0).toUpperCase()}</span>}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/50 truncate">{m.name}{m.uid === hostId ? ' · host' : ''}</span>
                  {chip && <span className="shrink-0 px-1.5 py-px rounded-full bg-white/10 text-[9px] font-bold text-white/60 tabular-nums" title={where ? `${where} at ${chip}` : `at ${chip}`}>{where ? `${where.slice(0, 14)} · ` : ''}{chip}</span>}
                </div>
                <Rich m={m} />
              </div>
            </div>
          );
        })}
      </div>

      {me && (
        <div className="shrink-0 border-t border-white/10 relative">
          {/* quick reactions: the classic eight + your recent emotes — each lands on the energy graph */}
          <div className="flex items-center gap-1 px-2 pt-2 overflow-x-auto no-scrollbar">
            {PARTY_EMOJIS.map(e => (
              <button key={e} onClick={() => react(e)} aria-label={`React ${e}`} className="shrink-0 w-9 h-9 rounded-xl hover:bg-white/10 text-xl active:scale-90 transition-transform">{e}</button>
            ))}
            {recent.slice(0, 6).map(id => emoteById(id)).filter((d): d is NonNullable<ReturnType<typeof emoteById>> => !!d).map(def => (
              <button key={def.id} onClick={() => react(`:${def.code}:`, def.id)} aria-label={`React ${def.name}`} className="shrink-0 w-9 h-9 rounded-xl hover:bg-white/10 grid place-items-center active:scale-90 transition-transform">
                <EmoteGlyph def={def} size={26} />
              </button>
            ))}
          </div>
          <form className="flex items-center gap-1.5 p-2" onSubmit={e => { e.preventDefault(); send(); }}>
            <button type="button" onClick={() => setPicker(p => (p === 'emote' ? null : 'emote'))} aria-label="Emotes" className="p-2 rounded-full bg-white/10 hover:bg-white/20"><Smile size={16} /></button>
            <button type="button" onClick={() => setPicker(p => (p === 'gif' ? null : 'gif'))} aria-label="GIFs" className="p-2 rounded-full bg-white/10 hover:bg-white/20"><ImageIcon size={16} /></button>
            {canHost && (
              <button type="button" onClick={() => setComposing(c => !c)} aria-label="Create a poll or survey" title="Poll / survey"
                className={`p-2 rounded-full ${composing ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}><BarChart3 size={16} /></button>
            )}
            <input value={draft} onChange={e => setDraft(e.target.value.slice(0, PARTY_CHAT_MAX))} placeholder="Message the party"
              className="flex-1 min-w-0 bg-white/10 rounded-full px-3.5 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 ring-white/20" />
            <button type="submit" disabled={!draft.trim()} className="p-2.5 rounded-full disabled:opacity-40" style={{ background: 'var(--pj-magenta)' }} aria-label="Send"><Send size={14} /></button>
          </form>
          {picker === 'gif' && <GifStickerPicker onSelect={url => sendGif(url)} onClose={() => setPicker(null)} anchorClass={side ? 'bottom-full mb-2 left-2' : '!fixed bottom-4 left-1/2 -translate-x-1/2'} />}
        </div>
      )}
      {picker === 'emote' && me && (
        <EmotePicker mode="insert" onClose={() => setPicker(null)} onPick={def => { rememberRecent(def.id); setDraft(d => `${d}${d && !d.endsWith(' ') ? ' ' : ''}:${def.code}: `.slice(0, PARTY_CHAT_MAX)); setPicker(null); }} />
      )}
    </aside>
  );
};

export default PartyChatPanel;
