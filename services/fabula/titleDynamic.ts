// titleDynamic — dynamic title text (Universe Numbers / Screen Text / Type-On terminal class).
// A title clip may carry `tDynamic`; the displayed text becomes a pure function of the clip's
// text and clip-local time, used identically by the DOM monitor and the canvas export.
export type DynamicTextType = 'none' | 'counter' | 'timecode' | 'countdown' | 'screen' | 'percent';
export interface DynamicText {
  type: DynamicTextType;
  /** counter / percent: value range and timing. */
  from?: number; to?: number; decimals?: number; duration?: number; delay?: number;
  prefix?: string; suffix?: string; thousands?: boolean; ease?: 'linear' | 'out' | 'inOut';
  /** timecode: frames per second and start offset (seconds). countdown: seconds from `from`. */
  fps?: number; offset?: number;
  /** screen: characters per second and cursor character. */
  cps?: number; cursor?: string; lines?: number;
}
export const DYNAMIC_TYPES: { id: DynamicTextType; label: string }[] = [
  { id: 'none', label: 'Static text' }, { id: 'counter', label: 'Counter' }, { id: 'percent', label: 'Percent' },
  { id: 'timecode', label: 'Timecode' }, { id: 'countdown', label: 'Countdown' }, { id: 'screen', label: 'Screen / terminal' },
];
export const DYNAMIC_DEFAULT: DynamicText = { type: 'none', from: 0, to: 100, decimals: 0, duration: 2, delay: 0, prefix: '', suffix: '', thousands: true, ease: 'out', fps: 24, offset: 0, cps: 30, cursor: '▌', lines: 6 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeFn = (k: DynamicText['ease'], p: number) => (k === 'out' ? 1 - (1 - p) * (1 - p) * (1 - p) : k === 'inOut' ? (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) : p);

export function formatNumber(v: number, decimals = 0, thousands = true): string {
  const fixed = Math.abs(v).toFixed(Math.max(0, Math.min(6, decimals)));
  const [int, frac] = fixed.split('.');
  const grouped = thousands ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return (v < 0 ? '-' : '') + grouped + (frac ? '.' + frac : '');
}

export function formatTimecode(seconds: number, fps = 24, dropFrames = false): string {
  const s = Math.max(0, seconds); const f = Math.max(1, Math.round(fps));
  const total = Math.floor(s * f + 1e-6);
  const ff = total % f, ss = Math.floor(total / f) % 60, mm = Math.floor(total / (f * 60)) % 60, hh = Math.floor(total / (f * 3600));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}${dropFrames ? ';' : ':'}${p(ff)}`;
}

/** The text a title clip shows at clip-local time `t` (seconds). */
export function dynamicText(base: string, t: number, cfg: DynamicText | null | undefined, clipDuration = Infinity): string {
  if (!cfg || cfg.type === 'none') return base;
  const c = { ...DYNAMIC_DEFAULT, ...cfg };
  switch (c.type) {
    case 'counter':
    case 'percent': {
      const p = easeFn(c.ease, clamp01((t - (c.delay || 0)) / Math.max(.001, c.duration || 1)));
      const v = (c.from ?? 0) + ((c.to ?? 100) - (c.from ?? 0)) * p;
      return `${c.prefix || ''}${formatNumber(v, c.decimals, c.thousands)}${c.type === 'percent' ? '%' : ''}${c.suffix || ''}`;
    }
    case 'timecode': return `${c.prefix || ''}${formatTimecode((c.offset || 0) + t, c.fps)}${c.suffix || ''}`;
    case 'countdown': {
      const remain = Math.max(0, (c.from ?? 10) - t + (c.delay || 0));
      const mm = Math.floor(remain / 60), ss = Math.floor(remain % 60);
      return `${c.prefix || ''}${c.from && c.from >= 60 ? `${mm}:${String(ss).padStart(2, '0')}` : String(Math.ceil(remain))}${c.suffix || ''}`;
    }
    case 'screen': {
      // Terminal: the base text types on at `cps`; keeps the last `lines` lines; blinking cursor.
      const chars = Array.from(base);
      const n = Math.min(chars.length, Math.floor(Math.max(0, t - (c.delay || 0)) * (c.cps || 30)));
      const typed = chars.slice(0, n).join('');
      const lines = typed.split('\n'); const keep = lines.slice(-Math.max(1, c.lines || 6)).join('\n');
      const blink = Math.floor(t * 2) % 2 === 0;
      return keep + (n < chars.length || blink ? (c.cursor || '▌') : '');
    }
    default: return base;
  }
}

/** True while the text changes with time (renderers skip caching). */
export function isDynamicActive(t: number, cfg: DynamicText | null | undefined): boolean {
  if (!cfg || cfg.type === 'none') return false;
  if (cfg.type === 'timecode' || cfg.type === 'countdown' || cfg.type === 'screen') return true;
  return t <= (cfg.delay || 0) + (cfg.duration || 2) + .05;
}
