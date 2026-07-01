// mediaEngine/browserSources.ts — the two source kinds a browser tab can actually
// acquire: a local webcam (UVC via getUserMedia) and a remote WHEP subscriber
// (Blackmagic Camera / SRT/RTMP → MediaMTX → WHEP → this RTCPeerConnection).
//
// Both implement VideoSource so the router/switcher treat them like any native input.

import { VideoSource, VideoFormat, FrameRef, SourceKind } from './types';

abstract class BaseBrowserSource implements VideoSource {
  id: string;
  label: string;
  abstract kind: SourceKind;
  formats: VideoFormat[] = [];
  latencyMs = 0;
  tally: VideoSource['tally'] = 'off';
  stream: MediaStream | null = null;
  connected = false;
  protected frameCbs: ((f: FrameRef) => void)[] = [];

  constructor(id: string, label: string) { this.id = id; this.label = label; }

  abstract connect(): Promise<void>;

  onFrame(cb: (frame: FrameRef) => void): void {
    this.frameCbs.push(cb);
    if (this.stream) cb({ stream: this.stream });
  }

  protected emit() { if (this.stream) for (const cb of this.frameCbs) cb({ stream: this.stream }); }

  dispose(): void {
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* */ }
    this.stream = null;
    this.connected = false;
    this.frameCbs = [];
  }
}

/** A local camera/mic via getUserMedia. */
export class WebcamSource extends BaseBrowserSource {
  kind: SourceKind = 'uvc';
  private deviceId?: string;

  constructor(id: string, label: string, deviceId?: string) { super(id, label); this.deviceId = deviceId; }

  async connect(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: this.deviceId ? { deviceId: { exact: this.deviceId } } : { width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
    this.stream = stream;
    this.connected = true;
    const track = stream.getVideoTracks()[0];
    const s = track?.getSettings?.();
    if (s?.width && s?.height) this.formats = [{ width: s.width, height: s.height, fps: s.frameRate || 30 }];
    this.emit();
  }

  /** List available cameras for a picker. */
  static async listCameras(): Promise<{ deviceId: string; label: string }[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
    } catch { return []; }
  }
}

/**
 * A remote guest / contribution feed over WHEP (WebRTC-HTTP Egress Protocol).
 * A MediaMTX (or any WHEP) endpoint ingests the camera's SRT/RTMP and serves WHEP;
 * we subscribe recv-only and expose the incoming track as a MediaStream.
 */
export class WhepSource extends BaseBrowserSource {
  kind: SourceKind = 'webrtc';
  private endpoint: string;
  private pc: RTCPeerConnection | null = null;

  constructor(id: string, label: string, endpoint: string) { super(id, label); this.endpoint = endpoint; this.latencyMs = 700; }

  async connect(): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.pc = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    const inbound = new MediaStream();
    pc.ontrack = (e) => { inbound.addTrack(e.track); this.stream = inbound; this.connected = true; this.emit(); };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Wait briefly for ICE candidates (non-trickle WHEP).
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 1500);
    });

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp || '',
    });
    if (!res.ok) throw new Error(`WHEP subscribe failed: ${res.status}`);
    const answer = await res.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  }

  dispose(): void {
    try { this.pc?.close(); } catch { /* */ }
    this.pc = null;
    super.dispose();
  }
}
