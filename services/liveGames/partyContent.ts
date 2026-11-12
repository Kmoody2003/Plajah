// Content for the live party games that aren't drawing: Brain Rush trivia, Crowd Says survey prompts, and the
// Impostor Night word sets (which reuse the Sketch Rush packs, so every pack works in both games).
// Everything is family-safe. Trivia answers were picked to be settled facts, not trick questions.

export interface TriviaQ { q: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3 }
export interface TriviaPack { id: string; title: string; questions: TriviaQ[] }

const Q = (q: string, a: string, b: string, c: string, d: string, answer: 0 | 1 | 2 | 3): TriviaQ => ({ q, options: [a, b, c, d], answer });

export const TRIVIA_PACKS: ReadonlyArray<TriviaPack> = [
  { id: 'general', title: 'General Knowledge', questions: [
    Q('How many continents are there?', '5', '6', '7', '8', 2),
    Q('What is the largest ocean on Earth?', 'Atlantic', 'Pacific', 'Indian', 'Arctic', 1),
    Q('How many sides does a hexagon have?', '5', '6', '7', '8', 1),
    Q('What is the capital of Canada?', 'Toronto', 'Vancouver', 'Ottawa', 'Montreal', 2),
    Q('How many minutes are in a day?', '1,440', '1,200', '2,400', '3,600', 0),
    Q('Which planet is known as the Red Planet?', 'Venus', 'Jupiter', 'Mars', 'Mercury', 2),
    Q('What is the tallest animal?', 'Elephant', 'Giraffe', 'Moose', 'Ostrich', 1),
    Q('How many legs does a spider have?', '6', '8', '10', '12', 1),
    Q('What colour do you get mixing blue and yellow?', 'Purple', 'Orange', 'Green', 'Brown', 2),
    Q('Which is the longest river in South America?', 'Amazon', 'Paraná', 'Orinoco', 'Magdalena', 0),
    Q('How many players does a soccer team have on the field?', '9', '10', '11', '12', 2),
    Q('What is frozen water called?', 'Steam', 'Ice', 'Dew', 'Fog', 1),
    Q('Which country gifted the Statue of Liberty to the USA?', 'England', 'Spain', 'France', 'Italy', 2),
    Q('How many hours are in a week?', '144', '168', '180', '192', 1),
    Q('What is the smallest prime number?', '0', '1', '2', '3', 2),
    Q('Which US state is called the Great Lakes State?', 'Ohio', 'Michigan', 'Wisconsin', 'Minnesota', 1),
    Q('What city is nicknamed the Motor City?', 'Chicago', 'Cleveland', 'Detroit', 'Pittsburgh', 2),
    Q('How many strings does a standard guitar have?', '4', '5', '6', '8', 2),
    Q('What is the main gas in the air we breathe?', 'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen', 1),
    Q('Which animal is the largest mammal?', 'Elephant', 'Blue whale', 'Giraffe', 'Hippo', 1),
  ] },
  { id: 'music', title: 'Music', questions: [
    Q('How many keys are on a standard piano?', '76', '82', '88', '96', 2),
    Q('Which instrument has pedals, pipes and stops?', 'Organ', 'Harp', 'Tuba', 'Cello', 0),
    Q('Motown Records was founded in which city?', 'Memphis', 'Detroit', 'Chicago', 'Nashville', 1),
    Q('Detroit is widely called the birthplace of which genre?', 'Grunge', 'Techno', 'Ska', 'Bluegrass', 1),
    Q('How many beats does a whole note get in 4/4?', '1', '2', '3', '4', 3),
    Q('Which family does the trumpet belong to?', 'Woodwind', 'Brass', 'String', 'Percussion', 1),
    Q('What does “forte” mean in music?', 'Slow', 'Soft', 'Loud', 'Fast', 2),
    Q('How many lines are in a music staff?', '4', '5', '6', '7', 1),
    Q('Which instrument is a woodwind?', 'Trombone', 'Clarinet', 'Tuba', 'Xylophone', 1),
    Q('A group of four singers or players is a…', 'Trio', 'Quartet', 'Quintet', 'Duet', 1),
    Q('Which clef is also called the G clef?', 'Bass clef', 'Treble clef', 'Alto clef', 'Tenor clef', 1),
    Q('What does “tempo” describe?', 'Speed', 'Volume', 'Pitch', 'Key', 0),
  ] },
  { id: 'bible', title: 'Bible', questions: [
    Q('How many books are in the Protestant Bible?', '39', '27', '66', '73', 2),
    Q('Who built the ark?', 'Moses', 'Noah', 'Abraham', 'David', 1),
    Q('What is the first book of the Bible?', 'Exodus', 'Genesis', 'Matthew', 'Psalms', 1),
    Q('Who defeated Goliath?', 'Saul', 'Samson', 'David', 'Joshua', 2),
    Q('In which town was Jesus born?', 'Nazareth', 'Jerusalem', 'Bethlehem', 'Capernaum', 2),
    Q('How many disciples did Jesus choose?', '7', '10', '12', '40', 2),
    Q('Who was swallowed by a great fish?', 'Jonah', 'Elijah', 'Peter', 'Daniel', 0),
    Q('Which book has 150 chapters?', 'Proverbs', 'Isaiah', 'Psalms', 'Genesis', 2),
    Q('Who was thrown into the lions’ den?', 'Daniel', 'Joseph', 'Paul', 'Jeremiah', 0),
    Q('What did Jesus turn water into at Cana?', 'Milk', 'Wine', 'Oil', 'Honey', 1),
    Q('Who led the Israelites out of Egypt?', 'Aaron', 'Joshua', 'Moses', 'Gideon', 2),
    Q('How many days and nights did it rain in the flood?', '7', '12', '40', '100', 2),
  ] },
  { id: 'science', title: 'Science & Space', questions: [
    Q('What planet is closest to the Sun?', 'Venus', 'Mercury', 'Earth', 'Mars', 1),
    Q('What do bees make?', 'Wax only', 'Honey', 'Silk', 'Milk', 1),
    Q('Water boils at what temperature (°C) at sea level?', '90', '100', '110', '120', 1),
    Q('What is H₂O?', 'Salt', 'Water', 'Oxygen', 'Sugar', 1),
    Q('Which organ pumps blood around the body?', 'Lungs', 'Liver', 'Heart', 'Brain', 2),
    Q('How many planets are in our solar system?', '7', '8', '9', '10', 1),
    Q('What force keeps us on the ground?', 'Magnetism', 'Friction', 'Gravity', 'Wind', 2),
    Q('What is the hardest natural substance?', 'Gold', 'Iron', 'Diamond', 'Quartz', 2),
    Q('Plants take in which gas from the air?', 'Oxygen', 'Carbon dioxide', 'Helium', 'Nitrogen', 1),
    Q('What is the largest planet?', 'Saturn', 'Jupiter', 'Neptune', 'Earth', 1),
    Q('How many bones are in an adult human body?', '106', '206', '306', '186', 1),
    Q('What is the centre of an atom called?', 'Electron', 'Nucleus', 'Proton', 'Shell', 1),
  ] },
];

export const triviaPack = (id: string) => TRIVIA_PACKS.find(p => p.id === id) ?? TRIVIA_PACKS[0];

export interface CrowdPack { id: string; title: string; prompts: string[] }
export const CROWD_PACKS: ReadonlyArray<CrowdPack> = [
  { id: 'everyday', title: 'Everyday', prompts: [
    'Name something you take to the beach', 'Name a pizza topping', 'Name something you do every morning', 'Name a fruit that is red',
    'Name a reason you might be late', 'Name something in a kitchen drawer', 'Name a breakfast food', 'Name a pet that lives in a cage',
    'Name something people lose all the time', 'Name a board game', 'Name a sport played with a ball', 'Name a colour of a car',
    'Name something you find at a picnic', 'Name a word that rhymes with cat', 'Name an animal on a farm', 'Name a famous superhero',
    'Name something cold', 'Name a holiday', 'Name a dessert', 'Name something with wheels',
  ] },
  { id: 'music', title: 'Music', prompts: [
    'Name a musical instrument', 'Name a music genre', 'Name something you see at a concert', 'Name a famous Motown act',
    'Name a song everyone knows the words to', 'Name a reason to turn the music up', 'Name a place you sing out loud',
    'Name something a DJ needs', 'Name a famous band', 'Name a dance move',
  ] },
  { id: 'church', title: 'Church', prompts: [
    'Name a book of the Bible', 'Name something you see in a church', 'Name a Bible hero', 'Name an animal on Noah’s ark',
    'Name a favourite church potluck dish', 'Name a hymn or worship song', 'Name something a choir needs', 'Name one of the twelve disciples',
    'Name a Christian holiday', 'Name a fruit of the Spirit',
  ] },
  { id: 'detroit', title: 'Detroit', prompts: [
    'Name a Detroit sports team', 'Name a Detroit food', 'Name a Detroit neighbourhood', 'Name a car brand',
    'Name a famous musician from Detroit', 'Name something on Belle Isle', 'Name a reason to love summer in Michigan', 'Name a Great Lake',
  ] },
];
export const crowdPack = (id: string) => CROWD_PACKS.find(p => p.id === id) ?? CROWD_PACKS[0];
