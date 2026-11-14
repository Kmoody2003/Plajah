// migrateClassroomCoursework — move every classroom's lessons + assignments off the public catalog doc
// into its private coursework doc, so only the owner and enrolled students can read them.
//
//   npx tsx scripts/migrateClassroomCoursework.ts --firebase-login                   # DRY RUN as your Firebase CLI login
//   npx tsx scripts/migrateClassroomCoursework.ts --key <sa.json>                    # DRY RUN (default)
//   npx tsx scripts/migrateClassroomCoursework.ts --key <sa.json> --apply            # move them
//   npx tsx scripts/migrateClassroomCoursework.ts --key <sa.json> --restore <backup.json>
//
// Background: `classrooms/{id}` is world-readable (it is the course catalog card) and used to embed the
// full `lessons` and `assignments`. Coursework now lives in `classrooms/{id}/private/coursework`, readable
// only by the owner and `enrolledStudents` (firestore.rules). The app moves a class over when its owner next
// opens it (services/classroomCoursework.ts migrateLegacyCoursework); this does every class at once.
//
// ── Why this cannot lose coursework ────────────────────────────────────────────────────────
//  1. A private doc that already holds coursework wins — it is never overwritten (same as the app).
//  2. Reads are strict: a failed read aborts the run instead of looking like "no private doc yet".
//  3. The private doc is written and READ BACK before the public arrays are blanked. If the read-back does
//     not match, that class is left exactly as it was.
//  4. Every class it would touch is backed up to JSON (public arrays + preview fields + the prior private
//     doc) BEFORE any write, and --restore puts them all back.
//  5. It is a dry run unless --apply is passed.

import { loadServiceAccount, preflightCredentials, CREDENTIAL_HELP } from './loadLocalEnv';
import { writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';

// --firebase-login: act as the operator's own `firebase login` (no key file). Must run BEFORE firebaseAdminRest reads process.env.
const FIREBASE_LOGIN = process.argv.includes('--firebase-login');
if (FIREBASE_LOGIN) {
  const tok = JSON.parse(readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
  if (!tok?.access_token || tok.expires_at < Date.now() + 5 * 60_000) {
    console.error('Firebase CLI token expired — run `npx firebase-tools projects:list` once, then retry.');
    process.exit(2);
  }
  process.env.ADMIN_REST_ACCESS_TOKEN = tok.access_token;
} else {
  loadServiceAccount(process.argv);
}

import { getAccessToken, fsGetStrict, fsSet, fsPatch, fsDelete, adminConfig } from '../services/firebaseAdminRest';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const restoreAt = args.indexOf('--restore');
const RESTORE_FILE = restoreAt !== -1 ? args[restoreAt + 1] : null;

const FS_DOC_ROOT = `projects/${adminConfig.PROJECT_ID}/databases/${adminConfig.DB_ID}/documents`;
const FS_BASE = `https://firestore.googleapis.com/v1/${FS_DOC_ROOT}`;

interface Backup {
  id: string;
  title: string;
  ownerId: string;
  public: { lessons: any[]; assignments: any[]; lessonOutline: any[] | null; assignmentCount: number | null };
  /** The private doc before the run; null = it did not exist. */
  private: Record<string, any> | null;
}

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const outlineOf = (lessons: any[]) =>
  [...lessons].sort((a, b) => (a?.order || 0) - (b?.order || 0)).map(l => ({ id: String(l?.id ?? ''), title: String(l?.title ?? '') }));

/** Every classroom id. Paged by document name; a failed page THROWS rather than reading as a short list. */
async function listClassroomIds(): Promise<string[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token — cannot query.');
  const ids: string[] = [];
  let cursor: string | undefined;
  const PAGE = 300;
  for (;;) {
    const structuredQuery: any = {
      from: [{ collectionId: 'classrooms' }],
      select: { fields: [{ fieldPath: '__name__' }] },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: PAGE,
    };
    if (cursor) structuredQuery.startAt = { values: [{ referenceValue: cursor }], before: false };
    const res = await fetch(`${FS_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw new Error(`runQuery classrooms failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const rows = (await res.json()) as any[];
    const docs = (Array.isArray(rows) ? rows : []).filter(r => r?.document);
    for (const r of docs) ids.push(String(r.document.name).split('/').pop()!);
    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1].document.name;
  }
  return ids;
}

/** Put back exactly what a backup file recorded. */
async function restore(file: string): Promise<void> {
  const rows: Backup[] = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`Restoring ${rows.length} classroom(s) from ${file}\n`);
  let ok = 0;
  for (const b of rows) {
    const pub: Record<string, unknown> = { lessons: b.public.lessons, assignments: b.public.assignments };
    if (b.public.lessonOutline) pub.lessonOutline = b.public.lessonOutline;
    if (b.public.assignmentCount != null) pub.assignmentCount = b.public.assignmentCount;
    const pubOk = await fsPatch(`classrooms/${b.id}`, pub);
    const privPath = `classrooms/${b.id}/private/coursework`;
    const privOk = b.private ? await fsSet(privPath, b.private) : await fsDelete(privPath);
    if (pubOk && privOk) ok++;
    else console.warn(`  FAILED ${b.id} (public ${pubOk ? 'ok' : 'failed'}, private ${privOk ? 'ok' : 'failed'})`);
  }
  console.log(`\nRestored ${ok}/${rows.length}.`);
}

async function main() {
  const cred = FIREBASE_LOGIN ? { ok: true, source: 'Firebase CLI login' } as ReturnType<typeof loadServiceAccount> : loadServiceAccount(process.argv);
  if (!cred.ok) {
    console.error(cred.error ? `\n${cred.error}\n` : '');
    console.error(CREDENTIAL_HELP);
    process.exit(1);
  }
  console.log(`Credentials: ${cred.source}`);
  const pre = await preflightCredentials();
  if (!pre.ok) { console.error(`\n${pre.message}`); process.exit(1); }
  console.log(`Connected: ${pre.message}\n`);

  if (RESTORE_FILE) return restore(RESTORE_FILE);

  const ids = await listClassroomIds();
  console.log(`${ids.length} classroom(s) in total.\n`);

  const todo: Backup[] = [];
  let alreadyPrivate = 0, empty = 0;
  for (const id of ids) {
    const d = await fsGetStrict(`classrooms/${id}`);
    if (!d) continue; // deleted mid-run
    const lessons = arr(d.lessons), assignments = arr(d.assignments);
    if (!lessons.length && !assignments.length) {
      if (Array.isArray(d.lessonOutline)) alreadyPrivate++; else empty++;
      continue;
    }
    const priv = await fsGetStrict(`classrooms/${id}/private/coursework`);
    todo.push({
      id,
      title: String(d.title || '(untitled)'),
      ownerId: String(d.ownerId || ''),
      public: {
        lessons, assignments,
        lessonOutline: Array.isArray(d.lessonOutline) ? d.lessonOutline : null,
        assignmentCount: typeof d.assignmentCount === 'number' ? d.assignmentCount : null,
      },
      private: priv,
    });
  }

  console.log(`Already private: ${alreadyPrivate} · no coursework: ${empty} · still public: ${todo.length}\n`);
  for (const b of todo) {
    const keep = arr(b.private?.lessons).length || arr(b.private?.assignments).length;
    console.log(`  ${b.id}  "${b.title}"  owner ${b.ownerId || '?'}  —  ${b.public.lessons.length} lesson(s), ${b.public.assignments.length} assignment(s)` +
      (keep ? '  [private doc already has coursework: kept, public copy only blanked]' : ''));
  }
  if (!todo.length) { console.log('Nothing to move.'); return; }

  const backupFile = `classroom-coursework-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(backupFile, JSON.stringify(todo, null, 2));
  console.log(`\nBackup written: ${backupFile}`);

  if (!APPLY) { console.log('\nDRY RUN — nothing changed. Re-run with --apply to move them.'); return; }

  let moved = 0;
  for (const b of todo) {
    const privPath = `classrooms/${b.id}/private/coursework`;
    const keep = arr(b.private?.lessons).length || arr(b.private?.assignments).length;
    const lessons = keep ? arr(b.private!.lessons) : b.public.lessons;
    const assignments = keep ? arr(b.private!.assignments) : b.public.assignments;
    if (!keep) {
      if (!(await fsSet(privPath, { lessons, assignments, updatedAt: Date.now() }))) { console.warn(`  FAILED private write ${b.id} — left as is`); continue; }
      const back = await fsGetStrict(privPath);
      if (!back || arr(back.lessons).length !== lessons.length || arr(back.assignments).length !== assignments.length) {
        console.warn(`  READ-BACK MISMATCH ${b.id} — public copy left in place`);
        continue;
      }
    }
    const ok = await fsPatch(`classrooms/${b.id}`, { lessons: [], assignments: [], lessonOutline: outlineOf(lessons), assignmentCount: assignments.length });
    if (ok) moved++;
    else console.warn(`  FAILED to blank public copy ${b.id} (private doc is written; re-run is safe)`);
  }
  console.log(`\nMoved ${moved}/${todo.length}. Undo with --restore ${backupFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
