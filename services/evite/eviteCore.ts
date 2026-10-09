// eviteCore — PURE rules for evites: ids, validation, capacity/waitlist, counts, calendar files, share links, CSV.
// No React, no Firebase, no network: the server, the studio and the tests all run this same code.
import type {
  EviteDoc, EviteFields, EviteRsvp, EviteSettings, EvitePublicView, RsvpStatus, EviteQuestion, EviteBringItem, EviteGifts,
} from './eviteTypes';
import { DEFAULT_SETTINGS, DEFAULT_GIFTS } from './eviteTypes';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';   // no look-alikes (0/o, 1/l)
/** Short, unguessable-enough, link-friendly id. `rand` is injectable for tests. */
export function newShortId(len = 8, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}
export const isShortId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{6,14}$/.test(s);

export const clampStr = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const clampInt = (v: unknown, lo: number, hi: number, d = lo): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function cleanFields(f: Partial<EviteFields>, prev?: EviteFields): EviteFields {
  const base: EviteFields = prev || { headline: '', subline: '', honoree: '', hostName: '', startsAt: Date.now() + 14 * 864e5, timezone: 'UTC', venueName: '', address: '', message: '' };
  const startsAt = Number.isFinite(Number(f.startsAt)) && Number(f.startsAt) > 0 ? Math.floor(Number(f.startsAt)) : base.startsAt;
  const endsRaw = f.endsAt === undefined ? base.endsAt : Number(f.endsAt);
  return {
    headline: clampStr(f.headline ?? base.headline, 90), subline: clampStr(f.subline ?? base.subline, 140),
    honoree: clampStr(f.honoree ?? base.honoree, 60), hostName: clampStr(f.hostName ?? base.hostName, 60),
    startsAt, endsAt: endsRaw && endsRaw > startsAt ? Math.floor(endsRaw) : undefined,
    timezone: clampStr(f.timezone ?? base.timezone, 60) || 'UTC',
    venueName: clampStr(f.venueName ?? base.venueName, 90), address: clampStr(f.address ?? base.address, 200),
    message: clampStr(f.message ?? base.message, 600),
  };
}

export function cleanSettings(s: Partial<EviteSettings> | undefined, prev: EviteSettings = DEFAULT_SETTINGS): EviteSettings {
  const o = { ...prev, ...(s || {}) };
  const cap = o.capacity === undefined || o.capacity === null || Number(o.capacity) <= 0 ? undefined : clampInt(o.capacity, 1, 100000);
  return {
    revealAddressAfterYes: !!o.revealAddressAfterYes, showGuestList: !!o.showGuestList, guestWall: !!o.guestWall,
    allowPlusOnes: !!o.allowPlusOnes, maxPartyPerRsvp: clampInt(o.maxPartyPerRsvp, 1, 20, 6), capacity: cap,
    waitlist: !!o.waitlist, rsvpDeadline: o.rsvpDeadline ? Math.floor(Number(o.rsvpDeadline)) || undefined : undefined,
    kidsField: !!o.kidsField, parentStep: !!o.parentStep, skipPlay: !!o.skipPlay, reminders: !!o.reminders,
  };
}

export function cleanQuestions(q: unknown): EviteQuestion[] {
  if (!Array.isArray(q)) return [];
  return q.slice(0, 6).map((x: any, i): EviteQuestion => ({
    id: clampStr(x?.id, 20) || `q${i + 1}`, label: clampStr(x?.label, 120),
    kind: x?.kind === 'choice' || x?.kind === 'yesno' ? x.kind : 'text',
    options: x?.kind === 'choice' && Array.isArray(x.options) ? x.options.slice(0, 8).map((o: any) => clampStr(o, 50)).filter(Boolean) : undefined,
    required: !!x?.required,
  })).filter(x => x.label);
}
export function cleanBringList(b: unknown, prev: EviteBringItem[] = []): EviteBringItem[] {
  if (!Array.isArray(b)) return [];
  const claims = new Map(prev.map(p => [p.id, p]));
  return b.slice(0, 30).map((x: any, i): EviteBringItem => {
    const id = clampStr(x?.id, 20) || `b${i + 1}`;
    const old = claims.get(id);
    return { id, label: clampStr(x?.label, 80), claimedBy: old?.claimedBy, claimedName: old?.claimedName };
  }).filter(x => x.label);
}

// ── RSVP rules ───────────────────────────────────────────────────────────────

export interface RsvpInput { name?: unknown; status?: unknown; adults?: unknown; kids?: unknown; contact?: unknown; note?: unknown; answers?: unknown; bringing?: unknown; via?: unknown }
export type RsvpCheck = { ok: true; value: Omit<EviteRsvp, 'id' | 'inviteId' | 'createdAt' | 'updatedAt'> } | { ok: false; error: string };

/** Validate + normalise a guest's answer. Never throws; returns a plain-language error a guest can act on. */
export function checkRsvp(input: RsvpInput, inv: Pick<EviteDoc, 'settings' | 'questions' | 'bringList'>): RsvpCheck {
  const name = clampStr(input.name, 60);
  if (!name) return { ok: false, error: 'Add your name so the host knows who you are.' };
  const status = input.status;
  if (status !== 'yes' && status !== 'maybe' && status !== 'no') return { ok: false, error: 'Pick Going, Maybe, or Can\u2019t make it.' };
  const s = inv.settings;
  const going = status !== 'no';
  const adults = going ? clampInt(input.adults, 1, s.maxPartyPerRsvp, 1) : 0;
  const kids = going && s.kidsField ? clampInt(input.kids, 0, s.maxPartyPerRsvp, 0) : 0;
  let a = adults, k = kids;
  if (!s.allowPlusOnes) { a = going ? 1 : 0; k = going && s.kidsField ? Math.min(k, s.maxPartyPerRsvp - 1) : 0; }
  if (going && a + k > s.maxPartyPerRsvp) return { ok: false, error: `Up to ${s.maxPartyPerRsvp} people per RSVP.` };
  const contact = clampStr(input.contact, 120);
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) && !/^[+()\d][\d\s().-]{6,20}$/.test(contact)) return { ok: false, error: 'That email or phone number doesn\u2019t look right (or leave it blank).' };
  const raw: Record<string, unknown> = input.answers && typeof input.answers === 'object' ? input.answers as any : {};
  const answers: Record<string, string> = {};
  for (const q of inv.questions) {
    const v = clampStr(raw[q.id], 200);
    if (going && q.required && !v) return { ok: false, error: `Please answer: ${q.label}` };
    if (v) answers[q.id] = v;
  }
  const valid = new Set(inv.bringList.map(b => b.id));
  const bringing = Array.isArray(input.bringing) ? [...new Set(input.bringing.map(x => clampStr(x, 20)).filter(x => valid.has(x)))].slice(0, 5) : [];
  return { ok: true, value: { name, status, adults: a, kids: k, contact: contact || undefined, note: clampStr(input.note, 300) || undefined, answers: Object.keys(answers).length ? answers : undefined, bringing: going && bringing.length ? bringing : undefined, via: clampStr(input.via, 24) || undefined } };
}

export const partySize = (r: Pick<EviteRsvp, 'adults' | 'kids' | 'status'>): number => (r.status === 'yes' ? r.adults + r.kids : 0);

export function isClosed(inv: Pick<EviteDoc, 'status' | 'settings'>, now = Date.now()): boolean {
  return inv.status === 'closed' || inv.status === 'cancelled' || (!!inv.settings.rsvpDeadline && now > inv.settings.rsvpDeadline);
}

/** Headcount of confirmed guests, excluding `exceptId` (when a guest edits their own answer). */
export function confirmedHeadcount(rsvps: EviteRsvp[], exceptId?: string): number {
  return rsvps.reduce((n, r) => n + (r.id === exceptId ? 0 : partySize(r)), 0);
}

/** Decide the stored status when capacity applies: a "yes" that doesn't fit becomes waitlist (or is refused). */
export function applyCapacity(want: RsvpStatus, party: number, settings: EviteSettings, taken: number): { status: RsvpStatus; error?: string } {
  if (want !== 'yes' || !settings.capacity) return { status: want };
  if (taken + party <= settings.capacity) return { status: 'yes' };
  if (settings.waitlist) return { status: 'waitlist' };
  return { status: want, error: 'This one is full. Ask the host to make room.' };
}

/** After someone leaves, promote waitlisted guests (oldest first) whose party now fits. Returns ids promoted. */
export function promoteWaitlist(rsvps: EviteRsvp[], settings: EviteSettings): string[] {
  if (!settings.capacity) return [];
  let taken = confirmedHeadcount(rsvps);
  const out: string[] = [];
  for (const r of rsvps.filter(x => x.status === 'waitlist').sort((a, b) => a.createdAt - b.createdAt)) {
    const size = r.adults + r.kids;
    if (taken + size <= settings.capacity) { taken += size; out.push(r.id); }
  }
  return out;
}

export function summarize(rsvps: EviteRsvp[], settings: EviteSettings) {
  const c = { yes: 0, maybe: 0, no: 0, waitlist: 0, headcount: 0, spotsLeft: null as number | null };
  for (const r of rsvps) { c[r.status] += 1; }
  c.headcount = confirmedHeadcount(rsvps);
  c.spotsLeft = settings.capacity ? Math.max(0, settings.capacity - c.headcount) : null;
  return c;
}

/** What a guest may see. The address is withheld until they say yes when the host asked for privacy. */
export function toPublicView(inv: EviteDoc, rsvps: EviteRsvp[], wall: Array<{ id: string; inviteId: string; name: string; text: string; createdAt: number }>, opts: { viewerStatus?: RsvpStatus; now?: number; raisedCents?: number; stripeReady?: boolean } = {}): EvitePublicView {
  const hide = inv.settings.revealAddressAfterYes && opts.viewerStatus !== 'yes';
  const { address, ...rest } = inv.fields;
  const s = inv.settings;
  return {
    id: inv.id, templateId: inv.templateId,
    fields: hide ? { ...rest, addressHidden: true } : { ...rest, address },
    look: inv.look,
    settings: { allowPlusOnes: s.allowPlusOnes, maxPartyPerRsvp: s.maxPartyPerRsvp, kidsField: s.kidsField, parentStep: s.parentStep, skipPlay: s.skipPlay, showGuestList: s.showGuestList, guestWall: s.guestWall, waitlist: s.waitlist, rsvpDeadline: s.rsvpDeadline, revealAddressAfterYes: s.revealAddressAfterYes },
    questions: inv.questions,
    bringList: inv.bringList.map(b => ({ id: b.id, label: b.label, claimedName: b.claimedName })),
    photoUrl: inv.photoUrl, registryUrl: inv.registryUrl, eventId: inv.eventId, photoPoolId: inv.photoPoolId,
    clubId: opts.viewerStatus && opts.viewerStatus !== 'no' ? inv.clubId : undefined,
    clubInvite: opts.viewerStatus && opts.viewerStatus !== 'no' ? inv.clubInvite : undefined,
    gifts: inv.gifts?.enabled ? { enabled: true, title: inv.gifts.title, stripe: inv.gifts.stripe && !!opts.stripeReady, stripeReady: !!opts.stripeReady, presetsCents: inv.gifts.presetsCents, goalCents: inv.gifts.goalCents, cashApp: inv.gifts.cashApp, zelle: inv.gifts.zelle, venmo: inv.gifts.venmo, paypalMe: inv.gifts.paypalMe, offerOnDecline: inv.gifts.offerOnDecline, raisedCents: inv.gifts.goalCents ? (opts.raisedCents || 0) : undefined } : undefined,
    status: inv.status, hostName: inv.fields.hostName, counts: summarize(rsvps, s),
    guests: s.showGuestList ? rsvps.filter(r => r.status === 'yes').sort((a, b) => a.createdAt - b.createdAt).slice(0, 60).map(r => ({ name: r.name, status: r.status })) : undefined,
    wall: s.guestWall ? wall.slice(0, 40) : undefined,
    closed: isClosed(inv, opts.now),
  };
}

// ── Calendar ─────────────────────────────────────────────────────────────────

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => { const out: string[] = []; let l = line; while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); } out.push(l); return out.join('\r\n'); };

export function buildIcs(f: EviteFields, url: string, uid: string): string {
  const end = f.endsAt || f.startsAt + 3 * 36e5;
  const where = [f.venueName, f.address].filter(Boolean).join(', ');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plajah//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}@plajah.com`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(f.startsAt)}`, `DTEND:${icsDate(end)}`,
    fold(`SUMMARY:${icsEsc(f.headline || 'Event')}`), where ? fold(`LOCATION:${icsEsc(where)}`) : '',
    fold(`DESCRIPTION:${icsEsc([f.subline, f.message, url].filter(Boolean).join('\n'))}`), fold(`URL:${url}`),
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Starting soon', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n') + '\r\n';
}
export function googleCalendarUrl(f: EviteFields, url: string): string {
  const end = f.endsAt || f.startsAt + 3 * 36e5;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: f.headline || 'Event', dates: `${icsDate(f.startsAt)}/${icsDate(end)}`, details: [f.subline, f.message, url].filter(Boolean).join('\n'), location: [f.venueName, f.address].filter(Boolean).join(', ') });
  return `https://calendar.google.com/calendar/render?${q}`;
}
export const outlookCalendarUrl = (f: EviteFields, url: string): string => {
  const end = f.endsAt || f.startsAt + 3 * 36e5;
  const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: f.headline || 'Event', startdt: new Date(f.startsAt).toISOString(), enddt: new Date(end).toISOString(), body: [f.subline, url].filter(Boolean).join('\n'), location: [f.venueName, f.address].filter(Boolean).join(', ') });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q}`;
};
export const mapLinks = (f: Pick<EviteFields, 'venueName' | 'address'>) => {
  const q = encodeURIComponent([f.venueName, f.address].filter(Boolean).join(' '));
  return { google: `https://www.google.com/maps/search/?api=1&query=${q}`, apple: `https://maps.apple.com/?q=${q}` };
};

// ── Share ────────────────────────────────────────────────────────────────────

export const inviteUrl = (origin: string, id: string, ref?: string): string => `${origin.replace(/\/$/, '')}/i/${id}${ref ? `?v=${encodeURIComponent(ref)}` : ''}`;

export function shareTargets(url: string, f: Pick<EviteFields, 'headline' | 'hostName'>) {
  const text = `${f.hostName ? f.hostName + ' invited you: ' : 'You\u2019re invited: '}${f.headline}`;
  const t = encodeURIComponent(text), u = encodeURIComponent(url);
  return {
    text, whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, sms: `sms:?&body=${encodeURIComponent(text + ' ' + url)}`,
    email: `mailto:?subject=${t}&body=${encodeURIComponent(text + '\n\n' + url)}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`, telegram: `https://t.me/share/url?url=${u}&text=${t}`,
  };
}

// ── Host exports ─────────────────────────────────────────────────────────────

const csvCell = (v: unknown): string => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };   // neutralises spreadsheet formula injection
export function rsvpsToCsv(rsvps: EviteRsvp[], questions: EviteQuestion[], bring: EviteBringItem[]): string {
  const head = ['Name', 'Response', 'Adults', 'Kids', 'Contact', 'Note', ...questions.map(q => q.label), 'Bringing', 'Responded'];
  const lab = new Map(bring.map(b => [b.id, b.label]));
  const rows = rsvps.map(r => [r.name, r.status, r.adults, r.kids, r.contact || '', r.note || '', ...questions.map(q => r.answers?.[q.id] || ''), (r.bringing || []).map(i => lab.get(i) || i).join('; '), new Date(r.updatedAt).toISOString()]);
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

export function relativeDay(ms: number, now = Date.now()): string {
  const d = Math.round((ms - now) / 864e5);
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? `in ${d} days` : d === -1 ? 'yesterday' : `${-d} days ago`;
}

// ── Gifts ────────────────────────────────────────────────────────────────────

const CASHTAG = /^\$[A-Za-z][A-Za-z0-9_]{1,19}$/;
const VENMO = /^@?[A-Za-z0-9_-]{3,30}$/;
const PAYPALME = /^[A-Za-z0-9]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{10,18}$/;

/** Accepts what a person would paste ("cash.app/$leo", "leo", "@leo") and keeps only a valid handle. Never keeps a URL. */
export function cleanCashApp(v: unknown): string | undefined {
  let s = clampStr(v, 80).replace(/^(https?:\/\/)?(www\.)?cash\.app\//i, '');
  if (s && !s.startsWith('$')) s = '$' + s;
  return CASHTAG.test(s) ? s : undefined;
}
export function cleanZelle(v: unknown): string | undefined {
  const s = clampStr(v, 80);
  return EMAIL.test(s) || PHONE.test(s) ? s : undefined;
}
export function cleanVenmo(v: unknown): string | undefined {
  const s = clampStr(v, 80).replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, '');
  return VENMO.test(s) ? s.replace(/^@/, '') : undefined;
}
export function cleanPaypalMe(v: unknown): string | undefined {
  const s = clampStr(v, 80).replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/\/$/, '');
  return PAYPALME.test(s) ? s : undefined;
}

export function cleanGifts(g: Partial<EviteGifts> | undefined, prev: EviteGifts = DEFAULT_GIFTS): EviteGifts {
  const o = { ...prev, ...(g || {}) };
  const presets = (Array.isArray(o.presetsCents) ? o.presetsCents : prev.presetsCents).map(n => Math.floor(Number(n))).filter(n => n >= 100 && n <= 100000).slice(0, 5);
  const goal = Math.floor(Number(o.goalCents));
  return {
    enabled: !!o.enabled, title: clampStr(o.title, 80) || undefined, stripe: !!o.stripe,
    presetsCents: presets.length ? presets : DEFAULT_GIFTS.presetsCents,
    goalCents: Number.isFinite(goal) && goal >= 100 ? Math.min(goal, 1e8) : undefined,
    cashApp: cleanCashApp(o.cashApp), zelle: cleanZelle(o.zelle), venmo: cleanVenmo(o.venmo), paypalMe: cleanPaypalMe(o.paypalMe),
    offerOnDecline: !!o.offerOnDecline,
  };
}

export const cashAppUrl = (tag: string) => `https://cash.app/${tag}`;
export const venmoUrl = (u: string) => `https://venmo.com/u/${u}`;
export const paypalMeUrl = (u: string) => `https://paypal.me/${u}`;

export function cleanLook(l: any, prev: EviteDoc['look'] = { motion: true, sound: false }): EviteDoc['look'] {
  const accent = typeof l?.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.accent) ? l.accent : prev.accent;
  const inter = l?.interaction;
  // Design eras: the host may draw the era's structural law faintly over the art (off unless they turn it on).
  const showLaw = l?.showLaw === undefined ? prev.showLaw : !!l.showLaw;
  return { accent, motion: l?.motion === undefined ? prev.motion : !!l.motion, sound: l?.sound === undefined ? prev.sound : !!l.sound, interaction: ['template', 'none', 'scratch', 'game'].includes(inter) ? inter : prev.interaction, ...(showLaw === undefined ? {} : { showLaw }) };
}

/** Only http(s) URLs, never javascript:/data:. Returns '' when not acceptable. */
export function safeHttpUrl(v: unknown): string {
  const s = clampStr(v, 500);
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : ''; } catch { return ''; }
}

/** Host context from the client, trimmed to what we store. */
export function cleanHost(h: any): import('./eviteTypes').EviteHost | undefined {
  const kinds = ['user', 'org', 'business', 'school', 'teacher'];
  if (!h || !kinds.includes(h.kind)) return undefined;
  return { kind: h.kind, id: clampStr(h.id, 80) || undefined, label: clampStr(h.label, 80) || undefined };
}

// ── Reminders ────────────────────────────────────────────────────────────────

/** A live invite with reminders on, starting in the next `windowH` hours, not yet reminded. */
export function dueForReminder(inv: Pick<EviteDoc, 'status' | 'settings' | 'fields'> & { remindedAt?: number }, now = Date.now(), windowH = 26): boolean {
  if (inv.status !== 'live' || !inv.settings.reminders || inv.remindedAt) return false;
  const t = inv.fields.startsAt - now;
  return t > 0 && t <= windowH * 36e5;
}
export const isEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Plain-text reminder (no tracking, one link back to the living invite). */
export function reminderEmail(inv: Pick<EviteDoc, 'id' | 'fields'>, r: Pick<EviteRsvp, 'name' | 'status'>, origin: string): { subject: string; text: string } {
  const f = inv.fields;
  let when = '';
  try { when = new Date(f.startsAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: f.timezone || 'UTC' }); } catch { when = new Date(f.startsAt).toUTCString(); }
  const first = r.name.split(' ')[0];
  return {
    subject: `Tomorrow: ${f.headline}`,
    text: [`Hi ${first},`, '', `A reminder that ${f.headline} is ${when}${f.venueName ? ' at ' + f.venueName : ''}.`, r.status === 'maybe' ? 'You said maybe. Tap the link to let the host know either way.' : 'See you there!', '',
      `Details, directions and your reply: ${inviteUrl(origin, inv.id)}`, '', f.hostName ? `${f.hostName} sent this through Plajah Events.` : 'Sent through Plajah Events.'].join('\n'),
  };
}
