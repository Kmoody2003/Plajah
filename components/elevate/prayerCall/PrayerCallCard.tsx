// PrayerCallCard — sits on a ministry/department page. Members of the ministry see "Prayer Call live"
// with a Join button while a call runs; leaders (pastors, this ministry's heads/admins, its staff) get
// "Start a Prayer Call". Everyone else sees nothing: the server answers non-members with no call at all.
// Faith orgs only. Opens PrayerCallRoom full screen.
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { HandHeart, Radio, Loader2, ChevronDown } from 'lucide-react';
import type { Ministry, Organization } from '../../../types';
import { isFaithOrg } from '../../../services/elevateTemplates';
import { formatLeft, msLeft, type PrayerCallView } from '../../../services/elevate/prayerCallCore';
import { failed, prayerCallApi, type PrayerCallState } from '../../../services/elevate/prayerCallClient';

const PrayerCallRoom = lazy(() => import('./PrayerCallRoom'));
const LENGTHS = [15, 30, 45, 60];

const PrayerCallCard: React.FC<{ org: Pick<Organization, 'id' | 'orgType'>; ministry: Pick<Ministry, 'id' | 'name'>; pollMs?: number }> = ({ org, ministry, pollMs = 20_000 }) => {
  const faith = isFaithOrg(org.orgType);
  const [state, setState] = useState<PrayerCallState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [requestsOn, setRequestsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const r = await prayerCallApi.state(org.id, ministry.id);
    if (failed(r)) return;
    setState(r);
    if (r.call) setOffset(r.call.serverNow - Date.now());
  }, [org.id, ministry.id]);

  useEffect(() => {
    if (!faith || open) return;
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, pollMs);
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [faith, open, refresh, pollMs]);

  const live: PrayerCallView | null = state?.call && state.call.status === 'LIVE' && !state.call.removed ? state.call : null;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!faith || !state || (!state.canJoin && !state.canStart)) return null;

  const start = async () => {
    setBusy(true); setError('');
    const r = await prayerCallApi.start(org.id, ministry.id, { minutes, requestsOn });
    setBusy(false);
    if (failed(r)) { setError(r.error); return; }
    setState(s => ({ ...(s as PrayerCallState), call: r.call }));
    setOffset(r.call.serverNow - Date.now());
    setSetup(false); setOpen(true);
  };

  const left = live ? msLeft(live, now + offset) : 0;

  return (
    <>
      {live ? (
        <div data-testid="prayer-call-live-card" className="mb-6 rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-amber-400/20 via-amber-300/10 to-transparent border border-amber-300/30 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative w-12 h-12 rounded-2xl bg-amber-300/20 flex items-center justify-center shrink-0">
              <HandHeart size={22} className="text-amber-200" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 ring-2 ring-[#0b0a12] animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-200 flex items-center gap-1.5"><Radio size={11} /> Prayer Call live</div>
              <div className="text-white font-bold truncate">{live.title}</div>
              <div className="text-[12px] text-white/55">Started by {live.startedByName} · {live.present.length} praying · {formatLeft(left)} left</div>
            </div>
          </div>
          <button onClick={() => setOpen(true)} className="h-11 px-6 rounded-full bg-amber-300 text-black text-sm font-black shrink-0">Join</button>
        </div>
      ) : state.canStart ? (
        <div className="mb-6">
          {!setup ? (
            <button onClick={() => setSetup(true)} data-testid="prayer-call-start"
              className="h-10 px-4 rounded-full text-[12px] font-bold flex items-center gap-1.5 bg-amber-300/15 hover:bg-amber-300/25 text-amber-100 border border-amber-300/25">
              <HandHeart size={14} /> Start a Prayer Call
            </button>
          ) : (
            <div className="rounded-3xl p-4 sm:p-5 bg-white/[0.04] border border-white/10 max-w-lg">
              <div className="flex items-center gap-2 text-white font-bold"><HandHeart size={16} className="text-amber-300" /> Start a Prayer Call</div>
              <p className="text-[12px] text-white/55 mt-1">Only members of {ministry.name} can see and join. It isn’t posted or broadcast, and it closes on its own when time is up.</p>
              <div className="mt-4 text-[11px] uppercase tracking-widest font-black text-white/40">Length</div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {LENGTHS.map(n => (
                  <button key={n} onClick={() => setMinutes(n)} className={`h-9 px-3.5 rounded-full text-[12px] font-bold ${minutes === n ? 'bg-amber-300 text-black' : 'bg-white/[0.07] text-white/75 hover:bg-white/15'}`}>{n} min</button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-[13px] text-white/80 cursor-pointer select-none">
                <input type="checkbox" checked={requestsOn} onChange={e => setRequestsOn(e.target.checked)} className="w-4 h-4 accent-amber-300" />
                Open a prayer-request list
              </label>
              {error && <p className="text-[12px] text-red-300 mt-3">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button onClick={start} disabled={busy} className="h-10 px-5 rounded-full bg-amber-300 text-black text-sm font-black flex items-center gap-2 disabled:opacity-50">
                  {busy && <Loader2 size={14} className="animate-spin" />} Start now
                </button>
                <button onClick={() => setSetup(false)} className="h-10 px-4 rounded-full bg-white/[0.07] text-white/70 text-sm flex items-center gap-1">Cancel <ChevronDown size={14} className="rotate-180" /></button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {open && state.call && (
        <Suspense fallback={<div className="fixed inset-0 z-[120] bg-[#07070c] flex items-center justify-center text-white/60"><Loader2 className="animate-spin" /></div>}>
          <PrayerCallRoom orgId={org.id} ministryId={ministry.id} initial={state.call} media={state.media !== false}
            onClose={() => { setOpen(false); void refresh(); }} />
        </Suspense>
      )}
    </>
  );
};

export default PrayerCallCard;
