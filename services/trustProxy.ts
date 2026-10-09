/**
 * Express `trust proxy` for Plajah's production path: browser → Firebase Hosting → Cloud Run.
 *
 * Verified 2026-10-09 from Cloud Run request logs: every /api request arrives from Google
 * front-end addresses (66.102.x, 74.125.x, 64.233.x, 192.178.x…), i.e. Firebase Hosting's proxies,
 * not users. With `trust proxy = 1`, req.ip was therefore a Hosting edge address, so every per-IP
 * rate limit was shared by large groups of real users.
 *
 * Rule: always trust hop 0 (Cloud Run's own front end, the socket peer), and trust further hops
 * only while they are Google front-end addresses. req.ip becomes the first non-Google address
 * walking right-to-left, which is the real client. A client can't spoof it via X-Forwarded-For:
 * Hosting appends the true peer after whatever the client sent, and a direct *.run.app caller's
 * own address isn't in the Google list, so it stops the walk.
 */

// Google front-end / Firebase Hosting egress ranges (Google-owned; not GCP customer space).
const GOOGLE_V4: Array<[number, number]> = [
  '66.102.0.0/20', '66.249.64.0/19', '64.233.160.0/19', '72.14.192.0/18', '74.125.0.0/16',
  '108.177.0.0/17', '142.250.0.0/15', '172.217.0.0/16', '172.253.0.0/16', '173.194.0.0/16',
  '192.178.0.0/15', '209.85.128.0/17', '216.58.192.0/19', '216.239.32.0/19',
].map(parseCidr);
const GOOGLE_V6_PREFIXES = ['2001:4860:', '2404:6800:', '2607:f8b0:', '2800:3f0:', '2a00:1450:', '2c0f:fb50:'];

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const v = Number(s);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}
function parseCidr(c: string): [number, number] {
  const [ip, bits] = c.split('/');
  const b = Number(bits);
  const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
  return [(ipv4ToInt(ip)! & mask) >>> 0, mask];
}

export function isGoogleFrontEnd(addr: string): boolean {
  const a = String(addr || '').trim().toLowerCase();
  const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
  const n = ipv4ToInt(v4);
  if (n !== null) return GOOGLE_V4.some(([net, mask]) => ((n & mask) >>> 0) === net);
  return GOOGLE_V6_PREFIXES.some(p => a.startsWith(p));
}

/** Express trust function: (addr, hopIndex) → trusted? Hop 0 = the socket peer. */
export function plajahTrustProxy(addr: string, i: number): boolean {
  return i === 0 || isGoogleFrontEnd(addr);
}
