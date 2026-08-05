/**
 * Business Compliance — a Business-dashboard tab.
 *
 * Renewal calendar + public-record view for a storefront, off the Terra parcel
 * spine. Honest by construction: we track what's due and deep-link to the city's
 * portal to file — we never claim to submit for you. Detroit only for now.
 *
 * Locally there's no ingested civic data, so the public-record column shows a
 * representative view; the renewal calendar is demo until a business links its
 * address to a Detroit parcel. Everything preview is labelled.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck, ExternalLink, FileText, AlertTriangle, Info, Building2, CheckCircle2, Clock,
} from 'lucide-react';
import type { BusinessPage } from '../../types';
import {
  demoComplianceItems, sortByUrgency, STATE_STYLE, DETROIT_PORTALS,
  type ComplianceItem,
} from '../../services/terra/complianceService';
import { fetchCivicForParcel } from '../../services/terra/terraService';
import type { TerraCivicRecord } from '../../services/terra/terraTypes';

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';

function fmtDue(item: ComplianceItem): string {
  if (item.dueAt === undefined) return 'On file';
  const d = item.daysUntil ?? 0;
  if (d < 0) return `${Math.abs(d)} days overdue`;
  if (d === 0) return 'Due today';
  return `${d} days`;
}

export const BusinessCompliance: React.FC<{ business?: BusinessPage | null }> = ({ business }) => {
  // now is read once on mount (not at module scope) so due dates are stable.
  const [now] = useState(() => Date.now());
  const items = useMemo(
    () => sortByUrgency(demoComplianceItems(business?.businessName || 'Your business', now)),
    [business?.businessName, now],
  );

  // Civic history is keyed by parcel number; a business page doesn't carry one
  // yet, so this stays empty locally. The wiring is here for when addresses are
  // matched to Detroit parcels.
  const [civic, setCivic] = useState<TerraCivicRecord[]>([]);
  useEffect(() => {
    const pin = (business as any)?.parcelNumber;
    if (!pin) { setCivic([]); return; }
    let cancelled = false;
    fetchCivicForParcel(pin, 20).then(r => { if (!cancelled) setCivic(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [business]);

  const cityAddress = [business?.address, business?.city, business?.state].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">
      {/* Preview / honesty banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(91,141,239,.08)', border: '1px solid rgba(91,141,239,.28)' }}>
        <Info size={14} className="mt-0.5 shrink-0 text-[#5B8DEF]" />
        <p className="text-[11px] text-white/55 leading-relaxed">
          <span className="text-white/80 font-semibold">Preview.</span> Terra tracks renewals and holds
          your documents, and links you to the city's portal to file — no city offers a filing API, so we
          never submit for you. Live public records connect for Detroit addresses; the calendar below is
          representative until your address is matched to a parcel.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Coming due */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className={label}>Coming due</p>
            <ShieldCheck size={13} className="text-white/30" />
          </div>
          <div className="space-y-2">
            {items.map(item => {
              const st = STATE_STYLE[item.state];
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`${card} p-4`}
                  style={item.state === 'OVERDUE' ? { borderColor: 'rgba(255,107,94,.32)', background: 'rgba(255,107,94,.05)' }
                    : item.state === 'DUE_SOON' ? { borderColor: 'rgba(232,179,61,.3)', background: 'rgba(232,179,61,.05)' } : {}}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white leading-tight">{item.title}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">{item.authority}{item.note ? ` · ${item.note}` : ''}</p>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
                          style={{ color: st.text, background: `${st.text}18` }}>
                      {item.state === 'ON_FILE' ? st.label : fmtDue(item)}
                    </span>
                  </div>
                  {item.portalUrl && item.state !== 'ON_FILE' && (
                    <a href={item.portalUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white/90 transition-colors">
                      <ExternalLink size={11} /> {item.portalLabel || 'Open portal'}
                    </a>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* This address · public record */}
        <div>
          <p className={`${label} mb-3`}>This address · public record</p>
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={14} className="text-white/40" />
              <p className="text-[11px] text-white/60 truncate">{cityAddress || 'No address on your business page'}</p>
            </div>
            {civic.length > 0 ? (
              <div className="space-y-1.5">
                {civic.slice(0, 8).map(r => (
                  <div key={r.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-white/60 truncate">{r.summary}</span>
                    <span className="text-white/30 shrink-0 ml-2">{r.status || ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  ['Zoning', 'B4 · general business (representative)'],
                  ['Use', 'Conforming'],
                  ['Certificate of occupancy', 'On file'],
                  ['Open violations', 'None'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-white/[0.05] last:border-0">
                    <span className={label}>{k}</span>
                    <span className="text-[11px] text-white/70">{v}</span>
                  </div>
                ))}
                <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
                  Live once your Detroit address is matched to a parcel. Detroit only, for now.
                </p>
              </div>
            )}
          </div>

          {/* Inspection history (representative) */}
          <p className={`${label} mt-5 mb-2`}>Inspection history</p>
          <div className={`${card} p-4 space-y-2`}>
            {[
              ['Health · routine', 'Pass · Nov 2025', '#3DD68C'],
              ['Health · routine', '2 corrected · Apr 2025', '#E8B33D'],
              ['Fire · annual', 'Pass · Sep 2025', '#3DD68C'],
            ].map(([k, v, c], i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2 text-white/55">
                  <CheckCircle2 size={11} style={{ color: c as string }} /> {k}
                </span>
                <span className="text-white/40">{v}</span>
              </div>
            ))}
            <p className="text-[9px] text-white/25 pt-1">Representative — connects to city inspection records for Detroit addresses.</p>
          </div>
        </div>
      </div>

      {/* File a new permit — deep links, never a fake submit */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-white/40" />
          <p className={label}>File with the city</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {DETROIT_PORTALS.map(p => (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/20 transition-colors group">
              <span className="text-[11px] text-white/70 group-hover:text-white truncate">{p.label}</span>
              <ExternalLink size={12} className="text-white/30 group-hover:text-white/60 shrink-0" />
            </a>
          ))}
        </div>
        <p className="text-[10px] text-white/30 mt-3 leading-relaxed">
          Filing happens on the municipality's own portal. Terra tracks what's due and holds your
          documents — it doesn't submit on your behalf.
        </p>
      </div>
    </div>
  );
};

export default BusinessCompliance;
