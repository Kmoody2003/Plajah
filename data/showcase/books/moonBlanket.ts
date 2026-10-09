import type { ShowcaseBook } from '../types';
import { SHOWCASE_AUTHOR, SHOWCASE_AI_DISCLOSURE } from '../types';

// MOON BLANKET: ages 2-4. A toddler bedtime book with one tiny problem, one kind answer and one refrain ("Snug as a stitch.") that a two-year-old
// can say along. Short sentences, repeated frames, a guessing page that asks the child to answer "No!", and a gentle end with everyone asleep.
export const moonBlanket: ShowcaseBook = {
  id: 'moon-blanket',
  templateId: 'story-bedtime',
  title: 'Moon Blanket',
  blurb: 'Bramble the bear has a big, soft, moon-colored blanket. Tonight it has a hole. Who made it? A small, shivery someone who needs a snug place to sleep.',
  logline: 'A little bear finds a hole in his blanket and discovers a cold moth inside, so he shares his warmth.',
  ageMin: 2, ageMax: 4, band: 'toddler',
  medium: 'Felt and stitched textile',
  theme: 'Sharing what you have, and making room for someone small',
  refrain: 'Snug as a stitch.',
  author: SHOWCASE_AUTHOR,
  aiDisclosure: SHOWCASE_AI_DISCLOSURE,
  license: 'CC_BY',
  remixIdeas: [
    'Change the animal: a bunny with a quilt, a puppy with a towel.',
    'Change who made the hole, or what is hiding inside.',
    'Translate it, keeping the refrain short so it can be chanted.',
    'Record yourself reading it and swap in your child\'s name.',
  ],
  characters: [
    {
      id: 'bramble', name: 'Bramble', kind: 'small honey-brown bear', role: 'hero',
      personality: ['gentle', 'sleepy', 'curious', 'kind'],
      look: 'A small round felt bear in honey brown (#C98B4B) with a cream muzzle and tummy (#F3E2C0), two round ears with the left ear patched in mustard felt (#E0A82E), black button eyes with a cross of thread, a stitched smile, and visible running stitches around every edge.',
      palette: ['#C98B4B', '#F3E2C0', '#E0A82E', '#1B1530'],
      voice: 'Speaks softly and slowly, in very short sentences.',
      signature: 'Pulls the blanket up to his chin and says "Snug as a stitch."',
      arc: 'Starts puzzled by the hole in his blanket; ends happy to share it.',
    },
    {
      id: 'flit', name: 'Flit', kind: 'tiny moth', role: 'companion',
      personality: ['shy', 'shivery', 'grateful'],
      look: 'A very small felt moth with ember-orange wings (#F28C28) stitched with cream spots (#FFF1D0), two feathery plum antennae (#6B2D5C), and tiny black button eyes. Always drawn smaller than Bramble\'s paw.',
      palette: ['#F28C28', '#FFF1D0', '#6B2D5C'],
      voice: 'A whisper-small voice that trembles at first, then gets warmer.',
      signature: 'Flutters twice before she speaks: flutter, flutter.',
      arc: 'Starts cold and hidden; ends warm and safe inside the blanket.',
    },
    {
      id: 'moon', name: 'The Moon', kind: 'big round felt moon', role: 'supporting',
      personality: ['calm', 'watchful', 'kind'],
      look: 'A large round cream felt moon (#FBEFC6) with closed sleepy eyes, rosy cheek patches (#F4A6A0) and a soft smile, glowing with a pale halo. Seen at the window on most pages.',
      palette: ['#FBEFC6', '#F4A6A0'],
      voice: 'Never speaks; only smiles.',
      signature: 'Its smile grows a little on every page.',
      arc: 'Watches over the room; at the end it is the last thing the reader says goodnight to.',
    },
  ],
  spreads: [
    { n: 1, beat: 'cover', text: 'Moon Blanket', art: 'Bramble asleep-but-smiling under a big moon-colored blanket, Flit on the edge, the moon in the corner.', characters: ['bramble', 'flit', 'moon'] },
    { n: 2, beat: 'hero', text: 'Bramble had a blanket.\nA big, soft, moon-colored blanket.', art: 'Bramble in his bed, the blanket spread out behind him like a pale moon.', characters: ['bramble'], turn: 'He is about to settle in.' },
    { n: 3, beat: 'hero', text: 'Every night, he pulled it up to his chin.\nSnug as a stitch.', art: 'Bramble tucks the blanket under his chin, eyes half closed, a candle glowing.', characters: ['bramble', 'moon'], turn: 'But tonight is different.' },
    { n: 4, beat: 'reveal', text: 'But tonight...\nwhat is this?\nA hole!\nA tiny, tiny hole.', art: 'Close-up of the blanket with one small round hole; Bramble peeks through it with one eye.', characters: ['bramble'], turn: 'Who made it?' },
    { n: 5, beat: 'strip', text: 'Who made the hole?\nWas it the mouse? No.\nWas it the cat? No.\nWas it the moon? No.', art: 'Three tall quilt panels: a stitched mouse, a cat, and the smiling moon at the window, each with a question mark.', characters: ['bramble'], turn: 'Something is moving in the hole.' },
    { n: 6, beat: 'quiet', text: 'Then...\nflutter, flutter.\nSomething small\ncame out of the hole.', art: 'Mostly empty indigo felt; the candle glow; two orange antennae peeking out of the hole.', characters: ['bramble', 'flit'], turn: 'Who is it?' },
    { n: 7, beat: 'reveal', text: 'A moth!\nA tiny, shivery moth.\n"I was cold," said Flit.\n"I nibbled a little door."', art: 'Flit, huge on the page for a moment, trembling, a stitched tear on her cheek; Bramble tiny beside her.', characters: ['bramble', 'flit'], turn: 'What will Bramble do?' },
    { n: 8, beat: 'vignette', text: 'Bramble looked at his blanket.\nIt was big.\nIt was soft.\n"Come in," said Bramble.', art: 'Bramble lifts a corner of the blanket; warm golden light spills out; Flit flutters toward it.', characters: ['bramble', 'flit'], turn: 'Do they fit?' },
    { n: 9, beat: 'closing', text: 'Bramble pulled up the blanket.\nFlit tucked in the hole.\nSnug as a stitch.\nSnug as a stitch.', art: 'Bramble and Flit under the blanket, only their faces showing, both smiling, the moon at the window.', characters: ['bramble', 'flit', 'moon'], turn: 'Time to say goodnight.' },
    { n: 10, beat: 'quiet', text: 'Goodnight, Bramble.\nGoodnight, Flit.\nGoodnight, moon.', art: 'The window with the sleeping moon, the blanket mound rising and falling, a last stitched star.', characters: ['moon', 'bramble', 'flit'], turn: 'The end.' },
    { n: 11, beat: 'back', text: 'Bramble the bear has a big, soft, moon-colored blanket. Tonight it has a hole. Who made it? A small, shivery someone who needs a snug place to sleep.', art: 'Back cover: a stitched night sky, a small round moon, Bramble and Flit asleep in one corner, a barcode box.', characters: ['bramble', 'flit', 'moon'] },
  ],
  discussion: [
    'How do you think Bramble felt when he saw the hole?',
    'Why was Flit shivering?',
    'What does "snug" feel like? Can you show me?',
    'Who could you share your blanket with?',
  ],
};
