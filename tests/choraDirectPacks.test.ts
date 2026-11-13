// Chora Direct — deeper style packs (G2) selection, harmony and compilation tests.
// Pure TypeScript — tsx --test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSongPrompt, parseStyle } from '../services/melos/direct/songPrompt';
import { EXTRA_PACKS } from '../services/melos/direct/packs';
import { chooseStyle, realizeProgression } from '../services/melos/direct/styleKnowledge';
import { briefToBandChart, compileSongBrief } from '../services/melos/direct/songBrief';
import { parseChart, parseChord } from '../services/melos/beats/band/chords';
import { GENRES } from '../services/melos/beats/band/styles';

const pick = (styleLine: string) => chooseStyle(parseStyle(styleLine).tags).pack.id;

test('G2 electronic packs: every new electronic pack is selected by its tags', () => {
  assert.equal(pick('breakbeat, big beat'), 'edm-breakbeat');
  assert.equal(pick('808 electro, electro-funk'), 'edm-electro');
  assert.equal(pick('intelligent dance music, braindance'), 'edm-idm');
  assert.equal(pick('minimal techno, microhouse'), 'edm-minimal');
  assert.equal(pick('psychedelic trance, full-on psytrance'), 'edm-psytrance');
  assert.equal(pick('liquid drum and bass'), 'edm-liquid-dnb');
  assert.equal(pick('neurofunk dnb, techstep'), 'edm-neurofunk');
  assert.equal(pick('ragga jungle, chopped amen'), 'edm-jungle');
  assert.equal(pick('south african amapiano, sgija'), 'edm-amapiano');
  assert.equal(pick('afro house, afro tech'), 'edm-afro-house');
  assert.equal(pick('nu-disco, boogie'), 'edm-disco');
  assert.equal(pick('hyperpop, bubblegum bass'), 'edm-hyperpop');
});

test('G2 hip-hop packs: every new hip-hop pack is selected by its tags', () => {
  assert.equal(pick('jazz rap, upright bass'), 'hiphop-jazz-rap');
  assert.equal(pick('trapsoul, dark r&b'), 'hiphop-trap-soul');
  assert.equal(pick('cloud rap, ethereal trap'), 'hiphop-cloud');
  assert.equal(pick('crunk, dirty south'), 'hiphop-crunk');
  assert.equal(pick('old-school rap, electro rap'), 'hiphop-oldschool');
  assert.equal(pick('detroit rap, michigan rap'), 'hiphop-detroit');
  assert.equal(pick('jersey club, club triplet'), 'hiphop-jersey-club');
  assert.equal(pick('reggaeton, dembow'), 'hiphop-reggaeton');
});

test('G2 jazz packs: every new jazz pack is selected by its tags and Latin jazz carries clave direction', () => {
  assert.equal(pick('latin jazz, afro-cuban'), 'jazz-latin');
  assert.equal(pick('gypsy jazz, jazz manouche'), 'jazz-gypsy');
  assert.equal(pick('free jazz, avant-garde jazz'), 'jazz-free');
  assert.equal(pick('soul jazz, organ trio'), 'jazz-soul');
  assert.equal(pick('dixieland, new orleans jazz'), 'jazz-dixieland');
  assert.equal(pick('contemporary smooth jazz, smooth sax'), 'jazz-smooth');

  const latinBrief = compileSongBrief(parseSongPrompt('latin jazz, afro-cuban'));
  assert.equal(latinBrief.pack.id, 'jazz-latin');
  assert.ok(
    latinBrief.pack.rhythm.some((r) => /clave/i.test(r)) &&
      latinBrief.lineup.some((s) => /clave/i.test(s.job)),
    'Latin jazz explicitly directs clave alignment',
  );
});

test('G2 cinematic packs: every new cinematic pack is selected by its tags', () => {
  assert.equal(pick('spaghetti western, frontier score'), 'cinematic-western');
  assert.equal(pick('film noir, spy score'), 'cinematic-noir');
  assert.equal(pick('romantic score, love theme'), 'cinematic-romance');
  assert.equal(pick('sci-fi score, synth score'), 'cinematic-scifi');
  assert.equal(pick('comedy score, animation score'), 'cinematic-comedy');
  assert.equal(pick('documentary underscore, docuseries'), 'cinematic-documentary');
  assert.equal(pick('video-game orchestral, jrpg'), 'cinematic-videogame');
});

test('G2 classical packs: every new classical pack is selected by its tags and waltz compiles in 3/4', () => {
  assert.equal(pick('chamber string quartet, two violins viola cello'), 'classical-quartet');
  assert.equal(pick('solo piano nocturne, night piece'), 'classical-nocturne');
  assert.equal(pick('sacred choral, a cappella choir'), 'classical-choral');
  assert.equal(pick('opera aria, bel canto'), 'classical-opera');
  assert.equal(pick('renaissance polyphony, madrigal'), 'classical-renaissance');
  assert.equal(pick('20th-century modernist, serialism'), 'classical-modernist');
  assert.equal(pick('viennese waltz, concert waltz'), 'classical-waltz');

  const waltzBrief = compileSongBrief(parseSongPrompt('viennese waltz, D major'));
  assert.equal(waltzBrief.pack.id, 'classical-waltz');
  assert.deepEqual(waltzBrief.meter, [3, 4]);
  assert.equal(waltzBrief.beatsPerBar, 3);
});

test('every EXTRA_PACK realises playable Session Band charts in all 12 keys', () => {
  assert.equal(EXTRA_PACKS.length, 40);
  const bandGenres = new Set(GENRES.map((g) => g.id));
  for (const pack of EXTRA_PACKS) {
    assert.ok(bandGenres.has(pack.bandGenre), `${pack.id}: invalid bandGenre ${pack.bandGenre}`);
    for (const prog of pack.progressions) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const bars = realizeProgression(prog, tonic, pack.modes[0]);
        for (const bar of bars) {
          for (const chord of bar) {
            assert.ok(parseChord(chord) !== null, `${pack.id}: ${chord} from "${prog}" must parse in Session Band`);
          }
        }
      }
    }
    const brief = compileSongBrief(parseSongPrompt(pack.label.toLowerCase()));
    const bandChart = briefToBandChart(brief);
    assert.ok(parseChart(bandChart.chart) !== null, `${pack.id}: briefToBandChart must produce valid chart`);
  }
});
