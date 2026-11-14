import test from 'node:test';
import assert from 'node:assert/strict';
import { splitOrgPatch, mergeOrgFinance, orgCanReceiveGiving, orgOffersFeeCover, financeViewFor, financeViewLevel } from '../services/orgFinanceCore';

test('finance fields leave the public patch; Stripe fields are dropped', () => {
  const { publicPatch, financePatch } = splitOrgPatch({ name: 'A', ein: '12', legalName: 'L', stripeAccountId: 'acct_x', canReceiveGiving: true, billingConnection: {} });
  assert.deepEqual(publicPatch, { name: 'A' });
  assert.deepEqual(financePatch, { ein: '12', legalName: 'L' });
});
test('settings go private and only the fee-cover flag stays public', () => {
  const { publicPatch, financePatch } = splitOrgPatch({ financeSettings: { donorCoversFees: false, recurringBills: [] } });
  assert.deepEqual(publicPatch, { donorFeeCoverOff: true });
  assert.deepEqual(financePatch.financeSettings, { donorCoversFees: false, recurringBills: [] });
});
test('private values win over a stale public copy', () => {
  assert.equal(mergeOrgFinance({ id: 'o', ein: 'old' } as any, { ein: 'new' }).ein, 'new');
  assert.equal(mergeOrgFinance({ id: 'o', ein: 'old' } as any, null).ein, 'old');
});
test('giving works from the flag or an unmigrated account', () => {
  assert.equal(orgCanReceiveGiving({ canReceiveGiving: true }), true);
  assert.equal(orgCanReceiveGiving({ stripeAccountId: 'a' }), true);
  assert.equal(orgCanReceiveGiving({}), false);
});
test('the fee-cover offer honours the public flag and external links', () => {
  assert.equal(orgOffersFeeCover({ canReceiveGiving: true }), true);
  assert.equal(orgOffersFeeCover({ canReceiveGiving: true, donorFeeCoverOff: true }), false);
  assert.equal(orgOffersFeeCover({ canReceiveGiving: true, givingUrl: 'x' }), false);
  assert.equal(orgOffersFeeCover({}), false);
});
const fin = { ein: '12', legalName: 'L', stripeAccountId: 'acct', billingConnection: { x: 1 }, financeSettings: { statementIntro: 'hi', recurringBills: [{ a: 1 }], qbDepositAccount: 'q', dualApprovalAbove: 5 } };
test('a member gets the tax identity and nothing else', () => {
  assert.deepEqual(financeViewFor(fin, 'identity'), { ein: '12', legalName: 'L', financeSettings: { statementIntro: 'hi' } });
});
test('a leader adds approval limits, never bills or Stripe', () => {
  const v: any = financeViewFor(fin, 'policy');
  assert.equal(v.financeSettings.dualApprovalAbove, 5);
  assert.equal(v.financeSettings.recurringBills, undefined);
  assert.equal(v.financeSettings.qbDepositAccount, undefined);
  assert.equal(v.stripeAccountId, undefined);
  assert.equal(v.billingConnection, undefined);
});
test('view levels come from role lists', () => {
  assert.equal(financeViewLevel({ creatorId: 'o' }, 'x', false), 'none');
  assert.equal(financeViewLevel({ creatorId: 'o' }, 'x', true), 'identity');
  assert.equal(financeViewLevel({ creatorId: 'o', leaderUids: ['x'] }, 'x', false), 'policy');
  assert.equal(financeViewLevel({ creatorId: 'o', ministries: [{ headUids: ['x'] }] }, 'x', false), 'policy');
  assert.deepEqual(financeViewFor(fin, 'none'), {});
});
