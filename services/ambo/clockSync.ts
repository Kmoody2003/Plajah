// clockSync — a shared timebase for video sync across machines.
//
// videoSync anchors every transport snapshot to wall-clock milliseconds. Windows on ONE machine share
// Date.now(), so that is exact. A follower on another machine has its own clock, typically off by
// 20 ms to several seconds, and a 4 Hz snapshot predicted against the wrong clock puts the clip that
// far out of step. This is the standard NTP exchange to measure the difference:
//
//   follower t0 --ping--> master t1 ... master t2 --pong--> follower t3
//   offset (master - follower) = ((t1 - t0) + (t2 - t3)) / 2      rtt = (t3 - t0) - (t2 - t1)
//
// Network delay is not symmetric in practice, so the estimate is only as good as the best round trip:
// keep the last few samples and use the one with the smallest rtt (the least queueing noise), error
// bounded by rtt / 2. A correction is applied only when it is clearly real (> MIN_OFFSET_MS and more
// than twice the error bound), so two windows on the same machine, whose "offset" is measurement
// noise, stay on exactly Date.now().
//
// Pure and injectable; the transport is the caller's (videoSync sends CPING/CPONG over its channel).

export interface PingSample { t0: number; t1: number; t2: number; t3: number }
export interface OffsetSample { offset: number; rtt: number }

export const MIN_OFFSET_MS = 40;     // below this, assume the clocks are the same clock
export const MAX_RTT_MS = 1500;      // a slower round trip says nothing useful
const KEEP = 8;

export function measure(s: PingSample): OffsetSample | null {
  const rtt = (s.t3 - s.t0) - (s.t2 - s.t1);
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > MAX_RTT_MS) return null;
  return { offset: ((s.t1 - s.t0) + (s.t2 - s.t3)) / 2, rtt };
}

export class ClockEstimator {
  private samples: OffsetSample[] = [];
  add(s: PingSample): boolean {
    const m = measure(s);
    if (!m) return false;
    this.samples.push(m);
    if (this.samples.length > KEEP) this.samples.shift();
    return true;
  }
  count() { return this.samples.length; }
  /** Offset (master - local) from the lowest-rtt sample, plus the error bound. */
  best(): { offset: number; error: number } | null {
    if (!this.samples.length) return null;
    let b = this.samples[0];
    for (const s of this.samples) if (s.rtt < b.rtt) b = s;
    return { offset: b.offset, error: b.rtt / 2 };
  }
  /** The offset to APPLY: 0 unless it is clearly bigger than the measurement can explain. */
  applied(): number {
    const b = this.best();
    if (!b) return 0;
    return Math.abs(b.offset) > Math.max(MIN_OFFSET_MS, b.error * 2) ? Math.round(b.offset) : 0;
  }
  reset() { this.samples = []; }
}

let offsetMs = 0;
export const setClockOffset = (ms: number) => { offsetMs = Number.isFinite(ms) ? ms : 0; };
export const getClockOffset = () => offsetMs;
/** The shared timebase: the master's wall clock, as seen from this window. */
export const clockNow = () => Date.now() + offsetMs;
