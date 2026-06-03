import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/backendService';
import { EXPERTISE_COL, getExpertiseProfile } from './firestore';
import type { ExpertiseProfile, DisciplineScore, ScienceDiscipline } from './types';

// ── Tier labels ───────────────────────────────────────────────────────────────

export const TIER_CONFIG = {
  NOVICE:     { label: 'Novice',     color: '#6B7280', minScore: 0 },
  RESEARCHER: { label: 'Researcher', color: '#3B82F6', minScore: 25 },
  EXPERT:     { label: 'Expert',     color: '#8B5CF6', minScore: 80 },
  AUTHORITY:  { label: 'Authority',  color: '#F59E0B', minScore: 200 },
} as const;

export function getTierFromScore(totalScore: number): ExpertiseProfile['tier'] {
  if (totalScore >= 200) return 'AUTHORITY';
  if (totalScore >= 80)  return 'EXPERT';
  if (totalScore >= 25)  return 'RESEARCHER';
  return 'NOVICE';
}

// ── Discipline display names ───────────────────────────────────────────────────

export const DISCIPLINE_LABELS: Record<ScienceDiscipline, string> = {
  PHYSICS:          'Physics',
  CHEMISTRY:        'Chemistry',
  BIOLOGY:          'Biology',
  COMPUTER_SCIENCE: 'Computer Science',
  ENGINEERING:      'Engineering',
  MATHEMATICS:      'Mathematics',
  NEUROSCIENCE:     'Neuroscience',
  EARTH_SCIENCE:    'Earth Science',
  ASTRONOMY:        'Astronomy',
  DATA_SCIENCE:     'Data Science',
  ENVIRONMENT:      'Environment',
  NETWORKS:         'Networks',
  MEDICINE:         'Medicine',
  ARCHAEOLOGY:      'Archaeology',
  LINGUISTICS:      'Linguistics',
};

// ── Score calculation ─────────────────────────────────────────────────────────

export function computeExpertiseScore(discipline: DisciplineScore): number {
  return (
    discipline.postsCount             * 5  +
    discipline.citationsReceived      * 10 +
    discipline.replicationsConfirmed  * 15 +
    discipline.reviewsGiven           * 8
  );
}

export function topDisciplines(profile: ExpertiseProfile, count = 3): DisciplineScore[] {
  return [...profile.disciplines]
    .sort((a, b) => computeExpertiseScore(b) - computeExpertiseScore(a))
    .slice(0, count);
}

// ── Leaderboard query ─────────────────────────────────────────────────────────

export async function fetchExpertiseLeaderboard(
  discipline?: ScienceDiscipline,
  limitCount = 10,
): Promise<ExpertiseProfile[]> {
  try {
    const q = query(collection(db, EXPERTISE_COL), orderBy('totalScore', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const profiles = snap.docs.map(d => d.data() as ExpertiseProfile);
    if (!discipline) return profiles;
    return profiles.filter(p => p.disciplines.some(d => d.discipline === discipline));
  } catch {
    return [];
  }
}

// ── Profile summary helpers ───────────────────────────────────────────────────

export function profileSummary(profile: ExpertiseProfile): string {
  const top = topDisciplines(profile, 2);
  if (!top.length) return 'Researcher on Plajah Labs';
  return top.map(d => DISCIPLINE_LABELS[d.discipline]).join(' · ');
}

export function progressToNextTier(profile: ExpertiseProfile): { pct: number; nextTier: string; pointsNeeded: number } {
  const score = profile.totalScore;
  if (score >= 200) return { pct: 100, nextTier: 'Authority', pointsNeeded: 0 };
  if (score >= 80)  return { pct: Math.round((score - 80) / 1.2),  nextTier: 'Authority',  pointsNeeded: 200 - score };
  if (score >= 25)  return { pct: Math.round((score - 25) / 0.55), nextTier: 'Expert',     pointsNeeded: 80 - score };
  return { pct: Math.round(score / 0.25), nextTier: 'Researcher', pointsNeeded: 25 - score };
}
