// Score mirror: mirrored files resolve to Firebase Storage under scores/, and the catalogue
// falls back to the source for unmirrored files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorKey, scoreFileUrl, type ScoreEntry } from '../services/scoreCatalog';
import { creditsText, estimatePackBytes } from '../services/scorePack';

const mutopia: ScoreEntry = {
  id: 'mu-ComeauO-ellens-song', source: 'MUTOPIA', title: "Ellen's Song", composer: 'O. Comeau', born: 1924, died: 1971,
  edition: { label: 'CC BY-SA 2.5', kind: 'CC-BY-SA', url: 'https://creativecommons.org/licenses/by-sa/2.5/' },
  engraver: 'John Comeau',
  pdfUrl: 'https://www.mutopiaproject.org/ftp/ComeauO/ellens_song/ellens_song-a4.pdf',
  midiUrl: 'https://www.mutopiaproject.org/ftp/ComeauO/ellens_song/ellens_song.mid',
  sourceUrl: 'https://www.mutopiaproject.org/ftp/ComeauO/ellens_song/',
  mirrored: ['pdf'],
};

test('mirrored files come from Firebase Storage; others stay upstream', () => {
  const cat = { mirror: { bucket: 'bkt.firebasestorage.app', at: '' } };
  assert.equal(mirrorKey(mutopia, 'pdf'), 'scores/v1/mutopia/mu-ComeauO-ellens-song.pdf');
  assert.equal(scoreFileUrl(cat, mutopia, 'pdf'),
    'https://firebasestorage.googleapis.com/v0/b/bkt.firebasestorage.app/o/scores%2Fv1%2Fmutopia%2Fmu-ComeauO-ellens-song.pdf?alt=media');
  assert.equal(scoreFileUrl(cat, mutopia, 'midi'), mutopia.midiUrl); // not mirrored
  assert.equal(scoreFileUrl(null, mutopia, 'pdf'), mutopia.pdfUrl); // no mirror yet
});

test('pack credits name the engraver and licence', () => {
  const txt = creditsText('Folk & Traditional', [mutopia], null);
  assert.match(txt, /CC BY-SA 2\.5, engraved by John Comeau/);
  assert.match(txt, /O\. Comeau \(1924–1971\)/);
  assert.ok(estimatePackBytes([mutopia]) > 100_000);
});
