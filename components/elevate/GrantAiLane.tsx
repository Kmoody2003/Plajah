// GrantAiLane — decides where a grants AI job runs, and asks before anything goes to the cloud.
//
// Policy: on the Plajah desktop app with a local model on a GPU, privacy-facing work (drafting, council
// reviews) runs on this PC automatically — nothing leaves the machine. Otherwise, or when the person
// asks for speed, the job can run in the cloud (Gemini), but only after a prompt that shows what is
// sent, the estimated cost and the estimated time. "Don't ask again" is remembered per device.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, Cpu, Loader2, ShieldCheck, X } from 'lucide-react';
import { cloudSeconds, costUsd, fmtSeconds, fmtUsd, localSeconds, TIER_RATES, totals, type Workload } from '../../services/ai/aiLane';
import { localStatus, readSamples, type LocalStatus } from '../../services/ai/localLane';
import { EV } from './vellum';

export interface AiInfo {
  provider: string; model: string; configured: boolean; price: { in: number; out: number } | null;
  pricesAsOf: string; pricesUrl: string; sent: string;
}
export type Lane = 'local' | 'cloud';
export interface RunResult<T> { result: T; lane: Lane; seconds: number }
export interface Progress { lane: Lane; done: number; total: number; startedAt: number; estimate: number }

const REMEMBER_KEY = 'plajah.grants.cloudConsent';
const remembered = () => { try { return localStorage.getItem(REMEMBER_KEY) === 'yes'; } catch { return false; } };
const remember = (on: boolean) => { try { on ? localStorage.setItem(REMEMBER_KEY, 'yes') : localStorage.removeItem(REMEMBER_KEY); } catch { /* blocked */ } };

export function estimates(w: Workload, info: AiInfo | null, local: LocalStatus | null) {
  const t = totals(w);
  return {
    cloudCost: info ? costUsd(info.model, t.inTokens, t.outTokens) ?? (info.price ? (t.inTokens * info.price.in + t.outTokens * info.price.out) / 1e6 : null) : null,
    cloudSeconds: cloudSeconds(w),
    localSeconds: local?.available ? localSeconds(w, local.tier, readSamples()) : null,
    tokens: t,
  };
}

/**
 * The runner. `run` picks the lane, asks consent for the cloud, reports progress, and resolves with the
 * result. Rejects with Error('cancelled') if the person declines.
 */
export function useAiRunner() {
  const [local, setLocal] = useState<LocalStatus | null>(null);
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [ask, setAsk] = useState<null | { w: Workload; resolve: (ok: boolean) => void }>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    localStatus().then(setLocal);
    fetch('/api/grants/ai-info').then(r => r.json()).then(setInfo).catch(() => setInfo(null));
  }, []);

  const consent = useCallback((w: Workload) => (remembered() ? Promise.resolve(true) : new Promise<boolean>(resolve => setAsk({ w, resolve }))), []);

  const run = useCallback(async <T,>(job: {
    workload: Workload;
    /** Runs on this PC. Receives a progress callback (calls finished). */
    local: (onCall: (done: number) => void) => Promise<T>;
    cloud: () => Promise<T>;
    /** The person chose speed over privacy for this one job. */
    preferCloud?: boolean;
  }): Promise<RunResult<T>> => {
    const startedAt = Date.now();
    const est = estimates(job.workload, info, local);
    const total = job.workload.calls.length;
    if (local?.qualifies && !job.preferCloud) {
      setProgress({ lane: 'local', done: 0, total, startedAt, estimate: est.localSeconds ?? 0 });
      try {
        const result = await job.local(done => setProgress(p => (p ? { ...p, done } : p)));
        return { result, lane: 'local', seconds: (Date.now() - startedAt) / 1000 };
      } finally { setProgress(null); }
    }
    if (!(await consent(job.workload))) throw new Error('cancelled');
    setProgress({ lane: 'cloud', done: 0, total, startedAt, estimate: est.cloudSeconds });
    try {
      const result = await job.cloud();
      return { result, lane: 'cloud', seconds: (Date.now() - startedAt) / 1000 };
    } finally { setProgress(null); }
  }, [consent, info, local]);

  const dialog = ask ? (
    <ConsentDialog w={ask.w} info={info} local={local}
      onAnswer={(ok, rememberChoice) => { if (ok && rememberChoice) remember(true); ask.resolve(ok); setAsk(null); }} />
  ) : null;

  return { run, local, info, progress, dialog, forgetConsent: () => remember(false) };
}

/** A one-line "where this runs" note for a button, before the person presses it. */
export const LaneHint: React.FC<{ w: Workload | null; info: AiInfo | null; local: LocalStatus | null }> = ({ w, info, local }) => {
  if (!w) return null;
  const e = estimates(w, info, local);
  return local?.qualifies ? (
    <p className="text-[11px] mt-2 flex items-center gap-1.5" style={{ color: EV.success }}>
      <ShieldCheck size={12} /> Runs privately on this PC ({local.model} · {TIER_RATES[local.tier].label}) · {fmtSeconds(e.localSeconds ?? 0)}
    </p>
  ) : (
    <p className="text-[11px] mt-2 flex items-center gap-1.5" style={{ color: EV.muted }}>
      <Cloud size={12} /> Runs in the cloud after you OK it · {fmtUsd(e.cloudCost)} · {fmtSeconds(e.cloudSeconds)}
    </p>
  );
};

export const ProgressNote: React.FC<{ p: Progress | null }> = ({ p }) => {
  const [, tick] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!p) return;
    timer.current = window.setInterval(() => tick(n => n + 1), 1000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [p]);
  if (!p) return null;
  const elapsed = Math.round((Date.now() - p.startedAt) / 1000);
  return (
    <p className="text-[11px] mt-2 flex items-center gap-1.5" style={{ color: EV.violetText }}>
      <Loader2 size={12} className="animate-spin" />
      {p.lane === 'local' ? `On this PC · step ${Math.min(p.done + 1, p.total)} of ${p.total}` : 'In the cloud'} · {elapsed}s of {fmtSeconds(p.estimate)}
    </p>
  );
};

const ConsentDialog: React.FC<{ w: Workload; info: AiInfo | null; local: LocalStatus | null; onAnswer: (ok: boolean, remember: boolean) => void }> = ({ w, info, local, onAnswer }) => {
  const [rememberChoice, setRemember] = useState(false);
  const e = estimates(w, info, local);
  const what = w.kind === 'council' ? 'a Grant Council review' : 'this draft';
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cloud-consent-title" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-3xl p-6" style={{ background: EV.panel, border: `1px solid ${EV.line}` }}>
        <div className="flex items-start justify-between gap-3">
          <p id="cloud-consent-title" className="text-base font-bold flex items-center gap-2" style={{ color: EV.ink }}><Cloud size={17} /> Run {what} in the cloud?</p>
          <button onClick={() => onAnswer(false, false)} aria-label="Close" style={{ color: EV.muted }}><X size={16} /></button>
        </div>
        {!info?.configured && <p className="text-[12px] mt-3" style={{ color: EV.warn }}>The cloud assistant is not set up yet, so this will not work right now.</p>}
        <dl className="mt-4 space-y-2 text-[12px]">
          <div className="flex justify-between gap-3"><dt style={{ color: EV.muted }}>Estimated cost</dt><dd style={{ color: EV.ink }}>{fmtUsd(e.cloudCost)} <span style={{ color: EV.muted }}>(paid by Plajah)</span></dd></div>
          <div className="flex justify-between gap-3"><dt style={{ color: EV.muted }}>Estimated time</dt><dd style={{ color: EV.ink }}>{fmtSeconds(e.cloudSeconds)}</dd></div>
          <div className="flex justify-between gap-3"><dt style={{ color: EV.muted }}>Model</dt><dd style={{ color: EV.ink }}>{info ? `${info.provider} · ${info.model}` : 'Google Gemini'}</dd></div>
        </dl>
        <p className="text-[11px] mt-4 leading-relaxed" style={{ color: EV.ink2 }}>
          <b>What is sent:</b> {info?.sent || 'your draft, the facts you typed, the notice and your organization profile — never your EIN, UEI or personal contacts.'} It is processed by Google and not stored by Plajah beyond your workspace.
        </p>
        {local?.available ? (
          <p className="text-[11px] mt-3 flex gap-1.5" style={{ color: EV.muted }}>
            <Cpu size={12} className="shrink-0 mt-0.5" /> Or run it privately on this PC: {fmtSeconds(e.localSeconds ?? 0)}, no cost{local.qualifies ? '' : ' (this PC has no supported GPU, so it would be slow)'}.
          </p>
        ) : (
          <p className="text-[11px] mt-3 flex gap-1.5" style={{ color: EV.muted }}>
            <Cpu size={12} className="shrink-0 mt-0.5" /> In the Plajah desktop app with a supported GPU, this runs privately on your PC at no cost.
          </p>
        )}
        <label className="text-[11px] mt-4 flex items-center gap-2" style={{ color: EV.ink2 }}>
          <input type="checkbox" checked={rememberChoice} onChange={ev => setRemember(ev.target.checked)} className="accent-violet-500" />
          Don't ask again on this device for grant work
        </label>
        <p className="text-[10px] mt-3" style={{ color: EV.muted }}>
          Estimates use Google's published prices ({info?.pricesAsOf || 'current'}); the actual cost is shown after it runs.
        </p>
        <div className="flex gap-2 mt-5">
          <button onClick={() => onAnswer(true, rememberChoice)} disabled={!info?.configured} className="px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-40" style={{ background: EV.brand, color: '#fff' }}>Run in the cloud</button>
          <button onClick={() => onAnswer(false, false)} className="px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: EV.raised, color: EV.ink2 }}>Not now</button>
        </div>
      </div>
    </div>
  );
};
