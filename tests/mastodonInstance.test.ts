// What people type as their Mastodon server → the server origin. A handle used to become https://user@host, which
// fetch() refuses ("Request cannot be constructed from a URL that includes credentials").
// Run: npx tsx --test tests/mastodonInstance.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMastodonInstance as p } from '../services/fediverse/instanceUrl.ts';

test('handles and links all reduce to the server', () => {
  for (const input of [
    'mastodon.social', ' mastodon.social ', 'Mastodon.Social', 'mastodon.social/',
    'https://mastodon.social', 'https://mastodon.social/', 'https://mastodon.social/@KMoody2003',
    'KMoody2003@mastodon.social', '@KMoody2003@mastodon.social', 'mastodon.social/about',
    'https://KMoody2003@mastodon.social', 'https://user:pw@mastodon.social/@x?y=1#z',
  ]) assert.equal(p(input), 'https://mastodon.social', input);
});

test('keeps ports and subdomains, forces https off localhost', () => {
  assert.equal(p('social.example.co.uk:8443'), 'https://social.example.co.uk:8443');
  assert.equal(p('http://mastodon.social'), 'https://mastodon.social');
  assert.equal(p('http://localhost:3000'), 'http://localhost:3000');
});

test('nothing usable → null', () => {
  for (const input of ['', '   ', '@', 'KMoody2003', 'not a server', 'javascript://x', 'ftp://mastodon.social', 'a@'])
    assert.equal(p(input), null, input);
});
