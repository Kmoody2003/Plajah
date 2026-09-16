/**
 * OnSetMobile — the phone-first "Today" screen for the on-set companion.
 *
 * The one screen a crew or cast member needs in the field: their staggered call as
 * a countdown and a time-spine, today's scenes, a one-tap confirm-receipt, and the
 * on-set quick actions. Rendered by ProductionHubTab on phones; the Master Clock
 * sits persistently above it. Built entirely from buildDailyBrief + the live call
 * sheet — no new data.
 */

import React, { useEffect, useState } from 'react';
import { Check, MapPin, Sun, AlertTriangle, Coffee, FileText, Radio, Send, ChevronRight } from 'lucide-react';
import { useProd } from './FilmProductionSuite';
import { buildDailyBrief, fmtCall } from '../../services/filmProductionService';
import { acknowledgeRecipientDelivery } from '../../services/productionScheduleService';

/** Phones and small tablets in portrait get the on-set shell. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 700 : false));
  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return phone;
}

const hhmm = (s?: string): number | null => (s && /^\d{1,2}:\d{2}/.test(s) ? Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]) : null);

export const OnSetMobile: React.FC = () => {
  const { prod, activeSheet, scenes, me, goTab } = useProd();
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 30000);
    return () => window.clearInterval(t);
  }, []);

  if (!prod || !activeSheet) {
    return <div className="p-8 text-center text-white/40 text-sm">No call sheet for today yet. Generate one from the On Set hub.</div>;
  }

  const brief = me ? buildDailyBrief(activeSheet, me) : null;
  const isCast = !!(me?.isCast || me?.dept === 'CAST');
  const yourCall = brief?.yourCall || activeSheet.generalCall;
  const callMin = hhmm(yourCall);
  const toCall = callMin != null ? callMin - nowMin : null;
  const countdown = toCall == null ? '' : toCall > 90 ? `in ${Math.floor(toCall / 60)}h ${toCall % 60}m` : toCall > 1 ? `in ${toCall} min` : toCall > -1 ? 'now' : 'call passed';

  // Time-spine: cast see their staggered calls; everyone sees the meals.
  const steps = [
    ...(brief?.callBreakdown || (brief ? [{ label: 'Your call', time: yourCall }] : [])),
    ...(activeSheet.meals || []).map(m => ({ label: m.label, time: m.time })),
  ].map(step => ({ ...step, min: hhmm(step.time) })).filter(step => step.min != null)
    .sort((a, b) => (a.min! - b.min!));
  const stepState = (min: number) => (min <= nowMin - 5 ? 'done' : min <= nowMin + 5 ? 'now' : 'next');

  const confirmed = !!brief?.confirmed;
  const confirm = async () => {
    if (!me || confirmed) return;
    setBusy(true);
    try { await acknowledgeRecipientDelivery(prod.id, activeSheet.id, activeSheet.version, me); }
    catch { /* offline — queues */ }
    finally { setBusy(false); }
  };

  const dayScenes = brief?.scenes || activeSheet.sceneRows;
  const actions: { icon: React.ReactNode; label: string; sub: string; tab: string }[] = [
    { icon: <Coffee size={17} />, label: 'Craft request', sub: 'Order to set', tab: 'film_craft' },
    { icon: <FileText size={17} />, label: 'Read sides', sub: 'Today’s pages', tab: 'film_reports' },
    { icon: <Send size={17} />, label: 'Report a problem', sub: 'To the AD', tab: 'film_chat' },
    { icon: <Radio size={17} />, label: 'Crew PTT', sub: 'Phone-to-phone', tab: 'film_chat' },
  ];

  return (
    <div className="max-w-md mx-auto space-y-3.5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 font-mono">Day {activeSheet.shootDay} of {activeSheet.totalDays} · {dayScenes[0]?.dayNight || ''}</p>
          <p className="text-lg font-black text-white leading-tight mt-0.5">{activeSheet.locationName}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wide">
          Ch {brief?.channel ?? 1} · Radio
        </span>
      </div>

      {/* Call hero */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.14] to-white/[0.02] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">{isCast ? 'Your pickup' : 'Your call'}</p>
        <p className="text-4xl font-black text-white tabular-nums leading-none mt-1">{fmtCall(yourCall)}</p>
        <p className="text-[11px] text-white/45 mt-1.5 font-mono">{me?.name || 'You'}{me?.character ? ` · ${me.character}` : ''} — {countdown}</p>
      </div>

      {/* Time-spine */}
      {steps.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {steps.map((step, i) => {
            const s = stepState(step.min!);
            return (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className="w-14 text-sm font-black tabular-nums font-mono text-white/80">{fmtCall(step.time)}</span>
                <span className={`w-3 h-3 rounded-full shrink-0 ${s === 'done' ? 'bg-emerald-400' : s === 'now' ? 'bg-amber-400 ring-4 ring-amber-400/25' : 'bg-white/10 border-2 border-white/25'}`} />
                <span className={`text-sm font-semibold ${s === 'now' ? 'text-amber-300' : 'text-white/70'}`}>{step.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Scenes */}
      {dayScenes.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">{isCast ? 'Your scenes' : 'Shooting today'}</p>
          <div className="flex flex-wrap gap-1.5">
            {dayScenes.map((sc, i) => (
              <span key={i} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold font-mono">
                {sc.sceneNum} <span className="text-white/35">{sc.intExt}/{(sc.dayNight || '').slice(0, 3)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Safety */}
      {brief?.safetyNotes && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.08] p-4 flex gap-2.5">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-white/70">{brief.safetyNotes}</p>
        </div>
      )}

      {/* Confirm */}
      {me && (
        <button onClick={confirm} disabled={confirmed || busy}
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[15px] font-black tracking-tight transition-all ${confirmed ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-violet-500 text-white hover:bg-violet-400'}`}>
          <Check size={18} />{confirmed ? 'Call confirmed' : busy ? 'Confirming…' : 'I’ve got my call'}
        </button>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map(a => (
          <button key={a.label} onClick={() => goTab(a.tab)} className="text-left rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-violet-500/30 hover:bg-violet-500/[0.06] transition-all">
            <span className="inline-grid place-items-center w-9 h-9 rounded-xl bg-white/5 text-violet-300 mb-2">{a.icon}</span>
            <p className="text-[13px] font-bold text-white leading-tight">{a.label}</p>
            <p className="text-[10px] text-white/35 font-mono">{a.sub}</p>
          </button>
        ))}
      </div>

      {/* Location / weather footer */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
        {brief?.locationAddress && (
          <div className="flex items-center gap-2 text-[12px] text-white/60"><MapPin size={14} className="text-white/30" />{brief.locationAddress}</div>
        )}
        {activeSheet.weather?.sunset && (
          <div className="flex items-center gap-2 text-[12px] text-white/60"><Sun size={14} className="text-amber-300/70" />Sunset {fmtCall(activeSheet.weather.sunset)}{activeSheet.weather.sunrise ? ` · Sunrise ${fmtCall(activeSheet.weather.sunrise)}` : ''}</div>
        )}
        <button onClick={() => goTab('film_callsheets')} className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-violet-300 pt-1">
          Full call sheet <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

export default OnSetMobile;
