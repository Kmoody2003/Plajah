// Safety panel: the hazards for this design and stage, what to do about each, our component
// advisories, and live recall lookups. Critical hazards need a tick before export or making.

import React, { useEffect, useState } from 'react';
import { ShieldAlert, ExternalLink, RefreshCw } from 'lucide-react';
import { type Hazard, type Advisory, type RecallHit, RECALL_LINKS, needsAck } from '../../services/safety/hazards';
import { BUILD_TERMS, BUILD_TERMS_VERSION, localAcceptance, saveLocalAcceptance } from '../../services/safety/terms';

const SEV: Record<string, string> = { critical: '#f43f5e', high: '#fb923c', medium: '#fbbf24', low: '#93c5fd' };
const DIM = 'rgba(255,255,255,.55)';
const recallCache = new Map<string, Promise<{ hits: RecallHit[]; error?: string }>>();

export function fetchRecalls(apiBase: string, q: string) {
  const k = q.toLowerCase(); const hit = recallCache.get(k); if (hit) return hit;
  // Never read a failed lookup as "no recalls": anything but a JSON answer from our server is an error.
  const p = fetch(`${apiBase}/api/build/safety/recalls?q=${encodeURIComponent(q)}`).then(async r => {
    if (!/json/.test(r.headers.get('content-type') ?? '')) return { hits: [] as RecallHit[], error: 'Recall lookup needs the Plajah server (not available here). Use the links below.' };
    const j = await r.json().catch(() => null); if (!j || !Array.isArray(j.hits)) return { hits: [] as RecallHit[], error: j?.error ?? `Recall lookup failed (HTTP ${r.status}).` };
    return r.ok ? { hits: j.hits as RecallHit[] } : { hits: [], error: j.error ?? `HTTP ${r.status}` }; })
    .catch(() => ({ hits: [] as RecallHit[], error: 'Recall lookup needs the Plajah server (not available here).' }));
  recallCache.set(k, p); return p;
}

export default function SafetyPanel({ hazards, advisories = [], queries = [], acked, onAck, apiBase = '', title = 'Safety' }: { hazards: Hazard[]; advisories?: Advisory[]; queries?: string[]; acked: string[]; onAck: (id: string, v: boolean) => void; apiBase?: string; title?: string }) {
  const [recalls, setRecalls] = useState<Record<string, { hits: RecallHit[]; error?: string } | 'loading'>>({});
  const run = () => { for (const q of queries) { setRecalls(r => ({ ...r, [q]: 'loading' })); void fetchRecalls(apiBase, q).then(res => setRecalls(r => ({ ...r, [q]: res }))); } };
  useEffect(() => { if (queries.length) run(); }, [queries.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const must = needsAck(hazards); const open = must.filter(h => h.block || !acked.includes(h.id)); const blocked = hazards.filter(h => h.block);
  return <div data-testid="safety-panel" className="text-[12px]">
    <div className="flex items-center gap-1.5 font-bold mb-1"><ShieldAlert size={14} color={open.length ? SEV.critical : '#4ade80'}/>{title}</div>
    <div className="text-[11px] mb-2" style={{ color: open.length ? '#fda4af' : DIM }}>{blocked.length ? `${blocked.length} design problem${blocked.length > 1 ? 's' : ''} must be fixed before export or making.` : open.length ? `${open.length} critical hazard${open.length > 1 ? 's' : ''} to acknowledge before export or making.` : must.length ? 'Critical hazards acknowledged. Keep the mitigations in the design.' : 'No critical hazards for this design. Read the rest before you build.'}</div>
    {hazards.map(h => <div key={h.id} className="p-2 rounded-lg mb-1.5" style={{ background: 'rgba(255,255,255,.03)', borderLeft: `3px solid ${SEV[h.severity]}` }} data-testid={`hazard-${h.id}`}>
      <div className="flex items-center gap-1.5"><span className="text-[9px] font-extrabold uppercase" style={{ color: SEV[h.severity] }}>{h.severity}</span><span className="text-[9px] px-1 rounded bg-white/10">{h.stage}</span></div>
      <div className="font-semibold mt-0.5">{h.title}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,.7)' }}>{h.why}</div>
      <ul className="list-disc pl-4 mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,.75)' }}>{h.mitigate.map((m, i) => <li key={i}>{m}</li>)}</ul>
      {h.cite && <div className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>{h.cite}</div>}
      {h.block ? <div className="mt-1.5 text-[11px] font-semibold" style={{ color: '#fda4af' }} data-testid={`hazard-block-${h.id}`}>Not allowed: change the design to continue.</div>
        : (h.ack || h.severity === 'critical') && <label className="flex items-start gap-1.5 mt-1.5 text-[11px] font-semibold"><input type="checkbox" checked={acked.includes(h.id)} onChange={e => onAck(h.id, e.target.checked)} data-testid={`hazard-ack-${h.id}`}/>I understand this hazard and will design and build with these protections.</label>}
    </div>)}
    {advisories.length > 0 && <div className="mt-3"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Component advisories</div>
      {advisories.map(a => <div key={a.id} className="p-2 rounded-lg mb-1.5" style={{ background: 'rgba(255,255,255,.03)', borderLeft: `3px solid ${SEV[a.severity]}` }}><div className="font-semibold">{a.title}</div><div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,.7)' }}>{a.detail}</div></div>)}</div>}
    {queries.length > 0 && <div className="mt-3" data-testid="safety-recalls">
      <div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-extrabold uppercase tracking-[.12em]" style={{ color: DIM }}>Recalls (US CPSC, last 5 years)</span><button className="ml-auto" onClick={() => { for (const q of queries) recallCache.delete(q.toLowerCase()); run(); }} aria-label="Refresh recalls"><RefreshCw size={12} color={DIM}/></button></div>
      {queries.map(q => { const r = recalls[q]; return <div key={q} className="mb-2">
        <div className="text-[11px] font-semibold">“{q}”{r && r !== 'loading' && !r.error ? <span style={{ color: DIM }}> · {r.hits.length} recall{r.hits.length === 1 ? '' : 's'}</span> : null}</div>
        {r === 'loading' && <div className="text-[10.5px]" style={{ color: DIM }}>Checking…</div>}
        {r && r !== 'loading' && r.error && <div className="text-[10.5px]" style={{ color: DIM }}>{r.error}</div>}
        {r && r !== 'loading' && r.hits.slice(0, 4).map(h => <a key={h.id} href={h.url} target="_blank" rel="noreferrer" className="block p-1.5 mt-1 rounded" style={{ background: 'rgba(244,63,94,.06)' }}>
          <div className="text-[11px] font-semibold leading-snug">{h.title}</div><div className="text-[10px]" style={{ color: DIM }}>{h.date}{h.hazard ? ` · ${h.hazard}` : ''}{h.units ? ` · ${h.units}` : ''}</div></a>)}
        <div className="flex flex-wrap gap-2 mt-1">{RECALL_LINKS(q).map(l => <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="text-[10px] inline-flex items-center gap-0.5" style={{ color: '#93c5fd' }}>{l.name}<ExternalLink size={9}/></a>)}</div>
      </div>; })}
      <div className="text-[10px]" style={{ color: DIM }}>Recalls of similar products show what goes wrong in the real world. No result does not mean safe.</div>
    </div>}
  </div>;
}

/** First-use gate: the maker terms (safety responsibility, assumption of risk, IP), recorded per version. */
export function BuildTermsGate({ onAccepted, getToken, apiBase = '', onClose }: { onAccepted: () => void; getToken?: () => Promise<string | null>; apiBase?: string; onClose?: () => void }) {
  const [read, setRead] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const accept = async () => {
    setBusy(true); setErr('');
    try {
      const token = getToken ? await getToken() : null;
      if (token) { const r = await fetch(`${apiBase}/api/build/terms`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ version: BUILD_TERMS_VERSION }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`); }
      saveLocalAcceptance(); onAccepted();
    } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[300] grid place-items-center p-4" style={{ background: 'rgba(5,6,10,.82)' }} role="dialog" aria-modal="true" aria-label="Safety terms" data-testid="build-terms">
    <div className="w-full max-w-xl max-h-[86vh] flex flex-col rounded-2xl" style={{ background: '#12141b', border: '1px solid rgba(255,255,255,.1)', color: '#e8eaf0' }}>
      <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,.08)' }}><div className="flex items-center gap-2 font-extrabold text-[15px]"><ShieldAlert size={18} color="#fbbf24"/>Safety comes first</div>
        <div className="text-[12px] mt-1" style={{ color: DIM }}>Plajah Build warns you about hazards at every step, but you are the maker. Please read and accept these terms (version {BUILD_TERMS_VERSION}).</div></div>
      <div className="flex-1 overflow-y-auto p-4 text-[12.5px] leading-relaxed" onScroll={e => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setRead(true); }}>
        {BUILD_TERMS.map(t => <div key={t.heading} className="mb-3"><div className="font-bold">{t.heading}</div><div style={{ color: 'rgba(255,255,255,.75)' }}>{t.body}</div></div>)}
      </div>
      <div className="p-4 border-t flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
        <label className="flex items-center gap-1.5 text-[12px] flex-1"><input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} data-testid="build-terms-read"/>I have read and accept these terms.</label>
        {onClose && <button className="h-8 px-3 rounded-lg text-[12px] bg-white/5 border border-white/10" onClick={onClose}>Not now</button>}
        <button className="h-8 px-3 rounded-lg text-[12px] font-bold" style={{ background: read ? '#fbbf24' : 'rgba(251,191,36,.3)', color: '#14110a' }} disabled={!read || busy} onClick={() => void accept()} data-testid="build-terms-accept">{busy ? 'Saving…' : 'Accept and continue'}</button>
      </div>
      {err && <div className="px-4 pb-3 text-[11px]" style={{ color: '#fca5a5' }}>{err}</div>}
    </div>
  </div>;
}

/** Whether the maker terms are accepted on this device (server copy is checked by the gate's caller). */
export const termsAccepted = () => !!localAcceptance();
