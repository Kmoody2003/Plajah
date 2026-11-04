// FrontDeskAsk — the visitor side of Front Desk on an org's public page. Renders nothing unless the org
// has hired Front Desk (GET /api/crew/desk/:orgId says on). Answers come only from what the org published.
import React, { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, X } from 'lucide-react';
import { crewApi, type DeskReply } from '../../services/crew/crewClient';
import { EV } from '../elevate/vellum';
import AriaMark from '../aria/AriaMark';

type Turn = { q: string; r?: DeskReply; error?: string };

export const FrontDeskAsk: React.FC<{ orgId: string; orgName: string }> = ({ orgId, orgName }) => {
  const [desk, setDesk] = useState<{ on: boolean; suggestions?: string[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { let live = true; crewApi.desk(orgId).then(d => live && setDesk(d)).catch(() => live && setDesk({ on: false })); return () => { live = false; }; }, [orgId]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);

  if (!desk?.on) return null;

  const ask = async (text: string) => {
    const question = text.trim();
    if (question.length < 2 || busy) return;
    setQ(''); setBusy(true);
    setTurns(t => [...t, { q: question }]);
    try { const r = await crewApi.ask(orgId, question); setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, r } : x))); }
    catch (e: any) { setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e?.message || 'Front Desk could not answer right now.' } : x))); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ev-btn ev-btn-ghost" style={{ minHeight: 44 }}>
        <MessageCircleQuestion size={14} /> Ask us
      </button>
    );
  }

  return (
    <div role="dialog" aria-label={`Ask ${orgName}`}
         className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
         style={{ background: EV.panel, border: `1px solid ${EV.line}`, maxHeight: 'min(560px, calc(100vh - 32px))' }}>
      <header className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${EV.line}` }}>
        <AriaMark size={26} thinking={busy} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold truncate" style={{ color: EV.ink }}>{orgName} · Front Desk</p>
          <p className="text-[10px]" style={{ color: EV.muted }}>Answers from what {orgName} has published</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg" style={{ color: EV.muted }}><X size={16} /></button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" aria-live="polite">
        {!turns.length && (
          <div className="space-y-2">
            <p className="text-[13px]" style={{ color: EV.ink2 }}>Hi! Ask about times, where to find us, or what's on.</p>
            {(desk.suggestions || []).map(s => (
              <button key={s} type="button" onClick={() => ask(s)} className="block w-full text-left rounded-xl px-3 py-2 text-[12px]" style={{ background: EV.raised, color: EV.ink2 }}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5">
            <p className="ml-8 rounded-2xl rounded-br-md px-3 py-2 text-[13px] text-white" style={{ background: EV.violet }}>{t.q}</p>
            {t.r && (
              <div className="mr-8 rounded-2xl rounded-bl-md px-3 py-2 text-[13px]" style={{ background: EV.raised, color: EV.ink2 }}>
                <p>{t.r.answer}</p>
                {!t.r.unknown && t.r.from.length > 0 && <p className="text-[10px] mt-1" style={{ color: EV.muted }}>From: {t.r.from.join(', ')}</p>}
              </div>
            )}
            {t.error && <p role="alert" className="mr-8 text-[12px]" style={{ color: EV.warn }}>{t.error}</p>}
            {!t.r && !t.error && <p className="text-[12px]" style={{ color: EV.muted }}>Looking that up…</p>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="flex gap-2 p-3" style={{ borderTop: `1px solid ${EV.line}` }} onSubmit={e => { e.preventDefault(); ask(q); }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} maxLength={500} placeholder="Type a question" aria-label="Your question"
               className="flex-1 min-w-0 rounded-full px-4 py-2 text-[13px]" style={{ background: EV.raised, color: EV.ink, border: `1px solid ${EV.line}` }} />
        <button type="submit" disabled={busy || q.trim().length < 2} aria-label="Send" className="px-3 rounded-full text-white disabled:opacity-40" style={{ background: EV.violet }}><Send size={14} /></button>
      </form>
    </div>
  );
};

export default FrontDeskAsk;
