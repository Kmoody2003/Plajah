// The native engine's end of the audio graph. `plajah-native-clock` tells it the context's frame;
// `plajah-native-ring` plays each track's chunks at exactly the frames they were rendered for.
const RING = 1 << 15;
const MASK = RING - 1;
const CHUNK = 1024;
const CLOCK_EVERY = 256;

class NativeClock extends AudioWorkletProcessor {
  next = 0;
  process() {
    if (currentFrame >= this.next) {
      this.port.postMessage(currentFrame);
      this.next = currentFrame + CLOCK_EVERY;
    }
    return true;
  }
}

class NativeRing extends AudioWorkletProcessor {
  left = new Float32Array(RING);
  right = new Float32Array(RING);
  written = -1;
  epoch = 0;
  missed = 0;
  late = 0;
  chunks = 0;
  minLead = Infinity;
  nextReport = 0;
  alive = true;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'wire') d.port.onmessage = (m) => this.chunk(m.data);
      else if (d.type === 'flush') {
        // Whatever the engine rendered before a hard stop is still on its way; its epoch is old.
        this.epoch += 1;
        this.left.fill(0);
        this.right.fill(0);
      } else if (d.type === 'dispose') this.alive = false;
    };
  }

  chunk(d) {
    if (d.epoch < this.epoch) return;
    if (d.frame + CHUNK <= currentFrame) {
      this.late += CHUNK;
      return;
    }
    this.chunks += 1;
    if (d.samples) {
      for (let i = 0; i < CHUNK; i++) {
        const at = (d.frame + i) & MASK;
        this.left[at] = d.samples[i];
        this.right[at] = d.samples[CHUNK + i];
      }
    }
    this.written = Math.max(this.written, d.frame + CHUNK);
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    const n = left.length;
    for (let i = 0; i < n; i++) {
      const at = (currentFrame + i) & MASK;
      left[i] = this.left[at];
      this.left[at] = 0;
      if (right) right[i] = this.right[at];
      this.right[at] = 0;
    }
    if (this.written >= 0) {
      this.missed += Math.max(0, Math.min(n, currentFrame + n - this.written));
      this.minLead = Math.min(this.minLead, this.written - currentFrame);
    }
    if (currentFrame >= this.nextReport) {
      this.nextReport = currentFrame + sampleRate / 2;
      this.port.postMessage({ missed: this.missed, late: this.late, chunks: this.chunks, minLead: this.minLead });
      this.minLead = Infinity;
    }
    return this.alive;
  }
}

registerProcessor('plajah-native-clock', NativeClock);
registerProcessor('plajah-native-ring', NativeRing);
