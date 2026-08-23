// A silent analyser, shared.
//
// Several render layers (ShaderLayer, ButterchurnLayer, ThreeScene) take an AnalyserNode and read
// it every frame — they dereference it, so it cannot be null. But a work animates on iTime, not on
// audio; audio only drives the reactive bands. So a look should render the moment it is chosen,
// before any audio is playing, and the program canvas showed nothing until then precisely because
// the analyser was null and the whole layer was gated away.
//
// This is the node that fills the gap: unconnected, never started, returning zeros for every band.
// The shader animates; the bands are simply silent until real audio replaces it. One node for the
// whole module, created on first use.

let shared: AnalyserNode | null = null;

export function getSilentAnalyser(): AnalyserNode | null {
  if (shared) return shared;
  if (typeof window === 'undefined') return null;
  try {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    // Deliberately not connected and never resumed. getByteFrequencyData on a suspended context
    // returns zeros, which is exactly the "no audio" reading we want.
    shared = a;
    return a;
  } catch {
    return null;
  }
}
