import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMpeg2Source, buildConformArgs, buildMpeg2Args, MPEG2_PRESETS, deliverName, parseVideoStreamLine } from '../services/fabula/mpeg2.ts';

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

test('MPEG-2 sources are recognised by extension and MIME', () => {
  for (const n of ['a.mpg', 'b.VOB', 'c.m2v', 'd.ts', 'e.m2ts', 'f.mts', 'g.mxf', 'h.mod', 'i.tod']) assert.ok(isMpeg2Source(n), n);
  assert.ok(isMpeg2Source('x.bin', 'video/mpeg'));
  assert.ok(isMpeg2Source('x', 'video/mp2t'));
  assert.ok(!isMpeg2Source('clip.mp4', 'video/mp4'));
  assert.ok(!isMpeg2Source('song.mp3', 'audio/mpeg'));
});

test('conform keeps frame count (send_frame), squares pixels, encodes H.264 + AAC', () => {
  const a = buildConformArgs('in.vob', 'out.mp4');
  const vf = after(a, '-vf');
  assert.match(vf, /bwdif=mode=send_frame/);
  assert.match(vf, /deint=interlaced/);
  assert.match(vf, /iw\*sar.*setsar=1/);
  assert.equal(after(a, '-c:v'), 'libx264');
  assert.equal(after(a, '-crf'), '16');
  assert.equal(after(a, '-c:a'), 'aac');
  assert.ok(a.includes('+genpts'));
  assert.equal(after(buildConformArgs('i', 'o', { encoder: 'h264_nvenc' }), '-c:v'), 'h264_nvenc');
  assert.equal(after(buildConformArgs('i', 'o', { preset: 'veryfast' }), '-preset'), 'veryfast');
});

test('delivery presets carry their spec', () => {
  const dvd = buildMpeg2Args('m.mp4', 'o.mpg', 'dvd-ntsc', { aspect: '4:3' });
  assert.equal(after(dvd, '-target'), 'ntsc-dvd');
  assert.equal(after(dvd, '-aspect'), '4:3');
  assert.equal(after(dvd, '-c:a'), 'ac3');
  assert.match(after(dvd, '-vf'), /720:480.*setdar=4\/3.*fps=30000\/1001,setfield=tff/);
  assert.equal(after(buildMpeg2Args('m', 'o', 'dvd-pal'), '-target'), 'pal-dvd');

  const ts = buildMpeg2Args('m', 'o.ts', 'ts-hd');
  assert.deepEqual([after(ts, '-f'), after(ts, '-b:v'), after(ts, '-minrate'), after(ts, '-bufsize'), after(ts, '-muxrate'), after(ts, '-qmax')], ['mpegts', '17500000', '17500000', '7995392', '19392658', '28']);
  assert.ok(ts.includes('+ilme+ildct'));

  const xd = buildMpeg2Args('m', 'o.mxf', 'xdcam-hd422', { fps: 25 });
  assert.deepEqual([after(xd, '-pix_fmt'), after(xd, '-b:v'), after(xd, '-g'), after(xd, '-c:a'), after(xd, '-f')], ['yuv422p', '50000000', '12', 'pcm_s24le', 'mxf']);
  assert.match(after(xd, '-vf'), /fps=25,setfield=tff/);
  assert.match(after(buildMpeg2Args('m', 'o', 'xdcam-hd422', { fps: 29.97 }), '-vf'), /fps=30000\/1001/);

  const ps = buildMpeg2Args('m', 'o.mpg', 'ps-master');
  assert.deepEqual([after(ps, '-f'), after(ps, '-c:a'), after(ps, '-qmax')], ['vob', 'mp2', '28']);
  assert.ok(!ps.includes('-vf'), 'PS master keeps the sequence size and rate');
  // non_linear_quant needs qmax <= 28 in ffmpeg; every preset that sets it must cap qmax.
  for (const p of MPEG2_PRESETS) {
    const a = buildMpeg2Args('m', 'o', p.id);
    if (a.includes('-non_linear_quant')) assert.ok(+after(a, '-qmax') <= 28, p.id);
  }
});

test('names and ffmpeg stream-line parsing', () => {
  assert.equal(deliverName('My: Cut', 'xdcam-hd422'), 'My_ Cut.xdcam-hd422.mxf');
  const s = parseVideoStreamLine(['  Stream #0:0[0x1e0]: Video: mpeg2video (Main), yuv420p(tv, top first), 720x480 [SAR 8:9 DAR 4:3], 29.97 fps, 29.97 tbr, 90k tbn']);
  assert.deepEqual(s, { codec: 'mpeg2video', width: 720, height: 480, fps: 29.97, fieldOrder: 'top first', interlaced: true, dar: '4:3' });
});

test('SD deliverables convert to and tag BT.601; HD tags BT.709', () => {
  const dvd = buildMpeg2Args('m', 'o', 'dvd-ntsc');
  assert.match(after(dvd, '-vf'), /out_color_matrix=bt601/);
  assert.equal(after(dvd, '-colorspace'), 'smpte170m');
  assert.equal(after(buildMpeg2Args('m', 'o', 'dvd-pal'), '-colorspace'), 'bt470bg');
  const xd = buildMpeg2Args('m', 'o', 'xdcam-hd422');
  assert.match(after(xd, '-vf'), /out_color_matrix=bt709/);
  assert.equal(after(xd, '-colorspace'), 'bt709');
});

test('HD broadcast specs: rates snap to the spec, fields only at field rates, anamorphic 1440', async () => {
  const { pickRate, isInterlacedAt, mpeg2Preset } = await import('../services/fabula/mpeg2.ts');
  const xd = mpeg2Preset('xdcam-hd422');
  assert.equal(pickRate(xd, 25), '25');
  assert.equal(pickRate(xd, 23.976), '24000/1001');
  assert.equal(pickRate(xd, 60), '30000/1001', 'unsupported rate falls back to the spec default');
  assert.equal(isInterlacedAt(xd, '30000/1001'), true);
  assert.equal(isInterlacedAt(xd, '24000/1001'), false);
  const p23 = buildMpeg2Args('m', 'o', 'xdcam-hd422', { fps: 23.976 });
  assert.equal(after(p23, '-field_order'), 'progressive');
  assert.match(after(p23, '-vf'), /fps=24000\/1001,setfield=prog/);
  const a720 = buildMpeg2Args('m', 'o', 'atsc-720p');
  assert.match(after(a720, '-vf'), /scale=1280:720.*fps=60000\/1001,setfield=prog/);
  const hdv = buildMpeg2Args('m', 'o.m2t', 'hdv-1080i', { fps: 25 });
  assert.match(after(hdv, '-vf'), /scale=1440:1080:flags=lanczos,setsar=4\/3,fps=25,setfield=tff/);
  assert.equal(after(hdv, '-c:a'), 'mp2');
  const x35 = buildMpeg2Args('m', 'o', 'xdcam-hd35');
  assert.equal(after(x35, '-maxrate'), '35000000');
  assert.ok(!x35.includes('-minrate'), 'XDCAM HD 35 is VBR');
  const c422 = buildMpeg2Args('m', 'o', 'contrib-422', { fps: 25 });
  assert.deepEqual([after(c422, '-pix_fmt'), after(c422, '-b:v'), after(c422, '-f')], ['yuv422p', '50000000', 'mpegts']);
  assert.equal(after(buildMpeg2Args('m', 'o', 'dvb-1080i25'), '-c:a'), 'mp2');
});
