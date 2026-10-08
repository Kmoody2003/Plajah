// Plajah Bridge entry point.  npm start  (from packages/blackmagic-bridge)
//   PLAJAH_BRIDGE_TOKEN   pairing token (generated and stored once if unset)
//   PLAJAH_BRIDGE_PORT    default 8787
//   PLAJAH_BRIDGE_HOST    LAN address cameras can reach (auto-detected if unset)
//   PLAJAH_MEDIAMTX_API   default http://127.0.0.1:9997
//   PLAJAH_RELAY          wss://plajah.com/api/bm-relay  lets phones / remote browsers reach this bridge (opt-in)
//   PLAJAH_ATEM           comma list of ATEM addresses to add at startup (for networks without mDNS)

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { Bridge } from './bridge.ts';
import { AtemLink } from './atemLink.ts';
import { CameraLink } from './cameraLink.ts';
import { Discovery } from './discovery.ts';
import { IngestWatcher } from './ingest.ts';
import { RelayLink } from './relayLink.ts';
import { DEFAULT_BRIDGE_PORT, deviceId } from '../../../services/mediaEngine/blackmagic/protocol.ts';

function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')) return n.address;
  return '127.0.0.1';
}
function loadToken(): string {
  if (process.env.PLAJAH_BRIDGE_TOKEN) return process.env.PLAJAH_BRIDGE_TOKEN;
  const file = join(homedir(), '.plajah-bridge-token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const t = randomBytes(16).toString('hex');
  writeFileSync(file, t, { mode: 0o600 });
  return t;
}

const token = loadToken();
const port = Number(process.env.PLAJAH_BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT);
const publicHost = process.env.PLAJAH_BRIDGE_HOST ?? lanAddress();

const bridge = new Bridge({
  makeAtem: (id, host, ev) => new AtemLink(id, host, ev),
  makeCamera: (id, host, ev) => new CameraLink(id, host, ev),
}, { token, port });

const actual = await bridge.listen();
const discovery = new Discovery({ up: d => bridge.upsertDevice(d), down: id => bridge.markDown(id) });
discovery.start();
discovery.advertise(actual);

const ingest = new IngestWatcher({ publicHost, api: process.env.PLAJAH_MEDIAMTX_API }, () => bridge.deviceList(), (s, i) => bridge.setIngest(s, i));
ingest.start();

for (const host of (process.env.PLAJAH_ATEM ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
  bridge.upsertDevice({ id: deviceId('atem', host), kind: 'atem', name: `ATEM ${host}`, host, origin: 'manual', link: 'discovered', lastSeen: Date.now() });
}

let relay: RelayLink | null = null;
if (process.env.PLAJAH_RELAY) {
  relay = new RelayLink(bridge, process.env.PLAJAH_RELAY, token, (st, d) => console.log(`Relay: ${st}${d ? ` (${d})` : ''}`));
  await relay.start();
}

console.log(`Plajah Bridge listening on ws://${publicHost}:${actual}`);
console.log(`Pairing token: ${token}`);
console.log(`Cameras that push RTMP/SRT: ${ingest.info.rtmpUrl}  |  ${ingest.info.srtUrl}`);

process.on('SIGINT', async () => { relay?.stop(); ingest.stop(); discovery.stop(); await bridge.close(); process.exit(0); });
