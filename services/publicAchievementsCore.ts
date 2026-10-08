/**
 * publicAchievementsCore — PURE helpers for the opt-in public achievement showcase.
 * Firebase side: services/publicAchievementsService.ts. Rules: `publicAchievements` in firestore.rules.
 *
 * Decision (why top-level, not users/{uid}/publicAchievements): the feed reads "recent achievements of the
 * people I follow", which is `where(userId in [≤10]) orderBy(earnedAt desc)` on ONE collection. A per-user
 * subcollection would need a collectionGroup query + a collection-group index and cannot be rule-bounded as
 * cheaply. The doc id `${uid}_${achievementId}` makes publishing idempotent (set = upsert, no duplicates).
 */

/** Achievements that must never be broadcast (embargoed / system-internal). */
const NEVER_SHARE_TRIGGER = /^KITH_/;

export interface AchievementLike {
  id: string; title?: string; description?: string; icon?: string; backgroundColor?: string; category?: string;
  pointsValue?: number; points?: number; triggerType?: string;
}

/** Celebratory milestone = a real, titled, non-embargoed catalog achievement. */
export function isShareableAchievement(a: AchievementLike | null | undefined): boolean {
  if (!a || !a.id || !a.title) return false;
  if (a.triggerType && NEVER_SHARE_TRIGGER.test(a.triggerType)) return false;
  return true;
}

/** Default ON unless the owner switched it off; private accounts never publish. */
export function sharingEnabled(profile: { shareAchievements?: boolean; isPrivate?: boolean } | null | undefined): boolean {
  return !!profile && profile.shareAchievements !== false && profile.isPrivate !== true;
}

export function publicAchievementId(uid: string, achievementId: string): string {
  return `${uid}_${achievementId}`;
}

/** The exact (rules-validated) field set. No undefined values — Firestore throws on them. */
export function buildPublicAchievementDoc(uid: string, a: AchievementLike, earnedAt: number): Record<string, string | number> {
  const doc: Record<string, string | number> = {
    userId: uid, achievementId: a.id, title: String(a.title ?? ''), description: String(a.description ?? ''), earnedAt,
  };
  if (a.icon) doc.icon = String(a.icon).slice(0, 63);
  if (a.backgroundColor) doc.backgroundColor = String(a.backgroundColor).slice(0, 31);
  if (a.category) doc.category = String(a.category);
  const pts = a.pointsValue ?? a.points;
  if (typeof pts === 'number' && Number.isFinite(pts)) doc.pointsValue = pts;
  return doc;
}

/**
 * Which of a user's unlocked achievements still need publishing, newest first, capped.
 * `unlocked`: {achievementId, unlockedAt}; `published`: ids already in publicAchievements.
 */
export function planBackfill(
  unlocked: readonly { achievementId: string; unlockedAt?: number }[],
  catalog: ReadonlyMap<string, AchievementLike>,
  publishedAchievementIds: ReadonlySet<string>,
  max = 40,
): { achievement: AchievementLike; earnedAt: number }[] {
  return unlocked
    .filter(u => u.unlockedAt && !publishedAchievementIds.has(u.achievementId))
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
    .flatMap(u => {
      const a = catalog.get(u.achievementId);
      return isShareableAchievement(a) ? [{ achievement: a as AchievementLike, earnedAt: u.unlockedAt as number }] : [];
    })
    .slice(0, max);
}
