// The day the game is played on: its season, the hour, and the weather. Every new game rolls its own — a spring
// morning, a hot summer noon, an autumn evening coming on to rain, a winter night with snow falling — and then it
// lives: the hours pass (a full day in an hour of play), the weather turns (clear skies cloud over, cloud brings
// rain, rain sets in heavy and blows through; in winter, and late in autumn, it snows instead), the ground wets and
// dries, snow settles and thaws. Saving the game keeps the day as it stands; a new start rolls again.
//
// This module only keeps the state and eases it; look.ts lights the sky from it, precip.ts draws the rain and snow,
// ground.ts / forest.ts / grassField.ts / undergrowth.ts dress the land for the season and the weather.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Sky = 'clear' | 'cloudy' | 'lightRain' | 'heavyRain' | 'snow';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SKIES: Sky[] = ['clear', 'cloudy', 'lightRain', 'heavyRain', 'snow'];

/** What a save keeps (and a new game rolls). */
export interface DayState { season: Season; hour: number; sky: Sky }

/** Game minutes per real second: 24 h in 60 min of play. */
export const DAY_RATE = 24 / 3600;

const SAVE_KEY = 'eraclash3d.day';

/** How much cloud, rain and snow each sky brings (targets the live values ease toward). */
const SKY_MIX: Record<Sky, { cloud: number; rain: number; snow: number; wind: number }> = {
  clear: { cloud: 0.05, rain: 0, snow: 0, wind: 0.45 },
  cloudy: { cloud: 0.7, rain: 0, snow: 0, wind: 0.6 },
  lightRain: { cloud: 0.85, rain: 0.35, snow: 0, wind: 0.65 },
  heavyRain: { cloud: 1, rain: 1, snow: 0, wind: 0.95 },
  snow: { cloud: 0.9, rain: 0, snow: 0.8, wind: 0.5 },
};

/** Which skies a season gives, and how often (rolled at the start, and as the weather turns). */
const SEASON_SKIES: Record<Season, [Sky, number][]> = {
  spring: [['clear', 4], ['cloudy', 2.5], ['lightRain', 2], ['heavyRain', 0.8]],
  summer: [['clear', 5], ['cloudy', 1.5], ['lightRain', 1], ['heavyRain', 1.2]],
  autumn: [['clear', 3], ['cloudy', 3], ['lightRain', 2], ['heavyRain', 1], ['snow', 0.4]],
  winter: [['clear', 2.5], ['cloudy', 2.5], ['snow', 3], ['lightRain', 0.4]],
};

/** What a sky turns into next (the weather moves through cloud, it doesn't jump from blue sky to a downpour). */
const NEXT: Record<Sky, Sky[]> = {
  clear: ['clear', 'cloudy'],
  cloudy: ['clear', 'cloudy', 'lightRain', 'snow'],
  lightRain: ['cloudy', 'lightRain', 'heavyRain'],
  heavyRain: ['lightRain', 'heavyRain', 'cloudy'],
  snow: ['cloudy', 'snow'],
};

function pick<T>(items: [T, number][], r: number): T {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let x = r * tot;
  for (const [it, w] of items) { x -= w; if (x <= 0) return it; }
  return items[items.length - 1][0];
}

/** A fresh day: any season, any hour (a little more often the golden hours), the weather the season brings. */
export function rollDay(rand = Math.random): DayState {
  const season = SEASONS[Math.floor(rand() * 4)];
  const hours: [number, number][] = [[5.5, 1], [7, 1.4], [9.5, 1.2], [12.5, 1.2], [15, 1.2], [17.5, 1.6], [19, 1.2], [22, 0.9], [1.5, 0.5]];
  const hour = (pick(hours, rand()) + (rand() - 0.5) * 1.6 + 24) % 24;
  const sky = pick(SEASON_SKIES[season], rand());
  return { season, hour, sky };
}

export function loadDay(): DayState | null {
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); return v && SEASONS.includes(v.season) && SKIES.includes(v.sky) ? v : null; } catch { return null; }
}
export function saveDay(d: DayState) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* private mode */ } }
export function clearSavedDay() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }

export class Climate {
  season: Season;
  hour: number;
  sky: Sky;
  /** Live, eased values (0…1). */
  cloud = 0; rain = 0; snow = 0; windK = 0.45;
  /** The ground: wetness from rain (slow to dry), snow lying (slow to thaw). */
  wet = 0; snowCover = 0;
  /** Leaves and flowers for the season (0…1, eased so a loaded season starts settled). */
  autumn = 0; bare = 0; bloom = 1;
  /** Hold the clock and the weather (?hour=… / ?sky=… pin them for review captures). */
  frozenClock = false; frozenSky = false;
  private nextTurn: number;
  private rand: () => number;

  constructor(day: DayState, rand = Math.random) {
    this.season = day.season; this.hour = day.hour; this.sky = day.sky; this.rand = rand;
    // start settled: the sky as rolled, the ground as that weather (and season) would have left it
    const m = SKY_MIX[this.sky];
    this.cloud = m.cloud; this.rain = m.rain; this.snow = m.snow; this.windK = m.wind;
    this.wet = m.rain > 0 ? 0.6 + 0.4 * m.rain : this.sky === 'cloudy' && this.rand() < 0.4 ? 0.35 : 0;
    this.snowCover = this.season === 'winter' ? (this.sky === 'snow' ? 0.95 : 0.6 + this.rand() * 0.3) : this.sky === 'snow' ? 0.5 : 0;
    const s = this.seasonTargets(); this.autumn = s.autumn; this.bare = s.bare; this.bloom = s.bloom;
    this.nextTurn = 120 + this.rand() * 240;
  }

  get state(): DayState { return { season: this.season, hour: this.hour, sky: this.sky }; }

  /** 0 at midnight … sun up from ~5:30 … down by ~19:00 (shorter in winter, longer in summer). */
  sunElevationDeg() {
    const len = { spring: 13, summer: 14.6, autumn: 12, winter: 10 }[this.season];
    const rise = 12.5 - len / 2, peak = { spring: 58, summer: 74, autumn: 46, winter: 32 }[this.season];
    const t = (this.hour - rise) / len;
    // above the horizon by day; a little below it at dusk and dawn (twilight), well below at night
    if (t >= 0 && t <= 1) return peak * Math.sin(Math.PI * t);
    const off = t < 0 ? -t * len : (t - 1) * len;   // hours from the horizon
    return -Math.min(30, off * 9);
  }

  private seasonTargets() {
    return {
      autumn: this.season === 'autumn' ? 1 : 0,
      bare: this.season === 'winter' ? 1 : 0,
      bloom: this.season === 'spring' ? 1 : 0,
    };
  }

  /** Turn the weather now (dev: `eraclash3d.climate.turn('heavyRain')`). */
  turn(to?: Sky) {
    let opts = NEXT[this.sky].filter((s) => s !== 'snow' || this.season === 'winter' || this.season === 'autumn');
    // rain doesn't fall in deep winter cold; snow doesn't fall in spring and summer
    if (this.season === 'winter') opts = opts.map((s) => (s === 'heavyRain' ? 'snow' : s));
    const weights: [Sky, number][] = opts.map((s) => [s, (SEASON_SKIES[this.season].find(([k]) => k === s)?.[1] ?? 0.3) * (s === this.sky ? 1.4 : 1)]);
    this.sky = to ?? pick(weights, this.rand());
  }

  update(dt: number) {
    if (!this.frozenClock) this.hour = (this.hour + dt * DAY_RATE) % 24;
    if (!this.frozenSky) {
      this.nextTurn -= dt;
      if (this.nextTurn <= 0) { this.turn(); this.nextTurn = 150 + this.rand() * 330; }
    }
    const m = SKY_MIX[this.sky];
    const ease = (v: number, to: number, rate: number) => v + Math.sign(to - v) * Math.min(Math.abs(to - v), rate * dt);
    this.cloud = ease(this.cloud, m.cloud, 1 / 45);                     // a sky clouds over in under a minute
    this.rain = ease(this.rain, m.rain, this.cloud > 0.6 ? 1 / 30 : 1 / 10);
    this.snow = ease(this.snow, m.snow, this.cloud > 0.6 ? 1 / 40 : 1 / 10);
    this.windK = ease(this.windK, m.wind, 1 / 20);
    // the ground: wets fast in rain, dries over minutes (slower at night and under cloud)
    const dry = (this.sunElevationDeg() > 5 ? 1 / 240 : 1 / 600) * (1 - 0.6 * this.cloud);
    this.wet = Math.min(1, Math.max(0, this.wet + (this.rain > 0.05 ? this.rain / 50 : -dry) * dt));
    // snow lies as it falls; in the sun out of winter it goes
    const thaw = this.season === 'winter' ? 1 / 3000 : this.sunElevationDeg() > 5 ? 1 / 200 : 1 / 900;
    this.snowCover = Math.min(1, Math.max(0, this.snowCover + (this.snow > 0.05 ? this.snow / 90 : -thaw - this.rain / 60) * dt));
    const s = this.seasonTargets();
    this.autumn = ease(this.autumn, s.autumn, 1 / 20); this.bare = ease(this.bare, s.bare, 1 / 20); this.bloom = ease(this.bloom, s.bloom, 1 / 20);
  }
}
