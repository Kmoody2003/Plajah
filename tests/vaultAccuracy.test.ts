import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAlignment, activeCueIndex, matchReferenceChapters, type VerifiedAudioAlignment } from '../services/vaultAccuracy';
import { getPassagesForAudiobook, getActiveWordIndex, tokenizePassagesToWords } from '../services/audiobookSyncService';
import { CURATED_VAULT_SPEECHES, SPEECH_MEDIA_REGISTRY } from '../services/speechArchiveData';

const aligned: VerifiedAudioAlignment = { audioUrl: 'https://example.org/edition-a-01.mp3', sourceUrl: 'https://example.org/timing.json', reviewed: true, chapterIndex: 0, cues: [{ start: 5, end: 7, text: 'Hello there' }, { start: 9, end: 11, text: 'Next phrase' }] };
test('timing cannot transfer between editions or chapters', () => {
  assert.equal(validAlignment(aligned, aligned.audioUrl, 0), true);
  assert.equal(validAlignment(aligned, 'https://example.org/edition-b-01.mp3', 0), false);
  assert.equal(validAlignment(aligned, aligned.audioUrl, 1), false);
});
test('rejects overlapping, missing, and invalid timing data', () => {
  assert.equal(validAlignment({ ...aligned, cues: [{start: 5, end: 4, text:'bad'}] }, aligned.audioUrl), false);
  assert.equal(validAlignment({ ...aligned, cues: undefined } as any, aligned.audioUrl), false);
  assert.equal(validAlignment({ ...aligned, cues: [...aligned.cues, {start: 10, end: 15, text:'overlap'}] }, aligned.audioUrl), false);
});
test('no highlight in preamble, silence, or beyond last cue', () => {
  assert.equal(activeCueIndex(aligned.cues, 0), -1);
  assert.equal(activeCueIndex(aligned.cues, 8), -1);
  assert.equal(activeCueIndex(aligned.cues, 11), -1);
  assert.equal(activeCueIndex(aligned.cues, 9), 1);
});
test('never manufactures Alice text or generic preambles from title alone', () => {
  assert.deepEqual(getPassagesForAudiobook({id:'alice',title:'Alice in Wonderland',url:'a'} as any,null,0,500), []);
  const passages = getPassagesForAudiobook({id:'alice',title:'Alice',url:'a'} as any,null,0,500,'The actual chapter text.');
  assert.equal(passages.length, 1);
  assert.equal(passages[0].timed, false);
  assert.equal(getActiveWordIndex(tokenizePassagesToWords(passages), 1), -1);
});
test('chapter matching rejects partial groups, empty titles, and index guesses', () => {
  assert.deepEqual(matchReferenceChapters('', ['']), []);
  assert.deepEqual(matchReferenceChapters('Chapters 1-2',['Chapter 1','Chapter 2']), [0,1]);
  assert.deepEqual(matchReferenceChapters('Chapters 1-2',['Chapter 1','Chapter 3']), []);
  assert.deepEqual(matchReferenceChapters('Letter 1',['Chapter 1']), []);
  assert.deepEqual(matchReferenceChapters('Introduction',['Preface','Chapter 1']), []);
});
test('Kennedy uses checked inauguration image and no false document photo', () => {
  const jfk = CURATED_VAULT_SPEECHES.find(t => t.id.includes('jfk'))!;
  assert.match(jfk.thumbnailUrl, /02882v/);
  assert.equal(SPEECH_MEDIA_REGISTRY.jfk_inaugural.companionArtifacts.length, 1);
  assert.equal(SPEECH_MEDIA_REGISTRY.jfk_inaugural.pdfUrl, undefined);
  assert.equal(SPEECH_MEDIA_REGISTRY.gehrig_farewell.primaryPhoto, '/vault-recording.svg');
});
