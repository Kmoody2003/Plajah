import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { isGoogleFrontEnd, plajahTrustProxy } from '../services/trustProxy';

test('recognises the Hosting egress ranges seen in Cloud Run logs', () => {
  for (const ip of ['66.102.6.10', '192.178.15.3', '74.125.215.9', '74.125.212.1', '64.233.172.40', '66.249.84.2', '::ffff:66.102.6.10', '2607:f8b0:4000::1']) {
    assert.equal(isGoogleFrontEnd(ip), true, ip);
  }
  for (const ip of ['35.187.143.7', '8.8.4.0x', '203.0.113.5', '73.12.4.9', '10.0.0.1', '2600:1700::1', '']) {
    assert.equal(isGoogleFrontEnd(ip), false, ip);
  }
});

async function ipFor(xff: string, peer = '169.254.1.1'): Promise<string> {
  const app = express();
  app.set('trust proxy', plajahTrustProxy);
  app.get('/', (req, res) => res.send(req.ip));
  // Drive Express's own req.ip resolution with a fake socket peer.
  return await new Promise((resolve) => {
    const req: any = Object.assign(Object.create(app.request), {
      app, headers: { 'x-forwarded-for': xff }, connection: { remoteAddress: peer }, socket: { remoteAddress: peer },
    });
    resolve(req.ip);
  });
}

test('req.ip is the real client behind Hosting', async () => {
  assert.equal(await ipFor('73.12.4.9, 66.102.6.10'), '73.12.4.9');
});

test('a spoofed X-Forwarded-For entry is ignored', async () => {
  assert.equal(await ipFor('1.2.3.4, 73.12.4.9, 66.102.6.10'), '73.12.4.9');
});

test('a direct *.run.app caller cannot spoof through', async () => {
  assert.equal(await ipFor('1.2.3.4, 73.12.4.9'), '73.12.4.9');
});
