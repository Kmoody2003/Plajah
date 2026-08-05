// broadcast.ts — go live: publish the studio's mixed master (host + on-air callers + soundboard +
// ads) to remote listeners over rtcCore's broadcast topology. The host publishes mix.outputStream;
// listeners join as viewers and receive it. Listeners are passive (no echo), so the full mix is safe
// to publish — unlike the caller mesh, which would need N-1 mixing.

import { RtcSession } from '../rtcCore';

export const broadcastSessionId = (showId: string) => `podcast_live_${showId}`;

export class PodcastBroadcast {
  private session: RtcSession;
  constructor(showId: string, hostUid: string, hostName: string, mixStream: MediaStream, onListeners?: (n: number) => void) {
    this.session = new RtcSession(
      { sessionId: broadcastSessionId(showId), selfId: hostUid, topology: 'broadcast', role: 'host', localStream: mixStream, displayName: hostName },
      { onParticipants: (list) => onListeners?.(list.length) },
    );
  }
  async start(): Promise<void> { await this.session.join(); }
  dispose(): void { try { this.session.leave(); } catch { /* */ } }
}

/** Listener side — subscribe to a live show; `onStream` gives the mixed audio to play. */
export async function joinBroadcast(showId: string, selfId: string, onStream: (s: MediaStream) => void, onError?: (e: Error) => void): Promise<{ leave: () => void }> {
  const session = new RtcSession(
    { sessionId: broadcastSessionId(showId), selfId, topology: 'broadcast', role: 'viewer', displayName: 'Listener' },
    { onRemoteStream: (_id, stream) => onStream(stream), onError },
  );
  await session.join();
  return { leave: () => { try { session.leave(); } catch { /* */ } } };
}
