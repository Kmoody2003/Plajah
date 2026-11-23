import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrgHiddenSections, presetHidden, SIDEBAR_SECTIONS, SIDEBAR_PRESETS, groupSections } from '../services/orgSidebarLayout';

describe('org default sidebar layout', () => {
  const layout = { enabled: true, hidden: ['GAMES', 'MOVIES_TV', 'NOT_A_SECTION'] };

  it('off or missing layout leaves the person’s own sidebar alone', () => {
    assert.equal(resolveOrgHiddenSections(undefined, { mode: 'org' }), null);
    assert.equal(resolveOrgHiddenSections({ enabled: false, hidden: ['GAMES'] }, { mode: 'org' }), null);
  });

  it('org mode hides the org’s off sections (unknown ids ignored)', () => {
    const h = resolveOrgHiddenSections(layout, { mode: 'org' })!;
    assert.deepEqual([...h].sort(), ['GAMES', 'MOVIES_TV']);
  });

  it('“mine” restores the personal sidebar; “custom” uses the person’s own list', () => {
    assert.equal(resolveOrgHiddenSections(layout, { mode: 'mine' }), null);
    assert.deepEqual([...resolveOrgHiddenSections(layout, { mode: 'custom', hidden: ['CHAT'] })!], ['CHAT']);
  });

  it('presets turn everything else off', () => {
    assert.deepEqual(presetHidden('all'), []);
    const minimal = SIDEBAR_PRESETS.find(p => p.key === 'minimal')!;
    const hidden = presetHidden(minimal.visible);
    assert.equal(hidden.length, SIDEBAR_SECTIONS.length - (minimal.visible as string[]).length);
    assert.ok(!hidden.includes('FEED'));
  });

  it('every section has a unique id and lands in a group', () => {
    const ids = SIDEBAR_SECTIONS.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(groupSections().flatMap(g => g.items).length, ids.length);
  });
});
