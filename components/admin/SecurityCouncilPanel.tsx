/**
 * Security & IT Council panel (platform admin). Real data only — findings, the daily Council Brief, and the
 * reversible mitigations, all from /api/security/council/*. Agents propose; humans decide here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Undo2, ChevronDown, ChevronRight, FileText, Activity } from 'lucide-react';
import { securityCouncilApi } from '../../services/backendService';

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type Status = 'open' | 'ack' | 'fixed' | 'false_positive';
interface Finding {
  id: string; agent: string; severity: Severity; title: string; evidence: Record<string, unknown>; proposedFix: string;
  status: Status; firstSeen: number; lastSeen: number; occurrences: number; regressedAt?: number;
  triage?: { model: string; summary: string; likelyFalsePositive: boolean; severitySuggestion: Severity; nextStep: string };
  mitigationId?: string; recommendationId?: string;
}
interface Brief { date: string; generatedAt: number; engine: string; summary: string; topRisks: string[]; recommendedActions: string[]; status?: string; councilRunsLast24h?: number }
interface Mitigation { id: string; target: { ipHash: string }; limitPerMin: number; reason: string; createdBy: string; createdAt: number; expiresAt: number; status: string; effectiveStatus: string; findingId: string }
interface Overview {
  agents: Array<{ id: string; name: string; charter: string }>;
  lastRuns: Array<{ id: string; at: number; status: string; durationMs?: number; dataGaps?: string[] }>;
  auditFeed: { generatedAt: number; ref: string | null; commit: string | null } | null;
  config: { llmTriage: boolean; triageModel: string; briefModel: string; autoMitigate: boolean; briefHourUtc: number; ingestKeyConfigured: boolean; cronKeyConfigured: boolean };
}

const SEV_STYLE: Record<Severity, string> = {
  critical: 'bg-red-600/30 text-red-300 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  info: 'bg-white/5 text-white/50 border-white/10',
};
const ago = (ms: number) => {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export const SecurityCouncilPanel: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [mitigations, setMitigations] = useState<Mitigation[]>([]);
  const [autoMitigate, setAutoMitigate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | Status | 'all'>('active');
  const [agentFilter, setAgentFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [o, f, b, m] = await Promise.all([
        securityCouncilApi<Overview>('overview'),
        securityCouncilApi<{ findings: Finding[] }>(`findings?status=${statusFilter}${agentFilter ? `&agent=${agentFilter}` : ''}`),
        securityCouncilApi<{ brief: Brief | null }>('briefs/latest'),
        securityCouncilApi<{ mitigations: Mitigation[]; autoMitigate: boolean }>('mitigations'),
      ]);
      setOverview(o); setFindings(f.findings || []); setBrief(b.brief); setMitigations(m.mitigations || []); setAutoMitigate(m.autoMitigate);
    } catch (e: any) {
      setError(e?.message || 'Could not load the Security Council');
    }
  }, [statusFilter, agentFilter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (f: Finding, status: Status) => {
    setBusy(f.id);
    try {
      const note = status === 'false_positive' ? window.prompt('Why is this a false positive? (kept in the finding history)') || undefined : undefined;
      await securityCouncilApi(`findings/${f.id}/status`, { method: 'POST', body: JSON.stringify({ status, ...(note ? { note } : {}) }) });
      await load();
    } catch (e: any) { setError(e?.message || 'Update failed'); } finally { setBusy(null); }
  };

  const undo = async (m: Mitigation) => {
    if (!window.confirm(`Undo the temporary rate-limit tightening for source ${m.target.ipHash.slice(0, 10)}…?`)) return;
    setBusy(m.id);
    try {
      await securityCouncilApi(`mitigations/${m.id}/undo`, { method: 'POST', body: '{}' });
      setNotice('Mitigation undone. Other server instances drop it within 60 seconds.');
      await load();
    } catch (e: any) { setError(e?.message || 'Undo failed'); } finally { setBusy(null); }
  };

  const runNow = async (forceBrief: boolean) => {
    setBusy(forceBrief ? 'brief' : 'run');
    setNotice(null);
    try {
      const r = await securityCouncilApi<{ perAgent: Record<string, { drafts: number }>; dataGaps: string[]; durationMs: number; brief?: { engine: string } | null }>(`run${forceBrief ? '?brief=force' : '?brief=skip'}`, { method: 'POST', body: '{}' });
      const drafts = Object.values(r.perAgent || {}).reduce((n, a) => n + (a.drafts || 0), 0);
      setNotice(`Council ran in ${(r.durationMs / 1000).toFixed(1)}s · ${drafts} signal(s) over threshold${r.brief ? ` · brief by ${r.brief.engine}` : ''}${r.dataGaps?.length ? ` · ${r.dataGaps.length} data gap(s)` : ''}`);
      await load();
    } catch (e: any) { setError(e?.message || 'Run failed'); } finally { setBusy(null); }
  };

  const counts = useMemo(() => {
    const by: Record<string, Record<Severity, number>> = {};
    for (const f of findings) {
      by[f.agent] ||= { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      by[f.agent][f.severity]++;
    }
    return by;
  }, [findings]);

  const lastRun = overview?.lastRuns?.[0];
  const stale = !lastRun || Date.now() - lastRun.at > 60 * 60 * 1000;

  return (
    <div className="p-6 md:p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-2xl space-y-6 text-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-emerald-400" />
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">Security &amp; IT Council</h2>
            <p className="text-xs text-white/40">Six monitoring agents · live platform data · they propose, you decide</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => load()} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold uppercase tracking-wider text-white/70">
            <RefreshCw size={13} /> Reload
          </button>
          <button onClick={() => runNow(false)} disabled={!!busy} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-[11px] font-bold uppercase tracking-wider text-emerald-200 disabled:opacity-50">
            <Activity size={13} className={busy === 'run' ? 'animate-spin' : ''} /> Run council now
          </button>
          <button onClick={() => runNow(true)} disabled={!!busy} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold uppercase tracking-wider text-white/70 disabled:opacity-50">
            <FileText size={13} className={busy === 'brief' ? 'animate-pulse' : ''} /> Regenerate brief
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">{notice}</div>}

      {/* Status strip */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[11px]">
          <div className={`p-3 rounded-xl border ${stale ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-white/5'}`}>
            <div className="text-white/40 font-black uppercase tracking-widest text-[9px]">Last run</div>
            <div className="font-bold mt-1">{lastRun ? ago(lastRun.at) : 'never'}</div>
            {stale && <div className="text-amber-300 mt-1">Not scheduled? See docs/SECURITY_IT_COUNCIL.md</div>}
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-white/40 font-black uppercase tracking-widest text-[9px]">LLM triage</div>
            <div className="font-bold mt-1">{overview.config.llmTriage ? overview.config.triageModel : 'off (no ANTHROPIC_API_KEY)'}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-white/40 font-black uppercase tracking-widest text-[9px]">Daily brief</div>
            <div className="font-bold mt-1">{overview.config.llmTriage ? overview.config.briefModel : 'deterministic'} · {overview.config.briefHourUtc}:00 UTC</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-white/40 font-black uppercase tracking-widest text-[9px]">Auto-mitigation</div>
            <div className={`font-bold mt-1 ${overview.config.autoMitigate ? 'text-amber-300' : ''}`}>{overview.config.autoMitigate ? 'ON (rate-limit tightening only)' : 'off — propose only'}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-white/40 font-black uppercase tracking-widest text-[9px]">CI audit feed</div>
            <div className="font-bold mt-1">{overview.auditFeed ? ago(overview.auditFeed.generatedAt) : overview.config.ingestKeyConfigured ? 'waiting for first CI run' : 'not connected'}</div>
          </div>
        </div>
      )}
      {lastRun?.dataGaps?.length ? (
        <div className="text-[11px] text-white/50 space-y-1">
          {lastRun.dataGaps.map(g => <div key={g} className="flex gap-2"><AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />Data gap: {g}</div>)}
        </div>
      ) : null}

      {/* Daily brief */}
      <div className="p-5 rounded-2xl bg-black/30 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Council Brief {brief ? `· ${brief.date}` : ''}</span>
          {brief && <span className="text-[10px] text-white/40">engine: {brief.engine} · {ago(brief.generatedAt)}</span>}
        </div>
        {brief?.summary ? (
          <>
            <p className="text-sm text-white/85 leading-relaxed whitespace-pre-line">{brief.summary}</p>
            <div className="grid md:grid-cols-2 gap-4 mt-4 text-xs">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-red-300 mb-1">Top risks</div>
                <ul className="space-y-1 text-white/65">{(brief.topRisks || []).map((r, i) => <li key={i}>• {r}</li>)}</ul>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300 mb-1">Recommended actions (for a human)</div>
                <ul className="space-y-1 text-white/65">{(brief.recommendedActions || []).map((r, i) => <li key={i}>• {r}</li>)}</ul>
              </div>
            </div>
          </>
        ) : <p className="text-xs text-white/40">No brief yet. One is written once a day after the scheduled hour, or press Regenerate brief.</p>}
      </div>

      {/* Agents */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {overview.agents.map(a => {
            const c = counts[a.id];
            const active = agentFilter === a.id;
            return (
              <button key={a.id} onClick={() => setAgentFilter(active ? '' : a.id)} className={`text-left p-4 rounded-2xl border transition-all ${active ? 'bg-white/10 border-white/30' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider">{a.name}</span>
                  <span className="flex gap-1">
                    {c && (['critical', 'high', 'medium', 'low'] as Severity[]).filter(s => c[s]).map(s => (
                      <span key={s} className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${SEV_STYLE[s]}`}>{c[s]} {s}</span>
                    ))}
                    {!c && <span className="text-[9px] text-white/30 font-bold">clear</span>}
                  </span>
                </div>
                <p className="text-[11px] text-white/45 mt-1 leading-snug">{a.charter}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Mitigations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Temporary mitigations</span>
          <span className="text-[10px] text-white/35">{autoMitigate ? 'Expire within 1h. A tightened limit returns 429 — never a block or lockout.' : 'Auto-mitigation is off; none will be created.'}</span>
        </div>
        {mitigations.length === 0 ? <p className="text-xs text-white/35">None active.</p> : (
          <div className="space-y-2">
            {mitigations.map(m => (
              <div key={m.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs">
                <div>
                  <span className="font-mono text-amber-200">source {m.target.ipHash.slice(0, 10)}…</span>
                  <span className="text-white/50"> · max {m.limitPerMin}/min · {m.reason} · by {m.createdBy} · expires {new Date(m.expiresAt).toLocaleTimeString()}</span>
                  {m.effectiveStatus !== 'active' && <span className="ml-2 text-white/40">({m.effectiveStatus})</span>}
                </div>
                {m.effectiveStatus === 'active' && (
                  <button onClick={() => undo(m)} disabled={busy === m.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold disabled:opacity-50">
                    <Undo2 size={12} /> Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Findings */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Findings {agentFilter ? `· ${agentFilter}` : ''}</span>
          <div className="flex flex-wrap gap-1.5">
            {(['active', 'open', 'ack', 'fixed', 'false_positive', 'all'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${statusFilter === s ? 'bg-white text-black' : 'bg-white/5 text-white/45 hover:text-white'}`}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        {findings.length === 0 ? <p className="text-xs text-white/35">No findings for this filter.</p> : (
          <div className="space-y-2">
            {findings.map(f => {
              const open = !!expanded[f.id];
              return (
                <div key={f.id} className="rounded-xl bg-white/[0.03] border border-white/5">
                  <button onClick={() => setExpanded(e => ({ ...e, [f.id]: !open }))} className="w-full flex items-start gap-3 p-3 text-left">
                    {open ? <ChevronDown size={14} className="mt-0.5 text-white/40 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 text-white/40 shrink-0" />}
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase shrink-0 ${SEV_STYLE[f.severity]}`}>{f.severity}</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white/90 break-words">{f.title}</span>
                      <span className="block text-[10px] text-white/40 mt-0.5">
                        {f.agent} · {f.status.replace('_', ' ')} · seen {f.occurrences}× · last {ago(f.lastSeen)} · first {ago(f.firstSeen)}
                        {f.regressedAt ? ' · REGRESSED' : ''}{f.mitigationId ? ' · mitigation applied' : ''}{f.recommendationId ? ' · sent to human review queue' : ''}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="px-10 pb-4 space-y-3 text-xs">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300 mb-1">Proposed fix</div>
                        <p className="text-white/75 leading-relaxed">{f.proposedFix}</p>
                      </div>
                      {f.triage && (
                        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                          <div className="text-[10px] font-black uppercase tracking-wider text-sky-300 mb-1">AI triage ({f.triage.model}){f.triage.likelyFalsePositive ? ' · likely false positive' : ''}</div>
                          <p className="text-white/70">{f.triage.summary}</p>
                          {f.triage.nextStep && <p className="text-white/55 mt-1">Next: {f.triage.nextStep}</p>}
                        </div>
                      )}
                      <details>
                        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-white/40">Evidence</summary>
                        <pre className="mt-2 p-3 rounded-lg bg-black/40 text-[10px] text-white/60 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(f.evidence, null, 2)}</pre>
                      </details>
                      <div className="flex flex-wrap gap-2">
                        {f.status !== 'ack' && f.status !== 'fixed' && <button disabled={busy === f.id} onClick={() => setStatus(f, 'ack')} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-[11px]">Acknowledge</button>}
                        {f.status !== 'fixed' && <button disabled={busy === f.id} onClick={() => setStatus(f, 'fixed')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 font-bold text-[11px]"><CheckCircle2 size={12} /> Mark fixed</button>}
                        {f.status !== 'false_positive' && <button disabled={busy === f.id} onClick={() => setStatus(f, 'false_positive')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 font-bold text-[11px]"><XCircle size={12} /> False positive</button>}
                        {f.status !== 'open' && <button disabled={busy === f.id} onClick={() => setStatus(f, 'open')} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 font-bold text-[11px]">Reopen</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityCouncilPanel;
