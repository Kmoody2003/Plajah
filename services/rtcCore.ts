/**
 * rtcCore — the single real-time media backbone for the whole platform.
 *
 * ONE engine powers every real-time feature, differing only by topology:
 *   • 'broadcast' — one host publishes, many viewers subscribe (live streaming).
 *   • 'mesh'      — every participant sends+receives (1:1 calls, group calls,
 *                   video rooms, talk rooms). Good up to ~6–8 peers; an SFU
 *                   ('sfu' topology) can be added later for larger rooms.
 *
 * It owns the genuinely hard, easy-to-get-wrong parts so no feature reinvents
 * them again:
 *   - media capture (camera / mic / screen), device switch, mute/cam toggle,
 *     hot track replacement (camera flip / screen share without dropping peers)
 *   - a Map of RTCPeerConnections keyed by peer id
 *   - Firestore signaling over a generic session model
 *   - PERFECT NEGOTIATION (MDN pattern) so simultaneous offers (glare) and
 *     mid-call renegotiation (adding screen share) never wedge a connection
 *   - presence (who's in the session) and clean teardown
 *
 * Signaling model (works for mesh AND broadcast):
 *   rtc_sessions/{sessionId}
 *     participants/{peerId}              { role, name, joinedAt }
 *     signals/{fromId}__{toId}           { description }          (directed edge)
 *       candidates/{auto}                ICE candidate
 *
 * Each peer listens to the inbound edge addressed to it ({other}__{self}) and
 * writes to its outbound edge ({self}__{other}).
 */

import { db, auth } from './backendService';
import {
  doc, collection, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot,
  serverTimestamp, getDocs,
} from 'firebase/firestore';
import { getIceServers } from './iceConfig';

export type RtcTopology =
  | 'mesh'       // everyone publishes + subscribes (video rooms, group calls)
  | 'broadcast'  // one host publishes, many viewers subscribe (live streaming)
  | 'stage';     // speakers publish, listeners subscribe (Clubhouse / X Spaces)
export type RtcRole = 'host' | 'viewer' | 'participant' | 'watcher';

export const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export interface RtcMediaConfig {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
}

export interface RtcSessionConfig {
  sessionId: string;
  /** Stable id for this peer (defaults to auth uid, else a random id). */
  selfId?: string;
  topology: RtcTopology;
  role: RtcRole;
  media?: RtcMediaConfig;
  /** Publish this stream instead of capturing getUserMedia (e.g. a mixed master). */
  localStream?: MediaStream;
  displayName?: string;
  iceServers?: RTCIceServer[];
  /** Firestore root collection (default 'rtc_sessions'). */
  collectionName?: string;
}

export interface RtcParticipant {
  id: string;
  role: RtcRole;
  name?: string;
}

export interface RtcDataMessage { type: string; payload?: any }

export interface RtcEvents {
  onLocalStream?: (stream: MediaStream | null) => void;
  /** The screen-share stream (for showing your own desktop feed locally). */
  onScreenStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onPeerLeft?: (peerId: string) => void;
  onParticipants?: (participants: RtcParticipant[]) => void;
  onPeerState?: (peerId: string, state: RTCPeerConnectionState) => void;
  /** Low-latency data-channel message from a peer (reactions, polls, synced
   *  playback, cursors, whiteboard strokes, game state, …). */
  onData?: (peerId: string, msg: RtcDataMessage) => void;
  onError?: (err: Error) => void;
}

const edgeId = (from: string, to: string) => `${from}__${to}`;

interface Peer {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  polite: boolean;
  ignoreOffer: boolean;
  dc: RTCDataChannel | null;
  unsubs: Array<() => void>;
}

// ── Camera quality ───────────────────────────────────────────────────────────
// Two things made the stream look like a cheap webcam: (1) we captured with no
// resolution constraints, so browsers hand back ~480p, and (2) WebRTC defaults to
// ~1 Mbps and drops resolution to hold framerate — the classic blocky/soft look.
// We now ask for full-HD capture, tune the device's own image pipeline (continuous
// autofocus / auto-exposure / auto-white-balance for rich, sharp color), hint the
// encoder toward detail, and give the sender real bitrate headroom.
const HQ_VIDEO: MediaTrackConstraints = {
  width:  { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 60 },
};
/** Merge full-HD/framerate targets into the caller's video constraints (facingMode/
 *  deviceId win; HQ fills the rest). `false` stays false. */
function hqVideo(v: boolean | MediaTrackConstraints | undefined): boolean | MediaTrackConstraints {
  if (v === false) return false;
  if (v === true || v == null) return { ...HQ_VIDEO };
  return { ...HQ_VIDEO, ...v };
}
/** Push the capture track to its best: detail content hint + the device's continuous
 *  auto focus/exposure/white-balance, and nudge resolution toward the hardware max. */
async function tuneVideoTrack(track?: MediaStreamTrack | null): Promise<void> {
  if (!track || track.kind !== 'video') return;
  try { track.contentHint = 'detail'; } catch { /* */ }
  try {
    const caps: any = track.getCapabilities?.() ?? {};
    const adv: any[] = [];
    const has = (k: string, val: string) => Array.isArray(caps[k]) && caps[k].includes(val);
    if (has('focusMode', 'continuous')) adv.push({ focusMode: 'continuous' });
    if (has('exposureMode', 'continuous')) adv.push({ exposureMode: 'continuous' });
    if (has('whiteBalanceMode', 'continuous')) adv.push({ whiteBalanceMode: 'continuous' });
    if (caps.width?.max && caps.height?.max) {
      adv.push({ width: Math.min(1920, caps.width.max), height: Math.min(1080, caps.height.max) });
    }
    if (adv.length) await track.applyConstraints({ advanced: adv });
  } catch { /* device doesn't expose advanced controls — capture constraints still apply */ }
}
/** Give the outbound video real bitrate + keep resolution over framerate so the
 *  picture stays sharp instead of collapsing to a soft, blocky 1 Mbps stream. */
function boostVideoSender(pc: RTCPeerConnection): void {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;
  try {
    const params = sender.getParameters();
    (params as any).degradationPreference = 'maintain-resolution';
    if (params.encodings && params.encodings.length) {
      params.encodings.forEach(e => { e.maxBitrate = 3_800_000; (e as any).maxFramerate = 30; });
    }
    sender.setParameters(params).catch(() => {});
  } catch { /* encodings not negotiated yet — retried on connect */ }
}

export class RtcSession {
  readonly selfId: string;
  private cfg: Required<Pick<RtcSessionConfig, 'topology' | 'role' | 'collectionName' | 'iceServers'>> & RtcSessionConfig;
  private events: RtcEvents;
  private local: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private participantsUnsub: (() => void) | null = null;
  private closed = false;

  constructor(config: RtcSessionConfig, events: RtcEvents = {}) {
    this.selfId = config.selfId || auth.currentUser?.uid || `anon-${Math.random().toString(36).slice(2)}`;
    this.cfg = {
      ...config,
      topology: config.topology,
      role: config.role,
      collectionName: config.collectionName || 'rtc_sessions',
      iceServers: config.iceServers || getIceServers(),
    };
    this.events = events;
  }

  // ── Paths ──────────────────────────────────────────────────────────────────
  private get root() { return doc(db, this.cfg.collectionName, this.cfg.sessionId); }
  private participantDoc(id: string) { return doc(db, this.cfg.collectionName, this.cfg.sessionId, 'participants', id); }
  private participantsCol() { return collection(db, this.cfg.collectionName, this.cfg.sessionId, 'participants'); }
  private edgeDoc(from: string, to: string) { return doc(db, this.cfg.collectionName, this.cfg.sessionId, 'signals', edgeId(from, to)); }
  private edgeCandidates(from: string, to: string) { return collection(db, this.cfg.collectionName, this.cfg.sessionId, 'signals', edgeId(from, to), 'candidates'); }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /** Acquire media (per role) and join the session. */
  async join(): Promise<void> {
    // Subscribers (broadcast viewers / stage listeners) don't capture media.
    const publishes = this.selfPublishes;
    if (publishes && (this.cfg.localStream || this.cfg.media?.audio || this.cfg.media?.video)) {
      try {
        // Prefer a provided stream (e.g. a podcast mixed master) over capturing the mic/camera.
        this.local = this.cfg.localStream ?? await navigator.mediaDevices.getUserMedia({
          audio: this.cfg.media?.audio ?? true,
          video: hqVideo(this.cfg.media?.video),
        });
        if (!this.cfg.localStream) await tuneVideoTrack(this.local.getVideoTracks()[0]);
        this.events.onLocalStream?.(this.local);
      } catch (e: any) {
        this.events.onError?.(new Error(e?.message || 'Camera/mic unavailable'));
        throw e;
      }
    }

    await setDoc(this.participantDoc(this.selfId), {
      role: this.cfg.role,
      name: this.cfg.displayName || auth.currentUser?.displayName || 'Guest',
      joinedAt: serverTimestamp(),
    });

    // React to who is present.
    this.participantsUnsub = onSnapshot(this.participantsCol(), snap => {
      if (this.closed) return;
      const list: RtcParticipant[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      this.events.onParticipants?.(list.filter(p => p.id !== this.selfId));

      const others = list.filter(p => p.id !== this.selfId);
      // Establish the connections this topology/role requires.
      for (const p of others) {
        if (this.shouldConnectTo(p) && !this.peers.has(p.id)) {
          this.createPeer(p.id, this.shouldInitiateTo(p));
        }
      }
      // Tear down peers who left.
      for (const id of [...this.peers.keys()]) {
        if (!others.find(p => p.id === id)) this.removePeer(id);
      }
    });
  }

  /** Does a given role publish media in this topology?
   *   watcher → never (a pure spectator in every topology — no camera, recv-only,
   *   used by the video-room "watch" mode where signed-in or guest viewers follow
   *   the conversation without taking a seat);
   *   mesh → everyone else; broadcast → only the host; stage → anyone but a viewer. */
  private isPublisher(role: RtcRole): boolean {
    if (role === 'watcher') return false;
    if (this.cfg.topology === 'mesh') return true;
    if (this.cfg.topology === 'broadcast') return role === 'host';
    return role !== 'viewer'; // stage: host/participant = speaker, viewer = listener
  }
  private get selfPublishes(): boolean { return this.isPublisher(this.cfg.role); }

  /** Topology rules (publisher/subscriber model unifies all three topologies):
   *  a publisher connects to EVERYONE; a pure subscriber connects only to
   *  publishers (two subscribers have nothing to exchange). */
  private shouldConnectTo(p: RtcParticipant): boolean {
    if (this.selfPublishes) return true;
    return this.isPublisher(p.role);
  }

  /** Who sends the first offer (deterministic, avoids double-offer):
   *  publisher→subscriber, the publisher initiates; between two publishers the
   *  lower id initiates. Perfect negotiation handles any residual glare. */
  private shouldInitiateTo(p: RtcParticipant): boolean {
    const iPub = this.selfPublishes;
    const oPub = this.isPublisher(p.role);
    if (iPub && !oPub) return true;
    if (!iPub && oPub) return false;
    return this.selfId < p.id;
  }

  // ── Peer connection (perfect negotiation) ─────────────────────────────────────
  private createPeer(peerId: string, initiate: boolean) {
    const pc = new RTCPeerConnection({ iceServers: this.cfg.iceServers });
    // Polite peer yields on glare. Make the non-initiator polite.
    const peer: Peer = { pc, makingOffer: false, polite: !initiate, ignoreOffer: false, dc: null, unsubs: [] };
    this.peers.set(peerId, peer);

    // Data channel for low-latency app messages (reactions, polls, sync, …).
    // The initiator creates it; the other side receives it via ondatachannel.
    const wireData = (dc: RTCDataChannel) => {
      peer.dc = dc;
      dc.onmessage = e => {
        try { this.events.onData?.(peerId, JSON.parse(e.data)); } catch {}
      };
    };
    if (initiate) {
      try { wireData(pc.createDataChannel('plajah')); } catch {}
    }
    pc.ondatachannel = e => wireData(e.channel);

    // Publish our tracks if we're a publisher in this topology; else recv-only.
    const publishes = this.selfPublishes;
    if (publishes && this.local) {
      this.local.getTracks().forEach(t => pc.addTrack(t, this.local!));
    } else if (!publishes) {
      // Viewer is receive-only.
      try { pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
    }

    pc.ontrack = e => {
      if (e.streams[0]) this.events.onRemoteStream?.(peerId, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      // Apply high-bitrate/maintain-resolution encoding once the sender's encodings
      // exist (post-negotiation) — this is where the sharpness win lands.
      if (pc.connectionState === 'connected' && publishes) boostVideoSender(pc);
      this.events.onPeerState?.(peerId, pc.connectionState);
    };

    pc.onicecandidate = e => {
      if (e.candidate) addDoc(this.edgeCandidates(this.selfId, peerId), e.candidate.toJSON()).catch(() => {});
    };

    // Perfect negotiation: (re)offer whenever tracks change.
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        await setDoc(this.edgeDoc(this.selfId, peerId), { description: pc.localDescription?.toJSON() }, { merge: true });
      } catch (e: any) {
        this.events.onError?.(new Error(e?.message || 'negotiation failed'));
      } finally {
        peer.makingOffer = false;
      }
    };

    // Inbound description (offer/answer) on the edge addressed to us.
    peer.unsubs.push(onSnapshot(this.edgeDoc(peerId, this.selfId), async snap => {
      const description = snap.data()?.description as RTCSessionDescriptionInit | undefined;
      if (!description) return;
      try {
        const offerCollision = description.type === 'offer'
          && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          await setDoc(this.edgeDoc(this.selfId, peerId), { description: pc.localDescription?.toJSON() }, { merge: true });
        }
      } catch (e: any) {
        this.events.onError?.(new Error(e?.message || 'signaling failed'));
      }
    }));

    // Inbound ICE candidates.
    peer.unsubs.push(onSnapshot(this.edgeCandidates(peerId, this.selfId), snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        pc.addIceCandidate(new RTCIceCandidate(ch.doc.data() as RTCIceCandidateInit))
          .catch(() => { if (!peer.ignoreOffer) {/* swallow late candidates */} });
      });
    }));

    // Non-initiators wait for the offer; initiators rely on onnegotiationneeded
    // (fired by addTrack/addTransceiver above) to kick the first offer.
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.unsubs.forEach(u => u());
    try { peer.dc?.close(); } catch {}
    peer.pc.close();
    this.peers.delete(peerId);
    this.events.onPeerLeft?.(peerId);
  }

  // ── Data channel ──────────────────────────────────────────────────────────────
  /** Broadcast a low-latency message to all connected peers (reactions, polls,
   *  synced playback, cursors, whiteboard, game state). Fire-and-forget. */
  sendData(type: string, payload?: any): void {
    const data = JSON.stringify({ type, payload });
    this.peers.forEach(({ dc }) => {
      if (dc && dc.readyState === 'open') { try { dc.send(data); } catch {} }
    });
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  setAudioEnabled(on: boolean) { this.local?.getAudioTracks().forEach(t => { t.enabled = on; }); }
  setVideoEnabled(on: boolean) { this.local?.getVideoTracks().forEach(t => { t.enabled = on; }); }

  getLocalStream() { return this.local; }

  /** Replace the camera (flip) without dropping any peer — hot track swap.
   *  Uses an EXACT facingMode so phones actually switch to the back camera
   *  (a non-exact facingMode is only a hint and often returns the same camera —
   *  which looked like "the flip just mirrors"). Falls back to non-exact. */
  async switchCamera(facing: 'user' | 'environment') {
    let next: MediaStream;
    try {
      next = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ facingMode: { exact: facing } }) });
    } catch {
      next = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ facingMode: facing }) });
    }
    await this.swapVideoTrack(next.getVideoTracks()[0]);
  }

  /** Cycle to the NEXT physical camera (front → back → back-wide → back-tele → …
   *  → front). This is the reliable "flip" on multi-camera phones: it walks the
   *  enumerated video inputs by deviceId rather than relying on facingMode hints.
   *  Returns the new camera's facingMode (when the browser reports it) plus a
   *  `mirror` flag — the UI should mirror the preview for front cameras only. */
  async cycleCamera(): Promise<{ facingMode?: 'user' | 'environment'; mirror: boolean }> {
    const cams = (await navigator.mediaDevices.enumerateDevices().catch(() => []))
      .filter(d => d.kind === 'videoinput');
    if (cams.length <= 1) {
      // 0–1 enumerated cameras (or labels/ids hidden pre-permission) → toggle facingMode.
      const cur = this.local?.getVideoTracks()[0]?.getSettings().facingMode;
      await this.switchCamera(cur === 'environment' ? 'user' : 'environment');
    } else {
      const curId = this.local?.getVideoTracks()[0]?.getSettings().deviceId;
      const idx = cams.findIndex(c => c.deviceId === curId);
      const next = cams[(idx + 1) % cams.length];
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ deviceId: { exact: next.deviceId } }) });
      await this.swapVideoTrack(s.getVideoTracks()[0]);
    }
    const track = this.local?.getVideoTracks()[0];
    const fm = track?.getSettings().facingMode as 'user' | 'environment' | undefined;
    const label = (track?.label || '').toLowerCase();
    // Mirror front cameras only. When facingMode isn't reported, fall back to the
    // device label (back/rear/environment cameras are never mirrored).
    const mirror = fm === 'user' || (fm == null && /front|user|face|self/.test(label) && !/back|rear|environment|world/.test(label));
    return { facingMode: fm, mirror };
  }

  /** Enumerate the machine's cameras / mics / speakers so the UI can offer a
   *  device picker. Labels are only populated once media permission is granted
   *  (which it is, mid-call), so call this after join(). */
  async listDevices(): Promise<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return {
        cameras: all.filter(d => d.kind === 'videoinput'),
        mics: all.filter(d => d.kind === 'audioinput'),
        speakers: all.filter(d => d.kind === 'audiooutput'),
      };
    } catch { return { cameras: [], mics: [], speakers: [] }; }
  }

  /** The deviceIds currently being published (for highlighting the active pick). */
  getActiveDevices(): { cameraId?: string; micId?: string } {
    return {
      cameraId: this.local?.getVideoTracks()[0]?.getSettings().deviceId,
      micId: this.local?.getAudioTracks()[0]?.getSettings().deviceId,
    };
  }

  /** Switch the CAMERA to a specific device mid-call — hot track swap, no peer drop. */
  async switchVideoDevice(deviceId: string) {
    const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ deviceId: { exact: deviceId } }) });
    await this.swapVideoTrack(next.getVideoTracks()[0]);
  }

  /** Switch the MICROPHONE to a specific device mid-call — hot track swap, no peer drop. */
  async switchAudioDevice(deviceId: string) {
    const next = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
    const newTrack = next.getAudioTracks()[0];
    if (!newTrack) return;
    // Preserve the current mute state on the fresh track.
    const old = this.local?.getAudioTracks()[0];
    if (old) newTrack.enabled = old.enabled;
    this.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
      sender?.replaceTrack(newTrack).catch(() => {});
    });
    if (this.local) {
      if (old) { this.local.removeTrack(old); old.stop(); }
      this.local.addTrack(newTrack);
      this.events.onLocalStream?.(this.local);
    }
  }

  /** Shared camera hot-swap: replace the outbound video track on every peer and
   *  in the local stream, preserving mute state and firing onLocalStream. */
  private async swapVideoTrack(newTrack?: MediaStreamTrack) {
    if (!newTrack) return;
    const old = this.local?.getVideoTracks()[0];
    if (old) newTrack.enabled = old.enabled;
    await tuneVideoTrack(newTrack);
    this.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      sender?.replaceTrack(newTrack).catch(() => {});
    });
    if (this.local) {
      const audio = this.local.getAudioTracks();
      if (old) old.stop();
      // Rebuild as a NEW MediaStream reference. Mutating the same stream in place made
      // React consumers bail on the identity check (setLocalStream(sameRef) is a no-op),
      // so the preview <video> never re-bound its srcObject and stayed frozen on the old
      // camera — the flip appeared to only mirror the image. A fresh reference re-binds it.
      this.local = new MediaStream([newTrack, ...audio]);
      this.events.onLocalStream?.(this.local);
    }
  }

  /** Start/stop screen share via hot track swap (keeps every peer connected).
   *  Requests desktop audio too so it can be shared alongside the screen. */
  async startScreenShare(): Promise<boolean> {
    try {
      this.screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      const track = this.screen!.getVideoTracks()[0];
      this.peers.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(track).catch(() => {});
      });
      track.onended = () => this.stopScreenShare();
      this.events.onScreenStream?.(this.screen);   // local preview of your own desktop feed
      return true;
    } catch { return false; }
  }

  stopScreenShare() {
    const camTrack = this.local?.getVideoTracks()[0];
    this.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (camTrack) sender?.replaceTrack(camTrack).catch(() => {});
    });
    this.screen?.getTracks().forEach(t => t.stop());
    this.screen = null;
    this.events.onScreenStream?.(null);
  }

  getScreenStream() { return this.screen; }

  /** Use DESKTOP / system audio as the audio source (Teams/Zoom "share system
   *  audio") — captures getDisplayMedia audio and hot-swaps it in for the mic. */
  async useDesktopAudio(): Promise<boolean> {
    try {
      const disp = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      const audioTrack = disp.getAudioTracks()[0];
      if (!audioTrack) { disp.getTracks().forEach((t: MediaStreamTrack) => t.stop()); return false; }
      // We only want the audio; drop the picker's video track.
      disp.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());
      const old = this.local?.getAudioTracks()[0];
      if (old) audioTrack.enabled = old.enabled;
      this.peers.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        sender?.replaceTrack(audioTrack).catch(() => {});
      });
      if (this.local) {
        if (old) { this.local.removeTrack(old); old.stop(); }
        this.local.addTrack(audioTrack);
        this.events.onLocalStream?.(this.local);
      }
      return true;
    } catch { return false; }
  }

  /** Leave the session and release everything. */
  async leave() {
    this.closed = true;
    this.participantsUnsub?.();
    [...this.peers.keys()].forEach(id => this.removePeer(id));
    this.local?.getTracks().forEach(t => t.stop());
    this.screen?.getTracks().forEach(t => t.stop());
    this.local = null;
    // Best-effort signaling cleanup for our edges + presence.
    try {
      await deleteDoc(this.participantDoc(this.selfId));
      const sigs = await getDocs(collection(db, this.cfg.collectionName, this.cfg.sessionId, 'signals'));
      await Promise.all(sigs.docs
        .filter(d => d.id.startsWith(`${this.selfId}__`) || d.id.endsWith(`__${this.selfId}`))
        .map(d => deleteDoc(d.ref).catch(() => {})));
    } catch { /* non-fatal */ }
  }
}
