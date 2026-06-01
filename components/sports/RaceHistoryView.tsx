import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, ChevronRight, Flag, Clock, Zap,
  RefreshCw, AlertCircle, Calendar, Trophy, User,
  Play, Pause, SkipBack, SkipForward, Gauge, Wind, Radio,
} from 'lucide-react';
const RaceReplayView = lazy(() => import('./RaceReplayView').then(m => ({ default: m.RaceReplayView })));
import {
  fetchF1Meetings, fetchF1SeasonCalendar, fetchF1Drivers,
  fetchF1Laps, fetchF1Pit, fetchF1Stints, fetchF1RaceResult, fetchF1Weather,
  getCircuitInfo, F1_CIRCUITS, COMPOUND_COLORS, formatLapTime,
  type F1Meeting, type F1Session, type F1Driver, type F1Lap,
  type F1Pit as F1PitType, type F1Stint, type F1RaceResult, type F1WeatherData,
} from '../../services/openf1Service';
import { fetchF1SeasonCalendar as fetchCalendar } from '../../services/openf1Service';

// ─── 2D Circuit Map ────────────────────────────────────────────────────────────

interface CircuitMapProps {
  circuitShortName: string;
  highlightSector?: 1 | 2 | 3;
  animateProgress?: number; // 0-1
  driverColors?: Map<number, string>; // driver# → team color
  driverPositions?: Map<number, number>; // driver# → 0-1 track progress
}

const CircuitMap: React.FC<CircuitMapProps> = ({
  circuitShortName,
  highlightSector,
  animateProgress,
  driverColors,
  driverPositions,
}) => {
  const circuit = getCircuitInfo(circuitShortName);

  if (!circuit) {
    return (
      <div className="w-full aspect-square rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Flag size={24} className="mx-auto text-white/20" />
          <p className="text-[8px] font-black uppercase tracking-widest text-white/25">
            {circuitShortName}
          </p>
        </div>
      </div>
    );
  }

  const pts = circuit.track_points;
  const VIEWBOX = 110;
  const PAD = 10;

  // Scale points to [PAD, VIEWBOX-PAD]
  const scaled = pts.map(p => ({
    x: PAD + p.x * (VIEWBOX - 2 * PAD),
    y: PAD + p.y * (VIEWBOX - 2 * PAD),
  }));

  const toPath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';

  const fullPath = toPath(scaled);

  // Sector paths
  const s1End = circuit.sector1_end ?? Math.floor(pts.length / 3);
  const s2End = circuit.sector2_end ?? Math.floor((pts.length * 2) / 3);
  const sector1 = toPath(scaled.slice(0, s1End + 1));
  const sector2 = toPath(scaled.slice(s1End, s2End + 1));
  const sector3 = toPath(scaled.slice(s2End));

  // Driver dot position on track
  const getDriverPt = (progress: number) => {
    const idx = Math.min(scaled.length - 2, Math.floor(progress * (scaled.length - 1)));
    const frac = progress * (scaled.length - 1) - idx;
    const a = scaled[idx];
    const b = scaled[idx + 1] ?? scaled[0];
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  };

  // Start/finish line
  const sfPt = scaled[0];
  const sfPt2 = scaled[1];
  const angle = Math.atan2(sfPt2.y - sfPt.y, sfPt2.x - sfPt.x) * (180 / Math.PI) + 90;

  return (
    <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" />
        </filter>
      </defs>

      {/* Track shadow */}
      <path d={fullPath} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Base track */}
      <path d={fullPath} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* Sector highlights */}
      {!highlightSector || highlightSector === 1 ? (
        <path d={sector1} fill="none" stroke={highlightSector === 1 ? '#FF8C00' : 'rgba(255,140,0,0.4)'} strokeWidth="2.5" strokeLinecap="round" />
      ) : null}
      {!highlightSector || highlightSector === 2 ? (
        <path d={sector2} fill="none" stroke={highlightSector === 2 ? '#D0BCFF' : 'rgba(208,188,255,0.4)'} strokeWidth="2.5" strokeLinecap="round" />
      ) : null}
      {!highlightSector || highlightSector === 3 ? (
        <path d={sector3} fill="none" stroke={highlightSector === 3 ? '#4ADE80' : 'rgba(74,222,128,0.4)'} strokeWidth="2.5" strokeLinecap="round" />
      ) : null}

      {/* Start/finish line */}
      <line
        x1={sfPt.x - 3 * Math.cos((angle * Math.PI) / 180)} y1={sfPt.y - 3 * Math.sin((angle * Math.PI) / 180)}
        x2={sfPt.x + 3 * Math.cos((angle * Math.PI) / 180)} y2={sfPt.y + 3 * Math.sin((angle * Math.PI) / 180)}
        stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8"
      />

      {/* Driver dots */}
      {driverPositions && Array.from(driverPositions.entries()).map(([driverNum, progress]) => {
        const pt = getDriverPt(progress);
        const color = driverColors?.get(driverNum) ?? '#888888';
        return (
          <g key={driverNum}>
            <circle cx={pt.x} cy={pt.y} r="2.5" fill={`#${color.replace('#', '')}`} filter="url(#glow)" opacity="0.9" />
            <circle cx={pt.x} cy={pt.y} r="2.5" fill="none" stroke="white" strokeWidth="0.4" opacity="0.6" />
          </g>
        );
      })}

      {/* Circuit name */}
      <text x="50%" y="98" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="5" fontWeight="900" letterSpacing="0.15em" fontFamily="monospace">
        {circuit.name.toUpperCase().slice(0, 25)}
      </text>
    </svg>
  );
};

// ─── Tyre strategy visualization ───────────────────────────────────────────────

const TyreStrategy: React.FC<{ stints: F1Stint[]; totalLaps: number; driverName: string }> = ({
  stints, totalLaps, driverName,
}) => (
  <div className="space-y-1">
    <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mb-1">{driverName}</p>
    <div className="flex gap-px h-5 rounded-lg overflow-hidden">
      {stints.map((s, i) => {
        const lapSpan = (s.lap_end ?? totalLaps) - s.lap_start + 1;
        const widthPct = Math.max(2, (lapSpan / totalLaps) * 100);
        const color = COMPOUND_COLORS[s.compound] ?? '#888888';
        return (
          <div
            key={i}
            style={{ width: `${widthPct}%`, background: color, opacity: color === '#FFFFFF' ? 0.85 : 1 }}
            title={`${s.compound} laps ${s.lap_start}–${s.lap_end ?? totalLaps}`}
            className="relative group flex-shrink-0"
          >
            <div className="absolute inset-x-0 -top-8 hidden group-hover:block">
              <div className="bg-black/80 text-[7px] font-black px-2 py-1 rounded-lg whitespace-nowrap text-center border border-white/20">
                {s.compound} · L{s.lap_start}–{s.lap_end}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── Pitstop waterfall ────────────────────────────────────────────────────────

const PitstopWaterfall: React.FC<{ pits: F1PitType[]; drivers: F1Driver[]; totalLaps: number }> = ({
  pits, drivers, totalLaps,
}) => {
  const driverMap = new Map(drivers.map(d => [d.driver_number, d]));
  const sortedPits = [...pits].sort((a, b) => a.lap_number - b.lap_number);

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
      {sortedPits.map((pit, i) => {
        const driver = driverMap.get(pit.driver_number);
        const widthPct = (pit.lap_number / totalLaps) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="shrink-0 flex items-center gap-2 w-28">
              {driver?.headshot_url && (
                <img src={driver.headshot_url} className="w-5 h-5 rounded-full object-cover" alt="" loading="lazy" />
              )}
              <div>
                <p className="text-[8px] font-black text-white leading-none">{driver?.name_acronym ?? `#${pit.driver_number}`}</p>
                <p className="text-[7px] text-white/30">Lap {pit.lap_number}</p>
              </div>
            </div>
            <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden relative">
              <div
                className="absolute top-0 left-0 h-full w-2 rounded-full bg-[#FF8C00]"
                style={{ left: `${widthPct}%`, transform: 'translateX(-50%)' }}
              />
            </div>
            <p className="shrink-0 text-[8px] font-black text-white/60 w-12 text-right">
              {pit.pit_duration ? `${pit.pit_duration.toFixed(1)}s` : '--'}
            </p>
          </div>
        );
      })}
    </div>
  );
};

// ─── Lap time chart (fastest laps per driver, radial) ─────────────────────────
// Uses recharts BarChart

const LapTimeBar: React.FC<{ result: F1RaceResult[]; maxToShow?: number }> = ({ result, maxToShow = 10 }) => {
  const top = result
    .filter(r => r.best_lap_time)
    .sort((a, b) => (a.best_lap_time ?? 999) - (b.best_lap_time ?? 999))
    .slice(0, maxToShow);
  if (!top.length) return null;

  const fastest = top[0].best_lap_time!;

  return (
    <div className="space-y-2">
      {top.map((r, i) => {
        const gap = ((r.best_lap_time ?? 0) - fastest);
        const pct = fastest > 0 ? Math.min(100, ((r.best_lap_time ?? fastest) / (fastest * 1.05)) * 100) : 0;
        return (
          <div key={r.driver_number} className="flex items-center gap-2">
            <span className={`text-[7px] font-black w-4 shrink-0 ${i === 0 ? 'text-[#FF8C00]' : 'text-white/25'}`}>{i + 1}</span>
            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-white/10"
              style={{ background: `#${r.team_colour}` }}>
              {r.headshot_url && <img src={r.headshot_url} className="w-full h-full object-cover" alt="" loading="lazy" />}
            </div>
            <span className="text-[8px] font-black text-white w-8 shrink-0">{r.name_acronym}</span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: i === 0 ? '#FF8C00' : `#${r.team_colour}` }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="text-[8px] font-black text-white/50 w-16 text-right shrink-0">
              {i === 0 ? formatLapTime(r.best_lap_time) : `+${gap.toFixed(3)}s`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Race History View ────────────────────────────────────────────────────

interface RaceHistoryViewProps {
  tab?: string; // 'F1' | 'NASCAR' | 'INDYCAR'
  initialYear?: number;
}

type RaceTab = 'RESULT' | 'CIRCUIT' | 'LAPS' | 'STRATEGY' | 'PITSTOPS' | 'WEATHER' | 'REPLAY';

const RACE_TABS: { id: RaceTab; label: string }[] = [
  { id: 'RESULT',   label: 'Race Result' },
  { id: 'CIRCUIT',  label: 'Circuit Map' },
  { id: 'LAPS',     label: 'Lap Times' },
  { id: 'STRATEGY', label: 'Tyre Strategy' },
  { id: 'PITSTOPS', label: 'Pitstops' },
  { id: 'WEATHER',  label: 'Weather' },
  { id: 'REPLAY',   label: '▶ Live Replay' },
];

export const RaceHistoryView: React.FC<RaceHistoryViewProps> = ({ tab = 'F1', initialYear }) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear]           = useState(initialYear ?? currentYear);
  const [calendar, setCalendar]   = useState<{ meeting: F1Meeting; raceSession: F1Session | null }[]>([]);
  const [selectedMeeting, setMeeting] = useState<typeof calendar[0] | null>(null);
  const [activeTab, setActiveTab] = useState<RaceTab>('RESULT');

  const [drivers, setDrivers]     = useState<F1Driver[]>([]);
  const [result, setResult]       = useState<F1RaceResult[]>([]);
  const [laps, setLaps]           = useState<F1Lap[]>([]);
  const [pits, setPits]           = useState<F1PitType[]>([]);
  const [stints, setStints]       = useState<F1Stint[]>([]);
  const [weather, setWeather]     = useState<F1WeatherData[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadingCalendar, setLoadingCal] = useState(false);
  const [error, setError]         = useState(false);

  // Load calendar for year
  useEffect(() => {
    if (tab !== 'F1') return; // OpenF1 only covers F1
    setLoadingCal(true);
    setCalendar([]);
    setMeeting(null);
    fetchF1SeasonCalendar(year)
      .then(cal => {
        setCalendar(cal);
        setLoadingCal(false);
        if (cal.length > 0) setMeeting(cal[0]);
      })
      .catch(() => setLoadingCal(false));
  }, [year, tab]);

  // Load race data when meeting changes
  useEffect(() => {
    const sessionKey = selectedMeeting?.raceSession?.session_key;
    if (!sessionKey) return;
    setLoading(true);
    setError(false);
    Promise.all([
      fetchF1RaceResult(sessionKey),
      fetchF1Drivers(sessionKey),
      fetchF1Pit(sessionKey),
      fetchF1Stints(sessionKey),
      fetchF1Weather(sessionKey),
    ]).then(([res, drv, p, s, w]) => {
      setResult(res);
      setDrivers(drv);
      setPits(p);
      setStints(s);
      setWeather(w);
      setLoading(false);
    }).catch(() => { setLoading(false); setError(true); });
  }, [selectedMeeting]);

  const totalLaps = useMemo(() => Math.max(0, ...result.map(r => r.total_laps)), [result]);
  const driverColors = useMemo(() =>
    new Map(drivers.map(d => [d.driver_number, `#${d.team_colour}`])),
    [drivers],
  );

  // Weather summary
  const avgWeather = useMemo(() => {
    if (!weather.length) return null;
    const mid = weather[Math.floor(weather.length / 2)];
    return mid;
  }, [weather]);

  if (tab !== 'F1') {
    return (
      <div className="py-16 text-center space-y-4">
        <Zap size={32} className="mx-auto text-[#FF8C00]/40" />
        <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">
          {tab} Deep Dive — Opening lap data via ESPN Racing
        </p>
        <p className="text-[8px] text-white/15">OpenF1 API only covers Formula 1. {tab} race data shown in the main race view above.</p>
      </div>
    );
  }

  const circuitName = selectedMeeting?.meeting?.circuit_short_name ?? '';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Year + Race selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-1 py-1">
          <button
            onClick={() => setYear(y => Math.max(2023, y - 1))}
            className="p-1.5 hover:bg-white/10 rounded-full transition-all"
          ><ChevronLeft size={14} /></button>
          <span className="text-[10px] font-black text-white px-2 tabular-nums">{year}</span>
          <button
            onClick={() => setYear(y => Math.min(currentYear, y + 1))}
            className="p-1.5 hover:bg-white/10 rounded-full transition-all"
          ><ChevronRight size={14} /></button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-1">
          {loadingCalendar
            ? [...Array(5)].map((_, i) => <div key={i} className="w-20 h-8 rounded-xl bg-white/5 animate-pulse shrink-0" />)
            : calendar.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setMeeting(item)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    selectedMeeting?.meeting.meeting_key === item.meeting.meeting_key
                      ? 'bg-[#FF8C00] text-black'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white border border-white/8'
                  }`}
                >
                  {item.meeting.circuit_short_name}
                </button>
              ))
          }
        </div>
      </div>

      {/* Selected race header */}
      {selectedMeeting && (
        <div className="p-5 bg-white/[0.03] border border-white/8 rounded-[2rem] flex items-center gap-5">
          <div className="shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Flag size={24} className="text-[#FF8C00]" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1">Formula 1 · {year}</p>
            <h3 className="text-xl font-black uppercase tracking-tight text-white leading-none">
              {selectedMeeting.meeting.meeting_official_name}
            </h3>
            <div className="flex items-center gap-4 mt-2 text-[8px] font-black text-white/40 uppercase tracking-widest">
              <span className="flex items-center gap-1"><Flag size={8} /> {selectedMeeting.meeting.country_name}</span>
              <span className="flex items-center gap-1"><Calendar size={8} />
                {selectedMeeting.raceSession?.date_start
                  ? new Date(selectedMeeting.raceSession.date_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'TBD'}
              </span>
            </div>
          </div>
          {avgWeather && (
            <div className="shrink-0 text-right">
              <p className="text-2xl font-black text-white">{avgWeather.air_temperature?.toFixed(0)}°C</p>
              <p className="text-[7px] font-black uppercase text-white/30 tracking-widest">Air Temp</p>
              <p className="text-[8px] font-black text-white/50 mt-0.5">{avgWeather.track_temperature?.toFixed(0)}°C Track</p>
            </div>
          )}
        </div>
      )}

      {/* Race sub-tabs */}
      {selectedMeeting && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {RACE_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                activeTab === t.id
                  ? 'bg-[#FF8C00] text-black shadow-[0_0_16px_rgba(255,140,0,0.3)]'
                  : 'bg-white/5 text-white/40 border border-white/8 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" />
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Loading race data…</p>
        </div>
      )}
      {error && !loading && (
        <div className="py-12 text-center space-y-3">
          <AlertCircle size={28} className="mx-auto text-white/20" />
          <p className="text-[8px] font-black uppercase text-white/25 tracking-widest">Race data unavailable</p>
          <p className="text-[7px] text-white/15">OpenF1 covers 2023–present. Earlier races use ESPN data.</p>
        </div>
      )}

      {/* Tab content */}
      {!loading && !error && selectedMeeting && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* ── RACE RESULT ── */}
            {activeTab === 'RESULT' && (
              <div className="space-y-2">
                {result.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">No result data available</p>
                  </div>
                )}
                {result.map((r, i) => (
                  <motion.div
                    key={r.driver_number}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                      i === 0 ? 'bg-[#FF8C00]/8 border-[#FF8C00]/25' : 'bg-white/[0.02] border-white/6 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className={`w-6 text-[10px] font-black ${i === 0 ? 'text-[#FF8C00]' : i < 3 ? 'text-white/60' : 'text-white/25'}`}>
                      {r.position}
                    </span>
                    <div
                      className="w-7 h-7 rounded-full overflow-hidden border-2 shrink-0"
                      style={{ borderColor: r.team_colour ? `#${r.team_colour}` : '#444' }}
                    >
                      {r.headshot_url
                        ? <img src={r.headshot_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full bg-white/10 flex items-center justify-center"><User size={10} className="text-white/30" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black uppercase text-white truncate">{r.full_name}</p>
                      <p className="text-[7px] text-white/35 uppercase tracking-widest truncate">{r.team_name}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-right">
                      <div className="hidden sm:block">
                        <p className="text-[8px] font-black text-white/50">{r.pit_count} stops</p>
                        <div className="flex gap-px mt-0.5">
                          {r.compounds_used.map((c, ci) => (
                            <div key={ci} className="w-2.5 h-2.5 rounded-full border border-black/30"
                              style={{ background: COMPOUND_COLORS[c] ?? '#888' }} title={c} />
                          ))}
                        </div>
                      </div>
                      <p className="text-[8px] font-black text-white/60 w-16">{formatLapTime(r.best_lap_time)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* ── CIRCUIT MAP ── */}
            {activeTab === 'CIRCUIT' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-white/[0.03] border border-white/8 rounded-[2rem]">
                  <div className="w-full max-w-xs mx-auto aspect-square">
                    <CircuitMap
                      circuitShortName={circuitName}
                      driverColors={driverColors}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  {(() => {
                    const info = getCircuitInfo(circuitName);
                    if (!info) return <p className="text-[8px] text-white/25 font-black uppercase tracking-widest">Circuit data not available</p>;
                    return (
                      <>
                        <div className="p-5 bg-white/[0.03] border border-white/8 rounded-[2rem] space-y-3">
                          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">Circuit Info</p>
                          <h3 className="text-lg font-black uppercase tracking-tight text-white">{info.name}</h3>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Length', val: `${info.length_km}km` },
                              { label: 'Turns', val: String(info.turns) },
                              { label: 'DRS Zones', val: String(info.drs_zones) },
                            ].map(item => (
                              <div key={item.label} className="text-center p-2 bg-white/5 rounded-xl">
                                <p className="text-[7px] font-black uppercase tracking-widest text-white/30">{item.label}</p>
                                <p className="text-[11px] font-black text-white mt-0.5">{item.val}</p>
                              </div>
                            ))}
                          </div>
                          {info.lap_record && (
                            <div className="flex items-center gap-3 p-3 bg-[#FF8C00]/8 border border-[#FF8C00]/20 rounded-xl">
                              <Trophy size={14} className="text-[#FF8C00] shrink-0" />
                              <div>
                                <p className="text-[7px] font-black uppercase tracking-widest text-[#FF8C00]">Lap Record</p>
                                <p className="text-[9px] font-black text-white">{info.lap_record.time} · {info.lap_record.driver} ({info.lap_record.year})</p>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Sector legend */}
                        <div className="flex gap-3">
                          {[
                            { label: 'Sector 1', color: '#FF8C00' },
                            { label: 'Sector 2', color: '#D0BCFF' },
                            { label: 'Sector 3', color: '#4ADE80' },
                          ].map(s => (
                            <div key={s.label} className="flex items-center gap-1.5">
                              <div className="w-4 h-1.5 rounded-full" style={{ background: s.color }} />
                              <p className="text-[7px] font-black uppercase tracking-widest text-white/40">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── LAP TIMES ── */}
            {activeTab === 'LAPS' && (
              <div className="space-y-4">
                <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                  <Clock size={10} /> Fastest Lap Times
                </h4>
                <LapTimeBar result={result} maxToShow={12} />
              </div>
            )}

            {/* ── TYRE STRATEGY ── */}
            {activeTab === 'STRATEGY' && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 flex-wrap mb-2">
                  {Object.entries(COMPOUND_COLORS).map(([compound, color]) => (
                    <div key={compound} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full border border-black/30" style={{ background: color }} />
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/40">{compound}</p>
                    </div>
                  ))}
                </div>
                {result.slice(0, 15).map(r => {
                  const driverStints = stints.filter(s => s.driver_number === r.driver_number);
                  return (
                    <TyreStrategy
                      key={r.driver_number}
                      stints={driverStints}
                      totalLaps={totalLaps}
                      driverName={r.name_acronym}
                    />
                  );
                })}
              </div>
            )}

            {/* ── PITSTOPS ── */}
            {activeTab === 'PITSTOPS' && (
              <div className="space-y-4">
                <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                  <Gauge size={10} /> Pit Stop Timeline (Lap →)
                </h4>
                <PitstopWaterfall pits={pits} drivers={drivers} totalLaps={totalLaps} />
              </div>
            )}

            {/* ── WEATHER ── */}
            {activeTab === 'WEATHER' && (
              <div className="space-y-4">
                {weather.length === 0 ? (
                  <p className="text-[8px] font-black uppercase text-white/20 tracking-widest">Weather data not available</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Air Temp', val: `${avgWeather?.air_temperature?.toFixed(1)}°C`, icon: <Wind size={16} className="text-[#FF8C00]" /> },
                      { label: 'Track Temp', val: `${avgWeather?.track_temperature?.toFixed(1)}°C`, icon: <Gauge size={16} className="text-[#FF8C00]" /> },
                      { label: 'Humidity', val: `${avgWeather?.humidity?.toFixed(0)}%`, icon: <Wind size={16} className="text-[#FF8C00]" /> },
                      { label: 'Wind', val: `${avgWeather?.wind_speed?.toFixed(1)}m/s`, icon: <Wind size={16} className="text-[#FF8C00]" /> },
                    ].map(item => (
                      <div key={item.label} className="p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] text-center space-y-2">
                        <div className="flex justify-center">{item.icon}</div>
                        <p className="text-xl font-black text-white">{item.val || '—'}</p>
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/30">{item.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── LIVE REPLAY ── */}
            {activeTab === 'REPLAY' && (
              <Suspense fallback={
                <div className="flex items-center justify-center py-16 gap-3">
                  <div className="w-6 h-6 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" />
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Loading replay engine…</p>
                </div>
              }>
                <div className="-mx-5 rounded-2xl overflow-hidden border border-white/8">
                  <RaceReplayView />
                </div>
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
};

export default RaceHistoryView;
