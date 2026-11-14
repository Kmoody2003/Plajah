import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MUTE_FOREVER, isRoomMuted, muteUntilFor, isQuietNow, shouldPushChatMessage, isRoomUnread, roomUnreadCount,
  canEditMessage, canForwardMessage, buildForwardPayload, isTombstone, attachmentKind, formatBytes, previewLine,
  TOMBSTONE_CLEAR_KEYS,
} from '../services/chat/chatCore';

const NOW = Date.UTC(2026, 9, 28, 15, 0); // 15:00 UTC

test('mute: timed, forever, expired, none', () => {
  assert.equal(isRoomMuted(null, NOW), false);
  assert.equal(isRoomMuted({ mutedUntil: null }, NOW), false);
  assert.equal(isRoomMuted({ mutedUntil: NOW + 1000 }, NOW), true);
  assert.equal(isRoomMuted({ mutedUntil: NOW - 1 }, NOW), false);
  assert.equal(isRoomMuted({ mutedUntil: MUTE_FOREVER }, NOW), true);
  assert.equal(muteUntilFor(MUTE_FOREVER, NOW), MUTE_FOREVER);
  assert.equal(muteUntilFor(3600_000, NOW), NOW + 3600_000);
});

test('quiet hours: same-day window, overnight wrap, all-day, timezone, disabled', () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 28, h, m));
  const day = { enabled: true, start: '09:00', end: '17:00', tz: 'UTC' };
  assert.equal(isQuietNow(day, at(12)), true);
  assert.equal(isQuietNow(day, at(17)), false);
  const night = { enabled: true, start: '22:00', end: '07:00', tz: 'UTC' };
  assert.equal(isQuietNow(night, at(23)), true);
  assert.equal(isQuietNow(night, at(6, 59)), true);
  assert.equal(isQuietNow(night, at(7)), false);
  assert.equal(isQuietNow({ ...night, start: '08:00', end: '08:00' }, at(12)), true);
  assert.equal(isQuietNow({ ...night, enabled: false }, at(23)), false);
  assert.equal(isQuietNow({ ...night, start: '25:00' }, at(23)), false);
  // 15:00 UTC is 11:00 in New York (EDT): inside 09–17 there, outside a 22–07 window.
  assert.equal(isQuietNow({ ...day, tz: 'America/New_York' }, new Date(NOW)), true);
  assert.equal(isQuietNow({ ...night, tz: 'America/New_York' }, new Date(NOW)), false);
});

test('push gate: mute blocks except mentions; quiet hours block everything', () => {
  const muted = { mutedUntil: MUTE_FOREVER };
  assert.equal(shouldPushChatMessage({ prefs: muted, now: NOW }), false);
  assert.equal(shouldPushChatMessage({ prefs: muted, mention: true, now: NOW }), true);
  const quiet = { enabled: true, start: '14:00', end: '16:00', tz: 'UTC' };
  assert.equal(shouldPushChatMessage({ quietHours: quiet, mention: true, now: NOW }), false);
  assert.equal(shouldPushChatMessage({ now: NOW }), true);
});

test('unread: cursor vs last sender, legacy rooms fall back', () => {
  const room = { updatedAt: 200, lastSenderId: 'bob' };
  assert.equal(isRoomUnread(room, { lastReadAt: 100 }, 'amy'), true);
  assert.equal(isRoomUnread(room, { lastReadAt: 300 }, 'amy'), false);
  assert.equal(isRoomUnread({ updatedAt: 200, lastSenderId: 'amy' }, null, 'amy'), false);
  assert.equal(isRoomUnread({ updatedAt: 200 }, null, 'amy'), null);
  assert.equal(roomUnreadCount(room, 3, { lastReadAt: 300 }, 'amy'), 0);
  assert.equal(roomUnreadCount(room, 0, { lastReadAt: 100 }, 'amy'), 1);
  assert.equal(roomUnreadCount(room, 4, { lastReadAt: 100 }, 'amy'), 4);
  assert.equal(roomUnreadCount({ updatedAt: 200 }, 2, null, 'amy'), 2);
});

test('edit + forward eligibility', () => {
  const mine = { senderId: 'amy', type: 'TEXT' };
  assert.equal(canEditMessage(mine, 'amy'), true);
  assert.equal(canEditMessage(mine, 'bob'), false);
  assert.equal(canEditMessage({ ...mine, type: 'VOICE' }, 'amy'), false);
  assert.equal(canEditMessage({ ...mine, deletedAt: 1 }, 'amy'), false);
  assert.equal(canEditMessage({ ...mine, burnAfterSeen: true }, 'amy'), false);
  assert.equal(canForwardMessage({ type: 'TEXT' }), true);
  assert.equal(canForwardMessage({ type: 'IMAGE', giftMedia: true }), false);
  assert.equal(canForwardMessage({ type: 'TEXT', burnAfterSeen: true }), false);
  assert.equal(canForwardMessage({ type: 'SYSTEM' }), false);
  assert.equal(canForwardMessage({ type: 'TEXT', deletedAt: 5 }), false);
});

test('forward payload copies media, never sender or room-bound fields', () => {
  const p = buildForwardPayload({
    type: 'IMAGE', imageUrl: 'https://x/y.jpg', senderId: 'bob', reactions: { '🔥': ['a'] },
    storagePath: 'chat/r1/images/a.jpg', replyToId: 'm0', text: 'enc:abc', linkPreview: null,
  });
  assert.deepEqual(p, { type: 'IMAGE', imageUrl: 'https://x/y.jpg' });
  assert.equal(buildForwardPayload({ type: 'ACTION' }).type, 'TEXT');
});

test('tombstone keys cover every content field the UI renders', () => {
  for (const k of ['text', 'voiceUrl', 'imageUrl', 'gifUrl', 'videoNoteUrl', 'attachment', 'linkPreview', 'storagePath', 'telaDocument']) {
    assert.ok((TOMBSTONE_CLEAR_KEYS as readonly string[]).includes(k), k);
  }
  assert.equal(isTombstone({ deletedAt: 1 }), true);
  assert.equal(isTombstone({}), false);
});

test('attachments: kind, size, preview line', () => {
  assert.equal(attachmentKind('application/pdf', 'a.pdf'), 'pdf');
  assert.equal(attachmentKind('', 'budget.xlsx'), 'sheet');
  assert.equal(attachmentKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'm.docx'), 'doc');
  assert.equal(attachmentKind('application/vnd.openxmlformats-officedocument.presentationml.presentation', 's.pptx'), 'slides');
  assert.equal(attachmentKind('audio/webm', 'v.webm'), 'audio');
  assert.equal(attachmentKind('application/octet-stream', 'thing.bin'), 'file');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3.5 * 1024 * 1024), '3.5 MB');
  assert.equal(previewLine({ attachment: { name: 'Minutes.pdf' }, type: 'TEXT' }), '📎 Minutes.pdf');
  assert.equal(previewLine({ type: 'VOICE' }), 'Voice note');
  assert.equal(previewLine({ text: 'hi', type: 'TEXT' }), 'hi');
});
