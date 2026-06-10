import type { ArchiveBook } from '../services/archiveContentService';

const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';

const gcov   = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
// Primary source — hosted on Plajah's own Firebase Storage, no proxy needed.
const gstore = (id: number) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`books/classics/${id}/text.txt`)}?alt=media`;
// Fallback — only used until the seed endpoint has uploaded the book.
const gtxt   = (id: number) => `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;

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
    // Firebase Storage URL is the primary; BookTab picks 'text/plain; charset=utf-8' first.
    'text/plain; charset=utf-8': gstore(id),
    // Keep Gutenberg TXT as an explicit fallback key so BookTab can try it if needed.
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
];
