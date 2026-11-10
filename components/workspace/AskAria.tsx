// Ask Aria: a chat beside the workspace you're in. Answers come from what Plajah knows about this
// workspace (its tools, what's on your toolbar right now, the guide steps, the safety notes); signed in,
// Aria words them with the model (POST /api/build/workspace/ask), otherwise the notes answer directly.
// "Show me" presses the tool in the room, or brings every tool onto the toolbar when the room can't.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import type { Level } from '../../services/workspace/guidePath';
import type { AriaAnswer, AriaFact } from '../../services/workspace/askAria';
import { localAnswer, suggestedQuestions } from '../../services/workspace/askAria';
import { railOf, subscribeRail, runTool, revealTools, canRun } from '../../services/workspace/railBus';

type Knowledge = typeof import('../../services/workspace/ariaKnowledge');
let knowledge: Promise<Knowledge> | null = null;
const loadKnowledge = () => (knowledge ??= import('../../services/workspace/ariaKnowledge'));

export interface AriaTurn { q: string; a?: AriaAnswer; labels?: Record<string, string>; pending?: boolean }

export interface AskAriaProps {
  workspace: string;
  workspaceName: string;
  level: Level;
  getToken?: () => Promise<string | null>;
  turns: AriaTurn[];
  setTurns: (f: (t: AriaTurn[]) => AriaTurn[]) => void;
  onClose: () => void;
}

export default function AskAria({ workspace, workspaceName, level, getToken, turns, setTurns, onClose }: AskAriaProps) {
  const [k, setK] = useState<Knowledge | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { let on = true; loadKnowledge().then(m => { if (on) setK(m); }); return () => { on = false; }; }, []);
  const space = k ? k.toolSpace(workspace) : workspace;
  const rail = useSyncExternalStore(subscribeRail, () => railOf(space), () => railOf(space));
  const facts: AriaFact[] = useMemo(() => k?.workspaceFacts(workspace, level, rail) ?? [], [k, workspace, level, rail]);
  const starters = useMemo(() => suggestedQuestions(level, facts), [level, facts]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  // A room's dialog (the safety terms, a confirm) must never sit under Aria: step aside, the chat is kept.
  useEffect(() => {
    const modal = () => !!document.querySelector('[aria-modal="true"]');
    if (modal()) { onClose(); return; }
    const mo = new MutationObserver(() => { if (modal()) onClose(); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [onClose]);

  async function ask(q: string) {
    q = q.trim(); if (q.length < 2 || !facts.length) return;
    setText(''); setNote('');
    const labels = Object.fromEntries(facts.map(f => [f.id, f.label]));
    const local = localAnswer(level, q, facts);
    setTurns(t => [...t, { q, pending: true }]);
    let a: AriaAnswer = local;
    const token = getToken ? await getToken().catch(() => null) : null;
    if (token) {
      try {
        const r = await fetch('/api/build/workspace/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspace, level, question: q, rail }) });
        if (r.ok) a = await r.json() as AriaAnswer;
      } catch { /* offline: the notes answer */ }
    }
    setTurns(t => t.map((x, i) => i === t.length - 1 ? { q, a, labels } : x));
  }

  function showMe(id: string) {
    const r = runTool(space, id);
    if (r.ran) { setNote(''); if (window.innerWidth < 640) onClose(); return; }
    if (r.note) { setNote(r.note); return; }
    revealTools(space);
    const label = facts.find(f => f.tool === id)?.label ?? id;
    setNote(level === 'simple' ? `${label} is on your toolbar now, with every other tool. Press it there.` : `${label}: all tools shown on the rail.`);
  }

  return <aside className="aa-panel" role="complementary" aria-label={`Ask Aria about ${workspaceName}`} data-testid="ask-aria">
    <header className="flex items-center gap-2 px-3 h-11 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
      <span className="aa-av" aria-hidden="true">A</span>
      <div className="flex-1 min-w-0"><div className="text-[13px] font-bold">Ask Aria</div><div className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,.5)' }}>{workspaceName}</div></div>
      <button className="ws-btn" onClick={onClose} aria-label="Close Ask Aria" data-testid="ask-aria-close"><X size={14}/></button>
    </header>
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3" aria-live="polite">
      {!turns.length && <div className="text-[12.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,.7)' }}>
        {level === 'simple' ? `Hi! Ask me about any tool in ${workspaceName}, what to do next, or how to stay safe.` : `Ask about ${workspaceName}'s tools, the next step, or safety notes.`}
      </div>}
      {turns.map((t, i) => <div key={i} className="space-y-1.5" data-testid="ask-aria-turn">
        <div className="aa-q">{t.q}</div>
        {t.pending ? <div className="aa-a" style={{ color: 'rgba(255,255,255,.5)' }}>Thinking…</div>
          : t.a && <div className="aa-a" data-testid="ask-aria-answer">
            <div>{t.a.answer}</div>
            {!t.a.unknown && t.a.cites.length > 0 && <div className="mt-1.5 text-[10.5px]" style={{ color: 'rgba(255,255,255,.42)' }}>
              {t.a.by === 'rules' ? 'From the workspace notes' : 'Aria, from the workspace notes'}: {[...new Set(t.a.cites.map(c => t.labels?.[c]).filter(Boolean))].join(', ')}
            </div>}
            {t.a.tools.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{t.a.tools.slice(0, 3).map(id => <button key={id} className="aria-hint-btn aa-show" onClick={() => showMe(id)} data-testid={`ask-aria-show-${id}`}>
              {canRun(space) ? 'Show me' : 'Find it'}: {facts.find(f => f.tool === id)?.label ?? id}</button>)}</div>}
          </div>}
      </div>)}
      {note && <div className="text-[11.5px]" style={{ color: '#c4b5fd' }} role="status" data-testid="ask-aria-note">{note}</div>}
      <div ref={end}/>
    </div>
    {!turns.length && starters.length > 0 && <div className="px-3 pb-2 flex flex-wrap gap-1.5">{starters.map(q => <button key={q} className="aria-hint-btn" onClick={() => ask(q)} data-testid="ask-aria-starter"><Sparkles size={11} className="inline mr-1"/>{q}</button>)}</div>}
    <form className="flex items-center gap-2 p-2 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }} onSubmit={e => { e.preventDefault(); ask(text); }}>
      <input value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder={level === 'simple' ? 'Ask anything about this workspace…' : 'Ask about tools, steps, safety…'} aria-label="Your question" className="aa-in" data-testid="ask-aria-input" autoFocus/>
      <button className="ws-btn" type="submit" aria-label="Ask" disabled={text.trim().length < 2 || !facts.length} data-testid="ask-aria-send"><Send size={14}/></button>
    </form>
    <style>{`
.aa-panel{position:absolute;top:0;right:0;bottom:0;z-index:250;width:360px;max-width:100%;display:flex;flex-direction:column;background:#13111b;border-left:1px solid rgba(255,255,255,.08);box-shadow:-18px 0 40px rgba(0,0,0,.35)}
@media (max-width:639px){.aa-panel{top:auto;height:70%;width:100%;border-left:0;border-top:1px solid rgba(167,139,250,.35);border-radius:16px 16px 0 0}}
.aa-av{width:26px;height:26px;border-radius:999px;display:grid;place-items:center;flex:none;font-size:12px;font-weight:900;color:#fff;background:linear-gradient(135deg,#a855f7,#ec4899)}
.aa-q{margin-left:auto;max-width:85%;width:fit-content;padding:7px 10px;border-radius:12px 12px 4px 12px;font-size:12.5px;background:rgba(167,139,250,.18);color:#f3e8ff}
.aa-a{max-width:92%;padding:8px 10px;border-radius:12px 12px 12px 4px;font-size:12.5px;line-height:1.5;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.88)}
.aa-in{flex:1;min-width:0;height:34px;padding:0 10px;border-radius:9px;font-size:13px;color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);outline:none}
.aa-in:focus{border-color:rgba(167,139,250,.6)}
.aria-hint-btn{height:26px;padding:0 10px;border-radius:7px;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.85);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.aria-hint-btn:hover{background:rgba(255,255,255,.12);color:#fff}
.aa-show{border-color:rgba(167,139,250,.45)}
`}</style>
  </aside>;
}
