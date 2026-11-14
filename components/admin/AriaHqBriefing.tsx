// Admin → Aria HQ: the HQ crew's daily briefing for the owner (routes/crew.ts GET /api/crew/hq/briefing).
//
// Security Council findings, counted signups, and the Keeper of the Vision's standing decisions + the drifts
// you log against them. Every figure is counted from real records; a figure that could not be read says so.
// The HQ crew advises — nothing here deploys, posts or changes a setting.
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Compass, Eye, HelpCircle, Loader2, Plus, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { crewApi, type HqView } from '../../services/crew/crewClient';
import type { BriefingSection } from '../../services/crew/hqBriefing';
import AriaMark from '../aria/AriaMark';

const TONE: Record<BriefingSection['tone'], { color: string; label: string; Icon: React.ElementType }> = {
  ok: { color: '#3DD68C', label: 'All good', Icon: CheckCircle2 },
  watch: { color: '#E8B33D', label: 'Keep an eye on', Icon: Eye },
  act: { color: '#FF4D4D', label: 'Needs you', Icon: AlertTriangle },
  unknown: { color: '#8B93A7', label: 'Could not read', Icon: HelpCircle },
};
const CREW_ICON: Record<string, React.ElementType> = { 'Security Council': ShieldCheck, 'Growth Analyst': TrendingUp, 'Keeper of the Vision': Compass };

export const AriaHqBriefing: React.FC = () => {
  const [data, setData] = useState<HqView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [principleId, setPrincipleId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await crewApi.hq()); setError(null); } catch (e: any) { setError(e?.message || 'Could not load the briefing.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const addDrift = async () => {
    if (!principleId || !note.trim()) return;
    setSaving(true);
    try { const r = await crewApi.addDrift(principleId, note.trim()); setNote(''); setPrincipleId(''); setData(d => (d ? { ...d, drifts: r.drifts } : d)); load(); }
    catch (e: any) { setError(e?.message || 'Could not save.'); } finally { setSaving(false); }
  };
  const closeDrift = async (id: string) => {
    try { const r = await crewApi.closeDrift(id); setData(d => (d ? { ...d, drifts: r.drifts } : d)); load(); } catch (e: any) { setError(e?.message || 'Could not save.'); }
  };

  const b = data?.briefing;
  const open = (data?.drifts || []).filter(d => !d.closedAt);
  const title = (id: string) => data?.principles.find(p => p.id === id)?.title || id;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <AriaMark size={48} thinking={loading} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Aria HQ · {b?.date || 'today'}</p>
          <h2 className="text-2xl font-black text-white mt-1">{b?.headline || (error ? 'Briefing unavailable' : 'Gathering the briefing…')}</h2>
          <p className="text-[12px] text-white/50 mt-1">The crew that helps run Plajah. They count, flag and advise; you decide.</p>
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl text-[12px] font-bold bg-white/10 text-white inline-flex items-center gap-2 disabled:opacity-40">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </header>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      {b && (
        <section className="grid gap-4 lg:grid-cols-3" aria-label="Briefing">
          {b.sections.map(s => {
            const t = TONE[s.tone];
            const Icon = CREW_ICON[s.crew] || Clock;
            return (
              <article key={s.crew} className="rounded-3xl border bg-white/[0.03] p-5" style={{ borderColor: `${t.color}44` }}>
                <div className="flex items-center gap-2">
                  <Icon size={16} style={{ color: t.color }} />
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/60">{s.crew}</p>
                  <span className="ml-auto text-[10px] font-bold inline-flex items-center gap-1" style={{ color: t.color }}><t.Icon size={11} /> {t.label}</span>
                </div>
                <p className="text-[15px] font-bold text-white mt-3">{s.headline}</p>
                <ul className="mt-2 space-y-1.5">{s.lines.map((l, i) => <li key={i} className="text-[12px] text-white/70 leading-relaxed">{l}</li>)}</ul>
              </article>
            );
          })}
        </section>
      )}

      {data && (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6" aria-labelledby="vision-h">
          <h3 id="vision-h" className="text-lg font-black text-white flex items-center gap-2"><Compass size={18} /> Keeper of the Vision</h3>
          <p className="text-[12px] text-white/50 mt-1">Your standing decisions. When something drifts from one, log it here and it stays on the briefing until you close it.</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.principles.map(p => (
              <div key={p.id} className="rounded-2xl bg-black/30 p-3">
                <p className="text-[13px] font-bold text-white">{p.title} <span className="text-[10px] font-normal text-white/35">since {p.since}</span></p>
                <p className="text-[12px] text-white/60 mt-0.5">{p.rule}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Open drifts ({open.length})</p>
            {open.length === 0 && <p className="text-[12px] text-white/50 mt-2">None logged.</p>}
            <ul className="mt-2 space-y-2">
              {open.map(d => (
                <li key={d.id} className="rounded-2xl bg-amber-400/[0.06] border border-amber-400/20 p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-amber-200">{title(d.principleId)}</p>
                    <p className="text-[12px] text-white/75 mt-0.5 break-words">{d.note}</p>
                    <p className="text-[10px] text-white/35 mt-1">Logged {new Date(d.openedAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => closeDrift(d.id)} className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 text-white">Fixed</button>
                </li>
              ))}
            </ul>

            <form className="mt-4 grid gap-2 sm:grid-cols-[220px_1fr_auto]" onSubmit={e => { e.preventDefault(); addDrift(); }}>
              <select aria-label="Standing decision" value={principleId} onChange={e => setPrincipleId(e.target.value)} className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-[12px] text-white">
                <option value="">Which decision?</option>
                {data.principles.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <input aria-label="What drifted" value={note} onChange={e => setNote(e.target.value)} maxLength={400} placeholder="What drifted, and where"
                     className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-[12px] text-white" />
              <button type="submit" disabled={saving || !principleId || !note.trim()} className="px-4 py-2 rounded-xl text-[12px] font-black bg-white text-black disabled:opacity-40 inline-flex items-center gap-1.5">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Log drift
              </button>
            </form>
          </div>
        </section>
      )}

      {data && (
        <section aria-labelledby="hqcrew-h">
          <h3 id="hqcrew-h" className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-3">The HQ crew</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.crew.map(c => (
              <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-white">{c.name}</p>
                  <span className={`ml-auto text-[10px] font-bold ${c.status === 'live' ? 'text-emerald-300' : 'text-white/40'}`}>{c.status === 'live' ? 'Working' : 'Coming'}</span>
                </div>
                <p className="text-[12px] text-white/60 mt-1">{c.role}</p>
                <p className="text-[11px] text-white/40 mt-2">{c.promise}</p>
                <p className="text-[10px] text-white/35 mt-2">{c.model === 'none' ? 'Rules only, no AI' : 'Uses the cloud model'} · {c.never[0]}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default AriaHqBriefing;
