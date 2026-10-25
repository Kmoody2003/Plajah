// FanVoteSlotsEditor — FAST Channel Manager → Fan Vote. A creator lets their audience pick what airs
// in a time slot: they choose the time, the days, 2–8 of their own videos, when voting closes, and
// (optionally) a commercial-free goal fans can fund. Saving drops a placeholder into the schedule at
// exactly that time; the server opens each night's ballot and swaps the winner in when voting closes
// (routes/fastVote.ts). Nothing else in the day moves after that, because the slot is reserved at the
// longest choice's length.

import React, { useMemo, useState } from 'react';
import { CalendarClock, Check, HeartHandshake, Plus, Trash2, Vote } from 'lucide-react';
import type { FastChannelSchedule, Video } from '../../types';
import {
  adPlanFor, clampCutoff, insertVoteGroup, removeVoteGroup, reservedSecFor, secToHHMM, voteGroup,
  type CreatorVoteSlot, type VoteAwareSlot, type VoteOption,
} from '../../services/fast/voteSchedule';
import { viewerTimeZone } from '../../services/platformClock';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CUTOFFS = [15, 30, 60, 120, 240];

function videoToOption(v: Video): VoteOption | null {
  const mux = (v as any).muxPlaybackId;
  const url = mux ? `https://stream.mux.com/${mux}.m3u8` : v.url;
  const dur = Number((v as any).exactDurationSec ?? v.duration) || 0;
  if (!url || dur <= 0) return null;
  return { videoId: v.id, title: v.title || 'Untitled', videoUrl: url, durationSec: dur, thumbnail: v.thumbnailUrl };
}
const hm = (sec: number) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
const clock = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

export const FanVoteSlotsEditor: React.FC<{
  schedule: FastChannelSchedule | null;
  videos: Video[];
  onSave: (next: FastChannelSchedule) => Promise<void>;
}> = ({ schedule, videos, onSave }) => {
  const slots: CreatorVoteSlot[] = ((schedule as any)?.voteSlots as CreatorVoteSlot[]) || [];
  const tz = schedule?.timezone || viewerTimeZone();
  const plan = adPlanFor(schedule);
  const options = useMemo(() => videos.map(videoToOption).filter(Boolean) as VoteOption[], [videos]);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Fan Pick');
  const [time, setTime] = useState('21:00');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [picked, setPicked] = useState<string[]>([]);
  const [perBallot, setPerBallot] = useState(4);
  const [cutoff, setCutoff] = useState(60);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = options.filter(o => picked.includes(o.videoId));
  const reserved = reservedSecFor(choices, plan);
  const goalCents = Math.round((parseFloat(goal) || 0) * 100);

  const dayArray = (s: FastChannelSchedule, d: number): VoteAwareSlot[] => {
    const per = s.weeklySlots?.[d];
    return (per && per.length ? per : s.slots || []) as VoteAwareSlot[];
  };

  const save = async () => {
    if (!schedule) return;
    setError(null);
    if (choices.length < 2) { setError('Pick at least 2 videos for fans to choose between.'); return; }
    if (choices.length > 8) { setError('Up to 8 choices per slot.'); return; }
    if (!days.length) { setError('Pick at least one day.'); return; }
    if (goalCents && goalCents < 100) { setError('A commercial-free goal must be at least $1 (or leave it empty).'); return; }
    const cfg: CreatorVoteSlot = {
      id: `fv_${Date.now().toString(36)}`,
      label: label.trim() || 'Fan Pick',
      localTime: time,
      days: [...days].sort(),
      optionCount: Math.min(Math.max(2, perBallot), choices.length),
      excludePreviousWinner: choices.length > Math.min(perBallot, choices.length),
      cutoffMinutes: clampCutoff(cutoff),
      opensHoursBefore: 23,
      choices,
      ...(goalCents ? { commercialFreeGoalCents: goalCents } : {}),
    };
    // Days running the shared daily loop get the slot IN that loop when it airs every day — copying
    // the loop into per-day lists would quietly freeze the creator's later edits to it.
    const weeklySlots: Record<number, VoteAwareSlot[]> = { ...((schedule.weeklySlots as any) || {}) };
    const usesLoop = (d: number) => !(schedule.weeklySlots?.[d]?.length);
    let loop = (schedule.slots || []) as VoteAwareSlot[];
    if (cfg.days.length === 7 && cfg.days.some(usesLoop)) loop = insertVoteGroup(loop, cfg, reserved, plan);
    for (const d of cfg.days) {
      if (!usesLoop(d)) weeklySlots[d] = insertVoteGroup(weeklySlots[d], cfg, reserved, plan);
      else if (cfg.days.length < 7) weeklySlots[d] = insertVoteGroup(loop, cfg, reserved, plan);
    }
    setBusy(true);
    try {
      await onSave({ ...schedule, slots: loop, weeklySlots, midnightAnchored: true, hasVoteSlots: true, voteSlots: [...slots, cfg] } as any);
      setAdding(false); setPicked([]); setGoal('');
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!schedule) return;
    const weeklySlots: Record<number, VoteAwareSlot[]> = {};
    for (const [k, v] of Object.entries(schedule.weeklySlots || {})) weeklySlots[Number(k)] = removeVoteGroup(v as VoteAwareSlot[], id);
    const rest = slots.filter(s => s.id !== id);
    setBusy(true);
    try {
      await onSave({ ...schedule, slots: removeVoteGroup((schedule.slots || []) as VoteAwareSlot[], id), weeklySlots, hasVoteSlots: rest.length > 0, voteSlots: rest } as any);
    } finally { setBusy(false); }
  };

  if (!schedule) {
    return <p className="text-sm text-white/50 py-10 text-center">Set up your schedule first (Schedule tab), then add Fan Vote slots.</p>;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="space-y-1">
        <h3 className="text-lg font-black flex items-center gap-2"><Vote size={18} className="text-orange-400" /> Fan Vote slots</h3>
        <p className="text-[13px] text-white/60 leading-relaxed">
          Let your audience pick what airs at a set time. Each airing gets its own ballot; when voting closes the winner is
          scheduled automatically. Times are on your station's clock ({tz}).
        </p>
      </div>

      {slots.map(s => (
        <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-black text-[15px]">{s.label}</p>
              <p className="text-[12px] text-white/60">
                {clock(s.localTime)} · {s.days.length === 7 ? 'every day' : s.days.map(d => DAYS[d]).join(', ')} · {s.optionCount} of {s.choices.length} choices per ballot · voting closes {s.cutoffMinutes >= 60 ? `${s.cutoffMinutes / 60}h` : `${s.cutoffMinutes} min`} before
              </p>
              {!!s.commercialFreeGoalCents && (
                <p className="text-[12px] text-emerald-300 flex items-center gap-1 mt-0.5"><HeartHandshake size={12} /> Commercial-free when fans pledge ${(s.commercialFreeGoalCents / 100).toFixed(2)}</p>
              )}
            </div>
            <button type="button" disabled={busy} onClick={() => remove(s.id)} className="shrink-0 p-2 rounded-lg hover:bg-red-500/15 text-red-300" aria-label={`Remove ${s.label}`}>
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.days.map(d => {
              const g = voteGroup(dayArray(schedule, d), s.id);
              return (
                <span key={d} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${g ? 'bg-white/[0.06] text-white/75' : 'bg-red-500/15 text-red-200'}`}>
                  {DAYS[d]} {g ? clock(secToHHMM(g.startSec)) : '— missing'}
                </span>
              );
            })}
          </div>
        </div>
      ))}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} disabled={options.length < 2}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-500 text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40">
          <Plus size={14} /> New Fan Vote slot
        </button>
      ) : (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.05] p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Name</span>
              <input value={label} onChange={e => setLabel(e.target.value)} maxLength={40}
                className="w-full h-11 px-3 rounded-xl bg-black/40 border border-white/15 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Airs at ({tz})</span>
              <input type="time" value={time} step={300} onChange={e => setTime(e.target.value || '21:00')}
                className="w-full h-11 px-3 rounded-xl bg-black/40 border border-white/15 text-sm" />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Days</span>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = days.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter(x => x !== i) : [...days, i])}
                    className={`min-w-[48px] h-10 rounded-xl text-[12px] font-black ${on ? 'bg-orange-500 text-black' : 'bg-white/[0.05] border border-white/10 text-white/60'}`}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Choices ({picked.length}/8 · pick 2–8 of your videos)</span>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
              {options.map(o => {
                const on = picked.includes(o.videoId);
                return (
                  <button key={o.videoId} type="button" aria-pressed={on}
                    onClick={() => setPicked(on ? picked.filter(x => x !== o.videoId) : picked.length < 8 ? [...picked, o.videoId] : picked)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left ${on ? 'bg-orange-500/10' : 'hover:bg-white/[0.03]'}`}>
                    <span className={`w-5 h-5 rounded-md grid place-items-center shrink-0 ${on ? 'bg-orange-500 text-black' : 'border border-white/25'}`}>{on && <Check size={13} />}</span>
                    {o.thumbnail && <img src={o.thumbnail} alt="" className="w-14 h-8 rounded object-cover shrink-0" />}
                    <span className="min-w-0 flex-1 text-[13px] font-bold truncate">{o.title}</span>
                    <span className="text-[11px] text-white/45 shrink-0">{hm(o.durationSec)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Choices per ballot</span>
              <select value={Math.min(perBallot, Math.max(2, picked.length))} onChange={e => setPerBallot(Number(e.target.value))}
                className="w-full h-11 px-3 rounded-xl bg-black/40 border border-white/15 text-sm">
                {Array.from({ length: Math.max(1, Math.min(8, picked.length) - 1) }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Voting closes</span>
              <select value={cutoff} onChange={e => setCutoff(Number(e.target.value))} className="w-full h-11 px-3 rounded-xl bg-black/40 border border-white/15 text-sm">
                {CUTOFFS.map(m => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`} before</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Commercial-free goal ($)</span>
              <input inputMode="decimal" placeholder="Off" value={goal} onChange={e => setGoal(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full h-11 px-3 rounded-xl bg-black/40 border border-white/15 text-sm" />
            </label>
          </div>

          <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-[12px] text-white/65 space-y-1">
            <p className="flex items-start gap-1.5"><CalendarClock size={13} className="mt-0.5 shrink-0 text-orange-300" />
              {choices.length >= 2
                ? <>Reserves <b className="text-white">{hm(reserved)}</b> starting <b className="text-white">{clock(time)}</b>{plan.breakSec ? ' (sized with your ad breaks)' : ''}. Anything already scheduled at that time moves later; anything pushed past midnight won’t air that day. Your channel switches to fixed daily times.</>
                : 'Pick at least 2 videos to see how much time the slot reserves.'}
            </p>
            {picked.length > perBallot && <p>Each night’s ballot draws {perBallot} of your {picked.length} choices, never repeating the previous winner.</p>}
            {goalCents > 0 && (
              <p className="flex items-start gap-1.5"><HeartHandshake size={13} className="mt-0.5 shrink-0 text-emerald-300" />
                Fans pledge toward ${(goalCents / 100).toFixed(2)}; cards are only charged if it’s met when voting closes, then that airing runs with no ad breaks.
                The money goes straight to you — Plajah takes nothing if you have Plajah+, 5% otherwise. You need payouts set up (Stripe) to receive it.
              </p>
            )}
          </div>

          {error && <p role="alert" className="text-[12px] text-rose-300 font-semibold">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy || choices.length < 2}
              className="px-5 h-11 rounded-xl bg-orange-500 text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40">
              {busy ? 'Saving…' : 'Add to schedule'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className="px-5 h-11 rounded-xl bg-white/[0.06] text-[12px] font-black uppercase tracking-wider">
              Cancel
            </button>
          </div>
        </div>
      )}
      {options.length < 2 && <p className="text-[12px] text-white/45">You need at least 2 published videos with a known running time to run a Fan Vote.</p>}
    </div>
  );
};

export default FanVoteSlotsEditor;
