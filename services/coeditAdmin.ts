// services/coeditAdmin.ts — server-side actions on shared documents: the paper trail, revoking, custody and deleting.
// Runs with admin credentials, so callers (routes/coeditSecurity.ts, routes/elevateAccess.ts) authorize first.

import { randomUUID } from 'crypto';
import { fsDelete, fsGet, fsList, fsPatch, fsQuery, fsSet, getAccessToken } from './firebaseAdminRest';
import { presignUrl } from './objectStore/sigv4';
import { afterCustodyTransfer, custodyHeir, nextExpiryOf, type DocOrg } from './telaDocPolicy';

const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const GCS = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
const SUBCOLLECTIONS = ['ops', 'snap', 'chunks', 'versions', 'presence', 'drafts', 'assets', 'rigs', 'requests'];

export async function nameOf(uid: string): Promise<string> {
  const u = await fsGet(`users/${uid}`);
  return String(u?.displayName || u?.name || u?.username || 'Member').slice(0, 200);
}

export async function writeAudit(pid: string, p: { ownerId: string; orgId?: string }, action: string, by: string, byName: string, detail = ''): Promise<void> {
  await fsSet(`docAudit/${pid}/events/${randomUUID()}`, {
    pid, action, by, byName, at: new Date(), detail: detail.slice(0, 300), ownerId: p.ownerId, ...(p.orgId ? { orgId: p.orgId } : {}),
  });
}

async function withoutFromChat(chatRoomId: string | undefined, uids: string[]) {
  if (!chatRoomId || !uids.length) return;
  const room = await fsGet(`chat_rooms/${chatRoomId}`);
  if (room) await fsPatch(`chat_rooms/${chatRoomId}`, { participants: (room.participants || []).filter((u: string) => !uids.includes(u)), updatedAt: Date.now() });
}

export async function addToChat(chatRoomId: string | undefined, uids: string[]) {
  if (!chatRoomId || !uids.length) return;
  const room = await fsGet(`chat_rooms/${chatRoomId}`);
  if (room) await fsPatch(`chat_rooms/${chatRoomId}`, { participants: [...new Set([...(room.participants || []), ...uids])], updatedAt: Date.now() });
}

/** Takes people off a project, its team chat and its expiry list. Each gets the notice that makes their app remove its copy. */
export async function revokeFromProject(pid: string, p: Record<string, any>, uids: string[], notice: { by: string; byName: string; reason: string } | null) {
  const leaving = uids.filter(u => u !== p.ownerId && (p.memberIds || []).includes(u));
  if (!leaving.length) return leaving;
  const without = (m: Record<string, any> = {}) => Object.fromEntries(Object.entries(m).filter(([u]) => !leaving.includes(u)));
  const now = Date.now();
  if (notice) await Promise.all(leaving.map(u => fsSet(`coedit/${pid}/revocations/${u}`, { at: now, ...notice })));
  const expires = without(p.expires) as Record<string, number>;
  await fsPatch(`coedit/${pid}`, {
    memberIds: (p.memberIds || []).filter((u: string) => !leaving.includes(u)),
    members: without(p.members), names: without(p.names), photos: without(p.photos),
    expires, nextExpiry: nextExpiryOf(expires), updatedAt: now,
  });
  await withoutFromChat(p.chatRoomId, leaving);
  return leaving;
}

async function copyObject(from: string, to: string, token: string): Promise<boolean> {
  const res = await fetch(`${GCS}/${encodeURIComponent(from)}/rewriteTo/b/${BUCKET}/o/${encodeURIComponent(to)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}

async function deleteObject(path: string, token: string) {
  await fetch(`${GCS}/${encodeURIComponent(path)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

async function listPrefix(prefix: string, token: string): Promise<string[]> {
  const names: string[] = [];
  let page = '';
  do {
    const res = await fetch(`${GCS}?prefix=${encodeURIComponent(prefix)}&fields=items(name),nextPageToken&maxResults=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const json = await res.json() as any;
    for (const i of json.items || []) names.push(i.name);
    page = json.nextPageToken || '';
  } while (page);
  return names;
}

/** Moves the author's cloud copy and its history to the heir, so the leaver's storage holds nothing of the org's. */
async function moveCloudCopy(pid: string, from: string, to: string): Promise<boolean> {
  const head = await fsGet(`creativeProjects/${pid}`);
  if (!head || head.ownerId !== from) return true;
  const token = await getAccessToken();
  if (!token) return false;
  const moved = (path: string) => path.replace(`personal/${from}/`, `personal/${to}/`);
  const versions = await fsList(`creativeProjects/${pid}/versions`, { maxDocs: 5000 });
  const paths = [head.headPath, ...versions.map(v => v.data.path)].filter((x): x is string => typeof x === 'string' && x.startsWith(`personal/${from}/`));
  const copied = await Promise.all([...new Set(paths)].map(path => copyObject(path, moved(path), token)));
  if (copied.includes(false)) return false;
  await Promise.all(versions.filter(v => typeof v.data.path === 'string').map(v => fsPatch(`creativeProjects/${pid}/versions/${v.id}`, { path: moved(v.data.path) })));
  await fsPatch(`creativeProjects/${pid}`, { ownerId: to, ...(head.headPath ? { headPath: moved(head.headPath) } : {}) });
  const manifest = await fsGet(`tela_docs/${head.localId}`);
  if (manifest?.ownerId === from) await fsPatch(`tela_docs/${head.localId}`, { ownerId: to });
  await Promise.all([...new Set(paths)].map(path => deleteObject(path, token)));
  return true;
}

/** Someone whose seat ended loses the org's documents, including ones they wrote. The org keeps those: custody moves
 *  to the org's owner or an IT Admin. Outside collaborators, who never held a seat, are left alone. */
export async function settleDepartures(orgId: string, org: DocOrg, members: Record<string, any>[]) {
  const active = new Set(members.filter(m => m.status === 'ACTIVE').map(m => String(m.userId)));
  const departed = new Set(members.filter(m => m.status !== 'ACTIVE' && !active.has(String(m.userId))).map(m => String(m.userId)));
  if (!departed.size) return;
  const notice = { by: 'system', byName: 'Your organization', reason: 'Your seat in the organization ended.' };
  for (const { id, data: p } of await fsQuery('coedit', [{ field: 'orgId', value: orgId }], 5000)) {
    let current = p;
    if (departed.has(p.ownerId)) {
      const heir = custodyHeir(org, active, p.ownerId);
      if (!heir) { console.warn('[coedit] no one to take custody of', id); continue; }
      const from = p.ownerId;
      const heirName = await nameOf(heir);
      // The cloud copy moves first: if that fails, the next sync tries again instead of leaving the org without it.
      if (!(await moveCloudCopy(id, from, heir))) { console.warn('[coedit] could not move the cloud copy of', id); continue; }
      const next = afterCustodyTransfer(p as any, heir, [from], heirName);
      await fsSet(`coedit/${id}/revocations/${from}`, { at: Date.now(), ...notice });
      await fsPatch(`coedit/${id}`, { ownerId: heir, custodyFromUid: from, members: next.members, memberIds: next.memberIds, names: next.names, photos: next.photos, expires: next.expires, updatedAt: Date.now() });
      await withoutFromChat(p.chatRoomId, [from]);
      await addToChat(p.chatRoomId, [heir]);
      await writeAudit(id, { ownerId: heir, orgId }, 'custody_transferred', 'system', 'Plajah', `${p.names?.[from] || 'The author'} left the organization; ${heirName} now holds this document`);
      current = next;
    }
    const leaving = await revokeFromProject(id, current, (current.memberIds || []).filter((u: string) => departed.has(u)), notice);
    if (leaving.length) await writeAudit(id, { ownerId: current.ownerId, orgId }, 'access_revoked', 'system', 'Plajah', `${leaving.map(u => p.names?.[u] || 'Collaborator').join(', ')}: seat in the organization ended`);
  }
}

async function deleteCollection(path: string) {
  // Ids only: chunks run to 700 KB each.
  const rows = await fsList(path, { maxDocs: 50_000, idsOnly: true });
  for (let i = 0; i < rows.length; i += 25) await Promise.all(rows.slice(i, i + 25).map(r => fsDelete(`${path}/${r.id}`)));
  return rows.length;
}

async function deleteB2Assets(ledger: Array<{ data: Record<string, any> }>) {
  const endpoint = process.env.OBJECT_STORE_ENDPOINT?.trim(), bucket = process.env.OBJECT_STORE_BUCKET?.trim(), keyId = process.env.OBJECT_STORE_KEY_ID?.trim(), appKey = process.env.OBJECT_STORE_APP_KEY?.trim();
  if (!endpoint || !bucket || !keyId || !appKey) return;
  const url = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  const region = process.env.OBJECT_STORE_REGION?.trim() || /^s3\.([\w-]+)\./.exec(new URL(url).host)?.[1] || 'us-east-1';
  const keys = ledger.flatMap(a => Object.values(a.data.tiers || {}).map((t: any) => t?.path)).filter((k): k is string => typeof k === 'string' && k.startsWith('collab/'));
  await Promise.all(keys.map(key => fetch(presignUrl({ method: 'DELETE', endpoint: url, region, bucket, key, accessKeyId: keyId, secretAccessKey: appKey, expiresSec: 300 }), { method: 'DELETE' }).catch(() => {})));
}

/** Removes a document from the shared side completely: live log, snapshots, versions, drafts, media and team chat.
 *  The paper trail stays, and revocation notices stay so everyone else's app removes its copy. */
export async function cascadeDeleteDoc(pid: string, project: Record<string, any> | null, soloUid: string) {
  const token = await getAccessToken();
  const summary = { docs: 0, objects: 0 };
  if (project) {
    const others = (project.memberIds || []).filter((u: string) => u !== project.ownerId);
    const byName = await nameOf(soloUid);
    await Promise.all(others.map((u: string) => fsSet(`coedit/${pid}/revocations/${u}`, { at: Date.now(), by: soloUid, byName, reason: 'The document was deleted.' })));
    await deleteB2Assets(await fsList(`coedit/${pid}/assets`, { maxDocs: 5000 })).catch(() => {});
    for (const sub of SUBCOLLECTIONS) summary.docs += await deleteCollection(`coedit/${pid}/${sub}`);
    if (project.chatRoomId) {
      summary.docs += await deleteCollection(`chat_rooms/${project.chatRoomId}/messages`);
      await fsDelete(`chat_rooms/${project.chatRoomId}`);
    }
    await fsDelete(`coedit/${pid}`);
  }
  await fsDelete(`telaMediaRelease/${pid}`);
  if (token) {
    // With no project, only the caller's own uploads can be theirs to remove.
    const prefixes = project ? [`tela-media/${pid}/`, `coedit-assets/${pid}/`] : [`tela-media/${pid}/user/${soloUid}/`];
    for (const prefix of prefixes) {
      const names = await listPrefix(prefix, token);
      for (let i = 0; i < names.length; i += 25) await Promise.all(names.slice(i, i + 25).map(n => deleteObject(n, token)));
      summary.objects += names.length;
    }
  }
  return summary;
}
