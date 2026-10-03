/**
 * hq-quest - "History Quest" course for the Learn map.
 * Authored from data/historyQuestData.ts (and the World History eras, figures, civilizations and archives it draws on).
 * The four tracks mirror the quest's four pillars: Chronology & Context, Perspectives, Sources & Evidence, Causation & Argument.
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
    id: 'hq-quest',
    label: 'History Quest',
    blurb: 'Think like a historian: place events in time, hear different voices, weigh sources, and explain why things happened.',
    accent: '#FF8C00',
    framework: 'c3',
    tracks: [
      {
        id: 'hq-quest.t1',
        title: 'Chronology and Context',
        blurb: 'Put the ages of the world in order and see how they connect.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'hq-quest.l01',
            title: 'Reading the Timeline of Ages',
            blurb: 'Nine ages cover the human story, and their dates overlap.',
            minutes: 6,
            body: `Historians divide the long human story into ages, sometimes called eras or periods. The World History atlas that powers History Quest lists nine, in order: Prehistory, the Ancient River-Valley Civilisations, the Classical Age, the Postclassical or Medieval World, the Early Modern Era, the Age of Revolutions, the Industrial and Imperial Age, the Age of World Wars, and the Contemporary World.

Each age has a span of dates. Prehistory runs from about 3.3 million years ago to 3000 BCE, while the Contemporary World runs from 1945 to the present. A date with BCE counts down toward zero, so 3000 BCE is earlier than 800 BCE.

Notice that the spans overlap. The Age of Revolutions covers about 1750 to 1850, and the Industrial and Imperial Age covers about 1760 to 1914. For that reason the quest asks which age began first rather than which came first; start dates are the only clear way to order overlapping periods.

Ages are tools, not natural boundaries. Real people did not wake up one morning in a new age, and different regions changed at different speeds.

Why it matters: a timeline gives you a mental map, and placing any event on it is the first step to understanding it.`,
          },
          {
            id: 'hq-quest.l02',
            title: 'The Ancient Ages',
            blurb: 'Prehistory, the river valleys and the classical age in order.',
            minutes: 7,
            body: `Three ages cover the ancient world. Prehistory stretches from about 3.3 million years ago to 3000 BCE. Its turning points include the migrations out of Africa, the invention of farming around 10,000 BCE, and the first permanent settlements at places such as Catalhoyuk and Jericho.

The Ancient River-Valley Civilisations, about 3500 to 1200 BCE, grew along the Tigris and Euphrates, the Nile, the Indus and the Yellow River. Farming surpluses fed the first cities, kings and writing systems, including cuneiform and hieroglyphs. Turning points include the rise of Sumerian city-states, the unification of Egypt around 3100 BCE and the Code of Hammurabi.

The Classical Age, about 800 BCE to 500 CE, saw Greek philosophy and democracy, Roman law and engineering, the Persian and Mauryan empires, Han China and Silk Road trade. Turning points include Athenian democracy, Alexander's conquests and the rise of the Roman Empire.

Notice that Prehistory and the river-valley age overlap between about 3500 and 3000 BCE. That is not an error. In some places people were already building cities and writing while in others they still lived without either.

Why it matters: change was gradual and uneven, and good historians say where and when, not just that it happened.`,
          },
          {
            id: 'hq-quest.l03',
            title: 'Medieval and Early Modern Turning Points',
            blurb: 'From the rise of Islam to Luther, a thousand years of connection.',
            minutes: 7,
            body: `The Postclassical or Medieval World covers roughly 500 to 1500 CE. As Rome fell in the West, new powers rose: the Islamic caliphates with their Golden Age of science, Tang and Song China, the Byzantine Empire, feudal Europe, and the empires of Mali and Ghana. The key turning points listed are the rise of Islam in the seventh century, the Mongol Empire and the Pax Mongolica, and the Black Death of 1347 to 1351. Chinese inventions such as paper, printing, gunpowder and the compass also belong here.

The Early Modern Era runs from about 1450 to 1750. Its turning points are the fall of Constantinople in 1453, Columbus reaching the Americas in 1492, and Luther's Ninety-five Theses in 1517. Developments include the printing revolution, global exploration, the Columbian Exchange, the Reformation, the Scientific Revolution and the gunpowder empires, namely the Ottoman, Safavid and Mughal.

These two ages are linked. Printing and gunpowder were developed earlier in China, and later states used them at far larger scale.

Why it matters: seeing how one age grows out of the last helps you explain change rather than only list it.`,
          },
          {
            id: 'hq-quest.l04',
            title: 'Revolutions and Industry',
            blurb: 'Two overlapping ages that reshaped politics and work.',
            minutes: 7,
            body: `The Age of Revolutions, about 1750 to 1850, was driven by Enlightenment ideas of liberty, reason and rights. Its turning points include the American Revolution in 1776, the French Revolution in 1789, the Haitian Revolution from 1791 to 1804, and the Latin American independence wars. Monarchies fell, constitutions rose, abolition movements grew, and nationalism began to redraw the map.

The Industrial and Imperial Age, about 1760 to 1914, overlaps it. Steam, coal, steel and electricity changed how people worked and travelled. Railways, steamships and telegraphs shrank distances, and cities grew with new working classes. At the same time, industrial powers carved up Africa and Asia in a wave of imperialism; the Berlin Conference of 1884 to 1885 is one of its turning points.

Early industrialisation appears in the story of both ages. That is natural, because historians group events by theme and a single development can matter to more than one period.

The overlap also reminds us that one time can hold different experiences: a worker in a new factory town, a soldier in a revolution and a colonised farmer lived in the same decades but saw different worlds.

Why it matters: overlapping ages teach you to ask which story an event belongs to, and to accept that the answer can be more than one.`,
          },
          {
            id: 'hq-quest.l05',
            title: 'World Wars and the Contemporary World',
            blurb: 'Total war, new nations and an interconnected present.',
            minutes: 7,
            body: `The Age of World Wars runs from 1914 to 1945. Two global conflicts and the Great Depression convulsed the century. World War I lasted from 1914 to 1918, and the Russian Revolution came in 1917. World War II lasted from 1939 to 1945 and included the Holocaust and the atomic bombings of Hiroshima and Nagasaki. Fascism and communism clashed with democracy, and decolonisation began.

The Contemporary World runs from 1945 to the present. It begins with the end of World War II and the founding of the United Nations. It includes the Cold War, the decolonisation of Africa and Asia, civil-rights and human-rights movements, the fall of the Berlin Wall in 1989, and the rise of the internet. Globalisation, climate awareness and artificial intelligence now define an interconnected planet.

Historians treat the most recent decades with extra caution. We lack distance, some records are not yet open, and the story is still unfolding, so today's judgments may change.

Why it matters: placing your own time on the same timeline as the Roman Empire or the Black Death is a reminder that you are part of history too.`,
          },
        ],
      },
      {
        id: 'hq-quest.t2',
        title: 'Perspectives',
        blurb: 'People in the same time saw things differently.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'hq-quest.l06',
            title: 'Why Perspectives Differ',
            blurb: 'The same event looks different from different positions.',
            minutes: 6,
            body: `A perspective is a point of view, shaped by a person's position, experience and beliefs. History Quest teaches that individuals and groups living in the same period often differed in their perspectives, and that the reasons can be explained.

Take the Haitian Revolution, which ran from 1791 to 1804. Toussaint Louverture, who lived from about 1743 to 1803, led formerly enslaved people against colonial powers, and the movement he built created Haiti, the first Black republic. People who held power in the colony had very different interests and would describe the same events in a different way. Neither view is simply neutral; each reflects what the person stood to gain or lose.

Perspectives also change across eras. The C3 skill for older learners asks you to analyse the multiple factors that influenced people's views in different periods, such as religion, wealth, education and the technology of the day.

A useful habit is to ask of any source: who is speaking, to whom, and from what position?

Why it matters: understanding why people disagreed lets you judge the past fairly without simply adopting one side's story.`,
          },
          {
            id: 'hq-quest.l07',
            title: 'Voices from the Past',
            blurb: 'Meet rulers, travellers and leaders and read through their eyes.',
            minutes: 7,
            body: `History Quest's Voices game asks whose eyes you are seeing through. The atlas supplies the figures, each with a short tagline.

Cleopatra VII ruled Egypt from 51 to 30 BCE as the last active ruler of Ptolemaic Egypt, steering through the Roman civil wars by alliances with Caesar and Antony. Mansa Musa ruled Mali from about 1312 to 1337 and is possibly the wealthiest individual in history; his 1324 pilgrimage became famous. Elizabeth I, queen of England from 1558 to 1603, stabilised a divided realm through religious compromise. Ibn Battuta, a Moroccan who lived from 1304 to 1368, is called the medieval world's greatest traveller, and his Rihla records societies from Mali to China. Mahatma Gandhi, who lived from 1869 to 1948, led nonviolent resistance in India.

Each of these people spoke or acted from a particular position: a queen, an emperor, a traveller, a campaigner. Much of what we know about them was written by others, sometimes with an agenda.

Why it matters: a name on a timeline becomes a real viewpoint when you ask what that person wanted, feared and could see.`,
          },
        ],
      },
      {
        id: 'hq-quest.t3',
        title: 'Sources and Evidence',
        blurb: 'How we know what we know about the past.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'hq-quest.l08',
            title: 'Primary and Secondary Sources',
            blurb: 'Telling first-hand evidence from later accounts.',
            minutes: 6,
            body: `A historical source is anything that can help us study the past. Historians sort sources into two broad kinds.

A primary source comes from the time being studied: a diary written the same week as an event, a letter, a photograph, a coin, an inscription, or a newspaper from the day. Primary sources let us come close to what people actually said, saw and made.

A secondary source is created later by someone studying the evidence. A history book written today about ancient Rome is a secondary source, as is a modern documentary or encyclopedia. It is not worse; it is usually better at giving an overview and drawing on many primary sources.

The label depends on the question. A modern history book is secondary for Rome, but it would be a primary source for a historian studying how people today think about Rome.

When two sources describe the same event differently, a careful historian does not simply pick the longer or the older one. She compares them, asks who made each and why, and looks for more evidence.

Why it matters: knowing what kind of source you hold tells you what it can and cannot prove.`,
          },
          {
            id: 'hq-quest.l09',
            title: 'Finding Evidence in Open Archives',
            blurb: 'Where to search for real documents, newspapers and books.',
            minutes: 7,
            body: `Many of the world's archives have put their collections online, free to search. History Quest's Evidence game uses a real list of them.

The Library of Congress is the largest library in the world, with millions of digitised manuscripts, maps, photographs and recordings. Chronicling America holds digitised historic American newspapers from 1770 to 1963. The Internet Archive offers tens of millions of books, texts, audio, film and web pages. The Digital Public Library of America brings together items from United States libraries, archives and museums, and Europeana does the same for Europe's cultural heritage, with over 50 million items.

For texts, Wikisource offers treaties, speeches and constitutions; Project Gutenberg has over 70,000 free ebooks; HathiTrust shares over 17 million volumes from research libraries; and the Perseus Digital Library is the open collection of Greek and Latin classical texts. The World Digital Library gathers primary materials from cultures worldwide.

Choosing the right archive is itself a skill. A question about an Athenian speech needs Perseus; a question about how an American town reacted to news needs old newspapers.

Why it matters: knowing where evidence lives turns a vague question into a researchable one.`,
          },
          {
            id: 'hq-quest.l10',
            title: 'Gaps, Bias and Corroboration',
            blurb: 'Every record is incomplete, so test claims across sources.',
            minutes: 7,
            body: `No historical record is complete. Most surviving documents from any era were written by people with power, education and time: rulers, officials and clergy. Ordinary workers, enslaved people and many women left far fewer records. The result is that some voices are missing, and a historian must say so rather than treat the surviving record as the whole truth.

Sources also have their own limits. A memoir written forty years after the events it describes is limited mainly by memory and hindsight. A speech meant to persuade will emphasise what helps its cause.

The strongest way to test a claim about the past is corroboration: checking it against independent sources that do not simply copy one another. Where several sources agree, confidence grows. Where they disagree, the disagreement itself is a finding worth explaining.

History Quest's Turbo challenges build on this. One asks you to read against the grain, noticing whose voices are missing from the sources about a figure and how the story might change if those voices had been recorded. Another asks you to find three independent sources and note exactly where they disagree.

Why it matters: honest history states what the evidence can and cannot show.`,
          },
        ],
      },
      {
        id: 'hq-quest.t4',
        title: 'Causation and Argument',
        blurb: 'Explain why events happened and defend your explanation.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'hq-quest.l11',
            title: 'Causes and Effects of Developments',
            blurb: 'Link developments to the ages that produced them.',
            minutes: 7,
            body: `Causation asks why something happened and what followed. History Quest's Because game starts with developments, the big changes each age produced, and asks you to place them.

Look at the pattern. The Postclassical world produced the Islamic Golden Age of science and philosophy, Chinese inventions such as paper and gunpowder, feudalism and universities in Europe, and Trans-Saharan and Indian Ocean trade. The Early Modern Era produced the printing revolution, global exploration, the Columbian Exchange, the Reformation, the Scientific Revolution and the gunpowder empires. The Industrial and Imperial Age produced steam power, railways, steamships and telegraphy, urbanisation, and high imperialism.

Events rarely have a single cause. The Reformation, for example, was not only the work of Luther; it also depended on printing, which spread his writings, and on translations of scripture into everyday language.

A good causal explanation names several causes, separates short-term triggers from long-term conditions, and traces effects that were intended and unintended.

Why it matters: asking why in a disciplined way is how history becomes more than a list of dates.`,
          },
          {
            id: 'hq-quest.l12',
            title: 'Civilisation Hallmarks as Clues',
            blurb: 'What a culture is famous for tells you how it lived.',
            minutes: 7,
            body: `A civilisation's hallmarks are its best-known achievements, and they are clues to its causes. The Maya of Mesoamerica, active from about 2000 BCE to the 1500s CE, are known for hieroglyphic writing, the Long Count calendar, step pyramids and advanced astronomy. The Inca Empire, about 1438 to 1533, bound the Andes with roads called the Qhapaq Nan, kept records on knotted cords called quipu, and farmed on terraces. The Aztec Empire, about 1345 to 1521, centred on the island city of Tenochtitlan and used chinampa farming.

The Gupta Empire, about 320 to 550 CE, is linked with the decimal system and zero and with classical Sanskrit literature. The Khmer Empire, 802 to 1431, built Angkor Wat and large reservoirs called baray through hydraulic engineering. The Byzantine Empire gave us the Hagia Sophia, the Justinian Code and Greek fire, and the Ottoman Empire the Janissaries and the millet system.

Different peoples met similar needs in different ways. Aztec chinampas and Khmer reservoirs both show societies shaping their landscape to produce food for large cities.

Why it matters: hallmarks are evidence. Asking why a culture developed one particular skill leads straight to causation.`,
          },
          {
            id: 'hq-quest.l13',
            title: 'Building a Historical Argument',
            blurb: 'Turn evidence and causes into a claim you can defend.',
            minutes: 8,
            body: `An argument in history is a claim about the past that you support with evidence. History Quest's Turbo challenges are practice for this.

Corroborate it asks you to take one turning point and find three independent sources, noting exactly where they disagree. Read against the grain asks whose voices are missing from the sources about a figure. Two eras, one problem asks you to choose a problem that appears in more than one era, such as plague, migration or information overload, and to explain how each era's tools and beliefs shaped its response. Write the counterfactual asks you to argue, with evidence, what would plausibly have followed if a turning point had gone the other way, and also what would not have changed.

A strong argument has a clear claim, uses evidence from more than one source, admits what the evidence cannot show, and answers the best objection. A weak argument states an opinion, relies on a single convenient source, or ignores facts that do not fit.

The counterfactual exercise is not about guessing. Its value is in sharpening your sense of which causes truly mattered.

Why it matters: arguing from evidence is the skill that carries from history into every area of life.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'hq-quest',
    questions: [
      ...mk('hq-quest.l01', [
        [1, 'Which age spans about 3.3 million years ago to 3000 BCE?', 'Prehistory', ['The Classical Age', 'The Early Modern Era', 'The Contemporary World'], 1, 'It is the earliest age in the atlas.', 'Prehistory runs from roughly 3.3 million years ago to 3000 BCE.'],
        [1, 'How many ages does the World History atlas list?', 'Nine', ['Fifteen', 'Seven', 'Twelve'], 0, 'Count from Prehistory to the Contemporary World.', 'The atlas lists nine ages, from Prehistory to the Contemporary World.'],
        [2, 'Which began first?', 'The Age of Revolutions (about 1750)', ['The Industrial and Imperial Age (about 1760)', 'The Age of World Wars (1914)', 'The Contemporary World (1945)'], 3, 'Compare the start years of the two overlapping ages.', 'Revolutions began about 1750 and Industrial about 1760, so Revolutions began first.'],
        [3, 'Why does the quest ask which age BEGAN first rather than which came first?', 'The ages overlap, so only start dates give a clear order', ['Ages never have dates', 'End dates are always unknown', 'Only one age can exist at a time'], 2, 'Think about overlapping dates.', 'Because ages overlap, comparing start dates is the only unambiguous way to order them.'],
      ]),
      ...mk('hq-quest.l02', [
        [1, 'Which turning point belongs to the river-valley age?', 'The Code of Hammurabi', ['Athenian democracy', 'The Black Death', 'The French Revolution'], 1, 'It was a law code of Babylon.', 'The Code of Hammurabi is a turning point of the river-valley civilisations (about 3500-1200 BCE).'],
        [1, 'In which age was Egypt unified around 3100 BCE?', 'Ancient River-Valley Civilisations', ['The Classical Age of Greece and Rome', 'Prehistory', 'The Early Modern Era'], 2, 'Think of the Nile.', 'The unification of Egypt around 3100 BCE is a turning point of the river-valley age.'],
        [2, 'Athenian democracy belongs to which age?', 'The Classical Age', ['Prehistory', 'The Postclassical World', 'The Age of Revolutions'], 0, 'Athens is Greek.', 'Athenian democracy is a turning point of the Classical Age, about 800 BCE to 500 CE.'],
        [3, 'Prehistory and the river-valley age overlap about 3500-3000 BCE. What does that show?', 'Change was gradual and uneven, with some regions urban while others were not', ['One of the dates must be wrong', 'Cities appeared everywhere at once', 'Writing was invented in prehistory'], 3, 'Think about different regions.', 'Overlap reflects that regions changed at different speeds, so ages are tools rather than sharp boundaries.'],
      ]),
      ...mk('hq-quest.l03', [
        [1, 'Which turning point belongs to the Postclassical World?', 'The Black Death (1347-1351)', ['Luther\'s Ninety-five Theses', 'Columbus reaching the Americas', 'The Haitian Revolution'], 2, 'It is a plague of the fourteenth century.', 'The Black Death of 1347-1351 is listed as a turning point of the Postclassical World.'],
        [1, 'Luther\'s Ninety-five Theses belong to which age?', 'The Early Modern Era', ['The Classical Age', 'The Industrial Age', 'The Contemporary World'], 0, 'They date to 1517.', 'Luther\'s 1517 theses are a turning point of the Early Modern Era (about 1450-1750).'],
        [2, 'Which came first?', 'The rise of Islam (seventh century)', ['The fall of Constantinople (1453)', 'Columbus reaching the Americas (1492)', 'Luther\'s theses (1517)'], 3, 'Compare the centuries.', 'Islam arose in the seventh century, long before the early modern events.'],
        [3, 'How do Chinese printing and gunpowder connect the two ages?', 'Technologies developed earlier were later used at larger scale by new states', ['They were invented in the Early Modern Era', 'They were unknown outside China forever', 'They replaced all earlier inventions at once'], 1, 'Think about the development lists of both ages.', 'Printing and gunpowder appear in the Postclassical list and underlie the later printing revolution and gunpowder empires.'],
      ]),
      ...mk('hq-quest.l04', [
        [1, 'In which age does the Haitian Revolution belong?', 'The Age of Revolutions', ['The Classical Age', 'The Age of the World Wars and the Great Depression', 'Prehistory'], 0, 'It ran from 1791 to 1804.', 'The Haitian Revolution (1791-1804) is a turning point of the Age of Revolutions.'],
        [1, 'The Berlin Conference of 1884-85 belongs to which age?', 'The Industrial and Imperial Age', ['The Early Modern Era of exploration', 'The Postclassical or Medieval World', 'The Age of Revolutions and Nationalism'], 2, 'It is tied to the Scramble for Africa.', 'The Berlin Conference is a turning point of the Industrial and Imperial Age (about 1760-1914).'],
        [2, 'Which pair of ages overlap in time?', 'Revolutions (1750-1850) and Industrial (1760-1914)', ['Prehistory and the Classical Age', 'Early Modern and Contemporary', 'The Age of World Wars (1914-1945) and the Age of Revolutions (1750-1850)'], 3, 'Look for similar start years.', 'Revolutions and Industrial both include the years about 1760-1850.'],
        [3, 'Why can early industrialisation appear in more than one age?', 'Historians group events by theme, so one development can matter to several periods', ['The dates are always wrong', 'Industry did not exist before 1914', 'Each event belongs to only one age'], 1, 'Think about how themes cut across periods.', 'Periods are tools for grouping events, and a development like early industrialisation matters to more than one story.'],
      ]),
      ...mk('hq-quest.l05', [
        [1, 'When did World War I take place?', '1914-1918', ['1939-1945', '1789-1799', '1945-1989'], 0, 'It began in 1914.', 'World War I lasted from 1914 to 1918.'],
        [1, 'The founding of the United Nations belongs to which point in time?', 'The end of World War II', ['The outbreak of World War I in 1914', 'The Russian Revolution', 'The French Revolution'], 2, 'It was in 1945.', 'The atlas lists the end of WWII and founding of the UN as a turning point of the Contemporary World.'],
        [2, 'Which event came first?', 'The Russian Revolution (1917)', ['The founding of the UN (1945)', 'The fall of the Berlin Wall (1989)', 'The rise of the internet'], 3, 'It occurred during the First World War.', 'The Russian Revolution came in 1917, before the later events.'],
        [3, 'Why do historians treat the most recent decades with extra caution?', 'They lack distance, some records are not yet open, and the story is still unfolding', ['Recent history has no sources', 'Recent events never matter', 'Only ancient history is true'], 1, 'Think about what time and distance provide.', 'With recent events, perspective and access to records are limited, so judgments may change.'],
      ]),
      ...mk('hq-quest.l06', [
        [1, 'Who led formerly enslaved people to found Haiti, the first Black republic?', 'Toussaint Louverture', ['Simon Bolivar of Venezuela', 'George Washington of Virginia', 'Abraham Lincoln of Illinois'], 3, 'The revolution ran from 1791 to 1804.', 'Toussaint Louverture led the movement that created Haiti.'],
        [1, 'What is a perspective?', 'A point of view shaped by a person\'s position, experience and beliefs', ['A date on a timeline', 'A kind of artefact', 'A type of archive'], 0, 'It is about how someone sees things.', 'A perspective is a point of view, shaped by position, experience and beliefs.'],
        [2, 'Why would an enslaved person and a colonial authority describe the Haitian Revolution differently?', 'Their interests and experiences differed, so they saw it differently', ['Only one of them was alive', 'Neither was present', 'They had read exactly the same documents and still reached opposite views by chance alone'], 2, 'Think about what each stood to gain or lose.', 'People in the same period can differ because of position and interest, which is why perspectives are worth explaining.'],
        [3, 'Which question best helps you detect a source\'s perspective?', 'Who wrote this, and from what position?', ['How long is it?', 'Is it written in ink or on paper that was made locally?', 'Is it in a library?'], 1, 'Focus on the author, not the physical form.', 'Asking who is speaking and from what position reveals the viewpoint behind a source.'],
      ]),
      ...mk('hq-quest.l07', [
        [1, 'Who was the last active ruler of Ptolemaic Egypt?', 'Cleopatra VII', ['Elizabeth I of England', 'Hammurabi of Babylon', 'Mansa Musa of Mali'], 2, 'She reigned from 51 to 30 BCE.', 'Cleopatra VII was the last active ruler of Ptolemaic Egypt.'],
        [1, 'Who is called the medieval world\'s greatest traveller?', 'Ibn Battuta', ['Christopher Columbus', 'Magellan', 'Gandhi'], 0, 'He wrote the Rihla.', 'Ibn Battuta, 1304-1368, travelled over 70,000 miles and wrote the Rihla.'],
        [2, 'Who ruled earlier?', 'Mansa Musa (about 1312-1337)', ['Elizabeth I of England (1558-1603)', 'Gandhi (lived 1869-1948)', 'Suleiman (1520-1566)'], 3, 'Compare the years.', 'Mansa Musa reigned in the early fourteenth century, before the others.'],
        [3, 'What should a reader remember about a traveller\'s account like the Rihla?', 'It reflects the writer\'s own background as well as the places described', ['It is a perfectly neutral record', 'It cannot be used as evidence', 'It was written by many authors'], 1, 'Think about who is describing what.', 'Every account is written from a viewpoint, so it tells us about the writer as well as about what he saw.'],
      ]),
      ...mk('hq-quest.l08', [
        [1, 'A diary written the same week as an event is what kind of source?', 'A primary source', ['A secondary source', 'A textbook', 'A map'], 0, 'It comes from the time being studied.', 'A diary written at the time is a primary source.'],
        [1, 'A history book written today about ancient Rome is what kind of source?', 'A secondary source', ['A primary source written at the time', 'An artefact dug up from the ground', 'An inscription carved in stone'], 3, 'It was made long after the events.', 'A modern history of Rome is a secondary source.'],
        [2, 'Which is a primary source for studying ancient Rome?', 'A Roman coin', ['A modern encyclopedia article', 'A recent documentary', 'A textbook chapter'], 1, 'Pick the one made then.', 'A coin was made in Roman times, so it is a primary source.'],
        [3, 'Two sources describe the same battle differently. What should a historian do?', 'Compare both and look for more evidence', ['Believe the longer one', 'Ignore both and rely on her own opinion instead', 'Believe the older one automatically'], 2, 'Avoid simple shortcuts.', 'Comparing sources and seeking further evidence is better than choosing by length or age.'],
      ]),
      ...mk('hq-quest.l09', [
        [1, 'Which archive is the open collection of Greek and Latin classical texts?', 'The Perseus Digital Library', ['Chronicling America', 'Europeana', 'The Digital Public Library of America'], 3, 'It is from Tufts University.', 'Perseus is the open collection of Greek and Latin classical texts with translations.'],
        [1, 'Which is described as the largest library in the world?', 'The Library of Congress', ['The Internet Archive and its web archive', 'Wikisource, the free library of source texts', 'Project Gutenberg and its free ebook library'], 0, 'It is a United States institution.', 'The Library of Congress is described as the largest library in the world.'],
        [2, 'You want treaties, speeches and constitutions as free texts. Where do you search?', 'Wikisource', ['Chronicling America', 'Europeana and its European collections', 'The World Digital Library only'], 2, 'Think of source texts.', 'Wikisource is a free library of source texts such as treaties, speeches and constitutions.'],
        [3, 'You want to compare how American newspapers and European collections treated an event of the 1850s. Which pair fits?', 'Chronicling America and Europeana', ['Project Gutenberg and the Perseus Digital Library', 'HathiTrust and Perseus', 'Wikisource and Perseus'], 1, 'One is American and one is European.', 'Chronicling America holds US newspapers 1770-1963, and Europeana holds Europe\'s cultural heritage.'],
      ]),
      ...mk('hq-quest.l10', [
        [1, 'What is corroboration?', 'Checking a claim against independent sources', ['Copying a source word for word', 'Ignoring disagreements', 'Trusting the oldest source'], 0, 'It involves more than one source.', 'Corroboration tests a claim across independent sources.'],
        [1, 'A memoir written 40 years after events is limited mainly by what?', 'Memory and hindsight', ['Its length and the number of pages', 'Its language and the choice of words', 'The quality of its paper and ink'], 3, 'Think about time passing.', 'A memoir written decades later is limited by memory and hindsight.'],
        [2, 'Most surviving records were written by the powerful. What does this mean for the record?', 'It is incomplete, and some voices are missing', ['It is perfectly balanced', 'It is entirely false and so cannot be used by historians', 'It is complete'], 2, 'Think about who left records.', 'Because the powerful wrote most records, the surviving record is incomplete.'],
        [3, 'What does "reading against the grain" ask you to notice?', 'Whose voices are missing and how the story might change with them', ['Which source is longest', 'Which source is oldest', 'Which source is printed'], 1, 'It is about absence.', 'Reading against the grain asks what voices are absent from the sources and how they could change the story.'],
      ]),
      ...mk('hq-quest.l11', [
        [1, 'Which development came out of the Industrial and Imperial Age?', 'Railways, steamships and telegraphy', ['The Neolithic agricultural revolution', 'Greek theatre', 'The Islamic Golden Age'], 3, 'Think about steam and coal.', 'Railways, steamships and telegraphy are developments of the Industrial and Imperial Age.'],
        [1, 'Which development came out of the Postclassical World?', 'The Islamic Golden Age of science and philosophy', ['Steam power and the growth of railways across Britain', 'The Scientific Revolution of Galileo and Newton in Europe', 'The gunpowder empires of the Ottomans, Safavids and Mughals'], 0, 'It is a medieval development.', 'The Islamic Golden Age is a development of the Postclassical World (about 500-1500 CE).'],
        [2, 'Which are political effects of the Enlightenment ideas of liberty and rights?', 'Revolutions in America, France, Haiti and Latin America', ['The Neolithic revolution', 'The Black Death', 'The Silk Road trade networks linking Asia, Africa and Europe'], 1, 'Look at 1750-1850.', 'Enlightenment ideas inspired political revolutions in the Age of Revolutions.'],
        [3, 'Why is it better to name several causes of the Reformation than a single one?', 'Luther\'s theses, printing and vernacular scripture all contributed', ['Only Luther mattered', 'Printing had no effect', 'There was no cause'], 2, 'Events rarely have one cause.', 'Luther challenged indulgences, printing spread his writing, and translated scripture reached ordinary readers.'],
      ]),
      ...mk('hq-quest.l12', [
        [1, 'The Long Count calendar is a hallmark of which civilisation?', 'The Maya', ['The Inca Empire', 'The Khmer', 'The Gupta'], 0, 'It is a Mesoamerican culture.', 'The Maya are known for hieroglyphs and the Long Count calendar.'],
        [1, 'Which civilisation kept records on knotted cords called quipu?', 'The Inca', ['The Aztec', 'The Maya', 'The Ottoman'], 1, 'They were in the Andes.', 'The Inca kept quipu records and built the Qhapaq Nan road network.'],
        [2, 'The decimal system and zero are hallmarks of which empire?', 'The Gupta Empire', ['The Khmer Empire', 'The Byzantine Empire', 'The Aztec Empire'], 2, 'It was classical India.', 'The Gupta Empire is linked with the decimal system, zero and classical Sanskrit literature.'],
        [3, 'What do Aztec chinampas and Khmer baray reservoirs both show?', 'Societies shaped their landscape to produce food for large cities', ['They had no cities', 'They copied each other directly', 'They avoided farming and relied on trade for all their food from elsewhere'], 3, 'Both are about water and farming.', 'Both are food and water systems that supported large urban populations.'],
      ]),
      ...mk('hq-quest.l13', [
        [1, 'What does the "Corroborate it" challenge ask you to find?', 'Three independent sources and where they disagree', ['One source that agrees', 'A single textbook', 'The oldest document'], 1, 'The number is more than one.', 'It asks for three independent sources and a note of exactly where they disagree.'],
        [1, 'What does "Read against the grain" ask?', 'Whose voices are missing from the sources', ['Who wrote the longest and most detailed account of the event', 'Which book is oldest', 'Which source is largest'], 2, 'It is about absent voices.', 'It asks you to notice whose voices are missing and how the story might change.'],
        [2, 'What does the counterfactual challenge require besides what would have followed?', 'What would NOT have changed', ['A guess about the future with no evidence', 'A single date for the turning point', 'A list of kings and their dates'], 0, 'Think about continuity.', 'It asks for what would plausibly have followed and what would not have changed.'],
        [3, 'Which is the strongest historical argument?', 'A clear claim backed by several sources that admits its limits', ['An opinion with no evidence', 'A claim from one convenient source', 'A claim that ignores contrary evidence'], 3, 'Look for evidence and honesty.', 'Strong arguments use multiple sources, state limits and answer objections.'],
      ]),
    ],
  },
};
