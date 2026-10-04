// InspectionPanel - digital vehicle inspection (DVI) for a repair order. Two screens in one full-screen sheet:
//   1. CHECKLIST (tech, phone-first): big PASS / WATCH / FAIL buttons, measurements with suggested status, photo or
//      video per item (camera capture), notes with voice dictation (Web Speech API where the browser has it).
//   2. REVIEW (advisor): recommended work grouped Do now / Soon / Later, priced ONLY from the shop labor rate, parts
//      markup and price book; optional AI-drafted plain-English explanations (labelled DRAFT, always editable);
//      then "Add to estimate" (lines go in PENDING approval) and "Share with customer".
// The model never sets a price, and nothing reaches the customer until the advisor presses Share / Send.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  templateById, sectionsOf, statusFromMeasure, summarize, recommendations, priceRecommendation, newInspection, formatMeasure, PRIORITY_LABEL, PRIORITIES,
  type Inspection, type InspectionItemState, type ItemStatus, type Priority, type Recommendation, type TemplateItem,
} from '../../../services/inspectionCore';
import type { AdvisorDraft } from '../../../services/advisorCore';
import { autoApiFor } from './autoApi';
import type { DetailPanelProps } from '../tickets/panelRegistry';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(Math.max(0, c) / 100).toFixed(2)}`;
const lbl = 'text-[10px] font-black uppercase tracking-widest text-white/40';
const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-white/30 w-full text-white';
const COL: Record<string, string> = { PASS: '#06D6A0', WATCH: '#FFD166', FAIL: '#D40055' };
const PCOL: Record<Priority, string> = { SAFETY: '#D40055', SOON: '#FF8C00', LATER: '#06D6A0' };

// ── voice dictation (progressive enhancement) ──────────────────────────────────────────────────────
function useDictation(onText: (t: string) => void) {
  const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const rec = useRef<any>(null); const [on, setOn] = useState(false);
  const toggle = () => {
    if (!SR) return;
    if (on) { rec.current?.stop(); return; }
    const r = new SR(); r.lang = navigator.language || 'en-US'; r.interimResults = false; r.continuous = false;
    r.onresult = (e: any) => { const t = Array.from(e.results).map((x: any) => x[0]?.transcript || '').join(' ').trim(); if (t) onText(t); };
    r.onend = () => setOn(false); r.onerror = () => setOn(false);
    rec.current = r; setOn(true); try { r.start(); } catch { setOn(false); }
  };
  return { supported: !!SR, on, toggle };
}
function Mic({ onText, label = 'Dictate' }: { onText: (t: string) => void; label?: string }) {
  const d = useDictation(onText);
  if (!d.supported) return null;
  return <button type="button" onClick={d.toggle} aria-pressed={d.on} aria-label={label} title="Dictate (your browser's speech service may process the audio)" className={`shrink-0 min-h-[48px] min-w-[48px] rounded-xl text-lg ${d.on ? 'bg-[#D40055] text-white animate-pulse' : 'bg-white/10 text-white/70'}`}>🎤</button>;
}

// ── one checklist item ─────────────────────────────────────────────────────────────────────────────
function ItemCard({ def, st, onChange, upload, busy }: { def: TemplateItem; st: InspectionItemState; onChange: (p: Partial<InspectionItemState>) => void; upload: (f: File) => Promise<void>; busy: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const suggestion = def.measure && st.measurement !== undefined ? statusFromMeasure(def.measure, st.measurement) : 'UNSET';
  const setM = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, ''); const n = clean === '' ? undefined : Number(clean);
    const patch: Partial<InspectionItemState> = { measurement: n };
    if (def.measure && n !== undefined) { const s = statusFromMeasure(def.measure, n); if (s !== 'UNSET' && (st.status === 'UNSET' || st.status === suggestion)) patch.status = s; }
    onChange(patch);
  };
  return (
    <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 space-y-2.5" data-testid={`item-${def.id}`}>
      <div className="flex items-center gap-2"><div className="font-bold flex-1">{def.label}{def.safety && <span className="ml-2 text-[9px] font-black uppercase text-white/35">safety</span>}</div>
        {st.status !== 'UNSET' && <button onClick={() => onChange({ status: 'UNSET' })} className="text-[10px] text-white/30 px-2 min-h-[32px]">clear</button>}</div>
      <div className="grid grid-cols-3 gap-2">
        {(['PASS', 'WATCH', 'FAIL'] as const).map(k => (
          <button key={k} type="button" aria-pressed={st.status === k} onClick={() => onChange({ status: st.status === k ? 'UNSET' : k })}
            className="min-h-[56px] rounded-2xl text-sm font-black uppercase tracking-wide border-2 transition active:scale-95"
            style={st.status === k ? { background: COL[k], borderColor: COL[k], color: k === 'WATCH' ? '#1a1400' : k === 'PASS' ? '#001a12' : '#fff' } : { borderColor: COL[k] + '66', color: COL[k] }}>
            {k === 'PASS' ? 'Pass' : k === 'WATCH' ? 'Watch' : 'Fail'}
          </button>
        ))}
      </div>
      {def.measure && (
        <div className="flex items-center gap-2">
          <label className="flex-1 flex items-center gap-2 text-xs text-white/50">{def.measure.label}
            <input value={st.measurement ?? ''} onChange={e => setM(e.target.value)} inputMode="decimal" aria-label={`${def.label} ${def.measure.label}`} className={inp + ' !w-24 text-center text-lg font-black'} /> {def.measure.unit}</label>
          {suggestion !== 'UNSET' && <span className="text-[10px] font-black uppercase" style={{ color: COL[suggestion] }}>reads {suggestion.toLowerCase()}</span>}
        </div>
      )}
      <div className="flex gap-2 items-start">
        <textarea value={st.note || ''} onChange={e => onChange({ note: e.target.value })} rows={2} placeholder="Tech note (internal)" aria-label={`${def.label} note`} className={inp + ' resize-none'} />
        <Mic onText={t => onChange({ note: `${st.note ? st.note + ' ' : ''}${t}` })} />
        <button type="button" disabled={busy} onClick={() => file.current?.click()} aria-label="Add photo or video" className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl bg-white/10 text-lg disabled:opacity-40">📷</button>
        <input ref={file} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) await upload(f); if (file.current) file.current.value = ''; }} />
      </div>
      {st.attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">{st.attachments.map((a, i) => (
          <div key={i} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-black/40">
            {a.kind === 'video' ? <video src={a.url} className="w-full h-full object-cover" /> : <img src={a.url} alt="" className="w-full h-full object-cover" />}
            <button onClick={() => onChange({ attachments: st.attachments.filter((_, j) => j !== i) })} className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/70 text-xs" aria-label="Remove">x</button>
          </div>))}</div>
      )}
    </div>
  );
}

// ── review / advisor ───────────────────────────────────────────────────────────────────────────────
interface RecState { include: boolean; hours: string; partPrice: string; laborPrice: string; note: string; aiNote: boolean; priority: Priority }

function Review({ insp, setInsp, onBack, props, flush }: { insp: Inspection; setInsp: (i: Inspection) => void; onBack: () => void; props: DetailPanelProps; flush: () => Promise<Inspection | null> }) {
  const { api, cfg, ticket, onChanged } = props; const auto = autoApiFor(api)!;
  const pc: any = (cfg.panelConfig as any)?.inspection || {};
  const pricing = useMemo(() => ({ laborRateCents: cfg.laborRateCents || 0, partsMarkupPct: cfg.partsMarkupPct || 0, priceBook: pc.priceBook }), [cfg, pc.priceBook]);
  const recs = useMemo(() => recommendations(insp), [insp]);
  const [rs, setRs] = useState<Record<string, RecState>>({});
  const [draft, setDraft] = useState<{ d: AdvisorDraft; source: string; label: string; photos: number } | null>(null);
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const get = (r: Recommendation): RecState => rs[r.itemId] || { include: true, hours: r.hours !== undefined ? String(pc.priceBook?.[r.itemId]?.hours ?? r.hours) : '', partPrice: '', laborPrice: '', note: insp.items[r.itemId]?.customerNote || '', aiNote: false, priority: r.priority };
  const patch = (id: string, p: Partial<RecState>, r: Recommendation) => setRs(x => ({ ...x, [id]: { ...get(r), ...x[id], ...p } }));
  const onTicket = (r: Recommendation) => ticket.lines.some(l => l.description === r.description);

  const linesFor = (r: Recommendation) => {
    const s = get(r);
    const book = { ...(pricing.priceBook || {}) } as any;
    const h = parseFloat(s.hours);
    book[r.itemId] = { ...(book[r.itemId] || {}), ...(h > 0 ? { hours: h } : {}) };
    return priceRecommendation({ ...r, priority: s.priority }, { ...pricing, priceBook: book }).map(l => {
      const cents = (v: string) => Math.round(parseFloat(v) * 100);
      if (l.kind === 'PART' && l.needsPrice && parseFloat(s.partPrice) > 0) return { ...l, unitPriceCents: cents(s.partPrice), needsPrice: false };
      if (l.kind === 'LABOR' && l.needsPrice && parseFloat(s.laborPrice) > 0) return { ...l, unitPriceCents: cents(s.laborPrice), needsPrice: false };
      return l;
    });
  };

  const runAdvisor = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      const saved = await flush(); if (saved) setInsp(saved);
      const r = await auto.advisorDraft(ticket.id, photos);
      setDraft({ d: r.draft, source: r.source, label: r.label, photos: r.photosUsed });
      setRs(x => {
        const n = { ...x };
        for (const it of r.draft.items) {
          const rec = recs.find(y => y.itemId === it.itemId); if (!rec) continue;
          const cur = { ...(x[it.itemId] || { include: true, hours: rec.hours !== undefined ? String(rec.hours) : '', partPrice: '', laborPrice: '', note: '', aiNote: false, priority: rec.priority }) };
          if (!cur.note.trim()) { cur.note = it.explanation; cur.aiNote = true; }
          cur.priority = it.priority;
          n[it.itemId] = cur;
        }
        return n;
      });
    } catch (e: any) { setErr(e?.message || 'Could not get a draft. You can still write the explanations yourself.'); } finally { setBusy(false); }
  };

  const addAll = async () => {
    const chosen = recs.filter(r => get(r).include && !onTicket(r));
    const all = chosen.flatMap(r => linesFor(r).map(l => ({ r, l })));
    const missing = all.filter(x => x.l.needsPrice && x.l.unitPriceCents <= 0);
    if (missing.length) return setErr(`Enter a price for ${missing.length} line(s) marked "needs price" (or untick them). Prices come from your shop, never from the AI.`);
    if (!all.length) return setErr('Nothing new to add.');
    setBusy(true); setErr(''); setOk('');
    try {
      // 1. customer-facing explanations onto the inspection items (advisor-approved text only)
      const items = { ...insp.items };
      for (const r of recs) { const s = get(r); if (s.note.trim()) items[r.itemId] = { ...items[r.itemId], customerNote: s.note.trim(), ...(s.priority !== r.priority ? { priority: s.priority } : {}) }; }
      const next = { ...insp, items }; setInsp(next);
      await auto.saveInspection(ticket.id, next);
      // 2. estimate lines (server sets them PENDING approval)
      let t = ticket;
      for (const { l } of all) t = await api.line(ticket.id, { op: 'add', line: { kind: l.kind, description: l.description, qty: l.qty, unitPriceCents: l.unitPriceCents, ...(l.costCents !== undefined ? { costCents: l.costCents } : {}), ...(l.unit ? { unit: l.unit } : {}), group: l.group, ...(l.notes ? { notes: l.notes } : {}) } });
      onChanged(t); setOk(`${all.length} line(s) added to the estimate, waiting for customer approval.`);
    } catch (e: any) { setErr(e?.message || 'Could not add the lines.'); } finally { setBusy(false); }
  };
  const share = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      const items = { ...insp.items };
      for (const r of recs) { const s = get(r); if (s.note.trim()) items[r.itemId] = { ...items[r.itemId], customerNote: s.note.trim() }; }
      const next = { ...insp, items }; setInsp(next);
      await auto.saveInspection(ticket.id, { ...next, complete: true }); await auto.shareInspection(ticket.id, true);
      setOk('Shared. The customer sees the inspection report on their estimate link.');
    } catch (e: any) { setErr(e?.message || 'Could not share.'); } finally { setBusy(false); }
  };

  const grouped = PRIORITIES.map(p => ({ p, items: recs.filter(r => get(r).priority === p) })).filter(g => g.items.length);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><button onClick={onBack} className="min-h-[44px] px-4 rounded-full bg-white/10 text-[11px] font-black uppercase">Back to checklist</button><div className="text-lg font-black italic uppercase" style={{ fontFamily: 'Outfit, sans-serif' }}>Review &amp; estimate</div></div>
      {err && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8]">{err}</div>}
      {ok && <div role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">{ok}</div>}
      {!recs.length ? <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">Nothing needs work. Share the all-clear report with the customer below.</div> : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button disabled={busy} onClick={runAdvisor} className="min-h-[48px] px-4 rounded-xl text-[11px] font-black uppercase text-white disabled:opacity-40" style={{ background: GRAD }}>{busy ? 'Working...' : 'Draft explanations with AI'}</button>
            <label className="text-[11px] text-white/50 flex items-center gap-1.5"><input type="checkbox" checked={photos} onChange={e => setPhotos(e.target.checked)} className="accent-[#D40055]" />Include up to 3 photos (may show plates or people)</label>
          </div>
          <div className="text-[11px] text-white/40">Sends only vehicle year/make/model, findings and tech notes with phone numbers, emails, VIN and plates removed. AI writes wording and rough hour ranges only; prices below come from your labor rate and price book. A person must review everything.</div>
          {draft && <div className="text-xs font-bold text-amber-300" role="status">{draft.source === 'AI' ? 'AI DRAFT' : 'STANDARD WORDING'}: {draft.label}{draft.d.issues.length ? ` (${draft.d.issues.join(' ')})` : ''}</div>}
          {draft?.d.summary && <div className="text-xs text-white/60 italic">AI summary draft: {draft.d.summary}</div>}
        </div>
      )}
      {grouped.map(g => (
        <div key={g.p} className="space-y-2">
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: PCOL[g.p] }}>{PRIORITY_LABEL[g.p]}</div>
          {g.items.map(r => {
            const s = get(r); const done = onTicket(r); const ls = linesFor(r); const ai = draft?.d.items.find(x => x.itemId === r.itemId);
            return (
              <div key={r.itemId} className={`rounded-2xl border p-3 space-y-2 ${done ? 'border-white/5 opacity-60' : 'border-white/10 bg-white/[0.04]'}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={s.include && !done} disabled={done} onChange={e => patch(r.itemId, { include: e.target.checked }, r)} className="mt-1 w-5 h-5 accent-[#D40055]" aria-label={`Include ${r.description}`} />
                  <div className="flex-1 min-w-0"><div className="font-bold text-sm">{r.description}</div><div className="text-[11px] text-white/45">{r.label} · {r.status.toLowerCase()}{r.evidence ? ` · ${r.evidence}` : ''}</div></div>
                  <select value={s.priority} onChange={e => patch(r.itemId, { priority: e.target.value as Priority }, r)} aria-label="Priority" className="bg-white/5 border border-white/10 rounded-lg px-2 min-h-[40px] text-xs text-white">{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
                </div>
                {r.photos.length > 0 && <div className="flex gap-1.5">{r.photos.slice(0, 4).map(u => <img key={u} src={u} alt="" className="w-14 h-14 rounded-lg object-cover" />)}</div>}
                {!done && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end text-xs text-white/50">
                    <label>Labor hours<input value={s.hours} onChange={e => patch(r.itemId, { hours: e.target.value.replace(/[^0-9.]/g, '') }, r)} inputMode="decimal" className={inp} aria-label="Labor hours" /></label>
                    {ai?.hoursLow !== undefined && <button type="button" onClick={() => patch(r.itemId, { hours: String(Math.round(((ai.hoursLow! + ai.hoursHigh!) / 2) * 10) / 10) }, r)} className="text-left rounded-lg bg-amber-400/10 border border-amber-400/30 px-2 py-1.5 text-[11px] text-amber-200">AI estimate {ai.hoursLow}-{ai.hoursHigh} h. Tap to use the midpoint.</button>}
                    {ls.filter(l => l.needsPrice).map(l => <label key={l.kind} className="text-amber-200">{l.kind === 'PART' ? 'Part price $' : 'Labor price $'} (needs price)<input value={l.kind === 'PART' ? s.partPrice : s.laborPrice} onChange={e => patch(r.itemId, l.kind === 'PART' ? { partPrice: e.target.value.replace(/[^0-9.]/g, '') } : { laborPrice: e.target.value.replace(/[^0-9.]/g, '') }, r)} inputMode="decimal" className={inp} /></label>)}
                    <div className="col-span-2 sm:col-span-4 text-[11px] text-white/50">{ls.map(l => `${l.description} ${l.needsPrice ? '(needs price)' : `${l.qty}${l.unit ? ' ' + l.unit : ''} x ${money(l.unitPriceCents)}`}`).join('  ·  ')}{ai?.parts.length ? `  ·  AI part names: ${ai.parts.join(', ')}` : ''}</div>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2"><div className={lbl}>What the customer reads</div>{s.aiNote && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200">AI draft - edit</span>}</div>
                  <div className="flex gap-2 items-start"><textarea value={s.note} onChange={e => patch(r.itemId, { note: e.target.value, aiNote: false }, r)} rows={2} className={inp + ' resize-none'} aria-label="Customer explanation" placeholder="Plain-English explanation for the customer" /><Mic onText={t => patch(r.itemId, { note: `${s.note ? s.note + ' ' : ''}${t}`, aiNote: false }, r)} /></div>
                </div>
                {done && <div className="text-[11px] text-emerald-300">Already on the estimate.</div>}
              </div>
            );
          })}
        </div>
      ))}
      <div className="sticky bottom-0 bg-[#12121a]/95 backdrop-blur py-3 flex gap-2 flex-wrap">
        {recs.length > 0 && <button disabled={busy} onClick={addAll} className="flex-1 min-h-[52px] px-4 rounded-xl text-sm font-black uppercase text-white disabled:opacity-40" style={{ background: GRAD }}>Add selected to estimate</button>}
        <button disabled={busy} onClick={share} className="flex-1 min-h-[52px] px-4 rounded-xl text-sm font-black uppercase bg-white/10 hover:bg-white/20 disabled:opacity-40">Share report with customer</button>
      </div>
      <div className="text-[11px] text-white/40">Lines are added as waiting for approval. Send the estimate from the ticket to notify the customer; they approve or decline each line under Do now / Soon / Later.</div>
    </div>
  );
}

// ── checklist sheet ────────────────────────────────────────────────────────────────────────────────
function Sheet({ props, onClose, onSummary }: { props: DetailPanelProps; onClose: () => void; onSummary: (i: Inspection) => void }) {
  const { api, cfg, ticket } = props; const auto = autoApiFor(api)!;
  const tpl = templateById((cfg.panelConfig as any)?.inspection?.templateId);
  const [insp, setInspState] = useState<Inspection | null>(null);
  const [step, setStep] = useState<'list' | 'review'>('list');
  const [open, setOpen] = useState<string>(sectionsOf(tpl)[0]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = useRef(false); const timer = useRef<any>(null); const latest = useRef<Inspection | null>(null);

  useEffect(() => { auto.getInspection(ticket.id).then(i => { const v = i || newInspection(ticket.id, tpl.id); latest.current = v; setInspState(v); }).catch(e => setErr(e?.message || 'Could not load the inspection.')); }, [auto, ticket.id, tpl.id]);

  const flush = useCallback(async (): Promise<Inspection | null> => {
    clearTimeout(timer.current);
    if (!latest.current || !dirty.current) return latest.current;
    setSaved('saving');
    try { const s = await auto.saveInspection(ticket.id, latest.current); dirty.current = false; setSaved('saved'); onSummary(s); return latest.current; }
    catch (e: any) { setSaved('error'); setErr(e?.message || 'Could not save. Check your connection; your entries are still on screen.'); return latest.current; }
  }, [auto, ticket.id, onSummary]);
  const setInsp = useCallback((i: Inspection, persist = false) => { latest.current = i; setInspState(i); if (persist) { dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(flush, 900); } }, [flush]);
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current) flush(); }, [flush]);

  const change = (id: string, p: Partial<InspectionItemState>) => { const cur = latest.current!; const prev = cur.items[id] || { status: 'UNSET' as ItemStatus, attachments: [] }; setInsp({ ...cur, items: { ...cur.items, [id]: { ...prev, ...p } }, updatedAt: Date.now() }, true); };
  const upload = async (id: string, f: File) => {
    setBusy(true); setErr('');
    try { const url = await api.uploadPhoto(f, ticket.id); const cur = latest.current!.items[id] || { status: 'UNSET' as ItemStatus, attachments: [] }; change(id, { attachments: [...cur.attachments, { url, kind: f.type.startsWith('video') ? 'video' : 'image', at: Date.now() }] }); }
    catch (e: any) { setErr(e?.message || 'Upload failed.'); } finally { setBusy(false); }
  };

  const sum = insp ? summarize(insp) : null;
  return createPortal(
    <div className="fixed inset-0 z-[170] bg-[#0b0b12] text-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Vehicle inspection">
      <div className="max-w-2xl mx-auto p-3 sm:p-4 space-y-3 pb-28">
        <div className="flex items-center gap-2 sticky top-0 z-10 bg-[#0b0b12]/95 backdrop-blur py-2">
          <div className="flex-1"><div className="text-2xl font-black italic uppercase leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>Inspection</div><div className="text-[11px] text-white/40">{ticket.number} · {saved === 'saving' ? 'saving...' : saved === 'saved' ? 'saved' : saved === 'error' ? 'not saved' : 'autosaves'}</div></div>
          <button onClick={async () => { await flush(); onClose(); }} className="min-h-[44px] px-4 rounded-full bg-white/10 text-[11px] font-black uppercase">Close</button>
        </div>
        {err && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8]">{err}</div>}
        {!insp ? <div className="text-white/40 text-sm py-10 text-center">Loading...</div> : step === 'review' ? (
          <Review insp={insp} setInsp={i => setInsp(i)} onBack={() => setStep('list')} props={props} flush={flush} />
        ) : (
          <>
            {sum && <div className="flex gap-2 text-center text-[11px] font-black uppercase">
              {([['fail', 'FAIL', sum.fail], ['watch', 'WATCH', sum.watch], ['pass', 'PASS', sum.pass]] as const).map(([k, w, n]) => <div key={k} className="flex-1 rounded-xl py-2" style={{ background: COL[w] + '22', color: COL[w] }}>{n} {k}</div>)}
              <div className="flex-1 rounded-xl py-2 bg-white/5 text-white/50">{sum.unset} to do</div></div>}
            {sectionsOf(tpl).map(sec => {
              const items = tpl.items.filter(i => i.section === sec); const isOpen = open === sec;
              const worst = items.some(i => insp.items[i.id]?.status === 'FAIL') ? 'FAIL' : items.some(i => insp.items[i.id]?.status === 'WATCH') ? 'WATCH' : items.every(i => insp.items[i.id]?.status && insp.items[i.id].status !== 'UNSET') ? 'PASS' : '';
              return (
                <div key={sec} className="space-y-2">
                  <button onClick={() => setOpen(isOpen ? '' : sec)} aria-expanded={isOpen} className="w-full min-h-[52px] rounded-2xl bg-white/[0.06] px-4 flex items-center gap-3 text-left">
                    <span className="w-3 h-3 rounded-full" style={{ background: worst ? COL[worst] : '#ffffff33' }} /><span className="flex-1 font-black uppercase tracking-wide text-sm">{sec}</span><span className="text-white/40 text-xs">{items.filter(i => (insp.items[i.id]?.status || 'UNSET') !== 'UNSET').length}/{items.length}</span></button>
                  {isOpen && items.map(def => <ItemCard key={def.id} def={def} st={insp.items[def.id] || { status: 'UNSET', attachments: [] }} onChange={p => change(def.id, p)} upload={f => upload(def.id, f)} busy={busy} />)}
                </div>
              );
            })}
            <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 space-y-2">
              <div className={lbl}>Overall tech notes (internal)</div>
              <div className="flex gap-2 items-start"><textarea value={insp.techNotes || ''} onChange={e => setInsp({ ...insp, techNotes: e.target.value }, true)} rows={3} className={inp + ' resize-none'} aria-label="Overall tech notes" placeholder="Anything else the advisor should know" /><Mic onText={t => setInsp({ ...insp, techNotes: `${insp.techNotes ? insp.techNotes + ' ' : ''}${t}` }, true)} /></div>
            </div>
            <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#0b0b12]/95 backdrop-blur border-t border-white/10"><div className="max-w-2xl mx-auto"><button onClick={async () => { await flush(); setStep('review'); }} className="w-full min-h-[56px] rounded-2xl text-base font-black uppercase tracking-wide text-white" style={{ background: GRAD }}>Review &amp; build estimate</button></div></div>
          </>
        )}
      </div>
    </div>, document.body);
}

export default function InspectionPanel(props: DetailPanelProps) {
  const { api, ticket, closed } = props;
  const auto = useMemo(() => autoApiFor(api), [api]);
  const [open, setOpen] = useState(false);
  const [sum, setSum] = useState<ReturnType<typeof summarize> | null>(null);
  useEffect(() => { auto?.getInspection(ticket.id).then(i => i && setSum(summarize(i))).catch(() => {}); }, [auto, ticket.id, open]);
  if (!auto) return null;
  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2" data-testid="inspection-panel">
      <div className="flex items-center justify-between gap-2"><div className={lbl}>Vehicle inspection</div>
        {sum && <div className="flex gap-1.5 text-[10px] font-black uppercase"><span style={{ color: COL.FAIL }}>{sum.fail} fail</span><span style={{ color: COL.WATCH }}>{sum.watch} watch</span><span style={{ color: COL.PASS }}>{sum.pass} pass</span></div>}</div>
      <button onClick={() => setOpen(true)} className="w-full min-h-[52px] rounded-xl text-sm font-black uppercase tracking-wide text-white" style={{ background: GRAD }}>{sum && sum.total - sum.unset > 0 ? 'Continue inspection' : closed ? 'View inspection' : 'Start inspection'}</button>
      {open && <Sheet props={props} onClose={() => setOpen(false)} onSummary={i => setSum(summarize(i))} />}
    </section>
  );
}
