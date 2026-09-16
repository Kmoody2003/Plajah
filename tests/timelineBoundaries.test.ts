import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timelineBoundaries, crossedTimelineBoundary} from '../services/fabula/timelineBoundaries';

test('fractional cut never fires early due to millisecond rounding', () => {
  const cut = 3.5484;
  const bounds=timelineBoundaries([{start:0,duration:cut},{start:cut,duration:4}]);
  assert.equal(crossedTimelineBoundary(bounds,3.547,3.5481),false);
  assert.equal(crossedTimelineBoundary(bounds,3.5481,3.549),true);
  // The old second rounding selected the outgoing clip after detecting the cut.
  assert.ok(Math.round(3.549*29.97)/29.97<cut);
  assert.ok(3.549>=cut);
});
test('reverse playback leaves a cut exactly once, after moving below it', () => {
  assert.equal(crossedTimelineBoundary([0,5,10],5.1,5),false);
  assert.equal(crossedTimelineBoundary([0,5,10],5,4.9),true);
  assert.equal(crossedTimelineBoundary([0,5,10],4.9,4.8),false);
});
test('a stalled UI crossing several cuts still requests an update', () => {
  assert.equal(crossedTimelineBoundary([0,1,2,3],0.9,3.1),true);
  assert.equal(crossedTimelineBoundary([0,1,2,3],2.1,2.2),false);
});
