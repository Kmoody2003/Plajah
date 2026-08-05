import React, { useEffect, useRef, useState } from 'react';
import { Send, Lock } from 'lucide-react';
import { SanctuaryChatMessage } from '../../types';
import { listenToSanctuaryChat, sendSanctuaryChat } from '../../services/sanctuaryService';
import { auth } from '../../services/firebase';
import { SANCTUARY_THEME } from './SanctuaryIdentity';

export interface SanctuaryChatChannel { id?: string; label: string; canAccess: boolean; }

// Members lounge with optional tier-scoped channels. When the viewer lacks access
// to the active channel, the composer is locked with a clear reason.
const SanctuaryChat: React.FC<{
  sanctuaryId: string;
  canChat: boolean;               // access to the default lounge
  lockReason?: string;
  channels?: SanctuaryChatChannel[];
}> = ({ sanctuaryId, canChat, lockReason = 'Join a tier to enter the lounge', channels }) => {
  const [msgs, setMsgs] = useState<SanctuaryChatMessage[]>([]);
  const [text, setText] = useState('');
  const [channelId, setChannelId] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => listenToSanctuaryChat(sanctuaryId, setMsgs, channelId), [sanctuaryId, channelId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const activeChannel = channels?.find(c => c.id === channelId);
  const canPost = channels ? !!activeChannel?.canAccess : canChat;

  const send = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    await sendSanctuaryChat(sanctuaryId, body, channelId);
  };

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}`, height: 460 }}>
      {channels && channels.length > 1 && (
        <div className="flex items-center gap-1 p-2 border-b border-white/8 overflow-x-auto scrollbar-hide">
          {channels.map(ch => {
            const active = ch.id === channelId;
            return (
              <button key={ch.id ?? 'lounge'} onClick={() => setChannelId(ch.id)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                style={active ? { color: '#000', background: SANCTUARY_THEME.gold } : { color: 'rgba(255,255,255,0.45)' }}>
                {!ch.canAccess && <Lock size={9} />} {ch.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
        {msgs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">The lounge is quiet</p>
            <p className="text-[9px] text-white/15">Be the first to say something</p>
          </div>
        ) : msgs.map(m => {
          const mine = m.senderId === uid;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <img src={m.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.senderId}`} className="w-6 h-6 rounded-full border border-white/10 shrink-0" alt="" />
              <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                <span className="text-[8px] text-white/25 uppercase tracking-widest px-1 mb-0.5">{mine ? 'You' : m.senderName}</span>
                <div className="px-3 py-2 rounded-2xl text-[13px] leading-snug"
                  style={mine
                    ? { background: SANCTUARY_THEME.goldSheen, color: SANCTUARY_THEME.goldSoft, border: `1px solid ${SANCTUARY_THEME.line}` }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)' }}>
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {canPost ? (
        <div className="flex items-center gap-2 p-3 border-t border-white/8">
          <input
            value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder={activeChannel ? `Message ${activeChannel.label}…` : 'Message the lounge…'}
            className="flex-1 bg-black/40 border border-white/10 rounded-full px-4 py-2 text-sm outline-none focus:border-white/25"
          />
          <button onClick={send} disabled={!text.trim()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-black disabled:opacity-30 shrink-0" style={{ background: SANCTUARY_THEME.gold }}>
            <Send size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 p-4 border-t border-white/8 text-[10px] font-black uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft }}>
          <Lock size={13} style={{ color: SANCTUARY_THEME.gold }} /> {activeChannel && !activeChannel.canAccess ? `${activeChannel.label} is tier-locked` : lockReason}
        </div>
      )}
    </div>
  );
};

export default SanctuaryChat;
