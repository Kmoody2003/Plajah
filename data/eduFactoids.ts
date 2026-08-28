// eduFactoids.ts — rotating nano-lessons / "did you know" factoids across Plajah's education
// disciplines (music, film, art, history, science, language). Used by the Education Rail that
// replaces the ad vertical for education accounts — students see learning, not ads.

export interface EduFactoid { id: string; subject: string; emoji: string; text: string; source: string; }

export const EDU_FACTOIDS: EduFactoid[] = [
  { id: 'f_music1', subject: 'Music', emoji: '🎼', text: 'Bach was once jailed for a month for trying to quit his job — and composed some of his sharpest music from the cell.', source: 'Chora · Music History' },
  { id: 'f_music2', subject: 'Music', emoji: '🎷', text: 'Jazz "swing" comes from playing pairs of notes long-then-short. Your brain hears it as a groove even when the beat is perfectly even.', source: 'Chora · The Vault' },
  { id: 'f_film1', subject: 'Film', emoji: '🎬', text: 'The first movie ever made — 1888\'s "Roundhay Garden Scene" — is just 2.11 seconds long.', source: 'Taleo · Film History' },
  { id: 'f_film2', subject: 'Film', emoji: '🎞️', text: 'Early films had no sound, so live pianists improvised the whole score in the theater — a different one every night.', source: 'Taleo · Film History' },
  { id: 'f_art1', subject: 'Art', emoji: '🖼️', text: 'Van Gogh sold only ONE painting while he was alive. Today a single one can sell for over $80 million.', source: 'Museion · Art Masters' },
  { id: 'f_art2', subject: 'Art', emoji: '🎨', text: 'The Met in New York has released 490,000+ artworks as free, public-domain images — anyone can use them.', source: 'Metropolitan Museum · Open Access' },
  { id: 'f_hist1', subject: 'History', emoji: '🏛️', text: 'The Library of Alexandria didn\'t burn down all at once — it declined slowly over centuries as funding dried up.', source: 'Museion · World History' },
  { id: 'f_hist2', subject: 'History', emoji: '🗺️', text: 'The Great Wall of China isn\'t one wall — it\'s many walls built by different dynasties over 2,000 years.', source: 'Museion · World History' },
  { id: 'f_sci1', subject: 'Science', emoji: '🔬', text: 'A teaspoon of neutron-star material would weigh about 6 billion tons on Earth.', source: 'Museion · Astronomy' },
  { id: 'f_sci2', subject: 'Science', emoji: '🧬', text: 'You share about 60% of your DNA with a banana — the basic machinery of life is that old and shared.', source: 'Museion · Biology' },
  { id: 'f_lang1', subject: 'Language', emoji: '🗣️', text: 'Learning just 100 words gets you ~50% of everyday conversation in most languages — momentum builds fast.', source: 'Reading Quest · Languages' },
  { id: 'f_lang2', subject: 'Language', emoji: '🌍', text: 'There are ~7,000 languages spoken today — but one disappears roughly every two weeks.', source: 'Reading Quest · Languages' },
  { id: 'f_arch1', subject: 'Architecture', emoji: '🏗️', text: 'Ancient Roman concrete is still standing after 2,000 years — and it actually gets STRONGER with seawater.', source: 'Museion · Architecture' },
  { id: 'f_read1', subject: 'Reading', emoji: '📖', text: 'The brain doesn\'t read letter-by-letter — skilled readers recognize whole word shapes in a fraction of a second.', source: 'Reading Quest' },
  { id: 'f_arch2', subject: 'Archaeology', emoji: '🏺', text: 'The Rosetta Stone cracked ancient Egyptian by repeating the same text in three scripts — a 2,000-year-old cheat sheet.', source: 'Museion · Archaeology' },
];

/** A stable factoid for a given day + offset, so the rail rotates predictably. */
export function factoidAt(index: number): EduFactoid {
  return EDU_FACTOIDS[((index % EDU_FACTOIDS.length) + EDU_FACTOIDS.length) % EDU_FACTOIDS.length];
}
