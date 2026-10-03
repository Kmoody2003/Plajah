// The one seam between the PHI logic and a database. The vault/store/audit code only ever talks to
// this interface, which is what makes the security logic testable without a live Firestore:
//   • phiFirestore.ts  — the real adapter over the dedicated `plajah-phi` database
//   • memoryDb.ts      — an in-memory stand-in (tests)
// Timestamps cross this boundary as plain milliseconds.

export type Filter = [field: string, op: '==' | '>=' | '<=' | 'in', value: unknown];
export interface PhiDoc { id: string; data: Record<string, any> }

/** `create` fails if the document exists; `update` fails if it does not; `delete` removes it. */
export type WriteOp =
  | { op: 'create'; path: string; data: Record<string, any> }
  | { op: 'set'; path: string; data: Record<string, any> }
  | { op: 'update'; path: string; data: Record<string, any> }
  | { op: 'delete'; path: string };

export interface PhiDb {
  /** A placeholder for "the server's time at commit" — replaced with the real time when the write lands. */
  serverNow(): unknown;
  get(path: string): Promise<Record<string, any> | null>;
  query(collection: string, filters: Filter[], opts?: { orderBy?: string; desc?: boolean; limit?: number }): Promise<PhiDoc[]>;
  /** All-or-nothing. Rejects with a PhiError if any operation is not permitted or its precondition fails. */
  commit(ops: WriteOp[]): Promise<void>;
}

export const clinicPath = (clinicId: string) => `clinics/${clinicId}`;
export const memberPath = (clinicId: string, uid: string) => `clinics/${clinicId}/members/${uid}`;
export const membersPath = (clinicId: string) => `clinics/${clinicId}/members`;
export const grantPath = (clinicId: string, uid: string, domain: string) => `clinics/${clinicId}/grants/${uid}_${domain}`;
export const grantsPath = (clinicId: string) => `clinics/${clinicId}/grants`;
export const recoveryPath = (clinicId: string) => `clinics/${clinicId}/vault/recovery`;
export const recoveryWrapPath = (clinicId: string, domain: string) => `clinics/${clinicId}/vault/recwrap-${domain}`;
export const recordsPath = (clinicId: string) => `clinics/${clinicId}/records`;
export const recordPath = (clinicId: string, id: string) => `clinics/${clinicId}/records/${id}`;
export const auditPath = (clinicId: string) => `clinics/${clinicId}/audit`;
export const auditEntryPath = (clinicId: string, id: string) => `clinics/${clinicId}/audit/${id}`;
