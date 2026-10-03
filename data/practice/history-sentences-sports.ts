/**
 * Sports-history extension of the "learn two things at once" Language Arts bank (see history-sentences.ts).
 * Three extra questions per grammar skill, each built on a true fact from sports history.
 * Ids are '<skillId>.s1'..'s3' so they never collide with the existing '<skillId>.qN' ids.
 */
import type { Question } from './types';

/** Build a 4-choice mcq; `pos` is where the correct choice sits (0-3). */
function mk(skill: string, n: number, level: 1 | 2 | 3, prompt: string, correct: string, wrong: [string, string, string], pos: 0 | 1 | 2 | 3, hint: string, explanation: string): Question {
  const choices: string[] = [...wrong];
  choices.splice(pos, 0, correct);
  return { id: `${skill}.s${n}`, lessonId: skill, kind: 'mcq', prompt, choices, answer: pos, hint, explanation, level };
}

const CAP = 'Which sentence uses capital letters correctly?';
const W = 'Choose the word that completes the sentence: ';
const COM = 'Which sentence uses commas correctly?';
const END = 'Choose the best ending mark for this sentence: ';

export const HISTORY_SENTENCES_SPORTS: Question[] = [
  // ---------- 1. hs-capitals ----------
  mk('hs-capitals', 1, 1, CAP, 'Jackie Robinson joined the Brooklyn Dodgers in April 1947.',
    ['jackie robinson joined the brooklyn dodgers in april 1947.', 'Jackie Robinson Joined The Brooklyn Dodgers In April 1947.', 'Jackie robinson joined the Brooklyn dodgers in april 1947.'], 0,
    'Names of people, teams and months begin with capitals; ordinary words like "joined" do not.',
    'Capitalize people (Jackie Robinson), teams (Brooklyn Dodgers) and months (April), but not every word. Robinson made his major-league debut for the Dodgers on April 15, 1947.'),
  mk('hs-capitals', 2, 1, CAP, 'The first modern Olympic Games were held in Athens, Greece, in 1896.',
    ['the first modern olympic games were held in athens, greece, in 1896.', 'The First Modern Olympic Games were held in Athens, Greece, in 1896.', 'The first modern Olympic games were held in athens, greece, in 1896.'], 3,
    'Look at the name of the event and the names of the city and country.',
    'The Olympic Games is a proper name, and Athens and Greece are places, so all are capitalized, while "first modern" is not. The first modern Olympics took place in Athens in 1896.'),
  mk('hs-capitals', 3, 2, CAP, 'Pelé led Brazil to the World Cup title in Sweden in 1958.',
    ['Pelé led brazil to the world cup title in sweden in 1958.', 'pelé led Brazil to the World cup title in Sweden in 1958.', 'Pelé led Brazil to the world cup Title in Sweden in 1958.'], 1,
    'Check the name of the player, the country, the tournament and the host country.',
    'Names of people, countries and events are capitalized, including both words of "World Cup." Seventeen-year-old Pelé helped Brazil win the 1958 World Cup in Sweden.'),

  // ---------- 2. hs-end-marks ----------
  mk('hs-end-marks', 1, 1, END + 'Did Roger Bannister run a mile in under four minutes in 1954____', '?',
    ['.', '!', ','], 2, 'Does the sentence ask something?',
    'A sentence that asks something ends with a question mark. Yes: on May 6, 1954, Roger Bannister became the first person to run a mile in under four minutes.'),
  mk('hs-end-marks', 2, 1, END + 'What a speedy sprinter Jesse Owens was in the 1936 Olympic Games____', '!',
    ['.', '?', ','], 0, 'The sentence shows strong admiration.',
    'An exclamation point shows strong feeling, here admiration. Jesse Owens won four gold medals at the 1936 Olympic Games in Berlin.'),
  mk('hs-end-marks', 3, 1, END + 'Wilma Rudolph won three gold medals at the 1960 Olympic Games in Rome____', '.',
    ['?', '!', ','], 3, 'It simply tells a fact.',
    'A plain statement of fact ends with a period. Wilma Rudolph won the 100 meters, the 200 meters and the relay in Rome in 1960.'),

  // ---------- 3. hs-verb-tense ----------
  mk('hs-verb-tense', 1, 1, W + 'In 1891 James Naismith ____ basketball in Springfield, Massachusetts.', 'invented',
    ['invents', 'will invent', 'inventing'], 3, 'When did it happen: before, now, or later?',
    'Past tense is needed because it happened in 1891. James Naismith invented basketball, with peach baskets for goals, in Springfield, Massachusetts.'),
  mk('hs-verb-tense', 2, 2, W + 'Next summer our class ____ the Pro Football Hall of Fame in Canton, Ohio, where Super Bowl history is on display.', 'will visit',
    ['visited', 'visiting', 'has visited'], 1, 'The word "next" points toward the future.',
    'Future tense is needed because the visit is "next summer." The Pro Football Hall of Fame stands in Canton, Ohio.'),
  mk('hs-verb-tense', 3, 3, W + 'Before Roger Bannister ran his famous mile in 1954, no one ____ the distance in under four minutes.', 'had run',
    ['runs', 'will run', 'has ran'], 2, 'The action was finished before 1954 arrived.',
    'Past perfect shows something that had or had not happened before a past time ("before ... 1954"). Bannister ran the first sub-four-minute mile at Oxford on May 6, 1954.'),

  // ---------- 4. hs-sv-agree ----------
  mk('hs-sv-agree', 1, 1, W + 'The Green Bay Packers, who won the first Super Bowl in 1967, ____ one of the oldest teams in the NFL.', 'are',
    ['is', 'be', 'was'], 0, 'Is the subject one player or a whole team name ending in -s?',
    'The plural subject "Packers" takes "are." Green Bay won Super Bowl I over the Kansas City Chiefs, 35 to 10.'),
  mk('hs-sv-agree', 2, 2, W + 'Each of Jesse Owens\'s four gold medals from the 1936 Berlin Games ____ won in a different event.', 'was',
    ['were', 'are', 'be'], 1, '"Each" is singular.',
    '"Each" is singular, so it takes "was," even though "medals" comes right before the blank. Owens won the 100 meters, the 200 meters, the long jump and the 4x100-meter relay.'),
  mk('hs-sv-agree', 3, 2, W + 'Basketball, which James Naismith invented in 1891, ____ now played around the world.', 'is',
    ['are', 'were', 'be'], 2, 'Ignore the phrase between commas; what is the subject?',
    'The subject "Basketball" is singular, so it takes "is." James Naismith invented the game in Springfield, Massachusetts, with two peach baskets.'),

  // ---------- 5. hs-homophones ----------
  mk('hs-homophones', 1, 1, W + 'The Green Bay Packers won ____ first Super Bowl in January 1967.', 'their',
    ['there', 'they\'re', 'them'], 1, 'Whose first Super Bowl? It belongs to the team.',
    '"Their" shows ownership. The Packers beat the Kansas City Chiefs 35 to 10 in the first Super Bowl, played on January 15, 1967.'),
  mk('hs-homophones', 2, 1, W + 'The Dodgers moved to Los Angeles in 1958, and ____ still based there today.', 'they\'re',
    ['their', 'there', 'them'], 0, 'Can you replace the blank with "they are"?',
    '"They\'re" means "they are." The Dodgers played in Brooklyn until the 1957 season and moved west for 1958.'),
  mk('hs-homophones', 3, 2, W + 'Brazil needed only a draw in 1950, but Uruguay scored late and it was ____ late to change the result.', 'too',
    ['to', 'two', 'tow'], 2, 'Which word means "more than enough"?',
    '"Too" means "excessively." Uruguay beat Brazil 2 to 1 at the Maracanã in Rio de Janeiro in 1950, in a game still remembered as the "Maracanazo."'),

  // ---------- 6. hs-commas ----------
  mk('hs-commas', 1, 2, COM, 'The 1896 Athens Games included track and field, swimming, cycling, and tennis.',
    ['The 1896 Athens Games included track and field swimming cycling, and tennis.', 'The 1896 Athens Games included, track and field, swimming, cycling, and tennis.', 'The 1896 Athens Games included track and field, swimming, cycling, and, tennis.'], 3,
    'Items in a list are separated by commas, with none right after "included."',
    'Commas separate the items in a series, with no comma after the verb "included" or after "and." The first modern Olympics in Athens in 1896 featured track and field, swimming, cycling and tennis, among other sports.'),
  mk('hs-commas', 2, 2, COM, 'In 1954, Roger Bannister ran the first mile under four minutes.',
    ['In 1954 Roger Bannister, ran the first mile under four minutes.', 'In, 1954 Roger Bannister ran the first mile under four minutes.', 'In 1954, Roger Bannister ran, the first mile under four minutes.'], 0,
    'An introductory phrase is followed by a comma, and nothing else needs splitting.',
    'A comma follows an introductory phrase such as "In 1954." Roger Bannister ran his 3:59.4 mile at Oxford on May 6, 1954.'),
  mk('hs-commas', 3, 3, COM, 'Wilma Rudolph, who had worn a leg brace as a child, won three gold medals in 1960.',
    ['Wilma Rudolph who had worn a leg brace as a child, won three gold medals in 1960.', 'Wilma Rudolph, who had worn a leg brace as a child won three gold medals in 1960.', 'Wilma Rudolph, who had worn, a leg brace as a child, won three gold medals in 1960.'], 1,
    'A phrase that adds extra information and could be removed needs a comma on both sides.',
    'Commas set off a nonessential clause on both sides. Wilma Rudolph, who wore a leg brace as a child after illness, won three gold medals at the 1960 Rome Olympics.'),

  // ---------- 7. hs-apostrophes ----------
  mk('hs-apostrophes', 1, 2, 'Choose the correct form: ____ 1947 debut changed baseball.', 'Jackie Robinson\'s',
    ['Jackie Robinsons', 'Jackie Robinsons\'', 'Jackie Robinson\''], 3, 'One player owns the debut.',
    'A singular possessive adds apostrophe + s. Jackie Robinson\'s debut with the Brooklyn Dodgers on April 15, 1947, broke baseball\'s color barrier in the modern major leagues.'),
  mk('hs-apostrophes', 2, 2, 'Choose the correct form: ____ perfect score in 1976 was the first in Olympic gymnastics.', 'Nadia Comaneci\'s',
    ['Nadia Comanecis', 'Nadia Comanecis\'', 'Nadia Comaneci\''], 2, 'One gymnast owns the score.',
    'A singular possessive takes apostrophe + s. Fourteen-year-old Nadia Comaneci earned the first perfect 10 in Olympic gymnastics, at the 1976 Games in Montreal.'),
  mk('hs-apostrophes', 3, 3, 'Choose the correct form: ____ victory in Super Bowl I came by a score of 35 to 10.', 'The Packers\'',
    ['The Packer\'s', 'The Packers', 'The Pack\'ers'], 1, 'The team name is plural and ends in s.',
    'A plural noun ending in -s shows possession with just an apostrophe after the s. The Green Bay Packers beat the Kansas City Chiefs in the first Super Bowl in 1967.'),

  // ---------- 8. hs-pronouns ----------
  mk('hs-pronouns', 1, 2, W + 'Branch Rickey, ____ was the Dodgers\' president, signed Jackie Robinson in 1945.', 'who',
    ['whom', 'whose', 'whomever'], 1, 'Is the missing word doing the being, or receiving something?',
    '"Who" is the subject of "was." Branch Rickey signed Robinson to a contract in 1945, and Robinson reached the major leagues with the Dodgers in 1947.'),
  mk('hs-pronouns', 2, 2, W + 'The crowd in Athens cheered for the marathon winner, Spyridon Louis, and gave ____ a hero\'s welcome.', 'him',
    ['he', 'his', 'himself'], 3, 'The pronoun is the object of "gave."',
    'Use the object pronoun "him" after the verb "gave." Spyridon Louis, a Greek runner, won the first modern Olympic marathon in 1896.'),
  mk('hs-pronouns', 3, 3, W + 'Pelé, ____ the world met at the 1958 World Cup, was only seventeen years old.', 'whom',
    ['who', 'whose', 'which'], 0, 'Try "the world met HIM."',
    '"Whom" is the object of "met" (the world met him). Pelé helped Brazil win the 1958 World Cup in Sweden at age seventeen.'),

  // ---------- 9. hs-modifiers ----------
  mk('hs-modifiers', 1, 2, W + 'Wilma Rudolph ran ____ in the 100 meters at the 1960 Rome Olympics.', 'swiftly',
    ['swift', 'swifter', 'swiftness'], 2, 'The word describes how she ran.',
    'An adverb describes a verb: she ran "swiftly." Rudolph won the 100 meters, the 200 meters and the relay in Rome in 1960.'),
  mk('hs-modifiers', 2, 2, W + 'The marathon course in 1896 looked ____ to the runners, but Spyridon Louis finished first.', 'difficult',
    ['difficultly', 'more difficultly', 'difficulty'], 0, 'After "looked," describe the course.',
    '"Looked" is a linking verb, so it takes an adjective: "difficult." Spyridon Louis, a Greek runner, won the marathon at the first modern Olympics in Athens.'),
  mk('hs-modifiers', 3, 3, 'Which sentence has NO dangling modifier?', 'Running on the cinder track at Oxford, Roger Bannister broke the four-minute barrier on May 6, 1954.',
    ['Running on the cinder track at Oxford, the four-minute barrier was broken by Roger Bannister on May 6, 1954.', 'Running on the cinder track at Oxford, the four-minute mile finally fell on May 6, 1954.', 'Running quickly, the barrier of four minutes was reached at Oxford on May 6, 1954.'], 1,
    'Who was running? That person should come right after the comma.',
    'The opening phrase must describe the word right after the comma. Roger Bannister, not the barrier, was running when he ran the first mile under four minutes at Oxford in 1954.'),

  // ---------- 10. hs-parallel ----------
  mk('hs-parallel', 1, 2, W + 'Jesse Owens won gold in the 100 meters, the 200 meters, the long jump, and ____.', 'the 4x100-meter relay',
    ['running in a relay', 'relaying the 4x100 meters', 'when he ran the relay'], 0, 'Keep the list items in the same form: "the ___" events.',
    'Parallel structure keeps all items in the same grammatical form, here "the" + an event. Owens won four gold medals at the 1936 Berlin Olympics.'),
  mk('hs-parallel', 2, 2, W + 'James Naismith was a teacher, a coach, and ____.', 'a physician',
    ['practiced medicine', 'a physician is what he was', 'he studied to be a doctor'], 1, 'The other items are "a" + a person.',
    'All items are nouns naming kinds of people: a teacher, a coach, a physician. James Naismith, who invented basketball in 1891, later also earned a medical degree.'),
  mk('hs-parallel', 3, 3, 'Which choice completes the sentence in parallel form? Nadia Comaneci\'s routines were praised for their precision, for their grace, and ____.', 'for their daring',
    ['because they were daring', 'daringly', 'their being daring'], 2, 'Begin the last item the way the first two begin.',
    'Each item should begin "for their" + a noun. Nadia Comaneci earned the first perfect 10 in Olympic gymnastics in Montreal in 1976.'),

  // ---------- 11. hs-semicolons ----------
  mk('hs-semicolons', 1, 2, 'Which sentence is punctuated correctly?', 'The Tour de France began in 1903; a newspaper started it to sell more copies.',
    ['The Tour de France began in 1903, a newspaper started it to sell more copies.', 'The Tour de France began; in 1903 a newspaper started it to sell more copies.', 'The Tour de France began in 1903: a, newspaper started it to sell more copies.'], 3,
    'Two closely related complete sentences can be joined with a semicolon.',
    'A semicolon joins two independent clauses without a conjunction; a comma alone would be a splice. A French newspaper launched the first Tour de France in 1903 to boost its sales.'),
  mk('hs-semicolons', 2, 2, 'Which sentence is punctuated correctly?', 'The 1936 Berlin Olympics gave Jesse Owens four golds: the 100 meters, the 200 meters, the long jump, and the relay.',
    ['The 1936 Berlin Olympics gave: Jesse Owens four golds the 100 meters, the 200 meters, the long jump, and the relay.', 'The 1936 Berlin Olympics gave Jesse Owens four golds; the 100 meters, the 200 meters, the long jump, and the relay.', 'The 1936 Berlin Olympics gave Jesse Owens four golds the 100 meters: the 200 meters, the long jump, and the relay.'], 0,
    'A colon follows a complete sentence and introduces a list.',
    'A colon after a complete clause introduces a list. Jesse Owens won gold in the 100 meters, the 200 meters, the long jump and the 4x100-meter relay at Berlin in 1936.'),
  mk('hs-semicolons', 3, 3, 'Which sentence uses dashes correctly?', 'The Maracanã—built for the 1950 World Cup—was one of the largest stadiums in the world.',
    ['The Maracanã—built for the 1950 World Cup was one of the largest stadiums in the world.', 'The Maracanã built—for the 1950 World Cup was one of the largest stadiums in the world.', 'The Maracanã: built for the 1950 World Cup—was one of the largest stadiums in the world.'], 2,
    'Dashes that set off an interruption come in a pair, one on each side.',
    'A pair of dashes sets off a nonessential interruption. The Maracanã in Rio de Janeiro was built for the 1950 World Cup and was among the largest stadiums ever built.'),

  // ---------- 12. hs-word-choice ----------
  mk('hs-word-choice', 1, 3, W + 'Jackie Robinson\'s 1947 debut had a lasting ____ on baseball and on American life.', 'effect',
    ['affect', 'affects', 'effected'], 1, '"Effect" is usually the noun; "affect" is usually the verb.',
    'The noun "effect" (a result) is needed after "a lasting." Robinson broke the major-league color barrier with the Brooklyn Dodgers on April 15, 1947.'),
  mk('hs-word-choice', 2, 3, W + 'The ____ idea behind Dr. Ludwig Guttmann\'s 1948 Stoke Mandeville competition was that sport could help patients recover.', 'principal',
    ['principle', 'principals', 'principles'], 3, 'One spelling means "main," the other means "a rule."',
    '"Principal" means main or most important; "principle" is a rule or belief. Guttmann\'s 1948 archery contest for wheelchair users grew into the Paralympic Games, first held in Rome in 1960.'),
  mk('hs-word-choice', 3, 3, W + 'When the scoreboard in Montreal showed 1.00 for Nadia Comaneci in 1976, viewers could ____ that it had not been built to show a perfect 10.', 'infer',
    ['imply', 'implied', 'inference'], 2, 'The viewers are drawing a conclusion from evidence.',
    'A viewer or reader infers; a speaker or writer implies. The scoreboard could not display 10.00, so Comaneci\'s first perfect score in Olympic gymnastics appeared as 1.00.'),
];
