import React, { useCallback, useEffect, useState } from 'react';
import { Scale, Wrench, Clock, RefreshCw, Check, X, Pencil } from 'lucide-react';
import { auth } from '../../services/firebase';
import {
  getEnforcementQueue, decideAppeal, decideCorrection, type AppealRecord, type EnforcementActionRecord,
} from '../../services/enforcement/enforcementApi';
import { LEVEL_TITLE, LEVELS, LEVEL_RANK, needsSecondReviewer, type StandingLevel, type AppealOutcome } from '../../services/enforcement/standingCore';

/**
 * Admin: pending appeals (SLA-ordered) and "I fixed it" corrections. Decisions go through
 * routes/enforcement.ts, which enforces the second-reviewer rule server-side.
 */
const fmt = (t?: number | null) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—');

const AppealsQueuePanel: React.FC = () => {
  const [q, setQ] = useState<{ appeals: AppealRecord[]; corrections: EnforcementActionRecord[]; actions: Record<string, EnforcementActionRecord>; now: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mods, setMods] = useState<Record<string, { level: StandingLevel; hours: string }>>({});
  const me = auth.currentUser?.uid;

  const load = useCallback(async () => {
    try { setQ(await getEnforcementQueue()); setErr(''); } catch (e: any) { setErr(e?.message || 'Could not load appeals'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (ap: AppealRecord, outcome: AppealOutcome) => {
    const note = (notes[ap.id] || '').trim();
    if (!note) { setErr('Write a decision note first — the user is shown it.'); return; }
    setBusy(ap.id + outcome); setErr('');
    try {
      const m = mods[ap.id];
      await decideAppeal(ap.id, outcome === 'modify' && m
        ? { outcome, note, level: m.level, durationHours: m.hours.trim() === '' ? null : Number(m.hours) }
        : { outcome, note });
      await load();
    } catch (e: any) { setErr(e?.message || 'Decision failed'); } finally { setBusy(null); }
  };

  const correction = async (a: EnforcementActionRecord, accept: boolean) => {
    const note = (notes[a.id] || '').trim();
    if (!accept && !note) { setErr('Say why the fix isn\'t enough — the user is shown it.'); return; }
    setBusy(a.id + accept); setErr('');
    try { await decideCorrection(a.id, accept, note); await load(); } catch (e: any) { setErr(e?.message || 'Decision failed'); } finally { setBusy(null); }
  };

  const now = q?.now ?? Date.now();
  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Scale size={18} style={{ color: 'var(--pj-lilac, #D0BCFF)' }} />
        <h3 className="text-sm font-black uppercase tracking-widest text-white">Appeals &amp; fixes</h3>
        <span className="text-[10px] text-white/40">{q ? `${q.appeals.length} appeal${q.appeals.length === 1 ? '' : 's'} · ${q.corrections.length} fix${q.corrections.length === 1 ? '' : 'es'}` : '…'}</span>
        <button onClick={() => void load()} className="ml-auto p-1.5 text-white/40 hover:text-white" aria-label="Refresh"><RefreshCw size={12} /></button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {q && q.appeals.length === 0 && q.corrections.length === 0 && <p className="text-xs text-white/40">No appeals or fixes waiting.</p>}

      {q?.corrections.map(a => (
        <div key={a.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><Wrench size={10} /> Fix reported</span>
            <span className="text-white/50">{LEVEL_TITLE[a.level]}</span>
            <span className={`flex items-center gap-1 ${a.correction && a.correction.slaDueAt < now ? 'text-red-300' : 'text-white/30'}`}><Clock size={10} /> due {fmt(a.correction?.slaDueAt)}</span>
          </div>
          <p className="text-xs text-white/70 break-words">{a.contentRef ? `${a.contentRef.kind} ${a.contentRef.path || a.contentRef.id}${a.contentRef.snapshot ? ` — "${a.contentRef.snapshot}"` : ''}` : 'account'} · rule: {a.rule}</p>
          {a.correction?.note && <p className="text-[11px] text-white/50 italic">User: {a.correction.note}</p>}
          <p className="text-[10px] text-white/30 break-all">user {a.uid}</p>
          <input value={notes[a.id] || ''} onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))} placeholder="Note to the user" className="w-full text-xs rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white outline-none" />
          <div className="flex flex-wrap gap-2">
            <button disabled={!!busy} onClick={() => correction(a, true)} className={`${btn} border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10`}><Check size={12} /> Accept fix · lift</button>
            <button disabled={!!busy} onClick={() => correction(a, false)} className={`${btn} border-white/15 text-white/70 hover:bg-white/5`}><X size={12} /> Not enough</button>
          </div>
        </div>
      ))}

      {q?.appeals.map(ap => {
        const action = q.actions[ap.actionId];
        const creator = action?.createdBy || ap.actionCreatedBy;
        const blocked = needsSecondReviewer(ap.level) && !!me && creator === me;
        const m = mods[ap.id] || { level: ap.level, hours: '' };
        return (
          <div key={ap.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200">Appeal</span>
              <span className="text-white/50">{LEVEL_TITLE[ap.level]}</span>
              {ap.requiresSecondReviewer && <span className="text-amber-300/80">2nd reviewer</span>}
              <span className={`flex items-center gap-1 ${ap.slaDueAt < now ? 'text-red-300' : 'text-white/30'}`}><Clock size={10} /> due {fmt(ap.slaDueAt)}</span>
            </div>
            {action ? (
              <p className="text-xs text-white/60 break-words">Action: {action.contentRef ? `${action.contentRef.kind} ${action.contentRef.path || action.contentRef.id}${action.contentRef.snapshot ? ` — "${action.contentRef.snapshot}"` : ''}` : 'account'} · {action.ruleText} · expires {action.expiresAt ? fmt(action.expiresAt) : 'on review'}</p>
            ) : <p className="text-xs text-white/60">Action: {ap.actionId} (no action record — legacy or legal review)</p>}
            <p className="text-xs text-white/85 whitespace-pre-wrap break-words">“{ap.statement}”</p>
            {ap.correctionTaken && <p className="text-[11px] text-white/50">Says they changed: {ap.correctionTaken}</p>}
            {ap.evidence?.length > 0 && <div className="flex flex-wrap gap-2">{ap.evidence.map(u => <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-[11px] underline text-sky-300 break-all">{u}</a>)}</div>}
            <p className="text-[10px] text-white/30 break-all">user {ap.uid} · filed {fmt(ap.createdAt)}</p>
            {blocked ? (
              <p className="text-[11px] text-amber-300">You applied this action, so a different reviewer must decide this appeal.</p>
            ) : (
              <>
                <input value={notes[ap.id] || ''} onChange={e => setNotes(n => ({ ...n, [ap.id]: e.target.value }))} placeholder="Decision note (shown to the user)" className="w-full text-xs rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white outline-none" />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                  <Pencil size={11} /> Modify to
                  <select value={m.level} onChange={e => setMods(x => ({ ...x, [ap.id]: { ...m, level: e.target.value as StandingLevel } }))} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white">
                    {LEVELS.filter(l => LEVEL_RANK[l] <= LEVEL_RANK[ap.level]).map(l => <option key={l} value={l}>{LEVEL_TITLE[l]}</option>)}
                  </select>
                  for
                  <input value={m.hours} onChange={e => setMods(x => ({ ...x, [ap.id]: { ...m, hours: e.target.value.replace(/[^0-9.]/g, '') } }))} placeholder="hours (blank = keep)" className="w-28 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={!!busy} onClick={() => decide(ap, 'overturn')} className={`${btn} border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10`}>Overturn · restore</button>
                  <button disabled={!!busy} onClick={() => decide(ap, 'modify')} className={`${btn} border-sky-500/30 text-sky-300 hover:bg-sky-500/10`}>Modify</button>
                  <button disabled={!!busy} onClick={() => decide(ap, 'uphold')} className={`${btn} border-white/15 text-white/70 hover:bg-white/5`}>Uphold</button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AppealsQueuePanel;
