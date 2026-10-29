// Social rules: comments (every composer feature), chat reactions, comment polls, club comments,
// fan-room chat, stories, stream/room chat, call signalling. Evaluated with the Firebase Rules REST `:test` API — read-only, deploys nothing.
// Runs against the compacted deploy artifact so what's tested is what ships.
//   node scripts/minifyRules.mjs firestore.rules <tmp>/firestore.rules.min && node scripts/testSocialRules.mjs <tmp>/firestore.rules.min
import fs from 'node:fs';
import os from 'node:os';
const PROJECT = 'gen-lang-client-0665118474';
const tok = process.env.RULES_ACCESS_TOKEN
  ? { access_token: process.env.RULES_ACCESS_TOKEN, expires_at: Date.now() + 3600000 }
  : JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
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
  m.push({ function: 'get', args: [{ exactValue: `${DB}/circle_posts/cp1` }], result: { value: { data: { authorId: ME, audience: 'FAMILY', audienceUids: [OTHER] } } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/stories/s1` }], result: { value: { data: { ownerId: ME, audience: 'PUBLIC' } } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/stories/s2` }], result: { value: { data: { ownerId: ME, audience: 'FOLLOWERS', audienceUids: [OTHER] } } } });
  // Meeting links: pm1 admits guests (OTHER admitted, PRIV still waiting); pm2 is members-only.
  m.push({ function: 'get', args: [{ exactValue: `${DB}/public_meetings/pm1` }], result: { value: { data: { roomId: 'r1', hostUid: ME, guestsAllowed: true } } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/public_meetings/pm2` }], result: { value: { data: { roomId: 'r1', hostUid: ME, guestsAllowed: false } } } });
  for (const [u, status] of [[OTHER, 'ADMITTED'], [PRIV, 'WAITING']]) {
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/public_meetings/pm1/lobby/${u}` }], result: { value: true } });
    m.push({ function: 'get', args: [{ exactValue: `${DB}/public_meetings/pm1/lobby/${u}` }], result: { value: { data: { name: 'G', status } } } });
  }
  for (const u of [ME, AUTHOR]) m.push({ function: 'exists', args: [{ exactValue: `${DB}/public_meetings/pm1/lobby/${u}` }], result: { value: false } });
  m.push({ function: 'exists', args: [{ exactValue: `${DB}/chat_rooms/r1/meetings/control` }], result: { value: false } });
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

// chat basics: edit, delete-for-everyone tombstone, link card, attachments, prefs, quiet hours
const mine = { senderId: ME, senderName: 'Me', text: 'hey', timestamp: now, type: 'TEXT', storagePath: 'chat/r1/files/a.pdf', attachment: { url: 'https://f/a.pdf', name: 'a.pdf', size: 10, mime: 'application/pdf', kind: 'pdf' } };
t('edit my text', 'ALLOW', ME, 'update', M, { existing: mine, data: { ...mine, text: 'fixed', editedAt: now } });
t('edit someone else', 'DENY', ME, 'update', M, { existing: msg, data: { ...msg, text: 'fixed', editedAt: now } });
t('edit without editedAt', 'DENY', ME, 'update', M, { existing: mine, data: { ...mine, text: 'sneaky' } });
t('edit also swaps sender name', 'DENY', ME, 'update', M, { existing: mine, data: { ...mine, text: 'x', editedAt: now, senderName: 'Pastor' } });
t('edit a voice note', 'DENY', ME, 'update', M, { existing: { ...mine, type: 'VOICE' }, data: { ...mine, type: 'VOICE', text: 'x', editedAt: now } });
const { text: _t, attachment: _a, storagePath: _s, ...bare } = mine;
t('tombstone my message', 'ALLOW', ME, 'update', M, { existing: mine, data: { ...bare, deletedAt: now } });
t('tombstone keeps text', 'DENY', ME, 'update', M, { existing: mine, data: { ...mine, deletedAt: now, attachment: undefined, storagePath: undefined } });
t('tombstone someone else', 'DENY', ME, 'update', M, { existing: msg, data: { senderId: AUTHOR, senderName: 'A', timestamp: now, type: 'TEXT', deletedAt: now } });
t('edit a tombstone', 'DENY', ME, 'update', M, { existing: { ...bare, deletedAt: now }, data: { ...bare, deletedAt: now, text: 'back', editedAt: now } });
t('add link card once', 'ALLOW', ME, 'update', M, { existing: mine, data: { ...mine, linkPreview: { url: 'https://x.org', title: 'X', siteName: 'x.org' } } });
t('link card on someone else', 'DENY', ME, 'update', M, { existing: msg, data: { ...msg, linkPreview: { url: 'https://x.org', title: 'X', siteName: 'x.org' } } });
const newMsg = { senderId: ME, senderName: 'Me', senderPhoto: '', timestamp: now, type: 'TEXT' };
t('send a file', 'ALLOW', ME, 'create', `${DB}/chat_rooms/r1/messages/m2`, { data: { ...newMsg, attachment: mine.attachment } });
t('send a 60 MB file', 'DENY', ME, 'create', `${DB}/chat_rooms/r1/messages/m2`, { data: { ...newMsg, attachment: { ...mine.attachment, size: 60 * 1024 * 1024 } } });
t('send pre-deleted', 'DENY', ME, 'create', `${DB}/chat_rooms/r1/messages/m2`, { data: { ...newMsg, text: 'x', deletedAt: now } });
t('send forwarded', 'ALLOW', ME, 'create', `${DB}/chat_rooms/r1/messages/m2`, { data: { ...newMsg, text: 'x', forwardedFrom: 'Author' } });
t('mute my room', 'ALLOW', ME, 'update', `${DB}/users/${ME}/chat_prefs/r1`, { existing: { lastReadAt: 1 }, data: { lastReadAt: 1, mutedUntil: -1, updatedAt: now } });
t('read cursor', 'ALLOW', ME, 'create', `${DB}/users/${ME}/chat_prefs/r1`, { data: { lastReadAt: now, updatedAt: now } });
t('mute for someone else', 'DENY', ME, 'create', `${DB}/users/${OTHER}/chat_prefs/r1`, { data: { mutedUntil: -1, updatedAt: now } });
t('read someone else prefs', 'DENY', ME, 'get', `${DB}/users/${OTHER}/chat_prefs/r1`, {});
t('prefs extra field', 'DENY', ME, 'create', `${DB}/users/${ME}/chat_prefs/r1`, { data: { lastReadAt: now, isAdmin: true } });
const qh = { enabled: true, start: '22:00', end: '07:00', tz: 'America/New_York', updatedAt: now };
t('quiet hours', 'ALLOW', ME, 'create', `${DB}/users/${ME}/chat_settings/quiet_hours`, { data: qh });
t('quiet hours bad time', 'DENY', ME, 'create', `${DB}/users/${ME}/chat_settings/quiet_hours`, { data: { ...qh, start: '25:00' } });
t('chat_settings other doc', 'DENY', ME, 'create', `${DB}/users/${ME}/chat_settings/anything`, { data: qh });

// meeting recordings + captions + recap card
const REC = `${DB}/chat_rooms/r1/recordings/rec1`;
const rec = { hostUid: ME, hostName: 'Me', title: 'Team call', mode: 'CLOUD', kind: 'AUDIO', status: 'RECORDING', startedAt: now, expiresAt: null };
t('start recording', 'ALLOW', ME, 'create', REC, { data: rec });
t('start recording as someone else', 'DENY', ME, 'create', REC, { data: { ...rec, hostUid: AUTHOR } });
t('start recording in a room I left', 'DENY', OTHER, 'create', REC, { data: { ...rec, hostUid: OTHER } });
t('start already-ended recording', 'DENY', ME, 'create', REC, { data: { ...rec, status: 'ENDED' } });
t('member reads recording', 'ALLOW', AUTHOR, 'get', REC, { existing: rec });
t('outsider reads recording', 'DENY', OTHER, 'get', REC, { existing: rec });
const ended = { ...rec, status: 'ENDED', endedAt: now + 60000, durationSec: 60, sizeBytes: 900000, segmentUrls: ['https://x/a'], segmentPaths: ['meetings/r1/rec1/seg_00000.webm'] };
t('host ends recording', 'ALLOW', ME, 'update', REC, { existing: rec, data: ended });
t('member edits host recording', 'DENY', AUTHOR, 'update', REC, { existing: rec, data: ended });
t('host steals hostUid', 'DENY', ME, 'update', REC, { existing: rec, data: { ...ended, hostUid: AUTHOR } });
t('host adds recap', 'ALLOW', ME, 'update', REC, { existing: ended, data: { ...ended, recap: { summary: 'We met.', actionItems: [], decisions: [], lane: 'rules', createdAt: now } } });
t('recording extra field', 'DENY', ME, 'create', REC, { data: { ...rec, isAdmin: true } });
const CAP = `${REC}/captions/c1`;
t('member adds own caption', 'ALLOW', AUTHOR, 'create', CAP, { data: { uid: AUTHOR, name: 'A', text: 'Hello all', at: 1200 } });
t('caption as someone else', 'DENY', AUTHOR, 'create', CAP, { data: { uid: ME, name: 'Me', text: 'I quit', at: 1200 } });
t('outsider adds caption', 'DENY', OTHER, 'create', CAP, { data: { uid: OTHER, name: 'O', text: 'hi', at: 1 } });
t('edit a caption', 'DENY', AUTHOR, 'update', CAP, { existing: { uid: AUTHOR, name: 'A', text: 'Hello', at: 1 }, data: { uid: AUTHOR, name: 'A', text: 'Changed', at: 1 } });
t('post recap card', 'ALLOW', ME, 'create', `${DB}/chat_rooms/r1/messages/m3`, { data: { ...newMsg, type: 'ACTION', text: 'x', meetingRecap: { recordingId: 'rec1', title: 'Team call', durationSec: 60, mode: 'CLOUD', hostName: 'Me', speakers: ['Me'], actionCount: 0 } } });
t('recap card without id', 'DENY', ME, 'create', `${DB}/chat_rooms/r1/messages/m3`, { data: { ...newMsg, type: 'ACTION', text: 'x', meetingRecap: { title: 'Team call' } } });

// huddle presence heartbeats on the room call
const RP = `${DB}/chat_rooms/r1/meeting_rtc/main/participants`;
t('join room call with heartbeat', 'ALLOW', ME, 'create', `${RP}/${ME}`, { data: { role: 'participant', name: 'Me', joinedAt: now, nonce: 'n1', lastSeen: now } });
t('room call presence extra key', 'DENY', ME, 'create', `${RP}/${ME}`, { data: { role: 'participant', name: 'Me', joinedAt: now, admin: true } });
t('member sees who is in the huddle', 'ALLOW', AUTHOR, 'list', `${RP}/x`, {});
t('outsider sees the huddle', 'DENY', OTHER, 'list', `${RP}/x`, {});

// scheduled meetings
const SM = `${DB}/chat_rooms/r1/scheduled_meetings/s1`;
const sched = { roomId: 'r1', title: 'Board', startsAt: now + 86_400_000, durationMin: 60, guestsAllowed: true, createdBy: ME, createdByName: 'Me', createdAt: now };
t('schedule a meeting', 'ALLOW', ME, 'create', SM, { data: sched });
t('schedule for someone else', 'DENY', ME, 'create', SM, { data: { ...sched, createdBy: AUTHOR } });
t('schedule in a room I left', 'DENY', OTHER, 'create', SM, { data: { ...sched, createdBy: OTHER } });
t('schedule into another room id', 'DENY', ME, 'create', SM, { data: { ...sched, roomId: 'r9' } });
t('guest schedules', 'DENY', 'anon:' + ME, 'create', SM, { data: sched });
t('creator cancels', 'ALLOW', ME, 'update', SM, { existing: sched, data: { ...sched, canceledAt: now } });
t('member cancels someone else\'s', 'DENY', AUTHOR, 'update', SM, { existing: sched, data: { ...sched, canceledAt: now } });
t('member reads schedule', 'ALLOW', AUTHOR, 'get', SM, { existing: sched });
t('post invite card', 'ALLOW', ME, 'create', `${DB}/chat_rooms/r1/messages/m4`, { data: { ...newMsg, type: 'ACTION', text: 'x', isPinned: true, meetingInvite: { meetingId: 'pm1', title: 'Board', startsAt: now, durationMin: 60, guestsAllowed: true } } });

// meeting link, waiting room, guest call
const PM = `${DB}/public_meetings/pm1`;
const stub = { roomId: 'r1', title: 'Board', startsAt: now, durationMin: 60, hostUid: ME, hostName: 'Me', guestsAllowed: true };
t('member publishes link stub', 'ALLOW', ME, 'create', `${DB}/public_meetings/pmX`, { data: stub });
t('outsider publishes stub for a room', 'DENY', OTHER, 'create', `${DB}/public_meetings/pmX`, { data: { ...stub, hostUid: OTHER } });
t('guest reads link stub', 'ALLOW', 'anon:g1', 'get', PM, { existing: stub });
t('host renames stub host', 'DENY', ME, 'update', PM, { existing: stub, data: { ...stub, hostUid: AUTHOR } });
t('guest knocks', 'ALLOW', 'anon:g1', 'create', `${PM}/lobby/g1`, { data: { name: 'Pat Lee', status: 'WAITING', requestedAt: now } });
t('guest lets themself in', 'DENY', 'anon:g1', 'create', `${PM}/lobby/g1`, { data: { name: 'Pat Lee', status: 'ADMITTED', requestedAt: now } });
t('guest knocks as someone else', 'DENY', 'anon:g1', 'create', `${PM}/lobby/g2`, { data: { name: 'Pat Lee', status: 'WAITING', requestedAt: now } });
t('knock on members-only meeting', 'DENY', 'anon:g1', 'create', `${DB}/public_meetings/pm2/lobby/g1`, { data: { name: 'Pat Lee', status: 'WAITING', requestedAt: now } });
t('member admits guest', 'ALLOW', AUTHOR, 'update', `${PM}/lobby/g1`, { existing: { name: 'Pat', status: 'WAITING', requestedAt: now }, data: { name: 'Pat', status: 'ADMITTED', requestedAt: now, decidedBy: AUTHOR, decidedAt: now } });
t('guest admits guest', 'DENY', OTHER, 'update', `${PM}/lobby/g1`, { existing: { name: 'Pat', status: 'WAITING', requestedAt: now }, data: { name: 'Pat', status: 'ADMITTED', requestedAt: now, decidedBy: OTHER, decidedAt: now } });
t('member sees waiting room', 'ALLOW', AUTHOR, 'list', `${PM}/lobby/x`, {});
t('guest sees waiting room', 'DENY', PRIV, 'list', `${PM}/lobby/x`, {});
const GP = `${PM}/rtc/main/participants`;
const pres = (name) => ({ role: 'participant', name, joinedAt: now, nonce: 'n', lastSeen: now });
t('admitted guest joins call', 'ALLOW', OTHER, 'create', `${GP}/${OTHER}`, { data: pres('Guest') });
t('waiting guest joins call', 'DENY', PRIV, 'create', `${GP}/${PRIV}`, { data: pres('Guest') });
t('member joins guest call', 'ALLOW', ME, 'create', `${GP}/${ME}`, { data: pres('Me') });
t('admitted guest signals member', 'ALLOW', OTHER, 'create', `${PM}/rtc/main/signals/${OTHER}__${ME}`, { data: { description: { type: 'offer', sdp: 'x' } } });
t('waiting guest signals member', 'DENY', PRIV, 'create', `${PM}/rtc/main/signals/${PRIV}__${ME}`, { data: { description: { type: 'offer', sdp: 'x' } } });
t('admitted guest signals a waiting one', 'DENY', OTHER, 'create', `${PM}/rtc/main/signals/${OTHER}__${PRIV}`, { data: { description: { type: 'offer', sdp: 'x' } } });

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

// Facebook-style audiences: circle_posts (lists / custom / only me) + Followers-only posts
const cp = (o = {}) => ({ authorId: ME, authorName: 'Me', authorPhoto: '', text: 'family bbq', timestamp: now, likesCount: 0, commentsCount: 0, isPublic: false,
  audience: 'FAMILY', audienceSpec: { preset: 'FAMILY' }, audienceUids: [OTHER], audienceLists: ['family', 'hiddenFrom'], ...o });
const CP = `${DB}/circle_posts/cp1`;
t('post to Family', 'ALLOW', ME, 'create', CP, { data: cp() });
t('post Only me', 'ALLOW', ME, 'create', CP, { data: cp({ audience: 'ONLY_ME', audienceSpec: { preset: 'ONLY_ME' }, audienceUids: [] }) });
t('custom combo post', 'ALLOW', ME, 'create', CP, { data: cp({ audience: 'CUSTOM', audienceUids: [OTHER, AUTHOR] }) });
t('list post marked public', 'DENY', ME, 'create', CP, { data: cp({ isPublic: true }) });
t('list post as someone else', 'DENY', ME, 'create', CP, { data: cp({ authorId: OTHER }) });
t('family member reads', 'ALLOW', OTHER, 'get', CP, { existing: cp() });
t('outsider reads family post', 'DENY', AUTHOR, 'get', CP, { existing: cp() });
t('signed-out reads family post', 'DENY', null, 'get', CP, { existing: cp() });
t('author reads own Only me', 'ALLOW', ME, 'get', CP, { existing: cp({ audience: 'ONLY_ME', audienceUids: [] }) });
t('author re-syncs audience', 'ALLOW', ME, 'update', CP, { existing: cp(), data: cp({ audienceUids: [OTHER, AUTHOR] }) });
t('viewer adds self to audience', 'DENY', AUTHOR, 'update', CP, { existing: cp(), data: cp({ audienceUids: [OTHER, AUTHOR] }) });
t('family member likes', 'ALLOW', OTHER, 'update', CP, { existing: cp(), data: cp({ likedBy: [OTHER], likesCount: 1 }) });
t('outsider likes', 'DENY', AUTHOR, 'update', CP, { existing: cp(), data: cp({ likedBy: [AUTHOR], likesCount: 1 }) });
t('family member comments', 'ALLOW', OTHER, 'create', `${CP}/comments/c1`, { data: pc({ uid: OTHER, authorId: OTHER }) });
t('outsider comments', 'DENY', AUTHOR, 'create', `${CP}/comments/c1`, { data: pc({ uid: AUTHOR, authorId: AUTHOR }) });
t('outsider reads comments', 'DENY', AUTHOR, 'get', `${CP}/comments/c1`, { existing: pc({ uid: OTHER }) });
const pp = (o = {}) => ({ authorId: ME, authorName: 'Me', authorPhoto: '', text: 'followers only', timestamp: now, isPublic: false, ...o });
t('public account posts Followers-only', 'ALLOW', ME, 'create', `${DB}/private_posts/pp1`, { data: pp({ audience: 'FOLLOWERS' }) });
t('public account private post w/o audience', 'DENY', ME, 'create', `${DB}/private_posts/pp1`, { data: pp() });
t('family story', 'ALLOW', ME, 'create', S, { data: fs_({ audience: 'FAMILY' }) });
t('custom story', 'ALLOW', ME, 'create', S, { data: fs_({ audience: 'CUSTOM' }) });
t('my audience defaults', 'ALLOW', ME, 'create', `${DB}/users/${ME}/prefs/audience`, { data: { posts: { preset: 'FAMILY' } } });
t('read others audience defaults', 'DENY', OTHER, 'get', `${DB}/users/${ME}/prefs/audience`, { existing: { posts: { preset: 'FAMILY' } } });

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
