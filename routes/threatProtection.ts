// routes/threatProtection.ts — Backend API router for Advance Threat Protection & CSO Agent
import { Router, Request, Response } from 'express';
import { CsoAgentService, ADMIN_PRIMARY_EMAIL } from '../services/csoAgentService';

export const threatProtectionRouter = Router();

// AUTH: this router is mounted in server.ts behind authMiddleware + requireVerifiedAdmin
// (platform admins only). Do not mount it anywhere without that gate — the endpoints below
// email arbitrary addresses and push security warnings to any uid.
// (An earlier requireAdmin lived here but was never applied, and also trusted an
//  `x-admin-bypass` request header and self-editable profile fields; it has been removed.)

/**
 * GET /api/security/threat-protection/stats
 * Real-time platform security telemetry, scores, and timeline.
 */
threatProtectionRouter.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = CsoAgentService.getPlatformStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch threat stats' });
  }
});

/**
 * GET /api/security/threat-protection/events
 * Recent threat and bot events.
 */
threatProtectionRouter.get('/events', (req: Request, res: Response) => {
  try {
    const events = CsoAgentService.getThreatEvents();
    res.json({ events });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch threat events' });
  }
});

/**
 * GET /api/security/threat-protection/map-data
 * Geo pings for the visual security map.
 */
threatProtectionRouter.get('/map-data', (req: Request, res: Response) => {
  try {
    const stats = CsoAgentService.getPlatformStats();
    res.json({ pings: stats.recentPings });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch map data' });
  }
});

/**
 * GET /api/security/threat-protection/assessment
 * Retrieves latest assessment or runs new AI assessment.
 */
threatProtectionRouter.get('/assessment', async (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === 'true';
    let assessment = CsoAgentService.getLatestAssessment();
    if (!assessment || refresh) {
      assessment = await CsoAgentService.generateSecurityAssessment();
    }
    res.json({ assessment });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to generate assessment' });
  }
});

/**
 * POST /api/security/threat-protection/simulate-attack
 * Test trigger for simulating suspected bot reconnaissance or confirmed malicious attack.
 */
threatProtectionRouter.post('/simulate-attack', async (req: Request, res: Response) => {
  try {
    const { isMalicious, targetUserUid } = req.body || {};
    const event = await CsoAgentService.simulateAttack(!!isMalicious, targetUserUid);
    res.json({ ok: true, event });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Simulation failed' });
  }
});

/**
 * POST /api/security/threat-protection/dispatch-alert
 * Dispatches rich incident communication to kmoody2003@gmail.com and admin chat.
 */
threatProtectionRouter.post('/dispatch-alert', async (req: Request, res: Response) => {
  try {
    const { email, eventId } = req.body || {};
    const recipient = email || ADMIN_PRIMARY_EMAIL;
    
    const events = CsoAgentService.getThreatEvents();
    const event = events.find(e => e.id === eventId) || events[0];

    if (!event) {
      return res.status(404).json({ error: 'No threat event found to dispatch' });
    }

    const emailSent = await CsoAgentService.sendRichAdminEmail({
      to: recipient,
      subject: `🚨 [INCIDENT DISPATCH] Security Incident ${event.vector} (${event.severity})`,
      event
    });

    const chatDelivered = await CsoAgentService.dispatchAssessmentToAdminChat(event);

    res.json({ ok: true, emailSent, chatDelivered, recipient });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Alert dispatch failed' });
  }
});

/**
 * POST /api/security/threat-protection/warn-user
 * Sends an urgent security warning to a targeted user account.
 */
threatProtectionRouter.post('/warn-user', async (req: Request, res: Response) => {
  try {
    const { uid, vector, details, ip } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'User UID is required' });

    const warning = await CsoAgentService.warnTargetUser(uid, {
      id: 'evt-' + Date.now(),
      timestamp: Date.now(),
      ip: ip || '198.51.100.42',
      geo: { lat: 37.7749, lng: -122.4194, country: 'United States', city: 'San Francisco' },
      severity: 'MALICIOUS_RED',
      vector: vector || 'CREDENTIAL_STUFFING',
      targetEndpoint: '/api/auth/session',
      targetUid: uid,
      riskScore: 92,
      mitigated: true,
      mitigationAction: 'USER_WARNED',
      details: details || 'Suspicious login pattern detected from unauthorized geographic region.'
    });

    res.json({ ok: true, warning });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'User warning failed' });
  }
});
