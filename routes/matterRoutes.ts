/**
 * Matter controller API (Plajah Home hub). Every response reflects the real controller fabric and
 * real device state (services/home/matterControllerService → matterWorker running matter.js).
 *
 *   GET    /api/matter/status                     controller status (boots it; creates the fabric on first run)
 *   GET    /api/matter/nodes                      nodes paired with Plajah Home, with live endpoint state
 *   GET    /api/matter/nodes/:nodeId              one node
 *   GET    /api/matter/discover?seconds=6         devices with an OPEN commissioning window (_matterc._udp)
 *   GET    /api/matter/network?seconds=4          operational Matter adverts on the LAN (any fabric)
 *   POST   /api/matter/parse-code                 { code } → decoded pairing payload (no commissioning)
 *   POST   /api/matter/commission   [admin]       { code, knownAddress?, timeoutSeconds? }
 *   POST   /api/matter/control                    { nodeId, endpointId?, command, value?, pin? }
 *   DELETE /api/matter/nodes/:nodeId [admin]      decommission
 *
 * Same LAN / admin rules as routes/homeHubRoutes.ts.
 */
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import matterControllerService from '../services/home/matterControllerService';
import type { MatterCommand } from '../services/home/matterTypes';
import { HOME_HUB_ENABLED, isLoopback } from './homeHubRoutes';
import { hubIdentity } from '../services/home/hubStorage';

export const matterRouter = Router();

const PRIVATE = /^(127\.|::1$|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fe80:|fc|fd|::ffff:(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i;
const isAdmin = (req: Request) => isLoopback(req) || (!!req.get('x-plajah-hub-token') && req.get('x-plajah-hub-token') === hubIdentity().adminToken);

matterRouter.use('/api/matter', (req: Request, res: Response, next: NextFunction) => {
  if (!HOME_HUB_ENABLED) return res.status(404).json({ success: false, error: 'The Plajah Home hub is not enabled on this server' });
  if (!PRIVATE.test(String(req.socket.remoteAddress || ''))) return res.status(403).json({ success: false, error: 'The Matter controller only answers devices on the local network' });
  next();
}, express.json({ limit: '16kb' }));

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Only allowed from the hub PC (or with the hub token)', needsToken: true });
  next();
};

const fail = (res: Response, e: any) => res.status(typeof e?.status === 'number' ? e.status : 500).json({ success: false, error: e?.message || String(e) });

const COMMANDS = new Set<MatterCommand['command']>(['on', 'off', 'toggle', 'level', 'colorTemp', 'heatSetpoint', 'coolSetpoint', 'setpointRaiseLower', 'systemMode', 'lock', 'unlock']);

matterRouter.get('/api/matter/status', async (_req, res) => {
  res.json({ success: true, ...(await matterControllerService.status()) });
});

matterRouter.get('/api/matter/nodes', async (_req, res) => {
  try {
    const nodes = await matterControllerService.listNodes();
    res.json({ success: true, count: nodes.length, nodes });
  } catch (e) { fail(res, e); }
});

matterRouter.get('/api/matter/nodes/:nodeId', async (req, res) => {
  try { res.json({ success: true, node: await matterControllerService.getNode(String(req.params.nodeId)) }); } catch (e) { fail(res, e); }
});

matterRouter.get('/api/matter/discover', async (req, res) => {
  try {
    const devices = await matterControllerService.discoverCommissionable(Number(req.query.seconds) || 6);
    res.json({ success: true, count: devices.length, devices });
  } catch (e) { fail(res, e); }
});

matterRouter.get('/api/matter/network', async (req, res) => {
  try {
    const adverts = await matterControllerService.operationalAdverts(Number(req.query.seconds) || 4);
    res.json({ success: true, count: adverts.length, adverts });
  } catch (e) { fail(res, e); }
});

matterRouter.post('/api/matter/parse-code', async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ success: false, error: 'A Matter manual code or QR string is required' });
  try { res.json({ success: true, payload: await matterControllerService.parseCode(code) }); }
  catch (e: any) { res.status(400).json({ success: false, error: `Not a valid Matter pairing code (${e?.message || 'decode failed'})` }); }
});

matterRouter.post('/api/matter/commission', requireAdmin, async (req, res) => {
  const { code, knownAddress, timeoutSeconds } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ success: false, error: 'A Matter pairing code or QR payload is required' });
  try {
    const node = await matterControllerService.commission({
      code,
      knownAddress: typeof knownAddress === 'string' && knownAddress.trim() ? knownAddress.trim() : undefined,
      timeoutSeconds: Number(timeoutSeconds) || undefined,
    });
    res.json({ success: true, node });
  } catch (e) { fail(res, e); }
});

matterRouter.post('/api/matter/control', async (req, res) => {
  const { nodeId, endpointId, command, value, pin } = req.body || {};
  if (!nodeId || !COMMANDS.has(command)) return res.status(400).json({ success: false, error: 'nodeId and a valid command are required' });
  if ((command === 'lock' || command === 'unlock') && !isAdmin(req)) return res.status(403).json({ success: false, error: 'Locks can only be operated from the hub PC or with the hub token', needsToken: true });
  try {
    const endpoint = await matterControllerService.command({
      nodeId: String(nodeId),
      endpointId: endpointId !== undefined && endpointId !== null && endpointId !== '' ? Number(endpointId) : undefined,
      command, value, pin: typeof pin === 'string' ? pin : undefined,
    });
    res.json({ success: true, endpoint });
  } catch (e) { fail(res, e); }
});

matterRouter.delete('/api/matter/nodes/:nodeId', requireAdmin, async (req, res) => {
  try {
    const r = await matterControllerService.removeNode(String(req.params.nodeId));
    res.json({ success: r.removed, ...r, nodeId: String(req.params.nodeId) });
  } catch (e) { fail(res, e); }
});

matterRouter.use('/api/matter', (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (!err) return next();
  res.status(400).json({ success: false, error: 'Malformed request: ' + (err?.message || 'Invalid JSON') });
});

export default matterRouter;
