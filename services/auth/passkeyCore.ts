// Passkeys (WebAuthn): Windows Hello, Android fingerprint and face unlock, Face ID / Touch ID.
//
// The fingerprint or face never leaves the person's device. The device checks it in its secure hardware
// and then signs our challenge with a key it created for Plajah. We receive and store only the PUBLIC key,
// so Plajah never collects a biometric identifier.
//
// No CBOR parsing is needed: browsers expose the public key as SPKI DER through
// AuthenticatorAttestationResponse.getPublicKey(), and Node's crypto verifies ES256, RS256 and EdDSA directly.
// We ask for attestation "none": we care that the same key signs later, not which device brand made it.

import nodeCrypto from 'node:crypto';

export const ALG = { ES256: -7, RS256: -257, EdDSA: -8 } as const;
export type CoseAlg = (typeof ALG)[keyof typeof ALG];

export interface StoredPasskey {
  credentialId: string; // base64url
  uid: string;
  publicKey: string; // SPKI DER, base64url
  alg: CoseAlg;
  signCount: number;
  label: string;
  /** Whether the device verified the user (biometric or device PIN) when the passkey was made. */
  userVerified: boolean;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export const b64u = {
  enc: (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url'),
  dec: (s: string) => Buffer.from(String(s || ''), 'base64url'),
};
const sha256 = (b: Buffer | string) => nodeCrypto.createHash('sha256').update(b).digest();

export interface AuthData { rpIdHash: Buffer; up: boolean; uv: boolean; be: boolean; bs: boolean; signCount: number }
export function parseAuthData(buf: Buffer): AuthData {
  if (buf.length < 37) throw new Error('The device response is incomplete.');
  const flags = buf[32];
  return { rpIdHash: buf.subarray(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), be: !!(flags & 0x08), bs: !!(flags & 0x10), signCount: buf.readUInt32BE(33) };
}

function checkClientData(clientDataJSON: Buffer, type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string) {
  let cd: any;
  try { cd = JSON.parse(clientDataJSON.toString('utf8')); } catch { throw new Error('The device response is unreadable.'); }
  if (cd.type !== type) throw new Error('The device answered a different request.');
  if (cd.challenge !== challenge) throw new Error('This passkey answer is for a different request. Try again.');
  if (cd.origin !== origin) throw new Error('This passkey answer came from a different website.');
}

function checkAuthData(ad: AuthData, rpId: string, requireUV: boolean) {
  if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error('This passkey belongs to a different website.');
  if (!ad.up) throw new Error('The device didn’t confirm a person was present.');
  if (requireUV && !ad.uv) throw new Error('Unlock with your fingerprint, face or device PIN to continue.');
}

export interface RegistrationInput {
  credentialId: string; clientDataJSON: string; authenticatorData: string; publicKey: string; alg: number; label?: string;
}
export function verifyRegistration(input: RegistrationInput, opts: { uid: string; challenge: string; origin: string; rpId: string; now: number }): StoredPasskey {
  if (!input?.credentialId || !input.publicKey) throw new Error('This browser didn’t share the passkey. Update it and try again.');
  if (![ALG.ES256, ALG.RS256, ALG.EdDSA].includes(input.alg as CoseAlg)) throw new Error('This passkey type isn’t supported.');
  // The browser receives our challenge string as UTF-8 bytes and reports them back base64url-encoded.
  checkClientData(b64u.dec(input.clientDataJSON), 'webauthn.create', b64u.enc(Buffer.from(opts.challenge, 'utf8')), opts.origin);
  const ad = parseAuthData(b64u.dec(input.authenticatorData));
  checkAuthData(ad, opts.rpId, true);
  try { nodeCrypto.createPublicKey({ key: b64u.dec(input.publicKey), format: 'der', type: 'spki' }); } catch { throw new Error('The passkey’s public key is unreadable.'); }
  return {
    credentialId: input.credentialId, uid: opts.uid, publicKey: input.publicKey, alg: input.alg as CoseAlg, signCount: ad.signCount,
    label: String(input.label || 'Passkey').slice(0, 60), userVerified: ad.uv, backedUp: ad.be, createdAt: opts.now,
  };
}

export interface AssertionInput { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string }
/** Check a passkey signature. Returns the new sign counter and what the device reported. */
export function verifyAssertion(input: AssertionInput, key: StoredPasskey, opts: { challenge: string; origin: string; rpId: string; requireUV?: boolean }) {
  if (input?.credentialId !== key.credentialId) throw new Error('That passkey isn’t on this account.');
  const clientData = b64u.dec(input.clientDataJSON), authData = b64u.dec(input.authenticatorData);
  checkClientData(clientData, 'webauthn.get', opts.challenge, opts.origin);
  const ad = parseAuthData(authData);
  checkAuthData(ad, opts.rpId, opts.requireUV !== false);
  const signed = Buffer.concat([authData, sha256(clientData)]);
  const pub = nodeCrypto.createPublicKey({ key: b64u.dec(key.publicKey), format: 'der', type: 'spki' });
  const ok = key.alg === ALG.EdDSA
    ? nodeCrypto.verify(null, signed, pub, b64u.dec(input.signature))
    : nodeCrypto.verify('sha256', signed, pub, b64u.dec(input.signature)); // ES256 signatures arrive DER-encoded
  if (!ok) throw new Error('The passkey signature didn’t check out.');
  // A counter that goes backwards suggests a cloned authenticator. Synced passkeys report 0 every time.
  if (ad.signCount !== 0 && key.signCount !== 0 && ad.signCount <= key.signCount) throw new Error('This passkey may have been copied. Remove it and add a new one.');
  return { signCount: ad.signCount, userVerified: ad.uv, backedUp: ad.be };
}

// ── Stateless challenges for account enrolment ───────────────────────────────
/** A challenge that proves we issued it, to whom and when, without storing anything. */
export function issueChallenge(secret: string, uid: string, purpose: string, now: number): string {
  const body = `${now.toString(36)}.${nodeCrypto.randomBytes(16).toString('base64url')}`;
  const mac = nodeCrypto.createHmac('sha256', secret).update(`${purpose}:${uid}:${body}`).digest('base64url').slice(0, 22);
  return `${body}.${mac}`;
}
export function challengeValid(secret: string, uid: string, purpose: string, challenge: string, now: number, ttlMs = 5 * 60_000): boolean {
  const parts = String(challenge || '').split('.');
  if (parts.length !== 3) return false;
  const [ts, rnd, mac] = parts;
  const expect = nodeCrypto.createHmac('sha256', secret).update(`${purpose}:${uid}:${ts}.${rnd}`).digest('base64url').slice(0, 22);
  if (mac.length !== expect.length || !nodeCrypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return false;
  const at = parseInt(ts, 36);
  return Number.isFinite(at) && now - at >= 0 && now - at <= ttlMs;
}
