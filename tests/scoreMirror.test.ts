// Score mirror: the public file route must only follow the two upstream hosts, only accept
// catalogue-shaped keys, and the catalogue must fall back to the source for unmirrored files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedSource, validScoreKey } from '../routes/scoreFiles';
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

test('only the catalogue upstreams are followed', () => {
  assert.ok(allowedSource('https://www.mutopiaproject.org/ftp/BachJS/x.pdf'));
  assert.ok(allowedSource('https://raw.githubusercontent.com/OpenScore/Lieder/main/scores/a.mxl'));
  assert.equal(allowedSource('https://raw.githubusercontent.com/evil/repo/main/a.mxl'), null);
  assert.equal(allowedSource('https://evil.example/ftp/a.pdf'), null);
  assert.equal(allowedSource('http://www.mutopiaproject.org/ftp/a.pdf'), null);
  assert.equal(allowedSource('javascript:alert(1)'), null);
  assert.equal(allowedSource(undefined), null);
});

test('keys must look like catalogue keys', () => {
  assert.ok(validScoreKey(mirrorKey(mutopia, 'pdf')));
  assert.ok(validScoreKey('scores/v1/openscore_lieder/osl-lc6583477.mxl'));
  assert.equal(validScoreKey('meetings/plus/room/rec/seg_00001.webm'), false);
  assert.equal(validScoreKey('scores/v1/mutopia/../../collab/x.pdf'), false);
  assert.equal(validScoreKey('scores/v1/mutopia/x.exe'), false);
});

test('mirrored files go through our route with the source as fallback; others stay upstream', () => {
  const cat = { mirror: { base: '/api/scores/file', bucket: 'plajah-dev', at: '' } };
  const pdf = scoreFileUrl(cat, mutopia, 'pdf')!;
  assert.match(pdf, /^\/api\/scores\/file\/scores\/v1\/mutopia\/mu-ComeauO-ellens-song\.pdf\?src=/);
  assert.equal(decodeURIComponent(pdf.split('?src=')[1]), mutopia.pdfUrl);
  assert.equal(scoreFileUrl(cat, mutopia, 'midi'), mutopia.midiUrl); // not mirrored
  assert.equal(scoreFileUrl(null, mutopia, 'pdf'), mutopia.pdfUrl); // no mirror yet
  assert.equal(scoreFileUrl({ mirror: { base: 'https://scores.plajah.com', bucket: 'plajah-public', at: '' } }, mutopia, 'pdf'),
    'https://scores.plajah.com/scores/v1/mutopia/mu-ComeauO-ellens-song.pdf');
});

test('pack credits name the engraver and licence', () => {
  const txt = creditsText('Folk & Traditional', [mutopia], null);
  assert.match(txt, /CC BY-SA 2\.5, engraved by John Comeau/);
  assert.match(txt, /O\. Comeau \(1924–1971\)/);
  assert.ok(estimatePackBytes([mutopia]) > 100_000);
});
