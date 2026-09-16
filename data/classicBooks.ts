import type { ArchiveBook } from '../services/archiveContentService';

const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';

const gcov   = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
// EPUB (no images) — best format: native chapters, pagination, TOC via react-reader
const gepub  = (id: number) => `https://www.gutenberg.org/ebooks/${id}.epub.noimages`;
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
    // BookTab prefers application/epub+zip first for native chapter navigation
    'application/epub+zip': gepub(id),
    // TXT kept so BookTab can fall back when EPUB fails
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
];

export const resolveBookGutenbergId = (titleOrId: string): number | null => {
  if (!titleOrId) return null;
  const num = parseInt(titleOrId, 10);
  if (!isNaN(num) && num > 0) return num;

  const s = titleOrId.toLowerCase();
  if (s.includes('frankenstein')) return 84;
  if (s.includes('alice') || s.includes('wonderland')) return 11;
  if (s.includes('art of war') || s.includes('art_of_war')) return 17405;
  if (s.includes('sherlock') || s.includes('holmes')) return 1661;
  if (s.includes('dracula')) return 345;
  if (s.includes('pride') && s.includes('prejudice')) return 1342;
  if (s.includes('odyssey')) return 1727;
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
  if (s.includes('metamorphosis')) return 5200;
  if (s.includes('monte cristo')) return 1184;

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

