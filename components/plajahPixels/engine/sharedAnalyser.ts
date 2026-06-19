// Shared per-frame analyser.
//
// The studio composites many layers, and each one independently called
// analyser.getByteFrequencyData() / getByteTimeDomainData() every frame — so a
// composite of N layers did N FFT reads + N typed-array allocations per displayed
// frame, all serialized on the single main thread. The FFT recompute is wasted
// (the spectrum doesn't change within one frame) and the per-frame allocations
// churn the GC, which is a classic source of micro-stutter.
//
// This wraps the real AnalyserNode in a Proxy so the actual FFT read happens AT
// MOST ONCE per frame — keyed by a frame clock the studio bumps once per rAF —
// and every layer's call just copies from a shared cache. The audio graph itself
// (connect / disconnect / context / params) is forwarded untouched to the real
// node, so wiring and recording are unaffected.

export interface FrameClock { id: number }

export function makeSharedAnalyser(real: AnalyserNode, clock: FrameClock): AnalyserNode {
  const freqCache = new Uint8Array(real.frequencyBinCount);
  const timeCache = new Uint8Array(real.fftSize);
  let freqFrame = -1, timeFrame = -1;

  const getByteFrequencyData = (arr: Uint8Array) => {
    if (freqFrame !== clock.id) { real.getByteFrequencyData(freqCache); freqFrame = clock.id; }
    const n = Math.min(arr.length, freqCache.length);
    arr.set(n === freqCache.length ? freqCache : freqCache.subarray(0, n));
  };
  const getByteTimeDomainData = (arr: Uint8Array) => {
    if (timeFrame !== clock.id) { real.getByteTimeDomainData(timeCache); timeFrame = clock.id; }
    const n = Math.min(arr.length, timeCache.length);
    arr.set(n === timeCache.length ? timeCache : timeCache.subarray(0, n));
  };

  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'getByteFrequencyData') return getByteFrequencyData;
      if (prop === 'getByteTimeDomainData') return getByteTimeDomainData;
      const v: any = (target as any)[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
    set(target, prop, value) { (target as any)[prop] = value; return true; },
  }) as AnalyserNode;
}
