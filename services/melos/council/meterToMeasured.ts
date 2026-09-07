// meterToMeasured — turn a live Meter Bridge frame (services/shared/meterAnalyser) into the Music
// Council's MeasuredMix, so the council reasons on the SAME numbers the meter shows. The spectrum is
// split into the six tonal bands the genre profiles use, normalised 0..1 relative to the loudest band.
import type { MeterFrame } from '../../shared/meterAnalyser';
import type { MeasuredMix } from './musicCouncilTypes';

export function frameToMeasured(f: MeterFrame): MeasuredMix {
  const tp = Math.max(f.tpL ?? -Infinity, f.tpR ?? -Infinity);
  const spec = f.spectrum || new Float32Array(0);
  const n = spec.length;
  // dB → linear magnitude, then average within six equal (log-spaced) index segments = octave-ish bands.
  const seg = (a: number, b: number): number => {
    let s = 0, c = 0;
    for (let i = Math.floor(a * n); i < Math.floor(b * n) && i < n; i++) { s += Math.pow(10, spec[i] / 20); c++; }
    return c ? s / c : 0;
  };
  const bands = [seg(0, 1 / 6), seg(1 / 6, 2 / 6), seg(2 / 6, 3 / 6), seg(3 / 6, 4 / 6), seg(4 / 6, 5 / 6), seg(5 / 6, 1)];
  const max = Math.max(...bands, 1e-9);
  const [sub, low, lowMid, mid, highMid, high] = bands.map((x) => x / max);
  const out: MeasuredMix = { corr: Number.isFinite(f.corr) ? f.corr : undefined };
  if (Number.isFinite(f.lufsI) && f.lufsI > -70) out.lufsIntegrated = f.lufsI;
  if (Number.isFinite(tp)) out.truePeakDb = tp;
  if (out.lufsIntegrated != null && out.truePeakDb != null) out.plr = out.truePeakDb - out.lufsIntegrated;
  if (n > 0) out.tone = { sub, low, lowMid, mid, highMid, high };
  return out;
}
