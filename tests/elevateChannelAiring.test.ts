import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { airedProgramsInWindow, pickServiceProgram, programMediaUrl } from '../services/elevateChannelAiring';
import type { FastChannelSchedule, FastChannelSlot } from '../types';

const video = (id: string, title: string, sec: number, url: string): FastChannelSlot =>
  ({ id, type: 'VIDEO', order: 0, videoTitle: title, videoUrl: url, videoDurationSeconds: sec } as FastChannelSlot);

// A day-anchored channel on New York time: 19h of other programming, a 2-minute
// ad break at 7:00pm, the 75-minute service from 7:02pm, then filler to midnight.
const schedule = {
  timezone: 'America/New_York',
  slots: [
    video('a', 'Morning shows', 68400, 'https://stream.mux.com/morningId.m3u8'),
    { id: 'ad', type: 'AD_BREAK', order: 1, adDurationSeconds: 120 } as FastChannelSlot,
    video('svc', 'Sunday Service', 4500, 'https://stream.mux.com/serviceId.m3u8'),
    video('b', 'Late night', 13380, 'https://cdn.example.com/late.mp4'),
  ],
} as unknown as FastChannelSchedule;

// Tue 2026-11-03, 7:00–8:05pm EST (UTC-5, after daylight saving ended).
const start = Date.parse('2026-11-03T19:00:00-05:00');
const end = Date.parse('2026-11-03T20:05:00-05:00');

describe('Event Intelligence — what aired on a TV channel', () => {
  it('picks the service, not the ad break before it', () => {
    const aired = airedProgramsInWindow(schedule, start, end);
    const pick = pickServiceProgram(aired);
    assert.ok(pick);
    assert.equal(pick.title, 'Sunday Service');
    assert.equal(pick.muxPlaybackId, 'serviceId');
    // 7:02 → 8:05 = 63 minutes on air inside the window.
    assert.equal(Math.round(pick.airedSec / 60), 63);
    assert.equal(programMediaUrl(pick), 'https://stream.mux.com/serviceId.m3u8');
    assert.ok(!aired.some(p => p.title === 'Commercial Break'));
  });

  it('returns nothing when only filler aired briefly', () => {
    const shortStart = Date.parse('2026-11-03T18:58:00-05:00');
    const shortEnd = Date.parse('2026-11-03T19:01:00-05:00');
    assert.equal(pickServiceProgram(airedProgramsInWindow(schedule, shortStart, shortEnd)), null);
  });

  it('uses the raw url for a non-Mux programme', () => {
    const late = airedProgramsInWindow(schedule, Date.parse('2026-11-03T21:00:00-05:00'), Date.parse('2026-11-03T22:00:00-05:00'));
    const pick = pickServiceProgram(late);
    assert.ok(pick);
    assert.equal(programMediaUrl(pick), 'https://cdn.example.com/late.mp4');
  });

  it('handles a missing schedule or an empty window', () => {
    assert.deepEqual(airedProgramsInWindow(null, start, end), []);
    assert.deepEqual(airedProgramsInWindow(schedule, end, start), []);
  });
});
