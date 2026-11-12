import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createTerraLawRouter } from '../routes/terraLaw';

// Runs against the committed data/terraLaw/mi files produced by scripts/terra/ingestMichiganLaw.ts.
const HAVE_DATA = existsSync('data/terraLaw/mi/index.json.gz');

test('Terra law API serves the index, sections and the Constitution', { skip: !HAVE_DATA && 'no ingested data' }, async () => {
  const app = express();
  app.use(createTerraLawRouter());
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const idx = await (await fetch(`${base}/api/terra/law/mi`)).json();
    assert.equal(idx.jurisdiction, 'mi');
    assert.ok(idx.totals.sections > 40000);
    assert.match(idx.source.notice, /Unofficial/);

    const zoning = await (await fetch(`${base}/api/terra/law/mi/section/mcl-125.3201`)).json();
    assert.equal(zoning.section.num, '125.3201');
    assert.equal(zoning.chapter.n, '125');
    assert.ok(zoning.path.some((p: string) => /zoning enabling/i.test(p)));

    const art = await (await fetch(`${base}/api/terra/law/mi/section/const-I-1`)).json();
    assert.equal(art.section.catch, 'Political power.');

    assert.equal((await fetch(`${base}/api/terra/law/xx`)).status, 404);
    assert.equal((await fetch(`${base}/api/terra/law/mi/section/${encodeURIComponent('../etc')}`)).status, 400);
    assert.equal((await fetch(`${base}/api/terra/law/mi/mcl/..%2Fx`)).status, 400);
    assert.equal((await fetch(`${base}/api/terra/law/mi/section/mcl-999.99999`)).status, 404);
  } finally {
    srv.close();
  }
});
