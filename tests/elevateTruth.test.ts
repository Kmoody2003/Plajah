import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { churchTradition, churchVocabulary, isDemoOrg, traditionAllows } from '../services/elevateTruth';

describe('Elevate truth & tradition rules', () => {
  it('treats only the demo church as demo', () => {
    assert.equal(isDemoOrg({ id: 'demo-grace-chapel' }), true);
    assert.equal(isDemoOrg({ id: 'abc', isDemo: true }), true);
    assert.equal(isDemoOrg({ id: 'real-church' }), false);
  });

  it('reads tradition from the denomination', () => {
    assert.equal(churchTradition({ denomination: 'Non-denominational' }), 'CONTEMPORARY');
    assert.equal(churchTradition({ denomination: 'Baptist' }), 'CONTEMPORARY');
    assert.equal(churchTradition({ denomination: 'Roman Catholic' }), 'CATHOLIC');
    assert.equal(churchTradition({ denomination: 'Greek Orthodox' }), 'ORTHODOX');
    assert.equal(churchTradition({ denomination: 'Episcopal' }), 'LITURGICAL_PROTESTANT');
  });

  it('keeps Catholic and Orthodox phrasing out of contemporary churches', () => {
    const v = churchVocabulary({ denomination: 'Non-denominational' });
    assert.equal(v.showTraditionalPrayers, false);
    assert.doesNotMatch(Object.values(v).join(' '), /Vespers|Lauds|Examen|Mass|Divine Liturgy/);
  });

  it('tailors tradition-specific assets to the church unless the member chose every tradition', () => {
    assert.equal(traditionAllows('CATHOLIC', 'CONTEMPORARY'), false);
    assert.equal(traditionAllows('EASTERN_ORTHODOX', 'CATHOLIC'), false);
    assert.equal(traditionAllows('CATHOLIC', 'CATHOLIC'), true);
    assert.equal(traditionAllows('ECUMENICAL_HYMN', 'CONTEMPORARY'), true);
    assert.equal(traditionAllows('CATHOLIC', 'CONTEMPORARY', 'ALL'), true);
    assert.equal(traditionAllows('EASTERN_ORTHODOX', 'CONTEMPORARY', 'ALL'), true);
  });
});
