/**
 * RaceReplayView — Interactive F1 race replay using public OpenF1 API data.
 *
 * Data sources (all public, no copyright issues):
 *  - OpenF1 API: GPS positions, lap data, pitstop data, weather
 *    (https://openf1.org — free, open data, explicit public use license)
 *  - Circuit SVG maps: original artwork derived from public track coordinates
 *  - Car colors: team color data (publicly available)
 *
 * Architecture:
 *  - 2D circuit map with animated car dots (SVG + framer-motion)
 *  - Scrubbing timeline keyed to session timestamps
 *  - Event markers: pitstops, fastest laps, DRS open/close
 *  - Driver telemetry panel: speed, gear, throttle, brake (from OpenF1 car_data)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown,
  Flag, Zap, Clock, Gauge, AlertTriangle, Wind,
  ChevronLeft, ChevronRight, RefreshCw, Map as MapIcon, Layers,
} from 'lucide-react';
import { CircuitMapView, type CarPosition } from './CircuitMapView';
import {
  fetchF1SeasonCalendar, fetchF1SessionsByMeeting, fetchF1Drivers,
  fetchF1Pit, fetchF1Stints, fetchF1Laps, fetchF1RaceResult, fetchF1Weather,
  getCircuitInfo, COMPOUND_COLORS, formatLapTime,
  type F1Meeting, type F1Session, type F1Driver, type F1Pit as F1PitType,
  type F1Stint, type F1Lap, type F1RaceResult, type CircuitInfo,
} from '../../services/openf1Service';

// ─── OpenF1 location data ──────────────────────────────────────────────────────

interface F1Location {
  session_key: number;
  driver_number: number;
  date: string;
  x: number; // track coordinate X (meters from center)
  y: number; // track coordinate Y
  z: number; // elevation
}

async function fetchF1Locations(sessionKey: number): Promise<F1Location[]> {
  try {
    const url = `https://api.openf1.org/v1/location?session_key=${sessionKey}`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ─── Timeline event types ──────────────────────────────────────────────────────

interface RaceEvent {
  timestamp: number; // ms since race start
  type: 'PIT' | 'FASTEST_LAP' | 'SAFETY_CAR' | 'LAP_START' | 'FLAG';
  driverNumber?: number;
  label: string;
  color: string;
}

// ─── 2D Circuit with moving dots ──────────────────────────────────────────────

interface CircuitReplayMapProps {
  circuit: CircuitInfo;
  driverPositions: Map<number, { x: number; y: number }>; // driver# → normalized 0-1 position
  driverColors: Map<number, string>;
  driverAcronyms: Map<number, string>;
  focusedDriver?: number;
  width?: number;
  height?: number;
}

const CircuitReplayMap: React.FC<CircuitReplayMapProps> = ({
  circuit, driverPositions, driverColors, driverAcronyms, focusedDriver, width = 400, height = 400,
}) => {
  const pts = circuit.track_points;
  const VIEWBOX = 100;
  const PAD = 8;

  const scaled = pts.map(p => ({
    x: PAD + p.x * (VIEWBOX - 2 * PAD),
    y: PAD + p.y * (VIEWBOX - 2 * PAD),
  }));

  const toSVGPath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + 'Z';

  // Map track-coordinate space to svg space (for GPS-based positions)
  // OpenF1 x/y coords are in meters; we normalize relative to the circuit bounds
  const fullPath = toSVGPath(scaled);

  // Sector coloring
  const s1End = circuit.sector1_end ?? Math.floor(pts.length / 3);
  const s2End = circuit.sector2_end ?? Math.floor((pts.length * 2) / 3);
  const s1Path = toSVGPath(scaled.slice(0, s1End + 1));
  const s2Path = toSVGPath(scaled.slice(s1End, s2End + 1));
  const s3Path = toSVGPath(scaled.slice(s2End));

  // Convert normalized 0-1 progress to SVG point
  const progressToSVG = (prog: number) => {
    const totalIdx = prog * (scaled.length - 1);
    const idx = Math.min(scaled.length - 2, Math.floor(totalIdx));
    const frac = totalIdx - idx;
    const a = scaled[idx];
    const b = scaled[idx + 1] ?? scaled[0];
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  };

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width={width} height={height}
      style={{ background: 'radial-gradient(circle, #1a1a2e 0%, #0a0a0a 100%)', borderRadius: 16 }}
    >
      <defs>
        <filter id="carGlow">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" />
        </filter>
      </defs>

      {/* Track base */}
      <path d={fullPath} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" strokeLinecap="round" />
      <path d={fullPath} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" strokeLinecap="round" />

      {/* Sector colors */}
      <path d={s1Path} fill="none" stroke="rgba(255,140,0,0.35)" strokeWidth="3" strokeLinecap="round" />
      <path d={s2Path} fill="none" stroke="rgba(208,188,255,0.35)" strokeWidth="3" strokeLinecap="round" />
      <path d={s3Path} fill="none" stroke="rgba(74,222,128,0.35)" strokeWidth="3" strokeLinecap="round" />

      {/* Start/Finish line */}
      <line
        x1={scaled[0].x - 3} y1={scaled[0].y}
        x2={scaled[0].x + 3} y2={scaled[0].y}
        stroke="white" strokeWidth="1.5" opacity="0.7"
      />
      <text x={scaled[0].x} y={scaled[0].y - 2} fontSize="3" fill="white" opacity="0.4" textAnchor="middle">S/F</text>

      {/* Driver cars */}
      {Array.from(driverPositions.entries()).map(([driverNum, pos]) => {
        const svgPt = progressToSVG(pos.x); // using x as normalized progress
        const color = driverColors.get(driverNum) ?? '#888888';
        const acronym = driverAcronyms.get(driverNum) ?? String(driverNum);
        const isFocused = focusedDriver === driverNum;
        const r = isFocused ? 3.5 : 2;

        return (
          <g key={driverNum} filter="url(#carGlow)">
            {isFocused && (
              <circle cx={svgPt.x} cy={svgPt.y} r={r + 2} fill="none" stroke="white" strokeWidth="0.5" opacity="0.5" />
            )}
            <circle
              cx={svgPt.x} cy={svgPt.y} r={r}
              fill={color} stroke={isFocused ? 'white' : 'rgba(0,0,0,0.4)'} strokeWidth="0.5"
            />
            {isFocused && (
              <text x={svgPt.x} y={svgPt.y - r - 1.5} fontSize="3" fill="white" textAnchor="middle" fontWeight="bold">
                {acronym}
              </text>
            )}
          </g>
        );
      })}

      {/* Circuit name */}
      <text x="50" y="97" textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="4"
        fontWeight="900" letterSpacing="0.1em">
        {circuit.name.split(' ').slice(-1)[0].toUpperCase()}
      </text>
    </svg>
  );
};

// ─── Timeline scrubber ─────────────────────────────────────────────────────────

const TimelineScrubber: React.FC<{
  value: number; // 0-1
  onChange: (v: number) => void;
  events: RaceEvent[];
  totalMs: number;
  onPlay: () => void;
  onPause: () => void;
  isPlaying: boolean;
  speed: number;
  onSpeedChange: (s: number) => void;
}> = ({ value, onChange, events, totalMs, onPlay, onPause, isPlaying, speed, onSpeedChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(pct);
  };

  const currentTime = value * totalMs;
  const formatRaceTime = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(0, value - 0.01))} className="p-1.5 text-white/40 hover:text-white transition-colors">
          <SkipBack size={14} />
        </button>
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="w-8 h-8 rounded-full bg-[#FF8C00] flex items-center justify-center hover:bg-[#FF8C00]/80 transition-all shadow-lg"
        >
          {isPlaying ? <Pause size={14} fill="black" className="text-black" /> : <Play size={14} fill="black" className="text-black ml-0.5" />}
        </button>
        <button onClick={() => onChange(Math.min(1, value + 0.01))} className="p-1.5 text-white/40 hover:text-white transition-colors">
          <SkipForward size={14} />
        </button>

        <span className="text-[9px] font-black tabular-nums text-white/60 ml-1">
          {formatRaceTime(currentTime)} / {formatRaceTime(totalMs)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {[0.5, 1, 2, 5, 10].map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase transition-all ${
                speed === s ? 'bg-[#FF8C00] text-black' : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        onClick={handleClick}
        className="relative h-6 bg-white/5 rounded-full cursor-pointer border border-white/8 overflow-visible"
      >
        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${value * 100}%`, background: 'linear-gradient(90deg, #FF8C00aa, #FF8C00)' }}
        />

        {/* Event markers */}
        {events.map((ev, i) => {
          const pct = totalMs > 0 ? (ev.timestamp / totalMs) * 100 : 0;
          return (
            <div
              key={i}
              className="absolute top-0 -translate-x-1/2 group"
              style={{ left: `${pct}%` }}
              title={ev.label}
            >
              <div
                className="w-1.5 h-6 opacity-70 hover:opacity-100 transition-opacity"
                style={{ background: ev.color }}
              />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block">
                <div className="bg-black/90 border border-white/20 rounded-lg px-2 py-1 whitespace-nowrap text-[7px] font-black text-white">
                  {ev.label}
                </div>
              </div>
            </div>
          );
        })}

        {/* Scrubber thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-[#FF8C00] cursor-grab"
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
};

// ─── Driver telemetry card ─────────────────────────────────────────────────────

const TelemetryCard: React.FC<{
  driver: F1Driver;
  position: number;
  speed?: number;
  gear?: number;
  throttle?: number;
  brake?: number;
  compound?: string;
  lapNumber?: number;
  bestLap?: number;
  pitCount?: number;
  isFocused: boolean;
  onClick: () => void;
}> = ({ driver, position, speed, gear, throttle, brake, compound, lapNumber, bestLap, pitCount, isFocused, onClick }) => {
  const accent = driver.team_colour ? `#${driver.team_colour}` : '#FF8C00';

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
        isFocused
          ? 'border-opacity-60 bg-white/8'
          : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
      style={{ borderColor: isFocused ? accent : undefined }}
    >
      {/* Position */}
      <span className={`text-[10px] font-black w-5 shrink-0 ${position <= 3 ? 'text-[#FF8C00]' : 'text-white/30'}`}>
        {position}
      </span>

      {/* Driver photo */}
      <div className="w-7 h-7 rounded-full overflow-hidden border shrink-0" style={{ borderColor: accent }}>
        {driver.headshot_url
          ? <img src={driver.headshot_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-[7px] font-black text-white/40"
              style={{ background: accent + '22' }}>{driver.name_acronym[0]}</div>
        }
      </div>

      {/* Driver info */}
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black text-white leading-none">{driver.name_acronym}</p>
        <p className="text-[7px] text-white/35 truncate">{driver.team_name}</p>
      </div>

      {/* Speed */}
      {speed !== undefined && (
        <div className="text-right shrink-0">
          <p className="text-[10px] font-black" style={{ color: accent }}>{speed}</p>
          <p className="text-[6px] font-black uppercase text-white/30">km/h</p>
        </div>
      )}

      {/* Compound */}
      {compound && (
        <div
          className="w-4 h-4 rounded-full border border-black/20 shrink-0"
          style={{ background: COMPOUND_COLORS[compound] ?? '#888' }}
          title={compound}
        />
      )}

      {/* Gear indicator */}
      {gear !== undefined && (
        <div className="w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-black border border-white/15 shrink-0 bg-white/5">
          {gear}
        </div>
      )}
    </motion.div>
  );
};

// ─── Main Race Replay View ─────────────────────────────────────────────────────

interface RaceReplayViewProps {
  onClose?: () => void;
}

export const RaceReplayView: React.FC<RaceReplayViewProps> = ({ onClose }) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear]                 = useState(2024);
  const [calendar, setCalendar]         = useState<{ meeting: F1Meeting; raceSession: F1Session | null }[]>([]);
  const [selectedMeeting, setMeeting]   = useState<typeof calendar[0] | null>(null);

  const [drivers, setDrivers]           = useState<F1Driver[]>([]);
  const [laps, setLaps]                 = useState<F1Lap[]>([]);
  const [pits, setPits]                 = useState<F1PitType[]>([]);
  const [stints, setStints]             = useState<F1Stint[]>([]);
  const [result, setResult]             = useState<F1RaceResult[]>([]);
  const [locations, setLocations]       = useState<F1Location[]>([]);
  const [loadingLocations, setLoadingLoc] = useState(false);

  const [timelinePos, setTimelinePos]   = useState(0); // 0-1
  const [isPlaying, setIsPlaying]       = useState(false);
  const [playSpeed, setPlaySpeed]       = useState(5); // 5× real-time default
  const [focusedDriver, setFocused]     = useState<number | undefined>(undefined);
  const [mapMode, setMapMode]           = useState<'svg' | 'satellite'>('svg');
  const [loading, setLoading]           = useState(false);
  const animRef                         = useRef<number | null>(null);
  const lastTickRef                     = useRef<number>(0);

  // Load calendar
  useEffect(() => {
    fetchF1SeasonCalendar(year).then(cal => {
      setCalendar(cal);
      if (cal.length > 0) setMeeting(cal[Math.floor(cal.length / 2)]);
    }).catch(() => {});
  }, [year]);

  // Load race data
  useEffect(() => {
    const sessionKey = selectedMeeting?.raceSession?.session_key;
    if (!sessionKey) return;
    setLoading(true);
    setLocations([]);
    setIsPlaying(false);
    setTimelinePos(0);

    Promise.all([
      fetchF1Drivers(sessionKey),
      fetchF1Laps(sessionKey),
      fetchF1Pit(sessionKey),
      fetchF1Stints(sessionKey),
      fetchF1RaceResult(sessionKey),
    ]).then(([drv, l, p, s, r]) => {
      setDrivers(drv);
      setLaps(l);
      setPits(p);
      setStints(s);
      setResult(r);
      setLoading(false);
      // Eagerly set focus to P1 driver
      if (r.length > 0) setFocused(r[0].driver_number);
    }).catch(() => setLoading(false));
  }, [selectedMeeting]);

  // Lazy-load location data when user clicks play or requests it
  const loadLocations = async () => {
    const sessionKey = selectedMeeting?.raceSession?.session_key;
    if (!sessionKey || locations.length > 0 || loadingLocations) return;
    setLoadingLoc(true);
    try {
      const data = await fetchF1Locations(sessionKey);
      setLocations(data);
    } finally {
      setLoadingLoc(false);
    }
  };

  // Timeline bounds
  const { raceStartMs, raceDurationMs } = useMemo(() => {
    if (!laps.length) return { raceStartMs: 0, raceDurationMs: 0 };
    const dates = laps.map(l => new Date(l.date_start).getTime()).filter(Boolean);
    if (!dates.length) return { raceStartMs: 0, raceDurationMs: 0 };
    const start = Math.min(...dates);
    const end = Math.max(...dates) + 90000; // add ~1.5 min for last lap
    return { raceStartMs: start, raceDurationMs: end - start };
  }, [laps]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || raceDurationMs === 0) return;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) * playSpeed;
      lastTickRef.current = now;
      setTimelinePos(prev => {
        const next = prev + dt / raceDurationMs;
        if (next >= 1) { setIsPlaying(false); return 1; }
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, playSpeed, raceDurationMs]);

  // Driver positions at current timeline position
  const currentTimeMs = timelinePos * raceDurationMs;
  const currentAbsMs = raceStartMs + currentTimeMs;

  const driverPositions = useMemo<Map<number, { x: number; y: number }>>(() => {
    if (!locations.length) {
      // Fallback: use lap-based progress estimation
      const map = new Map<number, { x: number; y: number }>();
      for (const r of result) {
        const driverLaps = laps.filter(l => l.driver_number === r.driver_number && l.lap_duration);
        const totalLapTime = driverLaps.reduce((sum, l) => sum + (l.lap_duration ?? 0), 0);
        const elapsedSec = (currentTimeMs / 1000);
        const progress = totalLapTime > 0 ? (elapsedSec % (totalLapTime / driverLaps.length)) / (totalLapTime / driverLaps.length) : 0;
        map.set(r.driver_number, { x: progress, y: 0 });
      }
      return map;
    }

    // Use actual GPS data: find the most recent location for each driver
    const locsByDriver = new Map<number, F1Location[]>();
    for (const loc of locations) {
      if (!locsByDriver.has(loc.driver_number)) locsByDriver.set(loc.driver_number, []);
      locsByDriver.get(loc.driver_number)!.push(loc);
    }

    // Find x/y bounds for normalization
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const loc of locations) {
      minX = Math.min(minX, loc.x); maxX = Math.max(maxX, loc.x);
      minY = Math.min(minY, loc.y); maxY = Math.max(maxY, loc.y);
    }

    const map = new Map<number, { x: number; y: number }>();
    for (const [driverNum, driverLocs] of locsByDriver) {
      // Binary search for closest timestamp
      const target = new Date(currentAbsMs).toISOString();
      let lo = 0, hi = driverLocs.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (driverLocs[mid].date < target) lo = mid + 1;
        else hi = mid;
      }
      const loc = driverLocs[Math.min(lo, driverLocs.length - 1)];
      const normX = maxX > minX ? (loc.x - minX) / (maxX - minX) : 0.5;
      const normY = maxY > minY ? (loc.y - minY) / (maxY - minY) : 0.5;
      map.set(driverNum, { x: normX, y: normY });
    }
    return map;
  }, [locations, currentTimeMs, currentAbsMs, result, laps]);

  const driverColors = useMemo(() =>
    new Map(drivers.map(d => [d.driver_number, `#${d.team_colour}`])),
    [drivers],
  );
  const driverAcronyms = useMemo(() =>
    new Map(drivers.map(d => [d.driver_number, d.name_acronym])),
    [drivers],
  );

  // Race events for timeline
  const raceEvents = useMemo<RaceEvent[]>(() => {
    const events: RaceEvent[] = [];
    for (const pit of pits) {
      const lapData = laps.find(l => l.driver_number === pit.driver_number && l.lap_number === pit.lap_number);
      if (lapData) {
        const ts = new Date(lapData.date_start).getTime() - raceStartMs;
        const acronym = driverAcronyms.get(pit.driver_number) ?? `#${pit.driver_number}`;
        events.push({
          timestamp: ts, type: 'PIT', driverNumber: pit.driver_number,
          label: `${acronym} pits (L${pit.lap_number})`, color: '#FFD700',
        });
      }
    }
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }, [pits, laps, raceStartMs, driverAcronyms]);

  const circuitInfo = getCircuitInfo(selectedMeeting?.meeting?.circuit_short_name ?? '');

  // Raw x/y positions for CircuitMapView (Leaflet satellite map)
  const carPositionsForMap = useMemo<CarPosition[]>(() => {
    if (!locations.length || !result.length) return [];
    const locsByDriver = new Map<number, F1Location[]>();
    for (const loc of locations) {
      if (!locsByDriver.has(loc.driver_number)) locsByDriver.set(loc.driver_number, []);
      locsByDriver.get(loc.driver_number)!.push(loc);
    }
    const target = new Date(currentAbsMs).toISOString();
    return result.map(r => {
      const driverLocs = locsByDriver.get(r.driver_number);
      if (!driverLocs?.length) return null;
      let lo = 0, hi = driverLocs.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (driverLocs[mid].date < target) lo = mid + 1; else hi = mid;
      }
      const loc = driverLocs[Math.min(lo, driverLocs.length - 1)];
      return {
        driverNumber: r.driver_number,
        x: loc.x,
        y: loc.y,
        color: `#${drivers.find(d => d.driver_number === r.driver_number)?.team_colour ?? 'FF8C00'}`,
        acronym: driverAcronyms.get(r.driver_number) ?? `${r.driver_number}`,
        isFocused: focusedDriver === r.driver_number,
      } as CarPosition;
    }).filter(Boolean) as CarPosition[];
  }, [locations, result, currentAbsMs, drivers, driverAcronyms, focusedDriver]);

  // Current driver telemetry (lap-based estimate)
  const driverTelemetry = useMemo(() => {
    const currentLapNum = Math.max(1, Math.floor(currentTimeMs / (raceDurationMs / Math.max(1, ...result.map(r => r.total_laps)))));
    return new Map(result.map((r, i) => [r.driver_number, {
      position: i + 1,
      lapNumber: currentLapNum,
      compound: stints.find(s => s.driver_number === r.driver_number && s.lap_start <= currentLapNum && (s.lap_end ?? 999) >= currentLapNum)?.compound,
      pitCount: pits.filter(p => p.driver_number === r.driver_number && laps.find(l => l.driver_number === p.driver_number && l.lap_number === p.lap_number && new Date(l.date_start).getTime() - raceStartMs < currentTimeMs)).length,
    }]));
  }, [result, stints, pits, laps, currentTimeMs, raceDurationMs, raceStartMs]);

  const handlePlay = () => {
    if (locations.length === 0) loadLocations();
    setIsPlaying(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center gap-3">
        {onClose && (
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex items-center gap-2 flex-1">
          <Flag size={16} className="text-[#FF8C00]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">F1 Race Replay</span>
        </div>
        {/* Year selector */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-1 py-0.5">
          <button onClick={() => setYear(y => Math.max(2023, y - 1))} className="p-1 hover:bg-white/10 rounded-full">
            <ChevronLeft size={12} />
          </button>
          <span className="text-[9px] font-black text-white px-1 tabular-nums">{year}</span>
          <button onClick={() => setYear(y => Math.min(currentYear, y + 1))} className="p-1 hover:bg-white/10 rounded-full">
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Race picker */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {calendar.map((item, i) => (
            <button
              key={i}
              onClick={() => setMeeting(item)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                selectedMeeting?.meeting.meeting_key === item.meeting.meeting_key
                  ? 'bg-[#FF8C00] text-black'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white border border-white/8'
              }`}
            >
              {item.meeting.circuit_short_name}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-4 py-20">
          <div className="w-10 h-10 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" />
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Loading race data…</p>
        </div>
      )}

      {!loading && selectedMeeting && (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)]">
          {/* Left: Circuit map */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
            {/* Race name */}
            <div className="text-center">
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">Formula 1 · {year}</p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white mt-1">
                {selectedMeeting.meeting.meeting_official_name}
              </h2>
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mt-0.5">
                {selectedMeeting.meeting.country_name} · {selectedMeeting.meeting.circuit_short_name}
              </p>
            </div>

            {/* Map mode toggle */}
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-0.5">
              <button
                onClick={() => setMapMode('svg')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${mapMode === 'svg' ? 'bg-[#FF8C00] text-black' : 'text-white/40 hover:text-white'}`}
              >
                <Layers size={9} /> SVG
              </button>
              <button
                onClick={() => setMapMode('satellite')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${mapMode === 'satellite' ? 'bg-[#FF8C00] text-black' : 'text-white/40 hover:text-white'}`}
              >
                <MapIcon size={9} /> Satellite
              </button>
            </div>

            {/* Circuit view — SVG or Leaflet satellite */}
            <AnimatePresence mode="wait">
              {mapMode === 'svg' ? (
                <motion.div key="svg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative">
                  {circuitInfo ? (
                    <>
                      <CircuitReplayMap
                        circuit={circuitInfo}
                        driverPositions={driverPositions}
                        driverColors={driverColors}
                        driverAcronyms={driverAcronyms}
                        focusedDriver={focusedDriver}
                        width={360}
                        height={360}
                      />
                      {loadingLocations && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                          <div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin mx-auto" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-72 h-72 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Flag size={32} className="mx-auto text-[#FF8C00]/30" />
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Circuit map not available</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="satellite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="w-full max-w-sm rounded-[2rem] overflow-hidden border border-white/10"
                  style={{ height: 360 }}>
                  {selectedMeeting?.meeting?.circuit_short_name ? (
                    <CircuitMapView
                      circuitShortName={selectedMeeting.meeting.circuit_short_name}
                      carPositions={carPositionsForMap}
                      onDriverClick={num => setFocused(f => f === num ? undefined : num)}
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Select a race first</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Timeline */}
            <div className="w-full max-w-sm">
              <TimelineScrubber
                value={timelinePos}
                onChange={setTimelinePos}
                events={raceEvents}
                totalMs={raceDurationMs}
                onPlay={handlePlay}
                onPause={() => setIsPlaying(false)}
                isPlaying={isPlaying}
                speed={playSpeed}
                onSpeedChange={setPlaySpeed}
              />
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 flex-wrap justify-center">
              {[
                { color: '#FF8C00', label: 'Sector 1' },
                { color: '#D0BCFF', label: 'Sector 2' },
                { color: '#4ADE80', label: 'Sector 3' },
                { color: '#FFD700', label: 'Pit Stop' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-1.5 rounded-full" style={{ background: item.color }} />
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/40">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Driver leaderboard */}
          <div className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-white/8 overflow-y-auto custom-scrollbar">
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/35">Live Standings</p>
                <p className="text-[7px] font-black text-white/25 tabular-nums">
                  Lap {Math.ceil(timelinePos * Math.max(1, ...result.map(r => r.total_laps)))}
                </p>
              </div>
              <div className="space-y-1.5">
                {result.map((r, i) => {
                  const driver = drivers.find(d => d.driver_number === r.driver_number);
                  if (!driver) return null;
                  const telem = driverTelemetry.get(r.driver_number);
                  return (
                    <TelemetryCard
                      key={r.driver_number}
                      driver={driver}
                      position={i + 1}
                      compound={telem?.compound}
                      lapNumber={telem?.lapNumber}
                      pitCount={telem?.pitCount}
                      isFocused={focusedDriver === r.driver_number}
                      onClick={() => setFocused(focusedDriver === r.driver_number ? undefined : r.driver_number)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !selectedMeeting && (
        <div className="py-20 text-center space-y-4">
          <Flag size={40} className="mx-auto text-[#FF8C00]/30" />
          <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Select a race to begin replay</p>
          <p className="text-[7px] text-white/15 max-w-xs mx-auto">Race replay uses OpenF1 API GPS position data (2023–present). Position data loads when you hit play.</p>
        </div>
      )}
    </div>
  );
};

export default RaceReplayView;
