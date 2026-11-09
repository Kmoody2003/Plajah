// Machine bridge protocol logic: Marlin numbering/checksums/resend, GRBL character counting, status
// parsing, safety preflight and the desktop-bridge sender over a fake native bus. No hardware.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksum, numberLine, parseResend, classifyReply, parseGrblStatus, streamMarlin, streamGrbl, flavorOf, cleanLines, type LinePort } from '../services/fab/protocol';
import { jobPreflight, programHomes, isEnergetic, portSender, openBridgeSender, listBridgeDevices, type NativeBus } from '../services/fab/sender';

/** A fake machine: `reply(line, index)` returns the lines it answers with. */
function fakePort(reply: (line: string, n: number) => string[]) {
  const sent: string[] = []; const raw: number[] = []; const queue: string[] = []; let waiting: ((l: string) => void) | null = null;
  const push = (l: string) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queue.push(l); };
  const port: LinePort = {
    write: async l => { sent.push(l); for (const r of reply(l, sent.length - 1)) push(r); },
    writeRaw: async b => { raw.push(...b); },
    readLine: () => queue.length ? Promise.resolve(queue.shift()!) : new Promise(r => { waiting = r; }),
    close: async () => {},
  };
  return { port, sent, raw, push };
}

test('checksum and line numbering match the RepRap spec', () => {
  // Known value: "N1 G28" -> XOR of its bytes.
  let x = 0; for (const c of 'N1 G28') x ^= c.charCodeAt(0);
  assert.equal(checksum('N1 G28'), x);
  assert.equal(numberLine(1, 'G28'), `N1 G28*${x}`);
  assert.equal(numberLine(0, 'M110 N0'), `N0 M110 N0*${checksum('N0 M110 N0')}`);
  assert.equal(checksum(''), 0);
});

test('reply classification covers Marlin, Repetier, Klipper and GRBL', () => {
  assert.equal(parseResend('Resend: 12'), 12); assert.equal(parseResend('Resend:7'), 7); assert.equal(parseResend('rs N5'), 5); assert.equal(parseResend('rs 9'), 9); assert.equal(parseResend('ok'), null);
  assert.deepEqual(classifyReply('ok T:200'), { t: 'ok' });
  assert.equal(classifyReply('error:22').t, 'error'); assert.equal((classifyReply('error:22') as any).code, 22);
  assert.equal(classifyReply('ALARM:1').t, 'alarm');
  assert.equal(classifyReply('!! Shutdown due to webhooks request').t, 'error');
  assert.equal(classifyReply('echo:busy: processing').t, 'busy');
  assert.equal(classifyReply('<Idle|MPos:0,0,0|FS:0,0>').t, 'status');
  assert.equal(classifyReply(' T:210.0 /210.0 B:60 /60').t, 'other');
});

test('GRBL status parsing: state, positions, buffer, feed/spindle, WPos from WCO', () => {
  const s = parseGrblStatus('<Run|MPos:10.000,5.500,-1.000|Bf:15,120|FS:500,8000|WCO:2.000,1.000,0.000|Ov:100,100,100>')!;
  assert.equal(s.state, 'Run'); assert.deepEqual(s.mpos, [10, 5.5, -1]); assert.equal(s.planner, 15); assert.equal(s.rx, 120);
  assert.equal(s.feed, 500); assert.equal(s.spindle, 8000); assert.deepEqual(s.wpos, [8, 4.5, -1]); assert.deepEqual(s.ov, [100, 100, 100]);
  const h = parseGrblStatus('<Hold:0|WPos:1,2,3|F:300|Pn:XZ>')!;
  assert.equal(h.state, 'Hold'); assert.equal(h.sub, 0); assert.deepEqual(h.wpos, [1, 2, 3]); assert.equal(h.feed, 300); assert.equal(h.pins, 'XZ');
  assert.equal(parseGrblStatus('ok'), null);
});

test('Marlin streaming numbers every line after M110 and finishes', async () => {
  const f = fakePort(() => ['ok']); const progress: number[] = [];
  const r = await streamMarlin(f.port, 'G28 ; home\nG1 X1\n\nG1 X2', { onProgress: d => progress.push(d) });
  assert.equal(r.ok, true); assert.equal(r.sent, 3);
  assert.equal(f.sent[0], numberLine(0, 'M110 N0')); assert.equal(f.sent[1], numberLine(1, 'G28')); assert.equal(f.sent[3], numberLine(3, 'G1 X2'));
  assert.deepEqual(progress, [1, 2, 3]);
});

test('Marlin resend rewinds to the requested line and does not double-advance on the trailing ok', async () => {
  let garbled = false;
  const f = fakePort(l => { if (l.startsWith('N2 ') && !garbled) { garbled = true; return ['Error:checksum mismatch, Last Line: 1', 'Resend: 2', 'ok']; } return ['ok']; });
  const r = await streamMarlin(f.port, 'G1 X1\nG1 X2\nG1 X3');
  assert.equal(r.ok, true); assert.equal(r.resends, 1);
  assert.deepEqual(f.sent.slice(1).map(l => l.split(' ')[0]), ['N1', 'N2', 'N2', 'N3']);
});

test('Marlin gives up when the same line keeps coming back garbled', async () => {
  const f = fakePort(l => l.startsWith('N2 ') ? ['Resend: 2', 'ok'] : ['ok']);
  const r = await streamMarlin(f.port, 'G1 X1\nG1 X2\nG1 X3', { maxResends: 3 });
  assert.equal(r.ok, false); assert.match(r.message, /cable|baud/);
});

test('Marlin stops on a real error, Klipper streams unnumbered', async () => {
  const f = fakePort(l => /X2/.test(l) ? ['Error:Unknown command'] : ['ok']);
  const r = await streamMarlin(f.port, 'G1 X1\nG1 X2\nG1 X3'); assert.equal(r.ok, false); assert.equal(r.state, 'error');
  const k = fakePort(() => ['ok']); const rk = await streamMarlin(k.port, 'G28\nG1 X1', { numbered: false });
  assert.equal(rk.ok, true); assert.deepEqual(k.sent, ['G28', 'G1 X1']);
  assert.equal(flavorOf('klipper'), 'klipper'); assert.equal(flavorOf('grbl-laser'), 'grbl'); assert.equal(flavorOf('marlin'), 'marlin');
});

test('GRBL character counting keeps the buffer full but never overflows it', async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `G1 X${i}.000 Y${i}.000 F1000`); // 25 chars + \n = 26
  let inFlight = 0, maxInFlight = 0; const acks: string[] = [];
  const f = fakePort(l => { inFlight += l.length + 1; maxInFlight = Math.max(maxInFlight, inFlight); acks.push(l); return []; });
  // The controller answers one "ok" whenever the streamer is waiting on it.
  const origRead = f.port.readLine;
  f.port.readLine = () => { const l = acks.shift(); if (l) { inFlight -= l.length + 1; return Promise.resolve('ok'); } return origRead(); };
  const r = await streamGrbl(f.port, lines.join('\n'), { rxBuffer: 127 });
  assert.equal(r.ok, true); assert.equal(f.sent.length, 40);
  assert.ok(maxInFlight <= 127, `in flight ${maxInFlight}`); assert.ok(maxInFlight >= 26 * 4, 'several lines in flight, not ping-pong');
});

test('GRBL streaming routes status reports aside, stops on error and on alarm', async () => {
  const statuses: string[] = [];
  const f = fakePort((l, n) => n === 0 ? ['<Run|MPos:0,0,0|FS:100,0>', 'ok'] : ['ok']);
  const r = await streamGrbl(f.port, 'G21\nG90\nG1 X1 F100', { onStatus: s => statuses.push(s.state) });
  assert.equal(r.ok, true); assert.deepEqual(statuses, ['Run']);
  const e = fakePort(l => /X2/.test(l) ? ['error:20'] : ['ok']);
  const re = await streamGrbl(e.port, 'G1 X1\nG1 X2\nG1 X3', { rxBuffer: 8 });
  assert.equal(re.ok, false); assert.equal(re.state, 'error'); assert.match(re.message, /G1 X2/);
  const a = fakePort(() => ['ALARM:2']); const ra = await streamGrbl(a.port, 'G1 X999');
  assert.equal(ra.state, 'alarm'); assert.match(ra.message, /\$H/);
  const long = await streamGrbl(fakePort(() => ['ok']).port, `G1 X${'1'.repeat(200)}`); assert.equal(long.ok, false);
});

test('safety preflight: laser needs acknowledgements, unhomed programs need confirmation', () => {
  assert.equal(isEnergetic('laser-diode'), true); assert.equal(isEnergetic('plasma'), true); assert.equal(isEnergetic('fdm', 'marlin'), false); assert.equal(isEnergetic('router', 'grbl-laser'), true);
  assert.equal(programHomes('G21\nG28\n'), true); assert.equal(programHomes('$H\nG0 X0'), true); assert.equal(programHomes('G0 X0 ; G28 later'), false);
  const laser = jobPreflight({ processId: 'laser-co2', dialect: 'grbl-laser', gcode: 'G0 X0\nM4 S500', hazardsAcknowledged: false, homingConfirmed: false });
  assert.equal(laser.blockers.length, 2); assert.match(laser.blockers[0], /laser/i); assert.ok(laser.reminders.some(r => /unattended/.test(r)));
  assert.ok(laser.reminders.some(r => /not resumed automatically/.test(r)));
  const ok = jobPreflight({ processId: 'fdm', dialect: 'marlin', gcode: 'G28\nG1 X1', hazardsAcknowledged: true, homingConfirmed: false });
  assert.deepEqual(ok.blockers, []);
});

test('Web Serial sender refuses an unacknowledged laser job and GRBL stop is hold then reset', async () => {
  const f = fakePort(() => ['ok']); const s = portSender(f.port, 'grbl', 'test');
  const r = await s.run('$H\nM4 S100\nG1 X1', { safety: { energetic: true, hazardsAcknowledged: false, homingConfirmed: true } });
  assert.equal(r.ok, false); assert.equal(f.sent.length, 0);
  await s.stop(); assert.deepEqual(f.raw, [0x21, 0x18]);
  await s.realtime('status'); assert.equal(f.raw[2], 0x3f);
  assert.deepEqual(cleanLines('G1 X1 (c)\r\n%\n'), ['G1 X1']);
});

test('bridge sender talks the FAB_MACHINE_* messages and never resumes on its own', async () => {
  const handlers = new Set<(m: any) => void>(); const posted: any[] = [];
  const emit = (m: any) => setTimeout(() => handlers.forEach(h => h(m)), 0);
  const bus: NativeBus = {
    on: h => { handlers.add(h); return () => handlers.delete(h); },
    post: m => { posted.push(m); const x = m as any;
      if (x.type === 'FAB_MACHINE_LIST') emit({ type: 'FAB_MACHINE_LIST_RESULT', requestId: x.requestId, serial: [{ port: 'COM3', name: 'USB-SERIAL CH340' }], lan: [{ name: 'fluidnc', host: '192.168.1.9', port: 23, service: 'fluidnc' }] });
      if (x.type === 'FAB_MACHINE_OPEN') emit({ type: 'FAB_MACHINE_OPEN_RESULT', id: x.id, ok: true });
      if (x.type === 'FAB_MACHINE_RUN') { emit({ type: 'FAB_MACHINE_PROGRESS', id: x.id, done: 1, total: 2 }); emit({ type: 'FAB_MACHINE_STATUS', id: x.id, raw: '<Run|MPos:1,0,0>' }); emit({ type: 'FAB_MACHINE_DISCONNECTED', id: x.id, duringJob: true }); emit({ type: 'FAB_MACHINE_DONE', id: x.id, ok: false, state: 'disconnected', message: 'Lost', sent: 1, total: 2 }); }
    } };
  const d = await listBridgeDevices(bus); assert.equal(d.serial[0].port, 'COM3'); assert.equal(d.lan[0].service, 'fluidnc');
  const s = await openBridgeSender(bus, { transport: 'serial', port: 'COM3', baud: 115200 }, 'grbl', 'COM3');
  let lost = false; s.onDisconnect(dj => { lost = dj; });
  const prog: number[] = [], st: string[] = [];
  const r = await s.run('$H\nG1 X1', { safety: { energetic: false, hazardsAcknowledged: true, homingConfirmed: false }, onProgress: d2 => prog.push(d2), onStatus: x => st.push(x.state) });
  assert.equal(r.ok, false); assert.equal(r.state, 'disconnected'); assert.deepEqual(prog, [1]); assert.deepEqual(st, ['Run']); assert.equal(lost, true);
  assert.equal(posted.filter(p => p.type === 'FAB_MACHINE_RUN').length, 1, 'no automatic re-run');
  await s.realtime('hold'); await s.stop(); await s.close();
  assert.deepEqual(posted.slice(-3).map(p => p.type), ['FAB_MACHINE_RT', 'FAB_MACHINE_STOP', 'FAB_MACHINE_CLOSE']);
});
