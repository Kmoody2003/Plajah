// Launch switches for print-on-demand: everything defaults OFF, retail can never be on without ordering, and the server
// keeps the routes that move money behind a flag while leaving in-flight order plumbing (files, webhooks) ungated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectivePodFlags, POD_FLAGS, ALL_POD_FLAGS_OFF } from '../services/pod/podFlags';

test('every flag defaults OFF, including when the doc is missing or malformed', () => {
  for (const raw of [undefined, null, {}, { PRINT_ORDERING: 'yes' as any }, { PRINT_RETAIL: 1 as any }]) {
    assert.deepEqual(effectivePodFlags(raw as any), ALL_POD_FLAGS_OFF);
  }
});

test('retail is only effective when direct ordering is on', () => {
  assert.equal(effectivePodFlags({ PRINT_RETAIL: true }).PRINT_RETAIL, false);
  assert.equal(effectivePodFlags({ PRINT_ORDERING: true, PRINT_RETAIL: true }).PRINT_RETAIL, true);
  assert.equal(effectivePodFlags({ PRINT_EXPORT_PACKS: true }).PRINT_ORDERING, false);
});

test('flag metadata is complete', () => {
  assert.deepEqual(POD_FLAGS.map(f => f.key).sort(), ['PRINT_EXPORT_PACKS', 'PRINT_ORDERING', 'PRINT_RETAIL']);
  for (const f of POD_FLAGS) { assert.ok(f.label && f.blurb && f.needs.length); }
});

const routes = readFileSync(new URL('../routes/pod.ts', import.meta.url), 'utf8');
const line = (needle: string) => routes.split('\n').find(l => l.includes(needle)) || '';

test('server gates every route that creates orders, money movement or files for authors', () => {
  assert.match(line("r.post('/checkout'"), /needFlag\('PRINT_RETAIL'\)/);
  assert.match(line("r.post('/author-copies'"), /needFlag\('PRINT_ORDERING'\)/);
  assert.match(line("r.put('/editions/:albumId'"), /anyPrint/);
  assert.match(line("r.post('/quote'"), /anyPrint/);
  assert.match(line("r.get('/preview/:albumId/:file'"), /anyPrint/);
});

test('in-flight plumbing is NEVER gated: printer file fetch, printer webhook, Stripe fulfilment', () => {
  assert.doesNotMatch(line("r.get('/files/:orderId/:file'"), /needFlag|anyPrint/);
  assert.doesNotMatch(line("r.post('/webhook/:provider'"), /needFlag|anyPrint/);
  const fulfil = routes.slice(routes.indexOf('export async function fulfillPodOrderFromStripe'), routes.indexOf('async function submitPrintJob'));
  assert.doesNotMatch(fulfil, /flagsNow|needFlag/);
});

test('readiness endpoint is admin-only and never returns secret values', () => {
  const block = routes.slice(routes.indexOf("r.get('/readiness'"), routes.indexOf("r.get('/providers'"));
  assert.match(block, /deps\.isAdmin/);
  assert.match(block, /403/);
  assert.doesNotMatch(block, /res\.json\(\{[^}]*process\.env\.(LULU_CLIENT_SECRET|POD_FILE_SECRET|STRIPE_SECRET_KEY)\b/);
});
