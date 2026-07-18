import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Sun, Compass, Ruler, MapPin, Info, ExternalLink, Sunrise, Sunset } from 'lucide-react';
import { TYPE } from '../../src/lib/designSystem';

// ─────────────────────────────────────────────────────────────────────────────
// Sun path / daylighting calculator
//
// Solar position is computed with the NOAA General Solar Position Algorithm
// (Global Monitoring Laboratory) — the same Fourier approximation of the
// equation of time and solar declination used by the NOAA Solar Calculator.
//   https://gml.noaa.gov/grad/solcalc/calcdetails.html
//
// Accuracy is better than ~1 arc-minute for years 1901–2099, which is far
// tighter than any shading-design decision requires.
// ─────────────────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SolarPosition {
  /** Degrees above the horizon. Negative means the sun is down. */
  altitude: number;
  /** Degrees clockwise from true north (0 = N, 90 = E, 180 = S, 270 = W). */
  azimuth: number;
  /** Solar declination for the day, in degrees. */
  declination: number;
  /** Equation of time, in minutes. */
  equationOfTime: number;
  /** Hour angle, in degrees (negative = morning). */
  hourAngle: number;
}

/** Day of year (1–365/366) for a given month (1–12) and day. */
export function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 1);
  const d = Date.UTC(year, month - 1, day);
  return Math.round((d - start) / 86400000) + 1;
}

/**
 * Solar declination + equation of time from the fractional year.
 * NOAA GSPA, expressed in radians internally.
 */
export function solarDayTerms(year: number, doy: number, hour: number) {
  const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  const g = ((2 * Math.PI) / daysInYear) * (doy - 1 + (hour - 12) / 24);

  const eqTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(g)
    - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g)
    - 0.040849 * Math.sin(2 * g)
  );

  const declRad =
    0.006918
    - 0.399912 * Math.cos(g)
    + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g)
    + 0.00148 * Math.sin(3 * g);

  return { eqTime, declination: declRad * DEG, declRad };
}

/**
 * Full solar position for a place and local clock time.
 * @param hour local standard time in decimal hours (13.5 = 13:30)
 * @param tzOffset hours from UTC (e.g. −5 for US Eastern Standard Time)
 */
export function solarPosition(
  lat: number, lon: number, year: number, month: number, day: number,
  hour: number, tzOffset: number,
): SolarPosition {
  const doy = dayOfYear(year, month, day);
  const { eqTime, declination, declRad } = solarDayTerms(year, doy, hour);

  // True solar time (minutes past local midnight), corrected for the
  // longitude offset within the time zone and the equation of time.
  const timeOffset = eqTime + 4 * lon - 60 * tzOffset;
  const tst = hour * 60 + timeOffset;
  let hourAngle = tst / 4 - 180;
  // Wrap into −180…180 so pre-dawn and post-dusk hours behave.
  while (hourAngle < -180) hourAngle += 360;
  while (hourAngle > 180) hourAngle -= 360;

  const latRad = lat * RAD;
  const haRad = hourAngle * RAD;

  const cosZenith = Math.sin(latRad) * Math.sin(declRad)
    + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const altitude = 90 - zenith * DEG;

  // Azimuth measured clockwise from true north, per the NOAA spreadsheet:
  // afternoon (HA > 0) → (A + 180) mod 360, morning → (540 − A) mod 360.
  let azimuth: number;
  const sinZenith = Math.sin(zenith);
  if (Math.abs(sinZenith) < 1e-8 || Math.abs(Math.cos(latRad)) < 1e-8) {
    azimuth = hourAngle > 0 ? 270 : 90;
  } else {
    const cosAz = (Math.sin(latRad) * Math.cos(zenith) - Math.sin(declRad)) / (Math.cos(latRad) * sinZenith);
    const a = Math.acos(Math.max(-1, Math.min(1, cosAz))) * DEG;
    azimuth = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }

  return { altitude, azimuth, declination, equationOfTime: eqTime, hourAngle };
}

/**
 * Sunrise, solar noon and sunset in local decimal hours.
 * Uses the standard 90.833° zenith (refraction + solar disc radius).
 * Returns null sunrise/sunset for polar day or polar night.
 */
export function sunTimes(lat: number, lon: number, year: number, month: number, day: number, tzOffset: number) {
  const doy = dayOfYear(year, month, day);
  const { eqTime, declRad } = solarDayTerms(year, doy, 12);
  const latRad = lat * RAD;

  const noon = (720 - 4 * lon - eqTime + tzOffset * 60) / 60;

  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(latRad) * Math.cos(declRad)) - Math.tan(latRad) * Math.tan(declRad);
  if (cosHa > 1) return { sunrise: null, sunset: null, noon, dayLength: 0 };        // polar night
  if (cosHa < -1) return { sunrise: null, sunset: null, noon, dayLength: 24 };      // midnight sun

  const ha = Math.acos(cosHa) * DEG;
  const sunrise = noon - ha / 15;
  const sunset = noon + ha / 15;
  return { sunrise, sunset, noon, dayLength: sunset - sunrise };
}

const fmtHM = (h: number | null) => {
  if (h == null || !isFinite(h)) return '—';
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { mm = 0; hh += 1; }
  return `${String((hh + 24) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const compass = (az: number) => {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
};

// A few real reference cities so the tool is usable in one click.
const PRESETS: { name: string; lat: number; lon: number; tz: number }[] = [
  { name: 'New York', lat: 40.7128, lon: -74.0060, tz: -5 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, tz: -8 },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, tz: -6 },
  { name: 'London', lat: 51.5074, lon: -0.1278, tz: 0 },
  { name: 'Lagos', lat: 6.5244, lon: 3.3792, tz: 1 },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708, tz: 4 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 9 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 10 },
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333, tz: -3 },
  { name: 'Nairobi', lat: -1.2921, lon: 36.8219, tz: 3 },
];

// Key dates for the reference paths drawn behind the selected day.
const KEY_DAYS: { label: string; month: number; day: number; color: string }[] = [
  { label: 'Jun solstice', month: 6, day: 21, color: '#f59e0b' },
  { label: 'Equinoxes', month: 3, day: 20, color: '#94a3b8' },
  { label: 'Dec solstice', month: 12, day: 21, color: '#60a5fa' },
];

interface Props { accent?: string; }

const SunPathCalculator: React.FC<Props> = ({ accent = '#B08968' }) => {
  const today = useMemo(() => new Date(), []);
  const [lat, setLat] = useState(40.7128);
  const [lon, setLon] = useState(-74.0060);
  const [tz, setTz] = useState(-5);
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [day, setDay] = useState(today.getDate());
  const [hour, setHour] = useState(12);
  const year = today.getFullYear();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pos = useMemo(
    () => solarPosition(lat, lon, year, month, day, hour, tz),
    [lat, lon, year, month, day, hour, tz],
  );
  const times = useMemo(
    () => sunTimes(lat, lon, year, month, day, tz),
    [lat, lon, year, month, day, tz],
  );

  // Shadow length as a multiple of object height, and the overhang depth that
  // fully shades a window of a given height at this instant.
  const shadowRatio = pos.altitude > 0.5 ? 1 / Math.tan(pos.altitude * RAD) : null;

  // ── Canvas: stereographic-style polar sun-path diagram ────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = cv.clientWidth || 360;
    cv.width = size * dpr; cv.height = size * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, R = size / 2 - 22;

    // Equidistant projection: radius grows linearly with zenith angle.
    const project = (alt: number, az: number) => {
      const r = R * ((90 - alt) / 90);
      const a = (az - 90) * RAD; // rotate so north points up
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
    };

    // Altitude rings at 0/30/60°, plus the horizon.
    ctx.lineWidth = 1;
    for (const alt of [0, 30, 60]) {
      const r = R * ((90 - alt) / 90);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = alt === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
      ctx.stroke();
      if (alt > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${alt}°`, cx + 3, cy - r);
      }
    }

    // Azimuth spokes every 30°, cardinal labels.
    for (let az = 0; az < 360; az += 30) {
      const [x, y] = project(0, az);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.stroke();
    }
    const cards: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [label, az] of cards) {
      const a = (az - 90) * RAD;
      ctx.fillText(label, cx + (R + 12) * Math.cos(a), cy + (R + 12) * Math.sin(a));
    }

    // Draw one day's arc as a polyline of above-horizon samples.
    const drawPath = (m: number, d: number, color: string, width: number, dash: number[]) => {
      ctx.beginPath();
      ctx.setLineDash(dash);
      let started = false;
      for (let h = 0; h <= 24; h += 0.05) {
        const p = solarPosition(lat, lon, year, m, d, h, tz);
        if (p.altitude < 0) { started = false; continue; }
        const [x, y] = project(p.altitude, p.azimuth);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      ctx.setLineDash([]);
    };

    for (const k of KEY_DAYS) drawPath(k.month, k.day, `${k.color}66`, 1.25, [3, 3]);
    drawPath(month, day, accent, 2.25, []);

    // Hour ticks along the selected day's path.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '8px ui-sans-serif, system-ui, sans-serif';
    for (let h = 4; h <= 20; h += 2) {
      const p = solarPosition(lat, lon, year, month, day, h, tz);
      if (p.altitude <= 0) continue;
      const [x, y] = project(p.altitude, p.azimuth);
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(`${h}`, x + 4, y - 4);
    }

    // The sun right now.
    if (pos.altitude > 0) {
      const [x, y] = project(pos.altitude, pos.azimuth);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 14);
      grd.addColorStop(0, 'rgba(255,214,102,0.95)');
      grd.addColorStop(1, 'rgba(255,214,102,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd666';
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  }, [lat, lon, tz, month, day, hour, year, accent, pos.altitude, pos.azimuth]);

  const daysInMonth = new Date(year, month, 0).getDate();

  const label = `${TYPE.labelSm} font-black uppercase tracking-[0.3em] text-white/35`;

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={14} style={{ color: accent }} />
          <p className={label}>Location</p>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {PRESETS.map(p => {
            const active = Math.abs(p.lat - lat) < 0.01 && Math.abs(p.lon - lon) < 0.01;
            return (
              <button key={p.name} onClick={() => { setLat(p.lat); setLon(p.lon); setTz(p.tz); }}
                className={`px-2.5 py-1 rounded-full ${TYPE.labelSm} font-black uppercase tracking-widest transition-all border`}
                style={active
                  ? { background: `${accent}26`, borderColor: `${accent}66`, color: accent }
                  : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                {p.name}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className={label}>Latitude °</span>
            <input type="number" step="0.0001" min={-89.9} max={89.9} value={lat}
              onChange={e => setLat(Math.max(-89.9, Math.min(89.9, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white tabular-nums focus:outline-none"
              onFocus={e => (e.currentTarget.style.borderColor = `${accent}66`)}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
          </label>
          <label className="block">
            <span className={label}>Longitude °</span>
            <input type="number" step="0.0001" min={-180} max={180} value={lon}
              onChange={e => setLon(Math.max(-180, Math.min(180, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white tabular-nums focus:outline-none" />
          </label>
          <label className="block">
            <span className={label}>UTC Offset</span>
            <input type="number" step="0.5" min={-12} max={14} value={tz}
              onChange={e => setTz(Math.max(-12, Math.min(14, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white tabular-nums focus:outline-none" />
          </label>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <label className="block">
            <span className={label}>Month</span>
            <select value={month} onChange={e => { const m = Number(e.target.value); setMonth(m); setDay(Math.min(day, new Date(year, m, 0).getDate())); }}
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none">
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                .map((m, i) => <option key={m} value={i + 1} className="bg-[#0d0d12]">{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Day · {day}</span>
            <input type="range" min={1} max={daysInMonth} value={day} onChange={e => setDay(Number(e.target.value))}
              className="mt-3 w-full accent-current" style={{ accentColor: accent }} />
          </label>
          <label className="block">
            <span className={label}>Time · {fmtHM(hour)}</span>
            <input type="range" min={0} max={23.75} step={0.25} value={hour} onChange={e => setHour(Number(e.target.value))}
              className="mt-3 w-full" style={{ accentColor: accent }} />
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Diagram */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2"><Compass size={14} style={{ color: accent }} /><p className={label}>Sun Path · Plan Projection</p></div>
            <span className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/25`}>North up</span>
          </div>
          <canvas ref={canvasRef} className="w-full aspect-square" />
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {KEY_DAYS.map(k => (
              <span key={k.label} className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/35">
                <span className="w-3 h-px" style={{ background: k.color }} /> {k.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: accent }}>
              <span className="w-3 h-[2px]" style={{ background: accent }} /> Selected day
            </span>
          </div>
        </div>

        {/* Readout */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Altitude', v: `${pos.altitude.toFixed(2)}°`, i: Sun },
              { l: 'Azimuth', v: `${(((pos.azimuth % 360) + 360) % 360).toFixed(2)}° ${compass(pos.azimuth)}`, i: Compass },
              { l: 'Declination', v: `${pos.declination.toFixed(2)}°`, i: Sun },
              { l: 'Equation of Time', v: `${pos.equationOfTime.toFixed(1)} min`, i: Info },
            ].map(s => (
              <div key={s.l} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <s.i size={15} style={{ color: accent }} />
                <p className="text-lg font-black mt-1.5 tabular-nums leading-none">{s.v}</p>
                <p className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/35 mt-1`}>{s.l}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className={label}>Day Length</p>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div><div className="flex items-center gap-1.5"><Sunrise size={13} className="text-white/35" /><p className="text-base font-black tabular-nums">{fmtHM(times.sunrise)}</p></div><p className="text-[9px] uppercase tracking-widest text-white/30 mt-0.5">Sunrise</p></div>
              <div><div className="flex items-center gap-1.5"><Sun size={13} className="text-white/35" /><p className="text-base font-black tabular-nums">{fmtHM(times.noon)}</p></div><p className="text-[9px] uppercase tracking-widest text-white/30 mt-0.5">Solar noon</p></div>
              <div><div className="flex items-center gap-1.5"><Sunset size={13} className="text-white/35" /><p className="text-base font-black tabular-nums">{fmtHM(times.sunset)}</p></div><p className="text-[9px] uppercase tracking-widest text-white/30 mt-0.5">Sunset</p></div>
            </div>
            <p className="text-[11px] text-white/40 mt-2">
              {times.sunrise == null
                ? (times.dayLength === 0 ? 'Polar night — the sun does not rise on this date at this latitude.' : 'Midnight sun — the sun does not set on this date at this latitude.')
                : `${times.dayLength.toFixed(2)} hours of daylight.`}
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2"><Ruler size={14} style={{ color: accent }} /><p className={label}>Shading Check</p></div>
            {shadowRatio != null ? (
              <>
                <p className="text-sm text-white/60 leading-relaxed mt-2">
                  A vertical element casts a shadow <span className="font-black text-white tabular-nums">{shadowRatio.toFixed(2)}×</span> its own height.
                  A 3 m wall throws <span className="font-black text-white tabular-nums">{(shadowRatio * 3).toFixed(2)} m</span>.
                </p>
                <p className="text-sm text-white/50 leading-relaxed mt-2">
                  To fully shade a <span className="text-white/80">2.1 m</span> window at this instant, a horizontal overhang at the head needs a
                  projection of about <span className="font-black text-white tabular-nums">{(2.1 / shadowRatio).toFixed(2)} m</span> —
                  assuming the sun is normal to the façade. Check the same figure at the June solstice noon and at the
                  equinox: a good overhang shades in summer and admits sun in winter.
                </p>
              </>
            ) : (
              <p className="text-sm text-white/45 mt-2">The sun is at or below the horizon — no direct shadow to compute at this time.</p>
            )}
          </div>

          <a href="https://gml.noaa.gov/grad/solcalc/calcdetails.html" target="_blank" rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
            <div>
              <p className="text-[13px] font-black text-white">NOAA Solar Position Algorithm</p>
              <p className="type-body-sm text-white/45 mt-0.5">The equations behind this calculator, published by the NOAA Global Monitoring Laboratory.</p>
            </div>
            <ExternalLink size={14} className="text-white/30 shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default SunPathCalculator;
