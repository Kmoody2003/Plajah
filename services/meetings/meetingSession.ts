/**
 * MeetingSession — picks the engine for a meeting at join time and then behaves exactly like an
 * RtcSession. It asks POST /api/meetings/sfu/token:
 *   - { mode: 'sfu' }   → LiveKitSession (LiveKit Cloud today, self-hosted later: same code)
 *   - { mode: 'mesh' }  → rtcCore RtcSession (SFU flag off, SFU unreachable, or a 1:1 call)
 *   - 403 refused       → no join; onError gets a MeetingRoomRefusedError (room full / needs a plan /
 *                         over 300 → offer Stage) that the UI turns into the broadcast offer.
 * The server makes the call for everyone on a room, so all of them land on the same engine.
 */
import { auth } from '../backendService';
import { RtcSession, type RtcSessionConfig, type RtcEvents } from '../rtcCore';
import { LiveKitSession, type SfuEvents, type SfuGrant, type VideoPolicy } from './livekitSession';
import { SFU_REFUSED_CODE, type CapRefusal, type SfuRoomKind } from './sfuCaps';

export type SfuTargetBody = { type: 'room'; roomId: string; scope: string } | { type: 'public'; meetingId: string };

/** Which meeting a signaling path belongs to; null = not a meeting (Live, Talk, Spaces…: always mesh/broadcast). */
export function sfuTargetFor(cfg: Pick<RtcSessionConfig, 'collectionName' | 'sessionId'>): SfuTargetBody | null {
  const c = cfg.collectionName || '';
  let m = /^chat_rooms\/([A-Za-z0-9_-]+)\/meeting_rtc$/.exec(c);
  if (m) return { type: 'room', roomId: m[1], scope: cfg.sessionId };
  m = /^public_meetings\/([A-Za-z0-9_-]+)\/rtc$/.exec(c);
  if (m && cfg.sessionId === 'main') return { type: 'public', meetingId: m[1] };
  return null;
}

export class MeetingRoomRefusedError extends Error {
  readonly code = SFU_REFUSED_CODE;
  constructor(message: string, readonly reason: CapRefusal, readonly cap: number) { super(message); }
}

type Engine = RtcSession | LiveKitSession;

async function askServer(target: SfuTargetBody, purpose: SfuRoomKind, name: string): Promise<
  { mode: 'mesh' } | ({ mode: 'sfu' } & SfuGrant) | { mode: 'refused'; reason: CapRefusal; message: string; cap: number }
> {
  const token = await auth.currentUser?.getIdToken?.().catch(() => undefined);
  if (!token) return { mode: 'mesh' };
  let res: Response;
  try {
    res = await fetch('/api/meetings/sfu/token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, purpose, name }),
    });
  } catch { return { mode: 'mesh' }; }
  const body = await res.json().catch(() => null) as any;
  if (res.status === 403 && body?.code === SFU_REFUSED_CODE) {
    return { mode: 'refused', reason: body.reason, message: String(body.message || 'This meeting is full.'), cap: Number(body.cap) || 0 };
  }
  if (res.ok && body?.mode === 'sfu' && body.url && body.token) return { mode: 'sfu', url: body.url, token: body.token, room: body.room, identity: body.identity, cap: body.cap };
  // Off, 1:1, unreachable, or the server couldn't place us: the mesh is the fallback (rules still gate it).
  return { mode: 'mesh' };
}

export class MeetingSession {
  private inner: Engine | null = null;
  private closed = false;
  private allowed: string[] | undefined;
  private excluded: string[] = [];
  private policy: VideoPolicy | null = null;
  readonly selfId: string;
  engine: 'mesh' | 'sfu' | null = null;

  constructor(private cfg: RtcSessionConfig, private events: SfuEvents & { onEngine?: (e: 'mesh' | 'sfu') => void }, private purpose: SfuRoomKind, private target: SfuTargetBody) {
    this.selfId = cfg.selfId || auth.currentUser?.uid || `anon-${Math.random().toString(36).slice(2)}`;
  }

  get path(): string { return `${this.cfg.collectionName || 'rtc_sessions'}/${this.cfg.sessionId}`; }

  async join(): Promise<void> {
    const name = this.cfg.displayName || auth.currentUser?.displayName || 'Guest';
    const answer = await askServer(this.target, this.purpose, name);
    if (this.closed) return;
    if (answer.mode === 'refused') {
      const err = new MeetingRoomRefusedError(answer.message, answer.reason, answer.cap);
      this.events.onError?.(err);
      throw err;
    }
    const inner: Engine = answer.mode === 'sfu'
      ? new LiveKitSession({ ...this.cfg, selfId: answer.identity }, this.events, answer)
      : new RtcSession(this.cfg, this.events as RtcEvents);
    this.inner = inner;
    this.engine = answer.mode;
    this.events.onEngine?.(answer.mode);
    inner.setExcludedPeers(this.excluded);
    inner.setAllowedPeers(this.allowed);
    if (this.policy && inner instanceof LiveKitSession) inner.setVideoPolicy(this.policy);
    await inner.join();
  }

  setAllowedPeers(ids?: string[]) { this.allowed = ids; this.inner?.setAllowedPeers(ids); }
  setExcludedPeers(ids: string[]) { this.excluded = ids; this.inner?.setExcludedPeers(ids); }
  /** SFU only (mesh receives everything from everyone by design). */
  setVideoPolicy(p: VideoPolicy) { this.policy = p; if (this.inner instanceof LiveKitSession) this.inner.setVideoPolicy(p); }

  sendData(type: string, payload?: any) { this.inner?.sendData(type, payload); }
  setAudioEnabled(on: boolean) { this.inner?.setAudioEnabled(on); }
  setVideoEnabled(on: boolean) { this.inner?.setVideoEnabled(on); }
  getLocalStream() { return this.inner?.getLocalStream() ?? null; }
  getScreenStream() { return this.inner?.getScreenStream() ?? null; }
  private need(): Engine { if (!this.inner) throw new Error('The call is still connecting.'); return this.inner; }
  switchCamera(f: 'user' | 'environment') { return this.need().switchCamera(f); }
  cycleCamera() { return this.need().cycleCamera(); }
  nextCameraStream(id?: string) { return this.need().nextCameraStream(id); }
  listDevices() { return this.inner ? this.inner.listDevices() : Promise.resolve({ cameras: [], mics: [], speakers: [] }); }
  getActiveDevices() { return this.inner?.getActiveDevices() ?? {}; }
  publishExternalVideo(t: MediaStreamTrack) { return this.need().publishExternalVideo(t); }
  publishExternalAudio(t: MediaStreamTrack) { return this.need().publishExternalAudio(t); }
  switchVideoDevice(id: string) { return this.need().switchVideoDevice(id); }
  cameraStreamForDevice(id: string) { return this.need().cameraStreamForDevice(id); }
  switchAudioDevice(id: string) { return this.need().switchAudioDevice(id); }
  startScreenShare() { return this.inner ? this.inner.startScreenShare() : Promise.resolve(false); }
  stopScreenShare() { this.inner?.stopScreenShare(); }
  useDesktopAudio() { return this.inner ? this.inner.useDesktopAudio() : Promise.resolve(false); }
  leave(): Promise<void> {
    this.closed = true;
    return this.inner ? this.inner.leave() : Promise.resolve();
  }
}
