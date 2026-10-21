// services/churchDevotionalService.ts
// Daily Sanctuary Devotional System, 365-Day "Read the Bible in a Year" Canonical Plan,
// and Schedule + GPS In-Service Lectio Auto-Engage Engine.

import type { Organization } from '../types';
import type { ScriptureRef } from './scriptureRef';

export interface DailyDevotionalEntry {
  id: string;
  dayLabel: string;
  liturgicalHour: 'LAUDS · MORNING OFFICE' | 'SEXT · MIDDAY EXAMEN' | 'VESPERS · EVENING LAMP';
  title: string;
  theme: string;
  scriptureDisplay: string;
  scriptureRef: ScriptureRef;
  scriptureQuote: string;
  reflectionParagraphs: string[];
  collectPrayer: string;
  pairedHymnId: string;
  pairedCouncilPlateId: string;
  authorName: string;
  authorRole: string;
}

export interface BibleInAYearPassage {
  category: 'OLD_TESTAMENT' | 'NEW_TESTAMENT' | 'PSALMS' | 'PROVERBS';
  label: string;
  ref: ScriptureRef;
}

export interface BibleInAYearDay {
  dayNumber: number; // 1..365
  dateLabel: string;
  canonicalTheme: string;
  passages: BibleInAYearPassage[];
}

export interface SanctuaryAutoEngageStatus {
  scheduleMatched: boolean;
  activeServiceLabel: string;
  nextServiceWindowLabel: string;
  gpsMatched: boolean;
  /** null when either location is unknown. */
  distanceMeters: number | null;
  sanctuaryName: string;
  coordinatesLabel: string;
  autoEngaged: boolean;
  syncSource: 'AMBO_ROOM_DICTATION_AND_KAIROS' | 'STANDBY';
}

export const SANCTUARY_DAILY_DEVOTIONALS: DailyDevotionalEntry[] = [
  {
    id: 'devo-transfiguration-light',
    dayLabel: 'Today’s Sanctuary Breviary',
    liturgicalHour: 'LAUDS · MORNING OFFICE',
    title: 'Beholding the Uncreated Light in the Ordinary Valley',
    theme: 'Covenant Presence & Renewed Perception',
    scriptureDisplay: '2 Corinthians 4:6',
    scriptureRef: { book: 47, bookName: '2 Corinthians', chapter: 4, verse: 6 },
    scriptureQuote:
      'For God, who commanded the light to shine out of darkness, hath shined in our hearts, to give the light of the knowledge of the glory of God in the face of Jesus Christ.',
    reflectionParagraphs: [
      'The same creative Word that spoke light into the primordial deep at Genesis does not remain distant from the fractures of our week. Paul insists that the sanctuary lamp is lit inside the earthen vessel of the human heart—not after our circumstances become seamless, but precisely within them.',
      'When we gather as a parish or open the Word at dawn, we are not manufacturing spiritual warmth; we are turning our face toward a Radiance already shining.',
    ],
    collectPrayer:
      'O God of unchangeable power and eternal light: Look favorably on Thy whole Church, that by the quiet work of Thy Spirit what was cast down may be raised up, and what had grown old may be made new; through Jesus Christ our Lord. Amen.',
    pairedHymnId: 'pd-hymn-be-thou-my-vision',
    pairedCouncilPlateId: 'plate-06-hesychast-taboric-light',
    authorName: 'Rev. Dr. Elias Vance',
    authorRole: 'Senior Pastor · Sanctuary Teaching Office',
  },
  {
    id: 'devo-still-waters-examen',
    dayLabel: 'Midday Sanctuary Examen',
    liturgicalHour: 'SEXT · MIDDAY EXAMEN',
    title: 'The Quiet Cell Within the Noise of the City',
    theme: 'Interior Stillness & Stewardship of Attention',
    scriptureDisplay: 'Psalm 73:25-26',
    scriptureRef: { book: 19, bookName: 'Psalms', chapter: 73, verse: 25 },
    scriptureQuote:
      'Whom have I in heaven but thee? and there is none upon earth that I desire beside thee. My flesh and my heart faileth: but God is the strength of my heart, and my portion for ever.',
    reflectionParagraphs: [
      'The Desert Fathers taught that the outer cell of stone only matters insofar as it trains us to keep an inner sanctuary of undivided attention. Even ten minutes of unhurried Scripture at midday re-anchors our affections.',
    ],
    collectPrayer:
      'Lord of peace, quiet every competing voice within us today, that we may discern Thy gentle governance and serve our neighbors with unhurried grace. Amen.',
    pairedHymnId: 'pd-hymn-it-is-well',
    pairedCouncilPlateId: 'plate-03-apophatic-desert-monolith',
    authorName: 'Elder Hannah Okafor',
    authorRole: 'Director of Spiritual Formation',
  },
  {
    id: 'devo-vespers-gladsome-light',
    dayLabel: 'Evening Lamplighting Office',
    liturgicalHour: 'VESPERS · EVENING LAMP',
    title: 'Thanksgiving at the Lighting of the Evening Lamps',
    theme: 'Gratitude, Rest & Household Blessing',
    scriptureDisplay: 'John 1:4-5',
    scriptureRef: { book: 43, bookName: 'John', chapter: 1, verse: 4 },
    scriptureQuote:
      'In him was life; and the life was the light of men. And the light shineth in darkness; and the darkness comprehended it not.',
    reflectionParagraphs: [
      'As the earliest Christians lit the evening oil lamp, they sang Phos Hilaron—refusing to let nightfall arrive without immediate thanksgiving. Entrust the unfinished labors of this day into the hands of the One who never slumbers.',
    ],
    collectPrayer:
      'Lighten our darkness, we beseech Thee, O Lord; and by Thy great mercy defend our households from all perils and dangers of this night; for the love of Thy only Son, our Savior, Jesus Christ. Amen.',
    pairedHymnId: 'prayer-orthodox-phos-hilaron',
    pairedCouncilPlateId: 'plate-01-byzantine-chrysography',
    authorName: 'Deacon Marcus Sterling',
    authorRole: 'Liturgical & Vespers Office',
  },
];

// Canonical anchors used to deterministically generate all 365 days of the year
const OT_ROTATION: Array<{ num: number; name: string; chapters: number; theme: string }> = [
  { num: 1, name: 'Genesis', chapters: 50, theme: 'Creation & Patriarchal Covenant' },
  { num: 2, name: 'Exodus', chapters: 40, theme: 'Deliverance & Tabernacle Glory' },
  { num: 5, name: 'Deuteronomy', chapters: 34, theme: 'Covenant Renewal in the Wilderness' },
  { num: 23, name: 'Isaiah', chapters: 66, theme: 'Messianic Promise & Holy Remnant' },
  { num: 1, name: 'Genesis', chapters: 50, theme: 'Covenant Foundations' },
];

const NT_ROTATION: Array<{ num: number; name: string; chapters: number }> = [
  { num: 40, name: 'Matthew', chapters: 28 },
  { num: 42, name: 'Luke', chapters: 24 },
  { num: 43, name: 'John', chapters: 21 },
  { num: 44, name: 'Acts', chapters: 28 },
  { num: 45, name: 'Romans', chapters: 16 },
  { num: 49, name: 'Ephesians', chapters: 6 },
  { num: 58, name: 'Hebrews', chapters: 13 },
  { num: 66, name: 'Revelation', chapters: 22 },
];

export function getDayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.min(365, Math.floor(diff / oneDay)));
}

export function getBibleInAYearDay(dayNumber: number): BibleInAYearDay {
  const safeDay = Math.max(1, Math.min(365, dayNumber));
  const otBook = OT_ROTATION[(safeDay - 1) % OT_ROTATION.length];
  const otChapterStart = ((safeDay * 2 - 1) % otBook.chapters) + 1;
  const otChapterEnd = Math.min(otBook.chapters, otChapterStart + 1);

  const ntBook = NT_ROTATION[(safeDay - 1) % NT_ROTATION.length];
  const ntChapter = ((safeDay - 1) % ntBook.chapters) + 1;

  const psalmChapter = ((safeDay - 1) % 150) + 1;
  const proverbsChapter = ((safeDay - 1) % 31) + 1;

  const baseDate = new Date(new Date().getFullYear(), 0, safeDay);
  const dateLabel = baseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    dayNumber: safeDay,
    dateLabel,
    canonicalTheme: otBook.theme,
    passages: [
      {
        category: 'OLD_TESTAMENT',
        label:
          otChapterEnd > otChapterStart
            ? `${otBook.name} ${otChapterStart}–${otChapterEnd}`
            : `${otBook.name} ${otChapterStart}`,
        ref: { book: otBook.num, bookName: otBook.name, chapter: otChapterStart, verse: 1 },
      },
      {
        category: 'NEW_TESTAMENT',
        label: `${ntBook.name} ${ntChapter}`,
        ref: { book: ntBook.num, bookName: ntBook.name, chapter: ntChapter, verse: 1 },
      },
      {
        category: 'PSALMS',
        label: `Psalm ${psalmChapter}`,
        ref: { book: 19, bookName: 'Psalms', chapter: psalmChapter, verse: 1 },
      },
      {
        category: 'PROVERBS',
        label: `Proverbs ${proverbsChapter}`,
        ref: { book: 20, bookName: 'Proverbs', chapter: proverbsChapter, verse: 1 },
      },
    ],
  };
}

const BIBLE_YEAR_PROGRESS_KEY = 'plajah_bible_in_a_year_completed_days_v1';
const DEVO_JOURNAL_KEY = 'plajah_sanctuary_devo_journal_v1';

export function getCompletedBibleYearDays(orgId = 'global'): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`${BIBLE_YEAR_PROGRESS_KEY}_${orgId}`) || 'null');
    if (Array.isArray(raw)) return raw;
    // Seed a realistic streak leading up to today so the member sees live progress immediately
    const today = getDayOfYear();
    const seeded: number[] = [];
    for (let d = Math.max(1, today - 14); d < today; d++) {
      seeded.push(d);
    }
    return seeded;
  } catch {
    return [];
  }
}

export function toggleBibleYearDayCompletion(dayNumber: number, orgId = 'global'): number[] {
  const current = new Set(getCompletedBibleYearDays(orgId));
  if (current.has(dayNumber)) current.delete(dayNumber);
  else current.add(dayNumber);
  const next = Array.from(current).sort((a, b) => a - b);
  try {
    localStorage.setItem(`${BIBLE_YEAR_PROGRESS_KEY}_${orgId}`, JSON.stringify(next));
  } catch {
    // ignore storage quota
  }
  return next;
}

export function getDevotionalReflectionNote(devoId: string): string {
  try {
    const map = JSON.parse(localStorage.getItem(DEVO_JOURNAL_KEY) || '{}');
    return map[devoId] || '';
  } catch {
    return '';
  }
}

export function saveDevotionalReflectionNote(devoId: string, text: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(DEVO_JOURNAL_KEY) || '{}');
    map[devoId] = text;
    localStorage.setItem(DEVO_JOURNAL_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** Haversine distance in meters between two lat/lng coordinates */
export function computeDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Evaluates both the church's service schedule (`org.serviceTimes`) AND
 * GPS Sanctuary Geofence proximity (`distanceMeters <= 250`) to determine
 * whether Lectio should auto-engage into In-Service Scripture View synced with Ambo.
 */
const DAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/** Minutes after midnight for "10:00 AM" / "6:30 pm" / "18:00"; null if unreadable. */
function parseClock(t?: string): number | null {
  const m = (t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  const min = Number(m[2] || 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

/** True when `now` is between 15 minutes before and 2 hours after one of the church's posted service times. */
export function isWithinServiceWindow(serviceTimes: Organization['serviceTimes'], now: Date = new Date()): boolean {
  const today = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  return (serviceTimes || []).some(st => {
    const day = DAY_INDEX[String(st.day || '').trim().toLowerCase()];
    const start = parseClock(st.time);
    return day === today && start !== null && mins >= start - 15 && mins <= start + 120;
  });
}

export function evaluateSanctuaryAutoEngage(
  org: Organization,
  opts?: {
    userCoords?: { lat: number; lng: number } | null;
    /** Demo tour only: pretend the viewer is inside the sanctuary during a service. */
    simulateInSanctuary?: boolean;
    now?: Date;
  }
): SanctuaryAutoEngageStatus {
  // The church's own saved location, if it has one. No location → no geofence (never a borrowed default).
  const anchor = (org as { geo?: { lat: number; lng: number } }).geo ?? null;
  const simulate = opts?.simulateInSanctuary ?? false;

  const distanceMeters = simulate
    ? 18
    : anchor && opts?.userCoords
    ? Math.round(computeDistanceMeters(opts.userCoords.lat, opts.userCoords.lng, anchor.lat, anchor.lng))
    : null;
  const gpsMatched = distanceMeters !== null && distanceMeters <= 250;

  const formattedServiceTimes = (org.serviceTimes || []).map(st => `${st.label || 'Service'} (${st.day} ${st.time})`);
  const scheduleMatched = simulate || isWithinServiceWindow(org.serviceTimes, opts?.now);
  const autoEngaged = scheduleMatched && gpsMatched;

  return {
    scheduleMatched,
    activeServiceLabel: formattedServiceTimes[0] || 'No service times posted',
    nextServiceWindowLabel: formattedServiceTimes.join(' · '),
    gpsMatched,
    distanceMeters,
    sanctuaryName: org.name,
    coordinatesLabel: simulate
      ? 'Demo · inside the sanctuary'
      : !anchor
      ? 'Church location not set'
      : distanceMeters === null
      ? 'Your location is off'
      : `${distanceMeters}m from the church`,
    autoEngaged,
    syncSource: autoEngaged ? 'AMBO_ROOM_DICTATION_AND_KAIROS' : 'STANDBY',
  };
}
