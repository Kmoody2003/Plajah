// audienceCore — Facebook-style "who can see this" (pure, no Firebase; unit-testable).
//
// Presets:  Public · Followers · Close Friends · Family · Colleagues · Only me · Custom
// Custom = any combination: share with (followers and/or any lists and/or specific people),
//          except (any lists and/or specific people). The account-wide "Hidden from" list is
//          always excluded, whatever the audience.
//
// Where a post lands (rules enforce each):
//   posts         Public, on a public account, with nobody hidden — world-readable
//   private_posts plain Followers (no exceptions) — readable by anyone who follows (live)
//   circle_posts  everything else — readable only by the uids in `audienceUids`, which the
//                 owner's client keeps current (services/audienceService syncMyAudiences)

export type AudienceListId = 'closeFriends' | 'family' | 'colleagues';
export const AUDIENCE_LISTS: AudienceListId[] = ['closeFriends', 'family', 'colleagues'];
export const LIST_LABEL: Record<AudienceListId, string> = { closeFriends: 'Close Friends', family: 'Family', colleagues: 'Colleagues' };

export type AudiencePreset = 'PUBLIC' | 'FOLLOWERS' | 'CLOSE_FRIENDS' | 'FAMILY' | 'COLLEAGUES' | 'ONLY_ME' | 'CUSTOM';
export const PRESET_LABEL: Record<AudiencePreset, string> = {
  PUBLIC: 'Public', FOLLOWERS: 'Followers', CLOSE_FRIENDS: 'Close Friends', FAMILY: 'Family',
  COLLEAGUES: 'Colleagues', ONLY_ME: 'Only me', CUSTOM: 'Custom',
};
const PRESET_LIST: Partial<Record<AudiencePreset, AudienceListId>> = { CLOSE_FRIENDS: 'closeFriends', FAMILY: 'family', COLLEAGUES: 'colleagues' };

export interface CustomAudience {
  followers: boolean;
  lists: AudienceListId[];
  people: string[];
  exceptLists: AudienceListId[];
  exceptPeople: string[];
}
export interface AudienceSpec { preset: AudiencePreset; custom?: CustomAudience }

export interface AudienceLists { closeFriends: string[]; family: string[]; colleagues: string[]; hiddenFrom: string[] }
export const EMPTY_LISTS: AudienceLists = { closeFriends: [], family: [], colleagues: [], hiddenFrom: [] };

export const MAX_AUDIENCE = 5000;
export const PUBLIC_SPEC: AudienceSpec = { preset: 'PUBLIC' };
export const FOLLOWERS_SPEC: AudienceSpec = { preset: 'FOLLOWERS' };

const uniq = <T,>(a: T[]) => [...new Set(a)];

/** Every preset as one shape: who's in, who's out. */
export function normalize(spec: AudienceSpec): CustomAudience & { public: boolean } {
  const empty = { followers: false, lists: [] as AudienceListId[], people: [] as string[], exceptLists: [] as AudienceListId[], exceptPeople: [] as string[] };
  switch (spec.preset) {
    case 'PUBLIC': return { ...empty, public: true };
    case 'FOLLOWERS': return { ...empty, followers: true, public: false };
    case 'ONLY_ME': return { ...empty, public: false };
    case 'CUSTOM': {
      const c = spec.custom || empty;
      return {
        public: false,
        followers: !!c.followers,
        lists: uniq((c.lists || []).filter(l => AUDIENCE_LISTS.includes(l))),
        people: uniq(c.people || []),
        exceptLists: uniq((c.exceptLists || []).filter(l => AUDIENCE_LISTS.includes(l))),
        exceptPeople: uniq(c.exceptPeople || []),
      };
    }
    default: return { ...empty, lists: [PRESET_LIST[spec.preset]!], public: false };
  }
}

export type PostCollectionForAudience = 'posts' | 'private_posts' | 'circle_posts';

export interface ResolvedAudience {
  /** What was actually applied (a private account's Public becomes Followers, etc.). */
  spec: AudienceSpec;
  collection: PostCollectionForAudience;
  /** Viewers, for circle_posts / stories. Absent for public and live-followers posts. */
  audienceUids?: string[];
  /** List ids (+ 'followers') the audience depends on — the owner re-syncs these docs when they change. */
  audienceLists?: string[];
  /** Why the audience was narrowed, for UI copy. */
  narrowed?: 'private' | 'hidden';
}

/**
 * Resolve a spec for an owner. Pass `followers` when the result goes to circle_posts and the
 * spec includes followers (callers resolve once without, then again with them if needed —
 * see needsFollowerList). `materializeFollowers` = true for stories (always an explicit list).
 */
export function resolveAudience(
  spec: AudienceSpec,
  ctx: { ownerId: string; isPrivate: boolean; lists: AudienceLists; followers?: string[]; materializeFollowers?: boolean },
): ResolvedAudience {
  const hidden = new Set(ctx.lists.hiddenFrom);
  let applied = spec;
  let narrowed: ResolvedAudience['narrowed'];
  if (spec.preset === 'PUBLIC' && ctx.isPrivate) { applied = FOLLOWERS_SPEC; narrowed = 'private'; }
  else if (spec.preset === 'PUBLIC' && hidden.size) { applied = FOLLOWERS_SPEC; narrowed = 'hidden'; }
  const n = normalize(applied);
  if (n.public) return { spec: applied, collection: 'posts' };

  const pureFollowers = n.followers && !n.lists.length && !n.people.length && !n.exceptLists.length && !n.exceptPeople.length;
  if (pureFollowers && !hidden.size && !ctx.materializeFollowers) {
    return { spec: applied, collection: 'private_posts', ...(narrowed ? { narrowed } : {}) };
  }

  const out = new Set<string>([...hidden, ...n.exceptPeople, ctx.ownerId]);
  n.exceptLists.forEach(l => ctx.lists[l].forEach(u => out.add(u)));
  const inc: string[] = [
    ...(n.followers ? ctx.followers || [] : []),
    ...n.lists.flatMap(l => ctx.lists[l]),
    ...n.people,
  ];
  const audienceUids = uniq(inc).filter(u => u && !out.has(u)).slice(0, MAX_AUDIENCE);
  const audienceLists = uniq([...(n.followers ? ['followers'] : []), ...n.lists, ...n.exceptLists, 'hiddenFrom']);
  return { spec: applied, collection: 'circle_posts', audienceUids, audienceLists, ...(narrowed ? { narrowed } : {}) };
}

/** True when this resolution must be redone with the owner's follower list. */
export function needsFollowerList(r: ResolvedAudience): boolean {
  return r.collection === 'circle_posts' && !!r.audienceLists?.includes('followers');
}

/** One-line summary, e.g. "Followers except Colleagues" or "Family, Close Friends + 2 people". */
export function describeAudience(spec: AudienceSpec): string {
  if (spec.preset !== 'CUSTOM') return PRESET_LABEL[spec.preset];
  const n = normalize(spec);
  const ins = [...(n.followers ? ['Followers'] : []), ...n.lists.map(l => LIST_LABEL[l])];
  if (n.people.length) ins.push(`${n.people.length} ${n.people.length === 1 ? 'person' : 'people'}`);
  const outs = [...n.exceptLists.map(l => LIST_LABEL[l])];
  if (n.exceptPeople.length) outs.push(`${n.exceptPeople.length} ${n.exceptPeople.length === 1 ? 'person' : 'people'}`);
  const head = ins.length ? ins.join(', ') : 'Only me';
  return outs.length ? `${head} except ${outs.join(', ')}` : head;
}

/** A stored spec read back from Firestore (may be partial or from an older shape). */
export function parseSpec(raw: any, fallback: AudienceSpec = PUBLIC_SPEC): AudienceSpec {
  if (!raw || typeof raw !== 'object' || !(raw.preset in PRESET_LABEL)) return fallback;
  if (raw.preset !== 'CUSTOM') return { preset: raw.preset };
  const { followers, lists, people, exceptLists, exceptPeople } = normalize(raw as AudienceSpec);
  return { preset: 'CUSTOM', custom: { followers, lists, people, exceptLists, exceptPeople } };
}
