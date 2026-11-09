// scripts/livewire-dev.ts — set up a Livewire origin on this machine for local testing.
// Run: npx tsx scripts/livewire-dev.ts
// Writes livewire-dev/mediamtx.yml and prints the next steps. Downloads nothing: install MediaMTX
// yourself from its GitHub releases (MIT) and run it against this file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mediamtxConfig } from '../services/livewire/origin';

const dir = join(process.cwd(), 'livewire-dev');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'mediamtx.yml');
writeFileSync(file, mediamtxConfig({
  authUrl: 'http://127.0.0.1:3000/api/livewire/auth',
  allowOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  webrtc: true,
}));

console.log(`Wrote ${file}

Next (nothing here touches production; Mux keeps carrying live):
  1. Install MediaMTX (github.com/bluenviron/mediamtx/releases) and run:  mediamtx livewire-dev/mediamtx.yml
  2. The auth route (/api/livewire/auth -> decideOriginAuth) is not mounted yet; for a first local
     push, temporarily set authMethod: internal in the yml.
  3. Push a test ladder with the bundled ffmpeg (args from services/livewire/encodeArgs.ts).
  4. Play http://localhost:8888/live/<streamId>/720p/index.m3u8 in hls.js.`);
