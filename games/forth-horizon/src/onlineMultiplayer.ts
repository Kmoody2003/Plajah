/**
 * onlineMultiplayer.ts — Dual Online Architecture for Apex Elohim:
 *
 * 1. Online Circuit Racing Mode:
 *    Up to 12-player circuit lobbies (join/create room, ready state, synchronized
 *    countdown, 20 Hz car state telemetry & dead-reckoning remote interpolation).
 * 2. Online Persistent Open-World Mode:
 *    Drop-in/drop-out shared open world with remote player avatars/cars,
 *    head-to-head/convoy invites, Cops & Robbers PvP pursuit sync, and persistent
 *    player stats/personal bests.
 *
 * Transport: BroadcastChannel (instant zero-config multi-tab sync) + optional
 * WebSocket relay (`wss://` / `ws://`) when `serverUrl` is provided.
 *
 * Online race through the Plajah Realtime server (joinServerRace): matchmaking and a signed join ticket
 * from /api/gamer/rt, then a server room (services/realtime/) that runs the lobby, ready, synced countdown,
 * 20 Hz state relay and the finish order. The server referees the race; this client only reports where
 * the car is. The result lands on both players' gamer ledgers. See docs/GAMER_NETWORK.md → Realtime.
 */

import * as THREE from 'three';
import type { CarState } from './physics';
import type { PursuitRole } from './copsAndRobbers';
import { RealtimeClient, type RtEvent, type RtStanding } from '../../../services/realtime/client';
import type { GameVoiceSession, GameVoiceState } from '../../../services/gamerNet/gameVoiceCore';

export const FH_RACE_GAME = 'fh-race';
export type ServerRaceJoin = 'quick' | 'create' | { code: string };
export interface ServerRaceOpts {
  apiBase: string;
  getToken(): Promise<string | null>;
  how: ServerRaceJoin;
  /** Lobby/race events for the UI (lobby list, room code, countdown, finishes, final order). */
  onRt?(e: RtEvent): void;
}

/** Firebase ID token for /api/gamer/rt. Inside Plajah the game runs in IframeGameFrame, which answers
 * `plajah.gamerToken.request`; on a local lab `?as=<name>` signs in as the lab's stub user. */
export function resolveGamerToken(timeoutMs = 3000): Promise<string | null> {
  const as = new URLSearchParams(location.search).get('as');
  if (as && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return Promise.resolve(`tok-${as}`);
  if (window.parent === window) return Promise.resolve(null);
  return new Promise(resolve => {
    const done = (tok: string | null) => { removeEventListener('message', on); clearTimeout(timer); resolve(tok); };
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const d = e.data as { type?: string; token?: string | null } | null;
      if (d?.type === 'plajah.gamerToken') done(typeof d.token === 'string' ? d.token : null);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    addEventListener('message', on);
    window.parent.postMessage({ type: 'plajah.gamerToken.request' }, location.origin);
  });
}

export type OnlineMode = 'offline' | 'persistent_world' | 'online_race';

export interface RemoteDriverPacket {
  type: 'state' | 'leave' | 'race_invite' | 'pursuit_apb';
  peerId: string;
  driverName: string;
  carId: string;
  paintHex: number;
  mode: OnlineMode;
  roomId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  steerAngle: number;
  speedMps: number;
  isDrifting: boolean;
  isBraking: boolean;
  onFoot?: boolean;
  pursuitRole?: PursuitRole;
  lap?: number;
  splineT?: number;
  ts: number;
  payload?: string;
}

export interface RemoteDriver {
  peerId: string;
  driverName: string;
  carId: string;
  paintHex: number;
  roomId: string;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  speedMps: number;
  onFoot: boolean;
  pursuitRole?: PursuitRole;
  lap: number;
  splineT: number;
  lastSeenMs: number;
  mesh?: THREE.Group;
}

export interface PersistentProfile {
  driverName: string;
  xp: number;
  credits: number;
  wins: number;
  pursuitBusts: number;
  pursuitEscapes: number;
  bestSpeedMph: number;
}

const PROFILE_KEY = 'apex_elohim_online_profile_v1';

export function loadPersistentProfile(): PersistentProfile {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(PROFILE_KEY) : null;
    if (raw) return JSON.parse(raw) as PersistentProfile;
  } catch {
    // Fallback to default
  }
  return {
    driverName: `Driver-${Math.floor(100 + Math.random() * 899)}`,
    xp: 0,
    credits: 25000,
    wins: 0,
    pursuitBusts: 0,
    pursuitEscapes: 0,
    bestSpeedMph: 0,
  };
}

export function savePersistentProfile(profile: PersistentProfile): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export class OnlineSessionManager {
  readonly peerId = `p_${Math.random().toString(36).slice(2, 10)}`;
  readonly profile: PersistentProfile = loadPersistentProfile();
  mode: OnlineMode = 'offline';
  roomId = 'open-world-na-1';
  readonly remotes = new Map<string, RemoteDriver>();

  /** Set while racing through the Plajah Realtime server. */
  rt: RealtimeClient | null = null;
  standings: RtStanding[] = [];
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private sendAcc = 0;
  private readonly sendInterval = 0.05; // 20 Hz state sync
  private onEvent?: (msg: string) => void;

  constructor(onEvent?: (msg: string) => void) {
    this.onEvent = onEvent;
  }

  connectPersistentWorld(wsUrl?: string): void {
    this.disconnect();
    this.mode = 'persistent_world';
    this.roomId = 'open-world-na-1';
    this.openTransport(wsUrl);
    this.onEvent?.(`ONLINE PERSISTENT WORLD · CONNECTED AS ${this.profile.driverName}`);
  }

  joinOnlineRace(circuitId: string, wsUrl?: string): void {
    this.disconnect();
    this.mode = 'online_race';
    this.roomId = `race_${circuitId}`;
    this.openTransport(wsUrl);
    this.onEvent?.(`ONLINE RACE LOBBY (${circuitId}) · ${this.profile.driverName}`);
  }

  /** Online race through the Plajah Realtime server: queue / room code → ticket → room. Resolves once in the lobby. */
  async joinServerRace(circuitId: string, opts: ServerRaceOpts): Promise<void> {
    this.disconnect();
    this.mode = 'online_race';
    this.roomId = `race_${circuitId}`;
    this.standings = [];
    const rt = new RealtimeClient({ apiBase: opts.apiBase, getToken: opts.getToken, game: FH_RACE_GAME, onEvent: e => { this.onRt(e); opts.onRt?.(e); } });
    this.rt = rt;
    try {
      const matchId = opts.how === 'quick' ? await rt.quickMatch()
        : opts.how === 'create' ? (await rt.createPrivate()).matchId
        : await rt.joinCode(opts.how.code);
      if (this.rt !== rt) return; // cancelled while queueing
      await rt.connect(matchId);
      this.onEvent?.(`ONLINE RACE LOBBY · ${this.profile.driverName}`);
    } catch (e) {
      if (this.rt === rt) { this.rt = null; this.mode = 'offline'; }
      throw e;
    }
  }

  private onRt(e: RtEvent): void {
    const rt = this.rt; if (!rt) return;
    if (e.type === 'states') {
      for (const st of e.states) {
        if (st.seat === rt.seat) continue;
        this.handlePacket({
          type: 'state', peerId: `seat:${st.seat}`, driverName: rt.nameOf(st.seat), carId: String(st.car ?? 'kestrel'), paintHex: Number(st.paint ?? 0x3a7bd5),
          mode: 'online_race', roomId: this.roomId, x: Number(st.x) || 0, y: Number(st.y) || 0, z: Number(st.z) || 0, vx: Number(st.vx) || 0, vz: Number(st.vz) || 0,
          yaw: Number(st.yaw) || 0, steerAngle: Number(st.steer) || 0, speedMps: Number(st.spd) || 0, isDrifting: !!st.drift, isBraking: !!st.brake,
          lap: Number(st.lap) || 0, splineT: Number(st.splineT) || 0, ts: Date.now(),
        });
      }
    } else if (e.type === 'left') this.remotes.delete(`seat:${e.seat}`);
    else if (e.type === 'result') this.standings = e.standings;
  }

  /** What the grid should do this frame: hold in the lobby, count down to the server's GO, or race. */
  raceHold(): null | { lobby: true } | { remainingSec: number } {
    const rt = this.rt; if (!rt) return null;
    if (rt.phase === 'countdown' && rt.goAt) return { remainingSec: Math.max(0, (rt.goAt - rt.serverNow()) / 1000) };
    if (rt.phase === 'lobby' || rt.phase === 'connecting' || rt.phase === 'queue') return { lobby: true };
    return null;
  }

  setReady(ready: boolean): void { this.rt?.setReady(ready); }

  /** Proximity voice for this room (opt-in from a click: it asks for the mic). Drivers fade out with distance. */
  voice: GameVoiceSession | null = null;
  async startVoice(apiBase: string, getToken: () => Promise<string | null>, onChange?: (s: GameVoiceState) => void): Promise<GameVoiceState | null> {
    const rt = this.rt; if (!rt?.matchId) return null;
    if (this.voice) return this.voice.state;
    const { GameVoiceSession: V } = await import('../../../services/gamerNet/gameVoiceCore');
    if (this.rt !== rt) return null;
    // Hear a car clearly within ~25 m, fading out completely past 180 m (a few corners away).
    const v = new V({ apiBase, getToken, scope: `rt_${rt.matchId}`, spatial: { refDistance: 25, maxDistance: 180, rolloff: 1.2 }, onChange });
    this.voice = v;
    await v.join();
    if (v.state.status !== 'on' && v.state.status !== 'connecting') { if (this.voice === v) this.voice = null; }
    return v.state;
  }
  stopVoice(): void { this.voice?.leave(); this.voice = null; }

  disconnect(): void {
    this.stopVoice();
    if (this.rt) { const rt = this.rt; this.rt = null; if (rt.phase === 'queue') void rt.leaveQueue().catch(() => null); rt.leave(); }
    if (this.mode !== 'offline') {
      this.broadcastPacket({
        type: 'leave',
        peerId: this.peerId,
        driverName: this.profile.driverName,
        carId: 'kestrel',
        paintHex: 0xc24d12,
        mode: this.mode,
        roomId: this.roomId,
        x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, steerAngle: 0, speedMps: 0,
        isDrifting: false, isBraking: false,
        ts: Date.now(),
      });
    }
    this.channel?.close();
    this.channel = null;
    this.ws?.close();
    this.ws = null;
    this.remotes.clear();
    this.mode = 'offline';
  }

  private openTransport(wsUrl?: string): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('apex_elohim_net_v1');
      this.channel.onmessage = (ev) => this.handlePacket(ev.data as RemoteDriverPacket);
    }
    if (wsUrl && typeof WebSocket !== 'undefined') {
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (ev) => {
          try {
            this.handlePacket(JSON.parse(String(ev.data)) as RemoteDriverPacket);
          } catch {
            // Ignore non-JSON frames
          }
        };
      } catch {
        // Fallback to BroadcastChannel
      }
    }
  }

  private broadcastPacket(pkt: RemoteDriverPacket): void {
    this.channel?.postMessage(pkt);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(pkt));
    }
  }

  private handlePacket(pkt: RemoteDriverPacket): void {
    if (!pkt || pkt.peerId === this.peerId || pkt.roomId !== this.roomId) return;
    if (pkt.type === 'leave') {
      this.remotes.delete(pkt.peerId);
      return;
    }
    if (pkt.type === 'pursuit_apb' && pkt.payload) {
      this.onEvent?.(pkt.payload);
      return;
    }

    let r = this.remotes.get(pkt.peerId);
    if (!r) {
      r = {
        peerId: pkt.peerId,
        driverName: pkt.driverName,
        carId: pkt.carId,
        paintHex: pkt.paintHex,
        roomId: pkt.roomId,
        pos: new THREE.Vector3(pkt.x, pkt.y, pkt.z),
        targetPos: new THREE.Vector3(pkt.x, pkt.y, pkt.z),
        vel: new THREE.Vector3(pkt.vx, 0, pkt.vz),
        yaw: pkt.yaw,
        targetYaw: pkt.yaw,
        speedMps: pkt.speedMps,
        onFoot: Boolean(pkt.onFoot),
        pursuitRole: pkt.pursuitRole,
        lap: pkt.lap ?? 1,
        splineT: pkt.splineT ?? 0,
        lastSeenMs: Date.now(),
      };
      this.remotes.set(pkt.peerId, r);
      this.onEvent?.(`${pkt.driverName} JOINED SESSION`);
    } else {
      r.targetPos.set(pkt.x, pkt.y, pkt.z);
      r.vel.set(pkt.vx, 0, pkt.vz);
      r.targetYaw = pkt.yaw;
      r.speedMps = pkt.speedMps;
      r.onFoot = Boolean(pkt.onFoot);
      r.pursuitRole = pkt.pursuitRole;
      r.lap = pkt.lap ?? r.lap;
      r.splineT = pkt.splineT ?? r.splineT;
      r.lastSeenMs = Date.now();
    }
  }

  step(
    dt: number,
    playerState: CarState,
    opts?: { carId?: string; paintHex?: number; onFoot?: boolean; pursuitRole?: PursuitRole; lap?: number; splineT?: number }
  ): void {
    if (this.mode === 'offline') return;

    // 1. Broadcast local car state at 20 Hz
    this.sendAcc += dt;
    if (this.sendAcc >= this.sendInterval && this.rt) {
      // Realtime server: compact state; lap = laps done this race, splineT = 0..1 round the lap (the server
      // checks both against a progress-rate cap and the car's speed, then decides finishes itself).
      this.sendAcc = 0;
      this.rt.sendState({
        x: playerState.pos.x, y: playerState.pos.y, z: playerState.pos.z, vx: playerState.vel.x, vz: playerState.vel.z,
        yaw: playerState.yaw, steer: playerState.steerAngle, spd: playerState.speedMps, drift: playerState.isDrifting, brake: playerState.isBraking,
        lap: opts?.lap ?? 0, splineT: opts?.splineT ?? 0, car: opts?.carId ?? 'kestrel', paint: opts?.paintHex ?? 0xc24d12,
      });
    } else if (this.sendAcc >= this.sendInterval) {
      this.sendAcc = 0;
      this.broadcastPacket({
        type: 'state',
        peerId: this.peerId,
        driverName: this.profile.driverName,
        carId: opts?.carId ?? 'kestrel',
        paintHex: opts?.paintHex ?? 0xc24d12,
        mode: this.mode,
        roomId: this.roomId,
        x: playerState.pos.x,
        y: playerState.pos.y,
        z: playerState.pos.z,
        vx: playerState.vel.x,
        vz: playerState.vel.z,
        yaw: playerState.yaw,
        steerAngle: playerState.steerAngle,
        speedMps: playerState.speedMps,
        isDrifting: playerState.isDrifting,
        isBraking: playerState.isBraking,
        onFoot: opts?.onFoot,
        pursuitRole: opts?.pursuitRole,
        lap: opts?.lap,
        splineT: opts?.splineT,
        ts: Date.now(),
      });
    }

    // Proximity voice: me as the listener facing along the car, every other driver at their car.
    if (this.voice && this.rt) {
      const p = playerState.pos;
      this.voice.setListener({ x: p.x, y: p.y, z: p.z }, { x: Math.sin(playerState.yaw), y: 0, z: Math.cos(playerState.yaw) });
      for (const [id, r] of this.remotes) {
        const seat = id.startsWith('seat:') ? Number(id.slice(5)) : NaN;
        const uid = this.rt.players.find(pl => pl.seat === seat)?.uid;
        if (uid) this.voice.setPeer(uid, { x: r.pos.x, y: r.pos.y, z: r.pos.z });
      }
    }

    // 2. Dead-reckon & smoothly interpolate remote drivers + prune stale peers (> 6s)
    const now = Date.now();
    const alpha = 1 - Math.exp(-12 * dt);
    for (const [id, r] of this.remotes.entries()) {
      if (now - r.lastSeenMs > 6000) {
        this.remotes.delete(id);
        continue;
      }
      r.targetPos.x += r.vel.x * dt;
      r.targetPos.z += r.vel.z * dt;
      r.pos.lerp(r.targetPos, alpha);
      let dy = r.targetYaw - r.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      r.yaw += dy * alpha;
    }
  }
}
