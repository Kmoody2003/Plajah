// amboAutoSaveAndProject.test.ts — Test Suite for Ambo Auto-Save, Project & Settings Persistence
// Run with: npx tsx --test tests/amboAutoSaveAndProject.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultProject,
  validateAmboProject,
  serializeAmboProject,
  deserializeAmboProject,
  DEFAULT_PROJECT_SETTINGS,
  type AmboProject,
} from '../services/ambo/amboProjectModel';
import { saveProjectAs } from '../services/ambo/amboStorageService';

describe('Ambo Project & Settings Auto-Save Contract', () => {
  test('creates default project with standard presentation shows and default settings', () => {
    const project = createDefaultProject('Sunday Service Test', 'USER', 'test-user');
    assert.equal(project.name, 'Sunday Service Test');
    assert.equal(project.scope, 'USER');
    assert.ok(project.shows.length > 0, 'Project has starter shows');
    assert.ok(project.playlist.length > 0, 'Project has starter playlist');
    assert.equal(project.settings.aspectRatio, '16:9');
    assert.equal(project.settings.defaultTransition, 'Cross Dissolve');
  });

  test('validates and preserves custom settings, outputs, and saved assets', () => {
    const customOutputs = [
      { id: 'out_pgm', kind: 'PROGRAM', name: 'Audience Main', enabled: true, width: 3840, height: 2160, aspectRatio: '16:9' },
      { id: 'out_led', kind: 'LED_WALL', name: 'Sanctuary LED Wall', enabled: true, width: 2880, height: 1080, aspectRatio: '21:9' },
    ];
    const savedAssets = [
      { id: 'asset_1', name: 'Background Video 1', kind: 'VIDEO', src: 'https://example.com/loop1.mp4' },
      { id: 'asset_2', name: 'Cross Graphic', kind: 'IMAGE', src: 'https://example.com/cross.png' },
    ];

    const rawProject = {
      format: 'AMBO_PROJECT',
      version: '1.0.0',
      id: 'prj_custom_123',
      name: 'Custom Service',
      scope: 'USER',
      shows: [{ id: 'sh1', title: 'Opening Worship', slides: [] }],
      playlist: [],
      settings: {
        aspectRatio: '21:9',
        defaultTransition: 'Cut',
        transitionDurationSec: 0.5,
        outputPlacement: 'top',
        isBlackout: false,
        isMasterProgramOn: true,
        outputs: customOutputs,
        targetDisplayIndex: 2,
      },
      outputs: customOutputs,
      targetDisplayIndex: 2,
      savedAssets,
    };

    const validation = validateAmboProject(rawProject);
    assert.equal(validation.valid, true);
    assert.ok(validation.project);
    assert.equal(validation.project.settings.aspectRatio, '21:9');
    assert.equal(validation.project.settings.outputPlacement, 'top');
    assert.equal(validation.project.targetDisplayIndex, 2);
    assert.equal(validation.project.outputs?.length, 2);
    assert.equal(validation.project.savedAssets?.length, 2);
  });

  test('serialization and deserialization retains complete project state', () => {
    const original = createDefaultProject('Full Cycle Test');
    original.outputs = [
      { id: 'out_stage', kind: 'STAGE', name: 'Confidence Monitor', enabled: true, width: 1920, height: 1080 } as any,
    ];
    original.savedAssets = [
      { id: 'asset_test', name: 'Test Motion', kind: 'VIDEO', src: 'blob:test' } as any,
    ];
    original.settings.aspectRatio = '16:10';

    const json = serializeAmboProject(original);
    const restored = deserializeAmboProject(json);

    assert.equal(restored.name, 'Full Cycle Test');
    assert.equal(restored.settings.aspectRatio, '16:10');
    assert.equal(restored.outputs?.length, 1);
    assert.equal(restored.outputs?.[0].name, 'Confidence Monitor');
    assert.equal(restored.savedAssets?.length, 1);
    assert.equal(restored.savedAssets?.[0].name, 'Test Motion');
  });

  test('saveProjectAs duplicates project under a new identity and persists', async () => {
    const original = createDefaultProject('Original Gathering');
    const copy = await saveProjectAs(original, 'Evening Service');

    assert.notEqual(copy.id, original.id, 'Copy has unique project ID');
    assert.equal(copy.name, 'Evening Service');
    assert.equal(copy.shows.length, original.shows.length);
    assert.equal(copy.playlist.length, original.playlist.length);
    assert.ok(copy.updatedAt >= original.updatedAt);
  });
});
