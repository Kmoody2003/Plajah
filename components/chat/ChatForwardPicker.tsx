import React, { useEffect, useMemo, useState } from 'react';
import { Forward, Search, X, Hash, User } from 'lucide-react';
import Portal from '../Portal';
import { UserAvatar } from '../avatar/UserAvatar';
import { auth, listenToChatRooms, fetchUserProfiles } from '../../services/backendService';
import { forwardMessage } from '../../services/chat/chatActions';
import type { ChatMessage, ChatRoom, UserProfile } from '../../types';

interface Props {
  /** The message as shown (text already decrypted). */
  message: ChatMessage;
  currentRoomId: string;
  onClose: () => void;
  onForwarded: (roomName: string) => void;
}

/** Pick a conversation to forward a message into. */
const ChatForwardPicker: React.FC<Props> = ({ message, currentRoomId, onClose, onForwarded }) => {
  const uid = auth.currentUser?.uid;
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => listenToChatRooms(setRooms), []);

  const postable = useMemo(() => rooms.filter(r =>
    r.id !== currentRoomId && r.type !== 'PUBLIC_LIVE' && (r as any).type !== 'SYSTEM_INBOX' &&
    ((r as any).postingPolicy !== 'PRODUCTION_LEADS' || (!!uid && ((r as any).productionLeadUids || []).includes(uid)))
  ), [rooms, currentRoomId, uid]);

  useEffect(() => {
    const others = Array.from(new Set(postable.filter(r => r.type === 'PRIVATE')
      .map(r => r.participants.find(p => p !== uid)).filter((p): p is string => !!p && !profiles[p])));
    if (!others.length) return;
    fetchUserProfiles(others).then(ps => setProfiles(prev => {
      const next = { ...prev };
      ps.forEach(p => { next[p.uid] = p; });
      return next;
    })).catch(() => {});
  }, [postable]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (r: ChatRoom) => {
    if (r.type === 'PRIVATE') {
      const other = r.participants.find(p => p !== uid);
      return (other && profiles[other]?.displayName) || 'Direct message';
    }
    return r.name || 'Group chat';
  };

  const shown = postable.filter(r => !query.trim() || nameOf(r).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60);

  const send = async (r: ChatRoom) => {
    if (busyId) return;
    setBusyId(r.id);
    setError('');
    try {
      await forwardMessage(r.id, message as any);
      onForwarded(nameOf(r));
    } catch (e: any) {
      setError(e?.message || 'That did not forward. Try again.');
      setBusyId(null);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Forward message">
        <div className="w-full max-w-sm max-h-[80vh] flex flex-col rounded-2xl bg-[#121212] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <Forward size={15} className="text-small-orange" />
            <h2 className="text-xs font-black uppercase tracking-widest text-white flex-1">Forward to…</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-white/10"><X size={15} /></button>
          </div>
          <div className="px-4 pt-3">
            <p className="text-[11px] text-white/50 truncate mb-2">“{message.text || message.attachment?.name || 'Media'}”</p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input id="forward-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search conversations"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-small-orange/40" />
            </div>
            {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
          </div>
          <div className="flex-1 overflow-y-auto p-2 mt-2">
            {shown.map(r => {
              const other = r.type === 'PRIVATE' ? r.participants.find(p => p !== uid) : undefined;
              const photo = other ? profiles[other]?.photoURL : undefined;
              return (
                <button key={r.id} onClick={() => send(r)} disabled={!!busyId}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] disabled:opacity-50 text-left transition-colors">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 grid place-items-center shrink-0">
                    {photo ? <UserAvatar uid={other} src={photo} alt="" className="w-full h-full object-cover" />
                      : r.type === 'PRIVATE' ? <User size={13} className="text-white/40" /> : <Hash size={13} className="text-white/40" />}
                  </div>
                  <span className="flex-1 min-w-0 text-sm text-white truncate">{nameOf(r)}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-small-orange">{busyId === r.id ? 'Sending…' : 'Send'}</span>
                </button>
              );
            })}
            {!shown.length && <p className="text-[12px] text-white/40 text-center py-8">No conversations match.</p>}
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default ChatForwardPicker;
