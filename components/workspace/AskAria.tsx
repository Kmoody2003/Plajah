// Ask Aria: a chat beside the workspace you're in. Answers come from what Plajah knows about this
// workspace (its tools, what's on your toolbar right now, the guide steps, the safety notes), what you
// are making (each room reports it through railBus) and, when you switch it on, what Aria saw on your
// screen (Gemma 4 on this PC in the desktop app, or Gemini signed in: services/workspace/lookAtScreen.ts).
// Signed in, Aria words the answer with the model (POST /api/build/workspace/ask), otherwise the notes
// answer directly. "Show me" presses the tool in the room, or brings every tool onto the toolbar.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { X, Send, Sparkles, Eye, EyeOff } from 'lucide-react';
import type { Level } from '../../services/workspace/guidePath';
import type { AriaAnswer, AriaFact, AriaHistory } from '../../services/workspace/askAria';
import { localAnswer, suggestedQuestions } from '../../services/workspace/askAria';
import { railOf, stateOf, subscribeRail, runTool, revealTools, canRun } from '../../services/workspace/railBus';
import type { Eyes } from '../../services/workspace/lookAtScreen';

type Knowledge = typeof import('../../services/workspace/ariaKnowledge');
let knowledge: Promise<Knowledge> | null = null;
const loadKnowledge = () => (knowledge ??= import('../../services/workspace/ariaKnowledge'));

export interface AriaTurn { q: string; a?: AriaAnswer; labels?: Record<string, string>; pending?: string; seen?: string; seenBy?: 'device' | 'cloud'; lookError?: string }

const LOOK_KEY = 'aria_look_screen';
const readLook = (): boolean | null => { try { const v = localStorage.getItem(LOOK_KEY); return v === null ? null : v === '1'; } catch { return null; } };
const saveLook = (on: boolean) => { try { localStorage.setItem(LOOK_KEY, on ? '1' : '0'); } catch { /* private window */ } };

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
  const work = useSyncExternalStore(subscribeRail, () => stateOf(space), () => stateOf(space));
  const facts: AriaFact[] = useMemo(() => k?.workspaceFacts(workspace, level, rail, work) ?? [], [k, workspace, level, rail, work]);
  // Aria's eyes: on-device Gemma 4 (desktop app), Gemini when signed in, or none. Off until switched on,
  // except on-device, where the picture never leaves the PC.
  const [eyes, setEyes] = useState<Eyes>('none');
  const [look, setLook] = useState(false);
  useEffect(() => {
    let on = true;
    (async () => {
      const m = await import('../../services/workspace/lookAtScreen');
      const signedIn = !!(getToken && await getToken().catch(() => null));
      const e = await m.eyesFor(signedIn); if (!on) return;
      setEyes(e); setLook(e !== 'none' && (readLook() ?? e === 'device'));
    })();
    return () => { on = false; };
  }, [getToken]);
  const toggleLook = () => { const v = !look; setLook(v); saveLook(v); };
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
    q = q.trim(); if (q.length < 2 || !facts.length || !k) return;
    setText(''); setNote('');
    const history: AriaHistory[] = turns.filter(t => t.a && !t.a.unknown).slice(-2).map(t => ({ q: t.q.slice(0, 300), a: t.a!.answer.slice(0, 400) }));
    const set = (x: Partial<AriaTurn>) => setTurns(t => t.map((y, i) => i === t.length - 1 ? { ...y, ...x } : y));
    setTurns(t => [...t, { q, pending: look && eyes !== 'none' ? 'Looking at your screen…' : 'Thinking…' }]);
    // 1. Look, if allowed: a description of the room, kept with this turn.
    let seen: string | undefined, seenBy: 'device' | 'cloud' | undefined, lookError: string | undefined;
    const pane = document.querySelector<HTMLElement>(`[data-testid="ws-pane-${workspace}"]`);
    if (look && eyes !== 'none' && pane) {
      try {
        const m = await import('../../services/workspace/lookAtScreen');
        const r = await m.lookAtScreen({ el: pane, workspace, workspaceName, state: work, eyes, getToken });
        seen = r.seen; seenBy = r.by;
      } catch (e: any) { lookError = e?.message || 'Aria could not look at your screen.'; }
      set({ pending: 'Thinking…' });
    }
    // 2. Answer: from the notes here first, then the model when signed in.
    const withScreen = seen ? k.workspaceFacts(workspace, level, rail, work, seen) ?? facts : facts;
    const labels = Object.fromEntries(withScreen.map(f => [f.id, f.label]));
    let a: AriaAnswer = localAnswer(level, q, withScreen);
    if (a.unknown && history.length) { const b = localAnswer(level, `${history[history.length - 1].q} ${q}`, withScreen); if (!b.unknown) a = b; }
    const token = getToken ? await getToken().catch(() => null) : null;
    if (token) {
      try {
        const r = await fetch('/api/build/workspace/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspace, level, question: q, rail, state: work, screen: seen, history }) });
        if (r.ok) a = await r.json() as AriaAnswer;
      } catch { /* offline: the notes answer */ }
    }
    set({ q, a, labels, pending: undefined, seen, seenBy, lookError });
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
      <button className={`ws-btn aa-eye${look ? ' aa-eye-on' : ''}`} onClick={toggleLook} disabled={eyes === 'none'} aria-pressed={look} data-testid="ask-aria-look"
        title={eyes === 'none' ? 'Sign in, or use the Plajah desktop app, so Aria can look at your screen' : look ? (eyes === 'device' ? 'Aria looks at this room when you ask (on this PC, nothing leaves it). Click to stop.' : 'Aria sends a picture of this room to Gemini when you ask. Click to stop.') : (eyes === 'device' ? 'Let Aria look at this room when you ask (on this PC)' : 'Let Aria look at this room when you ask (sends a picture to Gemini)')}>
        {look ? <Eye size={14}/> : <EyeOff size={14}/>}</button>
      <button className="ws-btn" onClick={onClose} aria-label="Close Ask Aria" data-testid="ask-aria-close"><X size={14}/></button>
    </header>
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3" aria-live="polite">
      {!turns.length && <div className="text-[12.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,.7)' }}>
        {level === 'simple' ? `Hi! Ask me about your work, any tool in ${workspaceName}, what to do next, or how to stay safe.` : `Ask about your work, ${workspaceName}'s tools, the next step, or safety notes.`}
        {work && <div className="mt-2 text-[11.5px]" style={{ color: 'rgba(255,255,255,.5)' }} data-testid="ask-aria-work">{level === 'simple' ? 'I can see you are making: ' : 'Working on: '}{work.building}</div>}
      </div>}
      {turns.map((t, i) => <div key={i} className="space-y-1.5" data-testid="ask-aria-turn">
        <div className="aa-q">{t.q}</div>
        {t.pending ? <div className="aa-a" style={{ color: 'rgba(255,255,255,.5)' }}>{t.pending}</div>
          : t.a && <div className="aa-a" data-testid="ask-aria-answer">
            <div>{t.a.answer}</div>
            {!t.a.unknown && t.a.cites.length > 0 && <div className="mt-1.5 text-[10.5px]" style={{ color: 'rgba(255,255,255,.42)' }}>
              {t.a.by === 'rules' ? 'From the workspace notes' : 'Aria, from the workspace notes'}: {[...new Set(t.a.cites.map(c => t.labels?.[c]).filter(Boolean))].join(', ')}
            </div>}
            {t.seen && <details className="mt-1.5 text-[10.5px]" style={{ color: 'rgba(255,255,255,.5)' }} data-testid="ask-aria-seen"><summary className="cursor-pointer">{t.seenBy === 'device' ? 'Aria looked at your screen (on this PC)' : 'Aria looked at your screen (Gemini)'}</summary><div className="mt-1">{t.seen}</div></details>}
            {t.lookError && <div className="mt-1.5 text-[10.5px]" style={{ color: '#fbbf24' }} data-testid="ask-aria-look-error">{t.lookError}</div>}
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
.aa-eye-on{color:#c4b5fd;border-color:rgba(167,139,250,.55)}
.aa-eye:disabled{opacity:.4}
`}</style>
  </aside>;
}
