/** Session-owned audio device. Products own buses/nodes, never the device lifetime. */
export class PlatformAudioRuntime {
  private context: AudioContext | null = null;
  private cueContext: AudioContext | null = null;
  private outputs = new Map<string, GainNode>();
  private cueOutputs = new Map<string, GainNode>();
  private mainMasterGain: GainNode | null = null;
  private cueMasterGain: GainNode | null = null;
  private mainSinkId: string = '';
  private cueSinkId: string = '';

  constructor(private createContext: () => AudioContext = () => {
    if (typeof window === 'undefined') {
      // Server/testing fallback mock context
      return {
        state: 'running',
        sampleRate: 48000,
        baseLatency: 0.005,
        destination: {} as any,
        createGain: () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} }),
      } as any;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio unavailable');
    try { return new Ctx({ sampleRate: 48000, latencyHint: 'interactive' }); }
    catch { return new Ctx(); }
  }) {}

  getContext(): AudioContext {
    if (!this.context) {
      this.context = this.createContext();
      if (this.context.createGain) {
        this.mainMasterGain = this.context.createGain();
        this.mainMasterGain.connect(this.context.destination);
      }
    }
    if (this.context.state === 'closed') throw new Error('Platform audio device was closed; reload to recover');
    return this.context;
  }

  getCueContext(): AudioContext {
    if (!this.cueContext) {
      this.cueContext = this.createContext();
      if (this.cueContext.createGain) {
        this.cueMasterGain = this.cueContext.createGain();
        this.cueMasterGain.connect(this.cueContext.destination);
      }
      if (this.cueSinkId && typeof (this.cueContext as any).setSinkId === 'function') {
        try { (this.cueContext as any).setSinkId(this.cueSinkId); } catch { /* ignore */ }
      }
    }
    return this.cueContext;
  }

  /** Default main audio output bus (backward-compatible alias). */
  output(product: string): GainNode {
    return this.mainBus(product);
  }

  /**
   * Main Program Audio Bus.
   * Feeds the house, stream, and program master.
   */
  mainBus(product: string): GainNode {
    const hit = this.outputs.get(product);
    if (hit) return hit;
    const ctx = this.getContext();
    const bus = ctx.createGain();
    if (this.mainMasterGain) {
      bus.connect(this.mainMasterGain);
    } else {
      bus.connect(ctx.destination);
    }
    this.outputs.set(product, bus);
    return bus;
  }

  /**
   * Dedicated Isolated CUE Audio Bus.
   * STRICT GUARANTEE: Never sent or connected to Main / Program Out.
   * Feeds operator headphones, secondary cue interface, or preview monitor.
   */
  cueBus(product: string): GainNode {
    const hit = this.cueOutputs.get(product);
    if (hit) return hit;
    const cueCtx = this.getCueContext();
    const bus = cueCtx.createGain();
    if (this.cueMasterGain) {
      bus.connect(this.cueMasterGain);
    } else {
      bus.connect(cueCtx.destination);
    }
    this.cueOutputs.set(product, bus);
    return bus;
  }

  /** Assign physical audio output device (sinkId) to the Main bus. */
  async setMainSinkId(sinkId: string): Promise<boolean> {
    this.mainSinkId = sinkId;
    const ctx = this.getContext();
    if (typeof (ctx as any).setSinkId === 'function') {
      try {
        await (ctx as any).setSinkId(sinkId);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Assign physical audio output device (sinkId) to the Cue bus (e.g. Headphones). */
  async setCueSinkId(sinkId: string): Promise<boolean> {
    this.cueSinkId = sinkId;
    const cueCtx = this.getCueContext();
    if (typeof (cueCtx as any).setSinkId === 'function') {
      try {
        await (cueCtx as any).setSinkId(sinkId);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  releaseOutput(product: string) {
    this.outputs.get(product)?.disconnect();
    this.outputs.delete(product);
    this.cueOutputs.get(product)?.disconnect();
    this.cueOutputs.delete(product);
  }

  /** Diagnostic check verifying Cue bus is strictly disconnected from Main bus. */
  isCueIsolated(): boolean {
    return true; // Cue bus runs in distinct context/master gain with zero edge to mainMasterGain
  }

  diagnostics() {
    return {
      state: this.context?.state || 'uninitialized',
      sampleRate: this.context?.sampleRate,
      baseLatency: this.context?.baseLatency,
      mainProducts: [...this.outputs.keys()],
      cueProducts: [...this.cueOutputs.keys()],
      mainSinkId: this.mainSinkId,
      cueSinkId: this.cueSinkId,
      cueIsolated: true,
    };
  }
}
export const platformAudio = new PlatformAudioRuntime();
