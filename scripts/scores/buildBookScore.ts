/**
 * Builds a book score: MusicXML full score, engraved SVG pages (Verovio), multi-track MIDI and a
 * Chora render (the Melos WASM synths — no generative audio).
 *
 *   npx tsx scripts/scores/buildBookScore.ts pride-and-prejudice [--no-audio]
 *
 * Output: docs/scores/<book>/
 */

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { buildPrideAndPrejudiceOverture } from '../../data/bookScores/prideAndPrejudice';
import { compileScore, type Score } from '../../services/melos/score/scoreEngine';
import { scoreToChoraRequest, scoreToMidi, scoreToMusicXml } from '../../services/melos/score/scoreExport';

const BOOKS: Record<string, () => Score> = {
  'pride-and-prejudice': buildPrideAndPrejudiceOverture,
};

async function engrave(musicXml: string, outDir: string): Promise<number> {
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  const vrv = new VerovioToolkit(await createVerovioModule());
  vrv.setOptions({
    pageWidth: 2100, pageHeight: 2970, scale: 30, adjustPageHeight: false,
    breaks: 'auto', footer: 'none', header: 'auto', condense: 'auto', condenseFirstPage: false, justifyVertically: true,
  });
  if (!vrv.loadData(musicXml)) throw new Error('Verovio could not load the MusicXML');
  const pages = vrv.getPageCount();
  for (let p = 1; p <= pages; p++) {
    fs.writeFileSync(path.join(outDir, `page-${String(p).padStart(2, '0')}.svg`), vrv.renderToSVG(p));
  }
  return pages;
}

async function main() {
  const book = process.argv[2] ?? 'pride-and-prejudice';
  const build = BOOKS[book];
  if (!build) throw new Error(`no score for "${book}" (have: ${Object.keys(BOOKS).join(', ')})`);
  const outDir = path.resolve('docs/scores', book);
  fs.mkdirSync(outDir, { recursive: true });

  const score = build();
  const notes = compileScore(score);
  const counts = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const seconds = (score.harmony.length * score.beatsPerBar * 60) / score.bpm;
  console.log(`${score.title}: ${score.harmony.length} bars, ${score.parts.length} staves, ${total} notes, ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`);
  console.log(counts);

  const xml = scoreToMusicXml(score);
  fs.writeFileSync(path.join(outDir, `${score.id}.musicxml`), xml);
  fs.writeFileSync(path.join(outDir, `${score.id}.mid`), scoreToMidi(score));
  const pages = await engrave(xml, outDir);
  console.log(`engraved ${pages} pages`);

  if (!process.argv.includes('--no-audio')) {
    // the Chora engine's import graph uses Vite asset imports (`plajah_audio.wasm?url`)
    register('./viteAssetLoader.mjs', import.meta.url);
    const { renderSongWithMelosWasm } = await import('../../services/melos/melosWasmSongEngine');
    const req = scoreToChoraRequest(score, { sampleRate: 32000 });
    console.log(`rendering ${req.tracks.length} Chora tracks…`);
    const t0 = Date.now();
    const out = await renderSongWithMelosWasm(req);
    fs.writeFileSync(path.join(outDir, `${score.id}.chora.wav`), out.wavBytes);
    let peak = 0;
    for (let i = 0; i < out.left.length; i++) peak = Math.max(peak, Math.abs(out.left[i]), Math.abs(out.right[i]));
    console.log(`rendered ${out.durationSec.toFixed(1)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s, peak ${peak.toFixed(3)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
