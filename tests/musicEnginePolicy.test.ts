import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createMusicLabRouter } from '../routes/musicLab.ts';
import { MUSIC_ENGINES, musicEngineAccess } from '../services/musicEnginePolicy.ts';

test('evaluation permission and a runtime never grant public access', () => {
  for (const engine of MUSIC_ENGINES) {
    assert.equal(musicEngineAccess(engine.id, { isAdmin: false, evaluationPermission: 'agreement', runtimeConnected: true }).status, 403);
  }
});
test('restricted engines require permission independently of runtime configuration', () => {
  for (const id of ['yue2', 'sheetsage2']) {
    assert.equal(musicEngineAccess(id, { isAdmin: true, runtimeConnected: true }).status, 403);
    assert.equal(musicEngineAccess(id, { isAdmin: true, evaluationPermission: '  ', runtimeConnected: true }).status, 403);
    assert.equal(musicEngineAccess(id, { isAdmin: true, evaluationPermission: 'agreement' }).status, 503);
    assert.equal(musicEngineAccess(id, { isAdmin: true, evaluationPermission: 'agreement', runtimeConnected: true }).allowed, true);
  }
});
test('HTTP registry and execution attempts enforce admin access and fail closed', async () => {
  const app = express();
  app.use('/lab', createMusicLabRouter({
    authenticate: (req: any, res, next) => {
      if (!req.headers.authorization) return void res.sendStatus(401);
      req.uid = req.headers.authorization;
      next();
    },
    isAdmin: async uid => uid === 'admin',
    evaluationPermission: () => 'test evaluation agreement',
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/lab`;
  try {
    assert.equal((await fetch(`${base}/engines`)).status, 401);
    for (const [path, method] of [['/engines', 'GET'], ['/engines/yue2/generate', 'POST']]) {
      assert.equal((await fetch(base + path, { method, headers: { Authorization: 'member' } })).status, 403);
    }
    const response = await fetch(`${base}/engines`, { headers: { Authorization: 'admin' } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.ok(data.engines.some((engine: any) => engine.id === 'yue2'));
    assert.ok(data.engines.every((engine: any) => !engine.publicAvailable && !engine.access.allowed));
    assert.equal((await fetch(`${base}/engines/yue2/generate`, { method: 'POST', headers: { Authorization: 'admin' } })).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
