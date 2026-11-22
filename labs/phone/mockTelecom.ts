// labs/phone/mockTelecom.ts — stands in for services/phone/telecom.ts in phone-lab (desktop browser,
// no Android, no sign-in). Same exports; seeded with fake contacts, recents, texts and calls.
//   ?call=incoming|active|none   ?setup=1 (shows the "make Plajah your phone" card)
//   ?launch=dial:3135550142 | sms:3135550142
import type {
  AudioRoute, CallLogEntry, CallsSnapshot, ContactInput, LiveCall, PhoneLaunch, SmsMessage, SmsThread, TelecomStatus,
  RcsBridgeStatus, RcsMessage, RcsThread,
} from '../../services/phone/telecom';
import type { DeviceContact } from '../../services/phone/contactsMerge';
export type * from '../../services/phone/telecom';

const q = new URLSearchParams(location.search);
const now = Date.now();
const min = 60_000, hr = 60 * min, day = 24 * hr;

const contacts: DeviceContact[] = [
  { id: '1', displayName: 'Mom', givenName: 'Mom', starred: true, phones: [{ number: '+13135550101', label: 'Mobile' }], emails: [] },
  { id: '2', displayName: 'Pastor Grace Owens', givenName: 'Grace', familyName: 'Owens', organization: 'Great Faith Church', starred: true, phones: [{ number: '(313) 555-0142', label: 'Mobile' }, { number: '313-555-0100', label: 'Work' }], emails: [{ address: 'grace@greatfaith.example', label: 'Work' }] },
  { id: '3', displayName: 'Andre Mitchell', givenName: 'Andre', familyName: 'Mitchell', phones: [{ number: '3135550177', label: 'Mobile' }], emails: [{ address: 'andre@example.com', label: 'Home' }] },
  { id: '4', displayName: 'Bianca Lee', givenName: 'Bianca', familyName: 'Lee', phones: [{ number: '+12485550190', label: 'Mobile' }], emails: [] },
  { id: '5', displayName: 'Coach Reggie', givenName: 'Reggie', phones: [{ number: '3135550133', label: 'Mobile' }], emails: [] },
  { id: '6', displayName: 'Dr. Patel Office', organization: 'Midtown Family Clinic', phones: [{ number: '3135550199', label: 'Work' }], emails: [] },
  { id: '7', displayName: 'Erica Johnson', givenName: 'Erica', familyName: 'Johnson', phones: [{ number: '7345550111', label: 'Mobile' }], emails: [{ address: 'erica.j@example.com', label: 'Home' }] },
  { id: '8', displayName: 'Marcus (Choir)', givenName: 'Marcus', phones: [{ number: '3135550188', label: 'Mobile' }], emails: [] },
  { id: '9', displayName: 'Tasha Williams', givenName: 'Tasha', familyName: 'Williams', phones: [{ number: '5865550123', label: 'Mobile' }], emails: [] },
];

let recents: CallLogEntry[] = [
  { id: 'r1', number: '3135550177', name: 'Andre Mitchell', type: 'missed', date: now - 12 * min, duration: 0, isNew: true },
  { id: 'r2', number: '+13135550101', name: 'Mom', type: 'incoming', date: now - 2 * hr, duration: 1284, isNew: false },
  { id: 'r3', number: '(313) 555-0142', name: 'Pastor Grace Owens', type: 'outgoing', date: now - 5 * hr, duration: 312, isNew: false },
  { id: 'r4', number: '8005550199', name: '', type: 'rejected', date: now - day - 3 * hr, duration: 0, isNew: false },
  { id: 'r5', number: '7345550111', name: 'Erica Johnson', type: 'outgoing', date: now - 2 * day, duration: 64, isNew: false },
  { id: 'r6', number: '3135550133', name: 'Coach Reggie', type: 'incoming', date: now - 3 * day, duration: 455, isNew: false },
  { id: 'r7', number: '2025550147', name: '', type: 'blocked', date: now - 4 * day, duration: 0, isNew: false },
  { id: 'r8', number: '5865550123', name: 'Tasha Williams', type: 'missed', date: now - 6 * day, duration: 0, isNew: false },
];

const threadsSeed: { t: SmsThread; msgs: SmsMessage[] }[] = [
  mk('t1', ['3135550177'], [
    [false, 'Yo you coming to the game Saturday?', 40 * min],
    [true, 'Yeah! What time does it start?', 35 * min],
    [false, 'Tip-off at 7. I got us seats near the floor 🏀', 20 * min],
  ], 1),
  mk('t2', ['+13135550101'], [
    [false, 'Did you eat today?', 3 * hr],
    [true, 'Yes ma\'am 😄', 2.9 * hr],
    [false, 'Sunday dinner at 4. Bring the mac and cheese pan back please', 2.5 * hr],
  ], 0),
  mk('t3', ['(313) 555-0142'], [
    [false, 'Reminder: prayer call tonight at 8 PM. Link is in the church app.', 6 * hr],
    [true, 'I\'ll be on. Thank you Pastor', 5.8 * hr],
  ], 0),
  mk('t4', ['22395'], [[false, 'Your verification code is 482915. It expires in 10 minutes.', day]], 0),
  mk('t5', ['7345550111', '3135550188'], [
    [false, 'Choir rehearsal moved to Thursday', 2 * day],
    [true, 'Got it, thanks for the heads up', 2 * day - hr],
  ], 0),
];

function mk(id: string, addresses: string[], rows: [boolean, string, number][], unread: number): { t: SmsThread; msgs: SmsMessage[] } {
  const msgs = rows.map(([out, body, ago], i): SmsMessage => ({
    id: `sms:${id}${i}`, kind: 'sms', address: addresses[0], body, date: now - ago, outgoing: out, status: out ? 'sent' : 'received', read: !(!out && i >= rows.length - unread),
  }));
  const last = msgs[msgs.length - 1];
  return { t: { threadId: id, addresses, snippet: last.body, date: last.date, messageCount: msgs.length, unread: unread > 0, unreadCount: unread, hasAttachment: false }, msgs };
}

// ── RCS bridge (?rcs=off shows the setup card) ──────────────────────────────────
const rcsOn = q.get('rcs') !== 'off';
const rcs: { t: RcsThread; msgs: RcsMessage[] }[] = [
  {
    t: { threadKey: 'g|bianca', title: 'Bianca Lee', isGroup: false, source: 'google', snippet: '', date: 0, unreadCount: 2, canReply: true },
    msgs: [
      { id: 'r1', sender: 'Bianca Lee', body: 'Sent you the flyer for Saturday 🎨', date: now - 25 * min, outgoing: false },
      { id: 'r2', sender: '', body: 'Looks amazing!! Printing 200', date: now - 22 * min, outgoing: true },
      { id: 'r3', sender: 'Bianca Lee', body: '[image]', date: now - 9 * min, outgoing: false },
      { id: 'r4', sender: 'Bianca Lee', body: 'Final version ^ with the QR code', date: now - 8 * min, outgoing: false },
    ],
  },
  {
    t: { threadKey: 'g|family', title: 'Family 💛', isGroup: true, source: 'google', snippet: '', date: 0, unreadCount: 0, canReply: false },
    msgs: [
      { id: 'f1', sender: 'Tasha Williams', body: "Who's bringing the dessert Sunday?", date: now - 4 * hr, outgoing: false },
      { id: 'f2', sender: 'Mom', body: 'Peach cobbler is covered 😌', date: now - 3.8 * hr, outgoing: false },
    ],
  },
];
rcs.forEach(x => { const l = x.msgs[x.msgs.length - 1]; x.t.snippet = l.body; x.t.date = l.date; });

// ── live calls ────────────────────────────────────────────────────────────────
const callMode = q.get('call') || 'none';
let snap: CallsSnapshot = { calls: [], muted: false, route: 'earpiece', routes: ['earpiece', 'speaker', 'bluetooth'] };
if (callMode === 'incoming') snap.calls = [{ id: 'c1', number: '(313) 555-0142', name: '', state: 'ringing', incoming: true, conference: false, canHold: true, canMerge: false, video: false }];
if (callMode === 'active') snap.calls = [{ id: 'c1', number: '+13135550101', name: '', state: 'active', incoming: true, conference: false, canHold: true, canMerge: false, video: false, connectedAt: now - 3 * min - 27_000 }];

const listeners = new Map<string, Set<(p: any) => void>>();
const emit = (e: string, p: any) => listeners.get(e)?.forEach(fn => fn(p));
const setCalls = (calls: LiveCall[]) => { snap = { ...snap, calls }; emit('calls', snap); };
const patchCall = (id: string | undefined, patch: Partial<LiveCall>) => setCalls(snap.calls.map(c => (!id || c.id === id) ? { ...c, ...patch } : c));
const endCall = (id?: string) => {
  const c = snap.calls.find(x => !id || x.id === id);
  setCalls(snap.calls.filter(x => x !== c));
  if (c) {
    recents = [{ id: `r${Date.now()}`, number: c.number, name: '', type: c.connectedAt ? (c.incoming ? 'incoming' : 'outgoing') : (c.incoming ? 'rejected' : 'outgoing'), date: Date.now(), duration: c.connectedAt ? Math.round((Date.now() - c.connectedAt) / 1000) : 0, isNew: false }, ...recents];
    emit('callEnded', { id: c.id, call: c });
  }
};

/** Lab controls (window.phoneLab) for the toolbar and for screenshots. */
(window as any).phoneLab = {
  incoming: (number = '3135550177') => setCalls([{ id: `c${Date.now()}`, number, name: '', state: 'ringing', incoming: true, conference: false, canHold: true, canMerge: false, video: false }, ...snap.calls]),
  text: (from = '3135550177', body = 'Running 5 min late!') => {
    const th = threadsSeed.find(x => x.t.addresses[0] === from);
    const m: SmsMessage = { id: `sms:${Date.now()}`, kind: 'sms', address: from, body, date: Date.now(), outgoing: false, status: 'received', read: false };
    if (th) { th.msgs.push(m); th.t = { ...th.t, snippet: body, date: m.date, unread: true, unreadCount: th.t.unreadCount + 1 }; }
    emit('sms', { address: from, body, threadId: th?.t.threadId || '' });
  },
  end: () => endCall(),
};

export function isTelecomAvailable(): boolean { return true; }

export async function getTelecomStatus(): Promise<TelecomStatus> {
  const setup = q.get('setup') === '1';
  return {
    available: true, hasTelephony: true, dialerRoleAvailable: true, smsRoleAvailable: true,
    isDefaultDialer: !setup, isDefaultSms: !setup,
    permissions: { phone: 'granted', contacts: 'granted', callLog: 'granted', sms: 'granted', notifications: 'granted' },
  };
}

export async function becomeDefault(_role: 'dialer' | 'sms'): Promise<boolean> { return true; }
export async function requestTelecomPermissions(_a: string[]): Promise<void> {}

const later = <T,>(v: T) => new Promise<T>(r => setTimeout(() => r(v), 30));

export const telecom = {
  pendingLaunch: async (): Promise<PhoneLaunch | null> => {
    const l = q.get('launch');
    if (!l) return null;
    const [kind, value] = l.split(':');
    return kind === 'sms' ? { kind: 'sms', addresses: [value], body: '' } : { kind: 'dial', number: value || '' };
  },
  placeCall: async (number: string) => {
    const id = `c${Date.now()}`;
    setCalls([{ id, number, name: '', state: 'dialing', incoming: false, conference: false, canHold: true, canMerge: false, video: false }, ...snap.calls.map(c => c.state === 'active' ? { ...c, state: 'holding' as const } : c)]);
    setTimeout(() => patchCall(id, { state: 'active', connectedAt: Date.now() }), 2200);
    return true;
  },
  calls: () => later(snap),
  answer: async (id?: string) => { patchCall(id, { state: 'active', connectedAt: Date.now() }); return true; },
  reject: async (id?: string) => { endCall(id); return true; },
  hangup: async (id?: string) => { endCall(id); return true; },
  hold: async (id: string | undefined, on: boolean) => { patchCall(id, { state: on ? 'holding' : 'active' }); return true; },
  merge: async () => true,
  swap: async () => true,
  dtmf: async () => true,
  setMuted: async (muted: boolean) => { snap = { ...snap, muted }; emit('calls', snap); return true; },
  setAudioRoute: async (route: AudioRoute) => { snap = { ...snap, route }; emit('calls', snap); return true; },
  sims: async () => [{ subId: 1, label: 'T-Mobile', slot: 0 }],
  callLog: async () => later(recents),
  deleteCallLog: async (ids: string[]) => { recents = recents.filter(r => !ids.includes(r.id)); return ids.length; },
  contacts: async () => later(contacts),
  saveContact: async (c: ContactInput) => {
    const id = c.id || String(Date.now());
    const entry: DeviceContact = { id, displayName: [c.givenName, c.familyName].filter(Boolean).join(' '), givenName: c.givenName, familyName: c.familyName, organization: c.organization, starred: c.starred, phones: c.phones, emails: c.emails };
    const i = contacts.findIndex(x => x.id === id);
    if (i >= 0) contacts[i] = entry; else contacts.push(entry);
    return id;
  },
  deleteContact: async (id: string) => { const i = contacts.findIndex(x => x.id === id); if (i >= 0) contacts.splice(i, 1); return 1; },
  threads: async () => later(threadsSeed.map(x => x.t).sort((a, b) => b.date - a.date)),
  messages: async (o: { threadId?: string; addresses?: string[] }) => {
    const th = threadsSeed.find(x => x.t.threadId === o.threadId) || threadsSeed.find(x => o.addresses && x.t.addresses[0] === o.addresses[0]);
    return later({ threadId: th?.t.threadId || '', messages: th?.msgs || [] });
  },
  sendSms: async (addresses: string[], body: string) => {
    let th = threadsSeed.find(x => x.t.addresses[0] === addresses[0]);
    if (!th) { th = mk(`t${Date.now()}`, addresses, [], 0); th.msgs = []; threadsSeed.push(th); }
    const m: SmsMessage = { id: `sms:${Date.now()}`, kind: 'sms', address: addresses[0], body, date: Date.now(), outgoing: true, status: 'sending', read: true };
    th.msgs.push(m);
    th.t = { ...th.t, snippet: body, date: m.date, messageCount: th.msgs.length };
    setTimeout(() => { m.status = 'sent'; emit('smsStatus', { rowId: m.id, status: 'sent' }); }, 900);
    return { threadId: th.t.threadId };
  },
  markThreadRead: async (threadId: string) => {
    const th = threadsSeed.find(x => x.t.threadId === threadId);
    if (th) th.t = { ...th.t, unread: false, unreadCount: 0 };
    return true;
  },
  deleteThread: async (threadId: string) => { const i = threadsSeed.findIndex(x => x.t.threadId === threadId); if (i >= 0) threadsSeed.splice(i, 1); return 1; },
  deleteMessage: async () => 1,
  rcsStatus: async (): Promise<RcsBridgeStatus> => ({ available: true, enabled: rcsOn, googleMessagesInstalled: true, samsungMessagesInstalled: false, defaultSmsPackage: 'com.google.android.apps.messaging' }),
  openNotificationAccess: async () => { alert('Opens Android Settings → Notification access'); return true; },
  openDefaultApps: async () => { alert('Opens Android Settings → Default apps'); return true; },
  rcsThreads: async () => later(rcsOn ? rcs.map(x => x.t).sort((a, b) => b.date - a.date) : []),
  rcsMessages: async (key: string) => { const x = rcs.find(r => r.t.threadKey === key); return later({ messages: x?.msgs || [], canReply: !!x?.t.canReply }); },
  rcsReply: async (key: string, text: string) => {
    const x = rcs.find(r => r.t.threadKey === key);
    if (!x || !x.t.canReply) return false;
    x.msgs.push({ id: `r${Date.now()}`, sender: '', body: text, date: Date.now(), outgoing: true });
    x.t = { ...x.t, snippet: text, date: Date.now() };
    return true;
  },
  rcsMarkRead: async (key: string) => { const x = rcs.find(r => r.t.threadKey === key); if (x) x.t = { ...x.t, unreadCount: 0 }; return true; },
  rcsDelete: async (key: string) => { const i = rcs.findIndex(r => r.t.threadKey === key); if (i >= 0) rcs.splice(i, 1); return true; },
};

export function onTelecom(event: string, fn: (payload: any) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => { listeners.get(event)?.delete(fn); };
}

export function threadTitle(t: SmsThread, nameFor: (n: string) => string | undefined): string {
  const names = t.addresses.map(a => nameFor(a) || a);
  return names.length ? names.join(', ') : 'Unknown';
}
