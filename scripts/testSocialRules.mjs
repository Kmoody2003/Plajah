// Social rules: comments (every composer feature), chat reactions, comment polls, club comments,
// fan-room chat. Evaluated with the Firebase Rules REST `:test` API — read-only, deploys nothing.
// Runs against the compacted deploy artifact so what's tested is what ships.
//   node scripts/minifyRules.mjs firestore.rules <tmp>/firestore.rules.min && node scripts/testSocialRules.mjs <tmp>/firestore.rules.min
import fs from 'node:fs';
import os from 'node:os';
const PROJECT = 'gen-lang-client-0665118474';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const file = process.argv[2] || new URL('../firestore.rules.min', import.meta.url);
const src = fs.readFileSync(file, 'utf8');

const DB = '/databases/(default)/documents';
const ME = 'me', OTHER = 'other', AUTHOR = 'author';
const users = [ME, OTHER, AUTHOR];
const post = { authorId: AUTHOR, orgAudience: 'PUBLIC' };
const room = { participants: [ME, AUTHOR], type: 'GROUP' };
function mocks() {
  const m = [];
  for (const u of users) m.push({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: false } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/posts/p1` }], result: { value: { data: post } } });
  m.push({ function: 'exists', args: [{ exactValue: `${DB}/clubPosts/cp1` }], result: { value: true } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/clubPosts/cp1` }], result: { value: { data: { authorId: AUTHOR } } } });
  m.push({ function: 'exists', args: [{ exactValue: `${DB}/chat_rooms/r1` }], result: { value: true } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/chat_rooms/r1` }], result: { value: { data: room } } });
  return m;
}
const tokenFor = (uid, anon) => ({ uid, token: { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: anon ? 'anonymous' : 'google.com' } } });

const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });
const now = 1_760_000_000_000;
const pc = (o = {}) => ({ author: 'Me', text: 'hi', authorId: ME, authorName: 'Me', authorPhoto: '', uid: ME, timestamp: now, parentId: null, likedBy: [], likesCount: 0, ...o });
const P = `${DB}/posts/p1/comments/c1`;

// posts/{id}/comments — every composer feature
t('text comment', 'ALLOW', ME, 'create', P, { data: pc() });
t('GIF/sticker only', 'ALLOW', ME, 'create', P, { data: pc({ text: '', gifUrl: 'https://g/x.gif' }) });
t('photo only', 'ALLOW', ME, 'create', P, { data: pc({ text: '', imageUrl: 'https://i/x.jpg' }) });
t('video note only', 'ALLOW', ME, 'create', P, { data: pc({ text: '', videoUrl: 'https://v/x.mp4' }) });
t('voice note only', 'ALLOW', ME, 'create', P, { data: pc({ text: '', audioUrl: 'https://a/x.webm' }) });
t('long comment (3000 chars)', 'ALLOW', ME, 'create', P, { data: pc({ text: 'x'.repeat(3000) }) });
t('empty comment', 'DENY', ME, 'create', P, { data: pc({ text: '' }) });
t('signed out', 'DENY', null, 'create', P, { data: pc() });
t('anonymous guest', 'DENY', 'anon:' + ME, 'create', P, { data: pc() });
t('impersonate uid', 'DENY', ME, 'create', P, { data: pc({ uid: OTHER, authorId: OTHER }) });
t('signed-out read', 'ALLOW', null, 'get', P, { existing: pc() });
t('like (own uid +1)', 'ALLOW', OTHER, 'update', P, { existing: pc(), data: pc({ likedBy: [OTHER], likesCount: 1 }) });
t('unlike (own uid -1)', 'ALLOW', OTHER, 'update', P, { existing: pc({ likedBy: [OTHER], likesCount: 1 }), data: pc() });
t('like as someone else', 'DENY', OTHER, 'update', P, { existing: pc(), data: pc({ likedBy: [AUTHOR], likesCount: 1 }) });
t('inflate like count', 'DENY', OTHER, 'update', P, { existing: pc(), data: pc({ likedBy: [OTHER], likesCount: 50 }) });
t('delete own', 'ALLOW', ME, 'delete', P, { existing: pc() });
t('delete others', 'DENY', OTHER, 'delete', P, { existing: pc() });
t('post author deletes', 'ALLOW', AUTHOR, 'delete', P, { existing: pc() });

// albums / articles / books
const lc = (o = {}) => ({ author: 'Me', text: 'nice', timestamp: now, uid: ME, parentId: null, ...o });
t('article comment (no trackId)', 'ALLOW', ME, 'create', `${DB}/articles/a1/comments/c1`, { data: lc() });
t('book comment (trackId album)', 'ALLOW', ME, 'create', `${DB}/albums/b1/comments/c1`, { data: lc({ trackId: 'album' }) });
t('album voice note', 'ALLOW', ME, 'create', `${DB}/albums/b1/comments/c1`, { data: lc({ text: '', trackId: 't1', audioUrl: 'https://a' }) });
t('album comment guest', 'DENY', 'anon:' + ME, 'create', `${DB}/albums/b1/comments/c1`, { data: lc({ trackId: 't1' }) });
t('album comment delete own', 'ALLOW', ME, 'delete', `${DB}/albums/b1/comments/c1`, { existing: lc({ trackId: 't1' }) });

// videos
const vc = (o = {}) => ({ id: 'vcom_1', videoId: 'v1', userId: ME, userName: 'Me', userPhoto: '', text: 'wow', timestamp: now, ...o });
t('video comment photo only', 'ALLOW', ME, 'create', `${DB}/videos/v1/comments/vcom_1`, { data: vc({ text: '', imageUrl: 'https://i' }) });
t('video comment as other', 'DENY', ME, 'create', `${DB}/videos/v1/comments/vcom_1`, { data: vc({ userId: OTHER }) });

// club post comments (had no rule)
t('club comment', 'ALLOW', ME, 'create', `${DB}/clubPosts/cp1/comments/c1`, { data: pc() });
t('club comment read', 'ALLOW', OTHER, 'get', `${DB}/clubPosts/cp1/comments/c1`, { existing: pc() });
t('club commentCount +1', 'ALLOW', OTHER, 'update', `${DB}/clubPosts/cp1`, { existing: { authorId: AUTHOR, commentCount: 2 }, data: { authorId: AUTHOR, commentCount: 3 } });
t('club commentCount +5', 'DENY', OTHER, 'update', `${DB}/clubPosts/cp1`, { existing: { authorId: AUTHOR, commentCount: 2 }, data: { authorId: AUTHOR, commentCount: 7 } });

// comment polls (had no rule)
const poll = { postId: 'p1', creatorId: ME, question: 'Q?', options: ['a', 'b'], votes: { 0: [], 1: [] }, allowMultiple: false, isAnonymous: false, endsAt: null, createdAt: now };
t('create comment poll', 'ALLOW', ME, 'create', `${DB}/polls/x1`, { data: poll });
t('vote on poll', 'ALLOW', OTHER, 'update', `${DB}/polls/x1`, { existing: poll, data: { ...poll, votes: { 0: [OTHER], 1: [] } } });
t('vote adds option', 'DENY', OTHER, 'update', `${DB}/polls/x1`, { existing: poll, data: { ...poll, votes: { 0: [], 1: [], 2: [OTHER] } } });
t('poll as other creator', 'DENY', ME, 'create', `${DB}/polls/x1`, { data: { ...poll, creatorId: OTHER } });

// chat reactions + pins (wrong collection before; no rule for the keys)
const msg = { senderId: AUTHOR, senderName: 'A', text: 'hey', timestamp: now, type: 'TEXT' };
const M = `${DB}/chat_rooms/r1/messages/m1`;
t('react in my room', 'ALLOW', ME, 'update', M, { existing: msg, data: { ...msg, reactions: { '🔥': [ME] } } });
t('pin in my room', 'ALLOW', ME, 'update', M, { existing: msg, data: { ...msg, isPinned: true } });
t('react in a room I left', 'DENY', OTHER, 'update', M, { existing: msg, data: { ...msg, reactions: { '🔥': [OTHER] } } });
t('edit text via reaction path', 'DENY', ME, 'update', M, { existing: msg, data: { ...msg, text: 'changed' } });

// match fan room
const mm = (o = {}) => ({ uid: ME, displayName: 'Me', photoURL: null, text: 'goal?', side: 'home', at: now, ...o });
t('fan chat', 'ALLOW', ME, 'create', `${DB}/wcMatchRooms/x/chat/c1`, { data: mm() });
t('fan chat as other', 'DENY', ME, 'create', `${DB}/wcMatchRooms/x/chat/c1`, { data: mm({ uid: OTHER }) });
t('goal event once', 'ALLOW', ME, 'create', `${DB}/wcMatchRooms/x/chat/evt_goal_1-0`, { data: mm({ uid: 'system', side: null }) });
t('fake system msg', 'DENY', ME, 'create', `${DB}/wcMatchRooms/x/chat/c1`, { data: mm({ uid: 'system' }) });
t('write other member', 'DENY', ME, 'create', `${DB}/wcMatchRooms/x/members/${OTHER}`, { data: { uid: OTHER } });

// halloween vault chat (had no rule)
const hv = { uid: ME, displayName: 'Me', photoURL: null, factionId: 'f', activeFilter: 'x', dimLightsOn: false, text: 'boo', at: now };
t('vault chat', 'ALLOW', ME, 'create', `${DB}/halloweenVaultRooms/main_vault/chat/msg_1`, { data: hv });
t('vault chat guest', 'DENY', 'anon:' + ME, 'create', `${DB}/halloweenVaultRooms/main_vault/chat/msg_1`, { data: hv });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) {
        const anon = c.who.startsWith('anon:');
        req.auth = tokenFor(anon ? c.who.slice(5) : c.who, anon);
      }
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks() };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
let res, out;
for (let attempt = 1; attempt <= 4; attempt++) {
  res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body),
  });
  out = await res.json();
  if (res.status !== 503) break;
  console.warn(`503 from the Rules API (attempt ${attempt}), retrying…`);
  await new Promise(r => setTimeout(r, 4000 * attempt));
}
if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
if (out.issues?.length) console.log('ISSUES', JSON.stringify(out.issues, null, 1).slice(0, 3000));
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
});
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
