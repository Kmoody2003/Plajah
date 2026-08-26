import test from 'node:test';
import assert from 'node:assert/strict';
import { isEducationSafeArtwork } from '../services/artMuseumService';

const work = (title: string, medium: string, contentTags: string[] = []) => ({ title, medium, contentTags });

test('education art safety rejects nudity, sexual context, and the human form', () => {
  assert.equal(isEducationSafeArtwork(work('Reclining Nude', 'Oil on canvas', ['Painting'])), false);
  assert.equal(isEducationSafeArtwork(work('Marble torso', 'Marble sculpture', ['Human figure'])), false);
  assert.equal(isEducationSafeArtwork(work('Landscape with Bathers', 'Oil on canvas', ['Landscape'])), false);
  assert.equal(isEducationSafeArtwork(work('Venus in a Garden', 'Oil on canvas', ['Flowers'])), false);
  assert.equal(isEducationSafeArtwork(work('Family Portrait', 'Oil on canvas', ['Portraits'])), false);
});

test('education art safety only admits positively safe non-human subjects', () => {
  assert.equal(isEducationSafeArtwork(work('Water Lilies', 'Oil on canvas', ['Landscape', 'Flowers'])), true);
  assert.equal(isEducationSafeArtwork(work('Geometric Composition', 'Oil on canvas', ['Abstract'])), true);
  assert.equal(isEducationSafeArtwork(work('Untitled', 'Oil on canvas', ['Painting'])), false);
});
