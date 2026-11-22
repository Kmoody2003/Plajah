// components/phone/SmsViews.tsx — carrier text threads + one conversation. Used by the
// PhoneHub Messages tab and by Chat's "Texts" tab, so texting sits next to Plajah DMs.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, MessageSquareText, Phone, Send, Trash2, Video, AlertCircle, Smartphone } from 'lucide-react';
import { displayPhone as formatPhone } from '../../services/phone/phoneNumber';
import type { MergedPerson } from '../../services/phone/contactsMerge';
import { onTelecom, telecom, threadTitle, type SmsMessage, type SmsThread } from '../../services/phone/telecom';

export function timeLabel(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - ms) / 86400000;
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const PersonAvatar: React.FC<{ name: string; photoUrl?: string; size?: number; plajah?: boolean }> = ({ name, photoUrl, size = 44, plajah }) => {
  const initials = (name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {photoUrl
        ? <img src={photoUrl} alt="" className="w-full h-full rounded-2xl object-cover border border-white/10" loading="lazy" />
        : <div className="w-full h-full rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.03] border border-white/10 grid place-items-center text-white/60 font-black" style={{ fontSize: size * 0.34 }}>{initials}</div>}
      {plajah && <span title="On Plajah" className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-small-orange border-2 border-black" />}
    </div>
  );
};

export const SmsBadge: React.FC = () => (
  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[7px] font-black uppercase tracking-widest">
    <Smartphone size={8} /> SMS
  </span>
);

export const SmsThreadRow: React.FC<{
  thread: SmsThread;
  lookup: (n: string) => MergedPerson | undefined;
  active?: boolean;
  onOpen: () => void;
}> = ({ thread, lookup, active, onOpen }) => {
  const person = thread.addresses.length === 1 ? lookup(thread.addresses[0]) : undefined;
  const title = threadTitle(thread, n => lookup(n)?.name || formatPhone(n));
  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}
    >
      <PersonAvatar name={title} photoUrl={person?.photoUrl} plajah={!!person?.plajah} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm ${thread.unread ? 'font-black text-white' : 'font-semibold text-white/80'}`}>{title}</span>
          <SmsBadge />
          <span className="ml-auto text-[10px] text-white/30 flex-shrink-0">{timeLabel(thread.date)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`truncate text-xs ${thread.unread ? 'text-white/70' : 'text-white/35'}`}>{thread.hasAttachment && !thread.snippet ? 'Picture message' : thread.snippet}</span>
          {thread.unreadCount > 0 && <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-small-orange text-black text-[10px] font-black grid place-items-center">{thread.unreadCount}</span>}
        </div>
      </div>
    </button>
  );
};

export const SmsConversation: React.FC<{
  threadId?: string;
  addresses: string[];
  initialBody?: string;
  lookup: (n: string) => MergedPerson | undefined;
  onBack?: () => void;
  onCall?: (number: string) => void;
  onPlajahCall?: (uid: string, video: boolean) => void;
  onDeleted?: () => void;
  onChanged?: () => void;
}> = ({ threadId: initialThreadId, addresses, initialBody, lookup, onBack, onCall, onPlajahCall, onDeleted, onChanged }) => {
  const [threadId, setThreadId] = useState(initialThreadId || '');
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [body, setBody] = useState(initialBody || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const person = addresses.length === 1 ? lookup(addresses[0]) : undefined;
  const title = addresses.map(a => lookup(a)?.name || formatPhone(a)).join(', ') || 'New message';

  const load = useCallback(async () => {
    try {
      const res = await telecom.messages(threadId ? { threadId, limit: 120 } : { addresses, limit: 120 });
      setMessages(res.messages);
      if (res.threadId && res.threadId !== threadId) setThreadId(res.threadId);
      if (res.threadId) { telecom.markThreadRead(res.threadId).then(() => onChanged?.()).catch(() => {}); }
    } catch (e: any) { setError(e?.message || 'Could not load texts'); }
  }, [threadId, addresses.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off1 = onTelecom('sms', () => load());
    const off2 = onTelecom('smsStatus', () => load());
    return () => { off1(); off2(); };
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending || !addresses.length) return;
    setSending(true); setError(null);
    try {
      const res = await telecom.sendSms(addresses, text);
      setBody('');
      if (res.threadId) setThreadId(res.threadId);
      await load();
      onChanged?.();
    } catch (e: any) { setError(e?.message || 'Send failed'); }
    finally { setSending(false); }
  };

  const del = async () => {
    if (!threadId || !confirm('Delete this whole conversation from this phone? This cannot be undone.')) return;
    await telecom.deleteThread(threadId);
    onDeleted?.();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.06]">
        {onBack && <button onClick={onBack} className="p-2 -ml-1 text-white/50 hover:text-white rounded-xl"><ChevronLeft size={18} /></button>}
        <PersonAvatar name={title} photoUrl={person?.photoUrl} size={36} plajah={!!person?.plajah} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white truncate">{title}</div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 font-black flex items-center gap-1"><Smartphone size={9} /> Carrier text · stays on this phone</div>
        </div>
        {addresses.length === 1 && onCall && <button onClick={() => onCall(addresses[0])} title="Phone call" className="p-2 text-white/50 hover:text-white rounded-xl"><Phone size={17} /></button>}
        {person?.plajah && onPlajahCall && <button onClick={() => onPlajahCall(person.plajah!.uid, true)} title="Plajah video call" className="p-2 text-small-orange/80 hover:text-small-orange rounded-xl"><Video size={17} /></button>}
        {threadId && <button onClick={del} title="Delete conversation" className="p-2 text-white/30 hover:text-red-400 rounded-xl"><Trash2 size={16} /></button>}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-1.5">
        {messages.length === 0 && (
          <div className="py-16 text-center text-white/25 text-xs"><MessageSquareText className="mx-auto mb-3 text-white/10" size={30} />No texts yet</div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showTime = !prev || m.date - prev.date > 15 * 60 * 1000;
          return (
            <React.Fragment key={m.id}>
              {showTime && <div className="text-center text-[10px] text-white/25 py-2">{new Date(m.date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
              <div className={`flex ${m.outgoing ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.outgoing ? 'bg-emerald-600/80 text-white rounded-br-md' : 'bg-white/[0.07] text-white/90 rounded-bl-md'}`}>
                  {m.media?.map(md => md.mimeType.startsWith('image/')
                    ? <img key={md.url} src={md.url} alt="" className="rounded-xl mb-1 max-h-64 object-cover" loading="lazy" />
                    : md.mimeType.startsWith('video/')
                      ? <video key={md.url} src={md.url} controls className="rounded-xl mb-1 max-h-64" />
                      : <audio key={md.url} src={md.url} controls className="mb-1" />)}
                  {m.body}
                  {m.outgoing && m.status !== 'sent' && (
                    <div className={`text-[9px] mt-0.5 font-bold ${m.status === 'failed' ? 'text-red-200' : 'text-white/60'}`}>{m.status === 'failed' ? 'Not sent' : 'Sending…'}</div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2"><AlertCircle size={13} /> {error}</div>}
      <div className="shrink-0 p-2.5 border-t border-white/[0.06] flex items-end gap-2" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder="Text message"
          className="flex-1 resize-none max-h-32 bg-white/[0.05] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-500/40"
        />
        <button onClick={send} disabled={!body.trim() || sending} className="w-10 h-10 rounded-full bg-emerald-500 disabled:bg-white/10 text-black disabled:text-white/30 grid place-items-center transition-all">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};
