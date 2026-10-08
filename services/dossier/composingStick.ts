/**
 * Douglass: "Set his words". Pure logic and the verified lines for the composing-stick teaching toy.
 *
 * Every line below was checked word for word, with its punctuation, against the 1852 pamphlet
 * "Oration, Delivered in Corinthian Hall, Rochester, by Frederick Douglass, July 5th, 1852"
 * (Rochester: printed by Lee, Mann & Co., 1852) in two independent public-domain scans, and against the
 * proofread Wikisource transcription of the same pamphlet. All three agree. On 2026-10-07 each line was found at
 * printed page 15, in one passage.
 *
 * One honest wrinkle: the pamphlet reads "This Fourth July is yours, not mine." (no "of"). Later anthologies print
 * "Fourth [of] July". We keep the pamphlet's wording, because that is what Douglass's own printer set.
 */

export interface StickLine {
  id: string;
  /** The line exactly as printed in the 1852 pamphlet (modern spacing before "!"). */
  text: string;
  /** Short label for the picker. */
  label: string;
}

export const STICK_LINES: StickLine[] = [
  { id: 'yours-not-mine', label: 'Yours, not mine', text: 'This Fourth July is yours, not mine.' },
  { id: 'rejoice-mourn', label: 'Rejoice and mourn', text: 'You may rejoice, I must mourn.' },
  { id: 'not-included', label: 'Not included', text: 'I am not included within the pale of this glorious anniversary!' },
];

export const STICK_SPEECH = {
  title: 'Oration, Delivered in Corinthian Hall, Rochester (later known as "What to the Slave Is the Fourth of July?")',
  speaker: 'Frederick Douglass',
  place: 'Rochester, New York',
  date: '5 July 1852',
  edition: 'Rochester: printed by Lee, Mann & Co., 1852, p. 15',
  rights: 'Public domain (published 1852).',
  sources: [
    { label: 'Pamphlet scan, Emory University (Internet Archive)', url: 'https://archive.org/details/30553533.4879.emory.edu' },
    { label: 'Pamphlet scan, Oberlin College Library (Internet Archive)', url: 'https://archive.org/details/ASPC0001976300' },
    { label: 'Transcription, Wikisource', url: 'https://en.wikisource.org/wiki/What_to_the_Slave_Is_the_Fourth_of_July%3F' },
  ],
} as const;

/** Sorts in the case: the letters, comma, full stop and exclamation mark the three lines need. */
export const STICK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const STICK_MARKS = [',', '.', '!'];
export const STICK_SORTS = [...STICK_LETTERS, ...STICK_MARKS];
/** The stick holds a line or two, not a speech. */
export const STICK_MAX = 90;

/** Maps a typed key to the sort it sets (capital, mark or space), or null when the case has no such sort. */
export function sortForKey(key: string): string | null {
  if (key === ' ') return ' ';
  if (key.length !== 1) return null;
  const k = key.toUpperCase();
  return STICK_SORTS.includes(k) ? k : null;
}

/** Sets one sort on the stick. A full stick refuses more type rather than dropping the front. */
export function setSort(stick: string, sort: string, max = STICK_MAX): string {
  if (!sort || stick.length >= max) return stick;
  if (sort === ' ' && (stick === '' || stick.endsWith(' '))) return stick; // no leading or double spaces
  return stick + sort;
}

/** Takes the last sort out. */
export const takeOut = (stick: string) => stick.slice(0, -1);

/** The line as the case can set it: capitals. */
export const asSorts = (text: string) => text.toUpperCase();

/** True when the stick holds exactly the line (ignoring a trailing space). */
export function stickMatches(stick: string, line: StickLine): boolean {
  return stick.trimEnd() === asSorts(line.text);
}

/** How many leading sorts of the stick agree with the line (for the "you are on his words" cue). */
export function matchedPrefix(stick: string, line: StickLine): number {
  const target = asSorts(line.text);
  let i = 0;
  while (i < stick.length && i < target.length && stick[i] === target[i]) i++;
  return i;
}
