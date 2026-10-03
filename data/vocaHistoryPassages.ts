/**
 * Voca — history read-alouds: music, film, art and business history, Pre-K → Grade 12.
 * Original Plajah writing; every fact is well-documented history. Same policy as vocaPassages.ts.
 */
import type { VocaPassage } from './vocaPassages';

const P = (p: VocaPassage) => p;
const SRC = 'Original (Plajah); historical facts';

export const VOCA_HISTORY_PASSAGES: VocaPassage[] = [
  // ───────── Level 1
  P({ id: 'hist-L1-a', level: 1, title: 'A Drum', kind: 'story', source: SRC,
    text: 'I have a drum. I tap the drum. Tap, tap, tap! The drum is loud. People have had drums for a long time.',
    question: { prompt: 'What do I do to the drum?', choices: ['Tap it', 'Eat it', 'Wash it'], answer: 0 } }),
  P({ id: 'hist-L1-b', level: 1, title: 'A Coin', kind: 'story', source: SRC,
    text: 'A coin is money. A coin is round. A coin is hard. I can buy a bun with a coin.',
    question: { prompt: 'What can I buy with a coin?', choices: ['A bun', 'A moon', 'A tree'], answer: 0 } }),
  P({ id: 'hist-L1-c', level: 1, title: 'A Horse Can Run', kind: 'story', source: SRC,
    text: 'A man took a photo of a horse. The horse can run. The man took a lot of photos. Look at the horse go!',
    question: { prompt: 'What can the horse do?', choices: ['Swim', 'Run', 'Sing'], answer: 1 } }),

  // ───────── Level 2
  P({ id: 'hist-L2-a', level: 2, title: 'Tom and the Drum', kind: 'story', source: SRC,
    text: 'Tom has a big drum. He taps it with a stick. Tap, tap, tap! Long ago, kids and men did this too. A drum is loud, and a drum is fun.',
    question: { prompt: 'What does Tom tap with?', choices: ['A stick', 'A hat', 'A bus'], answer: 0 } }),
  P({ id: 'hist-L2-b', level: 2, title: 'The Hen and the Hat', kind: 'story', source: SRC,
    text: 'Long ago, Sam had a hen. Ben had a hat. Sam got the hat and Ben got the hen. That is a trade. Then men made coins. A coin can get a hat or a hen.',
    question: { prompt: 'What did Sam get in the trade?', choices: ['The hat', 'The hen', 'A coin'], answer: 0 } }),
  P({ id: 'hist-L2-c', level: 2, title: 'Snap!', kind: 'story', source: SRC,
    text: 'A man had a cam. The cam can snap a pic. Snap! He got a pic of a pup. The pup sat still, so the pic was not a blur.',
    question: { prompt: 'What did the man get a pic of?', choices: ['A pup', 'A bus', 'A frog'], answer: 0 } }),

  // ───────── Level 3
  P({ id: 'hist-L3-a', level: 3, title: 'The Horse Movie', kind: 'informational', source: SRC,
    text: 'A long time ago, a man named Muybridge took pictures of a horse. The horse ran past a row of cameras. Each camera took one picture. When you flip through the pictures fast, the horse seems to run!',
    question: { prompt: 'What do the pictures show?', choices: ['A running horse', 'A sleeping cat', 'A big boat'], answer: 0 } }),
  P({ id: 'hist-L3-b', level: 3, title: 'The Talking Machine', kind: 'informational', source: SRC,
    text: 'Thomas Edison made a machine that could keep a voice. He spoke into a horn. A needle made lines on a metal tube. Then the needle went back over the lines, and the machine said his words back! People were amazed.',
    question: { prompt: 'What came back out of the machine?', choices: ['His words', 'A bird', 'Warm soup'], answer: 0 } }),
  P({ id: 'hist-L3-c', level: 3, title: 'Why We Have Coins', kind: 'informational', source: SRC,
    text: 'People once traded things. A man gave eggs for a hat. But eggs can crack! So people made coins from metal. Coins are small, strong, and easy to carry. A coin can buy bread, a hat, or a pot.',
    question: { prompt: 'Why were coins better than eggs?', choices: ['Eggs can crack', 'Coins can sing', 'Coins are warm'], answer: 0 } }),

  // ───────── Level 4
  P({ id: 'hist-L4-a', level: 4, title: 'The First Movie Show', kind: 'informational', source: SRC,
    text: 'Two brothers named Louis and Auguste Lumière built a camera that could film moving pictures. In 1895, in Paris, they showed short films to people who paid to sit and watch. One film showed workers walking out of a factory. The people loved it. The films had no sound, but they moved!',
    question: { prompt: 'What did the brothers show in Paris?', choices: ['Short films of moving pictures', 'A talking parrot', 'A parade of boats'], answer: 0 },
    syllables: { lumière: ['lu', 'mière'] } }),
  P({ id: 'hist-L4-b', level: 4, title: 'How a String Sings', kind: 'informational', source: SRC,
    text: 'A string makes a sound when it shakes. Pluck a guitar string and watch it blur. The shaking pushes the air, and the air carries the sound to your ear. A short string shakes fast and sounds high. A long string shakes slowly and sounds low.',
    question: { prompt: 'What does a short string sound like?', choices: ['High', 'Low', 'Silent'], answer: 0 } }),
  P({ id: 'hist-L4-c', level: 4, title: 'Why We Use Banks', kind: 'informational', source: SRC,
    text: 'Long ago, people kept their money in jars at home. A jar can get lost or be stolen. So people began to use banks. A bank keeps your money safe. It writes down how much is yours. When you want it back, the bank gives it to you.',
    question: { prompt: 'What does a bank do with your money?', choices: ['Keeps it safe', 'Plants it', 'Paints it'], answer: 0 } }),

  // ───────── Level 5
  P({ id: 'hist-L5-a', level: 5, title: 'Pictures on Metal', kind: 'informational', source: SRC,
    text: 'In 1839, a Frenchman named Louis Daguerre shared a new way to make pictures. He used a shiny plate of silver on copper. Light made an image on the plate, and it looked like a mirror. At first, people had to sit very still for several minutes. These pictures were called daguerreotypes. For the first time, ordinary families could have a picture of someone they loved.',
    question: { prompt: 'What was a daguerreotype made on?', choices: ['A shiny metal plate', 'A piece of cloth', 'A sheet of ice'], answer: 0 },
    syllables: { daguerreotypes: ['da', 'guerre', 'o', 'types'], daguerre: ['da', 'guerre'] } }),
  P({ id: 'hist-L5-b', level: 5, title: 'A Camera for Everyone', kind: 'informational', source: SRC,
    text: 'Long ago, taking a photo was hard. You needed heavy gear and special chemicals. Then George Eastman made a small camera called the Kodak in 1888. It came with film already inside. His slogan was, "You press the button, we do the rest." When the film was used up, you mailed the whole camera to the factory. They sent back your pictures, and the camera with new film.',
    question: { prompt: 'What did people do when the film was used up?', choices: ['Mailed the camera to the factory', 'Threw the camera away', 'Painted the camera'], answer: 0 },
    syllables: { chemicals: ['chem', 'i', 'cals'] } }),
  P({ id: 'hist-L5-c', level: 5, title: 'The Voice on the Tin Foil', kind: 'informational', source: SRC,
    text: 'In 1877, Thomas Edison built a machine that could record sound. He spoke into a horn, and a needle scratched wiggly lines onto tin foil wrapped around a cylinder. When he turned the crank again, the needle followed the lines, and the machine played his voice back. Edison said the first words he recorded were from the song "Mary Had a Little Lamb."',
    question: { prompt: 'What did the needle do when the machine played the sound?', choices: ['It followed the wiggly lines', 'It cut the foil in half', 'It turned the horn'], answer: 0 },
    syllables: { cylinder: ['cyl', 'in', 'der'], phonograph: ['pho', 'no', 'graph'] } }),

  // ───────── Level 6
  P({ id: 'hist-L6-a', level: 6, title: 'The Horse in Motion', kind: 'informational', source: SRC,
    text: 'In 1878, a photographer named Eadweard Muybridge wanted to answer a question. When a horse gallops, are all four hooves ever off the ground at once? Human eyes move too slowly to tell. Muybridge lined up a row of cameras beside a racetrack in California. Each camera had a string stretched across the track. When the horse ran by, its legs snapped the strings, and the cameras took pictures one after another. The photographs showed that the answer was yes.',
    question: { prompt: 'How did the cameras know when to take a picture?', choices: ['The horse snapped strings across the track', 'A clock rang a bell', 'Muybridge shouted'], answer: 0 },
    syllables: { muybridge: ['muy', 'bridge'], photographer: ['pho', 'tog', 'ra', 'pher'] } }),
  P({ id: 'hist-L6-b', level: 6, title: 'From Cylinders to Discs', kind: 'informational', source: SRC,
    text: 'Edison\'s sound cylinders were hard to copy. In the 1880s, an inventor named Emile Berliner tried a flat disc instead. A disc could be stamped from a metal mold, so a factory could make thousands of copies. Later, the most common discs spun at 78 turns each minute, and each side held only about three minutes of music. These records were made of a hard material called shellac. They were heavy and could break if you dropped them.',
    question: { prompt: 'Why were flat discs easier to sell than cylinders?', choices: ['A factory could stamp many copies', 'They never broke', 'They held a whole day of music'], answer: 0 },
    syllables: { berliner: ['ber', 'lin', 'er'], shellac: ['shel', 'lac'] } }),
  P({ id: 'hist-L6-c', level: 6, title: 'The First Coins', kind: 'informational', source: SRC,
    text: 'Before money, people traded one thing for another. This is called barter. But barter can be hard. What if you have fish, and the shoemaker does not want fish? About 2,600 years ago, in a kingdom called Lydia, in what is now Turkey, people made some of the first coins. They were made from a mix of gold and silver. Each coin was stamped with a picture, so people could trust it. Coins were easy to count, carry, and save, and trade grew faster.',
    question: { prompt: 'Why were coins stamped with a picture?', choices: ['So people could trust them', 'So they would taste sweet', 'So they would float'], answer: 0 },
    syllables: { barter: ['bar', 'ter'], lydia: ['lyd', 'i', 'a'] } }),

  // ───────── Level 7
  P({ id: 'hist-L7-a', level: 7, title: 'The Birth of the Piano', kind: 'informational', source: SRC,
    text: 'Around the year 1700, an Italian instrument maker named Bartolomeo Cristofori worked for a prince in Florence. Keyboards of that time plucked their strings, so a player could not change the volume with a gentle or hard touch. Cristofori built a keyboard in which each key moved a small hammer covered in felt. The hammer struck the string and then bounced away. Press gently and the note was soft; press harder and it was loud. He called his invention the "harpsichord with soft and loud." The name was later shortened to piano.',
    question: { prompt: 'What was special about Cristofori\'s keyboard?', choices: ['Soft or hard touches changed the volume', 'It played by itself', 'It had no keys'], answer: 0 },
    syllables: { cristofori: ['cris', 'to', 'fo', 'ri'], bartolomeo: ['bar', 'to', 'lo', 'me', 'o'], harpsichord: ['harp', 'si', 'chord'] } }),
  P({ id: 'hist-L7-b', level: 7, title: 'The First Cartoon Movie', kind: 'informational', source: SRC,
    text: 'On December 21, 1937, a new movie opened in Los Angeles. It was called Snow White and the Seven Dwarfs, and it was the first full-length movie made with hand-drawn animation. Many people doubted that audiences would sit through a whole cartoon. But hundreds of artists had worked for years to make it. They drew the characters on clear sheets called cels and placed them over painted backgrounds. A movie shows twenty-four pictures every second, so the artists needed a huge number of drawings. Audiences loved the film, and animation became a major art form.',
    question: { prompt: 'What are cels?', choices: ['Clear sheets the characters were drawn on', 'Small cameras', 'Seats in a theater'], answer: 0 },
    syllables: { animation: ['an', 'i', 'ma', 'tion'], dwarfs: ['dwarfs'] } }),
  P({ id: 'hist-L7-c', level: 7, title: 'Shares in Amsterdam', kind: 'informational', source: SRC,
    text: 'In 1602, Dutch merchants in Amsterdam formed the Dutch East India Company to send ships to Asia for spices. Each voyage was costly and risky, so the company let ordinary people buy shares. A share is a small piece of ownership. If the voyages earned money, the shareholders received a part of it. Shares could also be sold to other people, and a market for trading them grew up in Amsterdam. Many historians call it the first modern stock exchange.',
    question: { prompt: 'What is a share?', choices: ['A small piece of ownership in a company', 'A kind of ship', 'A spice from Asia'], answer: 0 },
    syllables: { amsterdam: ['am', 'ster', 'dam'], merchants: ['mer', 'chants'], voyage: ['voy', 'age'] } }),

  // ───────── Level 8
  P({ id: 'hist-L8-a', level: 8, title: 'The Voice in the Air', kind: 'informational', source: SRC,
    text: 'In the 1890s, Guglielmo Marconi showed that signals could travel through the air without wires. At first, radio sent only clicks, like the dots and dashes of Morse code. Then inventors learned to send voices and music. On November 2, 1920, a station called KDKA in Pittsburgh, Pennsylvania, broadcast the results of a presidential election to anyone with a receiver. Within a few years, hundreds of stations were on the air. Families gathered around their radios in the evenings to hear news, concerts, and stories. For the first time, millions of people could hear the same moment at once.',
    question: { prompt: 'What did KDKA broadcast on November 2, 1920?', choices: ['Election results', 'A cooking show', 'A weather map'], answer: 0 },
    syllables: { marconi: ['mar', 'co', 'ni'], pittsburgh: ['pitts', 'burgh'], broadcast: ['broad', 'cast'] } }),
  P({ id: 'hist-L8-b', level: 8, title: 'The Farm Boy Who Imagined Television', kind: 'informational', source: SRC,
    text: 'Philo Farnsworth grew up on a farm in Idaho. When he was fourteen, he was plowing a field in straight rows when he had an idea. Could a picture be broken into lines, the way the field was, and sent through the air one line at a time? He kept thinking about it for years. In 1927, in San Francisco, he sent the first all-electronic television picture. It was only a straight line, but it proved his idea worked. Soon televisions would bring moving pictures into living rooms around the world.',
    question: { prompt: 'What did Farnsworth\'s idea come from?', choices: ['The rows of a plowed field', 'A broken radio', 'A box of crayons'], answer: 0 },
    syllables: { farnsworth: ['farns', 'worth'], television: ['tel', 'e', 'vi', 'sion'], electronic: ['e', 'lec', 'tron', 'ic'] } }),
  P({ id: 'hist-L8-c', level: 8, title: 'When the Movies Learned to Talk', kind: 'informational', source: SRC,
    text: 'For its first thirty years, cinema was silent. Audiences read the words on title cards, while a pianist or organist played music live in the theater. Then, in October 1927, Warner Bros. released The Jazz Singer, starring Al Jolson. It had synchronized songs and a few spoken lines, and audiences cheered. Within a few years, nearly every studio was making films with sound. Actors had to learn new skills, and filmmakers had to find ways to hide the noisy cameras so the microphones could work. The silent era was over, but its great comedies are still loved today.',
    question: { prompt: 'How did audiences follow the story in a silent film?', choices: ['They read title cards', 'They wore headphones', 'They read a book'], answer: 0 },
    syllables: { synchronized: ['syn', 'chro', 'nized'], cinema: ['cin', 'e', 'ma'] } }),

  // ───────── Level 9
  P({ id: 'hist-L9-a', level: 9, title: 'The Night Cinema Began', kind: 'informational', source: SRC,
    text: 'On December 28, 1895, a small crowd gathered in a basement room at the Grand Café in Paris. Each person had paid a franc to see something new. Brothers Auguste and Louis Lumière switched on their Cinématographe, a hand-cranked machine that worked as a camera and a projector. On the wall appeared moving images, each about fifty seconds long: workers leaving the Lumière factory, a baby eating, a gardener and a hose. A famous story says that viewers of a later film, a train pulling into a station, ran from the room in fright. Historians doubt that it happened, but the story shows how astonishing moving pictures seemed to people who had only ever seen still photographs.',
    question: { prompt: 'What was the Cinématographe?', choices: ['A machine that filmed and projected moving pictures', 'A musical instrument', 'A kind of theater seat'], answer: 0 },
    syllables: { cinématographe: ['ci', 'ne', 'ma', 'to', 'graphe'], astonishing: ['as', 'ton', 'ish', 'ing'], projector: ['pro', 'jec', 'tor'] } }),
  P({ id: 'hist-L9-b', level: 9, title: 'How Banking Grew Up', kind: 'informational', source: SRC,
    text: 'In 1397, Giovanni di Bicci de\' Medici opened a bank in Florence, Italy. The word bank comes from banco, the bench on which Italian money-changers worked. Banks like his invented tools that businesses still use. A merchant could leave money in Florence and receive a written note to collect the same value in another city, which meant he did not have to carry a heavy chest of coins across dangerous roads. Italian traders also developed double-entry bookkeeping, which records every transaction twice, as money received and as money given. In 1494, a mathematician named Luca Pacioli published a famous description of the method. It remains the foundation of modern accounting.',
    question: { prompt: 'What problem did the written notes solve?', choices: ['Merchants no longer had to carry heavy coins on long trips', 'Banks ran out of benches', 'Coins were too light'], answer: 0 },
    syllables: { medici: ['med', 'i', 'ci'], bookkeeping: ['book', 'keep', 'ing'], accounting: ['ac', 'count', 'ing'], pacioli: ['pa', 'cio', 'li'] } }),
  P({ id: 'hist-L9-c', level: 9, title: 'The Long-Playing Record', kind: 'informational', source: SRC,
    text: 'A record stores sound as a wavy groove. In the early days, a needle rode in that groove and its shaking was made louder by a big horn. Later, electric pickups turned the needle\'s movement into a signal that an amplifier could boost. Early discs spun at about 78 turns each minute, and one side held only a few minutes of music, so a symphony needed a whole stack of records. In 1948, Columbia Records introduced the long-playing record, or LP. It was made of vinyl, spun at 33 and a third turns per minute, and used much finer grooves. A single side could now hold more than twenty minutes. For the first time, an album could be a continuous musical experience.',
    question: { prompt: 'Why was the LP such an improvement?', choices: ['One side held far more music', 'It was played with a horn', 'It spun faster than old records'], answer: 0 },
    syllables: { amplifier: ['am', 'pli', 'fi', 'er'], symphony: ['sym', 'pho', 'ny'], continuous: ['con', 'tin', 'u', 'ous'] } }),

  // ───────── Level 10
  P({ id: 'hist-L10-a', level: 10, title: 'Blue Jeans: A Small Business Story', kind: 'informational', source: SRC,
    text: 'Levi Strauss was born in Bavaria in 1829 and traveled to the United States as a young man. In 1853, he moved to San Francisco, where the California Gold Rush had created a booming market for supplies, and he opened a wholesale dry goods business that sold cloth, clothing, and other necessities. One of his customers was a tailor in Reno, Nevada, named Jacob Davis. Davis had figured out that putting small metal rivets at the weak points of work pants, such as the pockets, kept them from tearing. He could not afford the fee to patent the idea, so he wrote to Strauss and proposed that they become partners. Strauss agreed and paid. On May 20, 1873, the two men received a United States patent for the riveted work pants. The company that still carries Strauss\'s name began as a small business that noticed a customer\'s good idea and helped bring it to the world.',
    question: { prompt: 'Why did Jacob Davis write to Levi Strauss?', choices: ['He needed a partner to help pay for a patent', 'He wanted to buy a shop in Bavaria', 'He wanted to sell gold'], answer: 0 },
    syllables: { bavaria: ['ba', 'var', 'i', 'a'], wholesale: ['whole', 'sale'], patent: ['pat', 'ent'], necessities: ['ne', 'ces', 'si', 'ties'] } }),
  P({ id: 'hist-L10-b', level: 10, title: 'Under the Buttonwood Tree', kind: 'informational', source: SRC,
    text: 'In the years after American independence, the young government owed large debts, and it sold bonds to raise money. Investors began to buy and sell these bonds, along with shares in new banks, and traders gathered informally on the streets of lower Manhattan. On May 17, 1792, twenty-four brokers signed a short pledge that became known as the Buttonwood Agreement, named for the tree that traditionally marked their meeting place on Wall Street. The brokers promised to trade securities with one another first, and to charge a fixed commission of one quarter of one percent. The idea was simple: if the rules were clear and the participants trusted each other, trading would be steadier and fairer. That group grew into a formal organization, and in 1863 it took the name New York Stock Exchange. A handshake under a tree had become one of the most important markets in the world.',
    question: { prompt: 'What did the brokers\' agreement aim to create?', choices: ['Clear rules and trust among traders', 'A new kind of money', 'A government bank'], answer: 0 },
    syllables: { buttonwood: ['but', 'ton', 'wood'], securities: ['se', 'cu', 'ri', 'ties'], commission: ['com', 'mis', 'sion'], independence: ['in', 'de', 'pen', 'dence'] } }),
  P({ id: 'hist-L10-c', level: 10, title: 'Television Arrives', kind: 'informational', source: SRC,
    text: 'Television did not have a single inventor. In January 1926, the Scottish engineer John Logie Baird demonstrated a working system in London, using a spinning disc with holes to scan a scene, and the blurry moving images amazed the scientists who saw them. But mechanical systems had limits. In 1927, the American inventor Philo Farnsworth sent the first picture using a fully electronic system, which became the basis of the television sets that followed. Regular broadcasting grew through the late 1930s, and after the Second World War, sets spread into homes across many countries. On July 20, 1969, an estimated audience of hundreds of millions of people watched grainy live pictures as the first astronauts stepped onto the Moon. In less than a lifetime, television had turned from a flickering experiment into a shared window on the world.',
    question: { prompt: 'What made Farnsworth\'s system different from Baird\'s?', choices: ['It was fully electronic rather than mechanical', 'It used a spinning disc', 'It only worked on the Moon'], answer: 0 },
    syllables: { mechanical: ['me', 'chan', 'i', 'cal'], electronic: ['e', 'lec', 'tron', 'ic'], astronauts: ['as', 'tro', 'nauts'], demonstrated: ['dem', 'on', 'strat', 'ed'] } }),
];
