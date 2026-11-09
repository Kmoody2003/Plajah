// Disc Phase 2: M2TS muxer, CLPI, and a real end-to-end disc folder opened by libbluray (ffprobe
// "bluray:" protocol) using the ffmpeg bundled for the desktop app.   npm run test:disc
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, createReadStream, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { mux, SP, ALIGNED_UNIT, CLIP_PTS_BASE_90K, PCR_PID, fromSup, fromIg, type MuxUnit } from '../services/disc/m2ts';
import { demuxAll, isKeyframe } from '../services/disc/ts';
import { parseClpi, writeClpi, epTables } from '../services/disc/clpi';
import { buildSup } from '../services/disc/pgs';
import { quantize } from '../services/disc/palette';
import { buildIg } from '../services/disc/ig';
import * as H from '../services/disc/hdmv';
import { makeDisc, type Native } from '../services/disc/discWriter';
import type { ClipIO } from '../services/disc/clipMux';
import { applyTemplate } from '../services/disc/templates';
import { newProject, newTitle, uid } from '../services/disc/project';

const FF = join(process.cwd(), 'windows-native/third_party/ffmpeg/win-x64');
const ffmpeg = join(FF, 'ffmpeg.exe'), ffprobe = join(FF, 'ffprobe.exe');
const haveFf = existsSync(ffmpeg) && existsSync(ffprobe);

function fakeVideo(frames: number, gop = 24): MuxUnit[] {
  return Array.from({ length: frames }, (_, i) => {
    const key = i % gop === 0;
    const body = new Uint8Array(key ? 30000 : 6000).fill(0x5a);
    const nal = Uint8Array.from([0, 0, 0, 1, 0x09, 0xf0, 0, 0, 1, key ? 0x65 : 0x41]);
    const data = new Uint8Array(nal.length + body.length); data.set(nal); data.set(body, nal.length);
    return { pts: 1000 + i * 3754 + 3754, dts: 1000 + i * 3754, data, key };
  });
}
const fakeAc3 = (n: number): MuxUnit[] => Array.from({ length: n }, (_, i) => ({ pts: 1000 + i * 2880, dts: 1000 + i * 2880, data: new Uint8Array(1280).fill(0x0b) }));

test('keyframe detection for H.264 IDR and HEVC IRAP', () => {
  assert.equal(isKeyframe(Uint8Array.from([0, 0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x65, 1]), 'h264'), true);
  assert.equal(isKeyframe(Uint8Array.from([0, 0, 1, 0x41, 1]), 'h264'), false);
  assert.equal(isKeyframe(Uint8Array.from([0, 0, 0, 1, 0x46, 1, 0, 0, 1, 0x26, 1]), 'hevc'), true); // AUD then IDR_W_RADL (19)
  assert.equal(isKeyframe(Uint8Array.from([0, 0, 1, 0x02, 1]), 'hevc'), false);
});

test('mux: 192-byte packets, ATS rising, aligned units, PSI + PCR cadence, timestamps re-based, EP map', async () => {
  const chunks: Uint8Array[] = [];
  const v = fakeVideo(96), a = fakeAc3(125);
  const res = await mux([
    { pid: 0x1011, kind: 'video', streamType: 0x1b, units: v },
    { pid: 0x1100, kind: 'audio', streamType: 0x81, units: a },
  ], { muxRateBps: 48e6, write: b => { chunks.push(b); }, timeOffset90k: CLIP_PTS_BASE_90K - v[0].pts, frameDuration90k: 3754 });
  const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
  assert.equal(buf.length, res.bytes); assert.equal(buf.length % ALIGNED_UNIT, 0); assert.equal(res.underruns, 0);
  let lastAts = -1, wraps = 0; const pcrTimes: number[] = [];
  for (let o = 0; o < buf.length; o += SP) {
    assert.equal(buf[o + 4], 0x47, `sync at ${o}`);
    const ats = ((buf[o] & 0x3f) << 24 | buf[o + 1] << 16 | buf[o + 2] << 8 | buf[o + 3]) >>> 0;
    if (ats < lastAts) wraps++; lastAts = ats;
    const pid = ((buf[o + 5] & 0x1f) << 8) | buf[o + 6];
    if (pid === PCR_PID) pcrTimes.push(ats + wraps * 2 ** 30);
  }
  assert.ok(pcrTimes.length > 10);
  for (let i = 1; i < pcrTimes.length; i++) assert.ok(pcrTimes[i] - pcrTimes[i - 1] <= 0.1 * 27e6 + 1e5, 'PCR gap ≤ 100 ms');
  const { units, streams } = demuxAll(new Uint8Array(buf), 192);
  assert.equal(streams.get(0x1011), 0x1b); assert.equal(streams.get(0x1100), 0x81);
  const vu = units.filter(u => u.pid === 0x1011), au = units.filter(u => u.pid === 0x1100);
  assert.equal(vu.length, 96); assert.equal(au.length, 125);
  assert.equal(vu[0].dts, CLIP_PTS_BASE_90K - 3754); assert.equal(vu[0].pts, CLIP_PTS_BASE_90K);
  assert.deepEqual(vu[5].data, v[5].data);
  assert.equal(res.ep.length, 4);
  for (const e of res.ep) {
    const o = e.spn * SP;
    assert.equal(((buf[o + 5] & 0x1f) << 8) | buf[o + 6], 0x1011); assert.ok(buf[o + 5] & 0x40, 'PUSI'); assert.ok(buf[o + 9] & 0x40, 'random access flag');
  }
  assert.equal(res.startPts, CLIP_PTS_BASE_90K); assert.ok(Math.abs((res.endPts - res.startPts) / 90000 - 96 / 23.976) < 0.01);
});

test('CLPI round-trips header, sequence, program streams and EP map', async () => {
  const res = await mux([{ pid: 0x1011, kind: 'video', streamType: 0x1b, units: fakeVideo(240) }], { muxRateBps: 48e6, write: () => {}, timeOffset90k: CLIP_PTS_BASE_90K - 4754 });
  const c = parseClpi(writeClpi({ format: 'BD', mux: res, streams: [{ pid: 0x1011, kind: 'video', video: { codec: 'h264', h: 1080, scan: 'p', fps: 23.976 } }, { pid: 0x1100, kind: 'audio', audio: { codec: 'ac3', channels: 6, lang: 'eng' } }] }));
  assert.equal(c.magic, 'HDMV'); assert.equal(c.version, '0200'); assert.equal(c.fmtId, 'HDMV'); assert.equal(c.packets, res.packets); assert.equal(c.rate, 6e6);
  assert.equal(c.pcrPid, PCR_PID); assert.equal(c.pmtPid, 0x100); assert.deepEqual(c.streams.map(s => [s.pid, s.coding]), [[0x1011, 0x1b], [0x1100, 0x81]]);
  assert.ok(Math.abs(c.startSec - 0.6) < 1e-3);
  assert.equal(c.ep.length, res.ep.length);
  c.ep.forEach((e, i) => { assert.equal(e.spn, res.ep[i].spn); assert.ok(Math.abs(e.pts - res.ep[i].pts) < 512); });
  assert.ok(epTables(res.ep).coarse.length >= 1);
});

test('PG and IG units come out per segment, DTS-ordered', () => {
  const q = quantize(new Uint8ClampedArray(8 * 4 * 4).fill(255), 8, 4);
  const pg = [...fromSup(buildSup([{ startSec: 1, endSec: 2, image: q, x: 0, y: 0 }], { w: 1920, h: 1080, fps: 24 }))];
  assert.equal(pg.length, 8); assert.equal(pg[0].data[0], 0x16); assert.equal(pg[0].pts, 90000);
  const img = { w: 4, h: 4, data: new Uint8ClampedArray(64).fill(200) };
  const ig = [...fromIg(buildIg({ video: { w: 1920, h: 1080, fps: 24 }, popup: false, pages: [{ id: 0, defaultButton: 1, buttons: [{ id: 1, x: 0, y: 0, normal: img, selected: img, activated: img, nav: {}, commands: [H.playPL(1)] }] }] }).stream, 5000)];
  assert.equal(ig[0].data[0], 0x18); assert.ok(ig.every((u, i) => i === 0 || u.dts > ig[i - 1].dts)); assert.ok(ig.every(u => u.dts < u.pts));
});

test('end to end: encode with the bundled ffmpeg, make the disc folder, libbluray opens it', { skip: !haveFf && 'bundled ffmpeg not present', timeout: 600000 }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'plajah-disc-'));
  const src = join(work, 'feature.mp4');
  const gen = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=24000/1001:d=185', '-f', 'lavfi', '-i', 'sine=f=440:d=185:sample_rate=48000', '-ac', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', src]);
  assert.equal(gen.status, 0, gen.stderr?.toString());

  let p = newProject('Smoke Test', 'BD');
  // ffmpeg's libbluray reader ignores playlists under 180 s, so the feature is just over three minutes (720p keeps it quick).
  const f = newTitle('Smoke Test', 185, 'FEATURE');
  f.source = { ...f.source, path: src, durationSec: 185 };
  f.chapters = [{ id: uid('ch'), name: 'One', timeSec: 0 }, { id: uid('ch'), name: 'Two', timeSec: 60 }, { id: uid('ch'), name: 'Three', timeSec: 120 }];
  f.audio = [{ id: uid('a'), lang: 'eng', label: 'Stereo', codec: 'ac3', channels: 2, kbps: 192 }];
  f.subtitles = [{ id: uid('s'), lang: 'eng', label: 'English', srt: '1\n00:00:01,000 --> 00:00:02,500\nHello\n' }];
  p.titles = [f];
  p.video = { ...p.video, w: 1280, h: 720 };
  p = applyTemplate(p, 'marquee');
  p.firstPlay.then = 'PLAY_FEATURE';
  const px = { w: 16, h: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(220) };
  const fsio: ClipIO = {
    async *read(path) { for await (const c of createReadStream(path, { highWaterMark: 1 << 20 })) yield new Uint8Array(c as Buffer); },
    async create(path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, new Uint8Array(0)); return async b => { appendFileSync(path, b); }; },
    async writeFile(path, b) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, b); },
  };
  const native: Native = {
    invoke: async () => ({ success: false }) as any,
    readUrl: x => x,
    runFfmpeg: (args, out) => new Promise((res, rej) => {
      mkdirSync(dirname(out), { recursive: true });
      const fast = args.map(a => (a === 'slow' || a === 'medium' ? 'ultrafast' : a));
      const pr = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...fast], { cwd: work });
      let err = ''; pr.stderr.on('data', d => { err += d; });
      pr.on('close', code => (code === 0 ? res() : rej(new Error(err.slice(-800)))));
    }),
  };
  const root = join(work, 'out').replace(/\//g, '\\');
  const raster = { buttons: () => ({ normal: px, selected: px, activated: px }), panel: () => undefined, cues: () => [{ startSec: 1, endSec: 2.5, image: quantize(px.data, 16, 16), x: 900, y: 900 }] };
  const r = await makeDisc(p, native, { io: fsio, root, until: 'folder', raster, onStep: () => {} });
  const disc = r.folder.replace(/\\/g, '/');
  for (const f2 of ['BDMV/index.bdmv', 'BDMV/MovieObject.bdmv', 'BDMV/PLAYLIST/00001.mpls', 'BDMV/CLIPINF/00001.clpi', 'BDMV/STREAM/00001.m2ts', 'BDMV/STREAM/00900.m2ts']) assert.ok(existsSync(join(disc, f2)), f2);
  for (const s of readdirSync(join(disc, 'BDMV/STREAM'))) assert.equal(statSync(join(disc, 'BDMV/STREAM', s)).size % 6144, 0, `${s} aligned`);

  const probe = spawnSync(ffprobe, ['-hide_banner', '-v', 'error', '-playlist', '1', '-show_entries', 'format=duration:stream=codec_name,codec_type,width,height', '-of', 'json', `bluray:${disc}`]);
  assert.equal(probe.status, 0, `libbluray could not open the disc: ${probe.stderr}`);
  const j = JSON.parse(probe.stdout.toString());
  const types = j.streams.map((s: any) => s.codec_name);
  assert.ok(types.includes('h264'), JSON.stringify(j.streams)); assert.ok(types.includes('ac3'), JSON.stringify(j.streams));
  assert.ok(types.includes('hdmv_pgs_subtitle'), JSON.stringify(j.streams));
  const v = j.streams.find((s: any) => s.codec_name === 'h264'); assert.equal(v.width, 1280); assert.equal(v.height, 720);
  assert.ok(Math.abs(parseFloat(j.format.duration) - 185) < 1.5, `duration ${j.format.duration}`);
  const clpi = parseClpi(new Uint8Array(readFileSync(join(disc, 'BDMV/CLIPINF/00001.clpi'))));
  assert.ok(clpi.ep.length >= 180, `ep entries ${clpi.ep.length}`);
  console.log(`  disc at ${disc} · ${clpi.ep.length} EP entries · ${(statSync(join(disc, 'BDMV/STREAM/00001.m2ts')).size / 1e6).toFixed(1)} MB feature clip`);
});

test('menu clip carries video + IG; UHD HEVC HDR10 clip keeps Main10/PQ through our mux', { skip: !haveFf && 'bundled ffmpeg not present', timeout: 300000 }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'plajah-uhd-'));
  const { muxClip } = await import('../services/disc/clipMux');
  const { uhdVideoArgs } = await import('../services/disc/encode');
  const p = newProject('HDR', 'UHD'); p.video = { ...p.video, w: 1920, h: 1080 };
  const t = newTitle('HDR', 2, 'FEATURE'); t.chapters = [{ id: 'c', name: 'c', timeSec: 0 }];
  const vts = join(work, 'v.ts');
  const args = uhdVideoArgs(p, t, 8000, 'IN', vts).map(a => (a === 'slow' ? 'ultrafast' : a));
  const i = args.indexOf('-i'); args.splice(i, 2, '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=24000/1001:d=2');
  const enc = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args]);
  assert.equal(enc.status, 0, enc.stderr?.toString());
  const img = { w: 8, h: 8, data: new Uint8ClampedArray(256).fill(255) };
  const ig = buildIg({ video: { w: 1920, h: 1080, fps: 23.976 }, popup: false, pages: [{ id: 0, defaultButton: 1, buttons: [{ id: 1, x: 10, y: 10, normal: img, selected: img, activated: img, nav: {}, commands: [H.playPL(1)] }] }] }).stream;
  const io: ClipIO = {
    async *read(path) { for await (const c of createReadStream(path)) yield new Uint8Array(c as Buffer); },
    async create(path) { writeFileSync(path, new Uint8Array(0)); return async b => { appendFileSync(path, b); }; },
    async writeFile(path, b) { writeFileSync(path, b); },
  };
  const out = join(work, '00001.m2ts');
  const res = await muxClip({ format: 'UHD', muxRateBps: 82e6, video: { path: vts, codec: 'hevc', h: 1080, scan: 'p', fps: 23.976, dynamic: 'HDR10' }, audio: [], pg: [], ig: { stream: ig, lang: 'eng' }, m2tsPath: out, clpiPath: join(work, '00001.clpi') }, io);
  assert.equal(res.underruns, 0);
  const probe = spawnSync(ffprobe, ['-hide_banner', '-v', 'error', '-show_entries', 'stream=codec_name,profile,pix_fmt,color_transfer,color_primaries:stream_side_data', '-of', 'json', out]);
  assert.equal(probe.status, 0, probe.stderr?.toString());
  const s = JSON.parse(probe.stdout.toString()).streams;
  const v = s.find((x: any) => x.codec_name === 'hevc');
  assert.ok(v, JSON.stringify(s)); assert.equal(v.profile, 'Main 10'); assert.equal(v.color_transfer, 'smpte2084'); assert.equal(v.color_primaries, 'bt2020');
  assert.ok(s.length >= 2, `IG stream present: ${JSON.stringify(s)}`);
  const c = parseClpi(new Uint8Array(readFileSync(join(work, '00001.clpi'))));
  assert.equal(c.version, '0300'); assert.deepEqual(c.streams.map(x => x.coding), [0x24, 0x91]);
});

test('menu clip bakes Tela art + moving light layer + flicker + grain through ffmpeg', { skip: !haveFf && 'bundled ffmpeg not present', timeout: 300000 }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'plajah-menu-'));
  const { menuBackgroundArgs } = await import('../services/disc/encode');
  const art = join(work, 'art.png'), glowPng = join(work, 'glow.png');
  for (const [file, src] of [[art, 'color=c=0xD4AF37@0.6:s=400x60'], [glowPng, 'color=c=white@0.3:s=300x300']] as const) {
    const g = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', src, '-frames:v', '1', '-pix_fmt', 'rgba', file]);
    assert.equal(g.status, 0, g.stderr?.toString());
  }
  const p = newProject('Menu', 'BD'); p.video = { ...p.video, w: 1280, h: 720 };
  const out = join(work, 'menu.ts');
  const args = menuBackgroundArgs(p, { kind: 'color', value: '#14161B' }, undefined, out, {
    artPng: art, layers: [{ png: glowPng, w: 300, h: 300, from: [100, 100], to: [900, 300], periodSec: 6, ease: 'sine', opacity: 0.8 }], flicker: { amount: 0.06, hz: 1.3 }, grain: 8,
  }).map(a => (a === 'medium' ? 'ultrafast' : a));
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args]);
  assert.equal(r.status, 0, r.stderr?.toString());
  const probe = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', out]);
  const j = JSON.parse(probe.stdout.toString());
  assert.equal(j.streams[0].codec_name, 'h264'); assert.equal(j.streams[0].width, 1280);
  assert.ok(parseFloat(j.format.duration) >= 11.5, `a still menu with motion becomes a ≥12 s loop: ${j.format.duration}`);
});

test('timeline master: 24-bit WAV mix (ffprobe-valid), bitrate fallback, sink streaming', { timeout: 120000 }, async () => {
  const { wavHeader, pcm24, writeWav, renderTimelineMaster, masterBitrates } = await import('../services/disc/timelineMaster');
  assert.equal(wavHeader(2, 48000, 100).length, 44);
  const sine = (n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 10) * 0.5);
  const buf = { numberOfChannels: 2, sampleRate: 48000, length: 48000 * 3, getChannelData: () => sine(48000 * 3) };
  assert.equal(pcm24(buf, 0, 10).length, 10 * 2 * 3);
  const work = mkdtempSync(join(tmpdir(), 'plajah-master-'));
  const files = new Map<string, Buffer[]>();
  const io: ClipIO = {
    async *read() {}, async writeFile() {},
    async create(path) { const parts: Buffer[] = []; files.set(path, parts); return async b => { parts.push(Buffer.from(b)); }; },
  };
  await writeWav(buf, join(work, 'mix.wav'), io);
  writeFileSync(join(work, 'mix.wav'), Buffer.concat(files.get(join(work, 'mix.wav'))!));
  if (haveFf) {
    const pr = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,bits_per_sample:format=duration', '-of', 'json', join(work, 'mix.wav')]);
    const j = JSON.parse(pr.stdout.toString());
    assert.equal(j.streams[0].codec_name, 'pcm_s24le'); assert.equal(j.streams[0].sample_rate, '48000'); assert.equal(j.streams[0].channels, 2);
    assert.ok(Math.abs(parseFloat(j.format.duration) - 3) < 0.01);
  }
  // Renderer refuses the top bitrate, accepts the next; streams through the sink; mix written once.
  const tried: number[] = [];
  const out = await renderTimelineMaster({
    job: { clips: [1], format: { fps: 24 } }, io, dir: work, name: 'Night Train', video: { w: 1920, h: 1080 },
    render: async (o: any) => { tried.push(o.bitrate); await o.onAudio(buf); if (tried.length === 1) return null; assert.equal(o.quality, true); assert.equal(o.format.w, 1920); await o.sink(new Uint8Array(4096)); return new Blob([]); },
  });
  assert.deepEqual(tried, masterBitrates(1920, 1080).slice(0, 2));
  assert.match(out.video, /Night_Train_master_35M\.mp4$/); assert.match(out.audio!, /Night_Train_mix\.wav$/);
  assert.equal(Buffer.concat(files.get(out.video)!).length, 4096);
});

test('makeDisc renders cut-sourced titles first and feeds master + mix to the encodes', { timeout: 60000 }, async () => {
  let p = newProject('Cut', 'BD');
  const t = newTitle('Cut', 200, 'FEATURE'); t.source = { ...t.source, assetId: 'timeline_x', fabula: true };
  t.audio = [{ id: 'a', lang: 'eng', label: 'Stereo', codec: 'lpcm', channels: 2, kbps: 2304 }];
  p.titles = [t]; p = applyTemplate(p, 'feature');
  const calls: string[][] = []; const steps: string[] = [];
  const px = { w: 4, h: 4, data: new Uint8ClampedArray(64).fill(200) };
  const err = await makeDisc(p, { invoke: async () => ({}) as any, readUrl: x => x, runFfmpeg: async (args) => { calls.push(args); throw new Error('stop after first encode'); } }, {
    root: 'C:/out', until: 'folder', raster: { buttons: () => ({ normal: px, selected: px, activated: px }) }, onStep: s => steps.push(s.step),
    io: { async *read() {}, async create() { return async () => {}; }, async writeFile() {} },
    renderTitle: async (title, dir) => ({ video: `${dir}/${title.name}_master.mp4`, audio: `${dir}/${title.name}_mix.wav` }),
  }).catch(e => e);
  assert.match(String(err), /stop after first encode/);
  assert.ok(steps.includes('render'));
  assert.ok(calls[0].join(' ').includes('masters/Cut_master.mp4'), calls[0].join(' '));
  assert.equal(p.titles[0].source.path, undefined, 'the authored project is not mutated');
});
