// components/phone/RcsViews.tsx — RCS conversations mirrored from Google / Samsung Messages
// notifications (android/.../telecom/RcsBridge.kt). Shown next to SMS in the PhoneHub and Chat.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, Send, Trash2 } from 'lucide-react';
import { onTelecom, telecom, type RcsBridgeStatus, type RcsMessage, type RcsThread } from '../../services/phone/telecom';
import { PersonAvatar, timeLabel } from './SmsViews';

export const RcsBadge: React.FC = () => (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/25 text-sky-300 text-[7px] font-black uppercase tracking-widest">RCS</span>
);

/** Plain-language limits, shown wherever RCS appears. */
export const RCS_LIMITS = 'Mirrored from Google Messages notifications: new messages only (no history), text only, and you can reply while the notification is still showing.';

export const RcsThreadRow: React.FC<{ thread: RcsThread; photoUrl?: string; plajah?: boolean; active?: boolean; onOpen: () => void }> = ({ thread, photoUrl, plajah, active, onOpen }) => (
  <button onClick={onOpen} className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}>
    <PersonAvatar name={thread.title} photoUrl={photoUrl} plajah={plajah} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`truncate text-sm ${thread.unreadCount ? 'font-black text-white' : 'font-semibold text-white/80'}`}>{thread.title}</span>
        <RcsBadge />
        <span className="ml-auto text-[10px] text-white/30 flex-shrink-0">{timeLabel(thread.date)}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className={`truncate text-xs ${thread.unreadCount ? 'text-white/70' : 'text-white/35'}`}>{thread.snippet}</span>
        {thread.unreadCount > 0 && <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-sky-400 text-black text-[10px] font-black grid place-items-center">{thread.unreadCount}</span>}
      </div>
    </div>
  </button>
);

const MEDIA_RE = /^\[(image|video|audio)\]$/;

export const RcsConversation: React.FC<{ thread: RcsThread; onBack?: () => void; onDeleted?: () => void; onChanged?: () => void }> = ({ thread, onBack, onDeleted, onChanged }) => {
  const [messages, setMessages] = useState<RcsMessage[]>([]);
  const [canReply, setCanReply] = useState(thread.canReply);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await telecom.rcsMessages(thread.threadKey);
    setMessages(r.messages);
    setCanReply(r.canReply);
    telecom.rcsMarkRead(thread.threadKey).then(() => onChanged?.()).catch(() => {});
  }, [thread.threadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => onTelecom('rcsMessage', (e: { threadKey: string }) => { if (e.threadKey === thread.threadKey) load(); }), [load, thread.threadKey]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setError(null);
    const ok = await telecom.rcsReply(thread.threadKey, text);
    if (ok) { setBody(''); load(); onChanged?.(); }
    else {
      setCanReply(false);
      setError("That conversation's notification is gone, so Plajah can't reply. Reply in Google Messages, or wait for their next message.");
    }
  };

  const remove = async () => {
    if (!confirm('Remove this mirrored conversation from Plajah? It stays in Google Messages.')) return;
    await telecom.rcsDelete(thread.threadKey);
    onDeleted?.();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.06]">
        {onBack && <button onClick={onBack} className="p-2 -ml-1 text-white/50 hover:text-white rounded-xl"><ChevronLeft size={18} /></button>}
        <PersonAvatar name={thread.title} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white truncate flex items-center gap-2">{thread.title} <RcsBadge /></div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 font-black">Via {thread.source === 'samsung' ? 'Samsung' : 'Google'} Messages · stays on this phone</div>
        </div>
        <button onClick={remove} title="Remove from Plajah" className="p-2 text-white/30 hover:text-red-400 rounded-xl"><Trash2 size={16} /></button>
      </div>
      <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-sky-500/[0.07] border border-sky-500/15 text-sky-200/70 text-[11px] leading-snug">{RCS_LIMITS}</div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-1.5">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.outgoing ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.outgoing ? 'bg-sky-600/80 text-white rounded-br-md' : 'bg-white/[0.07] text-white/90 rounded-bl-md'}`}>
              {thread.isGroup && !m.outgoing && <div className="text-[10px] font-black text-sky-300/80 mb-0.5">{m.sender}</div>}
              {MEDIA_RE.test(m.body)
                ? <span className="italic text-white/50">{m.body.slice(1, -1)}: open Google Messages to see it</span>
                : m.body}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2"><AlertCircle size={13} /> {error}</div>}
      <div className="shrink-0 p-2.5 border-t border-white/[0.06] flex items-end gap-2" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          disabled={!canReply}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder={canReply ? 'RCS reply' : 'You can reply when a new message arrives'}
          className="flex-1 resize-none max-h-32 bg-white/[0.05] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-sky-500/40 disabled:opacity-50"
        />
        <button onClick={send} disabled={!body.trim() || !canReply} className="w-10 h-10 rounded-full bg-sky-500 disabled:bg-white/10 text-black disabled:text-white/30 grid place-items-center"><Send size={16} /></button>
      </div>
    </div>
  );
};

/**
 * Turning RCS on. Google Messages only does RCS while IT is the default SMS app, so this is a
 * choice against Plajah holding the SMS role. The card says so and links to both settings.
 */
export const RcsSetupCard: React.FC<{ status: RcsBridgeStatus | null; plajahIsDefaultSms: boolean; onDone: () => void }> = ({ status, plajahIsDefaultSms, onDone }) => {
  if (!status?.available || status.enabled || (!status.googleMessagesInstalled && !status.samsungMessagesInstalled)) return null;
  return (
    <div className="m-2 p-3.5 rounded-2xl bg-sky-500/[0.07] border border-sky-500/20 space-y-2">
      <div className="text-xs font-black text-sky-200 flex items-center gap-1.5">RCS chats in Plajah <RcsBadge /></div>
      <p className="text-[11px] text-white/50 leading-snug">{RCS_LIMITS} Needs Notification access.</p>
      {plajahIsDefaultSms && (
        <p className="text-[11px] text-amber-200/80 leading-snug">
          RCS only works while Google Messages is your texting app. Plajah is your texting app right now, so switch the default back to Google Messages first. Your texts keep showing in Plajah through the bridge.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {plajahIsDefaultSms && (
          <button onClick={async () => { await telecom.openDefaultApps(); onDone(); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[9px] font-black uppercase tracking-widest">Default apps</button>
        )}
        <button onClick={async () => { await telecom.openNotificationAccess(); onDone(); }} className="px-3 py-1.5 rounded-lg bg-sky-500 text-black text-[9px] font-black uppercase tracking-widest">Allow notification access</button>
      </div>
    </div>
  );
};
