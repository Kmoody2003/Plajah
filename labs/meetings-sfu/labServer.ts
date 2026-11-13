// The real /api/meetings/sfu router, in-process, over an in-memory Firestore and the local LiveKit
// dev server (real RoomService + real signed webhooks → real ledger code).
import express from 'express';
import { createMeetingsSfuRouter } from '../../routes/meetingsSfu';
import { livekitConfigFromEnv } from '../../services/meetings/livekitServer';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAB_ENV = {
  MEETINGS_SFU: '1',
  LIVEKIT_URL: 'ws://127.0.0.1:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'plajah-lab-secret-0123456789abcdef0123',
};

// Point the lab at LiveKit Cloud (or any server) by putting LIVEKIT_URL/KEY/SECRET in a git-ignored
// .env.livekit.local at the repo root (or LAB_LIVEKIT_ENV=<file>). Without it: the local dev server above.
// Cloud webhooks can't reach 127.0.0.1, so the ledger stays empty in that mode.
const envFile = process.env.LAB_LIVEKIT_ENV || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.livekit.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(LIVEKIT_(?:URL|API_KEY|API_SECRET))\s*=\s*"?([^"]*?)"?\s*$/);
    if (m && m[2]) (LAB_ENV as Record<string, string>)[m[1]] = m[2];
  }
}

export function labApp() {
  const docs = new Map<string, Record<string, any>>([
    ['chat_rooms/labgroup', { type: 'GROUP', ownerId: 'alice', name: 'Lab group', participants: ['alice', 'bob', 'carol', 'dave', 'erin'] }],
    ['chat_rooms/labdm', { type: 'PRIVATE', participants: ['alice', 'bob'] }],
    ['public_meetings/labmeet', { roomId: 'labgroup', hostUid: 'alice', guestsAllowed: true, title: 'Lab meeting' }],
    ['public_meetings/labmeet/lobby/guestAnn', { status: 'ADMITTED', name: 'Ann' }],
    ['public_meetings/labmeet/lobby/guestWill', { status: 'WAITING', name: 'Will' }],
  ]);
  const app = express();
  app.use('/api/meetings/sfu', createMeetingsSfuRouter({
    authMiddleware: (req: any, res: any, next: any) => {
      const h = String(req.headers.authorization || '');
      if (!h.startsWith('Bearer ')) return res.status(401).end();
      req.uid = h.slice(7); req.isAnonymous = req.uid.startsWith('guest'); next();
    },
    config: () => livekitConfigFromEnv(LAB_ENV),
    readDoc: async (c, id) => docs.get(`${c}/${id}`) || null,
    createOnce: async (c, id, d) => { const k = `${c}/${id}`; if (docs.has(k)) return 'exists'; docs.set(k, d); return 'created'; },
    patchDoc: async (c, id, d) => { const k = `${c}/${id}`; docs.set(k, { ...(docs.get(k) || {}), ...d }); return true; },
    query: async (c, filters) => [...docs.entries()]
      .filter(([k, v]) => k.startsWith(c + '/') && k.split('/').length === 2 && filters.every(f => v[f.field] === f.value))
      .map(([k, v]) => ({ id: k.split('/')[1], data: v })),
    hasPlajahPlus: async () => false,
    isAdmin: async (req: any) => req.uid === 'kenne',
  }));
  // Ledger dump for the lab page.
  app.get('/lab/ledger', (_req, res) => {
    res.json([...docs.entries()].filter(([k]) => /^(meetingUsage|meetingSfuSessions|meetingSfuRooms)\//.test(k)).map(([k, v]) => ({ k, ...v })));
  });
  return app;
}
