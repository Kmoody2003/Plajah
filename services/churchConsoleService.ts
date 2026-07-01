// churchConsoleService — Part 3, Phase 4: reach & learn.
//   • broadcast: push a message to every church member (in-app + push notification),
//   • people:    Servant-Keeper-style CSV import/export of congregants,
//   • classes:   spin up a church class on the EdTech stack.

import { db, auth } from './firebase';
import { doc, collection, setDoc, getDocs, query, where } from 'firebase/firestore';
import { createNotification, createClassroom } from './backendService';
import { fetchOrgMembers } from './organizationService';
import type { Organization } from '../types';

// ── Broadcast ────────────────────────────────────────────────────────────────
/** Send an announcement to every active member of the church (in-app + push). */
export async function broadcastToChurch(church: Organization, msg: { title: string; message: string }): Promise<number> {
  const members = await fetchOrgMembers(church.id);
  const me = auth.currentUser;
  const recipients = members.filter(m => m.status === 'ACTIVE' && m.userId && m.userId !== me?.uid);
  await Promise.all(recipients.map(m => createNotification({
    userId: m.userId,
    senderId: me?.uid || church.id,
    senderName: church.name,
    senderPhoto: church.logoUrl || '',
    type: 'SYSTEM',
    title: msg.title || church.name,
    message: msg.message,
    link: 'CHAT',
    targetId: church.id,
  } as any).catch(() => {})));
  return recipients.length;
}

/** Email a message to a list of addresses (Resend). Returns how many were sent. */
export async function emailBroadcast(subject: string, body: string, emails: string[]): Promise<{ sent: number; configured: boolean }> {
  const to = Array.from(new Set(emails.filter(e => e && e.includes('@'))));
  if (!to.length) return { sent: 0, configured: true };
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/email/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject, text: body, recipients: to }),
    });
    if (!res.ok) return { sent: 0, configured: false };
    return await res.json();
  } catch { return { sent: 0, configured: false }; }
}

// ── People (Servant Keeper CSV import/export) ────────────────────────────────
export interface Congregant {
  id: string;
  churchId: string;
  name: string;
  email?: string;
  phone?: string;
  household?: string;
  importedFrom?: string;
  createdAt: number;
}

function parseCSV(text: string): string[][] {
  return text.trim().split(/\r?\n/).map(line => {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  });
}

/** Import congregants from a Servant Keeper (or generic) CSV: name/email/phone columns. */
export async function importCongregantsCSV(churchId: string, csv: string): Promise<number> {
  const rows = parseCSV(csv);
  if (rows.length < 2) return 0;
  const header = rows[0].map(h => h.toLowerCase());
  const col = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)));
  const iName = col('full name', 'name'), iFirst = col('first'), iLast = col('last');
  const iEmail = col('email'), iPhone = col('phone', 'mobile'), iHouse = col('household', 'family');
  let n = 0;
  for (const r of rows.slice(1)) {
    const name = (iName >= 0 ? r[iName] : [r[iFirst] || '', r[iLast] || ''].join(' ')).trim();
    if (!name) continue;
    const id = `cong_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(db, 'congregants', id), {
      id, churchId, name,
      email: iEmail >= 0 ? r[iEmail] : '',
      phone: iPhone >= 0 ? r[iPhone] : '',
      household: iHouse >= 0 ? r[iHouse] : '',
      importedFrom: 'servant_keeper',
      createdAt: Date.now(),
    }).catch(() => {});
    n++;
  }
  return n;
}

export async function fetchCongregants(churchId: string): Promise<Congregant[]> {
  try {
    const snap = await getDocs(query(collection(db, 'congregants'), where('churchId', '==', churchId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Congregant)).sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Export the church's congregants to a Servant-Keeper-compatible CSV string. */
export function exportCongregantsCSV(people: Congregant[]): string {
  const header = ['Full Name', 'Email', 'Phone', 'Household'];
  const rows = people.map(p => [p.name, p.email || '', p.phone || '', p.household || '']);
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}

/** Export the church's recorded giving to CSV. */
export async function exportGivingCSV(churchId: string): Promise<string> {
  let donations: any[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'donations'), where('churchId', '==', churchId)));
    donations = snap.docs.map(d => d.data());
  } catch { /* */ }
  const header = ['Date', 'Fund', 'Amount', 'Recurring'];
  const rows = donations.map(d => [new Date(d.timestamp || 0).toISOString().slice(0, 10), d.fund || 'General', d.amount || 0, d.recurring ? 'Monthly' : 'One-time']);
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}

// ── Classes (EdTech) ─────────────────────────────────────────────────────────
/** Create a church class (Sunday school / Bible study) on the classroom stack. */
export async function createChurchClass(church: Organization, cls: { title: string; description: string }): Promise<any> {
  return createClassroom({
    title: cls.title,
    description: cls.description,
    category: 'Faith',
    track: 'CREATOR',
    price: 0,
    tags: ['church', `church:${church.id}`],
  } as any);
}
