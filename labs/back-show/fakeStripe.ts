// Stand-in for the Stripe calls in routes/backShow.ts, for tests and back-show-lab only. Honors idempotency keys.
export function makeFakeStripe() {
  let n = 0;
  const seen = new Map<string, any>();
  const once = (key: string | undefined, make: () => any) => {
    if (!key) return make();
    if (!seen.has(key)) seen.set(key, make());
    return seen.get(key);
  };
  const sessions = new Map<string, any>();
  const accounts = new Map<string, any>();
  const refunded = new Set<string>();
  const state = {
    charges: [] as any[], refunds: [] as any[], createdAccounts: [] as any[], failRefunds: false,
    finishOnboarding(id: string) { accounts.get(id).charges_enabled = true; },
    /** The sponsor pays on Stripe's page: a direct charge on the organizer's account, with Plajah's fee. */
    completeSession(id: string) {
      const s = sessions.get(id);
      if (!s || s.status !== 'open') return;
      s.status = 'complete'; s.payment_status = 'paid'; s.payment_intent = `pi_${++n}`;
      state.charges.push({ id: s.payment_intent, amount: s.amount_total, applicationFee: s.applicationFee, stripeAccount: s.stripeAccount });
    },
    accounts: {
      create: async (o: any, opts?: any) => once(opts?.idempotencyKey, () => { const a = { id: `acct_${++n}`, charges_enabled: false, controller: o.controller }; accounts.set(a.id, a); state.createdAccounts.push(a); return a; }),
      retrieve: async (id: string) => accounts.get(id),
    },
    accountLinks: { create: async (o: any) => ({ url: o.return_url }) },
    checkout: {
      sessions: {
        create: async (o: any, opts?: any) => once(opts?.idempotencyKey, () => {
          const id = `cs_${++n}`;
          const s = { id, status: 'open', payment_status: 'unpaid', metadata: o.metadata, amount_total: o.line_items[0].price_data.unit_amount, applicationFee: o.payment_intent_data.application_fee_amount, stripeAccount: opts?.stripeAccount, url: `${o.success_url}&session_id=${id}`, payment_intent: null as any };
          sessions.set(id, s);
          return s;
        }),
        retrieve: async (id: string) => sessions.get(id),
        expire: async (id: string) => {
          const s = sessions.get(id);
          if (s.status !== 'open') throw new Error('This session is not open.');
          s.status = 'expired';
          return s;
        },
      },
    },
  };
  (state.refunds as any).create = async (o: any, opts?: any) => {
    if (state.failRefunds) throw new Error('Insufficient funds');
    return once(opts?.idempotencyKey, () => {
      if (refunded.has(o.payment_intent)) throw new Error('Already refunded');
      refunded.add(o.payment_intent);
      const x = { id: `re_${++n}`, payment_intent: o.payment_intent, refund_application_fee: o.refund_application_fee, stripeAccount: opts?.stripeAccount };
      state.refunds.push(x);
      return x;
    });
  };
  return state as any;
}
