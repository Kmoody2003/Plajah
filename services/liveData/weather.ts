// weather — live weather as a LiveTable, for weather graphics presentations.
//
// Open-Meteo (no API key, CORS-enabled): geocode a place name once, then poll
// the forecast. The table has one row per day (row 0 = today + current
// conditions), so a "5-day strip" binds rows 0–4 and a "current conditions"
// lower third binds row 0. Codes are WMO weather codes; `condition` and
// `icon` are human/glyph names the CG weather-icon layer draws.
import type { LiveTable } from './csv';

export const WMO: Record<number, { condition: string; icon: WeatherIcon }> = {
  0: { condition: 'Clear', icon: 'sun' }, 1: { condition: 'Mostly clear', icon: 'sun' }, 2: { condition: 'Partly cloudy', icon: 'partly' }, 3: { condition: 'Overcast', icon: 'cloud' },
  45: { condition: 'Fog', icon: 'fog' }, 48: { condition: 'Freezing fog', icon: 'fog' },
  51: { condition: 'Light drizzle', icon: 'rain' }, 53: { condition: 'Drizzle', icon: 'rain' }, 55: { condition: 'Heavy drizzle', icon: 'rain' },
  56: { condition: 'Freezing drizzle', icon: 'sleet' }, 57: { condition: 'Freezing drizzle', icon: 'sleet' },
  61: { condition: 'Light rain', icon: 'rain' }, 63: { condition: 'Rain', icon: 'rain' }, 65: { condition: 'Heavy rain', icon: 'rain' },
  66: { condition: 'Freezing rain', icon: 'sleet' }, 67: { condition: 'Freezing rain', icon: 'sleet' },
  71: { condition: 'Light snow', icon: 'snow' }, 73: { condition: 'Snow', icon: 'snow' }, 75: { condition: 'Heavy snow', icon: 'snow' }, 77: { condition: 'Snow grains', icon: 'snow' },
  80: { condition: 'Showers', icon: 'rain' }, 81: { condition: 'Showers', icon: 'rain' }, 82: { condition: 'Violent showers', icon: 'storm' },
  85: { condition: 'Snow showers', icon: 'snow' }, 86: { condition: 'Snow showers', icon: 'snow' },
  95: { condition: 'Thunderstorm', icon: 'storm' }, 96: { condition: 'Thunderstorm, hail', icon: 'storm' }, 99: { condition: 'Thunderstorm, hail', icon: 'storm' },
};
export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'sleet' | 'snow' | 'storm' | 'night';

export interface WeatherConfig { place?: string; lat?: number; lon?: number; units?: 'imperial' | 'metric' }

const geoCache = new Map<string, { lat: number; lon: number; label: string }>();
export async function geocode(place: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; label: string }> {
  const k = place.trim().toLowerCase();
  const hit = geoCache.get(k); if (hit) return hit;
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { signal });
  if (!r.ok) throw new Error(`Geocoding failed (HTTP ${r.status})`);
  const j = await r.json();
  const g = j?.results?.[0];
  if (!g) throw new Error(`No place found for "${place}"`);
  const out = { lat: g.latitude, lon: g.longitude, label: [g.name, g.admin1, g.country_code].filter(Boolean).join(', ') };
  geoCache.set(k, out);
  return out;
}

export function forecastUrl(lat: number, lon: number, units: 'imperial' | 'metric' = 'imperial') {
  const u = units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '';
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7${u}`;
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const r0 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n)) : '');

/** Open-Meteo forecast JSON → LiveTable. Pure (tested). */
export function weatherTable(json: any, label: string, units: 'imperial' | 'metric' = 'imperial'): LiveTable {
  const c = json?.current || {}, d = json?.daily || {};
  const deg = units === 'imperial' ? '°F' : '°C', spd = units === 'imperial' ? 'mph' : 'km/h';
  const days: string[] = d.time || [];
  const rows = days.map((day, i) => {
    const code = Number(i === 0 && c.weather_code != null ? c.weather_code : d.weather_code?.[i]);
    const w = WMO[code] || { condition: '—', icon: 'cloud' as WeatherIcon };
    const date = new Date(day + 'T12:00:00');
    return {
      place: label,
      day: i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: day,
      condition: w.condition,
      icon: i === 0 && c.is_day === 0 && (w.icon === 'sun' || w.icon === 'partly') ? 'night' : w.icon,
      code: String(code),
      high: r0(d.temperature_2m_max?.[i]),
      low: r0(d.temperature_2m_min?.[i]),
      precip: r0(d.precipitation_probability_max?.[i]),
      temp: i === 0 ? r0(c.temperature_2m) : r0(d.temperature_2m_max?.[i]),
      feels: i === 0 ? r0(c.apparent_temperature) : '',
      humidity: i === 0 ? r0(c.relative_humidity_2m) : '',
      wind: i === 0 ? `${DIRS[Math.round(((c.wind_direction_10m || 0) % 360) / 45) % 8]} ${r0(c.wind_speed_10m)} ${spd}` : '',
      unit: deg,
      sunrise: (d.sunrise?.[i] || '').slice(11, 16),
      sunset: (d.sunset?.[i] || '').slice(11, 16),
    };
  });
  const columns = rows.length ? Object.keys(rows[0]) : ['place', 'day', 'condition', 'icon', 'high', 'low', 'temp'];
  return { columns, rows, updatedAt: Date.now() };
}

export async function fetchWeather(cfg: WeatherConfig, signal?: AbortSignal): Promise<LiveTable> {
  const units = cfg.units || 'imperial';
  let lat = cfg.lat, lon = cfg.lon, label = cfg.place || '';
  if ((lat == null || lon == null) && cfg.place) { const g = await geocode(cfg.place, signal); lat = g.lat; lon = g.lon; label = g.label; }
  if (lat == null || lon == null) throw new Error('Set a place or coordinates');
  const r = await fetch(forecastUrl(lat, lon, units), { signal });
  if (!r.ok) throw new Error(`Weather failed (HTTP ${r.status})`);
  return weatherTable(await r.json(), label || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, units);
}
