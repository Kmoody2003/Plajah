// kaijuDanceCommon — what the 2D and 3D Kaiju stages share about their mocap dances: the clip metadata,
// the beat-matched playback speed and the style/energy-aware choice of the next dance. No three.js, no DOM.

export type DanceStyle = 'zen' | 'edm' | 'rock' | 'ballet' | 'groove' | 'greet';

export interface DanceMeta {
  id: string; name: string; styles: DanceStyle[]; frames: number; duration: number;
  /** 0 = barely moving … 1 = flat out. */
  energy: number;
  /** Natural pulse of the dance in seconds (only trustworthy when beatConf ≥ 0.35). */
  beat: number; beatConf: number; offset: number;
  /** v2 bakes only (all optional): what the clip is. Absent = a plain dance. */
  kind?: 'dance' | 'walk' | 'run' | 'turn' | 'stand' | 'idle';
  loop?: boolean; gait?: 'walk' | 'run'; role?: 'start' | 'stop';
  /** planted ground speed, m/s (kaiju world) */
  speed?: number; speedHuman?: number; stride?: number; cycleSec?: number; yawDeg?: number;
}

/** Only real dances (locomotion / stand / idle clips have styles: [] and would pollute the fallback pool). */
export const isDance = (m: DanceMeta) => !m.kind || m.kind === 'dance';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Playback speed that lines a dance's own pulse up with the music (falls back to a tempo-based guess). */
export function danceTimeScale(meta: DanceMeta, bpm: number): number {
  const q = 60 / Math.max(40, Math.min(220, bpm || 110));
  if (meta.beatConf >= 0.35 && meta.beat > 0.2) {
    let ts = meta.beat / q;                       // clip pulse / music pulse
    while (ts > 1.5) ts /= 2;
    while (ts < 0.7) ts *= 2;
    return clamp(ts, 0.7, 1.5);
  }
  return clamp(0.4 + (bpm || 110) / 200, 0.65, 1.4);
}

/** Choose the next dance: style-tagged, closest to the music's energy, never one of the recent few. */
export function pickDance(metas: DanceMeta[], style: string, energy: number, recent: string[], rnd: () => number = Math.random): DanceMeta | null {
  const tag = (m: DanceMeta, s: string) => m.styles.includes(s as DanceStyle);
  metas = metas.filter(isDance);
  let pool = metas.filter(m => tag(m, style));
  if (style === 'edm' || style === 'rock') pool = pool.concat(metas.filter(m => tag(m, 'groove') && !pool.includes(m)));
  if (pool.length < 3) pool = metas.filter(m => !tag(m, 'greet'));
  const scored = pool.map(m => {
    const dEn = Math.abs(m.energy - energy);
    const rec = recent.indexOf(m.id);
    return { m, w: Math.exp(-dEn * 3.2) * (rec >= 0 ? 0.04 + 0.1 * (rec / Math.max(1, recent.length)) : 1) };
  });
  const total = scored.reduce((a, s) => a + s.w, 0); if (total <= 0) return pool[0] ?? null;
  let r = rnd() * total; for (const s of scored) { r -= s.w; if (r <= 0) return s.m; }
  return scored[scored.length - 1].m;
}
