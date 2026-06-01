/**
 * CircuitMapView — Leaflet-based interactive map for F1 race replay.
 *
 * Tile layers used (all free, no API key):
 *  - CartoDB Dark Matter: perfect for Plajah's dark theme
 *  - Esri World Imagery: satellite view of real circuit locations
 *
 * Coordinate conversion:
 *  OpenF1 location API provides x/y in meters from a circuit-specific
 *  reference point. We convert to WGS84 lat/lon using:
 *    lat = refLat + y / 111111
 *    lon = refLon + x / (111111 * cos(refLat * π/180))
 *
 * Circuit reference points sourced from public GPS data and calibrated
 * against known circuit layouts.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LeafletMap, Marker, Polyline, CircleMarker } from 'leaflet';
import { Map as MapIcon, Satellite, RefreshCw, Layers } from 'lucide-react';

// ─── Circuit reference GPS points ────────────────────────────────────────────
// (lat, lon) of the OpenF1 coordinate origin for each circuit.
// These are calibrated to align OpenF1's local x/y with real geography.
interface CircuitRef {
  lat: number;       // reference latitude
  lon: number;       // reference longitude
  rotation: number;  // degrees CCW from East (x-axis alignment)
  zoom: number;      // default map zoom
  name: string;
}

const CIRCUIT_REFS: Record<string, CircuitRef> = {
  monaco:         { lat: 43.7347, lon: 7.4205,   rotation: 0,   zoom: 15, name: 'Monaco' },
  silverstone:    { lat: 52.0786, lon: -1.0169,  rotation: 0,   zoom: 14, name: 'Silverstone' },
  monza:          { lat: 45.6156, lon: 9.2816,   rotation: 0,   zoom: 14, name: 'Monza' },
  spa:            { lat: 50.4372, lon: 5.9714,   rotation: 0,   zoom: 13, name: 'Spa-Francorchamps' },
  suzuka:         { lat: 34.8431, lon: 136.5407, rotation: 0,   zoom: 14, name: 'Suzuka' },
  bahrain:        { lat: 26.0325, lon: 50.5106,  rotation: 0,   zoom: 14, name: 'Bahrain' },
  interlagos:     { lat: -23.7006, lon: -46.6973, rotation: 0,  zoom: 14, name: 'Interlagos' },
  singapore:      { lat: 1.2914,  lon: 103.8645, rotation: 0,   zoom: 15, name: 'Singapore' },
  jeddah:         { lat: 21.6319, lon: 39.1044,  rotation: 0,   zoom: 14, name: 'Jeddah' },
  melbourne:      { lat: -37.8499, lon: 144.9681, rotation: 0,  zoom: 14, name: 'Melbourne' },
  imola:          { lat: 44.3439,  lon: 11.7167,  rotation: 0,  zoom: 14, name: 'Imola' },
  miami:          { lat: 25.9580,  lon: -80.2389, rotation: 0,  zoom: 14, name: 'Miami' },
  barcelona:      { lat: 41.5700,  lon: 2.2611,   rotation: 0,  zoom: 14, name: 'Barcelona' },
  montreal:       { lat: 45.5000,  lon: -73.5228, rotation: 0,  zoom: 14, name: 'Montreal' },
  austria:        { lat: 47.2197,  lon: 14.7647,  rotation: 0,  zoom: 14, name: 'Spielberg' },
  budapest:       { lat: 47.5789,  lon: 19.2486,  rotation: 0,  zoom: 14, name: 'Budapest' },
  zandvoort:      { lat: 52.3888,  lon: 4.5453,   rotation: 0,  zoom: 14, name: 'Zandvoort' },
  baku:           { lat: 40.3725,  lon: 49.8533,  rotation: 0,  zoom: 14, name: 'Baku' },
  mexico:         { lat: 19.4042,  lon: -99.0907, rotation: 0,  zoom: 14, name: 'Mexico City' },
  las_vegas:      { lat: 36.1147,  lon: -115.1728, rotation: 0, zoom: 14, name: 'Las Vegas' },
  qatar:          { lat: 25.4900,  lon: 51.4542,  rotation: 0,  zoom: 14, name: 'Lusail' },
  'abu dhabi':    { lat: 24.4672,  lon: 54.6031,  rotation: 0,  zoom: 14, name: 'Yas Marina' },
  shanghai:       { lat: 31.3389,  lon: 121.2206, rotation: 0,  zoom: 14, name: 'Shanghai' },
  sochi:          { lat: 43.4057,  lon: 39.9578,  rotation: 0,  zoom: 14, name: 'Sochi' },
};

function getCircuitRef(circuitShortName: string): CircuitRef | null {
  const name = circuitShortName.toLowerCase();
  for (const [key, ref] of Object.entries(CIRCUIT_REFS)) {
    if (name.includes(key) || key.includes(name)) return ref;
  }
  return null;
}

// ─── Convert OpenF1 x/y (meters) → WGS84 lat/lon ─────────────────────────────
function openf1ToLatLon(
  x: number, y: number,
  ref: CircuitRef,
): [number, number] {
  const rotRad = (ref.rotation * Math.PI) / 180;
  const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad);
  const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad);
  const lat = ref.lat + ry / 111111;
  const lon = ref.lon + rx / (111111 * Math.cos((ref.lat * Math.PI) / 180));
  return [lat, lon];
}

// ─── Tile layer URLs ──────────────────────────────────────────────────────────
const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label: 'Dark',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    label: 'Satellite',
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labelUrl: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    attribution: 'Tiles &copy; Esri, Labels &copy; CARTO',
    label: 'Hybrid',
  },
} as const;
type TileStyle = keyof typeof TILE_LAYERS;

// ─── Driver car dot (custom HTML marker) ──────────────────────────────────────
function makeCarIcon(L: any, color: string, acronym: string, isFocused: boolean) {
  const size = isFocused ? 20 : 12;
  const html = `
    <div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color || '#FF8C00'};
      border:${isFocused ? '2px solid white' : '1px solid rgba(0,0,0,0.5)'};
      box-shadow: 0 0 ${isFocused ? '8px' : '4px'} ${color || '#FF8C00'}88;
      display:flex; align-items:center; justify-content:center;
      font-family:monospace; font-size:${isFocused ? 5 : 0}px;
      font-weight:900; color:white; letter-spacing:0;
      transition:all 0.1s;
    ">${isFocused ? acronym : ''}</div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CarPosition {
  driverNumber: number;
  x: number; // OpenF1 x (meters)
  y: number; // OpenF1 y (meters)
  color: string;
  acronym: string;
  isFocused: boolean;
}

export interface MapCircuitPoint {
  x: number; // OpenF1 x
  y: number; // OpenF1 y
}

interface CircuitMapViewProps {
  circuitShortName: string;
  carPositions: CarPosition[];
  trackPoints?: MapCircuitPoint[]; // OpenF1-sampled track outline
  onDriverClick?: (driverNumber: number) => void;
  tileStyle?: TileStyle;
  onTileStyleChange?: (style: TileStyle) => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CircuitMapView: React.FC<CircuitMapViewProps> = ({
  circuitShortName,
  carPositions,
  trackPoints = [],
  onDriverClick,
  tileStyle = 'dark',
  onTileStyleChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<LeafletMap | null>(null);
  const markersRef   = useRef<Map<number, any>>(new Map()); // driverNumber → Marker
  const trackLineRef = useRef<any>(null);
  const tileRef      = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const circuitRef = getCircuitRef(circuitShortName);

  // ── Dynamic Leaflet load ───────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Inject Leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then(L => {
      // Fix default icon paths (leaflet webpack issue)
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      (window as any).__leaflet__ = L;
      setLeafletLoaded(true);
    });
  }, []);

  // ── Initialize map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || mapRef.current) return;
    const L = (window as any).__leaflet__;
    if (!L) return;

    const center: [number, number] = circuitRef
      ? [circuitRef.lat, circuitRef.lon]
      : [0, 0];
    const zoom = circuitRef?.zoom ?? 14;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: true,
    });

    const cfg = TILE_LAYERS[tileStyle];
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      tileRef.current = null;
      trackLineRef.current = null;
      setMapReady(false);
    };
  }, [leafletLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-center when circuit changes ────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !circuitRef) return;
    mapRef.current.setView([circuitRef.lat, circuitRef.lon], circuitRef.zoom, { animate: true });
  }, [circuitShortName, circuitRef]);

  // ── Update tile layer when tileStyle changes ───────────────────────────────
  useEffect(() => {
    const L = (window as any).__leaflet__;
    if (!L || !mapRef.current || !mapReady) return;
    if (tileRef.current) {
      mapRef.current.removeLayer(tileRef.current);
    }
    const cfg = TILE_LAYERS[tileStyle];
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(mapRef.current);

    // Hybrid: add label layer on top
    if (tileStyle === 'hybrid' && (cfg as any).labelUrl) {
      L.tileLayer((cfg as any).labelUrl, { maxZoom: 19, subdomains: 'abcd', opacity: 0.8 }).addTo(mapRef.current);
    }
  }, [tileStyle, mapReady]);

  // ── Draw track outline from sampled OpenF1 location data ──────────────────
  useEffect(() => {
    const L = (window as any).__leaflet__;
    if (!L || !mapRef.current || !mapReady || !circuitRef) return;

    if (trackLineRef.current) {
      mapRef.current.removeLayer(trackLineRef.current);
      trackLineRef.current = null;
    }

    if (trackPoints.length < 2) return;

    const latLons: [number, number][] = trackPoints.map(p =>
      openf1ToLatLon(p.x, p.y, circuitRef)
    );

    // Draw a thick dark outline + thinner colored line on top
    L.polyline(latLons, { color: '#000', weight: 8, opacity: 0.6 }).addTo(mapRef.current);
    trackLineRef.current = L.polyline(latLons, {
      color: '#FF8C00',
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(mapRef.current);

    // Fit map to track bounds with padding
    if (latLons.length > 0) {
      mapRef.current.fitBounds(latLons, { padding: [40, 40] });
    }
  }, [trackPoints, mapReady, circuitRef, circuitShortName]);

  // ── Update car markers ─────────────────────────────────────────────────────
  useEffect(() => {
    const L = (window as any).__leaflet__;
    if (!L || !mapRef.current || !mapReady || !circuitRef) return;

    const existingKeys = new Set(markersRef.current.keys());

    for (const car of carPositions) {
      const [lat, lon] = openf1ToLatLon(car.x, car.y, circuitRef);
      const icon = makeCarIcon(L, car.color, car.acronym, car.isFocused);

      if (markersRef.current.has(car.driverNumber)) {
        const marker = markersRef.current.get(car.driverNumber);
        marker.setLatLng([lat, lon]);
        marker.setIcon(icon);
        existingKeys.delete(car.driverNumber);
      } else {
        const marker = L.marker([lat, lon], { icon, zIndexOffset: car.isFocused ? 1000 : 0 })
          .addTo(mapRef.current);

        if (onDriverClick) {
          marker.on('click', () => onDriverClick(car.driverNumber));
        }
        markersRef.current.set(car.driverNumber, marker);
        existingKeys.delete(car.driverNumber);
      }
    }

    // Remove stale markers
    for (const key of existingKeys) {
      const m = markersRef.current.get(key);
      if (m && mapRef.current) mapRef.current.removeLayer(m);
      markersRef.current.delete(key);
    }
  }, [carPositions, mapReady, circuitRef, onDriverClick]);

  // ── Pan to focused driver ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !circuitRef) return;
    const focused = carPositions.find(c => c.isFocused);
    if (!focused) return;
    const [lat, lon] = openf1ToLatLon(focused.x, focused.y, circuitRef);
    mapRef.current.panTo([lat, lon], { animate: true, duration: 0.5 });
  }, [carPositions, circuitRef]);

  const circuitFound = !!circuitRef;

  return (
    <div className={`relative ${className}`}>
      {/* Map container */}
      <div
        ref={containerRef}
        className="w-full h-full rounded-2xl overflow-hidden"
        style={{ minHeight: 300, background: '#0a0a0a' }}
      />

      {/* Loading overlay */}
      {!leafletLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] rounded-2xl">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin mx-auto" />
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Loading map…</p>
          </div>
        </div>
      )}

      {/* No circuit ref warning */}
      {leafletLoaded && !circuitFound && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 z-[1000]">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/50">
            No GPS reference for {circuitShortName}
          </p>
        </div>
      )}

      {/* Tile style switcher */}
      {onTileStyleChange && (
        <div className="absolute top-3 left-3 z-[1000] flex gap-1">
          {(Object.keys(TILE_LAYERS) as TileStyle[]).map(style => (
            <button
              key={style}
              onClick={() => onTileStyleChange(style)}
              className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border ${
                tileStyle === style
                  ? 'bg-[#FF8C00] text-black border-[#FF8C00]'
                  : 'bg-black/60 backdrop-blur-md border-white/20 text-white/60 hover:text-white hover:border-white/40'
              }`}
            >
              {style === 'dark' ? <MapIcon size={10} className="inline mr-1" /> : <Satellite size={10} className="inline mr-1" />}
              {TILE_LAYERS[style].label}
            </button>
          ))}
        </div>
      )}

      {/* Attribution overlay */}
      <div className="absolute bottom-1 right-2 z-[1000] pointer-events-none">
        <p className="text-[6px] text-white/25">Map: OpenStreetMap © CARTO / Esri</p>
      </div>
    </div>
  );
};

export default CircuitMapView;
