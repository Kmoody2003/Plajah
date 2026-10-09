// Pure-logic tests for the creator-course layer (templates, readiness, earnings, promo kit).
//
//   npx tsx --test tests/creatorCourses.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_TEMPLATES, PLATFORM_CUT, buildPromoKit, courseStats, generatedCover, money, readiness, skeletonFor, syllabusFrom, templateById,
} from '../services/creatorCourses';

const base = { title: 'Make your first beat', description: 'x'.repeat(80), thumbnailUrl: 'u', lessons: [], assignments: [], tagline: 'From blank to track', outcomes: ['a', 'b', 'c'], price: 0, format: 'SELF_PACED' as const, startDate: undefined };

test('every template builds a non-empty skeleton with a free preview first lesson', () => {
  for (const t of COURSE_TEMPLATES) {
    const sk = skeletonFor(t, 'beats');
    assert.equal(sk.lessons.length, t.sections.length * t.lessonsPerSection, t.id);
    assert.equal(sk.lessons[0].preview, true);
    assert.deepEqual(sk.lessons.map(l => l.order), sk.lessons.map((_, i) => i + 1));
  }
  assert.equal(templateById('nope').id, 'blank');
});

test('syllabus groups lessons by section in order', () => {
  const sk = skeletonFor(templateById('workshop'), 'x');
  const text = syllabusFrom(sk.lessons);
  assert.ok(text.startsWith('Week 1\n'));
  assert.ok(text.indexOf('Week 2') > text.indexOf('Week 1'));
});

test('readiness: a shell with no lesson content cannot publish', () => {
  const sk = skeletonFor(templateById('mini'), 'x');
  const shell = readiness({ ...base, lessons: sk.lessons });
  assert.equal(shell.ready, false);
  const filled = readiness({ ...base, lessons: sk.lessons.map(l => ({ ...l, contentUrl: 'https://v/1' })), assignments: sk.assignments });
  assert.equal(filled.ready, true);
  assert.ok(filled.score > shell.score);
});

test('readiness: cohort needs a start date', () => {
  const r = readiness({ ...base, format: 'COHORT' });
  assert.equal(r.items.find(i => i.id === 'when')!.done, false);
  assert.equal(readiness({ ...base, format: 'COHORT', startDate: Date.now() }).items.find(i => i.id === 'when')!.done, true);
});

test('earnings: 5% platform cut, owner and free courses never count', () => {
  const s = courseStats({ price: 100, enrolledStudents: ['o', 'a', 'b'], ownerId: 'o', capacity: 5 });
  assert.equal(s.learners, 2);
  assert.equal(s.gross, 200);
  assert.equal(s.fee, 200 * PLATFORM_CUT);
  assert.equal(s.net, 190);
  assert.equal(s.seatsLeft, 3);
  assert.equal(courseStats({ price: 0, enrolledStudents: ['a'], ownerId: 'o', capacity: 0 }).gross, 0);
  assert.equal(courseStats({ price: 0, enrolledStudents: [], ownerId: 'o', capacity: 0 }).seatsLeft, null);
});

test('money formats free and cents', () => {
  assert.equal(money(0), 'Free');
  assert.equal(money(49), '$49');
  assert.equal(money(19.5), '$19.50');
});

test('promo kit carries the link everywhere and never invents a date for self-paced', () => {
  const url = 'https://plajah.com/?course=abc';
  const k = buildPromoKit({ title: 'T', tagline: 'tag', description: 'd', price: 29, format: 'SELF_PACED', startDate: Date.now(), outcomes: ['x'], ownerName: 'Kay', capacity: 0 }, url);
  assert.ok(k.social.every(p => p.text.includes(url)));
  assert.ok(k.emailBody.includes(url));
  assert.ok(!k.social[0].text.includes('Starts'));
  const c = buildPromoKit({ title: 'T', tagline: 'tag', description: 'd', price: 0, format: 'COHORT', startDate: Date.now() + 864e5, outcomes: [], ownerName: 'Kay', capacity: 10 }, url);
  assert.ok(c.social[0].text.includes('Starts'));
  assert.ok(c.social[0].text.includes('10 seats'));
});

test('generated cover is a valid, escaped SVG data URI', () => {
  const uri = generatedCover('Fish & <Chips> "now"', '🎵', 'ember');
  assert.ok(uri.startsWith('data:image/svg+xml'));
  const svg = decodeURIComponent(uri.split(',')[1]);
  assert.ok(svg.includes('Fish &amp; &lt;Chips&gt;'));
  assert.ok(!svg.includes('<Chips>'));
});

import { completion, lessonMedia } from '../services/creatorCourses';

test('lessonMedia embeds only official https players and never raw http', () => {
  assert.deepEqual(lessonMedia('https://youtu.be/dQw4w9WgXcQ'), { kind: 'iframe', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0' });
  assert.equal((lessonMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3') as any).src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
  assert.equal((lessonMedia('https://vimeo.com/123456789') as any).src, 'https://player.vimeo.com/video/123456789');
  assert.equal(lessonMedia('https://cdn.x.com/a/lesson.mp4').kind, 'video');
  assert.equal(lessonMedia('https://example.com/page').kind, 'link');
  assert.equal(lessonMedia('http://youtu.be/dQw4w9WgXcQ').kind, 'none');
  assert.equal(lessonMedia('javascript:alert(1)').kind, 'none');
  assert.equal(lessonMedia('https://www.youtube.com/watch?v="><script>').kind, 'link');
  assert.equal(lessonMedia('').kind, 'none');
});

test('completion counts only lessons that still exist and needs every one', () => {
  assert.deepEqual(completion(['a', 'b', 'c'], ['a', 'gone']), { done: 1, total: 3, pct: 33, complete: false });
  assert.equal(completion(['a', 'b'], ['b', 'a']).complete, true);
  assert.equal(completion([], ['a']).complete, false);
});
