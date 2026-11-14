import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FRAME_RATES, frameToTc, rateById, tcToFrame, readCaptions, writeCaptions, verifyBroadcast, qcCaptions, parseMcc, parseScc,
  writeMcc, writeScc, retimeCues, frameToSec, secToFrame, normalizeForCompare, type CaptionCue,
} from '../services/crossover/captions';
import { compressHex, expandHex } from '../services/crossover/captions/mcc';
import { decode608, withParity } from '../services/crossover/captions/cea608';

const cue = (startSec: number, endSec: number, text: string, id = `c${startSec}`): CaptionCue => ({ id, startSec, endSec, text });
const SAMPLE: CaptionCue[] = [
  cue(2, 4.5, 'Welcome back to the program.'),
  cue(5, 8, "This is the second caption,\nand it's on two rows."),
  cue(8, 10.25, 'Accents: café, señor, Ñandú ♪'),
  cue(12.5, 15, 'Quotes “like this” and an em—dash.'),
  cue(16, 18, '<i>Spoken off camera.</i>'),
  cue(3600.5, 3603, 'And an hour later, still on the frame.'),
];

test('drop-frame timecode skips the right numbers and round-trips', () => {
  const df = rateById('29.97df');
  assert.equal(frameToTc(0, df), '00:00:00;00');
  assert.equal(frameToTc(1799, df), '00:00:59;29');
  assert.equal(frameToTc(1800, df), '00:01:00;02');
  assert.equal(frameToTc(17982, df), '00:10:00;00');
  assert.equal(frameToTc(107892, df), '01:00:00;00');
  for (const r of FRAME_RATES) {
    for (const f of [0, 1, 59, 1799, 1800, 17981, 17982, 107892, 215999]) {
      assert.equal(tcToFrame(frameToTc(f, r), r), f, `${r.id} frame ${f}`);
    }
  }
});

test('drop-frame stays on the clock over an hour; non-drop does not', () => {
  const df = rateById('29.97df');
  assert.ok(Math.abs(frameToSec(tcToFrame('01:00:00;00', df)!, df) - 3600) < 0.01);
  const ndf = rateById('29.97ndf');
  assert.ok(Math.abs(frameToSec(tcToFrame('01:00:00:00', ndf)!, ndf) - 3603.6) < 0.01);
});

test('MCC hex compression round-trips every alias', () => {
  const fa = [0xfa, 0, 0];
  const bytes = [0x61, 1, 0x49, 0x96, 0x69, ...fa, ...fa, ...fa, ...fa, ...fa, ...fa, ...fa, ...fa, ...fa, ...fa, 0xfc, 0x80, 0x80, 0xfd, 0x80, 0x80, 0xfb, 0x80, 0x80, 0, 0x12, 0xab];
  const s = compressHex(bytes);
  assert.ok(s.startsWith('T49S'));
  assert.ok(s.includes('OG'));
  assert.deepEqual(expandHex(s), bytes);
  assert.deepEqual(expandHex('U'), [0xe1, 0, 0, 0]);
});

for (const rateId of ['29.97df', '29.97ndf', '23.976', '24', '25', '30', '50', '59.94df', '60']) {
  test(`MCC at ${rateId} reads back: both layers, every word, within a frame`, () => {
    const w = writeCaptions(SAMPLE, 'mcc', { rateId, durationSec: 3610 });
    const report = verifyBroadcast(w, 'mcc');
    for (const l of report.layers) {
      assert.deepEqual(l.checks.filter(c => !c.textMatch).map(c => [c.expected, c.actual]), [], l.layer);
      assert.equal(l.missing, 0, l.layer);
      assert.equal(l.extra, 0, l.layer);
      assert.ok(l.worstStartFrames <= 1, `${l.layer} start off by ${l.worstStartFrames} frames`);
      assert.ok(l.worstEndFrames <= 1, `${l.layer} end off by ${l.worstEndFrames} frames`);
    }
    assert.equal(report.diagnostics!.badAncChecksums, 0);
    assert.equal(report.diagnostics!.badCdpChecksums, 0);
    assert.equal(report.diagnostics!.sequenceBreaks, 0);
    assert.equal(report.diagnostics!.timecodeGaps, 0);
    assert.equal(report.rateId, rateId);
    assert.ok(report.pass);
  });
}

test('MCC structure: header, DID/SDID, CDP length, one packet per frame', () => {
  const w = writeMcc(SAMPLE.slice(0, 2), { rateId: '29.97df', now: new Date(2026, 10, 1, 9, 5, 7), uuid: 'ABC' });
  const lines = w.text.split('\n');
  assert.equal(lines[0], 'File Format=MacCaption_MCC V1.0');
  assert.ok(lines.includes('Time Code Rate=30DF'));
  assert.ok(lines.includes('UUID=ABC'));
  assert.ok(lines.includes('Creation Date=Sunday, November 1, 2026'));
  const data = lines.filter(l => /^\d\d:/.test(l));
  assert.equal(data.length, w.frames);
  const first = expandHex(data[0].split('\t')[1])!;
  assert.deepEqual(first.slice(0, 2), [0x61, 0x01]);
  assert.equal(first[2], 0x49); // 7 header + 2 + 20*3 + 4 at 29.97
  assert.equal(first.length, 3 + 0x49 + 1);
  assert.equal(data[0].split('\t')[0], '00:00:00:00');
});

test('a start timecode offsets the file and read-back removes it', () => {
  const w = writeCaptions(SAMPLE.slice(0, 3), 'mcc', { rateId: '29.97df', startTc: '01:00:00;00' });
  assert.ok(/\n01:00:00:00\t/.test(w.text));
  const report = verifyBroadcast(w, 'mcc', { startTc: '01:00:00;00' });
  assert.ok(report.pass, JSON.stringify(report.layers.map(l => [l.layer, l.worstStartFrames, l.missing, l.extra])));
});

test('SCC reads back within a frame, in both drop modes', () => {
  for (const rateId of ['29.97df', '29.97ndf']) {
    const w = writeCaptions(SAMPLE, 'scc', { rateId });
    assert.ok(w.text.startsWith('Scenarist_SCC V1.0\n\n'));
    const report = verifyBroadcast(w, 'scc');
    assert.ok(report.pass, JSON.stringify(report.layers[0].checks.filter(c => !c.textMatch || Math.abs(c.startDeltaFrames ?? 9) > 1)));
  }
});

test('SCC words have odd parity on every byte', () => {
  const { text } = writeScc(SAMPLE);
  const words = text.split('\n').filter(l => /^\d\d:/.test(l)).flatMap(l => l.split('\t')[1].split(' '));
  assert.ok(words.length > 50);
  for (const w of words) {
    for (const h of [w.slice(0, 2), w.slice(2)]) {
      let ones = 0;
      for (let v = parseInt(h, 16); v; v >>= 1) ones += v & 1;
      assert.equal(ones % 2, 1, `${w} is not odd parity`);
    }
  }
});

test('a known hand-written SCC decodes correctly', () => {
  // "HELLO" pop-on at row 15, shown at 1 s (frame 30 is 00:00:01;00 at 29.97).
  const doc = parseScc(`Scenarist_SCC V1.0

00:00:00;20	94ae 94ae 9420 9420 9470 9470 c845 4c4c 4f80

00:00:01;00	942f 942f

00:00:03;00	942c 942c
`);
  assert.equal(doc.cues.length, 1);
  assert.equal(doc.cues[0].text, 'HELLO');
  assert.ok(Math.abs(doc.cues[0].startSec - 1.001) < 0.04);
  assert.ok(Math.abs(doc.cues[0].endSec - 3.003) < 0.04);
});

test('roll-up SCC comes back as lines', () => {
  const pair = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i += 2) out.push(((withParity(s.charCodeAt(i)) << 8) | withParity(s.charCodeAt(i + 1) || 0)).toString(16).padStart(4, '0'));
    return out.join(' ');
  };
  const doc = parseScc(`Scenarist_SCC V1.0

00:00:01;00	9425 9425 94ad 94ad 9470 9470 ${pair('LINE ONE')}

00:00:03;00	94ad 94ad 9470 9470 ${pair('LINE TWO')}

00:00:05;00	942c 942c
`);
  assert.deepEqual(doc.cues.map(c => c.text), ['LINE ONE', 'LINE TWO']);
});

test('text that can not load in time is reported late, not silently shifted', () => {
  const long = 'A caption with plenty of words in it to fill two rows up here';
  const w = writeCaptions([cue(1, 1.2, long, 'a'), cue(1.25, 3, long, 'b')], 'mcc', { rateId: '29.97df' });
  assert.ok(w.late!.some(l => l.id === 'b' || l.id === 'a'));
  const report = verifyBroadcast(w, 'mcc');
  assert.ok(report.late.length > 0);
});

test('long cues split to the row limit and keep every word', () => {
  const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two';
  const w = writeCaptions([cue(1, 11, text)], 'scc', { maxRows: 2 });
  assert.ok(w.encodedCues!.length > 1);
  const back = parseScc(w.text);
  assert.equal(back.cues.map(c => c.text).join(' ').replace(/\s+/g, ' '), text);
});

test('text sidecars round-trip: SRT, VTT, TTML, SBV, ASS', () => {
  for (const fmt of ['srt', 'vtt', 'ttml', 'sbv', 'ass'] as const) {
    const w = writeCaptions(SAMPLE, fmt);
    const name = `x.${w.ext}`;
    const doc = readCaptions(name, w.text);
    assert.equal(doc.cues.length, SAMPLE.length, fmt);
    doc.cues.forEach((c, i) => {
      assert.ok(Math.abs(c.startSec - SAMPLE[i].startSec) < 0.011, `${fmt} start ${i}`);
      assert.ok(Math.abs(c.endSec - SAMPLE[i].endSec) < 0.011, `${fmt} end ${i}`);
      const want = fmt === 'sbv' ? SAMPLE[i].text.replace(/<[^>]+>/g, '') : SAMPLE[i].text;
      assert.equal(c.text, want, fmt);
    });
  }
});

test('reading a real-shaped SRT: BOM, CRLF, tags', () => {
  const doc = readCaptions('x.srt', '\ufeff1\r\n00:00:01,000 --> 00:00:02,500\r\n<font color="red">Hello</font> <i>there</i>\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\n');
  assert.equal(doc.cues.length, 2);
  assert.equal(doc.cues[0].text, 'Hello <i>there</i>');
  assert.equal(doc.cues[1].startSec, 3);
});

test('format is detected from content, not just the name', () => {
  const { text } = writeMcc(SAMPLE.slice(0, 1));
  assert.equal(readCaptions('whatever.txt', text).sourceFormat, 'mcc');
  assert.throws(() => readCaptions('nonsense.bin', 'not captions'));
});

test('tampering with an MCC is caught', () => {
  const { text } = writeMcc(SAMPLE.slice(0, 1));
  const lines = text.split('\n');
  const i = lines.findIndex(l => l.startsWith('00:00:00:10'));
  lines[i] = lines[i].replace(/.$/, c => (c === '0' ? '1' : '0'));
  const doc = parseMcc(lines.join('\n'));
  assert.ok(doc.diagnostics.badAncChecksums + doc.diagnostics.badCdpChecksums > 0);
});

test('QC flags overlaps, reading speed and duration', () => {
  const issues = qcCaptions([
    cue(0, 3, 'first', 'a'),
    cue(2, 2.2, 'This is far too much text for only a fifth of a second', 'b'),
    cue(100, 120, 'long', 'c'),
  ], { videoDurationSec: 50 });
  const kinds = (id: string) => issues.filter(i => i.cueId === id).map(i => i.kind);
  assert.ok(kinds('a').includes('overlap'));
  assert.ok(kinds('b').includes('too-fast'));
  assert.ok(kinds('b').includes('too-short'));
  assert.ok(kinds('c').includes('too-long'));
  assert.ok(kinds('c').includes('past-end'));
});

test('retime slides and scales', () => {
  const [c] = retimeCues([cue(10, 12, 'x')], 0.5, 1001 / 1000);
  assert.ok(Math.abs(c.startSec - 10.51) < 1e-6);
});

test('a three-hour programme with a caption every few seconds writes and reads back', () => {
  const long: CaptionCue[] = [];
  for (let t = 5; t < 3 * 3600; t += 4) long.push(cue(t, t + 3.5, `Caption number ${t}, a line of ordinary length`));
  const w = writeCaptions(long, 'scc');
  const report = verifyBroadcast(w, 'scc');
  assert.ok(report.pass, JSON.stringify({ late: report.late.length, worst: report.layers[0].worstStartFrames, missing: report.layers[0].missing }));
  const mcc = writeCaptions(long.slice(0, 600), 'mcc', { rateId: '29.97df' });
  assert.ok(verifyBroadcast(mcc, 'mcc').pass);
});

test('parity errors are counted', () => {
  const dec = decode608([{ sec: 1, b1: 0x14, b2: 0x20 }]);
  assert.equal(dec.parityErrors, 1);
  assert.ok(secToFrame(1, rateById('25')) === 25);
});

// An independent reader. FFmpeg 8 has its own MCC demuxer and 608 decoder; point PLAJAH_FFMPEG at one.
const independent = process.env.PLAJAH_FFMPEG;
test('FFmpeg reads our MCC and SCC with the same words and times', { skip: !independent && 'set PLAJAH_FFMPEG to an FFmpeg 8 build' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cxcc-'));
  const cues = SAMPLE.slice(0, 2).concat(cue(60.5, 63, 'A minute in, across the drop.'));
  for (const [fmt, rateId, grid] of [['mcc', '29.97df', 1001 / 30000], ['mcc', '25', 1 / 25], ['scc', '29.97df', 1001 / 30000]] as const) {
    const file = join(dir, `${rateId}.${fmt}`);
    writeFileSync(file, writeCaptions(cues, fmt, { rateId, durationSec: 70 }).text);
    const srt = `${file}.srt`;
    const run = spawnSync(independent!, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-map', '0:s:0', '-c:s', 'srt', srt]);
    assert.equal(run.status, 0, String(run.stderr));
    const back = readCaptions('x.srt', readFileSync(srt, 'utf8').replace(/\{\\an\d\}/g, '').replace(/\\h/g, '').replace(/’/g, "'"));
    assert.equal(back.cues.length, cues.length, `${fmt} ${rateId}`);
    back.cues.forEach((c, i) => {
      assert.equal(normalizeForCompare(c.text), normalizeForCompare(cues[i].text));
      assert.ok(Math.abs(c.startSec - cues[i].startSec) <= grid * 1.5, `${fmt} ${rateId} start ${c.startSec} vs ${cues[i].startSec}`);
      assert.ok(Math.abs(c.endSec - cues[i].endSec) <= grid * 2.5, `${fmt} ${rateId} end ${c.endSec} vs ${cues[i].endSec}`);
    });
  }
});
