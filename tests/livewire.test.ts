// Project Livewire — planner, encoder args, manifests, tokens, CDN signing, origin config, cost,
// target switch, and a real end-to-end HLS ladder encoded with the bundled ffmpeg (no server).
// Run: npx tsx --test tests/livewire.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { planLadder, deliveredKbps, UPLINK_USE } from '../services/livewire/ladder';
import { buildEncodeArgs, pickEncoder, canEncodeAv1, rungPath } from '../services/livewire/encodeArgs';
import { buildMasterPlaylist, parseMasterPlaylist, avcCodec, av1Codec } from '../services/livewire/manifest';
import { signPublishToken, verifyPublishToken, decideOriginAuth } from '../services/livewire/token';
import { signedPlaybackUrl, publicPlaybackUrl, bunnyDirectoryToken } from '../services/livewire/cdn';
import { mediamtxConfig, originMaster } from '../services/livewire/origin';
import { initialAdapt, stepAdapt, MIN_HOLD_SEC } from '../services/livewire/contentAdapt';
import { muxCost, livewireCost, compareMonth, breakEvenMuxSpend } from '../services/livewire/cost';
import { resolveLiveTarget } from '../services/livewire/target';

const SECRET = 'x'.repeat(40);
const FFMPEG = join(process.cwd(), 'windows-native/third_party/ffmpeg/win-x64/ffmpeg.exe');
const FFPROBE = join(process.cwd(), 'windows-native/third_party/ffmpeg/win-x64/ffprobe.exe');

test('ladder: full 1080p ladder on a good uplink, fits 70% of upload', () => {
  const p = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 20000, encoder: 'nvenc', content: 'sports' });
  assert.equal(p.mode, 'desktop');
  assert.deepEqual(p.rungs.map(r => r.name), ['1080p', '720p', '480p', '360p', 'audio']);
  assert.ok(p.uploadKbps <= 20000 * UPLINK_USE);
  assert.equal(p.encoderSessions, 4);
});

test('ladder: slides need far fewer bits than sports at the same size', () => {
  const base = { sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 20000, encoder: 'nvenc' as const };
  const slides = planLadder({ ...base, content: 'slides' }).rungs[0].videoKbps;
  const sports = planLadder({ ...base, content: 'sports' }).rungs[0].videoKbps;
  assert.ok(slides < sports * 0.5, `${slides} vs ${sports}`);
});

test('ladder: weak uplink drops top rungs; hopeless uplink falls back to relay', () => {
  const mid = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 6000, encoder: 'nvenc', content: 'talk' });
  assert.equal(mid.mode, 'desktop');
  assert.ok(!mid.rungs.some(r => r.name === '1080p'));
  assert.ok(mid.notes.some(n => n.includes('dropped 1080p')));
  const weak = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 500, encoder: 'nvenc', content: 'sports' });
  assert.equal(weak.mode, 'relay');
  assert.equal(weak.rungs.length, 1);
});

test('ladder: no GPU → relay builds the ladder; tier cap limits height', () => {
  const cpu = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 30000, encoder: 'x264', content: 'talk' });
  assert.equal(cpu.mode, 'relay');
  const free = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 30000, encoder: 'nvenc', content: 'talk', maxHeight: 720 });
  assert.equal(free.rungs[0].name, '720p');
});

test('ladder: AV1 rungs added when GPU + upload allow, at ~65% of H.264', () => {
  const p = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 40000, encoder: 'nvenc', content: 'music', av1: true });
  const h = p.rungs.find(r => r.name === '1080p')!, a = p.rungs.find(r => r.name === 'av1_1080p')!;
  assert.ok(a, 'av1_1080p present');
  assert.ok(Math.abs(a.videoKbps / h.videoKbps - 0.65) < 0.05);
  assert.ok(p.encoderSessions <= 8);
  assert.ok(deliveredKbps(p) > 0);
});

test('ladder: 60 fps only on 720p and up', () => {
  const p = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 60, uplinkKbps: 40000, encoder: 'nvenc', content: 'game' });
  assert.equal(p.rungs.find(r => r.name === '720p')!.fps, 60);
  assert.equal(p.rungs.find(r => r.name === '480p')!.fps, 30);
});

test('encode args: SRT outputs per rung with aligned keyframes and token in stream id', () => {
  const p = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 20000, encoder: 'nvenc', content: 'talk' });
  const args = buildEncodeArgs({ input: ['-i', 'pipe:0'], rungs: p.rungs, encoder: 'nvenc', output: { kind: 'srt', host: 'origin.test', streamId: 'abc123', token: 'tok.sig' } });
  const urls = args.filter(a => a.startsWith('srt://'));
  assert.equal(urls.length, p.rungs.length); // video rungs + audio-only
  assert.ok(urls[0].includes(encodeURIComponent('publish:live/abc123/1080p:lw:tok.sig')));
  assert.equal(args.filter(a => a === 'h264_nvenc').length, p.encoderSessions);
  assert.ok(args.includes('-no-scenecut:v'));
  assert.ok(args.filter(a => a === '-force_key_frames').length >= p.encoderSessions);
  assert.equal(rungPath('abc123', '720p'), 'live/abc123/720p');
});

test('encode args: encoder pick + AV1 capability from the ffmpeg encoder list', () => {
  assert.equal(pickEncoder(['libx264', 'h264_qsv', 'h264_nvenc']), 'nvenc');
  assert.equal(pickEncoder(['libx264']), 'x264');
  assert.equal(canEncodeAv1('nvenc', ['av1_nvenc']), true);
  assert.equal(canEncodeAv1('x264', ['libsvtav1']), false);
});

test('manifest: codec strings and a master playlist players can read', () => {
  assert.equal(avcCodec({ width: 1920, height: 1080, fps: 30 }), 'avc1.640028');
  assert.equal(avcCodec({ width: 1280, height: 720, fps: 60 }), 'avc1.640020');
  assert.equal(av1Codec({ width: 1920, height: 1080, fps: 30 }), 'av01.0.08M.08');
  const p = planLadder({ sourceWidth: 1920, sourceHeight: 1080, fps: 30, uplinkKbps: 40000, encoder: 'nvenc', content: 'talk', av1: true });
  const m = originMaster(p.rungs);
  const v = parseMasterPlaylist(m);
  assert.equal(v.length, p.rungs.length);
  assert.ok(v[0].bandwidth >= v[v.length - 1].bandwidth, 'highest first');
  assert.ok(v.some(x => x.codecs?.startsWith('av01')));
  assert.ok(v.some(x => x.uri === '720p/index.m3u8' && x.resolution === '1280x720'));
  assert.ok(v.some(x => x.codecs === 'mp4a.40.2' && !x.resolution));
});

test('token: signs, verifies, rejects tampering and expiry', () => {
  const t = signPublishToken({ streamId: 'stream_01', uid: 'u1', expiresAt: 2000 }, SECRET);
  assert.deepEqual(verifyPublishToken(t, SECRET, 1000), { streamId: 'stream_01', uid: 'u1', expiresAt: 2000 });
  assert.equal(verifyPublishToken(t, SECRET, 3000), null);
  assert.equal(verifyPublishToken(t, 'y'.repeat(40), 1000), null);
  const [p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ s: 'other_stream', u: 'u1', e: 2000 })).toString('base64url');
  assert.equal(verifyPublishToken(`${forged}.${s}`, SECRET, 1000), null);
  assert.ok(p);
  assert.throws(() => signPublishToken({ streamId: 'x', uid: 'u', expiresAt: 1 }, SECRET));
  assert.throws(() => signPublishToken({ streamId: 'stream_01', uid: 'u', expiresAt: 1 }, 'short'));
});

test('origin auth: publish only to own stream + known rung; reads only CDN or localhost', () => {
  const tok = signPublishToken({ streamId: 'stream_01', uid: 'u1', expiresAt: 2000 }, SECRET);
  const cfg = { secret: SECRET, pullSecret: 'pull-secret-123', nowSec: 1000 };
  assert.equal(decideOriginAuth({ action: 'publish', path: 'live/stream_01/720p', password: tok }, cfg), true);
  assert.equal(decideOriginAuth({ action: 'publish', path: 'live/stream_02/720p', password: tok }, cfg), false);
  assert.equal(decideOriginAuth({ action: 'publish', path: 'live/stream_01/8k', password: tok }, cfg), false);
  assert.equal(decideOriginAuth({ action: 'publish', path: 'live/stream_01/720p', password: 'nope' }, cfg), false);
  assert.equal(decideOriginAuth({ action: 'read', path: 'live/stream_01/720p', ip: '203.0.113.9' }, cfg), false);
  assert.equal(decideOriginAuth({ action: 'read', path: 'live/stream_01/720p', ip: '203.0.113.9', password: 'pull-secret-123' }, cfg), true);
  assert.equal(decideOriginAuth({ action: 'read', path: 'live/stream_01/720p', ip: '127.0.0.1' }, cfg), true);
  assert.equal(decideOriginAuth({ action: 'api', ip: '203.0.113.9' }, cfg), false);
  assert.equal(decideOriginAuth({ action: 'api', ip: '127.0.0.1' }, cfg), true);
});

test('cdn: public URL plain, private URL carries a directory token', () => {
  const cfg = { host: 'live.example.net', securityKey: 'k' };
  assert.equal(publicPlaybackUrl(cfg, 's1abcd'), 'https://live.example.net/live/s1abcd/master.m3u8');
  const u = signedPlaybackUrl(cfg, 's1abcd', 3600, 1000);
  assert.ok(u.startsWith('https://live.example.net/bcdn_token='));
  assert.ok(u.includes('&expires=4600&token_path=%2Flive%2Fs1abcd%2F/live/s1abcd/master.m3u8'));
  assert.ok(u.includes(bunnyDirectoryToken('k', '/live/s1abcd/', 4600)));
  assert.throws(() => signedPlaybackUrl({ host: 'h' }, 's1abcd'));
});

test('origin config: LL-HLS, http auth, publisher paths', () => {
  const y = mediamtxConfig({ authUrl: 'http://127.0.0.1:8080/api/livewire/auth' });
  for (const s of ['authMethod: http', 'hlsVariant: lowLatency', 'hlsSegmentDuration: 2s', 'hlsPartDuration: 200ms', 'srt: yes', 'overridePublisher: yes', 'live/[A-Za-z0-9_-]{6,128}/(1080p']) {
    assert.ok(y.includes(s), `missing ${s}`);
  }
});

test('content adapt: rises at once on motion, falls only after the hold', () => {
  let s = initialAdapt('slides');
  for (let i = 0; i < 10; i++) s = stepAdapt(s, 0.2, 2);
  assert.equal(s.kind, 'sports');
  for (let i = 0; i < 3; i++) s = stepAdapt(s, 0, 2);
  assert.equal(s.kind, 'sports', 'held');
  for (let i = 0; i < 40; i++) s = stepAdapt(s, 0, 2);
  assert.notEqual(s.kind, 'sports');
  let g = initialAdapt('game');
  for (let i = 0; i < 60; i++) g = stepAdapt(g, 0, 2, 'game');
  assert.equal(g.kind, 'game'); // floor keeps a game stream at its own band, even when still
  assert.ok(MIN_HOLD_SEC > 0);
});

test('cost: church service and concert match the plan doc ballpark', () => {
  // 4 × 90-min services, 150 viewers watching the whole time.
  const church = { broadcastMinutes: 90 * 4, avgViewers: 150, deliveredKbps: 2500 };
  const mux = muxCost(church), lw = livewireCost(church);
  assert.ok(mux.total > 60 && mux.total < 70, `mux ${mux.total}`);
  assert.ok(lw.total < 6, `livewire ${lw.total}`);
  assert.equal(lw.encode, 0);
  const concert = { broadcastMinutes: 120, avgViewers: 1000, deliveredKbps: 2500, simulcastTargets: 2 };
  assert.ok(muxCost(concert).total > 100);
  const month = compareMonth(Array.from({ length: 20 }, () => church));
  assert.ok(month.saves > 0, JSON.stringify(month));
  assert.ok(breakEvenMuxSpend(church) > 700 && breakEvenMuxSpend(church) < 900);
});

test('target: Mux unless switched on, configured and allow-listed', () => {
  const on = { LIVEWIRE_ENABLED: '1', LIVEWIRE_ORIGIN_HOST: 'o', LIVEWIRE_CDN_HOST: 'c', LIVEWIRE_ALLOW_UIDS: 'u1' };
  assert.equal(resolveLiveTarget('u1', {}).target, 'mux');
  assert.equal(resolveLiveTarget('u1', { ...on, LIVEWIRE_CDN_HOST: '' }).target, 'mux');
  assert.equal(resolveLiveTarget('u2', on).target, 'mux');
  assert.equal(resolveLiveTarget('u1', on).target, 'livewire');
  assert.equal(resolveLiveTarget('u1', on, { forceMux: true }).target, 'mux');
  assert.equal(resolveLiveTarget('anyone', { ...on, LIVEWIRE_ALLOW_UIDS: '*' }).target, 'livewire');
});

function runLadderE2E(encoder: 'x264' | 'nvenc') {
  const dir = mkdtempSync(join(tmpdir(), `livewire-${encoder}-`));
  try {
    const plan = planLadder({ sourceWidth: 1280, sourceHeight: 720, fps: 30, uplinkKbps: 20000, encoder: encoder === 'x264' ? 'nvenc' : encoder, content: 'talk', maxHeight: 720 });
    // x264 path in the test: same ladder, CPU encoder (relay box behaviour).
    const rungs = plan.rungs.filter(r => r.name === '720p' || r.name === '480p' || r.name === 'audio');
    const args = buildEncodeArgs({
      input: ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '6'],
      audioInput: ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '6'],
      rungs, encoder, output: { kind: 'hls-local', dir },
    });
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8', timeout: 120_000 });
    return { dir, rungs, status: r.status, stderr: r.stderr };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

test('end to end: bundled ffmpeg encodes a 2-rung HLS ladder with aligned segments', { skip: !existsSync(FFMPEG) && 'bundled ffmpeg not present' }, () => {
  const { dir, rungs, status, stderr } = runLadderE2E('x264');
  try {
    assert.equal(status, 0, stderr);
    const master = parseMasterPlaylist(readFileSync(join(dir, 'master.m3u8'), 'utf8'));
    assert.equal(master.length, 2);
    const segCounts: number[] = [];
    for (const r of rungs.filter(x => x.codec !== 'none')) {
      const files = readdirSync(join(dir, r.name));
      const segs = files.filter(f => f.endsWith('.m4s'));
      segCounts.push(segs.length);
      assert.ok(segs.length >= 2, `${r.name}: ${files.join(',')}`);
      const probe = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(dir, r.name, 'index.m3u8')], { encoding: 'utf8' });
      assert.equal(probe.stdout.trim().split(/\r?\n/)[0], `${r.width},${r.height}`);
    }
    assert.equal(segCounts[0], segCounts[1], 'every rung cut the same number of segments');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('end to end on the GPU: NVENC ladder (skips when no NVIDIA GPU)', { skip: !existsSync(FFMPEG) && 'bundled ffmpeg not present' }, (t) => {
  const { dir, status, stderr } = runLadderE2E('nvenc');
  try {
    if (status !== 0 && /nvenc|cuda|No capable devices|Cannot load/i.test(stderr || '')) { t.skip('NVENC not available here'); return; }
    assert.equal(status, 0, stderr);
    assert.ok(existsSync(join(dir, 'master.m3u8')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
