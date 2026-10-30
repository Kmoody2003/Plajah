import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteEligibility, inviteSentPatch, renderClaimInvite, senderFrom, INVITE_COOLDOWN_MS, MAX_SENDS_PER_SEAT,
} from '../services/elevateInviteCore';

const NOW = 1_800_000_000_000;
const seat = (o: Record<string, unknown> = {}) => ({ isProvisioned: true, ...o });

test('claimed seats and missing addresses are never mailed', () => {
  assert.deepEqual(inviteEligibility({ isProvisioned: false }, 'a@b.org', NOW), { ok: false, reason: 'claimed' });
  assert.deepEqual(inviteEligibility(seat(), '', NOW), { ok: false, reason: 'no_email' });
  assert.deepEqual(inviteEligibility(seat(), 'not an email', NOW), { ok: false, reason: 'no_email' });
  assert.deepEqual(inviteEligibility(seat(), 'Jo@Church.org ', NOW), { ok: true });
});

test('one send per day, a lifetime cap, and a new address starts over', () => {
  const sent = seat({ claimInviteStatus: 'SENT', claimInviteEmail: 'jo@church.org', claimInviteSentAt: NOW - 1000, claimInviteCount: 1 });
  assert.deepEqual(inviteEligibility(sent, 'jo@church.org', NOW), { ok: false, reason: 'cooldown' });
  assert.deepEqual(inviteEligibility(sent, 'jo@church.org', NOW + INVITE_COOLDOWN_MS), { ok: true });
  assert.deepEqual(inviteEligibility(sent, 'jo@new.org', NOW), { ok: true });
  const capped = seat({ ...sent, claimInviteCount: MAX_SENDS_PER_SEAT, claimInviteSentAt: 0 });
  assert.deepEqual(inviteEligibility(capped, 'jo@church.org', NOW), { ok: false, reason: 'limit' });
  assert.equal((inviteSentPatch(capped, 'jo@new.org', true, 'u1', NOW) as any).claimInviteCount, 1);
  assert.equal((inviteSentPatch(sent, 'jo@church.org', true, 'u1', NOW) as any).claimInviteCount, 2);
});

test('bounces block only the bounced address; opt-out blocks the seat', () => {
  const bounced = seat({ claimInviteStatus: 'BOUNCED', claimInviteEmail: 'jo@church.org' });
  assert.deepEqual(inviteEligibility(bounced, 'jo@church.org', NOW), { ok: false, reason: 'bounced' });
  assert.deepEqual(inviteEligibility(bounced, 'jo@fixed.org', NOW), { ok: true });
  assert.deepEqual(inviteEligibility(seat({ claimInviteStatus: 'OPTED_OUT', claimInviteEmail: 'x@y.org' }), 'other@y.org', NOW), { ok: false, reason: 'opted_out' });
});

test('a failed send does not count toward the cap', () => {
  const p = inviteSentPatch(seat(), 'jo@church.org', false, 'u1', NOW) as any;
  assert.equal(p.claimInviteStatus, 'FAILED');
  assert.equal(p.claimInviteCount, undefined);
});

test('sender name is the org, sanitized for the header', () => {
  assert.equal(senderFrom('Grace Chapel', 'Plajah <notifications@notify.plajah.com>'), 'Grace Chapel via Plajah <notifications@notify.plajah.com>');
  assert.equal(senderFrom('Evil <x@y>\r\nBcc: z', 'n@p.com'), 'Evil xyBcc z via Plajah <n@p.com>');
  assert.equal(senderFrom('St. Mary’s A.M.E. & Co-op', 'n@p.com'), 'St. Mary’s A.M.E. & Co-op via Plajah <n@p.com>');
  assert.equal(senderFrom('', 'n@p.com'), 'Plajah <n@p.com>');
});

test('invite email carries the link, the address, the member ID and escapes org text', () => {
  const m = renderClaimInvite({
    orgName: 'St. <Mark>', firstName: 'Jo', roleLabel: 'Deacon', departments: ['Youth'], memberNumber: 'GC-48213',
    email: 'jo@church.org', claimUrl: 'https://plajah.com/?elevateJoin=gc&claim=1&member=GC-48213', stopUrl: 'https://plajah.com/api/elevate/invites/stop?t=abc',
  });
  assert.match(m.subject, /^Your St\. <Mark> account on Plajah is ready$/);
  assert.match(m.text, /jo@church\.org/);
  assert.match(m.text, /GC-48213/);
  assert.match(m.text, /as Deacon with Youth/);
  assert.match(m.html, /St\. &lt;Mark&gt;/);
  assert.doesNotMatch(m.html, /<Mark>/);
  assert.match(m.html, /invites\/stop\?t=abc/);
  assert.match(renderClaimInvite({ orgName: 'G', email: 'a@b.org', claimUrl: 'https://x', reminder: true }).subject, /^Reminder: /);
});
