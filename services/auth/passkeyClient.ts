// Browser side of passkeys: opens Windows Hello, Android fingerprint / face unlock, or Face ID / Touch ID.
// The biometric check happens on the device; only a public key and signatures are sent to Plajah.
// Server: routes/passkeys.ts (enrolment) and routes/telaSign.ts (seal-challenge, finish).

const enc = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

/** True when this browser and device can make and use passkeys with a fingerprint, face or PIN. */
export async function passkeysAvailable(): Promise<boolean> {
  try {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

type Fetcher = (path: string, init?: RequestInit) => Promise<any>;

/** Add a passkey to the signed-in Plajah account. `api` must attach the user's Bearer token. */
export async function addPasskey(api: Fetcher, label = deviceLabel()): Promise<{ credentialId: string; label: string }> {
  const o = await api('/api/passkeys/register/options', { method: 'POST' });
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: new TextEncoder().encode(o.challenge), // the server's challenge string, as bytes
      rp: o.rp,
      user: { id: dec(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams,
      authenticatorSelection: o.authenticatorSelection,
      attestation: 'none',
      timeout: o.timeout,
      excludeCredentials: o.excludeCredentials.map((c: any) => ({ type: 'public-key', id: dec(c.id) })),
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was created.');
  const r = cred.response as AuthenticatorAttestationResponse;
  const publicKey = r.getPublicKey?.();
  if (!publicKey) throw new Error('This browser is too old to add a passkey. Update it and try again.');
  const saved = await api('/api/passkeys/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      challenge: o.challenge, credentialId: enc(cred.rawId), clientDataJSON: enc(r.clientDataJSON),
      authenticatorData: enc(r.getAuthenticatorData()), publicKey: enc(publicKey), alg: r.getPublicKeyAlgorithm(), label,
    }),
  });
  return saved.passkey;
}

/**
 * Ask the device to seal a Tela Sign signature. `challenge` comes from GET /seal-challenge and is the
 * base64url SHA-256 of the exact envelope state, so the device signs what the person is agreeing to.
 */
export async function sealWithPasskey(c: { challenge: string; rpId: string; allowCredentials: { id: string }[] }) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: dec(c.challenge), rpId: c.rpId, userVerification: 'required', timeout: 120_000,
      allowCredentials: c.allowCredentials.map((x) => ({ type: 'public-key', id: dec(x.id) })),
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('The passkey wasn’t used.');
  const r = cred.response as AuthenticatorAssertionResponse;
  return { credentialId: enc(cred.rawId), clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.authenticatorData), signature: enc(r.signature) };
}

function deviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Windows/.test(ua)) return 'Windows Hello';
  if (/Android/.test(ua)) return 'Android phone';
  if (/iPhone|iPad/.test(ua)) return 'iPhone or iPad';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Passkey';
}
