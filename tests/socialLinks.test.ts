import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSocialLinks, invalidProfileLinks, normalizePublicProfileUrl } from '../services/socialLinks';

test('normalizes public URLs and rejects unsafe schemes and credentials', () => {
  assert.equal(normalizePublicProfileUrl('open.spotify.com/artist/abc'), 'https://open.spotify.com/artist/abc');
  assert.equal(normalizePublicProfileUrl('javascript:alert(1)'), '');
  assert.equal(normalizePublicProfileUrl('https://user:pass@example.com/private'), '');
  assert.equal(normalizePublicProfileUrl('not a url'), '');
});

test('resolves legacy social handles and new discovery destinations together', () => {
  const links = getSocialLinks({
    xHandle: '@plajah', xUrl: '', mastodonHandle: '', mastodonInstance: '', blueskyHandle: '', threadsHandle: '',
    socialLinks: {
      spotify: 'https://open.spotify.com/artist/abc#section',
      appleMusic: 'music.apple.com/us/artist/example/123',
      amazonMusic: 'https://music.amazon.com/artists/example',
      instagram: 'https://instagram.com/plajah',
    },
  });
  assert.deepEqual(links.map(link => link.platform), ['x', 'instagram', 'spotify', 'appleMusic', 'amazonMusic']);
  assert.equal(links.find(link => link.platform === 'spotify')?.url, 'https://open.spotify.com/artist/abc');
});

test('reports only populated invalid fields', () => {
  assert.deepEqual(invalidProfileLinks({ website: '', spotify: 'javascript:alert(1)', appleMusic: 'music.apple.com/artist/1' }), ['Spotify']);
});
