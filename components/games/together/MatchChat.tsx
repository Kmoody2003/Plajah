// Chat for a match (players), its spectators, or a party. Polls the server about every 2 s while open (slower
// while collapsed). Quick-chat row for everyone; the text box is hidden for child accounts. Per-device mute
// and a Report action on other people's lines.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Send, MoreHorizontal } from 'lucide-react';
import type { ChatLine, QuickChat, ScopeAccess } from '../../../services/gamerNet/chat';
import { chat, failed, mutedSet, setMuted, myUid } from '../../../services/gamerNet/togetherClient';
import { GT_CSS } from './togetherCss';

const OPEN_MS = 2000, CLOSED_MS = 8000, MAX_KEEP = 120;

export function MatchChat({ scope, title = 'Chat', startOpen = true }: { scope: string; title?: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [access, setAccess] = useState<ScopeAccess | null>(null);
  const [quick, setQuick] = useState<QuickChat[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [muted, setMutedState] = useState<Set<string>>(() => mutedSet());
  const seq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open); openRef.current = open;
  const me = myUid();

  const pull = useCallback(async () => {
    const r = await chat.read(scope, seq.current);
    if (failed(r)) { if (r.httpStatus === 403) setAccess({ read: false, post: false, quickOnly: true, reason: r.error }); return; }
    setAccess(r.access); if (r.quick?.length) setQuick(r.quick);
    if (r.lines.length) {
      seq.current = Math.max(seq.current, r.seq);
      setLines(prev => [...prev, ...r.lines.filter(l => !prev.some(p => p.id === l.id))].slice(-MAX_KEEP));
      if (!openRef.current) setUnread(n => n + r.lines.filter(l => l.uid !== me).length);
    } else seq.current = Math.max(seq.current, r.seq);
  }, [scope, me]);

  useEffect(() => { seq.current = 0; setLines([]); setUnread(0); }, [scope]);
  useEffect(() => {
    let alive = true; let t: ReturnType<typeof setTimeout>;
    const loop = async () => { if (!alive) return; if (document.visibilityState !== 'hidden') await pull(); if (alive) t = setTimeout(loop, openRef.current ? OPEN_MS : CLOSED_MS); };
    void loop();
    return () => { alive = false; clearTimeout(t); };
  }, [pull]);
  useEffect(() => { if (open) setUnread(0); }, [open]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length, open]);

  const after = (r: Awaited<ReturnType<typeof chat.say>>) => {
    if (failed(r)) { setErr(r.error); return; }
    setErr(''); seq.current = Math.max(seq.current, r.line.seq);
    setLines(prev => (prev.some(p => p.id === r.line.id) ? prev : [...prev, r.line].slice(-MAX_KEEP)));
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); const t = text.trim(); if (!t || busy) return;
    setBusy(true); const r = await chat.say(scope, t); setBusy(false);
    if (!failed(r)) setText(''); after(r);
  };
  const sendQuick = async (id: string) => { if (busy) return; setBusy(true); after(await chat.quick(scope, id)); setBusy(false); };
  const report = async (l: ChatLine) => {
    setMenu(null);
    if (!window.confirm(`Report this message from ${l.name}?`)) return;
    const r = await chat.report(scope, l.id); setErr(failed(r) ? r.error : 'Thanks — our team will look at it.');
  };
  const toggleMute = (uid: string) => { setMutedState(new Set(setMuted(uid, !muted.has(uid)))); setMenu(null); };

  if (access && !access.read) return null;
  const shown = lines.filter(l => !l.uid || !muted.has(l.uid));

  return (
    <div className="gt-chat" aria-label={title}>
      <style>{GT_CSS}</style>
      <div className="gt-chat-h">
        <MessageSquare size={13} /> {title} {!open && unread > 0 && <span className="gt-badge" aria-label={`${unread} new`}>{unread > 9 ? '9+' : unread}</span>}
        <button className="gt-more" style={{ opacity: .8, background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? 'Collapse chat' : 'Open chat'}>
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>
      {open && <>
        <div className="gt-lines" ref={listRef} aria-live="polite">
          {!shown.length && <div className="gt-empty">No messages yet — say hi.</div>}
          {shown.map(l => l.kind === 'system'
            ? <div key={l.id} className="gt-line sys">{l.text}</div>
            : (
              <React.Fragment key={l.id}>
                <div className={`gt-line${l.uid === me ? ' me' : ''}${l.quick ? ' quick' : ''}`}>
                  <b>{l.uid === me ? 'You' : l.name}</b><span className="gt-t">{l.text}</span>
                  {l.uid !== me && <button className="gt-more" onClick={() => setMenu(m => (m === l.id ? null : l.id))} aria-label={`Options for ${l.name}'s message`}><MoreHorizontal size={14} /></button>}
                </div>
                {menu === l.id && (
                  <div className="gt-menu">
                    <button onClick={() => toggleMute(l.uid)}>{muted.has(l.uid) ? 'Unmute' : 'Mute'} {l.name}</button>
                    <button onClick={() => void report(l)}>Report</button>
                  </div>
                )}
              </React.Fragment>
            ))}
        </div>
        {access?.post && quick.length > 0 && (
          <div className="gt-quick" role="group" aria-label="Quick messages">
            {quick.map(q => <button key={q.id} disabled={busy} onClick={() => void sendQuick(q.id)}>{q.text}</button>)}
          </div>
        )}
        {access?.post && !access.quickOnly && (
          <form className="gt-form" onSubmit={send}>
            <input value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder="Message…" aria-label="Message" />
            <button className="gx-btn" style={{ minHeight: 34, padding: '0 10px' }} disabled={busy || !text.trim()} aria-label="Send"><Send size={14} /></button>
          </form>
        )}
        {err && <div className="gt-err" role="status">{err}</div>}
        {muted.size > 0 && shown.length < lines.length && <div className="gt-empty">{lines.length - shown.length} hidden from muted players</div>}
      </>}
    </div>
  );
}
