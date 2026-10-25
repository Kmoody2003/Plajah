// GrantApply — Aria's application workspace for one notice.
//
// Opens by doing the work: it pulls what the platform knows, compares it with what this notice needs,
// and asks for the gaps one at a time, slowest first. Then it fills a PDF or hands you a copy sheet,
// drafts sections from YOUR facts, and lets the Grant Council review the whole thing.
//
// What it will not do (and says so): sign, date, or certify anything; invent a fact; submit for you.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCopy, Download, FileUp, Loader2, Sparkles, Users } from 'lucide-react';
import {
  grantsApi, type CouncilReview, type Draft, type ReadinessResponse, type SavedApplication,
} from '../../services/grants/client';
import { SECTIONS, SEATS, councilWorkload, draftSection, draftWorkload, factsFromProfile, reviewApplication, type NoticeCtx } from '../../services/grants/council';
import { createLocalLane } from '../../services/ai/localLane';
import { fmtSeconds, fmtUsd } from '../../services/ai/aiLane';
import { LaneHint, ProgressNote, useAiRunner, type Lane } from './GrantAiLane';
import { FIELD_BY_KEY, displayValue, type Profile } from '../../services/grants/profile';
import type { FieldReport, PrefillResult } from '../../services/grants/forms';
import { EV, EvLabel } from './vellum';

const input = { background: EV.chrome, color: EV.ink, border: `1px solid ${EV.line}` } as const;
const btn = 'px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-40 inline-flex items-center gap-2';
const primary = { background: EV.brand, color: '#fff' } as const;
const quiet = { background: EV.raised, color: EV.ink2 } as const;

const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ } };

// ─── Aria's interview ────────────────────────────────────────────────────────

const Interview: React.FC<{ data: ReadinessResponse; busy: boolean; onAnswer: (key: string, value: string) => Promise<string | null>; onSkip: (key: string) => void }> = ({ data, busy, onAnswer, onSkip }) => {
  const q = data.next;
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // "No — change it" turns a confirmation into a blank question the person can type into.
  const [changing, setChanging] = useState(false);
  useEffect(() => { setText(''); setErr(null); setChanging(false); }, [q?.key]);

  if (!q) {
    return (
      <div className="ev-panel p-5 flex items-start gap-3">
        <CheckCircle2 size={20} style={{ color: EV.success }} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold" style={{ color: EV.ink }}>I have everything I need for the cover form.</p>
          <p className="text-[12px] mt-1" style={{ color: EV.muted }}>Next: upload the agency's PDF to fill it, or use the copy sheet. Then draft your narrative and ask the Council to review it.</p>
        </div>
      </div>
    );
  }
  const send = async (value: string) => { setErr(null); const e = await onAnswer(q.key, value); if (e) setErr(e); };
  const field = FIELD_BY_KEY[q.key];

  return (
    <div className="ev-panel p-5">
      <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: EV.violetText }}><Sparkles size={12} /> Aria</p>
      <p className="text-sm mt-2 leading-relaxed" style={{ color: EV.ink }}>{q.text}</p>
      {q.choices && !(q.confirm && changing) ? (
        <div className="flex flex-wrap gap-2 mt-3">
          {q.choices.map(c => (
            <button key={c.value} disabled={busy} onClick={() => (q.confirm ? (c.value === 'yes' ? send(q.confirm) : setChanging(true)) : send(c.value))}
                    className={btn} style={quiet}>{c.label}</button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && text.trim()) send(text); }}
                 placeholder={field?.kind === 'money' ? 'e.g. $250k' : 'Type your answer'} className="flex-1 rounded-xl px-3 py-2 text-sm" style={input} />
          <button disabled={busy || !text.trim()} onClick={() => send(text)} className={btn} style={primary}>{busy ? <Loader2 size={13} className="animate-spin" /> : 'Save'}</button>
        </div>
      )}
      {err && <p role="alert" className="text-[12px] mt-2" style={{ color: EV.warn }}>{err}</p>}
      <button onClick={() => onSkip(q.key)} className="mt-3 text-[11px]" style={{ color: EV.muted }}>Ask me later</button>
    </div>
  );
};

// ─── PDF prefill ─────────────────────────────────────────────────────────────

const Row: React.FC<{ r: FieldReport }> = ({ r }) => (
  <li className="flex items-start gap-2 text-[11px] py-1">
    <span className="mt-0.5 shrink-0" style={{ color: r.outcome === 'filled' ? EV.success : r.outcome === 'needs-you' ? EV.warn : EV.muted }}>
      {r.outcome === 'filled' ? <Check size={12} /> : r.outcome === 'needs-you' ? <AlertTriangle size={12} /> : '•'}
    </span>
    <span className="min-w-0" style={{ color: EV.ink2 }}>
      <span className="font-semibold break-all">{r.name}</span>
      {r.outcome === 'filled' && <> — {r.value}{r.confirm ? <span style={{ color: EV.warn }}> (check this)</span> : null}</>}
      {r.outcome === 'needs-you' && <span style={{ color: EV.warn }}> — {r.note || 'needs a person'}</span>}
      {r.outcome === 'no-data' && <span style={{ color: EV.muted }}> — no answer yet ({FIELD_BY_KEY[r.key!]?.label})</span>}
    </span>
  </li>
);

const PdfPrefill: React.FC<{ data: ReadinessResponse }> = ({ data }) => {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(PrefillResult & { file: string }) | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setRes(null); setUrl(null);
    try {
      const { prefillPdf } = await import('../../services/grants/forms');
      const out = await prefillPdf(await file.arrayBuffer(), data.profile);
      setRes({ ...out, file: file.name });
      if (out.bytes) setUrl(URL.createObjectURL(new Blob([out.bytes], { type: 'application/pdf' })));
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const groups = useMemo(() => {
    const by = (o: string) => (res?.fields || []).filter(f => f.outcome === o);
    return { filled: by('filled'), needs: by('needs-you'), none: by('no-data'), other: (res?.fields || []).filter(f => f.outcome === 'unmatched' || f.outcome === 'skipped-nonempty') };
  }, [res]);

  return (
    <div className="ev-panel p-5">
      <EvLabel>Fill the agency's PDF</EvLabel>
      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
        Upload a fillable PDF (an agency form or a state application). It is filled in your browser and never uploaded.
        Existing answers are kept, and signatures, dates and certifications are left blank for your authorized representative.
      </p>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      <button disabled={busy} onClick={() => inputRef.current?.click()} className={`${btn} mt-3`} style={primary}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Choose a PDF
      </button>
      {res && (
        <div className="mt-4">
          <p className="text-[12px]" style={{ color: EV.ink }}>{res.summary}</p>
          {url && (
            <a href={url} download={`${res.file.replace(/\.pdf$/i, '')}-prefilled.pdf`} className={`${btn} mt-3`} style={primary}>
              <Download size={13} /> Download filled PDF
            </a>
          )}
          {groups.filled.length > 0 && <><p className="text-[10px] font-black uppercase tracking-widest mt-4" style={{ color: EV.success }}>Filled — please review</p><ul>{groups.filled.map(r => <Row key={r.name} r={r} />)}</ul></>}
          {groups.needs.length > 0 && <><p className="text-[10px] font-black uppercase tracking-widest mt-4" style={{ color: EV.warn }}>Needs a person</p><ul>{groups.needs.map(r => <Row key={r.name} r={r} />)}</ul></>}
          {groups.none.length > 0 && <><p className="text-[10px] font-black uppercase tracking-widest mt-4" style={{ color: EV.muted }}>No answer yet</p><ul>{groups.none.map(r => <Row key={r.name} r={r} />)}</ul></>}
          {groups.other.length > 0 && <p className="text-[11px] mt-3" style={{ color: EV.muted }}>{groups.other.length} other field{groups.other.length === 1 ? '' : 's'} left as they were.</p>}
        </div>
      )}
    </div>
  );
};

// ─── Copy sheet ──────────────────────────────────────────────────────────────

const CopySheet: React.FC<{ data: ReadinessResponse }> = ({ data }) => (
  <div className="ev-panel p-5">
    <EvLabel>Cover form copy sheet (SF-424)</EvLabel>
    <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
      For Grants.gov web forms and older forms that cannot be auto-filled: items in the form's own order, one click to copy.
    </p>
    <ul className="mt-3 divide-y" style={{ borderColor: EV.line }}>
      {data.sf424.map((r, i) => (
        <li key={`${r.item}-${i}`} className="py-2.5 flex items-start gap-3" style={{ borderColor: EV.line }}>
          <span className="w-9 shrink-0 text-[11px] font-black tabular-nums" style={{ color: EV.violetText }}>{r.item}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px]" style={{ color: EV.ink2 }}>{r.label}</p>
            {r.value ? (
              <p className="text-sm break-words" style={{ color: EV.ink }}>{r.value}{r.confirm && <span className="text-[10px] ml-2" style={{ color: EV.warn }}>confirm in your Profile</span>}</p>
            ) : (
              <p className="text-[12px]" style={{ color: r.action === 'missing' ? EV.warn : EV.muted }}>
                {r.action === 'missing' ? 'Missing — Aria will ask' : r.action === 'per-notice' ? 'Comes from the notice' : 'You decide'}
              </p>
            )}
            {r.note && <p className="text-[10px] mt-0.5" style={{ color: EV.muted }}>{r.note}</p>}
          </div>
          {r.value && <button onClick={() => copy(r.value!)} aria-label={`Copy ${r.label}`} className="p-2 rounded-lg shrink-0" style={quiet}><ClipboardCopy size={13} /></button>}
        </li>
      ))}
    </ul>
  </div>
);

// ─── Drafting ────────────────────────────────────────────────────────────────

type Runner = ReturnType<typeof useAiRunner>;
type Ran = { lane: Lane; seconds: number; costUsd?: number | null };

/** "Ran privately on this PC · about 1 minute" / "Ran in the cloud · less than 1¢ · about 5 seconds". */
const RanNote: React.FC<{ ran: Ran | null }> = ({ ran }) => ran ? (
  <p className="text-[10px] mt-2" style={{ color: EV.muted }}>
    {ran.lane === 'local' ? `Ran privately on this PC · ${fmtSeconds(ran.seconds)}` : `Ran in the cloud · ${fmtUsd(ran.costUsd ?? null)} · ${fmtSeconds(ran.seconds)}`}
  </p>
) : null;

const Drafting: React.FC<{
  orgId: string; oppId: string; app: SavedApplication; setApp: (fn: (a: SavedApplication) => SavedApplication) => void;
  runner: Runner; notice: NoticeCtx; profile: Profile;
}> = ({ orgId, oppId, app, setApp, runner, notice, profile }) => {
  const [section, setSection] = useState<keyof typeof SECTIONS>('need');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Draft | null>(null);
  const [ran, setRan] = useState<Ran | null>(null);
  const [ask, setAsk] = useState('');
  const facts = (app.facts || []).join('\n');
  const text = app.sections?.[section] || '';
  const modelFacts = useMemo(() => factsFromProfile(profile, app.facts, k => FIELD_BY_KEY[k]?.label), [profile, app.facts]);
  const workload = useMemo(() => draftWorkload({ section, notice, facts: modelFacts, instructions: ask || undefined }), [section, notice, modelFacts, ask]);

  const run = async (preferCloud = false) => {
    setBusy(true); setErr(null); setSuggest(null); setRan(null);
    try {
      const r = await runner.run({
        workload, preferCloud,
        local: onCall => draftSection({ model: createLocalLane({ onCall }), section, notice, facts: modelFacts, instructions: ask || undefined }),
        cloud: () => grantsApi.draft(orgId, oppId, section, app.facts || [], ask || undefined),
      });
      setSuggest(r.result);
      setRan({ lane: r.lane, seconds: r.seconds, costUsd: (r.result as Draft).usage?.costUsd });
    } catch (e: any) { if (e?.message !== 'cancelled') setErr(e?.message || 'Could not draft'); } finally { setBusy(false); }
  };

  return (
    <div className="ev-panel p-5">
      <EvLabel>Write it with Aria</EvLabel>
      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
        Type the real facts for this application, one per line (who is affected, what you did, numbers with sources). Aria writes only from those.
        Where a fact is missing she leaves a <b style={{ color: EV.warn }}>[NEEDS YOUR FACT]</b> marker instead of guessing.
      </p>
      <textarea value={facts} rows={5} placeholder={'Our pantry fed 450 families in 2025.\n31% of children in our zip code live below the poverty line (Census ACS 2023).'}
                onChange={e => setApp(a => ({ ...a, facts: e.target.value.split('\n').slice(0, 40) }))}
                className="w-full mt-3 rounded-xl px-3 py-2 text-sm" style={input} />
      <div className="flex flex-wrap gap-2 mt-3">
        {Object.entries(SECTIONS).map(([k, s]) => (
          <button key={k} onClick={() => { setSection(k as keyof typeof SECTIONS); setSuggest(null); }} aria-pressed={section === k}
                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold"
                  style={{ background: section === k ? EV.violet : EV.raised, color: section === k ? '#fff' : EV.ink2 }}>
            {s.title}{app.sections?.[k] ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <p className="text-[11px] mt-3" style={{ color: EV.muted }}>{SECTIONS[section].guide}</p>
      <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Anything to emphasize? (optional)" className="w-full mt-3 rounded-xl px-3 py-2 text-sm" style={input} />
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button disabled={busy} onClick={() => run(false)} className={btn} style={primary}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Draft "{SECTIONS[section].title}"
        </button>
        {runner.local?.qualifies && !busy && <button onClick={() => run(true)} className="text-[11px] underline underline-offset-2" style={{ color: EV.muted }}>Use the cloud instead (faster)</button>}
      </div>
      {busy ? <ProgressNote p={runner.progress} /> : <LaneHint w={workload} info={runner.info} local={runner.local} />}
      {err && <p role="alert" className="text-[12px] mt-2" style={{ color: EV.warn }}>{err}</p>}

      {suggest && (
        <div className="mt-4 rounded-xl p-4" style={{ background: EV.raised }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: EV.violetText }}>Aria's draft — edit before using</p>
          <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: EV.ink }}>{suggest.text}</p>
          {suggest.placeholders.length > 0 && <p className="text-[11px] mt-2" style={{ color: EV.warn }}>{suggest.placeholders.length} fact{suggest.placeholders.length === 1 ? '' : 's'} still needed — fill each [NEEDS YOUR FACT] with something true.</p>}
          {suggest.unsupportedNumbers.length > 0 && (
            <p className="text-[11px] mt-1 flex gap-1.5" style={{ color: EV.warn }}>
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> These numbers are not in your facts: {suggest.unsupportedNumbers.join(', ')}. Remove them or add the source.
            </p>
          )}
          <RanNote ran={ran} />
          <button onClick={() => { setApp(a => ({ ...a, sections: { ...(a.sections || {}), [section]: suggest.text } })); setSuggest(null); }} className={`${btn} mt-3`} style={quiet}>Use this draft</button>
        </div>
      )}

      <textarea value={text} rows={9} placeholder={`Your "${SECTIONS[section].title}" text`}
                onChange={e => setApp(a => ({ ...a, sections: { ...(a.sections || {}), [section]: e.target.value } }))}
                className="w-full mt-4 rounded-xl px-3 py-2 text-sm leading-relaxed" style={input} />
      <p className="text-[10px] mt-1" style={{ color: EV.muted }}>
        {text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Empty'} · saved to your workspace as you type. Some funders require you to disclose AI assistance; check the notice.
      </p>
    </div>
  );
};

// ─── Council ─────────────────────────────────────────────────────────────────

const READY: Record<CouncilReview['readiness'], { label: string; tone: string }> = {
  ready: { label: 'No blockers seen', tone: EV.success }, revise: { label: 'Revise before submitting', tone: EV.warn }, 'not-yet': { label: 'Not ready yet', tone: '#FF6B6B' },
};

const Council: React.FC<{ orgId: string; oppId: string; app: SavedApplication; runner: Runner; notice: NoticeCtx; profile: Profile }> = ({ orgId, oppId, app, runner, notice, profile }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [r, setR] = useState<CouncilReview | null>(null);
  const [ran, setRan] = useState<Ran | null>(null);
  const modelFacts = useMemo(() => factsFromProfile(profile, app.facts, k => FIELD_BY_KEY[k]?.label), [profile, app.facts]);
  const sections = useMemo(() => Object.entries(app.sections || {}).filter(([k, v]) => SECTIONS[k] && v.trim()).map(([k, v]) => ({ title: SECTIONS[k].title, text: v })), [app.sections]);
  const workload = useMemo(() => councilWorkload({ notice, facts: modelFacts, draft: '', sections }), [notice, modelFacts, sections]);
  const run = async (preferCloud = false) => {
    setBusy(true); setErr(null); setRan(null);
    try {
      const out = await runner.run({
        workload, preferCloud,
        local: onCall => reviewApplication({ model: createLocalLane({ onCall }), notice, facts: modelFacts, draft: '', sections }),
        cloud: () => grantsApi.council(orgId, oppId, app.sections || {}, app.facts || []),
      });
      setR(out.result);
      setRan({ lane: out.lane, seconds: out.seconds, costUsd: (out.result as any).usage?.costUsd });
    } catch (e: any) { if (e?.message !== 'cancelled') setErr(e?.message || 'The council could not be reached'); } finally { setBusy(false); }
  };
  return (
    <div className="ev-panel p-5">
      <EvLabel>The Grant Council</EvLabel>
      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
        A program officer, a peer reviewer, a budget auditor, a compliance officer and an editor read your draft the way the people deciding will.
        They advise; you decide. They never predict an award and never sign or certify anything.
      </p>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button disabled={busy} onClick={() => run(false)} className={btn} style={primary}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} Ask the Council to review
        </button>
        {runner.local?.qualifies && !busy && <button onClick={() => run(true)} className="text-[11px] underline underline-offset-2" style={{ color: EV.muted }}>Use the cloud instead (faster)</button>}
      </div>
      {busy ? <ProgressNote p={runner.progress} /> : <LaneHint w={workload} info={runner.info} local={runner.local} />}
      {err && <p role="alert" className="text-[12px] mt-2" style={{ color: EV.warn }}>{err}</p>}
      {r && (
        <div className="mt-4 space-y-4">
          <div>
            <RanNote ran={ran} />
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: READY[r.readiness].tone }}>{READY[r.readiness].label}</p>
            <p className="text-sm mt-1" style={{ color: EV.ink }}>{r.headline}</p>
          </div>
          {r.topFixes.length > 0 && (
            <ol className="space-y-1.5 list-decimal pl-5">
              {r.topFixes.map((f, i) => <li key={i} className="text-[12px]" style={{ color: EV.ink2 }}>{f.fix} <span style={{ color: EV.muted }}>— {SEATS.find(s => s.id === f.seat)?.name}</span></li>)}
            </ol>
          )}
          {(r.unsupportedNumbers.length > 0 || r.placeholders.length > 0) && (
            <p className="text-[11px]" style={{ color: EV.warn }}>
              {r.placeholders.length > 0 && <>{r.placeholders.length} [NEEDS YOUR FACT] marker{r.placeholders.length === 1 ? '' : 's'} remain. </>}
              {r.unsupportedNumbers.length > 0 && <>Numbers not found in your facts: {r.unsupportedNumbers.join(', ')}.</>}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {r.seats.map(s => (
              <div key={s.seat} className="rounded-xl p-3" style={{ background: EV.raised }}>
                <p className="text-[11px] font-bold flex justify-between" style={{ color: EV.ink }}>{SEATS.find(x => x.id === s.seat)?.name}<span style={{ color: EV.violetText }}>{s.score}/5</span></p>
                <p className="text-[11px] mt-1" style={{ color: EV.ink2 }}>{s.verdict}</p>
                {s.concerns.map((c, i) => <p key={i} className="text-[11px] mt-1" style={{ color: EV.warn }}>• {c}</p>)}
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: EV.muted }}>{r.limits}</p>
        </div>
      )}
    </div>
  );
};

// ─── The workspace ───────────────────────────────────────────────────────────

export const GrantApply: React.FC<{ orgId: string; opp: { id: string; title: string }; onProfile?: () => void }> = ({ orgId, opp, onProfile }) => {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [app, setAppState] = useState<SavedApplication>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const runner = useAiRunner();
  const dirty = useRef(false);

  const load = useCallback(async (skip: string[]) => {
    try { const r = await grantsApi.readiness(orgId, opp.id, skip); setData(r); setError(null); return r; }
    catch (e: any) { setError(e?.message || 'Could not load this application'); return null; }
  }, [orgId, opp.id]);

  useEffect(() => {
    let off = false; setLoading(true); setSkipped([]); dirty.current = false;
    load([]).then(r => { if (!off) { if (r) setAppState(r.application || {}); setLoading(false); } });
    return () => { off = true; };
  }, [load]);

  // Autosave the typed work (facts, sections, ticks) shortly after the last keystroke.
  useEffect(() => {
    if (!dirty.current) return;
    setSaved('saving');
    const t = setTimeout(() => { grantsApi.saveApplication(orgId, opp.id, { ...app, title: opp.title }).then(() => setSaved('saved')).catch(() => setSaved('error')); }, 900);
    return () => clearTimeout(t);
  }, [app, orgId, opp.id, opp.title]);
  const setApp = (fn: (a: SavedApplication) => SavedApplication) => { dirty.current = true; setAppState(fn); };

  const answer = async (key: string, value: string): Promise<string | null> => {
    setBusy(true);
    try { await grantsApi.saveAnswer(orgId, key, value); await load(skipped); onProfile?.(); return null; }
    catch (e: any) { return e?.message || 'Could not save that'; } finally { setBusy(false); }
  };
  const skip = (key: string) => { const next = [...skipped, key]; setSkipped(next); load(next); };

  if (loading) return <p className="text-sm flex items-center gap-2" style={{ color: EV.muted }}><Loader2 size={14} className="animate-spin" /> Aria is gathering what she knows about your organization…</p>;
  if (error || !data) return <p role="alert" className="text-sm" style={{ color: EV.warn }}>{error || 'Could not load this application.'}</p>;
  const r = data.report;

  return (
    <div className="space-y-5">
      <div className="ev-panel p-5">
        <p className="text-sm font-bold leading-snug" style={{ color: EV.ink }}>{data.notice.title}</p>
        <p className="text-[11px] mt-0.5" style={{ color: EV.muted }}>{data.notice.agency} · {data.notice.number}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
          <div>
            <p className="text-2xl font-black tabular-nums" style={{ color: EV.violetText }}>{r.percentReady}%</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: EV.muted }}>ready</p>
          </div>
          <div>
            <p className="text-2xl font-black tabular-nums" style={{ color: r.daysLeft !== null && r.daysLeft < 14 ? EV.warn : EV.ink }}>{r.daysLeft ?? '—'}</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: EV.muted }}>days left</p>
          </div>
          <div>
            <p className="text-2xl font-black tabular-nums" style={{ color: r.blockingMissing ? EV.warn : EV.success }}>{r.blockingMissing}</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: EV.muted }}>blockers</p>
          </div>
          <p className="text-[10px] ml-auto" style={{ color: EV.muted }}>{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'error' ? 'Could not save' : ''}</p>
        </div>
        {r.warnings.map(w => <p key={w} className="text-[12px] mt-3 flex gap-2" style={{ color: EV.warn }}><AlertTriangle size={13} className="shrink-0 mt-0.5" />{w}</p>)}
      </div>

      <Interview data={data} busy={busy} onAnswer={answer} onSkip={skip} />

      <div className="ev-panel p-5">
        <EvLabel>What this application needs</EvLabel>
        <ul className="mt-2">
          {r.gaps.map(g => (
            <li key={g.key} className="py-2 flex items-start gap-3 border-b last:border-0" style={{ borderColor: EV.line }}>
              <span className="mt-0.5 shrink-0" style={{ color: g.status === 'have' ? EV.success : g.status === 'confirm' ? EV.violetText : EV.warn }}>
                {g.status === 'have' ? <Check size={14} /> : g.status === 'confirm' ? <Sparkles size={14} /> : <AlertTriangle size={14} />}
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold" style={{ color: EV.ink }}>{g.label}{g.blocking && g.status === 'missing' ? <span className="ml-2 text-[10px]" style={{ color: EV.warn }}>blocks submission</span> : null}</p>
                <p className="text-[11px]" style={{ color: EV.muted }}>
                  {g.value ? `${displayValue(g.key, g.value)} · ` : ''}{g.status === 'confirm' ? 'confirm it' : g.status === 'missing' ? (g.leadTimeDays ? `takes about ${g.leadTimeDays >= 14 ? Math.round(g.leadTimeDays / 7) + ' weeks' : g.leadTimeDays + ' days'}` : 'needed') : 'confirmed'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="ev-panel p-5">
        <EvLabel>Documents to gather</EvLabel>
        <ul className="mt-2">
          {r.documents.map(d => (
            <li key={d.id} className="py-2 flex items-start gap-3 border-b last:border-0" style={{ borderColor: EV.line }}>
              <input type="checkbox" checked={!!app.docs?.[d.id]} onChange={e => setApp(a => ({ ...a, docs: { ...(a.docs || {}), [d.id]: e.target.checked } }))} className="mt-1 accent-violet-500" aria-label={d.label} />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold" style={{ color: EV.ink }}>{d.label}</p>
                <p className="text-[11px] leading-snug" style={{ color: EV.muted }}>{d.how}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <PdfPrefill data={data} />
      <CopySheet data={data} />
      <Drafting orgId={orgId} oppId={opp.id} app={app} setApp={setApp} runner={runner} notice={data.notice} profile={data.profile} />
      <Council orgId={orgId} oppId={opp.id} app={app} runner={runner} notice={data.notice} profile={data.profile} />
      {runner.dialog}

      <div className="ev-panel p-5">
        <EvLabel>Notes</EvLabel>
        <textarea value={app.notes || ''} rows={3} onChange={e => setApp(a => ({ ...a, notes: e.target.value }))} placeholder="Calls to make, who owns what, dates…" className="w-full mt-2 rounded-xl px-3 py-2 text-sm" style={input} />
        <p className="text-[10px] mt-3 leading-relaxed" style={{ color: EV.muted }}>
          We prepare; your authorized representative reviews, certifies and submits in Grants.gov. We never sign, date or certify for anyone.
        </p>
      </div>
    </div>
  );
};

export default GrantApply;
