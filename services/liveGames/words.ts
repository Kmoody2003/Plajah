// Sketch Rush word packs. Every pack is family-safe and drawable in about a minute. Aliases are other answers
// that count as correct ("tv" for "television"). Creator packs (their own lists) can be added later; the route
// only ever reads packs through wordPool()/aliasesFor().

export interface WordPack { id: string; title: string; words: string[] }

const split = (s: string) => s.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

export const PACKS: ReadonlyArray<WordPack> = [
  { id: 'everyday', title: 'Everyday', words: split(`apple, banana, bicycle, book, bridge, butterfly, cake, camera, candle, car, castle, cat, chair, clock,
    cloud, cookie, crown, cup, dog, door, dragon, drum, duck, egg, elephant, fish, flower, frog, ghost, giraffe, glasses, guitar,
    hamburger, hat, heart, helicopter, house, ice cream, island, kite, ladder, lamp, leaf, lighthouse, lion, key, moon, mountain,
    mushroom, octopus, owl, penguin, piano, pizza, rainbow, robot, rocket, sandwich, scissors, shark, ship, snail, snowman, spider,
    star, sun, sunglasses, sword, television, tent, tiger, tooth, train, tree, truck, umbrella, volcano, whale, window, zebra`) },
  { id: 'music', title: 'Music', words: split(`microphone, headphones, guitar, drum, piano, trumpet, violin, saxophone, speaker, record, concert, stage,
    choir, conductor, harmonica, tambourine, banjo, flute, harp, keyboard, dj, radio, cassette, metronome, encore, mosh pit,
    music note, backstage, spotlight, festival, karaoke, beat, bass, cymbal, xylophone, accordion`) },
  { id: 'church', title: 'Church & Bible', words: split(`ark, dove, rainbow, angel, crown, cross, manger, star, shepherd, sheep, lion, whale, fish, bread, loaves,
    burning bush, ladder, tower, temple, choir, organ, candle, bell, halo, harp, palm, donkey, camel, well, boat, net, sling,
    giant, tablet, scroll, lamp, garden, serpent, fig tree, mustard seed, olive branch`) },
  { id: 'school', title: 'School', words: split(`backpack, pencil, eraser, ruler, globe, chalkboard, bus, lunchbox, calculator, microscope, telescope,
    library, notebook, crayon, glue, scissors, desk, teacher, homework, gym, locker, trophy, diploma, science, magnet,
    dinosaur, planet, volcano, skeleton, map, compass, paintbrush, test tube, bell`) },
  { id: 'movies', title: 'Movie Night', words: split(`popcorn, ticket, spaceship, alien, zombie, vampire, superhero, cape, treasure, pirate, robot, wizard,
    wand, castle, dragon, ghost, haunted house, monster, cowboy, detective, spy, car chase, explosion, robot dog, time machine,
    mummy, werewolf, knight, princess, jungle, dinosaur, shark, submarine, clapperboard, red carpet`) },
];

const ALIASES: Record<string, string[]> = {
  television: ['tv'], 'ice cream': ['icecream', 'ice cream cone'], hamburger: ['burger', 'cheeseburger'], microphone: ['mic'],
  headphones: ['headset'], dj: ['deejay'], 'music note': ['note'], sunglasses: ['shades'], bicycle: ['bike'], helicopter: ['chopper'],
  cassette: ['tape'], 'red carpet': ['carpet'], 'fig tree': ['fig'], 'mustard seed': ['seed'], 'test tube': ['tube'],
  'burning bush': ['bush'], spaceship: ['space ship', 'ufo'], 'haunted house': ['haunted'], 'time machine': ['timemachine'],
};

export const packOrDefault = (id: string) => PACKS.find(p => p.id === id) ?? PACKS[0];
export const wordPool = (id: string) => packOrDefault(id).words;
export const aliasesFor = (word: string) => ALIASES[word] ?? [];
