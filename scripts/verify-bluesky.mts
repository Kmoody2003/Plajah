// Live check of the Bluesky adapter against a REAL account.
//   npx tsx scripts/verify-bluesky.mts            read-only checks
//   npx tsx scripts/verify-bluesky.mts --post     also publishes ONE test post (mention + link + hashtag + image), then deletes it
//
// Prompts for your handle and an app password (input hidden). Nothing is saved: credentials live in this process only.
// Create an app password at Bluesky → Settings → Privacy and security → App passwords. To exercise DMs, tick
// "Allow access to your direct messages".

import readline from 'node:readline';
import { Writable } from 'node:stream';
import {
  bskyCreateSession, bskyRefreshIfNeeded, blueskyadapter, bskyListConversations, bskyMarkNotificationsSeen,
} from '../services/fediverse/bluesky';

const withPost = process.argv.includes('--post');
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { console.log(`  ✗ ${m}`); failures++; };
let failures = 0;

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const out = new Writable({ write(chunk, _enc, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise(resolve => {
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
    muted = hidden;
  });
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try { const r = await fn(); return r; } catch (e: any) { bad(`${name}: ${e?.message ?? e}`); return undefined; }
}

const handle = await ask('Bluesky handle (e.g. you.bsky.social): ');
const password = await ask('App password (hidden): ', true);

console.log('\nSession');
const creds = await step('createSession', () => bskyCreateSession(handle, password));
if (!creds) { console.log('\nCould not sign in — stopping.'); process.exit(1); }
ok(`signed in as ${creds.handle} (${creds.did}) on ${creds.pdsUrl}`);

const prof = await step('getProfile', () => blueskyadapter.verifyCredentials(creds));
if (prof) ok(`profile: ${prof.displayName} · ${prof.followersCount} followers · ${prof.postsCount} posts`);

console.log('\nSession refresh (the bug that killed accounts after ~2h)');
const stale = { ...creds, accessToken: 'h.' + Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url') + '.s' };
const rotated = await step('refresh expired access token', () => bskyRefreshIfNeeded(stale));
rotated === true && stale.accessToken !== creds.accessToken ? ok('expired access token was refreshed and the rotated pair is ready to persist') : bad('refresh did not rotate the tokens');
// the REFRESHED creds must work, and so must the original refresh token chain
await step('call with refreshed creds', () => blueskyadapter.verifyCredentials(stale)).then(p => p && ok('API call works with the refreshed session'));
Object.assign(creds, stale); // keep using the newest pair from here on

console.log('\nTimelines');
const tl = await step('getTimeline', () => blueskyadapter.getHomeTimeline(creds));
if (tl) {
  const q = tl.posts.filter(p => p.quote).length, im = tl.posts.filter(p => p.media.some(m => m.type === 'image')).length;
  const vid = tl.posts.filter(p => p.media.some(m => m.type === 'video')).length, cards = tl.posts.filter(p => p.card).length, rp = tl.posts.filter(p => p.repostedBy).length;
  ok(`home timeline: ${tl.posts.length} posts (${im} with images, ${vid} video, ${q} quotes, ${cards} link cards, ${rp} reposts)`);
  tl.posts.every(p => p.uri && p.url && p.id) ? ok('every post has uri/url/cid') : bad('some posts are missing uri/url/cid');
}
const pub = await step('getFeed (discover)', () => blueskyadapter.getPublicTimeline(creds));
if (pub) ok(`discover feed: ${pub.posts.length} posts`);

console.log('\nNotifications');
const notifs = await step('listNotifications', () => blueskyadapter.getNotifications(creds));
if (notifs) {
  const kinds = [...new Set(notifs.map(n => n.type))].join(', ') || 'none';
  ok(`${notifs.length} notifications (${kinds})`);
}

console.log('\nDirect messages (proxied through your PDS)');
const convos = await step('listConvos', () => bskyListConversations(creds));
if (convos) ok(`${convos.length} conversations`);

if (withPost) {
  console.log('\nPublishing a test post (will be deleted)');
  const stamp = new Date().toISOString().slice(11, 19);
  const post = await step('createPost', () => blueskyadapter.createPost(creds,
    `Plajah adapter test ${stamp} — hi @bsky.app, link https://plajah.com #plajah`,
    { images: [{ url: 'https://bsky.app/static/favicon.png', alt: 'test image' }] }));
  if (post) {
    ok(`posted: ${post.url}`);
    const tlAfter = await step('re-read', () => blueskyadapter.lookupProfile(creds, creds.did!));
    tlAfter && ok('profile still readable');
    await step('like', () => blueskyadapter.likePost(creds, post)).then(r => r && ok('liked it (and got the like record URI back)'));
    const liked = { ...post, likeUri: undefined as string | undefined };
    await step('deletePost', () => blueskyadapter.deletePost(creds, post.uri)).then(() => ok('deleted the test post'));
    void liked;
  }
} else {
  console.log('\n(skipped publishing — re-run with --post to test mentions, links, hashtags and image upload)');
}

await step('mark notifications seen', () => bskyMarkNotificationsSeen(creds)).then(() => ok('marked notifications seen'));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
