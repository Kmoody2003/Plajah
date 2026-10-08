import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CsoAgentService, ADMIN_PRIMARY_EMAIL } from '../services/csoAgentService';

describe('Chief Security Officer (CSO) & Threat Protection Service', () => {
  test('primary admin email is configured to kmoody2003@gmail.com', () => {
    assert.equal(ADMIN_PRIMARY_EMAIL, 'kmoody2003@gmail.com');
  });

  test('classifies bot scraping as SUSPECTED (amber/purple, non-red alert)', () => {
    const verdict = CsoAgentService.classifyThreat('BOT_SCRAPING', 'High rate scraper on public catalog');
    assert.equal(verdict.severity, 'SUSPECTED');
    assert.ok(verdict.riskScore < 80, 'Suspected activity should not have extreme risk score');
  });

  test('classifies SQL injection and privilege escalation as MALICIOUS_RED', () => {
    const verdictSql = CsoAgentService.classifyThreat('SQLI_ATTEMPT', 'UNION SELECT probe in query string');
    assert.equal(verdictSql.severity, 'MALICIOUS_RED');
    assert.ok(verdictSql.riskScore >= 85, 'Malicious exploit should have risk score >= 85');

    const verdictPriv = CsoAgentService.classifyThreat('PRIVILEGE_ESCALATION', 'Attempted to set isAdmin: true in payload', '{"isAdmin": true}');
    assert.equal(verdictPriv.severity, 'MALICIOUS_RED');
  });

  test('ingesting a suspected threat does not turn platform to CRITICAL_RED', async () => {
    const event = await CsoAgentService.ingestThreat({
      ip: '198.51.100.99',
      geo: { lat: 51.5074, lng: -0.1278, country: 'United Kingdom', city: 'London' },
      severity: 'SUSPECTED',
      vector: 'BOT_SCRAPING',
      targetEndpoint: '/api/library/public',
      riskScore: 52,
      details: 'Automated crawler identified by user agent fingerprint'
    });

    assert.equal(event.severity, 'SUSPECTED');
    const stats = CsoAgentService.getPlatformStats();
    assert.notEqual(stats.threatLevel, 'CRITICAL_RED');
  });

  test('ingesting a confirmed malicious attack turns platform to CRITICAL_RED alert', async () => {
    const event = await CsoAgentService.ingestThreat({
      ip: '203.0.113.15',
      geo: { lat: 35.6762, lng: 139.6503, country: 'Japan', city: 'Tokyo' },
      severity: 'MALICIOUS_RED',
      vector: 'SQLI_ATTEMPT',
      targetEndpoint: '/api/auth/login',
      riskScore: 96,
      details: 'Active SQL injection in credentials form'
    });

    assert.equal(event.severity, 'MALICIOUS_RED');
    const stats = CsoAgentService.getPlatformStats();
    assert.equal(stats.threatLevel, 'CRITICAL_RED');
    assert.ok(stats.activeThreatCount >= 1);
  });

  test('generates CSO executive security assessment with IOCs and recommended actions', async () => {
    const assessment = await CsoAgentService.generateSecurityAssessment();
    assert.ok(assessment);
    assert.ok(assessment.executiveSummary.length > 20);
    assert.ok(Array.isArray(assessment.indicatorsOfCompromise));
    assert.ok(assessment.indicatorsOfCompromise.length > 0);
    assert.ok(Array.isArray(assessment.recommendedActions));
    assert.ok(assessment.recommendedActions.length > 0);
  });

  test('warnTargetUser generates a structured threat warning for targeted account', async () => {
    const warning = await CsoAgentService.warnTargetUser('user-test-uid-123', {
      id: 'evt-test-1',
      timestamp: Date.now(),
      ip: '185.220.101.4',
      geo: { lat: 50.1109, lng: 8.6821, country: 'Germany', city: 'Frankfurt' },
      severity: 'MALICIOUS_RED',
      vector: 'CREDENTIAL_STUFFING',
      targetEndpoint: '/api/auth/session',
      targetUid: 'user-test-uid-123',
      targetEmail: 'targeted_user@example.com',
      riskScore: 92,
      mitigated: true,
      details: 'Multiple failed login attempts from abnormal IP'
    });

    assert.equal(warning.targetUid, 'user-test-uid-123');
    assert.equal(warning.severity, 'MALICIOUS_RED');
    assert.ok(warning.guidanceMessage.includes('Frankfurt'));
    assert.equal(warning.resolved, false);
  });
});
