// services/melos/jam/clock.ts — shared musical time across machines in a jam. Pure.

/** Monotonic wall-clock ms shared by every message (performance timeline, not Date.now jitter). */
export const jamNow = () => performance.timeOrigin + performance.now();

/** Small cushion so a note sent "now" lands together on every machine despite network jitter. */
export const JAM_JITTER_MS = 30;

export interface ClockSample {
  /** Their clock minus ours. */
  offset: number;
  rtt: number;
}

/** NTP-style sample from one ping/pong: t0 sent (ours), t1 answered (theirs), t2 received (ours). */
export function clockSample(t0: number, t1: number, t2: number): ClockSample | null {
  const rtt = t2 - t0;
  if (!(rtt >= 0 && rtt < 5000)) return null;
  return { offset: t1 - (t0 + rtt / 2), rtt };
}

/** Best offset estimate: the sample measured with the lowest round trip (least queueing noise). */
export function bestOffset(samples: ClockSample[]): number {
  if (!samples.length) return 0;
  return samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
}

/** When a remote event stamped at `remoteT` (their clock) should sound here. */
export function localPlayTime(remoteT: number, offset: number, now: number, jitter = JAM_JITTER_MS): number {
  return Math.max(now, remoteT - offset + jitter);
}
