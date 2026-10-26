/**
 * FAST ad-break planner — turns "this break is N seconds long" into ONE back-to-back timeline.
 *
 * Before this, a break was a wall-clock timer plus several things that each decided for themselves
 * when to play: spots cycled on `ended`, idents were overlaid at fixed offsets, the up-next card ran
 * on its own timeout. They stepped on each other (two audio tracks at once, an ident over a promo)
 * and the break timer cut whatever was playing mid-spot.
 *
 * Now every segment is placed up front, end to start, from probed durations:
 *   • segments never overlap, and the last one ends exactly at `totalSec`;
 *   • a spot is only scheduled if it fits whole — nothing is ever truncated;
 *   • whatever time is left over (the "odd" seconds) becomes Plajah FM (with the up-next card where
 *     it helps), which is the only thing allowed to stretch.
 */

export type BreakSegKind = 'ident' | 'spot' | 'image' | 'upnext' | 'fm';

export interface BreakSeg {
  id: string;
  kind: BreakSegKind;
  startSec: number;
  durSec: number;
  url?: string;
  title?: string;
}

export interface BreakCandidate { url: string; title: string; durSec: number }

export interface BreakPlanInput {
  /** Seconds from `startSec` to the end of the break. */
  totalSec: number;
  /** When the plan begins (probing can delay it a moment). The timeline before it is a silent slate. */
  startSec?: number;
  openIdent?: BreakCandidate | null;
  closeIdent?: BreakCandidate | null;
  spots: BreakCandidate[];
  /** Fixed-length still frames from the ad rail; only used when there are no video spots. */
  images?: BreakCandidate[];
  hasUpNext: boolean;
  rng?: () => number;
}

/** Plajah FM always gets at least this much of a break that is long enough to carry it. */
export const MIN_FM_SEC = 5;
export const MAX_UPNEXT_SEC = 8;
export const IMAGE_SPOT_SEC = 8;
/** A tail of leftover this long is worth its own FM + card segment (fade in/out + a readable card). */
const MIN_TAIL_SEC = 5;
/** Leftover beyond this is split between the head and tail so no single FM stretch drags. */
const SPLIT_ABOVE_SEC = 14;

const EPS = 1e-6;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function upNextLength(totalSec: number): number {
  return totalSec <= 15 ? Math.min(5, Math.max(3, Math.floor(totalSec * 0.35))) : Math.min(MAX_UPNEXT_SEC, Math.max(5, Math.floor(totalSec * 0.18)));
}

export function planBreak(input: BreakPlanInput): BreakSeg[] {
  const rng = input.rng || Math.random;
  const start = Math.max(0, input.startSec || 0);
  const end = Math.max(start, input.totalSec);
  let span = end - start;
  if (span <= 0) return [];

  const segs: BreakSeg[] = [];
  let n = 0;
  const push = (kind: BreakSegKind, durSec: number, extra?: Partial<BreakSeg>) => {
    if (durSec <= EPS) return;
    segs.push({ id: `s${n++}`, kind, startSec: 0, durSec, ...extra });
  };

  // Idents bracket the break; they are only taken when the break stays comfortably longer than them.
  const open = input.openIdent && input.openIdent.durSec + MIN_FM_SEC + 2 <= span ? input.openIdent : null;
  span -= open ? open.durSec : 0;
  const close = input.closeIdent && span >= 45 - (open?.durSec || 0) && input.closeIdent.durSec + MIN_FM_SEC + 2 <= span ? input.closeIdent : null;
  span -= close ? close.durSec : 0;

  // Reserve Plajah FM's share first (head card), then spend the rest on whole spots.
  const upNext = input.hasUpNext ? upNextLength(span) : 0;
  const reserve = span >= 12 ? Math.max(upNext, MIN_FM_SEC) : span;
  const room = span - reserve;

  const video = input.spots.filter(s => s.durSec > 0.5);
  const pool = video.length ? video : (input.images || []).map(i => ({ ...i, durSec: IMAGE_SPOT_SEC }));
  const kind: BreakSegKind = video.length ? 'spot' : 'image';

  // Several random greedy fills; keep the one that leaves the least FM filler and repeats the least.
  let best: BreakCandidate[] = [];
  let bestScore = Infinity;
  if (pool.length && room >= 1) {
    for (let attempt = 0; attempt < 48; attempt++) {
      const order = [...pool];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const pick: BreakCandidate[] = [];
      let used = 0;
      for (const c of order) {
        if (used + c.durSec > room + EPS) continue;
        if (pick.length && pick[pick.length - 1].url === c.url) continue; // never the same spot twice in a row
        pick.push(c); used += c.durSec;
      }
      const urls = new Set(pick.map(p => p.url));
      const score = (room - used) + (pick.length - urls.size) * 3;
      if (score < bestScore - EPS) { best = pick; bestScore = score; }
      if (bestScore < EPS) break;
    }
  }

  const spotsSec = best.reduce((a, c) => a + c.durSec, 0);
  const leftover = Math.max(0, room - spotsSec);
  let head = reserve;
  let tail = 0;
  if (best.length) {
    if (leftover > SPLIT_ABOVE_SEC) { tail = round3(leftover / 2); head += leftover - tail; }
    else if (leftover >= MIN_TAIL_SEC + 1) { tail = leftover; }
    else head += leftover;
  } else {
    head += leftover;
  }

  if (open) push('ident', open.durSec, { url: open.url, title: open.title });
  // Head: the up-next card, then plain Plajah FM for any remainder. Audio runs straight through both.
  if (upNext > 0 && head > upNext + EPS) { push('upnext', upNext); push('fm', head - upNext); }
  else push(upNext > 0 ? 'upnext' : 'fm', head);
  for (const c of best) push(kind, c.durSec, { url: c.url, title: c.title });
  if (tail > EPS) push(input.hasUpNext && tail >= MIN_TAIL_SEC ? 'upnext' : 'fm', tail);
  if (close) push('ident', close.durSec, { url: close.url, title: close.title });

  // Lay out back to back. The final segment is stretched/trimmed by float residue so it ends exactly at `end`.
  let t = start;
  for (const s of segs) { s.startSec = round3(t); t += s.durSec; }
  const last = segs[segs.length - 1];
  if (last) last.durSec = round3(end - last.startSec);
  return segs;
}

/** The segment on air at `elapsedSec`, or null once the break is over. */
export function segmentAt(plan: BreakSeg[], elapsedSec: number): { index: number; seg: BreakSeg } | null {
  for (let i = 0; i < plan.length; i++) {
    if (elapsedSec < plan[i].startSec + plan[i].durSec) return elapsedSec >= plan[i].startSec ? { index: i, seg: plan[i] } : null;
  }
  return null;
}

/** Does this segment carry Plajah FM underneath? (spots, images and idents bring their own sound.) */
export const segHasFm = (k: BreakSegKind) => k === 'fm' || k === 'upnext';

/**
 * Plajah FM gain at `elapsedSec`: 1 inside a run of consecutive FM segments, ramping up over `fadeSec`
 * as the run starts and down over `fadeSec` as it ends. 0 everywhere else, so FM can never sound under a spot.
 */
export function fmGainAt(plan: BreakSeg[], elapsedSec: number, fadeSec = 1.2): number {
  let i = plan.findIndex(s => elapsedSec >= s.startSec && elapsedSec < s.startSec + s.durSec);
  if (i < 0 || !segHasFm(plan[i].kind)) return 0;
  let a = i; while (a > 0 && segHasFm(plan[a - 1].kind)) a--;
  let b = i; while (b < plan.length - 1 && segHasFm(plan[b + 1].kind)) b++;
  const runStart = plan[a].startSec;
  const runEnd = plan[b].startSec + plan[b].durSec;
  const f = Math.min(fadeSec, (runEnd - runStart) / 2);
  if (f <= EPS) return 1;
  return Math.max(0, Math.min(1, Math.min((elapsedSec - runStart) / f, (runEnd - elapsedSec) / f)));
}

/** Dip-to-black opacity at a segment edge, so cuts between spots / FM / programming never pop. */
export function edgeDipAt(plan: BreakSeg[], elapsedSec: number, dipSec = 0.3): number {
  const s = plan.find(x => elapsedSec >= x.startSec && elapsedSec < x.startSec + x.durSec);
  if (!s) return 0;
  const d = Math.min(dipSec, s.durSec / 3);
  const into = elapsedSec - s.startSec;
  const left = s.startSec + s.durSec - elapsedSec;
  return Math.max(0, 1 - into / d, 1 - left / d);
}

// ── Duration probing ────────────────────────────────────────────────────────────────────────────

const probed = new Map<string, number>(); // url → seconds (0 = unplayable)

/** Real duration of a media file via its metadata. Cached; resolves 0 for unplayable / slow files. */
export function probeDuration(url: string, timeoutMs = 1500): Promise<number> {
  if (probed.has(url)) return Promise.resolve(probed.get(url)!);
  if (typeof document === 'undefined') return Promise.resolve(0);
  return new Promise(resolve => {
    const v = document.createElement('video');
    let done = false;
    // Only a real answer is cached: a slow network must not blacklist a good spot for the session.
    const finish = (d: number, cache: boolean) => {
      if (done) return; done = true;
      clearTimeout(timer);
      v.removeAttribute('src'); try { v.load(); } catch { /* */ }
      if (cache) probed.set(url, d);
      resolve(d);
    };
    const timer = setTimeout(() => finish(0, false), timeoutMs);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { const d = Number.isFinite(v.duration) ? Math.floor(v.duration * 1000) / 1000 : 0; finish(d, d > 0); };
    v.onerror = () => finish(0, true);
    v.src = url;
  });
}
