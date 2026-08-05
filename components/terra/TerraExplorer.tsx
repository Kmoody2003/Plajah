/**
 * Terra Explorer — the citizen map.
 *
 * Every parcel, whether or not it is for sale, with the civic layers a neighbour
 * actually wants. This is the surface that earns an audience before a single
 * listing exists.
 *
 * ── Two deliberate choices ──────────────────────────────────────────────────
 *
 * 1. NO BASEMAP TILES. The tile sources already used elsewhere in this repo
 *    (Stadia, CartoDB) are not licensed for commercial use on their free tiers —
 *    CARTO's own licence file restricts its CDN to enterprise customers. Rather
 *    than inherit that, Terra renders parcel geometry directly on a dark ground.
 *    In a dense city the parcels tile the space themselves and the streets read
 *    as the gaps, which is also the plat-drawing look the design calls for.
 *    A licensed vector basemap (OpenFreeMap → self-hosted Protomaps) comes later.
 *
 * 2. EVERY FACT CARRIES ITS VINTAGE. Some sources update daily, others are frozen
 *    years back. The inspector renders `retrievedAt` and the observed/estimated
 *    flag alongside the value, never a bare number.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  MapPin, Layers, Ruler, Building2, Download, Info, RefreshCw,
  FileText, AlertTriangle, Home, Hammer, Landmark, Search, ArrowLeft,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { TerraParcel, TerraCivicRecord, CivicRecordKind } from '../../services/terra/terraTypes';
import { fetchParcelsPage, fetchCivicForParcel } from '../../services/terra/terraService';

/** Terra's accent: Plajah's primary orange, read here as a surveyor's flag. */
const ACCENT = '#FF8C00';
const CIVIC = '#FF3D80';
const MEASURE = '#4FC3D6';

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';

const LAYERS: { id: CivicRecordKind | 'PARCELS'; label: string; color: string; icon: React.ReactNode }[] = [
  { id: 'PARCELS',           label: 'Parcels',        color: ACCENT,   icon: <Home size={11} /> },
  { id: 'PERMIT',            label: 'Permits',        color: '#3DD68C', icon: <Hammer size={11} /> },
  { id: 'BLIGHT_TICKET',     label: 'Blight tickets', color: '#E8B33D', icon: <AlertTriangle size={11} /> },
  { id: 'RENTAL_COMPLIANCE', label: 'Rental compliance', color: CIVIC, icon: <FileText size={11} /> },
  { id: 'DEMOLITION',        label: 'Demolition queue', color: '#C97BE8', icon: <AlertTriangle size={11} /> },
  { id: 'LAND_BANK',         label: 'Land Bank',      color: '#6F7689', icon: <Landmark size={11} /> },
  { id: 'SERVICE_REQUEST',   label: '311 requests',   color: MEASURE,  icon: <Info size={11} /> },
];

function fmtMoney(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n?: number, suffix = ''): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)}${suffix}`;
}
function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
/** The vintage stamp. Never render a sourced fact without one. */
function vintageOf(parcel: TerraParcel | null): string {
  const src = parcel?.sources?.[0];
  if (!src) return 'source unknown';
  const when = src.sourceUpdatedAt ?? src.retrievedAt;
  const rel = new Date(when).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${src.label} · ${rel}${src.observed && src.observed !== 'observed' ? ` · ${src.observed}` : ''}`;
}

// ─── Map ─────────────────────────────────────────────────────────────────────

const DETROIT_CENTER: [number, number] = [42.3548, -83.0864];

const ParcelMap: React.FC<{
  parcels: TerraParcel[];
  selectedId: string | null;
  onSelect: (p: TerraParcel) => void;
}> = ({ parcels, selectedId, onSelect }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Init once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, {
        center: DETROIT_CENTER,
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
        // No tile layer by design — see the header note.
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Redraw parcels when the set or the selection changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      const map = mapRef.current;
      if (cancelled || !map) return;

      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      if (!parcels.length) return;

      const features = parcels
        .filter(p => p.geometry)
        .map(p => ({ type: 'Feature' as const, properties: { id: p.id }, geometry: p.geometry as any }));

      const group = L.geoJSON({ type: 'FeatureCollection', features } as any, {
        style: (feature: any) => {
          const isSelected = feature?.properties?.id === selectedId;
          return {
            color: isSelected ? ACCENT : 'rgba(255,255,255,0.34)',
            weight: isSelected ? 2.4 : 0.9,
            fillColor: isSelected ? ACCENT : '#ffffff',
            fillOpacity: isSelected ? 0.22 : 0.045,
          };
        },
        onEachFeature: (feature: any, lyr: any) => {
          lyr.on('click', () => {
            const hit = parcels.find(p => p.id === feature?.properties?.id);
            if (hit) selectRef.current(hit);
          });
          lyr.on('mouseover', () => lyr.setStyle?.({ weight: 2, color: '#FFCE8A' }));
          lyr.on('mouseout', () => {
            const isSelected = feature?.properties?.id === selectedId;
            lyr.setStyle?.({ weight: isSelected ? 2.4 : 0.9, color: isSelected ? ACCENT : 'rgba(255,255,255,0.34)' });
          });
        },
      }).addTo(map);

      layerRef.current = group;
      try {
        const bounds = group.getBounds();
        if (bounds?.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
      } catch { /* single degenerate geometry — keep the default view */ }
    })();
    return () => { cancelled = true; };
  }, [parcels, selectedId]);

  return <div ref={hostRef} className="w-full h-full" style={{ background: '#07080B' }} />;
};

// ─── Inspector ───────────────────────────────────────────────────────────────

const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.05] last:border-0">
    <span className={label}>{k}</span>
    <span className="text-[11px] text-white/80 font-semibold tabular-nums text-right">{v}</span>
  </div>
);

const ParcelInspector: React.FC<{ parcel: TerraParcel | null; onOpenPassport?: (parcelId: string) => void; onOpenStudio?: (parcelId: string) => void }> = ({ parcel, onOpenPassport, onOpenStudio }) => {
  const [civic, setCivic] = useState<TerraCivicRecord[]>([]);
  const [loadingCivic, setLoadingCivic] = useState(false);

  useEffect(() => {
    if (!parcel?.parcelNumber) { setCivic([]); return; }
    let cancelled = false;
    setLoadingCivic(true);
    fetchCivicForParcel(parcel.parcelNumber, 40)
      .then(r => { if (!cancelled) setCivic(r); })
      .finally(() => { if (!cancelled) setLoadingCivic(false); });
    return () => { cancelled = true; };
  }, [parcel?.parcelNumber]);

  if (!parcel) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <div className="w-14 h-14 rounded-2xl border border-dashed border-white/15 flex items-center justify-center text-white/20">
          <MapPin size={20} />
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-white/40">Select a parcel</p>
        <p className="text-[11px] text-white/25 leading-relaxed max-w-[220px]">
          Every lot has a record — taxes, permits, and what's happened on the block.
        </p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div>
        <p className="text-sm font-black text-white leading-tight">{parcel.address || 'Unaddressed parcel'}</p>
        <p className="text-[10px] text-white/40 font-mono mt-0.5">PIN {parcel.parcelNumber}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {parcel.zoningDistrict && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                style={{ color: MEASURE, borderColor: `${MEASURE}55`, background: `${MEASURE}18` }}>
            {parcel.zoningDistrict}
          </span>
        )}
        {parcel.isImproved === false && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/15 text-white/45">
            Vacant lot
          </span>
        )}
        {parcel.localHistoricDistrict && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                style={{ color: '#E8B33D', borderColor: '#E8B33D55', background: '#E8B33D18' }}>
            Historic district
          </span>
        )}
      </div>

      <div className={`${card} p-3`}>
        <Row k="Lot" v={parcel.frontageFt && parcel.depthFt
          ? `${fmtNum(parcel.frontageFt)} × ${fmtNum(parcel.depthFt)} ft`
          : fmtNum(parcel.lotSqFt, ' sqft')} />
        <Row k="Assessed" v={fmtMoney(parcel.assessedValue)} />
        <Row k="Taxable" v={fmtMoney(parcel.taxableValue)} />
        <Row k="Last sale" v={parcel.lastSalePrice
          ? `${fmtMoney(parcel.lastSalePrice)} · ${fmtDate(parcel.lastSaleDate)}`
          : fmtDate(parcel.lastSaleDate)} />
        <Row k="Year built" v={parcel.yearBuilt ? String(parcel.yearBuilt) : '—'} />
        {parcel.floorAreaSqFt ? <Row k="Floor area" v={fmtNum(parcel.floorAreaSqFt, ' sqft')} /> : null}
      </div>

      {/* The vintage stamp — required, not decorative. */}
      <div className="flex items-start gap-2 px-1">
        <Info size={11} className="text-white/25 mt-0.5 shrink-0" />
        <p className="text-[10px] text-white/30 leading-relaxed">{vintageOf(parcel)}</p>
      </div>

      <div className={`${card} p-3`}>
        <p className={`${label} mb-2`}>On this parcel</p>
        {loadingCivic ? (
          <p className="text-[11px] text-white/30">Loading records…</p>
        ) : civic.length === 0 ? (
          <p className="text-[11px] text-white/25 leading-relaxed">
            No civic records ingested for this parcel yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {civic.slice(0, 8).map(r => {
              const meta = LAYERS.find(l => l.id === r.kind);
              return (
                <div key={r.id} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ background: meta?.color || '#6F7689' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white/75 leading-snug">{r.summary}</p>
                    <p className="text-[9px] text-white/30">
                      {r.status ? `${r.status} · ` : ''}
                      {r.occurredAt ? new Date(r.occurredAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'date unknown'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => onOpenPassport?.(parcel.id)}
        className="w-full py-2.5 rounded-xl text-black text-[11px] font-black uppercase tracking-widest transition-all hover:brightness-110"
        style={{ background: ACCENT }}
      >
        <FileText size={12} className="inline mr-1.5 -mt-0.5" />
        Open passport
      </button>

      <button
        onClick={() => onOpenStudio?.(parcel.id)}
        className="w-full py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 text-[11px] font-black uppercase tracking-widest hover:bg-white/[0.1] hover:text-white transition-all"
        title="Model the legal buildable envelope in Parcel Studio"
      >
        <Ruler size={12} className="inline mr-1.5 -mt-0.5" />
        What could go here
      </button>
    </motion.div>
  );
};

// ─── Shell ───────────────────────────────────────────────────────────────────

export const TerraExplorer: React.FC<{ onOpenPassport?: (parcelId: string) => void; onOpenStudio?: (parcelId: string) => void; onBack?: () => void }> = ({ onOpenPassport, onOpenStudio, onBack }) => {
  const [parcels, setParcels] = useState<TerraParcel[]>([]);
  const [selected, setSelected] = useState<TerraParcel | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['PARCELS', 'BLIGHT_TICKET']));
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetchParcelsPage(500)
      .then(setParcels)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleLayer = (id: string) => setActiveLayers(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return parcels;
    return parcels.filter(p =>
      (p.address || '').toLowerCase().includes(needle) ||
      p.parcelNumber.toLowerCase().includes(needle));
  }, [parcels, q]);

  return (
    <div className="h-full flex flex-col bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {onBack && (
            <button onClick={onBack}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0"
              title="Back to Terra">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border"
               style={{ background: `${ACCENT}20`, borderColor: `${ACCENT}40` }}>
            <MapPin size={16} style={{ color: ACCENT }} />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest text-white">Terra</h1>
            <p className="text-[10px] font-bold" style={{ color: ACCENT }}>Detroit · every parcel, public record</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Address or parcel number"
                className="bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-white/25 w-52"
              />
            </div>
            <button onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white/80 transition-colors">
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="h-full grid lg:grid-cols-[180px_minmax(0,1fr)_270px] grid-cols-1 min-h-0">

          {/* Layer rail */}
          <div className="border-r border-white/[0.06] p-4 overflow-y-auto custom-scrollbar hidden lg:block">
            <p className={`${label} mb-3 flex items-center gap-1.5`}><Layers size={11} /> Layers</p>
            <div className="space-y-0.5">
              {LAYERS.map(l => {
                const on = activeLayers.has(l.id);
                return (
                  <button key={l.id} onClick={() => toggleLayer(l.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                      on ? 'text-white' : 'text-white/35 hover:text-white/60'}`}
                    style={on ? { background: `${l.color}18` } : {}}>
                    <span className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: on ? l.color : 'rgba(255,255,255,0.18)' }} />
                    <span className="truncate">{l.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <p className={`${label} mb-2`}>Offline</p>
              <div className={`${card} p-3`}>
                <p className="text-[11px] text-white/60 font-semibold">{fmtNum(parcels.length)} parcels loaded</p>
                <button disabled
                  className="w-full mt-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/30 text-[9px] font-black uppercase tracking-widest cursor-not-allowed"
                  title="Neighbourhood packs land with the offline layer.">
                  <Download size={10} className="inline mr-1 -mt-0.5" /> Download pack
                </button>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="relative min-h-[320px] bg-[#07080B]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center gap-3 text-white/30">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                <span className="text-xs">Loading parcels…</span>
              </div>
            ) : visible.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
                <div className="w-16 h-16 rounded-3xl border border-dashed border-white/15 flex items-center justify-center text-white/20">
                  <Building2 size={22} />
                </div>
                <div className="max-w-sm">
                  <p className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">
                    {parcels.length === 0 ? 'No parcels ingested yet' : 'Nothing matches that search'}
                  </p>
                  <p className="text-xs text-white/25 leading-relaxed">
                    {parcels.length === 0
                      ? 'The parcel spine populates from the city’s open data. An admin can run an ingestion pass to load Detroit.'
                      : 'Try an address fragment or a parcel number.'}
                  </p>
                </div>
              </div>
            ) : (
              <ParcelMap parcels={visible} selectedId={selected?.id ?? null} onSelect={setSelected} />
            )}

            {/* Scale / attribution strip */}
            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between pointer-events-none">
              <span className="text-[9px] font-mono text-white/25 tracking-wider">
                {visible.length ? `${fmtNum(visible.length)} parcels shown` : ''}
              </span>
              <span className="text-[9px] font-mono text-white/20 tracking-wider">
                City of Detroit Open Data · as-is
              </span>
            </div>
          </div>

          {/* Inspector */}
          <div className="border-l border-white/[0.06] p-4 overflow-y-auto custom-scrollbar">
            <ParcelInspector parcel={selected} onOpenPassport={onOpenPassport} onOpenStudio={onOpenStudio} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerraExplorer;
