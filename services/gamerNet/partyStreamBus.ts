// Party voice → live stream. The party dock publishes one mixed audio track holding ONLY the members who agreed
// to be heard (party.streamOk); the phone streamer (MobileLiveStreamer) lays it into its stream mix as the
// 'party' source. Nothing is heard on stream unless a person opted in, and taking consent back drops them at once.

type Listener = (track: MediaStreamTrack | null) => void;
let current: MediaStreamTrack | null = null;
const listeners = new Set<Listener>();

export function setPartyStreamTrack(track: MediaStreamTrack | null): void {
  if (track === current) return;
  current = track;
  for (const l of listeners) l(current);
}

/** Subscribe; called right away with the current track. Returns unsubscribe. */
export function onPartyStreamTrack(l: Listener): () => void {
  listeners.add(l); l(current);
  return () => { listeners.delete(l); };
}

export const partyStreamTrack = () => current;

/** Mixes the consenting members' voices into one track. */
export class PartyStreamMixer {
  private ctx: AudioContext;
  private dest: MediaStreamAudioDestinationNode;
  private srcs = new Map<string, { node: MediaStreamAudioSourceNode; stream: MediaStream }>();

  constructor() {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.dest = this.ctx.createMediaStreamDestination();
  }

  get track(): MediaStreamTrack { return this.dest.stream.getAudioTracks()[0]; }

  /** Exactly these people (uid → their remote voice) are in the mix. */
  setVoices(voices: Map<string, MediaStream>): void {
    for (const [id, s] of this.srcs) if (voices.get(id) !== s.stream) { try { s.node.disconnect(); } catch { /* gone */ } this.srcs.delete(id); }
    for (const [id, stream] of voices) {
      if (this.srcs.has(id) || !stream.getAudioTracks().length) continue;
      const node = this.ctx.createMediaStreamSource(stream);
      node.connect(this.dest);
      this.srcs.set(id, { node, stream });
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  get count(): number { return this.srcs.size; }

  dispose(): void {
    for (const s of this.srcs.values()) { try { s.node.disconnect(); } catch { /* gone */ } }
    this.srcs.clear();
    void this.ctx.close().catch(() => {});
  }
}
