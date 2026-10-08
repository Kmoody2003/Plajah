/**
 * Minimal, honest mDNS / DNS-SD for the Plajah Home hub (server side).
 *
 *  · browse(types, ms)  — sends PTR queries (QU bit) and collects PTR / SRV / TXT / A / AAAA answers,
 *                         then resolves each service instance to host, port, addresses and TXT.
 *                         Nothing is inferred from IP addresses or guessed names.
 *  · startHubBeacon()   — answers queries for `_plajahhub._tcp.local` (and the host name
 *                         `plajah-hub.local`) so TVs / phones on the LAN can find the hub.
 *                         TXT: v=1, id=<hub id>, port=<http port>.
 */
import dgram from 'node:dgram';
import os from 'node:os';

const MDNS_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const T_A = 1, T_PTR = 12, T_TXT = 16, T_AAAA = 28, T_SRV = 33, T_ANY = 255;

// ─── Encoding / decoding ──────────────────────────────────────────────────────

function encName(name: string): Buffer {
  const parts = name.split('.').filter(Boolean);
  return Buffer.concat([...parts.map(p => { const b = Buffer.from(p, 'utf8'); return Buffer.concat([Buffer.from([b.length]), b]); }), Buffer.from([0])]);
}

function readName(buf: Buffer, off: number): [string, number] {
  const labels: string[] = [];
  let o = off, end = off, jumped = false, guard = 0;
  while (guard++ < 128) {
    const len = buf[o];
    if (len === undefined) break;
    if (len === 0) { if (!jumped) end = o + 1; break; }
    if ((len & 0xc0) === 0xc0) {
      const p = ((len & 0x3f) << 8) | buf[o + 1];
      if (!jumped) end = o + 2;
      jumped = true; o = p; continue;
    }
    labels.push(buf.subarray(o + 1, o + 1 + len).toString('utf8'));
    o += len + 1;
  }
  return [labels.join('.'), end];
}

export interface MdnsRecord { name: string; type: number; ttl: number; data: any }

function parsePacket(buf: Buffer): { isResponse: boolean; questions: { name: string; type: number; qu: boolean }[]; records: MdnsRecord[] } {
  const flags = buf.readUInt16BE(2);
  const qd = buf.readUInt16BE(4), an = buf.readUInt16BE(6), ns = buf.readUInt16BE(8), ar = buf.readUInt16BE(10);
  let o = 12;
  const questions: { name: string; type: number; qu: boolean }[] = [];
  for (let i = 0; i < qd; i++) {
    const [name, e] = readName(buf, o);
    questions.push({ name: name.toLowerCase(), type: buf.readUInt16BE(e), qu: (buf.readUInt16BE(e + 2) & 0x8000) !== 0 });
    o = e + 4;
  }
  const records: MdnsRecord[] = [];
  for (let i = 0; i < an + ns + ar; i++) {
    const [name, e] = readName(buf, o); o = e;
    const type = buf.readUInt16BE(o);
    const ttl = buf.readUInt32BE(o + 4);
    const rdlen = buf.readUInt16BE(o + 8);
    const rd = o + 10; o = rd + rdlen;
    let data: any;
    if (type === T_PTR) data = readName(buf, rd)[0];
    else if (type === T_SRV) data = { port: buf.readUInt16BE(rd + 4), target: readName(buf, rd + 6)[0] };
    else if (type === T_A) data = [...buf.subarray(rd, rd + 4)].join('.');
    else if (type === T_AAAA) {
      const parts: string[] = [];
      for (let k = 0; k < 16; k += 2) parts.push(buf.readUInt16BE(rd + k).toString(16));
      data = parts.join(':');   // uncompressed form; valid for net.connect / ping
    } else if (type === T_TXT) {
      const t: string[] = []; let p = rd;
      while (p < rd + rdlen) { const l = buf[p]; t.push(buf.subarray(p + 1, p + 1 + l).toString('utf8')); p += l + 1; }
      data = t;
    } else continue;
    records.push({ name, type, ttl, data });
  }
  return { isResponse: (flags & 0x8000) !== 0, questions, records };
}

function buildQuery(names: string[]): Buffer {
  const h = Buffer.alloc(12);
  h.writeUInt16BE(names.length, 4);
  return Buffer.concat([h, ...names.map(n => Buffer.concat([encName(n), Buffer.from([0, T_PTR, 0x80, 1])]))]);
}

function rr(name: string, type: number, ttl: number, rdata: Buffer, cacheFlush: boolean): Buffer {
  const head = Buffer.alloc(10);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(cacheFlush ? 0x8001 : 0x0001, 2);
  head.writeUInt32BE(ttl, 4);
  head.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([encName(name), head, rdata]);
}

// ─── Browse ───────────────────────────────────────────────────────────────────

export interface MdnsServiceInstance {
  /** e.g. `_hue._tcp.local` */
  service: string;
  /** full instance name, e.g. `Hue Bridge - 8944AD._hue._tcp.local` */
  instance: string;
  /** label before the service type */
  label: string;
  host?: string;
  port?: number;
  ipv4: string[];
  ipv6: string[];
  txt: Record<string, string>;
  /** source address of the packet that carried the PTR */
  from: string;
}

/** Browse one or more DNS-SD service types for `ms` milliseconds. */
export function browse(services: string[], ms = 3000): Promise<MdnsServiceInstance[]> {
  const svc = services.map(s => (s.endsWith('.local') ? s : `${s}.local`).toLowerCase());
  return new Promise(resolve => {
    const records: (MdnsRecord & { from: string })[] = [];
    let sock: dgram.Socket;
    try { sock = dgram.createSocket({ type: 'udp4', reuseAddr: true }); } catch { resolve([]); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      timers.forEach(clearTimeout);
      try { sock.close(); } catch { /* closed */ }
      resolve(assemble(svc, records));
    };
    sock.on('error', () => finish());
    sock.on('message', (msg, rinfo) => {
      try { for (const r of parsePacket(msg).records) records.push({ ...r, from: rinfo.address }); } catch { /* malformed */ }
    });
    sock.bind(0, () => {
      const send = () => { for (let i = 0; i < svc.length; i += 4) { try { sock.send(buildQuery(svc.slice(i, i + 4)), MDNS_PORT, MDNS_ADDR); } catch { /* down */ } } };
      send();
      timers.push(setTimeout(send, Math.min(1000, ms / 3)));
      timers.push(setTimeout(send, Math.min(2500, (ms * 2) / 3)));
      timers.push(setTimeout(finish, ms));
    });
  });
}

function assemble(services: string[], records: (MdnsRecord & { from: string })[]): MdnsServiceInstance[] {
  const lc = (s: string) => s.toLowerCase();
  const out = new Map<string, MdnsServiceInstance>();
  for (const r of records) {
    if (r.type !== T_PTR || !services.includes(lc(r.name))) continue;
    const instance = String(r.data);
    if (out.has(lc(instance))) continue;
    out.set(lc(instance), {
      service: lc(r.name), instance, label: instance.slice(0, instance.length - r.name.length - 1),
      ipv4: [], ipv6: [], txt: {}, from: r.from,
    });
  }
  for (const inst of out.values()) {
    const srv = records.find(r => r.type === T_SRV && lc(r.name) === lc(inst.instance));
    if (srv) { inst.host = srv.data.target; inst.port = srv.data.port; }
    const txt = records.find(r => r.type === T_TXT && lc(r.name) === lc(inst.instance));
    if (txt) for (const kv of txt.data as string[]) { const i = kv.indexOf('='); if (i > 0) inst.txt[kv.slice(0, i)] = kv.slice(i + 1); else if (kv) inst.txt[kv] = ''; }
    if (inst.host) {
      for (const r of records) {
        if (lc(r.name) !== lc(inst.host)) continue;
        if (r.type === T_A && !inst.ipv4.includes(r.data)) inst.ipv4.push(r.data);
        if (r.type === T_AAAA && !inst.ipv6.includes(r.data)) inst.ipv6.push(r.data);
      }
    }
    // No fallback to `from`: Thread devices are advertised by a border router's proxy, so the
    // packet source is the proxy, not the device.
  }
  return [...out.values()];
}

// ─── Hub beacon (responder) ───────────────────────────────────────────────────

export const HUB_SERVICE = '_plajahhub._tcp.local';
export const HUB_HOSTNAME = 'plajah-hub.local';

function lanIpv4(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
    }
  }
  return out;
}

export interface HubBeacon { stop: () => void; addresses: string[]; instance: string }

/**
 * Advertise the hub as `<name>._plajahhub._tcp.local` → plajah-hub.local:<port>, TXT v=1.
 * Binds UDP 5353 with SO_REUSEADDR (shared with the OS responder and matter.js).
 */
export function startHubBeacon(opts: { port: number; id: string; name?: string }): Promise<HubBeacon> {
  const label = (opts.name || `Plajah Home ${os.hostname()}`).replace(/\./g, ' ').slice(0, 63);
  const instance = `${label}.${HUB_SERVICE}`;
  const txt = [`v=1`, `id=${opts.id}`, `port=${opts.port}`];
  const ttl = 120;

  const response = (): Buffer => {
    const ips = lanIpv4();
    const srvData = Buffer.concat([Buffer.from([0, 0, 0, 0, opts.port >> 8, opts.port & 0xff]), encName(HUB_HOSTNAME)]);
    const txtData = Buffer.concat(txt.map(t => { const b = Buffer.from(t); return Buffer.concat([Buffer.from([b.length]), b]); }));
    const answers = [
      rr(HUB_SERVICE, T_PTR, ttl, encName(instance), false),
      rr('_services._dns-sd._udp.local', T_PTR, ttl, encName(HUB_SERVICE), false),
      rr(instance, T_SRV, ttl, srvData, true),
      rr(instance, T_TXT, ttl, txtData, true),
      ...ips.map(ip => rr(HUB_HOSTNAME, T_A, ttl, Buffer.from(ip.split('.').map(Number)), true)),
    ];
    const h = Buffer.alloc(12);
    h.writeUInt16BE(0x8400, 2);          // response, authoritative
    h.writeUInt16BE(answers.length, 6);
    return Buffer.concat([h, ...answers]);
  };

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let announceTimer: ReturnType<typeof setInterval> | undefined;
    const announce = () => { try { sock.send(response(), MDNS_PORT, MDNS_ADDR); } catch { /* down */ } };

    let started = false;
    sock.on('error', err => {
      if (started) { console.warn('[PlajahHome] mDNS beacon socket error:', err.message); return; }
      if (announceTimer) clearInterval(announceTimer);
      try { sock.close(); } catch { /* */ }
      reject(err);
    });
    sock.on('message', (msg, rinfo) => {
      let parsed;
      try { parsed = parsePacket(msg); } catch { return; }
      if (parsed.isResponse) return;
      const hit = parsed.questions.find(q =>
        ((q.type === T_PTR || q.type === T_ANY) && (q.name === HUB_SERVICE || q.name === '_services._dns-sd._udp.local'))
        || ((q.type === T_SRV || q.type === T_TXT || q.type === T_ANY) && q.name === instance.toLowerCase())
        || ((q.type === T_A || q.type === T_ANY) && q.name === HUB_HOSTNAME));
      if (!hit) return;
      const pkt = response();
      try {
        if (hit.qu || rinfo.port !== MDNS_PORT) sock.send(pkt, rinfo.port, rinfo.address);
        else sock.send(pkt, MDNS_PORT, MDNS_ADDR);
      } catch { /* down */ }
    });
    sock.bind(MDNS_PORT, () => {
      for (const ip of lanIpv4()) { try { sock.addMembership(MDNS_ADDR, ip); } catch { /* already joined */ } }
      try { sock.setMulticastTTL(255); } catch { /* */ }
      started = true;
      announce();
      setTimeout(announce, 1000);
      // Re-announce every minute: listeners that cache announcements (Android NSD, Bonjour) see the
      // hub even when this socket is starved of incoming queries (Windows, see homeHubRoutes).
      announceTimer = setInterval(announce, 60_000);
      announceTimer.unref?.();
      resolve({
        addresses: lanIpv4(),
        instance,
        stop: () => { if (announceTimer) clearInterval(announceTimer); try { sock.close(); } catch { /* */ } },
      });
    });
  });
}
