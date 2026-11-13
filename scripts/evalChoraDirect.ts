// Chora Direct — Evaluation suite (`scripts/evalChoraDirect.ts`).
//
// Two deterministic modes (zero model downloads, zero GPU jobs):
//   1. Prompt evaluation (default):
//        npx tsx scripts/evalChoraDirect.ts [--fixtures tests/fixtures/directPrompts.json]
//      Compiles all 3 prompts per style pack (plain, lyrics, Chora marks), checks expected
//      `packId`, `tempoRange`, and `form`, and prints a formatted summary table. No audio.
//
//   2. Rendered WAV folder measurement:
//        npx tsx scripts/evalChoraDirect.ts --wav-dir <folder> [--fixtures tests/fixtures/directPrompts.json]
//      Decodes PCM WAV files (`16/24/32-bit PCM` and `32/64-bit IEEE float`), measures tempo,
//      key, and integrated BS.1770 loudness via `services/musicIntel/dsp.ts` (`measureAudio`),
//      and compares each render against its compiled `SongBrief` (`bpm`, `keyName`, `pack.mix.lufs`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureAudio } from '../services/musicIntel/dsp';
import { parseKey } from '../services/melos/beats/songKey';
import { compileSongBrief, type SongBrief } from '../services/melos/direct/songBrief';
import { parseSongPrompt, type SectionKind } from '../services/melos/direct/songPrompt';

export interface DirectPromptFixture {
  id: string;
  packId: string;
  variant: 'plain' | 'lyrics' | 'marks';
  prompt: string;
  expect: {
    packId: string;
    tempoRange: [number, number];
    form: SectionKind[];
  };
}

export interface PromptEvalRow {
  id: string;
  variant: 'plain' | 'lyrics' | 'marks';
  expectedPackId: string;
  actualPackId: string;
  bpm: number;
  tempoRange: [number, number];
  expectedForm: SectionKind[];
  actualForm: SectionKind[];
  keyName: string;
  totalBars: number;
  packOk: boolean;
  tempoOk: boolean;
  formOk: boolean;
  variantOk: boolean;
  ok: boolean;
  reasons: string[];
}

export interface PromptEvalSummary {
  total: number;
  passed: number;
  failed: number;
  packsCovered: number;
  rows: PromptEvalRow[];
}

export interface DecodedWav {
  pcm: Float32Array;
  sampleRate: number;
  channels: 1 | 2;
  durationSec: number;
}

export interface WavEvalRow {
  file: string;
  matchedId: string | null;
  packId: string;
  briefBpm: number;
  tempoRange: [number, number];
  measuredBpm: number;
  tempoConfidence: number;
  tempoDeltaBpm: number;
  tempoWithinRangeOrOctave: boolean;
  briefKey: string;
  measuredKey: string;
  keyConfidence: number;
  keyMatch: 'exact' | 'relative' | 'tonic' | 'mismatch';
  targetLufs: [number, number];
  measuredLufs: number | null;
  lufsDelta: number | null;
  lufsWithinTarget: boolean;
}

export function defaultFixturesPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../tests/fixtures/directPrompts.json');
}

export function loadPromptFixtures(filePath = defaultFixturesPath()): DirectPromptFixture[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of fixtures in ${filePath}`);
  }
  return parsed as DirectPromptFixture[];
}

export function evaluatePromptFixtures(fixtures: DirectPromptFixture[]): PromptEvalSummary {
  const rows: PromptEvalRow[] = [];
  const packs = new Set<string>();

  for (const fx of fixtures) {
    packs.add(fx.expect.packId);
    const parsed = parseSongPrompt(fx.prompt);
    const brief = compileSongBrief(parsed);
    const actualForm = brief.sections.map((s) => s.kind);
    const packOk = brief.pack.id === fx.expect.packId;
    const tempoOk = brief.bpm >= fx.expect.tempoRange[0] && brief.bpm <= fx.expect.tempoRange[1];
    const formOk =
      actualForm.length === fx.expect.form.length &&
      actualForm.every((k, i) => k === fx.expect.form[i]);

    let variantOk = true;
    const reasons: string[] = [];
    if (!packOk) reasons.push(`pack ${brief.pack.id} != ${fx.expect.packId}`);
    if (!tempoOk) reasons.push(`bpm ${brief.bpm} outside [${fx.expect.tempoRange[0]}, ${fx.expect.tempoRange[1]}]`);
    if (!formOk) reasons.push(`form [${actualForm.join(',')}] != [${fx.expect.form.join(',')}]`);

    if (fx.variant === 'lyrics') {
      const hasSungWords = brief.sections.some((s) => s.lines.some((l) => l.words.length > 0));
      if (!hasSungWords || !brief.vocal.present) {
        variantOk = false;
        reasons.push('lyrics variant missing sung words or vocal.present');
      }
    } else if (fx.variant === 'marks') {
      const hasWordMarks = parsed.sections.some((s) =>
        s.lines.some((l) => l.words.some((w) => w.marks.length > 0)),
      );
      const hasChartOrPipe = parsed.sections.some((s) => (s.chart?.length ?? 0) > 0 || s.bars !== undefined || s.dynamic !== undefined);
      if (!hasWordMarks || !hasChartOrPipe) {
        variantOk = false;
        reasons.push('marks variant missing Chora word marks or section directives/chart');
      }
    }

    const ok = packOk && tempoOk && formOk && variantOk;
    rows.push({
      id: fx.id,
      variant: fx.variant,
      expectedPackId: fx.expect.packId,
      actualPackId: brief.pack.id,
      bpm: brief.bpm,
      tempoRange: fx.expect.tempoRange,
      expectedForm: fx.expect.form,
      actualForm,
      keyName: brief.keyName,
      totalBars: brief.totalBars,
      packOk,
      tempoOk,
      formOk,
      variantOk,
      ok,
      reasons,
    });
  }

  const passed = rows.filter((r) => r.ok).length;
  return {
    total: rows.length,
    passed,
    failed: rows.length - passed,
    packsCovered: packs.size,
    rows,
  };
}

const pad = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length));
const padL = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s);

export function formatPromptEvalTable(summary: PromptEvalSummary): string {
  const byPack = new Map<string, PromptEvalRow[]>();
  for (const r of summary.rows) {
    const list = byPack.get(r.expectedPackId) ?? [];
    list.push(r);
    byPack.set(r.expectedPackId, list);
  }

  const lines: string[] = [];
  const header = `${pad('Pack ID', 24)} | ${pad('Plain', 6)} | ${pad('Lyrics', 6)} | ${pad('Marks', 6)} | ${pad('BPM (Range)', 16)} | ${pad('Key', 14)} | ${pad('Default Form', 28)}`;
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const [packId, group] of byPack) {
    const plain = group.find((g) => g.variant === 'plain');
    const lyrics = group.find((g) => g.variant === 'lyrics');
    const marks = group.find((g) => g.variant === 'marks');
    const ref = plain ?? group[0];
    const cell = (r?: PromptEvalRow) => (!r ? '  -   ' : r.ok ? ' PASS ' : ' FAIL ');
    const bpmStr = `${ref.bpm} (${ref.tempoRange[0]}-${ref.tempoRange[1]})`;
    const formStr = ref.actualForm.join('>');
    lines.push(
      `${pad(packId, 24)} | ${cell(plain)} | ${cell(lyrics)} | ${cell(marks)} | ${pad(bpmStr, 16)} | ${pad(ref.keyName, 14)} | ${pad(formStr, 28)}`,
    );
  }

  lines.push('-'.repeat(header.length));
  lines.push(
    `Prompts: ${summary.passed}/${summary.total} passed (${summary.failed} failed) across ${summary.packsCovered} style packs.`,
  );

  if (summary.failed > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const r of summary.rows.filter((x) => !x.ok)) {
      lines.push(`  - ${r.id}: ${r.reasons.join('; ')}`);
    }
  }
  return lines.join('\n');
}

/** Pure TypeScript RIFF/WAVE PCM & IEEE-float decoder (mono or stereo interleaved Float32Array). */
export function decodeWavBuffer(buf: Buffer): DecodedWav {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a valid RIFF/WAVE file.');
  }

  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === 'fmt ' && chunkSize >= 16 && bodyStart + chunkSize <= buf.length) {
      audioFormat = buf.readUInt16LE(bodyStart);
      numChannels = buf.readUInt16LE(bodyStart + 2);
      sampleRate = buf.readUInt32LE(bodyStart + 4);
      bitsPerSample = buf.readUInt16LE(bodyStart + 14);
      // WAVE_FORMAT_EXTENSIBLE (0xFFFE): subformat code sits at byte 24 of fmt body.
      if (audioFormat === 0xfffe && chunkSize >= 40) {
        audioFormat = buf.readUInt16LE(bodyStart + 24);
      }
    } else if (chunkId === 'data') {
      dataOffset = bodyStart;
      dataSize = Math.min(chunkSize, buf.length - bodyStart);
      break;
    }
    offset = bodyStart + chunkSize + (chunkSize & 1);
  }

  if (dataOffset < 0 || numChannels < 1 || sampleRate <= 0 || bitsPerSample <= 0) {
    throw new Error('Incomplete WAV header or missing data chunk.');
  }
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV format tag ${audioFormat} (expected PCM=1 or IEEE_FLOAT=3).`);
  }

  const bytesPerSample = bitsPerSample >> 3;
  const frameStride = bytesPerSample * numChannels;
  const frames = Math.floor(dataSize / frameStride);
  const outChannels: 1 | 2 = numChannels === 1 ? 1 : 2;
  const pcm = new Float32Array(frames * outChannels);

  const readSample = (pos: number): number => {
    if (audioFormat === 3) {
      if (bitsPerSample === 32) return buf.readFloatLE(pos);
      if (bitsPerSample === 64) return buf.readDoubleLE(pos);
      throw new Error(`Unsupported float bit depth ${bitsPerSample}`);
    }
    if (bitsPerSample === 8) return (buf.readUInt8(pos) - 128) / 128;
    if (bitsPerSample === 16) return buf.readInt16LE(pos) / 32768;
    if (bitsPerSample === 24) {
      const b0 = buf[pos];
      const b1 = buf[pos + 1];
      const b2 = buf[pos + 2];
      const val = b0 | (b1 << 8) | (b2 << 16);
      const signed = val & 0x800000 ? val | ~0xffffff : val;
      return signed / 8388608;
    }
    if (bitsPerSample === 32) return buf.readInt32LE(pos) / 2147483648;
    throw new Error(`Unsupported PCM bit depth ${bitsPerSample}`);
  };

  for (let i = 0; i < frames; i++) {
    const base = dataOffset + i * frameStride;
    if (outChannels === 1) {
      pcm[i] = readSample(base);
    } else {
      pcm[i * 2] = readSample(base);
      pcm[i * 2 + 1] = readSample(base + bytesPerSample);
    }
  }

  return {
    pcm,
    sampleRate,
    channels: outChannels,
    durationSec: frames / sampleRate,
  };
}

function compareKeys(briefKeyStr: string, measuredKeyStr: string): WavEvalRow['keyMatch'] {
  const bk = parseKey(briefKeyStr);
  const mk = parseKey(measuredKeyStr);
  if (!bk || !mk) return 'mismatch';
  const bMinor = !['major', 'lydian', 'mixolydian'].includes(bk.scale);
  const mMinor = mk.scale === 'minor';
  if (bk.tonic === mk.tonic && bMinor === mMinor) return 'exact';
  // Relative major/minor share the same pitch collection (e.g. A minor <-> C major).
  const bRelMajor = bMinor ? (bk.tonic + 3) % 12 : bk.tonic;
  const mRelMajor = mMinor ? (mk.tonic + 3) % 12 : mk.tonic;
  if (bRelMajor === mRelMajor) return 'relative';
  if (bk.tonic === mk.tonic) return 'tonic';
  return 'mismatch';
}

function resolveBriefForWav(
  wavPath: string,
  fixtures: DirectPromptFixture[],
): { brief: SongBrief; matchedId: string | null } {
  const stem = path.basename(wavPath, path.extname(wavPath));
  const dir = path.dirname(wavPath);

  // 1. Optional sidecar `<stem>.prompt.txt` next to the WAV.
  const sidecarPrompt = path.join(dir, `${stem}.prompt.txt`);
  if (fs.existsSync(sidecarPrompt)) {
    const text = fs.readFileSync(sidecarPrompt, 'utf8');
    return { brief: compileSongBrief(parseSongPrompt(text)), matchedId: `${stem}.prompt.txt` };
  }

  // 2. Exact fixture id match (`<packId>__plain.wav`, etc.) or `<packId>.wav` -> plain fixture.
  const exact =
    fixtures.find((f) => f.id === stem) ??
    fixtures.find((f) => f.packId === stem && f.variant === 'plain') ??
    fixtures.find((f) => stem.startsWith(f.id)) ??
    fixtures.find((f) => stem.startsWith(f.packId) && f.variant === 'plain');

  if (exact) {
    return { brief: compileSongBrief(parseSongPrompt(exact.prompt)), matchedId: exact.id };
  }

  // 3. Fallback: treat the filename stem (hyphens/underscores -> spaces) as a style prompt.
  const fallbackPrompt = stem.replace(/[_-]+/g, ' ');
  return { brief: compileSongBrief(parseSongPrompt(fallbackPrompt)), matchedId: null };
}

export function evaluateRenderedWavFolder(
  wavDir: string,
  fixtures: DirectPromptFixture[] = loadPromptFixtures(),
): WavEvalRow[] {
  if (!fs.existsSync(wavDir)) {
    throw new Error(`WAV directory does not exist: ${wavDir}`);
  }
  const files = fs
    .readdirSync(wavDir)
    .filter((f) => f.toLowerCase().endsWith('.wav'))
    .sort();

  const rows: WavEvalRow[] = [];
  for (const file of files) {
    const fullPath = path.join(wavDir, file);
    const wav = decodeWavBuffer(fs.readFileSync(fullPath));
    const measured = measureAudio(wav.pcm, wav.sampleRate, wav.channels);
    const { brief, matchedId } = resolveBriefForWav(fullPath, fixtures);

    const mBpm = measured.tempo.bpm;
    const directDelta = Math.round((mBpm - brief.bpm) * 10) / 10;
    const [lo, hi] = brief.pack.tempo;
    const tol = 6;
    const inDirect = mBpm >= lo - tol && mBpm <= hi + tol;
    const inHalf = mBpm * 2 >= lo - tol && mBpm * 2 <= hi + tol;
    const inDouble = mBpm / 2 >= lo - tol && mBpm / 2 <= hi + tol;
    const tempoWithinRangeOrOctave =
      Math.abs(mBpm - brief.bpm) <= tol ||
      Math.abs(mBpm * 2 - brief.bpm) <= tol ||
      Math.abs(mBpm / 2 - brief.bpm) <= tol ||
      inDirect ||
      inHalf ||
      inDouble;

    const [lufsLo, lufsHi] = brief.pack.mix.lufs;
    const mLufs = measured.integratedLufs;
    const lufsMid = (lufsLo + lufsHi) / 2;
    const lufsDelta = mLufs !== null ? Math.round((mLufs - lufsMid) * 10) / 10 : null;
    const lufsWithinTarget = mLufs !== null && mLufs >= lufsLo - 2 && mLufs <= lufsHi + 2;

    rows.push({
      file,
      matchedId,
      packId: brief.pack.id,
      briefBpm: brief.bpm,
      tempoRange: brief.pack.tempo,
      measuredBpm: mBpm,
      tempoConfidence: measured.tempo.confidence,
      tempoDeltaBpm: directDelta,
      tempoWithinRangeOrOctave,
      briefKey: brief.keyName,
      measuredKey: measured.key.key,
      keyConfidence: measured.key.confidence,
      keyMatch: compareKeys(brief.keyName, measured.key.key),
      targetLufs: brief.pack.mix.lufs,
      measuredLufs: mLufs,
      lufsDelta,
      lufsWithinTarget,
    });
  }

  return rows;
}

export function formatWavEvalTable(rows: WavEvalRow[]): string {
  if (!rows.length) return 'No .wav files found in target directory.';
  const lines: string[] = [];
  const header = `${pad('File', 28)} | ${pad('Pack', 20)} | ${pad('Tempo Meas / Brief', 20)} | ${pad('Key Meas / Brief (Match)', 28)} | ${pad('LUFS Meas / Target', 22)}`;
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const r of rows) {
    const tempoCol = `${padL(r.measuredBpm.toFixed(1), 5)} / ${padL(String(r.briefBpm), 3)} BPM`;
    const keyCol = `${r.measuredKey} / ${r.briefKey} (${r.keyMatch})`;
    const lufsMeas = r.measuredLufs !== null ? `${r.measuredLufs.toFixed(1)}` : 'n/a';
    const lufsCol = `${padL(lufsMeas, 6)} / [${r.targetLufs[0]}, ${r.targetLufs[1]}]`;
    lines.push(
      `${pad(r.file, 28)} | ${pad(r.packId, 20)} | ${pad(tempoCol, 20)} | ${pad(keyCol, 28)} | ${pad(lufsCol, 22)}`,
    );
  }
  lines.push('-'.repeat(header.length));
  const tempoHits = rows.filter((r) => r.tempoWithinRangeOrOctave).length;
  const keyHits = rows.filter((r) => r.keyMatch === 'exact' || r.keyMatch === 'relative').length;
  const lufsHits = rows.filter((r) => r.lufsWithinTarget).length;
  lines.push(
    `Measured ${rows.length} WAV file(s): tempo aligned ${tempoHits}/${rows.length}, key aligned (exact/relative) ${keyHits}/${rows.length}, loudness within pack target (±2 LU) ${lufsHits}/${rows.length}.`,
  );
  return lines.join('\n');
}

function parseCliArgs(argv: string[]): { wavDir?: string; fixturesPath?: string } {
  let wavDir: string | undefined;
  let fixturesPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--wav-dir' || arg === '--wavs') && argv[i + 1]) {
      wavDir = argv[++i];
    } else if (arg === '--fixtures' && argv[i + 1]) {
      fixturesPath = argv[++i];
    } else if (!arg.startsWith('-') && !wavDir) {
      wavDir = arg;
    }
  }
  return { wavDir, fixturesPath };
}

const isMain = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const { wavDir, fixturesPath } = parseCliArgs(process.argv.slice(2));
  const fixtures = loadPromptFixtures(fixturesPath);
  if (wavDir) {
    const rows = evaluateRenderedWavFolder(wavDir, fixtures);
    console.log(formatWavEvalTable(rows));
  } else {
    const summary = evaluatePromptFixtures(fixtures);
    console.log(formatPromptEvalTable(summary));
    if (summary.failed > 0) process.exitCode = 1;
  }
}
