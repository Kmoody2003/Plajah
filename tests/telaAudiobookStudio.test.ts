import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  telaAudiobookEngine,
  AudiobookProject,
  AudiobookChapter,
} from '../services/audiobook/telaAudiobookStudio';
import {
  createDefaultCharacter,
  saveCharacter,
} from '../services/story/characterBible';

test('Tela Audiobook Studio: Parses multi-chapter manuscript into structured chapters', () => {
  const manuscript = `Chapter 1: The Signal Above
The observation spire shuddered under the gravitational shearing force. Aria adjusted the frequency dial.

“The satellite relay has completely decoupled,” Aria stated grimly.

Chapter 2: Ground Zero
Below the spire, the maintenance tunnels echoed with metallic footsteps. Marcus tapped the comm-link.

“I have reached the junction box,” Marcus reported.`;

  const chapters = telaAudiobookEngine.parseManuscriptIntoChapters(manuscript, 'The Signal Above');

  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].chapterNumber, 1);
  assert.ok(chapters[0].title.includes('Chapter 1'));
  assert.equal(chapters[0].paragraphs.length, 2);

  assert.equal(chapters[1].chapterNumber, 2);
  assert.ok(chapters[1].title.includes('Chapter 2'));
  assert.equal(chapters[1].paragraphs.length, 2);
});

test('Tela Audiobook Studio: Initializes project with Character Bible cast integration', () => {
  const char = createDefaultCharacter('Cyrus Drake', 'tall, weathered cyber-detective with trench coat');
  saveCharacter(char);

  const project = telaAudiobookEngine.createProject(
    'Station 9 Protocol',
    'Chapter 1: Arrival\nThe shuttle landed smoothly on the pad.',
    'Elena Vance'
  );

  assert.equal(project.title, 'Station 9 Protocol');
  assert.equal(project.author, 'Elena Vance');
  assert.equal(project.narratorVoice, 'af_heart');

  // Must include Narrator Aria and character
  const narrator = project.cast.find((c) => c.role === 'NARRATOR');
  assert.ok(narrator, 'Must have narrator in cast');
  assert.equal(narrator?.voiceId, 'af_heart');

  const charInCast = project.cast.find((c) => c.name === 'Cyrus Drake');
  assert.ok(charInCast, 'Character from Bible must be present in cast');
});

test('Tela Audiobook Studio: Synthesizes dual-cast chapter with quote detection and concatenation', async () => {
  const chapter: AudiobookChapter = {
    id: 'chap_test_1',
    chapterNumber: 1,
    title: 'Chapter 1: The Departure',
    rawText: 'The hangar doors ground open.\n\n“All pilots to your ships,” the commander shouted across the intercom.\n\nAria gripped the joystick.',
    paragraphs: [
      'The hangar doors ground open.',
      '“All pilots to your ships,” the commander shouted across the intercom.',
      'Aria gripped the joystick.',
    ],
    segments: [],
    totalDurationSeconds: 0,
    isSynthesized: false,
  };

  const progressUpdates: string[] = [];
  const synthesized = await telaAudiobookEngine.synthesizeChapter(chapter, (p) => {
    progressUpdates.push(p.status);
  });

  assert.equal(synthesized.isSynthesized, true);
  assert.ok(synthesized.totalDurationSeconds > 0);
  assert.ok(synthesized.segments.length >= 3, 'Must split into narrator and quoted segments');
  assert.ok(progressUpdates.length > 0, 'Must have received progress updates');

  // Verify dual-cast roles
  const narratorSeg = synthesized.segments.find((s) => s.speakerType === 'NARRATOR');
  const quoteSeg = synthesized.segments.find((s) => s.speakerType === 'CHARACTER_QUOTE');
  assert.ok(narratorSeg, 'Must have narrator segment');
  assert.ok(quoteSeg, 'Must have character quote segment');
  assert.ok(quoteSeg?.text.includes('All pilots to your ships'));

  // Verify concatenated audio blob
  assert.ok(synthesized.audioBlob, 'Must generate merged audio blob for chapter');
});

test('Tela Audiobook Studio: Exports chapter audio with formatted filename', () => {
  const chapter: AudiobookChapter = {
    id: 'chap_export_1',
    chapterNumber: 3,
    title: 'Descent into the Nebula',
    rawText: 'Test prose.',
    paragraphs: ['Test prose.'],
    segments: [],
    totalDurationSeconds: 12.5,
    isSynthesized: true,
    audioBlob: new Blob(['RIFF....WAVE'], { type: 'audio/wav' }),
  };

  const exported = telaAudiobookEngine.exportChapterAudio(chapter, 'Outer Rim Chronicles');

  assert.equal(exported.fileName, 'outer_rim_chronicles_chap_3_descent_into_the_nebula.wav');
  assert.ok(exported.blob);
});
