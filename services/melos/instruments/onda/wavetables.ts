// ONDA's factory wavetables, generated procedurally.
//
// Two reasons this beats shipping sampled tables: no licensing exposure whatsoever, and the
// tables can be *designed* to evolve musically across their frames rather than scraped from
// somewhere. A wavetable is only interesting if sweeping the morph is interesting — so each
// bank below has a deliberate journey from frame 0 to frame N.
//
// The engine band-limits these itself (mip pyramid built in Rust at load), so these generators
// write the raw ideal waveform and never worry about aliasing.

export const FRAME_SIZE = 2048; // power of two — required by the mip builder
export const FRAMES = 32;

export interface WaveTableDef {
  id: string;
  name: string;
  /** One-line description of the sweep, shown under the morph knob. */
  journey: string;
  build: () => Float32Array;
}

/** Additive helper: sum harmonics with a per-harmonic amplitude function. */
function additive(frames: number, amp: (harmonic: number, t: number) => number): Float32Array {
  const out = new Float32Array(frames * FRAME_SIZE);
  const maxH = FRAME_SIZE / 2 - 1;
  for (let f = 0; f < frames; f++) {
    const t = frames > 1 ? f / (frames - 1) : 0;
    const base = f * FRAME_SIZE;
    let peak = 0;
    for (let h = 1; h <= maxH; h++) {
      const a = amp(h, t);
      if (Math.abs(a) < 1e-5) continue;
      const w = (2 * Math.PI * h) / FRAME_SIZE;
      for (let i = 0; i < FRAME_SIZE; i++) out[base + i] += a * Math.sin(w * i);
    }
    for (let i = 0; i < FRAME_SIZE; i++) peak = Math.max(peak, Math.abs(out[base + i]));
    if (peak > 1e-9) {
      const g = 0.92 / peak;
      for (let i = 0; i < FRAME_SIZE; i++) out[base + i] *= g;
    }
  }
  return out;
}

/** Per-sample shaper: build each frame from a closure over phase. */
function shaped(frames: number, fn: (phase: number, t: number) => number): Float32Array {
  const out = new Float32Array(frames * FRAME_SIZE);
  for (let f = 0; f < frames; f++) {
    const t = frames > 1 ? f / (frames - 1) : 0;
    const base = f * FRAME_SIZE;
    let peak = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const v = fn(i / FRAME_SIZE, t);
      out[base + i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    if (peak > 1e-9) {
      const g = 0.92 / peak;
      for (let i = 0; i < FRAME_SIZE; i++) out[base + i] *= g;
    }
  }
  return out;
}

export const WAVETABLES: WaveTableDef[] = [
  {
    id: 'analog-sweep',
    name: 'Analog',
    journey: 'sine → triangle → saw → square',
    // The four classic shapes as one continuous morph — the table every synth should open on.
    build: () =>
      additive(FRAMES, (h, t) => {
        const sine = h === 1 ? 1 : 0;
        const tri = h % 2 === 1 ? (((h - 1) / 2) % 2 === 0 ? 1 : -1) / (h * h) : 0;
        const saw = 1 / h;
        const sqr = h % 2 === 1 ? 1 / h : 0;
        // Piecewise blend across three thirds of the sweep.
        if (t < 1 / 3) { const k = t * 3; return sine * (1 - k) + tri * 8 * k; }
        if (t < 2 / 3) { const k = t * 3 - 1; return tri * 8 * (1 - k) + saw * k; }
        const k = t * 3 - 2;
        return saw * (1 - k) + sqr * k;
      }),
  },
  {
    id: 'harmonic-bloom',
    name: 'Bloom',
    journey: 'pure fundamental opening into a full harmonic stack',
    build: () =>
      additive(FRAMES, (h, t) => {
        // A moving low-pass on the harmonic series: the classic "filter opening" as a table.
        const reach = 1 + t * t * 64;
        return h <= reach ? Math.pow(1 / h, 0.8 + (1 - t) * 0.6) : 0;
      }),
  },
  {
    id: 'formant-vowel',
    name: 'Vowel',
    journey: 'oo → oh → ah → eh → ee',
    build: () => {
      // Formant peaks for five vowels; interpolating between them is a talking sweep.
      const vowels = [
        [300, 870, 2240], // oo
        [500, 1000, 2400], // oh
        [730, 1090, 2440], // ah
        [530, 1840, 2480], // eh
        [270, 2290, 3010], // ee
      ];
      const f0 = 110; // the table is built assuming this fundamental
      return additive(FRAMES, (h, t) => {
        const x = t * (vowels.length - 1);
        const i = Math.min(Math.floor(x), vowels.length - 2);
        const k = x - i;
        let amp = 0;
        for (let fIdx = 0; fIdx < 3; fIdx++) {
          const freq = vowels[i][fIdx] * (1 - k) + vowels[i + 1][fIdx] * k;
          const hz = h * f0;
          const bw = 90 + fIdx * 60;
          amp += Math.exp(-Math.pow((hz - freq) / bw, 2)) * (1 - fIdx * 0.22);
        }
        return (amp / h ** 0.3) * 0.5;
      });
    },
  },
  {
    id: 'fm-metal',
    name: 'Metal',
    journey: 'clean carrier → inharmonic FM bell',
    build: () =>
      shaped(FRAMES, (p, t) => {
        // Rising FM index with a non-integer ratio: harmonics become inharmonic and bell-like.
        const idx = t * 7;
        const ratio = 2.41;
        return Math.sin(2 * Math.PI * p + idx * Math.sin(2 * Math.PI * ratio * p));
      }),
  },
  {
    id: 'fold',
    name: 'Fold',
    journey: 'sine folded further and further — west-coast timbres',
    build: () =>
      shaped(FRAMES, (p, t) => {
        let v = Math.sin(2 * Math.PI * p) * (1 + t * 6);
        for (let i = 0; i < 4; i++) {
          if (v > 1) v = 2 - v;
          else if (v < -1) v = -2 - v;
        }
        return v;
      }),
  },
  {
    id: 'reese',
    name: 'Reese',
    journey: 'detuned saw pair drifting from unison to wide',
    // The bass-music workhorse: two saws whose beating IS the sound.
    build: () =>
      shaped(FRAMES, (p, t) => {
        const detune = t * 0.035;
        const a = 2 * ((p * (1 - detune)) % 1) - 1;
        const b = 2 * ((p * (1 + detune) + 0.37) % 1) - 1;
        return (a + b) * 0.5;
      }),
  },
  {
    id: 'pulse-pwm',
    name: 'Pulse',
    journey: 'thin pulse widening to a full square',
    build: () =>
      additive(FRAMES, (h, t) => {
        const pw = 0.04 + t * 0.46;
        return (2 / (h * Math.PI)) * Math.sin(Math.PI * h * pw);
      }),
  },
  {
    id: 'glass',
    name: 'Glass',
    journey: 'odd-harmonic shimmer to a dense inharmonic cloud',
    build: () =>
      additive(FRAMES, (h, t) => {
        if (h % 2 === 0 && t < 0.5) return 0;
        // Slightly stretched partials — the "struck glass" character.
        const stretch = 1 + t * 0.002 * h;
        const decay = Math.pow(1 / (h * stretch), 1.1 - t * 0.45);
        const notch = 1 + 0.5 * Math.sin(h * (0.6 + t * 2.4));
        return decay * notch;
      }),
  },
];

/** Build every factory table once. ~1–2 MB of Float32 — generated on demand, then cached. */
let cache: Map<string, Float32Array> | null = null;

export function getWavetable(id: string): Float32Array | null {
  if (!cache) cache = new Map();
  const hit = cache.get(id);
  if (hit) return hit;
  const def = WAVETABLES.find((w) => w.id === id);
  if (!def) return null;
  const data = def.build();
  cache.set(id, data);
  return data;
}

export const wavetableIndex = (id: string): number => Math.max(0, WAVETABLES.findIndex((w) => w.id === id));
