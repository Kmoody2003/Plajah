/**
 * csoAgentService.ts — Autonomous Chief Security Officer (CSO) AI Agent for Plajah.
 *
 * Responsibilities:
 *  1. Threat Detection & Ingestion: Evaluates platform & user activity across L3-L7.
 *  2. Dual-Severity Classification:
 *     - SUSPECTED (Amber/Purple): Bot scrapers, unusual geolocation, header anomalies, high velocity.
 *     - MALICIOUS_RED (Red Alert): Active injection, auth brute force, privilege spoofing,
 *       token poisoning, session hijacking. ONLY these trigger critical red alerts.
 *  3. Dual-Engine AI Reasoning:
 *     - Cloud: Google Gemini (gemini-2.5-flash / gemini-flash) via geminiService.
 *     - Local Edge: Phi-4-mini ONNX / WebNN via localInferenceService for on-device apps & offline safety.
 *  4. Automated Incident Dispatch:
 *     - Dispatches rich communications to admin user `kmoody2003@gmail.com`.
 *     - Posts real-time security assessments into Admin Chat with one-click containment.
 *     - Emits targeted warnings to vulnerable/targeted user accounts.
 */

import { 
  SecurityThreatEvent, 
  SecurityGeoPing, 
  SecurityPlatformStats, 
  CsoAssessment, 
  UserThreatWarning, 
  ThreatSeverity, 
  ThreatVector
} from '../types';
import { callGemini } from './geminiService';
import { runLocalInference, getLocalInferenceState } from './localInferenceService';
import { auth, createChatRoom, sendMessage } from './backendService';

// Default Admin Recipient
export const ADMIN_PRIMARY_EMAIL = 'kmoody2003@gmail.com';

// ── In-Memory Security Telemetry Store ───────────────────────────────────────

const MAX_EVENT_HISTORY = 150;
let _threatEvents: SecurityThreatEvent[] = [];
let _recentPings: SecurityGeoPing[] = [];
let _latestAssessment: CsoAssessment | null = null;
let _userWarnings: UserThreatWarning[] = [];

// Locations used ONLY by simulateAttack() (admin test button). There is no seed telemetry any more:
// the previous hard-coded "baseline pings" were presented as real traffic. Real data now comes from the
// Security & IT Council (services/securityCouncil, routes/threatProtection.ts reads it server-side).
const SIMULATION_LOCATIONS = [
  { country: 'United States', city: 'Ashburn', lat: 39.0438, lng: -77.4874 },
  { country: 'Germany', city: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
  { country: 'Japan', city: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { country: 'United Kingdom', city: 'London', lat: 51.5074, lng: -0.1278 },
  { country: 'Brazil', city: 'São Paulo', lat: -23.5505, lng: -46.6333 },
];

// ── CSO Agent Core Service ───────────────────────────────────────────────────

export class CsoAgentService {
  /**
   * Evaluates an incoming security event and classifies severity:
   * Only true exploit/malicious attempts escalate to RED.
   */
  static classifyThreat(vector: ThreatVector, details: string, payload?: string): { severity: ThreatSeverity; riskScore: number } {
    const maliciousVectors: ThreatVector[] = [
      'SQLI_ATTEMPT',
      'XSS_ATTEMPT',
      'SSRF_ATTEMPT',
      'SESSION_HIJACK',
      'PRIVILEGE_ESCALATION',
      'TOKEN_POISONING',
      'CHAT_DIRTY_DOZEN'
    ];

    if (maliciousVectors.includes(vector)) {
      return { severity: 'MALICIOUS_RED', riskScore: 90 };
    }

    const payloadLower = (payload || '').toLowerCase();
    if (
      payloadLower.includes('<script') ||
      payloadLower.includes('union select') ||
      payloadLower.includes('isadmin: true') ||
      payloadLower.includes('169.254.169.254')
    ) {
      return { severity: 'MALICIOUS_RED', riskScore: 92 };
    }

    return { severity: 'SUSPECTED', riskScore: 55 };
  }

  /**
   * Ingests a new threat event, records the ping for the live map,
   * updates stats, and executes automatic response if RED ALERT.
   */
  static async ingestThreat(eventData: Omit<SecurityThreatEvent, 'id' | 'timestamp' | 'mitigated'>): Promise<SecurityThreatEvent> {
    const event: SecurityThreatEvent = {
      id: 'sec-' + Math.random().toString(36).substring(2, 10),
      timestamp: Date.now(),
      // Nothing in this in-memory path blocks anything, so never claim BLOCKED_IP.
      mitigated: false,
      mitigationAction: 'LOGGED_MONITOR',
      ...eventData
    };

    _threatEvents.unshift(event);
    if (_threatEvents.length > MAX_EVENT_HISTORY) _threatEvents.pop();

    const ping: SecurityGeoPing = {
      id: event.id,
      lat: event.geo.lat,
      lng: event.geo.lng,
      country: event.geo.country,
      city: event.geo.city,
      ip: event.ip,
      severity: event.severity,
      vector: event.vector,
      timestamp: event.timestamp,
      summary: event.details,
      targetEndpoint: event.targetEndpoint
    };
    _recentPings.unshift(ping);
    if (_recentPings.length > 50) _recentPings.pop();

    // If RED ALERT: Trigger automated containment & notifications
    if (event.severity === 'MALICIOUS_RED') {
      await this.handleRedAlert(event);
    }

    // If a specific user account is targeted, dispatch a user threat warning
    // (Never for simulated events: a test button must not send a fake security warning to a real user.)
    if (event.targetUid && !event.simulated) {
      await this.warnTargetUser(event.targetUid, event);
    }

    return event;
  }

  /**
   * Generates a full Platform Security Assessment using either Cloud Gemini
   * or on-device local inference (Phi-4-mini) as fallback.
   */
  static async generateSecurityAssessment(): Promise<CsoAssessment> {
    const stats = this.getPlatformStats();
    if (_threatEvents.length === 0) {
      // Nothing to assess in this process — say so instead of generating a reassuring briefing.
      const empty: CsoAssessment = {
        id: 'cso-brief-' + Date.now(), timestamp: Date.now(), csoAgentName: 'Plajah Sentinel CSO', threatLevel: 'NORMAL',
        executiveSummary: 'No threat telemetry in this process. Real monitoring runs in the Security & IT Council (Admin → Threat Protection → Council findings and daily brief).',
        riskScore: 0, indicatorsOfCompromise: [], recommendedActions: [], activeContainments: [], engineUsed: 'SECURITY_HEURISTICS',
      };
      _latestAssessment = empty;
      return empty;
    }
    const recentMalicious = _threatEvents.filter(e => e.severity === 'MALICIOUS_RED').slice(0, 5);
    const recentSuspected = _threatEvents.filter(e => e.severity === 'SUSPECTED').slice(0, 5);

    const promptContext = `You are Plajah Sentinel, the Chief Security Officer (CSO) AI Agent.
Analyze the following platform security telemetry:
- Platform Health Score: ${stats.healthScore}/100
- Threat Level: ${stats.threatLevel}
- Blocked Attacks (24h): ${stats.blockedAttacks24h}
- Bot Traffic Share: ${stats.botTrafficPercent}%
- Recent Malicious Threats: ${JSON.stringify(recentMalicious.map(m => ({ vector: m.vector, ip: m.ip, target: m.targetEndpoint })))}
- Recent Suspected Recon: ${JSON.stringify(recentSuspected.map(s => ({ vector: s.vector, ip: s.ip, target: s.targetEndpoint })))}

Provide a concise, professional executive security briefing. Formulate:
1. Executive Summary (2-3 sentences)
2. Top 3 Indicators of Compromise (IOCs)
3. Top 3 Recommended Actions for Admins
4. Active Automated Containments`;

    let summary = '';
    let engineUsed: CsoAssessment['engineUsed'] = 'CLOUD_GEMINI';

    try {
      // 1. Try Cloud Gemini First
      const geminiText = await callGemini(promptContext, { temperature: 0.2 }, 'gemini-2.5-flash');
      if (geminiText) {
        summary = geminiText;
      } else {
        throw new Error('Gemini response was empty');
      }
    } catch {
      // 2. Fallback to Local Inference Engine (Phi-4-mini)
      const localState = getLocalInferenceState();
      if (localState.modelLoaded && localState.backend !== 'UNAVAILABLE') {
        try {
          const localRes = await runLocalInference(
            'You are a security analyst. Summarize the platform threat posture in two sentences. Do not invent numbers.',
            `Health ${stats.healthScore}/100. Malicious events: ${recentMalicious.length}. Suspected events: ${recentSuspected.length}. Data source: ${stats.dataSource || 'unknown'}.`
          );
          if (localRes?.text) {
            summary = localRes.text;
            engineUsed = 'LOCAL_PHI4';
          }
        } catch {
          engineUsed = 'SECURITY_HEURISTICS';
        }
      } else {
        engineUsed = 'SECURITY_HEURISTICS';
      }
    }

    if (!summary) {
      summary = `${_threatEvents.length} event(s) in this process (${stats.dataSource === 'SIMULATION' ? 'all SIMULATED by the admin test buttons' : 'in-memory'}): ${recentMalicious.length} malicious, ${recentSuspected.length} suspected. No AI engine was available to write a narrative.`;
    }

    const assessment: CsoAssessment = {
      id: 'cso-brief-' + Date.now(),
      timestamp: Date.now(),
      csoAgentName: 'Plajah Sentinel CSO',
      threatLevel: stats.threatLevel,
      executiveSummary: summary,
      riskScore: 100 - stats.healthScore,
      // Derived from the events actually held — no canned IOCs.
      indicatorsOfCompromise: [...recentMalicious, ...recentSuspected].slice(0, 3)
        .map(e => `${e.simulated ? '[SIMULATION] ' : ''}${e.vector} → ${e.targetEndpoint}`),
      recommendedActions: [],
      activeContainments: [],
      engineUsed
    };

    _latestAssessment = assessment;
    return assessment;
  }

  /**
   * Handle Red Alert when confirmed malicious activity is detected.
   */
  static async handleRedAlert(event: SecurityThreatEvent): Promise<void> {
    console.warn(`[CSO Sentinel] 🚨 RED ALERT: Confirmed Malicious Attack Detected from ${event.ip} [${event.vector}]`);

    // 1. Dispatch rich email communication to kmoody2003@gmail.com
    await this.sendRichAdminEmail({
      to: ADMIN_PRIMARY_EMAIL,
      subject: `${event.simulated ? '[SIMULATION] ' : '🚨 [CRITICAL RED ALERT] '}Malicious Attack ${event.simulated ? 'Simulated' : 'Detected'}: ${event.vector}`,
      event
    }).catch(e => console.warn('[CSO Sentinel] Email dispatch deferred:', e));

    // 2. Dispatch security assessment directly to Admin Chat
    await this.dispatchAssessmentToAdminChat(event).catch(e => console.warn('[CSO Sentinel] Admin chat dispatch deferred:', e));
  }

  /**
   * Dispatches rich HTML communication to the admin email.
   */
  static async sendRichAdminEmail(params: { to: string; subject: string; event: SecurityThreatEvent }): Promise<boolean> {
    const { to, subject, event } = params;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0e12; color: #ffffff; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(239, 68, 68, 0.4);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 16px;">
          <div style="background-color: #dc2626; color: white; padding: 8px 16px; border-radius: 8px; font-weight: 900; letter-spacing: 1px; font-size: 12px;">${event.simulated ? 'SIMULATION — NOT A REAL INCIDENT' : 'CRITICAL RED ALERT'}</div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">Plajah Sentinel CSO</h2>
        </div>
        
        <p style="font-size: 15px; line-height: 1.5; color: #d1d5db;">
          An active malicious exploit attempt was intercepted by the Advance Threat Protection engine and quarantined.
        </p>

        <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(255, 255, 255, 0.08);">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr><td style="color: #9ca3af; padding: 6px 0;">Threat Vector:</td><td style="color: #ef4444; font-weight: 700; text-align: right;">${event.vector}</td></tr>
            <tr><td style="color: #9ca3af; padding: 6px 0;">Source IP:</td><td style="color: #ffffff; font-family: monospace; text-align: right;">${event.ip}</td></tr>
            <tr><td style="color: #9ca3af; padding: 6px 0;">Origin Location:</td><td style="color: #ffffff; text-align: right;">${event.geo.city}, ${event.geo.country}</td></tr>
            <tr><td style="color: #9ca3af; padding: 6px 0;">Target Endpoint:</td><td style="color: #60a5fa; font-family: monospace; text-align: right;">${event.targetEndpoint}</td></tr>
            <tr><td style="color: #9ca3af; padding: 6px 0;">Risk Score:</td><td style="color: #ef4444; font-weight: 700; text-align: right;">${event.riskScore}/100</td></tr>
            <tr><td style="color: #9ca3af; padding: 6px 0;">Mitigation Action:</td><td style="color: #10b981; font-weight: 700; text-align: right;">${event.mitigationAction || 'BLOCKED_IP'}</td></tr>
          </table>
        </div>

        <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 12px 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #fca5a5;">
            <strong>Incident Details:</strong> ${event.details}
          </p>
        </div>

        <div style="text-align: center; margin-top: 32px;">
          <a href="https://plajah.com/admin" style="background: #ffffff; color: #000000; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 800; font-size: 13px; display: inline-block;">
            Open Security Operations Center →
          </a>
        </div>
        <p style="margin-top: 24px; font-size: 11px; text-align: center; color: #6b7280;">
          Sent by Plajah Advance Threat Protection to Platform Administrator (${to})
        </p>
      </div>
    `;

    // Honest delivery: the old code POSTed to a RELATIVE '/api/postman/send' (which cannot resolve on the
    // server, and that route sends from a user's own Gmail anyway) and its catch returned true, so callers
    // reported emailSent:true for mail that never left. Now: server-side Resend when configured, else false.
    if (typeof window !== 'undefined') return false; // browsers never hold mail credentials
    const key = typeof process !== 'undefined' ? process.env.RESEND_API_KEY : undefined;
    if (!key || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      console.warn(`[CSO Mail Dispatcher] Not sent (${key ? 'invalid recipient' : 'RESEND_API_KEY not configured'}): ${subject}`);
      return false;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>',
          to: [to],
          subject: (event.simulated && !subject.startsWith('[SIMULATION]') ? '[SIMULATION] ' : '') + subject,
          html: htmlContent,
          text: `${event.simulated ? '[SIMULATION] ' : ''}Attack Vector: ${event.vector}
Source IP: ${event.ip}
Location: ${event.geo.city}, ${event.geo.country}
Target: ${event.targetEndpoint}
Mitigation: ${event.mitigationAction}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.warn(`[CSO Mail Dispatcher] Resend HTTP ${res.status}`);
      return res.ok;
    } catch (e: any) {
      console.warn('[CSO Mail Dispatcher] send failed:', e?.message || e);
      return false;
    }
  }

  /**
   * Posts an interactive Chief Security Officer assessment into the admin's chat.
   */
  static async dispatchAssessmentToAdminChat(event?: SecurityThreatEvent): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      // Find or create a dedicated CSO Security Briefing chat room
      const roomId = await createChatRoom([user.uid], 'PRIVATE', 'Chief Security Officer (CSO)');
      
      const text = event
        ? `${event.simulated ? '🧪 **SIMULATION — not a real incident**' : '🚨 **Security event**'}\n\n` +
          `• **Vector**: ${event.vector}\n` +
          `• **Source**: \`${event.ip}\`\n` +
          `• **Target**: \`${event.targetEndpoint}\`\n` +
          `• **Risk Score**: ${event.riskScore}/100\n` +
          `• **Logged action**: ${event.mitigationAction || 'LOGGED_MONITOR'}\n\n` +
          `Review in Admin → Threat Protection. No automatic block was applied by this message.`
        : `🛡️ **Security & IT Council**\n\n` +
          `Current findings, temporary mitigations and the daily Council Brief are in Admin → Threat Protection.`;

      await sendMessage(roomId, {
        senderId: 'system-cso-sentinel',
        senderName: 'Chief Security Officer (CSO)',
        senderPhoto: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
        type: 'ACTION',
        text,
        metadata: {
          action: 'SECURITY_ASSESSMENT',
          url: '/admin?tab=THREAT_PROTECTION',
          time: Date.now()
        }
      });

      return true;
    } catch (e) {
      console.error('[CSO Sentinel] Failed to deliver chat assessment:', e);
      return false;
    }
  }

  /**
   * Issues a security warning to a specific user whose account is under threat.
   */
  static async warnTargetUser(uid: string, event: SecurityThreatEvent): Promise<UserThreatWarning> {
    const warning: UserThreatWarning = {
      id: 'warn-' + Math.random().toString(36).substring(2, 8),
      targetUid: uid,
      targetEmail: event.targetEmail,
      timestamp: Date.now(),
      severity: event.severity,
      detectedVector: event.vector,
      originLocation: `${event.geo.city}, ${event.geo.country}`,
      originIp: event.ip,
      guidanceMessage: event.geo.country && event.geo.country !== 'n/a'
        ? `Unusual sign-in or session attempt detected from ${event.geo.city}, ${event.geo.country}. If this was not you, reset your password and sign out of unknown sessions.`
        : `${event.details} If this was not you, reset your password and sign out of unknown sessions.`,
      resolved: false
    };

    _userWarnings.unshift(warning);

    // Also send an in-app system chat notification to the user
    try {
      const roomId = await createChatRoom([uid], 'PRIVATE', 'Plajah Security Guard');
      await sendMessage(roomId, {
        senderId: 'system-security-guard',
        senderName: 'Plajah Security Sentinel',
        senderPhoto: '',
        type: 'ACTION',
        text: `⚠️ **Security Alert for your Account**\n\n${warning.guidanceMessage}`,
        metadata: {
          action: 'USER_ACCOUNT_THREAT_WARNING',
          url: '/account/security',
          time: Date.now()
        }
      });
    } catch (e) {
      console.warn('[CSO Sentinel] User chat warning deferred:', e);
    }

    return warning;
  }

  /**
   * Returns complete platform security posture and stats.
   */
  static getPlatformStats(): SecurityPlatformStats {
    const maliciousCount = _threatEvents.filter(e => e.severity === 'MALICIOUS_RED').length;
    const suspectedCount = _threatEvents.filter(e => e.severity === 'SUSPECTED').length;

    // Health Score calculation
    let healthScore = 100 - (maliciousCount * 4) - Math.floor(suspectedCount * 0.5);
    if (healthScore < 45) healthScore = 45;

    // Threat level calculation: ONLY malicious count drives CRITICAL_RED
    let threatLevel: SecurityPlatformStats['threatLevel'] = 'NORMAL';
    if (maliciousCount > 0) {
      threatLevel = 'CRITICAL_RED';
    } else if (suspectedCount > 5) {
      threatLevel = 'ELEVATED';
    }

    // Vector breakdown
    const vectorMap = new Map<ThreatVector, number>();
    _threatEvents.forEach(e => {
      vectorMap.set(e.vector, (vectorMap.get(e.vector) || 0) + 1);
    });
    const attackDistribution = Array.from(vectorMap.entries()).map(([vector, count]) => ({ vector, count }));

    // Timeline: 6 × 4h buckets over the last 24h, counted from the events actually held. Total ("normal")
    // traffic is not measured here, so it is 0 and listed in unavailableMetrics — never invented.
    const now = Date.now();
    const timeline = Array.from({ length: 6 }, (_, i) => {
      const start = now - (6 - i) * 4 * 3_600_000, end = start + 4 * 3_600_000;
      const inB = _threatEvents.filter(e => e.timestamp >= start && e.timestamp < end);
      return { time: new Date(start).toISOString().slice(11, 16), normal: 0, suspected: inB.filter(e => e.severity === 'SUSPECTED').length, malicious: inB.filter(e => e.severity === 'MALICIOUS_RED').length };
    });

    return {
      healthScore,
      threatLevel,
      activeThreatCount: maliciousCount,
      blockedAttacks24h: _threatEvents.filter(e => e.mitigated && now - e.timestamp < 86_400_000).length,
      botTrafficPercent: 0,
      csoMode: getLocalInferenceState().backend !== 'UNAVAILABLE' ? 'HYBRID_ACTIVE' : 'CLOUD_GEMINI',
      lastAssessmentAt: _latestAssessment?.timestamp || 0,
      recentPings: [..._recentPings],
      attackDistribution,
      timeline,
      // ingestThreat() is only fed by simulateAttack(), so anything held here is a simulation.
      dataSource: _threatEvents.length === 0 ? 'NONE' : 'SIMULATION',
      unavailableMetrics: ['botTrafficPercent', 'timeline.normal'],
    };
  }

  static getThreatEvents(): SecurityThreatEvent[] {
    return [..._threatEvents];
  }

  static getUserWarnings(): UserThreatWarning[] {
    return [..._userWarnings];
  }

  static getLatestAssessment(): CsoAssessment | null {
    return _latestAssessment;
  }

  /**
   * Simulates an incoming attack to test UI reactivity, red alert triggers,
   * email communications, and admin chat updates.
   */
  static async simulateAttack(isMalicious: boolean, targetUserUid?: string): Promise<SecurityThreatEvent> {
    const loc = SIMULATION_LOCATIONS[Math.floor(Math.random() * SIMULATION_LOCATIONS.length)];
    // RFC 5737 documentation range — can never be mistaken for (or collide with) a real visitor.
    const ip = `203.0.113.${Math.floor(Math.random() * 254 + 1)}`;

    const maliciousVectors: ThreatVector[] = ['SQLI_ATTEMPT', 'XSS_ATTEMPT', 'CREDENTIAL_STUFFING', 'SESSION_HIJACK', 'CHAT_DIRTY_DOZEN'];
    const suspectedVectors: ThreatVector[] = ['BOT_SCRAPING', 'ANOMALOUS_API_VELOCITY', 'IMPOSSIBLE_TRAVEL'];

    const vector = isMalicious
      ? maliciousVectors[Math.floor(Math.random() * maliciousVectors.length)]
      : suspectedVectors[Math.floor(Math.random() * suspectedVectors.length)];

    const severity: ThreatSeverity = isMalicious ? 'MALICIOUS_RED' : 'SUSPECTED';

    const details = isMalicious
      ? `Simulated critical exploit attempt [${vector}]: Pattern payload rejected at security middleware layer.`
      : `Simulated bot traffic [${vector}]: High request cadence detected from crawler cluster.`;

    const event = await this.ingestThreat({
      ip,
      geo: { lat: loc.lat, lng: loc.lng, country: loc.country, city: loc.city },
      severity,
      vector,
      targetEndpoint: isMalicious ? '/api/auth/login' : '/api/browse',
      targetUid: targetUserUid,
      riskScore: isMalicious ? 95 : 55,
      details: `[SIMULATION] ${details}`,
      simulated: true,
    });

    return event;
  }
}
