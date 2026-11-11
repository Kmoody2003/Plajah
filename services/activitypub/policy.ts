// ActivityPub policy — who may have a federated identity, and which posts may leave Plajah. PURE.
//
// Rules (owner's, not negotiable in code paths):
//   • Children never federate: isChild / accountType CHILD / under-18 by birth year / a student account whose age
//     is not known to be adult / any managed child lifecycle state. The switch is not even offered.
//   • Managed identities (employee seats, pre-provisioned members) never federate — nobody personally consented.
//   • Private accounts and private orgs never federate.
//   • Federation is OFF until someone turns it on. Church / faith / nonprofit / cultural orgs get an extra notice.
//   • A post federates only if the Bluesky planner would share it (no locked/private/members-only/org-internal),
//     AND it is plainly public (audience PUBLIC or unset, not a circle/private collection, not an ephemeral Today
//     clip, not a wall post on someone else's profile, not a student/school-community post, not a repost).

import { planBlueskyVersion, type NativePostLike } from '../fediverse/blueskyVersion';

export type Eligibility = { eligible: true; sensitiveOrg: boolean; notice?: string; reason?: undefined } | { eligible: false; reason: string };

const SENSITIVE_ORG_TYPES = new Set(['CHURCH', 'RELIGIOUS', 'NONPROFIT', 'CULTURAL']);

export function isChildAccount(user: Record<string, any>, nowYear: number = new Date().getFullYear()): boolean {
  if (user.isChild === true) return true;
  if (user.accountType === 'CHILD') return true;
  if (user.guardianUid || user.childState || user.provisionedByTeacherUid) return true;
  const by = Number(user.birthYear);
  const hasBirthYear = Number.isFinite(by) && by > 1900;
  // Born in nowYear-18 could still be 17 today; only call it adult when certainly 18+.
  if (hasBirthYear && nowYear - by <= 18) return true;
  if (user.accountType === 'STUDENT' && !hasBirthYear) return true;
  return false;
}

export function userEligibility(user: Record<string, any> | null | undefined, nowYear?: number): Eligibility {
  if (!user) return { eligible: false, reason: 'Account not found.' };
  if (isChildAccount(user, nowYear)) return { eligible: false, reason: "Accounts for young people stay on Plajah — they can't be followed from other networks." };
  if (user.isEmployee || user.isProvisioned || user.accountType === 'EMPLOYEE') {
    return { eligible: false, reason: 'Managed work and member seats stay on Plajah.' };
  }
  if (user.isPrivate) return { eligible: false, reason: 'Private accounts stay on Plajah. Make your account public to turn this on.' };
  if (user.deleted || user.isDeleted || user.disabled) return { eligible: false, reason: 'This account is not active.' };
  return { eligible: true, sensitiveOrg: false };
}

export function orgEligibility(org: Record<string, any> | null | undefined): Eligibility {
  if (!org) return { eligible: false, reason: 'Organization not found.' };
  if (org.isPrivate) return { eligible: false, reason: 'Private organizations stay on Plajah.' };
  if (org.deleted || org.isDeleted || org.archived) return { eligible: false, reason: 'This organization is not active.' };
  const sensitive = SENSITIVE_ORG_TYPES.has(String(org.orgType || '').toUpperCase());
  return {
    eligible: true,
    sensitiveOrg: sensitive,
    notice: sensitive
      ? 'Only posts marked Public are shared. Member, department and internal posts never leave Plajah — but anything public becomes followable from other networks.'
      : undefined,
  };
}

/** Same notice every switch shows. */
export const DELETION_NOTICE =
  'Other networks keep their own copies. When you delete a post or turn this off, Plajah asks them to remove it, but some servers may not.';

/** Can the person with `uid` flip the switch for this org? */
export function canManageOrg(org: Record<string, any> | null | undefined, uid: string): boolean {
  if (!org || !uid) return false;
  if (org.creatorId === uid) return true;
  return Array.isArray(org.admins) && org.admins.includes(uid);
}

export function toPlanInput(post: Record<string, any>): NativePostLike {
  return {
    text: String(post.text ?? ''),
    authorName: post.authorName,
    media: Array.isArray(post.media) ? post.media : [],
    poll: post.poll, dataViz: post.dataViz, albumEmbed: post.albumEmbed,
    assetEmbed: post.assetEmbed ?? null,
    sanctuaryGate: post.sanctuaryGate, exclusive: post.exclusive,
    isPublic: post.isPublic, authorIsPrivate: post.authorIsPrivate, orgAudience: post.orgAudience,
    contentLabels: post.contentLabels,
    postMode: post.postMode, threadChunks: post.threadChunks,
    quotedPost: post.quotedPost ?? null,
    replyAudience: post.replyAudience,
  };
}

export type PostVerdict = { ok: true; reason?: undefined } | { ok: false; reason: string };

/** May this stored post (from `posts`) go out as an ActivityPub Note? */
export function judgePost(post: Record<string, any> | null | undefined, postUrl: string, now: number = Date.now()): PostVerdict {
  if (!post) return { ok: false, reason: 'not-found' };
  if (post.isPublic !== true) return { ok: false, reason: 'not-public' };
  if (post.audience && post.audience !== 'PUBLIC') return { ok: false, reason: 'audience' };
  if (post.sourceCollection && post.sourceCollection !== 'posts' && post.sourceCollection !== 'feed') return { ok: false, reason: 'private-collection' };
  if (Array.isArray(post.audienceUids) && post.audienceUids.length) return { ok: false, reason: 'audience' };
  if (post.unlisted || post.visibility === 'UNLISTED' || post.visibility === 'PRIVATE') return { ok: false, reason: 'unlisted' };
  if (post.isToday || (Number(post.expiresAt) > 0)) return { ok: false, reason: 'ephemeral' };
  if (post.repostOf) return { ok: false, reason: 'repost' };
  if (post.targetUserId && post.targetUserId !== post.authorId) return { ok: false, reason: 'wall-post' };
  if (post.isEduPost || post.eduRole === 'STUDENT') return { ok: false, reason: 'school-community' };
  if (post.orgDepartmentId || (Array.isArray(post.orgDepartmentIds) && post.orgDepartmentIds.length)
    || (Array.isArray(post.orgGroupIds) && post.orgGroupIds.length) || (Array.isArray(post.orgRosterGroups) && post.orgRosterGroups.length)
    || post.orgRoomId) return { ok: false, reason: 'org-internal' };
  if (post.deleted || post.isDeleted || post.removed || post.moderationHold) return { ok: false, reason: 'removed' };
  if (post.scheduledFor && Number(post.scheduledFor) > now) return { ok: false, reason: 'scheduled' };
  const plan = planBlueskyVersion(toPlanInput(post), { postUrl });
  if (plan.blocked) return { ok: false, reason: plan.blocked };
  return { ok: true };
}

/** Which local actor (if any) a post belongs to. Org posts federate from the org, everything else from the author. */
export function postActorRef(post: Record<string, any>): { kind: 'user' | 'org'; id: string } | null {
  if (post.authorIsOrg && typeof post.authorOrgId === 'string' && post.authorOrgId) return { kind: 'org', id: post.authorOrgId };
  if (typeof post.authorId === 'string' && post.authorId && !post.authorIsOrg) return { kind: 'user', id: post.authorId };
  return null;
}

/** A remote reply may be stored only if the post accepts replies from anyone. */
export function acceptsRemoteReplies(post: Record<string, any>): boolean {
  const a = String(post.replyAudience ?? 'everyone').toLowerCase();
  return a === 'everyone';
}

/** Domain blocklist match: exact host or any parent domain on the list. */
export function isDomainBlocked(host: string, blocked: Iterable<string>): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const set = blocked instanceof Set ? blocked as Set<string> : new Set([...blocked].map(d => d.toLowerCase()));
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (set.has(parts.slice(i).join('.'))) return true;
  return false;
}
