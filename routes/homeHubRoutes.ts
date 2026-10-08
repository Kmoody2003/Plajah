/**
 * Plajah Home hub API (runs on the user's PC; the TV app and the web app call it over the LAN).
 *
 *   GET    /api/home/ping                       hub identity (used by clients to find the hub)
 *   GET    /api/home/state                      every device with live state + per-source status
 *   POST   /api/home/command                    { id, action, value?, pin? }
 *   GET    /api/home/hue/discover               Hue bridges on the LAN
 *   POST   /api/home/hue/pair        [admin]    { ip? } → starts a 30s link-button pairing window
 *   GET    /api/home/hue/pair                   pairing status
 *   DELETE /api/home/hue             [admin]    forget the bridge key
 *   GET    /api/home/hue/lights                 lights + rooms
 *   GET    /api/home/cameras                    cameras (no URLs / credentials)
 *   POST   /api/home/cameras         [admin]    { name, url, kind?, room? }
 *   DELETE /api/home/cameras/:id     [admin]
 *   GET    /api/home/cameras/:id/snapshot       image/jpeg
 *   GET    /api/home/ffmpeg                     ffmpeg availability
 *
 * Access: loopback (the PC itself) can do everything. Other private-LAN addresses can read state,
 * switch lights and change the thermostat; [admin] routes and lock/unlock additionally need the
 * header `X-Plajah-Hub-Token` (shown in the hub panel on the PC). Public addresses are refused.
 * The hub is off on Cloud Run / production unless PLAJAH_HUB=1.
 */
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import os from 'node:os';
import { getHubState, runHubCommand, ADMIN_ACTIONS, type HubAction } from '../services/home/homeHub';
import { discoverBridges, startPairing, pairStatus, unlinkHue, listHue, hueLinked } from '../services/home/hueBridgeService';
import { listCameras, addCamera, removeCamera, snapshot, ffmpegStatus } from '../services/home/cameraSources';
import { hubIdentity } from '../services/home/hubStorage';
import { startHubBeacon, type HubBeacon } from '../services/home/homeMdns';
import matterControllerService from '../services/home/matterControllerService';

export const HOME_HUB_ENABLED = process.env.PLAJAH_HUB === '1' || !!process.env.PLAJAH_HUB_PLATFORM
  || (process.env.PLAJAH_HUB !== '0' && !process.env.K_SERVICE && process.env.NODE_ENV !== 'production');

/** Origins allowed to call the hub from a browser / WebView (CORS is applied in server.ts). */
export const HOME_HUB_ORIGINS = [
  'https://plajah.com', 'https://www.plajah.com',
  'capacitor://localhost', 'http://localhost', 'https://localhost',
];

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:|fc|fd|::ffff:(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.))/i;

function remote(req: Request): string { return String(req.socket.remoteAddress || ''); }
export function isLoopback(req: Request): boolean { return LOOPBACK.test(remote(req)); }
function isLan(req: Request): boolean { const r = remote(req); return LOOPBACK.test(r) || PRIVATE.test(r); }
function isAdmin(req: Request): boolean {
  if (isLoopback(req)) return true;
  const tok = req.get('x-plajah-hub-token');
  return !!tok && tok === hubIdentity().adminToken;
}

const requireLan = (req: Request, res: Response, next: NextFunction) => {
  if (!HOME_HUB_ENABLED) return res.status(404).json({ success: false, error: 'The Plajah Home hub is not enabled on this server' });
  if (!isLan(req)) return res.status(403).json({ success: false, error: 'The Plajah Home hub only answers devices on the local network' });
  next();
};
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'This action is only allowed from the hub PC (or with the hub token)', needsToken: true });
  next();
};

const fail = (res: Response, e: any) => res.status(typeof e?.status === 'number' ? e.status : 500).json({ success: false, error: e?.message || String(e) });

export const homeHubRouter = Router();
homeHubRouter.use(['/api/home/ping', '/api/home/state', '/api/home/command', '/api/home/hue', '/api/home/cameras', '/api/home/ffmpeg', '/api/home/token'], requireLan, express.json({ limit: '16kb' }));

let beacon: HubBeacon | null = null;
let hubPort = Number(process.env.PORT || 3000);

homeHubRouter.get('/api/home/ping', (req, res) => {
  const id = hubIdentity();
  res.json({ success: true, hub: 'plajah-home', v: 1, id: id.id, name: `Plajah Home on ${os.hostname()}`, port: hubPort, admin: isAdmin(req), beacon: beacon ? beacon.instance : null });
});

/** The admin token, shown only to the hub PC itself (loopback) so the user can copy it to a device. */
homeHubRouter.get('/api/home/token', (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ success: false, error: 'Only shown on the hub PC' });
  res.json({ success: true, token: hubIdentity().adminToken });
});

homeHubRouter.get('/api/home/state', async (_req, res) => {
  try { res.json({ success: true, ...(await getHubState()) }); } catch (e) { fail(res, e); }
});

homeHubRouter.post('/api/home/command', async (req, res) => {
  const { id, action, value, pin } = req.body || {};
  if (typeof id !== 'string' || typeof action !== 'string') return res.status(400).json({ success: false, error: 'id and action are required' });
  if (ADMIN_ACTIONS.includes(action as HubAction) && !isAdmin(req)) return res.status(403).json({ success: false, error: 'Locks can only be operated from the hub PC or with the hub token', needsToken: true });
  try {
    const device = await runHubCommand({ id, action: action as HubAction, value, pin: typeof pin === 'string' ? pin : undefined });
    res.json({ success: true, device });
  } catch (e) { fail(res, e); }
});

// ─── Hue ──────────────────────────────────────────────────────────────────────

homeHubRouter.get('/api/home/hue/discover', async (_req, res) => {
  try { res.json({ success: true, bridges: await discoverBridges(), linked: hueLinked() }); } catch (e) { fail(res, e); }
});
homeHubRouter.post('/api/home/hue/pair', requireAdmin, async (req, res) => {
  try { res.json({ success: true, pairing: await startPairing(typeof req.body?.ip === 'string' ? req.body.ip : undefined) }); } catch (e) { fail(res, e); }
});
homeHubRouter.get('/api/home/hue/pair', (_req, res) => { res.json({ success: true, pairing: pairStatus() }); });
homeHubRouter.delete('/api/home/hue', requireAdmin, (_req, res) => { unlinkHue(); res.json({ success: true }); });
homeHubRouter.get('/api/home/hue/lights', async (_req, res) => {
  try { res.json({ success: true, ...(await listHue()) }); } catch (e) { fail(res, e); }
});

// ─── Cameras ──────────────────────────────────────────────────────────────────

homeHubRouter.get('/api/home/ffmpeg', async (_req, res) => { res.json({ success: true, ...(await ffmpegStatus()) }); });
homeHubRouter.get('/api/home/cameras', (_req, res) => { res.json({ success: true, cameras: listCameras() }); });
homeHubRouter.post('/api/home/cameras', requireAdmin, (req, res) => {
  try {
    const { name, url, kind, room } = req.body || {};
    if (typeof url !== 'string' || !url.trim()) return res.status(400).json({ success: false, error: 'url is required' });
    res.json({ success: true, camera: addCamera({ name, url, kind: kind === 'rtsp' || kind === 'http-jpeg' ? kind : undefined, room }) });
  } catch (e) { fail(res, e); }
});
homeHubRouter.delete('/api/home/cameras/:id', requireAdmin, (req, res) => { res.json({ success: removeCamera(String(req.params.id)) }); });
homeHubRouter.get('/api/home/cameras/:id/snapshot', async (req, res) => {
  try {
    const { jpeg, at } = await snapshot(String(req.params.id));
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Snapshot-At': String(at) });
    res.send(jpeg);
  } catch (e) { fail(res, e); }
});

homeHubRouter.use('/api/home', (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (!err) return next();
  res.status(400).json({ success: false, error: 'Malformed request: ' + (err?.message || 'invalid JSON') });
});

/** Stop the beacon and the Matter controller (hubServer.stop / process shutdown). */
export async function stopHomeHub(): Promise<void> {
  beacon?.stop();
  beacon = null;
  await matterControllerService.shutdown().catch(() => {});
}

/**
 * Call once the HTTP server listens: advertises `_plajahhub._tcp` on the LAN (started BEFORE the
 * Matter controller binds its own mDNS sockets — on Windows the newest UDP 5353 socket can starve
 * older ones of LAN multicast, and matter.js must keep receiving), then warms the controller.
 */
export async function startHomeHub(port: number, host = '0.0.0.0'): Promise<void> {
  hubPort = port;
  if (!HOME_HUB_ENABLED) return;
  // A hub that only listens on loopback (the Android TV hub's default) is not reachable from the LAN.
  const lanReachable = !/^(127\.|::1$|localhost$)/.test(host);
  if (lanReachable && !beacon && process.env.PLAJAH_HUB_BEACON !== '0') {
    try {
      beacon = await startHubBeacon({ port, id: hubIdentity().id });
      console.log(`[PlajahHome] hub beacon: ${beacon.instance} → plajah-hub.local:${port} (${beacon.addresses.join(', ') || 'no LAN IPv4'})`);
    } catch (e: any) {
      console.warn('[PlajahHome] mDNS beacon could not start:', e?.message || e);
    }
  }
  // Warm the Matter controller so paired nodes reconnect and the first /state call is fast.
  if (process.env.PLAJAH_MATTER_AUTOSTART !== '0') {
    const t = setTimeout(() => { void matterControllerService.status(); }, 3000);
    t.unref?.();
  }
}

export default homeHubRouter;
