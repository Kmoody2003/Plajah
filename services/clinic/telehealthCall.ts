// Telehealth call — a thin visit-shaped wrapper over rtcCore (the platform's real WebRTC engine).
//
// DEMO STATUS: this carries a real two-way call (camera, mic, screen share) between the provider and a
// "patient" who joins from a link, plus a visit chat. Media is encrypted in transit by WebRTC (DTLS-SRTP)
// and goes peer-to-peer where the network allows. What it is NOT yet: the signalling documents live in the
// general `rtc_sessions` collection and chat is ephemeral (data channel, nothing stored) — both fine for a
// demo with fictional patients, neither acceptable for real visits. See docs/TELEHEALTH_DESIGN.md.
import { RtcSession, type RtcDataMessage } from '../rtcCore';

export type VisitRole = 'provider' | 'patient';

export interface VisitChatMessage { id: string; who: 'me' | 'them'; name: string; text: string; at: number }

export interface VisitCallEvents {
  onLocal?: (s: MediaStream | null) => void;
  onRemote?: (s: MediaStream) => void;
  onPeerLeft?: () => void;
  /** The other party is in the room (before media connects) — drives the "waiting room" state. */
  onPresence?: (otherPresent: boolean, otherName?: string) => void;
  onState?: (state: RTCPeerConnectionState) => void;
  onChat?: (m: VisitChatMessage) => void;
  onConsent?: (name: string) => void;
  onError?: (message: string) => void;
}

const rand = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => (b % 36).toString(36)).join('');

/** Random, unguessable, and free of any patient information. */
export const newVisitSessionId = () => `thdemo-${rand(14)}`;

export const patientJoinUrl = (sessionId: string, patientName?: string) => {
  const u = new URL(window.location.origin + (window.location.pathname || '/'));
  u.searchParams.set('telehealth', sessionId);
  if (patientName) u.searchParams.set('n', patientName);
  return u.toString();
};

export class VisitCall {
  private rtc: RtcSession;
  private left = false;
  readonly role: VisitRole;

  constructor(private sessionId: string, role: VisitRole, private displayName: string, private events: VisitCallEvents = {}, opts: { audio?: boolean } = {}) {
    this.role = role;
    const prefix = role === 'provider' ? 'prov' : 'pt';
    this.rtc = new RtcSession({
      sessionId,
      selfId: `${prefix}-${rand(8)}`,
      topology: 'mesh',
      role: 'participant',
      media: { audio: opts.audio ?? true, video: true },
      displayName,
    }, {
      onLocalStream: s => events.onLocal?.(s),
      onScreenStream: () => { /* local preview of own desktop isn't needed in the visit UI */ },
      onRemoteStream: (_id, s) => events.onRemote?.(s),
      onPeerLeft: () => { events.onPeerLeft?.(); },
      onParticipants: list => {
        const other = list.find(p => p.id.startsWith(role === 'provider' ? 'pt-' : 'prov-'));
        events.onPresence?.(!!other, other?.name);
      },
      onPeerState: (_id, st) => events.onState?.(st),
      onData: (_id, msg) => this.handleData(msg),
      onError: e => events.onError?.(e.message),
    });
  }

  async join() {
    try { await this.rtc.join(); }
    catch (e: any) { this.events.onError?.(e?.message || 'Could not start the camera and microphone.'); throw e; }
    // Tell the other side the patient accepted the demo notice as soon as the data channel opens.
    if (this.role === 'patient') this.announceConsent();
  }

  private consentTimer: ReturnType<typeof setInterval> | null = null;
  private announceConsent() {
    let tries = 0;
    this.consentTimer = setInterval(() => {
      this.rtc.sendData('consent', { name: this.displayName });
      if (++tries > 20 || this.left) this.stopConsent();
    }, 1500);
  }
  private stopConsent() { if (this.consentTimer) clearInterval(this.consentTimer); this.consentTimer = null; }

  private handleData(msg: RtcDataMessage) {
    if (msg.type === 'chat' && msg.payload?.text) {
      this.events.onChat?.({ id: `${msg.payload.at}-${rand(4)}`, who: 'them', name: String(msg.payload.name || 'Other'), text: String(msg.payload.text).slice(0, 2000), at: Number(msg.payload.at) || Date.now() });
    } else if (msg.type === 'consent') {
      this.stopConsent();
      this.events.onConsent?.(String(msg.payload?.name || 'Patient'));
    }
  }

  sendChat(text: string) {
    const t = text.trim().slice(0, 2000);
    if (!t) return;
    const at = Date.now();
    this.rtc.sendData('chat', { text: t, name: this.displayName, at });
    this.events.onChat?.({ id: `${at}-${rand(4)}`, who: 'me', name: this.displayName, text: t, at });
  }

  setMuted(m: boolean) { this.rtc.setAudioEnabled(!m); }
  setVideoOff(off: boolean) { this.rtc.setVideoEnabled(!off); }
  async startShare() { return this.rtc.startScreenShare(); }
  stopShare() { this.rtc.stopScreenShare(); }

  async leave() {
    this.left = true;
    this.stopConsent();
    await this.rtc.leave();
  }
}
