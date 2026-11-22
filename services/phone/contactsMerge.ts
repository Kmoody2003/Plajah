// services/phone/contactsMerge.ts — one people list for the PhoneHub and Chat:
// phone-book contacts (on the device) joined with the Plajah people the user already knows
// (friends, DM partners, org members already loaded client-side). Matching is local only —
// nothing here uploads the phone book or looks numbers up on a server.
import { phoneKey, samePhone } from './phoneNumber';

export interface DeviceContact {
  id: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  organization?: string;
  starred?: boolean;
  photoUrl?: string;
  phones: { number: string; label?: string }[];
  emails: { address: string; label?: string }[];
}

export interface PlajahPerson {
  uid: string;
  displayName?: string;
  username?: string;
  photoURL?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
}

export interface MergedPerson {
  key: string;                  // stable id: d:<contactId> | p:<uid>
  name: string;
  photoUrl?: string;
  starred: boolean;
  device?: DeviceContact;       // present → can carrier-call / text
  plajah?: PlajahPerson;        // present → can Plajah call / DM
  phones: string[];
  emails: string[];
}

const normEmail = (e?: string) => (e || '').trim().toLowerCase();

function personPhones(p: PlajahPerson): string[] {
  return [p.phone, p.phoneNumber].filter((x): x is string => !!x && !!x.trim());
}

/** Find the Plajah person for a device contact: email first (strongest), then phone. */
export function matchPlajah(contact: DeviceContact, people: PlajahPerson[]): PlajahPerson | undefined {
  const emails = new Set(contact.emails.map(e => normEmail(e.address)).filter(Boolean));
  const byEmail = people.find(p => p.email && emails.has(normEmail(p.email)));
  if (byEmail) return byEmail;
  return people.find(p => personPhones(p).some(pp => contact.phones.some(cp => samePhone(cp.number, pp))));
}

export function mergeContacts(contacts: DeviceContact[], people: PlajahPerson[]): MergedPerson[] {
  const usedUids = new Set<string>();
  const out: MergedPerson[] = [];
  for (const c of contacts) {
    const match = matchPlajah(c, people.filter(p => !usedUids.has(p.uid)));
    if (match) usedUids.add(match.uid);
    const phones = dedupePhones(c.phones.map(p => p.number).concat(match ? personPhones(match) : []));
    const emails = Array.from(new Set(c.emails.map(e => normEmail(e.address)).concat(match?.email ? [normEmail(match.email)] : []).filter(Boolean)));
    out.push({
      key: `d:${c.id}`,
      name: c.displayName || [c.givenName, c.familyName].filter(Boolean).join(' ') || match?.displayName || phones[0] || 'Unknown',
      photoUrl: c.photoUrl || match?.photoURL,
      starred: !!c.starred,
      device: c,
      plajah: match,
      phones,
      emails,
    });
  }
  for (const p of people) {
    if (usedUids.has(p.uid)) continue;
    out.push({
      key: `p:${p.uid}`,
      name: p.displayName || (p.username ? `@${p.username}` : 'Plajah member'),
      photoUrl: p.photoURL,
      starred: false,
      plajah: p,
      phones: dedupePhones(personPhones(p)),
      emails: p.email ? [normEmail(p.email)] : [],
    });
  }
  return out.sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function dedupePhones(numbers: string[]): string[] {
  const seen: string[] = [];
  for (const n of numbers) {
    if (!n || !n.trim()) continue;
    if (!seen.some(s => samePhone(s, n) || phoneKey(s) === phoneKey(n))) seen.push(n.trim());
  }
  return seen;
}

/** Name for a number in call log / SMS thread rows: the contact's name, else null. */
export function nameForNumber(number: string, merged: MergedPerson[]): MergedPerson | undefined {
  if (!number) return undefined;
  return merged.find(m => m.phones.some(p => samePhone(p, number)));
}

/** A–Z section letter for the contacts list ('#' for digits/symbols, '★' for favourites). */
export function sectionLetter(m: MergedPerson): string {
  if (m.starred) return '★';
  const ch = (m.name || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}
