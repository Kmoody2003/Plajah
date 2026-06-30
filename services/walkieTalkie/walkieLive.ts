// walkieLive.ts — true open-channel live PTT for HOT contacts, over WebRTC (Phase 4). Wraps the
// platform's RtcSession (mesh, audio-only) on the pair's channel: the mic joins MUTED and is only
// un-muted while the PTT button is held (setAudioEnabled), so it behaves like a real walkie-talkie
// instead of an open phone call. The peer's incoming audio is routed through the AM/ham radio chain
// so live talk sounds the same as stored transmissions. A data-channel "ptt" message drives the
// incoming chirp + the receiving indicator.
//
// Both sides must have the channel open to connect (mesh of 2); if no peer is present, the handset
// falls back to the record-and-send rolling-5 path. WebRTC mic is acquired on connect (muted).

import { RtcSession } from '../rtcCore';
import { createRadioChain, getAudioContext, playChirp, type RadioChain } from './radioFX';

export interface WalkieLiveEvents {
  onPeerPresent?: (present: boolean) => void;   // a peer joined / left the channel
  onPeerTransmitting?: (on: boolean) => void;   // the peer pressed / released PTT
  onError?: (e: Error) => void;
}

export class WalkieLive {
  private session: RtcSession;
  private chain: RadioChain | null = null;
  private remoteSrc: MediaStreamAudioSourceNode | null = null;
  private pumpEl: HTMLAudioElement | null = null;
  private started = false;

  constructor(pairId: string, selfUid: string, displayName: string, private events: WalkieLiveEvents = {}) {
    this.session = new RtcSession(
      { sessionId: `walkie_${pairId}`, selfId: selfUid, topology: 'mesh', role: 'participant', media: { audio: true, video: false }, displayName },
      {
        onRemoteStream: (_peerId, stream) => this.attachRemote(stream),
        onParticipants: (list) => this.events.onPeerPresent?.(list.length > 0),
        onPeerLeft: () => this.events.onPeerPresent?.(false),
        onData: (_peerId, msg) => {
          if (msg.type === 'ptt') {
            const on = !!msg.payload?.on;
            if (on) { try { playChirp(getAudioContext(), 'incoming'); } catch { /* */ } }
            this.events.onPeerTransmitting?.(on);
          }
        },
        onError: (e) => this.events.onError?.(e),
      },
    );
  }

  /** Join the channel with the mic muted (PTT-only). */
  async connect(): Promise<void> {
    await this.session.join();
    this.session.setAudioEnabled(false); // muted until PTT held
    this.started = true;
  }

  /** Route the peer's live stream through the AM/ham chain (with a muted pump element so the
   *  WebRTC stream keeps flowing in all browsers — the FX chain is the audible output). */
  private attachRemote(stream: MediaStream): void {
    const ctx = getAudioContext();
    ctx.resume().catch(() => {});
    try { this.remoteSrc?.disconnect(); } catch { /* */ }
    this.chain?.dispose();
    this.pumpEl = new Audio();
    this.pumpEl.srcObject = stream; this.pumpEl.muted = true; this.pumpEl.play().catch(() => {});
    this.remoteSrc = ctx.createMediaStreamSource(stream);
    this.chain = createRadioChain(ctx);
    this.remoteSrc.connect(this.chain.input);
    this.chain.output.connect(ctx.destination);
  }

  /** Press = un-mute mic + signal start; release = mute + signal end. */
  setTransmitting(on: boolean): void {
    if (!this.started) return;
    this.session.setAudioEnabled(on);
    try { this.session.sendData('ptt', { on }); } catch { /* channel may not be open yet */ }
  }

  dispose(): void {
    try { this.session.leave(); } catch { /* */ }
    try { this.remoteSrc?.disconnect(); } catch { /* */ }
    try { this.pumpEl?.pause(); if (this.pumpEl) this.pumpEl.srcObject = null; } catch { /* */ }
    this.chain?.dispose();
    this.started = false;
  }
}
