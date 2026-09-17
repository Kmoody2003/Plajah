import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInterviewKey, AUTHENTIC_INTERVIEW_TRANSCRIPTS } from '../services/interviewArchiveData';
import {
  tokenizeText,
  computeTranscriptSimilarity,
  compareTranscripts,
  alignHistoricTranscriptToTiming,
  TranscribedCue,
} from '../services/slaveTranscriptionService';
import { validAlignment } from '../services/vaultAccuracy';

test('resolveInterviewKey accurately handles Side A vs Side B accession codes', () => {
  assert.equal(resolveInterviewKey('Interview with Wallace Quarterman (AFS 00342A)'), 'quarterman');
  assert.equal(resolveInterviewKey('Interview with Wallace Quarterman (AFS 00342B)'), 'quarterman_b');
  assert.equal(resolveInterviewKey('Wallace Quarterman Side B'), 'quarterman_b');
  assert.equal(resolveInterviewKey('Interview with Fountain Hughes (AFS 09990)'), 'hughes');
  assert.equal(resolveInterviewKey('Interview with Uncle Billy McCrea (AFS 03974)'), 'mccrea');
  assert.equal(resolveInterviewKey('Interview with Uncle Bob Ledbetter (AFS 03992)'), 'ledbetter');
});

test('computeTranscriptSimilarity correctly distinguishes Side A vs Side B text', () => {
  const sideBText = AUTHENTIC_INTERVIEW_TRANSCRIPTS.quarterman_b.map(c => c.text).join(' ');
  const sideAText = AUTHENTIC_INTERVIEW_TRANSCRIPTS.quarterman.map(c => c.text).join(' ');

  const simSelf = computeTranscriptSimilarity(sideBText, sideBText);
  const simCross = computeTranscriptSimilarity(sideBText, sideAText);

  assert.ok(simSelf > 0.9, 'Self similarity should be close to 1.0');
  assert.ok(simSelf > simCross, 'Self similarity must exceed cross-side similarity');
});

test('compareTranscripts identifies the correct historic Library of Congress transcript key', () => {
  const sampleCues: TranscribedCue[] = [
    { start: 0, end: 5, text: "After they said you can go free, then what did you do?" },
    { start: 6, end: 12, text: "That day master promised so, to give we forty dollars a month in pay." },
    { start: 13, end: 18, text: "And after the sword was down the tension, in the South tension." },
  ];

  const match = compareTranscripts(sampleCues, AUTHENTIC_INTERVIEW_TRANSCRIPTS);
  assert.equal(match.matchedKey, 'quarterman_b');
  assert.equal(match.isHighMatch, true);
});

test('alignHistoricTranscriptToTiming preserves verbatim historic LoC text and enforces valid alignment', () => {
  const historicCues = AUTHENTIC_INTERVIEW_TRANSCRIPTS.quarterman_b;
  const audioUrl = 'https://tile.loc.gov/storage-services/service/afc/afc1935001/afc1935001_afs00342/afc1935001_afs00342b.mp3';
  const sourceUrl = 'https://www.loc.gov/item/afc1935001_afs00342b/';

  const timingCues: TranscribedCue[] = historicCues.map((c, i) => ({
    start: i * 5,
    end: (i * 5) + 4.5,
    text: 'different generated audio transcript text',
  }));

  const alignment = alignHistoricTranscriptToTiming(historicCues, timingCues, audioUrl, sourceUrl);

  assert.equal(validAlignment(alignment, audioUrl), true, 'Alignment must pass validAlignment check');
  assert.equal(alignment.cues[0].text, historicCues[0].text, 'Must ALWAYS display verbatim historic LoC text');
  assert.equal(alignment.cues[1].text, historicCues[1].text, 'Must ALWAYS display verbatim historic LoC text');

  // Verify cues are non-overlapping & strictly ascending
  for (let i = 1; i < alignment.cues.length; i++) {
    assert.ok(alignment.cues[i].start >= alignment.cues[i - 1].end, `Cue ${i} start must be >= Cue ${i-1} end`);
    assert.ok(alignment.cues[i].end > alignment.cues[i].start, `Cue ${i} end must be > start`);
  }
});
