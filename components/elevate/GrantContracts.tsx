// GrantContracts — "Contracts & loans" for small businesses.
//
// Most federal money for ordinary small businesses is a loan or a purchase order, not a grant. This tab
// shows (1) SBA financing ranked for what the owner says they need, and (2) federal contract
// opportunities (SAM.gov) near the business, filtered to work they can actually bid on.
//
// Honesty rules the UI enforces: loan programs are guidance, not a credit decision; contracts reserved
// for certifications the business does not hold are hidden AND counted; "full and open" notices are
// labelled as competing against businesses of every size; nothing predicts a win.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Building2, ExternalLink, HandHelping, Landmark, Loader2, Search } from 'lucide-react';
import { businessApi, type ContractsResponse, type FinancingResponse } from '../../services/grants/client';
import type { CertKey } from '../../services/dataCommons/contracts';
import type { FinancePurpose } from '../../services/dataCommons/financing';
import type { Profile } from '../../services/grants/profile';
import { EV, EvLabel } from './vellum';

const input = { background: EV.chrome, color: EV.ink, border: `1px solid ${EV.line}` } as const;
const btn = 'px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-40 inline-flex items-center gap-2';
const primary = { background: EV.brand, color: '#fff' } as const;

const PURPOSES: { key: FinancePurpose; label: string }[] = [
  { key: 'working-capital', label: 'Working capital' }, { key: 'equipment', label: 'Equipment' }, { key: 'real-estate', label: 'Buy or build property' },
  { key: 'startup', label: 'Start a business' }, { key: 'refinance', label: 'Refinance debt' }, { key: 'ownership-change', label: 'Buy a business' },
];
const FIT: Record<string, { label: string; tone: string }> = {
  strong: { label: 'Strong fit', tone: EV.success }, possible: { label: 'Possible', tone: EV.warn }, poor: { label: 'Poor fit', tone: EV.muted },
};
const usd = (n?: number) => (n ? `$${n.toLocaleString('en-US')}` : '');
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined);

// ─── SBA financing ───────────────────────────────────────────────────────────

const Financing: React.FC = () => {
  const [purpose, setPurpose] = useState<FinancePurpose | null>(null);
  const [amount, setAmount] = useState('');
  const [disaster, setDisaster] = useState(false);
  const [res, setRes] = useState<FinancingResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = useMemo(() => { const m = /^\$?\s*([\d,]*\.?\d+)\s*([kKmM])?$/.exec(amount.trim()); return m ? Math.round(Number(m[1].replace(/,/g, '')) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1)) : undefined; }, [amount]);

  const run = async () => {
    if (!purpose) return;
    setBusy(true); setErr(null);
    try { setRes(await businessApi.financing(purpose, n, disaster)); } catch (e: any) { setErr(e?.message || 'Could not load'); } finally { setBusy(false); }
  };

  return (
    <div className="ev-panel p-5 space-y-4">
      <div>
        <p className="text-sm font-bold flex items-center gap-2" style={{ color: EV.ink }}><Banknote size={15} /> Borrow: SBA loans</p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
          This is where most federal help for small businesses lives. SBA does not lend directly: it guarantees loans made by banks, community lenders and nonprofit lenders.
        </p>
      </div>
      <div>
        <EvLabel>What do you need the money for?</EvLabel>
        <div className="flex flex-wrap gap-2 mt-2">
          {PURPOSES.map(p => (
            <button key={p.key} onClick={() => setPurpose(p.key)} aria-pressed={purpose === p.key} className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                    style={{ background: purpose === p.key ? EV.violet : EV.raised, color: purpose === p.key ? '#fff' : EV.ink2, border: `1px solid ${purpose === p.key ? EV.violet : EV.line}` }}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <EvLabel>About how much? <span style={{ color: EV.muted }}>(optional)</span></EvLabel>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. $120k" className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm" style={input} />
        </div>
        <label className="text-[12px] flex items-center gap-2 pb-2" style={{ color: EV.ink2 }}>
          <input type="checkbox" checked={disaster} onChange={e => setDisaster(e.target.checked)} className="accent-violet-500" /> A declared disaster caused this
        </label>
        <button disabled={!purpose || busy} onClick={run} className={btn} style={primary}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Show programs</button>
      </div>
      {err && <p role="alert" className="text-[12px]" style={{ color: EV.warn }}>{err}</p>}

      {res && (
        <div className="space-y-3">
          {res.recommendations.map(r => (
            <div key={r.program.id} className="rounded-2xl p-4" style={{ background: EV.raised }}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold" style={{ color: EV.ink }}>{r.program.name}</p>
                <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: FIT[r.fit].tone }}>{FIT[r.fit].label}</span>
              </div>
              <p className="text-[12px] mt-1" style={{ color: EV.ink2 }}>{r.why}</p>
              <p className="text-[11px] mt-2" style={{ color: EV.muted }}><b style={{ color: EV.ink2 }}>Size:</b> {r.program.maxText}</p>
              <p className="text-[11px] mt-1" style={{ color: EV.muted }}><b style={{ color: EV.ink2 }}>Can fund:</b> {r.program.uses.join('; ')}</p>
              {r.program.notFor && <p className="text-[11px] mt-1" style={{ color: EV.warn }}>Cannot fund: {r.program.notFor.join('; ')}</p>}
              <p className="text-[11px] mt-1" style={{ color: EV.muted }}><b style={{ color: EV.ink2 }}>Apply through:</b> {r.program.applyThrough}</p>
              <ol className="mt-2 list-decimal pl-5 space-y-0.5">{r.program.steps.map(s => <li key={s} className="text-[11px]" style={{ color: EV.muted }}>{s}</li>)}</ol>
              <div className="flex flex-wrap gap-3 mt-3">
                {r.program.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold inline-flex items-center gap-1" style={{ color: EV.violetText }}>{l.label} <ExternalLink size={10} /></a>)}
              </div>
            </div>
          ))}
          <div className="rounded-2xl p-4" style={{ background: EV.raised }}>
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: EV.ink }}><HandHelping size={14} /> Free help before you apply</p>
            <ul className="mt-2 space-y-2">{res.help.map(h => (
              <li key={h.name} className="text-[12px]" style={{ color: EV.ink2 }}>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: EV.violetText }}>{h.name}</a> — {h.what}
              </li>))}
            </ul>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: EV.muted }}>{res.disclaimer} Figures as stated on sba.gov in {res.asOf}.</p>
        </div>
      )}
    </div>
  );
};

// ─── Federal contracts ───────────────────────────────────────────────────────

const Contracts: React.FC<{ orgId: string; profile: Profile; onGoProfile: () => void }> = ({ orgId, profile, onGoProfile }) => {
  const [opts, setOpts] = useState<Awaited<ReturnType<typeof businessApi.options>> | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [certs, setCerts] = useState<CertKey[]>(() => String(profile.certifications?.value || 'small').split(/[\s,;]+/).filter(Boolean) as CertKey[]);
  const [kw, setKw] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<ContractsResponse | null>(null);

  useEffect(() => { businessApi.options().then(setOpts).catch(() => { /* chips just stay empty */ }); }, []);

  const naics = useMemo(() => {
    const fromTypes = (opts?.businessTypes || []).filter(t => types.includes(t.key)).flatMap(t => t.naics);
    if (fromTypes.length) return [...new Set(fromTypes)];
    return String(profile.naics?.value || '').split(/[\s,;]+/).filter(Boolean);
  }, [opts, types, profile.naics]);
  const keywords = useMemo(() => kw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5), [kw]);
  const toggle = (c: CertKey) => setCerts(cur => cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]);

  const run = async (includeIneligible = false) => {
    setBusy(true); setErr(null);
    try { setRes(await businessApi.contracts(orgId, { naics, keywords, certs: certs.length ? certs : ['small'], includeIneligible })); setShowAll(includeIneligible); }
    catch (e: any) { setErr(e?.message || 'Could not search'); } finally { setBusy(false); }
  };

  const missing = res?.report.gaps.filter(g => g.status === 'missing') || [];

  return (
    <div className="ev-panel p-5 space-y-4">
      <div>
        <p className="text-sm font-bold flex items-center gap-2" style={{ color: EV.ink }}><Building2 size={15} /> Sell: federal contracts</p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: EV.muted }}>
          The government buys from small businesses every day, and many purchases are reserved for small, women-owned, veteran-owned and HUBZone firms. These come from SAM.gov, near your state.
        </p>
      </div>

      <div>
        <EvLabel>What kind of work do you do?</EvLabel>
        <div className="flex flex-wrap gap-2 mt-2">
          {(opts?.businessTypes || []).map(t => {
            const on = types.includes(t.key);
            return <button key={t.key} onClick={() => setTypes(cur => on ? cur.filter(x => x !== t.key) : [...cur, t.key])} aria-pressed={on} className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                           style={{ background: on ? EV.violet : EV.raised, color: on ? '#fff' : EV.ink2, border: `1px solid ${on ? EV.violet : EV.line}` }}>{t.label}</button>;
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: EV.muted }}>
          {naics.length ? `Searching NAICS ${naics.join(', ')}.` : 'Pick a type, or add your NAICS codes in your Profile.'}
        </p>
      </div>

      <div>
        <EvLabel>Certifications you hold <span style={{ color: EV.muted }}>(only those you could document)</span></EvLabel>
        <div className="grid gap-1.5 mt-2 sm:grid-cols-2">
          {(opts?.certifications || []).map(c => (
            <label key={c.key} className="text-[12px] flex items-start gap-2" style={{ color: EV.ink2 }} title={c.hint}>
              <input type="checkbox" checked={certs.includes(c.key)} onChange={() => toggle(c.key)} className="mt-0.5 accent-violet-500" /> {c.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <EvLabel>Keywords <span style={{ color: EV.muted }}>(optional)</span></EvLabel>
        <input value={kw} onChange={e => setKw(e.target.value)} placeholder="catering, roofing, janitorial" className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm" style={input} />
      </div>

      <button disabled={busy || (!naics.length && !keywords.length)} onClick={() => run(false)} className={btn} style={primary}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Find contract opportunities
      </button>
      {err && <p role="alert" className="text-[12px]" style={{ color: EV.warn }}>{err}</p>}

      {res && res.status !== 'ok' && (
        <div className="rounded-xl p-4 flex gap-3" style={{ background: EV.raised }}>
          <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: EV.warn }} />
          <div>
            <p className="text-[12px]" style={{ color: EV.ink }}>{res.message}</p>
            <a href="https://sam.gov/search/?index=opp" target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold inline-flex items-center gap-1 mt-2" style={{ color: EV.violetText }}>Browse SAM.gov <ExternalLink size={10} /></a>
          </div>
        </div>
      )}

      {res?.status === 'ok' && (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: EV.ink }}>
            <b>{res.opportunities.length}</b> opportunit{res.opportunities.length === 1 ? 'y' : 'ies'} in {res.state}
            <span style={{ color: EV.muted }}> from {res.pulled} recent notices</span>
          </p>
          {res.hiddenIneligible > 0 && !showAll && (
            <p className="text-[11px]" style={{ color: EV.muted }}>
              {res.hiddenIneligible} more {res.hiddenIneligible === 1 ? 'is' : 'are'} reserved for certifications you did not select.{' '}
              <button onClick={() => run(true)} className="font-bold" style={{ color: EV.violetText }}>Show them anyway</button>
            </p>
          )}
          {res.opportunities.length === 0 && <p className="text-[12px]" style={{ color: EV.ink2 }}>Nothing open matches right now. Notices appear daily; also try broader NAICS codes or keywords.</p>}
          {res.opportunities.map(o => (
            <div key={o.noticeId} className="rounded-2xl p-4" style={{ background: EV.raised }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold leading-snug" style={{ color: EV.ink }}>{o.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: EV.muted }}>{o.agency}{o.solicitation ? ` · ${o.solicitation}` : ''}</p>
                  <p className="text-[11px] mt-1.5" style={{ color: EV.ink2 }}>
                    {o.type}{o.deadline ? ` · responses due ${fmtDate(o.deadline)}` : ''}{o.place ? ` · ${o.place}` : ''}{o.naics ? ` · NAICS ${o.naics}` : ''}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: o.competition === 'reserved' ? EV.success : EV.warn }}>
                    {o.competition === 'reserved' ? `Reserved: ${o.setAside || 'set-aside'}` : 'Full and open — you compete with businesses of every size'}
                  </p>
                  <ul className="mt-1.5">{o.reasons.map(r => <li key={r} className="text-[11px]" style={{ color: EV.muted }}>• {r}</li>)}</ul>
                </div>
                <a href={o.link} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg shrink-0" style={{ background: EV.violetWash, color: EV.violetText }} title="Open on SAM.gov"><ExternalLink size={14} /></a>
              </div>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed" style={{ color: EV.muted }}>
            Source: SAM.gov · retrieved {new Date(res.source.retrievedAt).toLocaleString()}. A match is not a prediction that you will win; read the full solicitation and ask the contracting officer about anything unclear.
          </p>
        </div>
      )}

      {res && (
        <div className="rounded-2xl p-4" style={{ background: EV.raised }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: EV.ink }}><Landmark size={14} /> Are you ready to bid? <span className="text-[11px] font-normal" style={{ color: EV.muted }}>{res.report.percentReady}% set up</span></p>
          {res.report.warnings.map(w => <p key={w} className="text-[11px] mt-2" style={{ color: EV.warn }}>{w}</p>)}
          <ul className="mt-2 space-y-1.5">
            {missing.slice(0, 5).map(g => (
              <li key={g.key} className="text-[12px]" style={{ color: EV.ink2 }}>
                <b>{g.label}</b>{g.blocking ? <span style={{ color: EV.warn }}> · blocks you from being awarded</span> : null}
                <span className="block text-[11px]" style={{ color: EV.muted }}>{g.why}</span>
              </li>
            ))}
            {missing.length === 0 && <li className="text-[12px]" style={{ color: EV.success }}>You have what you need to start bidding.</li>}
          </ul>
          <div className="flex flex-wrap gap-3 mt-3">
            <button onClick={onGoProfile} className="text-[12px] font-bold" style={{ color: EV.violetText }}>Answer these in your Profile →</button>
          </div>
          <p className="text-[10px] mt-3" style={{ color: EV.muted }}>Documents to prepare: {res.report.documents.map(d => d.label).join('; ')}.</p>
        </div>
      )}
    </div>
  );
};

export const GrantContracts: React.FC<{ orgId: string; profile: Profile; onGoProfile: () => void }> = ({ orgId, profile, onGoProfile }) => (
  <div className="space-y-5">
    <Financing />
    <Contracts orgId={orgId} profile={profile} onGoProfile={onGoProfile} />
  </div>
);

export default GrantContracts;
