// scaleClient - BROWSER-ONLY glue from a real scale to weighedCore's parsers. Two transports, both optional:
//   Web Serial  (navigator.serial)    USB / RS-232 / virtual-COM scales. Chromium desktop only.
//   Web Bluetooth (navigator.bluetooth) BLE scales exposing the standard Weight Scale service (0x181D / 0x2A9D).
// Neither is verified against real hardware (see the report): scales differ, so parsing is defensive and manual entry
// is ALWAYS available in the UI. A scale reading is a convenience, not a legal-for-trade guarantee.
import { parseScaleLine, parseBleWeightMeasurement, type ScaleReading } from './weighedCore';

export const isSerialSupported = (): boolean => typeof navigator !== 'undefined' && !!(navigator as any).serial;
export const isBluetoothSupported = (): boolean => typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
export interface ScaleConnection { close(): Promise<void>; label: string }

/** Ask the user to pick a serial port and stream parsed readings. Lines end with CR, LF, or ETX. */
export async function connectSerialScale(onReading: (r: ScaleReading) => void, onError: (e: string) => void, o: { baudRate?: number } = {}): Promise<ScaleConnection> {
  const serial = (navigator as any).serial; if (!serial) throw new Error('This browser has no Web Serial support. Type the weight instead.');
  const port = await serial.requestPort();
  await port.open({ baudRate: o.baudRate ?? 9600, dataBits: 8, stopBits: 1, parity: 'none' });
  let closed = false; const dec = new TextDecoder(); let buf = '';
  const reader = port.readable.getReader();
  (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        if (buf.length > 4000) buf = buf.slice(-400);              // a scale that never sends a terminator must not grow the buffer
        const parts = buf.split(/[\r\n\x03]+/); buf = parts.pop() || '';
        for (const line of parts) { const r = parseScaleLine(line); if (r) onReading(r); }
      }
    } catch (e: any) { if (!closed) onError(e?.message || 'The scale stopped sending.'); }
  })();
  return { label: 'USB / serial scale', close: async () => { closed = true; try { await reader.cancel(); } catch { /* */ } try { reader.releaseLock(); } catch { /* */ } try { await port.close(); } catch { /* */ } } };
}

/** BLE weight-scale service. Notifications on 0x2A9D (indicate on some devices). */
export async function connectBleScale(onReading: (r: ScaleReading) => void, onError: (e: string) => void): Promise<ScaleConnection> {
  const bt = (navigator as any).bluetooth; if (!bt) throw new Error('This browser has no Web Bluetooth support. Type the weight instead.');
  const dev = await bt.requestDevice({ filters: [{ services: ['weight_scale'] }] });
  const server = await dev.gatt.connect(); const svc = await server.getPrimaryService('weight_scale'); const ch = await svc.getCharacteristic('weight_measurement');
  const h = (e: any) => { const v: DataView = e.target.value; const r = parseBleWeightMeasurement(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); if (r) onReading(r); };
  ch.addEventListener('characteristicvaluechanged', h); await ch.startNotifications();
  dev.addEventListener?.('gattserverdisconnected', () => onError('The scale disconnected.'));
  return { label: dev.name || 'Bluetooth scale', close: async () => { try { ch.removeEventListener('characteristicvaluechanged', h); await ch.stopNotifications(); } catch { /* */ } try { dev.gatt.disconnect(); } catch { /* */ } } };
}
