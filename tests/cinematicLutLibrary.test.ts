import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CINEMATIC_LUTS,
  type CinematicLut,
  getLutById,
  generate3dCubeText,
  lutToCssFilter,
  applyLutToRgba,
} from '../services/color/cinematicLutLibrary';
import { imageFilter, NEUTRAL_ADJUST } from '../components/tela/TelaImage';

test('Cinematic LUT Library: Hosts at least 24 Master Camera and Film LUTs', () => {
  assert.ok(CINEMATIC_LUTS.length >= 24, `Expected >= 24 LUTs, found ${CINEMATIC_LUTS.length}`);

  const ids = new Set<string>();
  for (const lut of CINEMATIC_LUTS) {
    assert.ok(lut.id, 'LUT must have an id');
    assert.ok(!ids.has(lut.id), `Duplicate LUT id found: ${lut.id}`);
    ids.add(lut.id);

    assert.ok(lut.name, `LUT ${lut.id} must have a name`);
    assert.ok(lut.description, `LUT ${lut.id} must have a description`);
    assert.ok(lut.accentColor, `LUT ${lut.id} must have an accent color`);
    assert.ok(lut.category, `LUT ${lut.id} must have a category`);
    assert.ok(lut.categoryLabel, `LUT ${lut.id} must have a category label`);

    // Tone Curve validation
    const tc = lut.toneCurve;
    assert.ok(typeof tc.contrast === 'number');
    assert.ok(typeof tc.saturation === 'number');
    assert.ok(typeof tc.warmth === 'number');
    assert.ok(typeof tc.tint === 'number');
    assert.ok(typeof tc.highlights === 'number');
    assert.ok(typeof tc.shadows === 'number');
    assert.ok(typeof tc.whites === 'number');
    assert.ok(typeof tc.blacks === 'number');
    assert.ok(typeof tc.fade === 'number');

    // Transfer function validation
    const testRgb: [number, number, number] = [0.5, 0.5, 0.5];
    const out = lut.rgbTransfer(testRgb[0], testRgb[1], testRgb[2]);
    assert.equal(out.length, 3);
    assert.ok(out[0] >= 0 && out[0] <= 1, `Red out of range: ${out[0]}`);
    assert.ok(out[1] >= 0 && out[1] <= 1, `Green out of range: ${out[1]}`);
    assert.ok(out[2] >= 0 && out[2] <= 1, `Blue out of range: ${out[2]}`);
  }
});

test('Cinematic LUT Library: getLutById correctly resolves profiles', () => {
  const arri = getLutById('arri_logc_rec709');
  assert.ok(arri);
  assert.equal(arri?.name, 'ARRI Alexa LogC → Rec.709 Master');
  assert.equal(arri?.category, 'camera_profile');

  const kodak = getLutById('kodak_2383_print');
  assert.ok(kodak);
  assert.equal(kodak?.name, 'Kodak Vision 2383 Print Film');
  assert.equal(kodak?.category, 'film_stock');

  const deakins = getLutById('deakins_warm_tungsten');
  assert.ok(deakins);
  assert.equal(deakins?.name, 'Roger Deakins Naturalist Tungsten');
  assert.equal(deakins?.category, 'director_look');

  const trix = getLutById('kodak_tri_x_400');
  assert.ok(trix);
  assert.equal(trix?.name, 'Kodak Tri-X 400 Street Monochrome');
  assert.equal(trix?.category, 'monochrome');

  const interstellar = getLutById('deep_space_interstellar');
  assert.ok(interstellar);
  assert.equal(interstellar?.category, 'creative_scifi');

  const unknown = getLutById('non_existent_lut_xyz');
  assert.equal(unknown, undefined);
});

test('Cinematic LUT Library: Procedural 3D .cube generator creates Adobe/Resolve compliant files', () => {
  const lut = getLutById('kodak_portra_400')!;
  assert.ok(lut);

  const cubeSize = 17;
  const cubeText = generate3dCubeText(lut, cubeSize);

  assert.ok(cubeText.includes('LUT_3D_SIZE 17'));
  assert.ok(cubeText.includes('DOMAIN_MIN 0.0 0.0 0.0'));
  assert.ok(cubeText.includes('DOMAIN_MAX 1.0 1.0 1.0'));
  assert.ok(cubeText.includes(`Title: "${lut.name}"`));

  const lines = cubeText.split('\n');
  const dataLines = lines.filter((l) => /^\d+\.\d{6}\s+\d+\.\d{6}\s+\d+\.\d{6}$/.test(l.trim()));
  const expectedPoints = cubeSize * cubeSize * cubeSize; // 4913
  assert.equal(dataLines.length, expectedPoints, `Expected ${expectedPoints} 3D grid points`);

  // Verify first point (black 0,0,0) and last point (white 1,1,1)
  const firstCoords = dataLines[0].split(' ').map(Number);
  assert.ok(firstCoords[0] >= 0 && firstCoords[0] <= 0.15);
  assert.ok(firstCoords[1] >= 0 && firstCoords[1] <= 0.15);
  assert.ok(firstCoords[2] >= 0 && firstCoords[2] <= 0.15);

  const lastCoords = dataLines[dataLines.length - 1].split(' ').map(Number);
  assert.ok(lastCoords[0] >= 0.85 && lastCoords[0] <= 1.0);
  assert.ok(lastCoords[1] >= 0.85 && lastCoords[1] <= 1.0);
  assert.ok(lastCoords[2] >= 0.85 && lastCoords[2] <= 1.0);
});

test('Cinematic LUT Library: lutToCssFilter compiles immediate CSS filter strings', () => {
  const lut = getLutById('fuji_eterna_500t')!;
  assert.ok(lut);

  // Full intensity
  const fullFilter = lutToCssFilter(lut, 1.0);
  assert.ok(fullFilter.includes('brightness('));
  assert.ok(fullFilter.includes('contrast('));
  assert.ok(fullFilter.includes('saturate('));

  // Zero intensity should produce neutral unit values
  const zeroFilter = lutToCssFilter(lut, 0.0);
  assert.equal(zeroFilter, 'brightness(1.000) contrast(1.000) saturate(1.000)');

  // Half intensity
  const halfFilter = lutToCssFilter(lut, 0.5);
  assert.ok(halfFilter.length > 0);
  assert.notEqual(halfFilter, zeroFilter);
});

test('Cinematic LUT Library: applyLutToRgba performs fast in-place pixel buffer transform', () => {
  const lut = getLutById('matrix_phosphor_green')!;
  assert.ok(lut);

  // 2x2 RGBA test image: [R, G, B, A]
  const buffer = new Uint8ClampedArray([
    128, 128, 128, 255,  // mid gray
    255, 255, 255, 255,  // white
    0,   0,   0,   255,  // black
    200, 100, 50,  180,  // skin/amber with alpha
  ]);

  applyLutToRgba(buffer, lut, 1.0);

  // Alpha channels must be 100% preserved
  assert.equal(buffer[3], 255);
  assert.equal(buffer[7], 255);
  assert.equal(buffer[11], 255);
  assert.equal(buffer[15], 180);

  // Matrix Phosphor Green should boost Green and attenuate Blue
  assert.ok(buffer[1] > buffer[2], 'Green must dominate Blue in Matrix look');
});

test('TelaImage: Non-destructive imageFilter folds active LUT, warmth and tint', () => {
  // 1. Neutral filter
  const neutral = imageFilter(NEUTRAL_ADJUST);
  assert.equal(neutral, 'brightness(1) contrast(1) saturate(1)');

  // 2. Adjustments with warmth & tint
  const warmFilter = imageFilter({
    ...NEUTRAL_ADJUST,
    warmth: 40,
    tint: -20,
  });
  assert.ok(warmFilter.includes('sepia('));
  assert.ok(warmFilter.includes('hue-rotate('));

  // 3. Adjustments with active cinematic LUT
  const lutFilter = imageFilter({
    ...NEUTRAL_ADJUST,
    activeLutId: 'kodak_2383_print',
    lutStrength: 0.85,
  });
  assert.ok(lutFilter.includes('brightness('));
  assert.ok(lutFilter.includes('contrast('));
  assert.ok(lutFilter.includes('saturate('));
});
