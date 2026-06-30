// callLine.ts — Comrex-style call-in for the studio. Callers (signed-in or guests) join the host's
// studio RTC session; the host SCREENS them (host-only monitor, not recorded/broadcast), puts them
// ON AIR (mixed into the master so listeners + the recording hear them), or DROPS them. Built on
// rtcCore (mesh audio). Callers hear the host's mic; publishing the full mix to callers is a refinement.

import { RtcSession } from '../rtcCore';
import type { MixEngine } from './mixEngine';

export type CallerState = 'screening' | 'onair';
export interface StudioCaller { id: string; name: string; state: CallerState }

export const studioSessionId = (showId: string) => `studio_${showId}`;

export class CallLine {
  private session: RtcSession;
  private streams = new Map<string, MediaStream>();
  private callers = new Map<string, StudioCaller>();
  private monitors = new Map<string, HTMLAudioElement>();   // host-only screening playback
  private names = new Map<string, string>();

  constructor(showId: string, hostUid: string, hostName: string, private mix: MixEngine, private onChange?: (c: StudioCaller[]) => void) {
    this.session = new RtcSession(
      { sessionId: studioSessionId(showId), selfId: hostUid, topology: 'mesh', role: 'host', media: { audio: true, video: false }, displayName: hostName },
      {
        onRemoteStream: (id, stream) => this.onCaller(id, stream),
        onParticipants: (list) => { list.forEach(p => { if (p.name) this.names.set(p.id, p.name); }); this.applyNames(); },
        onPeerLeft: (id) => this.drop(id),
      },
    );
  }

  async start(): Promise<void> { await this.session.join(); }

  private onCaller(id: string, stream: MediaStream): void {
    this.streams.set(id, stream);
    if (!this.callers.has(id)) this.callers.set(id, { id, name: this.names.get(id) || 'Caller', state: 'screening' });
    this.screen(id);               // arrive in the screening cue
  }
  private applyNames(): void {
    let changed = false;
    for (const [id, c] of this.callers) { const n = this.names.get(id); if (n && n !== c.name) { c.name = n; changed = true; } }
    if (changed) this.refresh();
  }

  /** Host-only monitor; pull out of the master mix. */
  screen(id: string): void {
    const c = this.callers.get(id), s = this.streams.get(id); if (!c || !s) return;
    this.mix.removeChannel(`caller_${id}`);
    if (!this.monitors.has(id)) { const a = new Audio(); a.srcObject = s; a.play().catch(() => {}); this.monitors.set(id, a); }
    c.state = 'screening'; this.refresh();
  }
  /** Put on air: stop the host monitor, route into the master (recorded + broadcast). */
  air(id: string): void {
    const c = this.callers.get(id), s = this.streams.get(id); if (!c || !s) return;
    const m = this.monitors.get(id); if (m) { m.pause(); (m as any).srcObject = null; this.monitors.delete(id); }
    this.mix.connectStream(`caller_${id}`, s, c.name);
    c.state = 'onair'; this.refresh();
  }
  drop(id: string): void {
    const m = this.monitors.get(id); if (m) { m.pause(); (m as any).srcObject = null; this.monitors.delete(id); }
    this.mix.removeChannel(`caller_${id}`);
    this.streams.delete(id); this.callers.delete(id); this.names.delete(id); this.refresh();
  }
  private refresh(): void { this.onChange?.([...this.callers.values()]); }
  dispose(): void {
    this.monitors.forEach(m => { m.pause(); (m as any).srcObject = null; });
    this.callers.forEach(c => this.mix.removeChannel(`caller_${c.id}`));
    try { this.session.leave(); } catch { /* */ }
  }
}

// ── Caller / guest side ─────────────────────────────────────────────────────────────
export async function joinAsCaller(showId: string, selfId: string, name: string, onError?: (e: Error) => void): Promise<{ leave: () => void }> {
  const session = new RtcSession(
    { sessionId: studioSessionId(showId), selfId, topology: 'mesh', role: 'participant', media: { audio: true, video: false }, displayName: name },
    { onRemoteStream: (_id, stream) => { const a = new Audio(); a.srcObject = stream; a.play().catch(() => {}); }, onError },
  );
  await session.join();
  return { leave: () => { try { session.leave(); } catch { /* */ } } };
}
