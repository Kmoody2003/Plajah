// Drive lab: the real PlajahDrive view on an in-memory fake DriveApi (no Firebase, no B2).
//   npx vite --config drive-lab.vite.config.mjs -> http://127.0.0.1:3236/drive-lab.html
// ?state=closed shows the "not open yet" screen; ?full=1 starts nearly full; ?empty=1 starts empty.
// Uploads are simulated at ~40 MB/s so the tray shows real progress; window.__drive exposes the store.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PlajahDrive from '../../components/drive/PlajahDrive';
import { DriveApiError, type DriveApi, type DriveItem } from '../../services/drive/client';

const params = new URLSearchParams(location.search);
const GB = 1024 ** 3, MB = 1024 ** 2, DAY = 86_400_000;
let n = 0;
const id = () => `lab_${String(++n).padStart(8, '0')}`;

type Rec = DriveItem & { owner: string };
const store: Rec[] = [];
const usage: Record<string, { allowance: number; live: number; trash: number }> = {
  me: { allowance: 100 * GB, live: 0, trash: 0 },
  org_grace01: { allowance: 1024 * GB, live: 0, trash: 0 },
};
(window as any).__drive = { store, usage };

function add(owner: string, kind: 'file' | 'folder', name: string, parentId: string | null, size = 0, mime: string | null = null, ago = 0): Rec {
  const t = Date.now() - ago;
  const r: Rec = { owner, id: id(), kind, name, parentId, departmentId: null, size, mime, createdAt: t, updatedAt: t, trashedAt: null, purgeAt: null, uploadedBy: 'me', scan: kind === 'file' ? 'clean' : null };
  store.push(r);
  if (kind === 'file') usage[owner].live += size;
  return r;
}

if (!params.get('empty')) {
  const proj = add('me', 'folder', 'Album — Northern Lights', null, 0, null, 3 * DAY);
  add('me', 'file', 'Track 01 – Aurora (master).wav', proj.id, 182 * MB, 'audio/wav', 3 * DAY);
  add('me', 'file', 'Track 02 – Polar Night (master).wav', proj.id, 164 * MB, 'audio/wav', 3 * DAY);
  add('me', 'file', 'Cover art final.png', proj.id, 24 * MB, 'image/png', 2 * DAY);
  const stems = add('me', 'folder', 'Stems', proj.id, 0, null, 3 * DAY);
  add('me', 'file', 'Aurora stems.zip', stems.id, 2.4 * GB, 'application/zip', 3 * DAY);
  add('me', 'folder', 'Music video rushes', null, 0, null, 9 * DAY);
  add('me', 'file', 'Tour budget 2027.xlsx', null, 380 * 1024, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1 * DAY);
  add('me', 'file', 'Press kit.pdf', null, 8.2 * MB, 'application/pdf', 40 * DAY);
  add('me', 'file', 'Live at The Basement.mp4', null, 6.8 * GB, 'video/mp4', 5 * 3600_000);
  const old = add('me', 'file', 'Old demo.mp3', null, 9 * MB, 'audio/mpeg', 60 * DAY);
  old.trashedAt = Date.now() - 4 * DAY; old.purgeAt = old.trashedAt + 30 * DAY; usage.me.live -= old.size; usage.me.trash += old.size;
  const sun = add('org_grace01', 'folder', 'Sunday services', null, 0, null, 2 * DAY);
  add('org_grace01', 'file', 'Nov 8 full service.mp4', sun.id, 4.1 * GB, 'video/mp4', 1 * DAY);
  add('org_grace01', 'folder', 'Worship — set lists', null, 0, null, 6 * DAY);
  add('org_grace01', 'file', 'Volunteer handbook.pdf', null, 2.2 * MB, 'application/pdf', 20 * DAY);
}
if (params.get('full')) usage.me.live = usage.me.allowance * 0.94;

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const own = (org?: string) => org ?? 'me';
function find(org: string | undefined, rid: string) {
  const r = store.find(x => x.id === rid && x.owner === own(org));
  if (!r) throw new DriveApiError('Item not found.', 404);
  return r;
}
const under = (rootId: string) => {
  const ids = new Set([rootId]);
  for (let grew = true; grew;) { grew = false; for (const r of store) if (r.kind === 'folder' && r.parentId && ids.has(r.parentId) && !ids.has(r.id)) { ids.add(r.id); grew = true; } }
  return store.filter(r => ids.has(r.id) || (r.parentId && ids.has(r.parentId)));
};

const api: DriveApi = {
  async usage(org) {
    await wait(60);
    if (params.get('state') === 'closed') throw new DriveApiError('Drive isn’t open yet.', 503, 'drive_off');
    const u = usage[own(org)], used = u.live + u.trash;
    const state = used > u.allowance ? 'grace' : used >= u.allowance * 0.9 ? 'warn' : 'ok';
    return { allowance: u.allowance, liveBytes: u.live, trashBytes: u.trash, reservedBytes: 0, state: { state } };
  },
  async list(org, parent, trash) {
    await wait(120);
    if (params.get('state') === 'closed') throw new DriveApiError('Drive isn’t open yet.', 503, 'drive_off');
    const mine = store.filter(r => r.owner === own(org));
    const items = mine.filter(r => (trash ? !!r.trashedAt : !r.trashedAt && r.parentId === parent))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === 'folder' ? -1 : 1));
    const path: Array<{ id: string; name: string }> = [];
    for (let p = parent; p;) { const f = mine.find(r => r.id === p); if (!f) break; path.unshift({ id: f.id, name: f.name }); p = f.parentId; }
    return { items: items.map(({ owner, ...r }) => r), path };
  },
  async createFolder(org, name, parentId) { await wait(80); return add(own(org), 'folder', name, parentId); },
  async update(org, rid, patch) {
    await wait(80);
    const r = find(org, rid);
    if (patch.name !== undefined) r.name = patch.name;
    if (patch.parentId !== undefined) r.parentId = patch.parentId;
    r.updatedAt = Date.now();
    return r;
  },
  async trash(org, rid) {
    await wait(80);
    const r = find(org, rid), t = Date.now();
    const all = r.kind === 'folder' ? under(rid) : [r];
    let bytes = 0;
    for (const x of all) if (!x.trashedAt) { x.trashedAt = t; x.purgeAt = t + 30 * DAY; bytes += x.size; }
    for (const x of all) if (x.id !== rid) (x as any).hidden = true;
    usage[own(org)].live -= bytes; usage[own(org)].trash += bytes;
    // only the item itself appears in the trash list
    for (const x of all) if (x.id !== rid) { (x as any).trashedWith = rid; }
    return { count: all.length, bytes };
  },
  async restore(org, rid) {
    await wait(80);
    const r = find(org, rid);
    const all = store.filter(x => x.id === rid || (x as any).trashedWith === rid);
    let bytes = 0;
    for (const x of all) { x.trashedAt = null; x.purgeAt = null; delete (x as any).trashedWith; bytes += x.size; }
    usage[own(org)].live += bytes; usage[own(org)].trash -= bytes;
    if (r.parentId && !store.some(x => x.id === r.parentId && !x.trashedAt)) r.parentId = null;
    return { count: all.length, bytes };
  },
  async deleteForever(org, rid) {
    await wait(80);
    const all = store.filter(x => x.id === rid || (x as any).trashedWith === rid);
    let bytes = 0;
    for (const x of all) { bytes += x.size; store.splice(store.indexOf(x), 1); }
    usage[own(org)].trash -= bytes;
    return { count: all.length, bytes };
  },
  async downloadUrl(org, rid) { const r = find(org, rid); return `data:text/plain,${encodeURIComponent(`Lab download of ${r.name}`)}`; },
  async upload(scope, file, parentId, onProgress, signal) {
    const owner = scope.kind === 'o' ? scope.orgId : 'me';
    const u = usage[owner];
    if (u.live + u.trash + file.size > u.allowance * 1.1) throw new DriveApiError('Your Drive is full. Free up space or add storage to keep uploading.', 413, 'over_quota');
    const rate = 40 * MB / 10; // per 100 ms tick
    for (let sent = 0; sent < file.size; sent = Math.min(file.size, sent + rate)) {
      if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
      onProgress(sent);
      await wait(100);
    }
    onProgress(file.size);
    return add(owner, 'file', file.name, parentId, file.size, file.type || 'application/octet-stream');
  },
};

// Trash list shows only roots: hide children that went in with a folder.
const origList = api.list;
api.list = async (org, parent, trash) => {
  const r = await origList(org, parent, trash);
  if (trash) r.items = r.items.filter(i => !store.find(s => s.id === i.id && (s as any).trashedWith));
  return r;
};

createRoot(document.getElementById('root')!).render(
  <PlajahDrive api={api} orgs={[{ id: 'org_grace01', name: 'Grace Chapel' }]} onBack={() => alert('Back')} onAddStorage={() => alert('Add storage')} />,
);
