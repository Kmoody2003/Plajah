/**
 * Public-facing descriptions.
 *
 * For a long time nothing in the publish flow asked the creator for a description: it was
 * always generated from the album-metadata prompt, and when the model was unavailable that
 * generator handed back one fixed music blurb. Films, books and games all got stamped with it.
 *
 * The generator no longer emits it, but it is sitting in Firestore on everything published
 * while that was true. Treat it as absent so pages fall through to their empty state and the
 * owner is invited to write the real thing.
 */
export const LEGACY_FILLER_DESCRIPTION = 'A sonic journey through sound.';

/** A stored description, with the legacy filler treated as no description at all. */
export const cleanDescription = (raw?: string | null): string =>
  (raw || '').trim() === LEGACY_FILLER_DESCRIPTION ? '' : (raw || '');
