// statCardService — builds the generic StatCardData that the StatCard renderer + image exporter use.
//
// One builder per subject kind (profile today; world/character/scene next) all produce the SAME
// StatCardData shape, so the card component and the html2canvas exporter never need to know what the
// card is "of". Everything is read off existing data (profile.totalPoints, the user's albums by
// type, unlocked achievements) — no new collections.

import type { Album, StatCardData, StatCardCategoryRow, StatCardSocial, UserProfile, Organization, OrgMembership } from '../types';
import { fetchUserProfile, fetchUserContent } from './backendService';
import { fetchUserAchievements } from './achievementService';

export function profileShareUrl(uid: string): string {
  const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://plajah.com';
  return `${origin}/profile/${encodeURIComponent(uid)}`;
}

/** Achievement score = sum of pointsValue across a user's UNLOCKED achievements. */
export function computeAchievementScore(achievements: any[]): { score: number; unlocked: number } {
  const unlockedList = (achievements || []).filter(a => a?.unlockedAt || a?.isUnlocked || a?.unlocked);
  const score = unlockedList.reduce((s, a) => s + (a?.achievement?.pointsValue ?? a?.pointsValue ?? a?.points ?? 0), 0);
  return { score, unlocked: unlockedList.length };
}

const catRow = (key: string, label: string, items: Album[]): StatCardCategoryRow => ({
  key, label,
  count: items.length,
  thumbnails: items.slice(0, 4).map(a => a.coverImage || (a as any).thumbnailUrl || '').filter(Boolean),
});

/** Music / Film-TV / Book rows from a user's albums (content is already newest-first). */
export function buildCategoryRows(content: Album[]): StatCardCategoryRow[] {
  const music = content.filter(a => a.type === 'MUSIC');
  const film  = content.filter(a => a.type === 'VIDEO');
  const books = content.filter(a => a.type === 'BOOK');
  return [
    catRow('MUSIC', 'Music', music),
    catRow('FILM', 'Film & TV', film),
    catRow('BOOK', 'Books', books),
  ];
}

export function buildProfileSocials(profile: UserProfile): StatCardSocial[] {
  const out: StatCardSocial[] = [];
  const s = profile.socialLinks || {};
  const push = (platform: string, url?: string) => { if (url) out.push({ platform, url: url.startsWith('http') ? url : `https://${url}` }); };
  push('X', profile.xUrl || (profile.xHandle ? `https://x.com/${String(profile.xHandle).replace(/^@/, '')}` : undefined) || (s as any).twitter);
  push('Instagram', (s as any).instagram && (String((s as any).instagram).startsWith('http') ? (s as any).instagram : `https://instagram.com/${String((s as any).instagram).replace(/^@/, '')}`));
  push('Spotify', (s as any).spotify);
  push('YouTube', (s as any).youtube);
  push('Website', (s as any).website);
  return out;
}

/**
 * Build a profile's stat card from already-loaded data (sync — the modal fetches then calls this).
 */
export function buildProfileStatCard(
  profile: UserProfile,
  content: Album[],
  achievementScore: number,
): StatCardData {
  const cfg = profile.statCardConfig || {};
  return {
    kind: 'PROFILE',
    id: profile.uid,
    title: profile.displayName || 'Creator',
    subtitle: profile.tagline || profile.bio?.slice(0, 60) || undefined,
    heroImage: cfg.heroImage || profile.photoURL || undefined,
    coverImage: cfg.coverImage || profile.coverArt || profile.headerImage || undefined,
    accent: cfg.accent,
    verified: !!(profile.isVerified || (profile as any).verified),
    stats: [
      { label: 'Achievement', value: achievementScore, hint: 'Score' },
      { label: 'Points', value: profile.totalPoints ?? 0, hint: 'Plajah' },
      { label: 'Followers', value: profile.followerCount ?? 0 },
    ],
    categories: buildCategoryRows(content),
    qrUrl: profileShareUrl(profile.uid),
    shareUrl: profileShareUrl(profile.uid),
    socials: buildProfileSocials(profile),
    merch: { label: 'Merch Store', ownerId: profile.uid },
    footnote: 'plajah.com',
  };
}

/**
 * Build an employee WORK BADGE from a membership + its org. Same StatCardData shape as any card,
 * but the WORK_BADGE variant (blue/yellow) with a rectangular avatar so it reads as a work ID.
 */
export function buildEmployeeBadge(membership: OrgMembership, org: Organization): StatCardData {
  const roleLabel =
    (org.roleDefs || []).find(r => r.key === membership.roleKey)?.label ||
    membership.title || membership.role;
  const sinceYear = membership.joinedAt ? new Date(membership.joinedAt).getFullYear() : undefined;
  const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://plajah.com';
  const orgUrl = `${origin}/org/${encodeURIComponent(org.handle || org.id)}`;
  return {
    kind: 'EMPLOYEE',
    variant: 'WORK_BADGE',
    avatarShape: 'RECT',
    id: `${org.id}:${membership.userId}`,
    title: membership.displayName || 'Employee',
    subtitle: `${roleLabel} · ${org.name}`,
    heroImage: membership.photoUrl || undefined,
    coverImage: org.coverUrl || undefined,
    accent: org.accentColor,
    verified: true, // an issued badge is official by definition
    stats: [
      { label: 'Role', value: roleLabel },
      ...(sinceYear ? [{ label: 'Since', value: sinceYear }] : []),
      { label: 'Team', value: org.name },
    ],
    categories: [],
    qrUrl: orgUrl,
    shareUrl: orgUrl,
    footnote: org.name,
  };
}

/** One-call async load: fetch the profile's data and build its stat card. */
export async function loadProfileStatCard(uid: string, seedProfile?: UserProfile, seedContent?: Album[]): Promise<StatCardData> {
  const [profile, content, achievements] = await Promise.all([
    seedProfile ? Promise.resolve(seedProfile) : fetchUserProfile(uid),
    seedContent ? Promise.resolve(seedContent) : fetchUserContent(uid).catch(() => [] as Album[]),
    fetchUserAchievements(uid).catch(() => [] as any[]),
  ]);
  if (!profile) throw new Error('Profile not found');
  const { score } = computeAchievementScore(achievements);
  return buildProfileStatCard(profile as UserProfile, (content || []) as Album[], score);
}
