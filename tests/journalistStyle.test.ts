import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStyle, checkHeadline, isPassiveSentence } from '../services/journalist/styleChecker';
import { scoreHeadline, makeVariants, tightenTo, searchPreview, SEARCH_TITLE_MAX } from '../services/journalist/headlineTester';

const rules = (t: string) => checkStyle(t).issues.map(i => i.rule);
const find = (t: string, rule: string) => checkStyle(t).issues.filter(i => i.rule === rule);

test('numbers: spell out one through nine, keep numerals for 10+', () => {
  assert.ok(find('The council hired 5 officers.', 'numbers').length === 1);
  assert.equal(find('The council hired 5 officers.', 'numbers')[0].suggestion, 'five');
  assert.equal(find('The council hired 12 officers.', 'numbers').length, 0);
  assert.equal(find('The council hired five officers.', 'numbers').length, 0);
});

test('numbers: exceptions for ages, percent, dollars, times, dates, addresses, labels', () => {
  for (const ok of ['She is 5 years old.', 'Turnout was 8% in the county.', 'It cost $5 to enter.', 'It starts at 7 p.m. sharp.', 'He arrived Oct. 5 for the hearing.', 'Turn on Route 9 near Page 4.', 'It was 3.5 feet deep.', 'Prices rose 4 percent.']) {
    assert.equal(find(ok, 'numbers').length, 0, ok);
  }
});

test('numbers-start: numeral at sentence start flagged, years exempt', () => {
  assert.equal(find('Officials said. 12 people came.', 'numbers-start').length, 1);
  assert.equal(find('Officials said. 2026 was dry.', 'numbers-start').length, 0);
  assert.equal(find('12 people came.', 'numbers-start').length, 1);
});

test('ten-plus spelled out is flagged mid-sentence but not at sentence start or in "tens of"', () => {
  assert.equal(find('The panel heard from twelve witnesses.', 'numerals-for-ten-plus').length, 1);
  assert.equal(find('Twelve witnesses spoke.', 'numerals-for-ten-plus').length, 0);
  assert.equal(find('Tens of thousands marched.', 'numerals-for-ten-plus').length, 0);
});

test('titles: abbreviations and courtesy titles', () => {
  assert.equal(find('Senator Smith voted no.', 'titles')[0].suggestion, 'Sen.');
  assert.equal(find('Governor Jones spoke.', 'titles')[0].suggestion, 'Gov.');
  assert.ok(find('Mrs. Alvarez said hello.', 'titles').length === 1);
  assert.equal(find('Sen. Smith voted no.', 'titles').length, 0);
});

test('dateline: city caps + em dash', () => {
  assert.equal(find('Detroit - The mayor spoke Tuesday.', 'dateline')[0].suggestion, 'DETROIT');
  assert.equal(find('DETROIT - The mayor spoke Tuesday.', 'dateline').length, 1);
  assert.equal(find('DETROIT — The mayor spoke Tuesday.', 'dateline').length, 0);
});

test('attribution: weak verbs, present tense, unattributed quote paragraph', () => {
  assert.equal(find('"We will not move," the mayor stated.', 'attribution')[0].suggestion, 'said');
  assert.equal(find('"We will not move," says the mayor.', 'attribution').length, 1);
  assert.equal(find('"We will not move until the funding is restored for the clinic."', 'attribution').length, 1);
  assert.equal(find('"We will not move until the funding is restored for the clinic," Mayor Lee said.', 'attribution').length, 0);
});

test('passive voice detection and ratio', () => {
  assert.ok(isPassiveSentence('The bill was signed by the governor.').passive);
  assert.ok(!isPassiveSentence('The governor signed the bill.').passive);
  assert.ok(!isPassiveSentence('She was born in Flint.').passive);
  const r = checkStyle('The bill was signed by the governor. The mayor spoke. Funds were cut.');
  assert.equal(r.stats.passiveSentences, 2);
  assert.ok(Math.abs(r.stats.passiveRatio - 2 / 3) < 1e-9);
});

test('months, times, percent, ordinal dates, spacing', () => {
  assert.equal(find('The vote is on October 5.', 'month-abbrev')[0].suggestion, 'Oct.');
  assert.equal(find('The vote is in October.', 'month-abbrev').length, 0);
  assert.equal(find('The vote is Oct. 5th.', 'month-abbrev').length, 1);
  assert.equal(find('Doors open at 7:00 PM.', 'time-format')[0].suggestion, '7 p.m.');
  assert.equal(find('Doors open at 7 p.m.', 'time-format').length, 0);
  assert.equal(find('Rates rose 12 percent.', 'percent')[0].suggestion, '12%');
  assert.equal(find('Two  spaces here.', 'spacing').length, 1);
});

test('clean AP copy produces no warnings', () => {
  const clean = 'DETROIT — Mayor Lee said Tuesday that 12 officers will join the force by Oct. 5. "We need them now," Lee said. The vote is at 7 p.m.';
  const warn = checkStyle(clean).issues.filter(i => i.severity !== 'info');
  assert.deepEqual(warn, []);
});

test('issues are sorted by position and offsets index into the text', () => {
  const t = 'Senator Smith said 5 people came on October 5.';
  const issues = checkStyle(t).issues;
  for (let i = 1; i < issues.length; i++) assert.ok(issues[i].start >= issues[i - 1].start);
  for (const i of issues) assert.equal(t.slice(i.start, i.end), i.match);
});

test('headline checks: length, case, period, clickbait', () => {
  assert.equal(checkHeadline('').some(i => i.severity === 'error'), true);
  assert.equal(checkHeadline('x'.repeat(120)).some(i => i.severity === 'error'), true);
  assert.equal(checkHeadline('A'.repeat(5) + ' ' + 'b'.repeat(70)).some(i => i.rule === 'headline-length' && i.severity === 'warn'), true);
  assert.ok(checkHeadline('CITY COUNCIL VOTES TO CLOSE LIBRARY BRANCH').some(i => i.rule === 'headline-style' && i.severity === 'warn'));
  assert.ok(checkHeadline('Council votes to close library branch.').some(i => /period/.test(i.message)));
  assert.ok(checkHeadline("You won't believe what the council did").some(i => /Clickbait/.test(i.message)));
  assert.deepEqual(checkHeadline('Council votes to close Eastside library branch'), []);
});

test('headline tester: score, variants, tighten, previews', () => {
  assert.ok(scoreHeadline('Council votes to close Eastside library branch').score === 100);
  assert.ok(scoreHeadline('x'.repeat(120)).score < 100);
  const long = 'City Council Votes To Close The Eastside Library Branch After A Very Long Debate: What Residents Need To Know';
  const v = makeVariants(long);
  assert.ok(v.length >= 2 && v[0].id === 'original');
  assert.ok(v.some(x => x.id === 'search' && x.text.length <= SEARCH_TITLE_MAX));
  assert.ok(tightenTo(long, 60).length <= 60);
  assert.ok(!/\b(and|or|of|the)$/i.test(tightenTo('Council votes to close the library and the', 40)));
  assert.equal(searchPreview(long, 'https://x', 'd').titleTruncated, true);
});
