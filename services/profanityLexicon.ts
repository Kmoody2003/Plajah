// profanityLexicon — the shared profanity word list + matcher normalisation.
// Pure (no Firebase) so Stage output windows, workers and node tests can import it.
// Wordlist kept intentionally moderate: slurs + strong profanity. Leetspeak and
// separator-evasion are normalized before matching. Matching is whole-word so
// "class", "assist", "Scunthorpe" are never flagged. Words like "hell" / "damn"
// are deliberately absent — sermons say "heaven and hell" and "damnation".

export const PROFANITY = [
  'fuck', 'fucking', 'fuckin', 'fucked', 'fucker', 'fuckers', 'fucks', 'motherfucker', 'motherfucking',
  'shit', 'shits', 'shitty', 'shitting', 'bullshit', 'horseshit', 'goddamn', 'goddamnit', 'goddammit',
  'bitch', 'bitches', 'bitching', 'asshole', 'assholes', 'dick', 'dickhead', 'cunt', 'cock', 'cocksucker',
  'pussy', 'bastard', 'bastards', 'douchebag', 'whore', 'slut', 'nigger', 'nigga', 'faggot',
  'fag', 'retard', 'retarded', 'kike', 'spic', 'chink', 'tranny', 'wetback',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

export function normalizeForMatch(word: string): string {
  return word.toLowerCase().split('').map(c => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
}

export const PROFANITY_SET = new Set(PROFANITY);

/** Whisper and other ASR engines sometimes self-censor ("f***", "s**t") — still profanity on screen. */
export const isAsteriskCensored = (token: string) => /^[a-z]+\*+[a-z*]*$/i.test(token);
