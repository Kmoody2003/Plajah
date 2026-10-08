/**
 * Voca — curated read-aloud passages, Pre-K → Grade 12.
 *
 * Source policy (every passage must satisfy all of these; tests/voca.test.ts enforces the checkable ones):
 *  • ORIGINAL writing by Plajah, or PUBLIC DOMAIN text (US): Aesop retold in our own words; Lincoln (1863);
 *    Emily Dickinson (pub. 1891); Robert Frost (pub. 1916).
 *  • Child-safe for its level: no profanity, no sexual content, no drugs/alcohol, no cruelty. Words about war,
 *    death or loss appear ONLY in historical / literary texts at the high-school levels (9–10), and the
 *    safety checker (services/voca/vocaContentSafety.ts) allow-lists them per level instead of globally.
 *  • Leveled by word count, sentence length and vocabulary to a grade band, with a comprehension check —
 *    fluency without understanding is word-calling, not reading (Simple View of Reading).
 *
 * Levels map to grade bands; `targetWcpm` ≈ Hasbrouck & Tindal (2017) spring 50th percentile for the band.
 */

import { VOCA_HISTORY_PASSAGES } from './vocaHistoryPassages';
import { VOCA_SPORTS_PASSAGES } from './vocaSportsPassages';
export interface VocaQuestion { prompt: string; choices: [string, string, string]; answer: 0 | 1 | 2 }
export interface VocaPassage {
  id: string;
  level: number;
  title: string;
  kind: 'story' | 'fable' | 'informational' | 'poem' | 'speech';
  source: string;               // provenance, shown to teachers/parents
  text: string;
  question: VocaQuestion;
  /** Words with a non-obvious syllable split for the coaching ladder (normalised lower-case → syllables). */
  syllables?: Record<string, string[]>;
}
export interface VocaLevel {
  level: number; name: string; grades: string; standardId: string; targetWcpm: number | null; isced: string;
}

export const VOCA_LEVELS: VocaLevel[] = [
  { level: 1, name: 'First Words', grades: 'Pre-K', standardId: 'CCSS.ELA-LITERACY.RF.K.4', targetWcpm: null, isced: 'ISCED 0' },
  { level: 2, name: 'Sound It Out', grades: 'Kindergarten', standardId: 'CCSS.ELA-LITERACY.RF.K.4', targetWcpm: null, isced: 'ISCED 0–1' },
  { level: 3, name: 'Little Stories', grades: 'Grade 1 (early)', standardId: 'CCSS.ELA-LITERACY.RF.1.4', targetWcpm: 30, isced: 'ISCED 1' },
  { level: 4, name: 'Story Time', grades: 'Grade 1', standardId: 'CCSS.ELA-LITERACY.RF.1.4', targetWcpm: 60, isced: 'ISCED 1' },
  { level: 5, name: 'Fable Road', grades: 'Grade 2', standardId: 'CCSS.ELA-LITERACY.RF.2.4', targetWcpm: 100, isced: 'ISCED 1' },
  { level: 6, name: 'Explorer', grades: 'Grade 3', standardId: 'CCSS.ELA-LITERACY.RF.3.4', targetWcpm: 112, isced: 'ISCED 1' },
  { level: 7, name: 'Pathfinder', grades: 'Grade 4', standardId: 'CCSS.ELA-LITERACY.RF.4.4', targetWcpm: 133, isced: 'ISCED 1' },
  { level: 8, name: 'Navigator', grades: 'Grade 5', standardId: 'CCSS.ELA-LITERACY.RF.5.4', targetWcpm: 146, isced: 'ISCED 1' },
  { level: 9, name: 'Stage Voice', grades: 'Grades 6–8', standardId: 'CCSS.ELA-LITERACY.SL.8.6', targetWcpm: 150, isced: 'ISCED 2' },
  { level: 10, name: 'Orator', grades: 'Grades 9–12', standardId: 'CCSS.ELA-LITERACY.SL.11-12.4', targetWcpm: 160, isced: 'ISCED 3' },
];

const P = (p: VocaPassage) => p;

export const VOCA_PASSAGES: VocaPassage[] = [
  // ─────────────────────────────── Level 1 · Pre-K · First Words
  P({ id: 'l1-cat-dog', level: 1, title: 'I See', kind: 'story', source: 'Original (Plajah)',
    text: 'I see a cat. The cat is big. I see a dog. The dog can run.',
    question: { prompt: 'What can the dog do?', choices: ['Run', 'Fly', 'Swim'], answer: 0 } }),
  P({ id: 'l1-sun-moon', level: 1, title: 'Up in the Sky', kind: 'story', source: 'Original (Plajah)',
    text: 'Look at the sun. The sun is hot. Look at the moon. The moon is up at night.',
    question: { prompt: 'When is the moon up?', choices: ['At night', 'At lunch', 'In the bath'], answer: 0 } }),
  P({ id: 'l1-hats', level: 1, title: 'Hats', kind: 'story', source: 'Original (Plajah)',
    text: 'Mom has a red hat. Dad has a blue hat. I have a hat too. My hat is green.',
    question: { prompt: 'What color is my hat?', choices: ['Red', 'Blue', 'Green'], answer: 2 } }),

  // ─────────────────────────────── Level 2 · K · Sound It Out (decodable CVC)
  P({ id: 'l2-pip', level: 2, title: 'Pip the Pup', kind: 'story', source: 'Original (Plajah)',
    text: 'Pip is a pup. Pip can dig. Pip digs in the mud. Pip is a mess! Mom will scrub Pip in the tub.',
    question: { prompt: 'Where does Pip dig?', choices: ['In the tub', 'In the mud', 'In a box'], answer: 1 } }),
  P({ id: 'l2-bus', level: 2, title: 'The Big Red Bus', kind: 'story', source: 'Original (Plajah)',
    text: 'Sam has a big red bus. The bus can go fast. Sam and Pam get on the bus. Up the hill the bus goes. Stop, bus, stop!',
    question: { prompt: 'Who gets on the bus?', choices: ['Sam and Pam', 'Pip and Mom', 'A frog'], answer: 0 } }),
  P({ id: 'l2-frog', level: 2, title: 'Frog on a Log', kind: 'story', source: 'Original (Plajah)',
    text: 'A fat frog sat on a log. A bug sat on the log too. The frog did not get the bug. The bug went up and away.',
    question: { prompt: 'What did the bug do?', choices: ['It sat in the mud', 'It went up and away', 'It got on a bus'], answer: 1 } }),

  // ─────────────────────────────── Level 3 · Grade 1 (early) · Little Stories
  P({ id: 'l3-chora-sings', level: 3, title: 'Chora Sings', kind: 'story', source: 'Original (Plajah)',
    text: 'Chora likes to sing. She sings in the morning and she sings at night. When it rains, she sings a soft song. When the sun comes out, she sings a happy song for all her friends.',
    question: { prompt: 'What kind of song does Chora sing when it rains?', choices: ['A loud song', 'A soft song', 'No song'], answer: 1 } }),
  P({ id: 'l3-reello-camera', level: 3, title: "Reello's Camera", kind: 'story', source: 'Original (Plajah)',
    text: 'Reello has a camera. He takes a picture of a tree, a bird, and a cloud. Then he takes a picture of his best friend. His friend makes a funny face, and they both laugh.',
    question: { prompt: 'Why do Reello and his friend laugh?', choices: ['The bird sang', 'His friend made a funny face', 'It started to rain'], answer: 1 },
    syllables: { camera: ['cam', 'er', 'a'], picture: ['pic', 'ture'] } }),
  P({ id: 'l3-seed', level: 3, title: 'A Little Seed', kind: 'informational', source: 'Original (Plajah)',
    text: 'We plant a seed in a little pot. We give it water and set it in the sun. One day a green sprout pokes up. It grows a little more each day.',
    question: { prompt: 'What does the seed need?', choices: ['Water and sun', 'Sand and rocks', 'Snow and ice'], answer: 0 } }),

  // ─────────────────────────────── Level 4 · Grade 1 · Story Time
  P({ id: 'l4-lion-mouse', level: 4, title: 'The Lion and the Mouse', kind: 'fable', source: "Aesop (public domain), retold by Plajah",
    text: 'A big lion was asleep in the sun. A little mouse ran across his paw, and the lion woke up. "Please let me go," said the mouse. "One day I will help you." The lion laughed, but he let the mouse go. Later the lion was caught in a hunter\'s net. The little mouse came and chewed the ropes until the lion was free.',
    question: { prompt: 'How did the mouse help the lion?', choices: ['It chewed the ropes', 'It roared loudly', 'It ran away'], answer: 0 } }),
  P({ id: 'l4-ant-grasshopper', level: 4, title: 'The Ant and the Grasshopper', kind: 'fable', source: 'Aesop (public domain), retold by Plajah',
    text: 'All summer the grasshopper played songs in the warm grass. The ant worked hard and carried food to her home. "Come and play," said the grasshopper. "I am getting ready for winter," said the ant. When the snow came, the grasshopper was cold and hungry. The kind ant shared her food, and the grasshopper learned to plan ahead.',
    question: { prompt: 'What did the grasshopper learn?', choices: ['To sing louder', 'To plan ahead', 'To sleep all day'], answer: 1 },
    syllables: { grasshopper: ['grass', 'hop', 'per'] } }),
  P({ id: 'l4-puddles', level: 4, title: 'Puddle Day', kind: 'story', source: 'Original (Plajah)',
    text: 'After the rain, Maya put on her yellow boots. She found a puddle by the gate and jumped in with a big splash. Her little brother laughed and jumped in too. Then they made tiny boats out of leaves and watched them float away.',
    question: { prompt: 'What did they make boats out of?', choices: ['Paper', 'Leaves', 'Boots'], answer: 1 } }),

  // ─────────────────────────────── Level 5 · Grade 2 · Fable Road
  P({ id: 'l5-tortoise-hare', level: 5, title: 'The Tortoise and the Hare', kind: 'fable', source: 'Aesop (public domain), retold by Plajah',
    text: 'Hare loved to tell everyone how fast he could run. One day Tortoise said, "Let us have a race." Hare laughed and agreed. When the race began, Hare zoomed far ahead. He was so sure he would win that he lay down under a tree for a nap. Tortoise kept going, slow and steady, step after step. When Hare woke up, he saw Tortoise crossing the finish line. Slow and steady had won the race.',
    question: { prompt: 'Why did Tortoise win?', choices: ['Tortoise was faster', 'Tortoise kept going and did not stop', 'Hare got lost'], answer: 1 },
    syllables: { tortoise: ['tor', 'toise'] } }),
  P({ id: 'l5-crow-pitcher', level: 5, title: 'The Crow and the Pitcher', kind: 'fable', source: 'Aesop (public domain), retold by Plajah',
    text: 'A thirsty crow found a pitcher with a little water at the bottom. She pushed her beak inside, but she could not reach the water. The crow did not give up. She picked up a small pebble and dropped it into the pitcher. Then she dropped another, and another. Little by little, the water rose to the top, and the clever crow had a long, cool drink.',
    question: { prompt: 'How did the crow reach the water?', choices: ['She tipped the pitcher over', 'She dropped pebbles in until the water rose', 'She waited for rain'], answer: 1 },
    syllables: { pitcher: ['pitch', 'er'], pebble: ['peb', 'ble'] } }),
  P({ id: 'l5-bees', level: 5, title: 'How Bees Help Flowers', kind: 'informational', source: 'Original (Plajah)',
    text: 'Bees visit flowers to drink a sweet juice called nectar. While a bee drinks, yellow dust called pollen sticks to its fuzzy body. When the bee flies to the next flower, some of the pollen rubs off. Flowers need pollen from other flowers to make seeds. So every time a bee looks for food, it also helps new plants grow.',
    question: { prompt: 'What sticks to a bee while it drinks?', choices: ['Pollen', 'Water', 'Mud'], answer: 0 },
    syllables: { nectar: ['nec', 'tar'], pollen: ['pol', 'len'] } }),

  // ─────────────────────────────── Level 6 · Grade 3 · Explorer
  P({ id: 'l6-wind-sun', level: 6, title: 'The North Wind and the Sun', kind: 'fable', source: 'Aesop (public domain), retold by Plajah',
    text: 'The North Wind and the Sun were arguing about who was stronger. Just then a traveler walked down the road wrapped in a warm coat. "Whoever can make him take off his coat is the strongest," said the Sun. The Wind went first. He blew a howling gust, but the traveler only pulled his coat tighter. Then the Sun came out from behind a cloud and shone gently. Soon the traveler grew warm, smiled, and took off his coat. Kindness had done what force could not.',
    question: { prompt: 'What made the traveler take off his coat?', choices: ['The strong wind', 'The gentle warmth of the Sun', 'A rain storm'], answer: 1 },
    syllables: { traveler: ['trav', 'el', 'er'], arguing: ['ar', 'gu', 'ing'] } }),
  P({ id: 'l6-octopus', level: 6, title: 'The Amazing Octopus', kind: 'informational', source: 'Original (Plajah)',
    text: 'An octopus has eight flexible arms covered in suckers. Each sucker can taste and grip, so an octopus can feel its way around rocks to find food. An octopus can also change the color of its skin in less than a second. It can turn bumpy and brown to look like a rock, or smooth and pale to match the sand. Scientists think octopuses are some of the smartest animals in the sea. Some have even learned to open jars!',
    question: { prompt: 'Why does an octopus change color?', choices: ['To blend in with rocks and sand', 'Because it is cold', 'To make music'], answer: 0 },
    syllables: { octopus: ['oc', 'to', 'pus'], octopuses: ['oc', 'to', 'pus', 'es'], flexible: ['flex', 'i', 'ble'], scientists: ['sci', 'en', 'tists'] } }),
  P({ id: 'l6-science-fair', level: 6, title: 'The Science Fair', kind: 'story', source: 'Original (Plajah)',
    text: 'Leo wanted to know which paper airplane would fly the farthest. He folded three planes: one with wide wings, one with narrow wings, and one with tiny flaps at the back. He threw each plane five times and wrote down every distance. The plane with narrow wings won almost every time. At the science fair, Leo showed his chart and explained his test. A judge asked what he would try next. "Heavier paper," Leo said with a grin.',
    question: { prompt: 'Why did Leo throw each plane five times?', choices: ['To make his test fair and careful', 'Because he was bored', 'To break the planes'], answer: 0 } }),

  // ─────────────────────────────── Level 7 · Grade 4 · Pathfinder
  P({ id: 'l7-volcanoes', level: 7, title: 'Inside a Volcano', kind: 'informational', source: 'Original (Plajah)',
    text: 'Deep below the ground, it is so hot that some rock melts into a thick liquid called magma. Magma is lighter than the solid rock around it, so it slowly pushes upward. When it finds a crack, it can burst through the surface. Once magma reaches the air, we call it lava. As lava cools, it hardens into new rock. Over thousands of years, layer after layer of cooled lava can build a mountain. Some islands, like the islands of Hawaii, were made this way.',
    question: { prompt: 'What do we call magma once it reaches the surface?', choices: ['Lava', 'Sand', 'Steam'], answer: 0 },
    syllables: { magma: ['mag', 'ma'], liquid: ['liq', 'uid'], hawaii: ['ha', 'wai', 'i'] } }),
  P({ id: 'l7-wright', level: 7, title: 'The Wright Brothers', kind: 'informational', source: 'Original (Plajah); historical facts',
    text: 'Wilbur and Orville Wright ran a bicycle shop in Ohio, but they dreamed of flying. They studied how birds turned their wings, and they built a wind tunnel to test hundreds of wing shapes. Many of their gliders crashed into the sand, so they fixed the problems and tried again. On a cold morning in December 1903, Orville flew their engine-powered airplane for twelve seconds. It was a short flight, but it changed the world. Patient testing had turned a dream into a machine.',
    question: { prompt: 'What did the brothers do when their gliders failed?', choices: ['They gave up', 'They fixed the problems and tried again', 'They sold the shop'], answer: 1 },
    syllables: { orville: ['or', 'ville'], bicycle: ['bi', 'cy', 'cle'], gliders: ['glid', 'ers'] } }),
  P({ id: 'l7-garden', level: 7, title: "Grandma's Garden", kind: 'story', source: 'Original (Plajah)',
    text: 'Every spring, Grandma and Amir planted the garden together. Grandma showed him how to poke holes with his finger and drop in two seeds, just in case one did not sprout. Amir watered the rows every evening and pulled the weeds on Saturdays. By summer, the beans had climbed the fence and the tomatoes were heavy and red. Amir picked a basket full and carried it to the neighbors. "Food tastes better when you share it," Grandma said.',
    question: { prompt: 'Why did they plant two seeds in each hole?', choices: ['In case one did not sprout', 'To make the garden noisy', 'Because seeds are tiny'], answer: 0 } }),

  // ─────────────────────────────── Level 8 · Grade 5 · Navigator
  P({ id: 'l8-water-cycle', level: 8, title: 'The Water Cycle', kind: 'informational', source: 'Original (Plajah)',
    text: 'The water you drink today may once have floated above an ocean on the other side of the world. When the sun heats lakes and seas, some water evaporates and rises as invisible vapor. High in the cooler air, the vapor condenses into tiny droplets that gather into clouds. When the droplets grow heavy, they fall as rain, snow, or hail. That water soaks into the ground, flows into rivers, and eventually returns to the sea, where the journey begins again. Earth has been recycling the same water for billions of years.',
    question: { prompt: 'What happens when water vapor cools high in the air?', choices: ['It condenses into droplets and forms clouds', 'It turns into sand', 'It disappears forever'], answer: 0 },
    syllables: { evaporates: ['e', 'vap', 'o', 'rates'], condenses: ['con', 'den', 'ses'], invisible: ['in', 'vis', 'i', 'ble'], recycling: ['re', 'cy', 'cling'] } }),
  P({ id: 'l8-sound', level: 8, title: 'How Sound Travels', kind: 'informational', source: 'Original (Plajah)',
    text: 'Every sound you hear begins with a vibration. When you pluck a guitar string, it shakes back and forth very quickly. Each shake pushes on the air around it, squeezing the air together and then letting it spread apart. These waves of pressure travel outward, like ripples spreading across a pond. When they reach your ear, they make your eardrum vibrate too, and your brain turns those vibrations into music. Fast vibrations make high notes, and slow vibrations make low notes.',
    question: { prompt: 'What makes a note sound high?', choices: ['Fast vibrations', 'Slow vibrations', 'No vibrations'], answer: 0 },
    syllables: { vibration: ['vi', 'bra', 'tion'], vibrations: ['vi', 'bra', 'tions'], eardrum: ['ear', 'drum'] } }),
  P({ id: 'l8-lighthouse', level: 8, title: "The Lighthouse Keeper's Daughter", kind: 'story', source: 'Original (Plajah)',
    text: 'Nell had lived in the lighthouse her whole life, and she knew every sound the sea could make. One evening her father caught a fever just as a thick fog rolled in. Nell climbed the winding stairs, trimmed the wick, and lit the great lamp herself. All night she kept the light turning and rang the bell every few minutes. At dawn, a fishing boat glided safely into the harbor. The captain waved his hat toward the tower, and Nell, exhausted but proud, waved back.',
    question: { prompt: 'What did Nell do when her father was sick?', choices: ['She kept the lighthouse lamp burning all night', 'She went fishing', 'She left the island'], answer: 0 },
    syllables: { lighthouse: ['light', 'house'], exhausted: ['ex', 'haus', 'ted'] } }),

  // ─────────────────────────────── Level 9 · Grades 6–8 · Stage Voice
  P({ id: 'l9-camera-light', level: 9, title: 'How a Camera Captures Light', kind: 'informational', source: 'Original (Plajah)',
    text: 'A camera is, at its heart, a dark box with a carefully controlled opening. When you press the shutter, the opening lets light pour in for a fraction of a second. A curved lens bends those incoming rays so that they meet at a single point, forming a sharp, upside-down image on the sensor behind it. The sensor is covered with millions of tiny light-sensitive squares called pixels. Each pixel measures how much red, green, or blue light strikes it, and the camera assembles those measurements into a photograph. In a sense, every picture is a map of light that existed for only an instant.',
    question: { prompt: 'What does the lens do?', choices: ['It bends light so it forms a sharp image', 'It stores the photographs', 'It makes the shutter sound'], answer: 0 },
    syllables: { shutter: ['shut', 'ter'], sensor: ['sen', 'sor'], photograph: ['pho', 'to', 'graph'], measurements: ['meas', 'ure', 'ments'] } }),
  P({ id: 'l9-printing-press', level: 9, title: 'The Printing Press', kind: 'informational', source: 'Original (Plajah); historical facts',
    text: 'Before the 1450s, nearly every book in Europe was copied by hand, one letter at a time. A single book could take a scribe many months, so books were rare and expensive. Johannes Gutenberg changed that by combining several ideas into one machine. He cast individual metal letters that could be arranged into pages, inked, and pressed onto paper again and again. Suddenly hundreds of identical copies could be produced in the time it once took to make one. Ideas began to spread faster than ever, and more people learned to read.',
    question: { prompt: 'Why were books rare before the printing press?', choices: ['They were copied by hand and took months to make', 'Nobody wanted to read', 'Paper had not been invented'], answer: 0 },
    syllables: { johannes: ['jo', 'han', 'nes'], gutenberg: ['gu', 'ten', 'berg'], identical: ['i', 'den', 'ti', 'cal'], individual: ['in', 'di', 'vid', 'u', 'al'] } }),
  P({ id: 'l9-hope-feathers', level: 9, title: '"Hope" is the thing with feathers', kind: 'poem', source: 'Emily Dickinson (public domain, published 1891)',
    text: '"Hope" is the thing with feathers, that perches in the soul, and sings the tune without the words, and never stops at all. And sweetest in the gale is heard, and sore must be the storm that could abash the little bird that kept so many warm. I\'ve heard it in the chillest land, and on the strangest sea. Yet never, in extremity, it asked a crumb of me.',
    question: { prompt: 'What does the poet compare hope to?', choices: ['A bird that keeps singing', 'A heavy stone', 'A closed door'], answer: 0 },
    syllables: { perches: ['perch', 'es'], abash: ['a', 'bash'], extremity: ['ex', 'trem', 'i', 'ty'] } }),

  // ─────────────────────────────── Level 10 · Grades 9–12 · Orator
  P({ id: 'l10-road-not-taken', level: 10, title: 'The Road Not Taken', kind: 'poem', source: 'Robert Frost (public domain, published 1916)',
    text: 'Two roads diverged in a yellow wood, and sorry I could not travel both and be one traveler, long I stood and looked down one as far as I could to where it bent in the undergrowth. Then took the other, as just as fair, and having perhaps the better claim, because it was grassy and wanted wear; though as for that the passing there had worn them really about the same. And both that morning equally lay in leaves no step had trodden black. Oh, I kept the first for another day! Yet knowing how way leads on to way, I doubted if I should ever come back. I shall be telling this with a sigh somewhere ages and ages hence: two roads diverged in a wood, and I took the one less traveled by, and that has made all the difference.',
    question: { prompt: 'What is the speaker mostly reflecting on?', choices: ['How a choice shaped his life', 'How to repair a road', 'Why autumn leaves fall'], answer: 0 },
    syllables: { diverged: ['di', 'verged'], undergrowth: ['un', 'der', 'growth'], trodden: ['trod', 'den'] } }),
  P({ id: 'l10-gettysburg', level: 10, title: 'The Gettysburg Address', kind: 'speech', source: 'Abraham Lincoln, 1863 (public domain)',
    text: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal. Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battlefield of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this. But, in a larger sense, we can not dedicate, we can not consecrate, we can not hallow this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us, that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion, that we here highly resolve that these dead shall not have died in vain, that this nation, under God, shall have a new birth of freedom, and that government of the people, by the people, for the people, shall not perish from the earth.',
    question: { prompt: 'What does Lincoln ask the living to do?', choices: ['Continue the unfinished work for a free nation', 'Forget the past', 'Build a new battlefield'], answer: 0 },
    syllables: { proposition: ['prop', 'o', 'si', 'tion'], consecrate: ['con', 'se', 'crate'], consecrated: ['con', 'se', 'crat', 'ed'], conceived: ['con', 'ceived'] } }),
  P({ id: 'l10-brain-reading', level: 10, title: 'Your Brain on Reading', kind: 'informational', source: 'Original (Plajah); summarizes published neuroscience',
    text: 'Humans have been reading for only about five thousand years, far too short a time for evolution to build a dedicated reading organ. Instead, learning to read recycles brain circuits that originally evolved for other jobs. A region on the left side of the visual cortex, sometimes called the visual word form area, gradually specializes in recognizing letters and words. As a reader practices, that region forms faster connections with the areas that handle spoken language and meaning. This is why reading aloud is so powerful for beginners: saying each word links its spelling to its sound, and every accurate repetition strengthens the pathway. Fluent reading is not a gift; it is a skill the brain builds one connection at a time.',
    question: { prompt: 'According to the passage, why does reading aloud help beginners?', choices: ['It links a word\'s spelling to its sound and strengthens the pathway', 'It makes the eyes stronger', 'It replaces the need to practice'], answer: 0 },
    syllables: { evolution: ['ev', 'o', 'lu', 'tion'], cortex: ['cor', 'tex'], specializes: ['spe', 'cial', 'iz', 'es'], repetition: ['rep', 'e', 'ti', 'tion'] } }),
];

// History read-alouds (music, film, art, money): the same reading practice, learning real history at the same time.
VOCA_PASSAGES.push(...VOCA_HISTORY_PASSAGES, ...VOCA_SPORTS_PASSAGES);

export const passagesForLevel = (level: number) => VOCA_PASSAGES.filter(p => p.level === level);
export const levelInfo = (level: number) => VOCA_LEVELS.find(l => l.level === level) ?? VOCA_LEVELS[0];
export const MAX_LEVEL = VOCA_LEVELS[VOCA_LEVELS.length - 1].level;
