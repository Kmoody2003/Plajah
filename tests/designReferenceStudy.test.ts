import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesignReferenceStudy, studyToTelaTemplate } from '../services/aria/designReferenceStudy';
import { instantiateTelaTemplate } from '../services/telaCreativeEngine';

const study = {
  title: 'Measured warmth', accurateDescription: 'An asymmetrical editorial page with a quiet field and a strong vermilion marker.',
  observedEvidence: ['Large outer margin'], artisticInterpretation: 'Restraint makes the accent feel ceremonial.',
  historicalContexts: [], museumConnections: [], uncertainty: ['Warm lighting may shift the neutral.'],
  palette: [
    { hex: '#F4EBDD', name: 'Paper', role: 'BACKGROUND' },
    { hex: '#241E2B', name: 'Ink', role: 'TEXT' },
    { hex: '#D4472F', name: 'Marker', role: 'ACCENT' },
  ],
  designLanguage: { principles: ['asymmetry'], typography: 'Humanist serif', composition: 'Offset column', shapeAndImage: 'Sparse', textureAndMaterial: 'Paper', accessibility: ['Keep body contrast above 4.5:1'], avoid: ['Do not copy the photographed mark'] },
  template: { name: 'Measured Editorial', category: 'DOCUMENT', width: 816, height: 1056, tone: 'EDITORIAL', creativeBrief: 'Build a transformed editorial system.' },
};

test('normalizes a valid reference study and creates native Tela objects', () => {
  const normalized = normalizeDesignReferenceStudy(study);
  assert.ok(normalized);
  const template = studyToTelaTemplate(normalized!);
  assert.equal(template.category, 'DOCUMENT');
  assert.deepEqual(template.palette, ['#F4EBDD', '#241E2B', '#D4472F']);
  assert.ok(instantiateTelaTemplate(template).every(object => !object.sourceImageSrc));
});

test('rejects studies without a usable palette', () => {
  assert.equal(normalizeDesignReferenceStudy({ ...study, palette: [{ hex: 'red' }] }), null);
});
