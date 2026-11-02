import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenSanctuaryItem, gatedRef, itemNamesGatedPath, sanctuaryItemOwner } from '../services/sanctuaryMediaCore';
import { trashObjectPath } from '../services/mediaTrashPolicy';

const item = { sanctuaryId: 'o', accessType: 'TIER', url: gatedRef('sanctuaries/o/gallery/a.png') };
test('access follows the rules', () => {
  assert.equal(canOpenSanctuaryItem(item, 'fan', 'o', 'ACTIVE', false), true);
  assert.equal(canOpenSanctuaryItem(item, 'fan', 'o', 'CANCELLED', false), false);
  assert.equal(canOpenSanctuaryItem(item, 'fan', 'o', null, true), true);
  assert.equal(canOpenSanctuaryItem(item, 'o', 'o', null, false), true);
  assert.equal(canOpenSanctuaryItem({ accessType: 'FREE' }, 'x', 'o', null, false), true);
  assert.equal(canOpenSanctuaryItem(item, '', 'o', null, false), false);
});
test('an item only opens the file it names, inside its owner folder', () => {
  assert.equal(itemNamesGatedPath(item, 'o', 'sanctuaries/o/gallery/a.png'), true);
  assert.equal(itemNamesGatedPath(item, 'o', 'sanctuaries/o/gallery/b.png'), false);
  const forged = { sanctuaryId: 'evil', url: gatedRef('sanctuaries/o/gallery/a.png') };
  assert.equal(itemNamesGatedPath(forged, 'evil', 'sanctuaries/o/gallery/a.png'), false);
  assert.equal(itemNamesGatedPath({ url: gatedRef('sanctuaries/o/../x') }, 'o', 'sanctuaries/o/../x'), false);
  assert.equal(itemNamesGatedPath({ attachments: [{ url: gatedRef('sanctuaries/o/p.png') }] }, 'o', 'sanctuaries/o/p.png'), true);
});
test('owner field by collection', () => {
  assert.equal(sanctuaryItemOwner('sanctuaryContent', { creatorId: 'c' }), 'c');
  assert.equal(sanctuaryItemOwner('users', { creatorId: 'c' }), '');
});
test('trash moves objects outside any public path', () => {
  assert.equal(trashObjectPath('album_1', 'albums/x/a.mp3'), 'media-trash/album_1/albums/x/a.mp3');
});
