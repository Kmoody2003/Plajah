// Show Director — the film-director engine for photo shows.
//
// Reads every photo for story: when it was taken (EXIF, else the file date), what it looks
// like (a small colour + structure fingerprint), how many people, how warm/bright/old it
// feels, and — when the vision pass has run — what is happening in it (occasion, setting,
// mood, emotional intensity). From that it:
//   1. finds EVENTS — runs of photos from the same day/occasion (time gaps + visual likeness),
//   2. names them ("Summer 1987", "Wedding · June 1972", "Christmas"),
//   3. orders the show for emotional punch:
//        story   — the life told in order, each event a scene
//        feeling — calm opening → rising warmth and people → a joyful peak around 70% →
//                  quiet reflection → the closing portrait,
//   4. shapes each event like a scene: an establishing shot first, the strongest moment last,
//   5. saves the single best portrait for the final photo and gives key shots more time.
// Everything here runs on-device. The optional vision context comes from directorVision.ts.

import type { ShowPhoto } from './types';
import { uprightTrimmed } from './photoPrep';

export type DirectorStyle = 'story' | 'feeling';
export type DirectorRole = 'opening' | 'establish' | 'moment' | 'button' | 'peak' | 'hero';

export interface VisionContext {
  caption: string;
  setting?: string;
  occasion?: string;
  people?: number;
  mood?: string;
  era?: string;
  /** 0..1 — how much feeling the picture carries (laughter, embrace, tears, a held gaze). */
  emotion?: number;
  /** 0..1 — energy: celebration, motion, crowds vs. stillness. */
  energy?: number;
  tags?: string[];
  /** The vision model's read: a photograph, or a designed graphic. */
  kind?: 'photo' | 'graphic';
}

export interface PhotoFeatures {
  hist: Float32Array;     // 36-bin hue/sat/grey histogram, L1-normalised
  grid: Float32Array;     // 8×8 luminance layout, zero-mean
  brightness: number;
  warmth: number;
  colorfulness: number;
  mono: boolean;          // black & white / sepia — usually an older print
}

export interface DirectedEvent { id: string; label: string; photos: string[]; start?: number; end?: number; occasion?: string }

export interface DirectorResult {
  /** Photo ids in show order. */
  order: string[];
  events: DirectedEvent[];
  roles: Record<string, DirectorRole>;
  weights: Record<string, number>;
  /** Short plain-language notes on the choices made (shown in the studio). */
  notes: string[];
}

const featCache = new Map<string, Promise<PhotoFeatures>>();

export function photoFeatures(p: ShowPhoto): Promise<PhotoFeatures> {
  let f = featCache.get(p.id);
  if (!f) { f = computeFeatures(p); featCache.set(p.id, f); f.catch(() => featCache.delete(p.id)); }
  return f;
}

async function computeFeatures(p: ShowPhoto): Promise<PhotoFeatures> {
  const bmp = await uprightTrimmed(p);
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data;
  const hist = new Float32Array(36);
  const grid = new Float32Array(64);
  let lum = 0, warm = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0, satSum = 0;
  const n = 48 * 48;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const s = mx ? (mx - mn) / mx : 0;
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    satSum += s;
    if (s < 0.15) hist[24 + Math.min(11, Math.floor(l * 12))] += 1;
    else {
      let h = 0;
      if (mx === r) h = ((gg - b) / (mx - mn) + 6) % 6; else if (mx === gg) h = (b - r) / (mx - mn) + 2; else h = (r - gg) / (mx - mn) + 4;
      hist[Math.min(11, Math.floor((h / 6) * 12)) + (s > 0.5 ? 12 : 0)] += 1;
    }
    const x = j % 48, y = (j / 48) | 0;
    grid[((y / 6) | 0) * 8 + ((x / 6) | 0)] += l / 36;
    lum += l; warm += r - b;
    const a = r - gg, bb = 0.5 * (r + gg) - b;
    rg += a; yb += bb; rg2 += a * a; yb2 += bb * bb;
  }
  for (let k = 0; k < 36; k++) hist[k] /= n;
  const gm = grid.reduce((s, v) => s + v, 0) / 64;
  for (let k = 0; k < 64; k++) grid[k] -= gm;
  const mrg = rg / n, myb = yb / n;
  const colorfulness = Math.sqrt(Math.max(0, rg2 / n - mrg * mrg) + Math.max(0, yb2 / n - myb * myb)) + 0.3 * Math.hypot(mrg, myb);
  return { hist, grid, brightness: lum / n, warmth: warm / n, colorfulness, mono: satSum / n < 0.07 };
}

/** 0..1 visual likeness (colour histogram intersection + layout correlation). */
export function likeness(a: PhotoFeatures, b: PhotoFeatures) {
  let inter = 0;
  for (let k = 0; k < 36; k++) inter += Math.min(a.hist[k], b.hist[k]);
  let ab = 0, aa = 0, bb = 0;
  for (let k = 0; k < 64; k++) { ab += a.grid[k] * b.grid[k]; aa += a.grid[k] ** 2; bb += b.grid[k] ** 2; }
  const corr = aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  return 0.7 * inter + 0.3 * (corr * 0.5 + 0.5);
}

const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];

function eventLabel(times: number[], occasion?: string) {
  const dated = times.filter((t) => t > 0);
  let when = '';
  if (dated.length) {
    const d0 = new Date(Math.min(...dated)), d1 = new Date(Math.max(...dated));
    const sameDay = d0.toDateString() === d1.toDateString();
    when = sameDay && dated.length > 1
      ? d0.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      : `${SEASONS[d0.getMonth()]} ${d0.getFullYear()}`;
  }
  const occ = occasion ? occasion.replace(/^\w/, (c) => c.toUpperCase()) : '';
  return occ && when ? `${occ} · ${when}` : occ || when || 'Moments';
}

/** Emotional weight of a photo for ordering and timing. */
function feeling(p: ShowPhoto, f: PhotoFeatures) {
  const v = p.context;
  const people = v?.people ?? p.faces;
  const emotion = v?.emotion ?? Math.min(1, 0.25 + Math.min(people, 4) * 0.12 + p.interest * 0.25);
  const energy = v?.energy ?? Math.min(1, Math.min(people, 6) * 0.1 + f.colorfulness * 0.8 + f.brightness * 0.2);
  const portrait = people === 1 && p.height >= p.width * 0.95 ? 1 : people === 1 ? 0.7 : 0;
  return { emotion, energy, portrait, people };
}

export interface DirectOptions {
  style?: DirectorStyle;
  /** Keep the user's manual order inside each event (only regroup + arc). */
  respectOrder?: boolean;
}

export async function directShow(photos: ShowPhoto[], opts: DirectOptions = {}): Promise<DirectorResult> {
  const style = opts.style ?? 'story';
  const notes: string[] = [];
  if (!photos.length) return { order: [], events: [], roles: {}, weights: {}, notes };
  const feats = await Promise.all(photos.map((p) => photoFeatures(p).catch(() => null)));
  const F = (i: number) => feats[i] || { hist: new Float32Array(36), grid: new Float32Array(64), brightness: 0.5, warmth: 0, colorfulness: 0.3, mono: false };
  const idx = photos.map((_, i) => i);
  // File dates are only a hint: a copied folder often stamps every file with the copy time.
  // Trust them when they spread out like real capture times (more than a day, not bunched).
  const fileTimes = photos.filter((p) => p.timeSource === 'file' && p.takenAt).map((p) => p.takenAt!).sort((a, b) => a - b);
  const distinct = new Set(fileTimes.map((t) => Math.round(t / 60_000))).size;
  const fileUseful = fileTimes.length > 1 && fileTimes[fileTimes.length - 1] - fileTimes[0] > 86_400_000 && distinct >= fileTimes.length * 0.6;
  const time = (i: number) => {
    const p = photos[i];
    if (p.timeSource === 'exif' || p.timeSource === 'user') return p.takenAt || 0;
    return p.timeSource === 'file' && fileUseful ? p.takenAt || 0 : 0;
  };
  if (fileTimes.length && !fileUseful) notes.push('File dates look like copy times, so they were ignored.');

  // 1. events ----------------------------------------------------------------------------
  const dated = idx.filter((i) => time(i) > 0).sort((a, b) => time(a) - time(b));
  const undated = idx.filter((i) => !(time(i) > 0));
  const gaps = dated.slice(1).map((i, k) => time(i) - time(dated[k]));
  const med = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;
  const H = 3600_000;
  const splitGap = Math.max(2.5 * H, Math.min(36 * H, med * 4));
  const groups: number[][] = [];
  for (const i of dated) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    const gap = prev != null ? time(i) - time(prev) : Infinity;
    const sameOccasion = prev != null && photos[i].context?.occasion && photos[i].context?.occasion === photos[prev].context?.occasion && gap < 72 * H;
    const looksAlike = prev != null && likeness(F(i), F(prev)) > 0.62 && gap < 8 * H;
    if (g && (gap <= splitGap || sameOccasion || looksAlike)) g.push(i); else groups.push([i]);
  }
  // undated: join the most alike dated event, or cluster among themselves
  for (const i of undated) {
    let best = -1, bs = 0;
    groups.forEach((g, k) => {
      const s = g.reduce((m, j) => Math.max(m, likeness(F(i), F(j)) + (photos[i].context?.occasion && photos[i].context?.occasion === photos[j].context?.occasion ? 0.2 : 0)), 0);
      if (s > bs) { bs = s; best = k; }
    });
    if (best >= 0 && bs > 0.66) groups[best].push(i); else groups.push([i]);
  }
  if (undated.length) notes.push(`${undated.length} photo${undated.length > 1 ? 's have' : ' has'} no capture date — placed by look${photos.some((p) => p.context) ? ' and content' : ''}.`);

  const occasionOf = (g: number[]) => {
    const counts = new Map<string, number>();
    for (const i of g) { const o = photos[i].context?.occasion; if (o && o !== 'everyday' && o !== 'unknown') counts.set(o, (counts.get(o) || 0) + 1); }
    let best = '', c = 0;
    for (const [k, v] of counts) if (v > c) { best = k; c = v; }
    return c >= Math.max(1, g.length / 3) ? best : undefined;
  };
  const events: DirectedEvent[] = groups.map((g, k) => {
    const ts = g.map(time);
    const dts = ts.filter((t) => t > 0);
    return { id: `ev${k}`, label: eventLabel(ts, occasionOf(g)), photos: g.map((i) => photos[i].id), start: dts.length ? Math.min(...dts) : undefined, end: dts.length ? Math.max(...dts) : undefined, occasion: occasionOf(g) };
  });

  // 2. the hero: the strongest single portrait closes the show ---------------------------
  const fe = idx.map((i) => feeling(photos[i], F(i)));
  let hero = -1, hs = -1;
  for (const i of idx) {
    const s = fe[i].portrait * 1.2 + fe[i].emotion + photos[i].interest * 0.5 + (photos[i].pinned ? 2 : 0);
    if (fe[i].portrait > 0 && s > hs) { hs = s; hero = i; }
  }

  // 3. order inside each event: establishing → time → strongest moment last ---------------
  const roles: Record<string, DirectorRole> = {};
  const weights: Record<string, number> = {};
  const evOrder: number[][] = groups.map((g) => {
    let seq = [...g].filter((i) => i !== hero);
    if (!opts.respectOrder) seq.sort((a, b) => (time(a) || 0) - (time(b) || 0) || photos.indexOf(photos[a]) - photos.indexOf(photos[b]));
    if (seq.length >= 3 && !opts.respectOrder) {
      // establishing shot: fewest people, most scene
      let est = seq[0], es = Infinity;
      for (const i of seq) { const s = fe[i].people * 2 - photos[i].interest; if (s < es) { es = s; est = i; } }
      seq = [est, ...seq.filter((i) => i !== est)];
      roles[photos[est].id] = 'establish';
      // button: the most emotional moment ends the scene
      let btn = seq[seq.length - 1], bsc = -1;
      for (const i of seq.slice(1)) if (fe[i].emotion > bsc) { bsc = fe[i].emotion; btn = i; }
      seq = [...seq.filter((i) => i !== btn), btn];
      roles[photos[btn].id] = 'button';
    }
    return seq;
  }).filter((s) => s.length);

  // 4. order the events -------------------------------------------------------------------
  const evIdx = evOrder.map((_, k) => k);
  const evTime = (k: number) => { const ts = evOrder[k].map(time).filter((t) => t > 0); return ts.length ? Math.min(...ts) : NaN; };
  const evEnergy = (k: number) => evOrder[k].reduce((s, i) => s + fe[i].energy + fe[i].emotion * 0.5, 0) / evOrder[k].length;
  const evMono = (k: number) => evOrder[k].filter((i) => F(i).mono).length / evOrder[k].length;
  let ordered: number[];
  if (style === 'story') {
    // chronological; undated events slot in by era (older-looking prints earlier)
    ordered = [...evIdx].sort((a, b) => {
      const ta = evTime(a), tb = evTime(b);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
      if (isNaN(ta) && isNaN(tb)) return evMono(b) - evMono(a);
      return isNaN(ta) ? (evMono(a) > 0.5 ? -1 : 1) : (evMono(b) > 0.5 ? 1 : -1);
    });
    notes.push('Told as a life story: events in the order they happened.');
  } else {
    // feeling arc: calm open, build to a peak at ~70%, then quiet down
    const byEnergy = [...evIdx].sort((a, b) => evEnergy(a) - evEnergy(b));
    const m = byEnergy.length;
    const slots = new Array<number>(m);
    const peakAt = Math.max(0, Math.round((m - 1) * 0.7));
    // assign highest energy to the peak, then alternate outward: rising side gets the next ones
    const positions = Array.from({ length: m }, (_, k) => k).sort((a, b) => {
      const da = a <= peakAt ? (peakAt - a) * 1.0 : (a - peakAt) * 1.6;
      const db = b <= peakAt ? (peakAt - b) * 1.0 : (b - peakAt) * 1.6;
      return da - db;
    });
    const desc = [...byEnergy].reverse();
    positions.forEach((pos, k) => { slots[pos] = desc[k]; });
    ordered = slots;
    const peak = evOrder[ordered[peakAt]];
    if (peak) { let best = peak[0]; for (const i of peak) if (fe[i].energy > fe[best].energy) best = i; roles[photos[best].id] = 'peak'; }
    notes.push('Shaped for feeling: a gentle open, a joyful peak about two-thirds in, then a quiet close.');
  }

  const order: number[] = [];
  for (const k of ordered) order.push(...evOrder[k]);
  if (hero >= 0) { order.push(hero); roles[photos[hero].id] = 'hero'; notes.push('The strongest portrait is held for the last photo.'); }
  if (order.length) roles[photos[order[0]].id] ??= 'opening';
  if (order.length && roles[photos[order[0]].id] === 'establish') roles[photos[order[0]].id] = 'opening';

  const W: Record<DirectorRole, number> = { opening: 1.15, establish: 0.9, moment: 1, button: 1.15, peak: 1.1, hero: 1.45 };
  for (const p of photos) weights[p.id] = W[roles[p.id] || 'moment'];
  const orderedEvents = ordered.map((k) => events[k]).filter(Boolean);
  if (hero >= 0) {
    // the hero leaves its event and closes the show as its own beat
    for (const e of orderedEvents) e.photos = e.photos.filter((id) => id !== photos[hero].id);
    orderedEvents.push({ id: 'hero', label: '', photos: [photos[hero].id] });
  }
  notes.unshift(`${orderedEvents.filter((e) => e.photos.length && e.id !== 'hero').length} events found in ${photos.length} photos.`);
  return { order: order.map((i) => photos[i].id), events: orderedEvents.filter((e) => e.photos.length), roles, weights, notes };
}

/** Apply a director result to a photo list (order + event + role + weight on each photo). */
export function applyDirection(photos: ShowPhoto[], r: DirectorResult): ShowPhoto[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const evOf = new Map<string, DirectedEvent>();
  for (const e of r.events) for (const id of e.photos) evOf.set(id, e);
  const out: ShowPhoto[] = r.order.map((id) => byId.get(id)).filter((p): p is ShowPhoto => !!p).map((p): ShowPhoto => ({
    ...p, event: evOf.get(p.id)?.id, eventLabel: evOf.get(p.id)?.label, role: r.roles[p.id] || 'moment', directorWeight: r.weights[p.id] ?? 1,
  }));
  // anything the director didn't place (shouldn't happen) keeps its spot at the end
  for (const p of photos) if (!out.some((q) => q.id === p.id)) out.push(p);
  return out;
}
