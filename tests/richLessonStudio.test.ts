import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeededRichLesson, LESSON_STUDIO_LEARNERS, LESSON_TEMPLATES } from '../data/richLessonStudio';
import { richLessonDemoStore } from '../data/richLessonDemoStore';

test('rich lesson seed binds sources, standards, rubric, media blocks and learners', () => {
  const lesson = buildSeededRichLesson();
  assert.equal(lesson.sources.length, 6);
  assert.equal(lesson.standards.length, 3);
  assert.equal(lesson.rubric.length, 4);
  assert.ok(lesson.blocks.some(b => b.kind === 'model3d'));
  assert.ok(lesson.blocks.some(b => b.kind === 'data-viz'));
  assert.equal(lesson.personalized.length, LESSON_STUDIO_LEARNERS.length);
  assert.equal(LESSON_TEMPLATES.length, 6);
});

test('personalization changes the invitation while preserving one lesson target', () => {
  const lesson = buildSeededRichLesson();
  const maya = lesson.personalized.find(p => p.learnerId === 'maya')!;
  const diego = lesson.personalized.find(p => p.learnerId === 'diego')!;
  assert.notEqual(maya.invitation, diego.invitation);
  assert.match(diego.scaffold, /Spanish/i);
  assert.match(maya.scaffold, /source shows/i);
  assert.match(lesson.objective, /synthesize/i);
});

test('demo store is mutable during a walkthrough and exactly resettable', () => {
  richLessonDemoStore.reset();
  const initial = richLessonDemoStore.getSnapshot();
  richLessonDemoStore.selectTemplate('field-lab');
  richLessonDemoStore.addSource({ title: 'Teacher interview', kind: 'audio', locator: 'interview.wav' });
  richLessonDemoStore.setStage('personalize');
  const changed = richLessonDemoStore.getSnapshot();
  assert.equal(changed.draft.templateId, 'field-lab');
  assert.equal(changed.draft.sources.length, initial.draft.sources.length + 1);
  assert.equal(changed.stage, 'personalize');
  richLessonDemoStore.reset();
  const reset = richLessonDemoStore.getSnapshot();
  assert.equal(reset.stage, 'advantage');
  assert.equal(reset.draft.templateId, 'cinematic');
  assert.equal(reset.draft.sources.length, 6);
});

