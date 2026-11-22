import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeCaptions, readCaptions, readCaptionBytes, verifyBroadcast, qcCaptions, profileById, rateById, parseScc,
  buildEmbedArgs, embedOutputName, filterPath, lang3, type CaptionCue,
} from '../services/crossover/captions/index.ts';

const cue = (id: string, s: number, e: number, text: string, extra: Partial<CaptionCue> = {}): CaptionCue => ({ id, startSec: s, endSec: e, text, ...extra });

test('roll-up writes, reads back on the right frames, and verifies', () => {
  const cues = [
    cue('r1', 2, 4, 'GOOD EVENING, THIS IS THE NEWS', { mode: 'rollup', rollRows: 3 }),
    cue('r2', 4, 6, 'TONIGHT: THE RIVER FESTIVAL', { mode: 'rollup', rollRows: 3 }),
    cue('r3', 6, 9, 'AND THE WEATHER AHEAD', { mode: 'rollup', rollRows: 3 }),
  ];
  const w = writeCaptions(cues, 'scc');
  assert.ok(/94(25|26)|9426/.test(w.text.replace(/\s/g, '')) || w.text.includes('9426'), 'RU3 control code present');
  const doc = parseScc(w.text);
  assert.deepEqual(doc.cues.map((c) => c.text), cues.map((c) => c.text));
  const report = verifyBroadcast(w, 'scc');
  assert.equal(report.pass, true, JSON.stringify(report.layers[0].checks.filter((c) => !c.textMatch || Math.abs(c.startDeltaFrames ?? 99) > 1)));
});

test('paint-on writes and reads back start, end and words', () => {
  const cues = [cue('p1', 1, 3, 'PAINTED LIVE', { mode: 'painton' }), cue('p2', 5, 7, 'SECOND LINE\nTWO ROWS', { mode: 'painton' })];
  const w = writeCaptions(cues, 'scc');
  const report = verifyBroadcast(w, 'scc');
  assert.equal(report.pass, true, JSON.stringify(report.layers));
});

test('mixed pop-on / roll-up / paint-on in one MCC verifies on 608 and 708', () => {
  const cues = [
    cue('a', 1, 3, 'Pop-on first.'),
    cue('b', 4, 6, 'THEN ROLL-UP', { mode: 'rollup', rollRows: 2 }),
    cue('c', 7, 9, 'THEN PAINT-ON', { mode: 'painton' }),
    cue('d', 10, 12, 'And pop-on again.'),
  ];
  const w = writeCaptions(cues, 'mcc', { rateId: '29.97df' });
  const report = verifyBroadcast(w, 'mcc');
  const l608 = report.layers.find((l) => l.layer === 'CEA-608')!;
  assert.equal(l608.pass, true, JSON.stringify(l608.checks));
});

test('CC2 is written on data channel 2 and only read when asked for', () => {
  const cues = [cue('x', 1, 3, 'SEGUNDO CANAL'), cue('y', 4, 6, 'HOLA')];
  const w = writeCaptions(cues, 'scc', { channel: 2 });
  assert.ok(w.text.includes('1c2f') || w.text.includes('1C2F'), 'EOC on channel 2 (0x1C 0x2F)');
  assert.equal(parseScc(w.text).cues.length, 0, 'CC1 reader sees nothing');
  assert.deepEqual(parseScc(w.text, { channel: 2 }).cues.map((c) => c.text), ['SEGUNDO CANAL', 'HOLA']);
  assert.equal(verifyBroadcast(w, 'scc', { channel: 2 }).pass, true);
});

test('alignment, row placement and speaker IDs reach the decoder', () => {
  const cues = [cue('s', 1, 3, 'Where were you?', { speaker: 'Ana', align: 'left', row: 13 })];
  const w = writeCaptions(cues, 'scc');
  const back = parseScc(w.text).cues[0];
  assert.equal(back.text, '>> ANA: Where were you?');
  assert.equal(verifyBroadcast(w, 'scc').pass, true);
});

test('pop-on output is unchanged by the multi-mode encoder', () => {
  const cues = [cue('1', 1, 2.5, 'Hello there.'), cue('2', 3, 5, 'Second caption\non two lines')];
  const a = writeCaptions(cues, 'scc').text;
  const b = writeCaptions(cues.map((c) => ({ ...c, mode: 'popon' as const })), 'scc').text;
  assert.equal(a, b);
});

test('SAMI round-trips text, italics and timing', () => {
  const cues = [cue('1', 1.2, 3.4, 'Hello & welcome'), cue('2', 4, 6, '<i>Whispered</i>\nline two')];
  const w = writeCaptions(cues, 'smi', { title: 'T' });
  const back = readCaptions('x.smi', w.text).cues;
  assert.equal(back.length, 2);
  assert.equal(back[0].text, 'Hello & welcome');
  assert.equal(back[1].text, '<i>Whispered</i>\nline two');
  assert.equal(back[0].startSec, 1.2);
  assert.equal(back[0].endSec, 3.4);
});

test('EBU-STL round-trips accents, italics, alignment, long text and frame timing', () => {
  const long = 'Une phrase très longue qui dépasse cent douze octets pour forcer un bloc d’extension dans le fichier STL, voilà.';
  const cues = [
    cue('1', 1, 3, 'Café, garçon — ¿qué?', { align: 'left' }),
    cue('2', 4, 6.48, '<i>Señor</i>\nÜber alles'),
    cue('3', 7, 10, long),
  ];
  const w = writeCaptions(cues, 'stl', { stl: { fps: 25 }, title: 'Test' });
  assert.ok(w.bytes && w.bytes.length >= 1024 + 4 * 128, 'GSI + TTI blocks incl. an extension');
  assert.equal(String.fromCharCode(...w.bytes!.slice(3, 11)), 'STL25.01');
  const back = readCaptionBytes('x.stl', w.bytes!).cues;
  assert.equal(back.length, 3);
  assert.equal(back[0].text, 'Café, garçon ― ¿qué?');
  assert.equal(back[0].align, 'left');
  assert.equal(back[1].text, '<i>Señor</i>\nÜber alles');
  assert.equal(back[1].endSec, 6.48);
  assert.equal(back[2].text, long.replace('’', '’'));
});

test('EBU-STL at 30 honours a programme start timecode', () => {
  const w = writeCaptions([cue('1', 2, 4, 'Hi')], 'stl', { stl: { fps: 30 }, startTc: '01:00:00:00' });
  const back = readCaptionBytes('x.stl', w.bytes!).cues;
  assert.ok(Math.abs(back[0].startSec - 2) < 0.04);
});

test('caption bytes: UTF-16 and Windows-1252 files read correctly', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nNiño\n';
  const u16 = new Uint8Array([0xff, 0xfe, ...[...srt].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8])]);
  assert.equal(readCaptionBytes('a.srt', u16).cues[0].text, 'Niño');
  const latin = new Uint8Array([...srt].map((ch) => ch.charCodeAt(0)));
  assert.equal(readCaptionBytes('a.srt', latin).cues[0].text, 'Niño');
});

test('profiles drive QC: columns, gaps, frame grid and the 608 character set', () => {
  const rate = rateById('29.97df');
  const p = profileById('netflix');
  const cues = [cue('a', 1, 2, 'x'.repeat(45)), cue('b', 2 + 1 / 30, 3, 'ok'), cue('c', 4.0123, 5, 'ok')];
  const issues = qcCaptions(cues, { ...p, rate });
  assert.ok(issues.some((i) => i.cueId === 'a' && i.kind === 'line-too-long'));
  assert.ok(issues.some((i) => i.cueId === 'a' && i.kind === 'gap-too-small'));
  assert.ok(issues.some((i) => i.cueId === 'c' && i.kind === 'off-frame'));
  const fcc = profileById('cea608');
  assert.ok(qcCaptions([cue('z', 1, 3, 'Emoji 😀 here')], { ...fcc }).some((i) => i.kind === 'unsupported-char'));
  assert.ok(!qcCaptions([cue('z', 1, 3, 'Café ♪ ¿sí?')], { ...fcc }).some((i) => i.kind === 'unsupported-char'));
});

test('embed arguments: stream copy, right subtitle codec, language, burn-in path escaping', () => {
  const base = { videoPath: 'D:\\Media\\show.mov', captionPath: 'C:\\tmp\\c.scc', outputPath: 'D:\\Media\\show.captioned.mov' };
  const mov = buildEmbedArgs({ ...base, target: 'mov-608', lang: 'en' });
  assert.deepEqual(mov.slice(-9), ['-c:v', 'copy', '-c:a', 'copy', '-c:s', 'copy', '-metadata:s:s:0', 'language=eng', 'D:\\Media\\show.captioned.mov']);
  const mp4 = buildEmbedArgs({ ...base, target: 'mp4-text', lang: 'es', defaultOn: true });
  assert.ok(mp4.includes('mov_text') && mp4.includes('language=spa') && mp4.includes('default'));
  const burn = buildEmbedArgs({ ...base, target: 'burn-in' });
  assert.ok(burn.includes("subtitles='C\\:/tmp/c.scc'"));
  assert.ok(burn.includes('libx264'));
  assert.equal(filterPath("C:\\a'b"), "C\\:/a\\'b");
  assert.equal(lang3('fr-CA'), 'fre');
  assert.equal(embedOutputName('D:\\M\\a.mp4', 'mkv-srt'), 'D:\\M\\a.captioned.mkv');
});

test('decoding keeps presentation: roll-up depth and paint-on survive a round trip', () => {
  const cues = [
    cue('r', 1, 3, 'ROLLING', { mode: 'rollup', rollRows: 2 }),
    cue('p', 4, 6, 'PAINTED', { mode: 'painton' }),
    cue('q', 7, 9, 'Popped.'),
  ];
  const back = parseScc(writeCaptions(cues, 'scc').text).cues;
  assert.deepEqual(back.map((c) => [c.text, c.mode ?? 'popon', c.rollRows ?? null]), [['ROLLING', 'rollup', 2], ['PAINTED', 'painton', null], ['Popped.', 'popon', null]]);
});
