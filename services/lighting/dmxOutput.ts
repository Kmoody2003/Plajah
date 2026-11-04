// Where the universes go. USB interfaces through Web Serial (Chrome, Edge, the desktop app); Art-Net
// and sACN through the desktop app, because a web page cannot send UDP. Each output reports what is
// really happening, so the board never claims a connection it doesn't have.

import { isWindowsApp, postToNative } from '../windowsBridgeService';
import { ARTNET_PORT, SACN_PORT, artnetPacket, enttecProFrame, makeCid, openDmxFrame, sacnMulticast, sacnPacket } from './dmxProtocol';

export type OutputKind = 'enttec-pro' | 'open-dmx' | 'artnet' | 'sacn';

export interface OutputConfig {
  id: string;
  kind: OutputKind;
  /** Board universe (1-based) this output carries. */
  universe: number;
  /** Art-Net: the node's IP, or a broadcast address. Empty means broadcast on the LAN. */
  host?: string;
  /** The universe number on the wire when it differs from the board's. */
  wireUniverse?: number;
}

export type OutputStatus = 'off' | 'live' | 'lost' | 'unavailable';

export interface DmxOutput {
  config: OutputConfig;
  status: OutputStatus;
  detail?: string;
  framesSent: number;
  send(data: Uint8Array): void;
  close(): void;
}

export const OUTPUT_LABEL: Record<OutputKind, string> = {
  'enttec-pro': 'USB: ENTTEC Pro / DMXKing',
  'open-dmx': 'USB: Open DMX (FTDI)',
  artnet: 'Art-Net',
  sacn: 'sACN (E1.31)',
};

export const serialSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).serial;
export const networkSupported = () => isWindowsApp();

/** Byte-identical frames still go out this often, because nodes time out when a source goes quiet. */
const KEEPALIVE_MS = 800;

// ── USB ─────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SerialOutput implements DmxOutput {
  status: OutputStatus = 'off';
  detail?: string;
  framesSent = 0;
  private busy = false;
  private next: Uint8Array | null = null;

  constructor(readonly config: OutputConfig, private port: any) {
    this.status = 'live';
  }

  send(data: Uint8Array) {
    if (this.status !== 'live') return;
    this.next = data.slice();
    if (!this.busy) void this.pump();
  }

  private async pump() {
    this.busy = true;
    try {
      while (this.next && this.status === 'live') {
        const data = this.next;
        this.next = null;
        const writer = this.port.writable.getWriter();
        try {
          if (this.config.kind === 'open-dmx') {
            // A raw dongle needs a real line break before every frame or fixtures ignore it.
            await this.port.setSignals({ break: true });
            await sleep(1);
            await this.port.setSignals({ break: false });
            await writer.write(openDmxFrame(data));
          } else {
            await writer.write(enttecProFrame(data));
          }
          this.framesSent++;
        } finally {
          writer.releaseLock();
        }
      }
    } catch (e: any) {
      this.status = 'lost';
      this.detail = e?.message || 'The USB interface stopped responding.';
    }
    this.busy = false;
  }

  close() {
    this.status = 'off';
    void Promise.resolve(this.port.close?.()).catch(() => {});
  }
}

/** Must run from a click. Returns null if the operator dismissed the browser's device chooser. */
export async function openSerialOutput(kind: 'enttec-pro' | 'open-dmx', universe: number, id: string): Promise<DmxOutput | null> {
  const serial = (navigator as any).serial;
  if (!serial) throw new Error('This browser cannot reach USB devices. Use Chrome, Edge or the Plajah desktop app.');
  let port: any;
  try {
    port = await serial.requestPort();
  } catch {
    return null;
  }
  await port.open(kind === 'open-dmx'
    ? { baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none', flowControl: 'none' }
    : { baudRate: 115200 });
  return new SerialOutput({ id, kind, universe }, port);
}

// ── Network ─────────────────────────────────────────────────────────────────

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

class NetworkOutput implements DmxOutput {
  status: OutputStatus = 'live';
  detail?: string;
  framesSent = 0;
  private sequence = 0;
  private last: Uint8Array | null = null;
  private lastAt = 0;
  private cid = makeCid();

  constructor(readonly config: OutputConfig) {}

  send(data: Uint8Array) {
    if (this.status !== 'live') return;
    const now = Date.now();
    if (this.last && now - this.lastAt < KEEPALIVE_MS && this.last.every((v, i) => v === data[i])) return;
    this.last = data.slice();
    this.lastAt = now;
    this.sequence = (this.sequence + 1) & 0xff;
    const { kind, universe, wireUniverse, host } = this.config;
    if (kind === 'artnet') {
      // Art-Net counts from 0, so board universe 1 is wire universe 0 unless told otherwise.
      const wire = wireUniverse ?? universe - 1;
      // Sequence 0 means "not used" in Art-Net, so keep it out of the rotation.
      if (this.sequence === 0) this.sequence = 1;
      postToNative({ type: 'LD_UDP_SEND', host: host?.trim() || '255.255.255.255', port: ARTNET_PORT, data: toBase64(artnetPacket(wire, this.sequence, data)) });
    } else {
      const wire = wireUniverse ?? universe;
      postToNative({ type: 'LD_UDP_SEND', host: host?.trim() || sacnMulticast(wire), port: SACN_PORT, data: toBase64(sacnPacket(wire, this.sequence, data, this.cid)) });
    }
    this.framesSent++;
  }

  close() {
    this.status = 'off';
  }
}

export function openNetworkOutput(kind: 'artnet' | 'sacn', universe: number, id: string, host?: string, wireUniverse?: number): DmxOutput {
  const output = new NetworkOutput({ id, kind, universe, host, wireUniverse });
  if (!networkSupported()) {
    output.status = 'unavailable';
    output.detail = 'A web page cannot send Art-Net or sACN. Open this board in the Plajah desktop app.';
  }
  return output;
}
