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

const QS: Question[] = [];
const les = (id: string, title: string, blurb: string, minutes: number, body: string, qs: Question[]) => {
  QS.push(...qs);
  return { id, title, blurb, minutes, body };
};

const L01 = 'history-north-america.l01';
const L02 = 'history-north-america.l02';
const L03 = 'history-north-america.l03';
const L04 = 'history-north-america.l04';
const L05 = 'history-north-america.l05';
const L06 = 'history-north-america.l06';
const L07 = 'history-north-america.l07';
const L08 = 'history-north-america.l08';
const L09 = 'history-north-america.l09';
const L10 = 'history-north-america.l10';
const L11 = 'history-north-america.l11';
const L12 = 'history-north-america.l12';
const L13 = 'history-north-america.l13';
const L14 = 'history-north-america.l14';
const L15 = 'history-north-america.l15';
const L16 = 'history-north-america.l16';
const L17 = 'history-north-america.l17';
const L18 = 'history-north-america.l18';
const L19 = 'history-north-america.l19';
const L20 = 'history-north-america.l20';
const L21 = 'history-north-america.l21';
const L22 = 'history-north-america.l22';
const L23 = 'history-north-america.l23';
const L24 = 'history-north-america.l24';
const L25 = 'history-north-america.l25';
const L26 = 'history-north-america.l26';
const L27 = 'history-north-america.l27';
const L28 = 'history-north-america.l28';
const L29 = 'history-north-america.l29';
const L30 = 'history-north-america.l30';
const L31 = 'history-north-america.l31';
const L32 = 'history-north-america.l32';

const T1 = [
  les(L01, 'Many Peoples, Many Ways of Life', 'Long before 1492, North America was home to hundreds of distinct nations with different languages, economies and governments.', 6,
`Imagine standing in North America in the year 1400. If you walked from the Arctic coast to the deserts of the Southwest, you would pass through hundreds of different nations, speaking many unrelated languages, and living in very different ways. There was no single "Native American culture". Thinking of the continent as empty wilderness before Europeans arrived is a mistake that historians have worked hard to correct.

Archaeologists agree that people have lived in the Americas for many thousands of years, with at least some evidence pointing to more than 15,000 years ago. Exactly when and how the first arrivals came is still actively researched and debated. What is clear is how varied the societies became. In the Arctic, the Inuit and their ancestors hunted seals and whales. Along the Pacific Northwest coast, peoples such as the Tlingit and Kwakwaka'wakw lived on rich salmon runs, built large cedar houses and carved tall poles. On the Great Plains, many nations hunted bison. In the Southwest, Pueblo peoples farmed maize in dry country. In the eastern woodlands, many nations grew maize, beans and squash together and lived in towns.

Population estimates for the land north of Mexico in 1492 range widely, from around two million to well over seven million, because the evidence is thin and scholars weigh it differently. Most history was passed down through spoken tradition, ceremony, and objects such as wampum belts, rather than alphabetic writing. In Mesoamerica, in what is now southern Mexico, the Maya and other peoples did develop writing systems.

A good worked case is food. Eastern peoples often planted maize, beans and squash in the same field. The beans add nitrogen to the soil and the squash shades the ground, so the system fed large communities for generations. This is farming knowledge, not primitive survival.`,
  [
    mc(L01, 1, 1, 'Which description best fits North America in 1400?', ['Hundreds of distinct nations with many languages and ways of life', 'One shared culture spread evenly across the whole continent', 'A thinly peopled wilderness with only a few scattered hunting bands', 'A set of European colonies'], 'Think about variety.', 'The continent held many separate societies with different languages, economies and governments.'),
    tf(L01, 2, 1, 'All Native peoples of North America spoke the same language and lived the same way.', 1, 'Compare the Arctic with the Southwest.', 'There were hundreds of languages and very different economies, from Arctic hunting to desert farming.'),
    mc(L01, 3, 2, 'Why do population estimates for North America in 1492 vary so widely?', ['The evidence is limited and scholars interpret it differently', 'Most of the land was settled only after European contact began', 'Detailed census records survive for most nations but are read differently', 'Scholars agree on the figure but disagree about the date'], 'Consider the sources available.', 'Without written censuses, historians rely on archaeology and later records, so estimates differ.'),
    mc(L01, 4, 2, 'What is the main benefit of planting maize, beans and squash together?', ['The crops support each other and the soil, feeding large communities', 'It exhausts the soil quickly so that fields must be abandoned each year', 'It depends on iron plows and draft animals to work at all', 'It was grown mainly for religious offerings, not for everyday food'], 'Think of how each plant helps the others.', 'Beans add nitrogen and squash shades the soil, so the combination was productive and sustainable.'),
    mc(L01, 5, 3, 'Why is "empty wilderness" a misleading description of pre-1492 North America?', ['It ignores the many established societies that shaped and used the land', 'Because the continent was densely covered in cities everywhere', 'Because European colonists had already built towns across most of it', 'Because the land held no wildlife that people could hunt or use'], 'Whose land was it?', 'Native nations farmed, managed forests with fire, traded and governed across the continent.'),
  ]),
  les(L02, 'Cahokia, Chaco, the Longhouse and Tenochtitlan', 'Four case studies show that North America had large towns, planned architecture, sophisticated governments and cities.', 7,
`Four examples show how complex pre-contact North America was.

Cahokia, near present-day St. Louis, Illinois, was the largest center of the Mississippian culture. It flourished roughly between 1050 and 1200 CE. Its centerpiece, Monks Mound, is the largest earthen mound in the Americas north of Mexico. Estimates of its peak population vary, often placed in the range of ten to twenty thousand people, and scholars still debate how it was governed and why it declined.

In the Southwest, Ancestral Puebloan people built monumental stone "great houses" at Chaco Canyon in present-day New Mexico, most actively from about the 800s to the 1100s, connected by roads to outlying communities. Later, in the 1200s, communities built cliff dwellings at Mesa Verde. Today's Pueblo peoples are their descendants and keep their own histories.

In the Northeast, five nations, the Mohawk, Oneida, Onondaga, Cayuga and Seneca, joined in the Haudenosaunee (Iroquois) Confederacy, guided by the Great Law of Peace. Dates for its founding are debated, with estimates ranging from the 1100s to the 1400s. Clan mothers had real authority, including selecting and advising leaders. The Tuscarora joined later, in the 1720s. Some scholars see its structure as an example of confederal government.

Farther south, the Mexica, often called the Aztecs, built Tenochtitlan on an island in a lake, traditionally founded in 1325. By the early 1500s it led a Triple Alliance with Texcoco and Tlacopan and was among the largest cities in the world, with canals, causeways and markets. Many surrounding peoples paid tribute to it, resentfully.

Worked case: when a Haudenosaunee council met, decisions needed agreement among the nations. This differs from rule by a single king, a useful contrast when you study European monarchies.`,
  [
    mc(L02, 1, 1, 'What is Monks Mound?', ['A very large earthen mound at Cahokia', 'A Spanish mission church built in the Southwest', 'A cliff dwelling built into canyon walls at Mesa Verde', 'A French trading fort on the Great Lakes'], 'It is found at a Mississippian site.', 'Monks Mound is the largest earthwork in the Americas north of Mexico and stood at the heart of Cahokia.'),
    tf(L02, 2, 1, 'Chaco Canyon is in the Southwest and is associated with Ancestral Puebloan people.', 0, 'Think of stone great houses.', 'Chaco Canyon, in present-day New Mexico, held monumental great houses built by Ancestral Puebloans.'),
    mc(L02, 3, 2, 'Which nations were the original five of the Haudenosaunee Confederacy?', ['Mohawk, Oneida, Onondaga, Cayuga and Seneca', 'Cherokee, Creek, Choctaw, Chickasaw and Seminole', 'Lakota, Dakota, Nakota, Cheyenne and Arapaho', 'Navajo, Hopi, Zuni, Apache and Ute'], 'They lived in the Northeast.', 'The Mohawk, Oneida, Onondaga, Cayuga and Seneca formed the confederacy, joined later by the Tuscarora.'),
    mc(L02, 4, 2, 'What does the text say about the date of the Haudenosaunee founding?', ['It is debated, with estimates from roughly the 1100s to the 1400s', 'It is dated precisely to 1776 in colonial treaty records', 'It is fixed by Haudenosaunee records at exactly 1325', 'It took place after the arrival of English settlers in the 1700s'], 'Check the wording about dates.', 'Scholars disagree about when the Confederacy formed, so a single date cannot be stated with certainty.'),
    mc(L02, 5, 3, 'Why did some peoples near Tenochtitlan resent the Triple Alliance?', ['They were required to pay tribute to it', 'It cut off all trade and left subject towns without goods', 'It relied on diplomacy because it had no army of its own', 'It had been founded by Spanish settlers on the lake'], 'Think about obligations to a powerful state.', 'Tribute demands created resentment that later shaped alliances against the Mexica.'),
  ]),
  les(L03, '1492 and the Columbian Exchange', 'Columbus\'s voyage began lasting contact between hemispheres, and the biological exchange that followed changed the world.', 7,
`In August 1492 Christopher Columbus, an Italian navigator sailing for the rulers of Spain, set out west across the Atlantic hoping to reach Asia. In October he landed in the Bahamas, and he went on to Cuba and Hispaniola, where he met the Taino people. Columbus never understood that he had reached lands unknown to Europeans, which is why the Caribbean is still called the West Indies.

Columbus was not the first European to arrive. Norse voyagers reached the island of Newfoundland around the year 1000, and archaeologists have found their settlement at L'Anse aux Meadows. That contact did not last. After 1492, contact did.

Historian Alfred Crosby named the resulting transfer the Columbian Exchange in 1972. It includes plants, animals, people and, above all, diseases. Maize, potatoes, tomatoes, cacao and tobacco crossed the Atlantic east, and in time changed diets and economies in Europe, Africa and Asia. Horses, cattle, pigs, sheep and wheat crossed west. Horses later transformed life on the Great Plains, where many nations built new ways of hunting and travel around them.

The most devastating part was disease. Smallpox, measles and influenza were new to the Americas, so people had no inherited immunity. Epidemics swept through communities, sometimes ahead of the Europeans themselves. Historians agree the loss of life was enormous, though estimates of how large it was vary widely by region and source.

Worked case: when you eat tomato sauce on pasta, you are tasting the Columbian Exchange. Tomatoes came from the Americas, and Italian cooking as we know it did not exist before.`,
  [
    mc(L03, 1, 1, 'What did Columbus originally hope to reach by sailing west?', ['Asia', 'North America', 'Africa', 'Australia'], 'Think about his goal.', 'Columbus expected to reach Asia and mistakenly believed he had, which is why the islands were named the West Indies.'),
    tf(L03, 2, 1, 'Columbus was the first European ever to reach the Americas.', 1, 'Think of the Norse.', 'Norse voyagers reached Newfoundland around 1000, centuries earlier, though that contact did not last.'),
    mc(L03, 3, 2, 'What was the most devastating part of the Columbian Exchange for Indigenous peoples?', ['Epidemic diseases such as smallpox', 'The arrival of new crops that changed how Europeans farmed', 'The spread of tomatoes into Old World kitchens and gardens', 'The spread of maize across Europe, Africa and Asia'], 'People had no prior exposure.', 'Newly introduced diseases killed huge numbers because Indigenous communities had no immunity.'),
    mc(L03, 4, 2, 'Which item moved from the Americas to the Old World?', ['Potatoes', 'Horses, brought by Spanish explorers', 'Wheat, a staple of Old World farming', 'Cattle, raised on Spanish ranches'], 'Choose what Europeans did not already have.', 'Potatoes, maize, tomatoes and cacao originated in the Americas; horses, cattle and wheat were brought from the Old World.'),
    mc(L03, 5, 3, 'Why is the Columbian Exchange a useful concept for historians?', ['It shows that contact changed ecology, food and disease across both hemispheres', 'It proves that only European societies were changed by contact', 'It shows that daily life stayed much the same after 1492', 'It describes the trade in gold and silver between the two hemispheres'], 'Look at the many kinds of things exchanged.', 'The idea links plants, animals and disease to political and social change on both sides of the ocean.'),
  ]),
  les(L04, 'Spanish Conquest and New Spain', 'Spain conquered Mexico with Indigenous allies, built an empire in North America, and met resistance such as the Pueblo Revolt.', 8,
`In 1519 the Spanish adventurer Hernan Cortes landed on the coast of Mexico with several hundred men. He did not conquer the Mexica alone. He allied with Indigenous peoples, notably the Tlaxcalans, who wanted freedom from Mexica tribute. He also received help from Malintzin (known as La Malinche), an Indigenous woman who served as an interpreter. After a long siege and a deadly smallpox epidemic, Tenochtitlan fell in August 1521. The Spanish then built Mexico City on its ruins and created the Viceroyalty of New Spain.

The Spanish crown granted conquistadors the encomienda, the right to demand labor and tribute from Indigenous communities. The system led to terrible abuse. The friar Bartolome de las Casas wrote bitter criticism of it, and the crown issued reform laws in 1542, though enforcement was weak. Spanish missions sought to convert people to Christianity and often suppressed Indigenous religions.

Spain pushed north. Juan Ponce de Leon reached Florida in 1513. St. Augustine, founded in 1565, is the oldest continuously inhabited European-founded city in the continental United States. In 1598 Juan de Onate led settlers into New Mexico.

Indigenous peoples resisted. In 1680 the Pueblo Revolt, organized by leaders including Pope of Ohkay Owingeh, united many Pueblo communities, which had different languages, and drove the Spanish out of New Mexico for roughly twelve years. Spain returned in the 1690s, but the Pueblo kept many traditions.

Worked case: the Tlaxcalans show that the conquest was not simply Spaniards versus Mexica. Different Indigenous peoples made different choices based on their own interests.`,
  [
    mc(L04, 1, 1, 'Which city did the Spanish build over the ruins of Tenochtitlan?', ['Mexico City', 'St. Augustine', 'Santa Fe', 'Quebec'], 'Think of the modern capital.', 'Mexico City was built on the site of Tenochtitlan after 1521.'),
    tf(L04, 2, 1, 'Cortes defeated the Mexica entirely on his own, without Indigenous allies.', 1, 'Recall the Tlaxcalans.', 'Indigenous allies such as the Tlaxcalans were essential to the campaign.'),
    mc(L04, 3, 2, 'What was the encomienda?', ['A grant of Indigenous labor and tribute to a Spanish colonist', 'A treaty dividing Caribbean territory between Spain and France', 'A royal tax collected on silver shipped to Spain', 'A Pueblo ceremony held to honor the harvest and ancestors'], 'It involved labor and tribute.', 'The encomienda gave colonists claims on Indigenous labor and often led to severe exploitation.'),
    mc(L04, 4, 2, 'What did the Pueblo Revolt of 1680 achieve?', ['It drove the Spanish out of New Mexico for about twelve years', 'It ended Spanish rule throughout Mexico and the Caribbean', 'It led to the founding of St. Augustine as a new Spanish base', 'It brought about the fall of Tenochtitlan to Spanish forces'], 'The Spanish returned later.', 'The revolt united Pueblo communities and expelled the Spanish until their return in the 1690s.'),
    mc(L04, 5, 3, 'Why does the Tlaxcalan alliance complicate a "Spaniards versus Aztecs" story?', ['It shows Indigenous groups acted on their own interests and were not one bloc', 'It proves the Spanish won mainly through trickery rather than weapons', 'It shows the Tlaxcalans were Spanish settlers who sided with Cortes', 'It shows the Mexica ruled peacefully and had no rivals among neighbors'], 'Consider tribute and resentment.', 'Many Indigenous peoples allied with Cortes to end Mexica domination, so the conflict had many sides.'),
  ]),
  les(L05, 'French, Dutch and English Footholds', 'Rival European powers planted colonies with different goals, and each depended on relationships with Native nations.', 7,
`By the early 1600s several European powers were competing in North America, each with different aims.

The French focused on the fur trade. Jacques Cartier explored the St. Lawrence River in the 1530s. In 1608 Samuel de Champlain founded Quebec. New France stayed thinly settled but wide-ranging, because the trade depended on partnerships with Native nations such as the Wendat (Huron) and Algonquin, who supplied furs and guided travel by canoe. The French often adopted Native diplomatic customs, since they had little power to force anything.

The Dutch founded New Netherland after Henry Hudson explored the river that now bears his name in 1609. Their trading town of New Amsterdam, on Manhattan, was fairly diverse and focused on trade. The English captured it in 1664 and renamed it New York.

The English founded Jamestown in Virginia in 1607, the first permanent English settlement in what became the United States. It nearly failed from disease and famine. Tobacco, introduced for profit, saved the colony's economy but drove demand for land and labor. In 1620 the Pilgrims, English separatist Protestants, arrived at Plymouth, where the Wampanoag leader Massasoit made an alliance with them. Ten years later the Puritans founded Massachusetts Bay, seeking to build a godly community.

Worked case: compare Quebec and Jamestown. Quebec needed Native trading partners to profit. Jamestown, which wanted land for farming tobacco, soon clashed with the Powhatan people over land. Economic goals shaped relationships with Native nations.`,
  [
    mc(L05, 1, 1, 'Which colony was the first permanent English settlement in what became the United States?', ['Jamestown', 'Quebec', 'New Amsterdam', 'St. Augustine'], 'It was founded in 1607.', 'Jamestown, Virginia, founded in 1607, was the first lasting English settlement.'),
    tf(L05, 2, 1, 'New Amsterdam became New York after the English captured it in 1664.', 0, 'It was Dutch before.', 'The English took New Netherland in 1664 and renamed its main town New York.'),
    mc(L05, 3, 2, 'What was the main economic basis of New France?', ['The fur trade with Native nations', 'Tobacco plantations along the St. Lawrence', 'Silver mining in the northern interior', 'Rice farming on large coastal estates'], 'Think of furs and canoes.', 'New France depended on trading with Native nations for furs.'),
    mc(L05, 4, 2, 'What helped save Jamestown economically?', ['Tobacco', 'Silver', 'Fur', 'Whaling'], 'It was a cash crop.', 'Tobacco brought profit, though it also increased demand for land and labor.'),
    mc(L05, 5, 3, 'Why did the French tend to adopt Native diplomatic customs?', ['They depended on Native partners and had little power to force them', 'They kept a very large army in America and used it to win obedience', 'They saw Native nations as unimportant to colonial success', 'They hoped the customs would hide their activity from English rivals'], 'Think about relative power and trade.', 'A small French population in a trade-based colony needed alliances, so diplomacy mattered.'),
  ]),
];

const T2 = [
  les(L06, 'The Atlantic Slave Trade and Slavery in North America', 'Millions of Africans were forced across the Atlantic, and slavery became a hereditary, race-based system in the English colonies.', 8,
`Slavery existed in many societies, but the Atlantic slave trade created something particularly harsh: a system in which people were bought and sold as property, in which status passed from mother to child, and in which race was used to justify it. Portuguese traders began taking captives from West Africa in the 1400s, and over some 350 years European ships carried roughly 12 million people from Africa across the Atlantic. Most were taken to Brazil and the Caribbean sugar islands. Historians estimate that around 400,000 were taken to the mainland that became the United States, though numbers vary by database and method. Many captives died on the Middle Passage, the sea voyage, and many more in the violence of capture and march.

In 1619 a ship brought about twenty enslaved Africans to Point Comfort, Virginia. Their legal status in these first years was unclear, and some Africans gained freedom. Over the following decades laws hardened. In 1662 Virginia declared that children would follow the status of the mother, making slavery hereditary. Other colonies passed similar slave codes, and "slave" and "Black" came to be linked in law.

Enslaved labor built the colonial economy, especially in tobacco, rice and indigo regions. Slavery also existed in the northern colonies, including New York and New England, though on a smaller scale. Enslaved people resisted in many ways, from slowing work and running away to open revolt. In 1739 the Stono Rebellion in South Carolina saw enslaved people march toward Spanish Florida before being put down.

Worked case: the 1662 Virginia law explains why slavery lasted for generations. Once status passed through the mother, enslavers gained a growing workforce without new purchases.`,
  [
    tf(L06, 1, 1, 'Most enslaved Africans taken across the Atlantic went to Brazil and the Caribbean.', 0, 'Think about sugar.', 'Most captives were taken to Brazil and the Caribbean, and a smaller share to North America.'),
    mc(L06, 2, 1, 'What did Virginia\'s 1662 law establish?', ['Children would follow the legal status of their mother', 'Slavery was abolished in Virginia and replaced with contracts', 'Africans could no longer be brought into the colony', 'Enslaved people could vote once they owned property'], 'It changed who was born into slavery.', 'The law made slavery hereditary through the mother.'),
    mc(L06, 3, 2, 'What was the Middle Passage?', ['The sea voyage that carried captive Africans across the Atlantic', 'A road through the Appalachians used by early settlers', 'A treaty between France and Spain over slave trading rights', 'A British tax on sugar shipped from the Caribbean'], 'It was a journey across the ocean.', 'The Middle Passage was the Atlantic crossing, during which many captives died.'),
    mc(L06, 4, 2, 'What was the Stono Rebellion?', ['A 1739 uprising of enslaved people in South Carolina', 'A revolt of colonists in the Carolinas against royal taxes', 'A war between French and Spanish forces over Florida', 'A Native alliance formed to drive settlers out of Jamestown'], 'It occurred in South Carolina.', 'In 1739 enslaved people near the Stono River rose and headed for Spanish Florida.'),
    mc(L06, 5, 3, 'Why does the text say the Atlantic system was distinctive?', ['Status was hereditary, treated as property and justified by race', 'It was the first time that slavery had existed anywhere in the world', 'Only the northern colonies practiced it, on a small scale', 'It faded quickly once colonies were established'], 'Look at the three features named.', 'Hereditary, race-based chattel slavery on a vast scale set the Atlantic system apart.'),
  ]),
  les(L07, 'Colonial Societies: New England, the Middle Colonies and the South', 'The thirteen British colonies developed regional differences in religion, economy, labor and government.', 7,
`By the mid-1700s Britain held thirteen colonies on the Atlantic coast, and they were quite different from one another. By 1775 their population was roughly 2.5 million people, of whom about one in five was of African descent, most of them enslaved.

New England was settled largely by Puritans seeking to reform the Church of England. They built towns around a meetinghouse and a church, practiced local self-government through town meetings, and earned a living from small farms, fishing, shipbuilding and trade. Conformity was demanded; dissenters such as Roger Williams, who founded Rhode Island, were banished. In 1692 fear and suspicion led to the Salem witch trials, in which twenty people were executed.

The Middle Colonies, including New York, New Jersey and Pennsylvania, were more diverse in religion and ethnicity. Pennsylvania, founded in 1681 by the Quaker William Penn, practiced religious toleration and grew quickly as a farming and trading region.

In the Chesapeake region, tobacco dominated. Planters first relied on indentured servants, who worked for a fixed term in exchange for passage, and then increasingly on enslaved Africans. Farther south, the Carolinas and Georgia grew rice and indigo, and in South Carolina enslaved people became a majority of the population.

All colonies had some form of representative assembly. Virginia's House of Burgesses first met in 1619. Voting was limited mostly to free, property-owning men, and women who married lost most legal rights under a system called coverture.

Worked case: compare Boston and Charleston. Boston was a port with merchants and small farms; Charleston was built on rice plantations worked by enslaved people. Their interests would later diverge sharply.`,
  [
    mc(L07, 1, 1, 'Who founded Pennsylvania in 1681?', ['William Penn', 'Roger Williams', 'Samuel de Champlain', 'John Smith'], 'He was a Quaker.', 'William Penn founded Pennsylvania as a place of religious toleration.'),
    tf(L07, 2, 1, 'Tobacco was the dominant cash crop of the Chesapeake region.', 0, 'Think of Virginia and Maryland.', 'Tobacco shaped the economy and labor system of the Chesapeake.'),
    mc(L07, 3, 2, 'What was an indentured servant?', ['A person who worked for a fixed term in exchange for passage or other terms', 'An enslaved person held in bondage for life by law', 'A colonial governor appointed by the Crown', 'A town minister chosen by the congregation'], 'It involved a contract with an end date.', 'Indentured servants agreed to work for years, unlike enslaved people whose bondage was lifelong.'),
    mc(L07, 4, 2, 'Which colony was founded by Roger Williams after he was banished from Massachusetts?', ['Rhode Island', 'Virginia, the first English colony', 'Georgia, founded later as a refuge for debtors', 'New Jersey, a colony granted to proprietors'], 'He was a religious dissenter.', 'Roger Williams founded Rhode Island after Massachusetts expelled him.'),
    mc(L07, 5, 3, 'Why did the colonies develop differently from one another?', ['Geography, religion and labor systems shaped each region\'s economy and society', 'They were each ruled by a different European country', 'They shared nearly identical economies based on the same crops', 'They had little contact with Europe and developed in isolation'], 'Consider climate, crops and settlers.', 'Climate and crops, along with the aims of settlers, created distinct regional societies.'),
  ]),
  les(L08, 'Native Nations and Colonists: Trade, Alliance and War', 'Native nations were political powers who traded, allied and fought with Europeans, and colonial expansion brought devastating wars.', 8,
`Native nations were not passive bystanders. They were governments with armies, diplomacy and strategies of their own. Historians often describe the early relationship as a mix of trade, alliance, mutual dependence and conflict, and the balance shifted as European populations grew.

In Virginia, Wahunsenacawh, known as Powhatan, led a confederacy of many communities. Early cooperation with Jamestown collapsed into fighting. Wars in 1622 and 1644 followed, and the Powhatan lost land and power as colonists multiplied.

In New England, the Pequot War of 1636 to 1637 ended with the destruction of Pequot power, including the burning of a village at Mystic. After about forty years of uneasy peace, King Philip's War began in 1675. Metacom, a Wampanoag leader known to the English as King Philip, resisted the pressure on land and authority from the English colonies. The war lasted until 1676 and was devastating on both sides. In proportion to population, it was among the bloodiest wars in American history, and many Native people were killed or sold into slavery.

Farther west, the Haudenosaunee fought the Beaver Wars against rival nations in the 1600s and later used careful diplomacy, balancing between the French and English. French and Native partners in the Great Lakes developed what historian Richard White called the "middle ground", a space where neither side could dominate and each adapted to the other's customs.

Worked case: land sales show misunderstanding. Many Native peoples thought they were sharing use of land, while Europeans believed they had bought it outright. Historians debate how often this was a genuine misunderstanding and how often it was deliberate pressure.`,
  [
    mc(L08, 1, 1, 'Who was Metacom, known to the English as King Philip?', ['A Wampanoag leader who fought the English in 1675', 'A Powhatan chief who led resistance in Virginia', 'A Dutch governor who ruled New Amsterdam', 'A French explorer who mapped the Great Lakes'], 'He led a war in New England.', 'Metacom led Wampanoag resistance in King Philip\'s War.'),
    tf(L08, 2, 1, 'Native nations had their own governments, diplomacy and military strategies.', 0, 'Think of them as political powers.', 'Native nations acted as sovereign powers, negotiating, allying and fighting.'),
    mc(L08, 3, 2, 'What does "middle ground" describe?', ['A region where neither Natives nor French could dominate and both adapted', 'A treaty line separating Native and colonial territory', 'A farm tool used to plant maize in mounds', 'A Spanish mission style combining church and farm'], 'It describes balance.', 'Richard White used it for Great Lakes relationships built on mutual accommodation.'),
    mc(L08, 4, 2, 'What happened to Pequot power after 1637?', ['It was destroyed by the English and their allies', 'It grew into a large empire that dominated New England', 'It joined the Dutch in a lasting military alliance', 'It was largely unaffected and continued as before'], 'It was a war outcome.', 'The Pequot War ended with the destruction of Pequot power.'),
    mc(L08, 5, 3, 'Why do historians urge caution about colonial land "purchases"?', ['The two sides may have understood the transaction differently', 'No land was ever actually bought or sold by colonists', 'Native nations never traded with Europeans at all', 'The surviving documents are all later forgeries'], 'Think about meaning of ownership.', 'Differences in ideas about land use and ownership, and sometimes pressure, make such deals contested.'),
  ]),
];

const T3 = [
  les(L09, 'From Imperial War to Revolution', 'Victory in the Seven Years\' War left Britain in debt, and new taxes and rules led colonists toward protest and resistance.', 8,
`The road to the American Revolution began with a war. The Seven Years' War, fought from 1754 to 1763 and called the French and Indian War in the United States, pitted Britain against France, each with Native allies. Britain won. In the Treaty of Paris of 1763 France gave up Canada and its claims east of the Mississippi River to Britain. Spain had already received French Louisiana west of the river through a separate secret agreement, the Treaty of Fontainebleau of 1762.

Victory was expensive. Britain had a large debt and now a large empire to defend. It tried to raise money from the colonies and to avoid more frontier wars. The Proclamation of 1763 banned colonial settlement west of the Appalachians, angering colonists and land speculators, even as Native nations such as those led by Pontiac were already fighting to resist British expansion into the Ohio country.

Then came taxes. The Stamp Act of 1765 taxed printed paper. Colonists argued that only their own elected assemblies could tax them, summed up in the slogan "no taxation without representation." Protest, boycotts and crowd actions forced Parliament to repeal the act in 1766. Later duties, such as the Townshend taxes, brought more protest. In March 1770 British soldiers fired on a crowd in Boston, killing five people, an event colonists called the Boston Massacre. In December 1773 protesters dumped tea into Boston Harbor to resist the Tea Act. Parliament responded in 1774 with the Coercive Acts, which colonists called the Intolerable Acts, and delegates met in the First Continental Congress that fall.

Worked case: notice that most colonists did not begin in 1765 wanting independence. They wanted their rights as British subjects. Independence grew from the escalating cycle of measures and resistance, and not everyone agreed it was the right path.`,
  [
    mc(L09, 1, 1, 'What did Britain gain in the Treaty of Paris of 1763?', ['Canada and French claims east of the Mississippi', 'All of Mexico and the Spanish colonies', 'Florida only, with no land in Canada', 'Independence for the thirteen colonies from the Crown'], 'Britain won the war.', 'France ceded Canada and its lands east of the Mississippi to Britain.'),
    tf(L09, 2, 1, 'The Stamp Act of 1765 taxed printed materials such as paper.', 0, 'The name gives a clue.', 'The Stamp Act taxed printed documents and provoked widespread colonial protest.'),
    mc(L09, 3, 2, 'What did the Proclamation of 1763 do?', ['Banned colonial settlement west of the Appalachians', 'Declared independence from the British Crown', 'Created the Continental Army under George Washington', 'Taxed tea imported into the colonies by Parliament'], 'It dealt with western land.', 'The proclamation tried to limit settlement and avoid frontier wars, but angered many colonists.'),
    mc(L09, 4, 2, 'What event of December 1773 involved dumping tea into the harbor?', ['The Boston Tea Party', 'The Boston Massacre, in which soldiers fired on a crowd', 'The Stono Rebellion, an uprising in South Carolina', 'Shays Rebellion, an uprising of Massachusetts farmers'], 'It happened in Boston Harbor.', 'Protesters destroyed tea in protest of the Tea Act.'),
    mc(L09, 5, 3, 'Why did colonists object to Parliament taxing them?', ['They argued only their elected assemblies should tax them', 'They did not buy any goods from Britain and so owed no taxes', 'They wanted Britain to raise taxes in order to pay war debts', 'They had no assemblies of their own to speak for them'], 'The slogan names the issue.', 'Colonists claimed taxation without representation violated their rights as British subjects.'),
  ]),
  les(L10, 'The War of Independence', 'The Revolution was a war between Britain and the colonies, but also a civil war and a conflict involving Native nations and enslaved people.', 8,
`The fighting began on April 19, 1775, when British troops and colonial militia clashed at Lexington and Concord, Massachusetts. The Second Continental Congress created a Continental Army under George Washington, and on July 4, 1776, it adopted the Declaration of Independence. Its ideas and text are covered in the founding documents course, so here we follow the war itself.

Early on, the Continental Army suffered defeats. The turning point was the American victory at Saratoga, New York, in October 1777, which helped persuade France to ally with the Americans in 1778. French money, ships and troops proved crucial. Washington's army endured a hard winter at Valley Forge in 1777 to 1778. In 1781, with French naval support, American and French forces trapped a British army at Yorktown, Virginia, and it surrendered in October. The Treaty of Paris of 1783 recognized American independence.

The war divided people. Loyalists, who stayed loyal to the Crown, were a substantial minority, and many left for Canada, Britain or elsewhere after the war. Enslaved people made their own choices. In 1775 Virginia's royal governor, Lord Dunmore, promised freedom to enslaved people owned by rebels who joined the British, and thousands sought freedom behind British lines. Many Black men also fought for the patriots. Native nations were divided as well. The Haudenosaunee Confederacy split, with most nations supporting Britain, and in 1779 the Sullivan Campaign destroyed many Haudenosaunee towns. The treaty of 1783 transferred land to the United States without including Native nations in the talks.

Worked case: ask who gained freedom from the Revolution. Many white men gained political independence, while enslaved people and Native nations often gained little or lost ground.`,
  [
    mc(L10, 1, 1, 'Which battle in 1777 helped bring France into the war as an American ally?', ['Saratoga', 'Yorktown', 'Lexington', 'Bull Run'], 'It took place in New York.', 'The American victory at Saratoga helped convince France to ally with the United States.'),
    tf(L10, 2, 1, 'The Treaty of Paris of 1783 recognized American independence.', 0, 'It ended the war.', 'The treaty ended the war and recognized the United States.'),
    mc(L10, 3, 2, 'What did Lord Dunmore\'s 1775 proclamation promise?', ['Freedom to enslaved people of rebels who joined the British', 'Land in the west for all Loyalists who served the Crown', 'Independence for Virginia if it left the rebellion', 'Peace with Native nations along the western frontier'], 'It concerned enslaved people.', 'Dunmore offered freedom to enslaved people owned by rebels who joined British forces.'),
    mc(L10, 4, 2, 'How were Native nations affected by the war?', ['They were divided, and many lost land and towns', 'They all supported the United States and received land for it', 'They stayed out of the war and kept their lands unchanged', 'They all gained recognized independence under the peace treaty'], 'The Haudenosaunee split.', 'Native nations took different sides, and the peace did not protect their lands.'),
    mc(L10, 5, 3, 'Why do historians call the Revolution partly a civil war?', ['Colonists fought one another as Loyalists and Patriots', 'Britain had no army in America and relied on colonists alone', 'Only the French fought, with Americans staying neutral', 'It was fought without any real battles between armies'], 'Consider who stayed loyal.', 'Americans were divided between Patriots and Loyalists, and fought each other as well as the British.'),
  ]),
  les(L11, 'Building a Government: Articles, Convention and Compromise', 'The first national government proved weak, and the Constitution of 1787 emerged from fierce debate and compromise, including over slavery.', 8,
`After independence, the states needed a government. The Articles of Confederation, ratified in 1781, created a loose league of states with a weak Congress. Congress could not tax, and it could not force states to obey. Problems mounted: war debts went unpaid, states quarreled over trade, and in 1786 to 1787 Shays' Rebellion, an uprising of indebted farmers in Massachusetts, convinced many leaders that a stronger national government was needed.

In the summer of 1787 delegates met in Philadelphia, originally to revise the Articles, and wrote an entirely new Constitution. Debate was fierce. Large states wanted representation by population, small states wanted equality. The Great Compromise created a House based on population and a Senate with two members per state.

Slavery shaped the bargain. Under the three-fifths clause, each enslaved person counted as three-fifths of a person for representation and taxes, which gave slaveholding states more power in the House. The delegates also agreed that Congress could not ban the international slave trade until 1808. The words "slave" and "slavery" were avoided in the text. Some delegates found slavery wrong but compromised to keep the union together, and historians still debate how to weigh those choices.

Ratification required nine of thirteen states. Federalists, who supported the Constitution, argued for a stronger union. Anti-Federalists feared a distant, powerful government and demanded protections for individual rights. New Hampshire became the ninth state to ratify in June 1788. The Bill of Rights, the first ten amendments, followed in 1791. For the texts and arguments themselves, see the founding documents course.

Worked case: the three-fifths clause shows that compromise can be both practical and morally costly.`,
  [
    mc(L11, 1, 1, 'What was a major weakness of the Articles of Confederation?', ['Congress could not tax', 'The president had too much power', 'The Senate was too large', 'There were no states'], 'Think about money.', 'Congress could request money but could not tax directly.'),
    tf(L11, 2, 1, 'The Great Compromise created a House based on population and a Senate with equal representation.', 0, 'Think of large and small states.', 'It balanced the demands of large and small states.'),
    mc(L11, 3, 2, 'What did the three-fifths clause do?', ['Counted each enslaved person as three-fifths for representation and taxes', 'Freed enslaved people after a fixed term of years', 'Created the Senate with two members per state', 'Banned the slave trade immediately across the nation'], 'It related to representation.', 'The clause increased the power of slaveholding states in the House.'),
    mc(L11, 4, 2, 'What group argued the Constitution needed added protections for individual rights?', ['Anti-Federalists', 'Loyalists, who stayed loyal to Britain', 'Federalists, who backed the Constitution as written', 'Confederates, who later left the Union'], 'They feared a distant government.', 'Anti-Federalists pushed for a Bill of Rights, which was added in 1791.'),
    mc(L11, 5, 3, 'Why did Shays\' Rebellion matter?', ['It convinced many leaders the Articles were too weak', 'It ended the war and forced the British to leave the states', 'It led delegates to create the Senate as a compromise', 'It led several states to end slavery within their borders'], 'It was an uprising of indebted farmers.', 'The rebellion showed the national government could not easily keep order, boosting reform efforts.'),
  ]),
  les(L12, 'The Early Republic', 'The young nation argued over its economy and identity, doubled in size, and fought Britain again, while slavery and exclusion continued.', 8,
`George Washington became the first president in 1789. Two of his advisers drew different visions. Alexander Hamilton, the Treasury Secretary, wanted a strong national government, a national bank, and federal assumption of state debts, to build commerce and credit. Thomas Jefferson and James Madison feared that this favored merchants and threatened liberty, and preferred an agrarian republic. Their disagreements helped create the first political parties, the Federalists and the Democratic-Republicans, though Washington warned against party spirit.

The new republic tested its limits. The Alien and Sedition Acts of 1798 criminalized some criticism of the government, which Jeffersonians called unconstitutional. The election of 1800 saw the first peaceful transfer of power between opposing parties. In 1803 Marbury v. Madison established the Supreme Court's power of judicial review, the authority to strike down laws that conflict with the Constitution.

That same year Jefferson bought the Louisiana Territory from France for $15 million, roughly doubling the size of the country. France was willing to sell partly because of the Haitian Revolution, in which enslaved people rebelled and eventually founded Haiti in 1804. Lewis and Clark explored the new land from 1804 to 1806 with help from Native guides, including Sacagawea. The land was not empty; many Native nations lived there.

The War of 1812 against Britain ended in stalemate, but it fueled national confidence and weakened Native resistance in the Old Northwest. Congress ended the international slave trade in 1808, but domestic slavery grew. Voting was mostly for white men, and gradually states dropped property requirements.

Worked case: the Louisiana Purchase was a bargain between governments about land that Native nations already lived on.`,
  [
    mc(L12, 1, 1, 'Which land did the United States buy from France in 1803?', ['The Louisiana Territory', 'Florida, which was acquired from Spain', 'Texas, which was annexed after independence', 'Alaska, which was purchased from Russia'], 'It doubled the nation\'s size.', 'The Louisiana Purchase roughly doubled U.S. territory.'),
    tf(L12, 2, 1, 'Marbury v. Madison established judicial review.', 0, 'It was a Supreme Court case.', 'The 1803 case established the Court\'s power to strike down unconstitutional laws.'),
    mc(L12, 3, 2, 'Which pair disagreed about Hamilton\'s national bank and economic plan?', ['Hamilton and Jefferson', 'Lewis and Clark', 'Washington and Dunmore', 'Madison and Marbury'], 'They led early factions.', 'Hamilton\'s plan was opposed by Jefferson and Madison, helping start party politics.'),
    mc(L12, 4, 2, 'How did the Haitian Revolution relate to the Louisiana Purchase?', ['It weakened France\'s interest in holding Louisiana', 'It created Louisiana as a separate republic of freed people', 'It was fought mainly on Louisiana soil against American troops', 'It had no relation to the sale, which was planned in advance'], 'Think about French priorities.', 'France lost its hope of a New World empire in Haiti and chose to sell Louisiana.'),
    mc(L12, 5, 3, 'Why is it incomplete to say the Louisiana Purchase gave the U.S. "empty" land?', ['Many Native nations lived there and had not agreed to the sale', 'No one lived there except a few trappers and traders', 'France had already settled it fully with farms and towns', 'It was almost entirely covered by water and unsuitable for settlement'], 'Who actually lived there?', 'The purchase transferred a European claim, not Native ownership.'),
  ]),
];

const T4 = [
  les(L13, 'Cotton, Removal and the Trail of Tears', 'Cotton\'s growth and settler demand for land led to the forced removal of Native nations from the Southeast.', 8,
`The cotton gin, patented in 1794, made it far easier to process short-staple cotton. Cotton became the nation's leading export, and the demand for land and enslaved labor surged. Planters wanted the fertile land of the Southeast, where five nations, the Cherokee, Muscogee (Creek), Chickasaw, Choctaw and Seminole, lived. White Americans called them the "Five Civilized Tribes", a label that reflected their own prejudice. Many of these nations had adopted written constitutions, farms and schools. The Cherokee had a syllabary, a writing system invented by Sequoyah around 1821, and a newspaper.

President Andrew Jackson backed removal. In 1830 Congress passed the Indian Removal Act, which authorized the president to negotiate exchanges of Native land in the East for land west of the Mississippi. Supporters called it humane; critics, including some members of Congress, called it unjust.

The Cherokee went to court. In Cherokee Nation v. Georgia (1831) Chief Justice John Marshall described Native nations as "domestic dependent nations." In Worcester v. Georgia (1832) the Court held that Georgia could not extend its laws over Cherokee territory. But the federal government did not act to enforce the decision. A small minority faction signed the Treaty of New Echota in 1835, though the elected Cherokee leadership, including John Ross, opposed it. In 1838 and 1839, federal troops forced about 16,000 Cherokee west in a march known as the Trail of Tears. Commonly cited estimates start at about 4,000 Cherokee deaths from disease, cold and hunger, and some scholars give higher totals across all the removed nations.

Other nations were also removed, and Seminoles fought long wars in Florida.

Worked case: Worcester v. Georgia shows that a legal victory can still fail without political will to enforce it.`,
  [
    mc(L13, 1, 1, 'What law of 1830 authorized negotiating Native land exchanges west of the Mississippi?', ['The Indian Removal Act', 'The Homestead Act, which offered western land to settlers', 'The Stamp Act, a tax on printed materials', 'The Dawes Act, which divided Native land into individual plots'], 'It is named for removal.', 'The Indian Removal Act set the stage for forced relocations.'),
    tf(L13, 2, 1, 'The Supreme Court ruled in Worcester v. Georgia that Georgia could not extend its laws over Cherokee territory.', 0, 'It favored the Cherokee legally.', 'The Court sided with the Cherokee, but the decision was not enforced.'),
    mc(L13, 3, 2, 'Why was the Treaty of New Echota controversial?', ['It was signed by a minority faction, not the elected Cherokee leadership', 'It was signed by all Cherokee leaders under pressure from troops', 'It gave the Cherokee permanent title to their land in Georgia', 'It was signed by Jackson alone, without any Cherokee present'], 'Consider who signed.', 'Most Cherokee, led by John Ross, rejected the treaty as illegitimate.'),
    mc(L13, 4, 2, 'What technology boosted the demand for land and enslaved labor in the South?', ['The cotton gin', 'The telegraph', 'The steam train', 'The reaper'], 'It processed a crop.', 'Easier processing of cotton increased its profitability and the demand for more land and labor.'),
    mc(L13, 5, 3, 'What does the phrase "five civilized tribes" reveal?', ['A prejudiced European-American label, even though the nations had their own sophisticated governments', 'That only five Native nations existed in the southeastern United States', 'That removal was fair because those nations had been treated as equals', 'That Native nations had no governments or laws of their own before contact'], 'Consider who coined the phrase.', 'The label reflected white standards of "civilization" and ignored longstanding Native institutions.'),
  ]),
  les(L14, 'Texas, Manifest Destiny and the Mexican-American War', 'Expansion into Texas and the Southwest led to war with Mexico and a vast transfer of territory.', 8,
`Mexico won independence from Spain in 1821 and invited settlers into its northern province of Texas. Many came from the United States, led at first by Stephen F. Austin, and many brought enslaved people. Mexico had been moving against slavery and abolished it in 1829, though Texas gained exceptions, and tensions grew over slavery, language, religion and political control.

The Texas Revolution began in 1835. Texans, including some Tejanos who supported the rebellion, fought the Mexican army of General Santa Anna. The siege of the Alamo in March 1836 ended with the death of its defenders; Texans won a decisive victory at San Jacinto in April 1836 and formed the Republic of Texas. The United States annexed Texas in 1845, and the border was disputed: Texas claimed the Rio Grande, while Mexico claimed the Nueces River.

The phrase "Manifest Destiny," coined in 1845 by journalist John O'Sullivan, expressed the belief that the nation was destined to spread across the continent. Not all Americans agreed. President James K. Polk sent troops into the disputed area, fighting began, and Congress declared war in May 1846. U.S. forces took California and New Mexico and captured Mexico City in September 1847.

The Treaty of Guadalupe Hidalgo (1848) ended the war. Mexico ceded land that became California, Nevada, Utah and most of Arizona and New Mexico, plus parts of other states, in exchange for $15 million. Mexicans living there could become U.S. citizens, but many lost land and rights. The Wilmot Proviso, an unsuccessful 1846 proposal to ban slavery in the new lands, showed that the question of slavery's expansion was becoming central. Gold discovered in California in 1848 brought a rush of settlers.

Worked case: the Nueces versus Rio Grande dispute shows how a border disagreement became a justification for war.`,
  [
    mc(L14, 1, 1, 'Which treaty ended the Mexican-American War?', ['Guadalupe Hidalgo', 'Paris, which ended the American Revolution', 'Ghent, which ended the War of 1812', 'Versailles, which ended the First World War'], 'It is named for a Mexican town.', 'The 1848 treaty transferred a huge territory from Mexico to the United States.'),
    tf(L14, 2, 1, 'Texas became part of the United States through annexation in 1845.', 0, 'It was an independent republic first.', 'Texas was an independent republic from 1836 until it was annexed in 1845.'),
    mc(L14, 3, 2, 'What did "Manifest Destiny" express?', ['The belief that the nation was meant to spread across the continent', 'A treaty that set the boundary with Mexico', 'A law banning slavery in the western territories', 'A military strategy for defeating Mexico quickly'], 'Think of expansion.', 'The phrase justified expansion, though many Americans opposed it.'),
    mc(L14, 4, 2, 'What was the Wilmot Proviso?', ['A proposal to ban slavery in lands won from Mexico', 'A treaty with Britain that divided the Oregon Country', 'A tax law to pay for the war with Mexico', 'A peace plan that settled the boundary with Texas'], 'It concerned slavery.', 'It did not pass, but it intensified the debate over slavery in the territories.'),
    mc(L14, 5, 3, 'Why was the border dispute significant?', ['Polk used troops in the disputed area, and fighting led to war', 'It was settled peacefully by a commission before the war', 'It created the Republic of Texas out of Mexican land', 'It had no effect, since Congress had already voted for war'], 'Consider the two river claims.', 'Fighting in the disputed zone gave Polk grounds to ask for war.'),
  ]),
  les(L15, 'Antebellum America: Reform, Cotton and Resistance', 'Before the Civil War, the North and South changed in different directions while abolitionists and enslaved people fought slavery.', 8,
`The decades before the Civil War, often called the antebellum period, were a time of both reform and deep division.

A wave of religious revival, the Second Great Awakening, helped spark reform movements: temperance, public education, care for the mentally ill (led by Dorothea Dix), and above all the fight against slavery. In 1831 William Lloyd Garrison began publishing The Liberator, demanding immediate abolition. Frederick Douglass, who escaped slavery in 1838, became one of the most powerful speakers and writers of the movement. Harriet Tubman escaped and then helped many others reach freedom through the Underground Railroad, a network of safe houses and routes, and Black communities, free and enslaved, were central to its operation.

In July 1848 reformers including Elizabeth Cady Stanton and Lucretia Mott held the Seneca Falls Convention for women's rights, and approved a Declaration of Sentiments modeled on the Declaration of Independence.

The North grew with factories, canals, railroads and cities, and public schools expanded. The South, in contrast, remained agricultural and bound to slavery. By 1860 nearly four million people were enslaved. Cotton, grown on enslaved labor, was the nation's leading export. Enslaved families lived under the threat of sale and separation, and resisted in many ways. In 1831 Nat Turner led a revolt in Virginia; it was crushed, and southern states tightened laws. Free Black people lived in both regions but faced discrimination, even in the North.

Worked case: Douglass's life shows both slavery's cruelty and the power of testimony. His autobiographies became bestsellers and helped turn public opinion against slavery.`,
  [
    mc(L15, 1, 1, 'Who published The Liberator, an abolitionist newspaper, beginning in 1831?', ['William Lloyd Garrison', 'Frederick Douglass, who later edited the North Star', 'Nat Turner, who led an 1831 slave uprising in Virginia', 'Dorothea Dix, who campaigned to reform asylums and prisons'], 'He demanded immediate abolition.', 'Garrison\'s paper was a leading voice for immediate abolition.'),
    tf(L15, 2, 1, 'The Seneca Falls Convention of 1848 focused on women\'s rights.', 0, 'Think of Stanton and Mott.', 'It was a landmark convention for women\'s rights, producing the Declaration of Sentiments.'),
    mc(L15, 3, 2, 'What was the Underground Railroad?', ['A network of people and routes helping enslaved people escape', 'A subway system built beneath northern cities', 'A railroad company that carried freight and passengers north', 'A Confederate supply line that moved troops during the war'], 'It was not literally underground.', 'It was a secret network that assisted people fleeing slavery.'),
    mc(L15, 4, 2, 'Roughly how many people were enslaved in the United States by 1860?', ['Nearly four million', 'About 50,000', 'About half a million', 'About ten million'], 'The number grew greatly.', 'The 1860 census counted nearly four million enslaved people.'),
    mc(L15, 5, 3, 'Why were Douglass\'s autobiographies influential?', ['They gave firsthand testimony that shifted public opinion', 'They were government documents compiled by federal agents', 'They were novels with invented stories meant to entertain readers', 'They ended slavery by law once Congress read them'], 'Consider the value of eyewitness accounts.', 'Firsthand testimony made slavery\'s realities harder to dismiss.'),
  ]),
  les(L16, 'The Road to Civil War', 'A series of political crises over the expansion of slavery pulled the nation apart between 1820 and 1861.', 8,
`Every time the United States gained territory, a question arose: would slavery be allowed there? The answer shaped national politics for decades.

The Missouri Compromise of 1820 admitted Missouri as a slave state and Maine as a free state, and banned slavery in most of the Louisiana Purchase north of the 36°30′ line. The Mexican cession reopened the issue. The Compromise of 1850 admitted California as a free state but included a harsh Fugitive Slave Act, which required citizens to help capture people who had escaped slavery, and it angered many in the North.

The Kansas-Nebraska Act of 1854 let settlers vote on slavery in those territories, which overturned the Missouri line. Violence broke out in Kansas, known as Bleeding Kansas. In 1857 the Supreme Court decided Dred Scott v. Sandford. Chief Justice Roger Taney wrote that people of African descent could not be citizens and that Congress could not ban slavery in the territories. Many northerners were outraged. In 1859 John Brown, an abolitionist, led a raid at Harpers Ferry, Virginia, hoping to spark a slave uprising; he was captured and hanged, hated in much of the South and honored by many in the North.

Abraham Lincoln, of the new Republican Party, won the presidency in November 1860 without carrying a single southern state. Lincoln opposed the extension of slavery but promised not to interfere with it where it existed. Even so, South Carolina seceded in December 1860, and by early 1861 seven states had formed the Confederacy; four more joined after fighting began.

Worked case: historians note that the secession declarations of several states named slavery directly. Later claims that the war was about something else, such as states' rights, have to answer the question: rights to do what?`,
  [
    mc(L16, 1, 1, 'Which decision held that Black Americans could not be citizens and that Congress could not ban slavery in the territories?', ['Dred Scott v. Sandford', 'Marbury v. Madison', 'Worcester v. Georgia', 'Brown v. Board of Education'], 'It was decided in 1857.', 'The Dred Scott decision was a major cause of sectional anger.'),
    tf(L16, 2, 1, 'Abraham Lincoln won the 1860 election without winning any southern states.', 0, 'He was a Republican.', 'Lincoln won through the northern states, and southern states then began to secede.'),
    mc(L16, 3, 2, 'What did the Kansas-Nebraska Act of 1854 do?', ['Let settlers vote on slavery in the territories, overturning the Missouri line', 'Ended slavery in Kansas and Nebraska after a vote in Congress', 'Created the Confederacy after the southern states left the Union', 'Admitted California as a free state under the Compromise of 1850'], 'It is linked to Bleeding Kansas.', 'The act repealed the Missouri Compromise line and led to violence in Kansas.'),
    mc(L16, 4, 2, 'Which event of 1859 involved an attempt to spark a slave uprising?', ['John Brown\'s raid on Harpers Ferry', 'The Stono Rebellion, an uprising in colonial South Carolina', 'The Alamo, a siege during the Texas Revolution', 'The Trail of Tears, the forced removal of the Cherokee'], 'It involved an armory.', 'Brown\'s raid was captured and hanged, and it deepened the divide.'),
    mc(L16, 5, 3, 'What question does the text raise about the "states\' rights" explanation?', ['Rights to do what, since slavery was central', 'Whether the states had legal standing to secede in 1860', 'Whether Lincoln had actually been elected by a majority', 'Whether the Constitution gave states any rights at all'], 'Look at the secession declarations.', 'Several secession declarations named slavery directly as the cause.'),
  ]),
  les(L17, 'The Civil War', 'The war began as a fight over union and became a war to end slavery, at enormous cost.', 9,
`The Civil War began on April 12, 1861, when Confederate forces fired on Fort Sumter in Charleston harbor. Eleven southern states formed the Confederacy; the Union included the free states and the border slave states that stayed in the Union, such as Kentucky and Maryland.

At first President Lincoln said the aim was to preserve the Union. As the war dragged on, it became a war against slavery too. Enslaved people helped force this change by escaping to Union lines in large numbers. Lincoln issued the Emancipation Proclamation on January 1, 1863, declaring enslaved people in Confederate-held areas free. It did not free enslaved people in the loyal border states, and it relied on Union victory to take effect, but it made emancipation a Union war aim and allowed Black men to enlist. Roughly 180,000 Black men served in the Union army, and thousands more in the navy.

Major battles included Antietam in September 1862, still the bloodiest single day in American history, and Gettysburg in July 1863, a Union victory that ended the Confederate invasion of the North. The Union also captured Vicksburg on July 4, 1863, giving it control of the Mississippi River. In 1864 General William Sherman's army marched through Georgia, destroying railroads and property. General Robert E. Lee surrendered to Ulysses S. Grant at Appomattox on April 9, 1865. Lincoln was assassinated on April 14 and died the next day.

At least 620,000 soldiers died, and some recent estimates are higher; far more were wounded, and many died of disease. The Thirteenth Amendment, ratified in December 1865, abolished slavery.

Worked case: Gettysburg and Vicksburg occurred within days of each other, a reminder that the war was decided on many fronts, not only the famous eastern battles.`,
  [
    mc(L17, 1, 1, 'Where did the Civil War begin in April 1861?', ['Fort Sumter', 'Gettysburg', 'Appomattox', 'Harpers Ferry'], 'It was in Charleston harbor.', 'Confederate forces fired on Fort Sumter on April 12, 1861.'),
    tf(L17, 2, 1, 'The Emancipation Proclamation freed enslaved people in Confederate-held areas.', 0, 'It did not include the border states.', 'It declared freedom in areas in rebellion and made emancipation a war aim.'),
    mc(L17, 3, 2, 'Roughly how many Black men served in the Union army?', ['About 180,000', 'About 5,000', 'About 2 million', 'None'], 'The number was large.', 'Around 180,000 Black soldiers served, and their service helped win the war.'),
    mc(L17, 4, 2, 'Which amendment, ratified in December 1865, abolished slavery?', ['The Thirteenth', 'The First', 'The Nineteenth', 'The Twenty-sixth'], 'It was the first Reconstruction amendment.', 'The Thirteenth Amendment ended slavery, except as punishment for crime.'),
    mc(L17, 5, 3, 'Why did the war\'s purpose broaden after 1861?', ['Enslaved people fled to Union lines and emancipation became a war aim', 'Lincoln lost interest in preserving the Union and wanted a new nation', 'The Confederacy surrendered early and the war became a peace effort', 'Britain joined the war on the Confederate side and widened the fighting'], 'Think about how enslaved people acted.', 'Large numbers of people escaping slavery helped push the Union toward emancipation.'),
  ]),
  les(L18, 'Reconstruction and Its Overthrow', 'After the war, the nation tried to rebuild and define freedom, but white resistance and political retreat ended the effort.', 9,
`Reconstruction, from 1865 to 1877, asked hard questions: who would rule the South, and what would freedom mean for four million formerly enslaved people?

The federal government created the Freedmen's Bureau in 1865 to provide food, schools and legal help. Three amendments changed the Constitution. The Thirteenth abolished slavery. The Fourteenth (1868) granted citizenship to anyone born in the United States and promised equal protection of the laws. The Fifteenth (1870) barred denying the vote on account of race, though it applied only to men. Southern states, meanwhile, passed Black Codes that restricted the rights and labor of freed people. Congress, led by Radical Republicans, responded with military oversight of the South and new state constitutions. President Andrew Johnson, who opposed these measures, was impeached in 1868 and acquitted by one vote.

Black men voted, ran for office and served in legislatures; Hiram Revels of Mississippi became the first Black U.S. senator in 1870. Black communities built churches, schools and colleges. But white terror groups such as the Ku Klux Klan used violence to intimidate Black voters and Republicans. Congress passed Enforcement Acts in 1870 and 1871 to fight the Klan, but northern support faded. After the disputed presidential election of 1876, a political deal, the Compromise of 1877, saw the last federal troops withdraw from the South.

Afterward, southern states imposed segregation and disenfranchisement, called Jim Crow. In Plessy v. Ferguson (1896), the Supreme Court upheld "separate but equal."

Historians have changed their views. Early twentieth-century scholars of the Dunning school portrayed Reconstruction as a failure caused by Black rule, a view W.E.B. Du Bois attacked in Black Reconstruction (1935). Modern historians, such as Eric Foner, stress its achievements and its overthrow by violence.

Worked case: the Fourteenth Amendment remains a basis for equality claims today.`,
  [
    mc(L18, 1, 1, 'Which amendment promised citizenship and equal protection of the laws?', ['The Fourteenth', 'The Thirteenth', 'The Fifteenth', 'The Tenth'], 'It was ratified in 1868.', 'The Fourteenth Amendment defined citizenship and guaranteed equal protection.'),
    tf(L18, 2, 1, 'Hiram Revels became the first Black U.S. senator in 1870.', 0, 'He represented Mississippi.', 'Revels\'s election was a symbol of Reconstruction\'s achievements.'),
    mc(L18, 3, 2, 'What did Plessy v. Ferguson (1896) uphold?', ['"Separate but equal" segregation', 'Black citizenship and equal access to public places', 'School integration in every state under federal law', 'The Fifteenth Amendment, protecting the right to vote'], 'It enabled Jim Crow.', 'The Court allowed racial segregation under a "separate but equal" rule.'),
    mc(L18, 4, 2, 'What ended federal troop presence in the South in 1877?', ['The Compromise of 1877 after a disputed election', 'A new civil war fought between the North and South', 'The Fourteenth Amendment, which defined citizenship', 'The Dred Scott decision, which denied Black citizenship'], 'It followed the 1876 election.', 'A political deal ended military Reconstruction.'),
    mc(L18, 5, 3, 'How did W.E.B. Du Bois challenge the older view of Reconstruction?', ['He argued it had real achievements and was overthrown by violence and political retreat', 'He claimed it was a complete success that ended racial inequality', 'He said it never really happened and was a myth invented later', 'He blamed Black voters and officials for corruption and its collapse'], 'He wrote Black Reconstruction.', 'Du Bois challenged the Dunning school and stressed Black agency and the role of violence.'),
  ]),
];

const T5 = [
  les(L19, 'The Gilded Age: Industry, Labor and the West', 'Railroads and big business transformed the economy, workers organized, and Native nations lost the Plains.', 9,
`Mark Twain and Charles Dudley Warner gave the late 1800s its nickname with their 1873 novel The Gilded Age: a thin layer of gold over a rougher surface. The country industrialized with astonishing speed. The first transcontinental railroad was completed in 1869 at Promontory Summit, Utah, built in large part by Chinese and Irish workers. Andrew Carnegie in steel, John D. Rockefeller in oil and J. P. Morgan in finance built giant enterprises. Supporters pointed to cheaper goods, new jobs and rapid growth. Critics pointed to monopoly power, dangerous workplaces and a widening gap between rich and poor.

Workers organized in response. The Haymarket affair in Chicago in 1886 began as a rally for the eight-hour day and ended with a bomb and the controversial convictions of several anarchists. The Homestead strike of 1892 and the Pullman strike of 1894 were both met with armed force. Congress passed the Sherman Antitrust Act in 1890 to limit monopolies, though it was used unevenly, sometimes against unions. Farmers who felt squeezed by railroads and banks formed the Populist movement in the 1890s.

In the West, the U.S. Army and settlers pressed Native nations onto reservations. The destruction of the vast bison herds, driven by commercial hunting, undermined Plains peoples' economies. The Dawes Act of 1887 divided tribal lands into individual allotments, and the surplus was opened to settlers; Native nations lost a large share of their land. Boarding schools such as Carlisle (opened in 1879) aimed to separate children from their cultures. In December 1890, at Wounded Knee in South Dakota, U.S. soldiers killed well over 150 Lakota, including many women and children.

Worked case: the Pullman strike shows the era's central conflict. Workers faced wage cuts, the company refused to talk, and the federal government sided with the owners.`,
  [
    mc(L19, 1, 1, 'What event of 1869 linked the nation by rail?', ['Completion of the first transcontinental railroad', 'The invention of the telephone, which connected cities by wire', 'The Dawes Act, dividing tribal land among individuals', 'The Sherman Act, restricting business monopolies'], 'It happened in Utah.', 'The line was completed at Promontory Summit.'),
    tf(L19, 2, 1, 'The Dawes Act of 1887 divided tribal lands into individual allotments.', 0, 'It affected reservations.', 'The act broke up communal lands, and Native nations lost a large share of land.'),
    mc(L19, 3, 2, 'What did the Sherman Antitrust Act of 1890 aim to limit?', ['Monopolies and business combinations', 'Immigration from Asia and eastern Europe', 'Voting by women and immigrants', 'Imports of tea and other goods from Britain'], 'Think of Rockefeller.', 'It sought to restrain monopolies, though enforcement was uneven.'),
    mc(L19, 4, 2, 'Why was the destruction of bison herds so damaging to Plains peoples?', ['It undermined their food, trade and way of life', 'It had little effect, since Plains peoples relied mainly on farming', 'It created new farms for Plains nations to replace hunting', 'It ended the railroad boom by blocking new track across the Plains'], 'Bison were central to their economies.', 'Many Plains nations depended on bison, and the herds were nearly wiped out.'),
    mc(L19, 5, 3, 'Why is the term "Gilded Age" a critical label?', ['It suggests a shiny surface covering social problems', 'It praises the era as a golden age of equality and honest government', 'It describes a type of gold coin used in the period', 'It refers to a political party that dominated the era'], 'Think of gilding.', 'Twain and Warner suggested glittering wealth masked corruption and inequality.'),
  ]),
  les(L20, 'Immigration, Exclusion and the Great Migration', 'Millions arrived from Europe and Asia, laws began restricting entry, and Black Americans moved north.', 8,
`Between about 1880 and 1920, roughly 20 million immigrants came to the United States. Earlier waves had come mainly from Britain, Ireland and Germany. The "new immigrants" came increasingly from southern and eastern Europe, including Italians, Poles and Jews fleeing persecution in the Russian empire. Many arrived through Ellis Island in New York harbor, which opened in 1892. On the Pacific coast, the Angel Island station processed many Asian immigrants from 1910, often with long detention and harsh questioning.

Immigrants worked in factories, mines and construction, and often lived in crowded city tenements. They built churches, synagogues, newspapers and mutual aid societies. They also faced nativism, hostility to foreigners. The Chinese Exclusion Act of 1882 was the first major federal law to bar immigration on the basis of nationality; it was renewed and not repealed until 1943. The Immigration Act of 1924 set national origins quotas that sharply limited immigration from southern and eastern Europe and nearly ended it from Asia. Mexican workers were not covered by the quotas and continued to cross the border for farm and railroad work.

At the same time, a different movement was underway inside the country. Starting around 1916, millions of Black southerners moved to northern and western cities, seeking jobs and an escape from Jim Crow and violence. This Great Migration lasted until about 1970 and involved roughly six million people. They found better wages and political voice, but also segregated housing and sometimes violence, as in the 1919 riots in cities such as Chicago.

Worked case: compare the 1882 and 1924 laws. Both reflect fears about newcomers, but the 1924 law used quotas based on the national origins of the existing population.`,
  [
    mc(L20, 1, 1, 'Which station in New York harbor processed many immigrants beginning in 1892?', ['Ellis Island', 'Angel Island', 'Plymouth Rock', 'Fort Sumter'], 'It is near the Statue of Liberty.', 'Ellis Island opened in 1892.'),
    tf(L20, 2, 1, 'The Chinese Exclusion Act of 1882 barred immigration by nationality.', 0, 'It was the first of its type.', 'It was the first major federal law to exclude a group by nationality.'),
    mc(L20, 3, 2, 'What was the Great Migration?', ['The movement of millions of Black Americans from the South to northern and western cities', 'The arrival of Pilgrims who crossed the Atlantic in 1620', 'The forced removal of Cherokee people to Indian Territory', 'The rush of settlers to California after gold was found in 1848'], 'It began around 1916.', 'Millions of Black southerners left for cities in search of work and safety.'),
    mc(L20, 4, 2, 'What did the Immigration Act of 1924 do?', ['Set national origins quotas that sharply limited immigration', 'Opened Ellis Island as the main immigration station in New York', 'Ended all immigration for good and closed the nation to newcomers', 'Created citizenship for all immigrants already living here'], 'It used quotas.', 'The act favored northern and western Europeans and sharply restricted others.'),
    mc(L20, 5, 3, 'What does nativism mean in this context?', ['Hostility toward immigrants', 'Support for Native nations', 'A type of farming', 'A political party in Mexico'], 'Think of "native-born" fears.', 'Nativists opposed immigration and often discriminated against newcomers.'),
  ]),
  les(L21, 'The Progressive Era', 'Reformers confronted the problems of industrial society, winning new laws and constitutional amendments, but with limits.', 8,
`Progressivism was not one organization but a broad set of reform efforts from the 1890s to about 1920, led by people who believed government and organized citizens could fix the problems created by industrialization and city growth.

Journalists called muckrakers exposed abuses. Ida Tarbell investigated Standard Oil, Jacob Riis photographed tenement life, and Upton Sinclair's novel The Jungle (1906) described the meatpacking industry. Public outrage helped lead to the Meat Inspection Act and the Pure Food and Drug Act in 1906. President Theodore Roosevelt pursued antitrust cases against large corporations and supported conservation, creating national forests and parks. Jane Addams founded Hull House in Chicago in 1889, a settlement house that offered services to immigrant neighbors.

The era produced four constitutional amendments:
- the Sixteenth (1913), allowing a federal income tax
- the Seventeenth (1913), electing senators directly
- the Eighteenth (1919), prohibiting alcohol
- and the Nineteenth (1920), guaranteeing women the right to vote after decades of organizing.

Many Black women and men, as well as others, were still prevented from voting by state practices.

Progressivism had limits and contradictions. Many reformers supported segregation or eugenics, now discredited ideas about "improving" the population. President Woodrow Wilson segregated parts of the federal workforce. At the same time, Black activists founded the NAACP in 1909, and W.E.B. Du Bois and Booker T. Washington debated strategy, with Du Bois pressing for immediate political rights and Washington stressing economic progress and accommodation.

Worked case: The Jungle was meant to expose workers' conditions, but the public reacted most to concerns about food safety. Reform often succeeds where the interests of the public line up with its own.`,
  [
    mc(L21, 1, 1, 'Which amendment gave women the right to vote?', ['The Nineteenth', 'The Sixteenth', 'The Eighteenth', 'The Thirteenth'], 'It was ratified in 1920.', 'The Nineteenth Amendment barred denying the vote on account of sex.'),
    tf(L21, 2, 1, 'Muckrakers were journalists who exposed social and business abuses.', 0, 'Think of Tarbell and Sinclair.', 'Muckraking journalism helped drive reform.'),
    mc(L21, 3, 2, 'What did the Sixteenth Amendment allow?', ['A federal income tax', 'Direct election of senators', 'Prohibition', 'Women\'s suffrage'], 'It is about taxes.', 'The Sixteenth Amendment authorized a federal income tax.'),
    mc(L21, 4, 2, 'Which organization was founded in 1909 to fight racial discrimination?', ['The NAACP', 'Hull House', 'The Populist Party', 'The Freedmen\'s Bureau'], 'Du Bois helped create it.', 'The NAACP was founded in 1909.'),
    mc(L21, 5, 3, 'Why do historians describe Progressivism as having contradictions?', ['Reformers expanded democracy in some ways while supporting segregation or eugenics', 'Reformers opposed all change and tried to restore older ways', 'There were no reforms, since the movement never won any laws', 'Only one amendment passed, so the movement achieved little'], 'Look at the limits.', 'Many reformers held views that excluded or harmed some groups.'),
  ]),
  les(L22, 'The United States and World War I', 'The nation entered a European war in 1917, mobilized society, and curbed dissent at home.', 8,
`World War I began in Europe in 1914. The United States stayed neutral for nearly three years, though it traded with the Allies. Public opinion shifted over time. In 1915 a German submarine sank the British liner Lusitania, killing nearly 1,200 people, including 128 Americans. In early 1917 Germany resumed unrestricted submarine warfare, and the Zimmermann Telegram, in which Germany proposed a military alliance with Mexico against the United States, was made public. In April 1917 President Woodrow Wilson asked Congress to declare war, saying the world must be "made safe for democracy". Congress agreed.

The nation mobilized quickly. The draft built an army, and over two million American soldiers went to France. The government encouraged citizens to buy war bonds and grow food, and the economy shifted to war production. Black soldiers served mostly in segregated units, and many Black Americans hoped service would earn them equal rights. Women took on new work roles.

At home, civil liberties were restricted. The Espionage Act of 1917 and the Sedition Act of 1918 punished speech seen as hostile to the war effort. Socialist leader Eugene Debs was sentenced to ten years in prison for an antiwar speech. German Americans faced suspicion and pressure.

The war ended with an armistice on November 11, 1918. Wilson proposed a peace based on his Fourteen Points and a League of Nations. The Treaty of Versailles was signed in 1919, but the U.S. Senate did not ratify it, and the United States did not join the League. A flu pandemic in 1918 and 1919 killed far more Americans than the war itself.

Worked case: the Debs conviction shows a recurring tension: how a nation at war balances security and free speech.`,
  [
    mc(L22, 1, 1, 'In which year did the United States enter World War I?', ['1917', '1914', '1919', '1941'], 'Neutral for nearly three years after 1914.', 'Congress declared war in April 1917.'),
    tf(L22, 2, 1, 'The U.S. Senate ratified the Treaty of Versailles and the United States joined the League of Nations.', 1, 'Recall what the Senate did.', 'The Senate did not ratify the treaty, and the United States stayed out of the League.'),
    mc(L22, 3, 2, 'What was the Zimmermann Telegram?', ['A German proposal for an alliance with Mexico against the United States', 'A message from Wilson asking Congress to declare war', 'An armistice order that ended fighting in 1918', 'A British peace offer sent to Germany in 1917'], 'It involved Mexico.', 'Its publication angered Americans and helped push the nation toward war.'),
    mc(L22, 4, 2, 'What did the Espionage and Sedition Acts do?', ['Punished speech considered hostile to the war effort', 'Created the draft to raise troops for the army', 'Founded the League of Nations as an international body', 'Banned alcohol across the country during the war'], 'They concerned dissent.', 'The laws restricted speech and led to prosecutions such as Eugene Debs\'s.'),
    mc(L22, 5, 3, 'Why is the Debs case a useful example?', ['It illustrates the tension between wartime security and free speech', 'It shows how the draft worked and who was exempt from it', 'It was about the sinking of the Lusitania in 1915', 'It ended the war by causing Debs to lead a general strike'], 'Consider civil liberties.', 'It shows how governments may limit speech during war, a continuing debate.'),
  ]),
  les(L23, 'The 1920s: Prosperity, Culture and Conflict', 'The decade brought new technology and culture alongside Prohibition, nativism and racial violence.', 8,
`The 1920s are often called the Roaring Twenties, but the picture is mixed.

New technology changed daily life. Mass-produced automobiles, led by Henry Ford's Model T, spread across the country. Radio broadcasting began commercially around 1920, and movies became a national entertainment. Consumer credit let more families buy appliances. The stock market boomed, and many people, though not all, felt prosperous. Farmers and many workers, however, struggled, and wealth was unevenly shared.

Culture was lively. Jazz spread from New Orleans and other cities. In New York, the Harlem Renaissance flourished, with writers such as Langston Hughes and Zora Neale Hurston and musicians such as Duke Ellington celebrating Black life and art. Younger women, called flappers, challenged older social conventions. F. Scott Fitzgerald's The Great Gatsby, published in 1925, examined the decade's glitter and emptiness.

The decade also saw conflict. Prohibition, in effect from 1920 to 1933, banned the sale of alcohol, and fueled illegal trade and organized crime. After the war, a Red Scare in 1919 and 1920 targeted suspected radicals. The Ku Klux Klan revived in the 1920s with a national membership far beyond the South. The Immigration Act of 1924 restricted newcomers. In 1925 the Scopes trial in Tennessee, over the teaching of evolution, became a national debate about science and religion. In 1921 a white mob destroyed the prosperous Black Greenwood district of Tulsa, Oklahoma; estimates of the dead range from several dozen to about three hundred.

Worked case: the Harlem Renaissance shows that the Great Migration changed national culture, not just population maps.`,
  [
    mc(L23, 1, 1, 'Which period of 1920 to 1933 banned the sale of alcohol?', ['Prohibition', 'The Red Scare', 'The Progressive Era', 'Reconstruction'], 'It was the Eighteenth Amendment era.', 'Prohibition lasted until 1933.'),
    tf(L23, 2, 1, 'The Harlem Renaissance was a flowering of Black art and literature.', 0, 'Think of Hughes and Hurston.', 'It centered on Harlem and celebrated Black culture.'),
    mc(L23, 3, 2, 'What was the Scopes trial about?', ['The teaching of evolution in a Tennessee school', 'Alcohol smuggling during Prohibition in Chicago', 'A stock market crash in a small Tennessee town', 'A railroad strike by workers in eastern Tennessee'], 'It happened in 1925.', 'The trial turned into a national debate over science and religion.'),
    mc(L23, 4, 2, 'Why was the 1920s prosperity described as uneven?', ['Many farmers and workers did not share in the boom', 'No one prospered, since wages fell for every group', 'Everyone shared equally in the wealth the boom created', 'The stock market was closed for most of the decade'], 'Think about who benefited.', 'Gains were concentrated, and farmers and many workers struggled.'),
    mc(L23, 5, 3, 'What does the Tulsa massacre of 1921 illustrate?', ['Racial violence that destroyed a prosperous Black community', 'A labor strike by oil workers that turned violent', 'A natural disaster that destroyed much of the city', 'The success of Prohibition in reducing crime in the city'], 'It involved Greenwood.', 'A white mob destroyed Greenwood, and the death toll remains debated.'),
  ]),
];

const T6 = [
  les(L24, 'The Great Depression and the New Deal', 'The economy collapsed after 1929, and the federal government took a much larger role, with real benefits and real limits.', 9,
`In October 1929 stock prices crashed, with Black Tuesday on October 29 a notable day. Economists still debate the causes of the Great Depression that followed: speculation, bank failures, weak farm income, unequal wealth, trade barriers such as the Smoot-Hawley tariff of 1930, and mistakes in monetary policy all appear in explanations. What is not debated is the suffering. Thousands of banks failed and unemployment reached roughly 25 percent in 1933. Farmers in the Great Plains also faced the Dust Bowl, a drought and soil erosion disaster.

President Herbert Hoover relied mainly on voluntary measures and limited federal action, and many people blamed him. Franklin D. Roosevelt won in 1932 and promised a "New Deal." In his first months, Congress passed measures to stabilize banks, create the Federal Deposit Insurance Corporation, and put people to work through programs such as the Civilian Conservation Corps. The Tennessee Valley Authority built dams and power. In 1935 the Social Security Act created old-age pensions and unemployment insurance, and the Wagner Act protected workers' right to organize unions. The Works Progress Administration employed millions on building projects and arts programs.

The New Deal had critics on both sides. Conservatives feared too much government power, and some on the left said it did too little. It also left many people out. Social Security initially excluded agricultural and domestic workers, groups that included many Black Americans, and federal housing agencies practiced redlining, steering loans away from Black neighborhoods. Historians debate how much the New Deal ended the Depression; full recovery came with the wartime economy.

Worked case: the FDIC protects bank deposits. It showed how the government could change expectations, ending the bank runs that had wiped out savings.`,
  [
    mc(L24, 1, 1, 'Which president promised a "New Deal"?', ['Franklin D. Roosevelt', 'Herbert Hoover, who led during the early Depression', 'Woodrow Wilson, who led during the First World War', 'Theodore Roosevelt, who promised a Square Deal'], 'He won in 1932.', 'FDR\'s New Deal expanded federal action in the Depression.'),
    tf(L24, 2, 1, 'Economists all agree on a single cause of the Great Depression.', 1, 'Recall the list of explanations.', 'Several causes are debated, including speculation, bank failures and policy mistakes.'),
    mc(L24, 3, 2, 'What did the Wagner Act (1935) protect?', ['The right of workers to organize unions', 'Bank deposits held in accounts at federal banks', 'Farm prices through crop limits and payments', 'The right to buy alcohol after Prohibition ended'], 'Think of labor.', 'It protected collective bargaining and union organizing.'),
    mc(L24, 4, 2, 'What was redlining?', ['Steering loans away from certain neighborhoods, often Black ones', 'A new tax on property in poorer neighborhoods', 'A type of dam built in the Tennessee Valley', 'A voting law that limited who could register'], 'It involved maps and loans.', 'Federal housing practices marked many Black neighborhoods as risky and limited credit.'),
    mc(L24, 5, 3, 'Why do historians say the New Deal had limits?', ['Many programs excluded groups such as agricultural and domestic workers', 'It did nothing to help the unemployed or reduce poverty', 'It lasted only one year before programs were ended', 'It was repealed in 1935 after the Supreme Court struck it down'], 'Consider who was left out.', 'Exclusions meant many Black workers and others received fewer benefits.'),
  ]),
  les(L25, 'World War II at Home and Abroad', 'The war transformed the United States, with great sacrifice and achievement, but also injustice at home.', 9,
`World War II began in Europe in September 1939 when Germany invaded Poland. The United States was officially neutral at first, then aided Britain through the Lend-Lease program in 1941. On December 7, 1941 Japan attacked the U.S. naval base at Pearl Harbor, Hawaii, and the United States entered the war. American forces fought in Europe, North Africa and the Pacific. D-Day, the Allied invasion of Normandy, took place on June 6, 1944. Germany surrendered in May 1945. After the United States dropped atomic bombs on Hiroshima on August 6 and Nagasaki on August 9, Japan announced surrender; the formal surrender came on September 2. More than 400,000 Americans died. Historians still debate whether the bombings were necessary to end the war.

At home, factories turned to war production, and millions of women took industrial jobs. Black Americans pursued a "Double V" campaign, victory over fascism abroad and discrimination at home. Pressure from civil rights leaders led Roosevelt in 1941 to ban discrimination in defense industries. Black servicemen such as the Tuskegee Airmen served in segregated units. Navajo and other Native code talkers helped secure military communications.

The war also brought injustice. After Pearl Harbor, Executive Order 9066 in February 1942 led to the forced removal and incarceration of about 120,000 people of Japanese ancestry on the West Coast, most of them American citizens. The Supreme Court upheld the policy in Korematsu v. United States (1944). In 1988 Congress passed the Civil Liberties Act, apologizing and providing redress. U.S. refugee policy also limited the number of Jews who could escape Nazi persecution.

Worked case: Executive Order 9066 shows how fear in wartime can override constitutional protections, without evidence of individual disloyalty.`,
  [
    mc(L25, 1, 1, 'Which event brought the United States into World War II?', ['The attack on Pearl Harbor', 'The sinking of the Lusitania', 'D-Day', 'The invasion of Poland'], 'It happened on December 7, 1941.', 'Japan\'s attack on Pearl Harbor led the United States to declare war.'),
    tf(L25, 2, 1, 'Most of the roughly 120,000 people of Japanese ancestry incarcerated in 1942 were U.S. citizens.', 0, 'Many were born in the U.S.', 'About two-thirds were American citizens.'),
    mc(L25, 3, 2, 'What did the "Double V" campaign seek?', ['Victory over fascism abroad and discrimination at home', 'A strategy for fighting two wars at the same time', 'Military victory in both Europe and Asia with wartime rationing', 'Two votes for every citizen in each election'], 'It was a Black American campaign.', 'It linked the fight against fascism to the fight for civil rights.'),
    mc(L25, 4, 2, 'What was the Civil Liberties Act of 1988?', ['A law apologizing and providing redress for Japanese American incarceration', 'A law ending the draft after the Second World War', 'A law creating the Tuskegee Airmen as a Black fighter unit', 'A law ending segregation in the armed forces'], 'It was passed decades later.', 'It acknowledged the injustice and offered payments to survivors.'),
    mc(L25, 5, 3, 'Why does the text say historians debate the atomic bombings?', ['They disagree about whether they were necessary to end the war', 'Nobody can say for certain whether they actually happened', 'They took place before Pearl Harbor, so their timing is disputed', 'They were a naval battle whose outcome is still disputed'], 'Look for the debate.', 'The question of necessity and alternatives remains a major historical argument.'),
  ]),
  les(L26, 'The Cold War', 'A global rivalry with the Soviet Union shaped foreign policy, domestic politics and culture for over four decades.', 9,
`After World War II the United States and the Soviet Union emerged as superpowers with opposing systems: capitalist democracy and one-party communism. They never fought each other directly, which is why the conflict was called "cold," but they competed through alliances, arms, spies, and proxy wars.

The U.S. policy of containment, urged by diplomat George Kennan, aimed to stop the spread of communism. The Truman Doctrine of 1947 promised aid to nations resisting communist pressure, and the Marshall Plan of 1948 gave billions in aid to rebuild Western Europe. In 1949 the United States and its allies formed NATO, and the Soviets later formed the Warsaw Pact. The Korean War (1950 to 1953) ended in stalemate and division of the peninsula, which continues today. In October 1962 the Cuban Missile Crisis, after the discovery of Soviet missiles in Cuba, brought the world close to nuclear war and ended with a deal. The superpowers also raced in space, after the Soviet Sputnik launch in 1957, and the U.S. Apollo 11 landing in 1969.

At home, fear of communist subversion led to a Red Scare in the early 1950s, driven in part by Senator Joseph McCarthy, whose accusations often lacked evidence and ruined careers. Economic growth, the GI Bill and new suburbs shaped a prosperous middle class, though Black veterans often faced barriers to its benefits. The Interstate Highway Act of 1956 built the highway system.

The Berlin Wall fell in November 1989, and the Soviet Union dissolved in December 1991. Historians debate who bears responsibility for the Cold War's origins: orthodox accounts stressed Soviet expansion, revisionist ones American policy, and many today see mutual fear and miscalculation.

Worked case: during the Cuban Missile Crisis both sides found a way to back down, showing that nuclear risk could focus diplomacy.`,
  [
    mc(L26, 1, 1, 'What was the policy of containment?', ['Stopping the spread of communism', 'Ending the arms race through treaties with the Soviets', 'Building the interstate system for defense and travel', 'Admitting new states to strengthen the Union'], 'Kennan promoted it.', 'Containment aimed to prevent Soviet influence from spreading.'),
    tf(L26, 2, 1, 'The United States and Soviet Union fought each other directly in a declared war during the Cold War.', 1, 'Why was it called "cold"?', 'They avoided direct war and competed through other means.'),
    mc(L26, 3, 2, 'What did the Marshall Plan do?', ['Provided aid to rebuild Western Europe', 'Created the Warsaw Pact as a military alliance in Eastern Europe', 'Began the Korean War after the invasion of South Korea', 'Landed American astronauts on the Moon in 1969'], 'It was economic.', 'It sent billions of dollars to help rebuild Western Europe.'),
    mc(L26, 4, 2, 'What was the Cuban Missile Crisis?', ['A 1962 confrontation over Soviet missiles in Cuba', 'A coup in Cuba in 1898 that began the Spanish-American War', 'A trade dispute with Canada over wheat and oil', 'A war in Korea that drew in China and the United States'], 'It came close to nuclear war.', 'The crisis ended with a negotiated deal.'),
    mc(L26, 5, 3, 'How do "revisionist" historians differ from "orthodox" ones on the Cold War?', ['They give more weight to the role of American policy', 'They deny that the Cold War truly happened as a rivalry', 'They blame only the Soviet Union for causing the conflict', 'They say it began in 1989 after the Berlin Wall fell'], 'Orthodox stressed the Soviets.', 'Revisionists stressed U.S. actions while orthodox accounts stressed Soviet expansion.'),
  ]),
  les(L27, 'The Civil Rights Movement', 'Black Americans and allies used courts, protest and politics to end legal segregation and win voting rights.', 9,
`The Civil Rights Movement was a long struggle, with roots stretching back to Reconstruction and earlier. Its best-known phase ran from the mid-1950s to the late 1960s.

Lawyers from the NAACP, including Thurgood Marshall, challenged segregation in the courts. In Brown v. Board of Education (May 17, 1954), the Supreme Court ruled that segregated public schools were unconstitutional, rejecting "separate but equal" in education. Enforcement was slow, and many southern officials resisted. In 1957 federal troops escorted nine Black students into Central High School in Little Rock, Arkansas.

Direct action grew. After Rosa Parks was arrested on December 1, 1955, Black residents of Montgomery, Alabama, boycotted city buses for over a year, led by local organizers and a young minister, Martin Luther King Jr. In 1960 students began sit-ins at lunch counters in Greensboro, North Carolina, and the Student Nonviolent Coordinating Committee formed. In 1961 Freedom Riders challenged segregated bus travel. Birmingham's 1963 campaign met brutal police response, and on August 28, 1963 about 250,000 people attended the March on Washington, where King gave his "I Have a Dream" speech.

Pressure produced law. The Civil Rights Act of 1964 banned discrimination in public places and employment. After the violent attack on marchers at Selma, Alabama, on March 7, 1965, known as Bloody Sunday, Congress passed the Voting Rights Act of 1965, which targeted barriers to Black voting. The Fair Housing Act followed in 1968, a week after King's assassination on April 4.

Activists debated tactics. Many stressed nonviolent protest, while others, especially later in the 1960s, argued for Black Power and self-defense.

Worked case: the Montgomery boycott combined mass participation, legal action and economic pressure, and ended after a Supreme Court ruling against bus segregation.`,
  [
    mc(L27, 1, 1, 'Which 1954 Supreme Court case ruled segregated public schools unconstitutional?', ['Brown v. Board of Education', 'Plessy v. Ferguson, which upheld separate but equal facilities', 'Dred Scott v. Sandford, which denied Black citizenship', 'Korematsu v. United States, upholding Japanese American internment'], 'It overturned "separate but equal" in schools.', 'Brown rejected school segregation, though enforcement was slow.'),
    tf(L27, 2, 1, 'The Voting Rights Act of 1965 followed the Selma marches.', 0, 'Think of Bloody Sunday.', 'The violence at Selma built support for the law.'),
    mc(L27, 3, 2, 'What happened at Greensboro in 1960?', ['Students began sit-ins at a lunch counter', 'A bus boycott began after an arrest on a city bus', 'The March on Washington drew hundreds of thousands to the capital', 'Central High School was integrated under federal troops'], 'It involved lunch counters.', 'The sit-ins spread across the South and brought a new generation into the movement.'),
    mc(L27, 4, 2, 'What did the Civil Rights Act of 1964 do?', ['Banned discrimination in public places and employment', 'Created the NAACP to fight discrimination in the courts', 'Ended slavery throughout the United States', 'Declared independence from the British Crown'], 'It covered public accommodations.', 'It outlawed discrimination in many areas of public life.'),
    mc(L27, 5, 3, 'Why does the text describe the movement as long?', ['Its roots reach back to Reconstruction and earlier', 'It began in 1964 with the passage of the Civil Rights Act', 'It ended in 1955 after the Montgomery bus boycott', 'It was a single event centered on the March on Washington'], 'Think about earlier struggles.', 'Earlier generations had challenged segregation and discrimination for decades.'),
  ]),
  les(L28, 'The Long Sixties and Seventies', 'War, protest, new movements and political scandal reshaped American life and trust in government.', 9,
`The era from the mid-1960s to the mid-1970s was one of intense change and conflict.

Vietnam became the defining war. After the Gulf of Tonkin incident of 1964, Congress passed a resolution giving President Lyndon Johnson wide authority, and U.S. troop levels rose sharply. The Tet Offensive of January 1968 shook public confidence in official optimism. Opposition grew, particularly among students, and at Kent State University in May 1970 National Guard soldiers killed four student protesters. Under President Richard Nixon, the U.S. withdrew gradually; the Paris Accords of January 1973 ended direct U.S. involvement, and Saigon fell to North Vietnamese forces in April 1975. About 58,000 Americans and many more Vietnamese died.

At home, Johnson's Great Society created Medicare and Medicaid in 1965. Other movements grew alongside civil rights. The women's movement, sparked in part by Betty Friedan's The Feminine Mystique (1963), won Title IX in 1972, barring sex discrimination in education, and the Supreme Court decided Roe v. Wade in 1973. Cesar Chavez and Dolores Huerta organized farmworkers. The American Indian Movement occupied Wounded Knee in 1973. The Stonewall uprising in New York in June 1969 became a symbol of gay liberation. Earth Day in 1970 and the creation of the Environmental Protection Agency marked a surge in environmental concern.

Then came Watergate. After a break-in at Democratic headquarters in June 1972, investigations revealed a cover-up by Nixon's administration. Facing impeachment, Nixon resigned on August 9, 1974, the only president to do so. Together with the war and an oil crisis in 1973, this left many Americans more distrustful of government.

Worked case: Watergate shows how Congress, courts and the press checked presidential power.`,
  [
    mc(L28, 1, 1, 'Which president resigned in 1974?', ['Richard Nixon', 'Lyndon Johnson', 'Gerald Ford', 'Jimmy Carter'], 'Watergate led to it.', 'Nixon resigned on August 9, 1974, facing likely impeachment.'),
    tf(L28, 2, 1, 'Title IX, passed in 1972, barred sex discrimination in education.', 0, 'It affected schools and sports.', 'Title IX prohibited sex discrimination in federally funded education programs.'),
    mc(L28, 3, 2, 'What happened at Kent State in May 1970?', ['National Guard soldiers killed four student protesters', 'The Vietnam War ended with a ceasefire in Saigon', 'Nixon resigned after the Watergate hearings', 'Earth Day was first held on campuses across the country'], 'It was an antiwar protest.', 'The shootings deepened divisions over the war.'),
    mc(L28, 4, 2, 'What did the Great Society create in 1965?', ['Medicare and Medicaid', 'Social Security, which dates to the New Deal', 'The Environmental Protection Agency, created under Nixon', 'Title IX, which barred sex discrimination in schools'], 'They are health programs.', 'Johnson\'s program included Medicare and Medicaid.'),
    mc(L28, 5, 3, 'Why did Watergate and Vietnam reduce trust in government?', ['They revealed official deception and abuse of power', 'They proved that leaders were honest and trustworthy in office', 'They ended the Cold War and ended the need for secrecy', 'They created new states from former territories overseas'], 'Think of Tet and the cover-up.', 'Public confidence fell when officials misled the public about the war and covered up wrongdoing.'),
  ]),
];

const T7 = [
  les(L29, 'Canada: From New France to Confederation', 'Canada grew from French and British colonies into a self-governing dominion, with debates that continue today.', 9,
`Canada's story begins with Indigenous nations and then with French colonies in the St. Lawrence valley. In 1759 British forces defeated the French at the Plains of Abraham outside Quebec City, and by the Treaty of Paris of 1763 France ceded New France. The French-speaking population was allowed to keep its language, religion and civil law through the Quebec Act of 1774, which also upset many American colonists. After the American Revolution, thousands of Loyalists moved north, shaping the British colonies that remained.

Canada did not break from Britain through revolution. Rebellions in 1837 and 1838 in Upper and Lower Canada pressed for more representative government. Reform followed, and in time the colonies won responsible government, in which the cabinet answers to an elected assembly.

On July 1, 1867, the British North America Act created the Dominion of Canada from Ontario, Quebec, Nova Scotia and New Brunswick. Leaders such as John A. Macdonald and George-Etienne Cartier negotiated it, partly out of fear of American expansion, economic hopes and the desire for a railway. The Dominion grew: Manitoba joined in 1870, British Columbia in 1871, Prince Edward Island in 1873, Alberta and Saskatchewan in 1905, and Newfoundland in 1949. The Canadian Pacific Railway, completed in 1885, was built with the labor of many Chinese workers, who then faced a head tax on entry.

Canada gained full legal independence step by step. In 1982 it patriated its constitution and added the Canadian Charter of Rights and Freedoms. Quebec's place in Canada has been debated, including referendums on sovereignty in 1980 and 1995, both of which were rejected.

Worked case: Canada's confederation was achieved through negotiation, not a revolution, and so shows that nations can form by several paths.`,
  [
    mc(L29, 1, 1, 'Which date marks Canadian Confederation?', ['July 1, 1867', 'July 4, 1776', 'April 12, 1861', 'January 1, 1900'], 'It is celebrated as Canada Day.', 'The British North America Act took effect on July 1, 1867.'),
    tf(L29, 2, 1, 'Canada became independent from Britain through a revolution like the American one.', 1, 'Think of negotiation.', 'Canada gained autonomy gradually, through reform and negotiation.'),
    mc(L29, 3, 2, 'What did the Quebec Act of 1774 allow?', ['The French-speaking population to keep its language, religion and civil law', 'Independence for Quebec as a separate French-speaking state', 'Union with the United States as a fourteenth colony', 'The end of the fur trade in the St. Lawrence valley'], 'It protected French Canadian institutions.', 'The Act accommodated French Canadians and angered many American colonists.'),
    mc(L29, 4, 2, 'Which provinces formed the original Dominion of Canada in 1867?', ['Ontario, Quebec, Nova Scotia and New Brunswick', 'Alberta, Saskatchewan, Manitoba and British Columbia together', 'British Columbia, Prince Edward Island and Newfoundland', 'Quebec and Manitoba, joined by Ontario and Alberta'], 'There were four.', 'Four provinces joined at the start; others joined later.'),
    mc(L29, 5, 3, 'What did the Constitution Act of 1982 accomplish?', ['Patriated the constitution and added the Charter of Rights and Freedoms', 'Created Confederation by uniting four British colonies', 'Ended the Quebec Act and the rights it gave French Canadians', 'Made Canada a republic with an elected head of state'], 'It happened under Pierre Trudeau.', 'Canada gained control over amending its own constitution and adopted the Charter.'),
  ]),
  les(L30, 'First Nations, Metis and Inuit in Canada', 'Canada\'s Indigenous peoples have faced policies of control and assimilation, and have pursued rights, recognition and reconciliation.', 9,
`Canada's constitution recognizes three Indigenous groups: First Nations, Metis and Inuit. Each has its own histories, languages and governments. The Royal Proclamation of 1763 recognized that Indigenous peoples held rights to land that the Crown must negotiate for. After Confederation, the Crown made a series of Numbered Treaties, Treaties 1 through 11, between 1871 and 1921, covering large areas of the west and north. Indigenous negotiators and the government often understood the treaties differently, and many treaty promises were not kept.

The Indian Act of 1876 gave the federal government wide control over the lives of First Nations people, including aspects of governance, status and movement, and it banned some ceremonies for decades. A key policy was the residential school system. From the 1880s, Indigenous children were taken from their families and placed in church-run, government-funded schools, intended to assimilate them. Many suffered neglect and abuse, and many died. The last federal school closed in 1996. The Truth and Reconciliation Commission, which worked from 2008 to 2015, called the system cultural genocide and issued 94 Calls to Action. Searches at former school sites since 2021 have identified possible unmarked graves, and this work and its interpretation are ongoing.

The Metis, people of mixed Indigenous and European ancestry with a distinct culture, resisted Canadian control at Red River in 1869 and 1870 under Louis Riel, which led to the creation of Manitoba. After the North-West Resistance of 1885, Riel was convicted of treason and hanged on November 16, 1885, and he remains a symbol of debate. The Inuit pursued land claims, and Nunavut became a territory in 1999. Section 35 of the Constitution Act of 1982 recognizes and affirms existing Aboriginal and treaty rights.

Worked case: the Truth and Reconciliation Commission's final report shows a nation using public inquiry to confront a policy that governments had long defended.`,
  [
    mc(L30, 1, 1, 'Which three groups are recognized as Indigenous peoples in Canada\'s constitution?', ['First Nations, Metis and Inuit', 'Cree, Ojibwe and Blackfoot', 'Haudenosaunee, Algonquin and Huron', 'Navajo, Apache and Pueblo'], 'Section 35 names them.', 'Section 35 of the Constitution Act, 1982 names First Nations, Metis and Inuit.'),
    tf(L30, 2, 1, 'Nunavut became a territory in 1999 following Inuit land claims.', 0, 'It is in the Arctic.', 'Nunavut was created in 1999 as part of an Inuit land claims agreement.'),
    mc(L30, 3, 2, 'What was the main purpose of the residential school system?', ['To assimilate Indigenous children into the dominant culture', 'To teach Indigenous languages and traditions to the next generation', 'To preserve treaties by teaching children their legal terms', 'To train Indigenous young people for military service'], 'The commission called it cultural genocide.', 'The system removed children from families and attempted to erase Indigenous cultures.'),
    mc(L30, 4, 2, 'Who led the Metis resistance at Red River in 1869 and 1870?', ['Louis Riel', 'John A. Macdonald', 'Tecumseh', 'Pontiac'], 'He was later hanged.', 'Riel led the Red River resistance, leading to Manitoba\'s creation.'),
    mc(L30, 5, 3, 'Why does the text say Numbered Treaties were contested?', ['The parties often understood their terms differently and promises went unkept', 'They were signed by Britain and France over rival land claims', 'They were never signed, so no legal terms existed', 'They covered only one province, so few nations were involved'], 'Think about interpretation and follow-through.', 'Differences in understanding and unkept promises remain at the heart of many disputes.'),
  ]),
  les(L31, 'Mexico: Independence, Reform and Revolution', 'Mexico\'s path from Spanish colony to republic included war, foreign intervention and a revolution that reshaped the nation.', 9,
`Mexico's modern history begins with independence. On September 16, 1810, the priest Miguel Hidalgo called for rebellion in the town of Dolores, in what is called the Grito de Dolores. Hidalgo was captured and executed in 1811, and José Maria Morelos continued the struggle. Independence was finally achieved in 1821 through the Plan of Iguala and leader Agustin de Iturbide, who briefly became emperor. Mexico became a republic in 1824. Instability followed. Antonio Lopez de Santa Anna dominated politics for years, and Mexico lost Texas and then, in 1848, much of its northern territory to the United States.

In the 1850s liberals led by Benito Juarez, a Zapotec lawyer who became president, pushed the Reform: a constitution in 1857 and laws limiting the power of the Church and the army. Conservatives resisted, and civil war followed. When Mexico suspended debt payments, France, backed by Mexican conservatives, invaded and installed Archduke Maximilian of Austria as emperor in 1864. Mexican forces won a famous victory at Puebla on May 5, 1862, remembered as Cinco de Mayo, and eventually drove the French out. Maximilian was executed in 1867.

General Porfirio Diaz governed Mexico for most of the years from 1876 to 1911, a period called the Porfiriato. Railroads, mining and foreign investment grew, but land concentrated in a few hands and many peasants and workers lived in hardship. In 1910 Francisco Madero called for revolt against Diaz, beginning the Mexican Revolution. Leaders such as Emiliano Zapata, who demanded land reform under the slogan "Tierra y Libertad," and Francisco "Pancho" Villa fought in a complex, multi-sided conflict. The Constitution of 1917 included land reform, labor rights and limits on the Church. Fighting lasted roughly a decade and caused hundreds of thousands of deaths, with estimates varying widely.

Worked case: the Constitution of 1917 shows a revolution turning demands for land and labor into law.`,
  [
    mc(L31, 1, 1, 'What was the Grito de Dolores?', ['Miguel Hidalgo\'s 1810 call for rebellion against Spain', 'A battle with French troops during the Reform era', 'A peace treaty ending the war with the United States', 'The 1917 constitution that set up land and labor reforms'], 'It began the independence movement.', 'Hidalgo\'s call on September 16, 1810, is celebrated as the start of the independence struggle.'),
    tf(L31, 2, 1, 'Benito Juarez led the liberal Reform movement in Mexico.', 0, 'He was president in the 1850s and 1860s.', 'Juarez became a symbol of liberal reform and resistance to the French.'),
    mc(L31, 3, 2, 'What happened to Maximilian, installed by France as emperor?', ['He was executed in 1867', 'He ruled until 1900', 'He became president of Mexico', 'He won at Puebla'], 'Mexican forces defeated the French.', 'After French withdrawal, Maximilian was captured and executed.'),
    mc(L31, 4, 2, 'What did Emiliano Zapata demand?', ['Land reform for peasants', 'A French monarchy', 'The restoration of Diaz', 'Union with the United States'], 'His slogan was "Tierra y Libertad."', 'Zapata championed the return of land to rural communities.'),
    mc(L31, 5, 3, 'Why did the Porfiriato end in revolution?', ['Growth was uneven, with land and power concentrated in few hands', 'The country had no economy to speak of and no railroads', 'Mexico was invaded by Spain, which tried to retake the country', 'There was too much democracy, and elections kept removing leaders'], 'Look at who benefited.', 'Economic development did not reach many peasants and workers, fueling discontent.'),
  ]),
  les(L32, 'North America from the Late Twentieth Century to Today', 'Economic integration, new technology, demographic change and global events have reshaped the continent\'s three nations.', 9,
`Recent history is the hardest to judge, since the full consequences are not yet known. Historians therefore focus on large structural changes and avoid sweeping verdicts.

After the end of the Cold War, the United States stood as the leading global power. The three nations of North America grew more economically connected. The North American Free Trade Agreement took effect in 1994, linking the United States, Canada and Mexico. It was replaced in 2020 by the United States-Mexico-Canada Agreement. Supporters credited trade deals with growth and lower prices, while critics pointed to lost jobs in some industries and disruptions for some farmers and workers. Economists still study how much each effect mattered.

Demography shifted. The U.S. Immigration Act of 1965 ended the national origins quotas, and immigration from Asia and Latin America grew, changing the country's population. Canada, too, welcomed large numbers of immigrants. In 2000 Mexican voters elected Vicente Fox, ending the Institutional Revolutionary Party's seven decades in the presidency.

Technology transformed work and daily life: personal computers, the internet and smartphones reshaped communication, commerce and politics. The terrorist attacks of September 11, 2001, killed nearly 3,000 people and led to wars in Afghanistan and Iraq and to new security laws that continue to be debated. The financial crisis of 2008 and the COVID-19 pandemic, beginning in 2020, tested economies and health systems across the continent. In 2008 Barack Obama was elected the first Black president of the United States. In Canada, the national reckoning with residential schools became a central issue after the Truth and Reconciliation Commission's 2015 report.

How should a student approach recent events? Use several sources, separate facts from opinion, distinguish immediate causes from deeper trends, and be careful about claims that history has a clear verdict.

Worked case: NAFTA shows that one policy can have different effects on different groups and regions, so the question is rarely just "good or bad."`,
  [
    mc(L32, 1, 1, 'Which agreement replaced NAFTA in 2020?', ['The USMCA', 'The Marshall Plan', 'The Treaty of Ghent', 'The Dawes Act'], 'It also includes three countries.', 'The United States-Mexico-Canada Agreement replaced NAFTA.'),
    tf(L32, 2, 1, 'The Immigration Act of 1965 ended the national origins quota system.', 0, 'It changed the 1924 system.', 'The 1965 act opened immigration more broadly, especially from Asia and Latin America.'),
    mc(L32, 3, 2, 'What happened in Mexico in 2000?', ['Voters ended the long hold on the presidency of the Institutional Revolutionary Party', 'The Revolution began with an uprising against the president', 'Independence from Spain was declared in the capital', 'NAFTA was replaced by a new three-nation agreement'], 'Think of Vicente Fox.', 'Fox\'s election ended about seven decades of rule by one party.'),
    mc(L32, 4, 2, 'Why do historians approach very recent events cautiously?', ['The full consequences and sources are not yet available', 'Nothing of historical importance has happened recently', 'Recent events do not matter as much as older ones', 'All sources about them are kept secret forever by governments'], 'Think about hindsight.', 'Lack of distance and complete evidence makes confident verdicts risky.'),
    mc(L32, 5, 3, 'What does the NAFTA example show about evaluating a policy?', ['Effects can differ across groups and regions, so simple verdicts are misleading', 'It was good for everyone in all three countries equally', 'It had no measurable effects on trade or jobs', 'It harmed workers in every country to the same degree'], 'Consider who gained and who lost.', 'Trade policy produces winners and losers, so careful analysis is needed.'),
  ]),
];

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'history-north-america',
    label: 'History of North America',
    blurb: 'From the Indigenous nations before 1492 through colonisation, revolution, civil war and the modern era, with chapters on Canada and Mexico. Told from many perspectives, with attention to causes, consequences and debates among historians.',
    accent: '#1D4ED8',
    framework: 'ncas',
    tracks: [
      { id: 'history-north-america.t1', title: 'First Peoples and the Meeting of Worlds', blurb: 'North America before and after 1492, from Cahokia to the Columbian Exchange and the first colonies.', level: 'FOUNDATION', lessons: T1 },
      { id: 'history-north-america.t2', title: 'Colonial North America', blurb: 'Slavery, colonial societies and the Native nations who shaped the colonial world.', level: 'FOUNDATION', lessons: T2 },
      { id: 'history-north-america.t3', title: 'Revolution and Republic', blurb: 'The road to independence, the war, the Constitution and the early republic.', level: 'INTERMEDIATE', lessons: T3 },
      { id: 'history-north-america.t4', title: 'Expansion, Division and Civil War', blurb: 'Removal, war with Mexico, reform, the sectional crisis, the Civil War and Reconstruction.', level: 'INTERMEDIATE', lessons: T4 },
      { id: 'history-north-america.t5', title: 'Industrial America', blurb: 'The Gilded Age, immigration, the Progressive Era, World War I and the 1920s.', level: 'INTERMEDIATE', lessons: T5 },
      { id: 'history-north-america.t6', title: 'Depression, War and Rights', blurb: 'The New Deal, World War II, the Cold War, civil rights and the upheavals of the 1960s and 1970s.', level: 'ADVANCED', lessons: T6 },
      { id: 'history-north-america.t7', title: 'Canada, Mexico and Today', blurb: 'Confederation, Indigenous peoples in Canada, Mexico\'s independence to revolution, and the recent past.', level: 'ADVANCED', lessons: T7 },
    ],
  },
  bank: { curriculumId: 'history-north-america', questions: QS },
};
