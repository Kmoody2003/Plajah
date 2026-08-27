/**
 * Terra Explorer — the citizen map.
 *
 * Every parcel, whether or not it is for sale, with the civic layers a neighbour
 * actually wants. This is the surface that earns an audience before a single
 * listing exists.
 *
 * ── Two deliberate choices ──────────────────────────────────────────────────
 *
 * 1. NO THIRD-PARTY TILE BASEMAP. Stadia and CARTO both require an API key and
 *    neither free tier is licensed for commercial use — CARTO now watermarks
 *    keyless tiles outright. Terra draws the city's OWN street centrelines
 *    instead: same open-data posture as every other layer here, nothing to
 *    licence, street names included, and thin lines on a dark ground is the
 *    plat-drawing look the design wanted anyway. Streets sit in their own pane
 *    BELOW the parcels — the parcels are the subject, streets are context.
 *
 * 2. EVERY FACT CARRIES ITS VINTAGE. Some sources update daily, others are frozen
 *    years back. The inspector renders `retrievedAt` and the observed/estimated
 *    flag alongside the value, never a bare number.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  MapPin, Layers, Ruler, Download, Info, RefreshCw,
  FileText, AlertTriangle, Home, Hammer, Landmark, Search, ArrowLeft,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { TerraParcel, TerraCivicRecord, CivicRecordKind } from '../../services/terra/terraTypes';
import { fetchParcelsInBounds, clearParcelCellCache, fetchCivicForParcel } from '../../services/terra/terraService';
import { fetchDetroitStreets, type StreetSegment } from '../../services/terra/detroitAdapter';

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
  /** Fires on every settle of the view (and once on init) — the shell loads parcels for it. */
  onViewport?: (v: { south: number; west: number; north: number; east: number; zoom: number }) => void;
  /** Street basemap on/off — context, toggled independently of the civic layers. */
  showBasemap?: boolean;
  /** City street centrelines for the current viewport. */
  streets?: StreetSegment[];
}> = ({ parcels, selectedId, onSelect, onViewport, showBasemap = true, streets = [] }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const labelsRef = useRef<any[]>([]);
  // Read inside the init effect, which must not re-run when the toggle flips.
  const basemapRef = useRef(showBasemap);
  basemapRef.current = showBasemap;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const viewportRef = useRef(onViewport);
  viewportRef.current = onViewport;
  // Flips when the async init lands, so the redraw effect re-runs. Without it,
  // parcels that arrive BEFORE the map exists bail out of the redraw effect and
  // nothing ever draws (the deps don't change again).
  const [mapReady, setMapReady] = useState(false);

  // Init once.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, {
        center: DETROIT_CENTER,
        zoom: 15,
        zoomControl: true,
        attributionControl: false, // attribution rendered in the footer strip instead
        // Canvas renderer: the viewport loader can put thousands of parcel
        // polygons on screen, which SVG cannot sustain.
        preferCanvas: true,
      });
      // Streets render into their OWN pane, below the parcel pane (400), so the
      // parcels are always on top of the context no matter what order the two
      // async loads happen to finish in.
      map.createPane('terraStreets');
      const streetPane = map.getPane('terraStreets');
      if (streetPane) streetPane.style.zIndex = '350';
      const report = () => {
        const b = map.getBounds();
        viewportRef.current?.({
          south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast(),
          zoom: map.getZoom(),
        });
      };
      map.on('moveend', report);
      report();
      mapRef.current = map;
      // ⚠️ The view animates in, so the container is often 0×0 (or hidden) at
      // init. Leaflet caches that size and the vector renderer then draws
      // NOTHING — black map, working zoom controls. Re-measure whenever the
      // container actually gets laid out.
      // …and re-report the viewport once real bounds exist: the init-time report
      // fires against a 0×0 container, whose degenerate bounds load ~nothing.
      ro = new ResizeObserver(() => { try { map.invalidateSize(false); report(); } catch { /* mid-teardown */ } });
      ro.observe(hostRef.current);
      // RO and moveend are frame-timed, and frames stall for hidden/animating
      // panes — plain timers always run, so re-measure once layout settles.
      const remeasure = () => { try { map.invalidateSize(false); report(); } catch { /* mid-teardown */ } };
      timers = [setTimeout(remeasure, 350), setTimeout(remeasure, 1400)];
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      for (const t of timers) clearTimeout(t);
      labelsRef.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      setMapReady(false);
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
          // Tuned to sit ON TOP of the basemap, not compete with it: a hairline
          // at 0.34 alpha vanished over CARTO's grey streets. Parcels lead.
          return {
            color: isSelected ? ACCENT : 'rgba(255,236,214,0.66)',
            weight: isSelected ? 2.6 : 1,
            fillColor: isSelected ? ACCENT : '#FFD9A8',
            fillOpacity: isSelected ? 0.3 : 0.1,
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
      // Size may still be stale from an animated-in mount — re-measure so the
      // renderer isn't drawing into a cached 0×0 viewport. Deliberately NO
      // fitBounds here: parcels now follow the viewport, so fitting to them
      // would fight every pan.
      try { map.invalidateSize(false); } catch { /* mid-teardown */ }
    })();
    return () => { cancelled = true; };
  }, [parcels, selectedId, mapReady]);

  // Streets layer (Terra's basemap) — city centrelines, drawn under the parcels
  // with one label per distinct street name so the view is orientable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      const map = mapRef.current;
      if (cancelled || !map) return;

      if (tileRef.current) { map.removeLayer(tileRef.current); tileRef.current = null; }
      for (const t of labelsRef.current) { try { map.removeLayer(t); } catch { /* already gone */ } }
      labelsRef.current = [];
      if (!showBasemap || !streets.length) return;

      const group = L.geoJSON(
        { type: 'FeatureCollection', features: streets.map(s => ({ type: 'Feature' as const, properties: { name: s.name }, geometry: s.geometry as any })) } as any,
        { pane: 'terraStreets', style: { color: 'rgba(150,170,190,0.5)', weight: 1.1 }, interactive: false },
      ).addTo(map);

      // Label each street once — 39k segments would otherwise stack thousands
      // of identical tooltips on top of each other.
      const labelled = new Set<string>();
      for (const s of streets) {
        if (!s.name || labelled.has(s.name) || labelled.size >= 40) continue;
        const line = s.geometry?.type === 'LineString' ? (s.geometry as any).coordinates
          : s.geometry?.type === 'MultiLineString' ? (s.geometry as any).coordinates?.[0] : null;
        const mid = Array.isArray(line) && line.length ? line[Math.floor(line.length / 2)] : null;
        if (!mid) continue;
        labelled.add(s.name);
        labelsRef.current.push(
          L.tooltip({ permanent: true, direction: 'center', className: 'terra-street-label', opacity: 1 })
            .setLatLng([mid[1], mid[0]]).setContent(s.name).addTo(map));
      }
      tileRef.current = group;
    })();
    return () => { cancelled = true; };
  }, [streets, showBasemap, mapReady]);

  // Bring a selection made from the sidebar list into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = parcels.find(x => x.id === selectedId);
    if (!p || p.centroidLat === undefined || p.centroidLng === undefined) return;
    try {
      if (!map.getBounds().contains([p.centroidLat, p.centroidLng])) {
        map.panTo([p.centroidLat, p.centroidLng]);
      }
    } catch { /* mid-teardown */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
  const [zoomedOut, setZoomedOut] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['PARCELS', 'BLIGHT_TICKET']));
  const [showBasemap, setShowBasemap] = useState(true);
  const [streets, setStreets] = useState<StreetSegment[]>([]);
  const [q, setQ] = useState('');

  // Viewport-driven loading: the map reports every settled view; we debounce,
  // gate on zoom (a city-wide read would be ~378k docs), and fetch by geohash
  // cell — cached per cell in terraService, so panning back is free.
  const MIN_PARCEL_ZOOM = 14;
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewport = useRef<{ south: number; west: number; north: number; east: number; zoom: number } | null>(null);

  const loadViewport = useCallback((immediate = false) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const vp = lastViewport.current;
      if (!vp) return;
      if (vp.zoom < MIN_PARCEL_ZOOM) { setZoomedOut(true); setLoading(false); return; }
      setZoomedOut(false);
      setLoading(true);
      fetchParcelsInBounds(vp)
        .then(setParcels)
        .finally(() => setLoading(false));
      // Streets come straight from the city layer (server-side spatial filter),
      // independent of the parcel read so one slow source can't block the other.
      fetchDetroitStreets(vp).then(setStreets).catch(() => { /* context only */ });
    }, immediate ? 0 : 450);
  }, []);

  const handleViewport = useCallback((v: { south: number; west: number; north: number; east: number; zoom: number }) => {
    lastViewport.current = v;
    loadViewport();
  }, [loadViewport]);

  const load = useCallback(() => {
    clearParcelCellCache();
    loadViewport(true);
  }, [loadViewport]);

  useEffect(() => () => { if (viewportTimer.current) clearTimeout(viewportTimer.current); }, []);

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

            {/* Basemap is context, not data — so it toggles separately from the
                civic layers, and off is a legitimate way to read the parcels. */}
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <button onClick={() => setShowBasemap(v => !v)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                  showBasemap ? 'text-white' : 'text-white/35 hover:text-white/60'}`}
                style={showBasemap ? { background: 'rgba(255,255,255,0.07)' } : {}}
                title="Street basemap — © OpenStreetMap contributors, © CARTO">
                <span className="w-2 h-2 rounded-sm shrink-0"
                      style={{ background: showBasemap ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)' }} />
                <span className="truncate">Streets</span>
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <p className={`${label} mb-2`}>Offline</p>
              <div className={`${card} p-3`}>
                <p className="text-[11px] text-white/60 font-semibold">{fmtNum(parcels.length)} parcels in view</p>
                <button disabled
                  className="w-full mt-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/30 text-[9px] font-black uppercase tracking-widest cursor-not-allowed"
                  title="Neighbourhood packs land with the offline layer.">
                  <Download size={10} className="inline mr-1 -mt-0.5" /> Download pack
                </button>
              </div>
            </div>
          </div>

          {/* Map — always mounted: the viewport drives the parcel loading. */}
          <div className="relative min-h-[320px] bg-[#07080B]">
            <ParcelMap parcels={visible} selectedId={selected?.id ?? null} onSelect={setSelected} onViewport={handleViewport} showBasemap={showBasemap} streets={streets} />

            {loading && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/10 text-white/50 pointer-events-none">
                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                <span className="text-[10px] font-semibold uppercase tracking-widest">Loading parcels</span>
              </div>
            )}
            {!loading && zoomedOut && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/10 text-white/50 pointer-events-none">
                <span className="text-[10px] font-semibold uppercase tracking-widest">Zoom in to load parcels</span>
              </div>
            )}

            {/* Scale / attribution strip */}
            <div className="absolute bottom-2 left-3 right-3 z-[500] flex items-center justify-between pointer-events-none">
              <span className="text-[9px] font-mono text-white/25 tracking-wider">
                {visible.length ? `${fmtNum(visible.length)} parcels in view` : ''}
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
