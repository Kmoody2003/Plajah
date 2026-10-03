import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOLD_MASTER_TEMPLATES } from '../services/tela/boldTemplateCollection';

describe('bold master template collection', () => {
  it('contains the complete suite of bold, vibrant interpretations across tickets, evites, and promos', () => {
    assert.ok(BOLD_MASTER_TEMPLATES.length >= 8);
    const kinds = new Set(BOLD_MASTER_TEMPLATES.map(t => t.kind));
    assert.ok(kinds.has('ticket'));
    assert.ok(kinds.has('evite'));
    assert.ok(kinds.has('promo'));
  });

  it('provides complete 4-layer segmentation for every master template', () => {
    for (const t of BOLD_MASTER_TEMPLATES) {
      assert.ok(t.segmentation.environment.description.length > 10, `${t.id} missing environment`);
      assert.ok(t.segmentation.heroSubject.name.length > 2, `${t.id} missing hero subject`);
      assert.ok(t.segmentation.kineticOverlays.description.length > 5, `${t.id} missing overlays`);
      assert.ok(t.segmentation.typographyAndData.headline.length > 2, `${t.id} missing typography`);
      assert.ok(t.palette.length === 4, `${t.id} palette must have 4 colors`);
      assert.ok(t.motion.tracks.length > 0, `${t.id} must have motion tracks`);
      assert.ok(t.audio.notes.length >= 4, `${t.id} must have audio notes`);
    }
  });

  it('builds valid Tela vector objects with live layout nodes', () => {
    for (const t of BOLD_MASTER_TEMPLATES) {
      const objects = t.build();
      assert.ok(objects.length >= 5, `${t.id} must have at least 5 vector nodes`);
      const ground = objects.find(o => o.templateRole === 'GROUND');
      assert.ok(ground, `${t.id} must contain a GROUND object`);
      const headline = objects.find(o => o.templateRole === 'HEADLINE');
      assert.ok(headline, `${t.id} must contain a HEADLINE object`);
    }
  });
});
