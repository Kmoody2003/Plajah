/**
 * Is this a children's book? Decides whether narration gets the children's voice delivery and pronunciation/tone pass
 * (services/aria/childrensSpeech.ts). Conservative on purpose: only clear signals count, so an adult book never gets it.
 */
export function isChildrensBook(album: unknown): boolean {
  const a = (album ?? {}) as Record<string, any>;
  const maxAge = a.showcase?.ageMax ?? a.bookMeta?.audience?.maxAge ?? a.bookTela?.publication?.ageMax;
  if (typeof maxAge === 'number') return maxAge <= 12 && a.bookMeta?.audience?.adult !== true;
  const hay = [a.genre, a.subGenre, ...(Array.isArray(a.tags) ? a.tags : []), ...(Array.isArray(a.keywords) ? a.keywords : [])].filter(x => typeof x === 'string').join(' | ');
  return /\b(children|children's|kids?|picture book|bedtime|toddler|early reader|read[- ]aloud)\b/i.test(hay);
}
