// Entry point for the realtime Cloud Run service (and `npm run realtime:dev` locally).
//   PORT                     Cloud Run injects it (8080); local default 3260
//   GAMER_RT_TICKET_SECRET   shared with plajah-api; verifies join tickets
//   GAMER_RT_RESULT_SECRET   shared with plajah-api; signs posted results
//   GAMER_RT_API_URL         where results go, e.g. https://plajah.com
// All server-only. Never name these VITE_*: Vite would bake them into the browser bundle.

import { startRealtimeServer } from './server';
import { resultPoster } from './resultPoster';

const env = (k: string) => (process.env[k] ?? '').trim();
const ticketSecret = env('GAMER_RT_TICKET_SECRET');
const resultSecret = env('GAMER_RT_RESULT_SECRET');
const apiUrl = env('GAMER_RT_API_URL');
if (ticketSecret.length < 16 || resultSecret.length < 16 || !apiUrl) {
  console.error('realtime: set GAMER_RT_TICKET_SECRET and GAMER_RT_RESULT_SECRET (16+ chars) and GAMER_RT_API_URL');
  process.exit(1);
}
const log = (m: string) => console.log(`[realtime] ${m}`);

const server = await startRealtimeServer({
  port: Number(env('PORT')) || 3260,
  ticketSecret,
  postResult: resultPoster({ apiUrl, secret: resultSecret, log }),
  log,
});

// Cloud Run sends SIGTERM before stopping an instance: close rooms cleanly so clients reconnect elsewhere.
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, () => { void server.close().then(() => process.exit(0)); });
