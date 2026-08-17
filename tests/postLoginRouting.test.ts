import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePostLoginDefaultView } from '../services/postLoginRouting';

test('new UX opens the signed-in profile on desktop after login', () => {
  assert.equal(
    resolvePostLoginDefaultView({ isTV: false, isMobileDevice: false, shellNextEnabled: true }),
    'USER_PROFILE'
  );
});

test('classic UX keeps desktop users on dashboard after login', () => {
  assert.equal(
    resolvePostLoginDefaultView({ isTV: false, isMobileDevice: false, shellNextEnabled: false }),
    'DASHBOARD'
  );
});

test('mobile users still land on music after login', () => {
  assert.equal(
    resolvePostLoginDefaultView({ isTV: false, isMobileDevice: true, shellNextEnabled: true }),
    'MUSIC'
  );
});
