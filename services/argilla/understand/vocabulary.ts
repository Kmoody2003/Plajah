/**
 * vocabulary.ts — what Argilla can name, and what it knows about each thing: how big it really is and how it's built.
 *
 * Size and structure are what turn "a depth map" into an object. A bottle is round, so its back is known. A book is
 * a slab. A car seen side-on is the same on its far side. To add things, add lines here and re-run
 * scripts/argilla/embedCodexPhrases.ts. Anything unnamed still builds: it just has no prior to lean on.
 */

/** How the unseen part of a thing relates to the seen part. */
export type Structure =
  | 'round'      // turned around an axis: bottles, drums, lamps
  | 'slab'       // flat-faced block: books, phones, cabinets
  | 'sheet'      // very thin: signs, paintings, leaves
  | 'mirrored'   // same on both sides: vehicles, chairs, tools
  | 'organic'    // soft rounded mass: fruit, stones, loaves
  | 'figure'     // people and creatures: rounded limbs, bilateral
  | 'branching'; // trees, plants, coral

export interface ObjectPrior {
  label: string;
  structure: Structure;
  /** Typical width, height, depth in metres, as usually pictured. */
  size: [number, number, number];
  /** A body plan in the creature codex, when it can be rigged as one. */
  plan?: string;
}

const list = (structure: Structure, rows: string): ObjectPrior[] => rows.trim().split('\n').map((row) => {
  const [label, w, h, d, plan] = row.trim().split('|');
  return { label, structure, size: [+w, +h, +d], plan: plan || undefined };
});

export const VOCABULARY: ObjectPrior[] = [
  ...list('round', `
bottle|0.08|0.28|0.08
wine bottle|0.08|0.3|0.08
vase|0.16|0.3|0.16
urn|0.25|0.4|0.25
jar|0.1|0.16|0.1
mug|0.09|0.1|0.09
cup|0.08|0.09|0.08
teapot|0.2|0.15|0.14
bowl|0.18|0.08|0.18
plate|0.26|0.03|0.26
goblet|0.09|0.2|0.09
candle|0.06|0.18|0.06
lamp|0.3|0.55|0.3
lantern|0.16|0.3|0.16
drum|0.4|0.45|0.4
conga drum|0.3|0.75|0.3
goblet drum|0.25|0.45|0.25
snare drum|0.36|0.15|0.36
timpani|0.7|0.8|0.7
barrel|0.6|0.9|0.6
bucket|0.3|0.3|0.3
trash can|0.4|0.7|0.4
flower pot|0.2|0.18|0.2
tin can|0.07|0.12|0.07
soda can|0.066|0.12|0.066
thermos|0.08|0.3|0.08
chess piece|0.04|0.09|0.04
spinning top|0.06|0.08|0.06
bell|0.2|0.25|0.2
hat|0.3|0.15|0.3
helmet|0.26|0.26|0.3
crown|0.2|0.14|0.2
basketball|0.24|0.24|0.24
soccer ball|0.22|0.22|0.22
globe|0.3|0.4|0.3
planet|1|1|1
apple|0.08|0.08|0.08
orange fruit|0.08|0.08|0.08
pumpkin|0.35|0.3|0.35
tree trunk|0.5|1.5|0.5
column|0.6|3|0.6
wheel|0.6|0.6|0.2
tire|0.65|0.65|0.22
gear|0.1|0.1|0.03
ring|0.02|0.02|0.008
`),
  ...list('slab', `
book|0.15|0.23|0.03
laptop|0.33|0.23|0.02
smartphone|0.075|0.15|0.008
tablet computer|0.18|0.25|0.007
television|1.2|0.7|0.06
computer monitor|0.6|0.4|0.06
radio|0.3|0.18|0.1
speaker cabinet|0.3|0.5|0.3
amplifier|0.5|0.4|0.25
refrigerator|0.8|1.8|0.7
washing machine|0.6|0.85|0.6
microwave oven|0.5|0.3|0.35
oven|0.6|0.9|0.6
cabinet|0.9|1.8|0.45
dresser|1.2|0.9|0.5
wardrobe|1.2|2|0.6
bookshelf|0.9|1.9|0.3
door|0.9|2|0.05
window|1|1.3|0.1
box|0.4|0.3|0.3
crate|0.5|0.4|0.4
treasure chest|0.7|0.5|0.4
suitcase|0.5|0.7|0.25
backpack|0.3|0.45|0.2
brick|0.21|0.07|0.1
house|10|7|9
building|20|30|20
skyscraper|40|200|40
castle|60|40|60
church|20|25|35
tower|8|40|8
tombstone|0.6|0.9|0.15
game console|0.27|0.05|0.2
camera|0.13|0.1|0.08
keyboard|0.44|0.03|0.13
`),
  ...list('sheet', `
painting|0.6|0.8|0.03
poster|0.6|0.9|0.002
sign|0.6|0.6|0.02
shield|0.6|0.8|0.08
playing card|0.063|0.088|0.001
envelope|0.22|0.11|0.002
leaf|0.08|0.12|0.002
coin|0.03|0.03|0.002
medal|0.06|0.06|0.004
mask|0.18|0.24|0.1
flag|1.5|0.9|0.01
`),
  ...list('mirrored', `
car|4.5|1.45|1.8
sports car|4.5|1.2|1.9
truck|6|2.6|2.3
pickup truck|5.5|1.8|2
bus|12|3.2|2.5
van|5|2|2
motorcycle|2.1|1.1|0.8
bicycle|1.75|1|0.6
early automobile|2.5|1.6|1.5
tractor|3.5|2.5|1.9
tank vehicle|7|2.4|3.5
train locomotive|18|4|3
airplane|15|4.5|15
propeller airplane|15|4|20
helicopter|12|3.5|3
rocket|5|40|5
spaceship|20|8|15
boat|6|2|2.2
sailing ship|30|35|8
submarine|70|10|10
robot|0.6|1.7|0.4
chair|0.5|0.9|0.55
armchair|0.85|0.9|0.85
stool|0.35|0.65|0.35
bench|1.5|0.85|0.5
sofa|2|0.85|0.9
table|1.4|0.75|0.8
desk|1.4|0.75|0.7
bed|1.6|0.9|2
throne|0.9|1.8|0.8
guitar|0.38|1|0.1
violin|0.21|0.6|0.1
piano|1.5|1.25|0.6
trumpet|0.5|0.15|0.12
hammer|0.13|0.33|0.04
axe|0.2|0.7|0.05
sword|0.2|1|0.04
gun|0.2|0.14|0.03
wrench|0.08|0.25|0.015
scissors|0.08|0.2|0.012
spoon|0.04|0.18|0.02
shoe|0.3|0.12|0.11
boot|0.3|0.3|0.11
glove|0.12|0.25|0.05
headphones|0.18|0.2|0.08
glasses|0.14|0.05|0.14
wristwatch|0.04|0.24|0.012
microphone|0.05|0.2|0.05
drone|0.35|0.1|0.35
`),
  ...list('organic', `
rock|0.5|0.35|0.45
boulder|2|1.4|1.8
loaf of bread|0.3|0.12|0.13
cake|0.25|0.12|0.25
hamburger|0.11|0.09|0.11
potato|0.1|0.06|0.07
banana|0.2|0.05|0.05
skull|0.15|0.2|0.2
heart organ|0.09|0.12|0.07
pillow|0.6|0.4|0.15
teddy bear|0.3|0.4|0.2
cloud|500|200|400
seashell|0.1|0.08|0.06
egg|0.045|0.06|0.045
sculpture|0.5|0.8|0.4
bust statue|0.5|0.7|0.35
`),
  ...list('figure', `
person|0.5|1.75|0.3|human
man|0.5|1.78|0.3|human
woman|0.45|1.65|0.28|human
child|0.35|1.2|0.2|human
soldier|0.55|1.8|0.35|human
knight in armor|0.6|1.85|0.4|human
wizard|0.6|1.8|0.4|human
statue of a person|0.6|2|0.5|human
human face portrait|0.2|0.28|0.22|human
werewolf|0.8|2.2|0.6|werewolf
vampire|0.6|1.85|0.35|vampire
zombie|0.55|1.75|0.35|zombie
troll|1.3|3|0.9|troll
ogre|1.2|2.8|0.9|troll
ghost|0.6|1.7|0.3
angel|1.4|1.8|0.4|human
demon|0.9|2.2|0.5|troll
alien creature|0.5|1.8|0.3|human
dragon|8|4|3
dinosaur|8|4|2
wolf|1.3|0.8|0.3|wolf
dog|0.8|0.6|0.25|wolf
fox|0.7|0.4|0.18|wolf
cat|0.45|0.3|0.14|cat
lion|1.8|1.1|0.45|cat
tiger|2|1|0.45|cat
bear|1.7|1|0.7|bear
horse|2.2|1.6|0.6
cow|2.3|1.4|0.7
pig|1.4|0.8|0.5
sheep|1.2|0.8|0.45
elephant|5|3|2
giraffe|3|5|1
deer|1.6|1.2|0.4
rabbit|0.35|0.3|0.15
mouse animal|0.09|0.04|0.03
bird|0.25|0.2|0.2
eagle|0.8|0.8|0.2
owl|0.3|0.45|0.25
chicken|0.4|0.4|0.2
penguin|0.4|0.9|0.3
fish|0.4|0.15|0.08
shark|3.5|1|0.8
whale|18|4|4
octopus|0.8|0.5|0.8
crab|0.2|0.1|0.15
insect|0.03|0.01|0.015
spider|0.08|0.04|0.08
snake|1.5|0.15|0.3
frog|0.1|0.06|0.08
turtle|0.4|0.2|0.3
monkey|0.5|0.7|0.25
`),
  ...list('branching', `
tree|6|10|6
pine tree|5|15|5
palm tree|5|12|5
bonsai|0.4|0.4|0.3
bush|1.5|1.2|1.5
flower|0.1|0.3|0.1
potted plant|0.4|0.7|0.4
cactus|0.5|1.5|0.5
mushroom|0.08|0.1|0.08
coral|0.4|0.3|0.4
`),
];

export const VOCABULARY_BY_LABEL = new Map(VOCABULARY.map((p) => [p.label, p]));

/** Finds what someone typed: the longest label inside their words wins, so "a wine bottle" isn't just a "bottle". */
export function priorFromWords(text: string): ObjectPrior | null {
  const words = ` ${text.toLowerCase().replace(/[^a-z ]+/g, ' ')} `;
  let best: ObjectPrior | null = null;
  for (const prior of VOCABULARY) {
    if (words.includes(` ${prior.label} `) || words.includes(` ${prior.label}s `)) {
      if (!best || prior.label.length > best.label.length) best = prior;
    }
  }
  return best;
}

export interface ObjectReading { label: string; score: number }

/**
 * Checks a vision model's names against the picture's proportions: a snare drum is wider than tall, so a tall thing
 * isn't one however much it looks like a drum. Things seen from many angles, like figures, are held to this less.
 */
export function rankReadings(readings: ObjectReading[], aspect: number): ObjectReading[] {
  const strictness: Record<Structure, number> = { round: 1.4, slab: 0.5, sheet: 0.4, mirrored: 0.35, organic: 0.2, figure: 0.15, branching: 0.3 };
  const ranked = readings.map((reading) => {
    const prior = VOCABULARY_BY_LABEL.get(reading.label);
    if (!prior) return reading;
    const [w, h, d] = prior.size;
    const fit = Math.min(Math.abs(Math.log(aspect / (w / h))), Math.abs(Math.log(aspect / (d / h))));
    return { label: reading.label, score: reading.score * Math.exp(-fit * strictness[prior.structure]) };
  });
  const total = ranked.reduce((sum, r) => sum + r.score, 0) || 1;
  return ranked.map((r) => ({ label: r.label, score: r.score / total })).sort((a, b) => b.score - a.score);
}
