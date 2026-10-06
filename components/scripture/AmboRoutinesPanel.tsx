// AmboRoutinesPanel — the "Routines" library tab.
// Sub-sections: Routines · Service Times · Locations · Layouts (output → monitor presets).
// All state lives in the shared RoutineEngine (services/ambo/routines.ts); this
// file is only forms and lists.

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Play, Plus, Trash2, GripVertical, Clock, MapPin, Monitor, Zap, Pencil, X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { Show } from '../../services/ambo/showModel';
import {
  rid, SUNDAY_IDS, sundayServiceTemplate, localTimezone,
  type Routine, type RoutineStep, type RoutineTrigger, type ServiceTime, type Location, type ArgSpec,
} from '../../services/ambo/routines';
import {
  getRoutineEngine, formatCountdown, getLayouts, setLayouts, subscribeLayouts, getLayoutsVersion, layoutApi,
} from '../../services/ambo/routineHost';
import type { OutputLayoutPreset } from '../../services/ambo/outputLayouts';

const line = 'rgba(255,255,255,0.09)';
const CYAN = '#00DAF3';
const ORANGE = '#FF8C00';
const EMERALD = '#10B981';
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const inputCls = 'bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-[#00DAF3]/60 min-w-0';
const btnCls = 'px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/10 bg-white/5 hover:bg-white/15 text-white/80 flex items-center gap-1';
const fmt = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function useEngineData() {
  const eng = getRoutineEngine();
  useSyncExternalStore(eng.subscribe, eng.getVersion, eng.getVersion);
  return { eng, data: eng.getData() };
}
function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

function triggerSummary(t: RoutineTrigger, data: ReturnType<typeof useEngineData>['data']): string {
  switch (t.kind) {
    case 'manual': return 'Manual only';
    case 'once': return `Once · ${fmt(t.at)}`;
    case 'weekly': return `Weekly · ${t.days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ') || 'no days'} ${t.time}${t.timezone ? ` (${t.timezone})` : ''}`;
    case 'service': {
      const st = data.serviceTimes.find(s => s.id === t.serviceTimeId);
      const o = t.offsetMin;
      return `${o === 0 ? 'At' : `${Math.abs(o)} min ${o < 0 ? 'before' : 'after'}`} ${st?.name ?? 'service (missing)'}`;
    }
    case 'event': return `When ${t.event.replace('-', ' ')}${t.key ? ` · ${t.key}` : ''}`;
  }
}

// ── Step argument form ───────────────────────────────────────────────────────

interface Lists { shows: Show[]; routines: Routine[]; serviceTimes: ServiceTime[]; layouts: OutputLayoutPreset[]; }

function ArgField({ spec, value, onChange, lists }: { spec: ArgSpec; value: any; onChange: (v: any) => void; lists: Lists }) {
  const refOptions: Array<{ value: string; label: string }> | null =
    spec.options ? spec.options
    : spec.ref === 'show' ? lists.shows.map(s => ({ value: s.id, label: `${s.title} (${s.kind.toLowerCase()})` }))
    : spec.ref === 'routine' ? lists.routines.map(r => ({ value: r.id, label: r.name }))
    : spec.ref === 'serviceTime' ? lists.serviceTimes.map(s => ({ value: s.id, label: s.name }))
    : spec.ref === 'layout' ? lists.layouts.map(l => ({ value: l.id, label: l.name }))
    : null;
  const label = <span className="text-[9px] text-white/40 uppercase tracking-wide">{spec.label}{spec.optional ? '' : ' *'}</span>;
  if (spec.kind === 'bool') {
    return (
      <label className="flex items-center gap-1.5 text-[10px] text-white/70 self-end pb-1">
        <input type="checkbox" checked={value === true || value === 'true'} onChange={e => onChange(e.target.checked)} /> {spec.label}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-0.5 min-w-[130px] flex-1">
      {label}
      {refOptions ? (
        <select className={inputCls} value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">{spec.optional || spec.default !== undefined ? '— none —' : '— choose —'}</option>
          {refOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          className={inputCls} type={spec.kind === 'number' ? 'number' : 'text'} step="any"
          value={value ?? ''} placeholder={spec.placeholder ?? (spec.default !== undefined ? String(spec.default) : '')}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

// ── Trigger editor ───────────────────────────────────────────────────────────

function toLocalInput(ms: number) {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TriggerEditor({ t, onChange, serviceTimes }: { t: RoutineTrigger; onChange: (t: RoutineTrigger) => void; serviceTimes: ServiceTime[] }) {
  const setKind = (k: RoutineTrigger['kind']) => {
    if (k === 'manual') onChange({ kind: 'manual' });
    else if (k === 'once') onChange({ kind: 'once', at: Date.now() + 3600_000 });
    else if (k === 'weekly') onChange({ kind: 'weekly', days: [0], time: '09:00' });
    else if (k === 'service') onChange({ kind: 'service', serviceTimeId: serviceTimes[0]?.id ?? '', offsetMin: -15 });
    else onChange({ kind: 'event', event: 'countdown-ended' });
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[9px] text-white/40 uppercase">Trigger</span>
        <select className={inputCls} value={t.kind} onChange={e => setKind(e.target.value as any)}>
          <option value="manual">Manual</option><option value="once">One time</option><option value="weekly">Weekly</option>
          <option value="service">At service time ± offset</option><option value="event">On event</option>
        </select>
      </label>
      {t.kind === 'once' && (
        <input type="datetime-local" className={inputCls} value={toLocalInput(t.at)}
          onChange={e => { const ms = Date.parse(e.target.value); if (Number.isFinite(ms)) onChange({ kind: 'once', at: ms }); }} />
      )}
      {t.kind === 'weekly' && (<>
        <div className="flex gap-0.5">
          {DAYS.map((d, i) => {
            const on = t.days.includes(i);
            return (
              <button key={i} title={DAY_NAMES[i]} onClick={() => onChange({ ...t, days: on ? t.days.filter(x => x !== i) : [...t.days, i].sort() })}
                className="w-6 h-6 rounded text-[10px] font-bold border"
                style={{ background: on ? 'rgba(0,218,243,0.2)' : 'transparent', borderColor: on ? CYAN : line, color: on ? CYAN : 'rgba(255,255,255,0.5)' }}>{d}</button>
            );
          })}
        </div>
        <input type="time" className={inputCls} value={t.time} onChange={e => onChange({ ...t, time: e.target.value })} />
        <input className={`${inputCls} w-40`} placeholder={`Timezone (${localTimezone()})`} value={t.timezone ?? ''} onChange={e => onChange({ ...t, timezone: e.target.value || undefined })} />
        <input className={`${inputCls} w-48`} placeholder="Skip dates YYYY-MM-DD, …" value={(t.skipDates ?? []).join(', ')}
          onChange={e => onChange({ ...t, skipDates: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
      </>)}
      {t.kind === 'service' && (<>
        <select className={inputCls} value={t.serviceTimeId} onChange={e => onChange({ ...t, serviceTimeId: e.target.value })}>
          <option value="">— service time —</option>
          {serviceTimes.map(s => <option key={s.id} value={s.id}>{s.name} · {DAY_NAMES[s.weekday].slice(0, 3)} {s.time}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-white/60">offset (min)
          <input type="number" className={`${inputCls} w-16`} value={t.offsetMin} onChange={e => onChange({ ...t, offsetMin: parseInt(e.target.value || '0', 10) })} />
          <span className="text-white/30">negative = before</span>
        </label>
      </>)}
      {t.kind === 'event' && (<>
        <select className={inputCls} value={t.event} onChange={e => onChange({ ...t, event: e.target.value as any })}>
          <option value="countdown-ended">Countdown ended</option><option value="slide-entered">Slide entered</option><option value="routine-finished">Routine finished</option>
        </select>
        <input className={`${inputCls} w-44`} placeholder="Timer / slide / routine id (blank = any)" value={t.key ?? ''} onChange={e => onChange({ ...t, key: e.target.value || undefined })} />
      </>)}
    </div>
  );
}

// ── Routine editor ───────────────────────────────────────────────────────────

function RoutineEditor({ initial, lists, onSave, onCancel, eng }: {
  initial: Routine; lists: Lists; onSave: (r: Routine) => void; onCancel: () => void; eng: ReturnType<typeof getRoutineEngine>;
}) {
  const [r, setR] = useState<Routine>(initial);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const patchStep = (i: number, p: Partial<RoutineStep>) => setR(prev => ({ ...prev, steps: prev.steps.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const move = (from: number, to: number) => setR(prev => {
    if (from === to || to < 0 || to >= prev.steps.length) return prev;
    const steps = prev.steps.slice(); const [m] = steps.splice(from, 1); steps.splice(to, 0, m);
    return { ...prev, steps };
  });
  const groups = useMemo(() => eng.registry.groups(), [eng]);

  return (
    <div className="border rounded-xl p-3 space-y-3 bg-black/30" style={{ borderColor: 'rgba(0,218,243,0.35)' }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 flex-1 min-w-[200px]">
          <span className="text-[9px] text-white/40 uppercase">Name</span>
          <input className={inputCls} value={r.name} onChange={e => setR({ ...r, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-white/40 uppercase">Location</span>
          <select className={inputCls} value={r.locationId ?? ''} onChange={e => setR({ ...r, locationId: e.target.value || undefined })}>
            <option value="">— any —</option>
            {eng.getData().locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-white/40 uppercase">Late grace (min)</span>
          <input type="number" className={`${inputCls} w-20`} value={r.graceMin ?? 5} onChange={e => setR({ ...r, graceMin: parseInt(e.target.value || '0', 10) })} />
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-white/70 pb-1">
          <input type="checkbox" checked={!!r.stopOnError} onChange={e => setR({ ...r, stopOnError: e.target.checked })} /> stop on error
        </label>
      </div>
      <TriggerEditor t={r.trigger} serviceTimes={lists.serviceTimes} onChange={trigger => setR({ ...r, trigger })} />

      <div className="space-y-1.5">
        <div className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Steps — drag to reorder · “with previous” runs alongside the step above</div>
        {r.steps.length === 0 && <div className="text-[10px] text-white/30 py-2">No steps yet.</div>}
        {r.steps.map((s, i) => {
          const act = eng.registry.get(s.fn);
          const problem = eng.registry.validate(s.fn, s.args ?? {});
          return (
            <div key={s.id}
              draggable onDragStart={() => setDragFrom(i)} onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragFrom != null) move(dragFrom, i); setDragFrom(null); }}
              className="rounded-lg border p-2 bg-white/[0.03]"
              style={{ borderColor: problem ? 'rgba(255,140,0,0.5)' : line, marginLeft: s.parallel && i > 0 ? 18 : 0, opacity: s.enabled === false ? 0.45 : 1 }}>
              <div className="flex flex-wrap items-center gap-2">
                <GripVertical size={13} className="text-white/30 cursor-grab flex-none" />
                <span className="text-[9px] font-mono text-white/30 w-4">{i + 1}</span>
                <select className={inputCls} value={s.fn} onChange={e => patchStep(i, { fn: e.target.value, args: {} })}>
                  {groups.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.actions.map(a => <option key={a.name} value={a.name}>{a.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-white/60"><input type="checkbox" checked={!!s.parallel} disabled={i === 0} onChange={e => patchStep(i, { parallel: e.target.checked })} /> with previous</label>
                <label className="flex items-center gap-1 text-[10px] text-white/60">delay
                  <input type="number" className={`${inputCls} w-14`} value={s.delaySec ?? 0} onChange={e => patchStep(i, { delaySec: parseFloat(e.target.value || '0') })} />s
                </label>
                <label className="flex items-center gap-1 text-[10px] text-white/60"><input type="checkbox" checked={s.enabled !== false} onChange={e => patchStep(i, { enabled: e.target.checked })} /> on</label>
                <div className="flex-1" />
                <button onClick={() => move(i, i - 1)} className="text-white/40 hover:text-white text-[11px]" title="Move up">↑</button>
                <button onClick={() => move(i, i + 1)} className="text-white/40 hover:text-white text-[11px]" title="Move down">↓</button>
                <button onClick={() => setR({ ...r, steps: r.steps.filter((_, k) => k !== i) })} className="text-white/40 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
              {act && act.args.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 pl-6">
                  {act.args.map(spec => (
                    <ArgField key={spec.key} spec={spec} lists={lists} value={s.args?.[spec.key]}
                      onChange={v => patchStep(i, { args: { ...s.args, [spec.key]: v } })} />
                  ))}
                </div>
              )}
              {problem && <div className="text-[9.5px] mt-1 pl-6" style={{ color: ORANGE }}>{problem}</div>}
            </div>
          );
        })}
        <button className={btnCls} onClick={() => setR({ ...r, steps: [...r.steps, { id: rid('st'), fn: 'slide.take', args: {} }] })}><Plus size={11} /> Add step</button>
      </div>
      <div className="flex gap-2 justify-end">
        <button className={btnCls} onClick={onCancel}><X size={11} /> Cancel</button>
        <button className={btnCls} style={{ borderColor: CYAN, color: CYAN }} onClick={() => onSave(r)}><Check size={11} /> Save routine</button>
      </div>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

type Section = 'routines' | 'services' | 'locations' | 'layouts';

export default function AmboRoutinesPanel({ shows = [] }: { shows?: Show[] }) {
  const { eng, data } = useEngineData();
  useSyncExternalStore(subscribeLayouts, getLayoutsVersion, getLayoutsVersion);
  const layouts = getLayouts();
  const now = useNow();
  const [section, setSection] = useState<Section>('routines');
  const [editing, setEditing] = useState<Routine | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lists: Lists = { shows, routines: data.routines, serviceTimes: data.serviceTimes, layouts };

  const newRoutine = (): Routine => ({ id: rid('rtn'), name: 'New routine', enabled: true, trigger: { kind: 'manual' }, steps: [] });
  const run = async (id: string) => { setBusy(id); try { await eng.runRoutine(id, 0, 'manual'); } finally { setBusy(null); } };

  const sections: Array<{ id: Section; label: string; icon: React.ReactNode; count: number }> = [
    { id: 'routines', label: 'Routines', icon: <Zap size={12} />, count: data.routines.length },
    { id: 'services', label: 'Service Times', icon: <Clock size={12} />, count: data.serviceTimes.length },
    { id: 'locations', label: 'Locations', icon: <MapPin size={12} />, count: data.locations.length },
    { id: 'layouts', label: 'Output Layouts', icon: <Monitor size={12} />, count: layouts.length },
  ];
  const next = eng.nextScheduled(now);
  const locName = (id?: string) => data.locations.find(l => l.id === id)?.name;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="w-44 flex-none border-r p-2 space-y-1" style={{ borderColor: line }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-semibold border"
            style={{ background: section === s.id ? 'rgba(255,255,255,0.1)' : 'transparent', borderColor: section === s.id ? 'rgba(255,255,255,0.18)' : 'transparent', color: section === s.id ? '#fff' : 'rgba(255,255,255,0.6)' }}>
            <span style={{ color: section === s.id ? CYAN : undefined }}>{s.icon}</span><span className="flex-1 text-left">{s.label}</span>
            <span className="font-mono text-[9px] text-white/40">{s.count}</span>
          </button>
        ))}
        <div className="pt-2 mt-2 border-t text-[9.5px] text-white/40 leading-snug" style={{ borderColor: line }}>
          {next ? (<>Next: <span className="text-white/80">{next.routine.name}</span><br />{fmt(next.at)}<br /><span style={{ color: CYAN }}>in {formatCountdown(next.at - now)}</span></>) : 'Nothing scheduled.'}
          {data.countdowns.map(c => (
            <div key={c.id} className="mt-1" style={{ color: ORANGE }}>{c.label}: {formatCountdown(c.endsAt - now)}</div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-3 space-y-2">
        {section === 'routines' && (<>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnCls} onClick={() => setEditing(newRoutine())}><Plus size={11} /> New routine</button>
            <button className={btnCls} title="Pre-service countdown + playlist at T-15, then the opening when the countdown ends"
              onClick={() => { eng.install(sundayServiceTemplate({ layoutId: layouts[0]?.id })); }}>
              <Zap size={11} /> Install “Sunday Service” template
            </button>
            <span className="text-[10px] text-white/35">Routines run in this window while Ambo is open. Missed runs inside the grace window fire late; older ones are skipped and logged.</span>
          </div>
          {editing && (
            <RoutineEditor key={editing.id} initial={editing} lists={lists} eng={eng}
              onCancel={() => setEditing(null)} onSave={r => { eng.upsertRoutine(r); setEditing(null); }} />
          )}
          {data.routines.length === 0 && !editing && <div className="text-[11px] text-white/35 py-6 text-center">No routines yet. Install the Sunday Service template to see the full chain.</div>}
          {data.routines.map(r => {
            const at = eng.nextRun(r, now);
            const missing = r.steps.map(s => eng.registry.validate(s.fn, s.args ?? {})).filter(Boolean).length;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border px-3 py-2 bg-white/[0.03]" style={{ borderColor: line }}>
                <button onClick={() => eng.upsertRoutine({ ...r, enabled: !r.enabled })} title={r.enabled ? 'Enabled' : 'Disabled'}
                  className="w-8 h-4 rounded-full relative flex-none" style={{ background: r.enabled ? EMERALD : 'rgba(255,255,255,0.15)' }}>
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: r.enabled ? 18 : 2 }} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white truncate">{r.name}{locName(r.locationId) && <span className="text-white/35 font-normal"> · {locName(r.locationId)}</span>}</div>
                  <div className="text-[10px] text-white/45 truncate">{triggerSummary(r.trigger, data)} · {r.steps.length} step{r.steps.length === 1 ? '' : 's'}
                    {missing > 0 && <span style={{ color: ORANGE }}> · {missing} need setup</span>}</div>
                  {r.enabled && at != null && <div className="text-[10px]" style={{ color: CYAN }}>Next: {fmt(at)} · in {formatCountdown(at - now)}</div>}
                </div>
                <button className={btnCls} disabled={busy === r.id || eng.isRunning(r.id)} onClick={() => run(r.id)}><Play size={11} /> {eng.isRunning(r.id) ? 'Running…' : 'Run now'}</button>
                <button className={btnCls} onClick={() => setEditing(r)}><Pencil size={11} /></button>
                <button className={btnCls} onClick={() => { if (confirm(`Delete “${r.name}”?`)) eng.removeRoutine(r.id); }}><Trash2 size={11} /></button>
              </div>
            );
          })}
          <div className="pt-2">
            <button className="flex items-center gap-1 text-[10px] font-bold text-white/60 hover:text-white" onClick={() => setShowLog(v => !v)}>
              {showLog ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Run log ({data.log.length})
            </button>
            {showLog && (
              <div className="mt-1 space-y-1">
                {data.log.length === 0 && <div className="text-[10px] text-white/30">Nothing has run yet.</div>}
                {data.log.slice(0, 40).map(l => (
                  <div key={l.id} className="text-[10px] font-mono rounded border px-2 py-1 bg-black/30" style={{ borderColor: l.ok ? 'rgba(16,185,129,0.3)' : 'rgba(255,140,0,0.4)' }}>
                    <span className="text-white/40">{new Date(l.at).toLocaleTimeString()}</span>{' '}
                    <span className="text-white">{l.routineName}</span>{' '}
                    <span className="text-white/40">[{l.reason}]</span>{' '}
                    <span style={{ color: l.ok ? EMERALD : ORANGE }}>{l.ok ? 'ok' : 'problem'}</span>
                    {l.note && <span className="text-white/50"> — {l.note}</span>}
                    {l.steps.filter(s => !s.ok).map((s, i) => <div key={i} style={{ color: ORANGE }}>  ✗ {s.fn}: {s.error}</div>)}
                  </div>
                ))}
                {data.log.length > 0 && <button className={btnCls} onClick={() => eng.clearLog()}>Clear log</button>}
              </div>
            )}
          </div>
        </>)}

        {section === 'services' && <ServiceTimesSection data={data} eng={eng} />}
        {section === 'locations' && <LocationsSection data={data} eng={eng} layouts={layouts} />}
        {section === 'layouts' && <LayoutsSection layouts={layouts} />}
      </div>
    </div>
  );
}

// ── Service times ────────────────────────────────────────────────────────────

function ServiceTimesSection({ data, eng }: { data: ReturnType<typeof useEngineData>['data']; eng: ReturnType<typeof getRoutineEngine> }) {
  const add = () => eng.upsertServiceTime({ id: rid('svc'), name: 'New service', weekday: 0, time: '10:00', durationMin: 75, locationId: data.locations[0]?.id ?? '', enabled: true });
  const now = useNow(30000);
  return (
    <div className="space-y-2">
      <button className={btnCls} onClick={add}><Plus size={11} /> Add service time</button>
      {data.serviceTimes.length === 0 && <div className="text-[11px] text-white/35 py-4 text-center">No service times. Routines can fire “15 minutes before” a service once one exists.</div>}
      {data.serviceTimes.map(s => {
        const patch = (p: Partial<ServiceTime>) => eng.upsertServiceTime({ ...s, ...p });
        const at = eng.nextRun({ id: '_', name: '', enabled: true, steps: [], trigger: { kind: 'service', serviceTimeId: s.id, offsetMin: 0 } }, now);
        const used = data.routines.filter(r => r.trigger.kind === 'service' && r.trigger.serviceTimeId === s.id).length;
        return (
          <div key={s.id} className="rounded-xl border p-2.5 bg-white/[0.03] space-y-1.5" style={{ borderColor: line, opacity: s.enabled === false ? 0.55 : 1 }}>
            <div className="flex flex-wrap items-end gap-2">
              <input className={`${inputCls} w-44`} value={s.name} onChange={e => patch({ name: e.target.value })} />
              <select className={inputCls} value={s.weekday} onChange={e => patch({ weekday: +e.target.value })}>{DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
              <input type="time" className={inputCls} value={s.time} onChange={e => patch({ time: e.target.value })} />
              <label className="flex items-center gap-1 text-[10px] text-white/60">length<input type="number" className={`${inputCls} w-16`} value={s.durationMin} onChange={e => patch({ durationMin: parseInt(e.target.value || '0', 10) })} />min</label>
              <select className={inputCls} value={s.locationId} onChange={e => patch({ locationId: e.target.value })}>
                <option value="">— location —</option>{data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <label className="flex items-center gap-1 text-[10px] text-white/60"><input type="checkbox" checked={s.enabled !== false} onChange={e => patch({ enabled: e.target.checked })} /> on</label>
              <div className="flex-1" />
              <button className={btnCls} onClick={() => { if (confirm(`Delete “${s.name}”?`)) eng.removeServiceTime(s.id); }}><Trash2 size={11} /></button>
            </div>
            <input className={`${inputCls} w-full`} placeholder="Skip dates (holidays) YYYY-MM-DD, …" value={(s.skipDates ?? []).join(', ')}
              onChange={e => patch({ skipDates: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
            <div className="text-[10px] text-white/40">{at != null ? `Next: ${fmt(at)}` : 'No upcoming occurrence'} · {used} routine{used === 1 ? '' : 's'} attached</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Locations ────────────────────────────────────────────────────────────────

function LocationsSection({ data, eng, layouts }: { data: ReturnType<typeof useEngineData>['data']; eng: ReturnType<typeof getRoutineEngine>; layouts: OutputLayoutPreset[] }) {
  const zones: string[] = useMemo(() => { try { return (Intl as any).supportedValuesOf('timeZone'); } catch { return []; } }, []);
  return (
    <div className="space-y-2">
      <datalist id="ambo-tz">{zones.map(z => <option key={z} value={z} />)}</datalist>
      <button className={btnCls} onClick={() => eng.upsertLocation({ id: rid('loc'), name: 'New location', timezone: localTimezone() })}><Plus size={11} /> Add location</button>
      {data.locations.length === 0 && <div className="text-[11px] text-white/35 py-4 text-center">No locations. A location carries the timezone (so “10:00” means 10:00 there) and its output layout.</div>}
      {data.locations.map(l => {
        const patch = (p: Partial<Location>) => eng.upsertLocation({ ...l, ...p });
        return (
          <div key={l.id} className="rounded-xl border p-2.5 bg-white/[0.03] flex flex-wrap items-end gap-2" style={{ borderColor: line }}>
            <input className={`${inputCls} w-44`} value={l.name} onChange={e => patch({ name: e.target.value })} />
            <input className={`${inputCls} w-56`} placeholder="Address" value={l.address ?? ''} onChange={e => patch({ address: e.target.value || undefined })} />
            <input className={`${inputCls} w-48`} list="ambo-tz" value={l.timezone} onChange={e => patch({ timezone: e.target.value })} />
            <select className={inputCls} value={l.outputPresetId ?? ''} onChange={e => patch({ outputPresetId: e.target.value || undefined })}>
              <option value="">— output layout —</option>{layouts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex-1" />
            <button className={btnCls} onClick={() => { if (confirm(`Delete “${l.name}”?`)) eng.removeLocation(l.id); }}><Trash2 size={11} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ── Output layouts ───────────────────────────────────────────────────────────

function LayoutsSection({ layouts }: { layouts: OutputLayoutPreset[] }) {
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('Sunday setup');
  const patch = (id: string, p: Partial<OutputLayoutPreset>) => setLayouts(layouts.map(l => (l.id === id ? { ...l, ...p } : l)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-44`} value={name} onChange={e => setName(e.target.value)} />
        <button className={btnCls} onClick={async () => {
          const p = await layoutApi.capture?.(name);
          if (!p) { setMsg('Open an output on a monitor first, then capture.'); return; }
          setLayouts([...layouts.filter(l => l.id !== p.id), p]); setMsg(`Captured ${p.placements.length} output(s).`);
        }}><Plus size={11} /> Capture current outputs</button>
        <button className={btnCls} onClick={() => layoutApi.closeAll?.()}>Close all output windows</button>
        <span className="text-[10px] text-white/40">{msg}</span>
      </div>
      <div className="text-[10px] text-white/35">Each output is remembered by its monitor (name + resolution), falling back to the monitor’s position. Browsers may block auto-opened windows until you click once; the Windows app does not.</div>
      {layouts.map(l => (
        <div key={l.id} className="rounded-xl border p-2.5 bg-white/[0.03] space-y-1.5" style={{ borderColor: line }}>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputCls} w-44`} value={l.name} onChange={e => patch(l.id, { name: e.target.value })} />
            <select className={inputCls} value={l.autoOpen ?? 'never'} onChange={e => patch(l.id, { autoOpen: e.target.value as any })}>
              <option value="never">Open manually</option><option value="startup">Auto-open on startup</option><option value="service-start">Auto-open when a service starts</option>
            </select>
            <label className="flex items-center gap-1 text-[10px] text-white/60"><input type="checkbox" checked={l.followHotplug !== false} onChange={e => patch(l.id, { followHotplug: e.target.checked })} /> re-place on monitor plug/unplug</label>
            <div className="flex-1" />
            <button className={btnCls} onClick={async () => { await layoutApi.apply?.(l.id); setMsg(`Applied “${l.name}”.`); }}><Play size={11} /> Apply</button>
            <button className={btnCls} onClick={() => { if (confirm(`Delete “${l.name}”?`)) setLayouts(layouts.filter(x => x.id !== l.id)); }}><Trash2 size={11} /></button>
          </div>
          <div className="text-[10px] text-white/45 flex flex-wrap gap-x-3">
            {l.placements.map(p => <span key={p.outputId}>{p.outputId} → {p.displayLabel ?? `display ${p.displayIndex}`}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

export { SUNDAY_IDS };
