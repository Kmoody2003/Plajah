/**
 * world-religions - "World Religions: A Study Guide" course for the Learn map.
 * Authored from data/sacredLibrary.ts and data/sacredLibrary/* (faiths, sutras, theme) so the Learn map and the
 * Sacred Library agree. An academic, neutral study: each tradition is described in its own terms.
 */
import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

type QD = [1 | 2 | 3, string, string, string[], number, string, string];

const mk = (lessonId: string, qs: QD[]): Question[] =>
  qs.map((x, i) => {
    const choices = [...x[3]];
    choices.splice(x[4], 0, x[2]);
    return {
      id: `${lessonId}.q${i + 1}`,
      lessonId,
      kind: 'mcq' as const,
      prompt: x[1],
      choices,
      answer: x[4],
      hint: x[5],
      explanation: x[6],
      level: x[0],
    };
  });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'world-religions',
    label: 'World Religions: A Study Guide',
    blurb: 'A neutral, academic tour of the major faiths: what each tradition teaches and practises, its history and texts, its holidays, and its mark on art, law and society.',
    accent: '#7a2bd6',
    framework: 'c3',
    tracks: [
      {
        id: 'world-religions.t1',
        title: 'Studying Religion',
        blurb: 'How to learn about faiths fairly, and a first look at Hinduism.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'world-religions.l01',
            title: 'How We Study the World\'s Faiths',
            blurb: 'A fair-minded method: describe each tradition in its own terms across the same ten themes.',
            minutes: 6,
            body: `Studying religion is different from practising one. A student of religion asks what a tradition teaches, how its followers worship, and what has happened in its history, without deciding which tradition is true. The goal is understanding and respect, not ranking.

A helpful habit is to describe each faith in its own words: "Buddhists believe," "Muslims hold," "In Christianity." That keeps the study accurate and keeps the student from speaking for the tradition.

The Sacred Library in Plajah gives every faith the same ten galleries so that traditions can be compared on equal footing: Sacred Texts, The Story, Key Figures, Beliefs and Teachings, Practices, Branches, Places and Art, Calendar, Ethics and Living, and Study Tools and Glossary.

Faiths are not all built the same way. Buddhism, for example, is described as non-theistic, with teachings (the Dharma) rather than a creed about a creator, and with schools rather than denominations. A good study notices where a tradition fits the template and where it bends it.

Why it mattered: neutral, source-based study lets people of any belief, or none, learn about one another's traditions and understand the history, art and law those traditions shaped.`,
          },
          {
            id: 'world-religions.l02',
            title: 'Hinduism: Many Paths, One Dharma',
            blurb: 'The Vedas and epics, the ideas of dharma and karma, and a tradition of many paths.',
            minutes: 7,
            body: `Hinduism developed over thousands of years in South Asia and has no single founder. Its learning is gathered in many texts:
- the Vedas, the oldest and most revered
- the Upanishads, which explore the nature of the self and ultimate reality
- and the great epics, the Mahabharata, which contains the Bhagavad Gita, and the Ramayana.

Central ideas include dharma (duty and right living), karma (action and its results), samsara (the cycle of rebirth) and moksha (liberation from that cycle). Many Hindus understand ultimate reality, called Brahman, as appearing in many forms, and they worship deities such as Vishnu, Shiva and the Goddess, while others emphasise one God or the formless.

Hindus describe several paths toward the goal: the path of action, the path of devotion (bhakti), the path of knowledge, and the path of meditation. This is why the tradition is often called a family of paths rather than a single creed.

Everyday worship, called puja, is offered at home shrines and in temples. Major festivals include Diwali, the festival of lights, Holi and Navaratri. Hindu temples are famous for their carved sculpture, and music and dance have long been offered as worship.`,
          },
        ],
      },
      {
        id: 'world-religions.t2',
        title: 'The Buddhist Path',
        blurb: 'The life of the Buddha, the Dharma, texts and the schools of Buddhism.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'world-religions.l03',
            title: 'From the Bodhi Tree: The Story of Buddhism',
            blurb: 'Siddhartha\'s awakening, Ashoka\'s support and the spread of Buddhism across Asia.',
            minutes: 7,
            body: `Buddhism began in India around the 5th century BCE with Siddhartha Gautama. Buddhist tradition says he left a life of comfort to search for an answer to suffering, and that he awakened while meditating under a tree at Bodh Gaya. He became known as the Buddha, meaning the awakened one, and spent decades teaching, beginning with a first sermon at Sarnath.

Buddhists do not describe the Buddha as a creator or a god. They honour him as a teacher who found and showed a path out of suffering. His disciples, including Ananda, remembered his teachings, which were passed on orally before being written down.

In the 3rd century BCE the Indian emperor Ashoka supported the Buddhist community and sent teachers abroad, helping the faith spread. Over the following centuries monks, merchants and pilgrims carried Buddhism along the Silk Road into Central Asia and China, and by sea into Southeast Asia. It later reached Korea, Japan and Tibet.

The Sacred Library summarises Buddhism as a path of awakening with no creator God and a way out of suffering. The tradition today counts roughly 500 million followers, according to the library's fact sheet.`,
          },
          {
            id: 'world-religions.l04',
            title: 'The Dharma: Truths, Path and Marks',
            blurb: 'The Four Noble Truths, the Eightfold Path and the three marks of existence.',
            minutes: 8,
            body: `The Buddha's teaching is called the Dharma. The Sacred Library calls it a diagnosis and a way, rather than a creed. Its heart is the Four Noble Truths:
1. life involves dukkha, often translated as suffering or unsatisfactoriness
2. dukkha has a cause, which is craving
3. dukkha can end, which is nirvana
4. and there is a path that leads to its end.

That path is the Eightfold Path: right view, right intention, right speech, right action, right livelihood, right effort, right mindfulness and right concentration. Buddhists often group these as wisdom, ethical conduct and meditation. The path is called the Middle Way because it avoids both indulgence and harsh self-denial.

Buddhist teaching also describes three marks of existence: anicca (impermanence), dukkha, and anatta (not-self, the absence of a fixed, independent self). Karma means intentional action and its results, and samsara is the round of birth, death and rebirth driven by craving and ignorance. Nirvana, which means the blowing-out of craving, is freedom from that round.

The Dhammapada puts a central idea simply in its first verse: all that we are is the result of what we have thought. Buddhism places great weight on the training of the mind.`,
          },
          {
            id: 'world-religions.l05',
            title: 'Buddhist Texts, Practice and Schools',
            blurb: 'The three baskets, the Dhammapada and Heart Sutra, meditation, and the three vehicles.',
            minutes: 8,
            body: `Buddhism has several canons rather than one closed book. The Pali Canon, kept by Theravada Buddhists, is called the Tripitaka, or three baskets. Mahayana traditions also honour sutras in Sanskrit, Chinese and Tibetan collections.

Two texts in the Sacred Library show the range. The Dhammapada, from the Pali Canon, is a collection of 423 verses in 26 chapters, and is among the most widely read Buddhist scriptures. It teaches in short verses, such as: hatred does not cease by hatred but ceases by love. The Heart Sutra, a Mahayana text, is a single short page chanted in Zen, Tibetan and Pure Land communities. It teaches emptiness (shunyata), the idea that things lack independent, inherent existence, and ends with the mantra "Gate gate paragate."

Practice is described as training rather than petition. It includes meditation (samatha and vipassana, and zazen in Zen), chanting, the Five Precepts and pilgrimage.

The three great vehicles are Theravada, Mahayana and Vajrayana, with schools such as Zen and Pure Land within them. The Dalai Lama is a leading teacher in the Tibetan tradition, and Nagarjuna was a great Mahayana philosopher. Vesak marks the Buddha's birth, awakening and passing.`,
          },
        ],
      },
      {
        id: 'world-religions.t3',
        title: 'Judaism, Christianity and Islam',
        blurb: 'Three traditions that share roots in the ancient Near East.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'world-religions.l06',
            title: 'Judaism: Covenant, Torah and Festivals',
            blurb: 'The Tanakh and Talmud, the covenant, and a year shaped by holy days.',
            minutes: 8,
            body: `Judaism is one of the oldest continuing faiths, and Jews understand their relationship with God through covenant. Jewish tradition traces the covenant to Abraham and to the giving of the Torah to Moses at Mount Sinai.

The sacred scripture is the Tanakh, the Hebrew Bible, whose three parts are the Torah (the five books of Moses), the Nevi'im (the prophets) and the Ketuvim (the writings). The Talmud records centuries of rabbinic discussion that interprets the Torah and applies it to daily life. The Dead Sea Scrolls, which include the Great Isaiah Scroll from about 125 BCE, show how carefully these texts were copied.

Central practices include Shabbat, the weekly day of rest from Friday evening to Saturday evening, prayer in the synagogue, the Shema, which affirms one God, and dietary laws called kashrut. Jewish teaching places great weight on study and on acts of justice and kindness.

The Jewish year is marked by Rosh Hashanah and Yom Kippur, Sukkot, Hanukkah, Purim, Passover (Pesach) and Shavuot. Passover remembers the exodus from Egypt. In modern times Jewish communities include Orthodox, Conservative and Reform movements, among others.`,
          },
          {
            id: 'world-religions.l07',
            title: 'Christianity: The Story and the Creeds',
            blurb: 'From first-century Judea to the councils, the great split of 1054 and the Reformation.',
            minutes: 8,
            body: `Christianity began in the 1st century in Judea, centred on Jesus of Nazareth. Christians believe Jesus is the Son of God and that he was crucified and rose again, and they hold that his message is good news for all people. The apostle Paul, through his letters and journeys, helped carry the faith across the Roman world.

As the church grew, councils met to state its beliefs. The Council of Nicaea in 325 gave the church the Nicene Creed, which the Council of Constantinople in 381 completed. The Councils of Ephesus (431) and Chalcedon (451) addressed how Christ is both divine and human. The Nicene Creed states the central Christian conviction of one God in three persons: Father, Son and Holy Spirit.

Two later events reshaped Christianity's map. The split of 1054 divided the Church into Western (Catholic) and Eastern (Orthodox) branches. In 1517, Martin Luther's challenge to the church of his day began the Reformation and led to the Protestant churches.

Key figures include Augustine and Thomas Aquinas. The Sacred Library records about 2.4 billion Christians worldwide, and the cross is the symbol of the faith.`,
          },
          {
            id: 'world-religions.l08',
            title: 'Christian Worship, Branches and Art',
            blurb: 'The Bible, sacraments, three major families, the church year, cathedrals and icons.',
            minutes: 7,
            body: `The Christian scripture is the Bible, made up of the Old and New Testaments. Christians read it in worship, in private study and in tools such as reading plans and commentaries. Early copies, like the Codex Sinaiticus from around 330 to 360 CE, are preserved in libraries today.

Worship centres on prayer, hymns and the sacraments or ordinances. Baptism marks entry into the community, and the Eucharist, also called communion, remembers the Last Supper of Jesus with his disciples. Christians describe their ethics as love of God and neighbour, and often point to the Sermon on the Mount and the Beatitudes.

There are three major families: Catholic, Orthodox and Protestant. Each has its own history, leadership and customs, though all share the core of the Nicene Creed.

The church year retells the story of Jesus through seasons: Advent, Christmas, Lent, Easter and Pentecost. Easter is generally regarded as the most important feast.

Christianity has produced a great deal of art and architecture, including basilicas and cathedrals, illuminated manuscripts, sacred icons in the Orthodox tradition, and hymns and choral music.`,
          },
          {
            id: 'world-religions.l09',
            title: 'Islam: Revelation and the Five Pillars',
            blurb: 'The Qur\'an, the Prophet Muhammad, the practices of prayer, fasting and pilgrimage.',
            minutes: 8,
            body: `Islam arose in Arabia in the 7th century CE. Muslims hold that God, called Allah in Arabic, is one, and that the Qur'an was revealed in Arabic to the Prophet Muhammad, who lived from about 570 to 632 CE, over some twenty-three years. Muhammad preached in Mecca, and in 622 he and his followers migrated to Medina, an event called the Hijra that begins the Islamic calendar.

Alongside the Qur'an, Muslims turn to the Sunnah, the example of the Prophet recorded in hadith reports. Scholars developed law, called fiqh, from these sources.

The Five Pillars summarise Muslim practice: the shahada (the declaration of faith), salat (prayer five times a day), zakat (giving to those in need), sawm (fasting during the month of Ramadan) and hajj (the pilgrimage to Mecca, which a Muslim performs once if able).

The two main branches are Sunni and Shia Islam. Major festivals are Eid al-Fitr, which ends Ramadan, and Eid al-Adha, which falls during the pilgrimage season.

In art, mosques feature domes, minarets and courtyards, and calligraphy of Qur'anic verses and geometric patterns are celebrated forms. In the early medieval period, centres of learning such as Baghdad were famous for scholarship.`,
          },
        ],
      },
      {
        id: 'world-religions.t4',
        title: 'Faith in Human Life',
        blurb: 'Sikhism, shared themes, calendars, and religion\'s influence on art, law and society.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'world-religions.l10',
            title: 'Sikhism: Guru Granth Sahib and Seva',
            blurb: 'The ten Gurus, the Khalsa, shared meals and service.',
            minutes: 7,
            body: `Sikhism began in the Punjab region of South Asia with Guru Nanak, who lived from 1469 to 1539. Sikhs hold that there is one God, expressed in the opening symbol Ik Onkar, and that people should live honestly, remember God and share with others. Guru Nanak was followed by nine more Gurus.

Guru Arjan, the fifth Guru, compiled the Adi Granth in 1604. Guru Gobind Singh, the tenth Guru, founded the Khalsa community in 1699 and declared that the scripture, now called the Guru Granth Sahib, would be the eternal Guru. Sikhs treat it with deep reverence, and it is kept at the centre of every gurdwara, the Sikh place of worship.

Sikh teaching stresses equality and rejects caste distinctions. Three guiding practices are often summarised as remembering God, earning an honest living and sharing with others. Seva, selfless service, is central, and each gurdwara runs a free community kitchen called langar, where everyone eats together as equals.

The Golden Temple (Harmandir Sahib) in Amritsar is the most famous Sikh shrine. Vaisakhi, in spring, is a major festival and recalls the founding of the Khalsa.`,
          },
          {
            id: 'world-religions.l11',
            title: 'Sacred Texts Around the World',
            blurb: 'Oral and written scriptures, canons, and how communities read and honour them.',
            minutes: 6,
            body: `Almost every tradition has texts it treats as sacred, but they differ in form, number and use. Some traditions have a canon, an agreed list of books. The Christian Bible, the Jewish Tanakh, the Muslim Qur'an and the Sikh Guru Granth Sahib are examples. Others, such as Buddhism, have several canons: the Pali Canon, Chinese collections and Tibetan collections.

Many scriptures began as oral teaching. The Vedas were memorised and recited for generations, and the Buddha's teachings were remembered by his followers before being written down. Because of this, recitation and chanting remain central ways of honouring the text.

Texts are often supported by commentary. The Talmud interprets the Torah, Muslim scholars gather the Sunnah in hadith reports, and Buddhist and Christian thinkers have written commentaries for centuries. Manuscripts can be physical treasures too, such as Codex Sinaiticus or the Great Isaiah Scroll from the Dead Sea Scrolls.

Languages matter. Many readers study in the original tongues, such as Hebrew, Greek, Arabic, Pali, Sanskrit and Gurmukhi, or use translations. The Sacred Library's reader tools include glosses and parallel translations.

Why it mattered: reading texts directly is one of the best ways to hear a tradition in its own voice.`,
          },
          {
            id: 'world-religions.l12',
            title: 'The Sacred Year: Calendars and Holy Days',
            blurb: 'How lunar and solar calendars shape festivals from Vesak to Ramadan.',
            minutes: 6,
            body: `Every tradition marks time. Holy days remind communities of key events, give rhythm to the year and bring people together.

Many calendars follow the moon. The Islamic calendar is lunar, so Ramadan moves earlier through the seasons by about ten or eleven days each year in the common calendar. The Jewish and Hindu calendars are lunisolar, adjusted to keep festivals in their seasons. Buddhist observance also follows the moon: Vesak marks the Buddha's birth, awakening and passing, and Uposatha days offer regular times for renewal.

Christians follow a liturgical year that runs from Advent through Christmas, Lent and Easter to Pentecost. The Council of Nicaea in 325 gave the church a way of fixing the date of Easter.

Other major observances include Rosh Hashanah, Yom Kippur and Passover in Judaism; Eid al-Fitr and Eid al-Adha in Islam; Diwali and Holi in Hinduism; Vaisakhi in Sikhism; and Losar, the Tibetan new year, in Buddhism.

Many of these days include fasting, feasting, giving to others, prayer, or special stories told again. Studying a calendar is a quick way to see what a community values.`,
          },
          {
            id: 'world-religions.l13',
            title: 'Religion, Art, Law and Society',
            blurb: 'How faiths have shaped buildings, images, legal systems and acts of service.',
            minutes: 8,
            body: `Religions do more than teach beliefs. They have shaped the physical world, law and everyday habits of service.

In art and architecture, the Buddhist stupa and mandala, the Hindu temple's carved sculpture, the Christian cathedral and icon, the Islamic mosque with calligraphy and geometric pattern, and the Sikh Golden Temple are all expressions of devotion that people still visit. Music, chant and hymns carry teachings across generations.

Law has been influenced too. Jewish tradition developed a body of law from the Torah and Talmud. In Islam, scholars built fiqh from the Qur'an and Sunnah. Christian church courts developed canon law over the centuries. In the 3rd century BCE, the emperor Ashoka promoted Buddhist-inspired principles of compassion in his public edicts.

Faith traditions also shape service. Muslims practise zakat, Sikhs run langar and practise seva, Buddhists emphasise compassion and loving-kindness (metta), and Christians speak of works of mercy. Many schools, hospitals and charities began in religious communities.

Modern societies protect freedom of belief in different ways. In the United States, for example, the First Amendment protects the free exercise of religion and forbids an established one. Studying the faiths helps students understand why these protections matter.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'world-religions',
    questions: [
      ...mk('world-religions.l01', [
        [1, 'What is the aim of an academic study of religion?', 'To understand what traditions teach and practise, without ranking them', ['To prove which religion is correct', 'To persuade students to convert', 'To mock beliefs that seem strange'], 0, 'Think about neutrality.', 'Academic study describes traditions fairly and aims at understanding rather than ranking.'],
        [1, 'Which phrasing best fits a neutral study guide?', 'Buddhists believe that craving causes suffering', ['Buddhists are mistaken that craving causes suffering', 'Everyone everywhere already knows that craving causes suffering', 'Only Buddhists are right about craving and suffering'], 1, 'Look for the one that attributes the belief to the group.', 'Describing a tradition in its own terms attributes beliefs to those who hold them.'],
        [2, 'How many galleries does the Sacred Library use as a template for each faith?', 'Ten', ['Three', 'Five', 'Twenty'], 2, 'Gallery numbers run 01 to 10.', 'Every faith wing is built from the same ten galleries, from Sacred Texts to Study Tools and Glossary.'],
        [3, 'Why does the Sacred Library let some faiths deviate from the template?', 'Some traditions are structured differently, such as teachings rather than a creed', ['Some faiths are less important', 'Some faiths have no history', 'The template is optional for faiths whose texts were written down long before the modern era'], 3, 'Think about how Buddhism is described.', 'Buddhism, for example, is described as non-theistic with schools rather than denominations, so its wing bends the template.'],
      ]),
      ...mk('world-religions.l02', [
        [1, 'Which text is part of the Mahabharata and is highly revered by many Hindus?', 'The Bhagavad Gita', ['The Dhammapada', 'The Guru Granth Sahib', 'The Talmud'], 1, 'It is part of an epic.', 'The Bhagavad Gita is found within the Mahabharata epic.'],
        [1, 'What does dharma mean in Hindu thought?', 'Duty and right living', ['A holy mountain', 'A style of devotional music sung at festivals', 'A type of temple'], 0, 'It also appears in Buddhism.', 'In Hinduism dharma refers to duty and right living in accordance with the order of things.'],
        [2, 'What is moksha?', 'Liberation from the cycle of rebirth', ['A festival of colour', 'A temple priest', 'A sacred river'], 3, 'It is the goal of the paths.', 'Moksha is freedom from samsara, the cycle of birth and rebirth.'],
        [3, 'Why is Hinduism often described as a family of paths?', 'It includes devotion, action, knowledge and meditation as ways toward the goal', ['It has a single creed that all must recite', 'It has exactly one scripture that every Hindu community must follow in exactly the same way', 'It was founded by one teacher in one year'], 2, 'It has no single founder.', 'Hindu tradition describes several paths, so it is not a single creed with one founder.'],
      ]),
      ...mk('world-religions.l03', [
        [1, 'Where do Buddhists say Siddhartha Gautama awakened?', 'Under a tree at Bodh Gaya', ['In a cave near the city of Mecca', 'On a high mountain in ancient Judea', 'At the Golden Temple in Amritsar'], 2, 'The tree is called the Bodhi tree.', 'Buddhist tradition says he awakened while meditating under a tree at Bodh Gaya.'],
        [1, 'What does the title Buddha mean?', 'The awakened one', ['The creator', 'The king of gods', 'The first priest'], 0, 'It is a title, not a name.', 'Buddha means awakened one; Buddhists honour him as a teacher, not a creator.'],
        [2, 'Which Indian emperor supported Buddhism and sent teachers abroad?', 'Ashoka', ['Hammurabi', 'Constantine', 'Akbar'], 1, 'He ruled in the 3rd century BCE.', 'Ashoka supported the Buddhist community and helped the faith spread.'],
        [3, 'How did Buddhism spread to China and Central Asia?', 'Monks, merchants and pilgrims carried it along trade routes such as the Silk Road', ['It spread only by sea from Africa', 'It was carried by Roman legions', 'It spread only through printed books'], 3, 'Think about a famous trade route.', 'The Silk Road carried Buddhism into Central Asia and China.'],
      ]),
      ...mk('world-religions.l04', [
        [1, 'How many Noble Truths are in the Buddha\'s core teaching?', 'Four', ['Two', 'Eight', 'Ten'], 1, 'The number is in the name.', 'The Four Noble Truths are the heart of the Dharma.'],
        [1, 'What does anatta mean?', 'Not-self', ['Compassion', 'Rebirth', 'Meditation'], 0, 'It is one of the three marks.', 'Anatta is the absence of a fixed, independent self.'],
        [2, 'What does the Buddhist tradition say is the cause of dukkha?', 'Craving', ['Fate alone', 'Sacred days', 'Lack of wealth'], 3, 'The second Noble Truth.', 'The second Noble Truth identifies craving as the origin of suffering.'],
        [3, 'Why is the Eightfold Path called the Middle Way?', 'It avoids both indulgence and harsh self-denial', ['It sits between two sacred mountains', 'It combines Hinduism and Christianity', 'It lasts exactly eight years'], 2, 'Think about balance.', 'The Middle Way is a path of balance between extremes.'],
      ]),
      ...mk('world-religions.l05', [
        [1, 'What does Tripitaka mean?', 'Three baskets', ['Three jewels', 'Three vehicles', 'Three marks'], 0, 'It describes how the Pali Canon is organised.', 'Tripitaka means three baskets and names the Pali Canon.'],
        [1, 'How many verses does the Dhammapada contain, according to the Sacred Library?', '423', ['108', '1,000', '66'], 2, 'It is in the hundreds.', 'The Dhammapada has 423 verses in 26 chapters.'],
        [2, 'Which teaching is central to the Heart Sutra?', 'Emptiness (shunyata)', ['The Five Pillars', 'The ten Gurus', 'The Nicene Creed of the early church'], 1, 'The word means that things lack inherent existence.', 'The Heart Sutra is a short Mahayana text on emptiness.'],
        [3, 'Which of these are the three great vehicles of Buddhism?', 'Theravada, Mahayana and Vajrayana', ['Catholic, Orthodox and Protestant', 'Sunni, Shia and Sufi', 'Orthodox, Conservative and Reform'], 3, 'The word vehicle is the clue.', 'Theravada, Mahayana and Vajrayana are the three vehicles, with schools such as Zen and Pure Land within them.'],
      ]),
      ...mk('world-religions.l06', [
        [1, 'What is the Tanakh?', 'The Hebrew Bible', ['A weekly day of rest', 'A Jewish festival', 'A prayer shawl'], 1, 'It has three parts.', 'The Tanakh is the Hebrew Bible, made up of Torah, Nevi\'im and Ketuvim.'],
        [1, 'What does Passover remember?', 'The exodus from Egypt', ['The giving of the Qur\'an', 'The birth of the Buddha', 'The founding of the Khalsa'], 0, 'It is also called Pesach.', 'Passover remembers the exodus from Egypt.'],
        [2, 'Which text records centuries of rabbinic discussion applying the Torah to life?', 'The Talmud', ['The Dhammapada', 'The Didache', 'The Upanishads'], 3, 'It is not part of the Tanakh itself.', 'The Talmud records rabbinic discussion of the Torah.'],
        [3, 'What does the Great Isaiah Scroll, from about 125 BCE, show?', 'Jewish scriptures were carefully copied over many centuries', ['Judaism began in the 20th century', 'The Torah was never written down', 'Hebrew had already died out as a written language by the time it was made'], 2, 'Think of the Dead Sea Scrolls.', 'The scroll is a complete book of Isaiah far older than earlier known Hebrew copies, showing careful transmission.'],
      ]),
      ...mk('world-religions.l07', [
        [1, 'What is the Nicene Creed?', 'A statement of Christian belief from the councils of 325 and 381', ['A Buddhist chant', 'A Sikh hymn', 'A Hindu epic'], 3, 'It is named for a city.', 'The Council of Nicaea in 325 produced the creed and Constantinople in 381 completed it.'],
        [1, 'In what year did Martin Luther\'s challenge begin the Reformation?', '1517', ['325', '1054', '1776'], 1, 'It is early in the 1500s.', 'The Reformation is dated from 1517.'],
        [2, 'What happened in 1054?', 'The Church divided into Western and Eastern branches', ['The Council of Nicaea met', 'The Qur\'an was completed', 'The Khalsa was founded'], 0, 'It was a major split.', 'The split of 1054 separated Catholic and Orthodox Christianity.'],
        [3, 'What central conviction does the Nicene Creed state about God?', 'One God in three persons: Father, Son and Holy Spirit', ['Many gods ruling together', 'God as an impersonal force that fills the universe but has no persons', 'God as a human king'], 2, 'Think of the word Trinity.', 'Christians affirm one God in three persons, as the creed states.'],
      ]),
      ...mk('world-religions.l08', [
        [1, 'Which sacrament, also called communion, remembers the Last Supper?', 'The Eucharist', ['Baptism', 'Vaisakhi', 'Zakat'], 0, 'It involves bread and wine.', 'The Eucharist remembers the Last Supper of Jesus.'],
        [1, 'Which are the three major families of Christianity?', 'Catholic, Orthodox and Protestant', ['Sunni, Shia and Sufi', 'Theravada, Mahayana and Vajrayana', 'Orthodox, Conservative and Reform'], 3, 'They are named in the lesson.', 'Christians are generally grouped as Catholic, Orthodox and Protestant.'],
        [2, 'Which season ends the Christian liturgical year\'s Easter cycle?', 'Pentecost', ['Advent', 'The festival of Vesak', 'Ramadan'], 1, 'It comes after Easter.', 'The liturgical year runs from Advent to Pentecost.'],
        [3, 'Which early manuscript from around 330 to 360 CE preserves the oldest complete New Testament?', 'Codex Sinaiticus', ['The Dhammapada', 'The Great Isaiah Scroll', 'The Heart Sutra'], 2, 'It is a codex, or early book.', 'Codex Sinaiticus is the oldest complete New Testament, as the Sacred Library notes.'],
      ]),
      ...mk('world-religions.l09', [
        [1, 'How many times a day do Muslims perform the ritual prayer, salat?', 'Five', ['Once', 'Three', 'Seven'], 1, 'It is one of the Five Pillars.', 'Muslims pray five times a day.'],
        [1, 'What is the Hijra?', 'The migration from Mecca to Medina in 622', ['The pilgrimage to Mecca', 'The fast of Ramadan', 'A mosque dome'], 2, 'It begins the Islamic calendar.', 'The Hijra is the 622 migration of Muhammad and his followers to Medina.'],
        [2, 'Which pillar is fasting during Ramadan?', 'Sawm', ['Zakat', 'Hajj', 'Shahada'], 0, 'Zakat is giving, hajj is pilgrimage.', 'Sawm is the fast during the month of Ramadan.'],
        [3, 'What do the Qur\'an and the Sunnah provide for scholars of fiqh?', 'The sources from which law is developed', ['Maps of trade routes', 'The creeds adopted at the early Christian councils', 'Instructions for building stupas'], 3, 'Fiqh means Islamic law.', 'Scholars developed fiqh from the Qur\'an and Sunnah.'],
      ]),
      ...mk('world-religions.l10', [
        [1, 'Who founded Sikhism?', 'Guru Nanak', ['Guru Gobind Singh', 'The Buddha', 'Muhammad'], 0, 'He was the first Guru.', 'Guru Nanak (1469 to 1539) was the first of the ten Gurus.'],
        [1, 'What is langar?', 'A free community kitchen at the gurdwara', ['A Sikh war song', 'A pilgrimage route', 'A style of turban'], 1, 'Everyone eats together.', 'Langar is the free communal meal where all sit as equals.'],
        [2, 'Which Guru founded the Khalsa in 1699?', 'Guru Gobind Singh', ['Guru Arjan, the fifth Guru', 'Guru Nanak, the first Guru', 'Guru Angad, the second Guru'], 2, 'He was the tenth Guru.', 'Guru Gobind Singh founded the Khalsa and declared the scripture the eternal Guru.'],
        [3, 'Why is the Guru Granth Sahib central to a gurdwara?', 'Sikhs treat it as the eternal Guru', ['It is a map of the Punjab', 'It is a collection of laws about farming', 'It is a record of the Ten Commandments'], 3, 'It is treated with deep reverence.', 'Sikhs honour the scripture as the eternal Guru and keep it at the centre of worship.'],
      ]),
      ...mk('world-religions.l11', [
        [1, 'Which scripture is the Sikh holy book?', 'The Guru Granth Sahib', ['The Tanakh', 'The Pali Canon of the Theravada school', 'The Qur\'an'], 0, 'Its name includes Guru.', 'The Guru Granth Sahib is the Sikh scripture.'],
        [1, 'How were the Vedas first passed down?', 'By memorising and reciting them', ['By printing them in bound volumes from the start', 'By broadcasting them over the radio', 'By sending them in email messages'], 2, 'They were oral before written.', 'The Vedas were memorised and recited across generations.'],
        [2, 'Which tradition has several canons, such as Pali, Chinese and Tibetan?', 'Buddhism', ['Sikhism', 'Judaism', 'Islam'], 1, 'The Sacred Library says it has multiple canons.', 'Buddhism preserves multiple canons rather than one closed book.'],
        [3, 'Why do many readers study scriptures in original languages like Hebrew, Greek or Pali?', 'To read the source closely and see details that translations can blur', ['Because translations are forbidden', 'Because only trained scholars are allowed to read the scriptures at all', 'Because the original is shorter'], 3, 'Think about accuracy.', 'Original languages give direct access to the wording; the Sacred Library offers glosses and parallel translations.'],
      ]),
      ...mk('world-religions.l12', [
        [1, 'Which Buddhist festival marks the Buddha\'s birth, awakening and passing?', 'Vesak', ['Diwali', 'Passover', 'Pentecost'], 2, 'It is mentioned in the Calendar gallery.', 'Vesak commemorates all three events in the Buddha\'s life.'],
        [1, 'Which festival ends the month of Ramadan?', 'Eid al-Fitr', ['Eid al-Adha', 'Holi', 'Yom Kippur'], 1, 'Its name refers to breaking the fast.', 'Eid al-Fitr celebrates the end of Ramadan.'],
        [2, 'What did the Council of Nicaea in 325 help to settle?', 'A way of fixing the date of Easter', ['The date of Ramadan', 'The date of Vesak', 'The date of Diwali'], 3, 'It is mentioned in the Sacred Library.', 'Nicaea gave the church a way of fixing the date of Easter.'],
        [3, 'Why does Ramadan move earlier through the seasons each year?', 'The Islamic calendar is lunar and about ten or eleven days shorter than the solar year', ['It is set by a king each year', 'It follows the harvest', 'It follows the Christian calendar'], 0, 'Think about the moon.', 'A purely lunar calendar drifts against the solar year by roughly ten or eleven days.'],
      ]),
      ...mk('world-religions.l13', [
        [1, 'Which structure is a famous Sikh shrine in Amritsar?', 'The Golden Temple', ['A Buddhist stupa', 'A Gothic cathedral', 'A Hindu mandir'], 0, 'Its other name is Harmandir Sahib.', 'The Golden Temple is the best known Sikh shrine.'],
        [1, 'What is zakat?', 'Giving to those in need', ['A pilgrimage to Mecca made once in a lifetime', 'A festival of colour held in spring', 'A sacred river in northern India'], 1, 'It is one of the Five Pillars.', 'Zakat is the Muslim practice of giving to people in need.'],
        [2, 'Which emperor promoted compassion in public edicts in the 3rd century BCE?', 'Ashoka', ['Constantine', 'Hammurabi', 'Charlemagne'], 2, 'He supported Buddhism.', 'Ashoka promoted principles of compassion in his edicts.'],
        [3, 'What does the First Amendment say about religion?', 'It protects free exercise and forbids an established religion', ['It requires one national faith', 'It bans all religious art', 'It requires prayer in schools'], 3, 'It restrains Congress.', 'The First Amendment guards free exercise of religion and bars an establishment of religion.'],
      ]),
    ],
  },
};
