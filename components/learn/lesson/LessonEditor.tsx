import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUp, ArrowDown, Trash2, Plus, EyeOff, Eye, Share2 } from 'lucide-react';
import { CALLOUT_PREFIX, matchCallout, type CalloutKind } from './folioParse';
import { newOverlay, validateOverlay, diffParagraphs, INTEGRITY_NOTE, LIMITS, type LessonOverlay } from './lessonOverlay';
import { saveOverlay, removeOverlay, myTeachingClasses, sharedFor, adopt, type ClassOption } from '../../../services/lessonOverlayService';
import FigureBlock from './FigureBlock';
import type { Figure } from './figures';

/**
 * The teacher's workshop for one lesson. The built lesson is the base model and is never changed: the teacher edits a copy that
 * belongs to them, applies to the classes they choose, carries their name, and can be shared with other teachers.
 */
export interface EditorBase { id: string; courseId: string; title: string; body: string; figures: Figure[] }
export interface Me { uid: string; name: string; school?: string }
type Kind = 'text' | CalloutKind;
interface EBlock { key: number; raw: string; kind: Kind; text: string; touched: boolean }
const KINDS: Array<[Kind, string]> = [['text', 'Paragraph'], ['worked', 'Worked example'], ['why', 'Why it matters'], ['trap', 'Trap'], ['try', 'Try this'], ['example', 'Example']];
const split = (s: string) => s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
let keySeed = 0;
const toBlocks = (body: string): EBlock[] => split(body).map(p => { const m = matchCallout(p); return { key: ++keySeed, raw: p, kind: m ? m.variant : 'text', text: m ? m.rest : p, touched: false }; });
const toBody = (bs: EBlock[]): string => bs.map(b => (b.touched ? (b.kind === 'text' ? b.text.trim() : b.text.trim() ? CALLOUT_PREFIX[b.kind] + b.text.trim() : '') : b.raw)).filter(Boolean).join('\n\n');

const field = 'w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-[13px] text-white placeholder:text-white/30';
const btn = 'rounded-full px-3.5 py-1.5 text-[12px] font-black border border-white/20 hover:bg-white/10 inline-flex items-center gap-1.5';

const AddFigure: React.FC<{ afterMax: number; onAdd: (f: Figure) => void }> = ({ afterMax, onAdd }) => {
  const [t, setT] = useState<'graph' | 'chart' | 'timeline' | 'plate' | 'video'>('graph');
  const [v, setV] = useState({ title: '', caption: '', expr: 'x^2 - 2x - 3', from: '-3', to: '5', xl: 'x', yl: 'y', csv: 'x,y\n1,2\n2,4\n3,9', rows: '1347 | Plague arrives\n1348 | It spreads', q: '', url: '', after: '1' });
  const set = (k: string, val: string) => setV(o => ({ ...o, [k]: val }));
  const build = (): Figure => {
    const base = { id: `t-${Date.now().toString(36)}`, caption: v.caption.trim(), after: Math.max(0, Math.min(afterMax, Number(v.after) - 1 || 0)), layout: 'inline' as const };
    if (t === 'graph') return { ...base, type: 'graph', title: v.title || `y = ${v.expr}`, expr: v.expr, domain: [Number(v.from), Number(v.to)], x: { label: v.xl }, y: { label: v.yl } };
    if (t === 'chart') {
      const rows = v.csv.split(/\n/).map(r => r.trim()).filter(Boolean).map(r => r.split(/[,\t]/).map(c => c.trim()));
      const head = rows[0] && rows[0].some(c => c !== '' && !isFinite(Number(c))) ? rows.shift()! : null; const cols = Math.max(...rows.map(r => r.length), 2) - 1;
      return { ...base, type: 'chart', kind: 'line', title: v.title || 'Chart', x: { label: v.xl }, y: { label: v.yl }, series: Array.from({ length: cols }, (_, i) => ({ name: head?.[i + 1] || `Series ${i + 1}`, points: rows.map(r => [Number(r[0]), Number(r[i + 1])] as [number, number]) })) };
    }
    if (t === 'timeline') return { ...base, type: 'timeline', title: v.title || 'Timeline', events: v.rows.split(/\n/).map(r => r.split('|')).filter(r => r.length >= 2).map(r => ({ when: r[0].trim(), label: r.slice(1).join('|').trim() })) };
    if (t === 'plate') return { ...base, type: 'plate', ref: { kind: 'image', q: v.q.trim(), limit: 1 }, layout: 'wide' };
    return { ...base, type: 'video', url: v.url.trim(), layout: 'wide' };
  };
  return (
    <div className="rounded-xl border border-white/12 p-3 grid gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Figure type">{([['graph', 'Graph from a formula'], ['chart', 'Chart from numbers'], ['timeline', 'Timeline'], ['plate', 'Picture or artwork'], ['video', 'Video']] as const).map(([id, l]) => <button key={id} type="button" aria-pressed={t === id} onClick={() => setT(id)} className={`px-3 py-1 rounded-full text-[11px] font-black border ${t === id ? 'bg-white text-black border-white' : 'border-white/20 text-white/70'}`}>{l}</button>)}</div>
      {(t === 'graph' || t === 'chart' || t === 'timeline') && <input aria-label="Figure title" className={field} placeholder="Title" value={v.title} onChange={e => set('title', e.target.value)} />}
      {t === 'graph' && <><input aria-label="Formula" className={field} placeholder="Formula in x, e.g. x^2 - 2x - 3, sin(x), 2^x" value={v.expr} onChange={e => set('expr', e.target.value)} /><div className="grid grid-cols-2 gap-2"><input aria-label="x from" className={field} value={v.from} onChange={e => set('from', e.target.value)} placeholder="x from" /><input aria-label="x to" className={field} value={v.to} onChange={e => set('to', e.target.value)} placeholder="x to" /></div></>}
      {(t === 'graph' || t === 'chart') && <div className="grid grid-cols-2 gap-2"><input aria-label="Horizontal axis label" className={field} placeholder="Horizontal label" value={v.xl} onChange={e => set('xl', e.target.value)} /><input aria-label="Vertical axis label" className={field} placeholder="Vertical label" value={v.yl} onChange={e => set('yl', e.target.value)} /></div>}
      {t === 'chart' && <textarea aria-label="Numbers" rows={5} className={field} value={v.csv} onChange={e => set('csv', e.target.value)} placeholder="x,y per line; add more columns for more lines. A first line of names is optional." />}
      {t === 'timeline' && <textarea aria-label="Timeline rows" rows={4} className={field} value={v.rows} onChange={e => set('rows', e.target.value)} placeholder="date | what happened" />}
      {t === 'plate' && <input aria-label="Search words" className={field} placeholder="Words to search the archives for, e.g. Cezanne Mont Sainte-Victoire" value={v.q} onChange={e => set('q', e.target.value)} />}
      {t === 'video' && <input aria-label="Video link" className={field} placeholder="https:// link to a video (YouTube or a file)" value={v.url} onChange={e => set('url', e.target.value)} />}
      <input aria-label="Caption" className={field} placeholder="Caption: what should students notice?" value={v.caption} onChange={e => set('caption', e.target.value)} />
      <label className="text-[12px] text-white/60 flex items-center gap-2">Place it after paragraph <input aria-label="After paragraph" className={`${field} !w-16`} value={v.after} onChange={e => set('after', e.target.value)} /></label>
      <button type="button" className={btn} onClick={() => onAdd(build())}><Plus size={13} /> Add this figure</button>
    </div>);
};

const LessonEditor: React.FC<{ base: EditorBase; existing?: LessonOverlay | null; me: Me; onClose: () => void; onSaved: (o: LessonOverlay | null) => void }> = ({ base, existing, me, onClose, onSaved }) => {
  const [draft] = useState<LessonOverlay>(() => existing || newOverlay(base, me, []));
  const [blocks, setBlocks] = useState<EBlock[]>(() => toBlocks(draft.body));
  const [title, setTitle] = useState(draft.title || '');
  const [note, setNote] = useState(draft.note || '');
  const [hide, setHide] = useState<string[]>(draft.hideFigures);
  const [added, setAdded] = useState<Figure[]>(draft.addFigures);
  const [classIds, setClassIds] = useState<string[]>(draft.classIds);
  const [share, setShare] = useState(draft.visibility === 'shared');
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { myTeachingClasses(me.uid).then(setClasses); }, [me.uid]);

  const upd = (i: number, p: Partial<EBlock>) => setBlocks(bs => bs.map((b, j) => (j === i ? { ...b, ...p, touched: true } : b)));
  const move = (i: number, d: number) => setBlocks(bs => { const j = i + d; if (j < 0 || j >= bs.length) return bs; const c = [...bs]; [c[i], c[j]] = [c[j], c[i]]; return c.map(b => ({ ...b, touched: b.touched })); });
  const body = useMemo(() => toBody(blocks), [blocks]);
  const diff = useMemo(() => diffParagraphs(base.body, body), [base.body, body]);

  const build = (): LessonOverlay => ({ ...draft, title: title.trim() || undefined, body, note: note.trim() || undefined, hideFigures: hide, addFigures: added, classIds, visibility: share ? 'shared' : 'class', authorName: me.name, ...(me.school ? { schoolName: me.school } : {}) } as LessonOverlay);
  const save = async () => {
    const o = build(); const pre = validateOverlay(o); if (pre.length) { setErrors(pre); return; }
    setBusy(true); const r = await saveOverlay(o); setBusy(false);
    if (!r.ok) { setErrors(r.errors); return; }
    setMsg(r.where === 'cloud' ? 'Saved. Your class will see this version.' : 'Saved on this device. It will reach your class when you are back online.'); onSaved(o); setTimeout(onClose, 700);
  };
  const del = async () => { if (!existing) return onClose(); setBusy(true); await removeOverlay(existing); setBusy(false); onSaved(null); onClose(); };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Customize this lesson" className="fixed inset-0 z-[340] bg-black/85 backdrop-blur-sm flex justify-center" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="w-full max-w-3xl h-full overflow-y-auto bg-[#0e0b16] border-x border-white/10 text-white p-5 sm:p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4"><div className="flex-1"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#5ff0c6]">Customize for your class</p><h2 className="text-xl font-black leading-tight">{base.title}</h2></div><button type="button" aria-label="Close" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10"><X size={18} /></button></div>
        <p className="text-[12px] text-white/60 mb-4 leading-relaxed">The original lesson stays as it is. Your changes are a separate version with your name on it, shown only to the classes you choose. {INTEGRITY_NOTE}</p>

        <div className="grid gap-5">
          <section aria-label="Classes"><h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2">Which classes see this version</h3>
            {classes === null ? <p className="text-[12px] text-white/40">Loading your classes...</p> : classes.length === 0 ? <p className="text-[12px] text-amber-300">You have no classes yet. You can still save this and share it with other teachers.</p>
              : <div className="flex flex-wrap gap-2">{classes.map(c => <label key={c.id} className="text-[12px] flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5"><input type="checkbox" checked={classIds.includes(c.id)} onChange={e => setClassIds(ids => (e.target.checked ? [...ids, c.id] : ids.filter(x => x !== c.id)))} /> {c.title}</label>)}</div>}
          </section>

          <section aria-label="Title"><h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2">Title (optional)</h3><input aria-label="Lesson title" className={field} value={title} placeholder={base.title} onChange={e => setTitle(e.target.value)} maxLength={LIMITS.titleChars} /></section>

          <section aria-label="Text"><h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2">Lesson text <span className="normal-case tracking-normal text-white/40">({diff.added} changed or new, {diff.removed} removed)</span></h3>
            <div className="grid gap-3">{blocks.map((b, i) => (
              <div key={b.key} className={`rounded-xl border p-3 grid gap-2 ${b.touched ? 'border-[#5ff0c6]/50' : 'border-white/12'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <select aria-label={`Paragraph ${i + 1} type`} className={`${field} !w-auto`} value={b.kind} onChange={e => upd(i, { kind: e.target.value as Kind })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <span className="ml-auto flex gap-1"><button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="p-1.5 rounded hover:bg-white/10"><ArrowUp size={14} /></button><button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="p-1.5 rounded hover:bg-white/10"><ArrowDown size={14} /></button><button type="button" aria-label="Delete paragraph" onClick={() => setBlocks(bs => bs.filter((_, j) => j !== i))} className="p-1.5 rounded hover:bg-white/10 text-rose-300"><Trash2 size={14} /></button></span>
                </div>
                <textarea aria-label={`Paragraph ${i + 1} text`} rows={Math.min(8, Math.max(2, Math.ceil(b.text.length / 70)))} className={field} value={b.text} onChange={e => upd(i, { text: e.target.value })} />
              </div>))}
            </div>
            <button type="button" className={`${btn} mt-3`} onClick={() => setBlocks(bs => [...bs, { key: ++keySeed, raw: '', kind: 'text', text: '', touched: true }])}><Plus size={13} /> Add a paragraph or callout</button>
          </section>

          <section aria-label="Figures"><h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2">Pictures, graphs and diagrams</h3>
            {base.figures.length > 0 && <div className="grid gap-2 mb-3">{base.figures.map(f => { const h = hide.includes(f.id); return <div key={f.id} className="flex items-center gap-3 text-[12px] rounded-lg border border-white/12 px-3 py-2"><span className="flex-1 text-white/75">{('title' in f && f.title) || f.caption.slice(0, 70)} <span className="text-white/35">({f.type})</span></span><button type="button" className={btn} onClick={() => setHide(x => (h ? x.filter(i => i !== f.id) : [...x, f.id]))}>{h ? <><Eye size={13} /> Show</> : <><EyeOff size={13} /> Hide</>}</button></div>; })}</div>}
            {added.map(f => <div key={f.id} className="mb-3"><div className="flex items-center gap-2 mb-1"><span className="text-[11px] text-[#5ff0c6] font-black uppercase tracking-widest">Added by you</span><button type="button" className={btn} onClick={() => setAdded(a => a.filter(x => x.id !== f.id))}><Trash2 size={13} /> Remove</button></div><div className="folio" style={{ ['--acc' as any]: '#5ff0c6', ['--acc2' as any]: '#ffb547', ['--acc3' as any]: '#e9e4da', ['--paper' as any]: '#14111e' }}><FigureBlock f={f} /></div></div>)}
            <AddFigure afterMax={Math.max(0, blocks.filter(b => b.kind === 'text').length - 1)} onAdd={f => setAdded(a => [...a, f])} />
          </section>

          <section aria-label="Note"><h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2">Why you changed it (shown to your class)</h3><textarea aria-label="Note" rows={2} className={field} value={note} maxLength={LIMITS.noteChars} onChange={e => setNote(e.target.value)} placeholder="For example: I added a local example and a second graph." /></section>

          <section aria-label="Sharing"><label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-1" checked={share} onChange={e => setShare(e.target.checked)} /><span><Share2 size={13} className="inline mr-1" /> Share this version with other teachers. They can adopt it for their own classes. Your name stays on it, and anything they change is credited to them.</span></label></section>

          {errors.length > 0 && <ul role="alert" className="text-[12px] text-rose-300 list-disc pl-5">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
          {msg && <p role="status" className="text-[12px] text-[#5ff0c6]">{msg}</p>}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10"><button type="button" disabled={busy} onClick={save} className="rounded-full bg-[#5ff0c6] text-black px-6 py-2.5 text-[13px] font-black disabled:opacity-40">{busy ? 'Saving...' : 'Save this version'}</button><button type="button" onClick={onClose} className={btn}>Cancel</button>{existing && <button type="button" onClick={del} className={`${btn} text-rose-300 ml-auto`}><Trash2 size={13} /> Delete my version</button>}</div>
        </div>
      </div>
    </div>, document.body);
};
export default LessonEditor;

/** Browse versions other teachers have shared for this lesson, and adopt one for your own classes. */
export const SharedVersions: React.FC<{ base: EditorBase; me: Me; onClose: () => void; onAdopted: (o: LessonOverlay) => void }> = ({ base, me, onClose, onAdopted }) => {
  const [list, setList] = useState<LessonOverlay[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { sharedFor(base.id).then(l => setList(l.filter(o => o.authorUid !== me.uid))); myTeachingClasses(me.uid).then(setClasses); }, [base.id, me.uid]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Teacher versions" className="fixed inset-0 z-[340] bg-black/85 backdrop-blur-sm flex justify-center" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="w-full max-w-2xl h-full overflow-y-auto bg-[#0e0b16] border-x border-white/10 text-white p-5 sm:p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3"><div className="flex-1"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#5ff0c6]">Teacher versions</p><h2 className="text-xl font-black">{base.title}</h2></div><button type="button" aria-label="Close" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10"><X size={18} /></button></div>
        <p className="text-[12px] text-white/60 mb-4">Versions other teachers have shared. {INTEGRITY_NOTE}</p>
        {classes.length > 0 && <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Classes to use it in">{classes.map(c => <label key={c.id} className="text-[12px] flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5"><input type="checkbox" checked={pick.includes(c.id)} onChange={e => setPick(p => (e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id)))} /> {c.title}</label>)}</div>}
        {list === null && <p className="text-white/40 text-sm">Looking for shared versions...</p>}
        {list && list.length === 0 && <p className="text-white/50 text-sm">No one has shared a version of this lesson yet.</p>}
        <div className="grid gap-3">{(list || []).map(o => { const d = diffParagraphs(base.body, o.body); return (
          <div key={o.id} className="rounded-xl border border-white/12 p-4"><p className="font-black">{o.authorName}{o.schoolName ? `, ${o.schoolName}` : ''}</p>{o.forkedFrom && <p className="text-[11px] text-white/45">Adapted from {o.forkedFrom.authorName}'s version</p>}
            <p className="text-[12px] text-white/60 mt-1">{d.added} paragraph{d.added === 1 ? '' : 's'} changed or added, {d.removed} removed, {(o.addFigures || []).length} figure{(o.addFigures || []).length === 1 ? '' : 's'} added.</p>
            {o.note && <p className="text-[13px] italic text-white/75 mt-1">"{o.note}"</p>}
            <button type="button" disabled={!pick.length} onClick={async () => { const r = await adopt(o, me, pick); setMsg(r.result.ok ? `Added to your classes, credited to ${o.authorName}. You can edit your copy.` : r.result.errors.join(' ')); if (r.result.ok) onAdopted(r.overlay); }} className={`${btn} mt-2 disabled:opacity-40`}>Use in my {pick.length > 1 ? 'classes' : 'class'}</button>
          </div>); })}</div>
        {!classes.length && <p className="text-[12px] text-amber-300 mt-3">You need a class to use a shared version.</p>}
        {msg && <p role="status" className="text-[12px] text-[#5ff0c6] mt-3">{msg}</p>}
      </div>
    </div>, document.body);
};
