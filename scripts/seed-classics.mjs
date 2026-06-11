/**
 * Seed classic public-domain books into Firebase Storage.
 *
 * Downloads each Gutenberg TXT and uploads it to
 *   books/classics/<id>/text.txt
 * so the Lorea reader can fetch a first-party CDN copy instead of leaning
 * on gutenberg.org (rate-limited) or the (currently 404ing) unseeded path.
 *
 * Auth: a Firebase service-account JSON key — the standard documented admin
 * credential. Generate one at:
 *   Firebase console → Project settings → Service accounts → Generate new
 *   private key  (or GCP console → IAM → Service Accounts → Keys)
 *
 * Run:
 *   node scripts/seed-classics.mjs path/to/service-account.json
 * or set GOOGLE_SERVICE_ACCOUNT_JSON to the file's contents and run with no arg.
 */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
const CLASSIC_IDS = [
  1342, 84, 11, 2701, 98, 345, 76, 174, 1260, 768,
  514, 120, 1513, 1524, 1400, 730, 46, 2554, 2600, 1399,
  996, 1184, 135, 161, 158, 1257, 103, 164, 36, 35,
  43, 215, 236, 844, 5200, 74, 25344, 1727, 6130, 145,
];

function loadServiceAccount() {
  const arg = process.argv[2];
  const raw = arg ? readFileSync(arg, 'utf8') : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.error('Provide a service-account key: node scripts/seed-classics.mjs <path.json>');
    process.exit(1);
  }
  return JSON.parse(raw);
}

async function mintToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned =
    b64({ alg: 'RS256', typ: 'JWT' }) + '.' +
    b64({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
    });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${sig}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token mint failed: ' + JSON.stringify(data).slice(0, 200));
  return data.access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sa = loadServiceAccount();
  console.log('Service account:', sa.client_email);
  const token = await mintToken(sa);
  console.log('Token minted. Seeding', CLASSIC_IDS.length, 'books…\n');

  let uploaded = 0, skipped = 0, failed = 0;
  for (const id of CLASSIC_IDS) {
    const path = `books/classics/${id}/text.txt`;
    const enc = encodeURIComponent(path);
    const dlUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${enc}?alt=media`;
    try {
      const head = await fetch(dlUrl, { method: 'HEAD' });
      if (head.ok) { console.log(`  skip   ${id} (exists)`); skipped++; continue; }
    } catch { /* proceed */ }

    try {
      const g = await fetch(`https://www.gutenberg.org/ebooks/${id}.txt.utf-8`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)' },
      });
      if (!g.ok) throw new Error(`Gutenberg ${g.status}`);
      const text = await g.text();
      // Upload via the standard Cloud Storage JSON API (purely IAM-gated). The
      // Firebase endpoint (firebasestorage.googleapis.com/v0) rejects OAuth
      // service-account tokens; storage.googleapis.com honors the SA's
      // storage.objects.create permission. A firebaseStorageDownloadTokens
      // metadata value makes the object fetchable through the Firebase
      // download URL the reader uses.
      const dlToken = crypto.randomUUID();
      const up = await fetch(
        `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${enc}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/plain; charset=utf-8',
            'x-goog-meta-firebaseStorageDownloadTokens': dlToken,
          },
          body: text,
        },
      );
      if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 120)}`);
      console.log(`  ok     ${id} (${(text.length / 1024).toFixed(0)} KB)`);
      uploaded++;
    } catch (e) {
      console.log(`  FAIL   ${id}: ${e.message}`);
      failed++;
    }
    await sleep(800); // polite to Gutenberg
  }
  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
