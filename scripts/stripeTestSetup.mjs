// Stripe TEST MODE setup: creates (or reuses) one test connected account for local store checkouts and prints its
// test onboarding link. Reads and updates .env.stripe-test.local. Refuses anything but a test key.
//   node scripts/stripeTestSetup.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import Stripe from 'stripe';

const FILE = '.env.stripe-test.local';
let text;
try { text = readFileSync(FILE, 'utf8'); } catch { console.error(`Missing ${FILE}. Copy .env.stripe-test.example to ${FILE} and add your sk_test_ key.`); process.exit(1); }
const env = Object.fromEntries(text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const key = env.STRIPE_SECRET_KEY || '';
if (!/^(sk|rk)_test_/.test(key)) { console.error('STRIPE_SECRET_KEY in .env.stripe-test.local must be a test key (sk_test_...). Refusing.'); process.exit(1); }

const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
let acct = env.STRIPE_TEST_DESTINATION || '';
if (acct) {
  try { await stripe.accounts.retrieve(acct); } catch { console.warn(`${acct} not found in this test account; making a new one.`); acct = ''; }
}
if (!acct) {
  const a = await stripe.accounts.create({
    type: 'express', country: 'US', email: 'test-shop@example.com',
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { name: 'Plajah Test Shop', product_description: 'Local store testing' },
    metadata: { plajah: 'store-test' },
  });
  acct = a.id;
  const line = `STRIPE_TEST_DESTINATION=${acct}`;
  text = /^STRIPE_TEST_DESTINATION=.*$/m.test(text) ? text.replace(/^STRIPE_TEST_DESTINATION=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(FILE, text);
  console.log(`Created test connected account ${acct} and saved it to ${FILE}.`);
}
const a = await stripe.accounts.retrieve(acct);
console.log(`Test account ${acct}: charges ${a.charges_enabled ? 'on' : 'off'}, payouts ${a.payouts_enabled ? 'on' : 'off'}.`);
if (!a.charges_enabled) {
  const link = await stripe.accountLinks.create({ account: acct, type: 'account_onboarding', refresh_url: 'http://localhost:3300/', return_url: 'http://localhost:3300/' });
  console.log('\nFinish test onboarding here (use Stripe\'s test data buttons, phone 000-000-0000, code 000000):\n' + link.url);
}
