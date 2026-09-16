import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestChoraConversion, protectPlaylist } from '../services/choraUploadQueue';

test('locker upload enqueues by persisted ID, not a caller-supplied file URL', async () => {
  let request: any;
  assert.equal(await requestChoraConversion('track', 'ptrack_1', 'test-token', (async (url, init) => {
    request = {url, init}; return new Response('{}', {status:200});
  }) as typeof fetch), true);
  assert.equal(request.url, '/api/chora/enqueue-track');
  assert.deepEqual(JSON.parse(request.init.body), {trackId:'ptrack_1'});
  assert.equal(request.init.headers.Authorization, 'Bearer test-token');
});
test('queue authentication failure is reported without repeated unauthorized requests', async () => {
  let calls=0;
  const result = await requestChoraConversion('album','album1','invalid',(async()=>{calls++;return new Response('{}',{status:403});}) as typeof fetch);
  assert.equal(result,false); assert.equal(calls,1);
});
test('private playlist protects both init segments and media segments', () => {
  const result = protectPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg_001.m4s\n', 'secret');
  assert.match(result, /URI="init.mp4\?access=secret"/);
  assert.match(result, /seg_001.m4s\?access=secret/);
  assert.match(result, /^#EXTM3U/);
});
