// seedDeptStore: load a department's merch from a local photo folder into an org store (admin seed).
//
//   npx tsx scripts/seedDeptStore.ts scripts/seeds/<dept>.json --shots <outDir>   build the clean product shots locally, write NOTHING remote
//   npx tsx scripts/seedDeptStore.ts scripts/seeds/<dept>.json                   DRY RUN: check every file + the org/department, write nothing
//   npx tsx scripts/seedDeptStore.ts scripts/seeds/<dept>.json --publish         upload + write (a re-run never changes a listing that exists)
//   … --publish --refresh-content                                              ALSO overwrite existing listings' words/photos (undoes seller edits)
//
// What --publish writes (all in the plajah-ops database):
//   • Content HQ (orgAssets + hqAssetVersions): every ORIGINAL photo and every generated shot, filed in the department's
//     folder (departmentId/departmentName), uploaded to protected-hq/org/{orgId}/… as the org owner.
//   • storeProducts/{wtjm_<slug>}: one product per manifest entry, sold by the org account (sellerId = ownerUid,
//     sellerType ORG), shelved in the department (ministryId). Every product is a HIDDEN DRAFT (isActive false, price 0):
//     the seller sets price + stock and publishes from the store manager. Re-running never re-publishes or overwrites
//     price/stock/isActive a seller has since set.
// Auth: the signed-in gcloud user, like scripts/showcase/*.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const PROJECT = 'gen-lang-client-0665118474';
const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
const OPS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/plajah-ops/documents`;
const PROD = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/plajah-prod/documents`;

interface Item { slug: string; title: string; category: string; supplement?: boolean; hero: string; gallery: string[]; blurb: string; specs: [string, string][]; tags: string[] }
interface Manifest { orgId: string; ownerUid: string; sellerName: string; ministryId: string; folder: string; supplementNote: string; products: Item[] }

const args = process.argv.slice(2);
const manifestPath = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
const PUBLISH = args.includes('--publish');
const shotsIdx = args.indexOf('--shots');
const SHOTS_DIR = shotsIdx >= 0 ? args[shotsIdx + 1] : '';
const scenesIdx = args.indexOf('--scenes');
const SCENES_DIR = scenesIdx >= 0 ? args[scenesIdx + 1] : '';   // with --publish: add lifestyle scenes to existing products
const REFRESH_CONTENT = args.includes('--refresh-content');      // with --publish: overwrite seller-edited title/description/photos (normally never)
if (!manifestPath) { console.error('usage: npx tsx scripts/seedDeptStore.ts <manifest.json> [--shots <dir> | --publish]'); process.exit(1); }
const m: Manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// ── Firestore REST (typed values) ──────────────────────────────────────────
import { execSync } from 'node:child_process';
const GCLOUD = path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd');
let tok = '', tokAt = 0;
async function auth(json = true): Promise<Record<string, string>> {
  if (!tok || Date.now() - tokAt > 25 * 60e3) { tok = execSync(`"${GCLOUD}" auth print-access-token`, { shell: true } as never).toString().trim(); tokAt = Date.now(); }
  return { Authorization: `Bearer ${tok}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
const toV = (v: unknown): any => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toV) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toV(x)])) } };
};
const fromV = (v: any): any => {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromV);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromV(x)]));
};
async function get(base: string, p: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${base}/${p}`, { headers: await auth(false) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${p}: HTTP ${r.status}`);
  return fromV({ mapValue: { fields: ((await r.json()) as any).fields || {} } });
}
async function patch(p: string, data: Record<string, unknown>): Promise<void> {
  const fields = toV(data).mapValue.fields;
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${OPS}/${p}?${mask}`, { method: 'PATCH', headers: await auth(), body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
async function putObject(objectPath: string, bytes: Buffer, contentType: string, publicToken: boolean): Promise<string> {
  const token = crypto.randomUUID();
  const boundary = 'b' + crypto.randomBytes(8).toString('hex');
  const metadata: Record<string, string> = { ownerUid: m.ownerUid, source: 'seedDeptStore' };
  if (publicToken) metadata.firebaseStorageDownloadTokens = token;
  const meta = JSON.stringify({ name: objectPath, contentType, cacheControl: publicToken ? 'public, max-age=31536000' : 'private, max-age=0', metadata });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`, {
    method: 'POST', headers: { ...(await auth(false)), 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
  if (!r.ok) throw new Error(`upload ${objectPath}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

// ── Product shot: trim the backdrop, centre on a square white studio card with a soft floor shadow ──
async function productShot(file: string): Promise<Buffer> {
  const S = 1600;
  const src = sharp(file, { failOn: 'none' }).rotate();
  const meta = await src.metadata();
  const stats = meta.hasAlpha ? await src.clone().stats() : null;
  const cutout = !!stats && stats.channels[3].min < 10;            // a real transparent cut-out
  // Cut-outs: trim the transparency. Photos on a white sweep: trim near-white. Anything that barely trims is a room photo.
  const trimmed = cutout
    ? await src.clone().trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true })
    : await src.clone().flatten({ background: '#ffffff' }).trim({ background: '#ffffff', threshold: 22 }).png().toBuffer({ resolveWithObject: true }).catch(() => null);
  const W = meta.width || 1, H = meta.height || 1;
  const isRoom = !cutout && (!trimmed || (trimmed.info.width * trimmed.info.height) > W * H * 0.8);
  if (isRoom) {
    // Keep the whole photo: centred on a blurred, softened copy of itself.
    const bg = await sharp(file).rotate().resize(S, S, { fit: 'cover' }).blur(40).modulate({ brightness: 1.05, saturation: 0.8 }).toBuffer();
    const fg = await sharp(file).rotate().resize(Math.round(S * 0.92), Math.round(S * 0.92), { fit: 'inside' }).toBuffer({ resolveWithObject: true });
    return sharp(bg).composite([{ input: fg.data, left: Math.round((S - fg.info.width) / 2), top: Math.round((S - fg.info.height) / 2) }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  }
  const product = await sharp(trimmed!.data).resize(Math.round(S * 0.72), Math.round(S * 0.74), { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = product.info;
  const left = Math.round((S - w) / 2), top = Math.round(S * 0.87 - h);
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${S / 2}" cy="${top + h - 4}" rx="${Math.round(w * 0.56)}" ry="${Math.max(18, Math.round(w * 0.07))}" fill="url(#g)"/></svg>`);
  return sharp({ create: { width: S, height: S, channels: 3, background: '#f5f3f0' } })
    .composite([{ input: shadow }, { input: product.data, left, top, blend: cutout ? 'over' : 'multiply' }])
    .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

const mimeOf = (f: string) => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' } as Record<string, string>)[path.extname(f).toLowerCase()] || 'application/octet-stream';
const assetId = (key: string) => 'wtjm_' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 20);

async function hqAsset(name: string, bytes: Buffer, mimeType: string, deptName: string, tags: string[], key: string) {
  const id = assetId(key);
  const safe = name.replace(/[^\w.\-]+/g, '_');
  const storagePath = `protected-hq/org/${m.orgId}/${id}/${safe}`;
  await putObject(storagePath, bytes, mimeType, false);
  const now = Date.now();
  await patch(`orgAssets/${id}`, {
    id, scopeKind: 'org', scopeId: m.orgId, uploadedByUid: m.ownerUid, name, kind: 'image', mimeType,
    url: `/api/hq/assets/${encodeURIComponent(id)}/download`, storagePath, sizeBytes: bytes.length,
    folder: deptName, departmentId: m.ministryId, departmentName: deptName, tags,
    status: 'DRAFT', scanStatus: 'CLEAN', scanEngine: 'heuristics', scanEngineNote: 'Seed import: decoded and re-checked as an image with sharp before upload.',
    scannedAt: now, currentVersionId: `${id}_v1`, versionCount: 1, uploadedAt: now,
  });
  await patch(`hqAssetVersions/${id}_v1`, { id: `${id}_v1`, assetId: id, version: 1, storagePath, name, mimeType, sizeBytes: bytes.length, uploadedByUid: m.ownerUid, createdAt: now });
  return id;
}

async function main() {
  const missing: string[] = [];
  for (const p of m.products) for (const f of [p.hero, ...p.gallery]) if (!existsSync(path.join(m.folder, f))) missing.push(`${p.slug}: ${f}`);
  if (missing.length) throw new Error(`missing photos:\n  ${missing.join('\n  ')}`);

  if (SHOTS_DIR) {
    mkdirSync(SHOTS_DIR, { recursive: true });
    for (const p of m.products) {
      const files = [p.hero, ...p.gallery];
      for (let i = 0; i < files.length; i++) writeFileSync(path.join(SHOTS_DIR, `${p.slug}-${i}.jpg`), await productShot(path.join(m.folder, files[i])));
      console.log(`shots ${p.slug} (${files.length})`);
    }
    return;
  }

  console.log(`${PUBLISH ? 'PUBLISH' : 'DRY RUN'} | org ${m.orgId} | dept ${m.ministryId} | ${m.products.length} products`);
  const org = await get(PROD, `organizations/${m.orgId}`);
  if (!org) throw new Error('org not found');
  const dept = (org.ministries || []).find((x: any) => x.id === m.ministryId);
  if (!dept) throw new Error(`department ${m.ministryId} not found on ${org.name}`);
  if ((org.accountUid || org.creatorId) !== m.ownerUid) throw new Error(`ownerUid ${m.ownerUid} is not the store owner of ${org.name}`);
  console.log(`Org "${org.name}" · department "${dept.name}"`);
  if (!PUBLISH) { if (SCENES_DIR) console.log(`(scenes from ${SCENES_DIR} would be added with --publish)`); m.products.forEach(p => console.log(`  ${p.slug}: ${p.title} — ${1 + p.gallery.length} photo(s)`)); return; }

  if (SCENES_DIR) {
    // Lifestyle scenes (e.g. Magnific background replacement): <dir>/<slug>.jpg → Content HQ + 2nd photo in the listing.
    for (const p of m.products) {
      const file = path.join(SCENES_DIR, `${p.slug}.jpg`);
      if (!existsSync(file)) { console.log(`  skip ${p.slug} (no scene)`); continue; }
      const id = `wtjm_${p.slug.replace(/-/g, '_')}`;
      const existing = await get(OPS, `storeProducts/${id}`);
      if (!existing) { console.log(`  skip ${p.slug} (product not loaded yet)`); continue; }
      const bytes = await sharp(file, { failOn: 'error' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      const name = `${p.slug}-lifestyle.jpg`;
      await hqAsset(name, bytes, 'image/jpeg', dept.name, ['merch', 'product-shot', 'lifestyle', p.slug], `scene:${name}`);
      const url = await putObject(`users/${m.ownerUid}/store/${id}/${name}`, bytes, 'image/jpeg', true);
      const images: string[] = (existing.images || []).filter((u: string) => !u.includes(encodeURIComponent(`/${name}`)));
      if (images.includes(url)) { console.log(`  scene ${id} already there`); continue; }
      images.splice(Math.min(1, images.length), 0, url);
      // A gallery edited on the product page (photos / videos / Tela docs) keeps its order with the scene added.
      const media: any[] | undefined = Array.isArray(existing.media) && existing.media.length ? existing.media.slice() : undefined;
      if (media) media.splice(Math.min(1, media.length), 0, { id: `m_scene_${p.slug.replace(/[^a-z0-9]/gi, '_')}`, kind: 'image', url });
      await patch(`storeProducts/${id}`, { images, ...(media ? { media } : {}), updatedAt: Date.now() });
      console.log(`  scene ${id} — ${images.length} photo(s)`);
    }
    return;
  }

  for (const p of m.products) {
    const id = `wtjm_${p.slug.replace(/-/g, '_')}`;
    const files = [p.hero, ...p.gallery];
    const images: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const src = path.join(m.folder, files[i]);
      const original = readFileSync(src);
      await sharp(original, { failOn: 'error' }).metadata();   // refuses anything that is not a decodable image
      await hqAsset(files[i], original, mimeOf(files[i]), dept.name, ['merch', 'product-photo', 'original', p.slug], `orig:${files[i]}`);
      const shot = await productShot(src);
      const shotName = `${p.slug}-${i + 1}.jpg`;
      await hqAsset(shotName, shot, 'image/jpeg', dept.name, ['merch', 'product-shot', p.slug], `shot:${shotName}`);
      images.push(await putObject(`users/${m.ownerUid}/store/${id}/${shotName}`, shot, 'image/jpeg', true));
    }
    const existing = await get(OPS, `storeProducts/${id}`);
    const now = Date.now();
    const description = p.supplement ? `${p.blurb}\n\n${m.supplementNote}` : p.blurb;
    // Once a listing exists its words, photos and shelf belong to the seller: a re-run used to rewrite
    // title/description/photos/specs/tags and silently undo edits made in the store manager or on the
    // product page. Now only a first load writes them, unless --refresh-content is passed on purpose.
    const content = {
      title: p.title, description, category: p.category, images,
      specs: p.specs.map(([label, value]) => ({ label, value })), tags: p.tags, ministryId: m.ministryId,
    };
    await patch(`storeProducts/${id}`, {
      id, sellerId: m.ownerUid, sellerName: m.sellerName, sellerType: 'ORG',
      ...(existing && !REFRESH_CONTENT ? {} : content),
      ...(existing ? {} : { isDigital: false, fulfillmentSource: 'manual', trackInventory: true, updatedAt: now }),
      // Seller-owned fields: set only the first time, never overwritten by a re-run.
      ...(existing ? {} : { price: 0, stock: 0, isActive: false, lowStockThreshold: 3, createdAt: now }),
      ...(existing && REFRESH_CONTENT ? { media: null, updatedAt: now } : {}),   // the manifest's photos replace the gallery
    });
    console.log(`  ${existing ? (REFRESH_CONTENT ? 'refreshed' : 'kept seller edits on') : 'created'} ${id} — ${images.length} photo(s)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
