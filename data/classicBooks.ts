import type { ArchiveBook } from '../services/archiveContentService';

const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';

export const BESPOKE_AUDIOBOOK_COVERS: Record<number, string> = {
  84:    '/covers/audiobooks/frankenstein.jpg',
  17405: '/covers/audiobooks/art-of-war.jpg',
  1661:  '/covers/audiobooks/sherlock-holmes.jpg',
  345:   '/covers/audiobooks/dracula.jpg',
  11:    '/covers/audiobooks/alice-in-wonderland.jpg',
  1342:  '/covers/audiobooks/pride-and-prejudice.jpg',
  1727:  '/covers/audiobooks/the-odyssey.jpg',
  74:    '/covers/audiobooks/tom-sawyer.jpg',
  514:   '/covers/audiobooks/little-women.jpg',
  2701:  '/covers/audiobooks/moby-dick.jpg',
  1184:  '/covers/audiobooks/count-of-monte-cristo.jpg',
  1260:  '/covers/audiobooks/jane-eyre.jpg',
};

const gcov   = (id: number) => BESPOKE_AUDIOBOOK_COVERS[id] || `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
// Direct Gutenberg EPUB cache — avoids multi-hop redirect chains on /ebooks/N.epub.noimages
const gepub  = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`;
// Firebase Storage hosted TXT — fast CDN once seeded; used as secondary to epub
const gstore = (id: number) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`books/classics/${id}/text.txt`)}?alt=media`;
// Direct Gutenberg TXT cache — reliable HTTP URL (no redirect chain)
const gtxt   = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

const book = (
  id: number,
  title: string,
  author: string,
  subjects: string[],
  downloads: number,
  genre = 'Classic Literature',
): ArchiveBook => ({
  id: String(id),
  title,
  authors: [author],
  subjects,
  formats: {
    'image/jpeg': gcov(id),
    // BookTab prefers fast direct TXT/EPUB for native chapter navigation
    'application/epub+zip': gepub(id),
    // TXT kept so BookTab can load or fall back immediately
    'text/plain; charset=utf-8': gstore(id),
    'text/plain': gtxt(id),
  },
  download_count: downloads,
  coverImage: gcov(id),
  genre,
});

export const CLASSIC_BOOKS: ArchiveBook[] = [
  book(1342, 'Pride and Prejudice', 'Austen, Jane', ['Domestic fiction', 'England -- Social life'], 112000),
  book(84, 'Frankenstein', 'Shelley, Mary Wollstonecraft', ['Horror', 'Gothic fiction', 'Science fiction'], 88000),
  book(11, "Alice's Adventures in Wonderland", 'Carroll, Lewis', ['Fantasy fiction', "Children's stories"], 82000),
  book(2701, 'Moby Dick', 'Melville, Herman', ['Whaling', 'Sea stories', 'Adventure'], 77000),
  book(98, 'A Tale of Two Cities', 'Dickens, Charles', ['Historical fiction', 'French Revolution'], 74000),
  book(345, 'Dracula', 'Stoker, Bram', ['Horror', 'Gothic fiction', 'Vampires'], 72000),
  book(76, 'Adventures of Huckleberry Finn', 'Twain, Mark', ['Adventure', 'Mississippi River'], 70000),
  book(174, 'The Picture of Dorian Gray', 'Wilde, Oscar', ['Gothic fiction', 'Philosophical novel'], 68000),
  book(1260, 'Jane Eyre', 'Brontë, Charlotte', ['Romance', 'Gothic fiction', 'England'], 66000),
  book(768, 'Wuthering Heights', 'Brontë, Emily', ['Romance', 'Gothic fiction', 'Yorkshire'], 64000),
  book(514, 'Little Women', 'Alcott, Louisa May', ['Domestic fiction', 'Coming of age'], 62000),
  book(120, 'Treasure Island', 'Stevenson, Robert Louis', ['Adventure', 'Pirates', 'Sea stories'], 60000),
  book(1513, 'Romeo and Juliet', 'Shakespeare, William', ['Drama', 'Tragedy', 'Love stories'], 59000, 'Drama'),
  book(1524, 'Hamlet', 'Shakespeare, William', ['Drama', 'Tragedy', 'Denmark'], 58000, 'Drama'),
  book(1400, 'Great Expectations', 'Dickens, Charles', ['Coming of age', 'Victorian', 'England'], 57000),
  book(730, 'Oliver Twist', 'Dickens, Charles', ['Social fiction', 'Victorian', 'London'], 55000),
  book(46, 'A Christmas Carol', 'Dickens, Charles', ['Christmas', 'Ghost stories', 'Social fiction'], 54000),
  book(2554, 'Crime and Punishment', 'Dostoevsky, Fyodor', ['Psychological fiction', 'Crime', 'Russia'], 53000),
  book(2600, 'War and Peace', 'Tolstoy, Leo', ['Historical fiction', 'War', 'Russia', 'Napoleonic Wars'], 52000),
  book(1399, 'Anna Karenina', 'Tolstoy, Leo', ['Romance', 'Social fiction', 'Russia'], 51000),
  book(996, 'Don Quixote', 'Cervantes Saavedra, Miguel de', ['Adventure', 'Satire', 'Spain'], 50000),
  book(1184, 'The Count of Monte Cristo', 'Dumas, Alexandre', ['Adventure', 'Revenge', 'Historical fiction'], 49000),
  book(135, 'Les Misérables', 'Hugo, Victor', ['Historical fiction', 'Social fiction', 'France'], 48000),
  book(161, 'Sense and Sensibility', 'Austen, Jane', ['Domestic fiction', 'Romance', 'England'], 47000),
  book(158, 'Emma', 'Austen, Jane', ['Domestic fiction', 'Comedy of manners', 'England'], 46000),
  book(1257, 'The Three Musketeers', 'Dumas, Alexandre', ['Adventure', 'Historical fiction', 'France'], 45000),
  book(103, 'Around the World in Eighty Days', 'Verne, Jules', ['Adventure', 'Travel fiction'], 44000),
  book(164, 'Twenty Thousand Leagues Under the Sea', 'Verne, Jules', ['Science fiction', 'Adventure', 'Submarines'], 43000),
  book(36, 'The War of the Worlds', 'Wells, H. G.', ['Science fiction', 'Alien invasion', 'England'], 42000),
  book(35, 'The Time Machine', 'Wells, H. G.', ['Science fiction', 'Time travel'], 41000),
  book(43, 'The Strange Case of Dr Jekyll and Mr Hyde', 'Stevenson, Robert Louis', ['Horror', 'Gothic fiction', 'Psychology'], 40000),
  book(215, 'The Call of the Wild', 'London, Jack', ['Adventure', 'Dogs', 'Yukon'], 39000),
  book(236, 'The Jungle Book', 'Kipling, Rudyard', ['Adventure', 'India', "Children's stories"], 38000),
  book(844, 'The Importance of Being Earnest', 'Wilde, Oscar', ['Comedy', 'Drama', 'Social satire'], 37000, 'Drama'),
  book(5200, 'The Metamorphosis', 'Kafka, Franz', ['Absurdist fiction', 'Psychological fiction'], 36000),
  book(74, 'The Adventures of Tom Sawyer', 'Twain, Mark', ['Adventure', 'Coming of age', 'Mississippi River'], 35000),
  book(25344, 'The Scarlet Letter', 'Hawthorne, Nathaniel', ['Romance', 'Historical fiction', 'Puritanism'], 34000),
  book(1727, 'The Odyssey', 'Homer', ['Epic poetry', 'Ancient Greece', 'Mythology'], 33000),
  book(6130, 'The Iliad', 'Homer', ['Epic poetry', 'Trojan War', 'Ancient Greece'], 32000),
  book(145, 'Middlemarch', 'Eliot, George', ['Victorian', 'Domestic fiction', 'England'], 31000),
  book(1661, 'The Adventures of Sherlock Holmes', 'Doyle, Arthur Conan', ['Detective fiction', 'Mystery', 'Victorian'], 85000),
  book(17405, 'The Art of War', 'Sun Tzu', ['Military strategy', 'Philosophy', 'China'], 95000, 'Philosophy'),
  book(1497, 'The Republic', 'Plato', ['Philosophy', 'Political science', 'Justice', 'Classical Athens'], 91000, 'Philosophy'),
  book(1600, 'Symposium', 'Plato', ['Philosophy', 'Love', 'Socratic dialogue', 'Classical Athens'], 64000, 'Philosophy'),
  book(1656, 'Apology, Crito, and Phaedo of Socrates', 'Plato', ['Philosophy', 'Ethics', 'Socrates', 'Classical Athens'], 69000, 'Philosophy'),
  book(1974, 'Poetics', 'Aristotle', ['Philosophy', 'Dramatic theory', 'Tragedy', 'Literary craft'], 78000, 'Philosophy'),
  book(8438, 'The Nicomachean Ethics', 'Aristotle', ['Philosophy', 'Ethics', 'Virtue', 'Eudaimonia'], 83000, 'Philosophy'),
  book(6762, 'Politics: A Treatise on Government', 'Aristotle', ['Philosophy', 'Political science', 'Civic life'], 58000, 'Philosophy'),
  book(2680, 'Meditations', 'Marcus Aurelius', ['Philosophy', 'Stoicism', 'Rome', 'Ethics'], 89000, 'Philosophy'),
  book(31, 'Plays of Sophocles: Oedipus the King & Antigone', 'Sophocles', ['Drama', 'Greek tragedy', 'Classical Athens'], 61000, 'Drama'),
  book(2147, 'The Raven and Complete Tales & Poems', 'Poe, Edgar Allan', ['Poetry', 'Gothic fiction', 'Mystery'], 79000, 'Poetry'),
  book(1322, 'Leaves of Grass', 'Whitman, Walt', ['Poetry', 'Transcendentalism', 'American literature'], 56000, 'Poetry'),
  book(1001, 'The Divine Comedy', 'Dante Alighieri', ['Epic poetry', 'Philosophy', 'Medieval literature'], 67000, 'Poetry'),
];

export const resolveBookGutenbergId = (titleOrId: string): number | null => {
  if (!titleOrId) return null;
  const trimmed = titleOrId.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num > 0) return num;
  }

  // Handle prefixed IDs like "guttenberg-514", "gutenberg-514", "public_domain_514", "pg514", or URLs
  const prefixMatch =
    trimmed.match(/^(?:gut+enberg|public_domain|classic|pg)[-_]?(\d+)$/i) ||
    trimmed.match(/\/(?:ebooks|epub)\/(\d+)\b/i) ||
    trimmed.match(/\bpg(\d+)\.(?:txt|epub)/i);
  if (prefixMatch) {
    const n = parseInt(prefixMatch[1], 10);
    if (!isNaN(n) && n > 0) return n;
  }

  const s = trimmed.toLowerCase();
  if (s.includes('little women')) return 514;
  if (s.includes('frankenstein')) return 84;
  if (s.includes('alice') || s.includes('wonderland')) return 11;
  if (s.includes('art of war') || s.includes('art_of_war')) return 17405;
  if (s.includes('sherlock') || s.includes('holmes')) return 1661;
  if (s.includes('dracula')) return 345;
  if (s.includes('pride') && s.includes('prejudice')) return 1342;
  if (s.includes('odyssey')) return 1727;
  if (s.includes('iliad')) return 6130;
  if (s.includes('tom sawyer') || s.includes('tom_sawyer')) return 74;
  if (s.includes('moby') || s.includes('whale')) return 2701;
  if (s.includes('great expectations')) return 1400;
  if (s.includes('two cities') || s.includes('tale of two')) return 98;
  if (s.includes('time machine')) return 35;
  if (s.includes('dorian gray')) return 174;
  if (s.includes('war of the worlds')) return 36;
  if (s.includes('huckleberry')) return 76;
  if (s.includes('jekyll') || s.includes('hyde')) return 43;
  if (s.includes('crime and punishment')) return 2554;
  if (s.includes('war and peace')) return 2600;
  if (s.includes('anna karenina')) return 1399;
  if (s.includes('metamorphosis')) return 5200;
  if (s.includes('monte cristo')) return 1184;
  if (s.includes('jane eyre')) return 1260;
  if (s.includes('wuthering heights')) return 768;
  if (s.includes('treasure island')) return 120;
  if (s.includes('romeo and juliet')) return 1513;
  if (s.includes('hamlet')) return 1524;
  if (s.includes('oliver twist')) return 730;
  if (s.includes('christmas carol')) return 46;
  if (s.includes('don quixote')) return 996;
  if (s.includes('misérables') || s.includes('miserables')) return 135;
  if (s.includes('sense and sensibility')) return 161;
  if (s === 'emma' || s.includes('austen')) return 158;
  if (s.includes('three musketeers')) return 1257;
  if (s.includes('eighty days')) return 103;
  if (s.includes('twenty thousand leagues')) return 164;
  if (s.includes('call of the wild')) return 215;
  if (s.includes('jungle book')) return 236;
  if (s.includes('being earnest')) return 844;
  if (s.includes('scarlet letter')) return 25344;
  if (s.includes('middlemarch')) return 145;
  if (s.includes('great gatsby')) return 64317;
  if (s.includes('meditations') || s.includes('marcus aurelius')) return 2680;
  if (s.includes('republic') || (s.includes('plato') && !s.includes('symposium') && !s.includes('apology'))) return 1497;
  if (s.includes('symposium')) return 1600;
  if (s.includes('apology') || s.includes('phaedo') || s.includes('socrates')) return 1656;
  if (s.includes('poetics')) return 1974;
  if (s.includes('nicomachean') || (s.includes('aristotle') && !s.includes('poetics') && !s.includes('politics'))) return 8438;
  if (s.includes('politics') && s.includes('aristotle')) return 6762;
  if (s.includes('sophocles') || s.includes('oedipus') || s.includes('antigone')) return 31;
  if (s.includes('raven') || s.includes('edgar allan poe')) return 2147;
  if (s.includes('leaves of grass') || s.includes('whitman')) return 1322;
  if (s.includes('gilgamesh')) return 11000;
  if (s.includes('bhagavad') || s.includes('song celestial')) return 2388;
  if (s.includes('tale of genji')) return 4014;
  if (s.includes('divine comedy') || s.includes('dante')) return 1001;

  const match = CLASSIC_BOOKS.find(b => {
    const bt = b.title.toLowerCase();
    return bt.includes(s) || s.includes(bt);
  });
  return match ? parseInt(match.id, 10) : null;
};

export const findClassicBook = (titleOrId: string): ArchiveBook | undefined => {
  if (!titleOrId) return undefined;
  const direct = CLASSIC_BOOKS.find(b => b.id === titleOrId);
  if (direct) return direct;

  const gid = resolveBookGutenbergId(titleOrId);
  if (gid) {
    const byGid = CLASSIC_BOOKS.find(b => b.id === String(gid));
    if (byGid) return byGid;
  }

  const s = titleOrId.toLowerCase();
  return CLASSIC_BOOKS.find(b => {
    const bt = b.title.toLowerCase();
    return bt.includes(s) || s.includes(bt);
  });
};

export const getClassicBookTextUrl = (titleOrId: string): string | null => {
  if (!titleOrId) return null;
  const book = findClassicBook(titleOrId);
  if (book?.formats?.['text/plain']) {
    return book.formats['text/plain'] as string;
  }
  const gid = resolveBookGutenbergId(titleOrId);
  if (gid) {
    return `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`;
  }
  return null;
};

/**
 * Resolves the best, book-authentic cover art for an audiobook or classic work.
 * - Always prefers bespoke Gemini Nano Banana artwork (`/covers/audiobooks/*.png`) when matched.
 * - Replaces generic Internet Archive LibriVox waveforms/logos (`archive.org/services/img/`)
 *   and stock Unsplash placeholders with the verified Project Gutenberg book cover.
 */
export const resolveAudiobookCover = (
  title?: string,
  id?: string,
  existingCover?: string
): string => {
  const gid = (title && resolveBookGutenbergId(title)) || (id && resolveBookGutenbergId(id)) || null;
  if (gid && BESPOKE_AUDIOBOOK_COVERS[gid]) {
    return BESPOKE_AUDIOBOOK_COVERS[gid];
  }

  const isGenericCover =
    !existingCover ||
    existingCover.includes('archive.org/services/img/') ||
    existingCover.includes('images.unsplash.com') ||
    existingCover.includes('wikipedia-wordmark');

  if (isGenericCover && gid) {
    return gcov(gid);
  }

  const classic = (title && findClassicBook(title)) || (id && findClassicBook(id));
  if (isGenericCover && classic?.coverImage) {
    return classic.coverImage;
  }

  return existingCover || (gid ? gcov(gid) : '/covers/audiobooks/frankenstein.jpg');
};

/**
 * Instant 0ms opening pages for classic works so the reader renders Chapter 1 immediately
 * on a cold cache while the complete multi-chapter text finishes downloading in the background.
 */
const CLASSIC_INSTANT_OPENINGS: Record<number, { title: string; pages: string[][] }> = {
  1342: {
    title: 'Chapter I',
    pages: [[
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
      '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?” Mr. Bennet replied that he had not.',
      '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.” Mr. Bennet made no answer. “Do you not want to know who has taken it?” cried his wife impatiently. “You want to tell me, and I have no objection to hearing it.” This was invitation enough.'
    ]]
  },
  84: {
    title: 'Letter 1: To Mrs. Saville, England',
    pages: [[
      'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.',
      'I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. Do you understand this feeling? This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes.',
      'Inspirited by this wind of promise, my daydreams become more fervent and vivid. I try in vain to be persuaded that the pole is the seat of frost and desolation; it ever presents itself to my imagination as the region of beauty and delight.'
    ]]
  },
  11: {
    title: 'Chapter I: Down the Rabbit-Hole',
    pages: [[
      'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”',
      'So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.',
      'There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet.'
    ]]
  },
  2701: {
    title: 'Chapter 1: Loomings',
    pages: [[
      'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.',
      'Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people’s hats off—then, I account it high time to get to sea as soon as I can.',
      'There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.'
    ]]
  },
  345: {
    title: 'Chapter I: Jonathan Harker’s Journal',
    pages: [[
      '3 May. Bistritz.—Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets.',
      'I feared to go very far from the station, as we had arrived late and would start as near the correct time as possible. The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube, which is here of noble width and depth, took us among the traditions of Turkish rule.',
      'We left in pretty good time, and came after nightfall to Klausenburgh. Here I stopped for the night at the Hotel Royale. I had for dinner, or rather supper, a chicken done up some way with red pepper, which was very good but thirsty.'
    ]]
  },
  1661: {
    title: 'Adventure I: A Scandal in Bohemia',
    pages: [[
      'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind.',
      'He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position. He never spoke of the softer passions, save with a gibe and a sneer.',
      'Grit in a sensitive instrument, or a crack in one of his own high-power lenses, would not be more disturbing than a strong emotion in a nature such as his. And yet there was but one woman to him, and that woman was the late Irene Adler, of dubious and questionable memory.'
    ]]
  },
  17405: {
    title: 'Chapter I: Laying Plans',
    pages: [[
      'Sun Tzu said: The art of war is of vital importance to the State. It is a matter of life and death, a road either to safety or to ruin. Hence it is a subject of inquiry which can on no account be neglected.',
      'The art of war, then, is governed by five constant factors, to be taken into account in one’s deliberations, when seeking to determine the conditions obtaining in the field. These are: (1) The Moral Law; (2) Heaven; (3) Earth; (4) The Commander; (5) Method and discipline.',
      'The Moral Law causes the people to be in complete accord with their ruler, so that they will follow him regardless of their lives, undismayed by any danger. Heaven signifies night and day, cold and heat, times and seasons. Earth comprises distances, great and small; danger and security; open ground and narrow passes; the chances of life and death.'
    ]]
  },
  1727: {
    title: 'Book I: Council of the Gods & Athene Visits Telemachus',
    pages: [[
      'Tell me, Muse, of that man, so ready at need, who wandered far and wide, after he had sacked the sacred citadel of Troy, and many were the men whose towns he saw and whose mind he learnt, yea, and many the woes he suffered in his heart upon the deep, striving to win his own life and the return of his company.',
      'Nay, but even so he saved not his company, though he desired it sore. For through the blindness of their own hearts they perished, fools, who devoured the kine of Helios Hyperion: but the god took from them their day of returning.',
      'Of these things, goddess, daughter of Zeus, beginning where thou wilt, tell thou even unto us. Now all the rest, as many as fled from sheer destruction, were at home, and had escaped both war and sea, but Odysseus only, craving for his wife and for his homeward path, the lady nymph Calypso held in her hollow caves.'
    ]]
  },
  74: {
    title: 'Chapter I: Y-o-u-u Tom—Aunt Polly Decides Upon Her Duty',
    pages: [[
      '“TOM!” No answer. “TOM!” No answer. “What’s gone with that boy, I wonder? You TOM!” No answer.',
      'The old lady pulled her spectacles down and looked over them about the room; then she put them up and looked out under them. She seldom or never looked through them for so small a thing as a boy; they were her state pair, the pride of her heart, and were built for “style,” not service—she could have seen through a pair of stove-lids just as well.',
      'She looked perplexed for a moment, and then said, not fiercely, but still loud enough for the furniture to hear: “Well, I lay if I get hold of you I’ll—” She did not finish, for by this time she was bending down and punching under the bed with the broom.'
    ]]
  },
  514: {
    title: 'Chapter One: Playing Pilgrims',
    pages: [[
      '“Christmas won’t be Christmas without any presents,” grumbled Jo, lying on the rug. “It’s so dreadful to be poor!” sighed Meg, looking down at her old dress. “I don’t think it’s fair for some girls to have plenty of pretty things, and other girls nothing at all,” added little Amy, with an injured sniff.',
      '“We’ve got Father and Mother, and each other,” said Beth contentedly from her corner. The four young faces on which the firelight shone brightened at the cheerful words, but darkened again as Jo said sadly, “We haven’t got Father, and shall not have him for a long time.”',
      'She didn’t say “perhaps never,” but each silently added it, thinking of Father far away, where the fighting was. Nobody spoke for a minute; then Meg said in an altered tone, “You know the reason Mother proposed not having any presents this Christmas was because it is going to be a hard winter for every one.”'
    ]]
  },
  1184: {
    title: 'Chapter 1: Marseilles—The Arrival',
    pages: [[
      'On the 24th of February, 1815, the look-out at Notre-Dame de la Garde signalled the three-master, the Pharaon from Smyrna, Trieste, and Naples. As usual, a pilot put off immediately, and rounding the Château d’If, got on board the vessel between Cape Morgiou and Rion island.',
      'Immediately, and according to custom, the ramparts of Fort Saint-Jean were covered with spectators; it is always an event at Marseilles for a ship to come into port, especially when this ship, like the Pharaon, has been built, rigged, and laden at the ancient Phocea Docks, and belongs to an owner of the city.',
      'The ship drew on and had safely passed the strait, which some volcanic shock has made between the Calasareigne and Jaros islands; had doubled Pomègue, and approached the harbor under topsails, jib, and spanker, but so slowly and sedately that the idlers, with that instinct which is the forerunner of evil, asked one another what misfortune could have happened on board.'
    ]]
  },
  1260: {
    title: 'Chapter I',
    pages: [[
      'There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner (Mrs. Reed, when there was no company, dined early) the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further outdoor exercise was now out of the question.',
      'I was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse, and humbled by the consciousness of my physical inferiority to Eliza, John, and Georgiana Reed.',
      'The said Eliza, John, and Georgiana were now clustered round their mama in the drawing-room: she lay reclined on a sofa by the fireside, and with her darlings about her (for the time neither quarrelling nor crying) looked perfectly happy.'
    ]]
  },
  1497: {
    title: 'Book I: Of Wealth, Justice, Moderation, and Their Opposites (Socrates & Glaucon)',
    pages: [[
      'I went down yesterday to the Piraeus with Glaucon the son of Ariston, that I might offer up my prayers to the goddess; and also because I wanted to see in what manner they would celebrate the festival, which was a new thing. I was delighted with the procession of the inhabitants; but that of the Thracians was equally, if not more, beautiful.',
      'When we had finished our prayers and viewed the spectacle, we turned in the direction of the city; and at that instant Polemarchus the son of Cephalus chanced to catch sight of us from a distance as we were starting on our way home, and told his servant to run and bid us wait for him.',
      'And in Book VII, Socrates unfolds the Allegory of the Cave: “Behold! human beings living in an underground den, which has a mouth open towards the light and reaching all along the den; here they have been from their childhood, and have their legs and necks chained so that they cannot move, and can only see before them, being prevented by the chains from turning round their heads.”'
    ]]
  },
  1600: {
    title: 'The Symposium: Discourse on Eros & The Ladder of Beauty',
    pages: [[
      'Concerning the things about which you ask to be informed I believe that I am not ill-prepared with an answer. For the day before yesterday I was coming from my own home at Phalerum to the city, and one of my acquaintance, who had caught a sight of me from behind, calling out playfully in the distance, said: Apollodorus, O thou man of Phalerum, halt!',
      'And Socrates recounts the teaching of Diotima of Mantineia: “He who has been instructed thus far in the things of love, and who has learned to see the beautiful in due order and succession, when he comes toward the end will suddenly perceive a nature of wondrous beauty—not growing and decaying, or waxing and waning, but beauty absolute, separate, simple, and everlasting.”'
    ]]
  },
  1656: {
    title: 'The Apology of Socrates: Defense Before the Athenian Assembly',
    pages: [[
      'How you, O Athenians, have been affected by my accusers, I cannot tell; but I know that they almost made me forget who I was—so persuasively did they speak; and yet they have hardly uttered a word of truth.',
      'Someone will say: And are you not ashamed, Socrates, of a course of life which is likely to bring you to an untimely end? To him I may fairly answer: There you are mistaken: a man who is good for anything ought not to calculate the chance of living or dying; he ought only to consider whether in doing anything he is doing right or wrong.',
      'The dailyigh-minded inquiry into virtue is the greatest good of man, and the unexamined life is not worth living.'
    ]]
  },
  1974: {
    title: 'Part I: The Nature of Poetic Imitation, Mythos (Plot), Peripeteia & Catharsis',
    pages: [[
      'I propose to treat of Poetry in itself and of its various kinds, noting the essential quality of each; to inquire into the structure of the plot as requisite to a good poem; into the number and nature of the parts of which a poem is composed; and similarly into whatever else falls within the same inquiry.',
      'Epic poetry and Tragedy, Comedy also and Dithyrambic poetry, and the music of the flute and of the lyre in most of their forms, are all in their general conception modes of imitation (mimesis). They differ, however, from one another in three respects—the medium, the objects, the manner or mode of imitation, being in each case distinct.',
      'Tragedy, then, is an imitation of an action that is serious, complete, and of a certain magnitude; in language embellished with each kind of artistic ornament; in the form of action, not of narrative; through pity and fear effecting the proper purgation (catharsis) of these emotions. Every Tragedy must have six parts: Plot (Mythos), Character (Ethos), Diction (Lexis), Thought (Dianoia), Spectacle (Opsis), and Song (Melos).'
    ]]
  },
  8438: {
    title: 'Book I: The Good for Man — Eudaimonia & Virtue',
    pages: [[
      'Every art and every inquiry, and similarly every action and pursuit, is thought to aim at some good; and for this reason the good has rightly been declared to be that at which all things aim.',
      'If, then, there is some end of the things we do, which we desire for its own sake (everything else being desired for the sake of this), clearly this must be the good and the chief good. Will not the knowledge of it, then, have a great influence on life? Shall we not, like archers who have a mark to aim at, be more likely to hit upon what is right?',
      'Human good turns out to be activity of soul in accordance with virtue, and if there are more virtues than one, in accordance with the best and most complete—in a complete life. For one swallow does not make a summer, nor does one day.'
    ]]
  },
  6762: {
    title: 'Book I: The City-State (Polis) & Civic Partnership',
    pages: [[
      'Every state is a community of some kind, and every community is established with a view to some good; for mankind always act in order to obtain that which they think good. But, if all communities aim at some good, the state or political community, which is the highest of all, and which embraces all the rest, aims at good in a greater degree than any other, and at the highest good.',
      'Hence it is evident that the state is a creation of nature, and that man is by nature a political animal. And block by block, through speech (logos), humanity discerns the advantageous and the harmful, the just and the unjust.'
    ]]
  },
  2680: {
    title: 'Book I & II: Written Among the Quadi on the Granua',
    pages: [[
      'From my grandfather Verus I learned good morals and the government of my temper. From the reputation and remembrance of my father, modesty and a manly character. From Rusticus I received the impression that my character required improvement and discipline.',
      'Begin the morning by saying to thyself, I shall meet with the busybody, the ungrateful, arrogant, dishonest, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil. But I who have seen the nature of the good that it is beautiful, and of the bad that it is ugly, can neither be injured by any of them, for no one can fix on me what is ugly.',
      'Waste no more time arguing about what a good man should be. Be one.'
    ]]
  },
  1524: {
    title: 'Act I, Scene I: Elsinore — A Platform Before the Castle',
    pages: [[
      'BERNARDO: Who’s there? FRANCISCO: Nay, answer me: stand, and unfold yourself. BERNARDO: Long live the king! FRANCISCO: Bernardo? BERNARDO: He. FRANCISCO: You come most carefully upon your hour.',
      'HAMLET (Act III, Scene I): To be, or not to be, that is the question: Whether ’tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles, and by opposing end them?'
    ]]
  },
  1513: {
    title: 'Prologue: Two Households, Both Alike in Dignity',
    pages: [[
      'Two households, both alike in dignity, In fair Verona, where we lay our scene, From ancient grudge break to new mutiny, Where civil blood makes civil hands unclean.',
      'From forth the fatal loins of these two foes A pair of star-cross’d lovers take their life; Whose misadventur’d piteous overthrows Doth with their death bury their parents’ strife.'
    ]]
  },
  31: {
    title: 'Oedipus the King & Antigone: The Theban Plays',
    pages: [[
      'OEDIPUS: My children, latest born to Cadmus old, Why sit ye here as suppliants, in your hands Branches of olive filleted with wool? What means thisadon of incense through the town, And solemn chants and groans oflitany?',
      'ANTIGONE: Yea, for these laws were not ordained of Zeus, And she who sits enthroned with gods below, Justice, enacted not these human laws. Nor did I deem that thou, a mortal man, Couldst by a breath annul and override The immutable unwritten laws of Heaven.'
    ]]
  },
  2147: {
    title: 'The Raven & Complete Tales of Mystery and Imagination',
    pages: [[
      'Once upon a midnight dreary, while I pondered, weak and weary, Over many a quaint and curious volume of forgotten lore— While I nodded, nearly napping, suddenly there came a tapping, As of some one gently rapping, rapping at my chamber door.',
      '“’Tis some visiter,” I muttered, “tapping at my chamber door— Only this and nothing more.” Ah, distinctly I remember it was in the bleak December; And each separate dying ember wrought its ghost upon the floor.'
    ]]
  },
  1322: {
    title: 'Song of Myself — Leaves of Grass',
    pages: [[
      'I celebrate myself, and sing myself, And what I assume you shall assume, For every atom belonging to me as good belongs to you.',
      'I loafe and invite my soul, I lean and loafe at my ease observing a spear of summer grass. My tongue, every atom of my blood, form’d from this soil, this air.'
    ]]
  },
  1001: {
    title: 'Inferno: Canto I — The Dark Wood',
    pages: [[
      'Midway upon the journey of our life I found myself within a forest dark, For the straightforward pathway had been lost.',
      'Ah me! how hard a thing it is to say What was this forest savage, rough, and stern, Which in the very thought renews the fear. So bitter is it, death is little more; But of the good to treat, which there I found, Speak will I of the other things I saw there.'
    ]]
  }
};

export const getInstantClassicOpeningChapters = (
  title?: string,
  id?: string
): Array<{ title: string; body?: string; pages: string[][] }> | null => {
  const gid = (title && resolveBookGutenbergId(title)) || (id && resolveBookGutenbergId(id)) || null;
  if (!gid) return null;
  const entry = CLASSIC_INSTANT_OPENINGS[gid];
  if (entry) {
    return [{ title: entry.title, body: entry.pages[0].join('\n\n'), pages: entry.pages }];
  }
  const bookMeta = CLASSIC_BOOKS.find(b => Number(b.id) === gid);
  if (bookMeta) {
    return [{
      title: `Chapter I — ${bookMeta.title}`,
      pages: [[
        `${bookMeta.title} by ${bookMeta.authors.join(', ')}.`,
        `Preserved in the Lorea Literary Press Public Domain Vault (${bookMeta.subjects.join(' · ')}). Full chapters are streaming from the archive and will populate the table of contents momentarily.`
      ]]
    }];
  }
  return null;
};



