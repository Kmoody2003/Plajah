// ─── Marketing — GeoRadiusPicker ─────────────────────────────────────────────
// The shared "buy by map radius" primitive behind billboards and direct mail
// (and, later, geo-digital + Terra). Owns the map + radius selection only;
// budget/schedule/creative live in the parent Campaign Hub step.
//
// No tile layer yet — same call Terra's TerraExplorer makes (dynamic `import
// 'leaflet'`, no external raster tiles, a plain dark pane) so this needs no API
// key and no network dependency to demo. Swap in a TileLayer when Local Reach
// goes live; nothing else here changes.
//
// See docs/MARKETING_LOCAL_REACH_SPEC.md §2.

import React, { useEffect, useRef, useState } from 'react';
import { estimate as estimateReach, type GeoReachEstimate } from '../../services/marketing/reachEstimateService';
import type { AdChannel, GeoRadius } from '../../services/marketing/campaignTypes';
import { CHANNEL_LABEL } from '../../services/marketing/campaignTypes';

export interface GeoRadiusPickerProps {
  center: { lat: number; lng: number; label?: string };
  radiusMi: number;
  channels: AdChannel[];
  flightDays?: number;
  onChange: (geo: GeoRadius, est: GeoReachEstimate) => void;
  maxMi?: number;
  disabled?: boolean;
}

// Deterministic pseudo-random so DOOH screen pins don't jump on every render.
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MI_TO_METERS = 1609.34;

export default function GeoRadiusPicker({
  center, radiusMi, channels, flightDays = 14, onChange, maxMi = 5, disabled,
}: GeoRadiusPickerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const pinsLayerRef = useRef<any>(null);
  const [est, setEst] = useState<GeoReachEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, {
        center: [center.lat, center.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });
      mapRef.current = map;
      pinsLayerRef.current = L.layerGroup().addTo(map);

      L.circleMarker([center.lat, center.lng], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#FF8C00', fillOpacity: 1,
      }).addTo(map);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced estimate + redraw whenever radius/channels change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const geo: GeoRadius = { center, radiusMi, mode: 'radius' };
      const result = await estimateReach({ geo, channels, flightDays });
      if (cancelled) return;
      setEst(result);
      setLoading(false);
      onChange(geo, result);

      const L = await import('leaflet');
      const map = mapRef.current;
      if (!map) return;

      if (circleRef.current) circleRef.current.remove();
      circleRef.current = L.circle([center.lat, center.lng], {
        radius: radiusMi * MI_TO_METERS,
        color: '#FF8C00', weight: 2, dashArray: '6 5',
        fillColor: '#FF8C00', fillOpacity: 0.08,
      }).addTo(map);
      map.fitBounds(circleRef.current.getBounds(), { padding: [24, 24] });

      // Scatter deterministic DOOH pins inside the radius, seeded off the
      // center + radius so they don't jitter on every re-render.
      pinsLayerRef.current?.clearLayers();
      const screens = result.byChannel.billboard_dooh?.extra?.screens ?? 0;
      if (screens > 0) {
        const seed = mulberry32(Math.round((center.lat * 1000 + center.lng * 1000 + radiusMi * 100)));
        for (let i = 0; i < screens; i++) {
          const angle = seed() * Math.PI * 2;
          const dist = Math.sqrt(seed()) * radiusMi * MI_TO_METERS * 0.92;
          const dLat = (dist * Math.cos(angle)) / 111320;
          const dLng = (dist * Math.sin(angle)) / (111320 * Math.cos((center.lat * Math.PI) / 180));
          L.circleMarker([center.lat + dLat, center.lng + dLng], {
            radius: 5, color: '#fff', weight: 1, fillColor: '#D40055', fillOpacity: 0.9,
          }).addTo(pinsLayerRef.current);
        }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, radiusMi, channels.join(',')]);

  return (
    <div>
      <div
        ref={hostRef}
        className="relative rounded-2xl overflow-hidden border border-white/15"
        style={{ height: 320, background: '#0a0710' }}
      />
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] font-semibold text-white/50">
        {channels.map(ch => (
          <span key={ch} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-[2px] inline-block"
              style={{ background: ch === 'billboard_dooh' ? '#D40055' : '#00DAF3' }}
            />
            {CHANNEL_LABEL[ch]}
            {est?.byChannel[ch] && (
              <span className="text-white/70 tabular-nums">
                {' '}· {est.byChannel[ch]!.units.toLocaleString()}
              </span>
            )}
          </span>
        ))}
        {loading && <span className="text-white/30">estimating…</span>}
      </div>
    </div>
  );
}
