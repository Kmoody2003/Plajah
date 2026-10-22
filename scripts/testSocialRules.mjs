// Social rules: comments (every composer feature), chat reactions, comment polls, club comments,
// fan-room chat, stories, stream/room chat, call signalling. Evaluated with the Firebase Rules REST `:test` API — read-only, deploys nothing.
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
const ME = 'me', OTHER = 'other', AUTHOR = 'author', PRIV = 'priv';
const users = [ME, OTHER, AUTHOR, PRIV];
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
  m.push({ function: 'get', args: [{ exactValue: `${DB}/live_streams/ls1` }], result: { value: { data: { ownerId: AUTHOR } } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/rooms/rm1` }], result: { value: { data: { hostId: AUTHOR } } } });
  // Private-account lookups (isPrivateAccount): PRIV is private, everyone else public.
  for (const u of users) {
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/users/${u}` }], result: { value: true } });
    m.push({ function: 'get', args: [{ exactValue: `${DB}/users/${u}` }], result: { value: { data: { isPrivate: u === PRIV } } } });
  }
  m.push({ function: 'get', args: [{ exactValue: `${DB}/stories/s1` }], result: { value: { data: { ownerId: ME, audience: 'PUBLIC' } } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/stories/s2` }], result: { value: { data: { ownerId: ME, audience: 'FOLLOWERS', audienceUids: [OTHER] } } } });
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

// stories — Instagram-style audiences
const st = (o = {}) => ({ id: 's1', ownerId: ME, ownerName: 'Me', mediaUrl: 'https://m', mediaType: 'PHOTO', timestamp: now, expiresAt: now + 86400000, audience: 'PUBLIC', isPublic: true, ...o });
const fs_ = (o = {}) => st({ audience: 'FOLLOWERS', isPublic: false, audienceUids: [OTHER], ...o });
const S = `${DB}/stories/s1`;
t('post a public story', 'ALLOW', ME, 'create', S, { data: st() });
t('post followers story', 'ALLOW', ME, 'create', S, { data: fs_() });
t('post close friends story', 'ALLOW', ME, 'create', S, { data: fs_({ audience: 'CLOSE_FRIENDS' }) });
t('private account posts public', 'DENY', PRIV, 'create', S, { data: st({ ownerId: PRIV }) });
t('private account posts to followers', 'ALLOW', PRIV, 'create', S, { data: fs_({ ownerId: PRIV }) });
t('story as someone else', 'DENY', ME, 'create', S, { data: st({ ownerId: OTHER }) });
t('story that never expires', 'DENY', ME, 'create', S, { data: st({ expiresAt: now + 9e12 }) });
t('read public story', 'ALLOW', AUTHOR, 'get', S, { existing: st() });
t('read story signed out', 'DENY', null, 'get', S, { existing: st() });
t('follower reads followers story', 'ALLOW', OTHER, 'get', S, { existing: fs_() });
t('non-follower reads followers story', 'DENY', AUTHOR, 'get', S, { existing: fs_() });
t('owner reads own followers story', 'ALLOW', ME, 'get', S, { existing: fs_() });
t('owner adds approved follower', 'ALLOW', ME, 'update', S, { existing: fs_(), data: fs_({ audienceUids: [OTHER, AUTHOR] }) });
t('viewer adds self to audience', 'DENY', AUTHOR, 'update', S, { existing: fs_(), data: fs_({ audienceUids: [OTHER, AUTHOR] }) });
t('owner extends 24h window', 'DENY', ME, 'update', S, { existing: st(), data: st({ expiresAt: now + 9e9 }) });
t('delete own story', 'ALLOW', ME, 'delete', S, { existing: st() });
t('delete others story', 'DENY', OTHER, 'delete', S, { existing: st() });
const V = (u) => `${DB}/stories/s1/views/${u}`;
t('record my view (public)', 'ALLOW', AUTHOR, 'create', V(AUTHOR), { data: { viewerId: AUTHOR, at: now } });
t('record view of story not shared with me', 'DENY', AUTHOR, 'create', `${DB}/stories/s2/views/${AUTHOR}`, { data: { viewerId: AUTHOR, at: now } });
t('fake someone elses view', 'DENY', AUTHOR, 'create', V(OTHER), { data: { viewerId: OTHER, at: now } });
t('owner reads viewers', 'ALLOW', ME, 'get', V(AUTHOR), { existing: { viewerId: AUTHOR, at: now } });
t('stranger reads viewers', 'DENY', OTHER, 'get', V(AUTHOR), { existing: { viewerId: AUTHOR, at: now } });
t('edit my close friends', 'ALLOW', ME, 'create', `${DB}/users/${ME}/storyCircle/lists`, { data: { closeFriends: [OTHER], hiddenFrom: [] } });
t('read someone elses close friends', 'DENY', OTHER, 'get', `${DB}/users/${ME}/storyCircle/lists`, { existing: { closeFriends: [OTHER], hiddenFrom: [] } });

// live_streams chat + signalling (was: any signed-in user, any sender)
t('stream chat as me', 'ALLOW', ME, 'create', `${DB}/live_streams/ls1/chat/c1`, { data: { uid: ME, text: 'hi' } });
t('stream chat impersonation', 'DENY', ME, 'create', `${DB}/live_streams/ls1/chat/c1`, { data: { uid: OTHER, text: 'hi' } });
t('join stream as viewer', 'ALLOW', ME, 'create', `${DB}/live_streams/ls1/viewers/${ME}`, { data: { uid: ME } });
t('write another viewer', 'DENY', ME, 'create', `${DB}/live_streams/ls1/viewers/${OTHER}`, { data: { uid: OTHER } });
t('viewer forges answer', 'DENY', ME, 'create', `${DB}/live_streams/ls1/viewers/${ME}/answer/a`, { data: { sdp: 'x' } });
t('broadcaster answers', 'ALLOW', AUTHOR, 'create', `${DB}/live_streams/ls1/viewers/${ME}/answer/a`, { data: { sdp: 'x' } });

// video_chats (was: anyone could create / rewrite participants)
const vp = (uid) => ({ uid, displayName: uid, photoURL: '', isMuted: false, isVideoOff: false });
const vs = (parts) => ({ id: 'vchat_r1', roomId: 'r1', participants: parts, startTime: now, isActive: true });
t('start room video call', 'ALLOW', ME, 'create', `${DB}/video_chats/vchat_r1`, { data: vs([vp(ME)]) });
t('start call in a room I am not in', 'DENY', OTHER, 'create', `${DB}/video_chats/vchat_r1`, { data: vs([vp(OTHER)]) });
t('join call as myself', 'ALLOW', AUTHOR, 'update', `${DB}/video_chats/vchat_r1`, { existing: vs([vp(ME)]), data: vs([vp(ME), vp(AUTHOR)]) });
t('remove others from call', 'DENY', AUTHOR, 'update', `${DB}/video_chats/vchat_r1`, { existing: vs([vp(ME)]), data: vs([vp(AUTHOR)]) });

// rtc_sessions (non-talk) — owner-stamped
const R = `${DB}/rtc_sessions/wcroom_x`;
t('join rtc session', 'ALLOW', ME, 'create', `${R}/participants/tv_1`, { data: { role: 'viewer', name: 'TV', owner: ME } });
t('overwrite another peer', 'DENY', ME, 'update', `${R}/participants/p2`, { existing: { role: 'participant', owner: OTHER }, data: { role: 'host', owner: ME } });
t('kick another peer', 'DENY', ME, 'delete', `${R}/participants/p2`, { existing: { role: 'participant', owner: OTHER } });
t('send my offer', 'ALLOW', ME, 'create', `${R}/signals/${ME}__${OTHER}`, { data: { description: { type: 'offer' }, owner: ME } });
t('hijack an edge', 'DENY', ME, 'update', `${R}/signals/${OTHER}__${AUTHOR}`, { existing: { owner: OTHER }, data: { description: {}, owner: ME } });
t('clear inbound edge on leave', 'ALLOW', ME, 'delete', `${R}/signals/${OTHER}__${ME}`, { existing: { owner: OTHER } });
t('write session root', 'DENY', ME, 'create', R, { data: { x: 1 } });

// rooms/{id}/chat moderation
t('room chat', 'ALLOW', ME, 'create', `${DB}/rooms/rm1/chat/m1`, { data: { uid: ME, displayName: 'Me', text: 'yo', at: now } });
t('empty room chat', 'DENY', ME, 'create', `${DB}/rooms/rm1/chat/m1`, { data: { uid: ME, displayName: 'Me', text: '', at: now } });
t('host removes message', 'ALLOW', AUTHOR, 'delete', `${DB}/rooms/rm1/chat/m1`, { existing: { uid: ME, text: 'yo' } });
t('sender removes message', 'ALLOW', ME, 'delete', `${DB}/rooms/rm1/chat/m1`, { existing: { uid: ME, text: 'yo' } });
t('stranger removes message', 'DENY', OTHER, 'delete', `${DB}/rooms/rm1/chat/m1`, { existing: { uid: ME, text: 'yo' } });

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
