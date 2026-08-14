// Melos Beats — worklet clock. DEPENDENCY-FREE PLAIN JS, loaded via `?url` +
// ctx.audioWorklet.addModule(): identical bytes in dev and build, which is the only worklet
// loading shape that survives both Vite dev serving and the PWA production bundle. Keep this
// file free of imports and TypeScript syntax.
//
// No DSP here — this is purely a jank-immune metronome. It posts the AUDIO clock
// (currentTime/currentFrame) to the main thread on a fixed frame cadence; the scheduler turns
// each tick into sample-accurate AudioBufferSourceNode.start(when) calls inside a lookahead
// window. setTimeout clocks throttle in background tabs and jitter under main-thread load;
// audio-thread ticks do neither ("A Tale of Two Clocks", upgraded to a worklet).

class BeatsClock extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = false;
    this.postEvery = 1024; // frames ≈ 21ms @ 48k — 7× finer than the 150ms lookahead
    this.lastPost = -1e9;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.cmd === 'start') { this.running = true; this.lastPost = -1e9; }
      else if (d.cmd === 'stop') this.running = false;
      else if (d.cmd === 'interval' && d.frames > 0) this.postEvery = d.frames;
    };
  }

  process() {
    if (this.running && currentFrame - this.lastPost >= this.postEvery) {
      this.lastPost = currentFrame;
      this.port.postMessage({ t: currentTime, f: currentFrame });
    }
    return true; // keep alive — the node is held (and connected to a silent sink) by BeatsEngine
  }
}

registerProcessor('beats-clock', BeatsClock);
