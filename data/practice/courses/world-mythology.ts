import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Correct choice is written FIRST; the helper rotates choices so the answer position varies.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
// answer: 0 = True, 1 = False
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const ID = 'world-mythology';
const L = (n: number) => `${ID}.l${String(n).padStart(2, '0')}`;
const L01 = L(1), L02 = L(2), L03 = L(3), L04 = L(4), L05 = L(5), L06 = L(6), L07 = L(7), L08 = L(8);
const L09 = L(9), L10 = L(10), L11 = L(11), L12 = L(12), L13 = L(13), L14 = L(14), L15 = L(15), L16 = L(16);
const L17 = L(17), L18 = L(18), L19 = L(19), L20 = L(20), L21 = L(21), L22 = L(22), L23 = L(23), L24 = L(24);
const L25 = L(25), L26 = L(26), L27 = L(27), L28 = L(28), L29 = L(29), L30 = L(30), L31 = L(31), L32 = L(32);

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: ID,
    label: 'Myths and Mythology of the World',
    blurb: 'How to study myth, then a journey through the sacred and traditional stories of Mesopotamia, Egypt, Europe, Asia, Oceania, Australia, Africa and the Americas, with attention to sources, living traditions and respect.',
    accent: '#7A2BD6',
    framework: 'ncas',
    tracks: [
      {
        id: `${ID}.t1`,
        title: 'How to Study Myth',
        blurb: 'What myth means, the main ways scholars read it, how stories reach us, and how to approach living traditions respectfully.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What Is a Myth?',
            blurb: 'In scholarship a myth is a traditional story that carries meaning for a community, not simply a falsehood.',
            minutes: 6,
            body: `In everyday speech, "myth" often means a false belief, as in "that is just a myth." Scholars of religion and literature use the word differently. A myth is a traditional story, usually about gods, ancestors, heroes, or the origins of the world, that a community tells because it explains something or gives meaning to life. Calling a story a myth in this sense says nothing about whether it is true. It describes the kind of work the story does.

Myths often address large questions: how the world began, why people die, why the seasons turn, where a people came from, how to live well. They are usually told in groups, performed aloud, and retold in many versions. There is rarely one "official" text. Different villages, priests or poets told the same story differently, and the differences are part of the evidence.

Consider the figure of Pandora in the Greek poet Hesiod's Works and Days. In that poem a woman is made by the gods, and a jar is opened from which many troubles escape into the human world. Readers have debated for centuries what the story says about hardship, hope, gender and the gods. The story has no single settled meaning, and that openness is typical of myth.

Throughout this course we describe myths by attributing them: "according to the Poetic Edda," "in the Rig Veda." For many peoples these narratives are sacred and part of living religion, so we treat them with respect, and we always ask which sources survive and who wrote them down.`,
          },
          {
            id: L02,
            title: 'Four Lenses: Comparative, Functional, Structural, Historical',
            blurb: 'Scholars read myths by comparing them, asking what they do, finding their patterns, or tracing their history.',
            minutes: 7,
            body: `No single method explains every myth, so scholars use several lenses. Each one asks a different question, and each has known weaknesses.

The comparative approach sets myths from different cultures side by side. In the nineteenth century, scholars noticed that Indo-European languages share a common ancestry and asked whether their myths did too. Georges Dumézil later argued that several Indo-European societies shared a three-part ideology of priests, warriors and producers. Comparison can reveal patterns, but it can also flatten real differences or suggest links that are only coincidence.

The functional approach asks what a myth does for the society that tells it. The anthropologist Bronisław Malinowski, working among Trobriand Islanders in the early twentieth century, argued that myths act as a "charter," justifying customs, rituals and social arrangements. A story about how a clan began can explain why that clan holds certain land.

The structural approach, associated with Claude Lévi-Strauss, looks for underlying patterns, especially pairs of opposites such as raw and cooked, life and death, nature and culture, and how myths mediate them. Critics say the method can feel arbitrary about which pairs to pick.

The historical approach asks when and where a story arose and how it changed, and sometimes whether it preserves memory of real events. The ancient writer Euhemerus argued that gods were deified humans. Historical readings are strongest when written evidence exists and weakest when they guess at a hidden "real event."

A careful reader uses several lenses and says which one is in play.`,
          },
          {
            id: L03,
            title: 'Oral Stories and Written Sources',
            blurb: 'Most myths lived in speech; what survives is what someone wrote down, in a particular time and for particular reasons.',
            minutes: 7,
            body: `Before writing, and often alongside it, myths lived in performance. A storyteller, singer or priest shaped the tale for an audience, and no two tellings were identical. What we can read today is almost always a written snapshot taken at one moment by one writer.

That matters because writers have reasons. Homer's Iliad and Odyssey were composed in a tradition of oral poetry and were written down in antiquity, though when and by whom is debated. The Old Norse myths we know come mainly from Iceland in the thirteenth century, roughly two hundred years after Iceland accepted Christianity around the year 1000. The poems of the Poetic Edda survive in a manuscript from about the 1270s, and the Prose Edda was written by the Icelandic scholar Snorri Sturluson around 1220. These writers were Christians preserving older material, and they may have shaped it.

Outsiders also wrote about other peoples' stories. Spanish friars recorded Aztec and Inca traditions after conquest. Nineteenth-century collectors sometimes edited tales to suit their own tastes. A good student of myth therefore asks four questions: who told it, who recorded it, when, and for whom?

A worked example: a Norse myth in Snorri's Prose Edda may reflect older belief, thirteenth-century literary taste, or both. We cannot be sure which, so careful writers say "according to Snorri" instead of "the Vikings believed."

The gaps are also evidence. Where no early text survives, as with Slavic religion, claims about the myths must be marked as reconstruction.`,
          },
          {
            id: L04,
            title: 'Living Traditions and Respect',
            blurb: 'Many myths are sacred to people today, and some stories belong to specific communities or are not meant for outsiders.',
            minutes: 6,
            body: `Some of the traditions in this course are extinct as practiced religions, such as ancient Egyptian state religion. Others are alive. Hindu, Buddhist, Shinto, Christian, Muslim, Yoruba, Maori and many Indigenous traditions continue today, and their narratives are sacred or deeply meaningful to millions of people. Studying them calls for the same care we would want for our own beliefs.

Several habits help. First, attribute rather than assert. Writing "according to the Kojiki, the sun goddess Amaterasu..." respects the tradition without claiming the story as historical fact or mocking it. Second, avoid calling a living tradition's sacred story a "myth" in the sense of "falsehood." Third, notice who is speaking. Insiders and outsiders may describe the same story very differently, and both views are evidence.

A further point concerns ownership. Many Indigenous stories belong to particular nations or families, not to humanity in general. Among Aboriginal Australian peoples, for instance, some stories are restricted to people who have been initiated, and outsiders should not retell them. Some stories are told only at certain times of year or by certain people. Published versions may exist because a community chose to share them, or because an outsider recorded them without permission.

A practical rule: when a story is attributed to a specific nation, name that nation, prefer sources the community itself has shared, and do not present one nation's story as "the Native American" or "the African" myth. Respect is part of accuracy.`,
          },
        ],
      },
      {
        id: `${ID}.t2`,
        title: 'Mesopotamia and Egypt',
        blurb: 'Creation, kingship, death and the afterlife in the earliest written mythologies of the Near East and the Nile.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L05,
            title: 'Enuma Elish: Marduk and the Making of the World',
            blurb: 'The Babylonian creation epic tells how the god Marduk defeated Tiamat and ordered the cosmos.',
            minutes: 7,
            body: `The Enuma Elish is a Babylonian poem about the beginning of the world, written in the Akkadian language on clay tablets in cuneiform script. Its name comes from its opening words, usually translated "When on high." It runs to seven tablets, and scholars generally place its composition in the later second millennium BCE, though the date is debated.

According to the poem, in the beginning there were only two waters mingled together: Apsu, the fresh water, and Tiamat, the salt water. From them younger gods were born. The noise of these young gods disturbed Apsu, and the conflict that followed led to his death. Tiamat then prepared for war against the younger gods. The god Marduk agreed to face her on the condition that he be made supreme among the gods. He defeated Tiamat, split her body, and used its parts to form the heavens and the earth. Later in the poem humans are made from the blood of a defeated god, Kingu, in order to do the work of the gods and let the gods rest.

The poem ends by praising Marduk with fifty names. Marduk was the patron god of the city of Babylon, and many scholars read the epic as raising Babylon's god to the top of the divine order. Tradition holds that it was recited at the Babylonian New Year festival, known as the Akitu.

Notice what the story says about order: the world is made by victory over chaos, and humans exist to serve the gods. Other Mesopotamian texts present different ideas, so Enuma Elish is one voice, not the whole tradition.`,
          },
          {
            id: L06,
            title: 'Gilgamesh: Friendship, Death and the Flood',
            blurb: 'The Epic of Gilgamesh follows a king of Uruk from glory to grief and an unsuccessful search for immortality.',
            minutes: 8,
            body: `The Epic of Gilgamesh is among the oldest surviving works of literature. Its hero, Gilgamesh, was probably based on a real early king of the Mesopotamian city of Uruk, though the poems about him are legend. Several shorter Sumerian poems about him survive, and later Babylonian authors combined and expanded the material into an Akkadian epic. The best-known "standard version" of twelve tablets is traditionally credited to a scholar named Sin-leqi-unninni, and much of it was recovered from the library of the Assyrian king Ashurbanipal at Nineveh.

In the epic, Gilgamesh begins as a powerful but overbearing ruler. The gods create the wild man Enkidu as a match for him. The two fight, then become close friends, and together they travel to the Cedar Forest and kill its guardian, Humbaba. After the gods decree Enkidu's death, Gilgamesh is shaken by grief and by the realization that he too will die.

He travels to find Utnapishtim, a survivor of a great flood sent by the gods, who was granted eternal life. Utnapishtim tells the flood story and challenges Gilgamesh to stay awake for a week. Gilgamesh fails, and he finally obtains a plant that renews youth, only to lose it to a snake while he bathes. He returns to Uruk without immortality, but he points with pride to the city walls.

Many readers see the poem as a meditation on mortality: fame, friendship and building something lasting are the human answers to death. Note that the epic survives in damaged tablets, so some lines are reconstructed and translations differ.`,
          },
          {
            id: L07,
            title: 'Osiris, Isis and Horus',
            blurb: 'The myth of the murdered Osiris links death, resurrection of a kind, and the legitimacy of Egyptian kings.',
            minutes: 7,
            body: `Ancient Egypt had no single scripture. Its myths are known from many sources: temple inscriptions, tomb walls, funerary texts, and hymns. The earliest large collection of religious writings is the Pyramid Texts, carved inside royal pyramids at the end of the Old Kingdom, around 2400 BCE. They mention Osiris, Isis, Set and Horus in scattered form. The most continuous ancient telling is by a later Greek writer, Plutarch, in his work On Isis and Osiris, written around 100 CE, so a student should remember that this version is much later and was written by an outsider.

According to the story as Plutarch and Egyptian texts together suggest, Osiris was a king who brought order and civilization. His brother Set killed him out of jealousy. His sister and wife Isis searched for his body and, with powerful magic, restored enough life for Osiris to father a son, Horus. Horus grew up and contested the kingship with Set. In the end Horus was recognized as rightful ruler, and Osiris became lord of the dead.

This myth did two jobs. It explained kingship: the living king was identified with Horus, and the dead king with Osiris. It also offered hope about death. Over time, ordinary Egyptians, not only kings, came to hope for a favorable judgment and a life after death under the care of Osiris.

Details of the story vary from source to source, and the Egyptians themselves accepted several versions.`,
          },
          {
            id: L08,
            title: 'Creation and the Sun: Many Egyptian Stories',
            blurb: 'Egyptian temples told different, coexisting accounts of how the world began and how the sun god renews it each day.',
            minutes: 7,
            body: `A modern reader may expect one creation story per culture. Egypt did not work that way. Different religious centers told different accounts of the beginning, and the Egyptians did not treat them as rivals so much as complementary descriptions of a mystery.

In the tradition of Heliopolis, the world began as Nun, a dark, formless primeval water. From it rose a mound, and on it appeared the creator god Atum, who produced the first divine pair, Shu (air) and Tefnut (moisture). They in turn had Geb (earth) and Nut (sky), whose children included Osiris, Isis, Set and Nephthys. This family of gods is called the Ennead, from a Greek word meaning "nine." In the tradition of Memphis, preserved on a stone known as the Shabaka Stone, the god Ptah created by thought in the heart and command in speech. In Hermopolis, a group of eight primeval beings, the Ogdoad, took part.

The sun god, often called Ra, had a daily story of his own. In the standard picture he sails across the sky in a boat by day, and by night passes through the underworld, called the Duat, where he faces dangers, including the serpent Apep, before being reborn at dawn. This cycle expressed hope that order would return each morning.

The common thread is renewal from the waters of chaos. Egyptians kept the older stories while adding new ones, so a temple might honor several creators at once.`,
          },
        ],
      },
      {
        id: `${ID}.t3`,
        title: 'Greece, Rome and Europe',
        blurb: 'The Greek and Roman canon, then the Norse, Celtic and Slavic traditions, each with serious limits on the surviving evidence.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'Hesiod and the Succession of the Gods',
            blurb: 'Hesiod\'s Theogony tells how the Greek gods came to be and how Zeus won rule of the cosmos.',
            minutes: 7,
            body: `Greek myth had no single holy book. Its earliest major written sources are poems from around 700 BCE: the epics of Homer and the Theogony and Works and Days of Hesiod. The Theogony, meaning "birth of the gods," is the best surviving systematic account of how the divine world was formed.

In Hesiod's poem, Chaos comes first, then Gaia, the earth. Gaia bears Ouranos, the sky, who becomes her partner. Their children include the Titans. Ouranos tries to keep his children hidden away, and the youngest Titan, Cronus, overthrows him at his mother's urging. Cronus then fears his own children will do the same, and swallows them as they are born. His wife Rhea saves the youngest, Zeus, who grows up, frees his siblings, and leads a war against the Titans. After victory, Zeus becomes king of the gods and distributes honors among the others.

This is a story about succession and about justice: power is gained by force, then stabilized by sharing it and by law. Scholars have also compared the pattern of generations of gods with similar accounts from the Near East, such as the Hittite and Babylonian ones, and argue about how much was borrowed.

Hesiod was one voice. Local cults often told different stories about the same gods, and later writers such as the poets of tragedy and the Roman poet Ovid changed details again. The "Greek myth" a modern reader meets is a patchwork of sources from many centuries, not a single canon.`,
          },
          {
            id: L10,
            title: 'Heroes, Epic and Tragedy',
            blurb: 'Greek heroes live in epic poems and are reinvented by the tragedians, who used myth to question human choice.',
            minutes: 8,
            body: `Greek heroes are human, or part human, figures whose deeds stand between the world of gods and the world of ordinary people. Heracles performs labors, Perseus slays the Gorgon, Odysseus wanders home from Troy. Their stories reach us in many forms.

The earliest are the epics. The Iliad and the Odyssey, traditionally ascribed to Homer, were composed in the eighth century BCE or thereabouts, though the identity of Homer and the way the poems took shape are still debated. The Iliad tells of a few weeks in the Trojan War, centering on the anger of Achilles. The Odyssey follows Odysseus's difficult return to Ithaca after the war.

In the fifth century BCE, playwrights at Athens used myth as raw material for tragedy. Aeschylus, Sophocles and Euripides each staged familiar legends, but they changed emphasis to raise questions about justice, fate, family loyalty, and the limits of human knowledge. In Sophocles' Oedipus the King, a ruler investigates a plague and discovers that he himself fulfilled a terrible prophecy. The audience knew the outline in advance, so the drama lay in how the story was told and what it meant.

Here is the key lesson: myth was a shared, flexible resource, not a fixed text. Poets could alter a story and the audience would accept it. When we say "the Greek myth of Medea" we should really ask which author's Medea we mean, since Euripides, Ovid and later writers differ.`,
          },
          {
            id: L11,
            title: 'Roman Myth: Borrowing, Founding and Propaganda',
            blurb: 'Romans fused their gods with Greek ones and told founding stories that served their city and later its emperors.',
            minutes: 7,
            body: `Romans had their own early deities and rituals, but as Rome came into close contact with Greek culture, Roman writers matched their gods to Greek counterparts: Jupiter with Zeus, Juno with Hera, Mars with Ares, Venus with Aphrodite, Minerva with Athena. The matching was never exact, and Roman religion kept its own emphasis on ritual, the household, and the state.

Rome also told stories about itself. According to tradition, the city was founded by Romulus, who with his twin Remus was said to have been raised by a she-wolf, and the traditional date for the founding is 753 BCE. This is a founding legend, not a recorded historical event. Another tradition said that Rome's ancestors came from Troy through the hero Aeneas.

The poet Virgil gave that tradition literary form in the Aeneid, written during the rule of the emperor Augustus and left unfinished at Virgil's death in 19 BCE. It follows Aeneas as he flees the fall of Troy, wanders the Mediterranean, and settles in Italy, guided by fate toward the future greatness of Rome. Many scholars read the poem as supporting Augustus's authority while also expressing the human costs of empire; readers still debate how critical it is.

Another major source is Ovid's Metamorphoses, written around the start of the first century CE, a long poem retelling stories of transformation from Greek and Roman tradition. Roman myth is therefore deeply literary, shaped by poets with political and artistic aims.`,
          },
          {
            id: L12,
            title: 'Norse Myth Through the Eddas',
            blurb: 'Our knowledge of Norse gods comes largely from Icelandic writers of the thirteenth century, so caution is needed.',
            minutes: 8,
            body: `When people say "Norse mythology," they usually mean stories of Odin, Thor, Loki, Freyja, the world tree Yggdrasil and the end-of-the-world battle called Ragnarok. Almost everything we know comes from two Icelandic sources.

The Poetic Edda is a collection of anonymous poems preserved chiefly in a manuscript called the Codex Regius, written in about the 1270s. Some poems may be much older than the manuscript, but dating them is difficult. One of them, Völuspá, presents a seeress describing the creation of the world, the gods, and its eventual destruction and rebirth. The Prose Edda was written around 1220 by Snorri Sturluson, an Icelandic chieftain and scholar, as a handbook for poets who needed to understand the old myths used in traditional verse. In it Snorri tells stories such as Thor's journeys and the death of the god Baldr.

The caveat is large. Iceland accepted Christianity around the year 1000, so these texts were written down by Christians roughly two centuries later. Snorri may have organized and systematized material that was originally more varied and local. Evidence from before the conversion, such as carved stones, place names, and short references by foreign writers, helps but is limited.

"Germanic" mythology is even thinner. For the continental Germanic peoples, a few references in Roman writers such as Tacitus and scattered folk traditions survive. Responsible writers say "the Eddas tell us" and avoid describing a complete, unified Viking religion.`,
          },
          {
            id: L13,
            title: 'Celtic Myth: Irish and Welsh Sources',
            blurb: 'Celtic myths are known mostly from medieval Irish and Welsh manuscripts written by Christians centuries later.',
            minutes: 8,
            body: `"Celtic" refers to a family of related languages and cultures, not a single people with one religion. In antiquity, Celtic-speaking peoples lived across much of Europe, but they left almost no myths in their own writing. Ancient Greek and Roman authors described them, but these were outsiders with their own purposes. So our main sources for "Celtic mythology" are medieval texts from Ireland and Wales.

In Ireland, stories were gathered in manuscripts from roughly the twelfth century onward, though many tales are older. Scholars group them in cycles. The Mythological Cycle tells of supernatural peoples, especially the Tuatha Dé Danann, and is partly preserved in the medieval compilation Lebor Gabála Érenn, the "Book of Invasions." The Ulster Cycle centers on the hero Cú Chulainn and the epic cattle raid Táin Bó Cúailnge.

In Wales, the Mabinogion is the modern name given to a group of medieval tales, and the Four Branches of the Mabinogi are the core. They survive in manuscripts of the thirteenth and fourteenth centuries and feature figures such as Pwyll, Rhiannon and Bran. They contain older folklore, but they were written by Christian authors in a literary culture.

The same caution applies as with the Norse material. These writers preserved the old stories, perhaps adapted them, and sometimes made the old gods into kings or heroes. Claims about specific ancient Celtic rituals or beliefs usually go beyond the evidence. A careful student says "in medieval Irish tradition" rather than "the Celts believed."`,
          },
          {
            id: L14,
            title: 'Slavic Myth: What We Can and Cannot Know',
            blurb: 'Pre-Christian Slavic religion left few written records, so reconstructions rest on late and indirect evidence.',
            minutes: 7,
            body: `The Slavic peoples of eastern and central Europe had religious beliefs before Christianity, but they did not leave extensive written myths. This makes Slavic mythology a useful lesson in the limits of evidence.

What survives falls into a few kinds. First, medieval chronicles written by Christians. The Rus' Primary Chronicle, compiled in the early twelfth century, reports that Prince Vladimir set up wooden idols in Kiev, including one of Perun, and later turned to Christianity; the conversion of Rus' is traditionally dated to 988. Perun is generally understood to be a thunder god. Second, accounts by foreign missionaries and chroniclers describing West Slavic sanctuaries. Third, archaeology. Fourth, folklore collected much later, in the eighteenth and nineteenth centuries, including tales of Baba Yaga, a witch-like figure in her hut. These tales were gathered by collectors such as Alexander Afanasyev.

The difficulty is that late folklore may not preserve ancient belief, and the Christian chroniclers had reasons to portray pagan religion in a certain way. Some modern writers use the comparative method with other Indo-European traditions, for example linking Perun's name or role with other thunder gods, to fill gaps. This can suggest hypotheses, not proof.

A careful summary says: Perun is attested early; Veles and other names appear in some sources; much else is reconstruction. When you read a confident "Slavic pantheon" chart, ask what evidence stands behind each name.`,
          },
        ],
      },
      {
        id: `${ID}.t4`,
        title: 'South and East Asia',
        blurb: 'Vedic hymns and Hindu epics, Buddhist birth stories, and the mythic literatures of China, Japan and Korea.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L15,
            title: 'Vedic Myth and the Hindu Epics',
            blurb: 'From the Rig Veda hymns to the Ramayana and Mahabharata, Hindu narrative tradition spans millennia and remains alive.',
            minutes: 8,
            body: `Hindu narrative tradition is vast and ongoing. Its oldest layer is the Rig Veda, a collection of more than a thousand hymns in early Sanskrit, composed orally and preserved by memorization over many centuries. Scholars usually place its composition in the second millennium BCE, with the exact dates debated. The hymns praise gods such as Indra, the storm god who slays the serpent Vritra, and Agni, the fire. One famous hymn, often called the Nasadiya Sukta, asks who really knows how creation began, and even suggests that the highest overseer may or may not know. Another, the Purusha Sukta, describes a cosmic being from whose sacrifice the world arose.

Later come the two great epics. The Mahabharata, traditionally attributed to the sage Vyasa, tells of a war between two branches of a royal family and includes the Bhagavad Gita, a dialogue between the warrior Arjuna and Krishna. The Ramayana, traditionally attributed to the poet Valmiki, tells of Prince Rama, who is exiled, loses his wife Sita when she is abducted by the demon-king Ravana, and eventually defeats him. The Puranas, later collections, add many stories of gods such as Vishnu, Shiva and the goddess Devi.

These are living scripture and story for hundreds of millions of people. They have been retold in many languages, in dance, drama and film, and different versions change the plot and the characters' meaning. A reader should speak of "a version of the Ramayana," because there is no single authoritative telling. The traditional authorship by Valmiki and Vyasa is a matter of tradition; scholars see the epics as growing over a long time.`,
          },
          {
            id: L16,
            title: 'Buddhist Jataka Tales',
            blurb: 'The Jatakas recount previous lives of the Buddha-to-be, using stories to teach generosity, patience and wisdom.',
            minutes: 7,
            body: `In Buddhist tradition, the historical Buddha, Siddhartha Gautama, was not on his first life when he attained awakening. The Jataka tales are stories of his earlier existences as a bodhisattva, a being on the path to awakening. In them he may be born as a king, a merchant, a deer, a monkey or a hare. The Pali collection traditionally counts about 547 tales, though the number varies by source.

The stories follow a pattern. A narrative is told, often with verses, and the teller then connects the characters to people in the Buddha's own time, identifying the bodhisattva with one of them. The message is moral: virtues such as generosity, truthfulness, patience and compassion are cultivated across many lifetimes, and actions have consequences, a teaching known as karma.

One widely told example is the story of the hare. A hare, a monkey, a jackal and an otter each vow to give alms to a guest. The hare has nothing to offer but itself and prepares to leap into a fire, and in the story the guest, who is actually the king of the gods, is moved and honors the hare by marking its likeness on the moon. As with most stories, versions differ.

Jataka scenes appear in the carvings of early Buddhist monuments in India, such as the stupas at Bharhut and Sanchi, which shows how widely they were known. The stories are told in many Buddhist countries today, and for believers they teach a path to be followed, not only entertainment.`,
          },
          {
            id: L17,
            title: 'China: Pangu, Nuwa and the Monkey King',
            blurb: 'Chinese myth is scattered across many texts, and some famous figures are first recorded surprisingly late.',
            minutes: 8,
            body: `Chinese mythology is not gathered in one canonical book. Stories appear in early works of history, philosophy and geography, then in later collections and novels. One early source is the Classic of Mountains and Seas, a text of strange creatures and distant places that was compiled over centuries.

The creation figure Pangu is a good example of why dates matter. Pangu is the giant who, in the usual telling, separates heaven and earth and whose body becomes the features of the world. Although he is often described as ancient, the story is first recorded in sources from around the third century CE, and some scholars see it as shaped by influence from other traditions. Earlier Chinese texts do not contain him.

Older stories include Nuwa, a goddess who in several accounts creates humans from yellow earth and repairs the broken sky, and the flood-controller Yu the Great, who dredged channels to tame floods rather than simply blocking them, a theme that blends myth and early legend of kingship.

A later and famous work is Journey to the West, a long novel published in the sixteenth century during the Ming dynasty and traditionally attributed to Wu Cheng'en. It draws on the real pilgrimage of the Tang dynasty monk Xuanzang, who traveled to India in the seventh century to obtain Buddhist texts. In the novel he is protected by the mischievous Monkey King, Sun Wukong, and other companions. The novel mixes Buddhist, Daoist and folk elements with humor, so it is a literary work built on religious and popular traditions.`,
          },
          {
            id: L18,
            title: 'Japan: Kojiki and Nihon Shoki',
            blurb: 'Japan\'s earliest mythic books were compiled in the early eighth century and tie gods to the imperial line.',
            minutes: 8,
            body: `Japan's oldest surviving long narratives of myth are the Kojiki, completed in 712 CE, and the Nihon Shoki, completed in 720 CE. Both were compiled at the imperial court. The Kojiki is written in a style that blends Chinese characters used for sound and meaning, and the Nihon Shoki is in Classical Chinese and often gives alternative variants of the same story. They draw on older oral traditions, but they were shaped by the court's interest in showing the legitimacy of the ruling line.

In the Kojiki, the divine pair Izanagi and Izanami create the Japanese islands and give birth to many deities. Izanami dies after giving birth to fire and goes to the land of the dead, and Izanagi follows her but flees in horror. When he purifies himself, several major deities are born, including the sun goddess Amaterasu and her brother Susanoo, god of storms and the sea. After Susanoo behaves destructively, Amaterasu hides in a cave and the world goes dark, until the other gods lure her out with a festival of laughter and dance and a mirror.

Later episodes lead to the descent to earth of Amaterasu's grandson, and eventually to the first human emperor, Jimmu. In this way, the myths link the imperial family to the sun goddess.

These stories are connected to Shinto, the indigenous religion of Japan, which continues today. It is important to know that in the twentieth century, governments used these myths to support nationalist ideology, which has made their interpretation politically sensitive. Today, scholars study them as literature and religion, and many Japanese people treat them as cultural heritage.`,
          },
          {
            id: L19,
            title: 'Korea: Dangun and the Founding Tales',
            blurb: 'Korean foundation myths such as Dangun appear in medieval chronicles and remain culturally important.',
            minutes: 6,
            body: `Korea has a rich mythic heritage, much of it preserved in two medieval works. The Samguk Sagi, completed in 1145 by the official Kim Busik, is a history of the Three Kingdoms of Goguryeo, Baekje and Silla. The Samguk Yusa, compiled in the thirteenth century by the Buddhist monk Iryeon, collects legends, folklore and Buddhist stories that the more official history left out.

The best-known foundation story is that of Dangun, recorded in the Samguk Yusa. In it, Hwanung, the son of the heavenly ruler Hwanin, descends to a mountain and establishes a divine city. A bear and a tiger pray to become human. Hwanung gives them garlic and mugwort and tells them to stay in a cave away from sunlight. The tiger gives up, but the bear persists and becomes a woman. She gives birth to Dangun, who founds the first Korean kingdom, called Gojoseon. The traditional date given for this founding is 2333 BCE. That is a date from later tradition, not one established by archaeology or contemporary records.

Other founding myths tell of Jumong, who in tradition founded the kingdom of Goguryeo, and of the founders of Silla, whose stories include miraculous births from eggs. Korean shamanic tradition, known as muism, also has a body of narrative songs that are performed in ritual.

For a student, the Dangun tale shows how a national origin story can be culturally central and also be recorded in a particular medieval source, with its own historical context.`,
          },
        ],
      },
      {
        id: `${ID}.t5`,
        title: 'Oceania, Australia and Africa',
        blurb: 'Oral traditions taught and held by living communities, with strong guidance about attribution, restriction and the limits of outside records.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L20,
            title: 'Polynesian and Maori Myth',
            blurb: 'Across the Pacific, related stories of sky and earth, and of the trickster-hero Maui, vary from island to island.',
            minutes: 7,
            body: `Polynesian peoples settled a vast triangle of the Pacific, including Hawai'i, Aotearoa (New Zealand) and Rapa Nui. Their languages and cultures are related, and so are many of their stories, but each island group, and often each iwi or family, tells them differently. Traditions were carried orally by specialists and written down from the nineteenth century, often by outsiders such as missionaries and officials.

In Maori tradition, the world began with Ranginui, the sky father, and Papatuanuku, the earth mother, locked in an embrace. Their children lived in darkness between them and eventually wished for light. After debate, Tane, god of forests and birds, pushed his parents apart with his strong legs, and light entered the world. Some brothers, such as Tawhirimatea, god of winds and storms, were angry about the separation, and Maori stories explain some natural conflict through this quarrel. Other Polynesian peoples tell related stories with different names and details.

Another widely shared figure is Maui. In many Polynesian traditions, Maui is a clever hero who snares the sun to slow it down, or fishes up islands from the sea with a magical hook. In Maori tradition, the North Island is sometimes called Te Ika a Maui, "the fish of Maui."

Sir George Grey, a colonial governor, published a collection of Maori traditions in the 1850s, one of the earliest printed sources, but it reflects the choices of its compilers. Today Maori storytellers and scholars share their own accounts, and it is respectful to say which iwi a version belongs to.`,
          },
          {
            id: L21,
            title: 'Aboriginal Australian Dreaming',
            blurb: 'Dreaming stories belong to specific nations, link people to Country, and may be restricted. This lesson stays at the level of what is publicly shared.',
            minutes: 7,
            body: `Aboriginal and Torres Strait Islander peoples include many distinct nations, each with its own languages, laws and stories. There is no single "Aboriginal religion." The English word "Dreaming" is a general label that outsiders use, and communities have their own terms, for example Jukurrpa among the Warlpiri and Tjukurpa among Pitjantjatjara people. The term refers to more than an old story. It includes the creative period when ancestral beings shaped the land, and also the ongoing laws, responsibilities and relationships that come from them.

In many traditions, ancestral beings traveled across the landscape, making rivers, hills and waterholes, and left behind the pattern of Country, the land with all its living and spiritual relationships. Journeys of ancestors are remembered in songs, sometimes called songlines, and in paintings and dance. The stories therefore serve as maps, as law, and as a way to hold knowledge of places and species.

Some beings appear in the traditions of several regions under different names, such as the Rainbow Serpent, but the stories are not identical, and treating them as one myth erases differences.

Two principles guide respectful learning. First, stories belong to particular peoples and places, so we name the nation when we can. Second, some knowledge is sacred or restricted, to be held by initiated people, and is not shared publicly. Outsiders should rely on stories that communities have chosen to publish or teach, and should not seek or retell restricted material. Indigenous-led organizations and authors are the best sources.`,
          },
          {
            id: L22,
            title: 'Yoruba and Akan Traditions',
            blurb: 'West African stories of the orisha and of Anansi are alive in Africa and in the Americas.',
            minutes: 8,
            body: `Africa is a continent of thousands of cultures, so no lesson can cover it. We look here at two West African traditions that are well documented, and we name the peoples involved.

The Yoruba people live mainly in present-day Nigeria and nearby countries. In Yoruba tradition, the supreme being is often called Olodumare or Olorun. Beneath this being are the orisha, deities connected with nature and human life, such as Obatala, associated with creation and purity, Ogun with iron and craft, Shango with thunder, Yemoja with water and motherhood, and Oshun with rivers. Many accounts place the beginning of the world at the city of Ife, where Obatala is said to have shaped human beings. The Yoruba tradition of divination, Ifa, uses a large body of oral verses. Yoruba beliefs crossed the Atlantic through the enslavement of Africans, and are part of religions in the Americas such as Santeria (Lucumi) in Cuba and Candomble in Brazil. Those are living religions with their own histories.

The Akan peoples, of what is now Ghana and neighboring regions, speak of a sky god, Nyame. They are famous for the stories of Ananse, the spider, a clever trickster. In a well-known tale, Ananse wins the sky god's stories for humanity by completing difficult tasks, which is why stories are sometimes called "spider stories." Ananse tales traveled to the Caribbean and the Americas.

Because many of these traditions are oral, versions vary by region and teller. The best sources are authors and elders from the cultures themselves.`,
          },
          {
            id: L23,
            title: 'Dogon Tradition and the Lesson of Source Criticism',
            blurb: 'The Dogon case shows how a famous account of a people\'s myths can be disputed, and why sources need testing.',
            minutes: 7,
            body: `The Dogon are a people of Mali, living in the region of the Bandiagara escarpment. Their religious thought has been studied by outsiders, and the way those studies have been received teaches a useful lesson.

In the 1930s and after, the French anthropologist Marcel Griaule and his colleague Germaine Dieterlen studied the Dogon. In 1946 Griaule held a series of conversations with an elder named Ogotemmeli, which Griaule published in 1948 as "Conversations with Ogotemmeli." The account describes a complex cosmology in which a creator, Amma, makes the world, and in which beings called the Nommo play central roles. It is rich and sophisticated, and it has been read widely.

Later, other researchers raised questions. The Dutch anthropologist Walter van Beek, who worked among the Dogon in the 1980s, reported that many Dogon he spoke to did not recognize parts of the system described by Griaule and Dieterlen. The most famous controversy concerns claims that the Dogon had secret knowledge of the star Sirius and its faint companion. Most scholars reject these claims, pointing to the possibility of outside influence or misunderstanding, and note that the idea of ancient contact with visitors from space has no support.

What can we say with confidence? Dogon religion is real and varied, Griaule's work is important but contested, and individual informants, however knowledgeable, do not speak for a whole people. When we cite a famous account, we should also ask how it was gathered and what later researchers found.`,
          },
        ],
      },
      {
        id: `${ID}.t6`,
        title: 'The Americas',
        blurb: 'Maya, Aztec, Andean and North American Indigenous traditions, read through their surviving sources and attributed to specific peoples.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L24,
            title: 'The Popol Vuh of the K\'iche\' Maya',
            blurb: 'A K\'iche\' book of creation, the Hero Twins and maize, written in the sixteenth century and copied in the eighteenth.',
            minutes: 8,
            body: `The Popol Vuh is the best-known surviving narrative of the K'iche' Maya, a people of the highlands of what is now Guatemala, whose descendants live there today. It was written in the K'iche' language using the Latin alphabet in the middle of the sixteenth century, after the Spanish conquest, by K'iche' authors who say they are recording what had earlier been preserved in an older book or in oral tradition. The surviving copy is a manuscript made in the early 1700s by the Dominican friar Francisco Ximenez, who transcribed the K'iche' text and added a Spanish translation. The original sixteenth-century manuscript has not survived.

The story has several parts. In the first, the creator gods try more than once to make beings who can speak and honor them. Animals cannot, figures made of mud dissolve, and figures made of wood are destroyed. Finally, humans are made from maize, the central food of Mesoamerica, and these people can think and give thanks.

The second part follows the Hero Twins, Hunahpu and Xbalanque. Earlier, their father and uncle were killed after playing a ball game in Xibalba, the underworld. The twins go down, face a series of trials set by the lords of Xibalba, and defeat them through cleverness. They are then transformed and become heavenly bodies. The last part follows the K'iche' lineages down to the historical period.

Because the surviving text was made in the colonial era, scholars discuss how much reflects pre-conquest tradition and how much shows Christian influence. K'iche' people today continue to read and interpret it.`,
          },
          {
            id: L25,
            title: 'The Aztec Fifth Sun',
            blurb: 'Mexica creation stories describe a series of worlds and a present age that depends on sacrifice, as recorded after the conquest.',
            minutes: 8,
            body: `The Aztec Empire, centered on the island city of Tenochtitlan, was ruled by the Mexica, a Nahuatl-speaking people. We know their stories largely from sources produced after the Spanish conquest of 1521. One of the richest is the Florentine Codex, a work compiled in the sixteenth century by the Franciscan friar Bernardino de Sahagun with Nahua elders and students who provided information and paintings. Another source is a text called the Legend of the Suns, written in the sixteenth century.

According to these sources, the world has passed through several ages, or "suns," each ending in destruction. Our present age is the Fifth Sun. Different texts list the earlier ages in different orders and with different details, so writers should not state one fixed list as the only one.

The Mexica also told of the war god Huitzilopochtli. In the story of his birth, his mother Coatlicue is pregnant, and her daughter Coyolxauhqui and her many brothers plot against her. Huitzilopochtli is born fully armed and defeats them, and Coyolxauhqui's dismembered body falls from the hill. Archaeologists uncovered a great carved stone disk of Coyolxauhqui at the Templo Mayor in Mexico City in 1978.

In Aztec religion, the cosmos required nourishment, and human sacrifice was practiced as part of that duty. Archaeological evidence supports its existence, though Spanish writers who described it had motives and often exaggerated, and the scale is debated. Other stories, such as the supposed belief that the Spanish leader Cortes was a returning god, appear in post-conquest sources and are doubted by many historians.`,
          },
          {
            id: L26,
            title: 'Andean Myth: Inca and Before',
            blurb: 'The Inca had no alphabetic writing, so their stories reach us through Spanish and Quechua colonial sources.',
            minutes: 8,
            body: `The Inca Empire, which the Inca called Tawantinsuyu, grew rapidly in the Andes in the fifteenth century and fell to Spanish conquest in the 1530s. The Inca had no alphabetic writing. They kept records with knotted cords called quipu, which could store numbers and perhaps some narrative information, and scholars still debate how much. As a result, most of what we know about Inca stories comes from colonial writers.

Some of these were Spanish chroniclers, and some were Andean people writing under Spanish rule. Garcilaso de la Vega, called "El Inca," the son of a Spanish captain and an Inca noblewoman, published his Royal Commentaries in 1609. Felipe Guaman Poma de Ayala, a Quechua noble, wrote a long illustrated letter to the Spanish king in the early 1600s. The Huarochiri Manuscript, a Quechua text from about 1608, records local religion of a province in the highlands and is rare for being written in Quechua.

Common themes include the creator god Viracocha, who in many accounts emerged from Lake Titicaca and formed people, and Inti, the sun, from whom the Inca ruling line claimed descent. Some accounts of Inca origins tell of Manco Capac and Mama Ocllo, sent forth to found Cusco, though the details and the starting place, a lake or a cave called Pacaritambo, differ.

Caution is needed because Inca stories were shaped for imperial politics, and then reshaped by colonial writers. The earth mother Pachamama is part of Andean practice today.`,
          },
          {
            id: L27,
            title: 'North American Indigenous Stories, Attributed',
            blurb: 'Hundreds of nations have their own traditions; examples here are tied to the peoples who tell them.',
            minutes: 8,
            body: `More than five hundred federally recognized tribes exist in the United States alone, and many more nations live in Canada and Mexico. They speak many languages and tell very different stories. The phrase "Native American mythology" is therefore too broad to be accurate. The most honest approach is to name the nation, and to say that what follows is only a small sample, based on stories that peoples have shared in public.

The Haudenosaunee, or Six Nations, tell of Sky Woman, who fell from a world above through a hole. Birds caught her, and animals including the muskrat brought up earth from beneath the water and placed it on the back of a turtle, where the land grew. This is why North America is called Turtle Island in some traditions.

The Dine, also called Navajo, tell an emergence story in which the people climb through a series of worlds. The Haida and other peoples of the Pacific Northwest tell of Raven, a trickster and transformer who in many tellings brings light to the world. The Lakota tell of White Buffalo Calf Woman, who brought sacred ceremonies, a story central to Lakota religious life.

Several points guide good study. Some stories may be told only in certain seasons, or only by people who hold the right. Written versions made by outsiders in the nineteenth and twentieth centuries sometimes changed stories. Many nations today publish their own books and teach in their own schools, and those sources deserve priority.`,
          },
        ],
      },
      {
        id: `${ID}.t7`,
        title: 'Texts, Comparisons and Modern Retellings',
        blurb: 'Persian and Arabian narrative, Biblical and Quranic stories as world storytelling, recurring motifs, and how myth lives on in modern media.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L28,
            title: 'Persian and Arabian Storytelling',
            blurb: 'The Shahnameh gathers Persia\'s legendary past into one epic, while the Arabian Nights is a layered story collection.',
            minutes: 8,
            body: `The Shahnameh, or "Book of Kings," was completed around 1010 CE by the Persian poet Ferdowsi, working in the Persian language after the Arab conquest and during a period when Persian literature was reviving. It has about fifty thousand couplets. It draws on older prose chronicles and oral traditions, and it moves from the mythical first kings, through legendary heroes, to a more historical account of the Sasanian dynasty and its fall.

Among its famous figures is Rostam, a hero of enormous strength who serves several kings. In one story he unknowingly kills his own son Sohrab in single combat, a tragedy that is still widely taught. The poem also contains the tyrant Zahhak and the blacksmith Kaveh who leads a revolt. Behind the epic lies Zoroastrian tradition, preserved in the Avesta, whose themes of the struggle between truth and falsehood echo in the poem.

The Arabian Nights, or One Thousand and One Nights, is a collection of tales told within a frame story in which Scheherazade tells stories to delay her execution. The collection grew over centuries, and its tales come from Arabic, Persian and Indian traditions. Some of the best known, such as Aladdin and Ali Baba, are not found in the earliest Arabic manuscripts and entered the collection through the French translation by Antoine Galland in the early eighteenth century, a point that scholars have discussed.

Knowledge of pre-Islamic Arabian religion comes mostly from later Islamic-era writers, such as the author of a work known as the Book of Idols, so reconstructions there rest on indirect evidence.`,
          },
          {
            id: L29,
            title: 'Biblical and Quranic Narratives as World Storytelling',
            blurb: 'These narratives are sacred scripture for billions; this lesson describes shared figures and differences respectfully without judging their truth.',
            minutes: 8,
            body: `The Hebrew Bible, the Christian Bible and the Quran contain narratives that are sacred to Jews, Christians and Muslims, who treat them as revelation or as inspired testimony, not as myth in the sense of invented story. A course on the world's storytelling can still describe them, with attention to what each text says, and without asserting or denying their religious claims.

They share many figures. Adam, Noah, Abraham, Moses and others appear in both the Bible and the Quran, where they are called Adam, Nuh, Ibrahim and Musa. Maryam, the mother of Jesus, has a prominent place in the Quran, and Jesus appears there as Isa, a prophet. The accounts differ in important ways. Genesis tells of creation in six days and a seventh day of rest, while the Quran also speaks of creation in six days and has its own emphasis on God's power and mercy. The Quran, unlike Genesis, does not name Adam's wife, and its account of the first transgression differs in detail. The Quran contains a long and continuous story of Yusuf, corresponding to Joseph in Genesis, in one chapter.

Scholars of literature and religion also compare these narratives with others from the ancient Near East. For example, parallels between Genesis and Mesopotamian flood stories are widely discussed. Believers and scholars may interpret these parallels differently, and a respectful course presents the question without taking a side on revelation.

When describing these texts, we use attribution ("in Genesis," "in the Quran") and the traditions' own names for their figures.`,
          },
          {
            id: L30,
            title: 'Comparing Floods',
            blurb: 'Flood stories appear in many cultures, and scholars debate whether they share a source or reflect common human experience.',
            minutes: 8,
            body: `Stories of a great flood appear in many parts of the world. In Mesopotamia, the Old Babylonian epic of Atrahasis, from the early second millennium BCE, tells of a flood sent by gods and of a human survivor who builds a boat. The Epic of Gilgamesh includes a flood story told by Utnapishtim. Genesis describes a flood in the time of Noah, and the Quran tells of Nuh. In Greek tradition, Deucalion and Pyrrha survive a flood sent by Zeus. In a Hindu story first found in a Vedic text, the Shatapatha Brahmana, the first man Manu is warned of a flood by a fish. In the Popol Vuh, an earlier creation of wooden people is destroyed by a flood. In China, the flood story centers not on a boat but on the heroic work of controlling the waters.

What explains the resemblance? Scholars offer three main answers. Diffusion suggests stories spread from one source, and it is strongest for closely connected cultures such as Mesopotamia and Genesis. Independent origin suggests that floods are a common experience for people living near rivers and coasts, so many cultures would tell of them. A third view says that some floods may preserve memory of real events, but proving a particular link is very difficult.

Careful comparison also notices differences. In some stories the flood punishes human wrongdoing, in others it results from divine annoyance at noise or is simply a natural event. The survivors, the cause and the moral all vary.

A good habit: compare in detail, name the sources for each version, and avoid forcing all of them into a single "universal flood myth."`,
          },
          {
            id: L31,
            title: 'Tricksters Across Cultures',
            blurb: 'Tricksters break rules and cross boundaries, but each figure has its own tradition and meaning.',
            minutes: 7,
            body: `A trickster is a character who breaks rules, plays tricks and moves between categories: between gods and humans, order and disorder, wisdom and foolishness. Such figures appear in many traditions. Examples include Anansi among the Akan, Loki in the Norse sources, Hermes in Greek tradition (who steals Apollo's cattle in the Homeric Hymn to Hermes), Maui in Polynesian stories, Sun Wukong in Journey to the West, Raven in the Pacific Northwest, and Coyote in the stories of many nations of western North America.

Why do cultures tell about them? Scholars suggest several functions. Tricksters can explain how the world came to have its present imperfect form, such as how humans got fire, stories or death. They can show what happens to people who break the rules. They can also let a community laugh at its own limits. The structural approach reads them as mediators between opposites.

But general patterns can mislead. Loki is not a simple counterpart to Anansi. In the Eddas, he is a complex figure who helps and harms the gods, and who in the end takes part in Ragnarok on the side of the gods' enemies. Anansi is a clever and often admired folk hero, and his stories have been told in Africa and the Caribbean. Eshu, an orisha in Yoruba tradition, is a messenger and guardian of crossroads, and early missionaries who equated him with the devil misunderstood him.

When comparing tricksters, say what each one does in the sources, who tells the stories, and whether the audience sees him as a hero, a danger, or both.`,
          },
          {
            id: L32,
            title: 'The Hero\'s Journey, Its Critics, and Myth in Modern Media',
            blurb: 'Joseph Campbell\'s monomyth is influential but contested, and modern stories keep reworking older myths, sometimes with consultation and sometimes with controversy.',
            minutes: 9,
            body: `In 1949, the American writer Joseph Campbell published The Hero with a Thousand Faces. He argued that hero stories from around the world share a basic pattern, which he called the monomyth: a hero leaves the ordinary world, passes through trials, wins a reward, and returns transformed. Others had proposed hero patterns earlier, such as Otto Rank in 1909 and Lord Raglan in 1936, and Campbell drew on psychology, especially the ideas of Carl Jung.

The idea became widely influential in popular storytelling. In the 1980s and 1990s, the Hollywood story consultant Christopher Vogler adapted Campbell's pattern into a guide for screenwriters, and filmmakers including George Lucas have spoken about Campbell's influence on their work.

Scholars have raised serious objections. Critics argue that the pattern is so general that almost any story fits, that Campbell chose examples that suit his theory, that he favored male heroes, and that he downplayed the particular cultural meanings of each story. Many myths, such as those of heroines or tricksters, do not follow the pattern. Use it as a tool for thinking, not a law.

Myth also continues in modern media. Novels, comics, films and games retell older stories, from the Percy Jackson series built on Greek myth to video games set among Greek and Norse gods. The 2016 film Moana drew on Polynesian traditions and involved a group of Pacific Islander advisors, while some critics objected to its portrayal of Maui. A thoughtful creator or viewer asks whose story it is, who was consulted, and what the original sources say.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: ID,
    questions: [
      // L01
      mc(L01, 1, 1, `When scholars of religion call a story a myth, what are they mainly describing?`, [`A traditional story that carries meaning for a community`, `A story that scholars have proven to be historically false`, `A story invented recently for the purpose of entertainment`, `A story that exists in a single authorized official version`], `Think about the scholarly meaning, not the everyday one.`, `In scholarship, myth names a kind of traditional, meaning-bearing story and does not judge whether it is true.`),
      tf(L01, 2, 1, `Calling a story a myth, in the scholarly sense, automatically means the story is false.`, 1, `Consider what job the word does.`, `The scholarly term describes the role of a story in a community and makes no claim about its truth.`),
      mc(L01, 3, 2, `Why do myths usually exist in many versions?`, [`They were retold aloud by different people and communities`, `Rulers required each village to alter the story to fit local laws`, `A single official version existed, and later printers altered it freely`, `Modern translators have always rewritten the plots to suit readers`], `Think about how stories travel before printing.`, `Oral retelling by different villages, priests and poets produces variants, which are part of the evidence.`),
      mc(L01, 4, 2, `In Hesiod's Works and Days, what happens when the jar in the Pandora story is opened?`, [`Many troubles escape into the human world`, `The sky gods are released and descend among humans`, `The first fire is lost and humans fall into darkness`, `A great flood begins and covers the earth`], `The jar is a container of misfortunes.`, `In Hesiod's poem, troubles escape from the jar and spread among humans.`),
      tf(L01, 5, 3, `The lesson recommends describing myths with attribution, such as "according to the Poetic Edda," instead of stating them as plain fact.`, 0, `Consider how to be accurate and respectful together.`, `Attribution names the source and respects the tradition without asserting or mocking the story.`),
      // L02
      mc(L02, 1, 1, `Which approach sets myths from different cultures side by side?`, [`The comparative approach`, `The functional approach`, `The structural approach`, `The euhemerist approach only`], `The name hints at comparing.`, `The comparative approach looks for resemblances and patterns across cultures.`),
      mc(L02, 2, 2, `Malinowski argued that myths often act as what for a society?`, [`A charter that justifies customs and social arrangements`, `A calendar predicting the agricultural seasons for farmers`, `A trade map recording the routes between island villages`, `A private diary in which a ruler recorded personal thoughts`], `Think of a document that gives a group its authority.`, `In Malinowski's functional view, myths support customs, rituals and social arrangements.`),
      mc(L02, 3, 2, `Which scholar is associated with the structural approach and pairs of opposites?`, [`Claude Levi-Strauss`, `Euhemerus`, `Georges Dumezil`, `Bronislaw Malinowski`], `He looked for underlying patterns such as nature and culture.`, `Levi-Strauss analyzed myths as patterns of oppositions, such as raw and cooked, and how they are mediated.`),
      tf(L02, 4, 2, `Euhemerus argued that gods were originally deified humans.`, 0, `The word euhemerism comes from his name.`, `Euhemerus proposed that the gods began as human rulers or heroes who were later worshiped.`),
      mc(L02, 5, 3, `Which is a fair criticism of comparative studies?`, [`Comparison may flatten real differences or suggest links that are coincidence`, `Comparison cannot be applied to stories from more than one culture at a time`, `Comparison requires every culture compared to have a written literature`, `Comparison always proves that the compared myths share one common origin`], `Think about what could go wrong when you line things up.`, `Similar-looking motifs may arise independently, and differences between cultures can be lost.`),
      // L03
      mc(L03, 1, 1, `Why does it matter who wrote a myth down?`, [`The writer's time, purpose and beliefs may have shaped the version we have`, `Writers copy oral stories exactly, so the writer's identity never matters`, `Only writers from the same culture as the story can ever be reliable`, `Written versions are always older than the spoken versions they record`], `Consider what a recorder might add or leave out.`, `Written texts are snapshots shaped by their authors, so recorders must be considered as evidence.`),
      tf(L03, 2, 1, `The Norse myths we know come mostly from Icelandic writers of about the thirteenth century.`, 0, `Think of the Eddas.`, `The Poetic Edda manuscript and Snorri's Prose Edda both date to the thirteenth century.`),
      mc(L03, 3, 2, `Who wrote the Prose Edda, around 1220?`, [`Snorri Sturluson`, `Homer, the Ionian poet`, `Virgil of Mantua`, `Ferdowsi of Tus`], `He was an Icelandic chieftain and scholar.`, `Snorri Sturluson wrote the Prose Edda as a handbook for poets.`),
      mc(L03, 4, 2, `Which phrase best shows careful source-aware writing?`, [`According to Snorri, Thor traveled to the land of giants`, `The Vikings all believed Thor traveled to the land of giants`, `It is a proven fact that Thor traveled to the land of giants`, `Everyone in Scandinavia always told it this way`], `Pick the wording that names a source.`, `Naming the source avoids claiming more than the evidence shows.`),
      tf(L03, 5, 3, `Where no early text survives for a tradition, claims about its myths should be treated as reconstruction.`, 0, `Think about the Slavic example.`, `Without early written evidence, accounts rely on later or indirect sources and are reconstructions.`),
      // L04
      mc(L04, 1, 1, `Which tradition listed in the lesson is described as continuing today?`, [`Shinto`, `Ancient Egyptian state religion`, `None of them`, `Only extinct traditions are studied in this course`], `Look for a religion with present-day followers.`, `Shinto is among the living traditions named; Egyptian state religion is the extinct example.`),
      tf(L04, 2, 1, `All stories from Indigenous nations are meant to be freely shared with anyone.`, 1, `Remember the example of initiated people.`, `Some stories are restricted or belong to particular families or nations.`),
      mc(L04, 3, 2, `What is a respectful way to write about a story from a specific nation?`, [`Name the nation and prefer sources the community has shared`, `Call it the universal story shared by all Native peoples everywhere`, `Retell restricted versions in full to give them wider reach`, `Describe it as a false belief that people once held`], `Specific and consented beats general.`, `Accuracy and respect both require naming the nation and using material the community has chosen to share.`),
      mc(L04, 4, 3, `Why is it a problem to call a living tradition's sacred story a myth in the sense of falsehood?`, [`It dismisses what is sacred to believers and misuses the scholarly term`, `Because living traditions have no stories, only ritual practices`, `Because scholars have abandoned the word myth in every field`, `Because all myths are literally true according to scholars of religion`], `Consider both politeness and precision.`, `The scholarly meaning of myth does not mean falsehood, and using the everyday sense disrespects believers.`),
      tf(L04, 5, 2, `Insider and outsider descriptions of the same story can both count as evidence.`, 0, `Different viewpoints can be informative.`, `Insiders and outsiders notice different things, and a careful student weighs both.`),
      // L05
      mc(L05, 1, 1, `What does the name Enuma Elish come from?`, [`The poem's opening words`, `The name of its author`, `The city where it was found`, `The name of its hero`], `Many ancient works were named this way.`, `The title comes from the first words, usually translated "When on high."`),
      mc(L05, 2, 1, `In the Enuma Elish, who defeats Tiamat?`, [`Marduk`, `Gilgamesh`, `Apsu`, `Kingu`], `He becomes supreme among the gods.`, `Marduk defeats Tiamat and forms heaven and earth from her body.`),
      tf(L05, 3, 2, `In the poem, humans are made from the blood of the defeated god Kingu.`, 0, `Humans exist to do the gods' work.`, `The poem says humans were formed from Kingu's blood to serve the gods.`),
      mc(L05, 4, 2, `Why do many scholars link the epic with the city of Babylon?`, [`Marduk, its hero, was Babylon's patron god, so the poem raises him to the top`, `Because Babylon wrote every Near Eastern text that survives from the period`, `Because Tiamat was the historical queen who ruled Babylon in the poem`, `Because the poem is a chronicle listing the kings who ruled Babylon`], `Think about which god wins.`, `Marduk was Babylon's patron, so many read the epic as exalting him and his city.`),
      mc(L05, 5, 3, `Which statement about Enuma Elish is most accurate?`, [`It is one voice among several Mesopotamian creation ideas`, `It is the only creation story that Mesopotamian peoples ever told`, `It was composed in Greek by scholars of Hellenistic Alexandria`, `It was composed in the twentieth century by modern scholars`], `The lesson says other texts differ.`, `Other Mesopotamian texts present different ideas, so the poem is not the whole tradition.`),
      // L06
      mc(L06, 1, 1, `Who is Gilgamesh in the epic?`, [`A king of Uruk`, `A god of the sea`, `A Greek hero`, `The guardian of the Cedar Forest`], `He rules a Mesopotamian city.`, `Gilgamesh is the king of Uruk, probably based on a real early ruler.`),
      tf(L06, 2, 1, `Enkidu and Gilgamesh begin as enemies and become friends.`, 0, `Recall their fight.`, `They fight, then form a close friendship.`),
      mc(L06, 3, 2, `What do Gilgamesh and Utnapishtim have in common in the story?`, [`Utnapishtim tells him about a great flood and eternal life`, `They are brothers who travel to the Cedar Forest together`, `Both die in the Cedar Forest while fighting the guardian Humbaba`, `Both are kings who ruled Babylon during the same long reign`], `Gilgamesh goes searching for him.`, `Utnapishtim survived a flood and was granted eternal life, and he tells Gilgamesh his story.`),
      mc(L06, 4, 2, `How does Gilgamesh lose the plant that renews youth?`, [`A snake takes it while he bathes`, `He gives it to Enkidu, who then eats it`, `Humbaba steals it while he sleeps by the river`, `He burns it in the Cedar Forest as an offering`], `A creature of the water's edge appears.`, `In the epic, a snake eats the plant while Gilgamesh is bathing.`),
      mc(L06, 5, 3, `Why might translations of the epic differ?`, [`The tablets are damaged, so some lines are reconstructed`, `The epic was passed down only orally and never written`, `Only one tablet exists, so scholars simply guess at its meaning`, `Translators are forbidden by law from reading cuneiform signs`], `Consider the condition of clay tablets.`, `Gaps in the damaged tablets mean modern editions restore some lines in different ways.`),
      // L07
      mc(L07, 1, 1, `In the Osiris myth, who kills Osiris?`, [`His brother Set`, `His sister-wife Isis`, `His own son Horus, the falcon god`, `The sun god Ra, in anger`], `Set is the god of disorder.`, `Set kills Osiris out of jealousy.`),
      tf(L07, 2, 2, `The most continuous ancient telling of the Osiris story is by a Greek writer, Plutarch, writing around 100 CE.`, 0, `Remember it was an outsider's account.`, `Plutarch's On Isis and Osiris is the fullest continuous version, though it is much later than Egyptian sources.`),
      mc(L07, 3, 2, `What are the Pyramid Texts?`, [`Religious writings carved inside royal pyramids around 2400 BCE`, `Greek hymns to Osiris sung at festivals in Ptolemaic Alexandria`, `A Roman history of Egypt compiled for the emperors by provincial officials`, `Medieval Arabic legends about the pyramids and their builders`], `They appear at the end of the Old Kingdom.`, `They are the earliest large collection of Egyptian religious writing, carved in pyramids.`),
      mc(L07, 4, 2, `How did the myth support Egyptian kingship?`, [`The living king was identified with Horus and the dead king with Osiris`, `It said the king was the god of the sea and the Nile flood`, `It forbade kings from having sons, so that only the god Horus could inherit`, `It taught that the god Set was the true king behind every living pharaoh`], `Think about the father and son.`, `The king was linked with Horus in life and with Osiris after death.`),
      tf(L07, 5, 3, `Egyptian sources agree on every detail of the Osiris story.`, 1, `The lesson says versions vary.`, `Details vary from source to source.`),
      // L08
      mc(L08, 1, 1, `In the tradition of Heliopolis, what existed before creation?`, [`Nun, the dark primeval waters`, `The sun god Ra, enthroned in the sky`, `The Ennead, the nine gods of Heliopolis`, `The Nile, flowing north to the sea`], `Something formless and watery.`, `Creation began with Nun, from which a mound and the god Atum arose.`),
      mc(L08, 2, 2, `According to the Memphis tradition on the Shabaka Stone, how did Ptah create?`, [`By thought and spoken command`, `By fighting a sea monster`, `By hatching from an egg`, `By carving the world from stone`], `Think about mind and mouth.`, `Ptah conceived in the heart and created by speaking.`),
      tf(L08, 3, 1, `Egyptians told several different creation accounts from different religious centers.`, 0, `Egypt had no single scripture.`, `Different temples preserved different, coexisting accounts.`),
      mc(L08, 4, 2, `Where does the sun god Ra travel at night in the standard picture?`, [`Through the underworld, called the Duat`, `Up to the moon, where he waits for dawn`, `Across the Nile to the city of Memphis`, `He stays in the sky, circling above the world`], `He faces dangers like the serpent Apep.`, `Ra passes through the Duat and is reborn at dawn.`),
      mc(L08, 5, 3, `What common thread links the Egyptian creation accounts?`, [`Renewal from the waters of chaos`, `A single scripture accepted by every temple`, `A rejection of the sun as a source of life`, `The creation of the Nile by the god Set`], `Think about Nun and the dawn.`, `Order emerges from primeval waters, and the sun's daily rebirth expresses the same renewal.`),
      // L09
      mc(L09, 1, 1, `What does the title Theogony mean?`, [`Birth of the gods`, `Song of the Trojan War`, `Works and days of farmers`, `Hymn to Zeus the king`], `Theo means god.`, `Theogony means the birth or genealogy of the gods.`),
      mc(L09, 2, 2, `In Hesiod, who overthrows Ouranos?`, [`His youngest Titan son Cronus`, `Zeus, the youngest son of Cronus`, `Prometheus, the fire-bringing Titan`, `Poseidon, his brother who rules the sea`], `A Titan, urged on by his mother.`, `Cronus overthrows Ouranos at his mother Gaia's urging.`),
      tf(L09, 3, 2, `In the poem, Rhea saves Zeus from being swallowed by Cronus.`, 0, `Cronus swallowed his other children.`, `Rhea hides the infant Zeus, and he later frees his siblings.`),
      mc(L09, 4, 2, `Roughly when do the earliest major written Greek sources, such as Hesiod and Homer, date?`, [`Around 700 BCE`, `Around 100 CE`, `Around 1200 CE`, `Around 3000 BCE`], `Early Greek poetry, not Roman.`, `The Theogony and Homeric epics are dated to about 700 BCE or the eighth century BCE.`),
      mc(L09, 5, 3, `Why is it misleading to speak of one fixed Greek canon?`, [`Local cults and later authors told different versions of the same stories`, `Because Hesiod wrote down every Greek myth in one fixed text for all time`, `Because the Greeks told only stories about heroes and never about gods`, `Because Roman writers prohibited any variants from circulating in Greece`], `Think about patchwork.`, `Different regions and writers varied details, so Greek myth is a patchwork over many centuries.`),
      // L10
      mc(L10, 1, 1, `Which poem tells of Odysseus's difficult journey home?`, [`The Odyssey`, `The Iliad`, `The Aeneid`, `The Theogony`], `Odysseus's name is in the title.`, `The Odyssey follows Odysseus's return to Ithaca.`),
      tf(L10, 2, 2, `The Iliad focuses on the anger of Achilles during the Trojan War.`, 0, `It covers a few weeks, not the whole war.`, `The Iliad centers on Achilles' anger.`),
      mc(L10, 3, 2, `What did the Athenian tragedians such as Aeschylus, Sophocles and Euripides do with myths?`, [`They reshaped familiar stories to explore justice, fate and choice`, `They copied the old poems word for word for the Athenian festivals`, `They banned them as disrespectful to the gods of the city`, `They replaced them with accurate historical accounts of the era`], `They were playwrights.`, `Tragedians changed emphasis to raise questions that mattered to their audience.`),
      mc(L10, 4, 3, `What does the example of Medea in Euripides and Ovid show?`, [`Different authors tell the same myth differently`, `All authors tell her story in exactly the same way`, `Her story was told once and never retold afterward`, `Only one Greek author ever wrote about her`], `Which Medea do you mean?`, `Writers varied, so one should name the author when discussing a myth.`),
      tf(L10, 5, 3, `The identity of Homer and the way the epics took shape are still debated.`, 0, `Scholars call this the Homeric question.`, `The date and process of composition and Homer's identity remain debated.`),
      // L11
      mc(L11, 1, 1, `Which Greek god did Romans match with Jupiter?`, [`Zeus`, `Ares`, `Apollo`, `Hades`], `The king of the gods.`, `Romans identified Jupiter with Zeus.`),
      tf(L11, 2, 2, `The story that Rome was founded in 753 BCE by Romulus is a traditional founding legend, not a documented event.`, 0, `Distinguish legend from record.`, `The date and the story are traditional, not independently documented.`),
      mc(L11, 3, 2, `What is the Aeneid?`, [`Virgil's epic about Aeneas, a Trojan refugee who settles in Italy`, `Ovid's long poem collecting Greek and Roman stories of transformation`, `Homer's epic about Achilles and the anger that shaped the Trojan War`, `Hesiod's poem on the gods, the Titans and the first creation`], `The poet wrote under Augustus.`, `Virgil's Aeneid follows Aeneas from Troy to Italy.`),
      mc(L11, 4, 2, `Ovid's Metamorphoses is mainly about what?`, [`Stories of transformation from Greek and Roman tradition`, `The founding of Rome and the first kings after Romulus`, `The long sea travels of Aeneas from Troy to the shores of Italy`, `The myths and rituals of the gods of the Egyptian pantheon`], `The title is a clue.`, `The Metamorphoses retells stories in which characters change form.`),
      mc(L11, 5, 3, `Why do many scholars call Roman myth literary and political?`, [`Poets under Augustus shaped it with artistic and political aims`, `Because Romans had no religion and invented every story for pleasure`, `Because their myths survive only as clay tablets from Rome's archives`, `Because their myths were copied from Hesiod without any alteration`], `Think of the Aeneid's setting.`, `Roman myth reached us mainly through poets whose work served artistic and political purposes.`),
      // L12
      mc(L12, 1, 1, `What is the Codex Regius?`, [`A manuscript of about the 1270s preserving the Poetic Edda`, `A Latin chronicle of the Roman campaigns across northern Germany`, `Snorri's law book written for the Icelandic assembly at Thingvellir`, `A Viking runestone carved with the names of Odin's sons`], `It holds anonymous poems.`, `It is the main manuscript of the Poetic Edda poems.`),
      mc(L12, 2, 2, `Why was the Prose Edda written, according to the lesson?`, [`As a handbook for poets who needed the old myths used in verse`, `As a Christian sermon urging all Icelanders to abandon the old gods`, `To record the laws that governed Viking assemblies and local courts`, `As a travel guide for merchants sailing between Iceland and Norway`], `Think about skaldic poetry.`, `Snorri wrote it so poets could understand the mythic references in traditional verse.`),
      tf(L12, 3, 1, `Iceland accepted Christianity around the year 1000.`, 0, `This is a key date for the Norse sources.`, `The conversion happened around 1000, two centuries before these texts were written.`),
      mc(L12, 4, 3, `What is the main caution about the Norse sources?`, [`Christians wrote them down about two centuries after conversion and may have shaped them`, `They are written in a lost script that no modern scholar has ever managed to decipher`, `They were written by Roman soldiers who observed the Norse peoples directly`, `They contradict every other surviving source about Scandinavian religion`], `Look at who wrote and when.`, `The writers were Christians working long after the old religion ended.`),
      mc(L12, 5, 2, `Which poem in the Poetic Edda has a seeress describing creation and the end of the world?`, [`Voluspa`, `Beowulf`, `The Iliad`, `Mabinogion`], `Its name means the seeress's prophecy.`, `Voluspa presents a seeress describing the gods' origin, destruction and rebirth.`),
      // L13
      mc(L13, 1, 1, `Where do the main sources for Celtic mythology come from?`, [`Medieval Irish and Welsh manuscripts`, `Ancient Celtic scriptures composed by druid priests`, `Texts carved on the walls of Roman temples`, `Viking sagas composed in medieval Scandinavia`], `Antiquity left almost nothing in Celtic writing.`, `Most sources are medieval texts from Ireland and Wales.`),
      tf(L13, 2, 2, `Ancient Celtic peoples left extensive written myths in their own languages.`, 1, `The lesson says they left almost none.`, `We rely on outsiders' descriptions and later medieval manuscripts.`),
      mc(L13, 3, 2, `Which figure is central to the Ulster Cycle?`, [`Cu Chulainn`, `Pwyll, Lord of Dyfed`, `Odin the Allfather`, `Perun the thunder god`], `Think of the Cattle Raid of Cooley.`, `Cu Chulainn is the hero of the Ulster Cycle and the Tain Bo Cuailnge.`),
      mc(L13, 4, 2, `What are the Four Branches of the Mabinogi?`, [`The core tales of the Welsh Mabinogion`, `Four Irish tales about invasions of Ireland`, `Four Norse poems about the gods of Asgard`, `Four Roman histories of the Celtic wars`], `They feature Pwyll, Rhiannon and Bran.`, `They are the central group of medieval Welsh tales.`),
      mc(L13, 5, 3, `Which phrasing is more careful?`, [`In medieval Irish tradition, the Tuatha De Danann were a supernatural people`, `The Celts across Europe all worshiped the Tuatha De Danann as their gods`, `Ancient druids certainly performed the very rituals described in these tales`, `All Celtic peoples followed one unified religion with a single set of gods`], `Match the claim to the source.`, `Attributing to medieval Irish tradition stays within the evidence.`),
      // L14
      mc(L14, 1, 1, `What does the Primary Chronicle report about Perun?`, [`Prince Vladimir set up an idol of him in Kiev`, `He wrote the chronicle himself while living in Kiev`, `He was a Christian saint honored by the church of Kiev`, `He was a Norse god brought to Kiev by Viking traders`], `A pagan idol and a ruler.`, `The chronicle says Vladimir set up idols including Perun's.`),
      tf(L14, 2, 2, `Tales of Baba Yaga were collected mainly in the eighteenth and nineteenth centuries.`, 0, `They are late folklore.`, `Such folklore was gathered much later than pre-Christian times, so it may not preserve ancient belief.`),
      mc(L14, 3, 2, `Why is Slavic mythology hard to reconstruct?`, [`Few early written records survive, and chroniclers were Christians`, `Slavic peoples had no organized religion and therefore told no myths`, `All of their written records were burned by Roman legions`, `Only Greek authors ever wrote about them, and those texts are lost`], `The lesson lists kinds of evidence.`, `The evidence is late, indirect or written by Christians with their own aims.`),
      mc(L14, 4, 3, `A chart shows a complete Slavic pantheon. What is the best response?`, [`Ask what evidence supports each name`, `Accept it as certain because it looks complete`, `Reject the whole subject as a modern invention`, `Assume the names are Norse gods with Slavic labels`], `Think about source criticism.`, `Many names rest on reconstruction, so the evidence for each should be checked.`),
      tf(L14, 5, 3, `The conversion of Rus' is traditionally dated to 988.`, 0, `This is a traditional date tied to Vladimir.`, `988 is the traditional date for the conversion of Rus'.`),
      // L15
      mc(L15, 1, 1, `What is the Rig Veda?`, [`A collection of early Sanskrit hymns`, `A Buddhist collection of stories about the Buddha's past lives`, `A Chinese novel from the Ming dynasty period`, `A Japanese chronicle compiled at the imperial court`], `It is the oldest layer of Hindu texts.`, `The Rig Veda is a collection of over a thousand hymns, composed orally in early Sanskrit.`),
      mc(L15, 2, 2, `The Bhagavad Gita is a dialogue between which two figures?`, [`Arjuna and Krishna`, `Rama and his wife Sita`, `Indra and the serpent Vritra`, `The poets Valmiki and Vyasa`], `It is part of the Mahabharata.`, `The Gita is the conversation between the warrior Arjuna and Krishna.`),
      tf(L15, 3, 2, `The Ramayana tells of Rama's loss of Sita to the demon-king Ravana and of Rama's eventual victory.`, 0, `Recall the basic plot.`, `Sita is abducted by Ravana, whom Rama defeats.`),
      mc(L15, 4, 2, `What does the Nasadiya hymn do?`, [`It questions who truly knows how creation began`, `It lists the dynasties of kings who ruled northern India`, `It describes a great flood sent to punish humanity`, `It gives detailed rules for conducting a sacrifice`], `The tone is of wondering.`, `The hymn asks who really knows about creation and suggests that even the highest overseer may not.`),
      mc(L15, 5, 3, `Why does the lesson say "a version of the Ramayana"?`, [`Many retellings differ and none is the single authoritative telling`, `Because only a single version of the epic has ever existed anywhere`, `Because the epic is purely oral and no manuscript has ever existed`, `Because the original text was lost and only fragments are known today`], `Think about retellings in many languages.`, `Different versions change plots and meanings, so no single telling can stand for all.`),
      // L16
      mc(L16, 1, 1, `What are the Jataka tales?`, [`Stories of the Buddha's previous lives`, `Stories of the final day of the Buddha's last life`, `Early Sanskrit hymns in praise of the god Indra`, `Chinese stories about the creation of the world`], `Jataka means birth.`, `They recount previous lives of the Buddha-to-be as a bodhisattva.`),
      tf(L16, 2, 1, `In the Jatakas, the bodhisattva can be born as an animal.`, 0, `Recall the hare.`, `He appears as animals such as a hare, a monkey or a deer, as well as humans.`),
      mc(L16, 3, 2, `Roughly how many tales does the Pali collection traditionally count?`, [`About 547`, `About 12`, `About 50,000`, `Exactly 3`], `The number is in the hundreds.`, `The traditional count is about 547, though it varies by source.`),
      mc(L16, 4, 2, `What happens at the end of the hare's story?`, [`The king of the gods honors the hare by marking its likeness on the moon`, `The hare is made king of all the animals by the monkey and jackal`, `The monkey wins the prize and the hare is sent away in disgrace`, `The jackal is honored by the king of the gods with a place on the moon`], `The hare's gift is itself.`, `The guest, who is the king of the gods, honors the hare on the moon.`),
      mc(L16, 5, 3, `What is the usual purpose of a Jataka?`, [`To teach virtues cultivated across lifetimes and the working of karma`, `To record the Buddha's travels and sermons during his last earthly life`, `To keep a record of temple donations made by wealthy lay supporters`, `To advertise monastery festivals and attract donations from visitors`], `Think about morals.`, `The tales show generosity, patience and compassion built across many lives.`),
      // L17
      mc(L17, 1, 1, `According to the usual story, what does Pangu do?`, [`Separates heaven and earth`, `Controls the flood`, `Travels to India`, `Writes the Classic of Mountains and Seas`], `He is a giant.`, `Pangu separates heaven from earth, and his body becomes features of the world.`),
      mc(L17, 2, 2, `When is the Pangu story first recorded, roughly?`, [`Around the third century CE`, `Around 3000 BCE, on oracle bones`, `Around 1600 CE, in the Ming era`, `Around 1900 CE, in modern folklore`], `It is later than many people expect.`, `Earlier Chinese texts do not contain him, so the story is relatively late.`),
      tf(L17, 3, 2, `Journey to the West was published in the sixteenth century and draws on the real pilgrimage of the monk Xuanzang.`, 0, `The monk traveled to India.`, `The Ming-dynasty novel was inspired by Xuanzang's seventh-century journey for Buddhist texts.`),
      mc(L17, 4, 2, `Who is Sun Wukong?`, [`The Monkey King in Journey to the West`, `The goddess who mended the broken sky`, `The king who controlled the great flood`, `The father of the monk Xuanzang, a Tang official`], `He protects the monk.`, `Sun Wukong is the mischievous Monkey King who accompanies Xuanzang in the novel.`),
      mc(L17, 5, 3, `How did Yu the Great deal with the flood, in the stories?`, [`By dredging channels to guide the waters`, `By building a huge boat to carry his family and animals`, `By praying to Pangu until the waters withdrew`, `By burning the forests to dry the land`], `He is remembered for engineering, not escape.`, `Yu tamed floods by channeling rather than simply blocking the water.`),
      // L18
      mc(L18, 1, 1, `In what year was the Kojiki completed?`, [`712 CE`, `1712 CE`, `312 BCE`, `1945 CE`], `Early eighth century.`, `The Kojiki was completed in 712 CE and the Nihon Shoki in 720 CE.`),
      mc(L18, 2, 2, `Who hides in a cave so that the world goes dark?`, [`Amaterasu`, `Izanami, goddess of death`, `Susanoo, the storm god`, `Jimmu, the first emperor`], `The sun goddess.`, `Amaterasu hides in a cave after Susanoo's destructive behavior.`),
      tf(L18, 3, 2, `The Nihon Shoki is written in Classical Chinese and often gives alternative variants of a story.`, 0, `It was compiled at the court.`, `The Nihon Shoki uses Classical Chinese and records variant versions.`),
      mc(L18, 4, 2, `Why did the court compile these books?`, [`Partly to show the legitimacy of the imperial line`, `To record foreign religions`, `To replace Shinto`, `To list the taxes owed by provincial families to the court`], `Think about the sun goddess's descendants.`, `The myths link the ruling family to the sun goddess.`),
      mc(L18, 5, 3, `Why is interpreting these myths politically sensitive?`, [`Twentieth-century governments used them to support nationalist ideology`, `They were lost`, `They are mainly about foreign gods brought to the court from the continent by Buddhist missionaries`, `They were written in the nineteenth century`], `Think about the modern history of use.`, `State ideology in the twentieth century used these myths, so interpretation requires care.`),
      // L19
      mc(L19, 1, 1, `Which work records the Dangun story?`, [`The Samguk Yusa`, `The Kojiki of Japan`, `The Popol Vuh of the Maya`, `The Shahnameh of Persia`], `Compiled by the monk Iryeon.`, `The Samguk Yusa, a thirteenth-century collection, records the Dangun story.`),
      mc(L19, 2, 2, `In the Dangun story, what happens to the bear?`, [`It becomes a woman and bears Dangun`, `It is killed by the tiger`, `It becomes a god of the sea`, `It leaves for China`], `Garlic and mugwort and patience.`, `The bear endures in the cave, becomes human, and gives birth to Dangun.`),
      tf(L19, 3, 2, `The traditional date of 2333 BCE for Gojoseon's founding is established by archaeology.`, 1, `It comes from later tradition.`, `The date is traditional and not independently established.`),
      mc(L19, 4, 2, `Who wrote the Samguk Sagi, completed in 1145?`, [`Kim Busik`, `Iryeon`, `Ximenez`, `Ferdowsi`], `He was an official.`, `Kim Busik compiled the history of the Three Kingdoms.`),
      mc(L19, 5, 3, `Why does the Dangun tale illustrate source awareness?`, [`A national origin story is central today but is recorded in a medieval source`, `It was written the day Gojoseon began`, `It has no variants and appears in exactly one fixed form in every record from Korea`, `It is a Chinese story`], `Think about the date of the record.`, `It shows how culturally central stories may be known through particular later records.`),
      // L20
      mc(L20, 1, 1, `In Maori tradition, who are Ranginui and Papatuanuku?`, [`The sky father and the earth mother`, `Two brothers who fish up islands`, `The first humans`, `Gods of the sea`], `They lie in an embrace.`, `They are the sky father and earth mother whose children separate them.`),
      mc(L20, 2, 2, `Which child pushes his parents apart to let in light?`, [`Tane`, `Maui`, `Tawhirimatea`, `Grey`], `The god of forests and birds.`, `Tane, god of forests, pushes sky and earth apart.`),
      tf(L20, 3, 2, `Maui is known in many Polynesian traditions for slowing the sun or fishing up islands.`, 0, `He is a hero with a hook.`, `These feats are widely told, with island-specific details.`),
      mc(L20, 4, 2, `Why should we be careful with printed nineteenth-century collections of Maori tradition?`, [`They often reflect the choices of outsiders who compiled them`, `They are always fake, invented by collectors to sell to readers abroad`, `They were written by iwi elders in modern times`, `They have no stories`], `Think about who held the pen.`, `Collections by missionaries and officials may reflect their selection and view.`),
      mc(L20, 5, 3, `What is a respectful way to present a version of a Maori story?`, [`Say which iwi it belongs to`, `Call it the single Polynesian myth`, `Remove all names`, `Treat it as a joke`], `Be specific.`, `Versions differ by iwi and family, so attribution is important.`),
      // L21
      mc(L21, 1, 1, `Which statement about Aboriginal and Torres Strait Islander peoples is accurate?`, [`They include many distinct nations, each with its own stories`, `They share one religion and a single body of ceremonial stories nationwide`, `They have no stories`, `They speak a single language`], `Think of diversity.`, `There are many nations with their own languages, laws and stories.`),
      tf(L21, 2, 2, `The English word Dreaming refers only to old stories and not to law and responsibility.`, 1, `The lesson says it includes ongoing laws.`, `It includes creative-era events and the continuing laws and relationships arising from them.`),
      mc(L21, 3, 2, `What are songlines, in the lesson's account?`, [`Remembered journeys of ancestral beings, held in song, painting and dance`, `Roads built by the Inca`, `Hymns of the Rig Veda`, `Rules for trade that govern exchanges between neighboring peoples across the desert regions`], `They also act as maps.`, `Ancestral journeys are remembered in song and serve as maps, law and knowledge.`),
      mc(L21, 4, 3, `What should outsiders do with restricted knowledge?`, [`Not seek or retell it, and rely on what communities have chosen to share`, `Publish it for study so that scholars everywhere can compare it with other traditions`, `Translate it into every language`, `Assume it is public`], `Respect and consent.`, `Restricted knowledge belongs to initiated people and is not for outsiders to retell.`),
      tf(L21, 5, 3, `Treating the Rainbow Serpent as one single myth erases differences between regions.`, 0, `Names and stories vary.`, `Stories that share a figure differ across regions and nations.`),
      // L22
      mc(L22, 1, 1, `Which people tell of the orisha and of Ife as a place of creation?`, [`The Yoruba`, `The Akan of Ghana`, `The Dogon of Mali`, `The Maori of Aotearoa`], `Think of Nigeria.`, `The Yoruba tradition speaks of the orisha, with Ife as a place of beginnings.`),
      mc(L22, 2, 2, `What is Ifa?`, [`A Yoruba tradition of divination using a large body of oral verses`, `An Akan sky god worshiped across Ghana as the keeper of all the stories`, `A Brazilian festival`, `A Dogon creator`], `It is a system, not a person.`, `Ifa divination relies on a large corpus of oral verses.`),
      tf(L22, 3, 2, `Yoruba beliefs are part of religions in the Americas, such as Santeria (Lucumi) in Cuba and Candomble in Brazil.`, 0, `The tradition crossed the Atlantic.`, `Through the transatlantic slave trade Yoruba traditions entered these living religions.`),
      mc(L22, 4, 2, `In the Akan tale, how does Ananse win the sky god's stories?`, [`By completing difficult tasks`, `By stealing them at night`, `By marrying Nyame`, `By building a boat`], `He is clever.`, `Ananse completes hard tasks set by the sky god Nyame.`),
      mc(L22, 5, 3, `Why does the lesson name particular peoples instead of discussing African myth in general?`, [`Africa has thousands of cultures, so a generic label would be inaccurate`, `Africa has no myths`, `Only two peoples exist there`, `Names are not important`], `Think about scale.`, `A continent of thousands of cultures cannot be summarized as one tradition.`),
      // L23
      mc(L23, 1, 1, `Who published Conversations with Ogotemmeli in 1948?`, [`Marcel Griaule`, `Walter van Beek`, `Sahagun`, `Snorri`], `A French anthropologist.`, `Griaule published conversations held in 1946 with the elder Ogotemmeli.`),
      mc(L23, 2, 2, `What did Walter van Beek report?`, [`Many Dogon he met did not recognize parts of the system Griaule described`, `That the Dogon had no religion`, `That Ogotemmeli never existed`, `That he found Sirius myths in every village`], `He worked among the Dogon in the 1980s.`, `Van Beek reported that parts of the described system were unfamiliar to many Dogon.`),
      tf(L23, 3, 2, `Most scholars accept the claim that the Dogon had secret knowledge of Sirius's companion star.`, 1, `This is the famous controversy.`, `Most scholars reject it, noting possible outside influence or misunderstanding.`),
      mc(L23, 4, 3, `What is the main lesson of the Dogon case?`, [`Test sources by asking how an account was gathered and what later researchers found`, `Never read anthropology, since every ethnographer invents the beliefs of the people studied`, `One informant speaks for a whole people`, `Famous accounts are always correct`], `Think about critical reading.`, `A famous account can be contested, so one should examine its method and later evidence.`),
      tf(L23, 5, 3, `The lesson says Griaule's work is important but contested.`, 0, `Both statements are true together.`, `It remains influential while its reliability is debated.`),
      // L24
      mc(L24, 1, 1, `Which people produced the Popol Vuh?`, [`The K'iche' Maya`, `The Mexica`, `The Inca`, `The Haudenosaunee`], `They live in the highlands of Guatemala.`, `The Popol Vuh is a K'iche' Maya text.`),
      mc(L24, 2, 2, `In the Popol Vuh, from what are the successful humans made?`, [`Maize`, `Mud`, `Wood`, `Stone`], `A staple food.`, `After mud and wood failed, humans were made from maize.`),
      tf(L24, 3, 2, `The surviving copy is a manuscript made in the early 1700s by the friar Francisco Ximenez.`, 0, `The original has not survived.`, `Ximenez transcribed the K'iche' text and added a Spanish translation.`),
      mc(L24, 4, 2, `Who are Hunahpu and Xbalanque?`, [`The Hero Twins`, `The first humans`, `Two Aztec kings`, `Spanish friars`], `They go down to Xibalba.`, `They are the Hero Twins who defeat the lords of Xibalba.`),
      mc(L24, 5, 3, `Why do scholars debate the Popol Vuh's pre-conquest content?`, [`The surviving text was made in the colonial era and may show Christian influence`, `It was written yesterday`, `It has no stories`, `It was composed by Aztec scribes at Tenochtitlan before the Spanish arrived in Mexico`], `Consider when the writing was done.`, `Colonial-era writing raises questions about what reflects older tradition.`),
      // L25
      mc(L25, 1, 1, `According to the Aztec sources, which sun is the present age?`, [`The Fifth Sun`, `The First Sun`, `The Third Sun`, `The Seventh Sun`], `A number in the title.`, `The present age is called the Fifth Sun.`),
      mc(L25, 2, 2, `What is the Florentine Codex?`, [`A sixteenth-century work compiled by Sahagun with Nahua informants`, `A Maya manuscript painted on bark paper by priests at Chichen Itza long before contact`, `An Inca quipu`, `A Spanish law code`], `A Franciscan friar and Nahua helpers.`, `Sahagun compiled it with Nahua elders and students who provided information.`),
      tf(L25, 3, 2, `Archaeologists found a carved stone disk of Coyolxauhqui at the Templo Mayor in 1978.`, 0, `Recall the war god's birth story.`, `The Coyolxauhqui stone was uncovered at the Templo Mayor in 1978.`),
      mc(L25, 4, 2, `In the birth story of Huitzilopochtli, who is his mother?`, [`Coatlicue`, `Coyolxauhqui`, `Tiamat`, `Nuwa`], `Her daughter plots against her.`, `Coatlicue is his mother, and he defeats Coyolxauhqui and her brothers.`),
      mc(L25, 5, 3, `What is one reason many historians doubt that the Aztecs saw Cortes as a returning god?`, [`The idea appears mainly in accounts written after the conquest`, `Because Cortes was himself Aztec and so could not have been a stranger`, `Because there were no Spanish`, `Because it was written by Maya authors`], `Consider when the story was recorded.`, `Such accounts come from after the conquest, which raises doubts.`),
      // L26
      mc(L26, 1, 1, `How did the Inca keep records?`, [`With knotted cords called quipu`, `With alphabetic books`, `With clay tablets`, `With paper scrolls`], `They had no alphabetic writing.`, `Quipu stored numbers and perhaps some narrative information.`),
      mc(L26, 2, 2, `What makes the Huarochiri Manuscript rare?`, [`It records local religion of a highland province in Quechua`, `It was written in Latin by monks in a Spanish colonial monastery in Peru`, `It is the oldest Inca text`, `It was found in Egypt`], `Language is the key.`, `It is a rare major text written in Quechua, from about 1608.`),
      tf(L26, 3, 2, `Garcilaso de la Vega published his Royal Commentaries in 1609.`, 0, `He was the son of a Spanish captain and an Inca noblewoman.`, `Garcilaso, called El Inca, published the work in 1609.`),
      mc(L26, 4, 2, `Who is Viracocha in many accounts?`, [`A creator god who emerged from Lake Titicaca`, `The Inca emperor`, `The Spanish governor`, `A flood-controlling hero`], `A creator in the Andes.`, `In many accounts, Viracocha forms people after emerging from the lake.`),
      mc(L26, 5, 3, `Why is caution needed with Inca stories?`, [`They were shaped for imperial politics and then reshaped by colonial writers`, `They were never told`, `Only the Spanish told them`, `They were recorded in the Rig Veda`], `Think about two filters.`, `Inca narratives passed through imperial and then colonial hands.`),
      // L27
      mc(L27, 1, 1, `Why is the phrase Native American mythology too broad?`, [`Hundreds of nations speak many languages and tell different stories`, `Native peoples have no stories`, `There is really only one Native nation, whose peoples all tell the same stories`, `The stories are all identical`], `Count the nations.`, `The diversity of nations means we should name the specific people.`),
      mc(L27, 2, 2, `Which nation tells of Sky Woman who fell from a world above?`, [`The Haudenosaunee`, `The Lakota of the Great Plains`, `The Haida of the Northwest Coast`, `The Dine of the Southwest desert`], `They are also called the Six Nations.`, `The Haudenosaunee tell of Sky Woman and the turtle.`),
      tf(L27, 3, 2, `White Buffalo Calf Woman is a figure in Lakota tradition who brought sacred ceremonies.`, 0, `The story is central to Lakota religious life.`, `The lesson attributes this story to the Lakota.`),
      mc(L27, 4, 2, `Raven, a trickster who in many tellings brings light, is told of by which peoples?`, [`Peoples of the Pacific Northwest such as the Haida`, `The Maori`, `The Yoruba`, `The Dogon`], `The coast of the Pacific Northwest.`, `Raven stories belong to peoples including the Haida.`),
      mc(L27, 5, 3, `Which source type deserves priority for these stories?`, [`Books and teaching by the nations themselves`, `Nineteenth-century outsider collections`, `Rumors`, `Films only`], `Think about authority.`, `Many nations publish their own accounts, and those should come first.`),
      // L28
      mc(L28, 1, 1, `Who completed the Shahnameh around 1010 CE?`, [`Ferdowsi`, `Galland, the French translator`, `Virgil, the Roman poet`, `Iryeon, a Korean monk`], `A Persian poet.`, `Ferdowsi completed the Book of Kings in Persian.`),
      mc(L28, 2, 2, `In the Shahnameh, whom does Rostam unknowingly kill?`, [`His son Sohrab`, `Zahhak`, `Kaveh`, `Scheherazade`], `A tragic single combat.`, `Rostam fights and kills Sohrab without knowing he is his son.`),
      tf(L28, 3, 2, `Aladdin and Ali Baba are not found in the earliest Arabic manuscripts of the Nights.`, 0, `They came through a French translation.`, `They entered via Antoine Galland's early eighteenth-century French translation.`),
      mc(L28, 4, 2, `What is the frame story of the Arabian Nights?`, [`Scheherazade tells stories to delay her execution`, `A king travels to India`, `A monk visits Tibet`, `A hero fights a dragon`], `A storyteller and a deadline.`, `Scheherazade tells tales night after night.`),
      mc(L28, 5, 3, `Why is knowledge of pre-Islamic Arabian religion based on indirect evidence?`, [`It comes mostly from later Islamic-era writers`, `It was recorded by ancient Chinese authors`, `It survives in a single temple`, `It is fully documented`], `Think about when the writers lived.`, `Later writers, such as the author of the Book of Idols, are the main sources.`),
      // L29
      mc(L29, 1, 1, `How does the lesson describe these narratives?`, [`Sacred to Jews, Christians and Muslims, and described respectfully without judging their truth`, `As false stories`, `As ancient Greek myths`, `As modern fiction`], `Respect and description.`, `The lesson describes them without asserting or denying religious claims.`),
      mc(L29, 2, 2, `What is the Quranic name for Joseph?`, [`Yusuf`, `Isa, the son of Maryam`, `Musa, the prophet of Pharaoh's time`, `Nuh, the builder of the ark`], `One chapter tells his story.`, `The Quran tells the story of Yusuf in one chapter.`),
      tf(L29, 3, 2, `The Quran does not name Adam's wife.`, 0, `The lesson mentions this difference.`, `Unlike the usual reading of Genesis, the Quran does not name her.`),
      mc(L29, 4, 2, `Who is Maryam in the Quran?`, [`The mother of Jesus`, `The wife of Noah`, `A queen of Egypt`, `The sister of Moses`], `She holds a prominent place.`, `Maryam, the mother of Jesus, is prominent in the Quran.`),
      mc(L29, 5, 3, `How should a respectful course treat the parallels between Genesis and Mesopotamian flood stories?`, [`Present the question without taking a side on revelation`, `Deny that any parallels exist`, `Declare the scriptures invalid`, `Avoid mentioning them`], `Believers and scholars differ.`, `They may interpret the parallels differently, so the course stays neutral on revelation.`),
      // L30
      mc(L30, 1, 1, `Which Mesopotamian epic from the early second millennium BCE tells of a flood and a human survivor?`, [`Atrahasis`, `Aeneid`, `Voluspa`, `Journey to the West`], `An Old Babylonian epic.`, `Atrahasis includes a flood sent by gods and a survivor who builds a boat.`),
      tf(L30, 2, 2, `In Greek tradition, Deucalion and Pyrrha survive a flood sent by Zeus.`, 0, `A Greek pair.`, `They are the Greek flood survivors.`),
      mc(L30, 3, 2, `Who is warned of a flood by a fish in the Shatapatha Brahmana?`, [`Manu`, `Noah`, `Utnapishtim`, `Yu`], `The first man in Vedic tradition.`, `Manu is warned by a fish, a story first found in that Vedic text.`),
      mc(L30, 4, 3, `Which explanation says floods are a common experience, so many cultures tell of them?`, [`Independent origin`, `Diffusion, spread by migration and contact`, `Euhemerism, the theory of deified kings`, `Monomyth, a single hero pattern`], `Different peoples, same experience.`, `Independent origin accounts for resemblances by shared human experience.`),
      mc(L30, 5, 3, `What is a good habit when comparing flood stories?`, [`Compare in detail and name the source for each version`, `Merge all into one universal myth`, `Ignore differences`, `Use only one culture`], `Details matter.`, `Cause, survivors and moral vary, so careful sourcing is needed.`),
      // L31
      mc(L31, 1, 1, `What is a trickster?`, [`A character who breaks rules and crosses boundaries`, `A king who never lies`, `A god of agriculture`, `A hero who always wins`], `Think about Anansi.`, `Tricksters play tricks and move between categories.`),
      tf(L31, 2, 2, `In the Eddas, Loki both helps and harms the gods.`, 0, `He is complex.`, `Loki is ambiguous and eventually joins the gods' enemies at Ragnarok.`),
      mc(L31, 3, 2, `Who is Eshu in Yoruba tradition?`, [`An orisha who is a messenger and guardian of crossroads`, `The devil`, `A Greek god`, `A Chinese hero`], `Missionaries misunderstood him.`, `Equating him with the devil was a missionary misunderstanding.`),
      mc(L31, 4, 2, `In the Homeric Hymn to Hermes, what does Hermes do?`, [`He steals Apollo's cattle`, `He defeats Typhon`, `He builds Troy`, `He creates the Nile`], `A baby with big plans.`, `Hermes steals Apollo's cattle in the hymn.`),
      mc(L31, 5, 3, `Why can general patterns about tricksters mislead?`, [`Each figure has its own tradition, role and audience`, `All tricksters are identical`, `Tricksters appear in only one culture`, `Tricksters are always villains`], `Compare carefully.`, `Loki, Anansi and Eshu differ in what they do and how they are seen.`),
      // L32
      mc(L32, 1, 1, `Who published The Hero with a Thousand Faces in 1949?`, [`Joseph Campbell`, `Christopher Vogler`, `Carl Jung`, `Lord Raglan`], `He proposed the monomyth.`, `Campbell published it in 1949.`),
      mc(L32, 2, 2, `What is the monomyth?`, [`A pattern of departure, trials, reward and return`, `A story with one character`, `A single world flood`, `A creation from a single egg`], `Think of a journey.`, `The hero leaves home, undergoes trials, and returns transformed.`),
      tf(L32, 3, 2, `Critics say the monomyth is so general that almost any story fits.`, 0, `Generalizing too far.`, `Critics also note selective examples and neglect of cultural particulars.`),
      mc(L32, 4, 3, `What did Christopher Vogler do?`, [`Adapted Campbell's pattern into a guide for screenwriters`, `Discovered the Popol Vuh`, `Translated the Eddas`, `Founded Shinto`], `He worked in Hollywood.`, `Vogler turned Campbell's ideas into practical advice for film writers.`),
      mc(L32, 5, 3, `Which question should a thoughtful viewer ask about a modern retelling of a myth?`, [`Whose story is it, who was consulted, and what do the sources say`, `Is it popular`, `Is it expensive`, `Is it a sequel`], `Think about respect and accuracy.`, `These questions connect the retelling back to its sources and communities.`),
    ],
  },
};
