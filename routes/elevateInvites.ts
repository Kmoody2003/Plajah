// elevateInvites router — org staff email "claim your account" invitations to pre-provisioned seats.
//
//   GET  /status                      → { configured }  (false until RESEND_API_KEY + an unsubscribe secret are set)
//   POST /send { orgId, seatIds?[] | all: true } → { sent, failed, skipped: {reason: n}, remaining }
//   GET|POST /stop?t=…                → the recipient stops invitations for their seat (one-click List-Unsubscribe)
//
// The address always comes from the org's own records (seat.claimEmailLower, else the chmsPeople email) — the
// caller only names seats, so this can't be used to mail arbitrary people. Eligibility (cooldown, bounce, opt-out,
// lifetime cap) is in services/elevateInviteCore.ts. Bounces/complaints arrive via the campaigns Resend webhook,
// which calls markInviteBounced.
//
// Mounted in server.ts as:  app.use('/api/elevate/invites', limiter, express.json({ limit: '32kb' }), elevateInvitesRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsCreate, fsQuery, adminConfig } from '../services/firebaseAdminRest';
import { sendViaResend, emailConfigured, appUrl } from '../services/notify/emailNotifyServer';
import { signUnsub, verifyUnsub, escapeHtml } from '../services/notify/emailNotifyCore';
import {
  inviteEligibility, inviteSentPatch, renderClaimInvite, senderFrom, validEmail,
  MAX_INVITES_PER_REQUEST, type SkipReason,
} from '../services/elevateInviteCore';

export const elevateInvitesRouter = Router();

const STOP_SCOPE = 'elevate-invite';
const unsubSecret = () => process.env.EMAIL_UNSUB_SECRET || process.env.CRON_SECRET || '';

const ROLE_LABELS: Record<string, string> = {
  SENIOR_PASTOR: 'Senior Pastor', PASTOR: 'Pastor', MINISTER: 'Minister', ELDER: 'Elder', DEACON: 'Deacon',
  DEPARTMENT_HEAD: 'Department Head', DEPARTMENT_ADMIN: 'Department Administrator', INSTRUCTOR: 'Instructor',
  FINANCE_DIRECTOR: 'Finance Director', TREASURER: 'Treasurer', TRUSTEE: 'Trustee', MEDIA_TEAM: 'Media Team', STAFF: 'Staff',
  VOLUNTEER: 'Volunteer', MEMBER: 'Member',
};

/** Same people firestore.rules lets mint provisioned seats (chmsPeopleStaff). */
function isRosterStaff(org: Record<string, any>, uid: string): boolean {
  const has = (k: string) => Array.isArray(org[k]) && org[k].includes(uid);
  return org.creatorId === uid || has('admins') || has('pastorUids') || has('staffUids') || has('leaderUids');
}

const claimLink = (org: { id: string; data: Record<string, any> }, memberNumber?: string) =>
  `${appUrl()}/?elevateJoin=${encodeURIComponent(org.data.handle || org.id)}&claim=1${memberNumber ? `&member=${encodeURIComponent(memberNumber)}` : ''}`;

/** The seat's claim email; the directory record is read only when the seat has none (keeps an "all" pass cheap). */
async function seatEmail(seat: Record<string, any>): Promise<{ email: string; firstName?: string }> {
  const person = !seat.claimEmailLower && seat.provisionedPersonId ? await fsGet(`chmsPeople/${seat.provisionedPersonId}`).catch(() => null) : null;
  const email = String(seat.claimEmailLower || person?.email || '').trim().toLowerCase();
  const firstName = String(person?.preferredName || person?.firstName || String(seat.displayName || '').split(' ')[0] || '').trim();
  return { email, firstName: firstName || undefined };
}

elevateInvitesRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: emailConfigured() && adminConfig.hasCredentials() });
});

elevateInvitesRouter.post('/send', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.', configured: false });
  if (!emailConfigured()) return res.status(503).json({ error: 'Email isn\'t set up on this server yet (RESEND_API_KEY).', configured: false });
  const auth = req.headers.authorization;
  const who = auth?.startsWith('Bearer ') ? await verifyIdTokenDetailed(auth.slice(7)) : null;
  if (!who || who.isAnonymous) return res.status(401).json({ error: 'Sign in first.' });

  const orgId = String(req.body?.orgId || '').trim();
  if (!orgId || orgId.length > 120 || orgId.includes('/')) return res.status(400).json({ error: 'Bad request.' });
  const orgData = await fsGet(`organizations/${orgId}`);
  if (!orgData) return res.status(404).json({ error: 'Organization not found.' });
  if (!isRosterStaff(orgData, who.uid)) return res.status(403).json({ error: 'Only roster staff can send account invitations.' });
  const org = { id: orgId, data: orgData };

  let seats: Array<{ id: string; data: Record<string, any> }>;
  if (req.body?.all === true) {
    seats = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'isProvisioned', value: true }], 2000);
  } else {
    const ids: string[] = Array.isArray(req.body?.seatIds) ? req.body.seatIds.map(String).filter((s: string) => s && s.length <= 128 && !s.includes('/')) : [];
    if (!ids.length || ids.length > MAX_INVITES_PER_REQUEST) return res.status(400).json({ error: `Name 1–${MAX_INVITES_PER_REQUEST} seats.` });
    const rows = await Promise.all(ids.map(async id => ({ id, data: await fsGet(`orgMemberships/${id}`) })));
    seats = rows.filter((r): r is { id: string; data: Record<string, any> } => !!r.data && r.data.orgId === orgId);
  }

  const now = Date.now();
  const skipped: Partial<Record<SkipReason, number>> = {};
  const queue: Array<{ seat: { id: string; data: Record<string, any> }; email: string; firstName?: string }> = [];
  for (const seat of seats) {
    const { email, firstName } = await seatEmail(seat.data);
    const ok = inviteEligibility(seat.data, email, now);
    if ('reason' in ok) { skipped[ok.reason] = (skipped[ok.reason] || 0) + 1; continue; }
    queue.push({ seat, email, firstName });
  }
  const batch = queue.slice(0, MAX_INVITES_PER_REQUEST);
  const remaining = queue.length - batch.length;

  const from = senderFrom(String(orgData.name || ''), process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>');
  const replyRaw = String(orgData.email || orgData.contactEmail || '').trim();
  const replyTo = validEmail(replyRaw) ? replyRaw : undefined;
  const ministries: any[] = Array.isArray(orgData.ministries) ? orgData.ministries : [];
  let sent = 0, failed = 0;

  const sendOne = async ({ seat, email, firstName }: typeof batch[number]) => {
    const d = seat.data;
    const deptIds: string[] = Array.from(new Set([...(d.ministryIds || []), ...((d.ministryRoles || []) as any[]).map(x => x?.ministryId)].filter(Boolean)));
    const stopUrl = `${appUrl()}/api/elevate/invites/stop?t=${encodeURIComponent(signUnsub(seat.id, STOP_SCOPE, unsubSecret()))}`;
    const mail = renderClaimInvite({
      orgName: String(orgData.name || ''), firstName, email,
      roleLabel: d.title || ROLE_LABELS[d.roleKey] || 'Member',
      departments: deptIds.map(id => ministries.find(m => m?.id === id)?.name).filter(Boolean),
      memberNumber: d.memberNumber || undefined,
      claimUrl: claimLink(org, d.memberNumber),
      stopUrl, reminder: (d.claimInviteCount || 0) > 0 && d.claimInviteEmail === email,
    });
    const ok = await sendViaResend(email, mail, stopUrl, undefined, replyTo, from);
    if (ok) sent++; else failed++;
    await fsPatch(`orgMemberships/${seat.id}`, inviteSentPatch(d, email, ok, who.uid, Date.now())).catch(() => {});
  };
  // A few at a time keeps a 100-person send well inside the request timeout without bursting the provider.
  for (let i = 0; i < batch.length; i += 4) await Promise.all(batch.slice(i, i + 4).map(sendOne));

  if (sent || failed) {
    await fsCreate(`organizations/${orgId}/audit`, {
      orgId, action: 'ELEVATE_CLAIM_INVITES_SENT', actorUid: who.uid, actorName: '', targetId: batch.length === 1 ? batch[0].seat.id : '',
      targetName: batch.length === 1 ? String(batch[0].seat.data.displayName || '') : `${sent} people`, timestamp: now,
      meta: { sent, failed, remaining, skipped },
    }).catch(() => {});
  }
  return res.json({ sent, failed, skipped, remaining });
});

const stopPage = (title: string, body: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:440px;margin:60px auto;background:#fff;border-radius:16px;padding:28px">
<p style="font-size:13px;font-weight:800;letter-spacing:.2em;color:#ff6a2b;text-transform:uppercase;margin:0 0 14px">Plajah</p>
<h1 style="font-size:20px;margin:0 0 10px;color:#111">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.5;color:#1d1d1f;margin:0">${escapeHtml(body)}</p></div></body></html>`;

const stopHandler = async (req: Request, res: Response) => {
  const v = verifyUnsub(String(req.query.t || ''), unsubSecret());
  if (!v || v.scope !== STOP_SCOPE) return res.status(400).type('html').send(stopPage('That link didn\'t work', 'It may have been copied incompletely.'));
  const seat = await fsGet(`orgMemberships/${v.uid}`).catch(() => null);
  if (seat?.isProvisioned) await fsPatch(`orgMemberships/${v.uid}`, { claimInviteStatus: 'OPTED_OUT', claimInviteOptedOutAt: Date.now() }).catch(() => {});
  return res.type('html').send(stopPage('Invitations stopped', 'You won\'t get more account invitations for this seat. You can still claim it any time from the organization\'s join link.'));
};
elevateInvitesRouter.get('/stop', stopHandler);
elevateInvitesRouter.post('/stop', stopHandler);

/** From the Resend webhook: a hard bounce / complaint marks every unclaimed seat invited at that address. */
export async function markInviteBounced(email: string): Promise<void> {
  const to = email.trim().toLowerCase();
  if (!validEmail(to)) return;
  const seats = await fsQuery('orgMemberships', [{ field: 'claimInviteEmail', value: to }], 50);
  for (const s of seats) {
    if (s.data.isProvisioned && s.data.claimInviteStatus !== 'OPTED_OUT') {
      await fsPatch(`orgMemberships/${s.id}`, { claimInviteStatus: 'BOUNCED', claimInviteBouncedAt: Date.now() }).catch(() => {});
    }
  }
}
