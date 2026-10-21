import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSanctuaryAutoEngage, isWithinServiceWindow } from '../services/churchDevotionalService';
import type { Organization } from '../types';

// Sunday 2026-10-25, 10:20 local time.
const sundayMorning = new Date(2026, 9, 25, 10, 20);
const services: Organization['serviceTimes'] = [{ id: 's1', label: 'Sunday Worship', day: 'Sunday', time: '10:00 AM' }];
const church = (extra: Partial<Organization> = {}) =>
  ({ id: 'real-church', name: 'Hope Church', serviceTimes: services, ...extra }) as Organization;

describe('In-sanctuary detection', () => {
  it('matches only the posted service window', () => {
    assert.equal(isWithinServiceWindow(services, sundayMorning), true);
    assert.equal(isWithinServiceWindow(services, new Date(2026, 9, 25, 15, 0)), false);
    assert.equal(isWithinServiceWindow(services, new Date(2026, 9, 26, 10, 20)), false);
    assert.equal(isWithinServiceWindow([], sundayMorning), false);
  });

  it('never claims presence without the church location and the viewer location', () => {
    const noAnchor = evaluateSanctuaryAutoEngage(church(), { userCoords: { lat: 33.75, lng: -84.39 }, now: sundayMorning });
    assert.equal(noAnchor.autoEngaged, false);
    assert.equal(noAnchor.distanceMeters, null);
    const noViewer = evaluateSanctuaryAutoEngage(church({ geo: { lat: 33.75, lng: -84.39 } } as any), { now: sundayMorning });
    assert.equal(noViewer.autoEngaged, false);
  });

  it('engages when the viewer is at the church during a service', () => {
    const r = evaluateSanctuaryAutoEngage(church({ geo: { lat: 33.75, lng: -84.39 } } as any), {
      userCoords: { lat: 33.7501, lng: -84.3901 },
      now: sundayMorning,
    });
    assert.equal(r.gpsMatched, true);
    assert.equal(r.autoEngaged, true);
  });

  it('keeps simulation available for the demo tour only when asked', () => {
    assert.equal(evaluateSanctuaryAutoEngage(church(), { simulateInSanctuary: true }).autoEngaged, true);
    assert.equal(evaluateSanctuaryAutoEngage(church()).autoEngaged, false);
  });
});
