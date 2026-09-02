// titleDynamic — dynamic title text (Universe Numbers / Screen Text / Type-On terminal class).
// A title clip may carry `tDynamic`; the displayed text becomes a pure function of the clip's
// text and clip-local time, used identically by the DOM monitor and the canvas export.
export type DynamicTextType = 'none' | 'counter' | 'timecode' | 'countdown' | 'screen' | 'percent' | 'datatile';
export interface DynamicText {
  type: DynamicTextType;
  /** counter / percent: value range and timing. */
  from?: number; to?: number; decimals?: number; duration?: number; delay?: number;
  prefix?: string; suffix?: string; thousands?: boolean; ease?: 'linear' | 'out' | 'inOut';
  /** timecode: frames per second and start offset (seconds). countdown: seconds from `from`. */
  fps?: number; offset?: number;
  /** screen: characters per second and cursor character. */
  cps?: number; cursor?: string; lines?: number;
  /** datatile: columns x rows of generated data (Universe Text Tile), refreshed rate/s.
   *  Column kinds letter string: n numbers, h hex, w words, t time, p percent, i id. */
  columns?: number; rows?: number; rate?: number; kinds?: string;
}
export const DYNAMIC_TYPES: { id: DynamicTextType; label: string }[] = [
  { id: 'none', label: 'Static text' }, { id: 'counter', label: 'Counter' }, { id: 'percent', label: 'Percent' },
  { id: 'timecode', label: 'Timecode' }, { id: 'countdown', label: 'Countdown' }, { id: 'screen', label: 'Screen / terminal' },
  { id: 'datatile', label: 'Data tile (columns)' },
];
export const DYNAMIC_DEFAULT: DynamicText = { type: 'none', from: 0, to: 100, decimals: 0, duration: 2, delay: 0, prefix: '', suffix: '', thousands: true, ease: 'out', fps: 24, offset: 0, cps: 30, cursor: '▌', lines: 6, columns: 4, rows: 6, rate: 4, kinds: 'nhwp' };

const TILE_WORDS = ['SYNC', 'LOCK', 'DELTA', 'ORBIT', 'NODE', 'RELAY', 'PULSE', 'GRID', 'FLUX', 'VECTOR', 'SCAN', 'ARRAY', 'CORE', 'LINK', 'PHASE', 'DRIFT', 'GAIN', 'SIGNAL', 'TRACE', 'BUFFER'];
const th = (i: number, j: number, k: number) => { const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return x - Math.floor(x); };
/** Deterministic generated data grid (Universe Text Tile): kinds per column, refreshed at rate/s. */
export function dataTile(t: number, columns = 4, rows = 6, rate = 4, kinds = 'nhwp'): string {
  const tick = Math.floor(t * Math.max(.1, rate));
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < columns; c++) {
      const kind = kinds[c % Math.max(1, kinds.length)] || 'n';
      const h = th(r, c, tick + (kind === 't' ? 0 : Math.floor(th(r, c, 1) * 7)));
      switch (kind) {
        case 'h': cells.push(Math.floor(h * 0xffff).toString(16).toUpperCase().padStart(4, '0')); break;
        case 'w': cells.push(TILE_WORDS[Math.floor(h * TILE_WORDS.length)]); break;
        case 't': cells.push(formatTimecode(t * (1 + r * .37) + r * 61, 24)); break;
        case 'p': cells.push((h * 100).toFixed(1).padStart(5, ' ') + '%'); break;
        case 'i': cells.push('ID-' + Math.floor(h * 900 + 100)); break;
        default: cells.push((h * 9999).toFixed(2).padStart(8, ' '));
      }
    }
    lines.push(cells.join('  '));
  }
  return lines.join('\n');
}

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
    case 'datatile': return dataTile(t, c.columns, c.rows, c.rate, c.kinds);
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
  if (cfg.type === 'timecode' || cfg.type === 'countdown' || cfg.type === 'screen' || cfg.type === 'datatile') return true;
  return t <= (cfg.delay || 0) + (cfg.duration || 2) + .05;
}
