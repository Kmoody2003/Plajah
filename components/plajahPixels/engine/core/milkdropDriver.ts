// milkdropDriver.ts — run a Milkdrop (butterchurn) preset and expose its canvas so it
// can be composited into the Pixels single-surface pipeline (live preview AND offline
// export). The trick that makes milkdrop frame-steppable (it normally isn't): instead
// of sampling a live AnalyserNode, we OVERRIDE butterchurn's sampleAudio() and feed it
// the stored per-frame waveform via its own time-domain buffers. With a fixed clock and
// a deterministic waveform, sequential viz.render() calls become reproducible — exactly
// what the offline renderer needs. Without an injected waveform it falls back to the
// connected live analyser (normal real-time behaviour).

let bcPromise: Promise<{ butterchurn: any; presets: Record<string, any>; names: string[] }> | null = null;
async function loadButterchurn() {
  if (!bcPromise) {
    bcPromise = (async () => {
      const [bcMod, presetMod] = await Promise.all([import('butterchurn'), import('butterchurn-presets')]);
      const butterchurn: any = (bcMod as any).default || bcMod;
      const presetApi: any = (presetMod as any).default || presetMod;
      const presets: Record<string, any> = (presetApi.getPresets ? presetApi.getPresets() : presetApi) || {};
      return { butterchurn, presets, names: Object.keys(presets) };
    })();
  }
  return bcPromise;
}

export interface MilkdropDriver {
  canvas: HTMLCanvasElement;
  presetCount: number;
  setPreset(indexOrName: number | string, blendSeconds?: number): void;
  /** Render one frame. Pass a byte waveform (128 = silence) to drive deterministically;
   *  omit it to use the connected live analyser. */
  renderFrame(wave?: Uint8Array | null): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export async function createMilkdropDriver(opts: {
  width: number; height: number; audioCtx: AudioContext; analyser?: AnalyserNode | null; fps?: number;
}): Promise<MilkdropDriver | null> {
  try {
    const { butterchurn, presets, names } = await loadButterchurn();
    if (!names.length) return null;
    const fps = opts.fps || 30;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, opts.width); canvas.height = Math.max(2, opts.height);
    const viz: any = butterchurn.createVisualizer(opts.audioCtx, canvas, {
      width: canvas.width, height: canvas.height,
      pixelRatio: 1, textureRatio: 1,
    });

    // Deterministic-injection buffer: butterchurn's render() accepts an `audioLevels`
    // of time-domain bytes (128 = silence) AND an `elapsedTime` — passing both pins its
    // clock to the render fps and feeds OUR waveform, so frames are reproducible.
    const fftSize: number = viz.audio?.fftSize || 1024;
    const inj = new Uint8Array(fftSize).fill(128);
    if (opts.analyser) { try { viz.connectAudio(opts.analyser); } catch { /* */ } }

    const setPreset = (which: number | string, blend = 0) => {
      let name: string;
      if (typeof which === 'string') name = names.includes(which) ? which : names[0];
      else name = names[((which % names.length) + names.length) % names.length];
      try { viz.loadPreset(presets[name], blend); } catch { /* */ }
    };

    return {
      canvas,
      presetCount: names.length,
      setPreset,
      renderFrame(wave?: Uint8Array | null) {
        try {
          if (wave && wave.length) {
            upsampleInto(wave, inj);
            viz.render({ audioLevels: { timeByteArray: inj, timeByteArrayL: inj, timeByteArrayR: inj }, elapsedTime: 1 / fps });
          } else {
            viz.render();   // live: sample the connected analyser, wall-clock timing
          }
        } catch { /* frame skip */ }
      },
      resize(w: number, h: number) {
        canvas.width = Math.max(2, w); canvas.height = Math.max(2, h);
        try { viz.setRendererSize(canvas.width, canvas.height); } catch { /* */ }
      },
      dispose() { try { viz.disconnectAudio?.(opts.analyser); } catch { /* */ } },
    };
  } catch (e) {
    console.warn('[milkdropDriver] butterchurn unavailable:', e);
    return null;
  }
}

// Resample a short byte waveform (e.g. 128 samples) up to butterchurn's fftSize buffer
// (e.g. 1024), linearly interpolated. Low-res but deterministic and reactive.
function upsampleInto(src: Uint8Array, dst: Uint8Array) {
  const n = dst.length, m = src.length;
  if (m < 2) { dst.fill(src[0] ?? 128); return; }
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (m - 1);
    const a = Math.floor(x), b = Math.min(m - 1, a + 1), f = x - a;
    dst[i] = (src[a] * (1 - f) + src[b] * f) | 0;
  }
}
