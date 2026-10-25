/**
 * Art College audience gate.
 *
 * College-tier figure study (nude and life-drawing references in museum collections) is shown ONLY
 * to a viewer whose profile proves they are 18+. Everything else is fail-closed:
 *   - child / managed accounts        -> minor
 *   - no birth data on the profile    -> minor (unknown is never adult)
 *   - birthYear only                  -> adult only when currentYear - birthYear >= 19 (so 18 is certain)
 *   - dateOfBirth (ms)                -> adult when the exact 18th birthday has passed
 * Minors (including dual-enrolled teens) get every museum fetch passed through
 * `isEducationSafeArtwork` and the unit's non-figure `alt` studio brief.
 */
import { isChildAccount } from '../contentSafety';

export type ArtAudience = 'adult' | 'minor';

export function audienceOf(profile?: any, now: Date = new Date()): ArtAudience {
  if (!profile || isChildAccount(profile)) return 'minor';
  const dob = typeof profile.dateOfBirth === 'number' ? profile.dateOfBirth : null;
  if (dob) {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return 'minor';
    const eighteen = new Date(d.getFullYear() + 18, d.getMonth(), d.getDate());
    return now >= eighteen ? 'adult' : 'minor';
  }
  const by = typeof profile.birthYear === 'number' ? profile.birthYear : null;
  if (by && now.getFullYear() - by >= 19) return 'adult';
  return 'minor';
}

export const isAdultAudience = (profile?: any, now?: Date) => audienceOf(profile, now) === 'adult';
