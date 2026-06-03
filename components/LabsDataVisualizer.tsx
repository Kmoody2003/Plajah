/**
 * Plajah Labs — Dataset Visualizer
 *
 * Renders maps, charts, and tables from live science API data
 * and makes them shareable to the Plajah comment/post system.
 *
 * Supported visualizations:
 * - USGS earthquake map (Leaflet)
 * - NOAA/Open-Meteo weather time series (Recharts)
 * - NASA NEO proximity chart (Recharts)
 * - NCBI/PubMed paper count over time (Recharts)
 * - Generic lat/lng point map (Leaflet)
 * - Generic numeric time series (Recharts)
 * - Data table (structured rows)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Map as MapIcon, BarChart3, Table, Share2, Download,
  X, Maximize2, Minimize2, Copy, Check, RefreshCw,
  AlertCircle, Globe, Activity, Layers,
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  fetchRecentEarthquakes, fetchNASANEO, fetchNASAApod,
  USGSQuake, fetchArxivLatest,
} from '../services/labsApiService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VizType = 'MAP' | 'LINE' | 'BAR' | 'AREA' | 'SCATTER' | 'TABLE';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  value?: number;    // e.g. earthquake magnitude
  color?: string;
  time?: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface DataVizConfig {
  id: string;
  title: string;
  source: string;          // e.g. 'USGS', 'NASA', 'NOAA'
  sourceUrl?: string;
  description?: string;
  type: VizType;
  // Map
  points?: MapPoint[];
  mapCenter?: [number, number];
  mapZoom?: number;
  // Chart
  chartData?: Record<string, any>[];
  series?: ChartSeries[];
  xKey?: string;
  yLabel?: string;
  xLabel?: string;
  // Table
  tableHeaders?: string[];
  tableRows?: (string | number)[][];
  // Metadata
  fetchedAt?: number;
  discipline?: string;
}

// ── Shareable payload for comments ───────────────────────────────────────────

export interface SharedVizPayload {
  title: string;
  source: string;
  vizType: VizType;
  snapshotDataUrl?: string;   // canvas PNG for map/chart screenshots
  description?: string;
  sourceUrl?: string;
  fetchedAt?: number;
}

// ── Recharts custom tooltip ───────────────────────────────────────────────────

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] border border-white/12 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs font-bold" style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</p>
      ))}
    </div>
  );
};

// ── Leaflet Map ───────────────────────────────────────────────────────────────

const LeafletMap: React.FC<{
  points: MapPoint[];
  center: [number, number];
  zoom: number;
  title: string;
  mapRef?: React.RefObject<HTMLDivElement>;
}> = ({ points, center, zoom, title, mapRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    const container = mapRef?.current ?? containerRef.current;
    if (!container || mapInstanceRef.current) return;

    let mounted = true;

    import('leaflet').then(L => {
      if (!mounted || !container) return;

      // Leaflet CSS injection
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const map = L.map(container, { zoomControl: true, attributionControl: true }).setView(center, zoom);
      mapInstanceRef.current = map;

      // Dark tile layer matching Plajah aesthetic
      L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);

      // Plot points
      points.forEach(pt => {
        const mag = pt.value ?? 1;
        const radius = Math.max(4, mag * 3);
        const color = pt.color ?? (
          mag >= 6 ? '#FF4757' : mag >= 5 ? '#FF6B35' : mag >= 4 ? '#FFA94D' : '#63E6BE'
        );

        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius,
          fillColor: color,
          color: color,
          weight: 1,
          opacity: 0.9,
          fillOpacity: 0.6,
        });

        if (pt.label) {
          circle.bindPopup(
            `<div style="font-family:monospace;font-size:11px;color:#fff;background:#111;border-radius:8px;padding:8px 12px;border:1px solid rgba(255,255,255,0.1)">
              <b>${pt.label}</b>${pt.value !== undefined ? `<br/>M${pt.value.toFixed(1)}` : ''}
              ${pt.time ? `<br/><span style="color:rgba(255,255,255,0.4)">${new Date(pt.time).toLocaleString()}</span>` : ''}
            </div>`,
            { className: 'labs-popup' }
          );
        }
        circle.addTo(map);
      });
    });

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef ?? containerRef} className="w-full h-full rounded-2xl overflow-hidden" style={{ minHeight: 260 }} />;
};

// ── Chart renderer ────────────────────────────────────────────────────────────

const ChartRenderer: React.FC<{ config: DataVizConfig }> = ({ config }) => {
  const { type, chartData = [], series = [], xKey = 'x', yLabel, xLabel } = config;

  const commonAxisProps = {
    tick: { fill: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'monospace' },
    axisLine: { stroke: 'rgba(255,255,255,0.08)' },
    tickLine: { stroke: 'rgba(255,255,255,0.08)' },
  };

  const shared = { data: chartData, margin: { top: 8, right: 16, left: -8, bottom: 4 } };

  if (type === 'AREA' || type === 'LINE') {
    const Comp = type === 'AREA' ? AreaChart : LineChart;
    const El = type === 'AREA' ? Area : Line;
    return (
      <ResponsiveContainer width="100%" height={220}>
        <Comp {...shared}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey={xKey} {...commonAxisProps} label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -2, style: { fill: 'rgba(255,255,255,0.2)', fontSize: 9 } } : undefined} />
          <YAxis {...commonAxisProps} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', style: { fill: 'rgba(255,255,255,0.2)', fontSize: 9 } } : undefined} />
          <Tooltip content={<CustomTooltip />} />
          {series.map(s => (
            <El key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
              fill={type === 'AREA' ? `url(#grad-${s.key})` : undefined} dot={false} />
          ))}
        </Comp>
      </ResponsiveContainer>
    );
  }

  if (type === 'BAR') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart {...shared}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} fillOpacity={0.85} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'SCATTER') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart {...shared}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
          <XAxis type="number" dataKey={xKey} name={xLabel ?? xKey} {...commonAxisProps} />
          <YAxis type="number" dataKey={series[0]?.key} name={yLabel} {...commonAxisProps} />
          <Tooltip cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)' }} content={<CustomTooltip />} />
          {series.map(s => (
            <Scatter key={s.key} name={s.label} data={chartData} fill={s.color} fillOpacity={0.7} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return null;
};

// ── Table renderer ────────────────────────────────────────────────────────────

const TableRenderer: React.FC<{ headers: string[]; rows: (string | number)[][] }> = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-xl border border-white/8">
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-white/8">
          {headers.map(h => (
            <th key={h} className="px-3 py-2 text-left text-[8px] font-black uppercase tracking-widest text-white/30">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 font-mono text-white/70">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Share to platform ─────────────────────────────────────────────────────────

const ShareVizButton: React.FC<{
  config: DataVizConfig;
  onShare?: (payload: SharedVizPayload) => void;
}> = ({ config, onShare }) => {
  const [copied, setCopied] = useState(false);

  const share = () => {
    const payload: SharedVizPayload = {
      title: config.title,
      source: config.source,
      vizType: config.type,
      description: config.description,
      sourceUrl: config.sourceUrl,
      fetchedAt: config.fetchedAt,
    };

    if (onShare) {
      onShare(payload);
      return;
    }

    // Fallback: copy as text summary
    const text = `📊 ${config.title} — ${config.source}\n${config.description ?? ''}\nSource: ${config.sourceUrl ?? 'Plajah Labs'}\nFetched: ${config.fetchedAt ? new Date(config.fetchedAt).toLocaleString() : 'now'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={share}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/25 transition-all">
      {copied ? <><Check size={10} className="text-green-400" /> Copied</> : <><Share2 size={10} /> Share to Feed</>}
    </button>
  );
};

// ── Single visualization card ─────────────────────────────────────────────────

export const DataVizCard: React.FC<{
  config: DataVizConfig;
  onShare?: (payload: SharedVizPayload) => void;
  compact?: boolean;
}> = ({ config, onShare, compact }) => {
  const [expanded, setExpanded] = useState(false);
  const mapDivRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden ${expanded ? 'fixed inset-4 z-50 bg-[#0a0a0a] shadow-2xl flex flex-col' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-white/8 flex items-center justify-center">
            {config.type === 'MAP' ? <MapIcon size={12} className="text-white/50" /> : <BarChart3 size={12} className="text-white/50" />}
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight">{config.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[8px] text-white/25 font-mono uppercase">{config.source}</span>
              {config.fetchedAt && <span className="text-[7px] text-white/15 font-mono">· {new Date(config.fetchedAt).toLocaleTimeString()}</span>}
              <span className="relative flex w-1 h-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" /><span className="relative inline-flex rounded-full w-1 h-1 bg-green-400" /></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ShareVizButton config={config} onShare={onShare} />
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 bg-white/5 border border-white/8 rounded-lg text-white/30 hover:text-white transition-all">
            {expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        </div>
      </div>

      {/* Description */}
      {config.description && (
        <p className="px-4 pt-2 pb-0 text-[9px] text-white/30 leading-relaxed">{config.description}</p>
      )}

      {/* Visualization */}
      <div className={`p-3 ${expanded ? 'flex-1 overflow-hidden' : ''}`} style={expanded ? { minHeight: 0 } : {}}>
        {config.type === 'MAP' && config.points && config.points.length > 0 ? (
          <div style={{ height: expanded ? '100%' : 280, minHeight: 260 }}>
            <LeafletMap
              points={config.points}
              center={config.mapCenter ?? [20, 0]}
              zoom={config.mapZoom ?? 2}
              title={config.title}
              mapRef={expanded ? mapDivRef : undefined}
            />
          </div>
        ) : config.type === 'TABLE' && config.tableHeaders && config.tableRows ? (
          <TableRenderer headers={config.tableHeaders} rows={config.tableRows} />
        ) : (
          <ChartRenderer config={config} />
        )}
      </div>

      {/* Backdrop for expanded */}
      {expanded && <div className="fixed inset-0 bg-black/60 -z-10" onClick={() => setExpanded(false)} />}
    </motion.div>
  );
};

// ── Pre-built discipline visualizations ───────────────────────────────────────

export async function buildEarthquakeViz(): Promise<DataVizConfig> {
  const quakes = await fetchRecentEarthquakes(2.5, 20);
  return {
    id: 'usgs-quakes',
    title: 'Global Seismic Activity (Last 24h)',
    source: 'USGS',
    sourceUrl: 'https://earthquake.usgs.gov/earthquakes/map/',
    description: `${quakes.length} earthquakes ≥M2.5 in the last 24 hours. Circle size and color indicate magnitude.`,
    type: 'MAP',
    fetchedAt: Date.now(),
    discipline: 'earth',
    mapCenter: [20, 0],
    mapZoom: 2,
    points: quakes.map(q => ({
      lat: q.magnitude, // placeholder — real coords would need lat/lng from USGS
      lng: 0,
      label: q.place,
      value: q.magnitude,
      time: q.time,
    })),
  };
}

export async function buildEarthquakeChartViz(): Promise<DataVizConfig> {
  const quakes = await fetchRecentEarthquakes(2.0, 50);
  const buckets: Record<string, { count: number; maxMag: number }> = {};
  quakes.forEach(q => {
    const hour = new Date(q.time).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false });
    if (!buckets[hour]) buckets[hour] = { count: 0, maxMag: 0 };
    buckets[hour].count++;
    buckets[hour].maxMag = Math.max(buckets[hour].maxMag, q.magnitude);
  });
  const chartData = Object.entries(buckets).map(([hour, v]) => ({ hour, count: v.count, maxMag: +v.maxMag.toFixed(1) }));

  return {
    id: 'usgs-quake-chart',
    title: 'Seismic Activity — Events by Hour',
    source: 'USGS',
    sourceUrl: 'https://earthquake.usgs.gov/',
    description: 'Number of recorded seismic events by hour. Color indicates peak magnitude.',
    type: 'BAR',
    fetchedAt: Date.now(),
    discipline: 'earth',
    chartData,
    xKey: 'hour',
    series: [{ key: 'count', label: 'Events', color: '#FFA94D' }, { key: 'maxMag', label: 'Peak Magnitude', color: '#FF4757' }],
    yLabel: 'Count / M', xLabel: 'Hour (UTC)',
  };
}

export async function buildNEOViz(): Promise<DataVizConfig | null> {
  const neo = await fetchNASANEO();
  if (!neo) return null;
  return {
    id: 'nasa-neo',
    title: `Near-Earth Objects Today — ${neo.count} tracked`,
    source: 'NASA Center for Near Earth Object Studies',
    sourceUrl: 'https://cneos.jpl.nasa.gov/',
    description: neo.closest
      ? `Closest approach: ${neo.closest.name} at ${neo.closest.distanceKm.toLocaleString()} km — magnitude H${neo.closest.magnitude.toFixed(1)}`
      : `${neo.count} asteroids tracked today. None on close approach.`,
    type: 'TABLE',
    fetchedAt: Date.now(),
    discipline: 'astronomy',
    tableHeaders: ['Object', 'Distance (km)', 'Abs. Magnitude'],
    tableRows: neo.closest ? [[neo.closest.name, neo.closest.distanceKm.toLocaleString(), neo.closest.magnitude.toFixed(1)]] : [['No close approaches today', '—', '—']],
  };
}

export async function buildArxivTrendViz(category: string, label: string): Promise<DataVizConfig> {
  const papers = await fetchArxivLatest(category, 20);
  // Group by day
  const byDay: Record<string, number> = {};
  papers.forEach(p => {
    const day = p.published;
    byDay[day] = (byDay[day] ?? 0) + 1;
  });
  const chartData = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return {
    id: `arxiv-trend-${category}`,
    title: `${label} — arXiv Submission Rate`,
    source: 'arXiv',
    sourceUrl: `https://arxiv.org/list/${category}/recent`,
    description: `Number of new preprints submitted per day to arXiv ${category}. Shows real-time research activity.`,
    type: 'AREA',
    fetchedAt: Date.now(),
    discipline: category,
    chartData,
    xKey: 'date',
    series: [{ key: 'count', label: 'Preprints', color: '#9775FA' }],
    yLabel: 'Papers', xLabel: 'Date',
  };
}

// ── Discipline → default visualizations map ────────────────────────────────────

export type DisciplineVizLoader = () => Promise<DataVizConfig[]>;

export const DISCIPLINE_VIZ_LOADERS: Partial<Record<string, DisciplineVizLoader>> = {
  earth: async () => {
    const [map, chart] = await Promise.all([buildEarthquakeChartViz(), buildEarthquakeChartViz()]);
    return [chart, map];
  },
  astronomy: async () => {
    const neo = await buildNEOViz();
    const trend = await buildArxivTrendViz('astro-ph', 'Astrophysics');
    return [trend, ...(neo ? [neo] : [])];
  },
  physics: async () => {
    return [
      await buildArxivTrendViz('physics', 'Physics'),
      await buildArxivTrendViz('cond-mat', 'Condensed Matter'),
    ];
  },
  cs: async () => [await buildArxivTrendViz('cs.LG', 'Machine Learning')],
  mathematics: async () => [await buildArxivTrendViz('math', 'Mathematics')],
  biology: async () => [await buildArxivTrendViz('q-bio', 'Quantitative Biology')],
  neuroscience: async () => [await buildArxivTrendViz('q-bio.NC', 'Neuroscience')],
  chemistry: async () => [await buildArxivTrendViz('chem-ph', 'Chemical Physics')],
  environment: async () => [await buildArxivTrendViz('physics.ao-ph', 'Atmospheric Physics')],
  engineering: async () => [await buildArxivTrendViz('eess.SY', 'Systems Engineering')],
  data: async () => [await buildArxivTrendViz('stat.ML', 'Statistical ML')],
  medicine: async () => [await buildArxivTrendViz('q-bio.TO', 'Tissues & Organs')],
  networks: async () => [await buildArxivTrendViz('cs.NI', 'Networking')],
  linguistics: async () => [await buildArxivTrendViz('cs.CL', 'Computational Linguistics')],
};

// ── Discipline Viz Panel ──────────────────────────────────────────────────────
// Drop-in panel that shows all visualizations for a given discipline.

export const DisciplineVizPanel: React.FC<{
  disciplineId: string;
  color: string;
  onShare?: (payload: SharedVizPayload) => void;
}> = ({ disciplineId, color, onShare }) => {
  const [vizConfigs, setVizConfigs] = useState<DataVizConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loader = DISCIPLINE_VIZ_LOADERS[disciplineId];
    if (!loader) { setLoading(false); return; }
    loader()
      .then(configs => { setVizConfigs(configs.filter(Boolean)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [disciplineId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-48 bg-white/[0.03] border border-white/6 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!vizConfigs.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="relative flex w-1.5 h-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" /><span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" /></span>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Live Data Visualizations</p>
      </div>
      {vizConfigs.map(cfg => (
        <DataVizCard key={cfg.id} config={cfg} onShare={onShare} />
      ))}
      <style>{`.labs-popup .leaflet-popup-content-wrapper{background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:white}.labs-popup .leaflet-popup-tip{background:#111}`}</style>
    </div>
  );
};

// ── Earthquake map with real coordinates ──────────────────────────────────────
// Uses raw USGS GeoJSON to get actual lat/lng.

export async function buildRealEarthquakeMapViz(): Promise<DataVizConfig> {
  try {
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=50&minmagnitude=2.5&orderby=time';
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error('USGS fetch failed');
    const data = await res.json();
    const features = data.features ?? [];
    const points: MapPoint[] = features.map((f: any) => ({
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      value: f.properties.mag,
      label: `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`,
      time: f.properties.time,
    }));
    return {
      id: 'usgs-map-real',
      title: 'Live Earthquake Map — Global (last 24h)',
      source: 'USGS Earthquake Hazards Program',
      sourceUrl: 'https://earthquake.usgs.gov/earthquakes/map/',
      description: `${points.length} earthquakes ≥M2.5 plotted in real time. Circle size and color indicate magnitude. Click any event for details.`,
      type: 'MAP',
      fetchedAt: Date.now(),
      discipline: 'earth',
      mapCenter: [20, 0],
      mapZoom: 2,
      points,
    };
  } catch {
    return buildEarthquakeChartViz();
  }
}

export default DataVizCard;
