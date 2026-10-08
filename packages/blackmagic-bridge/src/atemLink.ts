// atemLink.ts — one ATEM switcher over the ATEM network protocol (UDP 9910) via the MIT-licensed
// `atem-connection` library: an open implementation of the same protocol the Blackmagic SDK speaks, so
// it does not need the registration-gated SDK download. Normalises its state into the app's AtemSnapshot.

import { Atem, Enums } from 'atem-connection';
import type { AtemMeState, AtemSnapshot, AtemTransitionStyle } from '../../../services/mediaEngine/blackmagic/protocol.ts';

const STYLE: Record<number, AtemTransitionStyle> = {
  [Enums.TransitionStyle.MIX]: 'mix', [Enums.TransitionStyle.DIP]: 'dip', [Enums.TransitionStyle.WIPE]: 'wipe',
  [Enums.TransitionStyle.DVE]: 'dve', [Enums.TransitionStyle.STING]: 'sting',
};
const STYLE_BACK: Record<AtemTransitionStyle, number> = {
  mix: Enums.TransitionStyle.MIX, dip: Enums.TransitionStyle.DIP, wipe: Enums.TransitionStyle.WIPE,
  dve: Enums.TransitionStyle.DVE, sting: Enums.TransitionStyle.STING,
};
const PORT: Record<number, string> = { 0: 'external', 1: 'black', 2: 'bars', 3: 'color', 4: 'media', 5: 'media-key', 6: 'supersource', 7: 'external', 128: 'me', 129: 'aux', 131: 'multiview' };

export interface AtemLinkEvents {
  snapshot(s: AtemSnapshot): void;
  link(state: 'connecting' | 'connected' | 'lost' | 'error', detail?: string): void;
}

export class AtemLink {
  private atem = new Atem();
  private pending = false;
  private closed = false;

  constructor(readonly deviceId: string, readonly host: string, private ev: AtemLinkEvents) {
    this.atem.on('connected', () => { this.ev.link('connected'); this.emit(); });
    this.atem.on('disconnected', () => { if (!this.closed) this.ev.link('lost', 'ATEM stopped answering; reconnecting'); });
    this.atem.on('error', (m: unknown) => this.ev.link('error', String(m)));
    this.atem.on('stateChanged', () => this.schedule());
  }

  async connect() {
    this.ev.link('connecting');
    try { await this.atem.connect(this.host); } catch (e: any) { this.ev.link('error', e?.message ?? String(e)); }
  }
  async close() { this.closed = true; try { await this.atem.disconnect(); } catch { /* already down */ } }

  /** State changes arrive in bursts (a transition emits one per frame); coalesce to ~30 fps. */
  private schedule() {
    if (this.pending) return;
    this.pending = true;
    setTimeout(() => { this.pending = false; this.emit(); }, 33);
  }

  snapshot(): AtemSnapshot | null {
    const st = this.atem.state;
    if (!st) return null;
    const inputs = Object.values(st.inputs).filter(Boolean).map(i => ({
      index: i!.inputId, shortName: i!.shortName, longName: i!.longName, port: PORT[i!.internalPortType as number] ?? 'external',
    })).sort((a, b) => a.index - b.index);
    const me: AtemMeState[] = st.video.mixEffects.map(m => !m ? null : ({
      program: m.programInput,
      preview: m.previewInput,
      inTransition: m.transitionPosition.inTransition,
      position: Math.max(0, Math.min(1, m.transitionPosition.handlePosition / 10000)),
      style: STYLE[m.transitionProperties.nextStyle] ?? 'mix',
      ftbBlack: !!m.fadeToBlack?.isFullyBlack,
    })).filter((x): x is AtemMeState => !!x);
    const macros = st.macro.macroProperties.map((p, index) => p?.isUsed ? { index, name: p.name } : null).filter((x): x is { index: number; name: string } => !!x);
    return { deviceId: this.deviceId, model: st.info.productIdentifier || String(st.info.model), inputs, me, macros };
  }
  private emit() { const s = this.snapshot(); if (s) this.ev.snapshot(s); }

  cut(me = 0) { return this.atem.cut(me); }
  auto(me = 0) { return this.atem.autoTransition(me); }
  program(input: number, me = 0) { return this.atem.changeProgramInput(input, me); }
  preview(input: number, me = 0) { return this.atem.changePreviewInput(input, me); }
  ftb(me = 0) { return this.atem.fadeToBlack(me); }
  style(style: AtemTransitionStyle, me = 0) { return this.atem.setTransitionStyle({ nextStyle: STYLE_BACK[style] }, me); }
  macro(index: number) { return this.atem.macroRun(index); }
  aux(bus: number, input: number) { return this.atem.setAuxSource(input, bus); }
}
