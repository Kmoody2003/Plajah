// phiCrypto — the cryptography under the PHI store. WebCrypto only; no custom primitives.
//
//   record payload     AES-256-GCM under a per-domain data key (DEK); the record's identity is bound
//                      in as additional authenticated data, so a ciphertext cannot be moved to another
//                      record, clinic, kind or revision without failing authentication.
//   passphrase         PBKDF2-HMAC-SHA256 (600,000 iterations, OWASP 2023) → AES-256-GCM key that
//                      seals the member's private key. Never stored; never leaves the device.
//   key grant          the DEK sealed for one member: ephemeral ECDH P-256 to the member's public key →
//                      HKDF-SHA256 → AES-GCM. Only that member's private key can open it.
//   recovery key       256 random bits, shown once. HKDF → AES-GCM seals each DEK for the owner, so a
//                      forgotten passphrase is not the end of the clinic's records.
//
// Everything here is pure and testable in Node (globalThis.crypto).
import type { KeyWrap, PassphraseWrap, Sealed } from './types';
import { PhiError } from './types';

export const PBKDF2_ITERATIONS = 600_000;
/** Refuse to unlock with a stored work factor below this: it would mean the stored blob was downgraded. */
export const MIN_ITERATIONS_ON_READ = 100_000;
export const MIN_PASSPHRASE_LENGTH = 12;

let iterationsInUse = PBKDF2_ITERATIONS;
let minOnRead = MIN_ITERATIONS_ON_READ;
/** Tests only: PBKDF2 at full cost is deliberately slow. Refuses to run outside a test process. */
export function __useFastKdfForTests(iterations = 1000) {
  const env = (globalThis as any).process?.env;
  if (!env || env.PLAJAH_PHI_TEST !== '1') throw new Error('__useFastKdfForTests is only available when PLAJAH_PHI_TEST=1');
  iterationsInUse = iterations; minOnRead = iterations;
}

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = (): SubtleCrypto => {
  const s = (globalThis as any).crypto?.subtle;
  if (!s) throw new PhiError('unavailable', 'WebCrypto is not available in this environment.');
  return s;
};

// ── bytes ────────────────────────────────────────────────────────────────────
export const b64 = {
  enc(bytes: Uint8Array): string {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec(s: string): Uint8Array {
    const bin = atob(s); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};
export function randomBytes(n: number): Uint8Array { const b = new Uint8Array(n); (globalThis as any).crypto.getRandomValues(b); return b; }
export const randomId = (bytes = 12) => b64.enc(randomBytes(bytes)).replace(/[+/=]/g, c => (c === '+' ? '-' : c === '/' ? '_' : ''));

/** Best-effort: overwrite key material we are done with. */
export function wipe(...arrays: Array<Uint8Array | undefined>) { for (const a of arrays) a?.fill(0); }

// ── AES-GCM seal / open with identity-bound AAD ──────────────────────────────
export async function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad), tagLength: 128 }, key, plaintext));
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}

export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await subtle().decrypt(
      { name: 'AES-GCM', iv: b64.dec(sealed.iv), additionalData: te.encode(aad), tagLength: 128 }, key, b64.dec(sealed.ct)));
  } catch {
    // Wrong key, wrong record, or tampered bytes — deliberately indistinguishable.
    throw new PhiError('decrypt-failed', 'This record could not be decrypted.');
  }
}

export const sealJson = (key: CryptoKey, value: unknown, aad: string) => seal(key, te.encode(JSON.stringify(value)), aad);
export async function openJson<T>(key: CryptoKey, sealed: Sealed, aad: string): Promise<T> {
  return JSON.parse(td.decode(await open(key, sealed, aad))) as T;
}

/** What a record's ciphertext is bound to. Changing any part makes it undecryptable. */
export const recordAad = (clinicId: string, recordId: string, kind: string, keyId: string, rev: number) =>
  `plajah-phi/record/v1|${clinicId}|${recordId}|${kind}|${keyId}|${rev}`;

// ── data keys ────────────────────────────────────────────────────────────────
export async function generateDataKey(extractable: boolean): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}
export async function importDataKey(raw: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}
export async function exportDataKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle().exportKey('raw', key));
}

// ── passphrase → key ─────────────────────────────────────────────────────────
/** Throws PhiError('weak-passphrase') when the passphrase is too short or trivially guessable. */
export function checkPassphrase(passphrase: string): void {
  const p = passphrase.normalize('NFKC');
  if (p.length < MIN_PASSPHRASE_LENGTH) throw new PhiError('weak-passphrase', `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  if (new Set(p.toLowerCase()).size < 5) throw new PhiError('weak-passphrase', 'That passphrase is too repetitive.');
  if (/^(password|passphrase|123456789|qwertyuiop|letmein)/i.test(p)) throw new PhiError('weak-passphrase', 'That passphrase is too common.');
}

async function deriveKek(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ── member key pair (ECDH P-256) ─────────────────────────────────────────────
export interface MemberKeys { pub: string; wrappedPriv: PassphraseWrap; privateKey: CryptoKey }

const privAad = (clinicId: string, uid: string) => `plajah-phi/member-priv/v1|${clinicId}|${uid}`;

/** Create a member's key pair; the private half is sealed under their passphrase. */
export async function createMemberKeys(clinicId: string, uid: string, passphrase: string): Promise<MemberKeys> {
  checkPassphrase(passphrase);
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const pub = b64.enc(new Uint8Array(await subtle().exportKey('spki', pair.publicKey)));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  // The working copy handed back is non-extractable; only the passphrase-sealed copy can be stored.
  const privateKey = await subtle().importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const wrappedPriv = await wrapPrivateKey(clinicId, uid, pkcs8, passphrase);
  wipe(pkcs8);
  return { pub, wrappedPriv, privateKey };
}

async function wrapPrivateKey(clinicId: string, uid: string, pkcs8: Uint8Array, passphrase: string): Promise<PassphraseWrap> {
  const salt = randomBytes(16);
  const kek = await deriveKek(passphrase, salt, iterationsInUse);
  const sealed = await seal(kek, pkcs8, privAad(clinicId, uid));
  return { salt: b64.enc(salt), iter: iterationsInUse, ...sealed };
}

async function openPrivate(clinicId: string, uid: string, w: PassphraseWrap, passphrase: string): Promise<Uint8Array> {
  if (!(w.iter >= minOnRead)) throw new PhiError('decrypt-failed', 'Stored key protection is weaker than allowed; refusing to use it.');
  const kek = await deriveKek(passphrase, b64.dec(w.salt), w.iter);
  try { return await open(kek, w, privAad(clinicId, uid)); }
  catch { throw new PhiError('wrong-passphrase', 'That passphrase is not correct.'); }
}

/** Unlock a member's private key with their passphrase. Non-extractable once imported. */
export async function unlockMemberKey(clinicId: string, uid: string, w: PassphraseWrap, passphrase: string): Promise<CryptoKey> {
  const pkcs8 = await openPrivate(clinicId, uid, w, passphrase);
  try { return await subtle().importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']); }
  finally { wipe(pkcs8); }
}

/** Change a member's passphrase: re-seal the same private key. */
export async function changeMemberPassphrase(clinicId: string, uid: string, w: PassphraseWrap, oldPass: string, newPass: string): Promise<PassphraseWrap> {
  checkPassphrase(newPass);
  const pkcs8 = await openPrivate(clinicId, uid, w, oldPass);
  try { return await wrapPrivateKey(clinicId, uid, pkcs8, newPass); } finally { wipe(pkcs8); }
}

// ── key grants: seal a data key for a member's public key ────────────────────
const grantInfo = (clinicId: string, domain: string, keyId: string, uid: string) =>
  `plajah-phi/grant/v1|${clinicId}|${domain}|${keyId}|${uid}`;

async function grantKey(shared: ArrayBuffer, salt: Uint8Array, info: string): Promise<CryptoKey> {
  const hk = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Seal `dek` so only the holder of `recipientPubB64`'s private key can open it. */
export async function wrapDataKeyFor(clinicId: string, domain: string, keyId: string, recipientUid: string, recipientPubB64: string, dek: CryptoKey): Promise<KeyWrap> {
  const recipientPub = await subtle().importKey('spki', b64.dec(recipientPubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const shared = await subtle().deriveBits({ name: 'ECDH', public: recipientPub }, eph.privateKey, 256);
  const salt = randomBytes(16);
  const info = grantInfo(clinicId, domain, keyId, recipientUid);
  const wrapKey = await grantKey(shared, salt, info);
  const raw = await exportDataKey(dek);
  try {
    const sealed = await seal(wrapKey, raw, info);
    return { keyId, epk: b64.enc(new Uint8Array(await subtle().exportKey('spki', eph.publicKey))), salt: b64.enc(salt), ...sealed };
  } finally { wipe(raw); }
}

/** Open a grant with the member's private key. `extractable` only for members who may grant to others. */
export async function unwrapDataKey(clinicId: string, domain: string, uid: string, w: KeyWrap, privateKey: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  const epk = await subtle().importKey('spki', b64.dec(w.epk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: epk }, privateKey, 256);
  const info = grantInfo(clinicId, domain, w.keyId, uid);
  const wrapKey = await grantKey(shared, b64.dec(w.salt), info);
  const raw = await open(wrapKey, w, info);
  try { return await importDataKey(raw, extractable); } finally { wipe(raw); }
}

// ── recovery key ─────────────────────────────────────────────────────────────
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** A fresh recovery key as 52 base32 characters in groups of four: XXXX-XXXX-… (256 bits). */
export function generateRecoveryKey(): string {
  const bytes = randomBytes(32); let bits = 0, acc = 0, out = '';
  for (const byte of bytes) { acc = (acc << 8) | byte; bits += 8; while (bits >= 5) { out += RC_ALPHABET[(acc >> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += RC_ALPHABET[(acc << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

function recoveryBytes(key: string): Uint8Array {
  const clean = key.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-HJ-NP-Z2-9]{52}$/.test(clean)) throw new PhiError('bad-recovery-key', 'That recovery key is not in the right format.');
  let bits = 0, acc = 0; const out: number[] = [];
  for (const ch of clean) { acc = (acc << 5) | RC_ALPHABET.indexOf(ch); bits += 5; if (bits >= 8) { out.push((acc >> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out.slice(0, 32));
}

async function recoveryKek(clinicId: string, recoveryKey: string): Promise<CryptoKey> {
  const raw = recoveryBytes(recoveryKey);
  try {
    const hk = await subtle().importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('plajah-phi/recovery/v1'), info: te.encode(clinicId) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { wipe(raw); }
}

const recoveryPrivAad = (clinicId: string) => `plajah-phi/recovery-priv/v1|${clinicId}`;

/**
 * Recovery is asymmetric so it survives key rotation: the clinic gets a recovery KEY PAIR. The public
 * half is stored, so anyone who can grant keys (owner, admin) can wrap each new data key for recovery.
 * The private half is sealed under the 256-bit recovery key the owner keeps offline — only that opens it.
 */
export async function createRecovery(clinicId: string): Promise<{ recoveryKey: string; pub: string; sealedPriv: Sealed }> {
  const recoveryKey = generateRecoveryKey();
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const pub = b64.enc(new Uint8Array(await subtle().exportKey('spki', pair.publicKey)));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  try { return { recoveryKey, pub, sealedPriv: await seal(await recoveryKek(clinicId, recoveryKey), pkcs8, recoveryPrivAad(clinicId)) }; }
  finally { wipe(pkcs8); }
}

/** Open the clinic's recovery private key with the owner's recovery key (then use unwrapDataKey with uid "recovery"). */
export async function openRecoveryPrivateKey(clinicId: string, sealedPriv: Sealed, recoveryKey: string): Promise<CryptoKey> {
  const kek = await recoveryKek(clinicId, recoveryKey);
  let pkcs8: Uint8Array;
  try { pkcs8 = await open(kek, sealedPriv, recoveryPrivAad(clinicId)); }
  catch { throw new PhiError('bad-recovery-key', 'That recovery key does not open this clinic.'); }
  try { return await subtle().importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']); }
  finally { wipe(pkcs8); }
}

/** The recipient id recovery grants are addressed to. */
export const RECOVERY_UID = 'recovery';

// ── hashing (audit chain) ────────────────────────────────────────────────────
export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await subtle().digest('SHA-256', te.encode(text)));
  return Array.from(d, x => x.toString(16).padStart(2, '0')).join('');
}
