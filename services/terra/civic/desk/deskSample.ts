/**
 * Civic Desk — SAMPLE configuration and records for the preview.
 *
 * Everything here is made up for demonstration: the people, businesses, addresses and cases are
 * fictional. The department list mirrors a typical mid-size Michigan city's structure so the routing
 * reads naturally; a real tenant replaces it with its own. Law references point at real sections in
 * the Terra Law Library (data/terraLaw/mi).
 */

import type { Case, Constituent, Department, ReplyTemplate, ServiceType } from './deskCore';
import { openCase, setStatus, reply, assign, addNote, DAY_MS, HOUR_MS } from './deskCore';

export const SAMPLE_DEPARTMENTS: Department[] = [
  { id: 'dpw', name: 'Department of Public Works', publicName: 'Public Works' },
  { id: 'water', name: 'Water & Sewerage', publicName: 'Water' },
  { id: 'buildings', name: 'Buildings, Safety & Code', publicName: 'Buildings & Code' },
  { id: 'clerk', name: 'City Clerk', publicName: 'City Clerk' },
  { id: 'business', name: 'Business Licensing', publicName: 'Business Licensing' },
  { id: 'parks', name: 'Parks & Recreation', publicName: 'Parks' },
  { id: 'housing', name: 'Housing & Revitalization', publicName: 'Housing' },
  { id: 'neighborhoods', name: 'Department of Neighborhoods', publicName: 'Neighborhoods' },
];

export const SAMPLE_SERVICES: ServiceType[] = [
  { id: 'pothole', name: 'Pothole', description: 'A hole or broken pavement in a street.', category: 'Streets & traffic', departmentId: 'dpw', sla: { amount: 5, unit: 'days' }, priority: 'normal', needsLocation: true, allowAnonymous: true },
  { id: 'streetlight', name: 'Streetlight out', description: 'A streetlight that is out or flickering.', category: 'Streets & traffic', departmentId: 'dpw', sla: { amount: 7, unit: 'days' }, priority: 'normal', needsLocation: true, allowAnonymous: true },
  { id: 'dumping', name: 'Illegal dumping', description: 'Trash, tires or furniture dumped on a lot or street.', category: 'Trash & dumping', departmentId: 'dpw', sla: { amount: 3, unit: 'days' }, priority: 'normal', needsLocation: true, allowAnonymous: true },
  { id: 'missed-trash', name: 'Missed trash pickup', description: 'Your cart was out but wasn’t picked up.', category: 'Trash & dumping', departmentId: 'dpw', sla: { amount: 16, unit: 'hours' }, priority: 'normal', needsLocation: true },
  { id: 'water-main', name: 'Water main break or leak', description: 'Water running in the street or from the ground.', category: 'Water', departmentId: 'water', sla: { amount: 4, unit: 'hours' }, priority: 'high', needsLocation: true, allowAnonymous: true },
  { id: 'blight', name: 'Property in disrepair', description: 'A building or yard with code problems.', category: 'Buildings & housing', departmentId: 'buildings', sla: { amount: 10, unit: 'days' }, priority: 'normal', needsLocation: true, allowAnonymous: true },
  { id: 'rental-issue', name: 'Rental housing problem', description: 'No heat, unsafe conditions or a deposit dispute with a landlord.', category: 'Buildings & housing', departmentId: 'housing', sla: { amount: 24, unit: 'hours' }, priority: 'high', needsLocation: true, lawRefs: ['mcl-554.602', 'mcl-554.613'], fields: [{ key: 'unit', label: 'Unit number' }] },
  { id: 'permit-q', name: 'Permit or zoning question', description: 'Ask what a project needs before you build or open.', category: 'Permits & zoning', departmentId: 'buildings', sla: { amount: 16, unit: 'hours' }, priority: 'normal', needsLocation: false, lawRefs: ['mcl-125.3201'], fields: [{ key: 'project', label: 'What are you planning?', required: true }] },
  { id: 'biz-license', name: 'Business license help', description: 'Help with a new license, a renewal or a name change.', category: 'Business', departmentId: 'business', sla: { amount: 16, unit: 'hours' }, priority: 'normal', needsLocation: false, lawRefs: ['mcl-445.1'], fields: [{ key: 'license', label: 'License type or number' }] },
  { id: 'food-license', name: 'Food service license', description: 'Licensing for a restaurant, food truck or market.', category: 'Business', departmentId: 'business', sla: { amount: 24, unit: 'hours' }, priority: 'normal', needsLocation: false, lawRefs: ['mcl-289.4101'] },
  { id: 'records', name: 'Public records request', description: 'Ask for city records under Michigan FOIA.', category: 'City Clerk', departmentId: 'clerk', sla: { amount: 5, unit: 'days' }, priority: 'normal', needsLocation: false, fields: [{ key: 'records', label: 'Which records?', required: true }] },
  { id: 'park', name: 'Park maintenance', description: 'Broken equipment, mowing or lighting in a park.', category: 'Parks', departmentId: 'parks', sla: { amount: 7, unit: 'days' }, priority: 'low', needsLocation: true, allowAnonymous: true },
  { id: 'general', name: 'Question or feedback', description: 'Anything else, for any department.', category: 'General', departmentId: 'neighborhoods', sla: { amount: 24, unit: 'hours' }, priority: 'low', needsLocation: false },
];

export const SAMPLE_TEMPLATES: ReplyTemplate[] = [
  { id: 'ack', name: 'Received — on the list', body: 'Hi {{first_name}}, thanks for reporting this. Your request {{ref}} is with {{department}}, and we aim to respond by {{due_date}}. You can reply here with photos or details.' },
  { id: 'scheduled', name: 'Crew scheduled', body: 'Hi {{first_name}}, a crew is scheduled for {{address}}. We’ll update {{ref}} when the work is done.' },
  { id: 'need-info', name: 'Need more information', body: 'Hi {{first_name}}, to move {{ref}} forward we need a little more detail. Could you reply with a photo or the nearest cross street?' },
  { id: 'resolved', name: 'Resolved', body: 'Hi {{first_name}}, the work on {{ref}} at {{address}} is complete. If it isn’t fixed, reply here and we’ll reopen it.' },
  { id: 'permit', name: 'Permit guidance', body: 'Hi {{first_name}}, thanks for asking before you start. For your project you will likely need a building permit. The zoning rules are in the Michigan Zoning Enabling Act and the city’s zoning ordinance; we’ll confirm the specifics for your address under {{ref}}.', serviceTypeIds: ['permit-q'] },
];

export const SAMPLE_STAFF = [
  { id: 's-jordan', name: 'Jordan Hale', departmentId: 'dpw' },
  { id: 's-priya', name: 'Priya Natarajan', departmentId: 'buildings' },
  { id: 's-marcus', name: 'Marcus Bell', departmentId: 'water' },
  { id: 's-lena', name: 'Lena Okafor', departmentId: 'business' },
  { id: 's-sam', name: 'Sam Ortiz', departmentId: 'housing' },
  { id: 's-dee', name: 'Dee Carter', departmentId: 'clerk' },
];

const STREETS = ['Grand River Ave', 'Woodward Ave', 'Michigan Ave', 'Livernois Ave', 'Gratiot Ave', 'Vernor Hwy', 'Fenkell St', 'Mack Ave', 'Joy Rd', 'Warren Ave'];

export const SAMPLE_CONSTITUENTS: Constituent[] = [
  { id: 'p-ana', kind: 'person', name: 'Ana Ruiz', email: 'ana.ruiz@example.org', phone: '(313) 555-0142', language: 'es', preferredChannel: 'sms', address: { line1: '4410 Vernor Hwy', ward: '6' }, createdAt: 0 },
  { id: 'p-darnell', kind: 'person', name: 'Darnell Brooks', email: 'dbrooks@example.org', phone: '(313) 555-0177', preferredChannel: 'email', address: { line1: '18210 Fenkell St', ward: '1' }, createdAt: 0 },
  { id: 'p-mei', kind: 'person', name: 'Mei Chen', email: 'mei.chen@example.org', preferredChannel: 'web', address: { line1: '2650 Woodward Ave', ward: '5' }, createdAt: 0 },
  { id: 'p-yusuf', kind: 'person', name: 'Yusuf Haddad', phone: '(313) 555-0199', language: 'ar', preferredChannel: 'phone', address: { line1: '7731 Warren Ave', ward: '7' }, createdAt: 0 },
  { id: 'p-grace', kind: 'person', name: 'Grace Whitfield', email: 'gwhitfield@example.org', preferredChannel: 'email', address: { line1: '15020 Mack Ave', ward: '4' }, tags: ['block club'], createdAt: 0 },
  { id: 'b-bakery', kind: 'business', name: 'Southwest Corner Bakery LLC', email: 'hello@swcornerbakery.example', phone: '(313) 555-0110', address: { line1: '4402 Vernor Hwy', ward: '6' }, licenseIds: ['BL-104233'], contacts: ['p-ana'], createdAt: 0 },
  { id: 'b-auto', kind: 'business', name: 'Livernois Auto Care', email: 'service@livernoisauto.example', address: { line1: '13325 Livernois Ave', ward: '2' }, licenseIds: ['BL-098812'], createdAt: 0 },
  { id: 'o-blockclub', kind: 'organization', name: 'East Mack Block Club', email: 'eastmackbc@example.org', address: { line1: '15000 Mack Ave', ward: '4' }, contacts: ['p-grace'], createdAt: 0 },
  { id: 'o-church', kind: 'organization', name: 'Greater Grace Community Church', email: 'office@greatergrace.example', address: { line1: '23500 Grand River Ave', ward: '1' }, createdAt: 0 },
];

/** Deterministic pseudo-random so the sample looks the same on every load. */
function rng(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

const DESCRIPTIONS: Record<string, string[]> = {
  pothole: ['Large pothole in the right lane, cars swerving around it.', 'Pothole by the bus stop is filling with water.', 'Broken pavement near the crosswalk.'],
  streetlight: ['Streetlight out for a week, the block is very dark.', 'Light flickers on and off all night.'],
  dumping: ['Tires and a mattress dumped on the vacant lot.', 'Someone left construction debris in the alley.'],
  'missed-trash': ['Cart was out by 7am, truck skipped our side of the street.'],
  'water-main': ['Water bubbling up through the sidewalk, getting worse.', 'Water running down the street from the curb, possible main break, some flooding.'],
  blight: ['Vacant house with broken windows and open back door.', 'Overgrown yard and trash piled on porch.'],
  'rental-issue': ['No heat in our unit for three days, landlord not answering.', 'Landlord kept the whole security deposit with no list of damages.'],
  'permit-q': ['We want to add a covered patio for outdoor seating.', 'Planning to convert the garage into a studio apartment.'],
  'biz-license': ['Renewing our license, the online form keeps failing.', 'Need to change the name on our license after a merger.'],
  'food-license': ['Opening a food truck, what licenses do we need?'],
  records: ['Requesting inspection reports for 4402 Vernor Hwy from 2024.'],
  park: ['Swing set chain broken at the playground.'],
  general: ['How do I request a block party permit?', 'Thank you to the crew that fixed our street last week!'],
};

export interface DeskData {
  departments: Department[];
  services: ServiceType[];
  templates: ReplyTemplate[];
  staff: { id: string; name: string; departmentId: string }[];
  constituents: Constituent[];
  cases: Case[];
  seq: number;
}

/** Build a believable working set of cases relative to `now`. */
export function buildSample(now: number): DeskData {
  const r = rng(11);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const cases: Case[] = [];
  let seq = 1200;
  const people = SAMPLE_CONSTITUENTS;
  for (let i = 0; i < 46; i++) {
    const svc = pick(SAMPLE_SERVICES);
    const ageDays = Math.pow(r(), 1.6) * 28;
    const created = now - ageDays * DAY_MS - r() * 6 * HOUR_MS;
    const who = r() < 0.15 && svc.allowAnonymous ? undefined : pick(people);
    const onBehalf = who && who.kind === 'person' && r() < 0.25 ? people.find((p) => p.contacts?.includes(who.id)) : undefined;
    const loc = svc.needsLocation
      ? { line1: `${100 + Math.floor(r() * 199) * 100 + Math.floor(r() * 90)} ${pick(STREETS)}`, ward: String(1 + Math.floor(r() * 7)), lat: 42.33 + r() * 0.12, lng: -83.2 + r() * 0.2 }
      : undefined;
    const answers: Record<string, string> = {};
    for (const f of svc.fields ?? []) answers[f.key] = f.key === 'records' ? 'Inspection reports, 2024' : f.key === 'project' ? 'Outdoor patio' : f.key === 'unit' ? '2B' : 'General business license';
    let c = openCase({
      serviceType: svc, description: pick(DESCRIPTIONS[svc.id] ?? ['Please look into this.']), channel: pick(['web', 'web', 'app', 'phone', 'email', 'walk_in'] as const),
      constituentId: who?.id, onBehalfOf: onBehalf?.id, location: loc, answers, by: who?.id ?? 'anonymous', now: created, seq: ++seq,
    }, `case-${seq}`).case;
    const staff = SAMPLE_STAFF.find((s) => s.departmentId === c.departmentId);
    const roll = r();
    const t1 = created + (1 + r() * 10) * HOUR_MS;
    if (t1 < now && roll > 0.08) {
      if (staff) c = assign(c, staff.id, 'system', t1 - HOUR_MS);
      c = reply(c, 'Thanks — this is on our list and assigned to a crew.', staff?.id ?? 's-jordan', t1);
      const t2 = t1 + (r() * 1.5 + 0.2) * DAY_MS;
      if (t2 < now && roll > 0.2) {
        c = setStatus(c, 'in_progress', staff?.id ?? 's', t2);
        if (r() < 0.3) c = addNote(c, 'Crew needs a second visit; parts on order.', staff?.id ?? 's', t2 + HOUR_MS);
        const t3 = t2 + (r() * 2.2 + 0.2) * DAY_MS;
        if (t3 < now && roll > 0.3) {
          c = reply(c, 'The work is complete. Reply here if anything still needs attention.', staff?.id ?? 's', t3);
          c = setStatus(c, 'resolved', staff?.id ?? 's', t3);
          if (now - t3 > 3 * DAY_MS) c = setStatus(c, 'closed', 'system', t3 + 3 * DAY_MS, 'Closed after 3 days with no reply');
        }
      } else if (t2 < now && roll > 0.14) {
        c = setStatus(c, 'waiting_on_resident', staff?.id ?? 's', t2, 'Asked for a photo');
      }
    }
    cases.push(c);
  }
  return { departments: SAMPLE_DEPARTMENTS, services: SAMPLE_SERVICES, templates: SAMPLE_TEMPLATES, staff: SAMPLE_STAFF, constituents: SAMPLE_CONSTITUENTS, cases, seq };
}
