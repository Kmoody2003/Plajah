// The Plajah ID store against an in-memory fake of the Firestore REST API (no network, no production data).
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; // no real credentials: authHeaders() sends none

const docs = new Map<string, any>(); // full doc path → REST `fields`
let commits = 0;

const docPath = (url: string) => decodeURIComponent(url.split('/documents/')[1]?.split('?')[0] || '');

(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const method = (init.method || 'GET').toUpperCase();
  const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (url.endsWith(':commit')) {
    commits++;
    const { writes } = JSON.parse(init.body);
    for (const w of writes) {
      const p = w.update.name.split('/documents/')[1];
      if (w.currentDocument?.exists === false && docs.has(p)) return json(400, { error: { status: 'FAILED_PRECONDITION', message: 'ALREADY_EXISTS' } });
    }
    for (const w of writes) {
      const p = w.update.name.split('/documents/')[1];
      const next = w.updateMask ? { ...(docs.get(p) || {}), ...Object.fromEntries(w.updateMask.fieldPaths.map((f: string) => [f, w.update.fields[f]])) } : w.update.fields;
      docs.set(p, next);
    }
    return json(200, {});
  }
  const p = docPath(url);
  if (method === 'GET' && url.includes('?pageSize')) {
    const prefix = p + '/';
    const documents = [...docs.entries()].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map(([k, fields]) => ({ name: `x/documents/${k}`, fields }));
    return json(200, { documents });
  }
  if (method === 'GET') return docs.has(p) ? json(200, { fields: docs.get(p) }) : json(404, {});
  throw new Error(`unexpected ${method} ${url}`);
};

const store = await import('../services/plajahId/store');
const { isPlajahId } = await import('../services/plajahId/core');

describe('Plajah ID store', () => {
  beforeEach(() => { docs.clear(); commits = 0; });

  it('mints a person ID once, with its first sign-in and a verified history', async () => {
    const a = await store.ensurePersonId('uid-1', 'google.com');
    assert.ok(a.created && isPlajahId(a.id) && a.id.startsWith('PJ-'));
    const b = await store.ensurePersonId('uid-1', 'google.com');
    assert.deepEqual(b, { id: a.id, created: false });
    const h = await store.readHistory(a.id);
    assert.equal(h.verified, true);
    assert.deepEqual(h.events.map(e => e.type), ['created', 'login_linked']);
    assert.equal((h.events[1].data as any).uid, 'uid-1');
  });

  it('two racing requests for one account end with ONE identity', async () => {
    const [x, y] = await Promise.all([store.ensurePersonId('uid-race', 'password'), store.ensurePersonId('uid-race', 'password')]);
    assert.equal(x.id, y.id);
    assert.equal([x, y].filter(r => r.created).length, 1);
    assert.equal([...docs.keys()].filter(k => /^identities\/[^/]+$/.test(k)).length, 1);
  });

  it('org identity: linked to the org page, creator is the first controller', async () => {
    const me = await store.ensurePersonId('uid-owner', 'google.com');
    const org = await store.ensureOrgId('org-123', me.id, me.id);
    assert.ok(org.created && org.id.startsWith('PJO-'));
    assert.equal((await store.ensureOrgId('org-123', me.id, me.id)).id, org.id);
    const rec = await store.getIdentity(org.id);
    assert.deepEqual(rec?.controllers, [me.id]);
    const h = await store.readHistory(org.id);
    assert.equal(h.verified, true);
    assert.deepEqual(h.events.map(e => e.type), ['created', 'org_linked', 'controller_added']);
  });

  it('appended events extend the chain; a tampered stored event is caught', async () => {
    const me = await store.ensurePersonId('uid-2', 'google.com');
    await store.appendEvent(me.id, 'login_linked', me.id, { uid: 'uid-2b', provider: 'password' });
    let h = await store.readHistory(me.id);
    assert.equal(h.verified, true);
    assert.equal(h.events.length, 3);
    const key = `identities/${me.id}/history/00000001`;
    docs.set(key, { ...docs.get(key), data: { mapValue: { fields: { uid: { stringValue: 'attacker' } } } } });
    h = await store.readHistory(me.id);
    assert.equal(h.verified, false);
    assert.equal(h.brokenAt, 1);
  });
});
