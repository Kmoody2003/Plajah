import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target; // correct choice starts at index 0
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L = (n: number) => `history-south-america.l${String(n).padStart(2, '0')}`;
const L01 = L(1), L02 = L(2), L03 = L(3), L04 = L(4), L05 = L(5), L06 = L(6), L07 = L(7);
const L08 = L(8), L09 = L(9), L10 = L(10), L11 = L(11), L12 = L(12), L13 = L(13), L14 = L(14);
const L15 = L(15), L16 = L(16), L17 = L(17), L18 = L(18), L19 = L(19), L20 = L(20), L21 = L(21);
const L22 = L(22), L23 = L(23), L24 = L(24), L25 = L(25), L26 = L(26), L27 = L(27), L28 = L(28);

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'history-south-america',
    label: 'History of South America and Latin America',
    blurb: 'From Caral and the Inca to conquest, colonial rule, independence, dictatorship and democracy: a balanced history of South America and the wider Latin American world, with attention to Indigenous, African-descended and settler experiences.',
    accent: '#06D6A0',
    framework: 'c3',
    tracks: [
      {
        id: 'history-south-america.t1',
        title: 'Peoples and Societies Before Contact',
        blurb: 'The Andes, the Amazon, the far south and Mesoamerica before Europeans arrived, and how we know about them.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'A Land of Mountains, Forests and Coasts',
            blurb: 'Geography shaped how people lived in the Americas long before 1492, and archaeology and oral tradition are our main guides.',
            minutes: 6,
            body: `South America is a continent of extremes. Along its western edge run the Andes, one of the longest mountain chains on Earth. East of them lies the Amazon basin, a vast river system with rainforest. Further south and east are grasslands, dry plateaus and cold, windy lands near the tip of the continent. Along the Pacific coast, one of the driest deserts in the world sits between the ocean and the mountains, cut by rivers that flow down from the highlands.

People have lived in these places for a very long time. Most scholars agree that humans reached the Americas from Asia many thousands of years ago, though the exact dates and routes are still debated. Over time, communities learned to farm potatoes, maize, quinoa and many other crops, to herd llamas and alpacas in the highlands, and to fish and farm along the coast.

How do we know about people who left little written history? Historians rely on several kinds of evidence. Archaeologists dig up cities, tombs, tools and pottery. Scientists study seeds, bones and climate records. Spanish and Portuguese writers recorded what they saw and were told after 1492, but they had their own aims and biases. And Indigenous communities keep oral traditions, songs and place names that carry memory forward.

Here is a worked example. Many Andean societies did not use a writing system like the alphabet. The Inca kept records with the quipu, a set of knotted cords. Scholars agree that quipus recorded numbers; whether some also encoded stories or names is still debated. That uncertainty is a good reminder that history is built from evidence that can be read in more than one way.`,
          },
          {
            id: L02,
            title: 'Caral, Chavín, Moche and Nazca',
            blurb: 'Long before the Inca, a series of Andean societies built monuments, trade networks and distinctive art.',
            minutes: 7,
            body: `The Inca were late arrivals in a very old story. On the coast of Peru, in the Supe valley, lie the remains of Caral, a city with large platform mounds and plazas. Archaeologists generally date it to around 3000 to 1800 BCE, which makes it one of the oldest known urban centres in the Americas. Its builders did not, as far as we know, make pottery, and how they organised their society is still being studied.

Much later, in the northern highlands, the temple of Chavín de Huántar became a religious centre, flourishing roughly between 900 and 200 BCE. Its stone carvings of fanged figures and animals, and its underground galleries, spread an artistic style across much of what is now Peru. Scholars debate how much political power Chavín held compared with its religious influence.

On the north coast, the Moche (roughly 100 to 700 CE) built adobe pyramids and made realistic pottery that shows people, animals and ritual scenes. Their lords were buried with gold, silver and copper ornaments; the tomb of the Lord of Sipán was found in 1987 and revealed this wealth.

On the dry south coast, the Nazca (roughly 100 BCE to 800 CE) painted fine pottery and drew giant figures and lines in the desert floor, the Nazca Lines. Their purpose is debated, with ritual, water and pilgrimage among the ideas scholars discuss. The Nazca also built underground channels called puquios to bring water to farms.

Worked example: a Moche pot shaped like a human face lets us see how people looked and dressed, but we must be careful, because we do not know every reason it was made.`,
          },
          {
            id: L03,
            title: 'Tiwanaku, Wari and the Inca Empire',
            blurb: 'The Inca built the largest empire in the Americas in about a century, using roads, records and labour service.',
            minutes: 8,
            body: `Around 500 to 1000 CE, two large powers shaped the Andes. Tiwanaku, near Lake Titicaca in what is now Bolivia, was a ceremonial and political centre with monumental stonework. Wari, in the central Peruvian highlands, built administrative sites and roads. Their relationship is still studied, and both declined before the rise of the Inca.

The Inca were originally a people based around Cusco. According to later accounts, which scholars treat carefully, a major expansion began around the 1430s under a ruler called Pachacuti. At its height the empire was called Tawantinsuyu, often translated as the four parts together, and stretched along the Andes from what is now Ecuador to central Chile.

How did the Inca rule so much territory without a written alphabet or wheeled carts? They built a vast network of roads, with way stations and rope bridges, and relayed messages by runners. They used quipus to keep records of people, goods and storehouse contents. Many conquered peoples were required to serve through the mit'a, a rotating labour obligation to the state, and the state stored food and cloth in warehouses. Some communities were moved elsewhere, and local rulers were often kept in place if they accepted Inca authority.

The empire was powerful but not free of conflict: many peoples were conquered by force and some rebelled. A good student question is how much the Inca depended on cooperation rather than only conquest. The evidence points to both, and that mix helps explain what happened when the Spanish arrived.`,
          },
          {
            id: L04,
            title: 'Amazonia, the Tupi-Guarani and the Mapuche',
            blurb: 'Outside the Inca heartland, the Amazon basin and the far south were home to many diverse societies.',
            minutes: 7,
            body: `Not everyone in South America lived under the Inca. The Amazon basin held many peoples with different languages and ways of life. Archaeologists have found evidence of earthworks and areas of dark, fertile soil called terra preta, created by long human use. These finds suggest that people shaped the forest in lasting ways. How large the Amazonian population was before 1500 is debated, and estimates differ widely.

Along the Atlantic coast of what is now Brazil lived many Tupi-speaking peoples. Related Guarani-speaking peoples lived further south and inland, in areas of what is now Paraguay and neighbouring countries. Their languages are from the same family, and their villages combined farming (including manioc, or cassava), hunting and fishing. When Portuguese ships arrived in 1500, they met Tupi peoples first, and some groups traded with, fought, or allied with Europeans in the following decades.

In the south of what is now Chile and Argentina, the Mapuche, whose name is often translated as people of the land, lived in scattered farming communities without a single king. They resisted the Inca, who did not conquer their southern territory, and they later fought the Spanish in the long Arauco War. Spanish forces had notable early successes but struggled to hold the region, and the Mapuche kept a large measure of independence until Chile and Argentina moved against them in the nineteenth century.

Worked example: the Mapuche show that a society with no centralised state could still organise effective defence. The size of an empire is not the only measure of strength.`,
          },
          {
            id: L05,
            title: 'Mesoamerica and the Caribbean: Context for Latin America',
            blurb: 'Maya cities, the Mexica of Tenochtitlan and the Taino of the Caribbean were part of the same larger story.',
            minutes: 7,
            body: `Latin America is wider than South America. To the north, in Mesoamerica, other long-established societies met the Europeans first. The Maya built cities with pyramids and observatories, and developed a writing system that scholars have now largely deciphered. Their classic period of great city-states is usually dated to about 250 to 900 CE, but Maya peoples never disappeared: millions of their descendants live in Mexico and Central America today.

In the central valley of Mexico, the Mexica (often called the Aztecs) were based in Tenochtitlan, a city built on an island in a lake. According to tradition it was founded around 1325. In 1428 Tenochtitlan joined with two neighbouring cities in what is called the Triple Alliance, which grew into a large tribute empire. Many subject peoples paid tribute and resented it, a fact that mattered after 1519.

In the Caribbean islands lived the Taino, an Arawak-speaking people who farmed, fished and had chiefdoms led by leaders called caciques. They were the first Indigenous people Columbus met in 1492. Their words, such as hammock and canoe, entered European languages, and their descendants and cultural heritage are still discussed and celebrated in the Caribbean today.

A key point for later lessons: the Americas were not empty or uniform. They held empires, small villages, cities and wanderers, each with its own history. When Europeans arrived, they met many different societies and often took advantage of existing rivalries among them.`,
          },
        ],
      },
      {
        id: 'history-south-america.t2',
        title: 'Conquest and Catastrophe',
        blurb: 'Columbus, Cortés, Pizarro, Portugal in Brazil, and the epidemics that reshaped the Americas.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L06,
            title: 'Columbus, the Caribbean and the Division of the World',
            blurb: 'Spanish voyages after 1492 began colonisation in the Caribbean, and Spain and Portugal divided their claims by treaty.',
            minutes: 6,
            body: `In October 1492 Christopher Columbus, sailing for the Spanish crown, reached islands in the Caribbean, in the area of the Bahamas. He had hoped to find a western sea route to Asia, and he never fully accepted that he had reached a landmass new to Europeans. Later voyages brought settlers, soldiers and priests to islands such as Hispaniola.

The Spanish quickly began demanding gold and labour from the Taino. They set up systems of forced labour, and the local population fell sharply in the following decades. Violence, enslavement and, above all, new diseases brought by Europeans were the main causes. Some Spaniards protested the cruelty, including the friar Bartolomé de las Casas, who became a famous critic.

Spain and Portugal, rivals in exploration, signed the Treaty of Tordesillas in 1494. It drew a line in the Atlantic: lands to the west were for Spain to claim, and lands to the east for Portugal. This agreement, backed by the pope, ignored the people who already lived in these lands. The line later helped explain why Portuguese ships that reached Brazil in 1500 under Pedro Álvares Cabral could claim it, while most of the rest of Latin America came under Spain.

Worked example: because of the Treaty of Tordesillas, most of Latin America speaks Spanish while Brazil speaks Portuguese. A diplomatic bargain in 1494 left a mark that is still visible on language maps.`,
          },
          {
            id: L07,
            title: 'Cortés and the Fall of Tenochtitlan',
            blurb: 'A small Spanish force overthrew the Mexica empire in 1519 to 1521 with the help of many Indigenous allies and the spread of disease.',
            minutes: 7,
            body: `In 1519 Hernán Cortés led a Spanish expedition from Cuba to the coast of Mexico. He had only a few hundred men, some horses and some cannon. Yet within about two years the great Mexica capital of Tenochtitlan fell, in August 1521. How could this happen?

The old story that a handful of Spaniards defeated an empire by courage and technology alone is misleading. Several factors worked together. First, Cortés gained many Indigenous allies. The Tlaxcalans, who had long resisted the Mexica, joined him, along with other peoples who resented paying tribute to Tenochtitlan. Many thousands of allied warriors took part in the final siege. Second, Cortés had translators, including a woman known as Malintzin or Doña Marina, who spoke Nahuatl and Maya and helped him negotiate. Third, a smallpox epidemic struck Tenochtitlan around 1520, killing many people and weakening the defenders.

The Mexica ruler Moctezuma II died during the conflict, and accounts disagree on exactly how. The Mexica fought hard, and the city suffered terribly in the siege. After 1521 the Spanish built Mexico City on the ruins and the region became the viceroyalty of New Spain.

The best reading is that conquest was not a single event but a combination of alliance, disease and violence, and that Indigenous people took part on both sides. Their choices, shaped by their own politics, were an important part of the story.`,
          },
          {
            id: L08,
            title: 'Pizarro, Cajamarca and the End of the Inca State',
            blurb: 'A civil war and disease had weakened the Inca when Pizarro arrived, but resistance lasted for decades.',
            minutes: 8,
            body: `Francisco Pizarro, a Spanish soldier, reached Inca territory in 1532 with a small force after earlier voyages along the Pacific coast. The Inca empire was then in turmoil. The ruler Huayna Capac had died, probably around 1527, possibly of an epidemic that spread ahead of the Spanish. Two of his sons, Huáscar and Atahualpa, fought a civil war for the throne, and Atahualpa had recently won.

At Cajamarca in November 1532, Pizarro's men captured Atahualpa in a surprise attack, killing many of his unarmed attendants. Atahualpa offered a huge ransom of gold and silver, but the Spanish executed him in 1533. They then marched to Cusco. As in Mexico, Spanish success depended on more than weapons: some peoples who had been conquered by the Inca sometimes allied with the invaders, and Inca divisions made a united response hard.

Conquest did not end all resistance. A rebel Inca state, sometimes called the Neo-Inca state, held out in the mountains of Vilcabamba for decades. It ended in 1572, when the Spanish captured and executed its last ruler, Túpac Amaru. The Spaniards also fought each other over the spoils, and civil wars among the conquerors lasted into the 1540s.

Worked example: the key lesson is how timing mattered. Because the Inca were already divided, a very small force could exploit a crisis. It was not an inevitable outcome.`,
          },
          {
            id: L09,
            title: 'Epidemics and the Demographic Collapse',
            blurb: 'Old World diseases killed a large share of Indigenous people in the Americas, though exact numbers are debated.',
            minutes: 7,
            body: `Perhaps the most devastating force in the early colonial period was not a weapon but a germ. Europeans and Africans carried diseases such as smallpox and measles, which were new to the Americas. Indigenous populations had no prior exposure and so had little immunity. Outbreaks spread fast, often ahead of the Spanish and Portuguese themselves.

How many people died? Scholars agree the loss was catastrophic, but the numbers are heavily debated. We have no census from before contact, so historians estimate from tribute records, church records and archaeology. Their estimates of the pre-contact population of the Americas range very widely, from several million to many tens of millions. For many regions, most scholars accept that the population fell by a very large share, often a majority, within a century or so. In the Caribbean, the Taino declined to very small numbers within decades.

Disease was not the only cause. War, forced labour, hunger caused by disrupted farming, enslavement and the destruction of communities worsened the impact. The colonisers did not understand germs, and some later writers called the deaths a natural event, but the way colonial systems moved and exploited people made the toll greater.

The collapse reshaped the continent. With fewer Indigenous workers, colonisers turned to other labour sources, including enslaved Africans in large numbers, and reorganised land and settlements. Many Indigenous communities nevertheless survived and rebuilt, and their languages and traditions endure today. When you see a population figure from this period, ask how it was calculated and what range of estimates exists.`,
          },
        ],
      },
      {
        id: 'history-south-america.t3',
        title: 'The Colonial World',
        blurb: 'Labour systems, silver, sugar, slavery, race and religion under Spanish and Portuguese rule, and the resistance to it.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Encomienda, Mita, Hacienda and the Silver of Potosí',
            blurb: 'Spanish rule rested on forced and tribute labour, large estates and the silver mines of the Andes.',
            minutes: 8,
            body: `Spain's empire in the Americas depended on extracting wealth, and the main source of wealth was Indigenous labour. Several institutions organised it.

The encomienda was a grant by the Crown to a Spanish settler, the encomendero, of the right to receive tribute and labour from an Indigenous community. In theory the encomendero owed protection and religious instruction in return. In practice abuse was widespread, and critics such as Bartolomé de las Casas pushed for reform. The New Laws of 1542 tried to limit the system, which met fierce resistance from colonists and was only partly enforced.

In the Andes, the Spanish adapted the Inca mit'a. Under the viceroy Francisco de Toledo in the 1570s, communities in a large region had to send a share of their men to work for set periods, especially in the silver mines of Potosí, in what is now Bolivia. Silver had been found at the Cerro Rico in 1545, and Potosí became one of the largest cities in the world of its day. Working conditions were extremely dangerous, and many workers died or fled. The Crown took a fifth of the silver as a tax, and the metal flowed to Spain and across the Pacific and Atlantic trades.

Land was another source of wealth. Over time, haciendas, large estates worked by tenants and dependent labourers, grew, often taking over community land. Many families were tied to a hacienda by debt and custom.

Worked example: a village near Potosí had to send men by rotation. The system looked like an Inca inheritance, but it served Spanish profit and not local needs, which is why historians describe it as an adaptation, not a continuation.`,
          },
          {
            id: L11,
            title: 'Brazil: Sugar, Captaincies and the Colonial Economy',
            blurb: 'Portugal turned Brazil from a coastal trading post into a sugar colony and later a source of gold.',
            minutes: 7,
            body: `At first Portugal paid little attention to Brazil, which had no obvious mountains of silver and gold. It traded for brazilwood, a tree whose red dye gave the country its name, and it relied on exchanges with Tupi peoples. In the 1530s the Crown divided the coast into large land grants called captaincies, given to nobles who were to settle and defend them. Few succeeded, and in 1549 a governor-general was sent to Salvador, in Bahia, to organise royal control.

Sugar became the great economic engine. In the northeast, especially around Pernambuco and Bahia, planters built engenhos, mills that turned cane into sugar for sale in Europe. Sugar needed large amounts of labour. At first colonists tried to enslave Indigenous people, but disease, flight, resistance and church and Crown disputes limited this, and planters increasingly relied on enslaved Africans.

In the 1690s gold was found in the interior, in the region that became Minas Gerais, followed later by diamonds. A gold rush drew migrants from Portugal and shifted the colony's centre of gravity southward. The capital was moved from Salvador to Rio de Janeiro in 1763.

The Portuguese colony differed from Spanish America in some ways: it had no single Indigenous empire to take over, it had no universities in the colony, and it remained united as one large territory. But it also shared patterns: land held by few, labour exploited, and wealth sent abroad.

A useful question for a student is how a crop, sugar, could reshape an entire society. Planters, enslaved workers, merchants and the Crown each had a stake in the answer.`,
          },
          {
            id: L12,
            title: 'Slavery and the Making of Afro-Latin America',
            blurb: 'The Atlantic slave trade brought millions of Africans to Latin America, where they shaped culture and resisted bondage.',
            minutes: 8,
            body: `Between the sixteenth and nineteenth centuries, millions of Africans were forcibly taken across the Atlantic. The Slave Voyages database, which scholars refine as new records appear, estimates that roughly 12 to 12.5 million people embarked from Africa and that roughly 10.7 million survived the crossing, with the largest number of all arriving in Brazil, close to half of them. Others went to Spanish America, the Caribbean and other regions. These are estimates, and researchers continue to adjust them.

Enslaved people worked in sugar mills, mines, farms, homes and cities. They endured violence, family separation and high death rates. They also resisted: through everyday acts such as work slowdowns and keeping their languages and religions, through legal petitions where they existed, and through flight and rebellion.

One form of resistance was the maroon community, called a quilombo in Brazil or palenque in Spanish America. The largest known, Palmares in northeastern Brazil, grew in the seventeenth century and survived for decades before Portuguese colonial forces destroyed it in 1694, and its leader Zumbi was killed the next year. Palmares remains a powerful symbol in Brazil today, and Zumbi is remembered on a national day of Black consciousness.

African peoples left a deep mark on the culture of Latin America: in music and rhythm, food, language and religious practice. Traditions like Candomblé in Brazil combine African roots with other influences.

Worked example: when you hear samba or eat a dish such as feijoada, you meet a legacy that was shaped, in part, by people who were forced to come. Histories of slavery are not only about suffering; they are also about survival and creativity.`,
          },
          {
            id: L13,
            title: 'Race, Caste and the Church',
            blurb: 'Colonial societies ranked people by ancestry and status, while the Catholic Church shaped belief, law and daily life.',
            minutes: 8,
            body: `Colonial Latin America was a hierarchy in which ancestry, legal status and wealth affected nearly everything. Terms varied by place and time, so treat the following as a general picture. Peninsulares were people born in Spain, and criollos (creoles) were people of Spanish descent born in the Americas. Indigenous people were treated as a separate legal category with certain obligations and certain protections. Africans and their descendants, many of them enslaved, formed another group. Mixed ancestry produced many categories: a mestizo had Spanish and Indigenous ancestry, a mulato had Spanish and African ancestry, and the broader system is often called the sistema de castas.

In eighteenth-century Mexico artists produced casta paintings that arranged families of different mixtures in neat charts. Historians stress that real life was messier than the charts. People could sometimes change their recorded category through marriage, wealth, or by petitioning, and many contemporaries disagreed on where lines lay. Even so, race and status mattered, and they limited who could hold office, join guilds or enter certain professions.

The Catholic Church was a central institution. Priests and missionary orders such as the Franciscans, Dominicans and Jesuits worked to convert Indigenous people, and the Church ran schools, hospitals and courts. Missions could protect communities from the worst colonists, but they also demanded conformity and labour. Indigenous people often blended Catholic practice with older beliefs, and some defended their rights through the colonial courts.

Worked example: a woman of mixed ancestry might be classed one way in a baptism record and another way in a later marriage record. That inconsistency is itself evidence about how flexible, and how constraining, the system was.`,
          },
          {
            id: L14,
            title: 'The Bourbon Reforms and Colonial Rebellion',
            blurb: 'Spain tightened control in the eighteenth century, provoking resentment and some large uprisings.',
            minutes: 8,
            body: `In the eighteenth century a new royal family, the Bourbons, ruled Spain and wanted to make its empire richer and more efficient. Their changes, often called the Bourbon Reforms, grew especially strong under Charles III (reigned 1759 to 1788). They created new administrative units, including the Viceroyalty of New Granada (re-established in 1739) and the Viceroyalty of the Río de la Plata (1776). They introduced royal officials called intendants, raised and collected taxes more effectively, expanded trade rules, and expelled the Jesuits from the empire in 1767.

Many people in the Americas felt these reforms as a loss. Criollos complained that top posts were increasingly given to officials from Spain. Taxes rose, and powerful local groups lost influence.

Some reactions were violent. In 1780 José Gabriel Condorcanqui, who took the name Túpac Amaru II, led a large rebellion in the Andes. He was a regional Indigenous leader who claimed descent from the last Inca rulers. The movement began as a protest against abuses and spread widely, drawing in many different kinds of people. Spanish forces crushed it, and Túpac Amaru II was executed in Cusco in 1781, but fighting continued under others. In New Granada, a tax protest called the Comunero Revolt broke out in 1781.

Worked example: compare two reactions. Criollo elites mostly wanted more say in government, while many Indigenous rebels wanted relief from tribute and forced labour. Different groups wanted different things, which is why later independence movements were hard to unite.`,
          },
        ],
      },
      {
        id: 'history-south-america.t4',
        title: 'Independence',
        blurb: 'How and why the Spanish and Portuguese empires in the Americas broke apart between about 1808 and 1825.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L15,
            title: 'Crisis of 1808 and the Example of Haiti',
            blurb: 'Napoleon\'s invasion of Spain opened a political crisis, and Haiti showed what a revolution against slavery could achieve.',
            minutes: 8,
            body: `Independence did not begin with a plan to leave the empire. It began with a crisis in Europe. In 1808 Napoleon's forces took control in Spain, forcing the Spanish king to give up the throne and placing Napoleon's brother Joseph on it. Across the empire people asked who held legitimate authority. In many cities, councils called juntas formed in 1809 and 1810, at first claiming to rule in the name of the imprisoned king Ferdinand VII. Caracas and Buenos Aires set up juntas in 1810. Over the next years some of these movements moved toward full independence.

Another event cast a long shadow: the Haitian Revolution. Beginning in 1791, enslaved people in the French colony of Saint-Domingue rose up, and in 1804 Haiti declared independence as the first Black-led republic, ending slavery there. For many creole elites this was frightening, since they feared that war could unleash a slave rebellion on their own lands. For others it was an inspiration. Simón Bolívar received refuge and military help from Haiti's president Alexandre Pétion in 1816, in return for a promise to abolish slavery.

Ideas also mattered: Enlightenment writings on rights and the examples of the United States and France circulated, though historians debate how much they drove events compared with practical politics.

Independence leaders were also divided. Some wanted a constitutional monarchy, some a republic; some wanted to keep slavery, some to end it. A student can learn a lot by asking who spoke in each decision and who was left out.`,
          },
          {
            id: L16,
            title: 'Bolívar and the Northern Campaigns',
            blurb: 'Simón Bolívar led liberation across Venezuela, Colombia and Ecuador, and tried to build a large union.',
            minutes: 8,
            body: `Simón Bolívar was born in Caracas in 1783 into a wealthy creole family. After the 1810 juntas he joined the independence cause. The first years were hard: the first Venezuelan republic fell, and civil war in Venezuela was bitter, with many fighters on the royalist side as well, including llaneros (plainsmen), enslaved people and Indigenous communities who had their own reasons.

Bolívar's turning point came in 1819. He led an army over the Andes and defeated royalist forces at Boyacá in August 1819, freeing the core of New Granada. That year, a congress at Angostura created the Republic of Colombia, today usually called Gran Colombia, covering what became Venezuela, Colombia and, later, Ecuador and Panama. The decisive victory in Venezuela came at Carabobo in June 1821. In 1822 Antonio José de Sucre, Bolívar's lieutenant, won at Pichincha near Quito. In 1824 Sucre led forces to victory at Ayacucho in Peru, the last major battle of the war on the continent. Bolivia, named for Bolívar, was founded in 1825.

Bolívar dreamed of a lasting union of the new states. This did not come to pass. Rivalries among regional leaders, large distances, and different interests pulled Gran Colombia apart. Bolívar died in 1830, disappointed, near Santa Marta.

Worked example: Bolívar is a hero in much of the region, but he is also criticised, for example for favouring strong executive power. Good history avoids both worship and dismissal and asks what choices he faced.`,
          },
          {
            id: L17,
            title: 'San Martín and the Southern Campaigns',
            blurb: 'José de San Martín liberated Argentina\'s neighbours by crossing the Andes and threatening Peru by sea.',
            minutes: 7,
            body: `While Bolívar advanced from the north, another general approached from the south. José de San Martín was born in the Río de la Plata region, served in the Spanish army in Europe, and returned to join the independence movement. The United Provinces of the Río de la Plata, as Argentina was then called, declared independence at Tucumán in 1816.

San Martín believed that the royalist stronghold in Peru could only be defeated by approaching it from the sea, and that Chile had to be freed first. In 1817 he led an army across the high Andes, a daunting feat of planning, and defeated royalists at Chacabuco in February. With the Chilean leader Bernardo O'Higgins, he won at Maipú in 1818, which secured Chilean independence. Chile had declared independence formally earlier that year.

San Martín then organised a fleet, helped by the Chilean navy and the British officer Lord Cochrane, and sailed to Peru. In July 1821 he proclaimed Peruvian independence in Lima, though royalist forces remained strong in the highlands. In July 1822 he met Bolívar in Guayaquil. What they discussed is not fully documented, and historians have long debated it. Soon afterwards, San Martín stepped aside and left for Europe, leaving the final campaigns to Bolívar and Sucre.

Worked example: this meeting shows how independence leaders disagreed about the future form of government and about who should lead. The record is thin, so be wary of any account that claims to know exactly what was said.`,
          },
          {
            id: L18,
            title: 'Brazil\'s Different Route, and Mexico',
            blurb: 'Brazil became independent as a monarchy under a Portuguese prince, while Mexico\'s path began with a popular uprising.',
            minutes: 7,
            body: `Brazil's road to independence was unusual. When Napoleon invaded Portugal in 1807, the Portuguese royal court, with thousands of people, sailed to Brazil under British protection and set up in Rio de Janeiro in 1808. For the first time a European monarchy was governed from its colony. Brazil's ports were opened to foreign trade, and in 1815 it was made a kingdom, united with Portugal.

After the king João VI returned to Portugal in 1821, politicians there tried to reduce Brazil's status. His son Pedro, left behind as regent, sided with Brazilian elites. On 7 September 1822 he declared independence, an event remembered as the cry of Ipiranga, and he was crowned emperor. There was fighting, especially in places like Bahia, but the break was less violent than in Spanish America. Brazil stayed a monarchy and a single large state, and importantly slavery continued, lasting until 1888.

Mexico, part of the same larger Latin American story, followed another path. In 1810 a priest, Miguel Hidalgo, called for rebellion with the cry known as the Grito de Dolores, drawing in many poor and Indigenous people. Hidalgo was captured and executed in 1811, and José María Morelos carried on the fight until his own execution in 1815. Independence in 1821 came after a different alliance, led by conservative leaders and a former royalist officer, Agustín de Iturbide, under the Plan of Iguala. Mexico briefly had an emperor too.

Worked example: compare the Brazilian and Mexican paths. In both, elites wanted to keep order, but Mexico's early uprising had a strong popular and Indigenous element that was crushed, while Brazil's independence preserved existing social hierarchies.`,
          },
        ],
      },
      {
        id: 'history-south-america.t5',
        title: 'Building and Testing New Nations',
        blurb: 'Caudillos, export economies, the end of slavery, mass immigration and the great wars of the nineteenth century.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L19,
            title: 'Caudillos, Fragile States and Fragmenting Unions',
            blurb: 'After independence, new republics struggled over who should rule, how, and with what money.',
            minutes: 8,
            body: `Winning independence was easier than building stable states. The wars had destroyed property and drained treasuries, and the old Spanish institutions that had held society together were gone. New republics wrote constitutions, but the people asked to follow them had little experience of self-government, and elites disagreed deeply about what kind of country to build.

Two broad camps are often named. Liberals tended to favour free trade, limits on the Church and weaker local privileges. Conservatives tended to defend the Church, tradition and a stronger state. In practice, both sides fought over regional power, and many leaders switched sides.

In this setting, many places were ruled by caudillos, strongmen who held power through personal loyalty, armed followers and control of resources. Examples include Juan Manuel de Rosas, who dominated Buenos Aires and much of Argentina from 1829 to 1852, and Antonio López de Santa Anna in Mexico. Historians debate the term: some see caudillos as simple tyrants, others as leaders who provided order and represented regional interests. Both pictures can contain truth.

Large unions broke apart. Gran Colombia dissolved around 1830, splitting into Venezuela, Colombia and Ecuador. The federation of Central America fell apart by the late 1830s. Spain kept Cuba and Puerto Rico until 1898.

Worked example: a caudillo in a remote province might offer protection and jobs to followers in return for loyalty. That arrangement could keep the peace locally while making national government weaker. A key question for advanced readers is whether the caudillo was a symptom of state weakness or a cause of it.`,
          },
          {
            id: L20,
            title: 'Export Economies and Foreign Capital',
            blurb: 'From the mid-nineteenth century, Latin America grew by selling raw materials abroad, with benefits and costs unevenly shared.',
            minutes: 8,
            body: `After independence, Latin American economies increasingly sold raw materials to the world's industrial powers, above all Britain and later the United States, and bought manufactured goods in return. This is often called the export-led model. Different regions specialised in different goods. Peru exported guano, bird droppings used as fertiliser, from the 1840s. Chile exported nitrates mined in the northern desert. Brazil, especially São Paulo state, became a great coffee producer. Argentina's pampas supplied beef and wheat. In the Amazon, a rubber boom brought wealth to cities like Manaus, but also severe abuse of Indigenous workers, as investigations in the early 1900s in the Putumayo region later revealed.

Foreign investors built railways, ports and telegraph lines that connected mines and farms to the coast. These projects were meant to serve exports more than to link regions inside a country. British capital was especially prominent.

Growth was real: cities expanded, and some elites became very rich. But the model also had weaknesses. Economies depended on world prices, which could crash. Land and mines were often controlled by few owners. Industrial development was limited, and rural workers frequently saw little benefit.

Later economists, including those in the dependency school in the twentieth century, argued that this pattern kept Latin America poor relative to industrial countries. Others emphasised domestic choices and institutions. This is a continuing debate.

Worked example: a coffee planter in Brazil earned money from foreign buyers, yet a fall in coffee prices could ruin both the planter and the workers. Dependence on a single crop made the whole region vulnerable.`,
          },
          {
            id: L21,
            title: 'The Long End of Slavery, and the Age of Immigration',
            blurb: 'Slavery ended gradually across the region, with Brazil the last, and new waves of migrants changed many countries.',
            minutes: 8,
            body: `Abolition did not happen all at once. Several early republics acted during or soon after the wars of independence. Chile passed abolition in 1823, and Mexico abolished slavery in 1829. Many countries adopted gradual measures such as free-womb laws, which freed children born to enslaved women but kept their mothers in bondage, with Gran Colombia passing one in 1821. Other states, including Peru and Venezuela, ended slavery in the 1850s. In Cuba, still a Spanish colony, slavery was abolished in stages and ended in 1886.

Brazil was last. Pressure came from enslaved people themselves, who fled and resisted, from a growing abolitionist movement including Black and white activists, and from international pressure. Brazil ended the Atlantic slave trade in 1850 under British pressure and then passed gradual laws. The Lei Áurea, the Golden Law, abolished slavery on 13 May 1888. The following year the monarchy was overthrown and a republic proclaimed. Freed people received little land or support, which shaped inequality that lasts today.

With abolition came a drive to attract European workers. From the 1870s to the early twentieth century millions of immigrants, notably from Italy, Spain, Portugal and Germany, settled especially in Argentina, Uruguay, southern Brazil and Chile. Japanese migration to Brazil began in 1908. Indentured labourers from China were brought to Peru and Cuba under harsh conditions. Elites often promoted immigration partly out of racial ideas that favoured Europeans, which is a point critics emphasise.

Worked example: Buenos Aires grew into a metropolis with large immigrant communities, and the mix of languages and customs shaped its culture, from food to music such as the tango. Migration changed both society and national self-image.`,
          },
          {
            id: L22,
            title: 'The Paraguayan War and the War of the Pacific',
            blurb: 'Two major wars redrew borders and left deep marks on the countries involved.',
            minutes: 8,
            body: `The Paraguayan War, also called the War of the Triple Alliance, lasted from 1864 to 1870. It pitted Paraguay, led by Francisco Solano López, against an alliance of Brazil, Argentina and Uruguay. The causes were tangled: border disputes, rivalry for influence in the Río de la Plata region, and the intervention of regional powers in Uruguay's politics. Historians continue to debate how far Solano López's ambitions or the actions of his neighbours were most responsible.

The war was devastating. Paraguay fought on long after it was clearly losing, and Solano López was killed in 1870. The country lost territory and suffered a very large loss of life, from battle, disease and hunger. Estimates of the death toll are heavily disputed, and some scholars suggest that a very large share of the population died, while others argue for lower figures. Brazil, which provided most of the allied forces, also lost many soldiers. Some Afro-Brazilians were freed in return for fighting, which influenced debates about slavery.

Later came the War of the Pacific (1879 to 1884). Chile fought Peru and Bolivia, in a dispute linked to taxes on nitrate mining in the Atacama desert and to unclear borders. Chile won. Under the settlements, Peru lost the province of Tarapacá, and Bolivia lost its coastline; a treaty with Chile in 1904 formalised the loss, leaving Bolivia landlocked. Bolivia's demand for sea access remains a topic of diplomacy today.

Worked example: wars about resources, like nitrate, show how export economies could turn into conflict. Borders drawn in the 1880s still affect politics now.`,
          },
        ],
      },
      {
        id: 'history-south-america.t6',
        title: 'The Twentieth Century and Today',
        blurb: 'Revolution, populism, dictatorship, debt, democracy and the rise of Indigenous and Afro-descendant movements.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L23,
            title: 'Revolutions in Mexico and Cuba as Regional Context',
            blurb: 'Two revolutions, one early and one mid-century, shaped political debate across the region.',
            minutes: 8,
            body: `Two revolutions outside South America influenced the whole region. The Mexican Revolution began in 1910 when Francisco Madero challenged the long rule of Porfirio Díaz. The movement soon fractured. Leaders such as Emiliano Zapata, who demanded land for peasants in the south, and Francisco "Pancho" Villa in the north, fought alongside and against others. The fighting lasted about a decade and cost many lives; estimates of deaths vary widely. The Constitution of 1917 included provisions on land reform, labour rights and state control of subsoil resources. In the 1930s President Lázaro Cárdenas distributed land and, in 1938, nationalised the oil industry.

The Cuban Revolution culminated in January 1959, when forces led by Fidel Castro took power after the dictator Fulgencio Batista fled. The new government nationalised industries, carried out land reform and ran literacy campaigns, and it aligned with the Soviet Union during the Cold War. The United States opposed it; an attempted invasion at the Bay of Pigs failed in 1961, and the Cuban Missile Crisis followed in 1962. The government has also been criticised for limiting political freedoms and imprisoning dissidents, and many Cubans left the island.

Both revolutions inspired movements elsewhere, and they alarmed others. Bolivia also had a major revolution in 1952, which expanded voting rights and nationalised tin mines.

Worked example: for students in South America in the 1960s, Cuba offered a model of rapid change to some and a warning to others. Understanding why people reacted differently helps explain the polarisation of that era.`,
          },
          {
            id: L24,
            title: 'Populism, Industrialisation and the Working Class',
            blurb: 'Leaders like Vargas and Perón mobilised urban workers and promoted national industry, to both praise and criticism.',
            minutes: 8,
            body: `The Great Depression of the 1930s hit export economies hard. When world demand collapsed, governments looked for alternatives. Many pursued import substitution industrialisation, using tariffs and state support to build domestic factories that would replace imports. Growing cities and new working classes also became political forces.

Leaders who appealed directly to these groups are often called populists, though the word is contested and critics and supporters use it differently. In Brazil, Getúlio Vargas came to power in 1930, led an authoritarian Estado Novo from 1937 to 1945, and later won election and served again from 1951 until his death in 1954. His government created labour laws, a minimum wage and state companies, but also repressed opponents and controlled unions.

In Argentina, Juan Perón was elected president in 1946, and he and his wife Eva Perón won enormous loyalty from workers through higher wages, social programmes and a strong role for unions. Critics accused him of authoritarianism, of controlling the press and of persecuting rivals. Perón was overthrown by the military in 1955, yet Peronism remained a major force in Argentine politics for decades.

Industrialisation brought growth in cities such as São Paulo and Buenos Aires, but protected industries were sometimes inefficient, and countries still relied on imported machinery.

Worked example: a factory worker in 1950s Buenos Aires might see Perón as the leader who gave them dignity and rights, while a journalist whose newspaper was closed saw him as a threat to freedom. Both experiences are part of the record.`,
          },
          {
            id: L25,
            title: 'Cold War, Coups and Dictatorships',
            blurb: 'From the 1950s to the 1980s, military regimes seized power in much of the region, often with foreign support, and committed grave abuses.',
            minutes: 9,
            body: `During the Cold War, the United States and the Soviet Union competed for influence worldwide. Many Latin American governments, and the United States, viewed left-wing movements as threats, while others in the region pursued radical change. Politics became polarised, and the military repeatedly stepped in.

In 1954 a coup in Guatemala removed the elected president Jacobo Árbenz, with United States support. In Brazil, the military overthrew President João Goulart in 1964 and ruled until 1985. In Chile, General Augusto Pinochet seized power on 11 September 1973, ending the government of the elected socialist president Salvador Allende; Allende died during the attack on the presidential palace. Pinochet ruled until 1990. In Argentina, a military junta took power in 1976 and conducted a campaign of repression often called the Dirty War. Thousands were disappeared, meaning that they were seized by the state and never seen again. A national commission in 1984 documented several thousand cases, while human rights groups believe the true figure is much higher, with 30,000 often cited. The figures remain debated.

Some regimes cooperated across borders. Operation Condor was a coordination among the intelligence services of several Southern Cone dictatorships from the mid-1970s to track and target opponents. The role of the United States is debated, but declassified documents show it knew of and at times supported anti-leftist regimes.

Such regimes defended their actions as fights against communism or chaos. Victims included students, unionists, priests and ordinary families. Mothers and grandmothers in Argentina, for example, marched in Buenos Aires to demand answers about missing relatives.`,
          },
          {
            id: L26,
            title: 'Debt, Neoliberal Reform and the Return of Democracy',
            blurb: 'The 1980s brought economic crisis and a wave of transitions from military rule to elected government.',
            minutes: 8,
            body: `In the 1970s many Latin American governments borrowed heavily from foreign banks. When interest rates rose and commodity prices fell in the early 1980s, several could not pay. In 1982 Mexico announced it could not service its debt, triggering a regional crisis. The 1980s are often called the lost decade, because incomes stagnated or fell in many countries, and some suffered severe inflation.

International lenders, including the International Monetary Fund, offered help on condition of reforms: cutting government spending, selling state companies, opening markets. These policies are often called structural adjustment or neoliberal reform. Supporters argued that they were needed to control inflation and restore growth. Critics argued that they hurt the poor and increased inequality. Evidence from different countries is mixed, and historians and economists still debate the results.

At the same time, many military regimes gave way to elected governments. Argentina returned to civilian rule in 1983, Uruguay and Brazil in 1985. In Chile, voters rejected Pinochet's bid to stay in power in a 1988 plebiscite, and democracy returned in 1990. Many countries set up truth commissions to investigate past abuses. Argentina's commission produced the report Nunca Más in 1984, and Chile's Rettig Commission reported in 1991. Efforts at prosecution and amnesty have been disputed ever since, and trials continue in some countries.

From the late 1990s, a number of elected leftist governments, sometimes called the pink tide, came to power, including Hugo Chávez in Venezuela, first elected in 1998. They expanded social spending, with varied results.

Worked example: when a new democracy decides whether to punish past crimes, it faces a trade-off between justice and stability. Different countries have chosen differently.`,
          },
          {
            id: L27,
            title: 'Indigenous and Afro-Descendant Movements',
            blurb: 'From the late twentieth century, Indigenous and Black organisations won new rights and political power.',
            minutes: 8,
            body: `For centuries Indigenous and African-descended people had been excluded from power, yet they never stopped organising. From the late twentieth century their movements became major political forces.

In Ecuador, the Confederation of Indigenous Nationalities (CONAIE), founded in 1986, led large protests and became a key actor. In Mexico, on 1 January 1994, the day the North American Free Trade Agreement took effect, the Zapatista Army of National Liberation (EZLN) rose up in the southern state of Chiapas. It demanded land, autonomy and respect for Indigenous peoples, and it used communiqués and international media effectively. In Bolivia, protests against the privatisation of water in Cochabamba in 2000 showed popular power. In 2005 Evo Morales, who has Aymara roots, was elected president, the first Indigenous head of state in the country's modern history. Bolivia's 2009 constitution described the state as plurinational, and Ecuador's 2008 constitution also recognised plural nations and Indigenous rights. These reforms were celebrated by many and criticised by others, including some Indigenous groups who felt that extractive projects still ignored them.

Afro-descendant movements also won gains. Colombia's 1991 constitution and a 1993 law recognised collective land rights for Black communities. In Brazil, universities adopted racial quotas, and a national law on quotas was passed in 2012. Activists continue to point to racial gaps in income, schooling and violence.

Worked example: the Zapatistas used the symbol of a masked spokesperson and the timing of 1 January 1994 to win world attention. Movements often combine local goals with careful communication to wider audiences.`,
          },
          {
            id: L28,
            title: 'Contemporary Challenges and How to Read This History',
            blurb: 'Inequality, violence, migration, environment and democracy are live questions, and the past offers context rather than simple answers.',
            minutes: 8,
            body: `Latin America today includes many different countries, with large cities, modern industries and rich cultures, and also serious challenges. Careful historians avoid treating the region as one story.

Inequality is among the most discussed issues. Many studies describe the region as one of the most unequal in the world, and historians trace this to colonial land and labour systems, slavery and unequal access to education. Others point to modern policy choices too. Since the early 2000s, poverty fell in many countries during a commodity boom, though progress has been uneven and sometimes reversed.

Violence and organised crime affect parts of the region, including areas of Mexico, Central America, Colombia and Brazil. Experts debate causes, including drug markets, weak policing, inequality and the policies of other nations. Democracy has also faced stress, with disputes over corruption, elections and the role of the military. Migration is another large issue: millions of Venezuelans have left their country in recent years, and many people from Central America and elsewhere have sought work or safety abroad.

The environment is central too. The Amazon rainforest influences climate, and deforestation, mining and farming raise hard questions about development and conservation. Indigenous communities are often at the heart of these debates.

How should you read all this history? Ask who wrote a source and why. Compare accounts that disagree. Notice which numbers are estimates. Remember that each person in these stories, from an Inca lord to a Black abolitionist to a factory worker, had choices and constraints.

Worked example: when you read about a current protest, ask what older events its participants draw on. That habit turns history into a tool for understanding the present.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'history-south-america',
    questions: [
      // L01
      mc(L01, 1, 1, "Which mountain chain runs along the western edge of South America?", ["The Andes", "The Alps of southern Europe", "The Rocky Mountains of North America", "The Himalayas of southern Asia"], "It runs close to the Pacific coast.", "The Andes are among the longest mountain chains on Earth and run down the western side of the continent."),
      tf(L01, 2, 1, "The lesson says historians rely only on written Spanish and Portuguese accounts to learn about pre-contact peoples.", 1, "Think about archaeology and oral tradition.", "Historians combine archaeology, scientific studies, colonial writings and Indigenous oral traditions."),
      mc(L01, 3, 1, "What was a quipu?", ["A set of knotted cords used for record-keeping", "A heavy woollen cloak worn by Inca officials at court", "A Spanish tax", "A mountain pass"], "It was used by the Inca to keep records.", "Quipus were knotted cords; scholars agree they recorded numbers."),
      mc(L01, 4, 2, "Why do spoken traditions, songs and place names matter to historians of the Americas?", ["They carry memory that written colonial sources may miss", "They prove that archaeological evidence cannot be trusted by anyone", "They replace the need for any other evidence", "They were invented after 1900"], "Consider who wrote the colonial records.", "Colonial writers had their own aims, so Indigenous traditions add perspectives that written sources omit."),
      tf(L01, 5, 2, "Scholars agree that every quipu recorded full stories, not only numbers.", 1, "The lesson says part of this is debated.", "Quipus clearly recorded numbers, but whether some encoded narrative is still debated."),
      // L02
      mc(L02, 1, 1, "Where was the early city of Caral located?", ["On the coast of Peru in the Supe valley", "On the Amazon River in Brazil", "In the Chilean desert far south of Peru and the Andes", "In the Caribbean"], "It is in Peru, near the Pacific.", "Caral lies in the Supe valley of Peru and dates to roughly 3000 to 1800 BCE."),
      tf(L02, 2, 1, "The Inca built Caral.", 1, "Compare the dates of Caral and the Inca.", "Caral is thousands of years older than the Inca."),
      mc(L02, 3, 2, "Which society is best known for giant lines and figures drawn in a desert?", ["The Nazca", "The Moche, a coastal people of northern Peru", "The Inca, rulers of Tawantinsuyu", "The Mapuche, a people of southern Chile"], "It lived on the dry south coast of Peru.", "The Nazca Lines were made by the Nazca, whose purpose for them is debated."),
      mc(L02, 4, 2, "What did the tomb of the Lord of Sipán reveal about the Moche?", ["That their leaders were buried with great wealth in metalwork", "That they used the quipu", "That they lived deep in the Amazon rainforest far from the coast", "That they were conquered by Chavín"], "Think of what was buried with the lord.", "The tomb, found in 1987, held gold, silver and copper ornaments that show elite wealth."),
      tf(L02, 5, 3, "Because the purpose of the Nazca Lines is debated, scholars should present several explanations instead of claiming one is certain.", 0, "Consider how to treat uncertain evidence.", "When evidence supports multiple interpretations, honest history presents them as possibilities."),
      // L03
      mc(L03, 1, 1, "What was the Inca name for their empire, often translated as the four parts together?", ["Tawantinsuyu", "Tenochtitlan, the Mexica island capital", "Tiwanaku, a highland city near Lake Titicaca", "Tordesillas, a town in northern Spain"], "It begins with Tawa, meaning four in Quechua.", "Tawantinsuyu is the name usually given for the Inca empire."),
      tf(L03, 2, 1, "The Inca had a large network of roads and used runners to carry messages.", 0, "The lesson stresses their infrastructure.", "Roads, way stations and runners helped the Inca control a large territory."),
      mc(L03, 3, 2, "What was the mit'a?", ["A rotating labour obligation to the state", "A type of pottery", "A royal title held by the Inca emperor's heirs", "A sea route"], "It was a duty owed by communities.", "Under the mit'a, communities sent workers to serve the state for set periods."),
      tf(L03, 4, 2, "The Inca used a wheeled cart system and a written alphabet to run their empire.", 1, "Recall how they kept records.", "They used roads, runners and quipus, not wheeled carts or an alphabet."),
      mc(L03, 5, 3, "Which statement best matches the lesson's view of how the Inca ruled?", ["They used both force and cooperation, such as keeping some local rulers in place", "They ruled only by force", "They ruled only by voluntary agreement", "They had no government"], "Think about the mix of methods.", "The evidence points to conquest, rebellion, relocation and also accommodation with local elites."),
      // L04
      mc(L04, 1, 1, "What is terra preta?", ["Dark, fertile soil in the Amazon created by long human use", "A kind of Inca road", "A Mapuche war chief who led resistance against the Spanish crown", "A Portuguese tax"], "It is linked to how people shaped the forest.", "Terra preta soils suggest that Amazonian peoples lastingly changed their environment."),
      tf(L04, 2, 1, "When the Portuguese arrived in 1500, the first Indigenous people they met on the Brazilian coast spoke Tupi languages.", 0, "Think of the coast of Brazil.", "Tupi-speaking peoples lived along the Atlantic coast."),
      mc(L04, 3, 2, "How did the Mapuche relate to the Inca and the Spanish?", ["They resisted both, and fought a long war against the Spanish", "They were the Inca capital", "They allied permanently with Spain", "They never met either"], "Recall the Arauco War.", "The Mapuche resisted Inca expansion and fought the Spanish for generations."),
      tf(L04, 4, 2, "The lesson claims the size of the Amazonian population before 1500 is settled fact.", 1, "Read the sentence on estimates.", "The population size is debated and estimates differ widely."),
      mc(L04, 5, 3, "What does the Mapuche example show?", ["A society without a centralised state could organise effective defence", "That only empires can resist invasion", "That the Inca ruled all of South America", "That Spanish conquest was always quick"], "Think about whether they had a king.", "The Mapuche lacked a single king yet held out long against powerful enemies."),
      // L05
      mc(L05, 1, 1, "Which people founded Tenochtitlan, according to tradition around 1325?", ["The Mexica", "The Taino of the Caribbean islands", "The Moche of northern coastal Peru", "The Mapuche of south-central Chile"], "They are often called Aztecs.", "The Mexica built Tenochtitlan on an island in a lake in central Mexico."),
      tf(L05, 2, 1, "Maya peoples disappeared completely after the classic period.", 1, "The lesson says millions of descendants live today.", "Maya cities declined, but Maya peoples and languages continue today."),
      mc(L05, 3, 2, "Who were the Taino?", ["An Arawak-speaking people of the Caribbean islands", "A highland people of the Atacama desert and the Andes foothills", "Inca officials", "Portuguese explorers"], "Columbus met them first.", "The Taino lived in the Caribbean and were the first Indigenous people Columbus met."),
      mc(L05, 4, 2, "Why did the Triple Alliance matter later?", ["Many subject peoples resented paying tribute, which affected loyalties after 1519", "It created the Spanish Empire", "It founded Caral", "It ended slavery"], "Think about why some peoples later joined Cortés.", "Resentment of tribute helped some peoples ally with the Spanish against Tenochtitlan."),
      tf(L05, 5, 3, "The Americas before 1492 were uniform and mostly empty.", 1, "Recall the variety described.", "They held empires, cities, villages and many different cultures."),
      // L06
      mc(L06, 1, 1, "In which year did Columbus first reach the Caribbean?", ["1492", "1519", "1532", "1808"], "Think of the late fifteenth century.", "Columbus sailed for Spain and reached the Caribbean in 1492."),
      tf(L06, 2, 1, "New diseases were among the main causes of the Taino decline.", 0, "Along with violence and forced labour.", "Disease, violence and enslavement together caused a sharp drop in the Taino population."),
      mc(L06, 3, 2, "What did the Treaty of Tordesillas do?", ["Divided lands for Spain and Portugal to claim along a line", "Ended the Inca Empire", "Abolished slavery", "Created Gran Colombia"], "It was an agreement between two Iberian powers.", "The 1494 treaty divided claims between Spain and Portugal, ignoring local peoples."),
      mc(L06, 4, 2, "Who reached Brazil in 1500 for Portugal?", ["Pedro Álvares Cabral", "Francisco Pizarro", "Hernán Cortés, conqueror of the Mexica", "Simón Bolívar"], "He was Portuguese.", "Cabral's fleet reached Brazil in 1500."),
      tf(L06, 5, 3, "The lesson suggests the Tordesillas line helps explain why Brazil speaks Portuguese while most of the rest of Latin America speaks Spanish.", 0, "Consider who claimed lands east and west of the line.", "The line, together with later events, helped place Brazil in the Portuguese sphere."),
      // L07
      mc(L07, 1, 1, "In which year did Tenochtitlan fall to Cortés and his allies?", ["1521", "1492", "1572", "1822"], "It was about two years after he arrived.", "Tenochtitlan fell in August 1521."),
      tf(L07, 2, 1, "Cortés succeeded entirely on his own, without Indigenous allies.", 1, "Think of the Tlaxcalans.", "Many Indigenous allies, such as the Tlaxcalans, were crucial."),
      mc(L07, 3, 2, "Which woman served as a key translator for Cortés?", ["Malintzin, also called Doña Marina", "Eva Perón", "Isabella of Castile, queen of Spain", "Rigoberta Menchú"], "She spoke Nahuatl and Maya.", "Malintzin helped Cortés communicate and negotiate."),
      mc(L07, 4, 2, "Which factor helped weaken Tenochtitlan around 1520?", ["A smallpox epidemic", "The Treaty of Tordesillas", "A silver strike at Potosí", "The Paraguayan War"], "A germ, not a weapon.", "Smallpox killed many people and weakened the defenders."),
      mc(L07, 5, 3, "Which statement best sums up the lesson's explanation of the conquest?", ["A combination of alliance, disease and violence, with Indigenous actors on both sides", "Superior courage alone", "A single battle", "A peaceful agreement"], "The lesson rejects a single-cause story.", "Several factors worked together, including Indigenous politics."),
      // L08
      mc(L08, 1, 1, "Where did Pizarro's men capture Atahualpa in 1532?", ["Cajamarca", "Potosí, in the high Andes of Bolivia", "Ayacucho, in the central Peruvian highlands", "Tordesillas, a town in northern Spain"], "It is a highland town in Peru.", "The capture at Cajamarca in November 1532 was a turning point."),
      tf(L08, 2, 1, "Atahualpa and Huáscar fought a civil war for the Inca throne before Pizarro arrived.", 0, "They were sons of Huayna Capac.", "The civil war had left the empire divided."),
      mc(L08, 3, 2, "What happened at Vilcabamba?", ["A rebel Inca state resisted until 1572", "Atahualpa was crowned as the last emperor of the Inca", "Silver was found", "The Spanish founded Lima"], "Think of the Neo-Inca state.", "The Neo-Inca state lasted until the capture and execution of Túpac Amaru in 1572."),
      tf(L08, 4, 2, "Some peoples conquered by the Inca sometimes allied with the Spanish.", 0, "Consider why they might resent the Inca.", "Resentment of Inca rule led some groups to join the invaders."),
      mc(L08, 5, 3, "Why does the lesson stress timing in the fall of the Inca?", ["The empire was already divided by civil war, so a small force could exploit the crisis", "Because the Inca had no army", "Because the Spanish arrived after 1572", "Because roads did not exist"], "Think about what Pizarro faced when he arrived.", "Inca divisions made a unified response harder."),
      // L09
      mc(L09, 1, 1, "What was a leading cause of Indigenous population decline after contact?", ["New diseases such as smallpox and measles", "Floods", "The invention of the quipu for record-keeping among the Inca", "Increased trade in llamas"], "Think about immunity.", "Indigenous peoples had little immunity to Old World diseases."),
      tf(L09, 2, 1, "Scholars agree on exactly how many people died.", 1, "Recall the range of estimates.", "The numbers are heavily debated, from several million to tens of millions for the pre-contact population."),
      mc(L09, 3, 2, "Why is it incomplete to blame only disease?", ["War, forced labour, hunger and enslavement also raised the toll", "Because disease was not present", "Because Europeans had no contact", "Because Indigenous people were immune"], "Look at the third paragraph.", "Colonial systems worsened the effects of disease."),
      tf(L09, 4, 2, "After the collapse, colonisers turned to other labour sources, including enslaved Africans.", 0, "A reduced workforce changed demand.", "Fewer Indigenous workers led to greater use of enslaved Africans in many regions."),
      mc(L09, 5, 3, "What is a sensible habit when you see a population figure from this period?", ["Ask how it was calculated and what range of estimates exists", "Treat it as exact", "Ignore it", "Assume it is too low"], "Consider the uncertainty of the evidence.", "Estimates rely on indirect evidence, so asking about method and range is good practice."),
      // L10
      mc(L10, 1, 1, "What was the encomienda?", ["A grant of tribute and labour from an Indigenous community to a settler", "A Spanish tax on silver", "A type of ship", "A mountain pass"], "In theory the grantee owed protection and religious instruction.", "The encomienda gave settlers rights to tribute and labour."),
      mc(L10, 2, 1, "Where were the silver mines at the Cerro Rico worked?", ["Potosí", "Cusco, the old Inca capital", "Salvador, a port in Brazil", "Caracas, in what is now Venezuela"], "It is in what is now Bolivia.", "Potosí became one of the largest cities of its time because of silver."),
      tf(L10, 3, 2, "The mita system under Viceroy Toledo was a perfect continuation of Inca practice with no changes.", 1, "Recall who benefited.", "The Spanish adapted the mita for their own profit."),
      mc(L10, 4, 2, "What did the New Laws of 1542 try to do?", ["Limit the encomienda system", "End the Atlantic trade", "Create Gran Colombia", "Grant independence to the colonies of South America"], "They were a response to critics such as Las Casas.", "The New Laws tried to restrict the encomienda but met strong resistance."),
      mc(L10, 5, 3, "What was a hacienda?", ["A large estate worked by tenants and dependent labourers", "A mining tool used to crush silver ore at the Cerro Rico mines", "A kind of ship", "A form of tax"], "Think of land.", "Haciendas grew over time and often absorbed community land."),
      // L11
      mc(L11, 1, 1, "What crop became the main driver of Brazil's colonial economy in the northeast?", ["Sugar", "Wheat grown on the pampas", "Coffee grown in the southeast", "Rubber tapped in the Amazon"], "Mills called engenhos processed it.", "Sugar plantations in Pernambuco and Bahia powered the colonial economy."),
      tf(L11, 2, 1, "Brazil is named after brazilwood, a tree used for red dye.", 0, "Read the opening paragraph.", "Brazilwood was among the first goods exported."),
      mc(L11, 3, 2, "What were the captaincies?", ["Large land grants given to nobles to settle the coast", "Spanish ships", "Inca roads linking Cusco to the provinces of the empire", "Mapuche councils"], "They were created in the 1530s.", "The Portuguese Crown divided the coast into captaincies."),
      mc(L11, 4, 2, "What discovery in the 1690s moved Brazil's economic centre of gravity south?", ["Gold in the interior", "Silver at Potosí in the Andes", "Oil beneath the coastal shelf", "Coffee on the southern plateau"], "It was in what became Minas Gerais.", "A gold rush drew migrants and shifted the colony's centre."),
      tf(L11, 5, 3, "By 1763 the colonial capital had moved from Salvador to Rio de Janeiro.", 0, "Consider where gold and trade now flowed.", "The move reflected the southward shift in economic activity."),
      // L12
      mc(L12, 1, 1, "Which colonial region received the largest number of enslaved Africans according to the lesson's estimates?", ["Brazil", "Chile, on the Pacific coast", "Uruguay, on the River Plate", "Paraguay, in the interior"], "It was the sugar colony.", "Close to half of the Africans who survived the crossing arrived in Brazil, by current estimates."),
      mc(L12, 2, 1, "What was Palmares?", ["A large community of escaped enslaved people in northeastern Brazil", "A Spanish silver mine", "A Moche city", "A Portuguese fort"], "It was a quilombo.", "Palmares was the largest known quilombo and was destroyed in 1694."),
      tf(L12, 3, 2, "Enslaved people resisted in many ways, including flight and keeping their cultural practices.", 0, "Resistance was not only open rebellion.", "Resistance ranged from daily acts to rebellion and escape."),
      tf(L12, 4, 2, "The figures for the Atlantic slave trade are exact and never revised.", 1, "Read how the database is described.", "They are estimates that scholars refine."),
      mc(L12, 5, 3, "Why does the lesson say histories of slavery are not only about suffering?", ["They also show survival and creativity, such as cultural and religious traditions", "Because slavery was brief", "Because no one suffered", "Because only Europeans created culture"], "Think of music and religion.", "African-descended communities shaped music, food, language and belief."),
      // L13
      mc(L13, 1, 1, "What was a criollo?", ["A person of Spanish descent born in the Americas", "A person born in Spain", "A Portuguese king who ruled Brazil from Rio de Janeiro", "An Inca ruler"], "Compare with peninsular.", "Criollos were American-born people of Spanish descent."),
      mc(L13, 2, 1, "What did the term mestizo describe?", ["A person of Spanish and Indigenous ancestry", "A person of Spanish and African ancestry", "A Spanish official", "An enslaved worker brought from West Africa to the mines"], "Mixed ancestry.", "Mestizo referred to Spanish and Indigenous mixture."),
      tf(L13, 3, 2, "Historians note that real life was messier than casta paintings suggest.", 0, "People could sometimes change their category.", "Categories were negotiated and inconsistent in practice."),
      mc(L13, 4, 2, "How could Church missions both help and harm Indigenous communities?", ["They could shield people from some colonists but also demanded conformity and labour", "They only helped", "They only harmed", "They had no influence"], "Look at the final paragraph.", "Missions had mixed effects."),
      tf(L13, 5, 3, "The inconsistent labelling of one woman across records is evidence that the system was both flexible and constraining.", 0, "Consider what inconsistency reveals.", "Differing records show categories were fluid, yet they still limited opportunities."),
      // L14
      mc(L14, 1, 1, "Which ruler is most associated with the strongest Bourbon Reforms?", ["Charles III", "Atahualpa, last ruler of the Inca", "Napoleon, emperor of the French", "Pedro I, first emperor of Brazil"], "He reigned from 1759 to 1788.", "The reforms were especially strong under Charles III."),
      tf(L14, 2, 1, "The Bourbon Reforms included the expulsion of the Jesuits in 1767.", 0, "A religious order was removed.", "The Jesuits were expelled from the empire in 1767."),
      mc(L14, 3, 2, "Why were many criollos unhappy with the reforms?", ["Top posts were increasingly given to officials from Spain", "Taxes were lowered", "Slavery was abolished in every colony of the Spanish empire", "The Church grew weaker"], "Think about who held office.", "Criollos lost influence as peninsular officials were favoured."),
      mc(L14, 4, 2, "Who led the large 1780 rebellion in the Andes?", ["José Gabriel Condorcanqui, known as Túpac Amaru II", "Simón Bolívar", "Zumbi", "Atahualpa"], "He claimed Inca descent.", "Túpac Amaru II led the rebellion and was executed in 1781."),
      tf(L14, 5, 3, "The lesson says different groups wanted different things from reform and rebellion, making unity hard later.", 0, "Compare criollo and Indigenous aims.", "Elite and Indigenous goals differed."),
      // L15
      mc(L15, 1, 1, "What event in 1808 started the political crisis in the Spanish empire?", ["Napoleon's takeover in Spain", "The Treaty of Tordesillas", "The fall of Cajamarca", "The abolition of slavery in Brazil"], "It happened in Europe.", "The removal of the Spanish king raised questions of legitimate authority."),
      tf(L15, 2, 1, "Haiti became independent in 1804 as the first Black-led republic.", 0, "Recall the Haitian Revolution.", "Haiti ended slavery and declared independence in 1804."),
      mc(L15, 3, 2, "What did Bolívar receive from Haiti's president Pétion in 1816?", ["Refuge and military help in return for a promise to abolish slavery", "Gold", "A crown", "A ship named after him"], "There was a condition.", "Pétion helped Bolívar and asked for abolition."),
      mc(L15, 4, 2, "Why did many creole elites fear the Haitian example?", ["They feared a slave rebellion on their own lands", "They disliked sugar", "They wanted to go to war with France over its Caribbean colonies", "They hated the Church"], "Think of their interests.", "Many elites owned or depended on enslaved labour."),
      tf(L15, 5, 3, "Historians debate how much Enlightenment ideas drove independence compared with practical politics.", 0, "Look near the end.", "The relative weight of ideas and circumstances is debated."),
      // L16
      mc(L16, 1, 1, "Where was Simón Bolívar born?", ["Caracas", "Cusco, the old Inca capital", "Lima, the viceregal capital", "Havana, on the island of Cuba"], "It is the capital of Venezuela.", "Bolívar was born in Caracas in 1783."),
      mc(L16, 2, 1, "Which 1819 battle freed the core of New Granada?", ["Boyacá", "Ayacucho, fought in 1824", "Maipú, fought in Chile", "Cajamarca, where Atahualpa was seized"], "It happened in August.", "Boyacá was a decisive victory."),
      tf(L16, 3, 2, "Ayacucho in 1824 was the last major battle of the war on the continent.", 0, "Sucre led the army.", "Sucre's victory ended major fighting."),
      mc(L16, 4, 2, "What happened to Gran Colombia?", ["It dissolved around 1830 because of regional rivalries and distance", "It lasted without division until the end of the nineteenth century and beyond", "It became Brazil", "It conquered Spain"], "Union proved hard to sustain.", "Venezuela, Colombia and Ecuador split."),
      mc(L16, 5, 3, "Why does the lesson say Bolívar should not be simply worshipped or dismissed?", ["Good history asks what choices he faced and weighs praise and criticism", "He did nothing", "He was never a general", "Sources do not exist"], "Think about balanced judgement.", "Both hero worship and dismissal oversimplify."),
      // L17
      mc(L17, 1, 1, "Which mountains did San Martín's army cross in 1817?", ["The Andes", "The Alps of southern Europe", "The Appalachians of North America", "The Pyrenees of southwest Europe"], "Between Argentina and Chile.", "Crossing the high Andes allowed the attack on Chile."),
      tf(L17, 2, 1, "Chacabuco was a 1817 victory for San Martín.", 0, "It took place in February.", "He defeated royalists at Chacabuco."),
      mc(L17, 3, 2, "Why did San Martín attack Chile before Peru?", ["He thought Peru could best be approached by sea after freeing Chile", "He disliked Peru", "Chile was larger", "The Inca ordered it"], "It was part of a plan.", "Chile became the base for the naval expedition."),
      tf(L17, 4, 2, "The full content of the San Martín and Bolívar meeting at Guayaquil is well documented.", 1, "The record is thin.", "Historians still debate what was said."),
      mc(L17, 5, 3, "What does the Guayaquil meeting show about independence leaders?", ["They disagreed about future government and leadership", "They always agreed about how to govern the new republics afterward", "They were enemies of independence", "They wanted Spanish rule"], "Think about differing visions.", "The leaders held differing views, and one stepped aside."),
      // L18
      mc(L18, 1, 1, "Where did the Portuguese court move in 1808?", ["Rio de Janeiro", "Lima", "Mexico City, capital of New Spain", "Buenos Aires"], "It was in Brazil.", "The court sailed to Rio de Janeiro."),
      mc(L18, 2, 1, "Who declared Brazil independent on 7 September 1822?", ["Pedro", "João VI, his father the king", "Bolívar, the Venezuelan liberator", "Iturbide, the Mexican general"], "He was the king's son.", "Pedro became emperor."),
      tf(L18, 3, 2, "Brazil ended slavery at independence in 1822.", 1, "Recall 1888.", "Slavery continued until 1888."),
      mc(L18, 4, 2, "Who called for rebellion in Mexico in 1810 with the Grito de Dolores?", ["Miguel Hidalgo", "Simón Bolívar", "José de San Martín", "Pedro I"], "He was a priest.", "Hidalgo's rising drew many poor and Indigenous people."),
      tf(L18, 5, 3, "The lesson suggests Brazil's independence preserved existing social hierarchies more than Mexico's early uprising tried to.", 0, "Compare the two paths.", "Mexico's early uprising had a strong popular element, which was crushed."),
      // L19
      mc(L19, 1, 1, "What is a caudillo?", ["A strongman who ruled through personal loyalty and armed followers", "A type of priest", "A colonial tax", "A ship's captain"], "The term appears often in this era.", "Caudillos held power through personal networks."),
      tf(L19, 2, 1, "Gran Colombia dissolved around 1830.", 0, "Recall the previous track.", "It split into Venezuela, Colombia and Ecuador."),
      mc(L19, 3, 2, "What did liberals tend to favour?", ["Free trade and limits on the Church", "A strong Church", "Colonial rule under a restored monarchy", "Slavery's expansion"], "Contrast with conservatives.", "Liberals typically sought free trade and a smaller Church role."),
      mc(L19, 4, 2, "Who dominated Buenos Aires from 1829 to 1852?", ["Juan Manuel de Rosas", "Juan Perón, later a president", "Augusto Pinochet, a Chilean general", "Getúlio Vargas of Brazil"], "He was a caudillo.", "Rosas was a major caudillo."),
      tf(L19, 5, 3, "Historians agree that caudillos were all simple tyrants.", 1, "Recall the debate.", "Some see them as providers of order and regional representation."),
      // L20
      mc(L20, 1, 1, "What was guano used for?", ["Fertiliser", "Fuel for steamships", "Dye for textiles", "Medicine for fevers"], "It was bird droppings.", "Peru exported guano as fertiliser."),
      mc(L20, 2, 1, "Which country was especially prominent as a source of foreign capital?", ["Britain", "Japan", "Russia", "Australia"], "Railways and ports.", "British investment was especially important."),
      tf(L20, 3, 2, "Railways built for exports mainly linked regions within a country.", 1, "They linked mines and farms to the coast.", "They were designed to serve exports."),
      mc(L20, 4, 2, "What was a weakness of the export model?", ["Dependence on world prices", "Too much heavy industry in every country", "No foreign trade", "Too many factories"], "Think of crashes.", "Price swings could ruin economies."),
      tf(L20, 5, 3, "The causes of Latin America's economic problems remain debated among economists and historians.", 0, "Dependency theory versus domestic choices.", "Scholars disagree about the relative weight."),
      // L21
      mc(L21, 1, 1, "Which country was the last in the lesson to abolish slavery, in 1888?", ["Brazil", "Chile, in the south", "Mexico, in the north", "Venezuela, on the Caribbean"], "The Golden Law.", "The Lei Áurea abolished slavery on 13 May 1888."),
      tf(L21, 2, 1, "Mexico abolished slavery in 1829.", 0, "Recall the early republics.", "Mexico and Chile acted early."),
      mc(L21, 3, 2, "What did free-womb laws do?", ["Freed children born to enslaved women but kept their mothers enslaved", "Freed everyone", "Banned travel", "Ended taxes"], "A gradual measure.", "They were gradual abolition measures."),
      mc(L21, 4, 2, "In which year did organized Japanese migration to Brazil begin?", ["1908", "1808", "1708", "1988"], "Early twentieth century.", "It began in 1908."),
      tf(L21, 5, 3, "Elites sometimes promoted European immigration partly for racial reasons, according to critics.", 0, "Think about motives.", "Critics highlight racial ideas behind policy."),
      // L22
      mc(L22, 1, 1, "Which countries formed the alliance against Paraguay?", ["Brazil, Argentina and Uruguay", "Chile and Peru", "Spain and Portugal, the old colonial powers", "Cuba and Mexico"], "Think of three allied states.", "They fought Paraguay from 1864 to 1870."),
      tf(L22, 2, 1, "Paraguay's death toll in the war is agreed to be exactly known.", 1, "Estimates are disputed.", "Scholars disagree about the numbers."),
      mc(L22, 3, 2, "What did Bolivia lose in the War of the Pacific?", ["Its coastline", "Its capital city", "Its national language", "Its silver mines"], "It became landlocked.", "Bolivia lost access to the sea."),
      mc(L22, 4, 2, "What resource was linked to the War of the Pacific?", ["Nitrate", "Rubber from the Amazon", "Sugar from the northeast", "Cotton from the lowlands"], "Atacama desert.", "Disputes over nitrate mining were central."),
      tf(L22, 5, 3, "The lesson says borders drawn in the 1880s still influence politics.", 0, "Consider Bolivia's demand.", "Sea access remains a diplomatic issue."),
      // L23
      mc(L23, 1, 1, "Who challenged Porfirio Díaz in 1910?", ["Francisco Madero", "Fidel Castro, a Cuban rebel", "Juan Perón, an Argentine officer", "Getúlio Vargas, a Brazilian leader"], "The Mexican Revolution.", "Madero's challenge began the revolution."),
      tf(L23, 2, 1, "The Cuban Revolution took power in January 1959.", 0, "Batista fled.", "Castro's forces took power then."),
      mc(L23, 3, 2, "What did Cárdenas do in 1938?", ["Nationalised the oil industry", "Abolished slavery", "Declared independence from Spain for Mexico", "Joined Gran Colombia"], "Mexican oil.", "He nationalised oil."),
      mc(L23, 4, 2, "What did Bolivia's 1952 revolution do?", ["Expanded voting rights and nationalised tin mines", "Ended the monarchy", "Created the Inca state", "Banned unions"], "A South American case.", "It was a major social revolution."),
      tf(L23, 5, 3, "Both revolutions inspired some movements and alarmed others.", 0, "Polarisation.", "Reactions differed widely."),
      // L24
      mc(L24, 1, 1, "What did import substitution industrialisation aim to do?", ["Build domestic factories to replace imports", "Increase imports", "End all trade with neighbouring countries and the wider world", "Create colonies"], "Tariffs and state support.", "It sought domestic industry."),
      mc(L24, 2, 1, "Who led Brazil's Estado Novo?", ["Getúlio Vargas", "Juan Perón, an Argentine colonel", "Salvador Allende, a Chilean doctor", "Augusto Pinochet, a Chilean general"], "He was in power from 1930.", "Vargas led it from 1937 to 1945."),
      tf(L24, 3, 2, "Perón was elected president of Argentina in 1946.", 0, "Along with Eva Perón.", "He won enormous worker loyalty."),
      mc(L24, 4, 2, "Why is the term populist contested?", ["Critics and supporters use it differently", "It has no meaning", "It is a legal title", "It refers to the royal rulers of the Inca empire in Cusco"], "Consider how it is used.", "It is used with differing judgments."),
      tf(L24, 5, 3, "Both support and criticism of Perón are part of the historical record.", 0, "Workers versus journalists.", "Experiences differed."),
      // L25
      mc(L25, 1, 1, "Who seized power in Chile on 11 September 1973?", ["Augusto Pinochet", "Salvador Allende", "Juan Perón", "Hugo Chávez"], "The president died in the attack.", "Pinochet overthrew Allende."),
      tf(L25, 2, 1, "Brazil's military regime began in 1964.", 0, "João Goulart was removed.", "It lasted until 1985."),
      mc(L25, 3, 2, "What does disappeared mean in this context?", ["Seized by the state and never seen again", "Moved abroad voluntarily", "Retired from public life after a long career", "Hidden by family"], "Argentina's Dirty War.", "Thousands were taken."),
      mc(L25, 4, 2, "What was Operation Condor?", ["Coordination among Southern Cone intelligence services", "An Inca festival", "A trade treaty", "A regional peace plan signed by all South American governments"], "Mid-1970s.", "It targeted opponents across borders."),
      tf(L25, 5, 3, "The figure of 30,000 disappeared in Argentina is debated.", 0, "Compare commission and rights groups.", "Figures differ."),
      // L26
      mc(L26, 1, 1, "What did Mexico announce in 1982?", ["That it could not service its debt", "That it would rejoin the Spanish empire after 160 years", "A new constitution", "Independence"], "A regional crisis.", "It triggered the debt crisis."),
      tf(L26, 2, 1, "The 1980s are often called the lost decade.", 0, "Incomes stagnated.", "Many countries suffered."),
      mc(L26, 3, 2, "What did Chile's 1988 plebiscite decide?", ["Voters rejected Pinochet's bid to stay in power", "Chile left the UN", "Pinochet won", "Chile became a monarchy"], "Think about what voters were asked.", "The no vote won."),
      mc(L26, 4, 2, "What was Nunca Más?", ["Argentina's 1984 commission report", "A song", "A treaty between Argentina and Chile over borders", "A party"], "Truth commission.", "It documented disappearances."),
      tf(L26, 5, 3, "Economists agree that structural adjustment policies had uniformly good results.", 1, "Evidence is mixed.", "Results are debated."),
      // L27
      mc(L27, 1, 1, "What did the EZLN do on 1 January 1994?", ["Rose up in Chiapas", "Won an election", "Signed a peace treaty with Guatemala", "Founded CONAIE"], "NAFTA day.", "The Zapatistas rose up."),
      mc(L27, 2, 1, "Who was elected Bolivia's president in 2005?", ["Evo Morales", "Hugo Chávez of Venezuela", "Salvador Allende of Chile", "Getúlio Vargas of Brazil"], "Of Aymara roots.", "He was the first Indigenous head of state."),
      tf(L27, 3, 2, "CONAIE was founded in Ecuador in 1986.", 0, "An Indigenous confederation.", "It became a key actor."),
      mc(L27, 4, 2, "What did Colombia's 1991 constitution and 1993 law recognise?", ["Collective land rights for Black communities", "A monarchy", "Slavery", "A state religion for the whole of the Colombian republic"], "Afro-descendant gains.", "These were major gains."),
      tf(L27, 5, 3, "Some Indigenous groups criticised reforms because extractive projects still ignored them.", 0, "Mixed reactions.", "Reforms were celebrated and criticised."),
      // L28
      mc(L28, 1, 1, "What do many studies say about inequality in Latin America?", ["It is among the most unequal regions", "It is the most equal", "It does not exist anywhere in the modern region", "It is rising only in Europe"], "A long-run issue.", "Historians trace it to colonial systems."),
      tf(L28, 2, 1, "Careful historians treat Latin America as one single story.", 1, "Many countries.", "The region is diverse."),
      mc(L28, 3, 2, "Why is the Amazon a central issue?", ["It influences climate and faces deforestation and mining", "It has no people living in it and plays no part in the climate", "It is a desert", "It is in Europe"], "Development versus conservation.", "Indigenous communities are central."),
      mc(L28, 4, 2, "Which habit does the lesson recommend for reading history?", ["Ask who wrote a source and why", "Trust the first source you find and stop reading there", "Ignore estimates", "Avoid disagreement"], "Source criticism.", "Compare accounts that disagree."),
      tf(L28, 5, 3, "The past offers context for the present rather than simple answers.", 0, "Closing idea.", "History helps understanding without dictating outcomes."),
    ],
  },
};
