/**
 * Property Passport — the page every parcel has, listed or not.
 *
 * Composes three sources into one record: the parcel (assessor spine), its civic
 * history (permits / blight / rental compliance / demolition / land bank / 311),
 * and — when one exists — the active Open Listing Record.
 *
 * Design rules carried from the rest of Terra:
 *  · Every fact renders with its vintage and whether it was observed or estimated.
 *    A frozen 2017 record and a daily-updated one must not look alike.
 *  · The record TIMELINE is history, not status. A demolition or foreclosure entry
 *    is something that happened, never a claim about the property's present state.
 *  · When a listing carries a content hash we show it as a fingerprint that proves
 *    integrity — never as a timestamp, never "blockchain-verified".
 *
 * Rendered as its own AppView 'TERRA_PASSPORT', opened with { parcelId } or a
 * listing's { listingKey }. Both resolve to the same page.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  MapPin, ArrowLeft, Home, Ruler, Landmark, FileText, Hammer, AlertTriangle,
  Info, Fingerprint, Share2, CalendarClock, DollarSign, Building2, ClipboardList,
  ExternalLink, ShieldCheck,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import type { TerraParcel, TerraCivicRecord, CivicRecordKind } from '../../services/terra/terraTypes';
import type { OpenListingRecord, OlrSource } from '../../services/terra/olr';
import {
  fetchParcel, fetchListing, fetchCivicForParcel, fetchListingForParcel,
} from '../../services/terra/terraService';

const ACCENT = '#FF8C00';
const LISTING_ACCENT = '#5B8DEF';
const CIVIC = '#FF3D80';
const MEASURE = '#4FC3D6';

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';

const KIND_META: Record<CivicRecordKind, { color: string; icon: React.ReactNode; label: string }> = {
  PERMIT:            { color: '#3DD68C', icon: <Hammer size={12} />,        label: 'Permit' },
  BLIGHT_TICKET:     { color: '#E8B33D', icon: <AlertTriangle size={12} />, label: 'Blight ticket' },
  DEMOLITION:        { color: '#C97BE8', icon: <AlertTriangle size={12} />, label: 'Demolition' },
  RENTAL_COMPLIANCE: { color: CIVIC,     icon: <FileText size={12} />,      label: 'Rental compliance' },
  SERVICE_REQUEST:   { color: MEASURE,   icon: <Info size={12} />,          label: '311 request' },
  LAND_BANK:         { color: '#6F7689', icon: <Landmark size={12} />,      label: 'Land Bank' },
  FORECLOSURE:       { color: '#B3241C', icon: <AlertTriangle size={12} />, label: 'Foreclosure (historical)' },
};

const money = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : '—';
const fmtNum = (n?: number, s = '') =>
  typeof n === 'number' && Number.isFinite(n) ? `${n.toLocaleString('en-US')}${s}` : '—';
const fmtDate = (v?: string | number) => {
  if (v === undefined || v === null || v === '') return '—';
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isNaN(t) ? String(v) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const monthYear = (t?: number) =>
  t ? new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'date unknown';

/** The required vintage line for a set of sources. */
function Vintage({ sources }: { sources?: OlrSource[] }) {
  const s = sources?.[0];
  if (!s) return null;
  const when = s.sourceUpdatedAt ?? s.retrievedAt;
  return (
    <div className="flex items-start gap-2 px-1 pt-1">
      <Info size={10} className="text-white/25 mt-0.5 shrink-0" />
      <p className="text-[10px] text-white/30 leading-relaxed">
        {s.label} · {monthYear(when)}
        {s.observed && s.observed !== 'observed' ? ` · ${s.observed}` : ''}
      </p>
    </div>
  );
}

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; color?: string }> = ({ icon, label: l, value, color = ACCENT }) => (
  <div className={`${card} p-4 flex items-center gap-3`}>
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}20`, color }}>{icon}</div>
    <div className="min-w-0">
      <p className={label}>{l}</p>
      <p className="text-base font-black text-white leading-tight tabular-nums truncate">{value}</p>
    </div>
  </div>
);

const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.05] last:border-0">
    <span className={label}>{k}</span>
    <span className="text-[12px] text-white/80 font-semibold tabular-nums text-right">{v}</span>
  </div>
);

// ─── The record timeline (history, not status) ──────────────────────────────

interface TimelineItem {
  at?: number;
  color: string;
  title: string;
  detail?: string;
  icon: React.ReactNode;
}

function buildTimeline(parcel: TerraParcel | null, civic: TerraCivicRecord[], listing: OpenListingRecord | null): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (listing) {
    items.push({
      at: Date.parse(listing.ModificationTimestamp) || undefined,
      color: LISTING_ACCENT,
      title: `${listing.StandardStatus.replace(/([A-Z])/g, ' $1').trim()} · ${money(listing.ListPrice)}`,
      detail: listing.X_Terra_ContentHash ? 'Listed on Terra · fingerprinted at publish' : 'Listed on Terra',
      icon: <Home size={11} />,
    });
  }

  for (const r of civic) {
    const meta = KIND_META[r.kind];
    items.push({
      at: r.occurredAt,
      color: meta?.color || '#6F7689',
      title: `${meta?.label || r.kind}${r.status ? ` · ${r.status}` : ''}`,
      detail: r.summary,
      icon: meta?.icon || <ClipboardList size={11} />,
    });
  }

  if (parcel?.lastSaleDate || parcel?.lastSalePrice) {
    items.push({
      at: parcel.lastSaleDate ? Date.parse(parcel.lastSaleDate) : undefined,
      color: '#8E7BE8',
      title: `Sold · ${money(parcel.lastSalePrice)}`,
      detail: 'Register of Deeds',
      icon: <DollarSign size={11} />,
    });
  }
  if (parcel?.yearBuilt) {
    items.push({
      at: Date.parse(`${parcel.yearBuilt}-01-01`),
      color: '#6F7689',
      title: `Built · ${parcel.yearBuilt}`,
      detail: 'Assessor',
      icon: <Building2 size={11} />,
    });
  }

  return items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

// ─── Page ────────────────────────────────────────────────────────────────────

export interface PropertyPassportProps {
  parcelId?: string;
  listingKey?: string;
  currentUser?: UserProfile | null;
  onBack?: () => void;
}

export const PropertyPassport: React.FC<PropertyPassportProps> = ({ parcelId, listingKey, currentUser, onBack }) => {
  const [parcel, setParcel] = useState<TerraParcel | null>(null);
  const [listing, setListing] = useState<OpenListingRecord | null>(null);
  const [civic, setCivic] = useState<TerraCivicRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let resolvedParcel: TerraParcel | null = null;
      let resolvedListing: OpenListingRecord | null = null;

      // Two entry points resolve to the same page.
      if (listingKey) {
        resolvedListing = await fetchListing(listingKey);
        const pid = resolvedListing?.X_Terra_ParcelId;
        if (pid) resolvedParcel = await fetchParcel(pid);
      } else if (parcelId) {
        resolvedParcel = await fetchParcel(parcelId);
        resolvedListing = await fetchListingForParcel(parcelId);
      }

      const pin = resolvedParcel?.parcelNumber || resolvedListing?.ParcelNumber;
      const civicRecords = pin ? await fetchCivicForParcel(pin, 60) : [];

      if (cancelled) return;
      setParcel(resolvedParcel);
      setListing(resolvedListing);
      setCivic(civicRecords);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [parcelId, listingKey]);

  const timeline = useMemo(() => buildTimeline(parcel, civic, listing), [parcel, civic, listing]);

  const title = listing?.UnparsedAddress || parcel?.address || 'Property';
  const subtitle = [parcel?.city || listing?.City, parcel?.stateOrProvince || listing?.StateOrProvince, parcel?.postalCode || listing?.PostalCode]
    .filter(Boolean).join(', ');

  const share = async () => {
    const url = listing
      ? `${window.location.origin}/api/terra/olr/${encodeURIComponent(listing.ListingKey)}`
      : `${window.location.origin}/?view=TERRA&parcel=${encodeURIComponent(parcel?.id || '')}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-3 text-white/30">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        <span className="text-xs">Loading passport…</span>
      </div>
    );
  }

  if (!parcel && !listing) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-16 h-16 rounded-3xl border border-dashed border-white/15 flex items-center justify-center text-white/20">
          <MapPin size={22} />
        </div>
        <div className="max-w-sm">
          <p className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">No record found</p>
          <p className="text-xs text-white/25 leading-relaxed">
            This parcel isn't in the Terra spine yet. It populates from the city's open data as ingestion runs.
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white/80 transition-colors">
            <ArrowLeft size={12} /> Back to the map
          </button>
        )}
      </div>
    );
  }

  const forSale = listing && !['Closed', 'Withdrawn', 'Expired', 'Canceled'].includes(listing.StandardStatus);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-black text-white truncate">{title}</h1>
            <p className="text-[10px] font-bold" style={{ color: ACCENT }}>{subtitle || 'Detroit, MI'}</p>
          </div>
          <button onClick={share} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white/80 transition-colors shrink-0">
            <Share2 size={11} /> {copied ? 'Copied' : 'Share'}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* For-sale banner */}
        {forSale && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl flex items-center justify-between gap-4 flex-wrap"
            style={{ background: `${LISTING_ACCENT}18`, border: `1px solid ${LISTING_ACCENT}44` }}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: LISTING_ACCENT }}>
                {listing!.StandardStatus.replace(/([A-Z])/g, ' $1').trim()} on Terra
              </p>
              <p className="text-2xl font-black text-white tabular-nums mt-0.5">{money(listing!.ListPrice)}</p>
              <p className="text-[11px] text-white/50 mt-0.5">
                {[listing!.BedroomsTotal && `${listing!.BedroomsTotal} bd`,
                  listing!.BathroomsTotalInteger && `${listing!.BathroomsTotalInteger} ba`,
                  listing!.LivingArea && `${fmtNum(listing!.LivingArea)} sqft`].filter(Boolean).join(' · ')}
              </p>
            </div>
            {listing!.X_Terra_ContentHash && (
              <div className="text-right">
                <p className="flex items-center gap-1.5 text-[10px] font-mono text-white/40 justify-end" title="SHA-256 fingerprint. Proves the record is unaltered — it is not a timestamp.">
                  <Fingerprint size={11} /> {listing!.X_Terra_ContentHash.slice(0, 10)}
                </p>
                <p className="text-[9px] text-white/25 mt-0.5">
                  fingerprinted{listing!.X_Terra_Revision ? ` · rev ${listing!.X_Terra_Revision}` : ''}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Key stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={<Ruler size={15} />} label="Lot"
            value={parcel?.frontageFt && parcel?.depthFt ? `${fmtNum(parcel.frontageFt)}×${fmtNum(parcel.depthFt)}` : fmtNum(parcel?.lotSqFt, ' sf')} color={MEASURE} />
          <Stat icon={<DollarSign size={15} />} label="Assessed" value={money(parcel?.assessedValue)} color="#3DD68C" />
          <Stat icon={<CalendarClock size={15} />} label="Built" value={parcel?.yearBuilt || '—'} />
          <Stat icon={<Building2 size={15} />} label="Zoning" value={parcel?.zoningDistrict || '—'} color={LISTING_ACCENT} />
        </div>

        {/* Facts + narrative */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className={`${label} mb-3`}>Property record</p>
            <div className={`${card} p-4`}>
              <Row k="Parcel" v={<span className="font-mono text-[11px]">{parcel?.parcelNumber || listing?.ParcelNumber || '—'}</span>} />
              <Row k="Class" v={parcel?.propertyClass || listing?.PropertyType || '—'} />
              <Row k="Assessed" v={money(parcel?.assessedValue)} />
              <Row k="Taxable" v={money(parcel?.taxableValue)} />
              <Row k="Last sale" v={parcel?.lastSalePrice ? `${money(parcel.lastSalePrice)} · ${fmtDate(parcel.lastSaleDate)}` : fmtDate(parcel?.lastSaleDate)} />
              <Row k="Floor area" v={fmtNum(parcel?.floorAreaSqFt, ' sf')} />
              <Row k="Buildings" v={parcel?.buildingCount ?? '—'} />
              <Row k="Status" v={parcel?.isImproved === false ? 'Vacant lot' : parcel?.isImproved ? 'Improved' : '—'} />
            </div>
            <Vintage sources={parcel?.sources} />

            {parcel?.localHistoricDistrict && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl"
                   style={{ background: '#E8B33D14', border: '1px solid #E8B33D33' }}>
                <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: '#E8B33D' }} />
                <p className="text-[11px] text-white/60 leading-relaxed">
                  In the <strong className="text-white/80">{parcel.localHistoricDistrict}</strong> historic district —
                  design review applies, and overlay rules can override the base zoning.
                </p>
              </div>
            )}
          </div>

          <div>
            <p className={`${label} mb-3`}>{listing?.PublicRemarks ? 'About' : 'On this block'}</p>
            <div className={`${card} p-4 min-h-[120px]`}>
              {listing?.PublicRemarks ? (
                <p className="text-[13px] text-white/70 leading-relaxed">{listing.PublicRemarks}</p>
              ) : (
                <div className="space-y-2">
                  {(['PERMIT', 'BLIGHT_TICKET', 'RENTAL_COMPLIANCE', 'DEMOLITION'] as CivicRecordKind[]).map(kind => {
                    const n = civic.filter(c => c.kind === kind).length;
                    const meta = KIND_META[kind];
                    return (
                      <div key={kind} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[11px] text-white/55">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-black text-white/70 tabular-nums">{n}</span>
                      </div>
                    );
                  })}
                  {civic.length === 0 && (
                    <p className="text-[11px] text-white/25 leading-relaxed">No civic records ingested for this parcel yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* The record timeline */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className={label}>The record</p>
            <p className="text-[9px] text-white/25 uppercase tracking-widest">History · not current status</p>
          </div>
          {timeline.length === 0 ? (
            <div className={`${card} p-6 text-center`}>
              <p className="text-[11px] text-white/25">No dated events on record yet.</p>
            </div>
          ) : (
            <div className={`${card} p-5`}>
              <div className="border-l border-white/10 ml-1.5 space-y-4">
                {timeline.map((item, i) => (
                  <div key={i} className="relative pl-5">
                    <span className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#0a0a0a]" style={{ background: item.color }} />
                    <p className="text-[12px] font-bold text-white/85 leading-snug">{item.title}</p>
                    <p className="text-[10px] text-white/35">
                      {item.detail ? `${item.detail} · ` : ''}{monthYear(item.at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Provenance footer — honest about what the hash does */}
        {listing?.X_Terra_ContentHash && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Fingerprint size={15} className="mt-0.5 shrink-0 text-white/30" />
            <div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                This listing's record and media are fingerprinted with a SHA-256 hash, so any later
                change is detectable and its revisions are provable. The fingerprint confirms the
                record is unaltered — it is not a timestamp and makes no claim about when the record existed.
              </p>
              <a href={`/api/terra/olr/${encodeURIComponent(listing.ListingKey)}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity" style={{ color: ACCENT }}>
                <ExternalLink size={10} /> View the open record
              </a>
            </div>
          </div>
        )}

        <p className="text-[9px] text-white/20 text-center pb-4">
          Public record via City of Detroit Open Data · provided as-is, without warranty.
        </p>
      </div>
    </div>
  );
};

export default PropertyPassport;
