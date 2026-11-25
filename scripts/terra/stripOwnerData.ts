/**
 * One-time cleanup: remove private owners' names and mailing addresses from Terra
 * records already stored in Firestore (see services/terra/ownerPrivacy.ts).
 *
 *   terraParcels  data.taxpayerName / data.taxpayerAddress for private individuals
 *                 (organizations keep their name); every owner gets data.ownerKind.
 *   terraCivic    personal fields inside data.raw (blight tickets carry the property
 *                 owner's name and mailing address and the inspector's name).
 *
 * New ingestion already applies the policy at normalization; this cleans what was
 * written before it. Reads only the few fields it needs (field masks), a page at a
 * time, so it never holds the collection in memory.
 *
 *   npx tsx scripts/terra/stripOwnerData.ts            # dry run: counts only, writes nothing
 *   npx tsx scripts/terra/stripOwnerData.ts --apply    # writes (needs GOOGLE_SERVICE_ACCOUNT_JSON)
 *   options: --only=parcels|civic   --max=<docs>
 *
 * ⚠️ --apply rewrites production data. Run the dry run first and read its counts.
 */
import { adminConfig, fsCommit, getAccessToken, type CommitWrite } from '../../services/firebaseAdminRest';
import { classifyOwner, personalRawKeys } from '../../services/terra/ownerPrivacy';

const args = new Map(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as const; }));
const APPLY = args.get('apply') === 'true';
const ONLY = args.get('only');
const MAX = Number(args.get('max') ?? Infinity);
const PAGE = 300;
const BASE = `https://firestore.googleapis.com/v1/projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;

// Minimal Firestore REST value decoding — only the shapes these fields use.
function val(v: any): any {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(val);
  return undefined;
}

async function* pages(collection: string, fieldPaths: string[]) {
  let token: string | undefined;
  let seen = 0;
  do {
    const qs = new URLSearchParams({ pageSize: String(PAGE) });
    for (const f of fieldPaths) qs.append('mask.fieldPaths', f);
    if (token) qs.set('pageToken', token);
    const auth = await getAccessToken();
    if (!auth) throw new Error('No Firestore credentials (set GOOGLE_SERVICE_ACCOUNT_JSON).');
    const res = await fetch(`${BASE}/${collection}?${qs}`, { headers: { Authorization: `Bearer ${auth}` } });
    if (!res.ok) throw new Error(`List ${collection} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as any;
    const docs = (json.documents ?? []).map((d: any) => ({
      path: String(d.name).split('/documents/')[1],
      data: val({ mapValue: { fields: d.fields ?? {} } }) as Record<string, any>,
    }));
    seen += docs.length;
    yield docs as { path: string; data: Record<string, any> }[];
    token = json.nextPageToken;
    if (seen >= MAX) break;
  } while (token);
}

async function commitAll(writes: CommitWrite[]): Promise<number> {
  let ok = 0;
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const r = await fsCommit(chunk);
    if (!r.ok) throw new Error(`Commit failed (HTTP ${r.status}) at write ${i}; earlier chunks were saved. Re-running is safe.`);
    ok += chunk.length;
  }
  return ok;
}

async function parcels() {
  let scanned = 0, individuals = 0, organizations = 0, alreadyClean = 0, written = 0;
  const samples = { organization: new Set<string>(), individualCount: 0 };
  for await (const docs of pages('terraParcels', ['data.taxpayerName', 'data.taxpayerAddress', 'data.ownerKind'])) {
    const writes: CommitWrite[] = [];
    for (const d of docs) {
      scanned++;
      const name: string | undefined = d.data.data?.taxpayerName;
      if (!name) { if (d.data.data?.taxpayerAddress) { writes.push({ path: d.path, data: {}, mask: ['data.taxpayerAddress'] }); } else alreadyClean++; continue; }
      const kind = classifyOwner(name);
      if (kind === 'organization') {
        organizations++;
        if (samples.organization.size < 12) samples.organization.add(name);
        if (d.data.data?.ownerKind !== 'organization') writes.push({ path: d.path, data: { data: { ownerKind: 'organization' } }, mask: ['data.ownerKind'] });
      } else {
        individuals++;
        // Masked fields absent from `data` are deleted; ownerKind is set.
        writes.push({ path: d.path, data: { data: { ownerKind: 'individual' } }, mask: ['data.taxpayerName', 'data.taxpayerAddress', 'data.ownerKind'] });
      }
    }
    if (APPLY && writes.length) written += await commitAll(writes);
    if (scanned % 6000 < PAGE) console.log(`  parcels scanned ${scanned} · individuals ${individuals} · organizations ${organizations}`);
  }
  console.log(`terraParcels: scanned ${scanned}, private individuals ${individuals} (name + address ${APPLY ? 'removed' : 'would be removed'}), organizations ${organizations} (kept), no owner ${alreadyClean}${APPLY ? `, writes ${written}` : ''}`);
  console.log('  organization examples (check none are people):', [...samples.organization].join(' | '));
}

async function civic() {
  let scanned = 0, dirty = 0, written = 0;
  const keysSeen = new Map<string, number>();
  for await (const docs of pages('terraCivic', ['data.raw'])) {
    const writes: CommitWrite[] = [];
    for (const d of docs) {
      scanned++;
      const keys = personalRawKeys(d.data.data?.raw);
      if (!keys.length) continue;
      dirty++;
      for (const k of keys) keysSeen.set(k, (keysSeen.get(k) ?? 0) + 1);
      writes.push({ path: d.path, data: {}, mask: keys.map(k => `data.raw.\`${k}\``) });
    }
    if (APPLY && writes.length) written += await commitAll(writes);
  }
  console.log(`terraCivic: scanned ${scanned}, records with personal fields ${dirty}${APPLY ? `, writes ${written}` : ' (would be cleaned)'}`);
  console.log('  fields removed:', [...keysSeen].map(([k, n]) => `${k}×${n}`).join(', ') || 'none');
}

(async () => {
  console.log(`${APPLY ? 'APPLYING to' : 'Dry run on'} ${adminConfig.DB_ID} (${adminConfig.PROJECT_ID})${Number.isFinite(MAX) ? `, first ${MAX} docs per collection` : ''}`);
  if (!adminConfig.hasCredentials()) { console.error('No Firestore credentials: set GOOGLE_SERVICE_ACCOUNT_JSON.'); process.exit(2); }
  if (ONLY !== 'civic') await parcels();
  if (ONLY !== 'parcels') await civic();
})().catch(e => { console.error(e?.message || e); process.exit(1); });
