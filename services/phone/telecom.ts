// services/phone/telecom.ts — typed bridge to the Android PlajahTelecom plugin
// (android/.../telecom/PlajahTelecomPlugin.kt). Plajah as the default Phone + SMS app.
//
// Carrier texts and call history stay on the phone; nothing here sends them to Plajah servers.
// On web / iOS / desktop every call resolves to an "unavailable" value so callers can render a
// friendly "Phone features live in the Android app" state without try/catch noise.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { DeviceContact } from './contactsMerge';

export type PermissionValue = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export interface TelecomStatus {
  available: boolean;            // false off Android
  hasTelephony: boolean;
  dialerRoleAvailable: boolean;
  smsRoleAvailable: boolean;
  isDefaultDialer: boolean;
  isDefaultSms: boolean;
  permissions: Record<'phone' | 'contacts' | 'callLog' | 'sms' | 'notifications', PermissionValue>;
}

export type CallStateName = 'new' | 'dialing' | 'connecting' | 'ringing' | 'active' | 'holding' | 'disconnecting' | 'disconnected' | 'selectAccount' | 'pulling' | 'unknown';
export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth' | 'wired';

export interface LiveCall {
  id: string;
  number: string;
  name: string;
  state: CallStateName;
  incoming: boolean;
  conference: boolean;
  canHold: boolean;
  canMerge: boolean;
  video: boolean;
  connectedAt?: number;
  disconnectReason?: string;
}

export interface CallsSnapshot {
  calls: LiveCall[];
  muted?: boolean;
  route?: AudioRoute;
  routes?: AudioRoute[];
}

export interface CallLogEntry {
  id: string;
  number: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed' | 'voicemail' | 'rejected' | 'blocked' | 'other';
  date: number;
  duration: number;              // seconds
  isNew: boolean;
  photoUrl?: string;
}

export interface SmsThread {
  threadId: string;
  addresses: string[];
  snippet: string;
  date: number;
  messageCount: number;
  unread: boolean;
  unreadCount: number;
  hasAttachment: boolean;
}

export interface SmsMessage {
  id: string;                    // sms:<row> | mms:<row>
  kind: 'sms' | 'mms';
  address: string;
  body: string;
  date: number;
  outgoing: boolean;
  status: 'sending' | 'sent' | 'failed' | 'received';
  read: boolean;
  media?: { mimeType: string; url: string }[];
}

/** RCS mirrored from Google/Samsung Messages notifications (android/.../telecom/RcsBridge.kt). */
export interface RcsBridgeStatus {
  available: boolean;
  enabled: boolean;                  // Notification access granted
  googleMessagesInstalled: boolean;
  samsungMessagesInstalled: boolean;
  defaultSmsPackage: string;
}

export interface RcsThread {
  threadKey: string;
  title: string;
  isGroup: boolean;
  source: 'google' | 'samsung';
  snippet: string;
  date: number;
  unreadCount: number;
  canReply: boolean;                 // the conversation's notification is still live
}

export interface RcsMessage {
  id: string;
  sender: string;                    // '' when outgoing
  body: string;
  date: number;
  outgoing: boolean;
}

export type PhoneLaunch =
  | { kind: 'dial'; number: string }
  | { kind: 'sms'; addresses: string[]; body: string }
  | { kind: 'call'; callId: string };

export interface ContactInput {
  id?: string;
  givenName: string;
  familyName?: string;
  organization?: string;
  starred?: boolean;
  phones: { number: string; label?: string }[];
  emails: { address: string; label?: string }[];
}

interface TelecomPlugin {
  getStatus(): Promise<Omit<TelecomStatus, 'available'>>;
  requestRole(o: { role: 'dialer' | 'sms' }): Promise<{ granted: boolean }>;
  requestPermissions(o?: { permissions: string[] }): Promise<Record<string, PermissionValue>>;
  getPendingLaunch(): Promise<{ launch?: PhoneLaunch | null }>;
  placeCall(o: { number: string; speaker?: boolean }): Promise<{ ok: boolean }>;
  getCalls(): Promise<CallsSnapshot>;
  answer(o: { id?: string; video?: boolean }): Promise<{ ok: boolean }>;
  reject(o: { id?: string; message?: string }): Promise<{ ok: boolean }>;
  hangup(o: { id?: string }): Promise<{ ok: boolean }>;
  hold(o: { id?: string; on: boolean }): Promise<{ ok: boolean }>;
  merge(o: { id?: string }): Promise<{ ok: boolean }>;
  swap(o: { id?: string }): Promise<{ ok: boolean }>;
  dtmf(o: { id?: string; digit: string }): Promise<{ ok: boolean }>;
  setMuted(o: { muted: boolean }): Promise<{ ok: boolean }>;
  setAudioRoute(o: { route: AudioRoute }): Promise<{ ok: boolean }>;
  getSims(): Promise<{ sims: { subId: number; label: string; slot: number }[] }>;
  getCallLog(o: { limit?: number; number?: string }): Promise<{ entries: CallLogEntry[] }>;
  deleteCallLog(o: { ids: string[] }): Promise<{ ok: boolean; deleted: number }>;
  getContacts(o?: { id?: string }): Promise<{ contacts: DeviceContact[] }>;
  saveContact(o: ContactInput): Promise<{ ok: boolean; id: string }>;
  deleteContact(o: { id: string }): Promise<{ ok: boolean; deleted: number }>;
  getThreads(o: { limit?: number }): Promise<{ threads: SmsThread[] }>;
  getMessages(o: { threadId?: string; addresses?: string[]; limit?: number; before?: number }): Promise<{ threadId: string; messages: SmsMessage[] }>;
  sendSms(o: { addresses: string[]; body: string; subId?: number }): Promise<{ ok: boolean; threadId: string; rowIds: string[] }>;
  markThreadRead(o: { threadId: string }): Promise<{ ok: boolean }>;
  deleteThread(o: { threadId: string }): Promise<{ ok: boolean; deleted: number }>;
  deleteMessage(o: { id: string }): Promise<{ ok: boolean; deleted: number }>;
  rcsBridgeStatus(): Promise<Omit<RcsBridgeStatus, 'available'>>;
  openNotificationAccessSettings(): Promise<{ ok: boolean }>;
  openDefaultAppsSettings(): Promise<{ ok: boolean }>;
  listRcsThreads(): Promise<{ threads: RcsThread[] }>;
  getRcsMessages(o: { threadKey: string }): Promise<{ messages: RcsMessage[]; canReply: boolean }>;
  sendRcsReply(o: { threadKey: string; text: string }): Promise<{ ok: boolean }>;
  markRcsRead(o: { threadKey: string }): Promise<{ ok: boolean }>;
  deleteRcsThread(o: { threadKey: string }): Promise<{ ok: boolean }>;
  addListener(event: 'calls', fn: (s: CallsSnapshot) => void): Promise<PluginListenerHandle>;
  addListener(event: 'callEnded', fn: (e: { id: string; call: LiveCall }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'sms', fn: (e: { address: string; body: string; threadId: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'smsStatus', fn: (e: { rowId: string; status: 'sent' | 'failed' }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'phoneLaunch', fn: (e: PhoneLaunch) => void): Promise<PluginListenerHandle>;
  addListener(event: 'rcsMessage', fn: (e: { threadKey: string; title: string; message: RcsMessage }) => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<TelecomPlugin>('PlajahTelecom');

export function isTelecomAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

const OFF_STATUS: TelecomStatus = {
  available: false, hasTelephony: false, dialerRoleAvailable: false, smsRoleAvailable: false,
  isDefaultDialer: false, isDefaultSms: false,
  permissions: { phone: 'denied', contacts: 'denied', callLog: 'denied', sms: 'denied', notifications: 'denied' },
};

export async function getTelecomStatus(): Promise<TelecomStatus> {
  if (!isTelecomAvailable()) return OFF_STATUS;
  try { return { available: true, ...(await Native.getStatus()) }; } catch { return OFF_STATUS; }
}

/** Ask to become the default Phone and/or SMS app, then the runtime permissions they unlock. */
export async function becomeDefault(role: 'dialer' | 'sms'): Promise<boolean> {
  if (!isTelecomAvailable()) return false;
  const { granted } = await Native.requestRole({ role });
  if (granted) {
    const perms = role === 'dialer' ? ['phone', 'contacts', 'callLog', 'notifications'] : ['sms', 'contacts', 'notifications'];
    try { await Native.requestPermissions({ permissions: perms }); } catch { /* user can grant later per screen */ }
  }
  return granted;
}

export async function requestTelecomPermissions(aliases: (keyof TelecomStatus['permissions'])[]): Promise<void> {
  if (!isTelecomAvailable()) return;
  try { await Native.requestPermissions({ permissions: aliases }); } catch { /* */ }
}

// Thin pass-throughs — each is a no-op / empty off Android.
const guard = <T,>(fallback: T, fn: () => Promise<T>): Promise<T> => (isTelecomAvailable() ? fn() : Promise.resolve(fallback));

export const telecom = {
  pendingLaunch: () => guard<PhoneLaunch | null>(null, async () => (await Native.getPendingLaunch()).launch ?? null),
  placeCall: (number: string, speaker?: boolean) => guard(false, async () => (await Native.placeCall({ number, speaker })).ok),
  calls: () => guard<CallsSnapshot>({ calls: [] }, () => Native.getCalls()),
  answer: (id?: string) => guard(false, async () => (await Native.answer({ id })).ok),
  reject: (id?: string, message?: string) => guard(false, async () => (await Native.reject({ id, message })).ok),
  hangup: (id?: string) => guard(false, async () => (await Native.hangup({ id })).ok),
  hold: (id: string | undefined, on: boolean) => guard(false, async () => (await Native.hold({ id, on })).ok),
  merge: (id?: string) => guard(false, async () => (await Native.merge({ id })).ok),
  swap: (id?: string) => guard(false, async () => (await Native.swap({ id })).ok),
  dtmf: (digit: string, id?: string) => guard(false, async () => (await Native.dtmf({ id, digit })).ok),
  setMuted: (muted: boolean) => guard(false, async () => (await Native.setMuted({ muted })).ok),
  setAudioRoute: (route: AudioRoute) => guard(false, async () => (await Native.setAudioRoute({ route })).ok),
  sims: () => guard<{ subId: number; label: string; slot: number }[]>([], async () => (await Native.getSims()).sims),
  callLog: (limit = 200, number?: string) => guard<CallLogEntry[]>([], async () => (await Native.getCallLog({ limit, number })).entries),
  deleteCallLog: (ids: string[]) => guard(0, async () => (await Native.deleteCallLog({ ids })).deleted),
  contacts: () => guard<DeviceContact[]>([], async () => (await Native.getContacts()).contacts),
  saveContact: (c: ContactInput) => guard('', async () => (await Native.saveContact(c)).id),
  deleteContact: (id: string) => guard(0, async () => (await Native.deleteContact({ id })).deleted),
  threads: (limit = 200) => guard<SmsThread[]>([], async () => (await Native.getThreads({ limit })).threads),
  messages: (q: { threadId?: string; addresses?: string[]; limit?: number; before?: number }) =>
    guard<{ threadId: string; messages: SmsMessage[] }>({ threadId: '', messages: [] }, () => Native.getMessages(q)),
  sendSms: (addresses: string[], body: string, subId?: number) =>
    guard<{ threadId: string }>({ threadId: '' }, () => Native.sendSms({ addresses, body, subId })),
  markThreadRead: (threadId: string) => guard(false, async () => (await Native.markThreadRead({ threadId })).ok),
  deleteThread: (threadId: string) => guard(0, async () => (await Native.deleteThread({ threadId })).deleted),
  deleteMessage: (id: string) => guard(0, async () => (await Native.deleteMessage({ id })).deleted),
  // RCS bridge — new messages only, text only, replies while the notification is live.
  rcsStatus: () => guard<RcsBridgeStatus>({ available: false, enabled: false, googleMessagesInstalled: false, samsungMessagesInstalled: false, defaultSmsPackage: '' },
    async () => ({ available: true, ...(await Native.rcsBridgeStatus()) })),
  openNotificationAccess: () => guard(false, async () => (await Native.openNotificationAccessSettings()).ok),
  openDefaultApps: () => guard(false, async () => (await Native.openDefaultAppsSettings()).ok),
  rcsThreads: () => guard<RcsThread[]>([], async () => (await Native.listRcsThreads()).threads),
  rcsMessages: (threadKey: string) => guard<{ messages: RcsMessage[]; canReply: boolean }>({ messages: [], canReply: false }, () => Native.getRcsMessages({ threadKey })),
  rcsReply: (threadKey: string, text: string) => guard(false, async () => (await Native.sendRcsReply({ threadKey, text })).ok),
  rcsMarkRead: (threadKey: string) => guard(false, async () => (await Native.markRcsRead({ threadKey })).ok),
  rcsDelete: (threadKey: string) => guard(false, async () => (await Native.deleteRcsThread({ threadKey })).ok),
};

/** Subscribe to a plugin event; returns an unsubscribe. No-op off Android. */
export function onTelecom<E extends 'calls' | 'callEnded' | 'sms' | 'smsStatus' | 'phoneLaunch' | 'rcsMessage'>(
  event: E,
  fn: (payload: any) => void,
): () => void {
  if (!isTelecomAvailable()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  (Native.addListener as any)(event, fn).then((h: PluginListenerHandle) => {
    if (cancelled) h.remove(); else handle = h;
  }).catch(() => {});
  return () => { cancelled = true; handle?.remove(); };
}

/** Thread display helpers shared by the PhoneHub and Chat. */
export function threadTitle(t: SmsThread, nameFor: (n: string) => string | undefined): string {
  const names = t.addresses.map(a => nameFor(a) || a);
  return names.length ? names.join(', ') : 'Unknown';
}
