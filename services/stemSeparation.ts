export type StemType = 'vocals' | 'drums' | 'bass' | 'melody';

export interface StemChannel {
  type: StemType;
  volume: number;        // 0-1
  muted: boolean;
  soloed: boolean;
  eqLow: number;         // -1 to 1 (-24dB to +6dB)
  eqMid: number;
  eqHigh: number;
  filterValue: number;   // 0-1 (0.5 = neutral)
  loop: { in: number; out: number; beats: number } | null;
  delayWet: number;      // 0-1
  reverbWet: number;     // 0-1
}

class StemProcessingChain {
  public state: StemChannel;
  
  public input: GainNode;
  public output: GainNode;
  
  // Separation filters
  private isolationFilters: AudioNode[] = [];
  
  // Mix controls
  private volumeGain: GainNode;
  private muteGain: GainNode;
  private soloGain: GainNode;
  
  // EQ
  private eqLowNode: BiquadFilterNode;
  private eqMidNode: BiquadFilterNode;
  private eqHighNode: BiquadFilterNode;
  
  // Filter (LP/HP)
  private comboFilterNode: BiquadFilterNode;
  
  // FX
  private delaySend: GainNode;
  private delayNode: DelayNode;
  private delayFeedback: GainNode;
  private reverbSend: GainNode;
  private convolver: ConvolverNode; // Placeholder for actual impulse response
  
  public analyser: AnalyserNode;

  constructor(private ctx: AudioContext, type: StemType) {
    this.state = {
      type,
      volume: 1,
      muted: false,
      soloed: false,
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      filterValue: 0.5,
      loop: null,
      delayWet: 0,
      reverbWet: 0
    };

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    
    // Set up isolation based on stem type
    this.setupIsolationFilters(type);
    
    // Mix controls
    this.volumeGain = ctx.createGain();
    this.muteGain = ctx.createGain();
    this.soloGain = ctx.createGain();
    
    // EQ (standard 3-band)
    this.eqLowNode = ctx.createBiquadFilter();
    this.eqLowNode.type = 'lowshelf';
    this.eqLowNode.frequency.value = 250;
    
    this.eqMidNode = ctx.createBiquadFilter();
    this.eqMidNode.type = 'peaking';
    this.eqMidNode.frequency.value = 1000;
    this.eqMidNode.Q.value = 1.0;
    
    this.eqHighNode = ctx.createBiquadFilter();
    this.eqHighNode.type = 'highshelf';
    this.eqHighNode.frequency.value = 4000;
    
    // DJ Filter
    this.comboFilterNode = ctx.createBiquadFilter();
    this.comboFilterNode.type = 'allpass'; // Neutral initially
    
    // FX
    this.delayNode = ctx.createDelay(2.0);
    this.delayFeedback = ctx.createGain();
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0;
    
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayFeedback.gain.value = 0.5; // Default feedback
    this.delayNode.connect(this.output);
    
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.convolver = ctx.createConvolver();
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.output);
    
    // Analyser
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    
    // Chain them together
    let currentNode: AudioNode = this.input;
    
    for (const filter of this.isolationFilters) {
      currentNode.connect(filter);
      currentNode = filter;
    }
    
    currentNode.connect(this.eqLowNode);
    this.eqLowNode.connect(this.eqMidNode);
    this.eqMidNode.connect(this.eqHighNode);
    this.eqHighNode.connect(this.comboFilterNode);
    
    this.comboFilterNode.connect(this.volumeGain);
    this.volumeGain.connect(this.muteGain);
    this.muteGain.connect(this.soloGain);
    
    this.soloGain.connect(this.analyser);
    
    // Split to output and fx
    this.analyser.connect(this.output);
    this.analyser.connect(this.delaySend);
    this.analyser.connect(this.reverbSend);
    
    // FX connect to delay/reverb processing nodes
    this.delaySend.connect(this.delayNode);
  }
  
  private setupIsolationFilters(type: StemType) {
    if (type === 'vocals') {
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300;
      
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4000;
      
      const notch = this.ctx.createBiquadFilter();
      notch.type = 'notch';
      notch.frequency.value = 100;
      notch.Q.value = 2.0;
      
      this.isolationFilters = [hp, lp, notch];
    } else if (type === 'drums') {
      // Parallel path for drums - implemented as a mix
      const kickFilter = this.ctx.createBiquadFilter();
      kickFilter.type = 'lowpass';
      kickFilter.frequency.value = 200;
      kickFilter.Q.value = 1.5;
      
      const snareHatFilter = this.ctx.createBiquadFilter();
      snareHatFilter.type = 'bandpass';
      snareHatFilter.frequency.value = 5000;
      snareHatFilter.Q.value = 1.0;
      
      // Create a sub-chain for parallel mixing
      const merger = this.ctx.createGain();
      
      // Connect to merger and replace isolation filters with the merger
      // For simplicity in a linear chain, we use an allpass as the primary node, 
      // but route internally.
      const splitterNode = this.ctx.createGain();
      splitterNode.connect(kickFilter);
      splitterNode.connect(snareHatFilter);
      
      kickFilter.connect(merger);
      snareHatFilter.connect(merger);
      
      // Expose as an encapsulated graph block
      this.input.disconnect();
      this.input.connect(splitterNode);
      this.isolationFilters = [merger]; 
    } else if (type === 'bass') {
      const lp1 = this.ctx.createBiquadFilter();
      lp1.type = 'lowpass';
      lp1.frequency.value = 300;
      
      const lp2 = this.ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 300;
      
      const boost = this.ctx.createBiquadFilter();
      boost.type = 'peaking';
      boost.frequency.value = 100;
      boost.Q.value = 2.0;
      boost.gain.value = 3.0; // Subtle resonance boost
      
      this.isolationFilters = [lp1, lp2, boost];
    } else if (type === 'melody') {
      // Bandpass 300Hz-4kHz with different phase relationship
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2000;
      bp.Q.value = 0.5;
      
      this.isolationFilters = [bp];
    }
  }

  public updateVolume() {
    this.volumeGain.gain.setTargetAtTime(this.state.volume, this.ctx.currentTime, 0.01);
  }

  public updateMute() {
    this.muteGain.gain.setTargetAtTime(this.state.muted ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  public updateSolo(anySoloed: boolean) {
    if (!anySoloed) {
      this.soloGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    } else {
      this.soloGain.gain.setTargetAtTime(this.state.soloed ? 1 : 0, this.ctx.currentTime, 0.01);
    }
  }
  
  public updateEQ() {
    // Map -1..1 to -24dB..+6dB
    const mapEq = (val: number) => val < 0 ? val * 24 : val * 6;
    this.eqLowNode.gain.setTargetAtTime(mapEq(this.state.eqLow), this.ctx.currentTime, 0.01);
    this.eqMidNode.gain.setTargetAtTime(mapEq(this.state.eqMid), this.ctx.currentTime, 0.01);
    this.eqHighNode.gain.setTargetAtTime(mapEq(this.state.eqHigh), this.ctx.currentTime, 0.01);
  }
  
  public updateFilter() {
    const val = this.state.filterValue; // 0 to 1
    if (Math.abs(val - 0.5) < 0.05) {
      this.comboFilterNode.type = 'allpass'; // Neutral
    } else if (val < 0.5) {
      this.comboFilterNode.type = 'lowpass';
      // Map 0.5 -> 20000Hz, 0.0 -> 20Hz
      this.comboFilterNode.frequency.setTargetAtTime(
        20 * Math.pow(1000, val * 2), this.ctx.currentTime, 0.01
      );
    } else {
      this.comboFilterNode.type = 'highpass';
      // Map 0.5 -> 20Hz, 1.0 -> 20000Hz
      this.comboFilterNode.frequency.setTargetAtTime(
        20 * Math.pow(1000, (val - 0.5) * 2), this.ctx.currentTime, 0.01
      );
    }
  }
  
  public setDelay(time: number, feedback: number, wet: number) {
    this.delayNode.delayTime.setTargetAtTime(time, this.ctx.currentTime, 0.01);
    this.delayFeedback.gain.setTargetAtTime(feedback, this.ctx.currentTime, 0.01);
    this.delaySend.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.01);
    this.state.delayWet = wet;
  }
  
  public setReverb(wet: number) {
    this.reverbSend.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.01);
    this.state.reverbWet = wet;
  }
}

export class StemSeparator {
  private inputNode: GainNode;
  private masterOutput: GainNode;
  private bypassOutput: GainNode;
  private separationSplitter: GainNode;
  
  private stems: Map<StemType, StemProcessingChain>;
  private isEnabled: boolean = true;
  
  constructor(private ctx: AudioContext) {
    this.inputNode = ctx.createGain();
    this.masterOutput = ctx.createGain();
    this.bypassOutput = ctx.createGain();
    this.separationSplitter = ctx.createGain();
    
    // Connect input to both bypass and separation paths
    this.inputNode.connect(this.bypassOutput);
    this.inputNode.connect(this.separationSplitter);
    
    // Connect outputs to master
    this.bypassOutput.connect(this.masterOutput);
    this.bypassOutput.gain.value = 0; // Disabled by default
    
    this.stems = new Map();
    const stemTypes: StemType[] = ['vocals', 'drums', 'bass', 'melody'];
    
    // Melody is derived as residual - we could implement perfect cancellation but
    // Web Audio Biquads cause phase shifts, making `input - (stems)` comb-filtered.
    // The instructions specified using an allpass/bandpass for melody or specific filters.
    // We are using the bandpass approach in the StemProcessingChain.
    
    for (const type of stemTypes) {
      const chain = new StemProcessingChain(ctx, type);
      this.separationSplitter.connect(chain.input);
      chain.output.connect(this.masterOutput);
      this.stems.set(type, chain);
    }
  }
  
  public connectInput(source: AudioNode): void {
    source.connect(this.inputNode);
  }
  
  public getOutput(): AudioNode {
    return this.masterOutput;
  }
  
  public setStemVolume(stem: StemType, volume: number): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.volume = Math.max(0, Math.min(1, volume));
      chain.updateVolume();
    }
  }
  
  public muteStem(stem: StemType, muted: boolean): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.muted = muted;
      chain.updateMute();
    }
  }
  
  public soloStem(stem: StemType): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.soloed = !chain.state.soloed; // Toggle logic or set true
      this.updateAllSolos();
    }
  }
  
  public clearSolo(): void {
    for (const chain of this.stems.values()) {
      chain.state.soloed = false;
    }
    this.updateAllSolos();
  }
  
  private updateAllSolos(): void {
    let anySoloed = false;
    for (const chain of this.stems.values()) {
      if (chain.state.soloed) anySoloed = true;
    }
    
    for (const chain of this.stems.values()) {
      chain.updateSolo(anySoloed);
    }
  }
  
  public setStemEQ(stem: StemType, low: number, mid: number, high: number): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.eqLow = Math.max(-1, Math.min(1, low));
      chain.state.eqMid = Math.max(-1, Math.min(1, mid));
      chain.state.eqHigh = Math.max(-1, Math.min(1, high));
      chain.updateEQ();
    }
  }
  
  public setStemFilter(stem: StemType, value: number): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.filterValue = Math.max(0, Math.min(1, value));
      chain.updateFilter();
    }
  }
  
  public setStemDelay(stem: StemType, time: number, feedback: number, wet: number): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.setDelay(time, feedback, wet);
    }
  }
  
  public setStemReverb(stem: StemType, wet: number): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.setReverb(wet);
    }
  }
  
  public setStemLoop(stem: StemType, inTime: number, outTime: number, beats: number): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.loop = { in: inTime, out: outTime, beats };
      // Real implementation requires manipulating the source buffer / playback position,
      // which is usually handled upstream in the deck engine. Since StemSeparator
      // only receives an AudioNode input, loop isolation per stem would require
      // parallel playback of the track with offset scheduling in the deck engine itself,
      // OR buffering into a DelayNode or AudioWorklet for live looping.
      // We store the state here as requested.
    }
  }
  
  public clearStemLoop(stem: StemType): void {
    const chain = this.stems.get(stem);
    if (chain) {
      chain.state.loop = null;
    }
  }
  
  public getStemAnalyser(stem: StemType): AnalyserNode {
    const chain = this.stems.get(stem);
    if (!chain) throw new Error(`Stem ${stem} not found`);
    return chain.analyser;
  }
  
  public getStemState(stem: StemType): StemChannel {
    const chain = this.stems.get(stem);
    if (!chain) throw new Error(`Stem ${stem} not found`);
    return { ...chain.state };
  }
  
  public getAllStems(): StemChannel[] {
    return Array.from(this.stems.values()).map(c => ({ ...c.state }));
  }
  
  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) return;
    this.isEnabled = enabled;
    
    const now = this.ctx.currentTime;
    // 10ms crossfade
    if (enabled) {
      this.separationSplitter.gain.setTargetAtTime(1, now, 0.01);
      this.bypassOutput.gain.setTargetAtTime(0, now, 0.01);
    } else {
      this.separationSplitter.gain.setTargetAtTime(0, now, 0.01);
      this.bypassOutput.gain.setTargetAtTime(1, now, 0.01);
    }
  }
  
  public destroy(): void {
    this.inputNode.disconnect();
    this.masterOutput.disconnect();
    this.bypassOutput.disconnect();
    this.separationSplitter.disconnect();
    
    for (const chain of this.stems.values()) {
      chain.input.disconnect();
      chain.output.disconnect();
    }
    this.stems.clear();
  }
}

export function createStemSeparator(ctx: AudioContext): StemSeparator {
  return new StemSeparator(ctx);
}
