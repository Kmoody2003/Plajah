/**
 * Site Scout — commercial site-selection intelligence.
 *
 * Commercial-mode ONLY. The mode badge isn't decoration: this is the one Terra
 * surface where demographics appear, and it's kept apart from every residential
 * surface on purpose (see siteScoutService for the fair-housing reasoning).
 *
 * Live data sources aren't wired yet, so the report is PREVIEW data — clearly
 * banner'd, each metric stamped with its source and vintage. Real adapters slot
 * into siteScoutService without changing this component.
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Compass, Users, Car, Store, Footprints, DollarSign, Home,
  Printer, Info, ShieldCheck, TrendingUp,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import {
  buildPreviewReport, scoreBand, RETAIL_CATEGORIES,
  type SiteScoutReport, type TradeArea, type SiteMetric,
} from '../../services/terra/siteScoutService';

const ACCENT = '#FF8C00';
const CIVIC = '#FF3D80';   // Site Scout's accent in the hub

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';

const METRIC_ICON: Record<string, React.ReactNode> = {
  daytime: <Users size={15} />, households: <Home size={15} />, income: <DollarSign size={15} />,
  aadt: <Car size={15} />, walk: <Footprints size={15} />, competition: <Store size={15} />,
};

const DRIVE_OPTIONS = [5, 10, 15];

/** Reused print helper — a clean site-report document. */
function printReport(r: SiteScoutReport) {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;
  const rows = r.metrics.map(m => `<tr><td>${m.label}</td><td style="text-align:right">${m.display}</td><td>${m.source}${m.vintage ? ` · ${m.vintage}` : ''}</td></tr>`).join('');
  const ta = r.tradeArea.kind === 'drive' ? `${r.tradeArea.minutes}-min drive` : `${r.tradeArea.radiusMi}-mi radius`;
  w.document.write(`<!doctype html><html><head><title>Site Scout — ${r.site.label}</title><style>
    body{font-family:Georgia,serif;color:#111;padding:40px;max-width:720px;margin:0 auto;line-height:1.4}
    h1{font-size:20px;margin:0 0 2px} .muted{color:#666;font-size:12px;margin-bottom:18px}
    .band{display:inline-block;padding:3px 10px;border:1px solid #000;border-radius:3px;font-weight:bold;margin:6px 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0} td,th{border:1px solid #bbb;padding:5px 8px;text-align:left} th{background:#f0f0f0}
    .warn{background:#fff6e6;border:1px solid #e0a800;padding:8px 10px;font-size:11px;border-radius:4px;margin-bottom:14px}
  </style></head><body>
    <h1>Site Scout — ${r.site.label}</h1>
    <div class="muted">${r.site.address || ''} · ${RETAIL_CATEGORIES.find(c => c.key === r.category)?.label || r.category} · ${ta}</div>
    <div class="warn"><b>Preview data.</b> Live sources (Census, LODES, Overture, traffic) are not yet connected — figures are representative, not measured.</div>
    <div class="band">Site score ${r.score.overall}/100 · ${scoreBand(r.score.overall).label}</div>
    <table><tr><th>Signal</th><th style="text-align:right">Value</th><th>Source</th></tr>${rows}</table>
    <p style="font-size:11px;color:#666">Demand ${r.score.demand} · Access ${r.score.access} · Competition ${r.score.competition}. Commercial site selection only.</p>
  </body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 350);
}

const MetricCard: React.FC<{ m: SiteMetric }> = ({ m }) => (
  <div className={`${card} p-4`}>
    <div className="flex items-center justify-between mb-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${CIVIC}18`, color: CIVIC }}>
        {METRIC_ICON[m.key] || <TrendingUp size={15} />}
      </div>
      {m.status === 'preview' && (
        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full text-white/35 bg-white/5">Preview</span>
      )}
    </div>
    <p className="text-xl font-black text-white leading-none tabular-nums">{m.display}</p>
    <p className={`${label} mt-1`}>{m.label}</p>
    {m.hint && <p className="text-[10px] text-white/35 mt-1.5 leading-relaxed">{m.hint}</p>}
    <p className="text-[9px] text-white/25 mt-2 leading-relaxed">{m.source}{m.vintage ? ` · ${m.vintage}` : ''}</p>
  </div>
);

export interface SiteScoutProps {
  currentUser?: UserProfile | null;
  onBack?: () => void;
}

export const SiteScout: React.FC<SiteScoutProps> = ({ onBack }) => {
  const [address, setAddress] = useState('1244 Michigan Ave, Detroit');
  const [category, setCategory] = useState('cafe');
  const [minutes, setMinutes] = useState(10);

  const tradeArea: TradeArea = { kind: 'drive', minutes };
  const report = useMemo(
    () => buildPreviewReport({ label: address || 'Untitled site', address }, category, tradeArea),
    [address, category, minutes],
  );
  const band = scoreBand(report.score.overall);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0" title="Back to Terra">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: `${CIVIC}20`, borderColor: `${CIVIC}40` }}>
            <Compass size={16} style={{ color: CIVIC }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-widest text-white">Site Scout</h1>
            <p className="text-[10px] font-bold" style={{ color: CIVIC }}>Commercial site selection</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shrink-0"
                style={{ color: CIVIC, borderColor: `${CIVIC}55`, background: `${CIVIC}12` }}>
            <ShieldCheck size={11} /> Commercial mode
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Preview banner — non-negotiable honesty */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: `${ACCENT}0e`, border: `1px solid ${ACCENT}30` }}>
          <Info size={14} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
          <p className="text-[11px] text-white/55 leading-relaxed">
            <span className="text-white/80 font-semibold">Preview data.</span> The live feeds this runs on —
            Census demographics, workplace population, competitor places, traffic counts — connect in a later
            phase. The figures below are representative and labelled as such, so you can see the shape of the
            analysis, not measured yet.
          </p>
        </div>

        {/* Inputs */}
        <div className={`${card} p-5`}>
          <div className="grid md:grid-cols-[1fr_180px] gap-3">
            <div>
              <p className={`${label} mb-1.5`}>Site</p>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
            </div>
            <div>
              <p className={`${label} mb-1.5`}>Concept</p>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/25">
                {RETAIL_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <p className={label}>Trade area</p>
            <div className="flex gap-1.5">
              {DRIVE_OPTIONS.map(m => (
                <button key={m} onClick={() => setMinutes(m)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${minutes === m ? 'text-black' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
                  style={minutes === m ? { background: CIVIC } : {}}>
                  {m} min drive
                </button>
              ))}
            </div>
            <button onClick={() => printReport(report)}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white/90 transition-colors">
              <Printer size={12} /> Report
            </button>
          </div>
        </div>

        {/* Score */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5`}>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0"
                   style={{ background: `${band.color}18`, border: `1px solid ${band.color}55` }}>
                <span className="text-2xl font-black tabular-nums" style={{ color: band.color }}>{report.score.overall}</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: band.color }}>{band.label} site</p>
                <p className="text-sm font-black text-white">Score {report.score.overall} / 100</p>
                <p className="text-[10px] text-white/35">for a {RETAIL_CATEGORIES.find(c => c.key === category)?.label.toLowerCase()} · {minutes}-min drive</p>
              </div>
            </div>
            <div className="flex gap-6 ml-auto">
              {[['Demand', report.score.demand], ['Access', report.score.access], ['Competition', report.score.competition]].map(([k, v]) => (
                <div key={k as string} className="text-center">
                  <p className="text-lg font-black text-white tabular-nums">{v as number}</p>
                  <p className={label}>{k as string}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Metrics */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {report.metrics.map(m => <MetricCard key={m.key} m={m} />)}
        </div>

        {/* Trade-area viz + competitors */}
        <div className={`${card} p-5`}>
          <p className={`${label} mb-3`}>Trade area · {minutes}-min drive</p>
          <svg viewBox="0 0 900 150" className="w-full" role="img" aria-label="Drive-time trade area with competitor locations">
            <rect width="900" height="150" fill="#07080B" rx="10" />
            <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
              <line x1="0" y1="50" x2="900" y2="50" /><line x1="0" y1="100" x2="900" y2="100" />
              <line x1="300" y1="0" x2="300" y2="150" /><line x1="600" y1="0" x2="600" y2="150" />
            </g>
            <path d="M300 75 Q380 20 470 32 Q590 44 640 75 Q600 130 470 134 Q350 130 300 75 Z"
                  fill={`${CIVIC}18`} stroke={CIVIC} strokeWidth="1.4" strokeDasharray="6 4" />
            <circle cx="470" cy="75" r="7" fill={ACCENT} />
            <text x="470" y="60" fill="#FFCE8A" fontFamily="ui-monospace, monospace" fontSize="10" textAnchor="middle">SITE</text>
            {report.competitors.map((c, i) => {
              const angle = (i / Math.max(1, report.competitors.length)) * Math.PI * 2;
              const cx = 470 + Math.cos(angle) * (60 + c.distanceMi * 90);
              const cy = 75 + Math.sin(angle) * (26 + c.distanceMi * 30);
              return <circle key={i} cx={Math.max(20, Math.min(880, cx))} cy={Math.max(12, Math.min(138, cy))} r="4.5" fill="#4FC3D6" />;
            })}
          </svg>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-white/35">● site · ● competitor · ⌁ {minutes}-min reach (illustrative)</p>
            <p className="text-[10px] text-white/40">{report.competitors.length} {RETAIL_CATEGORIES.find(c => c.key === category)?.label.toLowerCase()} in area</p>
          </div>
        </div>

        <p className="text-[9px] text-white/20 text-center pb-4">
          Commercial site selection only — demographics are never shown on residential surfaces. Preview data; confirm with primary sources before committing capital.
        </p>
      </div>
    </div>
  );
};

export default SiteScout;
