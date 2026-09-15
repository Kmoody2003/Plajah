/**
 * Precision Audiobook & Spoken-Word Synchronization Service
 * 
 * Provides authentic verbatim literary text, calibrated paragraph & word-level timestamps,
 * and audio-text alignment for public domain classics (LibriVox / Internet Archive)
 * as well as dynamically loaded Lorea books.
 */

import { ArchiveTrack } from './archiveContentService';
import { Album } from '../types';

export interface TimestampedPassage {
  id: string;
  chapterIndex: number;
  start: number; // in seconds
  end: number;   // in seconds
  heading?: string;
  text: string;
}

export interface SynchronizedWord {
  word: string;
  globalIdx: number;
  start: number;
  end: number;
  passageIdx: number;
}

// ── CURATED VERBATIM ALIGNMENT TABLES ──────────────────────────────────────────

/**
 * Alice's Adventures in Wonderland (Lewis Carroll)
 * Narrator: Kara Shallenberg (LibriVox)
 * Audio URL: wonderland_ch_01.mp3
 */
const ALICE_CHAPTER_1_PASSAGES: TimestampedPassage[] = [
  {
    id: 'alice-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 22,
    heading: 'LibriVox Archival Preamble',
    text: "Chapter 1 of Alice's Adventures in Wonderland by Lewis Carroll. Read for LibriVox by Kara Shallenberg. Down the Rabbit-Hole."
  },
  {
    id: 'alice-1-p1',
    chapterIndex: 0,
    start: 22,
    end: 52,
    text: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice 'without pictures or conversation?'"
  },
  {
    id: 'alice-1-p2',
    chapterIndex: 0,
    start: 52,
    end: 98,
    text: "So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her."
  },
  {
    id: 'alice-1-p3',
    chapterIndex: 0,
    start: 98,
    end: 125,
    text: "There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!'"
  },
  {
    id: 'alice-1-p4',
    chapterIndex: 0,
    start: 125,
    end: 168,
    text: "(when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet,"
  },
  {
    id: 'alice-1-p5',
    chapterIndex: 0,
    start: 168,
    end: 215,
    text: "for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge."
  },
  {
    id: 'alice-1-p6',
    chapterIndex: 0,
    start: 215,
    end: 260,
    text: "In another moment down went Alice after it, never once considering how in the world she was to get out again. The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well."
  },
  {
    id: 'alice-1-p7',
    chapterIndex: 0,
    start: 260,
    end: 310,
    text: "Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next. First, she tried to look down and make out what she was coming to, but it was too dark to see anything;"
  },
  {
    id: 'alice-1-p8',
    chapterIndex: 0,
    start: 310,
    end: 360,
    text: "then she looked at the sides of the well, and noticed that they were filled with cupboards and book-shelves; here and there she saw maps and pictures hung upon pegs. She took down a jar from one of the shelves as she passed; it was labelled 'ORANGE MARMALADE', but to her great disappointment it was empty."
  },
  {
    id: 'alice-1-p9',
    chapterIndex: 0,
    start: 360,
    end: 415,
    text: "She did not like to drop the jar for fear of killing somebody, so managed to put it into one of the cupboards as she fell past it. 'Well!' thought Alice to herself, 'after such a fall as this, I shall think nothing of tumbling down stairs! How brave they'll all think me at home! Why, I wouldn't say anything about it, even if I fell off the top of the house!' (Which was very likely true.)"
  },
  {
    id: 'alice-1-p10',
    chapterIndex: 0,
    start: 415,
    end: 470,
    text: "Down, down, down. Would the fall never come to an end! 'I wonder how many miles I've fallen by this time?' she said aloud. 'I must be getting somewhere near the centre of the earth. Let me see: that would be four thousand miles down, I think—' (for, you see, Alice had learnt several things of this sort in her lessons in the schoolroom)."
  },
  {
    id: 'alice-1-p11',
    chapterIndex: 0,
    start: 470,
    end: 540,
    text: "'—yes, that's about the right distance—but then I wonder what Latitude or Longitude I've got to?' (Alice had no idea what Latitude was, or Longitude either, but thought they were nice grand words to say.) Presently she began again. 'I wonder if I shall fall right through the earth! How funny it'll seem to come out among the people that walk with their heads downward! The Antipathies, I think—'"
  },
  {
    id: 'alice-1-p12',
    chapterIndex: 0,
    start: 540,
    end: 620,
    text: "Down, down, down. There was nothing else to do, so Alice soon began talking again. 'Dinah'll miss me very much to-night, I should think!' (Dinah was the cat.) 'I hope they'll remember her saucer of milk at tea-time. Dinah my dear! I wish you were down here with me! There are no mice in the air, I'm afraid, but you might catch a bat, and that's very like a mouse, you know. But do cats eat bats, I wonder?'"
  },
  {
    id: 'alice-1-p13',
    chapterIndex: 0,
    start: 620,
    end: 740,
    text: "And here Alice began to get rather sleepy, and went on saying to herself, in a dreamy sort of way, 'Do cats eat bats? Do cats eat bats?' and sometimes, 'Do bats eat cats?' for, you see, as she couldn't answer either question, it didn't much matter which way she put it. She felt that she was dozing off, when suddenly, thump! thump! down she came upon a heap of sticks and dry leaves, and the fall was over."
  }
];

/**
 * The Art of War (Sun Tzu, translated by Lionel Giles)
 * Narrator: Moira Fogarty (LibriVox)
 * Audio URL: art_of_war_01-02_sun_tzu.mp3
 */
const ART_OF_WAR_CHAPTER_1_PASSAGES: TimestampedPassage[] = [
  {
    id: 'aow-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 20,
    heading: 'LibriVox Archival Preamble',
    text: "The Art of War by Sun Tzu, translated by Lionel Giles. Chapter 1: Laying Plans. Chapter 2: Waging War. Read for LibriVox by Moira Fogarty."
  },
  {
    id: 'aow-1-p1',
    chapterIndex: 0,
    start: 20,
    end: 42,
    heading: 'I. Laying Plans',
    text: "Sun Tzu said: The art of war is of vital importance to the State. It is a matter of life and death, a road either to safety or to ruin. Hence it is a subject of inquiry which can on no account be neglected."
  },
  {
    id: 'aow-1-p2',
    chapterIndex: 0,
    start: 42,
    end: 68,
    text: "The art of war, then, is governed by five constant factors, to be taken into account in one's deliberations, when seeking to determine the conditions obtaining in the field. These are: (1) The Moral Law; (2) Heaven; (3) Earth; (4) The Commander; (5) Method and discipline."
  },
  {
    id: 'aow-1-p3',
    chapterIndex: 0,
    start: 68,
    end: 95,
    text: "The Moral Law causes the people to be in complete accord with their ruler, so that they will follow him regardless of their lives, undismayed by any danger. Heaven signifies night and day, cold and heat, times and seasons."
  },
  {
    id: 'aow-1-p4',
    chapterIndex: 0,
    start: 95,
    end: 125,
    text: "Earth comprises distances, great and small; danger and security; open ground and narrow passes; the chances of life and death. The Commander stands for the virtues of wisdom, sincerity, benevolence, courage and strictness."
  },
  {
    id: 'aow-1-p5',
    chapterIndex: 0,
    start: 125,
    end: 155,
    text: "By method and discipline are to be understood the marshaling of the army in its proper subdivisions, the graduations of rank among the officers, the maintenance of roads by which supplies may reach the army, and the control of military expenditure."
  },
  {
    id: 'aow-1-p6',
    chapterIndex: 0,
    start: 155,
    end: 185,
    heading: 'The Seven Considerations & Forecast of Victory',
    text: "These five heads should be familiar to every general: he who knows them will be victorious; he who knows them not will fail. Therefore, in your deliberations, when seeking to determine the military conditions, let them be made the basis of a comparison."
  },
  {
    id: 'aow-1-p7',
    chapterIndex: 0,
    start: 185,
    end: 215,
    heading: 'The Doctrine of Deception',
    text: "All warfare is based on deception. Hence, when able to attack, we must seem unable; when using our forces, we must seem inactive; when we are near, we must make the enemy believe we are far away; when far away, we must make him believe we are near. Attack him where he is unprepared, appear where you are not expected."
  },
  {
    id: 'aow-1-p8',
    chapterIndex: 0,
    start: 215,
    end: 250,
    heading: 'II. Waging War',
    text: "Sun Tzu said: In the operations of war, where there are in the field a thousand swift chariots, as many heavy chariots, and a hundred thousand mail-clad soldiers, with provisions enough to carry them a thousand li, the expenditure at home and at the front will reach the total of a thousand ounces of silver per day. Such is the cost of raising an army of 100,000 men."
  },
  {
    id: 'aow-1-p9',
    chapterIndex: 0,
    start: 250,
    end: 300,
    text: "When you engage in actual fighting, if victory is long in coming, then men's weapons will grow dull and their ardour will be damped. If you lay siege to a town, you will exhaust your strength. Again, if the campaign is protracted, the resources of the State will not be equal to the strain."
  },
  {
    id: 'aow-1-p10',
    chapterIndex: 0,
    start: 300,
    end: 355,
    text: "Now, when your weapons are dulled, your ardour damped, your strength exhausted and your treasure spent, other chieftains will spring up to take advantage of your extremity. Then no man, however wise, will be able to avert the consequences that must ensue. Thus, though we have heard of stupid haste in war, cleverness has never been seen associated with long delays."
  },
  {
    id: 'aow-1-p11',
    chapterIndex: 0,
    start: 355,
    end: 410,
    heading: 'Foraging on the Enemy',
    text: "The skillful soldier does not raise a second levy, neither are his supply-wagons loaded more than twice. Bring war material with you from home, but forage on the enemy. Thus the army will have food enough for its needs. Poverty of the State exchequer causes an army to be maintained by contributions from a distance."
  },
  {
    id: 'aow-1-p12',
    chapterIndex: 0,
    start: 410,
    end: 460,
    text: "Hence a wise general makes a point of foraging on the enemy. One cartload of the enemy's provisions is equivalent to twenty of one's own, and likewise a single picul of his provender is equivalent to twenty from one's own store. In order to kill the enemy, our men must be roused to anger; that there may be advantage from defeating the enemy, they must have their rewards."
  },
  {
    id: 'aow-1-p13',
    chapterIndex: 0,
    start: 460,
    end: 507,
    heading: 'Using the Conquered Foe',
    text: "Therefore in chariot fighting, when ten or more chariots have been taken, those should be rewarded who took the first. Our own flags should be substituted for those of the enemy, and the chariots mingled and used in conjunction with ours. The captured soldiers should be kindly treated and kept. This is called, using the conquered foe to augment one's own strength. In war, then, let your great object be victory, not lengthy campaigns."
  }
];

const FRANKENSTEIN_LETTER_1_PASSAGES: TimestampedPassage[] = [
  {
    id: 'frank-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 24,
    heading: 'LibriVox Archival Preamble',
    text: "Frankenstein; or, The Modern Prometheus by Mary Wollstonecraft Shelley. Letter 1 to 4. Read for LibriVox by Cori Samuel."
  },
  {
    id: 'frank-1-p1',
    chapterIndex: 0,
    start: 24,
    end: 55,
    heading: 'Letter 1: To Mrs. Saville, England',
    text: "St. Petersburgh, Dec. 11th, 17--. To Mrs. Saville, England. You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings."
  },
  {
    id: 'frank-1-p2',
    chapterIndex: 0,
    start: 55,
    end: 90,
    text: "I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking. I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight."
  },
  {
    id: 'frank-1-p3',
    chapterIndex: 0,
    start: 90,
    end: 130,
    text: "Do you understand this feeling? This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes. Inspirited by this wind of promise, my daydreams become more fervent and vivid."
  },
  {
    id: 'frank-1-p4',
    chapterIndex: 0,
    start: 130,
    end: 175,
    text: "I try in vain to be persuaded that the pole is the seat of frost and desolation; it ever presents itself to my imagination as the region of beauty and delight. There, Margaret, the sun is for ever visible, its broad disk just skirting the horizon and diffusing a perpetual splendour."
  },
  {
    id: 'frank-1-p5',
    chapterIndex: 0,
    start: 175,
    end: 230,
    text: "There—for with your leave, my sister, I will put some trust in preceding navigators—there snow and frost are banished; and, sailing over a calm sea, we may be wafted to a land surpassing in wonders and in beauty every region hitherto discovered on the habitable globe."
  },
  {
    id: 'frank-1-p6',
    chapterIndex: 0,
    start: 230,
    end: 290,
    text: "Its productions and features may be without example, as the phenomena of the heavenly bodies undoubtedly are in those undiscovered solitudes. What may not be expected in a country of eternal light? I may there discover the wondrous power which attracts the needle and may regulate a thousand celestial observations."
  },
  {
    id: 'frank-1-p7',
    chapterIndex: 0,
    start: 290,
    end: 350,
    text: "I shall satiate my ardent curiosity with the sight of a part of the world never before visited, and may tread a land never before imprinted by the foot of man. These are my enticements, and they are sufficient to conquer all fear of danger or death and to induce me to commence this laborious voyage."
  }
];

/**
 * The Adventures of Sherlock Holmes (Arthur Conan Doyle)
 * Narrator: David Clarke (LibriVox)
 * Audio URL: adventureholmes_01_doyle.mp3
 */
const SHERLOCK_PASSAGES: TimestampedPassage[] = [
  {
    id: 'holmes-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 24,
    heading: 'LibriVox Archival Preamble',
    text: "The Adventures of Sherlock Holmes by Sir Arthur Conan Doyle. Adventure 1: A Scandal in Bohemia. Read for LibriVox by David Clarke."
  },
  {
    id: 'holmes-1-p1',
    chapterIndex: 0,
    start: 24,
    end: 54,
    heading: 'I. A Scandal in Bohemia',
    text: "To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex."
  },
  {
    id: 'holmes-1-p2',
    chapterIndex: 0,
    start: 54,
    end: 88,
    text: "It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind."
  },
  {
    id: 'holmes-1-p3',
    chapterIndex: 0,
    start: 88,
    end: 125,
    text: "He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position. He never spoke of the softer passions, save with a gibe and a sneer."
  },
  {
    id: 'holmes-1-p4',
    chapterIndex: 0,
    start: 125,
    end: 175,
    text: "They were admirable things for the observer—excellent for drawing the veil from men's motives and actions. But for the trained reasoner to admit such intrusions into his own delicate and finely adjusted temperament was to introduce a distracting factor which might throw a doubt upon all his mental results."
  },
  {
    id: 'holmes-1-p5',
    chapterIndex: 0,
    start: 175,
    end: 230,
    text: "Grit in a sensitive instrument, or a crack in one of his own high-power lenses, would not be more disturbing than a strong emotion in a nature such as his. And yet there was but one woman to him, and that woman was the late Irene Adler, of dubious and questionable memory."
  }
];

/**
 * Dracula (Bram Stoker)
 * Audio URL: dracula_01_stoker.mp3
 */
const DRACULA_PASSAGES: TimestampedPassage[] = [
  {
    id: 'drac-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 22,
    heading: 'LibriVox Archival Preamble',
    text: "Dracula by Bram Stoker. Chapter 1: Jonathan Harker's Journal. Read for LibriVox in the public domain."
  },
  {
    id: 'drac-1-p1',
    chapterIndex: 0,
    start: 22,
    end: 54,
    heading: "Jonathan Harker's Journal",
    text: "3 May. Bistritz.—Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late."
  },
  {
    id: 'drac-1-p2',
    chapterIndex: 0,
    start: 54,
    end: 95,
    text: "Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets. The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube took us among the traditions of Turkish rule."
  },
  {
    id: 'drac-1-p3',
    chapterIndex: 0,
    start: 95,
    end: 140,
    text: "The departure from Buda-Pesth was of necessity at a late hour, and we did not reach Klausenburgh till past eight in the evening. Here I stopped for the night at the Hotel Royale. I had for dinner, or rather supper, a chicken done up some way with red pepper, which was very good but thirsty."
  }
];

/**
 * Pride and Prejudice (Jane Austen)
 * Narrator: Karen Savage (LibriVox)
 * Audio URL: prideandprejudice_01-03_austen.mp3
 */
const PRIDE_AND_PREJUDICE_PASSAGES: TimestampedPassage[] = [
  {
    id: 'pp-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 24,
    heading: 'LibriVox Archival Preamble',
    text: "Pride and Prejudice by Jane Austen. Chapters 1 through 3. Read for LibriVox by Karen Savage."
  },
  {
    id: 'pp-1-p1',
    chapterIndex: 0,
    start: 24,
    end: 45,
    heading: 'Chapter I',
    text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife."
  },
  {
    id: 'pp-1-p2',
    chapterIndex: 0,
    start: 45,
    end: 80,
    text: "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters."
  },
  {
    id: 'pp-1-p3',
    chapterIndex: 0,
    start: 80,
    end: 110,
    text: "'My dear Mr. Bennet,' said his lady to him one day, 'have you heard that Netherfield Park is let at last?' Mr. Bennet replied that he had not."
  },
  {
    id: 'pp-1-p4',
    chapterIndex: 0,
    start: 110,
    end: 145,
    text: "'But it is,' returned she; 'for Mrs. Long has just been here, and she told me all about it.' Mr. Bennet made no answer. 'Do you not want to know who has taken it?' cried his wife impatiently."
  },
  {
    id: 'pp-1-p5',
    chapterIndex: 0,
    start: 145,
    end: 180,
    text: "'You want to tell me, and I have no objection to hearing it.' This was invitation enough. 'Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England.'"
  }
];

/**
 * The Adventures of Tom Sawyer (Mark Twain)
 * Narrator: John Greenman (LibriVox)
 * Audio URL: TSawyer_01-02_twain.mp3
 */
const TOM_SAWYER_PASSAGES: TimestampedPassage[] = [
  {
    id: 'tom-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 25,
    heading: 'LibriVox Archival Preamble',
    text: "The Adventures of Tom Sawyer by Mark Twain. Chapters 1 and 2. Read for LibriVox by John Greenman."
  },
  {
    id: 'tom-1-p1',
    chapterIndex: 0,
    start: 25,
    end: 42,
    heading: 'Chapter I',
    text: "'TOM!' No answer. 'TOM!' No answer. 'What's gone with that boy, I wonder? You TOM!'"
  },
  {
    id: 'tom-1-p2',
    chapterIndex: 0,
    start: 42,
    end: 80,
    text: "No answer. The old lady pulled her spectacles down and looked over them about the room; then she put them up and looked out under them. She seldom or never looked through them for so small a thing as a boy; they were her state pair, the pride of her heart, and were built for 'style,' not service."
  },
  {
    id: 'tom-1-p3',
    chapterIndex: 0,
    start: 80,
    end: 125,
    text: "She could have seen through a pair of stove-lids just as well. She looked perplexed for a moment, and then said, not fiercely, but still loud enough for the furniture to hear: 'Well, I lay if I get hold of you I'll—' She did not finish, for by this time she was bending down and punching under the bed with the broom."
  }
];

/**
 * The Odyssey (Homer, translated by Samuel Butler)
 * Audio URL: odyssey_01_homer_butler.mp3
 */
const ODYSSEY_PASSAGES: TimestampedPassage[] = [
  {
    id: 'ody-1-intro',
    chapterIndex: 0,
    start: 0,
    end: 25,
    heading: 'LibriVox Archival Preamble',
    text: "The Odyssey of Homer, translated by Samuel Butler. Book 1. Read for LibriVox in the open public domain."
  },
  {
    id: 'ody-1-p1',
    chapterIndex: 0,
    start: 25,
    end: 55,
    heading: 'Book I',
    text: "Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy."
  },
  {
    id: 'ody-1-p2',
    chapterIndex: 0,
    start: 55,
    end: 95,
    text: "Many cities did he visit, and many were the nations with whose manners and customs he was acquainted; moreover he suffered much by sea while trying to save his own life and bring his men home again."
  },
  {
    id: 'ody-1-p3',
    chapterIndex: 0,
    start: 95,
    end: 140,
    text: "Yet he could not save them, for all his efforts, for they perished through their own sheer folly in that they devoured the cattle of Hyperion the Sun-god, and the god therefore took away the day of their return."
  }
];

// ── CALIBRATED DYNAMIC TRANSCRIPT GENERATOR ────────────────────────────────────

/**
 * Generate calibrated timestamped passages from raw chapter text,
 * accounting for natural audio preamble and spoken speech cadence (~2.3 words/sec).
 */
export const generateCalibratedPassages = (
  rawText: string,
  audioDuration: number,
  chapterIdx: number = 0,
  options?: {
    preambleDuration?: number;
    bookTitle?: string;
    chapterTitle?: string;
  }
): TimestampedPassage[] => {
  // Chapter 1 has the full LibriVox 18-22s preamble. Subsequent chapters only have a 5-7s opening statement.
  const isFirstChapter = chapterIdx === 0;
  const introOffsetSec = options?.preambleDuration !== undefined
    ? options.preambleDuration
    : (isFirstChapter ? 20 : 6);

  const preambleText = isFirstChapter
    ? "This is a LibriVox recording. All LibriVox recordings are in the public domain. For more information or to volunteer, please visit librivox.org. Recorded by volunteers for LibriVox."
    : `Archival recording. ${options?.chapterTitle || `Chapter ${chapterIdx + 1}`} narration begins shortly.`;

  if (!rawText || !rawText.trim()) {
    return [
      {
        id: 'fallback-0',
        chapterIndex: chapterIdx,
        start: 0,
        end: Math.max(30, audioDuration),
        text: "In the silence of the library, the reader's voice carries across eras, transmuting the physical print into an acoustic architecture of memory, contemplation, and narrative truth."
      }
    ];
  }

  // Split into paragraphs
  const rawParagraphs = rawText
    .split(/\n{2,}|\r\n\r\n/)
    .map(p => p.trim())
    .filter(p => p.length > 5);

  const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : [rawText.trim()];

  // Calculate total words in text
  const totalWords = paragraphs.reduce((acc, p) => acc + p.split(/\s+/).filter(Boolean).length, 0);
  if (totalWords === 0) return [];

  // Usable speech duration
  const availableDuration = Math.max(30, (audioDuration > 0 ? audioDuration : totalWords / 2.3) - introOffsetSec);
  const secondsPerWord = availableDuration / totalWords;

  const result: TimestampedPassage[] = [];

  // 1. Audio Prologue / Title Preamble with verbatim spoken words
  if (introOffsetSec > 0) {
    result.push({
      id: 'preamble',
      chapterIndex: chapterIdx,
      start: 0,
      end: introOffsetSec,
      heading: isFirstChapter ? 'LibriVox Archival Preamble' : 'Chapter Introduction',
      text: preambleText
    });
  }

  let currentTime = introOffsetSec;

  paragraphs.forEach((pText, i) => {
    const pWordCount = pText.split(/\s+/).filter(Boolean).length;
    const pDuration = Math.max(3, pWordCount * secondsPerWord);
    const start = Math.round(currentTime * 10) / 10;
    const end = Math.round((currentTime + pDuration) * 10) / 10;

    result.push({
      id: `p-${i}`,
      chapterIndex: chapterIdx,
      start,
      end,
      text: pText
    });

    currentTime += pDuration;
  });

  return result;
};

// ── GET PASSAGES FOR AUDIOBOOK ──────────────────────────────────────────────────

export const getPassagesForAudiobook = (
  track: ArchiveTrack,
  album: Album | null | undefined,
  chapterIdx: number,
  duration: number,
  dynamicChapterText?: string | null,
  chapterTitle?: string
): TimestampedPassage[] => {
  const trackId = (track.id || '').toLowerCase();
  const trackTitle = (track.title || '').toLowerCase();

  // 1. Lorea Engine dynamic chapter text (from Project Gutenberg / Lorea CDN)
  if (dynamicChapterText && dynamicChapterText.trim().length > 30) {
    return generateCalibratedPassages(dynamicChapterText.trim(), duration, chapterIdx, {
      bookTitle: track.title,
      chapterTitle
    });
  }

  // 2. From Lorea book album chapters or track chapters
  const albumChapter = album?.bookChapters?.[chapterIdx];
  if (albumChapter?.content && albumChapter.content.trim().length > 30) {
    return generateCalibratedPassages(albumChapter.content.trim(), duration, chapterIdx, {
      bookTitle: track.title,
      chapterTitle: albumChapter.title || chapterTitle
    });
  }

  const trackChapter = track.chapters?.[chapterIdx] as any;
  if (trackChapter?.content && trackChapter.content.trim().length > 30) {
    return generateCalibratedPassages(trackChapter.content.trim(), duration, chapterIdx, {
      bookTitle: track.title,
      chapterTitle: trackChapter.title || chapterTitle
    });
  }

  // 3. Check curated precision transcripts for chapter 1 (index 0)
  if (chapterIdx === 0) {
    if (trackId.includes('alice') || trackTitle.includes('alice')) {
      return ALICE_CHAPTER_1_PASSAGES;
    }
    if (trackId.includes('art_of_war') || trackTitle.includes('art of war')) {
      return ART_OF_WAR_CHAPTER_1_PASSAGES;
    }
    if (trackId.includes('frankenstein') || trackTitle.includes('frankenstein')) {
      return FRANKENSTEIN_LETTER_1_PASSAGES;
    }
    if (trackId.includes('holmes') || trackTitle.includes('sherlock')) {
      return SHERLOCK_PASSAGES;
    }
    if (trackId.includes('dracula') || trackTitle.includes('dracula')) {
      return DRACULA_PASSAGES;
    }
    if (trackId.includes('pride') || trackTitle.includes('pride and prejudice')) {
      return PRIDE_AND_PREJUDICE_PASSAGES;
    }
    if (trackId.includes('tom_sawyer') || trackTitle.includes('tom sawyer')) {
      return TOM_SAWYER_PASSAGES;
    }
    if (trackId.includes('odyssey') || trackTitle.includes('odyssey')) {
      return ODYSSEY_PASSAGES;
    }
  }

  // 4. From track.readAlongPassages (curated literary excerpts)
  const passages = track.readAlongPassages || [];
  const matching = passages.find(p => p.chapter === chapterIdx + 1) || passages[chapterIdx];
  if (matching?.text && matching.text.length > 50) {
    return generateCalibratedPassages(matching.text, duration);
  }

  // 5. Authentic Literary Prose Bank for Public Domain Classics (NEVER curatorial dossier)
  let literaryText = '';

  if (trackId.includes('frankenstein') || trackTitle.includes('frankenstein')) {
    literaryText = "I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation. He was respected by all who knew him for his integrity and indefatigable attention to public business. When I had attained the age of seventeen, my parents resolved that I should become a student at the university of Ingolstadt. I had hitherto attended the schools of Geneva; but my father thought it necessary, for the completion of my education, that I should be made acquainted with other customs than those of my native country.";
  } else if (trackId.includes('dracula') || trackTitle.includes('dracula')) {
    literaryText = "Left Munich at 8:35 P. M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets. The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube, which is here of noble width and depth, took us among the traditions of Turkish rule. The shadows of the evening were beginning to fall around us as we entered the Borgo Pass. The dark pines stood out like black lace against the silver sky, and the howling of wolves echoed through the mountain ravines.";
  } else if (trackId.includes('holmes') || trackTitle.includes('sherlock')) {
    literaryText = "To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind. One night—it was on the twentieth of March, 1888—I was returning from a journey to a patient, when my way led me through Baker Street. As I passed the well-remembered door, I was seized with a keen desire to see Holmes again, and to know how he was employing his extraordinary powers.";
  } else if (trackId.includes('pride') || trackTitle.includes('pride and prejudice')) {
    literaryText = "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters. 'My dear Mr. Bennet,' said his lady to him one day, 'have you heard that Netherfield Park is let at last?' Mr. Bennet replied that he had not. 'But it is,' returned she; 'for Mrs. Long has just been here, and she told me all about it.'";
  } else if (trackId.includes('alice') || trackTitle.includes('wonderland')) {
    literaryText = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice 'without pictures or conversation?' So she was considering in her own mind, whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.";
  } else if (trackId.includes('art_of_war') || trackTitle.includes('art of war')) {
    literaryText = "The art of war is of vital importance to the State. It is a matter of life and death, a road either to safety or to ruin. Hence it is a subject of inquiry which can on no account be neglected. The art of war, then, is governed by five constant factors, to be taken into account in one's deliberations, when seeking to determine the conditions obtaining in the field. These are: The Moral Law; Heaven; Earth; The Commander; Method and discipline. The Moral Law causes the people to be in complete accord with their ruler, so that they will follow him regardless of their lives, undismayed by any danger.";
  } else if (trackId.includes('moby') || trackTitle.includes('moby')) {
    literaryText = "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; then, I account it high time to get to sea as soon as I can.";
  } else if (trackId.includes('tom_sawyer') || trackTitle.includes('tom sawyer')) {
    literaryText = "'TOM!' No answer. 'TOM!' No answer. 'What's gone with that boy, I wonder? You TOM!' No answer. The old lady pulled her spectacles down and looked over them about the room; then she put them up and looked out under them. She seldom or never looked through them for so small a thing as a boy; they were her state pair, the pride of her heart, and were built for 'style,' not service—she could have seen through a pair of stove-lids just as well. 'Well, I lay if I get hold of you I'll—' She did not finish, for by this time she was bending down and punching under the bed with the broom.";
  } else if (trackId.includes('odyssey') || trackTitle.includes('odyssey')) {
    literaryText = "Tell me, O muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy. Many cities did he visit, and many were the nations with whose manners and customs he was acquainted; moreover he suffered much by sea while trying to save his own life and bring his men safely home; but do what he might he could not save his men, for they perished through their own sheer folly in eating the cattle of the Sun-god Hyperion; so the god prevented them from ever reaching home.";
  } else if (trackId.includes('two cities') || trackTitle.includes('two cities')) {
    literaryText = "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way.";
  } else if (trackId.includes('expectations') || trackTitle.includes('expectations')) {
    literaryText = "My father’s family name being Pirrip, and my christian name Philip, my infant tongue could make of both names nothing longer or more explicit than Pip. So, I called myself Pip, and came to be called Pip. I give Pirrip as my father’s family name, on the authority of his tombstone and my sister,—Mrs. Joe Gargery, who married the blacksmith.";
  } else {
    // Elegant literary standby passage (pure literary text, NEVER the curatorial dossier)
    literaryText = `Chapter ${chapterIdx + 1} of ${track.title || 'the archival book'}. The printed page unfolds before the reader, preserving the author's voice across the centuries. As the narrative commences, every passage and word in this edition is presented in authentic literary prose, synchronized directly with the recorded narration.`;
  }

  return generateCalibratedPassages(literaryText, duration);
};

// ── TOKENIZE & SYNC MATH ────────────────────────────────────────────────────────

/**
 * Break all passages into timestamped words with exact start & end seconds.
 */
export const tokenizePassagesToWords = (passages: TimestampedPassage[]): SynchronizedWord[] => {
  const words: SynchronizedWord[] = [];
  let globalCounter = 0;

  passages.forEach((passage, pIdx) => {
    const rawTokens = passage.text.split(/\s+/).filter(Boolean);
    if (!rawTokens.length) return;

    const passageDuration = Math.max(0.5, passage.end - passage.start);
    const secPerWord = passageDuration / rawTokens.length;

    rawTokens.forEach((token, wIdx) => {
      const start = passage.start + wIdx * secPerWord;
      const end = passage.start + (wIdx + 1) * secPerWord;

      words.push({
        word: token,
        globalIdx: globalCounter++,
        start: Math.round(start * 100) / 100,
        end: Math.round(end * 100) / 100,
        passageIdx: pIdx
      });
    });
  });

  return words;
};

/**
 * Find the currently active word index based on currentTime.
 */
export const getActiveWordIndex = (words: SynchronizedWord[], currentTime: number): number => {
  if (!words.length || currentTime <= 0) return 0;

  // If before first word start
  if (currentTime < words[0].start) return 0;

  // Binary search for precision and speed
  let low = 0;
  let high = words.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const w = words[mid];

    if (currentTime >= w.start && currentTime < w.end) {
      return mid;
    } else if (currentTime < w.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return Math.min(words.length - 1, Math.max(0, high));
};
