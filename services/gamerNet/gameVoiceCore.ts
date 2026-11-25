// Game voice without React or Firebase — for games that run on their own page (Plajah Motorsport Apex inside
// IframeGameFrame). Gets a LiveKit token from /api/gamer/chat/voice with the player's ID token, publishes the mic
// (audio only), and plays every other player through SpatialVoice so far-away drivers fade out.
//
//   const v = new GameVoiceSession({ apiBase: '', getToken, scope: `rt_${matchId}` });
//   await v.join();                       // asks for the mic (call from a click)
//   v.setListener(pos, forward);          // every frame
//   v.setPeer(uid, pos);                  // per remote player
//   v.setMuted(true); v.leave();
//
// The server only grants players of that room who aren't on child accounts, and lists anyone this player has
// blocked; those voices are never played.

import { SpatialVoice, type SpatialOpts, type Vec3 } from './spatialVoice';

export interface GameVoiceOpts {
  apiBase: string;
  getToken(): Promise<string | null>;
  scope: string;
  spatial?: SpatialOpts;
  onChange?(s: GameVoiceState): void;
}
export interface GameVoiceState { status: 'off' | 'connecting' | 'on' | 'unavailable' | 'error'; error: string; muted: boolean; peers: string[]; speaking: string[] }

export class GameVoiceSession {
  readonly state: GameVoiceState = { status: 'off', error: '', muted: false, peers: [], speaking: [] };
  private room: any = null;
  private mic: MediaStreamTrack | null = null;
  private space: SpatialVoice | null = null;
  private exclude = new Set<string>();
  private o: GameVoiceOpts;

  constructor(o: GameVoiceOpts) { this.o = o; }

  private set(p: Partial<GameVoiceState>) { Object.assign(this.state, p); this.o.onChange?.({ ...this.state }); }

  async join(): Promise<void> {
    if (this.room || this.state.status === 'connecting') return;
    this.set({ status: 'connecting', error: '' });
    try {
      const token = await this.o.getToken();
      if (!token) { this.set({ status: 'error', error: 'Sign in to use voice' }); return; }
      const res = await fetch(`${this.o.apiBase}/api/gamer/chat/voice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ scope: this.o.scope }),
      });
      const g = await res.json().catch(() => ({}));
      if (!res.ok) { this.set({ status: res.status === 503 || res.status === 404 ? 'unavailable' : 'error', error: g?.error || `Voice failed (${res.status})` }); return; }
      this.exclude = new Set<string>(Array.isArray(g.exclude) ? g.exclude : []);

      const [lk, stream] = await Promise.all([
        import('livekit-client'),
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      ]);
      this.mic = stream.getAudioTracks()[0] ?? null;
      this.space = new SpatialVoice(this.o.spatial);
      const room = new lk.Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: true });
      this.room = room;
      const E = lk.RoomEvent;
      room
        .on(E.TrackSubscribed, (track: any, _pub: any, p: any) => {
          if (track.kind !== 'audio' || this.exclude.has(p.identity)) return;
          this.space?.add(p.identity, new MediaStream([track.mediaStreamTrack]));
          if (!this.state.peers.includes(p.identity)) this.set({ peers: [...this.state.peers, p.identity] });
        })
        .on(E.TrackUnsubscribed, (_t: any, _pub: any, p: any) => { this.space?.remove(p.identity); })
        .on(E.ParticipantDisconnected, (p: any) => { this.space?.remove(p.identity); this.set({ peers: this.state.peers.filter(x => x !== p.identity) }); })
        .on(E.ActiveSpeakersChanged, (ps: any[]) => this.set({ speaking: ps.map(x => x.identity).filter((id: string) => !this.exclude.has(id)) }))
        .on(E.Disconnected, () => { if (this.room === room) this.teardown('off'); });
      await room.connect(g.url, g.token, { autoSubscribe: true });
      if (this.room !== room) { await room.disconnect(); return; }
      if (this.mic) await room.localParticipant.publishTrack(this.mic, { source: lk.Track.Source.Microphone, name: 'mic', dtx: true, red: true } as any);
      this.mic && (this.mic.enabled = !this.state.muted);
      this.space.resume();
      this.set({ status: 'on' });
    } catch (e: any) {
      this.teardown('error', e?.message || 'Could not start voice — check your microphone');
    }
  }

  setMuted(m: boolean): void { if (this.mic) this.mic.enabled = !m; this.set({ muted: m }); }
  setListener(pos: Vec3, forward?: Vec3): void { this.space?.setListener(pos, forward); }
  setPeer(uid: string, pos: Vec3 | null): void { this.space?.setPeer(uid, pos); }
  inRange(): string[] { return this.space?.inRange() ?? []; }

  private teardown(status: GameVoiceState['status'], error = ''): void {
    const room = this.room; this.room = null;
    void room?.disconnect?.().catch?.(() => {});
    this.mic?.stop(); this.mic = null;
    this.space?.dispose(); this.space = null;
    this.set({ status, error, peers: [], speaking: [] });
  }

  leave(): void { this.teardown('off'); }
}
