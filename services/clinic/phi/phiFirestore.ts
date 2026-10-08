// The real PhiDb: Firestore, but the DEDICATED `plajah-phi` database (never the main app database).
// Everything stored through it is already ciphertext; this file only moves documents, maps timestamps
// (server time in, milliseconds out) and turns Firestore failures into PhiError codes the UI understands.
import type { FirebaseApp } from 'firebase/app';
import {
  Timestamp, collection, doc, getDoc, getDocs, getFirestore, limit as qLimit, orderBy as qOrderBy,
  query as fsQuery, serverTimestamp, where, writeBatch, type Firestore,
} from 'firebase/firestore';
import type { Filter, PhiDb, PhiDoc, WriteOp } from './phiPort';
import { PHI_DATABASE_ID, PhiError } from './types';

const SERVER_TIME = { __serverTime: true } as const;
const isSentinel = (v: unknown) => !!v && typeof v === 'object' && (v as any).__serverTime === true;

const toWire = (v: any): any => {
  if (isSentinel(v)) return serverTimestamp();
  if (Array.isArray(v)) return v.map(toWire);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = toWire(x);   // Firestore rejects undefined
    return out;
  }
  return v;
};
const fromWire = (v: any): any => {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(fromWire);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromWire(x)]));
  return v;
};

/** Map a Firestore error to a PhiError. The original message is dropped on purpose: it can echo document paths. */
export function mapFirestoreError(e: unknown): PhiError {
  if (e instanceof PhiError) return e;
  const code = String((e as any)?.code || '');
  if (code.includes('permission-denied')) return new PhiError('no-access', 'Not permitted.');
  if (code.includes('not-found')) return new PhiError('not-found', 'Not found.');
  if (code.includes('already-exists') || code.includes('aborted') || code.includes('failed-precondition')) return new PhiError('conflict', 'This changed elsewhere — reload and try again.');
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('network')) return new PhiError('unavailable', 'Could not reach the clinic vault. Check the connection.');
  return new PhiError('unavailable', 'The clinic vault request failed.');
}

export class FirestorePhiDb implements PhiDb {
  private fs: Firestore;
  constructor(app: FirebaseApp) { this.fs = getFirestore(app, PHI_DATABASE_ID); }

  serverNow() { return SERVER_TIME; }

  async get(path: string) {
    try {
      const snap = await getDoc(doc(this.fs, path));
      return snap.exists() ? fromWire(snap.data()) : null;
    } catch (e) { throw mapFirestoreError(e); }
  }

  async query(col: string, filters: Filter[], opts: { orderBy?: string; desc?: boolean; limit?: number } = {}): Promise<PhiDoc[]> {
    try {
      const parts: any[] = filters.map(([f, op, v]) => where(f, op === 'in' ? 'in' : op, v as any));
      if (opts.orderBy) parts.push(qOrderBy(opts.orderBy, opts.desc ? 'desc' : 'asc'));
      if (opts.limit) parts.push(qLimit(opts.limit));
      const snap = await getDocs(fsQuery(collection(this.fs, col), ...parts));
      return snap.docs.map(d => ({ id: d.id, data: fromWire(d.data()) }));
    } catch (e) { throw mapFirestoreError(e); }
  }

  async commit(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return;
    if (ops.length > 400) throw new PhiError('bad-input', 'Batch too large.');
    try {
      const batch = writeBatch(this.fs);
      for (const op of ops) {
        const ref = doc(this.fs, op.path);
        if (op.op === 'delete') batch.delete(ref);
        else if (op.op === 'update') batch.update(ref, toWire(op.data));
        // `create` is a set on a path the rules only allow when the document does not exist yet
        else batch.set(ref, toWire(op.data));
      }
      await batch.commit();
    } catch (e) { throw mapFirestoreError(e); }
  }
}

