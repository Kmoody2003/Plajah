import type { ShowcaseBook } from '../types';
import { SHOWCASE_AUTHOR, SHOWCASE_AI_DISCLOSURE } from '../types';

// BELOW THE BLUE: ages 6-8. A story with a real structure (want, dive, discovery, return, payoff) that carries true ocean science: sunlight only
// reaches about 200 m, many deep animals make their own light (bioluminescence), and lanternfish really do rise toward the surface every night.
// Longer sentences and richer vocabulary than the younger books; the facts arrive inside the story, not as a lecture.
export const belowTheBlue: ShowcaseBook = {
  id: 'below-the-blue',
  templateId: 'story-ocean',
  title: 'Below the Blue',
  blurb: 'When a cloud hides the sun, Coral the little reef fish is sure the light is gone for good. She follows a trail of tiny glowing lights down into the deep, and finds out where light really comes from.',
  logline: 'A reef fish who thinks the sun has vanished dives into the deep and learns that light can come from inside, and that dark places are never empty.',
  ageMin: 6, ageMax: 8, band: 'read-alone',
  medium: 'Watercolor painting',
  theme: 'Curiosity beats fear; light and friendship can come from unexpected places',
  refrain: 'Light can come from inside, too.',
  author: SHOWCASE_AUTHOR,
  aiDisclosure: SHOWCASE_AI_DISCLOSURE,
  license: 'CC_BY',
  remixIdeas: [
    'Send Coral to a different part of the world: a lake, a river, a pond in your town.',
    'Write a sequel where Lumi swims up to see something Coral knows well.',
    'Make a field-guide page for each animal Coral meets.',
    'Translate the science words and add a glossary in your language.',
  ],
  characters: [
    {
      id: 'coral', name: 'Coral', kind: 'round little reef fish', role: 'hero',
      personality: ['bold', 'curious', 'quick to worry', 'brave when it counts'],
      look: 'A plump, round fish in warm coral red (#E8564A) with three tall golden-orange stripes (#F2A33A), a deep-orange tail and fins, one huge round eye with a white highlight, a small friendly mouth, painted in loose translucent watercolor washes with a darker wet edge.',
      palette: ['#E8564A', '#F2A33A', '#2B7FA6', '#FBF6EC'],
      voice: 'Quick, excited and a little dramatic; slows down when she is scared.',
      signature: 'Does a happy somersault when she is delighted.',
      arc: 'Starts afraid of losing the sun; ends unafraid of the dark and a friend to someone who lives in it.',
    },
    {
      id: 'lumi', name: 'Lumi', kind: 'tiny silver lanternfish', role: 'companion',
      personality: ['calm', 'gentle', 'wise in a small way', 'shy humour'],
      look: 'A small slim silver-blue fish (#9FB8C8) with big dark eyes and a row of soft glowing teal dots (#46E0C9) along her belly and one larger glow near her eye, painted in pale translucent washes with a clear teal halo around every light.',
      palette: ['#9FB8C8', '#46E0C9', '#12324A'],
      voice: 'Soft and slow, with a bubbling laugh.',
      signature: 'Her dots glow brighter when she is happy.',
      arc: 'Starts as a stranger in the dark; ends as Coral\'s night-time friend.',
    },
    {
      id: 'mabel', name: 'Mabel', kind: 'old humpback whale', role: 'supporting',
      personality: ['huge', 'gentle', 'musical'],
      look: 'A very large humpback whale in deep blue (#2B5E8A) with a pale belly (#D9E6EF), long white flippers, barnacles on her chin and one huge kind eye with a white highlight.',
      palette: ['#2B5E8A', '#D9E6EF', '#12324A'],
      voice: 'Hums long, low notes: "hmmmmm".',
      signature: 'Sings a song that makes the water tremble.',
      arc: 'Appears at night as the surprise at the end.',
    },
    {
      id: 'jellies', name: 'The jellies', kind: 'glowing jellyfish', role: 'chorus',
      personality: ['sparkly', 'silent'],
      look: 'Translucent domes in blue and violet (#6FB5E8, #B58CF0) with trailing tentacles, each edged with a ring of light.',
      palette: ['#6FB5E8', '#B58CF0'],
      voice: 'They say nothing; they glow.', signature: 'Light up in rings when Lumi passes.', arc: 'Show Coral how many kinds of light there are.',
    },
  ],
  spreads: [
    { n: 1, beat: 'cover', text: 'Below the Blue', art: 'Coral big and bright in a wash of cerulean, Lumi a tiny glowing dot below her.', characters: ['coral', 'lumi'] },
    { n: 2, beat: 'hero', text: 'Coral was a little fish who loved the top of the sea.\nUp there, the water was warm and bright, and sunlight wobbled in golden ribbons across the sand.\n"Best place in the whole ocean," said Coral, and she turned a happy somersault.', art: 'Bright aqua wash, golden ribbon light on sand, Coral mid-somersault, a smiling sun above.', characters: ['coral'], turn: 'A shadow moves in.' },
    { n: 3, beat: 'vignette', text: 'Then, one afternoon, a huge cloud slid across the sky.\nThe golden ribbons faded. The water turned grey, then a gloomy grey-blue.\n"Uh-oh," said Coral. "The sun is gone!"\nThe other fish ducked into the reef. But Coral stayed, staring into the dark.', art: 'A round porthole vignette: the sky going dark, Coral small and wide-eyed, the sun hidden by a big cloud.', characters: ['coral'], turn: 'What does she see below?' },
    { n: 4, beat: 'strip', text: 'That was when she saw them.\nFar below, tiny lights were twinkling, like stars that had fallen into the sea.\n"Maybe they know where the sun went," thought Coral.\nDown she swam, past the reef, past the sleepy starfish, until the blue turned deep, deep, deep.', art: 'Three painted bands, getting darker top to bottom, Coral swimming down past a starfish, the little lights ahead.', characters: ['coral'], turn: 'The deep.' },
    { n: 5, beat: 'quiet', text: 'It was dark.\nIt was quiet.\nThe water felt heavy and cool, and Coral\'s bright stripes seemed to fade.\n"I want to go back," she whispered.\nAnd then, blink, one small light turned toward her.', art: 'Deep navy wash, soft light blooms, tiny Coral lower left, one small teal glow in the middle.', characters: ['coral', 'lumi'], turn: 'Who is there?', sfx: 'blink!' },
    { n: 6, beat: 'reveal', text: '"Hello," said a small silver fish, with a row of glowing dots along her belly.\n"I am Lumi. You are very far from the sun."\n"That is the problem," said Coral. "The sun is gone, and everything is dark. How do you live down here?"', art: 'Lumi close up, her lights glowing teal; Coral small and astonished beside her.', characters: ['coral', 'lumi'], turn: 'Lumi laughs.' },
    { n: 7, beat: 'panorama', text: 'Lumi laughed, a soft, bubbly laugh.\n"The sun is not gone. A cloud is only in the way. And down here, hardly any sunlight ever reaches. It fades out about as deep as a skyscraper is tall.\nBut we do not need it. Look."\nAll around them, jellies lit up in rings of blue and violet.\n"Many of us make our own light inside our bodies," said Lumi. "It is called bioluminescence."', art: 'A wide dark-blue spread glittering with jellies, Lumi\'s light, Coral amazed.', characters: ['coral', 'lumi', 'jellies'], turn: 'Coral understands.' },
    { n: 8, beat: 'vignette', text: 'Coral had never seen anything so beautiful.\n"I thought light only came from above," she said.\n"Light can come from inside, too," said Lumi. "Even in the dark, you are never really alone."\nThen Lumi swam beside Coral, lighting the way up through the dim blue.', art: 'Text riding two wavy ribbons; Coral and Lumi rising together, their lights pooling.', characters: ['coral', 'lumi'], turn: 'Back toward the surface.' },
    { n: 9, beat: 'closing', text: 'Up, up, up they swam, past the jellies, past the sleepy starfish, until the water grew bluer and bluer.\nAnd there, above them, the cloud was sliding away.\nGolden ribbons rippled across the sand once more.\n"The sun!" cried Coral. "It was there all along."\n"It was," said Lumi. "I will see you tonight. We lanternfish swim up to the top when it is dark, to find our dinner."\nCoral grinned. "Then I will wait for you."\n"Light can come from inside, too," she whispered to herself, and she swam home, smiling.', art: 'Bright aqua again, Coral reaching the light, Lumi a small glow below waving.', characters: ['coral', 'lumi'], turn: 'Night comes.' },
    { n: 10, beat: 'reveal', text: 'That night, the sea was full of stars above and tiny lights below.\nLumi rose through the dark, glowing, and Coral was waiting.\nThen, whoooom, a shape bigger than a house slid by.\nIt was Mabel, an old humpback whale, singing a long, low song.\nCoral\'s mouth fell open.\n"Good evening, little ones," she hummed.', art: 'Mabel\'s enormous kind eye fills the page, Coral and Lumi tiny beside it under a star-filled sky.', characters: ['mabel', 'coral', 'lumi'], turn: 'One last page.', sfx: 'whoooom' },
    { n: 11, beat: 'closing', text: 'From then on, whenever a cloud covered the sun, Coral was not afraid.\nShe knew that the dark is never empty, and that every light, big or small, helps somebody find the way.', art: 'A calm wash of dawn: Coral and Lumi swimming side by side under fading stars, a golden ribbon of light behind them.', characters: ['coral', 'lumi'] },
    { n: 12, beat: 'activity', text: 'Spot Lumi!\nCan you find five tiny lanterns?\nHow many jellies can you count?\nDraw your own glowing fish.', art: 'A framed underwater scene hiding five tiny glowing lanterns, with a draw-your-own-fish circle.', characters: ['lumi', 'coral', 'jellies'] },
    { n: 13, beat: 'back', text: 'When a cloud hides the sun, Coral is sure the light is gone for good. A trail of tiny glowing lights leads her down into the deep, where she learns where light really comes from.', art: 'Back cover: a quiet watercolor wash of the open sea, Coral and Lumi small in the corner, a barcode box.', characters: ['coral', 'lumi'] },
  ],
  discussion: [
    'Why did Coral think the sun was gone? What was really happening?',
    'How do animals in the deep sea see without sunlight?',
    'What does Lumi mean by "light can come from inside, too"?',
    'Have you ever been afraid of the dark? What helped?',
  ],
  glossary: [
    { word: 'bioluminescence', meaning: 'Light made by a living animal\'s own body, like a firefly or a deep-sea jelly.' },
    { word: 'lanternfish', meaning: 'A small deep-sea fish with rows of tiny lights along its body.' },
    { word: 'humpback whale', meaning: 'A very large whale famous for its long, haunting songs.' },
  ],
};
