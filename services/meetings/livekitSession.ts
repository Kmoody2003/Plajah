/**
 * LiveKitSession — the SFU twin of rtcCore's RtcSession. Same public surface (join/leave, local +
 * remote MediaStreams, participants, peer state, data messages, audio/video toggles, device and
 * screen swaps), so useRtcSession and every meeting UI drive it unchanged. See docs/MEETINGS_SFU.md.
 *
 * What changes under the hood:
 *   - one upstream per person to LiveKit instead of one per peer (mesh breaks past ~5–6 people);
 *   - the camera is published with simulcast (180p / 360p / 720p) + dynacast, and the receiver
 *     picks layers through setVideoPolicy(): the focused/active speaker gets HD, everyone else the
 *     low layer, and tiles off the current grid page aren't received at all. That keeps a
 *     participant near 0.7–1 GB/hour however big the room is.
 *   - presence is still written to the same Firestore participants doc (role/name/joinedAt/nonce/
 *     lastSeen), so huddle banners and "who's in the call" keep working without knowing about LiveKit.
 *
 * livekit-client is loaded lazily on join: nobody downloads it unless they actually join an SFU room.
 */
import type {
  Room, RemoteParticipant, RemoteTrackPublication, LocalTrackPublication, Participant,
} from 'livekit-client';
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../backendService';
import {
  type RtcSessionConfig, type RtcEvents, type RtcParticipant,
  captureWithFallback, hqVideo, openFreeingCurrent, withMicDevice, tuneVideoTrack,
} from '../rtcCore';

export interface SfuGrant { url: string; token: string; room: string; identity: string; cap: number }

export interface SfuEvents extends RtcEvents {
  /** Who is talking now (loudest first; may include yourself). */
  onActiveSpeakers?: (ids: string[]) => void;
}

/** Which remote videos to receive and at what quality. null visible = everyone. */
export interface VideoPolicy { visible: string[] | null; focus?: string | null }

const HEARTBEAT_MS = 15_000;

type Lk = typeof import('livekit-client');

export class LiveKitSession {
  readonly selfId: string;
  readonly kind = 'sfu' as const;
  private cfg: RtcSessionConfig;
  private events: SfuEvents;
  private grant: SfuGrant;
  private lk: Lk | null = null;
  private room: Room | null = null;
  private local: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private camPub: LocalTrackPublication | null = null;
  private micPub: LocalTrackPublication | null = null;
  private closed = false;
  private excluded = new Set<string>();
  private allowed: Set<string> | null = null;
  private policy: VideoPolicy = { visible: null, focus: null };
  private speakers: string[] = [];
  private timers: Array<ReturnType<typeof setInterval>> = [];
  readonly nonce = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  private onPageHide = () => { void this.leave(); };

  constructor(config: RtcSessionConfig, events: SfuEvents, grant: SfuGrant) {
    this.cfg = config;
    this.events = events;
    this.grant = grant;
    this.selfId = grant.identity;
  }

  get path(): string { return `${this.cfg.collectionName || 'rtc_sessions'}/${this.cfg.sessionId}`; }
  private presenceDoc() { return doc(db, this.cfg.collectionName || 'rtc_sessions', this.cfg.sessionId, 'participants', this.selfId); }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  async join(): Promise<void> {
    const wantsVideo = this.cfg.media?.video !== false && this.cfg.media?.video != null;
    const [lk] = await Promise.all([
      import('livekit-client'),
      (async () => {
        try {
          this.local = this.cfg.localStream ?? await captureWithFallback(this.cfg.media?.audio ?? true, wantsVideo ? hqVideo(this.cfg.media?.video) : false);
          if (!this.cfg.localStream) await tuneVideoTrack(this.local.getVideoTracks()[0]);
        } catch (e: any) {
          this.events.onError?.(new Error(e?.message || 'Camera/mic unavailable'));
          throw e;
        }
      })(),
    ]);
    if (this.closed) { this.stopLocal(); return; }
    this.lk = lk;
    this.events.onLocalStream?.(this.local);

    const room = new lk.Room({
      // Layers are chosen explicitly through setVideoPolicy (our tiles bind raw MediaStreams, which
      // LiveKit's element-based adaptiveStream can't see), and dynacast stops encoding layers no one receives.
      adaptiveStream: false,
      dynacast: true,
      disconnectOnPageLeave: true,
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [lk.VideoPresets.h180, lk.VideoPresets.h360],
        videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 30 },
        dtx: true,
        red: true,
      },
    });
    this.room = room;
    this.wire(room, lk);
    await room.connect(this.grant.url, this.grant.token, { autoSubscribe: true });
    if (this.closed) { await room.disconnect(); return; }

    const a = this.local?.getAudioTracks()[0];
    const v = this.local?.getVideoTracks()[0];
    if (a) this.micPub = await room.localParticipant.publishTrack(a, { source: lk.Track.Source.Microphone, name: 'mic' });
    if (v) this.camPub = await room.localParticipant.publishTrack(v, { source: lk.Track.Source.Camera, name: 'camera', simulcast: true });

    // Same presence doc the mesh writes, so banners/rosters don't care which engine is running.
    await setDoc(this.presenceDoc(), {
      role: 'participant',
      name: (this.cfg.displayName || auth.currentUser?.displayName || 'Guest').slice(0, 200),
      joinedAt: serverTimestamp(), nonce: this.nonce, lastSeen: serverTimestamp(),
    }).catch(() => {});
    if (this.closed) { await deleteDoc(this.presenceDoc()).catch(() => {}); return; }
    this.timers.push(setInterval(() => {
      if (!this.closed) updateDoc(this.presenceDoc(), { lastSeen: serverTimestamp() }).catch(() => {});
    }, HEARTBEAT_MS));
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);

    for (const p of room.remoteParticipants.values()) this.events.onPeerState?.(p.identity, 'connected');
    this.emitParticipants();
    for (const p of room.remoteParticipants.values()) this.emitStream(p);
    this.applyPolicy();
  }

  private wire(room: Room, lk: Lk) {
    const E = lk.RoomEvent;
    room
      .on(E.ParticipantConnected, (p: RemoteParticipant) => {
        if (!this.visibleId(p.identity)) return;
        this.events.onPeerState?.(p.identity, 'connected');
        this.emitParticipants();
      })
      .on(E.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.events.onPeerLeft?.(p.identity);
        this.emitParticipants();
      })
      .on(E.TrackSubscribed, (_t, _pub, p: RemoteParticipant) => { this.emitStream(p); this.applyPolicy(); })
      .on(E.TrackUnsubscribed, (_t, _pub, p: RemoteParticipant) => this.emitStream(p))
      .on(E.TrackPublished, () => this.applyPolicy())
      .on(E.TrackMuted, (_pub, p: Participant) => { if (p instanceof lk.RemoteParticipant) this.emitStream(p); })
      .on(E.TrackUnmuted, (_pub, p: Participant) => { if (p instanceof lk.RemoteParticipant) this.emitStream(p); })
      .on(E.ActiveSpeakersChanged, (list: Participant[]) => {
        this.speakers = list.map(s => s.identity);
        this.events.onActiveSpeakers?.(this.speakers);
        if (!this.policy.focus) this.applyPolicy();
      })
      .on(E.DataReceived, (payload: Uint8Array, p?: RemoteParticipant) => {
        if (!p || !this.visibleId(p.identity)) return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg && typeof msg.type === 'string') this.events.onData?.(p.identity, msg);
        } catch { /* not ours */ }
      })
      .on(E.Reconnecting, () => {
        for (const p of room.remoteParticipants.values()) this.events.onPeerState?.(p.identity, 'disconnected');
        this.events.onSignalWarning?.('sfu', new Error('Reconnecting to the meeting…'));
      })
      .on(E.Reconnected, () => {
        for (const p of room.remoteParticipants.values()) this.events.onPeerState?.(p.identity, 'connected');
      })
      .on(E.Disconnected, (reason?: number) => {
        if (this.closed) return;
        // A full room fails connect() itself (the server checks caps first, LiveKit's maxParticipants backs it up).
        const dup = reason === lk.DisconnectReason.DUPLICATE_IDENTITY;
        this.events.onError?.(new Error(dup ? 'You joined this meeting from another tab or device.' : 'You were disconnected from the meeting.'));
      });
  }

  private visibleId(id: string): boolean {
    if (id === this.selfId || this.excluded.has(id)) return false;
    return !this.allowed || this.allowed.has(id);
  }

  private emitParticipants() {
    const room = this.room;
    if (!room || this.closed) return;
    const list: RtcParticipant[] = [...room.remoteParticipants.values()]
      .filter(p => this.visibleId(p.identity))
      .map(p => ({ id: p.identity, role: 'participant', name: p.name || undefined }));
    this.events.onParticipants?.(list);
  }

  /** One MediaStream per remote person: their mic (+ screen audio) and ONE picture — the screen
   *  share when they're sharing, else the camera (exactly what the mesh's track swap shows). */
  private emitStream(p: RemoteParticipant) {
    const lk = this.lk;
    if (!lk || this.closed || !this.visibleId(p.identity)) return;
    const pubs = [...p.trackPublications.values()] as RemoteTrackPublication[];
    const live = (pub: RemoteTrackPublication) => pub.isSubscribed && pub.track && !pub.isMuted;
    const audio = pubs.filter(x => x.kind === lk.Track.Kind.Audio && live(x)).map(x => x.track!.mediaStreamTrack);
    const screen = pubs.find(x => x.source === lk.Track.Source.ScreenShare && live(x));
    const cam = pubs.find(x => x.source === lk.Track.Source.Camera && live(x));
    const video = (screen || cam)?.track?.mediaStreamTrack;
    this.events.onRemoteStream?.(p.identity, new MediaStream([...audio, ...(video ? [video] : [])]));
  }

  // ── Bandwidth policy ─────────────────────────────────────────────────────────
  /**
   * Receive video only for the people on screen, and at a quality matched to the layout:
   * focus (or the current loudest speaker) → HIGH; small grids (≤2 others) → HIGH; ≤4 → MEDIUM;
   * bigger grids → LOW. Screen shares are always HIGH (text must stay legible).
   */
  setVideoPolicy(policy: VideoPolicy) {
    this.policy = { visible: policy.visible ? [...policy.visible] : null, focus: policy.focus ?? null };
    this.applyPolicy();
  }

  private applyPolicy() {
    const lk = this.lk; const room = this.room;
    if (!lk || !room) return;
    const remotes = [...room.remoteParticipants.values()].filter(p => this.visibleId(p.identity));
    const visible = this.policy.visible ? new Set(this.policy.visible) : null;
    const shown = visible ? remotes.filter(p => visible.has(p.identity)).length : remotes.length;
    const focus = this.policy.focus || this.speakers.find(id => id !== this.selfId) || null;
    const base = shown <= 2 ? lk.VideoQuality.HIGH : shown <= 4 ? lk.VideoQuality.MEDIUM : lk.VideoQuality.LOW;
    for (const p of remotes) {
      for (const pub of p.trackPublications.values() as Iterable<RemoteTrackPublication>) {
        if (pub.kind !== lk.Track.Kind.Video) continue;
        const onScreen = !visible || visible.has(p.identity);
        if (pub.isSubscribed !== onScreen) pub.setSubscribed(onScreen);
        if (!onScreen) continue;
        const q = pub.source === lk.Track.Source.ScreenShare || p.identity === focus ? lk.VideoQuality.HIGH : base;
        pub.setVideoQuality(q);
      }
    }
  }

  // ── Peer filters (same contract as RtcSession) ───────────────────────────────
  setAllowedPeers(ids?: string[]) {
    this.allowed = ids ? new Set(ids) : null;
    this.refilter();
  }
  setExcludedPeers(ids: string[]) {
    this.excluded = new Set(ids);
    this.refilter();
  }
  private refilter() {
    const room = this.room;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      if (this.visibleId(p.identity)) this.emitStream(p);
      else this.events.onPeerLeft?.(p.identity);
    }
    this.emitParticipants();
    this.applyPolicy();
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  sendData(type: string, payload?: any): void {
    const lp = this.room?.localParticipant;
    if (!lp) return;
    const bytes = new TextEncoder().encode(JSON.stringify({ type, payload }));
    lp.publishData(bytes, { reliable: true }).catch(() => {});
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  setAudioEnabled(on: boolean) {
    this.local?.getAudioTracks().forEach(t => { t.enabled = on; });
    const tr = this.micPub?.track; if (tr) void (on ? tr.unmute() : tr.mute()).catch(() => {});
  }
  setVideoEnabled(on: boolean) {
    this.local?.getVideoTracks().forEach(t => { t.enabled = on; });
    const tr = this.camPub?.track; if (tr) void (on ? tr.unmute() : tr.mute()).catch(() => {});
  }
  getLocalStream() { return this.local; }
  getScreenStream() { return this.screen; }

  private async replaceVideo(newTrack: MediaStreamTrack | undefined, keepOld = false) {
    if (!newTrack) return;
    const old = this.local?.getVideoTracks()[0];
    if (old) newTrack.enabled = old.enabled;
    void tuneVideoTrack(newTrack);
    if (this.camPub?.track) await this.camPub.track.replaceTrack(newTrack, { userProvidedTrack: true });
    else if (this.room && this.lk) this.camPub = await this.room.localParticipant.publishTrack(newTrack, { source: this.lk.Track.Source.Camera, name: 'camera', simulcast: true });
    if (old && !keepOld && old !== newTrack) old.stop();
    this.local = new MediaStream([newTrack, ...(this.local?.getAudioTracks() || [])]);
    this.events.onLocalStream?.(this.local);
  }

  private async replaceAudio(newTrack: MediaStreamTrack | undefined, stopOld: boolean) {
    if (!newTrack) return;
    const old = this.local?.getAudioTracks()[0];
    if (old) newTrack.enabled = old.enabled;
    if (this.micPub?.track) await this.micPub.track.replaceTrack(newTrack, { userProvidedTrack: true });
    else if (this.room && this.lk) this.micPub = await this.room.localParticipant.publishTrack(newTrack, { source: this.lk.Track.Source.Microphone, name: 'mic' });
    if (old && stopOld && old !== newTrack) old.stop();
    this.local = new MediaStream([...(this.local?.getVideoTracks() || []), newTrack]);
    this.events.onLocalStream?.(this.local);
  }

  async switchCamera(facing: 'user' | 'environment') {
    const current = this.local?.getVideoTracks()[0];
    let next: MediaStream;
    try { next = await openFreeingCurrent(hqVideo({ facingMode: { exact: facing } }) as MediaTrackConstraints, current); }
    catch { next = await openFreeingCurrent(hqVideo({ facingMode: facing }) as MediaTrackConstraints, current); }
    await this.replaceVideo(next.getVideoTracks()[0]);
  }

  private async distinctCameras(): Promise<MediaDeviceInfo[]> {
    const raw = (await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])).filter(d => d.kind === 'videoinput' && d.deviceId);
    const seen = new Set<string>();
    return raw.filter(d => {
      const g = `${(d as any).groupId || ''}|${(d.label || '').toLowerCase()}`;
      if (seen.has(d.deviceId) || seen.has(g)) return false;
      seen.add(d.deviceId); seen.add(g); return true;
    });
  }
  private static mirrorFor(t?: MediaStreamTrack) {
    const fm = t?.getSettings().facingMode as 'user' | 'environment' | undefined;
    const label = (t?.label || '').toLowerCase();
    return { facingMode: fm, mirror: fm === 'user' || (fm == null && /front|user|face|self/.test(label) && !/back|rear|environment|world/.test(label)) };
  }

  async cycleCamera(): Promise<{ facingMode?: 'user' | 'environment'; mirror: boolean }> {
    const cams = await this.distinctCameras();
    if (cams.length <= 1) {
      const cur = this.local?.getVideoTracks()[0]?.getSettings().facingMode;
      await this.switchCamera(cur === 'environment' ? 'user' : 'environment');
    } else {
      const cur = this.local?.getVideoTracks()[0];
      const idx = cams.findIndex(c => c.deviceId === cur?.getSettings().deviceId);
      const next = cams[(idx + 1) % cams.length];
      let s: MediaStream;
      try { s = await openFreeingCurrent(hqVideo({ deviceId: { exact: next.deviceId } }) as MediaTrackConstraints, cur); }
      catch { s = await openFreeingCurrent(hqVideo({ deviceId: next.deviceId }) as MediaTrackConstraints, cur); }
      await this.replaceVideo(s.getVideoTracks()[0]);
    }
    return LiveKitSession.mirrorFor(this.local?.getVideoTracks()[0]);
  }

  async nextCameraStream(currentDeviceId?: string): Promise<{ stream: MediaStream; facingMode?: 'user' | 'environment'; mirror: boolean }> {
    const cams = await this.distinctCameras();
    let stream: MediaStream;
    if (cams.length <= 1) {
      const want = this.local?.getVideoTracks()[0]?.getSettings().facingMode === 'environment' ? 'user' : 'environment';
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ facingMode: { exact: want } }) }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ facingMode: want }) }); }
    } else {
      const idx = currentDeviceId ? cams.findIndex(c => c.deviceId === currentDeviceId) : -1;
      const next = cams[(idx + 1) % cams.length];
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ deviceId: { exact: next.deviceId } }) }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ deviceId: next.deviceId }) }); }
    }
    await tuneVideoTrack(stream.getVideoTracks()[0]);
    return { stream, ...LiveKitSession.mirrorFor(stream.getVideoTracks()[0]) };
  }

  async listDevices(): Promise<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return { cameras: all.filter(d => d.kind === 'videoinput'), mics: all.filter(d => d.kind === 'audioinput'), speakers: all.filter(d => d.kind === 'audiooutput') };
    } catch { return { cameras: [], mics: [], speakers: [] }; }
  }
  getActiveDevices(): { cameraId?: string; micId?: string } {
    return { cameraId: this.local?.getVideoTracks()[0]?.getSettings().deviceId, micId: this.local?.getAudioTracks()[0]?.getSettings().deviceId };
  }

  /** Composer canvas / VTuber output in place of the camera; the composer still owns the source. */
  async publishExternalVideo(track: MediaStreamTrack) { await this.replaceVideo(track, true); }
  /** Voice-changer output in place of the mic; the effect graph still owns the source. */
  async publishExternalAudio(track: MediaStreamTrack) { await this.replaceAudio(track, false); }

  async switchVideoDevice(deviceId: string) {
    const current = this.local?.getVideoTracks()[0];
    let next: MediaStream;
    try { next = await openFreeingCurrent(hqVideo({ deviceId: { exact: deviceId } }) as MediaTrackConstraints, current); }
    catch { next = await openFreeingCurrent(hqVideo({ deviceId }) as MediaTrackConstraints, current); }
    await this.replaceVideo(next.getVideoTracks()[0]);
  }
  async cameraStreamForDevice(deviceId: string): Promise<MediaStream> {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ deviceId: { exact: deviceId } }) }); }
    catch { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hqVideo({ deviceId }) }); }
    await tuneVideoTrack(stream.getVideoTracks()[0]);
    return stream;
  }
  async switchAudioDevice(deviceId: string) {
    const next = await navigator.mediaDevices.getUserMedia({ audio: withMicDevice(this.cfg.media?.audio, deviceId), video: false });
    await this.replaceAudio(next.getAudioTracks()[0], true);
  }

  /** Screen share as its own track (receivers show it in place of the camera, like the mesh does). */
  async startScreenShare(): Promise<boolean> {
    const room = this.room; const lk = this.lk;
    if (!room || !lk) return false;
    try {
      this.screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      const v = this.screen!.getVideoTracks()[0];
      const a = this.screen!.getAudioTracks()[0];
      await room.localParticipant.publishTrack(v, { source: lk.Track.Source.ScreenShare, name: 'screen', simulcast: false, videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 15 } });
      if (a) await room.localParticipant.publishTrack(a, { source: lk.Track.Source.ScreenShareAudio, name: 'screen-audio' });
      v.onended = () => this.stopScreenShare();
      this.events.onScreenStream?.(this.screen);
      return true;
    } catch {
      this.screen?.getTracks().forEach(t => t.stop());
      this.screen = null;
      return false;
    }
  }
  stopScreenShare() {
    const lp = this.room?.localParticipant;
    for (const t of this.screen?.getTracks() || []) { lp?.unpublishTrack(t, true).catch(() => {}); t.stop(); }
    this.screen = null;
    this.events.onScreenStream?.(null);
  }

  async useDesktopAudio(): Promise<boolean> {
    try {
      const disp = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      const track: MediaStreamTrack | undefined = disp.getAudioTracks()[0];
      disp.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());
      if (!track) return false;
      await this.replaceAudio(track, true);
      return true;
    } catch { return false; }
  }

  private stopLocal() {
    if (!this.cfg.localStream) this.local?.getTracks().forEach(t => t.stop());
    this.screen?.getTracks().forEach(t => t.stop());
    this.local = null; this.screen = null;
  }

  private leaving: Promise<void> | null = null;
  leave(): Promise<void> {
    if (this.leaving) return this.leaving;
    this.closed = true;
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    const room = this.room;
    this.room = null;
    this.stopLocal();
    this.leaving = (async () => {
      await deleteDoc(this.presenceDoc()).catch(() => {});
      await room?.disconnect().catch(() => {});
    })();
    return this.leaving;
  }
}
