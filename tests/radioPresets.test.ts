import test from 'node:test';
import assert from 'node:assert/strict';
import { getRadioPresets, addRadioPreset, removeRadioPreset, isRadioPreset, toggleRadioPreset } from '../services/radioPresetsService';

test('Radio presets service adds, checks, and removes presets in localStorage', async () => {
  // Mock window & localStorage in node test environment
  const store = new Map<string, string>();
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };

  const testUid = 'test-user-123';
  assert.equal(isRadioPreset('station-1', testUid), false);

  // Add station-1
  await addRadioPreset({
    id: 'station-1',
    name: 'Jazz 24',
    detail: 'Worldwide · Jazz',
    origin: 'Worldwide',
  }, testUid);

  assert.equal(isRadioPreset('station-1', testUid), true);
  const presets = getRadioPresets(testUid);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].name, 'Jazz 24');

  // Toggle station-1 off
  const { isPreset } = await toggleRadioPreset({
    id: 'station-1',
    name: 'Jazz 24',
    origin: 'Worldwide',
  }, testUid);
  assert.equal(isPreset, false);
  assert.equal(isRadioPreset('station-1', testUid), false);
  assert.equal(getRadioPresets(testUid).length, 0);
});
