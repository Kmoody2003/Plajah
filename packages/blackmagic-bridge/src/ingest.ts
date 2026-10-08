// ingest.ts — turns "a camera or phone started streaming to this machine" into a switcher source,
// automatically. Blackmagic cameras (Blackmagic OS) and the Blackmagic Camera phone app PUSH RTMP or SRT to a
// URL; they do not wait to be pulled. So the bridge expects a MediaMTX (MIT) server on this machine, watches
// its control API for new publishers, and exposes each as a WHEP URL the engine's WhepSource can subscribe to.
// Publishers are matched to discovered devices by source IP, so a camera's stream lands under the camera's name.
//
// If MediaMTX is not running this reports available:false with the reason; nothing is invented.

import type { BmDevice, IngestInfo, IngestStream } from '../../../services/mediaEngine/blackmagic/protocol.ts';

export interface IngestOptions {
  api?: string;            // MediaMTX control API base
  publicHost: string;      // this machine's LAN address, as cameras will reach it
  whepPort?: number;
  rtmpPort?: number;
  srtPort?: number;
  fetchImpl?: typeof fetch;
}

interface MtxPath { name: string; ready?: boolean; source?: { type?: string; id?: string } | null }
interface MtxConn { path?: string; remoteAddr?: string; state?: string }

const hostOf = (addr?: string) => (addr ?? '').replace(/^\[?([^\]]*)\]?:\d+$/, '$1').replace(/:\d+$/, '');

/** Pure: MediaMTX path/connection lists -> streams. Exported for tests. */
export function buildStreams(paths: MtxPath[], conns: MtxConn[], devices: BmDevice[], o: Pick<IngestOptions, 'publicHost' | 'whepPort'>): IngestStream[] {
  const remoteByPath = new Map<string, string>();
  for (const c of conns) if (c.path && c.remoteAddr) remoteByPath.set(c.path, hostOf(c.remoteAddr));
  return paths.filter(p => p.ready).map(p => {
    const remoteHost = remoteByPath.get(p.name);
    const dev = remoteHost ? devices.find(d => d.host === remoteHost) : undefined;
    return {
      id: `ingest:${p.name}`,
      path: p.name,
      whepUrl: `http://${o.publicHost}:${o.whepPort ?? 8889}/${encodeURIComponent(p.name)}/whep`,
      sourceType: p.source?.type,
      remoteHost,
      deviceId: dev?.id,
      label: dev?.name ?? (remoteHost ? `Stream from ${remoteHost}` : p.name),
    };
  });
}

export class IngestWatcher {
  private timer: NodeJS.Timeout | null = null;
  private lastKey = '';
  info: IngestInfo;
  streams: IngestStream[] = [];

  constructor(private o: IngestOptions, private getDevices: () => BmDevice[], private onChange: (streams: IngestStream[], info: IngestInfo) => void) {
    const api = o.api ?? 'http://127.0.0.1:9997';
    this.info = {
      available: false, reason: 'Not checked yet', mediaMtxApi: api,
      rtmpUrl: `rtmp://${o.publicHost}:${o.rtmpPort ?? 1935}/live`,
      srtUrl: `srt://${o.publicHost}:${o.srtPort ?? 8890}?streamid=publish:live`,
    };
  }

  start(everyMs = 3000) { void this.tick(); this.timer = setInterval(() => void this.tick(), everyMs); }
  stop() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    const f = this.o.fetchImpl ?? fetch;
    const api = this.info.mediaMtxApi!;
    try {
      const get = async (p: string) => { const r = await f(`${api}/v3/${p}`, { signal: AbortSignal.timeout(2000) }); if (!r.ok) throw new Error(String(r.status)); return r.json() as any; };
      const [paths, rtmp, srt] = await Promise.all([get('paths/list'), get('rtmpconns/list').catch(() => ({ items: [] })), get('srtconns/list').catch(() => ({ items: [] }))]);
      this.streams = buildStreams(paths.items ?? [], [...(rtmp.items ?? []), ...(srt.items ?? [])], this.getDevices(), this.o);
      this.info = { ...this.info, available: true, reason: undefined };
    } catch {
      this.streams = [];
      this.info = { ...this.info, available: false, reason: 'MediaMTX is not reachable on this machine. Start it (it is a single MIT-licensed binary) and cameras that push RTMP/SRT will appear here automatically.' };
    }
    const key = JSON.stringify([this.streams, this.info.available]);
    if (key !== this.lastKey) { this.lastKey = key; this.onChange(this.streams, this.info); }
  }
}
