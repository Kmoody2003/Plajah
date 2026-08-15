// Melos instruments — the worklet host for the Rust DSP core.
//
// DEPENDENCY-FREE PLAIN JS, loaded via `?url` + addModule(). (vite.config.ts keeps *.worklet.js
// out of the asset inliner precisely so this stays a real file in production; a data: URL here
// behaves differently from a served one, and that only shows up in the built app.)
//
// The main thread compiles the WebAssembly.Module once and passes it through processorOptions —
// a Module is structured-cloneable, and `new WebAssembly.Instance(module)` is SYNCHRONOUS, which
// is what makes this possible at all: a processor constructor cannot await.

class InstrumentProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.ready = false;
    this.eng = 0;
    this.channels = 2;
    this.outPtrs = [];
    this.views = [];
    this.memBytes = 0;

    try {
      const instance = new WebAssembly.Instance(opts.module, {});
      this.x = instance.exports;
      if (typeof this.x.pa_abi_version === 'function' && this.x.pa_abi_version() !== (opts.abi || 1)) {
        // A committed .wasm that drifted from the host contract — fail loudly, not subtly.
        this.port.postMessage({ type: 'error', message: 'DSP ABI mismatch — run npm run audio:build' });
        return;
      }
      this.eng = this.x.pa_create(sampleRate);
      this.channels = this.x.pa_channels(this.eng);
      this.refreshViews();
      this.ready = true;
      this.port.postMessage({ type: 'ready', channels: this.channels });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String((err && err.message) || err) });
      return;
    }

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  // Growing wasm memory detaches its ArrayBuffer and silently invalidates every view we hold.
  // Memory is pre-sized in .cargo/config.toml so this should never fire, but a stale view is a
  // hard-to-diagnose silence, so the check is cheap insurance.
  refreshViews() {
    const buf = this.x.memory.buffer;
    this.memBytes = buf.byteLength;
    this.outPtrs = [];
    this.views = [];
    for (let c = 0; c < this.channels; c++) {
      const ptr = this.x.pa_out_ptr(this.eng, c);
      this.outPtrs.push(ptr);
      this.views.push(new Float32Array(buf, ptr, 512));
    }
  }

  onMessage(msg) {
    if (!this.ready || !msg) return;
    const x = this.x;
    switch (msg.type) {
      case 'noteOn':
        // frameOffset makes an async message land on an exact sample.
        x.pa_note_on(this.eng, msg.note, msg.velocity, msg.voiceId, msg.frameOffset | 0);
        break;
      case 'noteOff':
        x.pa_note_off(this.eng, msg.voiceId);
        break;
      case 'allNotesOff':
        x.pa_all_notes_off(this.eng, msg.hard ? 1 : 0);
        break;
      // Absolute-frame scheduling — the offline render path.
      case 'scheduleOn':
        x.pa_schedule_note_on(this.eng, msg.note, msg.velocity, msg.voiceId, msg.frame);
        break;
      case 'scheduleOff':
        x.pa_schedule_note_off(this.eng, msg.voiceId, msg.frame);
        break;
      case 'clearSchedule':
        x.pa_clear_schedule(this.eng);
        break;
      case 'resetTransport':
        x.pa_reset_transport(this.eng, msg.frame || 0);
        break;
      case 'param':
        x.pa_set_param(this.eng, msg.id, msg.value);
        break;
      case 'params':
        for (let i = 0; i < msg.ids.length; i++) x.pa_set_param(this.eng, msg.ids[i], msg.values[i]);
        break;
      case 'macro':
        x.pa_set_macro(this.eng, msg.index, msg.value);
        break;
      case 'route':
        x.pa_set_route(this.eng, msg.index, msg.source, msg.dest, msg.depth, msg.via || 0);
        break;
      case 'expression':
        x.pa_set_expression(this.eng, msg.voiceId, msg.bend || 0, msg.pressure || 0, msg.timbre || 0);
        break;
      case 'modWheel':
        x.pa_set_mod_wheel(this.eng, msg.value);
        break;
      case 'pitchBend':
        x.pa_set_pitch_bend(this.eng, msg.value);
        break;
      case 'position':
        x.pa_set_position(this.eng, msg.x, msg.y, msg.z);
        break;
      case 'layout':
        x.pa_set_layout(this.eng, msg.layout);
        this.channels = x.pa_channels(this.eng);
        this.refreshViews();
        this.port.postMessage({ type: 'channels', channels: this.channels });
        break;
      case 'iamfRole':
        x.pa_set_iamf_role(this.eng, msg.role);
        break;
      case 'tempo':
        x.pa_set_tempo(this.eng, msg.beatsPerSec);
        break;
      case 'wavetable': {
        // Stage the frames into wasm memory, then build the mip pyramid (expensive — never in
        // the render path, always at patch-load time).
        const ptr = x.pa_upload_ptr(this.eng);
        const cap = x.pa_upload_capacity(this.eng);
        const data = msg.data;
        if (ptr && data && data.length <= cap) {
          new Float32Array(x.memory.buffer, ptr, data.length).set(data);
          x.pa_commit_table(this.eng, msg.slot, msg.frames, msg.frameSize);
        }
        break;
      }
      case 'dispose':
        this.dispose();
        break;
      default:
        break;
    }
  }

  dispose() {
    if (this.eng) {
      try { this.x.pa_destroy(this.eng); } catch { /* already gone */ }
      this.eng = 0;
    }
    this.ready = false;
  }

  process(_inputs, outputs) {
    if (!this.ready) return true;
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const frames = out[0].length;

    this.x.pa_render(this.eng, frames);

    if (this.x.memory.buffer.byteLength !== this.memBytes) this.refreshViews();

    const n = Math.min(out.length, this.channels);
    for (let c = 0; c < n; c++) {
      out[c].set(this.views[c].subarray(0, frames));
    }
    // More output channels than the engine renders (e.g. a stereo engine into a 5.1 node):
    // duplicate the last rendered channel rather than leaving silence.
    for (let c = n; c < out.length; c++) {
      out[c].set(this.views[n - 1].subarray(0, frames));
    }

    // Voice count for the diagnostics readout — cheap, and only every ~10ms.
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 4 === 0) {
      this.port.postMessage({ type: 'voices', count: this.x.pa_active_voices(this.eng) });
    }
    return true;
  }
}

registerProcessor('plajah-instrument', InstrumentProcessor);
