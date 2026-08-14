import {
  auth, fetchFollowing, fetchFollowers, fetchUserClubs, fetchClubMembers, fetchUserProfiles,
} from './backendService';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Circle. A personal CRM that never asks you to build it.
//
// Dex and Monica lose most of their users at the import step: a relationship
// tool is only as good as the data you were willing to type into it. Plajah
// already holds the graph, so this one arrives populated.
//
// WHAT IS REAL HERE, AND WHAT IS NOT:
// Every "reason" below is a relationship the platform can actually observe —
// a mutual follow, a shared club. There is deliberately NO "you haven't spoken
// in four months", because message recency is not reachable from a client-side
// query today. That line was in the design pitch and it is a good line, but
// inventing it from a proxy signal would put a false claim about someone's
// friendships on screen. It stays out until DM recency is genuinely readable.
//
// Not to be confused with "your corner" (services/oraCorner), which is the
// accountability group on the Care rail.
// ─────────────────────────────────────────────────────────────────────────

export interface CircleContact {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  /** Observable relationships, e.g. "Mutual follow", "Together in Late Rooms". */
  reasons: string[];
  /** More shared context ranks higher — a bandmate outranks a mutual follow. */
  weight: number;
}

export interface CircleResult {
  contacts: CircleContact[];
  /** True when a source could not be read — shown as incomplete, never as empty. */
  partial: boolean;
}

/** Assemble the signed-in user's people from relationships already on record. */
export async function assembleCircle(limit = 60): Promise<CircleResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { contacts: [], partial: true };

  let partial = false;
  const reasons = new Map<string, string[]>();
  const add = (u: string, why: string) => {
    if (!u || u === uid) return;
    const list = reasons.get(u) || [];
    if (!list.includes(why)) list.push(why);
    reasons.set(u, list);
  };

  // Mutual follows — the cheapest honest signal that two people know each other.
  try {
    const [following, followers] = await Promise.all([fetchFollowing(uid), fetchFollowers(uid)]);
    const followerSet = new Set(followers);
    for (const f of following) if (followerSet.has(f)) add(f, 'Mutual follow');
  } catch {
    partial = true;
  }

  // Clubs you are both in. Named, because "together in Late Rooms" is the kind
  // of reminder that makes a CRM worth opening.
  try {
    const clubs = await fetchUserClubs(uid);
    const perClub = await Promise.all(
      clubs.slice(0, 12).map(async (c) => {
        try { return { club: c, members: await fetchClubMembers(c.id) }; }
        catch { partial = true; return null; }
      }),
    );
    for (const entry of perClub) {
      if (!entry) continue;
      for (const m of entry.members) add(m.userId, `Together in ${entry.club.name}`);
    }
  } catch {
    partial = true;
  }

  const uids = Array.from(reasons.keys()).slice(0, limit);
  if (uids.length === 0) return { contacts: [], partial };

  let profiles: Awaited<ReturnType<typeof fetchUserProfiles>> = [];
  try {
    profiles = await fetchUserProfiles(uids);
  } catch {
    // Without names there is nothing worth rendering, so this is a partial read
    // rather than a list of anonymous ids.
    return { contacts: [], partial: true };
  }

  const contacts: CircleContact[] = profiles.map((p) => {
    const why = reasons.get(p.uid) || [];
    return {
      uid: p.uid,
      displayName: p.displayName || 'Someone',
      photoURL: p.photoURL || null,
      reasons: why,
      weight: why.length,
    };
  });

  contacts.sort((a, b) => b.weight - a.weight || a.displayName.localeCompare(b.displayName));
  return { contacts, partial };
}
