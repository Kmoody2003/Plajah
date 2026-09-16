/** Session-owned audio device. Products own buses/nodes, never the device lifetime. */
export class PlatformAudioRuntime {
  private context: AudioContext | null = null;
  private outputs = new Map<string, GainNode>();
  constructor(private createContext: () => AudioContext = () => {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio unavailable');
    try { return new Ctx({ sampleRate: 48000, latencyHint: 'interactive' }); }
    catch { return new Ctx(); }
  }) {}
  getContext(): AudioContext {
    if (!this.context) this.context = this.createContext();
    if (this.context.state === 'closed') throw new Error('Platform audio device was closed; reload to recover');
    return this.context;
  }
  output(product: string): GainNode {
    const hit = this.outputs.get(product);
    if (hit) return hit;
    const ctx = this.getContext();
    const bus = ctx.createGain(); bus.connect(ctx.destination);
    this.outputs.set(product, bus);
    return bus;
  }
  releaseOutput(product: string) { this.outputs.get(product)?.disconnect(); this.outputs.delete(product); }
  diagnostics() {
    return { state: this.context?.state || 'uninitialized', sampleRate: this.context?.sampleRate,
      baseLatency: this.context?.baseLatency, products: [...this.outputs.keys()] };
  }
}
export const platformAudio = new PlatformAudioRuntime();
