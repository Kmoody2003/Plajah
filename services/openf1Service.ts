// OpenF1 API – free, no key required. https://openf1.org
// Provides comprehensive F1 data: sessions, laps, pitstops, telemetry, driver/car data.
// All requests go through the server-side proxy to avoid CORS.

const OPENF1 = 'https://api.openf1.org/v1';

const _cache = new Map<string, { data: any; ts: number }>();
const TTL_FAST = 2 * 60 * 1000;   // 2 min (live race data)
const TTL_SLOW = 60 * 60 * 1000;  // 1 hr (historical)

function fromCache(key: string, ttl: number) {
  const h = _cache.get(key);
  return h && Date.now() - h.ts < ttl ? h.data : null;
}
function toCache(key: string, data: any) { _cache.set(key, { data, ts: Date.now() }); }

async function openf1Fetch<T>(path: string, ttl = TTL_SLOW): Promise<T[]> {
  const cacheKey = path;
  const hit = fromCache(cacheKey, ttl);
  if (hit) return hit;
  try {
    const url = `${OPENF1}${path}`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const result = Array.isArray(data) ? data : [];
    toCache(cacheKey, result);
    return result;
  } catch {
    return [];
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface F1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_name: string;
  country_code: string;
  circuit_key: number;
  circuit_short_name: string;
  date_start: string;
  gmt_offset: string;
  year: number;
}

export interface F1Session {
  session_key: number;
  session_name: string;
  session_type: string; // 'Race' | 'Qualifying' | 'Practice 1' | 'Practice 2' | 'Practice 3' | 'Sprint'
  meeting_key: number;
  date_start: string;
  date_end: string;
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
}

export interface F1Driver {
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  first_name: string;
  last_name: string;
  headshot_url: string;
  country_code: string;
  session_key: number;
  meeting_key: number;
}

export interface F1Lap {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  date_start: string;
  segments_sector_1: number[];
  segments_sector_2: number[];
  segments_sector_3: number[];
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
}

export interface F1Pit {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
  date: string;
}

export interface F1Position {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  position: number;
}

export interface F1CarData {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  rpm: number;
  speed: number;
  n_gear: number;
  throttle: number;
  brake: number;
  drs: number;
}

export interface F1Stint {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string; // 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'
  tyre_age_at_start: number;
}

export interface F1TeamRadio {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  recording_url: string;
}

export interface F1WeatherData {
  session_key: number;
  meeting_key: number;
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_direction: number;
  rainfall: boolean;
}

export interface F1RaceResult {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  headshot_url: string;
  position: number;
  fastest_lap?: number;
  total_laps: number;
  pit_count: number;
  best_lap_time: number | null;
  compounds_used: string[];
}

// ─── Meetings & Sessions ─────────────────────────────────────────────────────

export async function fetchF1Meetings(year: number): Promise<F1Meeting[]> {
  return openf1Fetch<F1Meeting>(`/meetings?year=${year}`);
}

export async function fetchF1Session(sessionKey: number): Promise<F1Session | null> {
  const r = await openf1Fetch<F1Session>(`/sessions?session_key=${sessionKey}`);
  return r[0] ?? null;
}

export async function fetchF1SessionsByMeeting(meetingKey: number): Promise<F1Session[]> {
  return openf1Fetch<F1Session>(`/sessions?meeting_key=${meetingKey}`);
}

export async function fetchF1RaceSessions(year: number): Promise<F1Session[]> {
  return openf1Fetch<F1Session>(`/sessions?year=${year}&session_type=Race`);
}

// ─── Drivers ─────────────────────────────────────────────────────────────────

export async function fetchF1Drivers(sessionKey: number): Promise<F1Driver[]> {
  return openf1Fetch<F1Driver>(`/drivers?session_key=${sessionKey}`);
}

export async function fetchF1DriversByYear(year: number): Promise<F1Driver[]> {
  // Get the first race session of the year to get the driver list
  const sessions = await fetchF1RaceSessions(year);
  if (!sessions.length) return [];
  return fetchF1Drivers(sessions[0].session_key);
}

// ─── Lap Data ────────────────────────────────────────────────────────────────

export async function fetchF1Laps(sessionKey: number, driverNumber?: number): Promise<F1Lap[]> {
  const suffix = driverNumber ? `&driver_number=${driverNumber}` : '';
  return openf1Fetch<F1Lap>(`/laps?session_key=${sessionKey}${suffix}`, TTL_FAST);
}

export async function fetchF1FastestLaps(sessionKey: number): Promise<Map<number, F1Lap>> {
  const laps = await fetchF1Laps(sessionKey);
  const fastest = new Map<number, F1Lap>();
  for (const lap of laps) {
    if (!lap.lap_duration) continue;
    const existing = fastest.get(lap.driver_number);
    if (!existing || !existing.lap_duration || lap.lap_duration < existing.lap_duration) {
      fastest.set(lap.driver_number, lap);
    }
  }
  return fastest;
}

// ─── Pitstops ─────────────────────────────────────────────────────────────────

export async function fetchF1Pit(sessionKey: number, driverNumber?: number): Promise<F1Pit[]> {
  const suffix = driverNumber ? `&driver_number=${driverNumber}` : '';
  return openf1Fetch<F1Pit>(`/pit?session_key=${sessionKey}${suffix}`, TTL_FAST);
}

// ─── Positions / Race Results ─────────────────────────────────────────────────

export async function fetchF1Positions(sessionKey: number): Promise<F1Position[]> {
  return openf1Fetch<F1Position>(`/position?session_key=${sessionKey}`, TTL_FAST);
}

export async function fetchF1FinalPositions(sessionKey: number): Promise<F1Position[]> {
  // Get the last recorded position for each driver
  const all = await fetchF1Positions(sessionKey);
  const latest = new Map<number, F1Position>();
  for (const p of all) {
    const existing = latest.get(p.driver_number);
    if (!existing || p.date > existing.date) {
      latest.set(p.driver_number, p);
    }
  }
  return Array.from(latest.values()).sort((a, b) => a.position - b.position);
}

// ─── Stints / Tyre Strategy ──────────────────────────────────────────────────

export async function fetchF1Stints(sessionKey: number, driverNumber?: number): Promise<F1Stint[]> {
  const suffix = driverNumber ? `&driver_number=${driverNumber}` : '';
  return openf1Fetch<F1Stint>(`/stints?session_key=${sessionKey}${suffix}`);
}

// ─── Car / Telemetry ─────────────────────────────────────────────────────────

export async function fetchF1CarDataSample(
  sessionKey: number,
  driverNumber: number,
  maxSamples = 200,
): Promise<F1CarData[]> {
  const all = await openf1Fetch<F1CarData>(
    `/car_data?session_key=${sessionKey}&driver_number=${driverNumber}`,
    TTL_SLOW,
  );
  // Return evenly-spaced sample for performance
  const step = Math.max(1, Math.floor(all.length / maxSamples));
  return all.filter((_, i) => i % step === 0);
}

// ─── Weather ─────────────────────────────────────────────────────────────────

export async function fetchF1Weather(sessionKey: number): Promise<F1WeatherData[]> {
  return openf1Fetch<F1WeatherData>(`/weather?session_key=${sessionKey}`);
}

// ─── Rich race result (combines drivers, positions, laps, pits, stints) ──────

export async function fetchF1RaceResult(sessionKey: number): Promise<F1RaceResult[]> {
  const cacheKey = `raceresult:${sessionKey}`;
  const hit = fromCache(cacheKey, TTL_SLOW);
  if (hit) return hit;

  const [drivers, finalPos, fastestLaps, pits, stints] = await Promise.all([
    fetchF1Drivers(sessionKey),
    fetchF1FinalPositions(sessionKey),
    fetchF1FastestLaps(sessionKey),
    fetchF1Pit(sessionKey),
    fetchF1Stints(sessionKey),
  ]);

  const driverMap = new Map(drivers.map(d => [d.driver_number, d]));
  const pitCounts = new Map<number, number>();
  for (const p of pits) {
    pitCounts.set(p.driver_number, (pitCounts.get(p.driver_number) ?? 0) + 1);
  }
  const compoundsUsed = new Map<number, Set<string>>();
  for (const s of stints) {
    if (!compoundsUsed.has(s.driver_number)) compoundsUsed.set(s.driver_number, new Set());
    compoundsUsed.get(s.driver_number)!.add(s.compound);
  }

  const totalLaps = Math.max(0, ...Array.from(fastestLaps.values()).map(l => l.lap_number));

  const result: F1RaceResult[] = finalPos.map(pos => {
    const driver = driverMap.get(pos.driver_number);
    const fl = fastestLaps.get(pos.driver_number);
    return {
      driver_number: pos.driver_number,
      full_name:     driver?.full_name ?? `#${pos.driver_number}`,
      name_acronym:  driver?.name_acronym ?? '???',
      team_name:     driver?.team_name ?? 'Unknown',
      team_colour:   driver?.team_colour ?? '#888888',
      headshot_url:  driver?.headshot_url ?? '',
      position:      pos.position,
      best_lap_time: fl?.lap_duration ?? null,
      total_laps:    totalLaps,
      pit_count:     pitCounts.get(pos.driver_number) ?? 0,
      compounds_used: Array.from(compoundsUsed.get(pos.driver_number) ?? []),
    };
  });

  toCache(cacheKey, result);
  return result;
}

// ─── Circuit track coordinates (normalized 0-1 for SVG rendering) ────────────
// Points sourced from public F1 circuit data and manually normalized.

export interface CircuitPoint { x: number; y: number }

export interface CircuitInfo {
  key: number;
  name: string;
  country: string;
  length_km: number;
  turns: number;
  drs_zones: number;
  lap_record?: { time: string; driver: string; year: number };
  track_points: CircuitPoint[]; // normalized 0-1
  // sectors for coloring (start/end index into track_points)
  sector1_end?: number;
  sector2_end?: number;
}

export const F1_CIRCUITS: Record<string, CircuitInfo> = {
  monaco: {
    key: 10, name: 'Circuit de Monaco', country: 'Monaco',
    length_km: 3.337, turns: 19, drs_zones: 1,
    lap_record: { time: '1:12.909', driver: 'L. Hamilton', year: 2021 },
    track_points: [
      {x:0.50,y:0.10},{x:0.60,y:0.10},{x:0.72,y:0.12},{x:0.80,y:0.18},
      {x:0.85,y:0.28},{x:0.85,y:0.40},{x:0.80,y:0.50},{x:0.70,y:0.55},
      {x:0.60,y:0.58},{x:0.52,y:0.62},{x:0.45,y:0.68},{x:0.42,y:0.78},
      {x:0.45,y:0.88},{x:0.52,y:0.92},{x:0.60,y:0.90},{x:0.65,y:0.82},
      {x:0.60,y:0.72},{x:0.50,y:0.65},{x:0.38,y:0.60},{x:0.28,y:0.52},
      {x:0.22,y:0.42},{x:0.22,y:0.30},{x:0.28,y:0.20},{x:0.38,y:0.13},
      {x:0.50,y:0.10},
    ],
    sector1_end: 8, sector2_end: 16,
  },
  silverstone: {
    key: 13, name: 'Silverstone Circuit', country: 'United Kingdom',
    length_km: 5.891, turns: 18, drs_zones: 2,
    lap_record: { time: '1:27.097', driver: 'M. Verstappen', year: 2020 },
    track_points: [
      {x:0.50,y:0.10},{x:0.68,y:0.10},{x:0.80,y:0.15},{x:0.88,y:0.25},
      {x:0.90,y:0.38},{x:0.85,y:0.50},{x:0.80,y:0.60},{x:0.75,y:0.68},
      {x:0.68,y:0.75},{x:0.58,y:0.80},{x:0.48,y:0.85},{x:0.38,y:0.82},
      {x:0.28,y:0.75},{x:0.20,y:0.65},{x:0.18,y:0.52},{x:0.22,y:0.40},
      {x:0.28,y:0.30},{x:0.35,y:0.22},{x:0.42,y:0.15},{x:0.50,y:0.10},
    ],
    sector1_end: 6, sector2_end: 13,
  },
  monza: {
    key: 14, name: 'Autodromo Nazionale Monza', country: 'Italy',
    length_km: 5.793, turns: 11, drs_zones: 2,
    lap_record: { time: '1:21.046', driver: 'R. Barrichello', year: 2004 },
    track_points: [
      {x:0.50,y:0.05},{x:0.70,y:0.05},{x:0.85,y:0.12},{x:0.90,y:0.28},
      {x:0.85,y:0.40},{x:0.72,y:0.45},{x:0.60,y:0.48},{x:0.72,y:0.55},
      {x:0.85,y:0.65},{x:0.88,y:0.78},{x:0.80,y:0.88},{x:0.65,y:0.92},
      {x:0.50,y:0.90},{x:0.35,y:0.88},{x:0.22,y:0.80},{x:0.18,y:0.68},
      {x:0.20,y:0.55},{x:0.28,y:0.48},{x:0.38,y:0.42},{x:0.28,y:0.32},
      {x:0.20,y:0.22},{x:0.22,y:0.12},{x:0.35,y:0.06},{x:0.50,y:0.05},
    ],
    sector1_end: 7, sector2_end: 16,
  },
  spa: {
    key: 5, name: 'Circuit de Spa-Francorchamps', country: 'Belgium',
    length_km: 7.004, turns: 19, drs_zones: 2,
    lap_record: { time: '1:46.286', driver: 'V. Bottas', year: 2018 },
    track_points: [
      {x:0.50,y:0.05},{x:0.65,y:0.05},{x:0.78,y:0.10},{x:0.88,y:0.20},
      {x:0.90,y:0.33},{x:0.85,y:0.44},{x:0.75,y:0.52},{x:0.68,y:0.60},
      {x:0.72,y:0.70},{x:0.78,y:0.78},{x:0.80,y:0.88},{x:0.72,y:0.93},
      {x:0.60,y:0.90},{x:0.48,y:0.85},{x:0.38,y:0.78},{x:0.30,y:0.68},
      {x:0.25,y:0.55},{x:0.22,y:0.42},{x:0.25,y:0.30},{x:0.30,y:0.20},
      {x:0.38,y:0.12},{x:0.50,y:0.05},
    ],
    sector1_end: 7, sector2_end: 14,
  },
  suzuka: {
    key: 24, name: 'Suzuka Circuit', country: 'Japan',
    length_km: 5.807, turns: 18, drs_zones: 1,
    lap_record: { time: '1:30.983', driver: 'L. Hamilton', year: 2019 },
    track_points: [
      {x:0.50,y:0.08},{x:0.65,y:0.05},{x:0.78,y:0.10},{x:0.85,y:0.22},
      {x:0.88,y:0.35},{x:0.82,y:0.45},{x:0.70,y:0.52},{x:0.58,y:0.55},
      {x:0.48,y:0.52},{x:0.40,y:0.46},{x:0.38,y:0.38},{x:0.42,y:0.30},
      {x:0.50,y:0.28},{x:0.40,y:0.45},{x:0.35,y:0.58},{x:0.28,y:0.68},
      {x:0.22,y:0.78},{x:0.20,y:0.88},{x:0.28,y:0.95},{x:0.40,y:0.92},
      {x:0.50,y:0.85},{x:0.40,y:0.75},{x:0.35,y:0.65},{x:0.30,y:0.55},
      {x:0.28,y:0.45},{x:0.32,y:0.35},{x:0.40,y:0.25},{x:0.50,y:0.18},
      {x:0.50,y:0.08},
    ],
    sector1_end: 9, sector2_end: 19,
  },
  bahrain: {
    key: 3, name: 'Bahrain International Circuit', country: 'Bahrain',
    length_km: 5.412, turns: 15, drs_zones: 2,
    lap_record: { time: '1:31.447', driver: 'P. de la Rosa', year: 2005 },
    track_points: [
      {x:0.50,y:0.12},{x:0.65,y:0.08},{x:0.78,y:0.15},{x:0.88,y:0.28},
      {x:0.88,y:0.42},{x:0.82,y:0.52},{x:0.70,y:0.55},{x:0.60,y:0.52},
      {x:0.52,y:0.58},{x:0.48,y:0.68},{x:0.52,y:0.78},{x:0.60,y:0.85},
      {x:0.70,y:0.88},{x:0.80,y:0.85},{x:0.85,y:0.75},{x:0.80,y:0.65},
      {x:0.68,y:0.70},{x:0.55,y:0.72},{x:0.45,y:0.65},{x:0.38,y:0.55},
      {x:0.32,y:0.45},{x:0.28,y:0.35},{x:0.30,y:0.25},{x:0.38,y:0.16},
      {x:0.50,y:0.12},
    ],
    sector1_end: 8, sector2_end: 17,
  },
  interlagos: {
    key: 18, name: 'Autódromo José Carlos Pace', country: 'Brazil',
    length_km: 4.309, turns: 15, drs_zones: 2,
    lap_record: { time: '1:10.540', driver: 'V. Bottas', year: 2018 },
    track_points: [
      {x:0.55,y:0.10},{x:0.68,y:0.08},{x:0.80,y:0.15},{x:0.85,y:0.28},
      {x:0.82,y:0.40},{x:0.72,y:0.48},{x:0.60,y:0.52},{x:0.50,y:0.58},
      {x:0.42,y:0.65},{x:0.38,y:0.75},{x:0.42,y:0.85},{x:0.52,y:0.90},
      {x:0.62,y:0.87},{x:0.70,y:0.80},{x:0.68,y:0.70},{x:0.58,y:0.65},
      {x:0.48,y:0.62},{x:0.38,y:0.55},{x:0.30,y:0.45},{x:0.28,y:0.35},
      {x:0.32,y:0.24},{x:0.42,y:0.15},{x:0.55,y:0.10},
    ],
    sector1_end: 7, sector2_end: 15,
  },
  singapore: {
    key: 22, name: 'Marina Bay Street Circuit', country: 'Singapore',
    length_km: 5.063, turns: 23, drs_zones: 3,
    lap_record: { time: '1:35.867', driver: 'K. Raikkonen', year: 2018 },
    track_points: [
      {x:0.50,y:0.08},{x:0.65,y:0.06},{x:0.80,y:0.12},{x:0.88,y:0.22},
      {x:0.88,y:0.35},{x:0.82,y:0.45},{x:0.72,y:0.38},{x:0.65,y:0.30},
      {x:0.62,y:0.42},{x:0.68,y:0.52},{x:0.75,y:0.60},{x:0.80,y:0.70},
      {x:0.78,y:0.80},{x:0.68,y:0.88},{x:0.55,y:0.90},{x:0.42,y:0.85},
      {x:0.35,y:0.75},{x:0.30,y:0.65},{x:0.25,y:0.55},{x:0.22,y:0.45},
      {x:0.25,y:0.35},{x:0.32,y:0.25},{x:0.40,y:0.16},{x:0.50,y:0.08},
    ],
    sector1_end: 8, sector2_end: 16,
  },
};

export function getCircuitInfo(circuitShortName: string): CircuitInfo | null {
  const name = circuitShortName.toLowerCase();
  if (name.includes('monaco')) return F1_CIRCUITS.monaco;
  if (name.includes('silverstone')) return F1_CIRCUITS.silverstone;
  if (name.includes('monza')) return F1_CIRCUITS.monza;
  if (name.includes('spa')) return F1_CIRCUITS.spa;
  if (name.includes('suzuka')) return F1_CIRCUITS.suzuka;
  if (name.includes('bahrain')) return F1_CIRCUITS.bahrain;
  if (name.includes('interlagos') || name.includes('sao paulo')) return F1_CIRCUITS.interlagos;
  if (name.includes('marina bay') || name.includes('singapore')) return F1_CIRCUITS.singapore;
  return null;
}

// ─── Historical season calendar ───────────────────────────────────────────────

export async function fetchF1SeasonCalendar(year: number): Promise<{
  meeting: F1Meeting;
  raceSession: F1Session | null;
}[]> {
  const [meetings, raceSessions] = await Promise.all([
    fetchF1Meetings(year),
    fetchF1RaceSessions(year),
  ]);
  const raceByMeeting = new Map(raceSessions.map(s => [s.meeting_key, s]));
  return meetings.map(m => ({
    meeting: m,
    raceSession: raceByMeeting.get(m.meeting_key) ?? null,
  }));
}

// ─── Tire compound colors ─────────────────────────────────────────────────────

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT:         '#E8002D',
  MEDIUM:       '#FFF200',
  HARD:         '#FFFFFF',
  INTERMEDIATE: '#39B54A',
  WET:          '#0067FF',
};

export function formatLapTime(seconds: number | null): string {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, '0');
  return mins > 0 ? `${mins}:${secs}` : `${secs}s`;
}
