// orgSecurityService — Sanctuary-grade security & privacy enforcement for Plajah Elevate organizations.
//
// Guarantees:
// 1. Public PII Firewall: Member emails, phone numbers, home addresses, birthdates, and giving history
//    are NEVER exposed on any public UI or world-readable document.
// 2. Financial Team Vault & Anti-Screenshot Protection: Protects Finance Hub, Spending Desk, Accounting,
//    and Payroll views against PrintScreen, OS snipping focus-steal, PDF print exfiltration, and unauthorized access,
//    with zero friction for authorized financial team members during normal work.
// 3. Immutable Security Telemetry: Logs blocked screenshot/print attempts and sensitive vault access.

import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { opsDb, auth } from './firebase';
import { updateOrganization } from './organizationService';
import { logOrgAction } from './orgAudit';
import type { Organization, OrgMembership, OrgSecuritySettings } from '../types';

export interface OrgSecurityEvent {
  id: string;
  orgId: string;
  actorUid: string;
  actorName: string;
  actorEmail?: string;
  eventType:
    | 'SCREENSHOT_ATTEMPT_BLOCKED'
    | 'PRINT_EXFILTRATION_BLOCKED'
    | 'COPY_EXFILTRATION_BLOCKED'
    | 'WINDOW_CAPTURE_SHIELD_TRIGGERED'
    | 'FINANCIAL_VAULT_OPENED'
    | 'SECURITY_SETTINGS_UPDATED';
  surface: string;
  details?: string;
  timestamp: number;
}

export function getEffectiveSecuritySettings(org?: Organization | null): Required<OrgSecuritySettings> {
  const s = org?.securitySettings || {};
  return {
    blockFinancialScreenshots: s.blockFinancialScreenshots !== false,
    financialWatermark: s.financialWatermark !== false,
    strictPublicPiiFirewall: true, // Always enforced — non-negotiable platform rule
    directoryOptInOnly: s.directoryOptInOnly !== false,
    autoAssignIdsOnApproval: s.autoAssignIdsOnApproval !== false,
    defaultMaskMode: !!s.defaultMaskMode,
    updatedAt: s.updatedAt || org?.updatedAt || Date.now(),
    updatedBy: s.updatedBy || org?.creatorId || '',
  };
}

export async function saveOrgSecuritySettings(
  orgId: string,
  patch: Partial<OrgSecuritySettings>,
): Promise<OrgSecuritySettings> {
  const u = auth.currentUser;
  const next: OrgSecuritySettings = {
    ...patch,
    strictPublicPiiFirewall: true,
    updatedAt: Date.now(),
    updatedBy: u?.uid || '',
  };
  await updateOrganization(orgId, { securitySettings: next });
  logOrgAction(orgId, 'SECURITY_SETTINGS_UPDATED' as any, {
    meta: {
      blockFinancialScreenshots: next.blockFinancialScreenshots,
      financialWatermark: next.financialWatermark,
      directoryOptInOnly: next.directoryOptInOnly,
      autoAssignIdsOnApproval: next.autoAssignIdsOnApproval,
      defaultMaskMode: next.defaultMaskMode,
    },
  });
  return next;
}

export async function logOrgSecurityEvent(
  orgId: string,
  eventType: OrgSecurityEvent['eventType'],
  surface: string,
  details?: string,
): Promise<void> {
  const u = auth.currentUser;
  if (!u || !orgId) return;
  const now = Date.now();
  try {
    const ref = doc(collection(opsDb, 'orgSecurityEvents'));
    const ev: OrgSecurityEvent = {
      id: ref.id,
      orgId,
      actorUid: u.uid,
      actorName: u.displayName || 'User',
      eventType,
      surface,
      details,
      timestamp: now,
    };
    await setDoc(ref, ev);
  } catch { /* non-blocking */ }
  try {
    logOrgAction(orgId, eventType as any, { meta: { surface, details } });
  } catch { /* non-blocking */ }
}

export async function fetchOrgSecurityEvents(orgId: string, max = 40): Promise<OrgSecurityEvent[]> {
  try {
    const snap = await getDocs(
      query(collection(opsDb, 'orgSecurityEvents'), where('orgId', '==', orgId), limit(max)),
    );
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as OrgSecurityEvent))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
}

/**
 * Sanitize a membership record for public rendering (`ElevateRosters`, `OrgProfile`, etc.).
 * Strips any email, phone, address, or private onboarding fields so PII can NEVER leak to the public UI.
 */
export function sanitizePublicMemberRecord(m: OrgMembership): OrgMembership {
  const copy: any = { ...m };
  delete copy.claimEmailLower;
  delete copy.email;
  delete copy.phone;
  delete copy.address;
  if (copy.onboarding) {
    copy.onboarding = {
      firstName: copy.onboarding.firstName,
      lastName: copy.onboarding.lastName,
      submittedAt: copy.onboarding.submittedAt,
    };
  }
  return copy as OrgMembership;
}

/** Format or mask a phone number so only authorized staff with unmasked view see full digits. */
export function maskPhone(phone?: string, masked = false): string {
  if (!phone) return '';
  if (!masked) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) return `(•••) •••-${digits.slice(-4)}`;
  return '•••-••••';
}

/** Format or mask an email address for shoulder-surf / screen-share protection. */
export function maskEmail(email?: string, masked = false): string {
  if (!email) return '';
  if (!masked) return email;
  const [local = '', domain = ''] = email.split('@');
  const l = local ? `${local[0]}•••` : '•••';
  const d = domain ? `${domain[0]}•••.${domain.split('.').pop() || 'org'}` : '•••.org';
  return `${l}@${d}`;
}
