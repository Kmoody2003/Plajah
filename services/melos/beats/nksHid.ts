// NKS tier 2 — EXPERIMENTAL WebHID hardware control (Maschine MK3 pad LEDs + pad input).
//
// Gated behind the Labs flag `plajah_labs_beats_hid` and fully isolated: initBeatsHid returns
// null on ANY failure and callers never branch on HID. The NI HID protocol is closed and
// reverse-engineered by the community (ni-controllers-lib, maschine.rs); report layouts are
// best-effort and verified at runtime by simply not crashing when they're wrong.
//
// Known environment hazard: on Windows, NI's own background services (NTKDaemon / Hardware
// Agent) may claim the HID interface, in which case device.open() throws — we catch, tell the
// user once, and degrade to MIDI mode (which always works).

const LABS_FLAG = 'plajah_labs_beats_hid';
const NI_VENDOR_ID = 0x17cc;

// Maschine MK3 output reports (community-documented).
const REPORT_PAD_LEDS = 0x81;
const PAD_COUNT = 16;

export interface BeatsHid {
  setPadColor(padIdx: number, rgb: [number, number, number], bright?: number): void;
  flushPads(): void;
  onPadHit(cb: (padIdx: number, velocity: number) => void): void;
  dispose(): void;
  deviceName: string;
}

export const hidLabsEnabled = (): boolean => {
  try { return localStorage.getItem(LABS_FLAG) === '1'; } catch { return false; }
};

export const setHidLabsEnabled = (on: boolean): void => {
  try { on ? localStorage.setItem(LABS_FLAG, '1') : localStorage.removeItem(LABS_FLAG); } catch { /* private mode */ }
};

/** Nearest entry in NI's fixed 16-hue × 4-brightness pad palette. */
function toNiColorIndex(rgb: [number, number, number], bright = 3): number {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.08) return max < 0.1 ? 0 : 68 + Math.min(3, bright); // white/off column
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  const hueIdx = ((Math.round(hue * 60 / 22.5) % 16) + 16) % 16;
  return 4 + hueIdx * 4 + Math.max(0, Math.min(3, bright));
}

export async function initBeatsHid(): Promise<BeatsHid | null> {
  if (!hidLabsEnabled()) return null;
  const hid = (navigator as Navigator & { hid?: { requestDevice(o: unknown): Promise<unknown[]> } }).hid;
  if (!hid) return null;

  let device: {
    open(): Promise<void>; close(): Promise<void>; opened: boolean; productName?: string;
    sendReport(id: number, data: Uint8Array): Promise<void>;
    addEventListener(t: string, cb: (e: { reportId: number; data: DataView }) => void): void;
  } | null = null;

  try {
    const devices = await hid.requestDevice({ filters: [{ vendorId: NI_VENDOR_ID }] });
    device = (devices?.[0] as typeof device) ?? null;
    if (!device) return null;
    if (!device.opened) await device.open();
  } catch (e) {
    console.warn('[beats/hid] device unavailable — NI background services may hold it', e);
    return null;
  }

  const padColors = new Uint8Array(PAD_COUNT);
  let padCb: ((padIdx: number, velocity: number) => void) | null = null;
  let disposed = false;

  try {
    device.addEventListener('inputreport', (e) => {
      if (disposed || !padCb) return;
      // Report 0x02 carries pad pressure frames: pairs of (padIdx, u16 pressure).
      if (e.reportId !== 0x02) return;
      const v = e.data;
      for (let off = 0; off + 3 <= v.byteLength; off += 3) {
        const pad = v.getUint8(off);
        const pressure = v.getUint16(off + 1, true);
        if (pad < PAD_COUNT && pressure > 0) padCb(pad, Math.max(1, Math.min(127, Math.round((pressure / 4095) * 127))));
      }
    });
  } catch { /* no input reports — LED-only mode is still useful */ }

  const api: BeatsHid = {
    deviceName: device.productName || 'NI controller',
    setPadColor(padIdx, rgb, bright = 3) {
      if (padIdx < 0 || padIdx >= PAD_COUNT) return;
      padColors[padIdx] = toNiColorIndex(rgb, bright);
    },
    flushPads() {
      if (disposed || !device) return;
      // Fire-and-forget: a dropped LED frame is cosmetic, never worth blocking audio work.
      void device.sendReport(REPORT_PAD_LEDS, padColors).catch(() => { /* */ });
    },
    onPadHit(cb) { padCb = cb; },
    dispose() {
      disposed = true;
      padCb = null;
      try { void device?.close(); } catch { /* */ }
      device = null;
    },
  };
  return api;
}
