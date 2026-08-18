import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFilmShowcaseCorpus, FILM_SHOWCASE_TEMPLATE_KEY } from '../services/productionShowcaseTemplate';

test('film showcase is a complete read-only production graph', () => {
  const corpus = buildFilmShowcaseCorpus('showcase_user', 'user', 'Alex Producer', true, 1000);
  assert.equal(corpus.production.isShowcase, true);
  assert.equal(corpus.production.templateKey, FILM_SHOWCASE_TEMPLATE_KEY);
  assert.ok(corpus.members.length >= 10);
  assert.ok(corpus.scenes.length >= 4);
  assert.ok(corpus.schedulePlans[0].status === 'APPROVED');
  assert.ok(corpus.callSheets.some(sheet => sheet.status === 'PUBLISHED'));
  assert.ok(corpus.breakdownElements.some(element => element.status === 'BLOCKED'));
  assert.ok(corpus.productionActions.some(action => action.trigger === 'SAFETY_ALERT'));
  assert.ok(corpus.dprs.some(report => report.status === 'FINAL'));
});

test('copied showcase rewrites every production-owned reference', () => {
  const corpus = buildFilmShowcaseCorpus('copy_123', 'owner', 'Owner', false, 2000);
  const ownedRows = [
    ...corpus.schedulePlans, ...corpus.breakdownElements, ...corpus.decisions, ...corpus.alerts,
    ...corpus.productionActions, ...corpus.recipientDeliveries,
  ];
  assert.equal(corpus.production.isShowcase, false);
  assert.ok(ownedRows.every(row => row.productionId === 'copy_123'));
  assert.ok(corpus.callSheets.every(sheet => sheet.prodId === 'copy_123'));
  assert.ok(corpus.dprs.every(report => report.prodId === 'copy_123'));
  const sceneIds = new Set(corpus.scenes.map(scene => scene.id));
  assert.ok(corpus.schedulePlans[0].strips.every(strip => !strip.sceneId || sceneIds.has(strip.sceneId)));
  assert.ok(corpus.breakdownElements.flatMap(element => element.occurrences).every(occurrence => sceneIds.has(occurrence.sceneId)));
});
