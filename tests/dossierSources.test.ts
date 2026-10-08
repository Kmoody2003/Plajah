import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsRightsFrom, locRightsFrom, searchCommons } from '../services/dossier/sourceAdapters';

test('LoC rights text maps conservatively', () => {
  assert.equal(locRightsFrom('No known restrictions on publication.'), 'public-domain');
  assert.equal(locRightsFrom('Rights status not evaluated.'), 'unknown');
  assert.equal(locRightsFrom('Copyright held by the photographer; permission required'), 'unknown');
  assert.equal(locRightsFrom(undefined), 'unknown');
});

test('Commons licences map; NC/ND never publishable', () => {
  assert.equal(commonsRightsFrom('Public domain'), 'public-domain');
  assert.equal(commonsRightsFrom('CC0'), 'cc0');
  assert.equal(commonsRightsFrom('CC BY-SA 4.0'), 'cc-by-sa');
  assert.equal(commonsRightsFrom('CC BY 4.0'), 'cc-by');
  assert.equal(commonsRightsFrom('CC BY-NC 4.0'), 'unknown');
  assert.equal(commonsRightsFrom('CC BY-ND 2.0'), 'unknown');
  assert.equal(commonsRightsFrom('Fair use'), 'unknown');
});

test('Commons adapter parses a canned response and strips markup', async () => {
  const body = { query: { pages: { 1: { index: 1, pageid: 1, title: 'File:Test portrait.jpg', imageinfo: [{
    mime: 'image/jpeg', url: 'https://upload.wikimedia.org/x.jpg?utm=1', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test_portrait.jpg', width: 10, height: 20,
    extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: '<a href="#">George K. Warren</a>' } } }] } } } };
  const fake = (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
  const [c] = await searchCommons('x', 1, fake);
  assert.equal(c.rights.status, 'public-domain');
  assert.equal(c.creator, 'George K. Warren');
  assert.equal(c.imageUrl, 'https://upload.wikimedia.org/x.jpg');
});
