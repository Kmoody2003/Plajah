import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import type { Recipe } from '../services/crossover/types';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RECIPE_PRESETS, audioCodecsFor, containersFor, extFor, videoCodecsFor } from '../services/crossover/formats';
import { buildFfmpegArgs, videoEncoder } from '../services/crossover/engine';
import { planWindows, shapeCues } from '../services/crossover/generateCaptions';
import { shapeFfprobe, friendlyFfmpegError } from '../services/crossover/nativeEngine';
import { acceptHandoff, clipsToCues, cuesToClipFields, normalizeHandoff, takeHandoffs } from '../services/crossover/handoff';

const base: Recipe = { containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac', hwAccel: 'none', qualityMode: 'crf', crf: 20 };

test('RAW codecs are never offered as outputs, and webm only holds its own codecs', () => {
  for (const c of containersFor('video')) {
    assert.ok(!videoCodecsFor(c.id).some(v => v.encoder === '(sdk)'), c.id);
  }
  assert.ok(!containersFor('video').some(c => c.id === 'crm'));
  assert.deepEqual(videoCodecsFor('webm').map(c => c.id).sort(), ['av1', 'vp9']);
  assert.deepEqual(audioCodecsFor('webm').map(c => c.id), ['opus', 'vorbis']);
});

test('auto picks a GPU encoder only if ffmpeg reports it', () => {
  const r = { ...base, hwAccel: 'auto' as const };
  assert.equal(videoEncoder(r, ['libx264', 'h264_nvenc']), 'h264_nvenc');
  assert.equal(videoEncoder(r, ['libx264']), 'libx264');
});

test('NVENC gets -cq, not the -crf it would reject', () => {
  const args = buildFfmpegArgs('in.mov', { ...base, hwAccel: 'nvenc' }, 'o.mp4', 'video');
  assert.ok(args.includes('-cq'));
  assert.ok(!args.includes('-crf'));
});

test('an audio target from a video source drops the picture', () => {
  const args = buildFfmpegArgs('in.mov', { ...base, containerId: 'wav', audioCodecId: 'pcm_s24le' }, 'o.wav', 'video');
  assert.ok(args.includes('-vn'));
  assert.ok(!args.includes('-c:v'));
});

test('windows end near the limit and cover every sample', () => {
  const pcm = new Float32Array(16000 * 100).fill(0.2);
  pcm.fill(0, 16000 * 25, 16000 * 25 + 4000); // a quiet quarter second at 25 s
  const w = planWindows(pcm);
  assert.equal(w[0].start, 0);
  assert.ok(Math.abs(w[0].end / 16000 - 25.1) < 0.2, `cut at ${w[0].end / 16000}`);
  for (let i = 1; i < w.length; i++) assert.equal(w[i].start, w[i - 1].end);
  assert.equal(w[w.length - 1].end, pcm.length);
});

test('transcript segments become readable captions that fit the screen', () => {
  const long = 'This is a long sentence, and it goes on for quite a while. Then there is another sentence right after it that also needs to fit on screen somehow.';
  const cues = shapeCues([{ text: long, start: 10, end: 20 }, { text: '[Music]', start: 20, end: 25 }, { text: 'Hi.', start: 30, end: 30.2 }]);
  assert.ok(cues.length >= 3);
  for (const c of cues) {
    const lines = c.text.split('\n');
    assert.ok(lines.length <= 2, c.text);
    assert.ok(lines.every(l => l.length <= 32), c.text);
  }
  assert.equal(cues.map(c => c.text.replace(/\n/g, ' ')).slice(0, -1).join(' '), long);
  assert.ok(!cues.some(c => /Music/.test(c.text)));
  const last = cues[cues.length - 1];
  assert.equal(last.text, 'Hi.');
  assert.ok(last.endSec - last.startSec >= 1);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].startSec >= cues[i - 1].endSec - 1e-6);
});

test('handoffs: each sender shape arrives, waits for its view, and is collected once', () => {
  assert.deepEqual(normalizeHandoff({ file: { name: 'a.mov', fullPath: 'C:\\a.mov', url: 'u', size: 5 } }), { name: 'a.mov', path: 'C:\\a.mov', url: 'u', sizeBytes: 5, cues: undefined, timelineOffsetSec: undefined });
  assert.equal(normalizeHandoff(null), null);
  acceptHandoff('fabula', { name: 'x.mp4', url: 'u' });
  assert.equal(takeHandoffs('fabula').length, 1);
  assert.equal(takeHandoffs('fabula').length, 0);
});

test('captions survive the trip through Fabula subtitle clips', () => {
  const cues = [{ id: 'a', startSec: 1, endSec: 3, text: 'One' }, { id: 'b', startSec: 4, endSec: 5.5, text: 'Two' }];
  const fields = cuesToClipFields(cues, 10);
  assert.deepEqual(fields[0], { start: 11, duration: 2, text: 'One', label: 'Subtitle' });
  const back = clipsToCues([...fields.map(f => ({ ...f, kind: 'subtitle' })), { kind: 'title', start: 0, duration: 1, text: 'not a caption' }]);
  assert.deepEqual(back.map(c => [c.startSec, c.endSec, c.text]), [[11, 13, 'One'], [14, 15.5, 'Two']]);
});

test('ffprobe output shapes into streams and warnings', () => {
  const p = shapeFfprobe({
    format: { format_name: 'mov,mp4', format_long_name: 'QuickTime / MOV', duration: '12.5', bit_rate: '5000000' },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'prores', width: 1920, height: 1080, avg_frame_rate: '30000/1001', field_order: 'tt', tags: { timecode: '01:00:00;00' } },
      { index: 1, codec_type: 'audio', codec_name: 'pcm_s24le', sample_rate: '48000', channels: 2 },
    ],
  }, '', 'x.mov');
  assert.equal(p.container, 'mov');
  assert.ok(Math.abs(p.fps! - 29.97) < 0.01);
  assert.equal(p.streams!.length, 2);
  assert.equal(p.streams![0].timecode, '01:00:00;00');
  assert.ok(p.warnings.some(w => /Interlaced/.test(w)));
  assert.equal(shapeFfprobe({}, 'moov atom not found', 'x.mp4').needsFinalize, true);
});

test('the ffmpeg error shown is the line that names the problem', () => {
  assert.match(friendlyFfmpegError('frame= 1\nUnknown encoder \'h264_foo\'\nConversion failed!'), /Unknown encoder/);
});

// Real encodes. Every preset, and a broad matrix, through an actual ffmpeg, then read back by ffprobe.
const ffmpeg = process.env.PLAJAH_FFMPEG;
test('every recipe runs through real ffmpeg and comes out playable', { skip: !ffmpeg && 'set PLAJAH_FFMPEG', timeout: 600000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cxrec-'));
  const src = join(dir, 'src.mov');
  const make = spawnSync(ffmpeg!, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=d=1:s=640x360:r=30000/1001', '-f', 'lavfi', '-i', 'sine=d=1:f=440:r=48000', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src].filter(Boolean));
  if (make.status !== 0) {
    // Some builds have no libx264 at all; fall back to what's always there.
    const again = spawnSync(ffmpeg!, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=d=1:s=640x360:r=30000/1001', '-f', 'lavfi', '-i', 'sine=d=1:f=440:r=48000', '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', '-shortest', src]);
    assert.equal(again.status, 0, String(again.stderr));
  }
  const encoders = String(spawnSync(ffmpeg!, ['-hide_banner', '-encoders']).stdout);
  const has = (e: string) => new RegExp(`\\s${e}\\s`).test(encoders);
  const ffprobe = join(dirname(ffmpeg!), 'ffprobe.exe');

  const recipes: { name: string; r: Recipe }[] = RECIPE_PRESETS.map(p => ({ name: p.id, r: { ...base, ...p.recipe } as Recipe }));
  for (const c of containersFor('video')) {
    if (c.id === 'gif') { recipes.push({ name: 'gif', r: { ...base, containerId: 'gif' } }); continue; }
    const a0 = audioCodecsFor(c.id)[0];
    for (const v of videoCodecsFor(c.id)) if (a0) recipes.push({ name: `${c.id}/${v.id}/${a0.id}`, r: { ...base, containerId: c.id, videoCodecId: v.id, audioCodecId: a0.id } });
    const v0 = videoCodecsFor(c.id)[0];
    for (const a of audioCodecsFor(c.id).slice(1)) if (v0) recipes.push({ name: `${c.id}/${v0.id}/${a.id}`, r: { ...base, containerId: c.id, videoCodecId: v0.id, audioCodecId: a.id } });
  }
  for (const p of ['dnxhr_lb', 'dnxhr_sq', 'dnxhr_hq', 'dnxhr_hqx', 'dnxhr_444']) recipes.push({ name: p, r: { ...base, containerId: 'mov', videoCodecId: 'dnxhr', audioCodecId: 'pcm_s24le', dnxProfile: p } });
  for (const p of ['0', '1', '2', '3', '4']) recipes.push({ name: `prores${p}`, r: { ...base, containerId: 'mov', videoCodecId: 'prores', audioCodecId: 'pcm_s24le', proresProfile: p } });
  console.log(`  ${recipes.length} recipes`);
  const failures: string[] = [];
  const skipped: string[] = [];
  for (const { name, r } of recipes) {
    const out = join(dir, `${name.replace(/\W+/g, '_')}.${extFor(r, 'video')}`);
    const list = encoders.split('\n').map(l => l.trim().split(/\s+/)[1]).filter(Boolean);
    const args = buildFfmpegArgs(src, { ...r, hwAccel: 'auto' }, out, 'video', list);
    const needs = ['-c:v', '-c:a'].filter(f => args.includes(f)).map(f => args[args.indexOf(f) + 1]);
    const absent = needs.find(e => !has(e));
    if (absent) { skipped.push(`${name} (no ${absent} in this build)`); continue; }
    const run = spawnSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', ...args]);
    if (run.status !== 0 || !existsSync(out) || !statSync(out).size) { failures.push(`${name}: ${String(run.stderr).slice(-200)}`); continue; }
    if (existsSync(ffprobe)) {
      const probed = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]);
      if (probed.status !== 0 || !String(probed.stdout).trim()) failures.push(`${name}: ffprobe found nothing`);
    }
  }
  if (skipped.length) console.log(`  skipped: ${skipped.join('; ')}`);
  assert.deepEqual(failures, []);
});
