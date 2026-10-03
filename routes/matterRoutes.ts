import express, { Router } from 'express';
import matterControllerService from '../services/home/matterControllerService';
import { decodeMatterManualCode, decodeMatterQrCode } from '../services/home/matterCodec';

export const matterRouter = Router();
matterRouter.use(express.json());

// 1. Get all commissioned Matter nodes (auto-discovers if empty or requested)
matterRouter.get('/api/matter/nodes', async (req, res) => {
  try {
    let nodes = matterControllerService.getNodes();
    if (nodes.length === 0 || req.query.discover === 'true') {
      nodes = await matterControllerService.autoDiscoverNodes();
    }
    res.json({ success: true, count: nodes.length, nodes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. Trigger mDNS Auto-Discovery of Matter devices on LAN
matterRouter.post('/api/matter/auto-discover', async (_req, res) => {
  try {
    const nodes = await matterControllerService.autoDiscoverNodes();
    res.json({ success: true, count: nodes.length, nodes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Decode Matter Setup Code or QR payload preview
matterRouter.post('/api/matter/parse-code', (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'A Matter manual code or QR string is required' });
  }

  const trimmed = code.trim();
  const decoded = trimmed.startsWith('MT:')
    ? decodeMatterQrCode(trimmed)
    : decodeMatterManualCode(trimmed);

  if (!decoded) {
    return res.status(400).json({ success: false, error: 'Invalid Matter setup code format (must be 11 or 21 digits, or MT: QR payload)' });
  }

  res.json({ success: true, payload: decoded });
});

// 3. Commission / Pair new Matter device
matterRouter.post('/api/matter/commission', async (req, res) => {
  try {
    const { code, ip, passcode, discriminator, name, roomName } = req.body || {};
    const result = await matterControllerService.commissionDevice({
      code,
      ip,
      passcode: typeof passcode === 'number' ? passcode : (passcode ? parseInt(passcode, 10) : undefined),
      discriminator: typeof discriminator === 'number' ? discriminator : (discriminator ? parseInt(discriminator, 10) : undefined),
      name,
      roomName
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Control Matter Cluster State (OnOff, LevelControl, ColorControl, DoorLock)
matterRouter.post('/api/matter/control', async (req, res) => {
  try {
    const { nodeId, endpointId, cluster, command, value } = req.body || {};
    if (!nodeId || !cluster || !command) {
      return res.status(400).json({ success: false, error: 'Missing nodeId, cluster, or command' });
    }

    const result = await matterControllerService.controlCluster({
      nodeId,
      endpointId,
      cluster,
      command,
      value
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Unpair / Decommission Matter node
matterRouter.delete('/api/matter/nodes/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const removed = await matterControllerService.unpairNode(nodeId);
    res.json({ success: removed, nodeId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Router error handler (must be last)
matterRouter.use((err: any, _req: any, res: any, _next: any) => {
  res.status(400).json({ success: false, error: 'Malformed request: ' + (err?.message || 'Invalid JSON') });
});

export default matterRouter;
