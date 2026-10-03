import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const lid = (n: number) => `lit-studies-early.l${String(n).padStart(2, '0')}`;
const mc = (n: number, q: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const l = lid(n);
  const target = (n * 3 + q * 5) % 4;
  const rotated = choices.map((_, i) => choices[(i - target + 4) % 4]);
  return { id: `${l}.q${q}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (n: number, q: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${lid(n)}.q${q}`, lessonId: lid(n), kind: 'tf', prompt, answer, hint, explanation, level });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lit-studies-early',
    label: 'Literature Deep Study I: Antiquity to 1800',
    blurb: 'Learn how to read closely, then apply it to the great works of the ancient, medieval, Renaissance and Enlightenment worlds, from Gilgamesh and Homer to Shakespeare, Cervantes, Milton and Voltaire. Public-domain works only.',
    accent: '#7A2BD6',
    framework: 'ncas',
    tracks: [
      {
        id: 'lit-studies-early.t1',
        title: 'Tools for Close Reading',
        blurb: 'The habits of mind that turn reading into interpretation: attention, genre, voice and theme.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: lid(1),
            title: 'How to Read Closely',
            blurb: 'Close reading means slowing down, noticing choices, and building claims from the words on the page.',
            minutes: 7,
            body: `Close reading is the practice of paying careful attention to how a text says what it says. Instead of asking only "What happens?", you ask "Why did the writer choose these words, in this order, here?" Every text is a set of choices: which word, which image, which sentence length, which detail to include and which to leave out.

A simple method has three moves.
1. First, notice: read a short passage slowly, ideally twice, and mark anything that stands out, such as a repeated word, an odd image, a sudden change of tone, or a question.
2. Second, wonder: ask what each noticed detail might do. Does the repetition build tension? Does the image make an abstract idea concrete?
3. Third, argue: form a claim and support it with evidence from the passage itself.

Take the opening of Shakespeare's Sonnet 18, "Shall I compare thee to a summer's day?" The poem begins with a question, so the speaker seems to be thinking aloud. By line 3 the line "Rough winds do shake the darling buds of May" begins to list what is wrong with summer: roughness, shaking, and a season that is short. A noticing reader sees that the poem starts as a comparison but quickly turns into a list of summer's flaws. A claim might be: the poem builds its praise by showing that the beloved is steadier than nature.

Good close reading stays tied to the text. Quote briefly, point to specific words, and say what they do. Opinions are welcome, but a claim that no passage could support is only a guess.`,
          },
          {
            id: lid(2),
            title: 'Genre: Reading With the Right Expectations',
            blurb: 'Genres are shared agreements between writers and readers; recognizing them tells you what to look for.',
            minutes: 7,
            body: `A genre is a family of works that share conventions, meaning habits that writers use and readers expect. Genre works like a contract: when you open a mystery you expect a puzzle, and when you open a love poem you expect feeling rather than a courtroom argument. Knowing the genre tells you which questions are fair to ask.

The major families for this course are epic, lyric, drama and narrative prose. An epic is a long narrative poem about heroes and large events, usually told in an elevated style. A lyric is a shorter poem that expresses a speaker's thought or feeling, often in a compressed, musical form. Drama is writing meant to be performed, where characters speak for themselves and the author is mostly absent. Prose narrative, including the novel, tells a story in ordinary sentences rather than lines of verse. Within these families are smaller kinds, such as tragedy, comedy, satire, romance and essay.

Genres also change over time. Writers imitate, combine and break conventions. Miguel de Cervantes wrote Don Quixote partly by imitating, and gently mocking, the chivalric romances that his hero has read too much of. That joke only works if the reader already knows what a romance is supposed to do.

When you meet a new work, ask: What genre does it claim to be? What conventions does it follow? Where does it surprise me? A convention that is followed tells you the tradition; a convention that is broken is often where the writer is saying something new.`,
          },
          {
            id: lid(3),
            title: 'Narrative Voice and Point of View',
            blurb: 'Who tells the story, and how much they know and can be trusted, shapes everything a reader learns.',
            minutes: 7,
            body: `Every story has a narrator, the voice that delivers it, and that voice is not the same as the author. A narrator is a created speaker with a position, a range of knowledge and sometimes a motive. Learning to ask "Who is telling this, and why should I believe them?" is one of the most useful close-reading skills.

Point of view describes the narrator's position. In first person, a character says "I" and tells the story from inside it, so we only know what that person knows or admits. In third person, a voice outside the characters tells what happens. An omniscient third-person narrator can enter any mind and know the past and future; a limited third-person narrator stays close to one character.

A narrator can be reliable or unreliable. A reliable narrator gives an account we can trust; an unreliable one may be mistaken, biased or deceptive, and the reader must read around the account. Narration can also be nested: one character tells a story inside another story, a structure called a frame narrative.

Consider Daniel Defoe's Robinson Crusoe (1719), which opens "I was born in the year 1632." The first-person voice makes the book feel like a true memoir, and it keeps readers inside Crusoe's own interpretation of events. Compare Geoffrey Chaucer's Canterbury Tales, where a character called Chaucer the pilgrim narrates, often praising people with an innocence that invites readers to see more than he says.

When you read, mark the "I" or the voice, and ask what it can and cannot see.`,
          },
          {
            id: lid(4),
            title: 'Theme, Symbol and Imagery',
            blurb: 'A theme is an interpretive claim about what a work suggests, supported by patterns of images and symbols.',
            minutes: 7,
            body: `A topic is what a work is about, such as war, love or death. A theme is what the work suggests about that topic. "Death" is a topic; "People cope with death by making things that last longer than they do" is a theme. A theme is a full sentence, and it is an interpretation, so it needs evidence.

Evidence comes from patterns. Imagery means language that appeals to the senses, such as sights, sounds or textures. A motif is an image, phrase or idea that recurs. A symbol is a concrete thing that stands for something beyond itself, such as a journey standing for a life. Symbols and motifs matter because repetition is how a text points readers toward what it cares about.

Consider the Epic of Gilgamesh, a Mesopotamian poem. Gilgamesh, king of Uruk, loses his friend Enkidu to death, travels in terror to find eternal life, and fails to gain it. At the end he returns home and the poem draws attention to the walls of Uruk. Walls appear near the beginning and the end of the story, which makes them a motif. A reader can argue that the walls suggest what a mortal can leave behind: lasting work. That reading can be tested against the poem: is there other evidence, such as the framing of the story as something carved or recorded, that supports it?

Strong theme-statements are specific, arguable and supported by multiple passages. If you can find evidence against your claim, revise the claim rather than ignoring the evidence.`,
          },
        ],
      },
      {
        id: 'lit-studies-early.t2',
        title: 'Epic and Tragedy: Mesopotamia, Greece and Rome',
        blurb: 'The oldest narrative poems, the Athenian stage, Aristotle\'s first theory of drama, and Rome\'s answer to Homer.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(5),
            title: 'Gilgamesh: Friendship, Death and Memory',
            blurb: 'The Mesopotamian epic follows a king who loses a friend and learns the limits of human life.',
            minutes: 8,
            body: `The Epic of Gilgamesh is among the oldest surviving literary works. It comes from ancient Mesopotamia and was written in cuneiform on clay tablets. Several Sumerian poems about Gilgamesh come earlier; the most complete version is a later Akkadian poem usually called the Standard Babylonian version, traditionally linked to a scribe named Sin-leqi-unninni. Much of the text we have was recovered from the library at Nineveh in the nineteenth century, and gaps remain where tablets are broken.

Gilgamesh is king of Uruk, powerful and restless. The gods create Enkidu, a wild man, as his equal. After a struggle they become close friends and undertake adventures, including the defeat of the monster Humbaba in the Cedar Forest. When Enkidu dies, Gilgamesh is overwhelmed by grief and fear of his own death. He travels far to ask Utnapishtim, a survivor of a great flood, how to live forever. He does not gain immortality, and returns to Uruk.

For close reading, the key choice is how the poem handles its hero's failure. The ending is not a victory over death; it points to the city's walls and the human work that outlasts one life. Notice also the weight placed on friendship, the repeated journey structure, and the way Enkidu's civilizing and dying mirror Gilgamesh's own change.

Reading approach: trace the movement from ambition to grief to acceptance, and ask which images carry that change. Because the text is fragmentary, remember that every translation involves scholarly choices about gaps.`,
          },
          {
            id: lid(6),
            title: 'The Iliad: Anger, Honor and Loss',
            blurb: 'Homer\'s Iliad turns one episode of the Trojan War into a study of rage, glory and mortality.',
            minutes: 8,
            body: `The Iliad is a Greek epic traditionally attributed to Homer, composed in dactylic hexameter and set in the tenth year of the Trojan War. Scholars debate who Homer was and how the poems reached written form, since they grew out of a long oral tradition. The poem does not tell the whole war. It begins with a single theme, the anger of Achilles, a word that is usually translated "wrath" and that opens the poem in Greek.

Achilles withdraws from fighting after the Greek leader Agamemnon takes away Briseis, a captive woman who had been awarded to him as a prize. Without Achilles the Greeks suffer. When his close friend Patroclus is killed by the Trojan prince Hector, Achilles returns to fight, kills Hector, and mistreats his body. In the last book Priam, Hector's father and king of Troy, comes to Achilles to ask for his son's body, and the two grieve together.

Oral poetry leaves visible marks. Fixed phrases called epithets, such as "swift-footed" for Achilles, helped singers compose and help readers recognize characters. Extended similes compare battle to nature or farm life and briefly widen the picture beyond the battlefield.

Reading approach: ask what the poem values (honor, glory among one's peers) and what it counts as the cost. Notice that the poem treats Trojans with real sympathy and ends not with victory but with a funeral, so a close reader can argue that grief, not triumph, is its final emphasis.`,
          },
          {
            id: lid(7),
            title: 'The Odyssey: Return, Cunning and Recognition',
            blurb: 'Homer\'s second epic is built on a journey home, a faithful household and the power of identity.',
            minutes: 8,
            body: `The Odyssey, also attributed to Homer, follows Odysseus, a Greek hero of the Trojan War, as he struggles to get home to Ithaca after ten years of fighting and ten more years of wandering. Where the Iliad centers on a battlefield, the Odyssey centers on a household and a journey: his wife Penelope, his son Telemachus, and suitors who have settled in his home.

The poem's structure is unusual. It begins late, with Telemachus searching for news of his father, and it delivers Odysseus's famous adventures, including the Cyclops Polyphemus, in a long flashback told by Odysseus himself to a Phaeacian audience. This is a frame narrative with a first-person narrator, so close readers should ask how Odysseus shapes the story. The poem's description of him as a man of many turns points to his cleverness and his habit of disguise.

Recognition is a central technique. Odysseus returns home disguised as a beggar and is recognized by gradual signs: his old nurse sees a scar, his dog knows him, and Penelope tests him with a secret about their bed. These scenes show that identity depends on memory and shared knowledge, not only on appearance.

Reading approach: compare the two epics. Where the Iliad prizes glory won in battle, the Odyssey prizes survival, intelligence and homecoming. Ask how hospitality, a code of welcoming strangers, becomes a moral measure of each character the hero meets.`,
          },
          {
            id: lid(8),
            title: 'Sophocles and Greek Tragedy',
            blurb: 'Athenian tragedy stages terrible choices before an audience, using irony, chorus and a shared myth.',
            minutes: 8,
            body: `Greek tragedy was performed in Athens in the fifth century BCE as part of religious festivals, notably the City Dionysia, in honor of the god Dionysus. Three tragic poets are mostly preserved: Aeschylus, Sophocles and Euripides. A play had actors and a chorus, a group that sang, danced and commented on the action. The stories came from myth that the audience already knew, so the interest lay in how the story was told.

Sophocles wrote Oedipus the King and Antigone, among other surviving plays. In Oedipus, a king of Thebes sets out to find the cause of a plague, and as he investigates he learns that he himself is the one responsible, having unknowingly killed his father and married his mother. The audience knows the myth, while the character does not, which produces dramatic irony: the audience understands the words more fully than the speaker. When Oedipus announces that he will track down the guilty person, every line carries a double meaning.

In Antigone, Creon, ruler of Thebes, forbids burial of a rebel brother, and Antigone buries him anyway. The play is not a simple contest of right and wrong. Both characters appeal to something valuable, loyalty to family and religious duty on one side, order in the city on the other.

Reading approach: identify the moment of recognition, the chorus's role, and the speeches in which characters justify themselves. Ask whether each character is making a reasoned choice, and what the play suggests about knowledge, responsibility and limits.`,
          },
          {
            id: lid(9),
            title: 'Euripides: Tragedy That Questions',
            blurb: 'Euripides shifts the lens to outsiders, women and the cost of violence, and challenges easy answers.',
            minutes: 8,
            body: `Euripides, the third of the great Athenian tragedians, wrote dozens of plays, of which a good number survive, including Medea, The Trojan Women and The Bacchae. Compared with Sophocles, Euripides often puts women, foreigners and the defeated at the centre, and he often questions the assumptions of the society watching.

Medea was first performed in 431 BCE. Medea is a woman from a foreign land who helped Jason win the Golden Fleece, left her homeland for him, and is then abandoned when he arranges a more advantageous marriage. Her revenge, which includes the killing of her own children, is shocking and the play does not make it easy to judge. She speaks about the position of women and about being a stranger without protection, so the audience understands her pain even as they recoil from her act. The play lets us ask both "What was done to her?" and "What does she do?"

The Trojan Women shows the aftermath of the fall of Troy from the viewpoint of the women who will be enslaved. Rather than celebrating the victors, it dwells on loss.

Reading approach: pay attention to the debates, called agon, in which characters argue opposing positions, and ask who has the best argument and who has the better outcome. Euripides also sometimes ends plays with a god appearing to settle matters, which can feel abrupt; consider whether that ending resolves the human problem or exposes it.`,
          },
          {
            id: lid(10),
            title: 'Aristotle\'s Poetics: The First Theory of Tragedy',
            blurb: 'Aristotle names tragedy\'s parts and effects, and gives readers a vocabulary still used today.',
            minutes: 8,
            body: `Aristotle, the Greek philosopher of the fourth century BCE, wrote the Poetics, a short and influential work of literary theory. It survives in a compressed form that reads like notes. Its main subject is tragedy, which Aristotle describes as an imitation (mimesis) of a serious action that is complete and of a certain size.

He divides tragedy into six parts: plot, character, thought, diction, melody and spectacle. Plot (mythos) ranks first because it is the arrangement of the events, and he wants plots with a beginning, middle and end linked by probability or necessity. Two terms for plot turns are especially useful. Peripeteia is a reversal, when events turn to the opposite of what was expected. Anagnorisis is recognition, a move from ignorance to knowledge. Aristotle admires plots in which the two coincide, and he uses Sophocles's Oedipus the King as his example.

Several terms are debated. Catharsis, the effect tragedy has on pity and fear, has been read as purging, purifying or clarifying emotion. Hamartia, the error that leads to a downfall, is sometimes translated "tragic flaw", but many scholars prefer "mistake" or "error".

A common myth is that Aristotle laid down three "unities" of time, place and action. He stresses unity of action; the rest were codified by later critics.

Reading approach: use Aristotle as a lens, not a rulebook. Apply his terms to a play and ask where they fit, and where the play does something his categories do not describe.`,
          },
          {
            id: lid(11),
            title: 'Virgil\'s Aeneid: Epic for Rome',
            blurb: 'Virgil adapts Homer to tell Rome\'s origin story, balancing duty, empire and its human cost.',
            minutes: 8,
            body: `Virgil, a Roman poet who lived in the first century BCE, composed the Aeneid in Latin in the years before his death in 19 BCE, during the rule of Augustus. Its first words, "arma virumque cano," announce its subject: arms and the man. The man is Aeneas, a Trojan survivor who flees the fallen city of Troy and journeys to Italy, where his descendants will eventually found Rome.

Virgil writes in conscious conversation with Homer. Traditionally the first half is said to echo the Odyssey, with a wandering hero, and the second half the Iliad, with war in Italy. Learning to spot allusion, the borrowing and reworking of earlier work, is a core skill here. Aeneas is not driven by personal glory but by pietas, a Roman idea of dutiful devotion to family, gods and homeland.

That duty has costs. In Book 4, Aeneas stays in Carthage and loves Dido, its queen, but the gods command him to leave, and Dido, abandoned, takes her own life. In Book 6 he visits the underworld and sees a procession of future Roman heroes. The poem ends abruptly with Aeneas killing a defeated enemy, Turnus, in anger.

Scholars debate whether the Aeneid celebrates Augustan Rome or quietly questions the price of empire, and many readers find both.

Reading approach: weigh the poem's praise of destiny against its moments of grief. Ask which characters the poem makes us feel for, and what that suggests.`,
          },
        ],
      },
      {
        id: 'lit-studies-early.t3',
        title: 'Sacred Texts and Classics of Asia and the Middle East',
        blurb: 'Reading scripture as literature without losing respect for its place in living traditions, then epics, poems and tales across Asia and the Arabic world.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(12),
            title: 'The Bible as Literature',
            blurb: 'The Hebrew Bible and New Testament contain many genres, and their language has shaped later writing.',
            minutes: 8,
            body: `For billions of people, the Bible is sacred scripture, and a literary reading does not replace or judge that faith. A literary approach describes how the texts are written: their genres, techniques and influence. This lesson takes that descriptive approach with respect for readers of every belief.

The Bible is a library, not a single book. The Hebrew Bible, called the Old Testament in Christian tradition, includes narrative (Genesis, Exodus, Samuel), law, prophecy, poetry (Psalms, Song of Songs) and wisdom writing (Proverbs, Job, Ecclesiastes). The New Testament includes four gospels, the Acts of the Apostles, letters and the Book of Revelation. Each genre invites different reading habits. A psalm is a poem meant to be sung or prayed; a proverb is a compact saying; a prophetic book often uses vivid, symbolic language.

Biblical narrative is famously spare. It often gives few details of motive or appearance and leaves gaps for readers to fill. Biblical poetry commonly uses parallelism, in which a second line repeats, extends or contrasts the first. Psalm 23 opens "The Lord is my shepherd; I shall not want" in the King James Version, and its shepherd image illustrates how metaphor carries meaning.

The King James Version, published in 1611, had large influence on English style, and many everyday phrases come through it.

Reading approach: identify the genre first, then ask how form shapes meaning. Note which translation you are reading, since each makes choices, and keep the question of what a text means to believers separate from the question of how it is built.`,
          },
          {
            id: lid(13),
            title: 'The Quran as Literature',
            blurb: 'The Quran\'s Arabic style, structure and recitation make it a central text for literary study and for faith.',
            minutes: 8,
            body: `For Muslims, the Quran is the word of God as revealed to the Prophet Muhammad, and it is regarded as unique and inimitable. A literary approach does not question that belief. It describes features of the text that readers and scholars of every background notice, and it does so respectfully.

The Quran is arranged in 114 chapters called surahs, made of verses called ayat. Surahs are not ordered by date of revelation or chronology; broadly, longer surahs come earlier in the book and shorter ones later. According to Muslim tradition, the revelation came over about twenty-three years. The Quran is understood as being primarily an oral text: it is recited aloud, and its sound is central to how it is experienced. Verse endings often share a rhyme-like pattern, and repetition and refrain create a distinctive rhythm. In Surah 55 (Ar-Rahman), a refrain returns again and again, asking which of the Lord's favors one will deny.

The Quran contains many modes: oaths, commands, parables, prayers, laws and stories of earlier prophets. Surah 12, the story of Yusuf (Joseph), is told as one continuous narrative, unlike many other surahs, and describes itself as the best of stories.

Reading approach: remember that translations are interpretations and cannot reproduce the Arabic's sound. Ask how form matches content, such as short, forceful surahs and long legal ones, and keep the text's own self-descriptions distinct from outside commentary.`,
          },
          {
            id: lid(14),
            title: 'The Mahabharata and the Ramayana',
            blurb: 'India\'s two great Sanskrit epics combine story, ethics and layered voices over many centuries.',
            minutes: 8,
            body: `The Mahabharata and the Ramayana are the two great Sanskrit epics of India. They have been retold for centuries across South and Southeast Asia in many languages, in performance, and in art, and they remain living texts for many Hindus.

The Mahabharata is traditionally attributed to the sage Vyasa and is among the longest poems in the world, traditionally counted at around 100,000 verses. Its central story is a conflict between two branches of a royal family, the Pandavas and the Kauravas, culminating in a great war at Kurukshetra. The epic is a vast container: stories nested inside stories, teachings on duty (dharma), and the Bhagavad Gita, a philosophical dialogue between the warrior Arjuna and Krishna set just before the battle. Its moral world is deliberately complex; heroes make troubling choices, and the war's costs are shown.

The Ramayana is traditionally attributed to the poet Valmiki. It tells of Rama, a prince sent into forest exile, the abduction of his wife Sita by the demon king Ravana, and the rescue aided by the devoted Hanuman. It is often read as an account of ideals of duty and loyalty, though later retellings and readers have also debated how Sita is treated.

Both works grew over a long period, so scholars see layers of composition rather than a single author.

Reading approach: pay attention to nested narration and to the central question that recurs: what does duty require when duties conflict? Compare how different retellings answer it.`,
          },
          {
            id: lid(15),
            title: 'Confucian Texts: The Analects and the Art of the Short Saying',
            blurb: 'The Analects records brief conversations, so readers must infer a whole way of life from small scenes.',
            minutes: 8,
            body: `Confucius, a thinker of ancient China, is traditionally dated to 551 to 479 BCE. The Analects (Lunyu) is a collection of sayings and brief conversations attributed to him and his disciples, compiled by followers after his lifetime. It is not a treatise with a single argument; it is a sequence of short scenes, and that form is itself a literary choice.

Because the text is brief, it demands slow reading. A typical passage gives a question from a student or ruler and a short reply, often without full context. Readers must fill the gaps by comparing passages, which is why the book rewards rereading and why commentaries accumulated over many centuries. Teachers in this tradition expected students to apply sayings to life rather than merely memorize them.

Key ideas recur across the book. Ren, often translated "humaneness" or "goodness," is a central virtue. Li, "ritual" or "proper conduct," concerns how respect is expressed in practice. Filial devotion, learning, and virtue in rulers also matter. One passage is often compared to a version of the golden rule: do not impose on others what you would not want for yourself.

Notice the style: Confucius often answers different students differently, which suggests that the best answer depends on the person. Reading approach: collect passages on one term, such as learning or ren, and ask how the meaning shifts between contexts. Resist turning a short saying into a slogan; ask what situation might have prompted it, and what the teacher expected the listener to do.`,
          },
          {
            id: lid(16),
            title: 'Tang Poetry: Compression, Image and Feeling',
            blurb: 'Poets of the Tang dynasty say much in few words, often through a single image.',
            minutes: 8,
            body: `The Tang dynasty (618 to 907) is often called a golden age of Chinese poetry. Its best-known poets include Li Bai and Du Fu, both of the eighth century. Many Tang poems were written in strict forms, with a fixed number of syllables per line, a set number of lines, and rules about tone and parallelism. Most of that music is lost in translation, so readers of English translations should remember that they see an image-based skeleton.

Li Bai's "Quiet Night Thought" is a four-line poem. The speaker sees bright moonlight by his bed and wonders for a moment whether it is frost on the ground. He looks up at the moon, then lowers his head and thinks of home. A reader can notice the swift shift from the eyes to the heart: the image of moonlight is a way to carry homesickness without naming it.

Du Fu's "Spring View" was written during a period of civil war. Its opening line contrasts a broken state with mountains and rivers that remain, so nature's continuity sharpens the sense of human loss. Du Fu is often associated with a more historical, concerned voice, while Li Bai is often associated with a freer, more imaginative one, though such labels are generalizations.

Reading approach: ask what each image is doing, what is left unsaid, and how a poem's final line changes the first. In compressed poetry, a missing word is often a decision, and the reader completes the meaning.`,
          },
          {
            id: lid(17),
            title: 'The Tale of Genji: Court Life and the Novel Form',
            blurb: 'Murasaki Shikibu\'s long Heian-era work blends prose and poetry to explore feeling, status and time.',
            minutes: 8,
            body: `The Tale of Genji was written in Japanese in the early eleventh century by Murasaki Shikibu, a woman of the imperial court during the Heian period. It is widely described as one of the earliest major works of prose fiction in the world, though what counts as a "novel" is a matter of definition, and the label should be used with care.

The story follows Hikaru Genji, an emperor's son, and then the generation after him. It is long and episodic, concerned with courtship, rivalry, loss and the shifting fortunes of court families. Much of what we call plot is carried in small scenes: a glimpse through a screen, a letter, a poem exchanged.

Poetry is woven into the prose. The characters often speak in waka, short poems of five lines, and the choice of paper, handwriting and season of the poem is part of what is communicated. A character who replies badly, or late, reveals something about herself. For a reader today, this means that the point of many scenes is social and emotional nuance rather than action.

A later critic, Motoori Norinaga in the eighteenth century, described the work's central quality with the phrase mono no aware, a sensitivity to the fleeting beauty of things. It is useful as one reading, not the only one.

Reading approach: pay attention to tone, to what is implied, and to the way impermanence shapes the mood. Ask how the narrator, who seems to stand close to the court, shapes sympathy for each character.`,
          },
          {
            id: lid(18),
            title: 'Arabic Poetry and One Thousand and One Nights',
            blurb: 'From the desert ode to the nested tales of Shahrazad, Arabic literature prizes eloquence and story.',
            minutes: 8,
            body: `Poetry held a central place in Arabic culture long before the rise of Islam. The classical pre-Islamic ode, the qasida, was recited orally and followed a recognizable arc: it often opens by remembering a lost love at an abandoned campsite, moves to a description of a journey or an animal, and closes with praise, boast or reflection. A group of famous early odes is known as the Mu'allaqat, and poets such as Imru' al-Qays are among their best-known names. Reading them, notice the balance of nostalgia and pride, and the way landscape images carry feeling.

One Thousand and One Nights, also called the Arabian Nights, is a collection of tales whose frame story is the heart of its design. King Shahryar, betrayed, decides to marry and execute a new wife each day. Shahrazad volunteers, and each night she begins a story and leaves it unfinished, so that he lets her live to finish it. Stories nest inside stories, so storytelling becomes a means of survival.

The collection took shape over many centuries from sources across the Middle East and beyond. Its contents vary by manuscript. Antoine Galland's French translation in the early 1700s helped popularize it in Europe, and some of the tales best known today, such as Aladdin, are not found in the earliest Arabic manuscripts.

Reading approach: identify the frame and ask how each story reflects it. Ask what storytelling does for Shahrazad, and how repeated cliffhangers shape the reader's attention.`,
          },
        ],
      },
      {
        id: 'lit-studies-early.t4',
        title: 'Medieval and Renaissance Europe',
        blurb: 'From Old English verse to Dante, Chaucer, Shakespeare and Cervantes: how new forms and new voices arrive.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(19),
            title: 'Beowulf: Old English Verse and the Heroic World',
            blurb: 'An alliterative poem of monsters and mortality, preserved in one manuscript.',
            minutes: 8,
            body: `Beowulf is the longest surviving heroic poem in Old English, the language of early medieval England. It survives in a single manuscript from around the year 1000; scholars debate when the poem itself was composed. The setting is Scandinavia, not England: the hero Beowulf, a warrior of the Geats, travels to Denmark to help King Hrothgar, whose hall is attacked by the monster Grendel.

Its poetic form is alliterative. Rather than rhyme, lines are built from two halves divided by a pause called a caesura, with stressed words sharing initial sounds. The poem opens with the word "Hwaet," often translated "Listen" or "So," a call to attention that suggests an oral performance. Kennings are compound metaphors for familiar things, such as "whale-road" for the sea.

The plot has three parts: the fights with Grendel, with Grendel's mother, and, decades later, with a dragon, which proves fatal to the aged king Beowulf. The poem repeatedly steps aside to mention other stories and past feuds, and the effect is to suggest a world in which heroic glory is temporary.

The poem also mixes worlds. Its characters live in a pre-Christian past, but the poet, almost certainly Christian, reflects on fate and God, and critics debate how these views fit.

Reading approach: attend to the digressions and to the gloomy moments, such as the funeral at the end. Ask how the poem balances celebration of strength with awareness that every hero dies.`,
          },
          {
            id: lid(20),
            title: 'Medieval Romance and the Quest',
            blurb: 'Romance turns adventure into a test of character, in a world of knights, ladies and magic.',
            minutes: 8,
            body: `Medieval romance is a narrative genre that flourished from the twelfth century onward, first in French and then across Europe. The word "romance" originally referred to works written in a vernacular Romance language rather than Latin. Where an epic like Beowulf concerns a hero's duty to a people, romance is more often about an individual knight's adventure, with themes of love, honor and the tests of chivalry.

Chretien de Troyes, a French poet of the twelfth century, wrote some of the earliest major Arthurian romances. They tell of knights of King Arthur's court who set out on a quest, meet marvels, and learn something about themselves. Typical features include a journey away from court, a series of trials, a moral or romantic test, and a return. Courtly love, in which a knight serves a lady in devoted, often secret, devotion, appears in many romances, though scholars debate how far it reflected real life.

Sir Gawain and the Green Knight is a late fourteenth-century Middle English romance by an anonymous poet. A mysterious green challenger offers a beheading game at Arthur's court, and Gawain takes the challenge. Later he is tested by a host's wife and is given a magic girdle. The poem shows how romance can examine the gap between the ideal of chivalry and the frailty of a person.

Reading approach: note what the quest tests, such as honesty or courage, and where the hero falls short. Ask whether the marvelous elements are decoration or a way of externalizing the hero's inner life.`,
          },
          {
            id: lid(21),
            title: 'Dante\'s Divine Comedy: A Journey in Three Parts',
            blurb: 'Dante turns a pilgrimage through the afterlife into a structured vision of sin, hope and love.',
            minutes: 8,
            body: `The Divine Comedy, completed by the Italian poet Dante Alighieri shortly before his death in 1321, is one of the central works of world literature. It follows a narrator named Dante through the Christian afterlife: Inferno (Hell), Purgatorio (Purgatory) and Paradiso (Heaven). Each part has thirty-three cantos, with one extra opening canto, for a total of one hundred.

It begins, in Longfellow's English version, "Midway upon the journey of our life," with the speaker lost in a dark wood. The Roman poet Virgil, honored by Dante as a master, guides him through Hell and Purgatory. Beatrice, a figure from Dante's life and imagination, leads him through Paradise.

Form is meaning here. The poem is written in terza rima, a rhyme scheme linking three-line stanzas in the pattern aba, bcb, cdc, and the number three recurs throughout the structure. Dante also wrote in the Tuscan vernacular, not Latin, a decision that raised the status of Italian as a literary language.

In Inferno, sinners are punished in ways that reflect their sins, a principle often called contrapasso. These punishments allow Dante to comment on politics and morality, including figures of his own time.

Close reading requires distinguishing Dante the poet, who arranges the story, from Dante the pilgrim, who is shown learning and sometimes pitying the sinners. Ask what the pilgrim understands at each stage, and how the poet's design shapes the reader's reactions.`,
          },
          {
            id: lid(22),
            title: 'Chaucer\'s Canterbury Tales: Many Voices, One Frame',
            blurb: 'A pilgrimage supplies a frame in which tellers reveal themselves through the tales they choose.',
            minutes: 8,
            body: `Geoffrey Chaucer wrote The Canterbury Tales in Middle English in the late fourteenth century, and he left it unfinished. A group of pilgrims on the way to the shrine at Canterbury agree to tell stories to pass the time. In the General Prologue the narrator plans for each pilgrim to tell more tales than were eventually written, so we have a collection with gaps and uncertain order.

The poem opens, "Whan that Aprille with his shoures soote," a springtime scene that sets the pilgrimage in motion. The frame narrative lets Chaucer assemble many types of people, including a knight, a miller, a prioress and the Wife of Bath, and many styles of storytelling: romance, fable, fabliau (a comic, often bawdy tale), sermon and more.

Voice is central. Chaucer the pilgrim, the narrator, is a created figure who describes others with apparent admiration, even when details suggest faults. The gap between what the narrator says and what the details show is a source of irony and humor. The tales also characterize their tellers: the Wife of Bath's Prologue speaks at length about marriage and experience, and the quarrels between pilgrims show that the tales respond to each other.

Chaucer's verse is mainly in rhymed couplets of roughly ten syllables.

Reading approach: for any tale, ask how it fits its teller, what the frame adds, and where the narrator's praise and the details disagree.`,
          },
          {
            id: lid(23),
            title: 'Shakespeare\'s Sonnets: Argument in Fourteen Lines',
            blurb: 'The sonnet is a compact argument; Shakespeare uses its structure and plays against its clichés.',
            minutes: 8,
            body: `A sonnet is a fourteen-line poem, usually in iambic pentameter, which means lines of ten syllables in an alternating weak-strong beat. The form came to English from Italy, where Petrarch popularized it. William Shakespeare's sonnets, 154 in number, were published in 1609. The usual Shakespearean pattern is three quatrains of four lines, rhymed abab cdcd efef, and a closing couplet, gg.

Structure suggests argument. The quatrains typically develop an idea or image, and a turn, often called the volta, shifts direction, frequently at the couplet. In Sonnet 18, the first lines propose a comparison with a summer's day, the middle quatrains explain why summer falls short, and the couplet claims that the poem itself will keep the beloved alive.

Shakespeare also plays with convention. Petrarchan poets often praised a beloved with stock comparisons to the sun, coral and roses. Sonnet 130 opens "My mistress' eyes are nothing like the sun," and it lists ways she does not match those clichés. The couplet reveals that the speaker loves her nonetheless, and claims that this love is more honest than exaggerated praise. The poem is both a parody and a love poem.

Reading approach: map the rhyme scheme, find the turn, and note how each quatrain advances the claim. Ask what the poem proposes, and whether the couplet confirms, complicates or reverses what came before. Remember that the speaker is a constructed voice, not necessarily the poet.`,
          },
          {
            id: lid(24),
            title: 'Shakespeare\'s Plays: Soliloquy, Verse and Ambiguity',
            blurb: 'In Hamlet and Macbeth, language reveals thought, and uncertainty is part of the design.',
            minutes: 8,
            body: `Shakespeare's plays were written for performance in the late sixteenth and early seventeenth centuries. About half of them were first printed after his death in the First Folio of 1623. A reader meets a script: the page needs to be imagined on a stage with an audience, gestures and pauses.

Most of the language is in blank verse, unrhymed iambic pentameter, which sounds close to natural speech but has a steady rhythm. Characters of lower rank often speak in prose, and a shift between verse and prose can mark a change of mood or status. Rhymed couplets often signal a scene's end.

A soliloquy is a speech in which a character, alone on stage, voices thoughts for the audience. In Hamlet, written around 1600, the prince's famous "To be, or not to be" is a speech in which he weighs action against inaction. Close readers notice how it moves between questions and general statements, and avoids stating his plan; Shakespeare gives us a mind in motion, not an announcement.

Macbeth gives a later, bleak example. After a loss, Macbeth says "Tomorrow, and tomorrow, and tomorrow," and the repeated word enacts the dull passing of time. Here form and meaning meet.

Shakespeare's plays also treat ambiguity as a feature. Hamlet delays, and critics have offered many reasons; the text supports several without settling it.

Reading approach: ask who is listening, whether a speech is private or public, and how the rhythm and repetition show feeling. Compare a printed text with at least one staging idea.`,
          },
          {
            id: lid(25),
            title: 'Cervantes\' Don Quixote: Reality, Fiction and Reading',
            blurb: 'Cervantes uses a deluded reader as hero, and invents new ways for fiction to talk about itself.',
            minutes: 8,
            body: `Miguel de Cervantes published the first part of Don Quixote in 1605 and the second part in 1615. It tells of a Spanish gentleman who has read so many chivalric romances that he decides to become a knight-errant. He renames himself Don Quixote, recruits a farmer named Sancho Panza as his squire, and sets out to right wrongs. Famously, he mistakes windmills for giants and attacks them.

The book is a parody, but a generous one. It mocks the conventions of romance while taking seriously the human need for ideals. The contrast between Quixote's idealism and Sancho's earthy common sense is a source of comedy and of change: as the story goes on, Sancho becomes more imaginative and Quixote more doubtful.

Cervantes also experiments with narration. He presents the story as if drawn from a history by an Arab author, Cide Hamete Benengeli, so the narrator is unreliable by design. In Part 2, characters have read Part 1, and they react to Quixote as a celebrity. Such self-reference, called metafiction, makes the book a landmark of narrative technique. It is often called the first modern novel, though that claim depends on definition and is debated.

Reading approach: for any episode, ask what is real, what is Quixote's interpretation, and who is creating the scene. Notice how others use his fantasy for their amusement, and whether the book invites us to laugh at him, with him, or at ourselves.`,
          },
        ],
      },
      {
        id: 'lit-studies-early.t5',
        title: 'Milton to the Enlightenment',
        blurb: 'Epic ambition, the invention of the modern essay and novel, and satire as a tool of reason.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(26),
            title: 'Milton\'s Paradise Lost: Epic, Argument and Ambiguity',
            blurb: 'Milton retells the fall in blank verse and gives its rebel an unforgettable voice.',
            minutes: 8,
            body: `John Milton, an English poet and political writer, published Paradise Lost in 1667 in ten books and revised it to twelve in 1674. By then he was blind and composed the poem by dictation. It retells the biblical story of the fall of humankind, with Satan's rebellion and expulsion from heaven, and the temptation of Adam and Eve in the Garden of Eden. It is a Christian epic in English, deliberately modelled on Homer and Virgil.

The poem is written in blank verse, which Milton defended as free from the "bondage" of rhyme. It begins with the traditional epic gestures of stating a theme, "Of Man's first disobedience," and invoking a muse, and it announces a purpose: to "justify the ways of God to men."

How the poem handles Satan is the most famous interpretive question. Satan's speeches in the early books are bold and persuasive, as when he declares it "Better to reign in Hell, than serve in Heaven." Some readers think the poem makes him attractive; others argue that the poem steadily exposes the self-deception behind his rhetoric. Both readings use evidence from the text, which makes it a good test case for close reading.

Milton also writes from experience of civil war and political controversy in seventeenth-century England, and questions of freedom, obedience and authority run through the poem.

Reading approach: track how a speaker's rhetoric changes across the poem, and ask whether an eloquent voice is the same as a reliable one.`,
          },
          {
            id: lid(27),
            title: 'The Essay and the Rise of the Novel',
            blurb: 'The essay tries out thought on the page; the early novel tries out ordinary life as plot.',
            minutes: 8,
            body: `The word "essay" comes from the French essai, meaning an attempt or trial. Michel de Montaigne, a French writer, published his first Essays in 1580, writing in a personal voice about topics such as friendship, education and himself, with frank admission of doubt. In England, Francis Bacon published his first Essays in 1597 in a more compact, aphoristic style. In the early eighteenth century, Joseph Addison and Richard Steele's periodical The Spectator (1711) made essay-writing about manners and morals a public habit. The essay is thus a form in which thinking happens on the page.

The novel developed in the same period. Daniel Defoe's Robinson Crusoe (1719) imitated a first-person memoir so closely that it reads as documentary. Samuel Richardson's Pamela (1740) was told through letters, a technique called epistolary narration that places the reader inside a character's private thoughts. Henry Fielding's Tom Jones (1749) answered with an intrusive, witty narrator. Frances Burney's Evelina (1778) used letters to follow a young woman entering society and was an influence on later women novelists.

These experiments are precursors to the fiction of Jane Austen, who published from 1811. Her use of a narrator who slips close to a character's thoughts builds on this earlier work.

Reading approach: for an essay, trace how the argument moves rather than only its conclusion. For an early novel, ask what the chosen narrative technique makes possible, whether authenticity, intimacy or irony.`,
          },
          {
            id: lid(28),
            title: 'Enlightenment Satire: Swift and Voltaire',
            blurb: 'Satire uses irony, exaggeration and invented voices to expose folly, and it demands careful reading.',
            minutes: 8,
            body: `Satire is writing that uses humor, irony and exaggeration to criticize people, institutions or ideas. It works through a gap between what is said and what is meant, so a reader must decide who is speaking and what the author wants us to see. The Enlightenment, a European movement of the seventeenth and eighteenth centuries that stressed reason and critique, made satire a favorite weapon.

Jonathan Swift published Gulliver's Travels in 1726. Lemuel Gulliver, a plain-speaking ship's surgeon, travels to lands of tiny people, giants, and others. By altering scale, Swift lets readers see human politics and pride as strange. Swift's A Modest Proposal (1729) is narrated by a calm, reasonable voice who suggests that poor Irish families sell their children as food. The proposal is monstrous; the author's real target is the indifference of policy toward poverty. The literal speaker and the real author are separate, a technique called persona, and misreading that gap is the classic mistake.

Voltaire's Candide (1759) follows a young man taught by the philosopher Pangloss that this is "the best of all possible worlds." Candide's experiences of war, earthquake and cruelty contradict this teaching. The book ends on the modest call to cultivate one's garden, which readers have taken as practical wisdom, as retreat, or both.

Reading approach: identify the speaker, the target, and the technique of exaggeration. Ask what the satirist wants us to do, and whether a positive alternative is offered.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lit-studies-early',
    questions: [
      // L1
      tf(1, 1, 1, 'Close reading asks why a writer chose particular words, not only what happens in the story.', 0, 'Think about the word "closely".', 'Close reading attends to the choices a text makes in wording, order and detail.'),
      mc(1, 2, 1, 'Which sequence matches the three-move method in this lesson?', ['Notice, wonder, argue', 'Argue, summarize, forget', 'Summarize, memorize, quote', 'Skim, guess, finish'], 'Start with attention.', 'The method moves from noticing details to asking what they do to forming an evidence-based claim.'),
      mc(1, 3, 2, 'A reader says a poem "feels sad" but points to no words in it. What is missing?', ['Evidence from the text', 'A longer poem', 'A biography of the poet', 'A different opinion'], 'A claim needs support.', 'Close reading ties each claim to specific words or details in the passage.'),
      tf(1, 4, 2, 'In Sonnet 18, the poem begins as a comparison but soon lists the flaws of summer.', 0, 'Look at the rough winds and the short season.', 'The poem opens by comparing the beloved to summer and then shows summer falling short.'),
      mc(1, 5, 3, 'Which is the strongest close-reading statement about a repeated word in a passage?', ['The repetition builds tension, as shown by the word recurring in each line', 'The word recurs only because the writer lacked other vocabulary', 'Repetition in a passage is a flaw that readers should simply correct', 'Repeated words carry no meaning beyond filling out the rhythm'], 'Strong claims explain an effect and cite the text.', 'A good claim names an effect and points to where the evidence appears.'),
      // L2
      tf(2, 1, 1, 'A genre is a family of works that share conventions readers expect.', 0, 'Think of "contract" between writer and reader.', 'Genres are bundles of shared conventions that guide expectations.'),
      mc(2, 2, 1, 'Which genre is described as a long narrative poem about heroes and large events?', ['Epic', 'Lyric', 'Essay', 'Satire'], 'Think of Homer.', 'An epic is a long narrative poem, usually in an elevated style, about heroic deeds.'),
      mc(2, 3, 2, 'Why does the joke in Don Quixote about romances work best for a reader who knows romances?', ['The book plays against conventions the reader already recognizes', 'The book is written so only trained scholars can follow it', 'Romances were no longer read, so the joke targets a dead genre', 'The hero reads nothing, so his behavior has no literary source'], 'Parody depends on a target.', 'Parody works by recalling and twisting expected conventions.'),
      mc(2, 4, 2, 'Which is a lyric poem?', ['A short poem expressing a speaker\'s thought or feeling', 'A play performed by a chorus that comments on the action', 'A long prose work divided into chapters and episodes', 'A factual account of a war written by a later historian'], 'It is usually short and personal.', 'Lyrics are compressed poems that express a speaker\'s thought or feeling.'),
      tf(2, 5, 3, 'When a writer breaks a genre convention, it can be a clue that the writer is saying something new.', 0, 'A broken expectation draws attention.', 'Unfollowed conventions stand out and often carry meaning.'),
      // L3
      tf(3, 1, 1, 'A narrator and the author of a work are always the same person.', 1, 'Think of a created speaker.', 'A narrator is a voice created by the author and may differ from the author in knowledge and views.'),
      mc(3, 2, 1, 'In first-person narration, the story is told by', ['A character using "I"', 'A voice outside the story who knows everything', 'The reader', 'A narrator who never appears'], 'Look for the pronoun.', 'First-person narration comes from a character telling the story from inside it.'),
      mc(3, 3, 2, 'What is an unreliable narrator?', ['One whose account may be mistaken, biased or deceptive', 'One who tells the whole story in verse rather than in prose', 'One who turns and speaks directly to the audience', 'One who is always the hero and winner of the story'], 'Think of trust.', 'An unreliable narrator forces the reader to read around the account.'),
      mc(3, 4, 2, 'Which structure places a story told by one character inside another story?', ['A frame narrative', 'A sonnet, in which an octave is followed by a sestet', 'A soliloquy, in which one character speaks alone on stage', 'A rhyme scheme repeated across each stanza of a poem'], 'The outer story holds the inner ones.', 'A frame narrative nests tales within a surrounding story.'),
      tf(3, 5, 3, 'Chaucer the pilgrim may praise people in a way that invites readers to notice more than he says.', 0, 'The narrator is a created figure.', 'The gap between his praise and the details is a source of irony.'),
      // L4
      mc(4, 1, 1, 'Which is a theme rather than only a topic?', ['People cope with death by making things that outlast them', 'Mortality is a central concern in many great works of literature', 'War and its long effects on the soldiers who fight it', 'Friendship, as it appears in stories of companions and rivals'], 'A theme is a full claim.', 'A theme states what a work suggests about a topic, in a sentence.'),
      tf(4, 2, 1, 'A motif is an image or idea that recurs in a work.', 0, 'Repetition matters.', 'A motif is a recurring element that points to what a work cares about.'),
      mc(4, 3, 2, 'What is a symbol?', ['A concrete thing that stands for something beyond itself', 'A rhyme repeated at the end of lines to link stanzas', 'A change of narrator partway through a story or poem', 'A line of dialogue that moves the plot to its next scene'], 'It points beyond itself.', 'A symbol is a concrete object or image that represents a larger idea.'),
      tf(4, 4, 2, 'A good interpretation of a theme should be tested against other passages in the work.', 0, 'One quotation rarely settles it.', 'Interpretations gain strength when multiple passages support them and none contradict them.'),
      mc(4, 5, 3, 'You find a passage that contradicts your theme claim. What should you do?', ['Revise the claim to account for it', 'Ignore the passage, since one line should not change a reading', 'Quote only the lines that agree and leave the rest out', 'Drop the text and pick another'], 'Evidence guides interpretation.', 'Counterevidence should lead to a better, more accurate claim.'),
      // L5
      tf(5, 1, 1, 'The Epic of Gilgamesh comes from ancient Mesopotamia and was written in cuneiform on clay tablets.', 0, 'Think of early writing on clay.', 'The poem survives on cuneiform tablets from ancient Mesopotamia.'),
      mc(5, 2, 1, 'What event drives Gilgamesh to seek eternal life?', ['The death of his friend Enkidu', 'The loss of his crown and kingdom to a rival ruler', 'A long war with the city of Troy and its heroes', 'A dream of a great flood'], 'It is a personal loss.', 'Enkidu\'s death makes Gilgamesh fear his own mortality.'),
      mc(5, 3, 2, 'How does the poem end for Gilgamesh\'s quest for immortality?', ['He does not gain it and returns to Uruk', 'He gains it from Utnapishtim and rules the city forever', 'He conquers Troy and rules it', 'He becomes a god and joins the council of the heavens'], 'The poem does not reward the quest.', 'He fails to win immortality and returns home to the city\'s walls.'),
      tf(5, 4, 2, 'Because some tablets are broken, every translation of Gilgamesh involves scholarly choices about gaps.', 0, 'Think about damaged text.', 'Missing sections mean translators and editors must reconstruct or leave gaps.'),
      mc(5, 5, 3, 'A reader argues that the walls of Uruk suggest lasting human work. Which kind of evidence supports this best?', ['The walls appear near both the beginning and the end of the poem', 'The walls are made of baked brick, which was a common material', 'The poem is very old and survives on damaged clay tablets', 'Uruk was a real city that archaeologists have excavated'], 'Look for repetition in the text.', 'A motif that recurs and frames the poem supports a symbolic reading.'),
      // L6
      mc(6, 1, 1, 'What is the central subject that opens the Iliad?', ['The anger of Achilles', 'The journey home of Odysseus', 'The founding of Rome', 'The fall of Troy in one night'], 'It is the poem\'s first word.', 'The poem begins with the wrath of Achilles, not the whole war.'),
      tf(6, 2, 1, 'The Iliad covers the entire ten years of the Trojan War from start to finish.', 1, 'It focuses on a single episode.', 'The poem centres on a short stretch of the war\'s tenth year.'),
      mc(6, 3, 2, 'Why does Achilles return to fight?', ['His friend Patroclus has been killed by Hector', 'He is ordered back by King Priam of Troy', 'He wants to win back Briseis from Agamemnon', 'The war has ended and the Greeks sail home'], 'It is a loss, not a prize.', 'Patroclus\'s death by Hector sends Achilles back into battle.'),
      mc(6, 4, 2, 'What is an epithet like "swift-footed" for Achilles?', ['A fixed descriptive phrase used with a character', 'A rhyme scheme used to link the lines of a stanza', 'A kind of simile that uses the word like or as', 'A stage direction that tells an actor how to move'], 'It follows the name.', 'Epithets are fixed phrases that helped oral poets compose and help readers recognize characters.'),
      tf(6, 5, 3, 'The poem ends with Hector\'s funeral after Priam asks Achilles for his body, which supports reading grief as a key emphasis.', 0, 'Look at the final scenes.', 'Ending on mourning rather than victory suggests grief as central.'),
      // L7
      mc(7, 1, 1, 'Where is Odysseus trying to return?', ['Ithaca', 'Troy', 'Athens', 'Rome'], 'It is his home island.', 'Odysseus is trying to reach Ithaca, his wife and his son.'),
      tf(7, 2, 1, 'Odysseus himself tells the story of many of his adventures to the Phaeacians.', 0, 'Think of a first-person narrator inside the poem.', 'The long flashback is narrated by Odysseus, so readers should ask how he shapes it.'),
      mc(7, 3, 2, 'Which is a recognition scene in the poem?', ['The old nurse sees his scar', 'The first line of the poem, which names its hero', 'The catalogue of ships that lists the Greek leaders', 'A funeral for one of the suitors in the great hall'], 'Identity is shown by a sign.', 'The scar is one of several gradual signs that reveal his identity.'),
      mc(7, 4, 2, 'Which values does the Odyssey stress compared with the Iliad?', ['Survival, intelligence and homecoming', 'Only glory in battle and honor', 'Conquest of cities and the plunder of rival kingdoms', 'Divine kingship and obedience to the rule of the gods'], 'Think of the hero\'s journey.', 'The Odyssey emphasizes cleverness, endurance and return to a household.'),
      mc(7, 5, 3, 'Why can hospitality serve as a moral measure in the poem?', ['How hosts and guests treat strangers shows their character', 'Hospitality is only a plot device and carries no meaning', 'Only gods practice hospitality, never ordinary people', 'Hospitality appears just once and is dropped afterward'], 'Consider welcome versus harm.', 'Characters are judged by how they treat guests and strangers.'),
      // L8
      tf(8, 1, 1, 'Greek tragedies were performed at religious festivals in honor of Dionysus.', 0, 'Think of the City Dionysia.', 'Tragedy was part of Athenian festivals honoring Dionysus.'),
      mc(8, 2, 1, 'What is dramatic irony?', ['The audience understands more than the speaker does', 'A character lies to the audience about what has happened', 'The play is meant to be funny rather than serious', 'The chorus sings a song that comments on the action'], 'Who knows more?', 'Dramatic irony arises when the audience grasps meanings that a character misses.'),
      mc(8, 3, 2, 'What discovery does Oedipus make in Sophocles\' play?', ['He himself is the cause of the trouble in Thebes', 'Creon is guilty of the crimes that brought the plague to Thebes', 'The plague is a tale made up by priests', 'The gods are absent and have nothing to do with the plague'], 'He investigates, then it turns on him.', 'He learns that he unknowingly killed his father and married his mother.'),
      mc(8, 4, 2, 'Why is Antigone not a simple contest of right versus wrong?', ['Both Creon and Antigone appeal to real values', 'Creon has no argument and is simply a villain throughout', 'Antigone has little to say on stage', 'The play has no real conflict between its characters'], 'Both have reasons.', 'Loyalty and divine duty clash with civic order, each with real weight.'),
      tf(8, 5, 3, 'Because the audience knew the myth already, the interest in a Greek tragedy lay mainly in how it was told.', 0, 'Think of familiar stories.', 'With known plots, the dramatist\'s choices of emphasis and language become the focus.'),
      // L9
      mc(9, 1, 1, 'Which play is by Euripides?', ['Medea', 'Antigone', 'Oedipus the King', 'The Aeneid'], 'It names a foreign woman.', 'Medea was first performed in 431 BCE.'),
      tf(9, 2, 1, 'Euripides often puts women, foreigners or the defeated at the center of his plays.', 0, 'Think of Medea and Trojan women.', 'Many of his plays center on outsiders and victims.'),
      mc(9, 3, 2, 'What does Medea\'s speech about her position do for the audience?', ['It helps them understand her pain even as they recoil from her act', 'It proves she is innocent and clears her of the deed', 'It ends the play and sends the audience home content', 'It praises Jason and urges the audience to admire him'], 'Think of complexity.', 'The play makes judgment difficult by giving her grievances real force.'),
      mc(9, 4, 2, 'What is an agon in Greek drama?', ['A formal debate between opposing positions', 'A solo song sung by one actor while the chorus is silent', 'A prop carried into the orchestra', 'The final bow taken by the actors after the performance'], 'Think of conflict in speech.', 'An agon is a structured contest of arguments between characters.'),
      tf(9, 5, 3, 'The Trojan Women celebrates the victors of the war without showing the losses of the defeated.', 1, 'Whose viewpoint does it take?', 'The play follows the women who will be enslaved and dwells on loss.'),
      // L10
      mc(10, 1, 1, 'Which philosopher wrote the Poetics?', ['Aristotle', 'Homer', 'Virgil', 'Sophocles'], 'He lived in the fourth century BCE.', 'Aristotle wrote the Poetics.'),
      mc(10, 2, 1, 'Which part of tragedy does Aristotle rank first?', ['Plot', 'Spectacle', 'Melody', 'Diction'], 'It concerns the arrangement of events.', 'He treats plot as the most important part.'),
      tf(10, 3, 2, 'Peripeteia means a reversal, in which events turn to the opposite of what was expected.', 0, 'Think of a turning point.', 'Peripeteia is a reversal; anagnorisis is a recognition.'),
      mc(10, 4, 2, 'Which unity does Aristotle clearly stress?', ['Unity of action', 'Unity of place', 'Unity of time', 'Unity of costume'], 'The other unities came from later critics.', 'Later critics codified time and place; Aristotle stresses unity of action.'),
      mc(10, 5, 3, 'Why is it wise to use the Poetics as a lens, not a rulebook?', ['Its terms are debated and many plays do things it does not describe', 'It is entirely wrong and no longer helps with any play', 'It covers only comedies and says nothing about tragedy', 'It is a modern text that was written after the plays'], 'Terms like catharsis are interpreted differently.', 'Concepts like catharsis and hamartia are disputed, and plays can exceed his categories.'),
      // L11
      tf(11, 1, 1, 'Virgil\'s Aeneid tells of a Trojan survivor whose descendants will found Rome.', 0, 'Think of Aeneas.', 'Aeneas flees Troy and journeys to Italy.'),
      mc(11, 2, 1, 'What does "pietas" mean in the poem?', ['Dutiful devotion to family, gods and homeland', 'Love of battle and the glory won by victory in war', 'Fear of the sea and of the gods who rule it', 'Love of travel and curiosity about distant places'], 'It is a Roman virtue.', 'Pietas describes Aeneas\'s sense of duty.'),
      mc(11, 3, 2, 'What happens to Dido in Book 4?', ['She is abandoned by Aeneas and takes her own life', 'She marries Aeneas in Italy and becomes its first queen', 'She founds the city of Rome with her followers', 'She fights Turnus for the hand of Lavinia in battle'], 'The gods command him to leave.', 'Aeneas leaves Carthage at the gods\' command and Dido kills herself.'),
      mc(11, 4, 2, 'What is allusion?', ['Borrowing and reworking earlier work', 'A direct quotation of an earlier author with credit given', 'A kind of rhyme at line ends', 'The name of a character who appears in several poems'], 'Virgil echoes Homer.', 'Allusion refers to or echoes earlier texts to create meaning.'),
      tf(11, 5, 3, 'Scholars agree that the Aeneid is only a celebration of Augustus and contains no questioning of empire.', 1, 'Think of the abrupt ending.', 'Many scholars debate whether the poem celebrates, questions, or does both.'),
      // L12
      mc(12, 1, 1, 'Why is the Bible described as a library?', ['It contains many books of different genres', 'It has one author who wrote every book in a single style', 'It is only poetry, with no laws', 'It is shorter than a pamphlet and can be read in minutes'], 'Think of variety.', 'It includes narrative, law, poetry, prophecy, gospel, letters and more.'),
      tf(12, 2, 1, 'A literary reading of the Bible aims to describe how its texts are built, not to replace religious readings.', 0, 'The approach is descriptive.', 'It describes genres and techniques while respecting faith traditions.'),
      mc(12, 3, 2, 'Which feature is common in biblical poetry?', ['Parallelism, in which a line repeats, extends or contrasts another', 'Strict rhyme at the end of every line, as in a sonnet', 'Footnotes that explain each verse for the reader', 'Dramatic stage directions that tell the speaker how to move'], 'Think of paired lines.', 'Parallel lines are a basic feature of Hebrew poetry.'),
      mc(12, 4, 2, 'What is notable about much biblical narrative?', ['It is spare and leaves motives for readers to infer', 'It is full of detailed descriptions of faces and clothing', 'It is written in rhyme so it can be memorized easily', 'It never uses dialogue and stays with summary alone'], 'Think of gaps.', 'Narratives often give few details, leaving gaps for readers.'),
      tf(12, 5, 3, 'The King James Version of 1611 influenced English style.', 0, 'Many phrases come through it.', 'The KJV shaped English idiom and prose rhythm.'),
      // L13
      tf(13, 1, 1, 'The Quran is arranged in 114 chapters called surahs.', 0, 'Count the surahs.', 'The Quran has 114 surahs, made of ayat.'),
      mc(13, 2, 1, 'Why is sound central to the Quran?', ['It is primarily recited aloud', 'It is written only in prose and was never meant for the voice', 'It is never read aloud and is meant for private study', 'It is a silent text and has no connection to sound'], 'Think of recitation.', 'The text is experienced through recitation, so rhythm and sound matter.'),
      mc(13, 3, 2, 'How does Surah 12 differ from many other surahs?', ['It tells one continuous story, of Yusuf', 'It has no verses and is made up of prose paragraphs', 'It is a legal list of rules', 'It is a single sentence that covers the whole surah'], 'Think of Joseph.', 'It is a continuous narrative and calls itself the best of stories.'),
      mc(13, 4, 2, 'How are surahs generally ordered?', ['Roughly by length, with longer ones earlier', 'By date of revelation, earliest to latest', 'Alphabetically by the first word in each', 'Randomly, with no pattern readers can find'], 'It is not chronological.', 'Longer surahs generally come earlier and shorter ones later.'),
      tf(13, 5, 3, 'A translation of the Quran can fully reproduce the Arabic\'s sound.', 1, 'Think of rhythm and rhyme.', 'Translations are interpretations and cannot reproduce Arabic sound features.'),
      // L14
      mc(14, 1, 1, 'Which are the two great Sanskrit epics of India?', ['The Mahabharata and the Ramayana', 'The Iliad and the Odyssey', 'The Analects and the Tale of Genji, from China and Japan', 'The Aeneid and Beowulf, from ancient Rome and England'], 'Both are Sanskrit.', 'The Mahabharata and the Ramayana are the two great Sanskrit epics.'),
      tf(14, 2, 1, 'The Bhagavad Gita is a dialogue between Arjuna and Krishna set before a battle in the Mahabharata.', 0, 'It is inside the epic.', 'The Gita is a philosophical dialogue within the Mahabharata.'),
      mc(14, 3, 2, 'Who is the Ramayana traditionally attributed to?', ['Valmiki', 'Vyasa, the sage linked to the Mahabharata', 'Homer, the poet linked to the Iliad and Odyssey', 'Virgil, the Roman poet of the Aeneid and its hero'], 'The other name goes with the Mahabharata.', 'Tradition attributes the Ramayana to Valmiki and the Mahabharata to Vyasa.'),
      mc(14, 4, 2, 'What does a layered, nested structure suggest about these epics?', ['They grew over long periods, with stories inside stories', 'They were written in a single year by one court poet', 'They have no characters and are only lists of laws', 'They are histories only and contain no myth or story'], 'Think of composition over time.', 'Scholars see layers of composition rather than a single author.'),
      tf(14, 5, 3, 'The Mahabharata shows heroes making troubling choices and the costs of war.', 0, 'The moral world is complex.', 'The epic presents conflict between duties and shows the war\'s consequences.'),
      // L15
      mc(15, 1, 1, 'What is the Analects?', ['A collection of sayings and conversations attributed to Confucius and disciples', 'A long epic poem about a king and his journey home', 'A play meant to be performed at court on feast days', 'A travel diary kept by a scholar on a long journey'], 'It is made of short scenes.', 'It is a compilation of sayings and brief dialogues assembled by followers.'),
      tf(15, 2, 1, 'The Analects is a single continuous argument written by Confucius.', 1, 'Think of the form.', 'It is a collection of short passages compiled after his lifetime.'),
      mc(15, 3, 2, 'What does "ren" usually mean?', ['Humaneness or goodness', 'Ritual, the proper form of ceremony and conduct', 'Poetry, the art of verse and its use in education', 'War, the practice of arms in service of the state'], 'It is a central virtue.', 'Ren is translated as humaneness or goodness; li is ritual or proper conduct.'),
      mc(15, 4, 2, 'Why might Confucius answer different students differently?', ['The best answer depends on the person', 'He forgot his earlier answers and spoke without thinking', 'He wished to avoid hard questions', 'He held one fixed rule and applied it to every student'], 'Think of teaching.', 'The text suggests that guidance suits each learner.'),
      mc(15, 5, 3, 'What is a good strategy for reading a short saying?', ['Compare it with other passages and imagine its context', 'Treat it as a slogan that stands alone without context', 'Ignore it, since short sayings cannot hold real meaning', 'Memorize it only and avoid comparing it with others'], 'Context fills gaps.', 'Brief passages gain meaning when read alongside related ones.'),
      // L16
      tf(16, 1, 1, 'The Tang dynasty is often called a golden age of Chinese poetry.', 0, 'Li Bai and Du Fu belong to it.', 'The Tang dynasty (618 to 907) produced major poets.'),
      mc(16, 2, 1, 'Which two poets are named in the lesson?', ['Li Bai and Du Fu', 'Homer and Virgil', 'Dante and Chaucer', 'Milton and Swift'], 'Both lived in the eighth century.', 'Li Bai and Du Fu are two of the best-known Tang poets.'),
      mc(16, 3, 2, 'In "Quiet Night Thought," what feeling does the moonlight image carry?', ['Homesickness', 'Anger at a ruler', 'Joy at a feast', 'Fear of war'], 'The last action is thinking of home.', 'The speaker looks up at the moon and then thinks of home.'),
      tf(16, 4, 2, 'In Du Fu\'s "Spring View," the enduring landscape contrasts with a broken state.', 0, 'Think of loss against permanence.', 'The contrast sharpens the sense of human loss.'),
      mc(16, 5, 3, 'Why should readers of translations remember that they see only part of the poem?', ['Much of the music and form of the Chinese is lost', 'Translations add rhyme the original never had', 'Chinese poems have no images, so nothing is lost', 'Only the title changes, so the poem is the same'], 'Consider tone and form.', 'The tonal and formal patterns do not carry over into English.'),
      // L17
      mc(17, 1, 1, 'Who wrote The Tale of Genji?', ['Murasaki Shikibu', 'Du Fu, a Tang dynasty poet known for his poems', 'Geoffrey Chaucer, an English poet of the fourteenth century', 'Valmiki, a sage who is credited with the Ramayana'], 'A court woman of the Heian period.', 'Murasaki Shikibu wrote it in the early eleventh century.'),
      tf(17, 2, 1, 'Characters in Genji often exchange short poems called waka.', 0, 'Poetry is woven into the prose.', 'Waka exchanges are part of how characters communicate.'),
      mc(17, 3, 2, 'Why is calling Genji a "novel" something to handle with care?', ['What counts as a novel depends on definition', 'It is a record of real court events', 'It is a play written for the stage', 'It was written in Latin by a monk'], 'Think of definitions.', 'Whether it is a novel depends on how the term is defined.'),
      mc(17, 4, 2, 'What does mono no aware refer to, according to Motoori Norinaga?', ['Sensitivity to the fleeting beauty of things', 'A war strategy used by samurai commanders', 'A poetic meter of five and seven syllables', 'A court rank held by nobles in the capital'], 'It is about impermanence.', 'The phrase names a sensitivity to transience as the work\'s central quality.'),
      tf(17, 5, 3, 'In Genji, much of the meaning of a scene can lie in social and emotional nuance rather than action.', 0, 'Think of letters and screens.', 'Small gestures like the timing of a reply carry meaning.'),
      // L18
      mc(18, 1, 1, 'What is a qasida?', ['A classical Arabic ode', 'A frame story in which a storyteller links many tales', 'A play performed by a chorus before an audience', 'A sonnet of fourteen lines with a turn near the end'], 'It is a poem.', 'The qasida is the classical Arabic ode.'),
      tf(18, 2, 1, 'In One Thousand and One Nights, Shahrazad tells stories to stay alive.', 0, 'Think of the unfinished stories.', 'Her storytelling saves her life night after night.'),
      mc(18, 3, 2, 'Which is a typical movement in a pre-Islamic qasida?', ['Remembering a lost love, a journey, then praise or boast', 'A courtroom debate between two tribes over a dispute', 'A series of riddles only, with no praise or place names', 'A sermon on trade and the rules of the marketplace'], 'It begins with nostalgia.', 'Many odes open with an abandoned campsite and move through journey to praise.'),
      mc(18, 4, 2, 'Who helped popularize the Nights in Europe with a translation in the early 1700s?', ['Antoine Galland', 'Dante Alighieri, the Italian poet of the Divine Comedy', 'Voltaire, the French writer of Candide', 'Miguel de Cervantes, the Spanish author of Don Quixote'], 'He wrote in French.', 'Galland\'s French translation spread the tales in Europe.'),
      tf(18, 5, 3, 'Every tale now associated with the Nights, including Aladdin, appears in the earliest Arabic manuscripts.', 1, 'Contents vary by manuscript.', 'Some famous tales, such as Aladdin, are not in the earliest manuscripts.'),
      // L19
      mc(19, 1, 1, 'In what language was Beowulf written?', ['Old English', 'Latin, the language of the Roman church and its schools', 'Greek, the language of the old Mediterranean epics', 'French, the language of the Norman court in England'], 'It is the language of early medieval England.', 'Beowulf is in Old English.'),
      tf(19, 2, 1, 'Beowulf is set in Scandinavia, not England.', 0, 'Think of the Geats and Danes.', 'The hero is a Geat who helps the Danish king.'),
      mc(19, 3, 2, 'What is a kenning?', ['A compound metaphor such as "whale-road"', 'A rhyme at the end of a line that links it to another', 'The name of a narrator in a tale', 'A battle between the hero and one of his monstrous foes'], 'It names something indirectly.', 'Kennings are compound metaphors for familiar things.'),
      mc(19, 4, 2, 'How does the poem treat heroic glory through its digressions?', ['It suggests glory is temporary', 'It says glory lasts forever and cannot be forgotten', 'It ignores glory and focuses only on daily farm work', 'It mocks heroes as fools'], 'Notice the stories of past feuds.', 'References to old stories and feuds create a sense that every hero dies.'),
      tf(19, 5, 3, 'The poem mixes a pre-Christian setting with reflections that seem Christian.', 0, 'Critics debate how they fit.', 'The setting is pre-Christian but the poet reflects on God and fate.'),
      // L20
      mc(20, 1, 1, 'What does "romance" originally refer to?', ['Writing in a vernacular Romance language rather than Latin', 'Only love poems about courtship and marriage at court', 'Greek epic about the gods and the heroes of Troy', 'Biography written in Latin about a saint or a king'], 'Think of language.', 'The term came from works in vernacular languages like French.'),
      tf(20, 2, 1, 'Typical medieval romances include a journey, trials and a test of the hero.', 0, 'Think of a quest.', 'A quest with trials is a core pattern.'),
      mc(20, 3, 2, 'Who wrote some of the earliest major Arthurian romances?', ['Chretien de Troyes', 'Homer, the Greek poet of the Iliad and the Odyssey', 'Virgil, the Roman poet of the Aeneid and its hero', 'Daniel Defoe, the English author of Robinson Crusoe'], 'A twelfth-century French poet.', 'Chretien de Troyes wrote early Arthurian romances.'),
      mc(20, 4, 2, 'What does Gawain\'s acceptance of a magic girdle reveal in Sir Gawain and the Green Knight?', ['A gap between chivalric ideals and human weakness', 'His wish to be king and to rule over the court', 'His skill at the beheading game and the rules of the challenge', 'His magical origin as a knight who was born in the forest'], 'Think of testing.', 'The poem uses the test to explore the frailty beneath the ideal.'),
      tf(20, 5, 3, 'Courtly love in romance is a topic about which scholars debate how closely it matched real life.', 0, 'Think of ideal versus life.', 'Scholars debate how far courtly love reflected real social behavior.'),
      // L21
      mc(21, 1, 1, 'What are the three parts of the Divine Comedy?', ['Inferno, Purgatorio, Paradiso', 'Iliad, Odyssey and Aeneid, the three great epics', 'Genesis, Exodus and Psalms, three books of the Bible', 'Ren, Li and Dao, three ideas in Chinese thought'], 'Hell, Purgatory, Heaven.', 'Dante moves from Hell to Purgatory to Paradise.'),
      tf(21, 2, 1, 'Dante wrote the poem in the Tuscan vernacular rather than in Latin.', 0, 'This raised Italian\'s status.', 'The choice helped establish Italian as a literary language.'),
      mc(21, 3, 2, 'Which rhyme scheme is terza rima?', ['aba bcb cdc', 'abab cdcd efef gg', 'aabb ccdd', 'abcd abcd'], 'Three-line stanzas link together.', 'Terza rima chains rhymes across three-line stanzas.'),
      mc(21, 4, 2, 'Who guides Dante through Hell and most of Purgatory?', ['Virgil', 'Homer', 'Chaucer', 'Aristotle'], 'A Roman poet.', 'Virgil guides him until Beatrice takes over.'),
      mc(21, 5, 3, 'Why is it important to separate Dante the poet from Dante the pilgrim?', ['The poet arranges the story while the pilgrim is learning inside it', 'They are two different historical people from different eras', 'The pilgrim writes the poem after returning from Hell', 'The poet is a character who stays inside Hell throughout'], 'One designs, one experiences.', 'The pilgrim\'s reactions are shaped by the poet\'s design.'),
      // L22
      mc(22, 1, 1, 'What is the frame of The Canterbury Tales?', ['A pilgrimage in which travelers tell stories', 'A war in which knights tell stories at camp', 'A royal court where nobles tell tales', 'A school where pupils recite stories'], 'They travel to a shrine.', 'The pilgrims tell tales on the way to Canterbury.'),
      tf(22, 2, 1, 'The Canterbury Tales was left unfinished.', 0, 'There are gaps in the plan.', 'Chaucer wrote fewer tales than he planned, so the collection is incomplete.'),
      mc(22, 3, 2, 'What is a fabliau?', ['A comic, often bawdy tale', 'A kind of sermon delivered by a friar to a crowd', 'A sonnet in praise of a lady of the court', 'A prologue that introduces the pilgrims one by one'], 'Think of humor.', 'A fabliau is a short, comic tale, often bawdy.'),
      mc(22, 4, 2, 'What creates irony in the General Prologue?', ['The narrator praises people while details suggest their faults', 'The poem is written in prose, so its tone is flat', 'The tales are all serious, with no humor in any one', 'The narrator is absent and never offers any opinion'], 'Compare praise and detail.', 'The gap between praise and the details reveals the pilgrims\' flaws.'),
      tf(22, 5, 3, 'Chaucer the pilgrim is a created narrator and not simply the poet speaking.', 0, 'Think of the narrator.', 'He is a constructed persona within the poem.'),
      // L23
      mc(23, 1, 1, 'How many lines does a sonnet have?', ['Fourteen', 'Twelve, arranged in three quatrains and a couplet', 'Ten, arranged in two stanzas of five lines each', 'Sixteen, arranged in four quatrains of four lines'], 'It is the defining feature.', 'A sonnet has fourteen lines.'),
      tf(23, 2, 1, 'Shakespeare\'s sonnets were published in 1609.', 0, 'The early seventeenth century.', 'The 154 sonnets appeared in 1609.'),
      mc(23, 3, 2, 'What is the Shakespearean rhyme scheme?', ['abab cdcd efef gg', 'aba bcb cdc', 'aabb ccdd eeff gg', 'abba abba cde cde'], 'Three quatrains and a couplet.', 'Three quatrains and a couplet make the usual pattern.'),
      mc(23, 4, 2, 'What does the volta do?', ['Shifts the direction of the poem', 'Ends the rhyme scheme and removes it from the rest of the poem', 'Names the speaker and sets the scene of the poem', 'Gives the title of the poem'], 'It is a turn.', 'The volta is a turn in argument or mood.'),
      mc(23, 5, 3, 'What does Sonnet 130 do with Petrarchan clichés?', ['Lists how the mistress does not match them, yet affirms love', 'Repeats them without change and accepts them as true', 'Praises the sun as a perfect model for her eyes', 'Attacks the reader for believing in such poetic praise'], 'It starts with a denial.', 'The poem parodies stock comparisons while declaring the love honest.'),
      // L24
      tf(24, 1, 1, 'A soliloquy is a speech in which a character alone on stage voices thoughts.', 0, 'Think of speaking alone.', 'A soliloquy shares a character\'s thoughts with the audience.'),
      mc(24, 2, 1, 'What is blank verse?', ['Unrhymed iambic pentameter', 'Rhymed couplets only, written in lines of ten syllables', 'Prose with no set meter', 'A ballad stanza that alternates long and short lines'], 'No rhyme.', 'Blank verse has a steady rhythm without rhyme.'),
      mc(24, 3, 2, 'What can a shift from verse to prose signal?', ['A change of mood or status', 'The end of the play', 'A printing error made by the compositor of the book', 'Nothing at all, since prose and verse are interchangeable'], 'It is a formal choice.', 'Shakespeare may use prose for lower-status characters or for changes in tone.'),
      mc(24, 4, 2, 'What does the repetition in "Tomorrow, and tomorrow, and tomorrow" enact?', ['The dull passing of time', 'A joyful celebration of the coming of a new day', 'A battle cry that rallies soldiers before a fight', 'A prayer for mercy offered to the gods of the house'], 'Think of rhythm and meaning.', 'The repeated word mirrors time creeping on.'),
      tf(24, 5, 3, 'The text of Hamlet settles the reason for Hamlet\'s delay with a single clear answer.', 1, 'Critics offer many reasons.', 'The text supports several explanations without choosing one.'),
      // L25
      mc(25, 1, 1, 'What does Don Quixote mistake for giants?', ['Windmills', 'Castles', 'Ships', 'Mountains'], 'A famous episode.', 'He attacks windmills, believing them to be giants.'),
      tf(25, 2, 1, 'Don Quixote was published in two parts, in 1605 and 1615.', 0, 'Ten years apart.', 'Cervantes published Part 1 in 1605 and Part 2 in 1615.'),
      mc(25, 3, 2, 'What does Sancho Panza represent in contrast to Quixote?', ['Earthy common sense', 'Idealism and a devotion to the ideals of chivalry', 'Royal power and the authority of a king over a realm', 'Magic and the skill to work spells against enemies'], 'He is the squire.', 'Sancho\'s practicality contrasts with Quixote\'s idealism, though both change.'),
      mc(25, 4, 2, 'What is metafiction?', ['Fiction that refers to itself as fiction', 'A rhyme linking two line ends', 'A true history of events as they actually happened', 'A prologue that comes before the main story begins'], 'Part 2 characters have read Part 1.', 'Metafiction draws attention to its own fictional status.'),
      tf(25, 5, 3, 'Calling Don Quixote the first modern novel depends on how the term is defined.', 0, 'The claim is debated.', 'Scholars debate the label because definitions of the novel differ.'),
      // L26
      mc(26, 1, 1, 'When was Paradise Lost first published?', ['1667', '1567', '1767', '1867'], 'The seventeenth century.', 'The first edition appeared in 1667 in ten books.'),
      tf(26, 2, 1, 'Milton composed Paradise Lost after he had become blind.', 0, 'He dictated it.', 'He was blind and dictated the poem.'),
      mc(26, 3, 2, 'What verse form does Paradise Lost use?', ['Blank verse', 'Terza rima', 'Alliterative verse', 'Sonnets'], 'Unrhymed.', 'Milton chose blank verse and rejected rhyme.'),
      mc(26, 4, 2, 'What is the central debate about Satan in the poem?', ['Whether his speeches are attractive or exposed as self-deceiving', 'Whether he appears at all in the early books of the poem', 'Whether he speaks Latin to the other fallen angels', 'Whether he is meant to be shown as a woman or a man'], 'Different readers see different things.', 'Readers disagree on whether the poem makes Satan attractive or exposes him.'),
      mc(26, 5, 3, 'What reading skill does Satan\'s speech teach?', ['An eloquent voice is not necessarily a reliable one', 'Poetry is always true, so a speaker can be trusted', 'Rhetoric has little effect on a listener', 'Speakers in poems never lie, as the poet is honest'], 'Think of persuasion.', 'Persuasive rhetoric must be tested against the whole poem.'),
      // L27
      mc(27, 1, 1, 'What does "essai" mean?', ['An attempt or trial', 'A story, usually a tale of adventure about a hero', 'A poem written in rhymed lines about love or loss', 'A play meant for the stage and a paying audience'], 'It describes a way of thinking.', 'Montaigne\'s title describes thinking as an attempt.'),
      tf(27, 2, 1, 'Montaigne published his first Essays in 1580.', 0, 'A French writer.', 'The first Essays appeared in 1580.'),
      mc(27, 3, 2, 'Which technique does Richardson\'s Pamela use?', ['Letters, called epistolary narration', 'A chorus that comments on the action between scenes', 'Blank verse in ten-syllable lines', 'A frame of pilgrims who tell stories on a journey'], 'Think of correspondence.', 'The novel is told through letters.'),
      mc(27, 4, 2, 'Which work first appeared in 1719 as a fictional memoir?', ['Robinson Crusoe', 'Evelina, a novel about a young woman entering society', 'Tom Jones, a comic novel about a foundling by Fielding', 'Pamela, a novel told in letters by Samuel Richardson'], 'The first person memoir.', 'Defoe\'s Robinson Crusoe appeared in 1719.'),
      tf(27, 5, 3, 'The early novelists experimented with narrative techniques that Jane Austen later built on.', 0, 'Think of precursors.', 'Austen\'s technique builds on earlier experiments.'),
      // L28
      mc(28, 1, 1, 'What is satire?', ['Writing that uses humor and irony to criticize', 'A kind of rhyme used to close a stanza', 'A true biography of the life of a leader', 'A prayer offered in a service of worship'], 'It aims at folly.', 'Satire uses irony and exaggeration to expose problems.'),
      tf(28, 2, 1, 'In A Modest Proposal, the speaker\'s calm voice is the same as Swift\'s own view.', 1, 'Think of persona.', 'The speaker is a persona, and the real target is indifference to poverty.'),
      mc(28, 3, 2, 'Which work features Lemuel Gulliver?', ['Gulliver\'s Travels', 'Candide, the tale of a young man and his tutor', 'Evelina, the novel of a young woman entering society', 'Don Quixote, the tale of a knight who reads romances'], 'Published in 1726.', 'Swift published Gulliver\'s Travels in 1726.'),
      mc(28, 4, 2, 'What does Pangloss teach Candide?', ['That this is the best of all possible worlds', 'That the world is beyond repair', 'That money is everything and the only road to a good life', 'That war is good and brings out the best in people'], 'It is an optimistic philosophy.', 'Candide\'s experiences contradict Pangloss\'s optimism.'),
      mc(28, 5, 3, 'What is the best first step for reading satire?', ['Identify the speaker and the target', 'Take every statement literally and trust the narrator', 'Skip the ending, judge the start', 'Ignore exaggeration and treat each claim as plain fact'], 'Who speaks, and at whom?', 'Satire works through a gap between what is said and what is meant.'),
    ],
  },
};
