import { doc, getDoc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { approxDocBytes, SPORTS_MAX_DOC_BYTES } from './sportsSlim';

export type SportsKnowledgeCollection =
  | 'sports_league_teams'
  | 'sports_league_news'
  | 'sports_league_scores'
  | 'sports_league_standings'
  | 'sports_league_leaders'
  | 'sports_team_pages'
  | 'sports_team_rosters'
  | 'sports_team_schedules'
  | 'sports_game_event_research'
  | 'sports_player_profiles'
  | 'sports_player_stats'
  | 'sports_team_stats'
  | 'sports_wikipedia_summaries'
  | 'sports_source_registry'
  | 'sports_ingestion_runs';

export interface SportsSourceAttribution {
  provider: 'ESPN' | 'TheSportsDB' | 'Wikipedia' | 'RSS' | 'Plajah' | 'PublicSource';
  url: string;
  label: string;
  retrievedAt: number;
  licenseNote?: string;
}

export interface SportsKnowledgeEnvelope<T> {
  id: string;
  data: T;
  sources: SportsSourceAttribution[];
  tags: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  firstSeenAt: number;
  lastVerifiedAt: number;
  updatedAt: number;
  version: number;
}

const DEFAULT_MAX_AGE = 1000 * 60 * 60 * 24 * 365 * 20;

export const makeSportsDocId = (...parts: Array<string | number | undefined | null>) =>
  parts
    .filter(part => part !== undefined && part !== null && String(part).trim() !== '')
    .map(part => String(part).toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, ''))
    .join('__') || 'unknown';

const removeUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(removeUndefined) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    ) as T;
  }
  return value;
};

export async function readSportsKnowledge<T>(
  collectionName: SportsKnowledgeCollection,
  id: string,
  maxAgeMs = DEFAULT_MAX_AGE,
): Promise<SportsKnowledgeEnvelope<T> | null> {
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    if (!snap.exists()) return null;
    const envelope = snap.data() as SportsKnowledgeEnvelope<T>;
    if (Date.now() - (envelope.lastVerifiedAt || envelope.updatedAt || 0) > maxAgeMs) return null;
    return envelope;
  } catch {
    return null;
  }
}

export async function writeSportsKnowledge<T>(
  collectionName: SportsKnowledgeCollection,
  id: string,
  data: T,
  sources: readonly SportsSourceAttribution[],
  tags: string[] = [],
  confidence: SportsKnowledgeEnvelope<T>['confidence'] = 'MEDIUM',
): Promise<void> {
  try {
    const existing = await readSportsKnowledge<T>(collectionName, id);
    const now = Date.now();
    const envelope: SportsKnowledgeEnvelope<T> = {
      id,
      data,
      sources: [...sources],
      tags,
      confidence,
      firstSeenAt: existing?.firstSeenAt || now,
      lastVerifiedAt: now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };
    const clean = removeUndefined(envelope);

    // SIZE GUARD. Firestore rejects anything over 1,048,576 bytes, and that
    // rejection used to land in the catch below as one more "write skipped"
    // among hundreds of permission warnings — so entire NBA schedules silently
    // never stored while the job reported success. Checking before the write
    // makes it loud, names the document, and says how far over it is.
    //
    // This is a backstop, not the fix: a payload arriving here oversized means
    // something upstream is storing a raw API response. Slim it at the source
    // (see services/sportsSlim.ts) rather than raising this ceiling.
    const bytes = approxDocBytes(clean);
    if (bytes > SPORTS_MAX_DOC_BYTES) {
      console.error(
        `[sportsKnowledge] REFUSED oversized write: ${collectionName}/${id} is ~${(bytes / 1024).toFixed(0)} KB ` +
        `(limit ${(SPORTS_MAX_DOC_BYTES / 1024).toFixed(0)} KB). Something upstream is storing a raw API payload — ` +
        `project it down in services/sportsSlim.ts instead of storing it whole.`,
      );
      return;
    }

    await setDoc(doc(db, collectionName, id), clean, { merge: true });
  } catch (error) {
    console.warn('[sportsKnowledge] write skipped:', collectionName, id, error);
  }
}

export async function writeSportsKnowledgeBatch<T extends { id?: string }>(
  collectionName: SportsKnowledgeCollection,
  rows: T[],
  idForRow: (row: T, index: number) => string,
  sources: readonly SportsSourceAttribution[],
  tags: string[] = [],
  confidence: SportsKnowledgeEnvelope<T>['confidence'] = 'MEDIUM',
): Promise<void> {
  if (!rows.length) return;
  try {
    const now = Date.now();
    for (let start = 0; start < rows.length; start += 400) {
      const batch = writeBatch(db);
      let queued = 0;
      rows.slice(start, start + 400).forEach((row, index) => {
        const id = idForRow(row, start + index);
        const ref = doc(collection(db, collectionName), id);
        const payload = removeUndefined({
          id,
          data: row,
          sources: [...sources],
          tags,
          confidence,
          firstSeenAt: now,
          lastVerifiedAt: now,
          updatedAt: now,
          version: 1,
        });
        // One oversized row fails the ENTIRE batch, taking every good row in the
        // chunk with it — so a single bloated team could wipe out a whole league.
        const bytes = approxDocBytes(payload);
        if (bytes > SPORTS_MAX_DOC_BYTES) {
          console.error(
            `[sportsKnowledge] REFUSED oversized row: ${collectionName}/${id} is ~${(bytes / 1024).toFixed(0)} KB — ` +
            `dropping it so the rest of the batch still commits.`,
          );
          return;
        }
        batch.set(ref, payload, { merge: true });
        queued += 1;
      });
      if (queued > 0) await batch.commit();
    }
  } catch (error) {
    console.warn('[sportsKnowledge] batch write skipped:', collectionName, error);
  }
}

export const sportsSource = (
  provider: SportsSourceAttribution['provider'],
  url: string,
  label: string,
  licenseNote = 'Public web data; stored with attribution for Plajah Sports indexing and analysis.',
): SportsSourceAttribution => ({
  provider,
  url,
  label,
  retrievedAt: Date.now(),
  licenseNote,
});

export const SPORTS_INTELLIGENCE_DOMAINS = [
  {
    id: 'sports_business',
    label: 'Sports Business',
    description: 'Franchise valuation, sponsorships, media rights, labor economics, ownership, and league financial strategy.',
    sources: [
      sportsSource('PublicSource', 'https://www.sportico.com/', 'Sportico'),
      sportsSource('PublicSource', 'https://www.sportsbusinessjournal.com/', 'Sports Business Journal'),
      sportsSource('PublicSource', 'https://www.forbes.com/sportsmoney/', 'Forbes SportsMoney'),
    ],
  },
  {
    id: 'tickets_attendance',
    label: 'Tickets & Attendance',
    description: 'Ticket markets, attendance trends, venue economics, pricing, and fan demand signals.',
    sources: [
      sportsSource('PublicSource', 'https://www.ticketmaster.com/', 'Ticketmaster public event listings'),
      sportsSource('PublicSource', 'https://seatgeek.com/', 'SeatGeek public event listings'),
      sportsSource('PublicSource', 'https://www.baseball-reference.com/leagues/majors/attendance.shtml', 'Baseball Reference attendance tables'),
    ],
  },
  {
    id: 'sports_medicine',
    label: 'Sports Medicine',
    description: 'Injuries, rehabilitation, performance science, concussion research, load management, and athlete health.',
    sources: [
      sportsSource('PublicSource', 'https://bjsm.bmj.com/', 'British Journal of Sports Medicine'),
      sportsSource('PublicSource', 'https://journals.lww.com/acsm-msse/pages/default.aspx', 'Medicine & Science in Sports & Exercise'),
      sportsSource('PublicSource', 'https://www.ncbi.nlm.nih.gov/pmc/?term=sports+medicine', 'PubMed Central sports medicine search'),
    ],
  },
  {
    id: 'sports_technology',
    label: 'Sports Technology',
    description: 'Wearables, tracking systems, analytics platforms, broadcast technology, training tools, and fan experience tech.',
    sources: [
      sportsSource('PublicSource', 'https://www.sporttechie.com/', 'SportTechie'),
      sportsSource('PublicSource', 'https://www.catapult.com/blog', 'Catapult Sports technology blog'),
      sportsSource('PublicSource', 'https://www.statsperform.com/resource-center/', 'Stats Perform resource center'),
    ],
  },
] as const;

export async function seedSportsSourceRegistry(): Promise<void> {
  await Promise.all(SPORTS_INTELLIGENCE_DOMAINS.map(domain =>
    writeSportsKnowledge('sports_source_registry', domain.id, domain, domain.sources, ['sports', 'source_registry', domain.id], 'HIGH')
  ));
}
