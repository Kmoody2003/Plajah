/**
 * chatCore — pure chat rules shared by the client (ChatWindow, room lists) and server.ts (/api/push).
 * No Firebase imports, so tests and the server can load it directly.
 *
 * Per-user room state lives in users/{uid}/chat_prefs/{roomId}:
 *   { lastReadAt: number, mutedUntil?: number | null, updatedAt: number }
 *   mutedUntil = MUTE_FOREVER (-1) for "until I turn it back on".
 * Quiet hours live in users/{uid}/chat_settings/quiet_hours:
 *   { enabled: boolean, start: 'HH:MM', end: 'HH:MM', tz: IANA zone, updatedAt: number }
 */

export interface RoomPrefs {
  lastReadAt?: number;
  mutedUntil?: number | null;
}

export interface QuietHours {
  enabled: boolean;
  start: string; // 'HH:MM', local to tz
  end: string;   // 'HH:MM', may be earlier than start (wraps past midnight)
  tz?: string;
}

export const MUTE_FOREVER = -1;

export const MUTE_OPTIONS: { id: string; label: string; ms: number }[] = [
  { id: '1h', label: 'For 1 hour', ms: 60 * 60 * 1000 },
  { id: '8h', label: 'For 8 hours', ms: 8 * 60 * 60 * 1000 },
  { id: '24h', label: 'For 24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '1w', label: 'For a week', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'forever', label: 'Until I turn it back on', ms: MUTE_FOREVER },
];

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '22:00', end: '07:00' };

export function muteUntilFor(optionMs: number, now = Date.now()): number {
  return optionMs === MUTE_FOREVER ? MUTE_FOREVER : now + optionMs;
}

export function isRoomMuted(prefs: RoomPrefs | null | undefined, now = Date.now()): boolean {
  const until = prefs?.mutedUntil;
  if (until == null) return false;
  return until === MUTE_FOREVER || until > now;
}

export function muteLabel(prefs: RoomPrefs | null | undefined, now = Date.now()): string | null {
  if (!isRoomMuted(prefs, now)) return null;
  if (prefs!.mutedUntil === MUTE_FOREVER) return 'Muted';
  const until = new Date(prefs!.mutedUntil!);
  const sameDay = until.toDateString() === new Date(now).toDateString();
  return `Muted until ${sameDay
    ? until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : until.toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isValidHHMM = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s);
const toMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Minutes past local midnight in `tz` (falls back to the runtime's zone on a bad tz). */
export function minutesInZone(date: Date, tz?: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date);
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
    return (h % 24) * 60 + m;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

/** True while quiet hours are on. start == end means "all day". */
export function isQuietNow(qh: QuietHours | null | undefined, date = new Date()): boolean {
  if (!qh?.enabled || !isValidHHMM(qh.start) || !isValidHHMM(qh.end)) return false;
  const now = minutesInZone(date, qh.tz);
  const s = toMinutes(qh.start), e = toMinutes(qh.end);
  if (s === e) return true;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/**
 * Push decision for one chat message. Mentions get through a muted room (Slack behaviour);
 * quiet hours silence everything — the in-app inbox still records it.
 */
export function shouldPushChatMessage(input: {
  prefs?: RoomPrefs | null; quietHours?: QuietHours | null; mention?: boolean; now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  if (isQuietNow(input.quietHours, new Date(now))) return false;
  if (isRoomMuted(input.prefs, now) && !input.mention) return false;
  return true;
}

/**
 * Unread = the room moved since you last read it, and you weren't the last to post.
 * Rooms written before lastSenderId existed return null (caller falls back to its old signal).
 */
export function isRoomUnread(
  room: { updatedAt?: number; lastSenderId?: string },
  prefs: RoomPrefs | null | undefined,
  uid: string | null | undefined,
): boolean | null {
  if (!room.lastSenderId) return null;
  if (!uid || room.lastSenderId === uid) return false;
  return (room.updatedAt || 0) > (prefs?.lastReadAt || 0);
}

/**
 * Badge count for one room. The read cursor wins over the notification count: opening a room
 * clears it even if its MESSAGE notifications were never marked read, and a room that moved
 * past your cursor shows at least a dot. Legacy rooms (no lastSenderId) keep the notification count.
 */
export function roomUnreadCount(
  room: { updatedAt?: number; lastSenderId?: string },
  notificationCount: number,
  prefs: RoomPrefs | null | undefined,
  uid: string | null | undefined,
): number {
  const cursor = isRoomUnread(room, prefs, uid);
  if (cursor === false) return 0;
  if (cursor === true) return Math.max(1, notificationCount);
  return notificationCount;
}

// ── Edit + delete ────────────────────────────────────────────────────────────

/** Content fields a delete clears; the doc stays as a "Message deleted" tombstone. */
export const TOMBSTONE_CLEAR_KEYS = [
  'text', 'voiceUrl', 'imageUrl', 'gifUrl', 'videoNoteUrl', 'mediaId', 'mediaType', 'telaDocument',
  'attachment', 'linkPreview', 'reactions', 'isPinned', 'replyToText', 'storagePath', 'forwardedFrom', 'meetingRecap',
] as const;

export const isTombstone = (m: { deletedAt?: number | null }) => typeof m.deletedAt === 'number';

/** Only plain text you wrote can be edited (not media, system lines, or deleted messages). */
export function canEditMessage(
  m: { senderId?: string; type?: string; deletedAt?: number | null; productionEntity?: unknown; letterId?: string; burnAfterSeen?: boolean },
  uid: string | null | undefined,
): boolean {
  return !!uid && m.senderId === uid && m.type === 'TEXT' && !isTombstone(m)
    && !m.productionEntity && !m.letterId && !m.burnAfterSeen;
}

// ── Attachments ──────────────────────────────────────────────────────────────

export type AttachmentKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'audio' | 'video' | 'image' | 'archive' | 'text' | 'file';

export interface ChatAttachment {
  url: string;
  name: string;
  size: number;
  mime: string;
  kind: AttachmentKind;
  storagePath?: string;
}

/** Same 50 MB ceiling storage.rules applies to chat uploads. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** File picker filter: what storage.rules accepts on chat/ (media + documents). */
export const ATTACHMENT_ACCEPT = [
  'image/*', 'audio/*', 'video/*', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.csv', '.txt', '.md', '.zip', '.epub', '.json',
].join(',');

export function attachmentKind(mime: string, name = ''): AttachmentKind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const t = (mime || '').toLowerCase();
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (/spreadsheet|ms-excel|csv/.test(t) || ['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (/presentation|powerpoint/.test(t) || ['ppt', 'pptx'].includes(ext)) return 'slides';
  if (/wordprocessing|msword/.test(t) || ['doc', 'docx'].includes(ext)) return 'doc';
  if (/zip|epub/.test(t) || ['zip', 'epub'].includes(ext)) return 'archive';
  if (t.startsWith('text/') || ['txt', 'md', 'json'].includes(ext)) return 'text';
  return 'file';
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Room-list preview line for a message (lastMessage). */
export function previewLine(m: { text?: string; type?: string; attachment?: { name?: string } | null }): string {
  if (m.attachment?.name) return `📎 ${m.attachment.name}`;
  if (m.text) return m.text;
  switch (m.type) {
    case 'VOICE': return 'Voice note';
    case 'VIDEO_NOTE': return 'Video note';
    case 'IMAGE': return 'Photo';
    case 'MEDIA': return 'Shared media';
    default: return '';
  }
}

// ── Forwarding ───────────────────────────────────────────────────────────────

/** Fields copied when a message is forwarded. Text is re-encrypted for the target room by the caller. */
export const FORWARD_COPY_KEYS = [
  'type', 'voiceUrl', 'imageUrl', 'gifUrl', 'videoNoteUrl', 'mediaId', 'mediaType', 'attachment', 'linkPreview',
] as const;

/** Ephemeral / private messages never leave their room. */
export function canForwardMessage(m: {
  deletedAt?: number | null; burnAfterSeen?: boolean; burnAfter?: number; giftMedia?: boolean;
  productionEntity?: unknown; letterId?: string; telaDocument?: string; type?: string;
}): boolean {
  return !isTombstone(m) && !m.burnAfterSeen && !m.burnAfter && !m.giftMedia
    && !m.productionEntity && !m.letterId && !m.telaDocument && m.type !== 'SYSTEM';
}

export function buildForwardPayload(m: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of FORWARD_COPY_KEYS) if (m[k] !== undefined && m[k] !== null) out[k] = m[k];
  if (!out.type || out.type === 'ACTION') out.type = 'TEXT';
  return out;
}
