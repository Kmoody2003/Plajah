// sportsSlim — project ESPN's raw API payloads down to what we actually render.
//
// The ingestion job was storing ESPN responses VERBATIM. An ESPN schedule event
// carries the full competitor objects, venue, broadcasts, odds, tickets, leaders,
// headlines and a links table — for every one of 82 games. That put NBA team
// schedules at ~1.24 MB and team pages at ~1.6 MB, over Firestore's hard
// 1,048,576-byte document limit, so those writes failed and were swallowed by a
// catch that only logged "write skipped". The job looked like it was succeeding
// while nothing was being stored.
//
// The fix is NOT to spread the same payload across more documents — that just
// moves unbounded growth somewhere else and multiplies read cost. It is to stop
// keeping what nothing reads. Every field below was traced to an actual render
// site in components/sports/TeamPageView.tsx; anything not on these lists was
// being paid for in storage, bandwidth and quota and then thrown away.
//
// These projections are IDEMPOTENT — running one over already-slimmed data
// returns the same shape — because cached documents get re-slimmed on read.

/** Firestore's hard per-document ceiling. */
export const FIRESTORE_MAX_DOC_BYTES = 1_048_576;

/**
 * Refuse well below the ceiling. The envelope adds sources, tags and timestamps
 * on top of the payload, and a document that merely *fits* today is one upstream
 * roster change away from failing.
 */
export const SPORTS_MAX_DOC_BYTES = 800_000;

/**
 * Rough encoded size of a value. JSON length in UTF-8 bytes is not Firestore's
 * exact accounting, but it tracks it closely enough to catch a payload heading
 * for the limit, which is all this needs to do.
 */
export function approxDocBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    if (!json) return 0;
    // Cheap UTF-8 estimate without allocating a second buffer.
    return typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(json).length
      : Buffer.byteLength(json, 'utf8');
  } catch {
    return 0;                                   // cyclic or unserialisable
  }
}

/** The only team fields any card renders. */
function slimCompetitorTeam(team: any): any {
  if (!team || typeof team !== 'object') return team ?? null;
  return {
    id: team.id,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    shortDisplayName: team.shortDisplayName,
    logo: team.logo,
  };
}

function slimCompetitor(c: any): any {
  if (!c || typeof c !== 'object') return c ?? null;
  return {
    id: c.id,
    homeAway: c.homeAway,
    winner: c.winner,
    // Score arrives as a bare value on some endpoints and as
    // { value, displayValue } on others — scoreText() in the view handles both,
    // so it is passed through unchanged rather than normalised here.
    score: c.score,
    team: slimCompetitorTeam(c.team),
  };
}

function slimStatus(status: any): any {
  if (!status || typeof status !== 'object') return status ?? null;
  const t = status.type;
  return {
    type: t ? {
      state: t.state,
      completed: t.completed,
      shortDetail: t.shortDetail,
      detail: t.detail,
    } : undefined,
  };
}

/**
 * One schedule or scoreboard event.
 *
 * Only the first competition is kept: every league here is one contest per
 * event, and the view only ever reads `competitions[0]`.
 */
export function slimScheduleEvent(event: any): any {
  if (!event || typeof event !== 'object') return event ?? null;
  const comp = Array.isArray(event.competitions) ? event.competitions[0] : undefined;
  return {
    id: event.id,
    date: event.date,
    name: event.name,
    shortName: event.shortName,
    // Read as a fallback when the competition has no status of its own.
    status: slimStatus(event.status),
    competitions: comp ? [{
      id: comp.id,
      date: comp.date,
      status: slimStatus(comp.status),
      competitors: Array.isArray(comp.competitors)
        ? comp.competitors.map(slimCompetitor)
        : [],
    }] : [],
  };
}

/**
 * One news article. ESPN ships the full body, a categories tree, a links table
 * and every image rendition; the card shows a headline, a date, a byline, one
 * thumbnail and a link out.
 */
export function slimNewsArticle(article: any): any {
  if (!article || typeof article !== 'object') return article ?? null;
  const image = Array.isArray(article.images) ? article.images[0] : undefined;
  return {
    headline: article.headline,
    title: article.title,
    description: article.description,
    published: article.published,
    byline: article.byline,
    url: article.url,
    links: article.links?.web?.href ? { web: { href: article.links.web.href } } : undefined,
    images: image?.url ? [{ url: image.url }] : [],
  };
}

/**
 * The team object.
 *
 * Fetched with `enable=roster,record,stats`, so it arrives carrying the entire
 * roster and season statistics — both of which are already stored separately, in
 * `sports_team_rosters` and `sports_team_stats`. Keeping a third copy inside the
 * team page is most of why that document blew the limit.
 */
export function slimTeamCore(team: any): any {
  if (!team || typeof team !== 'object') return team ?? null;
  return {
    id: team.id,
    uid: team.uid,
    slug: team.slug,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    shortDisplayName: team.shortDisplayName,
    name: team.name,
    nickname: team.nickname,
    location: team.location,
    color: team.color,
    alternateColor: team.alternateColor,
    isActive: team.isActive,
    standingSummary: team.standingSummary,
    logos: Array.isArray(team.logos)
      ? team.logos.slice(0, 4).map((l: any) => ({ href: l?.href, width: l?.width, height: l?.height }))
      : [],
    // The record summary is small and worth keeping; its per-stat breakdown is not.
    record: team.record?.items
      ? { items: team.record.items.slice(0, 4).map((i: any) => ({ type: i?.type, summary: i?.summary, description: i?.description })) }
      : undefined,
    venue: team.venue
      ? { id: team.venue.id, fullName: team.venue.fullName, address: team.venue.address }
      : undefined,
    // Dropped on purpose: athletes, statistics, links, franchise, groups,
    // nextEvent — all either stored elsewhere or never read.
  };
}

/** Trim a roster group's athletes to the fields the roster list renders. */
export function slimRosterAthlete(a: any): any {
  if (!a || typeof a !== 'object') return a ?? null;
  return {
    id: a.id,
    fullName: a.fullName,
    displayName: a.displayName,
    shortName: a.shortName,
    jersey: a.jersey,
    position: typeof a.position === 'string'
      ? a.position
      : (a.position?.abbreviation ?? a.position?.displayName),
    height: a.height,
    displayHeight: a.displayHeight,
    weight: a.weight,
    displayWeight: a.displayWeight,
    age: a.age,
    experience: typeof a.experience === 'object' ? a.experience?.years : a.experience,
    headshot: typeof a.headshot === 'string' ? a.headshot : a.headshot?.href,
    college: typeof a.college === 'string' ? a.college : a.college?.name,
    birthPlace: a.birthPlace ? { city: a.birthPlace.city, country: a.birthPlace.country } : undefined,
  };
}
