/**
 * Civic Notices — how a government tells people what affects them.
 *
 * Plajah users follow what matters to them: their address (and a radius around it), their ward,
 * a permit or case, a section of law, or a topic like road closures. When a government publishes a
 * notice (a permit decision, an ordinance change, a hearing, an emergency), this module decides who
 * gets it, on which channels, and when, from each person's own consent and preferences.
 *
 * It reuses the platform's delivery rails (in-app notifications, FCM push, Resend email with
 * HMAC unsubscribe — services/notify, routes/campaigns); this file is only the deciding.
 *
 * ── Rules ────────────────────────────────────────────────────────────────────
 * - Channel consent is explicit per channel. In-app is always on for things you follow; push and
 *   email need consent; SMS is modelled but disabled until the platform's SMS consent (TCPA) exists.
 * - Emergency alerts skip quiet hours and digests, never consent.
 * - Statutory notices (e.g. a rezoning hearing under MCL 125.3103) still need the newspaper and the
 *   mailed or delivered notice the law requires. Plajah adds a faster, wider channel on top; the
 *   checker below says what the law still requires, and never claims the app notice satisfies it.
 *
 * Pure: no Firebase, no DOM.
 */

export type NoticeKind =
  | 'permit_update' | 'ordinance_change' | 'hearing' | 'emergency' | 'service_disruption'
  | 'program_open' | 'case_update' | 'general';

export type DeliveryChannel = 'in_app' | 'push' | 'email' | 'sms';

export interface Point { lat: number; lng: number }

export type Follow =
  | { kind: 'address'; point: Point; radiusM: number; label: string }
  | { kind: 'ward'; ward: string }
  | { kind: 'parcel'; parcelId: string }
  | { kind: 'law'; sectionId: string }            // e.g. "mcl-125.3201" or a city-code section
  | { kind: 'case'; caseId: string }              // Civic Desk case or permit
  | { kind: 'topic'; topic: NoticeKind }
  | { kind: 'jurisdiction' };                     // everything citywide

export interface Subscriber {
  userId: string;
  jurisdictionId: string;
  follows: Follow[];
  /** Explicit consent per channel, with when it was given (proof of consent). */
  consent: Partial<Record<Exclude<DeliveryChannel, 'in_app'>, { at: number; source: string }>>;
  language?: string;
  /** Local hours [startHour, endHour) when non-emergency push/email waits, e.g. [21, 7]. */
  quietHours?: [number, number];
  /** 'instant' sends each notice; 'daily' rolls non-urgent ones into one digest. */
  cadence?: 'instant' | 'daily';
  /** Topics the person muted even though they match a follow. */
  muted?: NoticeKind[];
}

export interface Notice {
  id: string;
  jurisdictionId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** Translations keyed by language code. */
  i18n?: Record<string, { title: string; body: string }>;
  publishedAt: number;
  /** Where it applies. Absent = the whole jurisdiction. */
  area?: { point?: Point; radiusM?: number; wards?: string[]; parcelIds?: string[] };
  lawSectionIds?: string[];
  caseIds?: string[];
  /** Event date for hearings, closures etc. */
  eventAt?: number;
  /** A statutory notice the law separately requires to be published / mailed. */
  statutory?: { rule: 'mi_zoning_hearing'; newspaperAt?: number; mailedAt?: number; mailedToOwnersWithinFt?: number };
  link?: string;
}

export const EMERGENCY_KINDS: ReadonlySet<NoticeKind> = new Set(['emergency']);
const URGENT_KINDS: ReadonlySet<NoticeKind> = new Set(['emergency', 'service_disruption', 'case_update', 'permit_update']);

// ── Geometry ─────────────────────────────────────────────────────────────────
export function distanceM(a: Point, b: Point): number {
  const R = 6_371_000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ── Matching ─────────────────────────────────────────────────────────────────
/** Why a follow matches a notice, or null. The reason is shown to the person ("Because you follow…"). */
export function followMatches(f: Follow, n: Notice): string | null {
  switch (f.kind) {
    case 'jurisdiction': return 'You follow citywide updates';
    case 'topic': return f.topic === n.kind ? `You follow ${n.kind.replace('_', ' ')}s` : null;
    case 'law': return n.lawSectionIds?.includes(f.sectionId) ? `You follow ${f.sectionId.startsWith('mcl-') ? 'MCL ' + f.sectionId.slice(4) : f.sectionId}` : null;
    case 'case': return n.caseIds?.includes(f.caseId) ? 'Your request or permit' : null;
    case 'parcel': return n.area?.parcelIds?.includes(f.parcelId) ? 'A property you follow' : null;
    case 'ward': return n.area?.wards?.includes(f.ward) ? `Ward ${f.ward}` : null;
    case 'address': {
      if (!n.area) return null;
      if (n.area.point) {
        const d = distanceM(f.point, n.area.point);
        if (d <= f.radiusM + (n.area.radiusM ?? 0)) return `Near ${f.label}`;
      }
      return null;
    }
  }
}

/** Area-limited notices only reach people whose follows touch that area (or who follow the case/law). */
function inScope(n: Notice, s: Subscriber): string | null {
  if (s.jurisdictionId !== n.jurisdictionId) return null;
  if (s.muted?.includes(n.kind) && !EMERGENCY_KINDS.has(n.kind)) return null;
  for (const f of s.follows) {
    // A citywide or topic follow shouldn't pull in every hyper-local notice, except emergencies and
    // notices that genuinely have no area.
    if ((f.kind === 'jurisdiction' || f.kind === 'topic') && n.area && !EMERGENCY_KINDS.has(n.kind)) continue;
    // A case update is about one person's request: only the people following that case get it.
    if (n.kind === 'case_update' && f.kind !== 'case') continue;
    const why = followMatches(f, n);
    if (why) return why;
  }
  return null;
}

// ── Delivery planning ────────────────────────────────────────────────────────
export interface Delivery {
  userId: string;
  why: string;
  channels: DeliveryChannel[];
  /** When push/email go out: now, at the end of quiet hours, or in the daily digest. */
  sendAt: number;
  mode: 'instant' | 'after_quiet_hours' | 'digest';
  language: string;
  title: string;
  body: string;
}

function hourAt(t: number, tzOffsetMin: number): number { return new Date(t + tzOffsetMin * 60_000).getUTCHours(); }

function inQuiet(h: number, q?: [number, number]): boolean {
  if (!q) return false;
  const [a, b] = q;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

function nextHour(t: number, hour: number, tzOffsetMin: number): number {
  const local = new Date(t + tzOffsetMin * 60_000);
  let at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - tzOffsetMin * 60_000;
  if (at <= t) at += 86_400_000;
  return at;
}

export function planDeliveries(n: Notice, subs: Subscriber[], opts: { tzOffsetMin?: number; digestHour?: number; smsEnabled?: boolean } = {}): Delivery[] {
  const tz = opts.tzOffsetMin ?? 0, digestHour = opts.digestHour ?? 8;
  const emergency = EMERGENCY_KINDS.has(n.kind);
  const out: Delivery[] = [];
  for (const s of subs) {
    const why = inScope(n, s);
    if (!why) continue;
    const channels: DeliveryChannel[] = ['in_app'];
    if (s.consent.push) channels.push('push');
    if (s.consent.email) channels.push('email');
    if (s.consent.sms && opts.smsEnabled) channels.push('sms');
    const lang = s.language && n.i18n?.[s.language] ? s.language : 'en';
    const text = lang !== 'en' ? n.i18n![lang] : { title: n.title, body: n.body };
    let mode: Delivery['mode'] = 'instant', sendAt = n.publishedAt;
    if (!emergency) {
      if ((s.cadence ?? 'instant') === 'daily' && !URGENT_KINDS.has(n.kind)) { mode = 'digest'; sendAt = nextHour(n.publishedAt, digestHour, tz); }
      else if (inQuiet(hourAt(n.publishedAt, tz), s.quietHours)) { mode = 'after_quiet_hours'; sendAt = nextHour(n.publishedAt, s.quietHours![1], tz); }
    }
    out.push({ userId: s.userId, why, channels, sendAt, mode, language: lang, ...text });
  }
  return out;
}

export function deliverySummary(ds: Delivery[]) {
  const by = (c: DeliveryChannel) => ds.filter((d) => d.channels.includes(c)).length;
  return {
    people: ds.length,
    inApp: by('in_app'), push: by('push'), email: by('email'), sms: by('sms'),
    instant: ds.filter((d) => d.mode === 'instant').length,
    delayed: ds.filter((d) => d.mode === 'after_quiet_hours').length,
    digest: ds.filter((d) => d.mode === 'digest').length,
    languages: [...new Set(ds.map((d) => d.language))],
  };
}

// ── Statutory notice checks ──────────────────────────────────────────────────
export interface StatutoryCheck { ok: boolean; items: { label: string; ok: boolean; detail: string }[]; cite: string }

const DAY = 86_400_000;

/**
 * Michigan Zoning Enabling Act, MCL 125.3103: newspaper notice not less than 15 days before the
 * hearing; notice to owners of the subject property and to everyone assessed, and all occupants,
 * within 300 feet, given (delivered or mailed) not less than 15 days before; and the notice must
 * describe the request, identify the property with street addresses, say when and where it will be
 * considered, and say when and where written comments are received.
 */
export function checkZoningHearingNotice(n: Notice): StatutoryCheck {
  const h = n.eventAt, s = n.statutory;
  const items: StatutoryCheck['items'] = [];
  const days = (t?: number) => (h && t ? Math.floor((h - t) / DAY) : null);
  const np = days(s?.newspaperAt), ml = days(s?.mailedAt);
  items.push({ label: 'Newspaper notice 15+ days before', ok: np != null && np >= 15, detail: np == null ? 'No newspaper publication date recorded' : `${np} days before the hearing` });
  items.push({ label: 'Mailed or delivered notice 15+ days before', ok: ml != null && ml >= 15, detail: ml == null ? 'No mailing date recorded' : `${ml} days before the hearing` });
  items.push({ label: 'Owners and occupants within 300 feet', ok: (s?.mailedToOwnersWithinFt ?? 0) >= 300, detail: s?.mailedToOwnersWithinFt ? `Mailed within ${s.mailedToOwnersWithinFt} ft` : 'Mailing radius not recorded' });
  const body = (n.body || '').toLowerCase();
  items.push({ label: 'Says when and where it will be considered', ok: !!h && /(hearing|meeting|considered)/.test(body), detail: h ? new Date(h).toUTCString() : 'No hearing date' });
  items.push({ label: 'Says where written comments go', ok: /comment/.test(body), detail: /comment/.test(body) ? 'Mentions comments' : 'Add where and when written comments are received' });
  return { ok: items.every((i) => i.ok), items, cite: 'mcl-125.3103' };
}

// ── Law changes → notices ────────────────────────────────────────────────────
/** Build the notice people following a law section get when it changes (from a code.amendment_applied record). */
export function lawChangeNotice(args: { jurisdictionId: string; sectionId: string; catchline: string; ordinance: string; effectiveAt: number; publishedAt: number; link?: string }): Notice {
  const cite = args.sectionId.startsWith('mcl-') ? `MCL ${args.sectionId.slice(4)}` : args.sectionId;
  return {
    id: `law-${args.sectionId}-${args.publishedAt}`,
    jurisdictionId: args.jurisdictionId,
    kind: 'ordinance_change',
    title: `${cite} changed`,
    body: `${args.catchline} was amended by ${args.ordinance}. The change takes effect ${new Date(args.effectiveAt).toISOString().slice(0, 10)}. Read the new text and what changed in the Law Library.`,
    publishedAt: args.publishedAt,
    lawSectionIds: [args.sectionId],
    link: args.link,
  };
}
