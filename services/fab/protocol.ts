// Machine wire protocols, independent of how the bytes travel (Web Serial, the desktop app's serial
// port, or raw TCP to ESP3D / FluidNC). Pure functions and small streaming state machines so they are
// unit-tested without hardware (tests/bridge.test.ts). The desktop app runs the same algorithms in C#
// (windows-native/Plajah.WinUI/FabMachineStreamer.cs); keep the two in step.
//
// Marlin / RepRap: every line answered with "ok"; with line numbers and checksums ("N12 G1 X5*71") a
// garbled line comes back as "Resend: 12" and we rewind. Klipper's serial console answers "ok" too but
// ignores numbering, so it streams plain. GRBL / FluidNC: character counting keeps the controller's
// receive buffer full (several lines in flight) and real-time bytes (?, !, ~, Ctrl-X) bypass the queue.

export type Flavor = 'marlin' | 'klipper' | 'grbl';

/** XOR of every byte of the numbered line, the RepRap checksum. */
export function checksum(s: string): number { let c = 0; for (let i = 0; i < s.length; i++) c ^= s.charCodeAt(i) & 0xff; return c; }
/** "N<n> <line>*<checksum>" as Marlin expects it. */
export function numberLine(n: number, line: string): string { const body = `N${n} ${line}`; return `${body}*${checksum(body)}`; }

/** Lines worth sending: comments, blanks and program-delimiter "%" stripped. */
export const cleanLines = (gcode: string) => gcode.split(/\r?\n/).map(l => l.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim()).filter(l => l && l !== '%');

export type Reply =
  | { t: 'ok' } | { t: 'resend'; line: number } | { t: 'error'; code?: number; text: string } | { t: 'alarm'; code?: number; text: string }
  | { t: 'busy' } | { t: 'status'; status: GrblStatus } | { t: 'other'; text: string };

/** Marlin says "Resend: 12" (or "Resend:12"); Repetier says "rs 12" / "rs N12". */
export function parseResend(s: string): number | null { const m = /^(?:resend:?|rs)\s*N?(\d+)/i.exec(s.trim()); return m ? +m[1] : null; }

export function classifyReply(raw: string): Reply {
  const s = raw.trim();
  if (/^ok\b/i.test(s)) return { t: 'ok' };
  const rs = parseResend(s); if (rs !== null) return { t: 'resend', line: rs };
  if (s.startsWith('<') && s.endsWith('>')) { const st = parseGrblStatus(s); if (st) return { t: 'status', status: st }; }
  let m = /^error:\s*(\d+)?(.*)$/i.exec(s); if (m) return { t: 'error', code: m[1] ? +m[1] : undefined, text: s };
  m = /^alarm:\s*(\d+)?(.*)$/i.exec(s); if (m) return { t: 'alarm', code: m[1] ? +m[1] : undefined, text: s };
  if (/^!!/.test(s)) return { t: 'error', text: s }; // Klipper shutdown
  if (/^echo:\s*busy/i.test(s)) return { t: 'busy' };
  return { t: 'other', text: s };
}

export interface GrblStatus {
  state: string; sub?: number; mpos?: number[]; wpos?: number[]; wco?: number[];
  feed?: number; spindle?: number; planner?: number; rx?: number; line?: number; pins?: string; ov?: number[];
}
/** Parse a GRBL 1.1 / FluidNC report like "<Run|MPos:1.000,2.000,0.000|Bf:15,128|FS:500,8000|WCO:0,0,0>". */
export function parseGrblStatus(s: string): GrblStatus | null {
  const m = /^<(.*)>$/.exec(s.trim()); if (!m) return null;
  const parts = m[1].split('|'); const [state, sub] = parts[0].split(':'); if (!state) return null;
  const out: GrblStatus = { state }; if (sub !== undefined && sub !== '') out.sub = +sub;
  const nums = (v: string) => v.split(',').map(Number);
  for (const p of parts.slice(1)) {
    const i = p.indexOf(':'); if (i < 0) continue; const k = p.slice(0, i), v = p.slice(i + 1);
    if (k === 'MPos') out.mpos = nums(v); else if (k === 'WPos') out.wpos = nums(v); else if (k === 'WCO') out.wco = nums(v);
    else if (k === 'Bf') { const [a, b] = nums(v); out.planner = a; out.rx = b; }
    else if (k === 'FS') { const [a, b] = nums(v); out.feed = a; out.spindle = b; }
    else if (k === 'F') out.feed = +v; else if (k === 'Ln') out.line = +v; else if (k === 'Pn') out.pins = v; else if (k === 'Ov') out.ov = nums(v);
  }
  // Fill the missing frame when the work offset is known: WPos = MPos - WCO.
  if (out.mpos && out.wco && !out.wpos) out.wpos = out.mpos.map((x, j) => +(x - (out.wco![j] ?? 0)).toFixed(4));
  if (out.wpos && out.wco && !out.mpos) out.mpos = out.wpos.map((x, j) => +(x + (out.wco![j] ?? 0)).toFixed(4));
  return out;
}

/** GRBL real-time commands: single bytes acted on immediately, never queued, never answered with "ok". */
export const GRBL_RT = { status: 0x3f /* ? */, hold: 0x21 /* ! */, resume: 0x7e /* ~ */, reset: 0x18 /* Ctrl-X */, door: 0x84, jogCancel: 0x85 } as const;
export type RealtimeCmd = 'status' | 'hold' | 'resume' | 'reset';

/** The transport, whatever carries it. `writeRaw` sends bytes without a newline (GRBL real-time). */
export interface LinePort { write(line: string): Promise<void>; readLine(): Promise<string>; close(): Promise<void>; writeRaw?(bytes: Uint8Array): Promise<void> }

export interface StreamResult { ok: boolean; message: string; sent: number; total: number; resends?: number; state?: 'done' | 'stopped' | 'error' | 'alarm' }
export interface StreamOptions {
  onProgress?: (done: number, total: number) => void; onStatus?: (s: GrblStatus) => void; onLine?: (l: string) => void;
  /** stop: end the job. pause: Marlin/Klipper only, stop feeding lines until cleared (GRBL holds with "!"). */
  signal?: { stop: boolean; pause?: boolean };
  /** GRBL serial receive buffer: 128 bytes on GRBL 1.1 (send 127 to be safe); FluidNC and grblHAL take more. */
  rxBuffer?: number;
  /** Marlin: number lines and add checksums (default on). */
  numbered?: boolean;
  /** Give up after this many resends of the same line (a dead cable, not noise). */
  maxResends?: number;
}

/** Marlin / RepRap / Klipper send-and-wait, with N-numbering, checksums and Resend handling. */
export async function streamMarlin(port: LinePort, gcode: string, o: StreamOptions = {}): Promise<StreamResult> {
  const lines = cleanLines(gcode); const total = lines.length; const numbered = o.numbered !== false; const maxResends = o.maxResends ?? 10;
  // Line N1 is lines[0]; M110 N0 resets the firmware's counter so the job starts at 1.
  if (numbered) { await port.write(numberLine(0, 'M110 N0')); const r = await awaitOk(port, o); if (r) return { ...r, sent: 0, total }; }
  let i = 0, resends = 0, sameLineResends = 0, lastResend = -1;
  while (i < total) {
    while (o.signal?.pause && !o.signal.stop) await new Promise(r => setTimeout(r, 50));
    if (o.signal?.stop) return { ok: false, message: `Stopped before line ${i + 1} of ${total}. Motion already queued in the machine still runs; use its own stop if needed.`, sent: i, total, resends, state: 'stopped' };
    await port.write(numbered ? numberLine(i + 1, lines[i]) : lines[i]);
    let resendTo: number | null = null;
    for (;;) {
      const raw = await port.readLine(); const r = classifyReply(raw); o.onLine?.(raw);
      if (r.t === 'resend') { resendTo = r.line; continue; } // Marlin follows "Resend:" with "ok"
      if (r.t === 'ok') break;
      if (r.t === 'error') {
        // Marlin reports a checksum or line-number mismatch as "Error:..." then "Resend: N"; wait for the resend.
        if (/checksum|line ?number|Line Number is not Last Line Number/i.test(r.text)) continue;
        return { ok: false, message: `The machine reported "${raw.trim()}" at line ${i + 1}: ${lines[i]}`, sent: i, total, resends, state: 'error' };
      }
      if (r.t === 'alarm') return { ok: false, message: `The machine raised "${raw.trim()}" at line ${i + 1}.`, sent: i, total, resends, state: 'alarm' };
    }
    if (resendTo !== null && numbered) {
      const target = Math.max(0, resendTo - 1); resends++;
      sameLineResends = target === lastResend ? sameLineResends + 1 : 1; lastResend = target;
      if (sameLineResends > maxResends) return { ok: false, message: `Line ${resendTo} kept arriving garbled (${maxResends} resends). Check the USB cable and baud rate.`, sent: i, total, resends, state: 'error' };
      i = target; continue;
    }
    i++; o.onProgress?.(i, total);
  }
  return { ok: true, message: `Sent ${total} lines${resends ? ` (${resends} resent)` : ''}.`, sent: total, total, resends, state: 'done' };
}

async function awaitOk(port: LinePort, o: StreamOptions): Promise<Omit<StreamResult, 'sent' | 'total'> | null> {
  for (;;) {
    const raw = await port.readLine(); const r = classifyReply(raw); o.onLine?.(raw);
    if (r.t === 'ok') return null;
    if (r.t === 'error' || r.t === 'alarm') return { ok: false, message: `The machine reported "${raw.trim()}" before the job started.`, state: r.t };
  }
}

/**
 * GRBL character-counting streaming: keep sending while the bytes in flight (each line plus its "\n")
 * fit the controller's receive buffer; every "ok" or "error" retires the oldest line. Stops on the
 * first error or alarm, because carrying on after a rejected line cuts the wrong shape.
 */
export async function streamGrbl(port: LinePort, gcode: string, o: StreamOptions = {}): Promise<StreamResult> {
  const lines = cleanLines(gcode); const total = lines.length; const cap = o.rxBuffer ?? 127;
  const inflight: number[] = []; let used = 0, next = 0, acked = 0;
  for (const l of lines) if (l.length + 1 > cap) return { ok: false, message: `Line "${l.slice(0, 40)}" is longer than the controller's ${cap}-byte buffer.`, sent: 0, total, state: 'error' };
  while (acked < total) {
    if (o.signal?.stop) return { ok: false, message: `Stopped after ${acked} of ${total} lines.`, sent: acked, total, state: 'stopped' };
    while (next < total && used + lines[next].length + 1 <= cap) { await port.write(lines[next]); inflight.push(lines[next].length + 1); used += lines[next].length + 1; next++; }
    const raw = await port.readLine(); const r = classifyReply(raw);
    if (r.t === 'status') { o.onStatus?.(r.status); continue; }
    o.onLine?.(raw);
    if (r.t === 'ok' || r.t === 'error') {
      used -= inflight.shift() ?? 0; acked++;
      if (r.t === 'error') return { ok: false, message: `GRBL rejected line ${acked} (${lines[acked - 1]}): ${raw.trim()}. Stopped; check the program before running again.`, sent: acked, total, state: 'error' };
      o.onProgress?.(acked, total);
    } else if (r.t === 'alarm') return { ok: false, message: `GRBL raised ${raw.trim()} after ${acked} lines. Clear the cause, home ($H) and unlock ($X) before running again.`, sent: acked, total, state: 'alarm' };
  }
  return { ok: true, message: `Sent ${total} lines.`, sent: total, total, state: 'done' };
}

export const streamFor = (flavor: Flavor) => (port: LinePort, gcode: string, o: StreamOptions = {}) =>
  flavor === 'grbl' ? streamGrbl(port, gcode, o) : streamMarlin(port, gcode, { ...o, numbered: flavor === 'marlin' && o.numbered !== false });

/** Which wire protocol a machine dialect speaks. */
export function flavorOf(dialect?: string): Flavor { return dialect === 'grbl' || dialect === 'grbl-laser' ? 'grbl' : dialect === 'klipper' ? 'klipper' : 'marlin'; }
