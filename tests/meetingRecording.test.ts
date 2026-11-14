import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CaptionAssembler, mergeTranscript, transcriptText, transcriptVtt, clock, rulesRecap, parseRecap, recapUserPrompt,
  modeBlockedReason, allowanceFor, cloudExpiry, speakersOf, type CaptionLine,
} from '../services/meetings/meetingRecordingCore';

const L = (uid: string, name: string, at: number, text: string): CaptionLine => ({ uid, name, at, text });

test('plan limits: local always, cloud audio free, cloud video paid', () => {
  const free = allowanceFor(false), paid = allowanceFor(true);
  assert.equal(modeBlockedReason('LOCAL', 'VIDEO', free), null);
  assert.equal(modeBlockedReason('CLOUD', 'AUDIO', free), null);
  assert.match(modeBlockedReason('CLOUD', 'VIDEO', free) || '', /Plajah\+/);
  assert.equal(modeBlockedReason('CLOUD', 'VIDEO', paid), null);
  assert.equal(cloudExpiry(0, free), 30 * 86_400_000);
  assert.equal(cloudExpiry(0, paid), 365 * 86_400_000);
});

test('caption assembler joins word pieces into sentences on final', () => {
  const a = new CaptionAssembler();
  assert.equal(a.feed('Can we', false), null);
  assert.equal(a.feed(' move rehearsal', false), null);
  assert.equal(a.interim, 'Can we move rehearsal');
  assert.equal(a.feed('to 6:30?', true), 'Can we move rehearsal to 6:30?');
  assert.equal(a.interim, '');
  assert.equal(a.feed('', true), null);
  assert.equal(a.feed('a', true), null); // too short to be a line
});

test('transcript merges consecutive lines from one speaker and orders by time', () => {
  const lines = [
    L('b', 'Sam', 9000, 'Sounds good.'),
    L('a', 'Dana', 1000, 'Welcome everyone.'),
    L('a', 'Dana', 4000, 'Set list is in the folder.'),
    L('a', 'Dana', 60_000, 'One more thing.'),
  ];
  const blocks = mergeTranscript(lines);
  assert.deepEqual(blocks.map(b => [b.name, b.text]), [
    ['Dana', 'Welcome everyone. Set list is in the folder.'],
    ['Sam', 'Sounds good.'],
    ['Dana', 'One more thing.'],
  ]);
  assert.equal(transcriptText(blocks).split('\n')[0], '[0:01] Dana: Welcome everyone. Set list is in the folder.');
  assert.deepEqual(speakersOf(lines), ['Sam', 'Dana']);
});

test('clock and VTT formatting', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(65_000), '1:05');
  assert.equal(clock(3_725_000), '1:02:05');
  const vtt = transcriptVtt([L('a', 'Dana <host>', 1500, 'Hello'), L('b', 'Sam', 4000, 'Hi')]);
  assert.match(vtt, /^WEBVTT\n\n00:00:01\.500 --> 00:00:04\.000\n<v Dana host>Hello/);
});

test('rules recap finds actions and decisions without a model', () => {
  const lines = [
    L('a', 'Dana', 1000, "We decided to move rehearsal to 6:30. I'll send the new schedule by Friday."),
    L('b', 'Sam Okafor', 5000, 'Can you bring the extra mic stands to the youth room?'),
    L('c', 'Kenne', 9000, 'Thanks everyone, great week. Sam, could you lock up after?'),
  ];
  const r = rulesRecap(lines, 123);
  assert.equal(r.lane, 'rules');
  assert.deepEqual(r.decisions, ['We decided to move rehearsal to 6:30.']);
  // Dana commits herself; Sam's unnamed request has no owner; Kenne's "Sam, could you" belongs to Sam.
  assert.deepEqual(r.actionItems.map(a => a.owner), ['Dana', undefined, 'Sam Okafor']);
  assert.match(r.summary, /3 people spoke/);
  assert.equal(rulesRecap([]).summary, 'No one was captioned during this recording.');
});

test('model recap parsing tolerates fences and rejects junk', () => {
  const reply = '```json\n{"summary":"We set the schedule.","actionItems":[{"text":"Send schedule","owner":"Dana"},"Bring mic stands"],"decisions":["Rehearsal at 6:30"]}\n```';
  const r = parseRecap(reply, 'cloud', 5)!;
  assert.equal(r.summary, 'We set the schedule.');
  assert.deepEqual(r.actionItems, [{ text: 'Send schedule', owner: 'Dana' }, { text: 'Bring mic stands' }]);
  assert.deepEqual(r.decisions, ['Rehearsal at 6:30']);
  assert.equal(parseRecap('no json here', 'local'), null);
  assert.equal(parseRecap('{"summary":""}', 'local'), null);
});

test('long transcripts are trimmed from the middle for the model', () => {
  const lines = Array.from({ length: 2000 }, (_, i) => L('a', 'Dana', i * 30_000, `Point number ${i} about the budget and volunteers.`));
  const prompt = recapUserPrompt('Board', lines, 4000);
  assert.ok(prompt.length < 4300);
  assert.match(prompt, /middle of the meeting trimmed/);
  assert.match(prompt, /Point number 0 /);
  assert.match(prompt, /Point number 1999 /);
});
