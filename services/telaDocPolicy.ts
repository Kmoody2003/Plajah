// services/telaDocPolicy.ts — who may reach a shared document and its media. Pure, so it can be tested alone.
// Everything here runs on the server (routes/coeditSecurity.ts, routes/elevateAccess.ts). No client decides any of it.

export type DocRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface DocProject {
  ownerId: string;
  orgId?: string;
  members?: Record<string, string>;
  memberIds?: string[];
  expires?: Record<string, number>;
}

export interface DocOrg {
  creatorId?: string;
  itAdminUids?: string[];
}

export type MediaScope =
  | { pid: string; scope: 'user'; uploaderUid: string; file: string }
  | { pid: string; scope: 'org'; orgId: string; uploaderUid: string; file: string };

export interface MediaRelease { public?: boolean; uids?: string[] }

const SEG = /^[^/\\]{1,200}$/;
const seg = (s: string | undefined): s is string => !!s && SEG.test(s) && s !== '.' && s !== '..';

/** Reads tela-media/{pid}/user/{uid}/{file} or tela-media/{pid}/org/{orgId}/{uid}/{file}. Anything else is null. */
export function parseTelaMediaPath(path: string): MediaScope | null {
  const p = path.split('/');
  if (p[0] !== 'tela-media') return null;
  if (p.length === 5 && p[2] === 'user' && seg(p[1]) && seg(p[3]) && seg(p[4])) return { pid: p[1], scope: 'user', uploaderUid: p[3], file: p[4] };
  if (p.length === 6 && p[2] === 'org' && seg(p[1]) && seg(p[3]) && seg(p[4]) && seg(p[5])) return { pid: p[1], scope: 'org', orgId: p[3], uploaderUid: p[4], file: p[5] };
  return null;
}

/** Reads coedit-assets/{pid}/{uid}/{assetId}/{file}. */
export function parseCoeditAssetPath(path: string): { pid: string; uid: string } | null {
  const p = path.split('/');
  if (p.length !== 5 || p[0] !== 'coedit-assets' || !p.every(seg)) return null;
  return { pid: p[1], uid: p[2] };
}

export const isOrgSteward = (uid: string, org: DocOrg | null | undefined): boolean =>
  !!org && !!uid && (org.creatorId === uid || (org.itAdminUids || []).includes(uid));

export function isLiveMember(uid: string, p: DocProject | null | undefined, now = Date.now()): boolean {
  if (!p || !uid || !p.members?.[uid]) return false;
  const until = p.expires?.[uid];
  return !until || until > now;
}

/** Whose eyes a document's media is for.
 *  A shared document answers to its member list, so revoking really ends access. An org document nobody has shared yet
 *  answers to the org. A personal document that has never been shared has no audience to check, and its author may
 *  have put it in an article, a letter or a chat, so its link keeps working until the first share. */
export function canReadTelaMedia(input: {
  uid: string | null;
  media: MediaScope;
  project: DocProject | null;
  org: DocOrg | null;
  isActiveOrgMember: boolean;
  release: MediaRelease | null;
  now?: number;
}): boolean {
  const { uid, media, project, org, isActiveOrgMember, release, now } = input;
  if (release?.public) return true;
  if (uid && (release?.uids || []).includes(uid)) return true;
  if (project) {
    if (uid && isLiveMember(uid, project, now)) return true;
    return !!uid && !!project.orgId && isOrgSteward(uid, org);
  }
  if (media.scope === 'org') return !!uid && (isOrgSteward(uid, org) || isActiveOrgMember);
  return true;
}

/** Project media and media a member uploaded: live members and, for an org document, its stewards. */
export const canReadProjectAsset = (uid: string, project: DocProject | null, org: DocOrg | null, now = Date.now()): boolean =>
  !!project && (isLiveMember(uid, project, now) || (!!project.orgId && isOrgSteward(uid, org)));

/** Managing who's in: the document's owner, and for an org document the org's owner and IT Admins. */
export const canManageAccess = (uid: string, project: DocProject, org: DocOrg | null): boolean =>
  project.ownerId === uid || (!!project.orgId && isOrgSteward(uid, org));

/** Only someone who can edit may make a document's media visible to anyone else. */
export const canReleaseMedia = (uid: string, project: DocProject | null, org: DocOrg | null, media: { uploaderUid?: string } | null, now = Date.now()): boolean => {
  if (project) return (project.members?.[uid] === 'owner' || project.members?.[uid] === 'editor') && isLiveMember(uid, project, now) || (!!project.orgId && isOrgSteward(uid, org));
  return !!media && media.uploaderUid === uid;
};

/** An org document's people stay inside the org unless its owner or an IT Admin deliberately says otherwise. */
export function orgInviteDecision(input: {
  callerUid: string;
  org: DocOrg | null;
  activeMemberUids: Set<string>;
  invitees: string[];
  outsideConfirmed: boolean;
}): { ok: boolean; outside: string[]; canOverride?: boolean } {
  const outside = input.invitees.filter(u => !input.activeMemberUids.has(u) && !isOrgSteward(u, input.org));
  if (!outside.length) return { ok: true, outside };
  const canOverride = isOrgSteward(input.callerUid, input.org);
  if (canOverride && input.outsideConfirmed) return { ok: true, outside };
  return { ok: false, outside, canOverride };
}

/** Who keeps an org's document when its author's seat ends. The org's owner, else the first IT Admin still seated. */
export function custodyHeir(org: DocOrg | null, active: Set<string>, leaver: string): string | null {
  const seated = (u: string | undefined) => !!u && u !== leaver && (active.has(u) || u === org?.creatorId);
  if (seated(org?.creatorId)) return org!.creatorId!;
  return (org?.itAdminUids || []).find(seated) || null;
}

/** The project after its owner left the org: the heir owns it and the leaver and everyone departed is out. */
export function afterCustodyTransfer<T extends DocProject & { names?: Record<string, string>; photos?: Record<string, string> }>(p: T, heir: string, leaving: string[], heirName: string): T & { custodyFromUid: string } {
  const without = <V,>(m: Record<string, V> = {}) => Object.fromEntries(Object.entries(m).filter(([u]) => !leaving.includes(u))) as Record<string, V>;
  return {
    ...p,
    ownerId: heir,
    custodyFromUid: p.ownerId,
    members: { ...without(p.members), [heir]: 'owner' },
    memberIds: [...new Set([...(p.memberIds || []).filter(u => !leaving.includes(u)), heir])],
    names: { ...without(p.names), [heir]: heirName },
    photos: without(p.photos),
    expires: without(p.expires),
  };
}

export const expiredMembers = (p: DocProject, now = Date.now()): string[] =>
  Object.entries(p.expires || {}).filter(([u, at]) => at && at <= now && u !== p.ownerId && (p.memberIds || []).includes(u)).map(([u]) => u);

export const nextExpiryOf = (expires: Record<string, number> | undefined): number =>
  Math.min(...Object.values(expires || {}).filter(Boolean), Number.MAX_SAFE_INTEGER);

// What a browser may render from our own origin. HTML, SVG, XML and script are never inline: a member's upload must
// not be able to run as us. Everything else downloads.
const INLINE_OK = /^(image\/(png|jpe?g|pjpeg|gif|webp|avif|bmp|heic|heif|tiff|jxl)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf)$/i;
export const isInlineSafeMime = (mime: string | null | undefined): boolean => INLINE_OK.test(String(mime || '').split(';')[0].trim());

export function safeMediaHeaders(mime: string | null | undefined, filename: string): Record<string, string> {
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  const inline = isInlineSafeMime(type);
  return {
    'Content-Type': inline ? type : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename || 'file')}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    Vary: 'Cookie, Authorization',
  };
}

const AUDIT_LABELS = new Set(['opened', 'exported', 'threat_blocked', 'access_ended_copy_removed']);
/** Events a client may report. Sharing, revoking and deleting are written by the server as they happen. */
export const isClientAuditAction = (a: unknown): boolean => typeof a === 'string' && AUDIT_LABELS.has(a);

/** Every project media path a document refers to, grouped by project. */
export function mediaPidsIn(json: string): string[] {
  const out = new Set<string>();
  for (const m of json.matchAll(/\/api\/tela-media\/([^/"\\\s]+)\//g)) { try { out.add(decodeURIComponent(m[1])); } catch { /* not ours */ } }
  return [...out];
}
