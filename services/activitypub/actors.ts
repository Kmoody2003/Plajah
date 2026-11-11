// Local actors: switching a federated identity on/off, resolving @handle → actor, signing keys.

import { actorKeyFor, normalizeHandle, parseActorKey, INSTANCE_ACTOR_KEY, apUrls, apHost, type ActorKind } from './config';
import { generateActorKeyPair, encryptPrivateKey, decryptPrivateKey } from './keys';
import { userEligibility, orgEligibility, canManageOrg, isChildAccount, DELETION_NOTICE, type Eligibility } from './policy';
import type { LocalActorProfile } from './jsonld';
import type { ActorRecord } from './store';
import type { ApDeps } from './deps';

export interface ResolvedActor {
  key: string;
  rec: ActorRecord;
  subject: Record<string, any>;
  profile: LocalActorProfile;
}

function eligibilityFor(kind: ActorKind, subject: Record<string, any> | null, deps: ApDeps): Eligibility {
  return kind === 'user' ? userEligibility(subject, new Date(deps.now()).getUTCFullYear()) : orgEligibility(subject);
}

const loadSubject = (deps: ApDeps, kind: ActorKind, id: string) => (kind === 'user' ? deps.loadUser(id) : deps.loadOrg(id));

function profileOf(kind: ActorKind, refId: string, s: Record<string, any>, rec: ActorRecord): LocalActorProfile {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const httpsOnly = (v: unknown) => { const x = str(v); return x && /^https:\/\//i.test(x) ? x : undefined; };
  return kind === 'user'
    ? { handle: rec.handle, kind, refId, name: str(s.displayName) || rec.handle, summary: str(s.bio), iconUrl: httpsOnly(s.photoURL), headerUrl: httpsOnly(s.coverArt), publicKeyPem: rec.publicKeyPem, published: rec.enabledAt }
    : { handle: rec.handle, kind, refId, name: str(s.name) || rec.handle, summary: str(s.tagline) || str(s.about), iconUrl: httpsOnly(s.logoUrl), headerUrl: httpsOnly(s.coverUrl), publicKeyPem: rec.publicKeyPem, published: rec.enabledAt };
}

/** handle → enabled, still-eligible local actor; null otherwise (unknown, switched off, now private/child…). */
export async function resolveLocalActor(deps: ApDeps, rawHandle: string): Promise<ResolvedActor | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  const key = await deps.store.actorKeyForHandle(handle);
  if (!key) return null;
  return resolveActorKey(deps, key);
}

export async function resolveActorKey(deps: ApDeps, key: string): Promise<ResolvedActor | null> {
  const ref = parseActorKey(key);
  if (!ref) return null;
  const rec = await deps.store.getActor(key);
  if (!rec || !rec.enabled) return null;
  const subject = await loadSubject(deps, ref.kind, ref.id);
  if (!subject || !eligibilityFor(ref.kind, subject, deps).eligible) return null;
  return { key, rec, subject, profile: profileOf(ref.kind, ref.id, subject, rec) };
}

export async function signingKeyFor(deps: ApDeps, key: string): Promise<{ keyId: string; privateKeyPem: string } | null> {
  const rec = key === INSTANCE_ACTOR_KEY ? await ensureInstanceActor(deps) : await deps.store.getActor(key);
  if (!rec?.privateKeyEnc) return null;
  const u = apUrls(deps.base);
  try {
    return { keyId: key === INSTANCE_ACTOR_KEY ? u.instanceKeyId() : u.keyId(rec.handle), privateKeyPem: decryptPrivateKey(rec.privateKeyEnc, deps.encKey()) };
  } catch (e) {
    deps.log('could not decrypt actor key', { key, err: String(e) });
    return null;
  }
}

/** The site-wide Application actor that signs GETs to servers running "authorized fetch". */
export async function ensureInstanceActor(deps: ApDeps): Promise<ActorRecord> {
  const cur = await deps.store.getActor(INSTANCE_ACTOR_KEY);
  if (cur?.publicKeyPem && cur.privateKeyEnc) return cur;
  const kp = generateActorKeyPair();
  const rec: ActorRecord = {
    kind: 'instance', refId: 'instance', handle: apHost(deps.base), enabled: true,
    publicKeyPem: kp.publicKeyPem, privateKeyEnc: encryptPrivateKey(kp.privateKeyPem, deps.encKey()), createdAt: deps.now(),
  };
  await deps.store.putActor(INSTANCE_ACTOR_KEY, rec);
  return rec;
}

// ── Owner controls (/api/activitypub/me) ─────────────────────────────────────

export interface IdentityStatus {
  kind: ActorKind;
  id: string;
  eligible: boolean;
  reason?: string;
  enabled: boolean;
  handle: string | null;
  address: string | null;
  suggestedHandle: string | null;
  handleLocked: boolean;
  followerCount: number;
  actorUrl: string | null;
  notice?: string;
  deletionNotice: string;
}

function suggestHandle(kind: ActorKind, s: Record<string, any> | null): string | null {
  if (!s) return null;
  const tries = kind === 'user' ? [s.handle, s.username, s.displayName] : [s.handle, s.name];
  for (const t of tries) {
    if (typeof t !== 'string') continue;
    const slug = t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 30);
    const n = normalizeHandle(slug);
    if (n) return n;
  }
  return null;
}

export type Subject = { kind: 'user'; uid: string } | { kind: 'org'; orgId: string; uid: string };

async function loadAndAuthorize(deps: ApDeps, who: Subject): Promise<{ kind: ActorKind; id: string; subject: Record<string, any> | null }> {
  if (who.kind === 'user') return { kind: 'user', id: who.uid, subject: await deps.loadUser(who.uid) };
  const org = await deps.loadOrg(who.orgId);
  if (!canManageOrg(org, who.uid)) throw Object.assign(new Error('Only the organization owner or an admin can change this.'), { status: 403 });
  // An org switch is also blocked if the person flipping it is a child account.
  const actor = await deps.loadUser(who.uid);
  if (!actor || isChildAccount(actor, new Date(deps.now()).getUTCFullYear())) {
    throw Object.assign(new Error('This setting is managed by an adult admin.'), { status: 403 });
  }
  return { kind: 'org', id: who.orgId, subject: org };
}

export async function identityStatus(deps: ApDeps, who: Subject): Promise<IdentityStatus> {
  const { kind, id, subject } = await loadAndAuthorize(deps, who);
  const key = actorKeyFor(kind, id);
  const elig = eligibilityFor(kind, subject, deps);
  const rec = await deps.store.getActor(key);
  const handle = rec?.handle ?? null;
  const enabled = !!(rec?.enabled && elig.eligible);
  return {
    kind, id,
    eligible: elig.eligible,
    reason: elig.eligible ? undefined : elig.reason,
    enabled,
    handle,
    address: handle ? `@${handle}@${apHost(deps.base)}` : null,
    suggestedHandle: handle ?? suggestHandle(kind, subject),
    handleLocked: !!handle,
    followerCount: rec ? await deps.store.followerCount(key) : 0,
    actorUrl: handle && enabled ? apUrls(deps.base).actor(handle) : null,
    notice: elig.eligible ? elig.notice : undefined,
    deletionNotice: DELETION_NOTICE,
  };
}

/** Turn the identity on (claiming a handle the first time) or off. Throws {status,message} on refusal. */
export async function setIdentityEnabled(deps: ApDeps, who: Subject, enabled: boolean, requestedHandle?: string): Promise<IdentityStatus> {
  const { kind, id, subject } = await loadAndAuthorize(deps, who);
  const key = actorKeyFor(kind, id);
  const rec = await deps.store.getActor(key);
  if (!enabled) {
    if (rec?.enabled) await deps.store.patchActor(key, { enabled: false, disabledAt: deps.now() });
    return identityStatus(deps, who);
  }
  const elig = eligibilityFor(kind, subject, deps);
  if (!elig.eligible) throw Object.assign(new Error(elig.reason), { status: 403 });

  let handle = rec?.handle ?? null;
  if (!handle) {
    handle = normalizeHandle(requestedHandle ?? suggestHandle(kind, subject) ?? '');
    if (!handle) throw Object.assign(new Error('Pick a handle: 1–64 letters, numbers or underscores (dots and dashes allowed in the middle).'), { status: 400 });
    if (RESERVED_HANDLES.has(handle)) throw Object.assign(new Error('That handle is reserved.'), { status: 409 });
    if (await deps.handleTakenElsewhere(handle, { kind, id })) throw Object.assign(new Error('That handle belongs to another Plajah account.'), { status: 409 });
    if (!(await deps.store.claimHandle(handle, key))) throw Object.assign(new Error('That handle is already taken on the fediverse.'), { status: 409 });
  }
  if (rec?.publicKeyPem && rec.privateKeyEnc) {
    await deps.store.patchActor(key, { enabled: true, enabledAt: deps.now(), enabledBy: who.uid });
  } else {
    const kp = generateActorKeyPair();
    await deps.store.putActor(key, {
      kind, refId: id, handle, enabled: true, enabledAt: deps.now(), enabledBy: who.uid, createdAt: deps.now(),
      publicKeyPem: kp.publicKeyPem, privateKeyEnc: encryptPrivateKey(kp.privateKeyPem, deps.encKey()),
    });
  }
  return identityStatus(deps, who);
}

export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'security', 'abuse', 'postmaster', 'webmaster', 'hostmaster',
  'plajah', 'official', 'staff', 'moderator', 'mod', 'system', 'actor', 'instance', 'inbox', 'outbox', 'api', 'ap',
  'well-known', 'nodeinfo', 'null', 'undefined', 'everyone', 'all', 'public', 'relay',
]);
