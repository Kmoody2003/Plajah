/**
 * Frederick Douglass — Dossier #1 (vertical slice).
 *
 * Every sentence in a node's `text` rests on claims in the ledger. Where scholarship disagrees,
 * the claim is marked contested and carries a note. Likeness descriptors were written by viewing
 * the actual reference portraits (Miller daguerreotype c.1847-52, NYHS c.1866, Warren c.1879).
 */
import type { Claim, CharacterBible, Dossier, DossierAsset, Room, SourceRef } from '../../services/dossier/dossierTypes';
import rawAssets from './douglassAssets.json';
import reconManifest from './douglassRecon.json';
import { douglassScenes } from './douglassScenes';

const sources: SourceRef[] = [
  { id: 's-narrative', kind: 'primary', citation: 'Frederick Douglass, Narrative of the Life of Frederick Douglass, an American Slave (Boston: Anti-Slavery Office, 1845).', url: 'https://www.loc.gov/item/09010831/' },
  { id: 's-bondage', kind: 'primary', citation: 'Frederick Douglass, My Bondage and My Freedom (New York: Miller, Orton & Mulligan, 1855).' },
  { id: 's-lifetimes', kind: 'primary', citation: 'Frederick Douglass, Life and Times of Frederick Douglass (Hartford: Park Publishing, 1881; rev. ed. Boston: De Wolfe, Fiske, 1892).' },
  { id: 's-fourth', kind: 'primary', citation: 'Frederick Douglass, "What to the Slave Is the Fourth of July?", address delivered in Rochester, New York, 5 July 1852.' },
  { id: 's-blight', kind: 'scholarly', citation: 'David W. Blight, Frederick Douglass: Prophet of Freedom (New York: Simon & Schuster, 2018).' },
  { id: 's-mcfeely', kind: 'scholarly', citation: 'William S. McFeely, Frederick Douglass (New York: W. W. Norton, 1991).' },
  { id: 's-nps', kind: 'archive', citation: 'National Park Service, Frederick Douglass National Historic Site (Cedar Hill), Washington, D.C.', url: 'https://www.nps.gov/frdo/' },
  { id: 's-loc', kind: 'archive', citation: 'Library of Congress, Frederick Douglass Papers.', url: 'https://www.loc.gov/collections/frederick-douglass-papers/' },
];

const claims: Claim[] = [
  { id: 'c-born', text: 'Frederick Augustus Washington Bailey was born into slavery in Talbot County, on Maryland\'s Eastern Shore.', when: '1818', where: 'Talbot County, Maryland', confidence: 'established', sourceIds: ['s-narrative', 's-blight'] },
  { id: 'c-birthyear', text: 'He did not know his own birth date; scholars place his birth in February 1818, following the slaveholder\'s records, while Douglass himself gave 1817 or 1818 at different times.', confidence: 'probable', sourceIds: ['s-narrative', 's-blight'], note: 'Douglass\'s own estimates varied; 1818 rests chiefly on Aaron Anthony\'s records. He later adopted 14 February as his birthday.' },
  { id: 'c-mother', text: 'He was separated from his mother, Harriet Bailey, as a small child and saw her only a few times before she died.', confidence: 'established', sourceIds: ['s-narrative', 's-bondage'] },
  { id: 'c-father', text: 'Douglass believed his father was a white man and suspected it was his master; no document settles the question.', confidence: 'contested', sourceIds: ['s-narrative', 's-bondage', 's-blight'], note: 'Douglass wrote that his father was white and that rumor named his master; historians treat the identification as unproven.' },
  { id: 'c-baltimore', text: 'Around age eight he was sent to Baltimore to the household of Hugh and Sophia Auld.', when: '1826', where: 'Baltimore, Maryland', confidence: 'established', sourceIds: ['s-narrative', 's-lifetimes'] },
  { id: 'c-reading', text: 'Sophia Auld began teaching him the alphabet until her husband forbade it; Douglass kept learning by trading bread for lessons from neighborhood boys and by copying letters from shipyard timbers.', confidence: 'established', sourceIds: ['s-narrative'] },
  { id: 'c-orator', text: 'He bought and studied The Columbian Orator, a schoolbook of speeches and dialogues, which shaped his ideas about liberty and rhetoric.', confidence: 'established', sourceIds: ['s-narrative', 's-bondage', 's-blight'] },
  { id: 'c-covey', text: 'Hired out to the farmer Edward Covey, who had a reputation for "breaking" enslaved people, Douglass endured months of brutality, then fought back in a struggle he called a turning point in his life.', when: '1834', confidence: 'established', sourceIds: ['s-narrative', 's-blight'] },
  { id: 'c-escape', text: 'On 3 September 1838 he escaped by train and ferry, wearing a sailor\'s clothes and carrying borrowed sailor\'s protection papers, reaching New York City.', when: '1838-09-03', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight'], note: 'The 1845 Narrative omitted these details to protect the Underground Railroad; Life and Times (1881) supplied them.' },
  { id: 'c-anna', text: 'Anna Murray, a free Black woman he had met in Baltimore, helped fund his escape; they married in New York days later and moved to New Bedford, Massachusetts.', when: '1838-09', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight', 's-mcfeely'] },
  { id: 'c-name', text: 'In New Bedford he took the surname Douglass, suggested by his host Nathan Johnson after a character in Walter Scott\'s The Lady of the Lake.', when: '1838', confidence: 'established', sourceIds: ['s-narrative', 's-lifetimes'] },
  { id: 'c-nantucket', text: 'In August 1841 he spoke at an anti-slavery convention on Nantucket, which led the Massachusetts Anti-Slavery Society to hire him as a lecturer.', when: '1841-08', where: 'Nantucket, Massachusetts', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight'] },
  { id: 'c-narrative', text: 'He published his Narrative in 1845; it was an immediate success and was widely read in the United States and abroad.', when: '1845', confidence: 'established', sourceIds: ['s-narrative', 's-blight'] },
  { id: 'c-britain', text: 'From 1845 to 1847 he lectured in Britain and Ireland; British supporters raised money to pay his former owner, which secured his legal freedom in 1846.', when: '1845-1847', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight', 's-mcfeely'] },
  { id: 'c-northstar', text: 'In December 1847 he founded the abolitionist newspaper The North Star in Rochester, New York, later renamed Frederick Douglass\' Paper.', when: '1847-12', where: 'Rochester, New York', confidence: 'established', sourceIds: ['s-bondage', 's-blight'] },
  { id: 'c-seneca', text: 'In July 1848 he attended the Seneca Falls Convention and spoke in support of the resolution calling for women\'s right to vote.', when: '1848-07', where: 'Seneca Falls, New York', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight'] },
  { id: 'c-fourth', text: 'On 5 July 1852 he delivered "What to the Slave Is the Fourth of July?" in Rochester, contrasting the nation\'s celebration of liberty with the continued enslavement of millions.', when: '1852-07-05', where: 'Rochester, New York', confidence: 'established', sourceIds: ['s-fourth', 's-blight'] },
  { id: 'c-constitution', text: 'In 1851 he broke with William Lloyd Garrison, rejecting the view that the Constitution was a pro-slavery document and arguing instead that it could be read as an anti-slavery instrument.', when: '1851', confidence: 'established', sourceIds: ['s-blight', 's-mcfeely'] },
  { id: 'c-brown', text: 'He knew the abolitionist John Brown, but in 1859 he declined to join the raid on Harpers Ferry, judging it doomed.', when: '1859', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight'] },
  { id: 'c-soldiers', text: 'During the Civil War he recruited Black soldiers, including for the 54th Massachusetts Infantry, in which two of his sons served.', when: '1863', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight'] },
  { id: 'c-lincoln', text: 'He met President Abraham Lincoln at the White House in August 1863 to press for equal pay and protection for Black soldiers, and met him again in 1864 and at the 1865 inauguration reception.', when: '1863-08', where: 'Washington, D.C.', confidence: 'established', sourceIds: ['s-lifetimes', 's-blight'] },
  { id: 'c-suffrage', text: 'After the war he campaigned for Black citizenship and voting rights; in 1869 he split with some women\'s suffrage leaders by supporting the Fifteenth Amendment even though it did not enfranchise women.', when: '1869', confidence: 'established', sourceIds: ['s-blight', 's-mcfeely'] },
  { id: 'c-offices', text: 'He held federal posts: Marshal of the District of Columbia (1877), Recorder of Deeds for D.C. (1881), and U.S. Minister Resident and Consul General to Haiti (1889–1891).', when: '1877-1891', confidence: 'established', sourceIds: ['s-blight', 's-nps'] },
  { id: 'c-cedarhill', text: 'He bought the house he named Cedar Hill, overlooking Washington from Anacostia, and lived there from the late 1870s until his death.', when: '1877-1895', where: 'Anacostia, Washington, D.C.', confidence: 'established', sourceIds: ['s-nps', 's-blight'] },
  { id: 'c-helen', text: 'After Anna\'s death in 1882 he married Helen Pitts, a white woman and a former clerk in his office, in 1884; the marriage drew public criticism.', when: '1884', confidence: 'established', sourceIds: ['s-blight', 's-mcfeely'] },
  { id: 'c-death', text: 'He died of heart failure at Cedar Hill on 20 February 1895, hours after attending a meeting of the National Council of Women.', when: '1895-02-20', confidence: 'established', sourceIds: ['s-blight', 's-nps'] },
  { id: 'c-selfmade', text: 'Douglass revised his autobiography across three books (1845, 1855, 1881/1892), and historians treat each as both testimony and a deliberately shaped public self-presentation.', confidence: 'established', sourceIds: ['s-blight', 's-mcfeely'] },
];

// ── Assets (real, rights-cleared; pulled live from Commons by sourceAdapters) ──
const rawList = rawAssets as Array<{
  id: string; title: string; date?: string; url: string; recordUrl: string;
  rights: { status: DossierAsset['rights']['status']; credit: string; verifiedAt?: string };
}>;

const assetClaims: Record<string, string[]> = {
  'ref-1847-miller': ['c-born', 'c-nantucket', 'c-narrative'],
  'ref-1855-younger': ['c-northstar', 'c-seneca'],
  'ref-1860s-merrill-crosby': ['c-soldiers', 'c-lincoln'],
  'ref-1866-nyhs': ['c-suffrage'],
  'ref-1879-warren': ['c-offices', 'c-cedarhill'],
  'ref-1890s-grandson': ['c-death', 'c-cedarhill'],
  'doc-1845-narrative-cover': ['c-narrative'],
  'doc-lifeandtimes-1882-a': ['c-selfmade'],
};

const assets: DossierAsset[] = rawList.map(a => ({
  id: a.id,
  kind: a.id.startsWith('doc-') ? 'document' : 'photo',
  title: a.title,
  url: a.url,
  rights: a.rights,
  claimIds: assetClaims[a.id] ?? [],
}));

// ── Character Bible (likeness lock) ───────────────────────────────────────
const characters: CharacterBible[] = [
  {
    id: 'douglass',
    name: 'Frederick Douglass',
    coreDescriptor:
      'Black man of tall, powerful build with a high broad forehead, strong straight dark brows, deep-set intense direct eyes, a firm closed mouth, and a thick full head of hair; complexion exactly as in the reference portraits, neither lightened nor darkened; a serious, commanding, dignified bearing',
    forbidden: ['smiling', 'cartoonish features', 'caricature', 'darkened or lightened complexion', 'modern hairstyle', 'clean-shaven elder', 'glasses'],
    seed: 18180214,
    birthYear: 1818,
    variants: [
      { id: 'young', ageRange: [24, 36], descriptor: 'young man, thick dark curly hair swept up and back from the forehead, clean-shaven apart from a small chin beard, direct unwavering gaze', referenceAssetIds: ['ref-1847-miller', 'ref-1855-younger'] },
      { id: 'mid', ageRange: [37, 55], descriptor: 'mature man, voluminous mostly dark hair with only slight gray at the temples, short chin beard with moustache, intense measured stare', referenceAssetIds: ['ref-1855-younger', 'ref-1860s-merrill-crosby', 'ref-1866-nyhs'] },
      { id: 'elder', ageRange: [56, 80], descriptor: 'elder statesman, full mane of white hair swept back, full white-grey beard and moustache, composed weathered face', referenceAssetIds: ['ref-1879-warren', 'ref-1890s-grandson'] },
    ],
    wardrobe: {
      '1840s': 'dark frock coat, patterned silk waistcoat, loosely tied cravat',
      '1860s': 'dark frock coat, white shirt, black cravat',
      '1880s': 'dark three-piece suit, white shirt, dark bow tie',
    },
  },
];

// ── Rooms ─────────────────────────────────────────────────────────────────
const rooms: Room[] = [
  {
    id: 'r1', title: 'Born Between Two Worlds', years: '1818–1838',
    nodes: [{
      id: 'n-r1-story', title: 'Learning to Read, Learning to Be Free', kind: 'story',
      claimIds: ['c-born', 'c-birthyear', 'c-mother', 'c-father', 'c-baltimore', 'c-reading', 'c-orator', 'c-covey', 'c-escape', 'c-anna'],
      assetIds: ['ref-1847-miller'],
      text: {
        early: 'A long time ago, a boy named Frederick was born in Maryland. In those days, some people were not allowed to be free. They were made to work for other people. Frederick was one of them. When he was very little, he was taken away from his mother. But Frederick loved to learn. A kind woman showed him his letters, and he learned that reading could help him find freedom.',
        elementary: 'Frederick Bailey was born into slavery in Maryland around 1818. He never knew his exact birthday, because nobody wrote it down for him. As a small child he was separated from his mother. When he was about eight, he was sent to live in Baltimore, where Sophia Auld began teaching him the alphabet. Her husband made her stop. He said learning would make a slave "unfit" to be a slave. Frederick decided the opposite: reading was the road to freedom. He traded bread to neighborhood boys for lessons and practiced writing letters on the boards at the shipyard. In 1838, when he was about twenty, he escaped to the North.',
        middle: 'Frederick Bailey was born in Talbot County, Maryland, around 1818, and was separated from his mother, Harriet, as a small child. In Baltimore, Sophia Auld started teaching him to read until her husband forbade it. Frederick finished the job himself, trading bread for lessons from poor white boys and studying a schoolbook of speeches called The Columbian Orator. Reading showed him that slavery was not natural or God-given but a system people had built, and could take apart. Hired out to a farmer named Edward Covey, who beat him, he finally fought back in 1834 and called it a turning point: he resolved that however long he might remain a slave in form, the day had passed when he could be one in fact. On 3 September 1838 he escaped north, dressed as a sailor.',
        high: 'Douglass\'s 1845 Narrative makes literacy the hinge of his life. Hugh Auld\'s objection to Sophia\'s lessons, that learning would "forever unfit" a slave, was, Douglass wrote, "the first decidedly antislavery lecture" he ever heard. He taught himself to read and write through trades with neighborhood boys and copying letters from ship timber, and found in The Columbian Orator a vocabulary for liberty. After months of brutality under Edward Covey he resisted physically in 1834, an episode he framed as the moment "a slave was made a man." In September 1838, with the help of Anna Murray, a free Black woman in Baltimore, he took a train and ferry north wearing a sailor\'s clothes and carrying a free sailor\'s papers. The 1845 text deliberately withheld those details to protect others still using the same routes. He reached New York, and he and Anna married days later.',
        university: 'Douglass\'s account of his enslavement survives in three autobiographies (1845, 1855, 1881/1892) that differ in emphasis and detail, so the historian reads each as testimony and as a strategic public self-fashioning, as Blight and McFeely both note. Basic facts remain contested or unrecoverable: Douglass gave 1817 or 1818 for his birth, and later adopted 14 February as his birthday; Aaron Anthony\'s records support 1818. He believed his father was white and rumor named his master, but no document confirms it. The 1845 Narrative also omitted the specifics of his escape to protect the networks that aided it; Life and Times (1881) supplied them, including the borrowed sailor\'s papers and the role of Anna Murray, whose earnings helped fund the journey. Reading the Narrative against the genre conventions of the slave narrative, with its authenticating prefaces by white abolitionists, shows how Douglass both used and subverted them.',
      },
    }],
  },
  {
    id: 'r2', title: 'A New Name, a New Voice', years: '1838–1847',
    nodes: [{
      id: 'n-r2-story', title: 'From Bailey to Douglass', kind: 'story',
      claimIds: ['c-anna', 'c-name', 'c-nantucket', 'c-narrative', 'c-britain'],
      assetIds: ['doc-1845-narrative-cover'],
      text: {
        early: 'When Frederick reached the North, he was free! He picked a new name: Douglass. Then he began to speak. He told crowds of people the truth about slavery. His words were so strong that people listened. He also wrote a book about his life.',
        elementary: 'In New Bedford, Massachusetts, Frederick took a new last name, Douglass. In 1841, at a meeting on Nantucket Island, he stood up and told his story. The crowd was so moved that he was hired to travel and speak against slavery. In 1845 he published a book about his life. It sold so well that it made him famous, which also made him easier to find. So he sailed to Britain, where friends raised the money to buy his freedom for good.',
        middle: 'In New Bedford, Frederick Bailey became Frederick Douglass, borrowing the name from a character in a poem by Walter Scott. In August 1841 an impromptu speech at an anti-slavery convention on Nantucket launched him as a lecturer for the Massachusetts Anti-Slavery Society. His 1845 Narrative was a sensation, but it named real people and places, putting him in danger of recapture. He sailed to Britain and Ireland for nearly two years, drawing large audiences. British friends raised money to pay his former owner, and in 1846 he was legally free.',
        high: 'Douglass\'s emergence as a public voice came in August 1841 at Nantucket, where his testimony so impressed William Lloyd Garrison that the Massachusetts Anti-Slavery Society hired him as a lecturer. Audiences sometimes doubted that so eloquent a speaker could have been a slave, which was part of the motive for the Narrative (1845): to fix names, dates, and places into a verifiable record. Its success also exposed him. In 1845 he left for Britain, where antislavery societies hosted him for two years. His British friends raised funds to purchase his freedom from Hugh Auld in 1846, a transaction that troubled some American abolitionists, who argued that paying a slaveholder legitimized slave-holding.',
        university: 'The 1841–1847 period shows the structural constraints of the antislavery movement\'s platform. Garrisonian abolitionism offered Douglass an audience and a prefatory authentication (Garrison\'s and Wendell Phillips\'s letters framing the Narrative) while also casting him as the movement\'s living exhibit rather than its theorist, a tension Blight emphasizes. The British tour, funded in part by transatlantic networks, produced the legal purchase of his freedom in 1846; the episode divided American abolitionists over the ethics of "buying" liberty. Britain also gave Douglass an experience of unsegregated public life and a platform not mediated by Garrison, groundwork for his return to the United States intent on running his own newspaper, which brought the break with Garrison that followed.',
      },
    }],
  },
  {
    id: 'r3', title: 'The North Star', years: '1847–1861',
    nodes: [
      {
        id: 'n-r3-story', title: 'Editor, Orator, Independent Thinker', kind: 'story',
        claimIds: ['c-northstar', 'c-seneca', 'c-constitution', 'c-brown'],
        assetIds: ['ref-1855-younger'],
        text: {
          early: 'Frederick started his own newspaper. He called it The North Star, after the star that guided people to freedom. He wrote about freedom and fairness for everyone. He believed every person should have the same chances, girls and boys, Black and white.',
          elementary: 'In 1847 Douglass started a newspaper in Rochester, New York, called The North Star, named for the star that guided people toward freedom. Its motto said that "right is of no sex" and "truth is of no color." In 1848 he went to a meeting in Seneca Falls, where women asked for the right to vote. Douglass spoke up in support, even though many people thought it was a strange idea. He believed that fairness had to be for everyone.',
          middle: 'Back in the United States, Douglass settled in Rochester and launched The North Star in December 1847, later renamed Frederick Douglass\' Paper. At the 1848 Seneca Falls Convention he spoke in support of women\'s right to vote, helping its most controversial resolution pass. By 1851 he had broken with his mentor William Lloyd Garrison. Garrison called the Constitution "a covenant with death"; Douglass concluded it could be read as an anti-slavery document, and said so in his newspaper.',
          high: 'Rochester was Douglass\'s base for about twenty-five years. His newspapers made him an editor, not just a speaker, and gave him independence from the Garrisonian press. At Seneca Falls in July 1848 he supported the resolution on women\'s suffrage, tying the two causes together for the rest of his life. His 1851 break with Garrison turned on a constitutional question: Garrison burned copies of the Constitution as a pro-slavery pact, while Douglass argued that its text, read on its own terms, did not sanction slavery and could be used against it. In 1852 he turned that moral clarity on the nation itself in "What to the Slave Is the Fourth of July?" In 1859, though he admired John Brown, he refused to join the raid at Harpers Ferry, judging it a suicidal plan.',
          university: 'Douglass\'s Rochester years register a double shift: from agent to editor, and from Garrisonian moral suasion toward a political, constitutionalist antislavery. His 1851 position, that the Constitution, read on its own terms, did not sanction slavery, put him in dialogue with Lysander Spooner and Gerrit Smith\'s Liberty Party, and cost him Garrison\'s friendship (Blight; McFeely). The 1852 Fourth of July address performs the argument rhetorically: it moves from commemorating the Founders to indicting the nation\'s hypocrisy, then ends with a measured, constitutionally grounded hope. His reasons for declining Harpers Ferry, as given in Life and Times (1881), are read alongside the later recollection that shaped Brown\'s reputation; as with the autobiographies, the retrospective account serves the narrator\'s present purposes.',
        },
      },
      {
        id: 'n-r3-fourth', title: '"What to the Slave Is the Fourth of July?"', kind: 'source-reading',
        claimIds: ['c-fourth'],
        assetIds: [],
        text: {
          early: 'One day, people in Rochester asked Frederick to give a speech on the Fourth of July. That is a holiday about freedom. Frederick asked a hard question: is the holiday for everyone? Some people were still not free. He told the truth, even when it was hard to hear.',
          elementary: 'In 1852 the people of Rochester asked Douglass to speak about the Fourth of July, the holiday that celebrates freedom. Douglass did something brave. He asked, "What, to the American slave, is your 4th of July?" He reminded everyone that the country celebrated freedom while millions of people were still enslaved. He said the nation could not honor liberty and slavery at the same time.',
          middle: 'On 5 July 1852, in Rochester, Douglass delivered one of the great American speeches. He began by praising the Founders, then turned: the Fourth of July, he said, belonged to the people who could celebrate it; for the enslaved it was "a day that reveals to him, more than all other days in the year, the gross injustice and cruelty to which he is the constant victim." He spoke for more than an hour, and the written text became a pamphlet. The speech combines moral anger, careful argument about the Constitution, and a final note of hope.',
          high: 'The 1852 Fourth of July address is a model of rhetorical structure: an exordium honoring the Founders, a turn ("but I am not included"), an indictment, a legal argument that the Constitution is not a pro-slavery document, and a closing of cautious hope. Douglass speaks as a representative of the enslaved, asking, "What, to the American slave, is your 4th of July?" His answer is that it is a day of mockery. Reading the speech beside the Declaration of Independence shows him holding the nation to its own stated principles.',
          university: 'The Fourth of July address (5 July 1852) is a primary source worth reading closely for its form. Its structure, a eulogy for the Founders followed by an indictment of their heirs, borrows from the jeremiad tradition, in which a covenant people are called back to their stated ideals. The oration also states the constitutional argument Douglass had adopted in 1851, which separates it from the Garrisonian position. For historiography, the speech has been read as the founding text of an African American political tradition that appeals to American ideals against American practice (Blight).',
        },
      },
    ],
  },
  {
    id: 'r4', title: 'War and Reconstruction', years: '1861–1877',
    nodes: [{
      id: 'n-r4-story', title: 'Soldiers, a President, and the Vote', kind: 'story',
      claimIds: ['c-soldiers', 'c-lincoln', 'c-suffrage'],
      assetIds: ['ref-1860s-merrill-crosby', 'ref-1866-nyhs'],
      text: {
        early: 'When the Civil War came, Douglass helped. He asked Black men to join the army, and two of his own sons did. He talked with President Lincoln at the White House. He told the president that soldiers should be treated fairly. After the war, he worked so that everyone could have the right to vote.',
        elementary: 'During the Civil War, Douglass helped recruit Black soldiers for the Union Army, including the famous 54th Massachusetts, where two of his sons served. In 1863 he visited President Abraham Lincoln at the White House. He asked that Black soldiers get the same pay and protection as white soldiers. After the war ended and slavery was abolished, Douglass kept working so that Black Americans would have the right to vote.',
        middle: 'Douglass pressed Lincoln to make the war a war against slavery, then to enlist Black soldiers. When he did, Douglass recruited for the 54th Massachusetts; two of his sons, Lewis and Charles, enlisted. In August 1863 he met Lincoln at the White House to demand equal pay and protection for Black troops. He met him twice more, including at the 1865 inauguration reception, where Lincoln called him "my friend Douglass." After the war he campaigned for Black citizenship and the vote, supporting the Fourteenth and Fifteenth Amendments.',
        high: 'The war years show Douglass as strategist and critic. He used his newspaper and speeches to push Lincoln from preserving the Union toward emancipation, and he recruited Black soldiers while protesting their unequal pay. His 1863 White House meeting won a respectful hearing but no immediate change on pay; equal pay came by law in 1864. In Reconstruction he argued that freedom without the vote was incomplete. In 1869 he supported the Fifteenth Amendment, which barred race-based voting restrictions but did not enfranchise women, and broke publicly with allies such as Susan B. Anthony and Elizabeth Cady Stanton, who opposed it for that reason.',
        university: 'Douglass\'s relationship to Lincoln moves from criticism to qualified admiration; his 1876 Freedmen\'s Monument address calls Lincoln "preeminently the white man\'s President" while crediting him as a man who grew. The Reconstruction-era split in the suffrage movement, over the Fifteenth Amendment and the "Negro hour" argument, is one of the main points of historiographic debate: critics of Douglass\'s position cite his own earlier support for women\'s suffrage, while defenders cite the immediate physical danger facing Black voters in the South (Blight; McFeely). Treating the split as a tragic collision of two just causes is a common framing, though recent work stresses the racist rhetoric some white suffragists used.',
      },
    }],
  },
  {
    id: 'r5', title: 'Cedar Hill', years: '1877–1895',
    nodes: [{
      id: 'n-r5-story', title: 'The Sage of Anacostia', kind: 'story',
      claimIds: ['c-offices', 'c-cedarhill', 'c-helen', 'c-death', 'c-selfmade'],
      assetIds: ['ref-1879-warren', 'ref-1890s-grandson', 'doc-lifeandtimes-1882-a'],
      text: {
        early: 'When Frederick was older, he moved to a big house on a hill in Washington, D.C. He called it Cedar Hill. His hair was white. People from all over came to hear him talk. He kept speaking for fairness until the very end of his life.',
        elementary: 'In his later years, Douglass lived at Cedar Hill, a big house on a hill in Washington, D.C. He worked for the government, including as the U.S. representative to the country of Haiti. He wrote more books about his life, and people from across the country came to hear him speak. He died in 1895, on the same day he had been at a meeting about women\'s rights.',
        middle: 'Douglass spent his last decades in Washington. He served as Marshal of the District of Columbia, Recorder of Deeds, and U.S. Minister to Haiti. He lived at Cedar Hill in Anacostia, wrote Life and Times (1881; revised 1892), and kept lecturing on race, rights, and the broken promise of Reconstruction. After his first wife Anna died, he married Helen Pitts, a white woman, in 1884, and many people criticized the marriage. On 20 February 1895, after attending a meeting of the National Council of Women, he collapsed and died at home.',
        high: 'The last era saw Douglass as an elder statesman who watched Reconstruction collapse. He held federal offices, among them Marshal for D.C., Recorder of Deeds, and Minister to Haiti, which showed both recognition and the limits placed on a Black official. He revised Life and Times in 1892 and spoke out against lynching as late as the 1890s. His 1884 marriage to Helen Pitts, a white woman, drew criticism from Black and white observers alike, and he defended it publicly. He died at Cedar Hill on 20 February 1895; his house is now a National Park Service site.',
        university: 'The Cedar Hill years invite reflection on Douglass as memory-maker. The revised Life and Times (1892) and his late speeches shape the narrative of his career, and Blight reads them as acts of self-memorialization amid the collapse of Reconstruction. His federal appointments, though prestigious, were often shaped by party patronage and racial politics; his service in Haiti (1889–1891) was complicated by American commercial and naval interests in Môle Saint-Nicolas. Late-life engagements, including his stand against lynching and his remarks on Black migration, show him adjusting strategy to a political climate turning against Black rights. His posthumous reputation, from icon to contested figure, is itself a subject of study.',
      },
    }],
  },
];

// ── Reconstructions (only those whose image file exists; see scripts/dossier/importRecon.ts) ──
const reconAssets: DossierAsset[] = (reconManifest as Array<{ id: string; file: string; generator: string }>).flatMap(r => {
  const scene = douglassScenes.find(s => s.id === r.id);
  if (!scene) return [];
  return [{
    id: scene.id,
    kind: 'recreation' as const,
    title: scene.title,
    url: r.file,
    rights: { status: 'generated' as const, credit: `Reconstruction generated with ${r.generator} for Plajah` },
    claimIds: scene.claimIds,
    reconstruction: { characterIds: scene.spec.cast.map(c => c.characterId), basis: scene.basis, generator: r.generator },
  }];
});

const roomsWithRecon: Room[] = rooms.map(room => ({
  ...room,
  nodes: room.nodes.map((n, i) => i === 0
    ? { ...n, assetIds: [...n.assetIds, ...reconAssets.filter(a => douglassScenes.find(s => s.id === a.id)?.roomId === room.id).map(a => a.id)] }
    : n),
}));

export const douglassDossier: Dossier = {
  id: 'frederick-douglass',
  subject: 'Frederick Douglass',
  kind: 'biography',
  rooms: roomsWithRecon,
  ledger: { subjectId: 'frederick-douglass', sources, claims },
  assets: [...assets, ...reconAssets],
  characters,
  entrance: {
    tagline: "Born enslaved. Became the nation's conscience.",
    dates: '1818 — 1895',
    epigraph: {
      text: 'You have seen how a man was made a slave; you shall see how a slave was made a man.',
      cite: 'Narrative of the Life of Frederick Douglass, 1845',
    },
    montage: [
      { assetId: 'ref-1847-miller', label: '1847', focus: { x: 0.49, y: 0.37, scale: 150 } },
      { assetId: 'ref-1855-younger', label: '1855', focus: { x: 0.45, y: 0.26, scale: 150 } },
      { assetId: 'ref-1860s-merrill-crosby', label: '1863', focus: { x: 0.53, y: 0.34, scale: 190 } },
      { assetId: 'ref-1866-nyhs', label: '1866', focus: { x: 0.52, y: 0.30, scale: 150 } },
      { assetId: 'ref-1879-warren', label: '1879', focus: { x: 0.48, y: 0.36, scale: 170 } },
      { assetId: 'ref-1890s-grandson', label: '1892', focus: { x: 0.68, y: 0.36, scale: 200 } },
    ],
    scoreUrl: '/dossier/douglass/score.mp3',
  },
};
