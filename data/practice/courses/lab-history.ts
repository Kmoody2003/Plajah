/**
 * lab-history - "World History" course for the Learn map.
 * Authored from data/worldHistoryData.ts (eras, civilizations, figures) so the Learn map and the studio agree.
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
    id: 'lab-history',
    label: 'World History',
    blurb: 'A guided tour of the human story, from the first farmers to the modern world, built on the same eras, civilizations and figures as the World History studio.',
    accent: '#FF8C00',
    framework: 'c3',
    tracks: [
      {
        id: 'lab-history.t1',
        title: 'Origins and River Valleys',
        blurb: 'How farming, cities, writing and law first appeared.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-history.l01',
            title: 'Prehistory and the Farming Revolution',
            blurb: 'Before writing, people spread across the globe and then learned to farm.',
            minutes: 6,
            body: `Prehistory covers the long stretch of time before writing, from roughly 3.3 million years ago to about 3000 BCE. Because there are no written records, historians rely on objects: stone tools, hearths, bones and paintings.

Early humans mastered fire and tool-making, and in a series of migrations often called the Out-of-Africa movements they spread across every continent. They also made art; cave and rock paintings are among the oldest evidence of human imagination.

The biggest change came with the Neolithic, or farming, revolution, around 10,000 BCE. People learned to plant crops and to domesticate animals. Instead of following herds and ripening plants, they could stay in one place. Some of the first permanent settlements, such as Catalhoyuk and Jericho, date from this change.

Farming produced a surplus of food, and a surplus changed everything. Villages grew, not everyone needed to farm, and differences in wealth and power appeared for the first time. These were the conditions that later made cities, kings and writing possible.

Why it mattered: nearly everything that follows in history, from cities to empires, rests on the shift from moving to settling.`,
          },
          {
            id: 'lab-history.l02',
            title: 'Sumer, Babylon and the First Laws',
            blurb: 'Between two rivers, people built the first cities, wrote on clay and set laws in stone.',
            minutes: 7,
            body: `Mesopotamia means the land between rivers, here the Tigris and the Euphrates in the Fertile Crescent. The civilization of Sumer and its neighbours lasted from about 4500 to 539 BCE, and it gave the world a remarkable list of firsts: city-states, cuneiform writing pressed into clay, the wheel, and temple towers called ziggurats. The Epic of Gilgamesh, one of the oldest stories ever written down, comes from this world.

Farming here depended on managing river water, and that encouraged organised government. Cities grew, rulers emerged, and scribes began recording grain, trade and decrees.

Hammurabi was king of Babylon from about 1792 to 1750 BCE. He expanded Babylon into the dominant Mesopotamian power and is best known for his law code. Its 282 laws were carved on a tall diorite stele, a stone pillar, so that people could see them.

The idea that matters is not that the laws were gentle, but that they were written and public. Law no longer depended entirely on the memory or mood of a ruler.

Why it mattered: writing, cities and codified law became building blocks for almost every later state.`,
          },
          {
            id: 'lab-history.l03',
            title: 'Egypt and the Indus Valley',
            blurb: 'Two river civilizations, one built on monuments and one on careful planning.',
            minutes: 7,
            body: `Ancient Egypt grew along the Nile from about 3100 BCE, when its lands were unified, until 30 BCE. It is famous for its continuity: for roughly three thousand years it kept its pharaohs, its hieroglyphic writing, its solar calendar and its belief in the afterlife, including mummification. Its greatest monuments are the pyramids; the Great Pyramid of Khufu at Giza dates to about 2560 BCE.

Far to the east, the Indus Valley Civilisation flourished in South Asia from about 3300 to 1300 BCE. Its cities, such as Harappa and Mohenjo-daro, were laid out on grids, with sophisticated drainage and standardised weights for trade.

The two cultures show different strengths. Egypt left grand tombs and temples and a great deal of writing we can read. The Indus people left orderly cities, but their script has never been deciphered, so we cannot hear their own words about government or belief.

Historians therefore interpret the Indus world mainly from archaeology, and they stay cautious about claims such as who ruled or what people believed.

Why it mattered: together they show that early civilization took many forms, and that what survives shapes what we can know.`,
          },
        ],
      },
      {
        id: 'lab-history.t2',
        title: 'The Classical World',
        blurb: 'Empires and ideas that shaped Eurasia from about 800 BCE to 500 CE.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-history.l04',
            title: 'Ancient Greece',
            blurb: 'City-states that experimented with democracy, philosophy and drama.',
            minutes: 6,
            body: `Ancient Greece was not one country but a collection of independent city-states around the Mediterranean, active from about 800 to 146 BCE. Its hallmarks include democracy, philosophy, theatre, the Olympic Games and a classical style of architecture that is still copied today.

Athens developed a form of democracy in which citizens took part directly in decisions. It was limited, since many residents were not counted as citizens, but it was a bold experiment in shared rule.

Philosophy grew alongside it. Aristotle, who lived from 384 to 322 BCE, formalised logic and the syllogism, wrote on ethics, politics and metaphysics, and studied living things. He also tutored Alexander the Great, whose conquests spread Greek culture across a vast region.

Greek thinkers were not alone in this period. Confucius, who lived from 551 to 479 BCE, was shaping ideas about virtue and duty in China at about the same moment, which reminds us that the classical age produced great thinkers across Eurasia.

Why it mattered: Greek ideas about citizenship, reasoned argument and public art became models that later Western societies kept returning to, adapting and debating.`,
          },
          {
            id: 'lab-history.l05',
            title: 'Persia and the Mauryan Empire',
            blurb: 'Two vast empires, two different answers to ruling many peoples.',
            minutes: 7,
            body: `The Achaemenid Persian Empire, which lasted from 550 to 330 BCE, was the first great multinational empire, stretching across three continents under rulers such as Cyrus and Darius. To govern such a huge area it was divided into provinces called satrapies, and a long highway, the Royal Road, helped messages and officials travel. Persia is also remembered for a policy of religious tolerance, and for its ceremonial capital at Persepolis.

In South Asia, the Mauryan Empire reached its height under Ashoka, who ruled from about 268 to 232 BCE. His empire was the largest in Indian history up to that time. After the bloody Kalinga campaign, Ashoka is said to have turned away from war and embraced Buddhism and non-violence. He had moral edicts carved on rock and on tall stone pillars, and he helped spread Buddhism across Asia.

The sources for Ashoka are partly his own inscriptions, which show how he wished to be seen, so historians read them carefully rather than as a neutral record.

Why it mattered: both rulers show that large empires survived not only by force but by administration, roads and shared public messages.`,
          },
          {
            id: 'lab-history.l06',
            title: 'China from Shang to Qin',
            blurb: 'From oracle bones and bronze to the first emperor who unified the country.',
            minutes: 7,
            body: `Chinese civilization took shape under the Shang and Zhou dynasties, which together span about 1600 to 256 BCE. The Shang left oracle bone script, an early form of writing used in ritual questions, and fine bronze casting. The Zhou developed the idea of the Mandate of Heaven, the belief that rulers held power only while they governed well. Late in the period, the Hundred Schools of Thought flourished, and Confucius, who lived from 551 to 479 BCE, taught virtue, ritual and duty to family. His ideas later became central to Chinese education and statecraft.

In 221 BCE the king of Qin unified the warring states and became Qin Shi Huang, the First Emperor. He ruled until 210 BCE. He built a centralised bureaucracy and standardised writing, currency, weights and measures, so that one system worked across the whole empire. He also connected and extended northern defensive walls, and he was buried near an army of roughly 8,000 life-size terracotta soldiers.

Why it mattered: the idea of a single unified China, with common standards, outlasted the short-lived Qin dynasty itself.`,
          },
          {
            id: 'lab-history.l07',
            title: 'Rome: Republic to Empire',
            blurb: 'How a republic became an empire that shaped law, language and engineering.',
            minutes: 8,
            body: `Rome began as a republic and became an empire that unified the Mediterranean world. The empire proper dates from 27 BCE, and its western half lasted until 476 CE. Its legacies include Roman law, aqueducts and roads, concrete, disciplined legions and the Latin language.

Julius Caesar, who lived from 100 to 44 BCE, conquered Gaul, wrote an account of the campaign, and crossed the Rubicon river with his army in order to seize power. His rise ended the Republic in practice. He also reformed the calendar into the Julian system, a model for the calendar still in use. He was assassinated in 44 BCE.

In Egypt, Cleopatra VII ruled from 51 to 30 BCE. She was the last active ruler of Ptolemaic Egypt and handled the Roman civil wars through alliances with Caesar and later Antony. Her death in 30 BCE ended the Hellenistic kingdom of Egypt.

Many details of these lives come from Roman writers who were often hostile or partisan, so historians weigh them with care.

Why it mattered: Roman roads, law and Latin outlived the Western empire and became shared foundations for later European states.`,
          },
        ],
      },
      {
        id: 'lab-history.t3',
        title: 'Medieval Connections',
        blurb: 'After Rome fell in the West, new powers linked Europe, Asia and Africa.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-history.l08',
            title: 'After Rome: Byzantium, Islam and the Franks',
            blurb: 'Three heirs to the late Roman world went three different ways.',
            minutes: 8,
            body: `As Rome fell in the West, several powers rose from its shadow. The Byzantine Empire, the eastern Roman continuation, lasted from 330 to 1453 CE from its capital Constantinople. It built the Hagia Sophia, produced the Justinian Code of law, used the incendiary weapon called Greek fire, and preserved classical learning for a thousand years.

In the seventh century, Islam arose, and the caliphates that followed supported an Islamic Golden Age of science and philosophy. Ibn Sina, known in Europe as Avicenna, lived from about 980 to 1037. His Canon of Medicine became a medical encyclopedia used in Europe for centuries, and he blended Aristotle's thought with Islamic ideas.

In Western Europe, Charlemagne ruled the Franks from 768 to 814 and united much of the region. In the year 800 the Pope crowned him emperor. He also sponsored a revival of learning, script and the arts, sometimes called the Carolingian Renaissance.

Why it mattered: these three worlds traded, fought and borrowed from each other, and learning preserved in one often reached another.`,
          },
          {
            id: 'lab-history.l09',
            title: 'Mongols and the Great Travellers',
            blurb: 'A conquering empire opened roads, and travellers wrote what they saw.',
            minutes: 7,
            body: `Genghis Khan, who lived from about 1162 to 1227, unified the Mongol tribes and founded the largest contiguous land empire in history. His army was mobile and promoted people on merit, and a legal code called the Yassa governed his realm. After the conquests, a period of relative stability called the Pax Mongolica reopened Silk Road trade, so goods and ideas moved more freely across Eurasia.

Travellers took advantage of the connected world. Ibn Battuta, a Moroccan scholar who lived from 1304 to 1368, journeyed more than 70,000 miles across Africa, Asia and Europe and described his travels in the Rihla. In China, the admiral Zheng He, who lived from 1371 to 1433, led seven large naval expeditions across the Indian Ocean as far as East Africa and Arabia.

Connection also had a dark side. The Black Death swept the world between 1347 and 1351 and reshaped societies. Historians continue to debate details of how the plague spread, but trade routes were clearly part of the story.

Why it mattered: the medieval world was already deeply interconnected, for good and ill.`,
          },
          {
            id: 'lab-history.l10',
            title: 'Mali and Great Zimbabwe',
            blurb: 'Gold, learning and mortarless stone in medieval Africa.',
            minutes: 7,
            body: `The Mali Empire, which lasted from about 1235 to 1670 CE, was a vast West African state built on the trans-Saharan gold trade. Its greatest ruler, Mansa Musa, reigned from about 1312 to 1337 and expanded the empire. His pilgrimage to Mecca in 1324 was so lavish that it is said to have disrupted gold prices around the Mediterranean, and some people regard him as possibly the wealthiest individual in history. Mali also made Timbuktu a centre of Islamic scholarship, with the Djinguereber Mosque and the University of Sankore, and it kept alive the griot tradition of oral history.

Far to the south, Great Zimbabwe was a trading kingdom that flourished from about 1100 to 1450 CE. Its builders raised walls of granite without mortar. Its Great Enclosure and Conical Tower are among the greatest monuments of Africa, and its soapstone birds are famous. Gold and ivory trade and links to the Indian Ocean brought it wealth.

Why it mattered: both states show that medieval Africa had wealthy, literate and architecturally ambitious societies that took part in long-distance trade.`,
          },
        ],
      },
      {
        id: 'lab-history.t4',
        title: 'The Modern World',
        blurb: 'Print, oceans, revolutions and the struggles for freedom.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-history.l11',
            title: 'Print, Renaissance and Reformation',
            blurb: 'New technology and new ideas changed how Europe thought.',
            minutes: 7,
            body: `Around the middle of the fifteenth century, Johannes Gutenberg, who lived from about 1400 to 1468, developed practical movable-type printing in Europe. His press made it possible to produce books in large numbers, and his Bible is the best known early product. Print spread ideas faster than copying by hand ever could.

The Renaissance revived interest in classical learning and the study of nature. Leonardo da Vinci, who lived from 1452 to 1519, joined painting with anatomy and engineering and filled notebooks with inventions. Michelangelo, who lived from 1475 to 1564, sculpted the David and the Pieta and painted the Sistine Chapel ceiling.

In 1517 Martin Luther, a German reformer, challenged the sale of indulgences in his Ninety-five Theses. Printing helped his writings travel widely, and his German translation of the Bible made scripture available in the language ordinary people spoke. The result was a split in Western Christianity, the Protestant Reformation.

Why it mattered: the printing press showed how a communication technology could reshape religion, science and politics all at once.`,
          },
          {
            id: 'lab-history.l12',
            title: 'Oceans Connect the World',
            blurb: 'Voyages after 1450 joined the hemispheres, with enormous consequences.',
            minutes: 8,
            body: `In the fifteenth and sixteenth centuries, navigators crossed oceans on a new scale. Earlier, the Chinese admiral Zheng He had led great fleets across the Indian Ocean. Then, after Constantinople fell to the Ottomans in 1453, European states searched for sea routes of their own.

In 1492 Christopher Columbus, a Genoese navigator sailing for the Spanish crown, crossed the Atlantic and opened sustained contact between Europe and the Americas. His voyages continued until 1504. Between 1519 and 1522 an expedition led by Ferdinand Magellan achieved the first circumnavigation of the globe; Magellan himself died in 1521 before it ended. He found the strait linking the Atlantic and Pacific and gave the Pacific its name.

These voyages set off the Columbian Exchange, the movement of plants, animals, goods and diseases between the hemispheres. They also fed the Atlantic slave trade, one of history's gravest injustices. Indigenous peoples of the Americas experienced these events as invasion and catastrophe, and historians today consider their perspectives alongside those of the voyagers.

Why it mattered: 1492 and its aftermath began a truly global history, with benefits and suffering unevenly shared.`,
          },
          {
            id: 'lab-history.l13',
            title: 'The Age of Revolutions',
            blurb: 'Enlightenment ideals turned into revolts from Philadelphia to Port-au-Prince.',
            minutes: 7,
            body: `Between roughly 1750 and 1850, ideas from the Enlightenment about liberty, reason and rights inspired political revolutions. The American Revolution began in 1776, the French Revolution in 1789, and the Haitian Revolution ran from 1791 to 1804. Latin American independence wars followed.

George Washington led the Continental Army to independence and later set the precedent of peaceful transfer of power. In Haiti, Toussaint Louverture, who lived from about 1743 to 1803, led formerly enslaved people against colonial powers, and the movement he built created Haiti, the first Black republic. His Constitution of 1801 was part of that struggle.

In South America, Simon Bolivar, who lived from 1783 to 1830, led independence wars against Spanish rule and helped free six nations. He is called El Libertador, and Bolivia is named after him.

These revolutions also shared tensions. Many proclaimed equality while excluding some groups, and historians debate how fully the ideals matched the results.

Why it mattered: constitutions, declarations of rights, abolition movements and modern nationalism all grew from this period.`,
          },
          {
            id: 'lab-history.l14',
            title: 'War, Empire and Freedom',
            blurb: 'Industry, world wars and the movements that ended empire and apartheid.',
            minutes: 9,
            body: `From about 1760 to 1914, steam, coal, steel and electricity remade the world. Railways and telegraphs shrank distances, while industrial powers expanded their empires; the Berlin Conference of 1884 to 1885 is a symbol of the Scramble for Africa.

The twentieth century brought two world wars. World War I lasted from 1914 to 1918, the Russian Revolution came in 1917, and World War II lasted from 1939 to 1945. Industrialised warfare, the Holocaust and the atomic bombings of Hiroshima and Nagasaki killed on an unprecedented scale. The United Nations was founded at the end of the war.

Afterwards, empires gave way to dozens of new nations. Mahatma Gandhi, who lived from 1869 to 1948, pioneered mass nonviolent civil disobedience, including the Salt March, and led India to independence from British rule. Nelson Mandela spent 27 years in prison for resisting apartheid and became South Africa's first democratically elected president, promoting reconciliation. The Berlin Wall fell in 1989, ending a symbol of the Cold War.

Why it mattered: modern human rights and global institutions grew from reaction to the century's catastrophes.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-history',
    questions: [
      ...mk('lab-history.l01', [
        [1, 'What is the Neolithic Revolution?', 'The invention of farming and the domestication of plants and animals', ['The spread of written law codes carved onto tall stone pillars in many cities', 'The first use of bronze', 'The unification of Egypt under one king'], 1, 'It is named for a change in how people got food.', 'The Neolithic revolution, around 10,000 BCE, was the shift to farming and domestication, which let people settle in one place.'],
        [1, 'Which pair are early permanent settlements?', 'Catalhoyuk and Jericho', ['Athens and Sparta in classical Greece', 'Giza and Memphis beside the Nile', 'Tenochtitlan and Cusco in the Americas'], 2, 'Think of very early villages, not later empires.', 'Catalhoyuk and Jericho are named as the first permanent settlements of the farming era.'],
        [2, 'What was a major effect of farming surpluses?', 'Permanent villages and the first inequalities of wealth and power', ['The immediate invention of printing', 'The end of all tool-making', 'A return to constant migration'], 0, 'A surplus means more food than needed right away.', 'Surplus food allowed villages to grow and let some people gain more wealth and power than others.'],
        [3, 'Why do historians rely on objects and art to study prehistory?', 'Writing had not yet been invented, so there are no written records', ['Prehistoric people refused to make records', 'All written records from the period were destroyed', 'Objects are always more accurate than texts'], 3, 'The word itself says what is missing.', 'Prehistory is defined as the time before writing, so evidence comes from tools, bones, settlements and art.'],
      ]),
      ...mk('lab-history.l02', [
        [1, 'Which two rivers framed Mesopotamia?', 'The Tigris and the Euphrates', ['The Nile and the Congo', 'The Indus and the Ganges', 'The Yellow and the Yangtze'], 0, 'Mesopotamia means the land between rivers.', 'Mesopotamia lay between the Tigris and Euphrates in the Fertile Crescent.'],
        [1, 'How many laws were inscribed on Hammurabi\'s stele?', '282', ['100', '12', '613'], 2, 'It is a number a little under 300.', 'The Code of Hammurabi is described as 282 laws on a diorite stele.'],
        [2, 'Which came first?', 'Hammurabi\'s reign (about 1792-1750 BCE)', ['Athenian democracy under Pericles in the fifth century BCE', 'The Roman Empire under Augustus and his heirs', 'The reign of Qin Shi Huang, the First Emperor'], 1, 'Compare the dates, not the fame.', 'Hammurabi ruled in the eighteenth century BCE, long before the Greek, Roman and Qin examples.'],
        [3, 'Why was displaying written laws publicly significant?', 'People could know the rules, so law did not depend only on a ruler\'s private word', ['It made every law gentler', 'It proved that all citizens were equal under the law and ended class distinctions', 'It removed the need for a king'], 3, 'Think about what changes when a rule is visible.', 'Public written law makes rules known and more consistent, which is the lasting importance of the code, whatever its harshness.'],
      ]),
      ...mk('lab-history.l03', [
        [1, 'Along which river did Ancient Egypt develop?', 'The Nile', ['The Tigris', 'The Indus', 'The Euphrates'], 2, 'It runs north through the desert.', 'Ancient Egypt grew in the Nile Valley.'],
        [1, 'Which cities belonged to the Indus Valley Civilisation?', 'Harappa and Mohenjo-daro', ['Thebes and Memphis', 'Babylon and Ur', 'Knossos and Troy'], 0, 'One of them gave the culture its alternate name.', 'Harappa and Mohenjo-daro were major Indus cities, known for grid planning and drainage.'],
        [2, 'Grid-planned streets and standardised weights suggest the Indus cities had what?', 'Organised planning and coordination', ['No trade at all', 'Rule by a single pharaoh', 'A deciphered written law code'], 1, 'Think about what planning requires.', 'Planned cities and standard weights point to organisation, although exactly who organised them is uncertain.'],
        [3, 'Why must historians be cautious about Indus beliefs and rulers?', 'The Indus script is undeciphered, so we lack their own written explanations', ['The Indus left no buildings', 'Egyptian sources contradict them completely', 'Their cities were never excavated'], 3, 'Consider what kind of evidence is missing.', 'Without a deciphered script, knowledge comes mainly from archaeology, so claims about rulers and belief remain tentative.'],
      ]),
      ...mk('lab-history.l04', [
        [1, 'Which philosopher tutored Alexander the Great?', 'Aristotle', ['Confucius the sage', 'Augustine of Hippo', 'Ibn Sina of Bukhara'], 3, 'He formalised logic and the syllogism.', 'Aristotle (384-322 BCE) tutored Alexander the Great.'],
        [1, 'Which of these is a hallmark of Ancient Greece?', 'Democracy', ['Quipu records', 'Ziggurat temples', 'Hieroglyph writing'], 1, 'Think of the city of Athens.', 'Democracy, philosophy, theatre and the Olympic Games are listed hallmarks of Greece.'],
        [2, 'Who lived earlier?', 'Confucius (551-479 BCE)', ['Aristotle, tutor of Alexander (384-322 BCE)', 'Julius Caesar, the general (100-44 BCE)', 'Charlemagne, the Frankish king (reigned 768-814)'], 2, 'Remember BCE dates count down.', 'Confucius lived in the sixth and fifth centuries BCE, earlier than Aristotle.'],
        [3, 'Why is Greek influence on later Western societies so strong?', 'Its ideas in politics, philosophy and drama became models later societies adapted', ['Greek armies ruled Europe until 1900', 'Greece invented writing', 'All later states copied Athens exactly'], 1, 'Think of ideas rather than armies.', 'Greek democracy, reasoned argument and theatre gave later Western societies models to adapt and debate.'],
      ]),
      ...mk('lab-history.l05', [
        [1, 'Which empire built the Royal Road and divided its land into satrapies?', 'Achaemenid Persia', ['The Mauryan Empire of India', 'The Aztec Empire in Mexico', 'The Khmer Empire of Cambodia'], 0, 'It stretched across three continents.', 'The Achaemenid Persian Empire used satrapies and the Royal Road to govern.'],
        [1, 'After which campaign did Ashoka renounce war?', 'The Kalinga campaign', ['The Gallic Wars led by Julius Caesar', 'The siege of Troy in the Aegean world', 'The Salt March led by Mahatma Gandhi'], 3, 'It is named for a region of India.', 'Ashoka turned from war after the Kalinga campaign and embraced Buddhism.'],
        [2, 'How did Persia govern a huge, varied empire?', 'Through provinces called satrapies linked by the Royal Road', ['By a single city-state council', 'By rule only through the army without officials', 'By banning all other religions'], 1, 'Think of provinces and a highway.', 'Satrapies delegated rule to regional governors while the Royal Road kept the empire connected.'],
        [3, 'What do Persian tolerance and Ashoka\'s edicts share as strategies?', 'Both used public moral or religious policy to help hold diverse peoples together', ['Both relied only on conquest', 'Both created democracy', 'Both abolished all taxes'], 2, 'Look at how each ruler addressed different peoples.', 'The sources describe Persian religious tolerance and Ashoka\'s moral edicts as ways of managing diverse populations, though historians weigh how fully they worked.'],
      ]),
      ...mk('lab-history.l06', [
        [1, 'What title did Qin Shi Huang take after 221 BCE?', 'First Emperor of China', ['Great Khan of all the Mongols', 'Pharaoh', 'Sultan'], 1, 'He was the first to hold it.', 'Qin Shi Huang unified China in 221 BCE and became its First Emperor.'],
        [1, 'About how many figures make up the Terracotta Army?', 'About 8,000', ['About 80', 'About 800,000', 'Exactly 1,000'], 3, 'It is in the thousands.', 'The Terracotta Army has roughly 8,000 life-size figures.'],
        [2, 'Which came first?', 'The Shang dynasty (from about 1600 BCE)', ['Qin unification of the warring states (221 BCE)', 'The death of Confucius in the fifth century (479 BCE)', 'The end of the Zhou dynasty and its many kingdoms (256 BCE)'], 0, 'Shang is the earliest listed dynasty.', 'The Shang began about 1600 BCE, long before Confucius and Qin.'],
        [3, 'Why would standardising writing and measures help hold an empire together?', 'People in different regions could trade, administer and communicate the same way', ['It made all languages identical', 'It removed the need for officials', 'It ended all local customs overnight'], 2, 'Think about trading across many regions.', 'Common standards reduced friction in trade and government across regions, which is why the idea outlasted Qin itself.'],
      ]),
      ...mk('lab-history.l07', [
        [1, 'Which calendar did Julius Caesar introduce?', 'The Julian calendar', ['The Long Count calendar', 'The Gregorian calendar', 'The lunar Maya calendar'], 3, 'His name appears in it.', 'Caesar reformed the calendar into the Julian system.'],
        [1, 'What ended with Cleopatra\'s death in 30 BCE?', 'Hellenistic (Ptolemaic) Egypt', ['The Roman Republic', 'The Persian Empire founded by Cyrus the Great', 'The Han dynasty'], 1, 'She was the last active ruler of her dynasty.', 'Cleopatra VII was the last active ruler of Ptolemaic Egypt.'],
        [2, 'Which came first?', 'Caesar\'s death (44 BCE)', ['The start of the Roman Empire (27 BCE)', 'Fall of the Western Empire (476)', 'Cleopatra\'s death (30 BCE)'], 0, 'Compare the years carefully.', 'Caesar died in 44 BCE, before the empire proper began in 27 BCE.'],
        [3, 'Why did Roman law, roads and Latin matter after 476?', 'They became shared foundations that later European societies inherited', ['They were entirely forgotten', 'They were banned by later kings', 'They only mattered in Italy'], 2, 'Think of what outlives a government.', 'Law, language and engineering survived the Western empire and shaped later European states.'],
      ]),
      ...mk('lab-history.l08', [
        [1, 'In what year did the Byzantine Empire end?', '1453', ['476', '1066', '1517'], 1, 'It is the fall of Constantinople.', 'The Byzantine Empire lasted from 330 to 1453 CE.'],
        [1, 'When was Charlemagne crowned emperor by the Pope?', '800', ['476', '1000', '1453'], 3, 'It is a round number near the start of the ninth century.', 'Charlemagne was crowned in the year 800.'],
        [2, 'Which ended first?', 'The Western Roman Empire (476)', ['The Byzantine Empire (1453)', 'The end of Charlemagne\'s reign (814)', 'Ibn Sina\'s death (1037)'], 0, 'The text says Rome fell in the West first.', 'The West fell in 476, nearly a thousand years before Constantinople fell.'],
        [3, 'What was a lasting benefit of Byzantine and Islamic scholarship?', 'Classical knowledge survived and reached later scholars, including in Europe', ['It stopped all scientific thought', 'It replaced all earlier languages', 'It ended trade between regions'], 2, 'Think about how the Canon of Medicine travelled.', 'Byzantine preservation and Islamic scholarship, such as Ibn Sina\'s Canon used in Europe, kept knowledge alive and moving.'],
      ]),
      ...mk('lab-history.l09', [
        [1, 'What did the Pax Mongolica reopen?', 'Silk Road trade', ['The Royal Road', 'Atlantic shipping', 'The Nile trade'], 1, 'Think of the great overland route.', 'The Pax Mongolica reopened Silk Road trade across Eurasia.'],
        [1, 'What is the name of Ibn Battuta\'s travelogue?', 'The Rihla', ['The Analects', 'The Canon of Medicine', 'The Commentarii'], 3, 'It is a short Arabic title.', 'Ibn Battuta recorded his journeys in the Rihla.'],
        [2, 'Which traveller lived earlier?', 'Ibn Battuta (1304-1368)', ['Zheng He, the admiral (1371-1433)', 'Columbus, the navigator (1451-1506)', 'Magellan, the explorer (c.1480-1521)'], 0, 'Compare birth years.', 'Ibn Battuta lived 1304-1368, before Zheng He and the later explorers.'],
        [3, 'What does the link between connected trade and the Black Death suggest?', 'Connections can carry goods and ideas but also disease along the same routes', ['Trade never affects health', 'Only Europe was affected', 'Plague began after the Mongols vanished'], 2, 'Think about what travels with merchants.', 'Historians see the same networks that moved goods as part of how the plague spread, though they debate details.'],
      ]),
      ...mk('lab-history.l10', [
        [1, 'In which year did Mansa Musa make his famous pilgrimage to Mecca?', '1324', ['1066', '1492', '1235'], 1, 'It is in the early fourteenth century.', 'Mansa Musa\'s hajj in 1324 is said to have disrupted Mediterranean gold prices.'],
        [1, 'How was Great Zimbabwe built?', 'With mortarless dry-stone granite walls', ['With baked clay bricks set in lime cement mortar', 'Only with timber', 'With volcanic concrete'], 3, 'The key word is "mortarless".', 'Great Zimbabwe\'s walls were laid without mortar.'],
        [2, 'What was the main source of Mali\'s wealth?', 'The trans-Saharan gold trade', ['Silk exports across the Silk Road to China', 'Sea-borne spice shipping across the Indian Ocean', 'Selling printed books to European merchants'], 0, 'Think of what crossed the Sahara.', 'Mali\'s wealth rested on trans-Saharan gold trade.'],
        [3, 'What do Great Zimbabwe\'s Indian Ocean trade links show?', 'A southern African kingdom took part in long-distance trade networks', ['Southern Africa was isolated', 'Trade only existed in Europe', 'The kingdom had no stone architecture'], 2, 'Think about gold, ivory and ports.', 'Gold and ivory trade tied Great Zimbabwe into wider networks that reached the Indian Ocean.'],
      ]),
      ...mk('lab-history.l11', [
        [1, 'Who painted the Sistine Chapel ceiling?', 'Michelangelo', ['Leonardo da Vinci the painter', 'Johannes Gutenberg the printer', 'Martin Luther the reformer'], 1, 'He also sculpted the David.', 'Michelangelo painted the Sistine Chapel ceiling.'],
        [1, 'In what year did Luther issue his Ninety-five Theses?', '1517', ['1453', '1492', '1776'], 3, 'It is early in the sixteenth century.', 'Luther challenged the sale of indulgences in 1517.'],
        [2, 'How did the printing press help the Reformation?', 'Cheap printed copies let ideas and vernacular scripture spread quickly', ['It banned the Latin Bible', 'It made handwriting illegal', 'It ended the Renaissance by making every book unavailable to ordinary readers'], 0, 'Think about copying speed.', 'Print allowed Luther\'s writings and his German Bible to reach many readers.'],
        [3, 'Leonardo joined art with anatomy and engineering. What does this show about the Renaissance?', 'Art, observation and science were seen as connected', ['Art was forbidden from using science', 'Only religion mattered', 'Inventors had no patrons and no workshops anywhere in Europe'], 2, 'Think about how he worked.', 'Leonardo is an archetype of a period that prized observation and linked arts with study of nature.'],
      ]),
      ...mk('lab-history.l12', [
        [1, 'In what year did Columbus cross the Atlantic on his first voyage?', '1492', ['1453', '1519', '1517'], 1, 'The year rhymes in a famous poem.', 'Columbus crossed the Atlantic in 1492 under the Spanish crown.'],
        [1, 'Whose expedition completed the first circumnavigation (1519-1522)?', 'Ferdinand Magellan\'s', ['Zheng He\'s', 'The Moroccan traveller Ibn Battuta\'s', 'Columbus\'s'], 0, 'He named the Pacific Ocean.', 'The expedition begun by Magellan achieved the first circumnavigation, though he died in 1521.'],
        [2, 'Which came first?', 'Zheng He\'s life and voyages (1371-1433)', ['Columbus\'s 1492 voyage', 'Magellan\'s circumnavigation', 'The Columbian Exchange of plants, animals and diseases'], 3, 'Compare the lifespans.', 'Zheng He lived 1371-1433, so his fleets crossed the Indian Ocean before Columbus sailed.'],
        [3, 'What does it show that voyages launched both the Columbian Exchange and the Atlantic slave trade?', 'Contact brought exchange but also immense suffering and upheaval', ['Contact was beneficial for everyone', 'Only plants were exchanged, and no animals, goods or diseases ever crossed', 'Contact had no lasting effects'], 2, 'Think about who benefited and who suffered.', 'The exchange of goods and species went with disease, conquest and slavery, so the consequences were mixed and contested.'],
      ]),
      ...mk('lab-history.l13', [
        [1, 'Who led the Haitian Revolution to create the first Black republic?', 'Toussaint Louverture', ['Simon Bolivar', 'George Washington', 'Napoleon Bonaparte of France'], 0, 'He led formerly enslaved people.', 'Toussaint Louverture led the movement that created Haiti.'],
        [1, 'What is Simon Bolivar called?', 'El Libertador', ['The Great Khan', 'The Sun King', 'The Lawgiver'], 1, 'The title means "the liberator".', 'Bolivar is called El Libertador and Bolivia is named for him.'],
        [2, 'Which came first?', 'The American Revolution (1776)', ['The French Revolution (1789)', 'The Haitian Revolution (1791)', 'Latin American independence wars'], 3, 'Compare 1776 with the others.', 'The American Revolution began in 1776, before the others began.'],
        [3, 'What did these revolutions share?', 'Enlightenment ideas of liberty and rights, though results fell short of the ideals for some', ['A shared monarch', 'The same constitution', 'A single leader'], 2, 'Look at the ideas behind them.', 'Enlightenment ideals inspired them, and historians debate how fully the outcomes matched those ideals.'],
      ]),
      ...mk('lab-history.l14', [
        [1, 'In what year did the Berlin Wall fall?', '1989', ['1945', '1917', '1914'], 1, 'It is near the end of the Cold War.', 'The Berlin Wall fell in 1989.'],
        [1, 'How many years was Nelson Mandela imprisoned?', '27', ['7', '14', '40'], 3, 'It is between 25 and 30.', 'Mandela endured 27 years of imprisonment for resisting apartheid.'],
        [2, 'Which event came first?', 'The Russian Revolution (1917)', ['The founding of the UN (1945)', 'The atomic bombings (1945)', 'The fall of the Berlin Wall (1989)'], 0, 'It happened during the first world war.', 'The Russian Revolution of 1917 came before the 1945 events and 1989.'],
        [3, 'What did Gandhi and Mandela have in common?', 'Both led struggles against systems of imposed rule and inspired people worldwide', ['Both served as British officials', 'Both led large armies of conquest that seized and held foreign territory by force', 'Both were founders of the UN'], 2, 'Think about what each opposed.', 'Gandhi opposed British rule in India and Mandela opposed apartheid; both became global symbols of freedom movements.'],
      ]),
    ],
  },
};
