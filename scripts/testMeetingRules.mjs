// Read-only Firebase Rules evaluation; never deploys rules or writes application data.
import fs from 'node:fs';
import os from 'node:os';
const full = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
function grab(pattern) {
  const start = full.search(pattern);
  if (start < 0) throw new Error(`Rules block missing: ${pattern}`);
  const open = start + full.slice(start).search(/\{\r?\n/);
  let depth = 0;
  for (let i = open; i < full.length; i++) {
    if (full[i] === '{') depth++;
    if (full[i] === '}' && --depth === 0) return full.slice(start, i + 1);
  }
  throw new Error('Unbalanced rules');
}
const helpers = ['meetingMember', 'meetingControl', 'hasMeetingControl', 'meetingScope', 'meetingManager', 'validMeeting'];
const parentUpdate = full.slice(full.indexOf('match /chat_rooms/{roomId}')).match(/allow update: if isAuthenticated\(\) && \([\s\S]*?\n\s*\);/)?.[0];
if (!parentUpdate) throw new Error('Parent room update rule missing');
// Unrelated production/schema helpers are stubbed only for the parent ownership boundary tests.
const source = "rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents {\n" + grab(/function isAuthenticated\(\)/) + '\nfunction isAdmin() { return false; }\nfunction isValidChatRoom(data) { return true; }\nfunction canManageProductionChatById(id) { return false; }\nmatch /chat_rooms/{roomId} {\n' + parentUpdate + '\n' + helpers.map(name => grab(new RegExp(`function ${name}\\(`))).join('\n') + '\n' + grab(/match \/meetings\/\{controlId\}/) + '\n' + grab(/match \/meeting_rtc\/\{scope\}/) + '\n}}}';
const root = '/databases/(default)/documents/chat_rooms/test';
const parent = { ownerId: 'host', participants: ['host', 'mod', 'guest', 'removed'] };
const control = { hostId: 'host', moderatorIds: ['mod'], breakoutRooms: { breakout_a: 'Design' }, assignments: { guest: 'breakout_a' }, removedIds: ['removed'], muteRequests: {}, revision: 1 };
const cases = [];
function test(name, expect, uid, method, path, data, existing, state = control) { cases.push({ name, expect, uid, method, path: root + path, data, existing, state }); }
const changed = { ...control, revision: 2 };
test('host creates controls', 'ALLOW', 'host', 'create', '/meetings/control', control, undefined, null);
test('guest cannot create controls', 'DENY', 'guest', 'create', '/meetings/control', { ...control, hostId: 'guest' }, undefined, null);
test('outsider cannot read controls', 'DENY', 'outsider', 'get', '/meetings/control', undefined, control);
test('host changes room assignments', 'ALLOW', 'host', 'update', '/meetings/control', changed, control);
test('moderator manages rooms', 'ALLOW', 'mod', 'update', '/meetings/control', changed, control);
test('guest cannot manage rooms', 'DENY', 'guest', 'update', '/meetings/control', changed, control);
test('removed moderator cannot manage', 'DENY', 'mod', 'update', '/meetings/control', changed, control, { ...control, removedIds: ['mod'] });
test('moderator cannot grant a role', 'DENY', 'mod', 'update', '/meetings/control', { ...changed, moderatorIds: ['mod', 'guest'] }, control);
test('host identity immutable', 'DENY', 'host', 'update', '/meetings/control', { ...changed, hostId: 'guest' }, control);
test('stale revision rejected', 'DENY', 'host', 'update', '/meetings/control', control, control);
test('host removal rejected', 'DENY', 'mod', 'update', '/meetings/control', { ...changed, removedIds: ['host'] }, control);
const presence = { role: 'participant', name: 'Guest' };
test('guest joins assigned breakout', 'ALLOW', 'guest', 'create', '/meeting_rtc/breakout_a/participants/guest', presence);
test('guest cannot join main while assigned away', 'DENY', 'guest', 'create', '/meeting_rtc/main/participants/guest', presence);
test('host cannot impersonate presence', 'DENY', 'host', 'create', '/meeting_rtc/main/participants/mod', presence);
test('outsider cannot join main', 'DENY', 'outsider', 'create', '/meeting_rtc/main/participants/outsider', presence);
test('removed user cannot join', 'DENY', 'removed', 'create', '/meeting_rtc/main/participants/removed', presence);
test('removed user can clean own presence', 'ALLOW', 'removed', 'delete', '/meeting_rtc/main/participants/removed', undefined, presence);
test('anonymous cannot list participants', 'DENY', null, 'list', '/meeting_rtc/main/participants');
test('main attendee cannot read breakout chat', 'DENY', 'host', 'list', '/meeting_rtc/breakout_a/messages/a');
test('breakout attendee can read chat', 'ALLOW', 'guest', 'list', '/meeting_rtc/breakout_a/messages/a');
const message = { senderId: 'guest', senderName: 'Guest', text: 'enc:abc', timestamp: 1 };
test('breakout attendee sends encrypted message', 'ALLOW', 'guest', 'create', '/meeting_rtc/breakout_a/messages/a', message);
test('plaintext rejected', 'DENY', 'guest', 'create', '/meeting_rtc/breakout_a/messages/a', { ...message, text: 'Hello' });
test('sender spoofing rejected', 'DENY', 'guest', 'create', '/meeting_rtc/breakout_a/messages/a', { ...message, senderId: 'host' });
test('removed cannot read messages', 'DENY', 'removed', 'list', '/meeting_rtc/main/messages/a');
const signal = { description: { type: 'offer', sdp: 'example' } };
test('main peers negotiate', 'ALLOW', 'host', 'create', '/meeting_rtc/main/signals/host__mod', signal);
test('receiver cannot overwrite sender offer', 'DENY', 'mod', 'create', '/meeting_rtc/main/signals/host__mod', signal);
test('cross-room signaling rejected', 'DENY', 'host', 'create', '/meeting_rtc/main/signals/host__guest', signal);
test('unrelated peer cannot read another edge', 'DENY', 'guest', 'get', '/meeting_rtc/main/signals/host__mod', undefined, signal);
test('removed endpoint signaling rejected', 'DENY', 'host', 'create', '/meeting_rtc/main/signals/host__removed', signal);
test('main works before controls exist', 'ALLOW', 'guest', 'create', '/meeting_rtc/main/participants/guest', presence, undefined, null);
test('nonexistent breakout rejected before controls', 'DENY', 'guest', 'create', '/meeting_rtc/breakout_a/participants/guest', presence, undefined, null);
test('member cannot take room ownership to bootstrap meeting authority', 'DENY', 'guest', 'update', '', { ...parent, ownerId: 'guest' }, parent);
test('member cannot change legacy moderator roles', 'DENY', 'guest', 'update', '', { ...parent, meetingModeratorIds: ['guest'] }, parent);
test('host can update legacy moderator roles', 'ALLOW', 'host', 'update', '', { ...parent, meetingModeratorIds: ['mod'] }, parent);
test('member can still update ordinary room settings', 'ALLOW', 'guest', 'update', '', { ...parent, name: 'Design' }, parent);
const tokens = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tokens?.access_token || tokens.expires_at < Date.now() + 60000) { console.error('Firebase CLI login needs refreshing before rules verification.'); process.exit(2); }
const testCases = cases.map(c => {
  const request = { method: c.method, path: c.path };
  if (c.uid) request.auth = { uid: c.uid, token: {} };
  if (c.data) request.resource = { data: c.data };
  const result = { expectation: c.expect, request, functionMocks: [
    { function: 'get', args: [{ exactValue: root }], result: { value: { data: parent } } },
    { function: 'exists', args: [{ exactValue: root + '/meetings/control' }], result: { value: !!c.state } },
    { function: 'get', args: [{ exactValue: root + '/meetings/control' }], result: { value: { data: c.state || {} } } },
  ] };
  if (c.existing) result.resource = { data: c.existing };
  return result;
});
const response = await fetch('https://firebaserules.googleapis.com/v1/projects/gen-lang-client-0665118474:test', { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: source }] }, testSuite: { testCases } }) });
const output = await response.json();
if (!response.ok) { console.error(JSON.stringify(output).slice(0, 2000)); process.exit(1); }
if (output.issues?.length) console.log('Rules diagnostics:', JSON.stringify(output.issues).slice(0, 2500));
let failed = 0;
(output.testResults || []).forEach((result, i) => { if (result.state !== 'SUCCESS') { failed++; console.log('FAIL', cases[i].name, result.state, (result.debugMessages || []).slice(-2)); } });
if ((output.testResults || []).length !== cases.length) throw new Error('Incomplete rules evaluation');
console.log(`${cases.length - failed}/${cases.length} meeting rules checks passed. No rules deployed.`);
process.exitCode = failed ? 1 : 0;
