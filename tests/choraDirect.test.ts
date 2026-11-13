// Chora Direct: the Suno-style prompt language, style packs, the song brief every engine reads,
// the players' read-through, and the editable vocal layer. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSongPrompt, parseStyle, readLine, readTag, readKey, syllabify, writeLyrics } from '../services/melos/direct/songPrompt';
import { STYLE_PACKS, chooseStyle, realizeProgression, romanToChord } from '../services/melos/direct/styleKnowledge';
import { compileSongBrief, reviewBrief, briefToEnsemblePlan, briefToBandChart, briefToRenderRequest, briefGrounding, briefToLyricLines } from '../services/melos/direct/songBrief';
import { layoutVocal, retextPhrase, editNote, staleRegions, markRendered, regenRequest, splitPhrase, chordTones, phraseDisplay, vocalGuideNotes } from '../services/melos/direct/vocalScore';
import { parseChart } from '../services/melos/beats/band/chords';
import { validateEnsemblePlan } from '../services/melos/generation/ensemblePlan';
import { GENRES } from '../services/melos/beats/band/styles';

const SONG = `deep house, 122 bpm, F minor, warm rhodes, female vocal, no guitars

[Intro | 8 bars]

[Verse 1]
City lights are calling out my name
I keep on running, running from the flame

[Chorus | f | anthemic]
Hold me in the mo-o-ment~ (hold me)
^Never let it fade away /

[Sax Solo | 8 bars]

[Outro]
[Fade Out]`;

test('style line: tags, directives, vocal and exclusions', () => {
  const s = parseStyle('Deep House, 122 BPM, F minor, warm rhodes, female vocal, no guitars, 3:30');
  assert.equal(s.directives.bpm, 122);
  assert.deepEqual(s.directives.key, { tonic: 5, mode: 'minor' });
  assert.equal(s.directives.durationSec, 210);
  assert.deepEqual(s.exclude, ['guitars']);
  assert.equal(s.vocal.presence, 'lead');
  assert.equal(s.vocal.gender, 'female');
  assert.ok(s.tags.includes('deep house') && s.tags.includes('warm rhodes'));
  assert.ok(!s.tags.some((t) => /bpm|minor/.test(t)), 'directives are lifted out of the tags');
  assert.equal(parseStyle('cinematic, instrumental').vocal.presence, 'none');
  assert.equal(parseStyle('trap, key of C# minor').directives.key?.tonic, 1);
  assert.deepEqual(readKey('Bb'), { tonic: 10, mode: 'major' });
  assert.deepEqual(readKey('D dorian'), { tonic: 2, mode: 'dorian' });
  // A bare letter in a tag list is a word, not a key.
  assert.equal(parseStyle('a, jazz').directives.key, undefined);
});

test('section tags: Suno forms and the Chora extensions', () => {
  assert.equal(readTag('Verse 2').section?.kind, 'verse');
  assert.equal(readTag('Verse 2').section?.ordinal, 2);
  assert.equal(readTag('Pre-Chorus').section?.kind, 'prechorus');
  assert.equal(readTag('Guitar Solo').section?.feature, 'guitar');
  const solo = readTag('Solo: tenor sax | 16 bars').section!;
  assert.equal(solo.kind, 'solo'); assert.equal(solo.feature, 'tenor sax'); assert.equal(solo.bars, 16);
  const v = readTag('Verse 1 | 8 bars | mp | whispered').section!;
  assert.equal(v.bars, 8); assert.equal(v.dynamic, 'mp'); assert.deepEqual(v.modifiers, ['whispered']);
  assert.equal(readTag('Chorus: belted, harmonies').section?.modifiers.length, 2);
  assert.deepEqual(readTag('Key: F minor').directive, { key: { tonic: 5, mode: 'minor' } });
  assert.deepEqual(readTag('Tempo: 96').directive, { bpm: 96 });
  assert.deepEqual(readTag('Time: 6/8').directive, { meter: [6, 8] });
  assert.equal(readTag('Fade Out').action, 'fade-out');
  assert.equal(readTag('Female Vocal').voice, 'female vocal');
  assert.equal(readTag('Sparkly Unicorn Mode').unknown, 'Sparkly Unicorn Mode');
});

test('lyric lines: syllables, ad-libs and word marks', () => {
  assert.deepEqual(syllabify('running'), ['run', 'ning']);
  assert.deepEqual(syllabify('love'), ['love']);
  assert.deepEqual(syllabify('little').length, 2);
  assert.equal(syllabify('beautiful').length, 3);
  assert.equal(syllabify('fire').length, 1);
  const l = readLine('Hold me in the mo-o-ment~ (hold me)');
  assert.equal(l.text, 'Hold me in the mooment');
  assert.deepEqual(l.adlibs, ['hold me']);
  const last = l.words[l.words.length - 1];
  assert.deepEqual(last.syllables, ['mo', 'o', 'ment']);
  assert.ok(last.marks.includes('hold') && last.marks.includes('melisma'));
  const a = readLine('^Never let it fade away /');
  assert.ok(a.words[0].marks.includes('accent'));
  assert.ok(a.words[a.words.length - 1].marks.includes('breath-after'));
  assert.equal(readLine('[whispered] I never said goodbye').delivery[0], 'whispered');
});

test('whole prompt: one text box or two', () => {
  const p = parseSongPrompt(SONG);
  assert.deepEqual(p.sections.map((s) => s.kind), ['intro', 'verse', 'chorus', 'solo', 'outro']);
  assert.equal(p.sections[0].instrumental, true);
  assert.equal(p.sections[1].lines.length, 2);
  assert.equal(p.sections[2].dynamic, 'f');
  assert.equal(p.sections[3].feature, 'sax');
  assert.deepEqual(p.actions, [{ afterSection: 4, action: 'fade-out' }]);
  const two = parseSongPrompt({ style: 'bebop, 200 bpm', lyrics: '[Head]\n{Bbmaj7 G7 | Cm7 F7}\n[Solo: trumpet]' });
  assert.deepEqual(two.sections[0].chart, [['Bbmaj7', 'G7'], ['Cm7', 'F7']]);
  assert.equal(two.style.vocal.presence, 'unspecified');
  const sheet = writeLyrics(p.sections);
  assert.match(sheet, /\[Verse 1\]\nCity lights/);
  assert.match(sheet, /\(hold me\)/);
});

test('style packs: every pack is complete and its harmony realises in every key', () => {
  const bandGenres = new Set(GENRES.map((g) => g.id));
  assert.ok(STYLE_PACKS.length >= 35);
  const ids = new Set<string>();
  for (const p of STYLE_PACKS) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
    assert.ok(bandGenres.has(p.bandGenre), `${p.id}: band genre ${p.bandGenre}`);
    assert.ok(p.tempo[0] <= p.defaultTempo && p.defaultTempo <= p.tempo[1], `${p.id}: default tempo in range`);
    assert.ok(p.form.length >= 3 && p.lineup.length >= 4, `${p.id}: form and lineup`);
    assert.ok(p.harmonyNotes.length && p.rhythm.length && p.arrangement.length && p.production.length && p.avoid.length, `${p.id}: knowledge`);
    assert.ok(p.mix.lufs[0] < p.mix.lufs[1], `${p.id}: loudness window`);
    for (const prog of p.progressions) {
      for (let tonic = 0; tonic < 12; tonic++) {
        for (const bar of realizeProgression(prog, tonic, p.modes[0])) {
          for (const chord of bar) assert.match(chord, /^[A-G][#b]?/, `${p.id}: ${prog}`);
        }
      }
    }
  }
  for (const fam of ['cinematic', 'classical', 'jazz', 'electronic', 'hiphop']) assert.ok(STYLE_PACKS.filter((p) => p.family === fam).length >= 5, fam);
});

test('roman numerals', () => {
  assert.equal(romanToChord('bVI', 2, 'minor'), 'Bb');
  assert.equal(romanToChord('i', 2, 'minor'), 'Dm');
  assert.equal(romanToChord('ii7', 0), 'Dm7');
  assert.equal(romanToChord('Imaj7', 0), 'Cmaj7');
  assert.equal(romanToChord('iiø7', 0), 'Dm7b5');
  assert.equal(romanToChord('V7/vi', 0), 'E7');
  assert.equal(romanToChord('#IVdim7', 5), 'Bdim7');
  assert.equal(romanToChord('im9', 9, 'minor'), 'Am9');
  assert.equal(romanToChord('nope', 0), null);
});

test('style choice: the specific style beats the general word', () => {
  const pick = (s: string) => chooseStyle(parseStyle(s).tags).pack.id;
  assert.equal(pick('deep house, warm'), 'edm-deep-house');
  assert.equal(pick('house'), 'edm-house');
  assert.equal(pick('detroit techno'), 'edm-detroit-techno');
  assert.equal(pick('techno, dark'), 'edm-techno');
  assert.equal(pick('drum and bass, liquid'), 'edm-dnb');
  assert.equal(pick('uk drill'), 'hiphop-drill');
  assert.equal(pick('trap, dark, 808s'), 'hiphop-trap');
  assert.equal(pick('boom bap'), 'hiphop-boombap');
  assert.equal(pick('lofi hip hop'), 'hiphop-lofi');
  assert.equal(pick('bebop quintet'), 'jazz-swing');
  assert.equal(pick('jazz ballad, smoky'), 'jazz-ballad');
  assert.equal(pick('bossa nova'), 'jazz-bossa');
  assert.equal(pick('epic trailer'), 'cinematic-epic');
  assert.equal(pick('horror score'), 'cinematic-horror');
  assert.equal(pick('baroque fugue'), 'classical-baroque');
  assert.equal(pick('minimalist, piano'), 'classical-minimalist');
  assert.equal(pick('something nobody has named'), 'song');
  assert.equal(chooseStyle(['xyzzy']).matched, false);
  const blend = chooseStyle(parseStyle('trap, orchestral, epic').tags);
  assert.equal(blend.pack.family, 'hiphop');
  assert.ok(blend.blend && blend.blend.family !== 'hiphop', 'a second family is offered as a blend');
});

test('brief: the prompt resolved into bars, chords and a session', () => {
  const b = compileSongBrief(parseSongPrompt(SONG));
  assert.equal(b.pack.id, 'edm-deep-house');
  assert.equal(b.bpm, 122); assert.equal(b.keyName, 'F minor');
  assert.deepEqual(b.sections.map((s) => s.bars), [8, 4, 4, 8, 16]);
  assert.equal(b.totalBars, 40);
  assert.deepEqual(b.sections.map((s) => s.startBar), [0, 8, 12, 16, 24]);
  assert.equal(b.sections[2].dynamic, 'f');
  assert.ok(b.sections[2].energy > b.sections[1].energy, 'the chorus lifts');
  for (const s of b.sections) assert.equal(s.chords.length, s.bars);
  assert.match(b.sections[0].chords[0][0], /^Fm/);
  assert.ok(!b.lineup.some((x) => x.chair === 'guitar'), '"no guitars" is honoured');
  assert.ok(b.vocal.present && b.vocal.gender === 'female');
  // Deterministic.
  assert.deepEqual(compileSongBrief(parseSongPrompt(SONG)), b);
  // The fading song keeps its loop; a song that ends lands on the tonic.
  const ends = compileSongBrief(parseSongPrompt('epic trailer, D minor'));
  assert.deepEqual(ends.sections[ends.sections.length - 1].chords.at(-1), ['Dm']);
});

test('brief: no sections means the form the style uses; duration scales it', () => {
  const b = compileSongBrief(parseSongPrompt('trance, uplifting'));
  assert.deepEqual(b.sections.map((s) => s.kind), ['intro', 'verse', 'breakdown', 'build', 'drop', 'outro']);
  assert.equal(b.vocal.present, false);
  assert.ok(b.bpm >= 132 && b.bpm <= 142);
  const short = compileSongBrief(parseSongPrompt('trance, 2 minutes'));
  assert.ok(Math.abs(short.seconds - 120) < 30, `scaled to about two minutes (${short.seconds}s)`);
  assert.ok(compileSongBrief(parseSongPrompt('boom bap, slow')).bpm < compileSongBrief(parseSongPrompt('boom bap, energetic')).bpm);
  assert.notEqual(compileSongBrief(parseSongPrompt('cinematic, sad')).key.mode, 'major');
  // Project values fill what the prompt leaves open, and the prompt wins when it speaks.
  assert.equal(compileSongBrief(parseSongPrompt('house'), { bpm: 126 }).bpm, 126);
  assert.equal(compileSongBrief(parseSongPrompt('house, 121 bpm'), { bpm: 126 }).bpm, 121);
});

test('read-through: the players raise what a session would', () => {
  const said = (prompt: string) => reviewBrief(compileSongBrief(parseSongPrompt(prompt)));
  const fast = said('boom bap, 150 bpm');
  assert.ok(fast.some((n) => n.from === 'marcus' && /82–98/.test(n.message)));
  assert.ok(said('trap, 70 bpm').some((n) => n.from === 'marcus' && /half-time/.test(n.message)), 'half-time counts are understood, not corrected');
  const wordy = said(`pop, 100 bpm\n[Verse | 2 bars]\n${'supercalifragilistic expialidocious unbelievably complicated '.repeat(3)}`);
  assert.ok(wordy.some((n) => n.level === 'problem' && /syllables a second/.test(n.message)));
  assert.ok(said('festival edm\n[Verse]\nla la la la\n[Drop]').some((n) => n.from === 'nova' && /Build/.test(n.message)));
  assert.ok(said('bebop, E major\n[Head]\n[Solo]').some((n) => n.from === 'corny'));
  assert.ok(said('pop\n[Verse | 7 bars]\nla la').some((n) => n.from === 'elena' && /7 bars/.test(n.message)));
  assert.ok(said('polka from mars').some((n) => /general song form/.test(n.message)));
  assert.ok(said('house\n[Verse]\nla la la\n[Sparkle Mode]').some((n) => /Sparkle Mode/.test(n.message)));
  // A sensible prompt passes without problems.
  assert.equal(reviewBrief(compileSongBrief(parseSongPrompt(SONG))).filter((n) => n.level === 'problem').length, 0);
});

test('hand-offs: ensemble plan, band chart, render request, grounding, lyric lines', () => {
  const b = compileSongBrief(parseSongPrompt(SONG));
  const plan = briefToEnsemblePlan(b);
  assert.equal(plan.chords.length, b.totalBars);
  // The existing pipeline's validator accepts it as a director plan.
  const ok = validateEnsemblePlan({ ...plan, concept: 'test' }, { ...plan });
  assert.equal(ok.sections.length, b.sections.length);
  const chart = briefToBandChart(b);
  assert.equal(chart.genre, 'house');
  assert.equal(chart.chart.split('|').length, b.totalBars);
  const r = briefToRenderRequest(b);
  assert.match(r.prompt, /deep house/); assert.match(r.prompt, /122 bpm/); assert.match(r.prompt, /female vocals/);
  assert.ok(!/guitar/.test(r.prompt), 'excluded instruments never reach the renderer');
  assert.match(r.lyrics, /\[Chorus\]\nHold me/);
  assert.equal(briefToRenderRequest(compileSongBrief(parseSongPrompt('techno'))).lyrics, '[Instrumental]');
  const g = briefGrounding(b);
  for (const part of ['STYLE: Deep house', 'HARMONY:', 'SESSION:', 'FORM:', 'chords: Fm', 'words: City lights']) assert.ok(g.includes(part), part);
  const forBass = briefGrounding(b, { chair: 'bass', sectionId: 's3' });
  assert.match(forBass, /YOUR CHAIR: sub bass/); assert.match(forBass, />> Chorus/);
  assert.ok(!/Outro: bars/.test(forBass), 'a focused brief shows only the neighbours');
  const lines = briefToLyricLines(b);
  assert.deepEqual(lines.map((l) => l.bar), [8, 10, 12, 14]);
});

test('every pack compiles to a chart the Session Band can read', () => {
  for (const p of STYLE_PACKS) {
    const parsed = parseSongPrompt('');
    // Force the pack by its own id words: compile through the public path with a tag that selects it.
    const tag = STYLE_PACKS.find((x) => x.id === p.id)!;
    const tagText = tag.match.source.match(/\(([^|)]+)/)?.[1]?.replace(/\\b|\\w\*|\?|\[- \]|\(\?:[^)]*\)/g, '').replace(/\\/g, '').trim() ?? '';
    const b = compileSongBrief({ ...parsed, style: parseStyle(tagText) });
    const chart = briefToBandChart(b).chart;
    assert.ok(parseChart(chart), `${b.pack.id}: ${chart.slice(0, 80)}`);
  }
});

test('vocal layer: lyrics become editable phrases and notes on the timeline', () => {
  const b = compileSongBrief(parseSongPrompt(SONG));
  const layer = layoutVocal(b);
  assert.equal(layer.phrases.length, 4);
  const [v1, , c1] = layer.phrases;
  assert.equal(v1.startBeats, 8 * 4, 'the verse starts where its section starts');
  assert.equal(v1.notes.length, 9, 'one note per syllable');
  for (const p of layer.phrases) {
    let t = -1;
    for (const n of p.notes) {
      assert.ok(n.startBeats > t, 'notes are in order'); t = n.startBeats;
      assert.ok(n.key >= layer.voice.range[0] && n.key <= layer.voice.range[1], 'in the singer\'s range');
      assert.ok(n.lengthBeats > 0);
    }
    assert.ok(p.startBeats + p.lengthBeats <= (b.sections.find((s) => s.id === p.sectionId)!.startBar + b.sections.find((s) => s.id === p.sectionId)!.bars) * 4 + 0.001, 'inside its section');
    assert.equal(p.take.status, 'none');
  }
  const avg = (ns: { key: number }[]) => ns.reduce((n, x) => n + x.key, 0) / ns.length;
  assert.ok(avg(c1.notes) > avg(v1.notes), 'the chorus sits higher than the verse');
  assert.ok(c1.adlibs.includes('hold me'));
  assert.ok(c1.notes.some((n) => n.marks.includes('melisma')));
  assert.equal(phraseDisplay(v1)[0].label, 'Ci-');
  assert.equal(vocalGuideNotes(layer).length, layer.phrases.reduce((n, p) => n + p.notes.length, 0));
  assert.equal(layoutVocal(compileSongBrief(parseSongPrompt('techno'))).phrases.length, 0);
  assert.deepEqual(chordTones('Fm9'), [5, 8, 0, 3]);
  assert.deepEqual(chordTones('Bbmaj7'), [10, 2, 5, 9]);
});

test('vocal layer: edit a phrase and only that stretch is sung again, in context', () => {
  const b = compileSongBrief(parseSongPrompt(SONG));
  let layer = layoutVocal(b);
  const ids = layer.phrases.map((p) => p.id);
  // Nothing rendered yet: one region covers each run of phrases.
  assert.equal(staleRegions(layer).flatMap((r) => r.phraseIds).length, 4);
  layer = markRendered(layer, ids, { sampleKey: 'take-1', engine: 'test' });
  assert.equal(staleRegions(layer).length, 0);

  // Same syllable count: the melody stays, the words change.
  const before = layer.phrases[1];
  layer = retextPhrase(layer, ids[1], 'I keep on hiding, hiding from the rain');
  const after = layer.phrases[1];
  assert.deepEqual(after.notes.map((n) => [n.key, n.startBeats]), before.notes.map((n) => [n.key, n.startBeats]));
  assert.equal(after.text, 'I keep on hiding, hiding from the rain');
  assert.equal(after.take.status, 'stale');
  const regions = staleRegions(layer);
  assert.equal(regions.length, 1);
  assert.deepEqual(regions[0].phraseIds, [ids[1]]);
  assert.equal(regions[0].before?.id, ids[0]); assert.equal(regions[0].after?.id, ids[2]);
  assert.ok(regions[0].startBeats >= layer.phrases[0].startBeats + layer.phrases[0].lengthBeats, 'the roll never eats the good phrase before');
  assert.ok(regions[0].endBeats <= layer.phrases[2].startBeats);

  const req = regenRequest(layer, regions[0], b);
  assert.equal(req.lyrics, 'I keep on hiding, hiding from the rain');
  assert.match(req.lyricsBefore, /City lights/); assert.match(req.lyricsAfter, /Hold me/);
  assert.equal(req.audioBefore, 'take-1');
  assert.ok(req.endSec > req.startSec && req.notes.length === after.notes.length);
  assert.ok(req.notes.every((n) => n.startSec >= 0));
  assert.match(req.prompt, /female lead vocal.*deep house.*122 bpm/);

  // Typing it back restores the fresh take: the hash is of the content, not of the edit history.
  layer = retextPhrase(layer, ids[1], before.text);
  assert.equal(layer.phrases[1].take.status, 'fresh');

  // A different syllable count re-spreads the line inside the same place.
  layer = retextPhrase(layer, ids[0], 'City lights');
  assert.equal(layer.phrases[0].notes.length, 3);
  assert.equal(layer.phrases[0].startBeats, 32);
  assert.equal(layer.phrases[0].take.status, 'stale');

  // Moving one note marks just that phrase.
  const n = layer.phrases[2].notes[0];
  layer = editNote(layer, ids[2], n.id, { key: n.key + 2 });
  assert.equal(layer.phrases[2].take.status, 'stale');
  assert.equal(layer.phrases[3].take.status, 'fresh');
  // Phrases 0 and 2 are stale, 1 is fresh between them: two separate regions.
  assert.deepEqual(staleRegions(layer).map((r) => r.phraseIds), [[ids[0]], [ids[2]]]);

  // Splitting lets half a line be regenerated on its own.
  const split = splitPhrase(layer, ids[3], layer.phrases[3].notes[3].id);
  assert.equal(split.phrases.length, 5);
  assert.equal(split.phrases[3].notes.length, 3);
  assert.equal(split.phrases[3].text + ' ' + split.phrases[4].text, 'Never let it fade away');
});
