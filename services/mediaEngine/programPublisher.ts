// mediaEngine/programPublisher.ts — send an output stream somewhere people can watch it.
//
// Two browser-capable paths, both taking ANY MediaStream (normally the composited program):
//   • goLiveOnPlajah — the platform's own live pipeline: a `streams/{id}` doc, the unified
//     rtcCore 'stage' session as host, and the `live_feeds` discovery mirror + heartbeat. The
//     existing LiveViewer (?stream=<id>) and every "live now" surface pick it up unchanged.
//   • publishWhip — WebRTC-HTTP ingest (Mux WHIP, Cloudflare Stream, MediaMTX, OBS WHIP…).
// RTMP from a browser is not possible; that path belongs to the native host (bridge
// `set_output`) or the server relay (services/broadcastDestinations RELAY_ENABLED).

import { auth, db } from '../backendService';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { RtcSession } from '../rtcCore';
import {
  publishLiveDiscovery, heartbeatLiveDiscovery, endLiveDiscovery, endLiveDiscoveryByStream, streamWatchUrl,
} from '../liveStreamService';
import { HEARTBEAT_INTERVAL_MS } from '../liveFeedLiveness';

/** rtcCore.leave() stops the tracks it was given — hand it clones so the program keeps running. */
const cloneStream = (s: MediaStream) => new MediaStream(s.getTracks().map(t => t.clone()));

// ── Plajah live ────────────────────────────────────────────────────────────────

export interface PlajahLiveOptions {
  title: string;
  /** Listed in "live now" + posted to followers. False = link-only (unlisted). */
  isPublic?: boolean;
  /** Scope to a club/org community (the existing private-stream mechanism). */
  clubId?: string;
  /** Extra fields stamped on the streams doc (e.g. smartProductionId, orgId, sport). */
  extra?: Record<string, unknown>;
}

export interface PlajahLiveHandle {
  streamId: string;
  watchUrl: string;
  stop(): Promise<void>;
}

export async function goLiveOnPlajah(stream: MediaStream, opts: PlajahLiveOptions): Promise<PlajahLiveHandle> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to go live.');
  const streamId = doc(collection(db, 'streams')).id;
  const isPublic = opts.isPublic ?? true;

  await setDoc(doc(db, 'streams', streamId), {
    title: opts.title || 'Live',
    ownerName: user.displayName || 'Creator',
    ownerUid: user.uid,
    viewerCount: 0, totalViews: 0, peakViewers: 0,
    startedAt: Date.now(),
    isLive: true,
    source: 'program-output',
    ...(opts.clubId ? { clubId: opts.clubId } : {}),
    ...(!isPublic ? { isPrivate: true } : {}),
    ...(opts.extra || {}),
  });

  const session = new RtcSession({
    sessionId: streamId,
    topology: 'stage',
    role: 'host',
    localStream: cloneStream(stream),
    displayName: user.displayName || 'Creator',
  });
  try {
    await session.join();
  } catch (e) {
    await updateDoc(doc(db, 'streams', streamId), { isLive: false, endedAt: Date.now() }).catch(() => {});
    throw e;
  }

  let feedId: string | null = null;
  let beat: number | null = null;
  publishLiveDiscovery({
    streamId, title: opts.title, ownerName: user.displayName || 'Creator', ownerPhoto: user.photoURL || '',
    clubId: opts.clubId, isPublic,
  }).then(fid => {
    feedId = fid;
    if (fid) {
      heartbeatLiveDiscovery(fid);
      beat = window.setInterval(() => heartbeatLiveDiscovery(fid), HEARTBEAT_INTERVAL_MS);
    }
  }).catch(() => {});

  return {
    streamId,
    watchUrl: streamWatchUrl(streamId),
    async stop() {
      if (beat) window.clearInterval(beat);
      await updateDoc(doc(db, 'streams', streamId), { isLive: false, endedAt: Date.now() }).catch(() => {});
      await endLiveDiscovery(feedId);
      await endLiveDiscoveryByStream(streamId);
      await session.leave().catch(() => {});
    },
  };
}

// ── WHIP ─────────────────────────────────────────────────────────────────────

export interface WhipOptions {
  /** Bearer token, if the endpoint wants one (Mux: the stream key). */
  bearer?: string;
  videoBps?: number;
  audioBps?: number;
  onStateChange?: (state: RTCPeerConnectionState) => void;
}

export interface WhipHandle { stop(): Promise<void> }

export async function publishWhip(stream: MediaStream, endpoint: string, opts: WhipOptions = {}): Promise<WhipHandle> {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], bundlePolicy: 'max-bundle' });
  const out = cloneStream(stream);
  for (const track of out.getTracks()) {
    const sender = pc.addTrack(track, out);
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = track.kind === 'video' ? (opts.videoBps ?? 4_500_000) : (opts.audioBps ?? 160_000);
    sender.setParameters(params).catch(() => {});
  }
  pc.onconnectionstatechange = () => opts.onStateChange?.(pc.connectionState);

  await pc.setLocalDescription(await pc.createOffer());
  await new Promise<void>(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 4000);
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp', ...(opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {}) },
    body: pc.localDescription?.sdp || '',
  });
  if (!res.ok) {
    pc.close(); out.getTracks().forEach(t => t.stop());
    throw new Error(`WHIP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  // The resource URL (for teardown) comes back in Location, relative to the endpoint.
  const loc = res.headers.get('Location');
  const resourceUrl = loc ? new URL(loc, endpoint).toString() : null;
  await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });

  return {
    async stop() {
      if (resourceUrl) {
        await fetch(resourceUrl, { method: 'DELETE', headers: opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {} }).catch(() => {});
      }
      pc.close();
      out.getTracks().forEach(t => t.stop());
    },
  };
}
