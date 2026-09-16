/**
 * MasterClock — the persistent production-day clock that sits above every Film tab.
 *
 * It reads the live production (active call sheet + today's scenes + today's DPR),
 * shows how far the day has drifted from schedule, the next threshold coming (meal
 * penalty / overtime / wrap), a budget-gated cost of the lost time, and role
 * stopwatches that log to the day's timer record. Compact by default; taps open the
 * timer tray. Everything is derived from data the hub already holds (see
 * services/masterClockService).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, AlertTriangle, DollarSign, Timer, Play, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { useProd } from './FilmProductionSuite';
import { fmtCall } from '../../services/filmProductionService';
import {
  buildDayClock, estimateLostTimeCost, fmtDriftLabel, fmtDuration, newTimerId,
  putTimerEntry, stopTimerEntry, subTimerEntries, TIMER_KINDS,
  type TimerEntry, type TimerKind,
} from '../../services/masterClockService';

const QUICK_KINDS: TimerKind[] = ['SETUP', 'TAKE', 'RELIGHT', 'COMPANY_MOVE'];

export const MasterClock: React.FC = () => {
  const { prod, activeSheet, scenes, members, dprs, me, can, isOwner } = useProd();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [entries, setEntries] = useState<TimerEntry[]>([]);
  const [open, setOpen] = useState(false);
  const tick = useRef<number | null>(null);

  // Subscribe to the day's timer log.
  useEffect(() => {
    if (!prod || prod.isShowcase) { setEntries([]); return; }
    return subTimerEntries(prod.id, setEntries);
  }, [prod?.id, prod?.isShowcase]);

  // Re-render on a cadence: every second while a timer runs, otherwise every 20s.
  const anyRunning = entries.some(entry => !entry.endedAt);
  useEffect(() => {
    const period = anyRunning ? 1000 : 20000;
    tick.current = window.setInterval(() => setNowMs(Date.now()), period);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [anyRunning]);

  const canCost = isOwner || can('MANAGE_BUDGET');
  const dayScenes = useMemo(
    () => (activeSheet ? scenes.filter(scene => scene.shootDay === activeSheet.shootDay) : []),
    [scenes, activeSheet?.shootDay],
  );
  const todayDpr = useMemo(
    () => (activeSheet ? dprs.find(dpr => dpr.shootDay === activeSheet.shootDay) || null : null),
    [dprs, activeSheet?.shootDay],
  );
  const clock = useMemo(() => buildDayClock(activeSheet, dayScenes, todayDpr, nowMs), [activeSheet, dayScenes, todayDpr, nowMs]);
  const cost = useMemo(() => estimateLostTimeCost(clock, members), [clock, members]);

  const running = entries.filter(entry => !entry.endedAt).sort((a, b) => a.startedAt - b.startedAt);
  const recent = entries.filter(entry => entry.endedAt).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).slice(0, 4);

  if (!prod || !activeSheet) return null;

  // Next threshold to surface.
  const threshold = clock.mealPenalty
    ? { tone: 'red', label: 'Meal penalty running', detail: `${Math.abs(clock.minsToMeal)} min past deadline` }
    : clock.otMin > 0
    ? { tone: 'red', label: 'Overtime projected', detail: `${clock.otMin} min OT` }
    : clock.minsToMeal <= 60 && clock.minsToMeal > 0
    ? { tone: 'amber', label: 'Meal due soon', detail: `in ${clock.minsToMeal} min` }
    : { tone: 'green', label: `Wrap ${fmtCall(minToClock(clock.generalCall, clock.projectedWrapMin))}`, detail: `${clock.scenesRemaining} scene${clock.scenesRemaining === 1 ? '' : 's'} left` };

  const driftLate = clock.driftMin > 4;
  const driftEarly = clock.driftMin < -4;
  const driftColor = driftLate ? 'text-red-400' : driftEarly ? 'text-emerald-400' : 'text-white/50';
  const toneChip = (tone: string) =>
    tone === 'red' ? 'text-red-300 bg-red-500/12 border-red-500/30'
    : tone === 'amber' ? 'text-amber-300 bg-amber-500/12 border-amber-500/30'
    : 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30';

  const readOnly = !!prod.isShowcase;
  const start = (kind: TimerKind) => {
    if (readOnly || !prod) return;
    const nextScene = dayScenes.find(scene => scene.status !== 'SHOT' && scene.status !== 'OMIT');
    putTimerEntry(prod.id, {
      id: newTimerId(), kind, shootDay: activeSheet.shootDay,
      sceneId: nextScene?.id, sceneNum: nextScene?.sceneNum,
      byMemberId: me?.id, byName: me?.name, byRole: me?.role,
      startedAt: Date.now(),
    });
  };
  const stop = (entry: TimerEntry) => { if (prod) stopTimerEntry(prod.id, entry, Date.now()); };
  const kindLabel = (kind: TimerKind) => TIMER_KINDS.find(item => item.kind === kind)?.label || kind;

  return (
    <div className="sticky top-0 z-30 -mx-1 mb-3">
      <div className="rounded-2xl border border-white/10 bg-[#141118]/95 backdrop-blur px-3.5 py-2.5 shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-300" />
            <span className="text-lg font-black tabular-nums tracking-tight text-white">{fmtCall(toClock(nowMs))}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30 hidden sm:inline">Day {activeSheet.shootDay}</span>
          </div>

          <div className={`flex items-center gap-1.5 text-xs font-black ${driftColor}`}>
            {driftLate && <AlertTriangle size={13} />}
            {fmtDriftLabel(clock.driftMin)}
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wide ${toneChip(threshold.tone)}`}>
            {threshold.label}<span className="opacity-60 font-bold normal-case tracking-normal hidden sm:inline">· {threshold.detail}</span>
          </span>

          {canCost && cost.total > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 text-[11px] font-black tabular-nums" title="Estimated cost of lost time today · Producers/UPM/Director only">
              <DollarSign size={11} />{cost.total.toLocaleString()}
            </span>
          )}

          <button onClick={() => setOpen(o => !o)} className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
            <Timer size={12} />{running.length ? <span className="text-amber-300">{running.length} running</span> : 'Timers'}
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {open && (
          <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
            {!readOnly && (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_KINDS.map(kind => (
                  <button key={kind} onClick={() => start(kind)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[11px] font-bold hover:bg-violet-500/15 hover:text-violet-300 hover:border-violet-500/30 transition-all">
                    <Play size={11} />{kindLabel(kind)}
                  </button>
                ))}
              </div>
            )}

            {running.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-500/[0.08] border border-amber-500/25">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-300/80 w-16 shrink-0">{kindLabel(entry.kind)}</span>
                <span className="flex-1 text-[11px] text-white/50 truncate">{entry.sceneNum ? `Sc ${entry.sceneNum} · ` : ''}{entry.byName || ''}</span>
                <span className="text-lg font-black tabular-nums text-amber-300">{fmtDuration((nowMs - entry.startedAt) / 1000)}</span>
                <button onClick={() => stop(entry)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/25 transition-all"><Square size={10} />Stop</button>
              </div>
            ))}
            {!running.length && <p className="text-[11px] text-white/30">No timers running. Start one to time a setup, take, relight, or move — it logs to the day.</p>}

            {recent.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/25">Logged today</p>
                {recent.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 text-[11px] text-white/40">
                    <span className="font-black text-white/60 w-16 shrink-0">{kindLabel(entry.kind)}</span>
                    <span className="flex-1 truncate">{entry.sceneNum ? `Sc ${entry.sceneNum}` : '—'}</span>
                    <span className="tabular-nums">{fmtDuration(entry.durationSec || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// A wall-clock HH:MM from an absolute timestamp.
function toClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// Add minutes to a HH:MM call time (wraps at 24h) → HH:MM, for projected-wrap display.
function minToClock(call: string, addMin: number): string {
  const [h, m] = call.split(':').map(Number);
  let total = ((h || 0) * 60 + (m || 0) + Math.round(addMin)) % 1440;
  if (total < 0) total += 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default MasterClock;
