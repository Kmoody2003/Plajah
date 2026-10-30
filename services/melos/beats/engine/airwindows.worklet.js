// Airwindows inserts — the worklet host for rust/plajah-airwindows (Chris Johnson's effects, MIT).
//
// DEPENDENCY-FREE PLAIN JS, loaded via `?url` + addModule() (see instrumentProcessor.worklet.js
// for why it must stay a real file). The main thread compiles the module once and passes it in
// processorOptions; `new WebAssembly.Instance` is synchronous, so each processor owns its own
// instance and linear memory — one effect per instance, nothing shared across the thread.

class AirwindowsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.ready = false;
    try {
      const instance = new WebAssembly.Instance(opts.module, {});
      this.x = instance.exports;
      if (this.x.aw_abi_version() !== (opts.abi || 1)) {
        this.port.postMessage({ type: 'error', message: 'Airwindows ABI mismatch — run npm run airwindows:build' });
        return;
      }
      const n = this.x.aw_init(opts.kind | 0, sampleRate, opts.seedL >>> 0, opts.seedR >>> 0);
      if (!n) {
        this.port.postMessage({ type: 'error', message: `Airwindows: unknown kind ${opts.kind}` });
        return;
      }
      const values = opts.params || [];
      for (let i = 0; i < values.length; i++) this.x.aw_set_param(i, values[i]);
      this.refreshViews();
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String((err && err.message) || err) });
      return;
    }
    this.port.onmessage = (e) => {
      const d = e.data;
      if (!this.ready || !d) return;
      if (d.type === 'params') {
        for (let i = 0; i < d.values.length; i++) this.x.aw_set_param(i, d.values[i]);
      } else if (d.type === 'ping') {
        this.port.postMessage({ type: 'pong', id: d.id });
      }
    };
  }

  // The crate allocates only inside aw_init (views are taken after it), but a grown memory would
  // detach these views and go silently mute — cheap to check.
  refreshViews() {
    const buf = this.x.memory.buffer;
    this.memBytes = buf.byteLength;
    this.l = new Float32Array(buf, this.x.aw_buf(0), 512);
    this.r = new Float32Array(buf, this.x.aw_buf(1), 512);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const oL = out[0], oR = out[1] || out[0];
    const frames = oL.length;
    const input = inputs[0];
    const iL = input && input[0];
    const iR = input && (input[1] || input[0]);
    if (!this.ready) {
      // Failed to start: pass audio through rather than mute the channel.
      if (iL) { oL.set(iL); if (oR !== oL) oR.set(iR); } else { oL.fill(0); if (oR !== oL) oR.fill(0); }
      return true;
    }
    if (this.x.memory.buffer.byteLength !== this.memBytes) this.refreshViews();
    // No input connected still runs the effect on silence, so reverb tails ring out.
    if (iL) { this.l.set(iL); this.r.set(iR); } else { this.l.fill(0, 0, frames); this.r.fill(0, 0, frames); }
    this.x.aw_process(frames);
    oL.set(this.l.subarray(0, frames));
    if (oR !== oL) oR.set(this.r.subarray(0, frames));
    return true;
  }
}

registerProcessor('plajah-airwindows', AirwindowsProcessor);
