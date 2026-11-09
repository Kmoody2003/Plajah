// MPEG-TS demuxer: reads the transport streams ffmpeg writes for each encoded elementary stream
// (video, LPCM/AC-3 audio) and yields access units with their PTS/DTS, so the Blu-ray muxer never
// has to reconstruct timing from raw H.264/HEVC.

export interface AccessUnit { pid: number; streamType: number; pts: number; dts: number; data: Uint8Array; key: boolean }

const TS = 188;

export function readPts(b: Uint8Array, o: number): number {
  return (((b[o] >> 1) & 7) * 2 ** 30) + (((b[o + 1] << 7) | (b[o + 2] >> 1)) * 2 ** 15) + ((b[o + 3] << 7) | (b[o + 4] >> 1));
}

/** H.264 IDR (5) or HEVC IRAP (16–23) in an Annex-B access unit. */
export function isKeyframe(data: Uint8Array, codec: 'h264' | 'hevc'): boolean {
  for (let i = 0; i + 4 < data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && (data[i + 2] === 1 || (data[i + 2] === 0 && data[i + 3] === 1))) {
      const h = data[i + 2] === 1 ? i + 3 : i + 4;
      if (codec === 'h264') { const t = data[h] & 0x1f; if (t === 5) return true; if (t === 1) return false; }
      else { const t = (data[h] >> 1) & 0x3f; if (t >= 16 && t <= 23) return true; if (t < 16) return false; }
      i = h;
    }
  }
  return false;
}

/** Streaming demuxer: push() 188- or 192-byte-packet data in any chunk sizes; units come out via onUnit. */
export class TsDemuxer {
  private pmtPid = -1;
  private types = new Map<number, number>();
  private cur = new Map<number, { parts: Uint8Array[]; pts: number; dts: number; ra: boolean }>();
  private carry = new Uint8Array(0);
  constructor(private onUnit: (u: AccessUnit) => void, private packetSize: 188 | 192 = 188) {}

  get streams() { return new Map(this.types); }

  push(chunk: Uint8Array) {
    let buf = chunk;
    if (this.carry.length) { buf = new Uint8Array(this.carry.length + chunk.length); buf.set(this.carry); buf.set(chunk, this.carry.length); }
    const ps = this.packetSize, skip = ps - TS;
    let o = 0;
    for (; o + ps <= buf.length; o += ps) this.packet(buf, o + skip);
    this.carry = buf.slice(o);
  }

  end() { for (const pid of [...this.cur.keys()]) this.flush(pid); }

  private packet(b: Uint8Array, o: number) {
    if (b[o] !== 0x47) return;
    const pusi = !!(b[o + 1] & 0x40);
    const pid = ((b[o + 1] & 0x1f) << 8) | b[o + 2];
    const afc = (b[o + 3] >> 4) & 3;
    let p = o + 4; let ra = false;
    if (afc & 2) { const len = b[p]; if (len > 0) ra = !!(b[p + 1] & 0x40); p += 1 + len; }
    if (!(afc & 1) || p >= o + TS) return;
    const payload = b.subarray(p, o + TS);
    if (pid === 0) return this.pat(payload, pusi);
    if (pid === this.pmtPid) return this.pmt(payload, pusi);
    if (!this.types.has(pid)) return;
    if (pusi) {
      this.flush(pid);
      if (payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1) return;
      const flags = payload[7], hlen = payload[8];
      const pts = flags & 0x80 ? readPts(payload, 9) : -1;
      const dts = flags & 0x40 ? readPts(payload, 14) : pts;
      this.cur.set(pid, { parts: [payload.slice(9 + hlen)], pts, dts, ra });
    } else this.cur.get(pid)?.parts.push(payload.slice());
  }

  private flush(pid: number) {
    const c = this.cur.get(pid); if (!c) return;
    this.cur.delete(pid);
    const n = c.parts.reduce((s, x) => s + x.length, 0);
    const data = new Uint8Array(n); let o = 0; for (const x of c.parts) { data.set(x, o); o += x.length; }
    const st = this.types.get(pid)!;
    const key = st === 0x1b ? isKeyframe(data, 'h264') : st === 0x24 ? isKeyframe(data, 'hevc') : true;
    this.onUnit({ pid, streamType: st, pts: c.pts, dts: c.dts, data, key: key || (c.ra && st !== 0x1b && st !== 0x24) });
  }

  private section(p: Uint8Array, pusi: boolean) { return pusi ? p.subarray(1 + p[0]) : null; }
  private pat(p: Uint8Array, pusi: boolean) {
    const s = this.section(p, pusi); if (!s) return;
    const len = ((s[1] & 0x0f) << 8) | s[2];
    for (let i = 8; i + 4 <= 3 + len - 4; i += 4) { const prog = (s[i] << 8) | s[i + 1]; if (prog !== 0) this.pmtPid = ((s[i + 2] & 0x1f) << 8) | s[i + 3]; }
  }
  private pmt(p: Uint8Array, pusi: boolean) {
    const s = this.section(p, pusi); if (!s) return;
    const len = ((s[1] & 0x0f) << 8) | s[2];
    const pil = ((s[10] & 0x0f) << 8) | s[11];
    for (let i = 12 + pil; i + 5 <= 3 + len - 4;) {
      const st = s[i], pid = ((s[i + 1] & 0x1f) << 8) | s[i + 2], il = ((s[i + 3] & 0x0f) << 8) | s[i + 4];
      if (!this.types.has(pid)) this.types.set(pid, st);
      i += 5 + il;
    }
  }
}

/** Convenience for whole buffers (tests, small menu clips). */
export function demuxAll(buf: Uint8Array, packetSize: 188 | 192 = 188): { units: AccessUnit[]; streams: Map<number, number> } {
  const units: AccessUnit[] = [];
  const d = new TsDemuxer(u => units.push(u), packetSize);
  d.push(buf); d.end();
  return { units, streams: d.streams };
}
