import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  sha256Hex, canonical, checkExclusions, validateDraft, createEnvelope, send, view, consent, fillField, finish, decline,
  voidEnvelope, verifyAudit, certificate, expireIfDue, activeOrder, type DraftInput,
} from '../services/tela/sign/signCore';

const DOC = sha256Hex('permit PDF bytes');
const T = Date.UTC(2026, 10, 12, 15);

function draft(over: Partial<DraftInput> = {}): DraftInput {
  return {
    id: 'env1', title: 'Sidewalk café permit', docType: 'permit', docHash: DOC, pages: 2, now: T,
    sender: { id: 'clerk', name: 'City Clerk', org: 'City of Example' },
    signers: [
      { id: 'owner', name: 'Ana Ruiz', email: 'ana@example.org', role: 'signer', order: 1, auth: 'email_link', consumer: true },
      { id: 'director', name: 'Priya Natarajan', email: 'priya@city.example', role: 'approver', order: 2, auth: 'plajah_account' },
      { id: 'cc', name: 'Records', email: 'records@city.example', role: 'cc', order: 3, auth: 'email_link' },
    ],
    fields: [
      { id: 'f1', signerId: 'owner', type: 'signature', page: 2, x: 10, y: 80, w: 30, h: 6, required: true },
      { id: 'f2', signerId: 'owner', type: 'date_signed', page: 2, x: 45, y: 80, w: 15, h: 4, required: true },
      { id: 'f3', signerId: 'owner', type: 'checkbox', label: 'I agree to the conditions', page: 1, x: 10, y: 60, w: 4, h: 3, required: true },
      { id: 'f4', signerId: 'director', type: 'signature', page: 2, x: 60, y: 80, w: 30, h: 6, required: true },
    ],
    ...over,
  };
}

test('sha256 matches Node crypto, canonical JSON is key-order independent', () => {
  for (const s of ['', 'abc', 'é ünïcode ✓', 'x'.repeat(1000)]) assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'));
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: undefined }] }), canonical({ a: [2, { d: 1 }], b: 1 }));
});

test('exclusions: block wills and court orders, flag paper-only notices and state departments', () => {
  assert.equal(checkExclusions('will', 'Last will and testament').level, 'block');
  assert.equal(checkExclusions('court order', '').allowed, false);
  assert.equal(checkExclusions('notice', 'Water shutoff notice').level, 'warn');
  assert.equal(checkExclusions('petition', 'Recall election petition').level, 'ok');
  assert.equal(checkExclusions('agreement', 'Agreement that will renew yearly').level, 'ok');
  assert.ok(checkExclusions('permit', '', { stateDepartment: true }).cites.includes('mcl-450.848'));
});

test('draft validation explains what is missing', () => {
  assert.deepEqual(validateDraft(draft()), []);
  const p = validateDraft(draft({ fields: [{ id: 'x', signerId: 'owner', type: 'signature', page: 3, x: 90, y: 0, w: 20, h: 5, required: true }] }));
  assert.ok(p.includes('Priya Natarajan has no signature field.') === false); // approver: no signature field required
  assert.ok(p.some((x) => /outside the page/.test(x)));
  assert.ok(validateDraft(draft({ docType: 'will', title: 'Last will' })).some((x) => /Wills/.test(x)));
});

test('full ceremony: order, consent, fields, completion, tamper-evident audit', () => {
  let e = send(createEnvelope(draft()), T + 1);
  assert.equal(activeOrder(e), 1);
  assert.equal(e.signers.find((s) => s.id === 'owner')!.status, 'ready');
  assert.equal(e.signers.find((s) => s.id === 'director')!.status, 'waiting');
  assert.throws(() => fillField(e, 'director', 'f4', { method: 'typed', data: 'Priya', at: T }, T + 2), /turn/);

  e = view(e, 'owner', T + 10, { ip: '203.0.113.5', userAgent: 'test' });
  e = fillField(e, 'owner', 'f1', { method: 'drawn', data: 'M0 0 L10 10', at: T + 20 }, T + 20);
  e = fillField(e, 'owner', 'f3', true, T + 21);
  assert.throws(() => finish(e, 'owner', T + 22), /disclosure/);
  e = consent(e, 'owner', T + 23);
  e = finish(e, 'owner', T + 24);
  assert.equal(e.fields.find((f) => f.id === 'f2')!.value, '2026-11-12');
  assert.equal(e.signers.find((s) => s.id === 'director')!.status, 'ready');
  assert.equal(e.status, 'sent');

  e = fillField(e, 'director', 'f4', { method: 'typed', data: 'Priya Natarajan', at: T + 30 }, T + 30);
  e = finish(e, 'director', T + 31);
  assert.equal(e.status, 'completed');
  assert.match(e.finalHash!, /^[0-9a-f]{64}$/);
  assert.deepEqual(verifyAudit(e), { ok: true });

  const cert = certificate(e);
  assert.equal(cert.auditIntact, true);
  assert.deepEqual(cert.signers.map((s) => s.method), ['drawn', 'typed']);

  // tampering with history is detected
  const forged = { ...e, audit: e.audit.map((a, i) => (i === 3 ? { ...a, at: a.at + 1 } : a)) };
  assert.equal(verifyAudit(forged).ok, false);
  assert.equal(verifyAudit(forged).brokenAt, 3);
});

test('decline, void and expiry', () => {
  const sent = send(createEnvelope(draft()), T);
  assert.throws(() => decline(sent, 'owner', '  ', T), /why/);
  const d = decline(sent, 'owner', 'Wrong address on page 1', T + 5);
  assert.equal(d.status, 'declined');
  assert.throws(() => fillField(d, 'owner', 'f1', { method: 'typed', data: 'x', at: T }, T), /not open/);
  assert.equal(voidEnvelope(sent, 'clerk', 'Reissued', T).status, 'voided');
  assert.equal(expireIfDue(sent, T + 31 * 86_400_000).status, 'expired');
  assert.equal(expireIfDue(sent, T + 86_400_000).status, 'sent');
});
