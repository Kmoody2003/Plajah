import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const lid = (n: number) => `lit-studies-modern.l${String(n).padStart(2, '0')}`;
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
    id: 'lit-studies-modern',
    label: 'Literature Deep Study II: 1800 to Today',
    blurb: 'Read closely and think critically about two centuries of literature, from the Romantics and the great Victorian and Russian novels to Modernism, magical realism, postcolonial and Indigenous writing, drama, science fiction, graphic narrative and the lenses critics use today.',
    accent: '#D40055',
    framework: 'ncas',
    tracks: [
      {
        id: 'lit-studies-modern.t1',
        title: 'Romantic Voices',
        blurb: 'The turn of the nineteenth century: poets who trusted feeling, nature and imagination, a novelist who asked what creators owe their creations, and a master of social irony.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: lid(1),
            title: 'Romanticism and Wordsworth',
            blurb: 'Romantic writers put feeling, nature and ordinary life at the centre of poetry.',
            minutes: 7,
            body: `Romanticism was a broad movement in literature and the arts, strongest in Europe from the late 1700s to the mid-1800s. It grew up in a time of upheaval: the French Revolution began in 1789, and factories and cities were changing how people lived. Many Romantic writers answered by trusting individual feeling, imagination and the natural world rather than only reason and tradition.

A landmark was Lyrical Ballads, published in 1798 by William Wordsworth and Samuel Taylor Coleridge. In a preface added to the 1800 edition, Wordsworth argued that poetry should use the language of ordinary people and that it comes from "the spontaneous overflow of powerful feelings." He also said that good poems come from emotion recollected in tranquillity, so Romantic poetry is not simply raw emotion.

Consider Wordsworth's short poem about daffodils, usually called "I Wandered Lonely as a Cloud," published in 1807. It begins with a simile: the speaker drifts alone like a cloud. He then comes upon a huge crowd of golden daffodils dancing in the breeze, and the poem treats them almost as a cheerful company. The turn comes at the end. Back at home, lying on his couch in a quiet or thoughtful mood, he finds the flowers flash upon what he calls the inward eye, and his heart fills with pleasure. The experience was lived once but enjoyed again through memory.

Notice what the poem does: it elevates a humble scene, moves from outer nature to inner life, and shows imagination making an experience last. Those habits recur across the Romantics.`,
          },
          {
            id: lid(2),
            title: 'Keats and Shelley: Odes, Ruins and Uncertainty',
            blurb: 'Two younger Romantics, both dead before turning thirty-one, explored beauty, loss and the limits of power.',
            minutes: 7,
            body: `John Keats (1795 to 1821) and Percy Bysshe Shelley (1792 to 1822) belong to a younger generation of English Romantics. Both died young and abroad: Keats of tuberculosis in Rome at 25, Shelley by drowning in a boating accident off Italy at 29. Their reputations grew greatly after their deaths.

Keats wrote his great odes in 1819, including "Ode to a Nightingale" and "Ode on a Grecian Urn." In a letter of 1817 he described a quality he called negative capability, the ability to remain in uncertainties and doubts without reaching irritably after fact and reason. You can see it in the urn ode, where the speaker looks at scenes painted on an ancient vase and keeps weighing questions rather than settling them: the lovers on the vase will never kiss, yet will never grow old either. Something is gained, and something living is lost.

Shelley was an openly political poet who wrote about reform and liberty. His sonnet "Ozymandias," published in 1818, shows how to read layers. The speaker does not describe the ruin directly. He reports what a traveller told him: two huge legs of stone stand in a desert, near a half-sunk, shattered face whose sneer of command the sculptor captured. An inscription boasts of mighty works, but around it is only empty sand. The poem suggests that the tyrant's power has vanished while the sculptor's art survives, and that the story passes through several voices before it reaches us.

Both poets ask how art survives time. Keats answers with ambiguity, Shelley with irony.`,
          },
          {
            id: lid(3),
            title: 'Mary Shelley and Frankenstein',
            blurb: 'Frankenstein asks what creators owe to what they make, using nested narrators to tell the story.',
            minutes: 8,
            body: `Mary Shelley (1797 to 1851) was the daughter of the writer and thinker Mary Wollstonecraft and the philosopher William Godwin. She began Frankenstein in the summer of 1816 near Lake Geneva, where she was staying with Percy Bysshe Shelley, whom she later married, and with Lord Byron and others. The group challenged one another to write ghost stories. Her novel was published anonymously in 1818, and a revised edition followed in 1831. Its subtitle is "The Modern Prometheus," recalling the Greek figure who defied the gods to give humans fire.

The book has a layered structure. Captain Robert Walton writes letters to his sister about an Arctic expedition. He meets Victor Frankenstein, who tells his own history. Inside Victor's story, the creature speaks for himself. Each narrator frames and may colour the next, so readers must decide whom to trust.

A common mistake is to call the creature Frankenstein. That is the name of the scientist, and the creature has no name. In the novel, Victor brings the creature to life and then flees in horror, abandoning him. The creature teaches himself language and morality partly by observing a family and reading books, and then asks Victor to make him a companion. When Victor refuses, tragedy follows.

Readers have debated where the real fault lies: in the act of creating, or in the refusal of responsibility afterward. Notice how the novel gives the creature eloquent speech, which makes it hard to see him as a mere monster. The book remains a touchstone for questions about science, ethics and the duties of makers.`,
          },
          {
            id: lid(4),
            title: 'Jane Austen and the Art of Irony',
            blurb: 'Austen uses a witty narrator and free indirect style to study marriage, money and self-deception.',
            minutes: 7,
            body: `Jane Austen (1775 to 1817) wrote six major novels. Sense and Sensibility (1811), Pride and Prejudice (1813), Mansfield Park (1814) and Emma (1815) appeared in her lifetime, and Northanger Abbey and Persuasion were published after her death, at the end of 1817. Her early books appeared anonymously. Her subject is a narrow social world of English country families, but her method is sharp: she shows how money, rank and the need for a good marriage shape people's choices and expose their flaws.

Her signature tool is irony, saying one thing while meaning more. Pride and Prejudice opens with the sentence "It is a truth universally acknowledged" and goes on to say that a single man with a fortune must want a wife. The grand tone is a joke, because the novel quickly shows that it is the neighbouring families, more than the man, who want the marriage. The narrator's voice invites us to smile at social assumptions.

Austen also helped develop free indirect discourse. Instead of writing "Emma thought, I am sure I am right," the narrator slides into Emma's viewpoint without quotation marks, so we hear her confident judgments in her own style. In Emma, this lets readers share her certainty and then see how wrong she often is.

When reading Austen, ask who benefits from each marriage and whether the narrator agrees with a character or is gently mocking. The surface is polite; the critique is not.`,
          },
        ],
      },
      {
        id: 'lit-studies-modern.t2',
        title: 'The Age of the Realist Novel',
        blurb: 'Victorian, Russian and French writers who made the novel a tool for studying society, conscience and the inner life.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(5),
            title: 'The Brontes: Passion, Voice and Pseudonyms',
            blurb: 'Charlotte, Emily and Anne Bronte published under male-sounding names and gave Victorian fiction intense inner voices.',
            minutes: 7,
            body: `Charlotte, Emily and Anne Bronte grew up in the parsonage at Haworth in Yorkshire. In 1846 they published a joint volume of poems under the names Currer, Ellis and Acton Bell, pseudonyms that hid their sex but kept their initials. In 1847 came Charlotte's Jane Eyre, Emily's Wuthering Heights and Anne's Agnes Grey. Anne followed in 1848 with The Tenant of Wildfell Hall. Emily died in 1848, Anne in 1849 and Charlotte in 1855.

Jane Eyre is narrated in the first person by Jane herself, an orphan who becomes a governess. Because she tells her own story, readers share her moral reasoning and her insistence on dignity and independence, including when she refuses to give up her principles for love. The novel also contains the confined figure of Bertha Mason in the attic of Thornfield Hall, a character who has drawn a great deal of later debate.

Wuthering Heights is built differently. Its story is told through nested narrators, chiefly the visitor Lockwood and the housekeeper Nelly Dean, who report events over two generations. The result is a story whose violence and love come filtered through people who have their own biases, so readers must read between the lines.

The novels were controversial for their passion and harshness. Later writers responded to them directly. Jean Rhys, for example, published Wide Sargasso Sea in 1966, imagining Bertha's earlier life in the Caribbean.

When you read the Brontes, ask who is speaking, what they might want you to believe, and what the form of the telling reveals that the plot does not.`,
          },
          {
            id: lid(6),
            title: 'Charles Dickens: Serial Fiction and Social Conscience',
            blurb: 'Dickens published novels in instalments and used vivid characters to expose poverty, institutions and indifference.',
            minutes: 8,
            body: `Charles Dickens (1812 to 1870) was the most popular English novelist of his time. Many of his novels appeared first in serial form, in monthly parts or weekly magazine instalments, and readers waited eagerly for each one. Great Expectations, for example, ran in weekly instalments in 1860 and 1861. Serial publication shaped the stories: chapters tend to end on a hook, plots branch and recombine, and the author could respond to how readers reacted.

His novels combine comedy with sharp social criticism. Oliver Twist (1837 to 1839) follows an orphan through a workhouse and London's criminal underworld. Bleak House (1852 to 1853) satirises a legal case that drags on for years and ruins people. Hard Times (1854) attacks a rigid approach to education and industry that values only facts and figures. Dickens knew hardship from experience: as a boy he worked in a factory pasting labels on bottles while his father was in a debtors' prison.

Take the famous scene in Oliver Twist when hungry Oliver asks for more food. He says, "Please, sir, I want some more." The request is tiny and polite, but the horror of the adults shows how the institution punishes basic need. Dickens uses a child's plain words to expose a system's cruelty.

Critics sometimes say his characters are caricatures, with names and quirks that mark them at once. That is a deliberate technique, not a failure. It makes social types memorable, and in his best books it sits alongside real emotional depth.`,
          },
          {
            id: lid(7),
            title: 'George Eliot and the Moral Imagination',
            blurb: 'Eliot used an intelligent narrator and psychological realism to build sympathy for ordinary lives.',
            minutes: 7,
            body: `George Eliot was the pen name of Mary Ann Evans (1819 to 1880). She chose a male name for her fiction, as other women writers of her time did. Her novels include Adam Bede (1859), The Mill on the Floss (1860), Silas Marner (1861) and Middlemarch, published in eight parts in 1871 and 1872. Middlemarch carries the subtitle "A Study of Provincial Life," and the word study is a good guide to her method.

Eliot's narrator is learned, reflective and willing to step back and comment. This voice does not just tell events but analyses motives, comparing a single decision to larger patterns of society, science and ethics. Her aim, which she discussed in essays, was to extend readers' sympathy to people they might overlook.

Middlemarch follows several lives in a fictional English town in the years before the First Reform Act of 1832. Dorothea Brooke is idealistic and wants to do good, so she marries the older scholar Edward Casaubon, expecting to share a great intellectual project. She discovers that his work is stalled and his heart is cold. The novel does not simply mock her mistake. It shows how a person with high ideals and little guidance can make an error, and how she keeps growing.

The book ends by honouring ordinary lives that history does not record, suggesting that the world's good depends partly on small, unremembered acts. This is realism with an ethical purpose: attention itself becomes a form of moral care.`,
          },
          {
            id: lid(8),
            title: 'Russian Realism: Gogol, Turgenev, Dostoevsky and Tolstoy',
            blurb: 'Russian novelists wrote about conscience, class and ideas at a time of serfdom, reform and social strain.',
            minutes: 8,
            body: `Russian literature of the nineteenth century grew in a society ruled by tsars, with a large population of serfs who were legally bound to land and landowners. Serfdom was abolished in 1861, and writers worked in the long shadow of that institution, of censorship, and of debates about whether Russia should follow Europe or its own path.

Alexander Pushkin (1799 to 1837) is often regarded as the founder of modern Russian literature, with the verse novel Eugene Onegin, written in the 1820s and 1830s. Nikolai Gogol wrote the satirical novel Dead Souls (1842), about a swindler buying the names of dead serfs, and the story "The Overcoat." Ivan Turgenev's Fathers and Sons (1862) portrays a clash between generations and the young sceptic Bazarov.

Fyodor Dostoevsky (1821 to 1881) wrote Crime and Punishment (1866) and The Brothers Karamazov (1879 to 1880). In Crime and Punishment, the poor student Raskolnikov persuades himself that an extraordinary person may break the moral law for a greater purpose, and he murders a pawnbroker. The novel then follows his guilt, fear and slow turn toward confession. The critic Mikhail Bakhtin described Dostoevsky's books as polyphonic: many voices argue and none is simply the author's mouthpiece.

Leo Tolstoy (1828 to 1910) wrote War and Peace (1865 to 1869), set around the Napoleonic invasion of Russia, and Anna Karenina (1875 to 1877). Both interweave family life with large moral and historical questions. Remember that most of us read these works in translation, so word choices belong partly to the translator.`,
          },
          {
            id: lid(9),
            title: 'French Realism and Symbolism',
            blurb: 'Balzac and Flaubert studied society with precision; Baudelaire and the Symbolists turned toward suggestion and sensation.',
            minutes: 8,
            body: `French literature in the nineteenth century moved from detailed realism toward poetry of suggestion. Honore de Balzac planned a vast series of connected novels called La Comedie humaine, in which characters recur and money, ambition and class are shown at work. Pere Goriot (1835) is a well-known example. Realism of this kind tries to depict social life in careful detail.

Gustave Flaubert's Madame Bovary appeared in 1856 and 1857. Flaubert, known for a search for exactly the right word, wrote about Emma Bovary, a doctor's wife who reads romantic novels and expects life to match them. Her disappointment in provincial marriage leads to affairs, debt and ruin. Flaubert uses free indirect style, so that we hear Emma's longings in language close to her own thoughts while the narrator stays cool and observant. In 1857, Flaubert was tried for offending public morals and was acquitted.

In the same year, Charles Baudelaire published Les Fleurs du mal. Its author and publisher were fined, and six poems were ordered removed. His poems turn the modern city, desire and decay into images of ugly beauty. He influenced the Symbolists, including Paul Verlaine, Arthur Rimbaud and Stephane Mallarme. Symbolism prized suggestion over statement: a poem should evoke a mood through images and music rather than explain.

Rimbaud (1854 to 1891) wrote his best-known poetry as a teenager and gave up writing in his early twenties.

The contrast is useful: realism tries to show a world with the observer almost invisible, while Symbolism treats language as a way to point beyond the visible.`,
          },
        ],
      },
      {
        id: 'lit-studies-modern.t3',
        title: 'American Voices, Freedom and Dissent',
        blurb: 'The American Renaissance, Whitman and Dickinson, the slave narrative tradition, and the rise of African American literary culture.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(10),
            title: 'Poe and Hawthorne: Dark Romanticism',
            blurb: 'Poe and Hawthorne used guilt, secrecy and ambiguity to explore the darker side of the American mind.',
            minutes: 7,
            body: `Edgar Allan Poe (1809 to 1849) and Nathaniel Hawthorne (1804 to 1864) are often grouped under the label Dark Romanticism. Like other Romantics they valued imagination, but they were suspicious of easy optimism and drawn to guilt, obsession and the hidden side of human nature.

Poe was a poet, critic and short-story writer. His story "The Tell-Tale Heart" (1843) is narrated by a man who insists he is sane while describing a murder, so the narration itself becomes evidence of his disturbance. "The Fall of the House of Usher" (1839) and the poem "The Raven" (1845) show his control of mood. In a review of Hawthorne's tales he argued that a short story should aim at a single effect, with every detail serving it. His "The Murders in the Rue Morgue" (1841) is often called the first modern detective story.

Hawthorne wrote about the Puritan past. His ancestor John Hathorne was a judge at the Salem witch trials of 1692, and Nathaniel added a w to the family name. In The Scarlet Letter (1850), set in seventeenth-century Boston, Hester Prynne is made to wear a scarlet A as punishment for adultery. Over the novel the letter's meaning shifts: to the community it marks shame, but Hester's skill, charity and endurance change how some see it. Hawthorne leaves the symbol open rather than fixing one meaning.

Notice how both writers use unreliable or ambiguous perspectives, so readers have to weigh guilt and judgment for themselves.`,
          },
          {
            id: lid(11),
            title: 'Herman Melville: Moby-Dick and Bartleby',
            blurb: 'Melville turned whaling into a vast meditation on obsession, knowledge and community, then wrote a haunting story of refusal.',
            minutes: 8,
            body: `Herman Melville (1819 to 1891) went to sea as a young man and sailed on a whaling ship, the Acushnet, beginning in 1841. His first books, Typee (1846) and Omoo (1847), drew on his Pacific travels and were popular. His masterpiece, Moby-Dick (1851), sold poorly and was largely neglected until a revival of interest in the 1920s.

The novel begins with the famous sentence "Call me Ishmael." Ishmael is the narrator, but the book is also an encyclopaedia of whaling, with chapters on the anatomy of whales, the work of the ship and the history of whale hunting, alongside the central plot. Captain Ahab, who lost a leg to a white whale, drives his crew on the Pequod to hunt the animal at any cost. Ahab's single-minded obsession is one pole of the book. The other is the diverse crew, which includes sailors from many places, who work as a community under his command. Readers have long debated what the whale means, and the novel's refusal to settle that question is part of its power. Melville dedicated the book to Hawthorne.

His short story "Bartleby, the Scrivener" (1853) is narrated by a Wall Street lawyer whose copyist, Bartleby, answers every request with "I would prefer not to." The lawyer is baffled, sympathetic and eventually defeated by this quiet refusal. The story invites questions about work, responsibility and what we owe people we cannot understand.

Melville's last work, Billy Budd, was unfinished at his death in 1891 and published in 1924.`,
          },
          {
            id: lid(12),
            title: 'Walt Whitman and Emily Dickinson',
            blurb: 'Two radically different poets created an American voice, one expansive and public, the other compressed and private.',
            minutes: 8,
            body: `Walt Whitman (1819 to 1892) published the first edition of Leaves of Grass in 1855 and kept revising and expanding it for the rest of his life. It contains the long poem later called "Song of Myself." Whitman used free verse, long lines, catalogues of people and places, and a first-person voice that claims to speak for everyone. During the Civil War he worked in army hospitals, and he wrote about Lincoln's death in poems such as "O Captain! My Captain!" His ambition was a democratic poetry open to all kinds of Americans.

Emily Dickinson (1830 to 1886) lived mostly in Amherst, Massachusetts, and wrote nearly 1,800 poems. Only a handful were published in her lifetime. After her death, her sister found the manuscripts and a first edition appeared in 1890. Her poems are short and use dashes, unusual capitalisation and slant rhyme, often within the pattern of church hymns. Later editors debated how far to regularise her punctuation, and scholarly editions from the twentieth century tried to restore it.

In "Because I could not stop for Death," Death is a courteous gentleman who stops his carriage for the speaker. They pass a school, fields of grain and the setting sun, and the ride ends at what seems to be a grave. The poem treats death calmly, but its details, such as the speaker's thin clothing, suggest the chill of the encounter.

Compare their approaches: Whitman expands to include a nation, while Dickinson condenses to a single sharp image.`,
          },
          {
            id: lid(13),
            title: 'Slave Narratives and Frederick Douglass',
            blurb: 'Enslaved and formerly enslaved writers used autobiography as testimony, argument and proof of their humanity.',
            minutes: 8,
            body: `A slave narrative is an autobiography by a person who escaped or was freed from slavery. These accounts were a major form of nineteenth-century American writing, and they served as testimony to cruelty, as arguments against slavery and as evidence that enslaved people were thinking, moral human beings. Earlier voices include Phillis Wheatley, who published a book of poems in 1773, and Olaudah Equiano, whose Interesting Narrative appeared in 1789; scholars still debate details of Equiano's early life.

Frederick Douglass (born in Maryland around 1818, died 1895) published the Narrative of the Life of Frederick Douglass, an American Slave in 1845. He had escaped in 1838. The book carried prefaces and letters from white abolitionists vouching for its authenticity, which shows the doubt that Black authors faced. Douglass later wrote more autobiographies and became a leading orator, editor and reformer.

One of the Narrative's central moments concerns learning to read. His mistress, Sophia Auld, begins teaching him the alphabet, but her husband Hugh Auld forbids it, saying that a slave who learns to read becomes discontented and unmanageable. Douglass hears this and understands that literacy is the path to freedom. He draws a bold conclusion from the master's own words. The scene turns the enslaver's argument against slavery.

Harriet Jacobs wrote Incidents in the Life of a Slave Girl in 1861 under the name Linda Brent, describing the particular dangers faced by enslaved women. When you read these texts, notice the rhetoric: balanced sentences, moral appeals, and the careful building of credibility for a sceptical audience.`,
          },
          {
            id: lid(14),
            title: 'W. E. B. Du Bois and the Harlem Renaissance',
            blurb: 'Early twentieth-century Black writers described double consciousness and created a flowering of poetry, fiction and ideas.',
            minutes: 8,
            body: `W. E. B. Du Bois (1868 to 1963) was a sociologist, historian and writer. In The Souls of Black Folk (1903) he combined essays, memoir and music to describe Black life in America. He wrote that the problem of the twentieth century was the problem of the color line. The book also introduced the idea of double consciousness, the sense of seeing yourself both through your own eyes and through the eyes of a society that looks on with contempt.

The Harlem Renaissance was a flowering of Black art, music and literature centred in Harlem, New York, in the 1920s and into the 1930s. Alain Locke's anthology The New Negro (1925) became a statement of the era's spirit. Claude McKay, Countee Cullen, Jean Toomer (Cane, 1923), Langston Hughes and Zora Neale Hurston were prominent writers. Hughes's first collection, The Weary Blues (1926), borrowed rhythms from blues and jazz. His early poem "The Negro Speaks of Rivers" (1921) traces a speaker through ancient rivers such as the Nile and the Mississippi, claiming a deep, continuous heritage.

Hurston, trained as an anthropologist, published Their Eyes Were Watching God in 1937, using the voices and speech of Black Southern communities. Some contemporaries criticised her use of dialect, which shows that writers of the era debated how Black life should be portrayed. Richard Wright's Native Son (1940) took a harder, protest-oriented approach.

The movement was not one style but a conversation among many. Ask of each work: whom is it speaking to, and what picture of Black life does it want to create or correct?`,
          },
        ],
      },
      {
        id: 'lit-studies-modern.t4',
        title: 'Modernism and Its Neighbours',
        blurb: 'Writers who broke old forms after the shock of the early twentieth century, and the American traditions that ran alongside.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(15),
            title: 'What Was Modernism?',
            blurb: 'Modernist writers broke with older forms to capture fragmented experience in a rapidly changing world.',
            minutes: 7,
            body: `Modernism is the label for experimental literature and art that flourished in the early twentieth century, roughly from the 1900s through the 1940s. It arose in a world of cities, machines, mass communication and, from 1914, the First World War, which shook confidence in the old order. Many writers felt that the traditional novel, with its confident narrator and tidy plot, no longer matched how experience felt.

Common modernist techniques include stream of consciousness, which tries to render the flow of a mind's thoughts; fragmentation, in which a text breaks into pieces; allusion, which packs in references to earlier works; shifting or unreliable viewpoints; and in poetry, free verse and compressed images. The poet Ezra Pound urged writers to "make it new," a phrase that became a slogan.

Compare two ways of describing a morning. A Victorian narrator might state, from above, that a woman rose early, was cheerful and had a busy day ahead. A modernist writer might drop us inside her head: a half-formed memory, a sound from the street, a sudden worry, then a thought about something years ago, all without explanation. The second approach claims that reality is felt moment by moment and that the inner life is the true subject.

Virginia Woolf joked in an essay of 1924 that on or about December 1910 human character changed. She meant that no single date marks a shift, but that people were beginning to see the world differently.

Keep in mind that modernism was not one unified movement. It included rival groups and some deliberately difficult works, which is why close reading matters so much here.`,
          },
          {
            id: lid(16),
            title: 'Virginia Woolf and the Inner Life',
            blurb: 'Woolf traced consciousness through time, memory and shifting viewpoints, and argued for women writers.',
            minutes: 8,
            body: `Virginia Woolf (1882 to 1941) was a central figure in the Bloomsbury group of writers and artists in London. With her husband Leonard Woolf she founded the Hogarth Press in 1917, which published her own work and that of other modern writers. Her major novels include Mrs Dalloway (1925), To the Lighthouse (1927) and Orlando (1928).

Mrs Dalloway takes place over a single day in London in June 1923. Clarissa Dalloway prepares for a party, and the narration moves fluidly among her thoughts and those of other characters, including Septimus Smith, a war veteran suffering from what was then called shell shock. The two never meet, yet their stories echo. Woolf uses the chimes of Big Ben as a recurring sound that marks clock time while the characters' memories stretch across decades. The book contrasts public, measurable time with private, elastic time.

Woolf's technique is often called stream of consciousness, but a better description may be free indirect style at large scale: the narrator drifts from one mind to another without strict boundaries, so a minor character's glance can become the new centre of the scene.

Her essay A Room of One's Own (1929) argues that a woman needs money and a room of her own in order to write fiction. It surveys why women had written less in earlier centuries and invents an imagined sister of Shakespeare to dramatise the obstacles. The essay joins literary criticism to social history, and it shows how a modernist writer could bring formal experiment and political argument together.`,
          },
          {
            id: lid(17),
            title: 'Joyce and Eliot: Allusion and Fragmentation',
            blurb: 'James Joyce and T. S. Eliot built dense works that echo earlier literature while showing a broken modern world.',
            minutes: 8,
            body: `James Joyce (1882 to 1941) was an Irish writer who spent much of his adult life abroad. Dubliners (1914) is a collection of short stories about ordinary city life, and A Portrait of the Artist as a Young Man (1916) follows a young writer's development. His novel Ulysses was published in Paris in 1922 by Sylvia Beach's Shakespeare and Company. It follows Leopold Bloom, Stephen Dedalus and Molly Bloom over a single day, 16 June 1904, in Dublin, and its structure parallels Homer's Odyssey. Each chapter uses its own style, from straightforward narration to long interior monologue. Ulysses was banned in the United States until a federal court ruled in 1933 that it was not obscene.

T. S. Eliot (1888 to 1965) was born in St. Louis and settled in England. "The Love Song of J. Alfred Prufrock" appeared in 1915 and portrays a hesitant, self-doubting man. The Waste Land (1922) is a long poem made of fragments in different voices, with quotations and references from many languages and traditions. It opens with the line "April is the cruellest month," reversing the traditional picture of spring as a time of joy. Eliot added notes to the poem to help readers trace its allusions, and Ezra Pound heavily edited an earlier draft.

Both works demand active readers. The best approach is not to decode every reference at once but to notice the pattern: ordinary lives set against myth, and the sense of a culture in pieces. Consider whether the difficulty serves the meaning or merely excludes readers.`,
          },
          {
            id: lid(18),
            title: 'Franz Kafka and the Nightmare of Systems',
            blurb: 'Kafka wrote calm prose about absurd situations, portraying individuals trapped by incomprehensible power.',
            minutes: 7,
            body: `Franz Kafka (1883 to 1924) was a Jewish writer from Prague who wrote in German. He worked in an insurance office and wrote in his spare time. Little of his work was published during his life. Before his death from tuberculosis he asked his friend Max Brod to burn his unpublished papers, but Brod did not, and The Trial (published 1925) and The Castle (1926) appeared after his death.

The word Kafkaesque now describes situations that are absurd, oppressive and bureaucratic. In The Trial, Josef K. is arrested one morning by officials who never tell him what he is accused of. He tries to defend himself against a court system that remains unclear, and the novel ends without any explanation. The tone is flat and precise, which makes the strangeness more disturbing.

His novella The Metamorphosis (1915) opens with Gregor Samsa waking to find he has become a giant creature, often translated as insect or vermin. The German original uses a word suggesting unclean vermin, which is why translators have made different choices. Kafka asked that the cover illustration not show the creature itself, which suggests that the nature of the transformation was less important to him than the family's response. Gregor, who supported his family financially, is quickly treated as a burden, and the story gradually shifts attention to how his relatives adapt without him.

Interpretations vary widely: bureaucracy, family, guilt, illness, alienation at work. Rather than choosing one, ask what details support each reading, and notice how Kafka's calm style makes the absurd feel plausible.`,
          },
          {
            id: lid(19),
            title: 'The Lost Generation and the Southern Gothic',
            blurb: 'American writers after the First World War, and the Southern tradition of grotesque, haunted fiction.',
            minutes: 8,
            body: `The Lost Generation refers to American writers who came of age during the First World War and lived or worked abroad in the 1920s, especially in Paris. The phrase is attributed to Gertrude Stein, and Ernest Hemingway used it as an epigraph for The Sun Also Rises (1926), a novel about disillusioned expatriates in Europe. Hemingway's style is spare and built on short sentences. He later described an approach sometimes called the iceberg theory: the writer can leave out what he knows, and the omitted part still gives the story weight.

F. Scott Fitzgerald's The Great Gatsby (1925) is narrated by Nick Carraway, who watches the wealthy Jay Gatsby pursue Daisy Buchanan across Long Island. Because Nick tells the story, readers must consider how much of Gatsby's dream is real and how much Nick shapes. The green light at the end of Daisy's dock functions as a symbol of longing for a future that keeps receding.

Southern Gothic is a later tradition that uses grotesque characters, decaying settings and violence to examine the American South, including its history of slavery, race, religion and family pride. William Faulkner set many works in the invented Yoknapatawpha County, Mississippi, and wrote The Sound and the Fury (1929) and As I Lay Dying (1930), with shifting narrators. Flannery O'Connor (1925 to 1964) wrote darkly comic stories about faith and grace, including "A Good Man Is Hard to Find." Carson McCullers and Eudora Welty also belong to this wider Southern tradition.

Note the contrast: the Lost Generation writers often stress restraint and loss, while Southern Gothic writers explore place, memory and moral burden through exaggerated figures.`,
          },
        ],
      },
      {
        id: 'lit-studies-modern.t5',
        title: 'Global Voices and the Stage',
        blurb: 'Magical realism, postcolonial and Indigenous writing, and the modern theatre.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(20),
            title: 'Magical Realism: Garcia Marquez and Borges',
            blurb: 'Magical realism presents the extraordinary in a matter-of-fact tone, reshaping how fiction represents history.',
            minutes: 8,
            body: `Magical realism is a style in which fantastic events appear within an otherwise realistic setting and are treated by the narrator and characters as ordinary. It is associated especially with Latin American fiction of the mid-twentieth century. The Cuban writer Alejo Carpentier explored a related idea, which he called the marvellous real, in the 1940s.

Gabriel Garcia Marquez (1927 to 2014), a Colombian writer, published One Hundred Years of Solitude in 1967. It follows several generations of the Buendia family in the invented town of Macondo. The novel mixes the plausible with the impossible and with real history, including the arrival of a banana company and a massacre of workers. In one famous episode, Remedios the Beauty rises into the sky while folding sheets. The narrator reports it simply, and the family's concern is for the sheets, not the miracle. The effect is not to escape reality but to convey how history and legend feel in a region where events were often hard to believe. He received the Nobel Prize in Literature in 1982.

Jorge Luis Borges (1899 to 1986), an Argentine writer, is usually considered a related but distinct figure. His short stories, collected in Ficciones (1944), explore labyrinths, infinite libraries and mirrors in compact philosophical fictions, such as "The Library of Babel." They are less about social history than about ideas.

Other writers connected with the wider tradition include Isabel Allende and, in a different tradition, Toni Morrison, whose Beloved (1987) features a ghost. When reading, ask what the magical element does: does it express trauma, culture, politics, or a challenge to the idea that only rational explanations count?`,
          },
          {
            id: lid(21),
            title: 'Postcolonial Literature: An Overview',
            blurb: 'Writers from formerly colonised societies answer European accounts, debate language and reshape the English novel.',
            minutes: 8,
            body: `Postcolonial literature comes from societies shaped by colonial rule, especially the European empires, and from writers who examine its legacy. It includes work written during and after independence movements, and it often asks who tells a story, in what language, and for whom.

Chinua Achebe (1930 to 2013), a Nigerian novelist, published Things Fall Apart in 1958. Set among the Igbo people in the late nineteenth century, it follows the proud wrestler Okonkwo as missionaries and colonial administrators arrive. The title comes from a poem by W. B. Yeats. Achebe wrote in English but filled the book with Igbo proverbs and storytelling habits, showing that English could carry African ways of speaking. He has said he wanted to answer European novels that portrayed Africa only as a backdrop. In a 1975 lecture he criticised Joseph Conrad's Heart of Darkness (1899) for its portrayal of Africans, which sparked a lasting debate.

Other key texts and ideas include Edward Said's Orientalism (1978), a study of how Western writers represented the East; Jean Rhys's Wide Sargasso Sea (1966), which responds to Jane Eyre; and Salman Rushdie's Midnight's Children (1981), set around Indian independence. Ngugi wa Thiong'o argued in Decolonising the Mind (1986) that writers should use African languages, and he began writing fiction in Gikuyu.

Remember that postcolonial is not one place or one style. A useful approach is to ask what perspective a text recovers and what it leaves out.`,
          },
          {
            id: lid(22),
            title: 'Indigenous Literatures of North America',
            blurb: 'Native writers draw on oral traditions, land and community while telling contemporary stories in many forms.',
            minutes: 8,
            body: `Indigenous nations of North America have rich storytelling traditions that long predate European contact. Many stories were and are told orally, with protocols about who may tell them and when. These stories belong to particular nations and communities, so it is better to speak of many literatures rather than a single Native American mythology or style.

Written literature by Indigenous authors also has a long history. William Apess, of the Pequot nation, published A Son of the Forest in 1829. E. Pauline Johnson, of Mohawk and English heritage, was a popular poet and performer in Canada around the turn of the twentieth century. A major turning point in the United States came with N. Scott Momaday, a Kiowa writer, whose novel House Made of Dawn won the Pulitzer Prize for fiction in 1969. Its protagonist, Abel, returns from war and struggles to recover his place in his community.

Leslie Marmon Silko, from Laguna Pueblo, published Ceremony in 1977. Tayo, a veteran of the Second World War, is sick in body and spirit, and his healing comes through traditional ceremony and reconnecting with the land. The book mixes prose and poem-like passages in a way that treats story itself as healing. Louise Erdrich, of Ojibwe heritage, wrote Love Medicine (1984), made of interlinked stories. Joy Harjo, a member of the Muscogee Creek Nation, served as United States Poet Laureate from 2019 to 2022. Tommy Orange's There There (2018) portrays urban Native lives.

When studying these works, read with attention to the community and place they come from, and be careful not to treat any one writer as the voice of all Native peoples.`,
          },
          {
            id: lid(23),
            title: 'Modern Drama: Ibsen, Chekhov, Williams and Hansberry',
            blurb: 'Playwrights moved the stage toward everyday speech, psychology and social questions.',
            minutes: 8,
            body: `Modern drama began to treat ordinary middle-class life as a serious subject. Henrik Ibsen (1828 to 1906), a Norwegian playwright, is often called the father of modern realist drama. In A Doll's House (1879), Nora Helmer has lived as her husband's pet and discovers that he values his reputation above her. At the end she leaves him and the household, and the sound of the door closing became famous. The play was controversial because it questioned the roles expected of wives. Hedda Gabler (1890) and Ghosts (1881) also challenged conventions.

Anton Chekhov (1860 to 1904), a Russian doctor and writer, wrote plays including The Seagull, The Cherry Orchard (1904) and Three Sisters (1901). They have little dramatic plot in the usual sense. Instead people talk past one another and long for something they cannot reach. Meaning lies in subtext, what is not said. Chekhov called some of his plays comedies, which shows how rich the tone is.

Tennessee Williams wrote The Glass Menagerie (1944), a memory play narrated by Tom, and A Streetcar Named Desire (1947), in which the fragile Blanche DuBois clashes with her brother-in-law Stanley Kowalski.

Lorraine Hansberry's A Raisin in the Sun (1959) was the first play by a Black woman produced on Broadway. It follows the Younger family in Chicago after the death of the father, as they decide how to spend an insurance payment. Its title comes from a poem by Langston Hughes that asks what happens to a deferred dream.

When reading plays, remember they are written to be performed: ask what the stage directions, silences and entrances reveal.`,
          },
        ],
      },
      {
        id: 'lit-studies-modern.t6',
        title: 'Genres, Movements and Critical Lenses',
        blurb: 'Poetry movements, science fiction and fantasy, graphic narrative, global contemporary fiction, and the critical theories used to read them all.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(24),
            title: 'Poetry Movements from Imagism to Confessional Verse',
            blurb: 'Twentieth-century poetry shifted from compressed images to war testimony, public performance and personal confession.',
            minutes: 8,
            body: `Twentieth-century poetry moved through several overlapping movements. Imagism, led around 1912 to 1914 by Ezra Pound with poets such as H.D., called for direct treatment of the thing, no unnecessary words, and rhythm following natural speech. Pound's two-line poem "In a Station of the Metro" (1913) compares faces in a crowd to "petals on a wet, black bough." The whole point is the image, with no explanation.

The First World War produced poets who wrote from the front. Wilfred Owen, killed in November 1918, one week before the Armistice, wrote about gas attacks and the suffering of soldiers, and his poems appeared after his death. He challenged the idea that dying for one's country is glorious. Siegfried Sassoon also wrote bitterly about the war.

In the 1920s, Harlem Renaissance poets brought blues and jazz rhythms into verse. Later in the century, the Beat poets, including Allen Ginsberg, whose Howl was published in 1956 by City Lights in San Francisco, wrote long, rushing lines in open protest against conformity. Confessional poets such as Robert Lowell, whose Life Studies appeared in 1959, along with Sylvia Plath and Anne Sexton, treated private pain, family and mental illness as subjects. Gwendolyn Brooks won the Pulitzer Prize for poetry in 1950, the first African American to do so.

When you read a poem, ask which tradition it speaks from: does it pursue the single image, bear witness, perform, or confess? Movement names help, but good poets often cross the lines between them.`,
          },
          {
            id: lid(25),
            title: 'Science Fiction and Fantasy',
            blurb: 'Speculative fiction uses invented worlds and what-if premises to examine our own.',
            minutes: 8,
            body: `Science fiction and fantasy are forms of speculative fiction, which imagines worlds different from ours. Science fiction usually builds its change on a possible technology, science or social change. Fantasy uses magic or other impossible elements. Many writers move between them, and the boundary is debated.

Mary Shelley's Frankenstein (1818) is often named as an early ancestor of science fiction. Jules Verne wrote adventures such as Twenty Thousand Leagues Under the Seas (1870), and H. G. Wells wrote The Time Machine (1895) and The War of the Worlds (1898). The Czech writer Karel Capek brought the word robot to the public in his play R.U.R. in 1920, and credited his brother Josef with coining it. George Orwell's Nineteen Eighty-Four (1949) and Aldous Huxley's Brave New World (1932) are dystopias, imagining societies shaped by control. J. R. R. Tolkien published The Hobbit in 1937 and The Lord of the Rings in 1954 and 1955, helping establish modern epic fantasy.

A strong example of science fiction as a thought experiment is Ursula K. Le Guin's The Left Hand of Darkness (1969). An envoy named Genly Ai visits a planet whose people have no fixed sex, and his assumptions about gender are tested through the story. The novel uses an invented world to question ours rather than to predict the future.

Octavia Butler's Kindred (1979) sends a modern Black woman back in time to a Maryland plantation, linking the genre to the history of slavery. Notice what each work changes in its world and what question that change lets the author ask.`,
          },
          {
            id: lid(26),
            title: 'Graphic Narrative: An Overview',
            blurb: 'Comics combine words and images in sequence, and long-form graphic works have become a serious literary form.',
            minutes: 7,
            body: `Graphic narrative means storytelling through sequences of images, usually combined with words. The Swiss artist Rodolphe Topffer made illustrated picture-stories in the 1830s that are often cited as early ancestors of comics. Newspaper comic strips and comic books developed in the late nineteenth and twentieth centuries. The term graphic novel became widely known after Will Eisner's A Contract with God in 1978, though the idea of book-length comics is older. A separate course covers comic history in detail, so here we focus on reading.

Scott McCloud's Understanding Comics (1993) explains how comics work. The panels are separated by gaps called gutters, and readers connect what happens between them, a process McCloud calls closure. Each panel also shows words and images that can agree, contradict or add to one another.

Art Spiegelman's Maus, published in two volumes in 1986 and 1991, tells the story of his father, Vladek, a Polish Jewish survivor of the Holocaust. Spiegelman draws Jews as mice and Germans as cats, and also depicts Poles as pigs. The animal figures make the book's design plain, and they raise the question of how groups are turned into categories. The story also shows the tense relationship between father and son in the present. Maus received a special Pulitzer Prize in 1992.

Other major works include Alison Bechdel's Fun Home (2006), Marjane Satrapi's Persepolis, which appeared in French in the early 2000s, and Gene Luen Yang's American Born Chinese (2006). To read graphic narrative well, look at layout, line, colour and the relationship between image and caption as carefully as at plot.`,
          },
          {
            id: lid(27),
            title: 'Contemporary Global Fiction and Translation',
            blurb: 'Today fiction crosses borders through translation, prizes and migration, raising questions about language and who gets read.',
            minutes: 8,
            body: `Contemporary literature is increasingly global. Writers publish in many languages, travel or live between countries, and reach readers through translation and international prizes. The Nobel Prize in Literature, first given in 1901, has recognised writers from many places, such as Toni Morrison (1993), Kazuo Ishiguro (2017), Abdulrazak Gurnah (2021), Annie Ernaux (2022) and Han Kang (2024). Prizes shape which books are noticed, so it is worth asking what they reward and what they overlook.

Kazuo Ishiguro's The Remains of the Day (1989) is narrated by an English butler, Stevens, who describes his life of service. Because he is a restrained and self-deceiving narrator, the reader can see regrets that he cannot admit. Chimamanda Ngozi Adichie's Half of a Yellow Sun (2006) is set during the Nigerian civil war. Elena Ferrante's Neapolitan novels, published in Italian from 2011 to 2014, follow a lifelong female friendship, and the author writes under a pseudonym. Roberto Bolano's 2666 was published after his death in 2003.

Translation is an act of interpretation. Han Kang's The Vegetarian was published in Korean in 2007 and appeared in English in 2015, in a translation by Deborah Smith that won the 2016 International Booker Prize. Readers and critics have debated how closely the English version follows the Korean, which shows that choices about tone and wording change the book.

When reading translated work, remember you are reading an author and a translator. Ask what may be lost or added, and what perspectives enter English only because someone chose to translate.`,
          },
          {
            id: lid(28),
            title: 'Critical Lenses: Ways of Reading',
            blurb: 'Formalist, reader-response, feminist, Marxist, psychoanalytic and postcolonial approaches ask different questions of the same text.',
            minutes: 8,
            body: `A critical lens is a set of questions a reader brings to a text. Using several lenses shows that a work can support more than one rich reading. Here are some major approaches.

Formalism and New Criticism, influential in the 1930s to the 1950s, treat the text as a self-contained object and focus on structure, imagery and language. Wimsatt and Beardsley argued in 1946 that the author's intention is not a reliable standard for judging a poem. Reader-response criticism, associated with thinkers such as Louise Rosenblatt and Wolfgang Iser, asks how meaning arises in the act of reading. Marxist criticism looks at class, labour and economic power. Feminist criticism examines gender and the position of women as characters and writers; Sandra Gilbert and Susan Gubar's The Madwoman in the Attic (1979) discusses figures like Bertha Mason in Jane Eyre. Psychoanalytic criticism draws on Freud to study desire, conflict and the unconscious. Postcolonial criticism, such as Edward Said's, studies empire and representation. Roland Barthes argued in 1967 that the reader, not the author, completes a text's meaning.

Apply them to Frankenstein. A formalist studies the nested narration. A feminist might note the absence of mothers and Mary Shelley's own place as a woman author. A Marxist might ask about labour and creation. A psychoanalytic critic might read Victor and the creature as divided parts of one mind. A reader-response critic would ask how our own era's fears of technology shape our reading.

No lens is final. The skill is to state a claim, support it with specific words from the text, and notice what that lens leaves out.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lit-studies-modern',
    questions: [
      // L01
      tf(1, 1, 1, 'Wordsworth argued that poetry should use the language of ordinary people.', 0, 'Think about the 1800 preface.', 'The preface to Lyrical Ballads argued for everyday language.'),
      mc(1, 2, 1, 'Which pair of poets published Lyrical Ballads in 1798?', ['Wordsworth and Coleridge', 'Percy Shelley and John Keats', 'Lord Byron and Jane Austen', 'Emily Dickinson and Walt Whitman'], 'Both were early English Romantics.', 'Lyrical Ballads was a joint work by William Wordsworth and Samuel Taylor Coleridge.'),
      mc(1, 3, 2, 'Which event in 1789 formed part of the background to Romanticism?', ['The beginning of the French Revolution', 'The Russian emancipation of the serfs', 'The start of the First World War', 'The founding of the Harlem Renaissance'], 'It was a political upheaval in Europe.', 'The French Revolution began in 1789 and shaped Romantic hopes and fears.'),
      mc(1, 4, 2, 'In the daffodils poem, what happens at the end when the speaker lies on his couch?', ['Memory of the flowers brings him pleasure again', 'He decides to leave the countryside forever', 'He forgets the flowers entirely', 'He argues with the flowers about politics'], 'The final turn moves from outer scene to inner life.', 'The "inward eye" lets the speaker enjoy the experience again through memory.'),
      mc(1, 5, 3, 'Which claim about Wordsworth\'s view of poetry is most accurate?', ['Good poems begin in strong feeling but are shaped by later reflection', 'Poems should avoid emotion completely', 'Poems should be written only in formal courtly language', 'Poems should describe only cities and machines'], 'Recall that he spoke of both overflow and recollection.', 'He paired spontaneous feeling with emotion recollected in tranquillity.'),
      // L02
      tf(2, 1, 1, 'Percy Bysshe Shelley wrote the sonnet "Ozymandias."', 0, 'It is about a ruined statue in the desert.', 'Shelley published "Ozymandias" in 1818.'),
      mc(2, 2, 1, 'What does negative capability mean in Keats\'s letter of 1817?', ['Being able to stay in uncertainty without forcing an answer', 'Refusing to read any critics', 'Writing only in negative or pessimistic moods', 'Insisting on firm facts and settled reasons before accepting any uncertain idea'], 'It is about doubt and mystery.', 'Keats described the capacity to dwell in uncertainties without reaching irritably after fact and reason.'),
      mc(2, 3, 2, 'In "Ode on a Grecian Urn," what is true of the lovers painted on the vase?', ['They will never kiss, but will never grow old', 'They are about to be married in a church', 'They are fighting a war', 'They are traders in a market'], 'Consider what is gained and lost by being frozen in art.', 'The poem weighs the permanence of art against the loss of living fulfilment.'),
      mc(2, 4, 2, 'In "Ozymandias," what remains of the ruler\'s works?', ['Broken statue parts and empty desert', 'A flourishing city', 'A palace with many guests', 'A great library preserving the rulers wisdom'], 'Look at the contrast with the inscription.', 'The inscription boasts of great works, but only a ruined statue stands in the sand.'),
      mc(2, 5, 3, 'Why is "Ozymandias" a good example of layered narration?', ['The speaker repeats a story told by a traveller about a sculpture', 'It is told entirely by the king', 'It is a dialogue between two poets', 'It has no speaker'], 'Count how many voices stand between you and the statue.', 'The poem reports what a traveller said about the statue, adding layers of telling.'),
      // L03
      tf(3, 1, 1, 'In the novel, the creature is called Frankenstein.', 1, 'Who is Victor?', 'Frankenstein is the scientist\'s surname; the creature has no name.'),
      mc(3, 2, 1, 'Where did Mary Shelley begin Frankenstein in 1816?', ['Near Lake Geneva', 'In a Yorkshire parsonage', 'In a Moscow theatre', 'In a New York newspaper office'], 'The ghost-story challenge took place in Switzerland.', 'She began it during a summer stay near Lake Geneva.'),
      mc(3, 3, 2, 'How is Frankenstein structured?', ['As nested narratives: Walton, Victor and the creature', 'As a single narrator throughout', 'As a series of diary entries by the creature only', 'As a play in five acts'], 'Think of Russian dolls.', 'Walton\'s letters frame Victor\'s tale, which in turn contains the creature\'s account.'),
      mc(3, 4, 2, 'What does the subtitle "The Modern Prometheus" suggest?', ['The scientist resembles the Greek figure who defied the gods to give humans fire', 'The creature is a Greek god', 'The novel is a retelling of the Odyssey', 'The author is a Greek translator'], 'Prometheus is a figure from Greek myth.', 'The subtitle links Victor\'s ambition to the myth of Prometheus.'),
      tf(3, 5, 3, 'Readers have debated whether the main fault in the novel is creating the creature or abandoning him.', 0, 'The text supports more than one reading.', 'Critics commonly discuss both the act of creation and Victor\'s failure of responsibility.'),
      // L04
      tf(4, 1, 1, 'Jane Austen\'s early novels were published anonymously.', 0, 'Think of how women authors often published then.', 'Her early novels appeared without her name.'),
      mc(4, 2, 1, 'Which of these novels was published in 1813?', ['Pride and Prejudice', 'Sense and Sensibility', 'The Mill on the Floss', 'Crime and Punishment'], 'It begins with a famous remark about a single man.', 'Pride and Prejudice appeared in 1813.'),
      mc(4, 3, 2, 'What is irony in Austen\'s opening of Pride and Prejudice?', ['A grand statement that the story quickly undercuts', 'A literal rule of English law', 'A direct quotation from a famous sermon on marriage and money', 'A list of characters'], 'The tone is not what it seems.', 'The solemn "truth" turns out to describe the families\' wishes more than the man\'s.'),
      mc(4, 4, 3, 'What is free indirect discourse?', ['Narration that slides into a character\'s viewpoint without quotation marks', 'A list of laws read aloud', 'A poem in free verse', 'Dialogue between two narrators'], 'It blends the narrator\'s voice and a character\'s thoughts.', 'The narrator voices a character\'s thoughts and judgments in the character\'s own manner without tagging them.'),
      mc(4, 5, 3, 'Why can free indirect style be useful in Emma?', ['It lets readers share Emma\'s confidence and then see its errors', 'It removes all emotion from the book', 'It proves the narrator agrees with every character', 'It makes the story a legal document'], 'Think about how we perceive her mistakes.', 'We hear Emma\'s certainty from inside, which sets up the irony when she is wrong.'),
      // L05
      tf(5, 1, 1, 'The Bronte sisters first published under the names Currer, Ellis and Acton Bell.', 0, 'Their real names were Charlotte, Emily and Anne.', 'They used pseudonyms that hid their sex but kept their initials.'),
      mc(5, 2, 1, 'Who wrote Wuthering Heights?', ['Emily Bronte', 'Charlotte Bronte', 'Branwell Bronte', 'Elizabeth Gaskell'], 'It was published in 1847.', 'Emily Bronte published Wuthering Heights in 1847 as Ellis Bell.'),
      mc(5, 3, 2, 'How is Jane Eyre narrated?', ['In the first person by Jane herself', 'By an Arctic captain in letters', 'By a butler', 'In the third person by an all-knowing outside narrator'], 'Jane tells her own story.', 'Jane narrates, which lets readers follow her moral reasoning.'),
      mc(5, 4, 2, 'Which narrators chiefly tell Wuthering Heights?', ['Lockwood and Nelly Dean', 'Jane and Rochester', 'Pip and Estella', 'Captain Walton and Victor Frankenstein'], 'One is a visitor and one a housekeeper.', 'The story is nested through Lockwood and the housekeeper Nelly Dean.'),
      mc(5, 5, 3, 'What does Jean Rhys\'s Wide Sargasso Sea (1966) do?', ['Imagines the earlier life of Bertha from Jane Eyre', 'Retells Wuthering Heights in Yorkshire', 'Adapts Pride and Prejudice for the stage', 'Continues Great Expectations by following Pip to the Caribbean'], 'It is a response to a Bronte novel.', 'Rhys\'s novel gives a Caribbean background to the character Bertha.'),
      // L06
      tf(6, 1, 1, 'Many of Dickens\'s novels first appeared in instalments.', 0, 'Think of magazines and monthly parts.', 'Serial publication was central to how his novels reached readers.'),
      mc(6, 2, 1, 'Which Dickens novel features a boy who asks for more food in a workhouse?', ['Oliver Twist', 'Great Expectations', 'Wuthering Heights', 'Pride and Prejudice'], 'The boy is an orphan.', 'Oliver asks for more in Oliver Twist.'),
      mc(6, 3, 2, 'How can serial publication shape a novel\'s structure?', ['Chapters often end on hooks to bring readers back', 'It forces every plot to have only one character', 'It prevents any social criticism', 'It makes novels shorter than stories'], 'Readers had to wait for the next part.', 'Instalment form encourages cliffhangers and branching plots.'),
      mc(6, 4, 2, 'What target does Hard Times (1854) criticise?', ['An education and industry system that values only facts and figures', 'The Napoleonic Wars and the long struggle against French imperial power', 'The Salem witch trials', 'The Russian serf system'], 'Look at the novel\'s title and setting.', 'Dickens attacks a rigid utilitarian approach to schooling and industry.'),
      mc(6, 5, 3, 'Why does the "more" scene show how an institution works?', ['A tiny, polite request is met with horror, revealing the system\'s cruelty', 'Oliver demands a trial and wins', 'The workhouse is generous', 'The scene is a joke with no social point'], 'Compare the size of the request with the reaction.', 'The adults\' shock at a small plea exposes the institution\'s harshness.'),
      // L07
      tf(7, 1, 1, 'George Eliot was a pen name used by Mary Ann Evans.', 0, 'The author was a woman.', 'Mary Ann Evans wrote as George Eliot.'),
      mc(7, 2, 1, 'What is the subtitle of Middlemarch?', ['A Study of Provincial Life', 'A History of Manners in Industrial England', 'A Tale of Two Cities', 'A Novel Without a Hero'], 'It points to the novel\'s observational method.', 'Middlemarch carries the subtitle "A Study of Provincial Life."'),
      mc(7, 3, 2, 'What mistake does Dorothea make early in Middlemarch?', ['She marries Casaubon expecting to share a great intellectual project', 'She leaves England for Russia', 'She burns her own manuscripts', 'She sells her house to a stranger'], 'It concerns an older scholar.', 'Her idealism leads her to marry Casaubon, whose work proves stalled.'),
      mc(7, 4, 2, 'What is the role of Eliot\'s narrator?', ['To reflect on and analyse characters\' motives and their society', 'To stay silent and report only dialogue', 'To lie to the reader throughout and conceal every motive from them', 'To summarise the plot in a single line'], 'The voice is learned and comments.', 'Eliot\'s narrator steps back to analyse and extend sympathy.'),
      mc(7, 5, 3, 'What idea does Middlemarch\'s ending stress?', ['The world\'s good depends partly on ordinary, unrecorded lives', 'Only famous people shape history', 'Idealism is always foolish', 'Marriage is a legal contract and nothing else'], 'It honours those history does not record.', 'The ending suggests small, unremembered acts matter.'),
      // L08
      tf(8, 1, 1, 'Serfdom in Russia was abolished in 1861.', 0, 'It was a major mid-century reform.', 'Emancipation of the serfs took place in 1861.'),
      mc(8, 2, 1, 'Who wrote Crime and Punishment?', ['Fyodor Dostoevsky', 'Lev Nikolayevich Tolstoy', 'Ivan Sergeyevich Turgenev', 'Nikolai Vasilievich Gogol'], 'The novel appeared in 1866.', 'Dostoevsky published Crime and Punishment in 1866.'),
      mc(8, 3, 2, 'What is Raskolnikov\'s idea in Crime and Punishment?', ['That an extraordinary person might break the moral law for a greater purpose', 'That crime never happens', 'That poverty is a form of holiness', 'That the tsar should give up his throne'], 'It is a theory he tests with a murder.', 'He persuades himself that extraordinary people may transgress, and the novel tests that idea.'),
      mc(8, 4, 2, 'Which novel by Tolstoy is set around the Napoleonic invasion of Russia?', ['War and Peace', 'Crime and Punishment', 'Fathers and Sons', 'The Brothers Karamazov'], 'The title pairs two large themes.', 'Tolstoy\'s War and Peace is set during the Napoleonic era.'),
      mc(8, 5, 3, 'What did Bakhtin mean by calling Dostoevsky polyphonic?', ['Many independent voices argue without one being simply the author\'s mouthpiece', 'The novels were written in several languages', 'The novels contain many songs', 'The author always agreed with the narrator'], 'Think of a chorus of equal voices.', 'Bakhtin saw Dostoevsky\'s novels as dialogues among independent viewpoints.'),
      // L09
      tf(9, 1, 1, 'Flaubert\'s Madame Bovary was the subject of a trial in 1857, and he was acquitted.', 0, 'The charge was offending public morals.', 'Flaubert was tried and acquitted in 1857.'),
      mc(9, 2, 1, 'What does Emma Bovary expect from life?', ['That it will match the romantic novels she reads', 'That she will become a doctor', 'That she will lead a revolution', 'That she will inherit a great fortune from Balzac'], 'Her reading shapes her desires.', 'Emma\'s romantic reading leads to disappointment with provincial life.'),
      mc(9, 3, 2, 'What was Honore de Balzac\'s great project?', ['A vast series of connected novels called La Comedie humaine', 'A single epic poem', 'A cycle of plays set in Athens', 'A dictionary of French'], 'The characters recur across novels.', 'Balzac planned a large interconnected series called La Comedie humaine.'),
      mc(9, 4, 2, 'What happened to Baudelaire\'s Les Fleurs du mal in 1857?', ['The author and publisher were fined and six poems were suppressed', 'It was awarded the Nobel Prize', 'It was banned for being too short', 'It was awarded a state prize and the poet was made a member of the Academy'], 'Like Flaubert, he faced a court.', 'A court fined them and ordered six poems removed.'),
      mc(9, 5, 3, 'How does Symbolism differ from realism?', ['It prizes suggestion and mood over detailed description', 'It describes everyday life in plain detail', 'It avoids all imagery', 'It must be written in plain prose with every scene described in detail'], 'Think about evoking rather than explaining.', 'Symbolists used suggestion and musicality to point beyond the visible.'),
      // L10
      tf(10, 1, 1, 'Nathaniel Hawthorne wrote The Scarlet Letter.', 0, 'Hester Prynne is its heroine.', 'Hawthorne published The Scarlet Letter in 1850.'),
      mc(10, 2, 1, 'Which story is narrated by a man who insists he is sane while describing a murder?', ['"The Tell-Tale Heart"', '"Bartleby, the Scrivener"', '"I Wandered Lonely as a Cloud"', '"The Legend of Sleepy Hollow"'], 'The narration itself raises doubts.', 'Poe\'s "The Tell-Tale Heart" is narrated by a murderer who claims sanity.'),
      mc(10, 3, 2, 'What did Poe argue a short story should aim for?', ['A single effect, with every detail serving it', 'As many plots as possible', 'A happy ending', 'As many characters and subplots as the reader can follow'], 'Think of unity.', 'Poe argued for unity of effect in short fiction.'),
      mc(10, 4, 2, 'Which historical event is linked to Hawthorne\'s ancestor John Hathorne?', ['The Salem witch trials of 1692', 'The American Revolution', 'The Peterloo Massacre in Manchester', 'The Paris Commune'], 'He was a judge.', 'John Hathorne was a judge at the Salem witch trials.'),
      mc(10, 5, 3, 'What happens to the meaning of the scarlet letter over the course of the novel?', ['It shifts and is left open rather than fixed', 'It stays a single fixed meaning', 'It is removed from the story', 'It becomes the title of a play'], 'Different people read it differently.', 'Hawthorne leaves the symbol ambiguous as Hester\'s actions change how it is seen.'),
      // L11
      tf(11, 1, 1, 'Moby-Dick begins with the sentence "Call me Ishmael."', 0, 'Ishmael is the narrator.', 'That is the novel\'s famous opening line.'),
      mc(11, 2, 1, 'What is the name of Captain Ahab\'s ship?', ['The Pequod', 'The Acushnet', 'The Hispaniola', 'The Nautilus'], 'Melville\'s own ship had a different name.', 'Ahab commands the Pequod; Melville himself sailed on the Acushnet.'),
      mc(11, 3, 2, 'What does Bartleby say in response to requests?', ['"I would prefer not to"', '"I will do it at once"', '"I shall never stop writing"', '"Call me Ishmael"'], 'He politely refuses.', 'Bartleby\'s refrain is "I would prefer not to."'),
      mc(11, 4, 2, 'How was Moby-Dick received when first published in 1851?', ['It sold poorly and was largely neglected until the 1920s', 'It was an instant bestseller', 'It won a major prize and was praised by almost every critic of the day', 'It was banned at once'], 'Its reputation grew much later.', 'The book was a commercial disappointment and was revived in the twentieth century.'),
      mc(11, 5, 3, 'What are the two poles of Moby-Dick described in the lesson?', ['Ahab\'s obsession and the diverse working crew', 'A king and a queen', 'A farm and a city', 'A court and a church'], 'One is a single will and the other a community.', 'The book sets Ahab\'s monomania against the varied crew of the Pequod.'),
      // L12
      tf(12, 1, 1, 'Emily Dickinson published nearly all of her poems during her lifetime.', 1, 'Her sister found the manuscripts after her death.', 'Only a handful were published before she died; most appeared after 1890.'),
      mc(12, 2, 1, 'What was the title of Whitman\'s main collection, first published in 1855?', ['Leaves of Grass', 'Songs of Innocence', 'Songs of Experience', 'Les Fleurs du mal'], 'Think of a plant.', 'Whitman published Leaves of Grass in 1855 and revised it for decades.'),
      mc(12, 3, 2, 'Which feature is typical of Dickinson\'s style?', ['Short poems with dashes and slant rhyme', 'Very long lines in free verse', 'Rhymed couplets only', 'Prose paragraphs'], 'Her poems are compressed.', 'Dickinson used dashes, slant rhyme and hymn-like meter.'),
      mc(12, 4, 2, 'How is Death presented in "Because I could not stop for Death"?', ['As a courteous driver who stops a carriage for the speaker', 'As a monster who bursts through the door to seize the speaker', 'As a judge in a court', 'As a sailor'], 'Picture a carriage ride.', 'Death is personified as a polite gentleman calling for her.'),
      mc(12, 5, 3, 'Which contrast between the two poets does the lesson draw?', ['Whitman expands to include a nation; Dickinson condenses to a sharp image', 'Whitman wrote tight rhymed sonnets for private use; Dickinson addressed vast crowds in epics', 'Dickinson was a public orator; Whitman was a recluse', 'Both wrote only prose'], 'One is expansive and the other compressed.', 'Whitman\'s catalogues and long lines contrast with Dickinson\'s brevity.'),
      // L13
      tf(13, 1, 1, 'Frederick Douglass published his Narrative in 1845.', 0, 'He had escaped slavery in 1838.', 'The Narrative of the Life of Frederick Douglass appeared in 1845.'),
      mc(13, 2, 1, 'What was a slave narrative?', ['An autobiography by a person who escaped or was freed from slavery', 'A legal contract for sale', 'A collection of folk songs', 'A newspaper advertisement'], 'It is a form of life writing.', 'Slave narratives are first-person accounts by formerly enslaved people.'),
      mc(13, 3, 2, 'Why did many narratives carry prefaces from white abolitionists?', ['To vouch for the author\'s authenticity for sceptical readers', 'Because the authors had never learned to read and needed others to write for them', 'Because the law required them', 'To make the books shorter'], 'Think about doubts the authors faced.', 'Such prefaces aimed to establish credibility with doubting audiences.'),
      mc(13, 4, 2, 'What does Douglass learn from Hugh Auld\'s objection to his lessons?', ['That literacy is the path to freedom', 'That reading is dangerous to health', 'That books are too expensive for most people to buy', 'That teachers are rare'], 'The master\'s fear reveals the value of reading.', 'Auld\'s warning shows Douglass that learning to read undermines slavery.'),
      mc(13, 5, 3, 'Who wrote Incidents in the Life of a Slave Girl (1861) under the name Linda Brent?', ['Harriet Jacobs', 'Phillis Wheatley', 'Zora Neale Hurston', 'Olaudah Equiano'], 'It describes dangers faced by enslaved women.', 'Harriet Jacobs wrote the book under a pseudonym.'),
      // L14
      tf(14, 1, 1, 'Du Bois wrote The Souls of Black Folk in 1903.', 0, 'It introduced double consciousness.', 'The book appeared in 1903.'),
      mc(14, 2, 1, 'What does double consciousness describe?', ['Seeing oneself through one\'s own eyes and through a contemptuous society\'s eyes', 'Knowing two languages', 'Ignoring all of society and judging yourself by your own eyes alone and never anyone else', 'Serving in two armies'], 'It is a state of divided self-perception.', 'Du Bois used it for the divided awareness created by racism.'),
      mc(14, 3, 2, 'Which writer published Their Eyes Were Watching God in 1937?', ['Zora Neale Hurston', 'Langston Hughes', 'Richard Wright', 'Paul Laurence Dunbar'], 'She was also an anthropologist.', 'Hurston published it in 1937.'),
      mc(14, 4, 2, 'Which book gave the Harlem Renaissance a statement of its spirit in 1925?', ['Alain Locke\'s The New Negro', 'Native Son by Richard Wright', 'Native Son', 'Cane'], 'It was an anthology edited by a philosopher.', 'Locke\'s anthology The New Negro appeared in 1925.'),
      mc(14, 5, 3, 'What does the debate over Hurston\'s use of dialect show?', ['Writers of the era disagreed about how to portray Black life', 'Everyone agreed on one style', 'Dialect was banned by law', 'Her work was never published'], 'Consider the era\'s conversation about representation.', 'Contemporaries differed over the portrayal of Black speech and life.'),
      // L15
      tf(15, 1, 1, 'Modernist writers often tried to show the flow of a mind\'s thoughts.', 0, 'Think of stream of consciousness.', 'Stream of consciousness is a common modernist technique.'),
      mc(15, 2, 1, 'Which event from 1914 helped shape modernist doubt about the old order?', ['The First World War', 'The Russian emancipation', 'The Salem witch trials', 'The invention of the novel'], 'It reshaped Europe.', 'The war shook confidence in earlier certainties.'),
      mc(15, 3, 2, 'What does Pound\'s slogan "make it new" encourage?', ['Breaking with old forms', 'Copying earlier writers exactly', 'Avoiding all poetry', 'Writing only about nature'], 'It is a call for innovation.', 'The phrase became a modernist rallying cry for innovation.'),
      mc(15, 4, 2, 'How might a modernist narrative differ from a Victorian one?', ['It may place us inside a character\'s shifting thoughts', 'It always has a confident narrator who explains everything', 'It never uses memory', 'It must be in verse'], 'Compare the two descriptions of a morning.', 'Modernists often rendered inner life moment by moment.'),
      mc(15, 5, 3, 'What did Woolf mean by her 1924 remark about December 1910?', ['No single date marks it, but people were beginning to see the world differently', 'A law was passed that year', 'A war began that month', 'She published a novel then'], 'It was partly a joke.', 'The remark pointed to a shift in perception rather than a literal date.'),
      // L16
      tf(16, 1, 1, 'Mrs Dalloway takes place over a single day in London.', 0, 'Clarissa prepares for a party.', 'The novel is set in one day in June 1923.'),
      mc(16, 2, 1, 'Which sound recurs in Mrs Dalloway to mark clock time?', ['Big Ben', 'A church organ', 'Cannon fire', 'A train whistle'], 'It is a London landmark.', 'Big Ben\'s chimes mark public time throughout the novel.'),
      mc(16, 3, 2, 'What did Woolf argue in A Room of One\'s Own (1929)?', ['That a woman needs money and a room of her own to write fiction', 'That novels should be shorter and printed in cheaper editions for readers', 'That poetry is dead', 'That men should not write'], 'Look at the title.', 'The essay ties women\'s writing to material independence.'),
      mc(16, 4, 2, 'Who is Septimus Smith?', ['A war veteran suffering from shell shock', 'A London publisher who prints the poets of the day', 'A diplomat', 'A schoolteacher'], 'He and Clarissa never meet.', 'Septimus is a veteran haunted by the war.'),
      mc(16, 5, 3, 'What press did Virginia and Leonard Woolf found in 1917?', ['The Hogarth Press', 'Shakespeare and Company', 'City Lights Booksellers', 'The Atlantic Press'], 'It printed her own works.', 'They founded the Hogarth Press in 1917.'),
      // L17
      tf(17, 1, 1, 'Joyce\'s Ulysses takes place over a single day in Dublin.', 0, 'It is remembered each June.', 'Ulysses follows 16 June 1904.'),
      mc(17, 2, 1, 'Which ancient epic does the structure of Ulysses parallel?', ['The Odyssey', 'The Divine Comedy', 'The Epic of Gilgamesh', 'The Aeneid of Virgil'], 'The title is the Latin name of a hero.', 'Joyce modelled his episodes on Homer\'s Odyssey.'),
      mc(17, 3, 2, 'What does the opening line of The Waste Land, "April is the cruellest month," do?', ['It reverses the usual picture of spring as joyful', 'It praises the beauty of April', 'It describes a famous battle fought in the month of April', 'It announces a tax deadline'], 'Spring is usually a hopeful season.', 'The line overturns the conventional image of spring.'),
      mc(17, 4, 2, 'Who heavily edited an early draft of The Waste Land?', ['Ezra Pound', 'James Joyce', 'Virginia Woolf', 'Samuel Beckett'], 'He was a fellow modernist poet.', 'Pound edited it closely before publication.'),
      mc(17, 5, 3, 'What happened to Ulysses in the United States in 1933?', ['A federal court ruled it was not obscene', 'It won a Pulitzer Prize and was widely adopted by schools', 'It was burned', 'It was made a school text'], 'It had been banned earlier.', 'A federal court allowed the book, ending the ban.'),
      // L18
      tf(18, 1, 1, 'Most of Kafka\'s major novels were published after his death.', 0, 'Max Brod did not burn the papers.', 'The Trial and The Castle appeared in 1925 and 1926.'),
      mc(18, 2, 1, 'What does the word Kafkaesque describe?', ['Absurd, oppressive and bureaucratic situations', 'Cheerful adventures', 'Detailed battle scenes from a long and heroic war', 'Courtly romance'], 'Think of Josef K.', 'The term refers to nightmarish bureaucratic absurdity.'),
      mc(18, 3, 2, 'What happens to Josef K. at the start of The Trial?', ['He is arrested without being told the charge', 'He wins a prize', 'He is crowned', 'He leaves for Paris'], 'It is the opening situation.', 'Officials arrest him but never explain the accusation.'),
      mc(18, 4, 2, 'Why do translators differ over the creature in The Metamorphosis?', ['The German word suggests unclean vermin, which has no exact English equivalent', 'The creature has a name in German', 'The surviving manuscript is incomplete, so translators must guess the missing words freely', 'The story is in Latin'], 'Word choice matters.', 'Translators have rendered the word as insect, bug or vermin.'),
      mc(18, 5, 3, 'What did Kafka\'s request about the cover illustration suggest?', ['The nature of the transformation was less important than the family\'s response', 'He wanted a detailed picture of the creature', 'He believed that the publisher should print the story only in a small private edition', 'He wanted no cover at all'], 'He asked the creature not to be shown.', 'Kafka asked that the creature not be depicted, which suggests the response mattered more.'),
      // L19
      tf(19, 1, 1, 'The Great Gatsby is narrated by Nick Carraway.', 0, 'He is a neighbour of Gatsby.', 'Nick tells the story of Gatsby and Daisy.'),
      mc(19, 2, 1, 'Which writer used the phrase "lost generation" as an epigraph in The Sun Also Rises?', ['Ernest Hemingway', 'F. Scott Fitzgerald', 'Zora Neale Hurston', 'Flannery O\'Connor'], 'He wrote in a spare style.', 'Hemingway used the phrase, attributed to Gertrude Stein.'),
      mc(19, 3, 2, 'What is the iceberg theory?', ['The writer may omit what he knows and the omitted part still gives the story weight', 'A story must be set in the Arctic', 'Every detail should be explained', 'Only short words may be used'], 'It concerns what is left unsaid.', 'Hemingway described leaving things out while keeping their force.'),
      mc(19, 4, 2, 'Which of these is a Southern Gothic writer from the lesson?', ['Flannery O\'Connor', 'Gertrude Stein', 'Ralph Waldo Emerson', 'T. S. Eliot'], 'She wrote darkly comic stories about faith and grace.', 'O\'Connor is a leading Southern Gothic writer.'),
      mc(19, 5, 3, 'What does Yoknapatawpha County refer to?', ['William Faulkner\'s invented Mississippi county', 'A region of Russia once ruled by the tsars in Siberia', 'A Paris district', 'Carson McCullers\'s school'], 'It is a fictional place.', 'Faulkner set many works in this invented county.'),
      // L20
      tf(20, 1, 1, 'In magical realism, extraordinary events are typically treated as ordinary by the narrator.', 0, 'Think of the matter-of-fact tone.', 'That calm treatment is a defining feature.'),
      mc(20, 2, 1, 'Who wrote One Hundred Years of Solitude?', ['Gabriel Garcia Marquez', 'Jorge Luis Borges', 'Chinua Achebe', 'Carlos Fuentes of Mexico'], 'It was published in 1967.', 'Garcia Marquez published it in 1967.'),
      mc(20, 3, 2, 'What is the invented town in that novel?', ['Macondo', 'Yoknapatawpha', 'Santa Teresa', 'Middlemarch'], 'It is home to the Buendia family.', 'The Buendias live in Macondo.'),
      mc(20, 4, 2, 'How is Borges usually distinguished from Garcia Marquez in the lesson?', ['His stories explore ideas such as labyrinths and infinite libraries', 'He wrote long family sagas set in Colombia', 'He wrote only screenplays', 'He lived in Russia'], 'Think of "The Library of Babel."', 'Borges\'s compact fictions are philosophical rather than social-historical.'),
      mc(20, 5, 3, 'What can the magical element in such fiction do?', ['Express trauma, culture or politics in unusual terms', 'Prove the story is merely a fairy tale written for young children', 'Replace all history', 'Make the narrator absent'], 'Ask what it does, not whether it is real.', 'The lesson suggests the magic can convey trauma, culture or politics.'),
      // L21
      tf(21, 1, 1, 'Chinua Achebe published Things Fall Apart in 1958.', 0, 'He was a Nigerian novelist.', 'The novel appeared in 1958.'),
      mc(21, 2, 1, 'Whose poem supplies the title Things Fall Apart?', ['W. B. Yeats', 'Percy Bysshe Shelley', 'Walt Whitman', 'Langston Hughes'], 'He was an Irish poet.', 'The title comes from a poem by Yeats.'),
      mc(21, 3, 2, 'What is Okonkwo\'s world in the novel?', ['Igbo society as missionaries and colonial officials arrive', 'A Russian estate', 'A London office', 'A Caribbean sugar plantation in the years after independence'], 'The setting is late nineteenth-century Nigeria.', 'The novel follows an Igbo wrestler amid colonial arrival.'),
      mc(21, 4, 2, 'What argument did Ngugi wa Thiong\'o make in Decolonising the Mind (1986)?', ['That writers should use African languages', 'That English should be abolished everywhere', 'That novels should be shorter', 'That poetry should be rhymed'], 'He began writing fiction in Gikuyu.', 'Ngugi urged African writers to use African languages.'),
      mc(21, 5, 3, 'What does Edward Said\'s Orientalism (1978) study?', ['How Western writers represented the East', 'The history of the realist novel across Russia and Europe', 'The rise of the graphic novel', 'The Harlem Renaissance'], 'It is a work of critical theory.', 'Said analysed Western depictions of the East.'),
      // L22
      tf(22, 1, 1, 'Indigenous stories belong to particular nations and communities.', 0, 'The lesson says not to treat them as one mythology.', 'Many stories have protocols and belong to specific nations.'),
      mc(22, 2, 1, 'Who won the 1969 Pulitzer Prize for fiction with House Made of Dawn?', ['N. Scott Momaday', 'Leslie Marmon Silko', 'Ralph Waldo Ellison', 'James Fenimore Cooper'], 'He is a Kiowa writer.', 'Momaday\'s novel won the Pulitzer in 1969.'),
      mc(22, 3, 2, 'In Ceremony (1977), how does Tayo begin to heal?', ['Through traditional ceremony and reconnecting with the land', 'Through winning a lawsuit', 'By moving to a big city', 'By forgetting his past entirely and leaving the reservation forever'], 'Healing is cultural and spiritual.', 'Silko ties his recovery to ceremony and land.'),
      mc(22, 4, 2, 'Who served as United States Poet Laureate from 2019 to 2022?', ['Joy Harjo', 'Louise Erdrich', 'Leslie Marmon Silko', 'William Apess'], 'She is a member of the Muscogee Creek Nation.', 'Harjo held the position in those years.'),
      mc(22, 5, 3, 'Which approach is recommended when reading Indigenous works?', ['Attend to the specific community and place, and do not treat one writer as the voice of all', 'Assume all Native stories are identical', 'Ignore the writers\' backgrounds', 'Read only translations from English and treat each text as a source of facts about all Native peoples'], 'The lesson warns against generalising.', 'The lesson stresses specificity of nation and place.'),
      // L23
      tf(23, 1, 1, 'In A Doll\'s House, Nora leaves her husband at the end.', 0, 'The sound of a door became famous.', 'Nora walks out, and the play was controversial for it.'),
      mc(23, 2, 1, 'Who wrote The Cherry Orchard?', ['Anton Chekhov', 'George Bernard Shaw', 'Tennessee Williams', 'Lorraine Hansberry'], 'He was also a doctor.', 'Chekhov\'s last play is The Cherry Orchard (1904).'),
      mc(23, 3, 2, 'What does subtext mean in Chekhov\'s plays?', ['What characters feel and mean but do not say', 'The stage directions printed beneath the title', 'A hidden second plot in another language', 'The footnotes of the play'], 'Meaning lies in what is unspoken.', 'Subtext is the unspoken meaning beneath dialogue.'),
      mc(23, 4, 2, 'What makes A Raisin in the Sun historically notable?', ['It was the first play by a Black woman produced on Broadway', 'It was the first play ever staged on a Broadway stage in the twentieth century', 'It was written in verse by Shakespeare', 'It was a musical about war'], 'Hansberry broke a barrier in 1959.', 'Hansberry\'s play was the first by a Black woman on Broadway.'),
      mc(23, 5, 3, 'What is a memory play, as in The Glass Menagerie?', ['A play narrated and shaped by a character\'s recollections', 'A play with no actors', 'A play that the whole audience must memorise before the curtain rises', 'A history lecture'], 'Tom narrates from memory.', 'The Glass Menagerie is filtered through Tom\'s memory.'),
      // L24
      tf(24, 1, 1, 'Imagism emphasised direct treatment of the thing and the removal of unnecessary words.', 0, 'Pound\'s 1913 two-line poem is an example.', 'Imagist principles favoured economy and the single image.'),
      mc(24, 2, 1, 'Which poet was killed in November 1918, a week before the Armistice?', ['Wilfred Owen', 'Siegfried Sassoon', 'Robert Lowell', 'Allen Ginsberg'], 'His poems appeared after his death.', 'Owen died in November 1918.'),
      mc(24, 3, 2, 'Which poem by Allen Ginsberg was published by City Lights in 1956?', ['Howl', 'The Waste Land', 'Leaves of Grass', 'Ozymandias'], 'It is a Beat classic.', 'Howl appeared in 1956.'),
      mc(24, 4, 2, 'What do confessional poets treat as subjects?', ['Private pain, family and mental illness', 'Only public ceremonies and official occasions of the state', 'Only nature scenes', 'Only historical battles'], 'Lowell, Plath and Sexton.', 'Confessional poetry makes the personal central.'),
      mc(24, 5, 3, 'What distinction did Gwendolyn Brooks earn in 1950?', ['First African American to win the Pulitzer Prize for poetry', 'First poet of any nation to win the Nobel Prize in literature', 'First U.S. Poet Laureate', 'First editor of Poetry magazine'], 'It was a Pulitzer.', 'Brooks was the first African American Pulitzer poet.'),
      // L25
      tf(25, 1, 1, 'Karel Capek brought the word robot to the public in his play R.U.R. (1920).', 0, 'The play appeared in 1920.', 'The play popularized the word, which Capek credited his brother Josef with coining.'),
      mc(25, 2, 1, 'Which novel by Ursula K. Le Guin uses a planet whose people have no fixed sex?', ['The Left Hand of Darkness', 'Kindred', 'Do Androids Dream of Electric Sheep', 'Brave New World'], 'It was published in 1969.', 'Le Guin used an invented world to question gender.'),
      mc(25, 3, 2, 'What is a dystopia?', ['An imagined society shaped by oppressive control', 'An ideal peaceful paradise', 'A story about the future of fashion', 'A poem about nature'], 'Think of Nineteen Eighty-Four.', 'Dystopias imagine societies marked by control and fear.'),
      mc(25, 4, 2, 'What does Octavia Butler\'s Kindred (1979) do?', ['Sends a modern Black woman to a Maryland plantation in the past', 'Takes a hobbit to a mountain', 'Follows a robot rebellion against its human makers in a far future', 'Describes a wizard school'], 'It links the genre to history.', 'The novel uses time travel to confront slavery.'),
      mc(25, 5, 3, 'Why is The Left Hand of Darkness called a thought experiment?', ['It changes one feature of society to question our assumptions', 'It predicts exact future technology', 'It is a mathematics textbook', 'It has no characters'], 'The invented world tests assumptions.', 'The story varies gender to question real assumptions.'),
      // L26
      tf(26, 1, 1, 'In Maus, Art Spiegelman depicts Jews as mice and Germans as cats.', 0, 'Animal figures carry the book\'s design.', 'Spiegelman uses animals to represent groups.'),
      mc(26, 2, 1, 'What does McCloud call the process of connecting panels in the reader\'s mind?', ['Closure', 'Typography', 'Allusion', 'Alliteration'], 'It happens in the gutter.', 'McCloud\'s term for connecting separate images is closure.'),
      mc(26, 3, 2, 'Whose 1978 book popularised the term graphic novel?', ['Will Eisner\'s A Contract with God', 'Alison Bechdel\'s Fun Home', 'Art Spiegelman\'s Maus', 'Scott McCloud\'s Understanding Comics'], 'He was a pioneering American cartoonist.', 'Eisner\'s book helped popularise the term.'),
      mc(26, 4, 2, 'What is the gutter in comics?', ['The gap between panels', 'The border of the page', 'The speech bubble', 'The caption'], 'Closure happens there.', 'The gutter is the space between panels.'),
      mc(26, 5, 3, 'Which is a good way to read graphic narrative?', ['Attend to layout, line, colour and how image relates to caption', 'Read only the words and treat every picture as mere decoration for the text', 'Skip the images', 'Judge only by length'], 'Both modes matter.', 'Images and words work together.'),
      // L27
      tf(27, 1, 1, 'Translation is a form of interpretation.', 0, 'Choices of wording change the book.', 'Translators make decisions that shape tone and meaning.'),
      mc(27, 2, 1, 'Which author wrote The Remains of the Day (1989)?', ['Kazuo Ishiguro', 'Chimamanda Adichie', 'Haruki Murakami', 'Margaret Atwood'], 'A butler narrates.', 'Ishiguro wrote it, and Stevens narrates.'),
      mc(27, 3, 2, 'What is notable about Elena Ferrante?', ['She publishes under a pseudonym', 'She writes only in English', 'She wrote 2666', 'She was a longtime judge of the Nobel Prize committee'], 'Her identity is withheld.', 'Ferrante is a pseudonym.'),
      mc(27, 4, 2, 'Which translated novel won the 2016 International Booker Prize?', ['The Vegetarian', 'The Remains of the Day', 'My Brilliant Friend', 'Half of a Yellow Sun'], 'It is Korean.', 'Han Kang\'s book in Deborah Smith\'s translation won.'),
      mc(27, 5, 3, 'Why should readers ask what a prize rewards and overlooks?', ['Prizes shape which books are noticed', 'Prizes have no influence', 'Prizes choose all books', 'Prizes ban all unknown writers from ever being published'], 'Think about visibility.', 'Prizes shape reading attention.'),
      // L28
      tf(28, 1, 1, 'Formalism treats the text as a self-contained object and focuses on structure and language.', 0, 'It is also called New Criticism.', 'That is the formalist approach.'),
      mc(28, 2, 1, 'Which lens asks how class and economic power shape a text?', ['Marxist criticism', 'Formalist close reading', 'Psychoanalytic criticism', 'Reader-response criticism'], 'Think labour and wealth.', 'Marxist criticism foregrounds class and economics.'),
      mc(28, 3, 2, 'What did Barthes argue in 1967?', ['That the reader, not the author, completes a text\'s meaning', 'That authors always control meaning', 'That novels should be shorter', 'That poetry is dead'], 'He questioned authorial authority.', 'Barthes argued meaning arises in reading.'),
      mc(28, 4, 2, 'Which book discusses Bertha Mason from a feminist perspective?', ['The Madwoman in the Attic', 'Orientalism', 'The Souls of Black Folk and Other Essays', 'Decolonising the Mind'], 'It was published in 1979.', 'Gilbert and Gubar\'s book discusses such figures.'),
      mc(28, 5, 3, 'What is the lesson\'s advice on using critical lenses?', ['State a claim, support it from the text, and note what the lens leaves out', 'Pick one lens and never change', 'Ignore the text', 'Use only the author\'s intention'], 'Be specific and aware of limits.', 'Evidence and awareness of limits are the skill.'),
    ],
  },
};
