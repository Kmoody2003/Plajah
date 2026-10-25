// GrantMatcher — Elevate's federal grant finder.
//
// Matches the org's applicant type + mission against live Grants.gov notices and shows who has recently
// been funded in the org's county (USAspending). Everything comes through /api/data/* with provenance.
//
// Honesty rules the UI enforces: the score is "relevance", never "eligible"; every card carries the
// notice's own eligibility text; and the disclaimer is always visible next to results.

import React, { useEffect, useMemo, useState } from 'react';
import { Search, ExternalLink, Loader2, ChevronDown, ChevronUp, Landmark, MapPin, CalendarClock } from 'lucide-react';
import type { Organization } from '../../types';
import {
  fetchGrantOptions, matchGrants, geocode, fetchPeerAwards,
  type ApplicantKind, type GrantMatchResult, type PeerAwards,
} from '../../services/dataCommons/client';
import { EV, EvLabel } from './vellum';

const KIND_LABEL: Record<ApplicantKind, string> = {
  church: 'Church / congregation', nonprofit: 'Nonprofit (501c3)', charity: 'Charity', cultural: 'Cultural institution',
  'school-district': 'School district', college: 'College / university', 'small-business': 'Small business',
  business: 'Business', city: 'City / township', county: 'County', state: 'State agency', tribal: 'Tribal organization',
  'housing-authority': 'Housing authority',
};

function defaultKind(org: Organization): ApplicantKind {
  switch (org.orgType) {
    case 'CHURCH': case 'RELIGIOUS': return 'church';
    case 'CULTURAL': return 'cultural';
    case 'BUSINESS': case 'RESTAURANT': case 'STUDIO': case 'PUBLISHER': case 'REALTY': return 'small-business';
    default: return 'nonprofit';
  }
}

const usd = (n?: number) => (n ? `$${n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : n}` : undefined);

const fmtDate = (iso?: string) => iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : undefined;

const MatchCard: React.FC<{ m: GrantMatchResult['matches'][number] }> = ({ m }) => {
  const [open, setOpen] = useState(false);
  const d = m.detail;
  const range = d?.awardFloor || d?.awardCeiling
    ? `${usd(d.awardFloor) ?? '—'} – ${usd(d.awardCeiling) ?? '—'} per award`
    : undefined;
  return (
    <div className="ev-panel p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 text-center">
          <div className="text-lg font-black tabular-nums" style={{ color: EV.violetText }}>{m.relevance}</div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: EV.muted }}>relevance</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug" style={{ color: EV.ink }}>{m.title}</p>
          <p className="text-[11px] mt-0.5" style={{ color: EV.muted }}>
            {m.agency || m.agencyCode} · {m.number}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]" style={{ color: EV.ink2 }}>
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} />
              {m.status === 'forecasted' ? 'Forecast' : m.closeDate ? `Closes ${fmtDate(m.closeDate)}` : 'No posted deadline'}
            </span>
            {range && <span>{range}</span>}
            {d?.costSharing && <span style={{ color: EV.warn }}>Cost share required</span>}
          </div>
          <ul className="mt-2 space-y-0.5">
            {m.reasons.map(r => <li key={r} className="text-[11px]" style={{ color: EV.muted }}>• {r}</li>)}
          </ul>
          {d && (
            <button onClick={() => setOpen(o => !o)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: EV.violetText }}>
              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Who can apply
            </button>
          )}
          {open && d && (
            <div className="mt-2 text-[11px] leading-relaxed space-y-2" style={{ color: EV.ink2 }}>
              <p><b style={{ color: EV.ink }}>Eligibility (from the notice):</b> {d.eligibilityText || 'Not stated in the summary — open the notice.'}</p>
              {d.summary && <p>{d.summary}</p>}
            </div>
          )}
        </div>
        <a href={m.link} target="_blank" rel="noopener noreferrer"
           className="shrink-0 p-2 rounded-lg" style={{ background: EV.violetWash, color: EV.violetText }} title="Open on Grants.gov">
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
};

export const GrantMatcher: React.FC<{ org: Organization }> = ({ org }) => {
  const [kinds, setKinds] = useState<{ key: ApplicantKind; note?: string }[]>([]);
  const [topics, setTopics] = useState<{ key: string; label: string }[]>([]);
  const [kind, setKind] = useState<ApplicantKind>(() => defaultKind(org));
  const [picked, setPicked] = useState<string[]>([]);
  const [kw, setKw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrantMatchResult | null>(null);
  const [peers, setPeers] = useState<PeerAwards | null>(null);
  const [peerPlace, setPeerPlace] = useState<string | null>(null);

  useEffect(() => {
    fetchGrantOptions().then(o => { setKinds(o.kinds); setTopics(o.topics); }).catch(e => setError(e.message));
  }, []);

  const kindNote = useMemo(() => kinds.find(k => k.key === kind)?.note, [kinds, kind]);
  const keywords = useMemo(() => kw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4), [kw]);
  const canRun = !busy && (picked.length > 0 || keywords.length > 0);

  const toggle = (key: string) => setPicked(p => p.includes(key) ? p.filter(k => k !== key) : p.length >= 4 ? p : [...p, key]);

  const run = async () => {
    setBusy(true); setError(null); setResult(null); setPeers(null); setPeerPlace(null);
    try {
      const res = await matchGrants({ kind, topics: picked, keywords });
      setResult(res);
      // Nearby awards are best-effort: no address, or no geocoder match, simply means no panel.
      const addr = [org.location?.address, org.location?.city].filter(Boolean).join(', ');
      if (addr.length >= 8) {
        try {
          const g = await geocode(addr);
          const { stateAbbr, countyFips, county } = g.geography || {};
          if (stateAbbr && countyFips) {
            setPeerPlace(county || null);
            setPeers(await fetchPeerAwards(stateAbbr, countyFips, keywords.length ? keywords : picked.map(p => topics.find(t => t.key === p)?.label || p)));
          }
        } catch { /* leave the panel out */ }
      }
    } catch (e: any) {
      setError(e?.message || 'Could not reach Grants.gov');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="ev-panel p-5 space-y-4">
        <div>
          <EvLabel>Applying as</EvLabel>
          <select value={kind} onChange={e => setKind(e.target.value as ApplicantKind)}
                  className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: EV.chrome, color: EV.ink, border: `1px solid ${EV.line}` }}>
            {(kinds.length ? kinds.map(k => k.key) : [kind]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          {kindNote && <p className="text-[11px] mt-2 leading-relaxed" style={{ color: EV.warn }}>{kindNote}</p>}
        </div>

        <div>
          <EvLabel>What the funding is for <span style={{ color: EV.muted }}>(pick up to 4)</span></EvLabel>
          <div className="flex flex-wrap gap-2 mt-2">
            {topics.map(t => {
              const on = picked.includes(t.key);
              return (
                <button key={t.key} onClick={() => toggle(t.key)} aria-pressed={on}
                        className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
                        style={{ background: on ? EV.violet : EV.raised, color: on ? '#fff' : EV.ink2, border: `1px solid ${on ? EV.violet : EV.line}` }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <EvLabel>Keywords <span style={{ color: EV.muted }}>(optional, comma-separated)</span></EvLabel>
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="food pantry, youth mentoring, roof repair"
                 onKeyDown={e => { if (e.key === 'Enter' && canRun) run(); }}
                 className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                 style={{ background: EV.chrome, color: EV.ink, border: `1px solid ${EV.line}` }} />
        </div>

        <button onClick={run} disabled={!canRun}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ background: EV.brand, color: '#fff' }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find grants
        </button>
      </div>

      {error && <p role="alert" className="text-sm" style={{ color: EV.warn }}>{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold" style={{ color: EV.ink }}>
              {result.matches.length} match{result.matches.length === 1 ? '' : 'es'}
              <span className="font-normal" style={{ color: EV.muted }}> from {result.totalConsidered} open or forecast notices</span>
            </p>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: EV.muted }}>{result.disclaimer}</p>
          {result.matches.length === 0 && (
            <p className="text-sm" style={{ color: EV.ink2 }}>Nothing open fits that combination. Try fewer filters or broader keywords.</p>
          )}
          {result.matches.map(m => <MatchCard key={m.id} m={m} />)}
          <p className="text-[10px]" style={{ color: EV.muted }}>
            Source: Grants.gov · retrieved {new Date(result.source.retrievedAt).toLocaleString()} · {result.source.license}
          </p>
        </div>
      )}

      {peers && peers.awards.length > 0 && (
        <div className="ev-panel p-5">
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: EV.ink }}>
            <MapPin size={14} /> Largest federal grants awarded in {peerPlace || 'your county'}
            <span className="font-normal text-[11px]" style={{ color: EV.muted }}>FY{peers.fiscalYear}</span>
          </p>
          <p className="text-[11px] mt-1 mb-3" style={{ color: EV.muted }}>
            Who is already winning here — a sense of what funders support in your area, and possible partners.
          </p>
          <ul className="space-y-2.5">
            {peers.awards.map(a => (
              <li key={a.awardId} className="flex items-start gap-3">
                <Landmark size={14} className="mt-0.5 shrink-0" style={{ color: EV.violetText }} />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: EV.ink }}>
                    {a.recipient} <span className="tabular-nums" style={{ color: EV.violetText }}>{usd(a.amount)}</span>
                  </p>
                  <p className="text-[11px] leading-snug line-clamp-2" style={{ color: EV.muted }}>{a.description}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[10px] mt-3" style={{ color: EV.muted }}>Source: USAspending.gov · FY{peers.fiscalYear} · {peers.source.license}</p>
        </div>
      )}
    </div>
  );
};

export default GrantMatcher;
