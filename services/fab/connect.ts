// Machine connections. Network printers are reached through their own open HTTP APIs; USB machines
// (Marlin, GRBL, FluidNC) are streamed line by line with the firmware's "ok" handshake over Web
// Serial (Chrome/Edge) or the desktop app's serial bridge. `fetch` is injectable for tests.
//
// Browsers block calls to another origin unless the machine allows it: Moonraker needs our origin in
// `cors_domains`, OctoPrint needs "Allow CORS" (and an API key). The desktop app has no such limit.

import type { Link } from './machines';

export interface Target { host: string; apiKey?: string; user?: string; password?: string }
export interface SendResult { ok: boolean; message: string; jobName?: string }
type Fetch = typeof fetch;
const base = (h: string) => (/^https?:\/\//.test(h) ? h : `http://${h}`).replace(/\/+$/, '');

export async function sendToMachine(link: Link, t: Target, fileName: string, body: string | Blob, start: boolean, f: Fetch = fetch): Promise<SendResult> {
  const blob = typeof body === 'string' ? new Blob([body], { type: 'text/plain' }) : body; const u = base(t.host);
  try {
    switch (link.kind) {
      case 'moonraker': {
        const fd = new FormData(); fd.append('file', blob, fileName); fd.append('root', 'gcodes'); if (start) fd.append('print', 'true');
        const r = await f(`${u}/server/files/upload`, { method: 'POST', body: fd, headers: t.apiKey ? { 'X-Api-Key': t.apiKey } : undefined });
        return r.ok ? { ok: true, message: start ? 'Uploaded and started on Klipper.' : 'Uploaded to Klipper.', jobName: fileName } : { ok: false, message: `Moonraker said ${r.status}` };
      }
      case 'octoprint': {
        const fd = new FormData(); fd.append('file', blob, fileName); fd.append('select', 'true'); fd.append('print', String(start));
        const r = await f(`${u}/api/files/local`, { method: 'POST', body: fd, headers: { 'X-Api-Key': t.apiKey ?? '' } });
        return r.ok ? { ok: true, message: start ? 'Uploaded and started on OctoPrint.' : 'Uploaded to OctoPrint.', jobName: fileName } : { ok: false, message: r.status === 403 ? 'OctoPrint refused the API key.' : `OctoPrint said ${r.status}` };
      }
      case 'prusalink': {
        const r = await f(`${u}/api/v1/files/usb/${encodeURIComponent(fileName)}`, { method: 'PUT', body: blob, headers: { 'X-Api-Key': t.apiKey ?? '', 'Content-Type': 'application/octet-stream', 'Print-After-Upload': start ? '?1' : '?0', Overwrite: '?1' } });
        return r.ok ? { ok: true, message: start ? 'Uploaded and started on PrusaLink.' : 'Uploaded to PrusaLink.', jobName: fileName } : { ok: false, message: r.status === 401 ? 'PrusaLink needs the API key from the printer\'s settings.' : `PrusaLink said ${r.status}` };
      }
      case 'duet': {
        const r = await f(`${u}/rr_upload?name=${encodeURIComponent(`0:/gcodes/${fileName}`)}`, { method: 'POST', body: blob });
        if (!r.ok) return { ok: false, message: `Duet said ${r.status}` };
        if (start) await f(`${u}/rr_gcode?gcode=${encodeURIComponent(`M32 "0:/gcodes/${fileName}"`)}`);
        return { ok: true, message: start ? 'Uploaded and started on the Duet.' : 'Uploaded to the Duet.', jobName: fileName };
      }
      case 'serial': return { ok: false, message: 'USB machines stream from the Send panel (Web Serial) or the desktop app.' };
      case 'file': return { ok: false, message: link.note };
    }
  } catch (e: any) {
    return { ok: false, message: /Failed to fetch|NetworkError|CORS/i.test(String(e?.message)) ? 'Could not reach the machine. Check the address, that it is on, and that it allows this site (CORS), or send from the desktop app.' : String(e?.message ?? e) };
  }
}

/** Live status where the API offers it. */
export async function machineStatus(link: Link, t: Target, f: Fetch = fetch): Promise<{ state: string; progress?: number } | null> {
  const u = base(t.host);
  try {
    if (link.kind === 'moonraker') { const j = await (await f(`${u}/printer/objects/query?print_stats&virtual_sdcard`)).json(); return { state: j.result.status.print_stats.state, progress: j.result.status.virtual_sdcard?.progress }; }
    if (link.kind === 'octoprint') { const j = await (await f(`${u}/api/job`, { headers: { 'X-Api-Key': t.apiKey ?? '' } })).json(); return { state: j.state, progress: (j.progress?.completion ?? 0) / 100 }; }
    if (link.kind === 'prusalink') { const j = await (await f(`${u}/api/v1/status`, { headers: { 'X-Api-Key': t.apiKey ?? '' } })).json(); return { state: j.printer?.state ?? 'unknown', progress: (j.job?.progress ?? 0) / 100 }; }
  } catch { /* unreachable */ }
  return null;
}

// ---- USB streaming ----
export interface LinePort { write(line: string): Promise<void>; readLine(): Promise<string>; close(): Promise<void> }

/** Lines worth sending: comments and blanks stripped. */
export const streamLines = (gcode: string) => gcode.split('\n').map(l => l.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim()).filter(l => l && l !== '%');

/** Send-and-wait streaming: one line, then wait for "ok" (Marlin and GRBL both answer every line). */
export async function streamGcode(port: LinePort, gcode: string, onProgress?: (done: number, total: number) => void, signal?: { stop: boolean }): Promise<SendResult> {
  const lines = streamLines(gcode);
  for (let i = 0; i < lines.length; i++) {
    if (signal?.stop) { await port.write('M5'); return { ok: false, message: `Stopped at line ${i + 1} of ${lines.length}.` }; }
    await port.write(lines[i]);
    for (;;) {
      const r = (await port.readLine()).trim();
      if (/^ok\b/i.test(r)) break;
      if (/^(error|alarm|!!)/i.test(r)) return { ok: false, message: `The machine reported "${r}" at line ${i + 1}: ${lines[i]}` };
      // "echo:busy", temperature reports and GRBL status lines are informational.
    }
    onProgress?.(i + 1, lines.length);
  }
  return { ok: true, message: `Sent ${lines.length} lines.` };
}

/** A LinePort over the browser's Web Serial API (Chrome, Edge). */
export async function openWebSerial(baud: number): Promise<LinePort> {
  const serial = (navigator as any).serial; if (!serial) throw new Error('This browser has no Web Serial. Use Chrome or Edge, or the desktop app.');
  const port = await serial.requestPort(); await port.open({ baudRate: baud });
  const enc = new TextEncoder(), dec = new TextDecoder(); const writer = port.writable.getWriter(); const reader = port.readable.getReader(); let buf = '';
  return {
    write: async line => { await writer.write(enc.encode(line + '\n')); },
    readLine: async () => { for (;;) { const i = buf.indexOf('\n'); if (i >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); return l; } const { value, done } = await reader.read(); if (done) throw new Error('The machine disconnected.'); buf += dec.decode(value); } },
    close: async () => { reader.releaseLock(); writer.releaseLock(); await port.close(); },
  };
}
