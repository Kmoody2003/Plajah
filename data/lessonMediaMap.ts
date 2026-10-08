/**
 * Media for built-in lessons: archive SEARCHES, not hand-typed URLs. At read time each reference is
 * resolved live against the Library of Congress, museum open-access collections or the Chora Vault
 * (services/lessonMedia.ts), so every image or recording that appears is a real archive record with
 * its own credit line and a link back to the source. A reference that finds nothing usable simply
 * shows nothing. Keys are lesson ids.
 *
 * Authoring rule: a reference must be a good search for what the lesson actually teaches, and the
 * `caption` states the teaching point in our words (never claims the archive item "is" something the
 * archive does not say it is).
 */
import type { MediaRef } from '../services/lessonMedia';

export const LESSON_MEDIA: Record<string, MediaRef[]> = {};
