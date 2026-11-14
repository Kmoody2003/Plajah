// What an owner or IT Admin is told about Content HQ security. Pure, so tests hold it.
//
// Security runs in the background and speaks only when someone can act on what it says. One wrong tap on an
// old link isn't an alert. Someone trying again and again, a file that was blocked, a link anyone can download
// from, and a file handed to another organization are.

export interface HqAuditEntry {
  id: string;
  kind: string;
  assetId?: string;
  name?: string;
  actorUid?: string;
  reason?: string;
  targetName?: string;
  createdAt: number;
}

export interface HqLinkRow {
  id: string;
  assetId: string;
  allowDownload?: boolean;
  revokedAt?: number | null;
  expiresAt?: number | null;
  createdByUid?: string;
  createdAt?: number;
}

export interface HqSecurityAlert {
  id: string;
  title: string;
  detail: string;
  at: number;
  assetId?: string;
  /** What the button does: look at the file. Everything an alert asks for is done from there. */
  action?: 'open_file';
}

const DAY = 86400000;
export const DENIED_TRIES_TO_ALERT = 3;
export const DENIED_FILES_TO_ALERT = 2;
const DENIED_WINDOW = 7 * DAY;
const KEEP_WINDOW = 30 * DAY;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summarizeHqAlerts(input: {
  entries: HqAuditEntry[];
  links?: HqLinkRow[];
  assetNames?: Record<string, string>;
  personNames?: Record<string, string>;
  /** The person reading. Their own attempts are never reported to them. */
  viewerUid?: string;
  dismissed?: string[];
  now: number;
}): HqSecurityAlert[] {
  const { entries, links = [], assetNames = {}, personNames = {}, viewerUid, dismissed = [], now } = input;
  const person = (uid?: string) => (uid && personNames[uid]) || 'Someone';
  const fileName = (e: { assetId?: string; name?: string }) => e.name || (e.assetId && assetNames[e.assetId]) || 'A file';
  const out: HqSecurityAlert[] = [];

  const deniedBy = new Map<string, HqAuditEntry[]>();
  for (const e of entries) {
    if (e.kind !== 'ACCESS_DENIED' || !e.actorUid || e.actorUid === viewerUid || now - e.createdAt > DENIED_WINDOW) continue;
    deniedBy.set(e.actorUid, [...(deniedBy.get(e.actorUid) || []), e]);
  }
  for (const [actor, tries] of deniedBy) {
    const files = new Set(tries.map(t => t.assetId));
    if (tries.length < DENIED_TRIES_TO_ALERT && files.size < DENIED_FILES_TO_ALERT) continue;
    const at = Math.max(...tries.map(t => t.createdAt));
    out.push({
      // A new id each week, so a dismissed alert comes back only if it keeps happening.
      id: `denied:${actor}:${Math.floor(at / DENIED_WINDOW)}`,
      title: `${person(actor)} keeps trying to open files they can't use`,
      detail: `${count(tries.length, 'try', 'tries')} on ${count(files.size, 'file')} this week. Each was blocked and nothing was opened. If you didn't expect this, check their role.`,
      at,
    });
  }

  for (const e of entries) {
    if (now - e.createdAt > KEEP_WINDOW) continue;
    if (e.kind === 'FILE_BLOCKED') {
      out.push({
        id: `blocked:${e.id}`,
        title: `${fileName(e)} was blocked`,
        detail: `${e.reason || 'A security check flagged it.'} Nobody can open it. Uploaded by ${person(e.actorUid)}. Delete it if you don't recognize it.`,
        at: e.createdAt,
        assetId: e.assetId,
        action: 'open_file',
      });
    } else if (e.kind === 'ORG_SHARED') {
      out.push({
        id: `orgshare:${e.id}`,
        title: `${fileName(e)} was shared with ${e.targetName || 'another organization'}`,
        detail: `${person(e.actorUid)} gave them read-only access. You can take it back from the file's Access tab.`,
        at: e.createdAt,
        assetId: e.assetId,
        action: 'open_file',
      });
    }
  }

  for (const l of links) {
    if (l.revokedAt || !l.allowDownload || (l.expiresAt && l.expiresAt < now)) continue;
    const left = l.expiresAt ? Math.ceil((l.expiresAt - now) / DAY) : 0;
    out.push({
      id: `link:${l.id}`,
      title: `Anyone with a link can download ${assetNames[l.assetId] || 'a file'}`,
      detail: `${person(l.createdByUid)} made this link. ${l.expiresAt ? `It ends in ${count(left, 'day')}.` : 'It has no end date.'} Turn it off if it's no longer needed.`,
      at: Number(l.createdAt || 0),
      assetId: l.assetId,
      action: 'open_file',
    });
  }

  return out.filter(a => !dismissed.includes(a.id)).sort((a, b) => b.at - a.at);
}

/** How many alerts are new since this person last looked. Zero means no badge. */
export function countNewHqAlerts(alerts: HqSecurityAlert[], seenAt: number | undefined): number {
  return alerts.filter(a => a.at > (seenAt || 0)).length;
}
