// routes/threatProtection.ts — Backend API router for Advance Threat Protection & CSO Agent
import { Router, Request, Response } from 'express';
import { CsoAgentService, ADMIN_PRIMARY_EMAIL } from '../services/csoAgentService';
import { getCouncilStore } from '../services/securityCouncil/registry';
import { councilAssessment, councilPlatformStats, councilThreatEvents } from '../services/securityCouncil/csoBridge';

/** The real data source (Security & IT Council in Firestore), or null when the server has no service account. */
async function councilStore() {
  const s = getCouncilStore();
  return s && (await s.ready()) ? s : null;
}
/** Admin "simulate attack" events live only in this process; show them alongside real data, labelled. */
const simulatedEvents = () => CsoAgentService.getThreatEvents().filter(e => e.simulated);

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
threatProtectionRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const store = await councilStore();
    // No council store → in-memory stats, which are explicitly dataSource 'NONE' | 'SIMULATION'.
    const stats = store ? await councilPlatformStats(store) : CsoAgentService.getPlatformStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch threat stats' });
  }
});

/**
 * GET /api/security/threat-protection/events
 * Recent threat and bot events.
 */
threatProtectionRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const store = await councilStore();
    const real = store ? await councilThreatEvents(store) : [];
    const events = [...simulatedEvents(), ...real].sort((a, b) => b.timestamp - a.timestamp).slice(0, 150);
    res.json({ events, source: store ? 'council' : 'none' });
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
    // Real events carry only salted IP hashes (no geo-IP lookup exists), so only simulated pings can be plotted.
    const stats = CsoAgentService.getPlatformStats();
    res.json({ pings: stats.recentPings, simulatedOnly: true });
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
    const store = await councilStore();
    if (store) {
      // The council's daily brief IS the assessment. (A new brief: POST /api/security/council/run?brief=force.)
      const brief = await councilAssessment(store);
      if (brief) return res.json({ assessment: brief });
    }
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
    
    const store = await councilStore();
    const events = [...CsoAgentService.getThreatEvents(), ...(store ? await councilThreatEvents(store) : [])];
    const event = events.find(e => e.id === eventId) || events[0];

    if (!event) {
      return res.status(404).json({ error: 'No threat event found to dispatch' });
    }

    const emailSent = await CsoAgentService.sendRichAdminEmail({
      to: recipient,
      subject: `🚨 [INCIDENT DISPATCH] Security Incident ${event.vector} (${event.severity})`,
      event
    });

    // Admin chat posting uses the browser Firebase SDK session; on the server there is none, so this is false
    // (reported honestly) unless a server-side chat path is added.
    const chatDelivered = await CsoAgentService.dispatchAssessmentToAdminChat(event);

    res.json({ ok: emailSent || chatDelivered, emailSent, chatDelivered, recipient, simulated: !!event.simulated,
      ...(emailSent ? {} : { emailError: process.env.RESEND_API_KEY ? 'Email provider rejected the message' : 'RESEND_API_KEY not configured' }) });
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

    // No invented origin: the old version told users the attempt came from "San Francisco, 198.51.100.42".
    const warning = await CsoAgentService.warnTargetUser(uid, {
      id: 'evt-' + Date.now(),
      timestamp: Date.now(),
      ip: typeof ip === 'string' && ip ? ip.slice(0, 64) : 'unknown',
      geo: { lat: 0, lng: 0, country: 'n/a', city: 'n/a' },
      severity: 'SUSPECTED',
      vector: vector || 'CREDENTIAL_STUFFING',
      targetEndpoint: '/api/auth/session',
      targetUid: uid,
      riskScore: 0,
      mitigated: false,
      mitigationAction: 'USER_WARNED',
      details: typeof details === 'string' && details ? details.slice(0, 500) : 'An administrator flagged unusual activity on your account.'
    });

    res.json({ ok: true, warning });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'User warning failed' });
  }
});
