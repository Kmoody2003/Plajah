// SermonPrep — the pastor's sermon workflow, phone first.
//
// Five steps on a bottom tab bar, each a single thumb-reachable screen:
//   Text → Study → Outline → Script → Preach
// The Study step opens the full Lectio reader (every study tool) with a Pin
// action, so a verse found anywhere in Scripture lands in this sermon. Drafts
// autosave locally and to the creative cloud, so the sermon started in a
// hospital waiting room is the one open on the office laptop.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, Check, ChevronLeft, FileText, ListOrdered, Loader2, Library,
  Mic, Minus, Pause, Play, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import type { Organization } from '../../types';
import { auth } from '../../services/backendService';
import { callGemini } from '../../services/geminiService';
import { findRefs, formatRef, parseRef, refId, type ScriptureRef } from '../../services/scriptureRef';
import {
  newSermon, uid8, useSermons, wordCount, WORDS_PER_MIN, manuscriptFromOutline,
  type SermonPrepDoc,
} from '../../services/sermonPrep';

const BibleExperience = lazy(() => import('../BibleExperience'));

type Step = 'text' | 'study' | 'outline' | 'script' | 'preach';
const STEPS: { id: Step; label: string; icon: React.FC<any> }[] = [
  { id: 'text', label: 'Text', icon: BookOpen },
  { id: 'study', label: 'Study', icon: Library },
  { id: 'outline', label: 'Outline', icon: ListOrdered },
  { id: 'script', label: 'Script', icon: FileText },
  { id: 'preach', label: 'Preach', icon: Mic },
];

const GOLD = '#d4af37';
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white outline-none focus:border-[#d4af37]/60 placeholder:text-white/25';
const label = 'block mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/40';
const SAFE_B = 'env(safe-area-inset-bottom, 0px)';

const STUDY_ASKS: { kind: string; ask: (p: string, idea: string) => string }[] = [
  { kind: 'Context', ask: p => `Give a pastor the historical, cultural and literary context of ${p}: author, audience, occasion, where it sits in the book's argument, and what the first hearers would have understood. Be concise and cite passages.` },
  { kind: 'Key words', ask: p => `List the 5-8 most important words or phrases in ${p} in the original language (Greek or Hebrew, transliterated, with Strong's numbers where you are confident), what each means in context, and why it matters for preaching. Do not invent definitions; say when a nuance is debated.` },
  { kind: 'Structure', ask: p => `Show the structure of ${p}: its natural divisions, the flow of thought, and the main point of each part, as a short outline a preacher could build on.` },
  { kind: 'Cross-refs', ask: p => `Give the 8 strongest cross-references to ${p} (references with a one-line reason each), covering the same theme, the Old Testament background, and how the New Testament develops it.` },
  { kind: 'Pitfalls', ask: p => `What are the common misreadings or misuses of ${p} in preaching, and where do faithful traditions (Reformed, Wesleyan, Catholic, Orthodox, Pentecostal) differ on it? Be fair and brief.` },
];

// ── Root ─────────────────────────────────────────────────────────────────────
const SermonPrep: React.FC<{ church: Organization; onClose: () => void }> = ({ church, onClose }) => {
  const uid = auth.currentUser?.uid ?? 'guest';
  const { sermons, save, remove } = useSermons(uid);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SermonPrepDoc | null>(null);

  const open = (s: SermonPrepDoc) => { setDraft(s); setOpenId(s.id); };
  const create = () => { const s = newSermon(); save(s); open(s); };

  if (draft && openId) {
    return <Editor key={openId} church={church} initial={draft} save={save} onList={() => { setOpenId(null); setDraft(null); }} />;
  }

  const sorted = [...sermons].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#08070c] text-white" style={{ height: '100dvh' }}>
      <header className="shrink-0 flex items-center gap-1 px-2 h-14 border-b border-white/10">
        <button onClick={onClose} aria-label="Back" className="h-11 w-11 grid place-items-center rounded-full active:bg-white/10"><ChevronLeft size={22} /></button>
        <h1 className="text-[15px] font-black tracking-tight">Sermon prep</h1>
        <span className="ml-auto pr-3 text-[10px] font-black uppercase tracking-widest text-white/30 truncate">{church.name}</span>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
        {sorted.length === 0 && (
          <div className="py-16 text-center">
            <Mic size={28} className="mx-auto mb-3" style={{ color: GOLD }} />
            <p className="text-lg font-black">Start your next sermon</p>
            <p className="mt-1 text-sm text-white/45 max-w-xs mx-auto">Pick a text, study it in the full Bible reader, outline, write, and preach from your phone. It saves as you go and follows you to any device.</p>
          </div>
        )}
        {sorted.map(s => {
          const words = wordCount(s.manuscript);
          return (
            <div key={s.id} className="flex items-stretch rounded-2xl border border-white/10 bg-white/[0.03]">
              <button onClick={() => open(s)} className="flex-1 min-w-0 p-4 text-left active:bg-white/5 rounded-2xl">
                <p className="text-[15px] font-black truncate">{s.title || 'Untitled sermon'}</p>
                <p className="mt-0.5 text-[12px] truncate" style={{ color: GOLD }}>{s.passage || 'No text yet'}</p>
                <p className="mt-1 text-[11px] text-white/35">{[s.series, s.date && new Date(s.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), words ? `${words} words` : null].filter(Boolean).join(' · ')}</p>
              </button>
              <button onClick={() => { if (confirm(`Delete “${s.title || 'Untitled sermon'}”?`)) remove(s.id); }} aria-label="Delete sermon" className="w-12 grid place-items-center text-white/25 active:text-red-400"><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 p-4 border-t border-white/10" style={{ paddingBottom: `calc(1rem + ${SAFE_B})` }}>
        <button onClick={create} className="w-full h-14 rounded-full text-black text-[13px] font-black uppercase tracking-widest flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#f3d27a,#d4af37)' }}>
          <Plus size={18} /> New sermon
        </button>
      </div>
    </div>
  );
};

// ── Editor ───────────────────────────────────────────────────────────────────
const Editor: React.FC<{ church: Organization; initial: SermonPrepDoc; save: (d: SermonPrepDoc) => void; onList: () => void }> = ({ church, initial, save, onList }) => {
  const [d, setD] = useState<SermonPrepDoc>(initial);
  const [step, setStep] = useState<Step>('text');
  const [reader, setReader] = useState<{ refId: string | null } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = useRef(false);
  const dRef = useRef(d); dRef.current = d;
  const patch = useCallback((p: Partial<SermonPrepDoc>) => { dirty.current = true; setD(prev => ({ ...prev, ...p })); }, []);

  // Autosave: quiet debounce, and a flush when leaving.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => { save(d); dirty.current = false; setSavedAt(Date.now()); }, 700);
    return () => clearTimeout(t);
  }, [d, save]);
  useEffect(() => () => { if (dirty.current) save(dRef.current); }, [save]);   // flush if closed mid-debounce
  const leave = () => { if (dirty.current) { save(d); dirty.current = false; } onList(); };

  const passageRef: ScriptureRef | null = useMemo(() => (d.passage.trim() ? parseRef(d.passage) : null), [d.passage]);
  const openReader = (id?: string | null) => setReader({ refId: id ?? (passageRef ? refId(passageRef) : null) });

  const pin = ({ ref, text }: { ref: ScriptureRef; text: string }) => {
    const id = refId(ref);
    setD(prev => {
      dirty.current = true;
      if (prev.pinned.some(p => p.refId === id)) return prev;
      return { ...prev, pinned: [...prev.pinned, { refId: id, label: formatRef(ref, 'display'), text, note: '' }] };
    });
  };

  if (reader) {
    return (
      <Suspense fallback={<div className="fixed inset-0 z-[130] grid place-items-center bg-[#08070c]"><Loader2 className="animate-spin text-white/30" /></div>}>
        <BibleExperience onBack={() => setReader(null)} initialRefId={reader.refId} onPinVerse={pin} pinCount={d.pinned.length} />
      </Suspense>
    );
  }

  if (step === 'preach') return <Preach d={d} patch={patch} onExit={() => setStep('script')} />;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#08070c] text-white" style={{ height: '100dvh' }}>
      <header className="shrink-0 flex items-center gap-1 px-2 h-14 border-b border-white/10">
        <button onClick={leave} aria-label="All sermons" className="h-11 w-11 grid place-items-center rounded-full active:bg-white/10"><ChevronLeft size={22} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-black truncate">{d.title || 'Untitled sermon'}</p>
          <p className="text-[10px] truncate" style={{ color: GOLD }}>{d.passage || 'Choose a text'}</p>
        </div>
        <span className="pr-3 text-[10px] font-black uppercase tracking-widest text-white/30 whitespace-nowrap">{savedAt ? 'Saved' : ''}</span>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {step === 'text' && <TextStep d={d} patch={patch} passageRef={passageRef} onRead={() => openReader()} />}
        {step === 'study' && <StudyStep d={d} patch={patch} passageRef={passageRef} onRead={openReader} />}
        {step === 'outline' && <OutlineStep d={d} patch={patch} />}
        {step === 'script' && <ScriptStep d={d} patch={patch} onRead={openReader} />}
      </main>

      <nav aria-label="Sermon steps" className="shrink-0 grid grid-cols-5 border-t border-white/10 bg-[#0b0910]" style={{ paddingBottom: SAFE_B }}>
        {STEPS.map(({ id, label: l, icon: Icon }) => (
          <button key={id} onClick={() => setStep(id)} aria-current={step === id ? 'page' : undefined}
            className={`h-16 flex flex-col items-center justify-center gap-1 active:bg-white/10 ${step === id ? 'text-[#d4af37]' : 'text-white/45'}`}>
            <Icon size={20} /><span className="text-[9px] font-black uppercase tracking-widest">{l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

type StepProps = { d: SermonPrepDoc; patch: (p: Partial<SermonPrepDoc>) => void };

// ── Step 1: text ─────────────────────────────────────────────────────────────
const TextStep: React.FC<StepProps & { passageRef: ScriptureRef | null; onRead: () => void }> = ({ d, patch, passageRef, onRead }) => (
  <div className="space-y-5 max-w-xl mx-auto">
    <div>
      <label className={label} htmlFor="sp-title">Title</label>
      <input id="sp-title" value={d.title} onChange={e => patch({ title: e.target.value })} placeholder="Working title" className={field} />
    </div>
    <div>
      <label className={label} htmlFor="sp-pass">Scripture text</label>
      <input id="sp-pass" value={d.passage} onChange={e => patch({ passage: e.target.value })} placeholder="Romans 8:18-30" autoCapitalize="words" autoCorrect="off" className={field} />
      <div className="mt-2 flex items-center gap-2 min-h-[28px]">
        {d.passage.trim() && (passageRef
          ? <span className="text-[12px] flex items-center gap-1" style={{ color: GOLD }}><Check size={13} /> {formatRef(passageRef, 'display')}</span>
          : <span className="text-[12px] text-white/40">Not a recognised reference yet</span>)}
      </div>
      <button onClick={onRead} disabled={!passageRef} className="mt-1 w-full h-12 rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30" style={{ color: GOLD }}>
        <BookOpen size={16} /> Read it in the Bible
      </button>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={label} htmlFor="sp-series">Series</label>
        <input id="sp-series" value={d.series} onChange={e => patch({ series: e.target.value })} placeholder="Optional" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="sp-date">Preaching</label>
        <input id="sp-date" type="date" value={d.date} onChange={e => patch({ date: e.target.value })} className={field} />
      </div>
    </div>
    <div>
      <label className={label} htmlFor="sp-idea">The big idea</label>
      <textarea id="sp-idea" value={d.bigIdea} onChange={e => patch({ bigIdea: e.target.value })} rows={3} placeholder="If they remember one sentence on Monday, what is it?" className={`${field} resize-none`} />
    </div>
    <div>
      <label className={label} htmlFor="sp-min">Target length · {d.targetMinutes} min</label>
      <input id="sp-min" type="range" min={10} max={60} step={5} value={d.targetMinutes} onChange={e => patch({ targetMinutes: Number(e.target.value) })} className="w-full h-11 accent-[#d4af37]" />
    </div>
  </div>
);

// ── Step 2: study ────────────────────────────────────────────────────────────
const StudyStep: React.FC<StepProps & { passageRef: ScriptureRef | null; onRead: (id?: string | null) => void }> = ({ d, patch, passageRef, onRead }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const passage = passageRef ? formatRef(passageRef, 'display') : d.passage.trim();

  const run = async (kind: string, ask: string) => {
    setBusy(kind); setErr('');
    try {
      const raw = await callGemini(ask + '\n\nWrite for a pastor preparing a sermon. Plain prose and short lists, no preamble.');
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) throw new Error('empty');
      patch({ study: [{ id: uid8(), kind, text, at: Date.now() }, ...d.study] });
    } catch { setErr('Aria could not answer just now. Try again.'); }
    setBusy(null);
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <button onClick={() => onRead()} className="w-full h-14 rounded-2xl text-black text-[13px] font-black uppercase tracking-widest flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#f3d27a,#d4af37)' }}>
        <BookOpen size={17} /> Open the Bible reader
      </button>
      <p className="-mt-3 text-center text-[11px] text-white/35">Tap any verse, then Pin to bring it here. Original languages, concordance and cross-references are all in the reader.</p>

      <section>
        <h2 className={label}>Pinned verses · {d.pinned.length}</h2>
        {d.pinned.length === 0 && <p className="text-sm text-white/35">Nothing pinned yet.</p>}
        <div className="space-y-3">
          {d.pinned.map(p => (
            <div key={p.refId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center">
                <button onClick={() => onRead(p.refId)} className="h-11 pr-3 text-[13px] font-black active:opacity-70" style={{ color: GOLD }}>{p.label}</button>
                <button onClick={() => patch({ pinned: d.pinned.filter(x => x.refId !== p.refId) })} aria-label={`Unpin ${p.label}`} className="ml-auto h-11 w-11 grid place-items-center text-white/30"><X size={16} /></button>
              </div>
              <p className="text-[14px] leading-relaxed text-white/70" style={{ fontFamily: 'Georgia, serif' }}>{p.text}</p>
              <textarea value={p.note} onChange={e => patch({ pinned: d.pinned.map(x => x.refId === p.refId ? { ...x, note: e.target.value } : x) })} rows={2} placeholder="Why this verse?" className={`${field} mt-2 py-2.5 resize-none`} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className={label}>Ask Aria about {passage || 'your text'}</h2>
        <div className="flex flex-wrap gap-2">
          {STUDY_ASKS.map(a => (
            <button key={a.kind} disabled={!passage || !!busy} onClick={() => run(a.kind, a.ask(passage, d.bigIdea))}
              className="h-11 px-4 rounded-full border border-white/15 text-[12px] font-black uppercase tracking-wider text-white/75 flex items-center gap-1.5 active:bg-white/10 disabled:opacity-30">
              {busy === a.kind ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} style={{ color: GOLD }} />} {a.kind}
            </button>
          ))}
        </div>
        {!passage && <p className="mt-2 text-[12px] text-white/35">Choose a text on the first step.</p>}
        {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}
        <div className="mt-4 space-y-3">
          {d.study.map(c => (
            <article key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center mb-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>{c.kind}</span>
                <button onClick={() => patch({ study: d.study.filter(x => x.id !== c.id) })} aria-label="Remove" className="ml-auto h-9 w-9 -mr-2 grid place-items-center text-white/30"><X size={15} /></button>
              </div>
              <p className="text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap">{c.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

// ── Step 3: outline ──────────────────────────────────────────────────────────
const OutlineStep: React.FC<StepProps> = ({ d, patch }) => {
  const [busy, setBusy] = useState(false);
  const move = (i: number, dir: -1 | 1) => {
    const o = [...d.outline]; const j = i + dir; if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; patch({ outline: o });
  };
  const suggest = async () => {
    setBusy(true);
    try {
      const raw = await callGemini(
        `You are helping a pastor outline a sermon on ${d.passage || 'the chosen text'}. Big idea: ${d.bigIdea || '(not yet written)'}. ` +
        `Return STRICT JSON: {"sections":[{"heading":"...","body":"..."}]} with an opening, 3 main movements that follow the text, and a closing. ` +
        `Each body is 1-2 sentences of what to say. Stay faithful to the passage.`, { responseMimeType: 'application/json' });
      const j = JSON.parse(typeof raw === 'string' ? raw : '{}');
      const secs = (j.sections || []).map((s: any) => ({ id: uid8(), heading: String(s.heading || ''), body: String(s.body || '') }));
      if (secs.length) patch({ outline: secs });
    } catch { /* leave the outline as it was */ }
    setBusy(false);
  };
  const addTo = (k: 'illustrations' | 'applications') => patch({ [k]: [...d[k], { id: uid8(), text: '' }] } as any);
  const setIn = (k: 'illustrations' | 'applications', id: string, text: string) => patch({ [k]: d[k].map(x => x.id === id ? { ...x, text } : x) } as any);
  const delIn = (k: 'illustrations' | 'applications', id: string) => patch({ [k]: d[k].filter(x => x.id !== id) } as any);

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {d.bigIdea && <p className="rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/[0.06] p-3 text-[14px] italic text-white/80">{d.bigIdea}</p>}
      <section className="space-y-3">
        {d.outline.map((s, i) => (
          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-1 mb-2">
              <span className="h-7 w-7 rounded-full grid place-items-center text-[12px] font-black text-black shrink-0" style={{ background: GOLD }}>{i + 1}</span>
              <input value={s.heading} onChange={e => patch({ outline: d.outline.map(x => x.id === s.id ? { ...x, heading: e.target.value } : x) })} placeholder="Point" aria-label={`Point ${i + 1} heading`} className="flex-1 min-w-0 h-11 bg-transparent px-2 text-base font-black outline-none placeholder:text-white/25" />
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="h-11 w-9 grid place-items-center text-white/40 disabled:opacity-20"><ArrowUp size={16} /></button>
              <button onClick={() => move(i, 1)} disabled={i === d.outline.length - 1} aria-label="Move down" className="h-11 w-9 grid place-items-center text-white/40 disabled:opacity-20"><ArrowDown size={16} /></button>
              <button onClick={() => patch({ outline: d.outline.filter(x => x.id !== s.id) })} aria-label="Delete point" className="h-11 w-9 grid place-items-center text-white/30"><Trash2 size={15} /></button>
            </div>
            <textarea value={s.body} onChange={e => patch({ outline: d.outline.map(x => x.id === s.id ? { ...x, body: e.target.value } : x) })} rows={3} placeholder="What you will say here…" className={`${field} py-2.5 resize-none`} />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => patch({ outline: [...d.outline, { id: uid8(), heading: '', body: '' }] })} className="h-12 rounded-2xl border border-white/15 text-[12px] font-black uppercase tracking-widest text-white/70 flex items-center justify-center gap-1.5 active:bg-white/10"><Plus size={15} /> Add point</button>
          <button onClick={suggest} disabled={busy || !d.passage.trim()} className="h-12 rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-30" style={{ color: GOLD }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Aria outline
          </button>
        </div>
      </section>

      {(['illustrations', 'applications'] as const).map(k => (
        <section key={k}>
          <h2 className={label}>{k === 'illustrations' ? 'Illustrations & stories' : 'Applications'} · {d[k].length}</h2>
          <div className="space-y-2">
            {d[k].map(x => (
              <div key={x.id} className="flex items-start gap-1">
                <textarea value={x.text} onChange={e => setIn(k, x.id, e.target.value)} rows={2} placeholder={k === 'illustrations' ? 'A story, image or example…' : 'What should they do this week?'} className={`${field} py-2.5 resize-none`} />
                <button onClick={() => delIn(k, x.id)} aria-label="Delete" className="h-11 w-9 shrink-0 grid place-items-center text-white/30"><X size={15} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => addTo(k)} className="mt-2 h-11 px-4 rounded-full border border-white/15 text-[12px] font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5 active:bg-white/10"><Plus size={14} /> Add</button>
        </section>
      ))}
    </div>
  );
};

// ── Step 4: script ───────────────────────────────────────────────────────────
const ScriptStep: React.FC<StepProps & { onRead: (id?: string | null) => void }> = ({ d, patch, onRead }) => {
  const words = wordCount(d.manuscript);
  const mins = Math.round((words / WORDS_PER_MIN) * 10) / 10;
  const refs = useMemo(() => {
    const seen = new Map<string, ScriptureRef>();
    findRefs(d.manuscript).forEach(r => { if (!seen.has(refId(r))) seen.set(refId(r), r); });
    return [...seen.values()];
  }, [d.manuscript]);
  const over = mins > d.targetMinutes + 2, under = mins < d.targetMinutes - 4 && words > 0;

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
          <p className="text-[18px] font-black tabular-nums leading-none">{mins}<span className="text-[11px] text-white/40"> / {d.targetMinutes} min</span></p>
          <p className={`mt-1 text-[11px] ${over ? 'text-amber-400' : under ? 'text-white/40' : 'text-emerald-400'}`}>{words} words{over ? ' · running long' : under ? ' · room to grow' : words ? ' · on target' : ''}</p>
        </div>
        <button onClick={() => { if (!d.manuscript.trim() || confirm('Replace the manuscript with a draft built from your outline?')) patch({ manuscript: manuscriptFromOutline(d) }); }}
          className="h-[58px] px-4 rounded-2xl border border-white/15 text-[11px] font-black uppercase tracking-widest text-white/70 active:bg-white/10">From outline</button>
      </div>
      <textarea value={d.manuscript} onChange={e => patch({ manuscript: e.target.value })} aria-label="Manuscript"
        placeholder="Write or paste your manuscript. Scripture references are picked up automatically." className={`${field} resize-none leading-relaxed min-h-[52dvh]`} style={{ fontFamily: 'Georgia, serif', fontSize: 17 }} />
      {refs.length > 0 && (
        <div>
          <h2 className={label}>Scripture in your manuscript</h2>
          <div className="flex flex-wrap gap-2">
            {refs.map(r => (
              <button key={refId(r)} onClick={() => onRead(refId(r))} className="h-11 px-4 rounded-full border border-[#d4af37]/35 text-[12px] font-black active:bg-white/10" style={{ color: GOLD }}>{formatRef(r, 'display')}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Step 5: preach ───────────────────────────────────────────────────────────
// A pulpit view, not an editor: big type, dark, no chrome, screen kept awake.
const Preach: React.FC<StepProps & { onExit: () => void }> = ({ d, onExit }) => {
  const hasScript = d.manuscript.trim().length > 0;
  const [mode, setMode] = useState<'script' | 'outline'>(hasScript ? 'script' : 'outline');
  const [size, setSize] = useState(() => Number(localStorage.getItem('plajah_preach_size_v1')) || 22);
  const [secs, setSecs] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => { try { localStorage.setItem('plajah_preach_size_v1', String(size)); } catch { /* private mode */ } }, [size]);
  useEffect(() => { if (!running) return; const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t); }, [running]);
  useEffect(() => {
    let lock: any = null; let dead = false;
    const get = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); if (dead) lock?.release?.(); } catch { /* unsupported / denied */ } };
    void get();
    const vis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; document.removeEventListener('visibilitychange', vis); lock?.release?.(); };
  }, []);

  const target = d.targetMinutes * 60;
  const left = target - secs;
  const clock = `${left < 0 ? '+' : ''}${Math.floor(Math.abs(left) / 60)}:${String(Math.abs(left) % 60).padStart(2, '0')}`;
  const warn = left < 0 ? '#f87171' : left < 300 ? '#fbbf24' : 'rgba(255,255,255,0.55)';

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black text-[#E8E0CC]" style={{ height: '100dvh' }}>
      <header className="shrink-0 flex items-center gap-1 px-2 h-14 border-b border-white/10">
        <button onClick={onExit} aria-label="Leave preach mode" className="h-11 w-11 grid place-items-center rounded-full text-white/60 active:bg-white/10"><X size={20} /></button>
        <button onClick={() => setRunning(r => !r)} aria-label={running ? 'Pause timer' : 'Start timer'} className="h-11 px-3 flex items-center gap-2 rounded-full active:bg-white/10">
          {running ? <Pause size={16} /> : <Play size={16} />}
          <span className="text-[17px] font-black tabular-nums" style={{ color: warn }}>{clock}</span>
        </button>
        <div className="ml-auto flex items-center">
          {hasScript && (
            <button onClick={() => setMode(m => (m === 'script' ? 'outline' : 'script'))} className="h-11 px-3 text-[11px] font-black uppercase tracking-widest text-white/60">{mode === 'script' ? 'Outline' : 'Script'}</button>
          )}
          <button onClick={() => setSize(s => Math.max(16, s - 2))} aria-label="Smaller" className="h-11 w-10 grid place-items-center text-white/60"><Minus size={16} /></button>
          <button onClick={() => setSize(s => Math.min(40, s + 2))} aria-label="Larger" className="h-11 w-10 grid place-items-center text-white/60"><Plus size={16} /></button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto overscroll-contain px-5 py-6" style={{ fontFamily: 'Georgia, "Palatino Linotype", serif', fontSize: size, lineHeight: 1.6 }}>
        <p className="mb-5 font-sans text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: GOLD }}>{d.title || 'Sermon'}{d.passage ? ` · ${d.passage}` : ''}</p>
        {mode === 'script' && hasScript ? (
          <div className="whitespace-pre-wrap">{d.manuscript}</div>
        ) : (
          <div className="space-y-7">
            {d.bigIdea && <p style={{ color: GOLD }}>{d.bigIdea}</p>}
            {d.outline.filter(s => s.heading || s.body).map((s, i) => (
              <section key={s.id}>
                <h2 className="font-black" style={{ fontSize: size * 1.15 }}>{i + 1}. {s.heading || 'Point'}</h2>
                {s.body && <p className="mt-1 text-white/70">{s.body}</p>}
              </section>
            ))}
            {d.applications.length > 0 && (
              <section>
                <h2 className="font-black" style={{ color: GOLD, fontSize: size * 1.05 }}>Application</h2>
                <ul className="mt-1 list-disc pl-5 text-white/70">{d.applications.map(a => <li key={a.id}>{a.text}</li>)}</ul>
              </section>
            )}
          </div>
        )}
        <div style={{ height: '40dvh' }} />
      </main>
    </div>
  );
};

export default SermonPrep;
