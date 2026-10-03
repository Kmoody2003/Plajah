import type { Question } from './types';

/** mcq builder: puts the correct choice at index `at` and the wrong ones around it. */
function m(
  id: string,
  level: 1 | 2 | 3,
  prompt: string,
  correct: string | string[],
  wrong: [string, string, string] | number,
  at: number | string,
  hint: string,
  explanation?: string,
): Question {
  if (Array.isArray(correct)) {
    // Shorthand: (id, level, prompt, [choices...], answerIndex, hint, explanation)
    return a(id, level, prompt, correct, wrong as number, at as string, hint);
  }
  at = at as number;
  wrong = wrong as [string, string, string];
  explanation = explanation as string;
  const choices = [...wrong];
  choices.splice(at, 0, correct);
  const lessonId = id.split('.')[0];
  return { id, lessonId, kind: 'mcq', prompt, choices, answer: at, hint, explanation, level };
}

function t(
  id: string,
  level: 1 | 2 | 3,
  prompt: string,
  isTrue: boolean,
  hint: string,
  explanation: string,
): Question {
  const lessonId = id.split('.')[0];
  return { id, lessonId, kind: 'tf', prompt, answer: isTrue ? 0 : 1, hint, explanation, level };
}

const EXTRA: Record<string, string> = {
  '11.q2': 'recording a real tea-party of the Queen',
  '11.q4': 'the formal rules of chess and nothing else',
  '2701.q4': 'a clue to a lost map',
  '98.q4': 'a metaphor with no contrast',
  '345.q4': 'Technology is a magic spell cast by the Count',
  '76.q3': 'that Huck wants to be a pirate',
  '76.q5': 'actors hired by Tom Sawyer',
  '174.q4': 'prologues',
  '1260.q4': 'proves Jane is not the author',
  '514.q4': 'a cliffhanger ending of every single chapter',
  '120.q4': 'describe the future of Jim\'s life',
  '1513.q5': 'what time is it?',
  '1524.q4': 'a stage direction',
  '1400.q5': 'run a school',
  '730.q3': 'the length of London bridges',
  '730.q4': 'an elegy',
  '46.q4': 'a mystery solved by a detective',
  '46.q5': 'it is a Christmas cake',
  '2600.q3': 'shaped only by weather',
  '2600.q5': 'a kind of Russian tea served at the end of dinner',
  '1399.q3': 'a sea voyage',
  '996.q3': 'that Quixote is a skilled engineer',
  '996.q4': 'a cookbook of the dishes of Spanish inns',
  '996.q5': 'allegory of nature',
  '76.q4': 'It shows the book was written for a very young audience',
  '174.q3': 'avoid society and live as a quiet, plain hermit in the country',
  '1400.q4': 'a cheerful symbol for a happy wedding day',
};

/** Builder for questions whose 3 listed choices already contain the answer; adds a 4th distractor. */
function a(
  id: string,
  level: 1 | 2 | 3,
  prompt: string,
  three: string[],
  ans: number,
  hint: string,
  explanation: string,
): Question {
  const correct = three[ans];
  const wrong = three.filter((_, i) => i !== ans);
  wrong.push(EXTRA[id] || 'None of these');
  return m(id, level, prompt, correct, wrong as [string, string, string], ans, hint, explanation);
}

const RAW: Question[] = [
  // Pride and Prejudice
  m('1342.q1', 1, 'In Pride and Prejudice, who is the proud, wealthy gentleman Elizabeth Bennet first dislikes?', 'Mr. Darcy', ['Mr. Bingley', 'Mr. Collins', 'Mr. Wickham'], 0, 'His name is in the title\'s "pride."', 'Fitzwilliam Darcy seems arrogant at the first ball, and Elizabeth judges him harshly.'),
  m('1342.q2', 2, 'Why is Mrs. Bennet so anxious to marry off her daughters?', 'The family estate is entailed to a male cousin, so the daughters will have little security', ['The daughters have been banished from society', 'The family has just moved abroad', 'The father has sworn never to let them marry'], 1, 'Think about who inherits Longbourn.', 'Under the entail, Longbourn passes to Mr. Collins, leaving the five daughters dependent on good marriages.'),
  m('1342.q3', 2, 'Which pairing best captures the book\'s main theme about character?', 'First impressions can be wrong, and pride and prejudice must be overcome', ['Wealth always brings happiness', 'Young people of any rank should never marry for love, since duty comes first', 'Social rank is the best guide to a person\'s worth'], 2, 'Consider how Elizabeth\'s opinions change.', 'Both Darcy and Elizabeth must correct their pride and their prejudices before they can understand each other.'),
  m('1342.q4', 3, 'Austen opens the novel with a sentence about "a single man in possession of a good fortune" needing a wife. This is an example of', 'Irony, since the novel shows it is really the unmarried women who need husbands', ['Foreshadowing of a murder', 'A flashback that returns to the childhood of the Bennet sisters before the story begins', 'A cliffhanger'], 3, 'Who is actually searching in the story?', 'The narrator states a "truth" that is really the viewpoint of marriage-minded mothers, which is ironic.'),
  m('1342.q5', 1, 'When Elizabeth thinks Darcy is "condescending," she means he', 'acts as if he is above others and does them a favor by being polite', ['is shy and silent', 'is generous with his money', 'is quick to anger'], 1, 'The prefix "con-" and "descend" suggest stepping down.', 'Condescension is acting superior while appearing kind; Elizabeth feels this from Darcy and from Lady Catherine.'),

  // Frankenstein
  m('84.q1', 1, 'In Frankenstein, what does Victor Frankenstein do soon after he brings his creature to life?', 'He is horrified and abandons it', ['He proudly shows it to the world', 'He sails with it to America', 'He teaches it to read'], 1, 'Think about Victor\'s reaction to what he made.', 'Victor flees in disgust, leaving the creature to fend for itself, which sets the tragedy in motion.'),
  m('84.q2', 2, 'The story is framed by letters from Robert Walton. Where is he traveling?', 'Toward the North Pole', ['Across the Sahara', 'To the Amazon', 'To the Pacific islands'], 2, 'It is cold and icy.', 'Walton is an Arctic explorer who finds Victor on the ice and records his story.'),
  m('84.q3', 2, 'Which theme is central to Victor\'s relationship with his creation?', 'A creator\'s responsibility for what he makes', ['The joy of exploring distant lands and frozen seas', 'The simple pleasure of quiet country life in Switzerland', 'The superiority of formal schooling over self-teaching'], 0, 'Who cares for the creature?', 'The novel asks what creators owe their creations; Victor\'s neglect leads to disaster.'),
  m('84.q4', 3, 'Why does Shelley include a long section in which the creature tells his own story?', 'To let the reader see the creature\'s point of view and feel sympathy for him', ['To prove he is only a monster', 'To advertise Victor\'s skill', 'To show the story is a comedy'], 3, 'Whose voice do we hear?', 'The creature\'s eloquent account complicates our judgment of who is the real monster.'),
  t('84.q5', 1, 'True or false: The creature in the novel is called "Frankenstein."', false, 'Who is the book named for?', 'Frankenstein is the scientist\'s surname; the creature has no name in the novel.'),

  // Alice
  m('11.q1', 1, 'How does Alice first get into Wonderland?', 'She follows a White Rabbit down a rabbit hole', ['She walks through a wardrobe at the back of a spare room', 'She is carried off by a tornado during a great storm', 'She sails across a lake in a small boat with her sister'], 0, 'He is carrying a watch and is late.', 'Alice sees the White Rabbit with a pocket watch and tumbles down after him.'),
  a('11.q2', 2, 'When Alice recites a poem she learned, it comes out wrong. Carroll is mostly', ['telling a true and detailed history of a Victorian boarding school', 'writing a map of England', 'parodying the improving poems Victorian children memorized'], 2, 'Think of how children learned verse.', 'Carroll parodies moralizing Victorian verses, turning them into nonsense.'),
  m('11.q3', 2, 'Alice keeps shrinking and growing. What does this most suggest about her?', 'Growing up is confusing, and she is unsure who she is', ['She is a magician', 'She hates drinking tea', 'She is trying to escape from the Queen\'s army of playing cards'], 1, 'Think about how she answers the Caterpillar\'s question.', 'Her size changes mirror the unsettling changes of childhood, and she questions who she is.'),
  a('11.q4', 3, 'At the Mad Tea-Party, the conversations make little sense because they depend on', ['the strict rules of Latin grammar taught in schools', 'wordplay and logic that is almost right but twisted', 'the official rules of a Victorian cricket match'], 1, 'Think of puns and riddles with no answer.', 'Carroll uses puns and illogical logic, a form of nonsense, to unsettle ordinary rules.'),
  m('11.q5', 1, 'The Queen of Hearts is best known for shouting what command?', '"Off with their heads!"', ['"Run for the hills!"', '"Bring me a cake!"', '"Come to my ball!"'], 0, 'She is quick to anger.', 'The Queen constantly orders executions, though they are rarely carried out.'),

  // Moby Dick
  m('2701.q1', 1, 'Who narrates Moby-Dick?', 'Ishmael', ['Captain Ahab', 'Queequeg', 'Starbuck'], 0, 'The first line says "Call me ..."', 'The book opens with "Call me Ishmael," and he tells the story as a survivor.'),
  m('2701.q2', 2, 'What industry does the Pequod\'s voyage represent?', 'Nineteenth-century American whaling', ['Cotton shipping from Southern ports to Europe', 'Gold prospecting in the American West', 'Naval warfare against the British navy'], 1, 'Whale oil lit lamps.', 'The Pequod is a whaling ship from Nantucket, and the book describes the trade in detail.'),
  m('2701.q3', 2, 'What drives Captain Ahab\'s voyage?', 'An obsessive need for revenge on the white whale that took his leg', ['A search for a lost treasure', 'A scientific mission to map the coast', 'A wish to return home to his family'], 2, 'Think of his missing leg.', 'Ahab is consumed by monomania against Moby Dick, and it drives the crew to disaster.'),
  a('2701.q4', 3, 'The white whale is best understood as', ['a plain animal that stands for nothing beyond its oil and bone', 'a symbol that different characters read in different ways', 'a ship in disguise'], 1, 'Does Ahab see the same thing Ishmael sees?', 'Melville makes the whale a symbol that means different things to Ahab, Ishmael, and others.'),
  m('2701.q5', 2, 'Ahab nails a gold doubloon to the mast. What is it for?', 'A prize for the first man to sight Moby Dick', ['Payment for the ship\'s cook and the cabin boy at the end of the voyage', 'A lucky charm meant to protect the ship against storms at sea', 'A memorial placed there to honor the leg he lost to the whale'], 3, 'It is an incentive for the crew.', 'The doubloon is promised to whoever first spots the white whale and becomes a symbol on which characters comment.'),

  // A Tale of Two Cities
  m('98.q1', 1, 'What does Sydney Carton do at the end of the novel?', 'He takes Charles Darnay\'s place at the guillotine', ['He escapes to England with Lucie and her whole family', 'He joins the revolutionaries and leads them against the court', 'He marries Lucie and raises a family with her in London'], 1, 'He looks a lot like Darnay.', 'Carton, who resembles Darnay, sacrifices himself so Lucie\'s family can live.'),
  m('98.q2', 2, 'Which two cities does the title refer to?', 'London and Paris', ['Rome and Athens', 'Dublin and Edinburgh', 'Vienna and Berlin'], 0, 'The story moves across the English Channel.', 'The novel moves between London and revolutionary Paris.'),
  m('98.q3', 2, 'Dr. Manette is "recalled to life" after eighteen years in which place?', 'The Bastille', ['A London poorhouse', 'A Paris hospital', 'A country monastery'], 2, 'It was a famous Paris prison.', 'He was held in the Bastille prison, and his release is the "resurrection" at the book\'s start.'),
  a('98.q4', 3, 'The opening line, "It was the best of times, it was the worst of times," is an example of', ['onomatopoeia, imitating the sound of an object', 'a simile', 'antithesis, using balanced opposites'], 2, 'Opposites are set side by side.', 'Dickens sets opposite ideas in balanced pairs to suggest an age of contradictions.'),
  m('98.q5', 1, 'Madame Defarge keeps track of the people she wants to punish by', 'knitting their names into a register', ['writing their names in a private diary', 'keeping a coin in a jar for each enemy', 'carving their names into the wooden tavern table'], 3, 'She is always busy with her hands.', 'Madame Defarge knits coded names of the condemned into her work.'),

  // Dracula
  m('345.q1', 1, 'Who first travels to Transylvania to meet Count Dracula?', 'Jonathan Harker', ['Abraham Van Helsing', 'Dr. Seward', 'Arthur Holmwood'], 0, 'He is a young solicitor.', 'Jonathan Harker visits the castle to help the Count buy property in England.'),
  m('345.q2', 2, 'What is the novel\'s unusual format?', 'It is told through diaries, letters, and clippings', ['A single long confession spoken by the Count to Harker', 'A collection of poems', 'A play script'], 1, 'Think about how the characters record events.', 'The epistolary form lets many narrators tell different parts of the story.'),
  m('345.q3', 2, 'Which fear of Victorian society does the Count most clearly represent?', 'Fear of foreign invasion and contagion', ['Fear of the open sea and long voyages abroad', 'Fear of machines and factory work in cities', 'Fear of schooling and of university teachers'], 2, 'He travels to London and spreads harm.', 'Dracula\'s arrival in England reflects anxieties about foreigners, disease, and corruption.'),
  a('345.q4', 3, 'The heroes use modern tools such as typewriters, shorthand, and the phonograph. What does this suggest?', ['Technology is useless against evil', 'The book is a science textbook', 'Modern science and ancient superstition collide in the story'], 2, 'Compare the old Count with the new tools.', 'The contrast between old evil and new technology is a central tension.'),
  t('345.q5', 1, 'True or false: Van Helsing is a vampire hunter and doctor who helps the group.', true, 'He arrives from Amsterdam.', 'Professor Abraham Van Helsing leads the effort to destroy the Count.'),

  // Huck Finn
  m('76.q1', 1, 'Who escapes with Huck on the raft?', 'Jim, an enslaved man', ['Tom Sawyer', 'Pap Finn', 'The Duke'], 0, 'He has run away from Miss Watson.', 'Jim flees slavery, and he and Huck travel down the Mississippi together.'),
  m('76.q2', 2, 'Where does most of the novel take place?', 'Along the Mississippi River in the antebellum South', ['In New York City, among crowded tenements and factories', 'On a ship at sea', 'In the Rocky Mountains'], 1, 'The title\'s Huck lives near a great river.', 'The raft journey down the Mississippi is the spine of the book.'),
  a('76.q3', 3, 'When Huck decides he will "go to hell" rather than turn Jim in, the novel shows', ['that Huck is a coward', 'that Twain agrees with slavery', 'that Huck\'s true conscience is stronger than the wrong rules of his society'], 2, 'Whose morality is wrong?', 'Huck believes he is sinning, but the reader sees that his compassion is right and his society is wrong.'),
  m('76.q4', 3, 'Twain tells the story in Huck\'s own dialect. What effect does this have?', ['It makes the story hard to follow, which is its whole point', 'It shows that the narrator and the author are the same man', 'It gives a naive voice that makes the satire sharper'], 2, 'Huck does not always see what the reader sees.', 'Huck\'s plain, naive voice exposes hypocrisy because he describes it without understanding.'),
  a('76.q5', 2, 'The Duke and the King are', ['con men who cheat the towns they visit', 'real royalty traveling down the river in disguise', 'Union soldiers'], 0, 'They join the raft and run schemes.', 'The pair swindle people with fake shows and false claims.'),

  // Dorian Gray
  m('174.q1', 1, 'What happens to the portrait in the novel?', 'It ages and shows the effects of Dorian\'s sins while he stays young', ['It is sold to a museum', 'It becomes more beautiful over time', 'It is destroyed on the first night'], 0, 'Dorian wishes for something unusual.', 'The painting takes on his age and corruption while he remains youthful.'),
  m('174.q2', 2, 'In which place is the story mainly set?', 'London in the late Victorian period', ['Medieval Florence during the age of the Medici', 'A Caribbean island in the age of pirates', 'Revolutionary Paris in the years of the Terror'], 0, 'Think of drawing rooms and theaters in a great English city.', 'The story moves among London drawing rooms, theaters, and hidden dens.'),
  m('174.q3', 2, 'Lord Henry Wotton\'s philosophy mostly encourages Dorian to', ['pursue pleasure and beauty without regard to consequences', 'give his fortune to charity', 'become a clergyman'], 0, 'He is a witty talker.', 'Lord Henry\'s hedonistic ideas spur Dorian to chase sensation.'),
  a('174.q4', 3, 'Lord Henry speaks in witty, paradoxical sayings. These are best called', ['epigrams', 'similes', 'soliloquies'], 0, 'They are short and clever.', 'Epigrams are brief, witty statements that often twist common wisdom.'),
  m('174.q5', 2, 'Why is Sibyl Vane\'s story important?', 'Dorian\'s cruelty to her marks the first major step in his moral decline', ['She paints the portrait', 'She becomes Lord Henry\'s wife', 'She rescues Dorian from prison'], 0, 'She is an actress.', 'Dorian callously rejects her, she dies, and he first notices the change in the portrait.'),

  // Jane Eyre
  m('1260.q1', 1, 'What is Jane Eyre\'s job at Thornfield Hall?', 'Governess to Adele', ['Cook', 'Housekeeper', 'Nurse to Mr. Rochester'], 0, 'She teaches a young girl.', 'Jane is hired as a governess to Rochester\'s ward, Adele.'),
  m('1260.q2', 2, 'Which setting is the harsh charity school Jane attends as a girl?', 'Lowood', ['Gateshead', 'Thornfield', 'Moor House'], 0, 'Her friend Helen Burns is there.', 'Lowood is a strict charity school where Jane is educated.'),
  m('1260.q3', 2, 'Why does Jane leave Thornfield after the wedding is stopped?', 'She learns Rochester is already married and refuses to compromise her principles', ['She is fired', 'She wants to see the sea', 'She inherits money abroad'], 0, 'A secret in the attic is revealed.', 'Jane learns of Bertha Mason, his wife, and leaves to keep her self-respect.'),
  a('1260.q4', 3, 'Jane often addresses the reader directly (for example, "Reader, I married him"). This technique', ['makes the narration feel like an intimate confession', 'shows that someone else is writing', 'proves the story is false and was made up by someone else'], 0, 'She speaks to "you."', 'The direct address draws the reader into Jane\'s private voice.'),
  m('1260.q5', 1, 'Which phrase best describes the mysterious laughter at Thornfield?', 'A hint of a hidden secret, a Gothic device', ['A comic aside meant only to lighten the mood', 'A plain weather report with no link to the story', 'A mistake by the narrator that is later corrected'], 0, 'The mystery builds suspense.', 'The strange laughter and fires create Gothic suspense before the attic secret is revealed.'),

  // Wuthering Heights
  m('768.q1', 1, 'Who is the brooding, vengeful man at the center of Wuthering Heights?', 'Heathcliff', ['Edgar Linton', 'Hareton Earnshaw', 'Mr. Lockwood'], 0, 'He is Catherine\'s foster-brother.', 'Heathcliff was taken in as a child, and his love for Catherine and his revenge drive the plot.'),
  m('768.q2', 2, 'Where is the novel set?', 'The Yorkshire moors in northern England', ['The crowded streets of London at night in winter', 'A castle in the cold highlands of Scotland', 'A large wheat farm on the plains of Kansas'], 0, 'Think of wild open hills.', 'The wild Yorkshire moors shape the characters and mood.'),
  m('768.q3', 3, 'Which narrator tells most of the story to Mr. Lockwood?', 'Nelly Dean, the housekeeper', ['Isabella Linton, who flees the Heights', 'Joseph, the old servant at the Heights', 'Catherine Linton, the grown daughter of Cathy'], 0, 'She served both houses.', 'Nelly relays the history, and her viewpoint colors what we believe.'),
  m('768.q4', 3, 'The novel uses nested narrators. What effect does this create?', 'Doubt about how reliable any single account is', ['It makes the plot simpler and easier to follow quickly', 'It removes all suspense', 'It proves the story is a diary'], 0, 'Lockwood tells what Nelly told him.', 'Layered narration means every account is filtered through someone with bias.'),
  m('768.q5', 2, 'Which theme best captures how Heathcliff treats the next generation?', 'Revenge continuing across generations', ['The value of travel and of life abroad', 'Peaceful rural life far from all conflict', 'Religious conversion and the joys of church'], 0, 'He targets the children of those who wronged him.', 'Heathcliff extends his revenge to Hareton and young Cathy, showing cruelty passed down.'),

  // Little Women
  m('514.q1', 1, 'Which March sister dreams of being a writer?', 'Jo', ['Meg', 'Beth', 'Amy'], 0, 'She is spirited and wears her hair short.', 'Jo March writes plays and stories and wants an independent life.'),
  m('514.q2', 2, 'During most of the novel, where is the March sisters\' father?', 'Away serving in the Civil War as a chaplain', ['Working in Europe as a diplomat for the government', 'In prison for refusing to pay taxes in the war', 'Out west panning for gold in the California hills'], 0, 'The nation is at war.', 'Mr. March serves as an army chaplain, leaving the household to the women.'),
  m('514.q3', 2, 'The sisters\' play-acting of Pilgrim\'s Progress suggests that growing up is', ['a journey where each person has burdens to overcome', 'a race in which the four sisters compete to win a prize', 'something to be avoided'], 0, 'Each carries a burden on the road.', 'The Pilgrim\'s Progress frame treats each girl\'s faults as a burden to work through.'),
  a('514.q4', 3, 'Alcott gives each sister a different personality and goal. This technique is called', ['using foils to contrast characters', 'stream of consciousness inside the mind of one sister', 'flashbacks that interrupt the main story'], 0, 'Compare Meg, Jo, Beth, and Amy.', 'Contrasting characters highlight each other\'s traits.'),
  m('514.q5', 1, 'Which sister quietly plays the piano and falls gravely ill?', 'Beth', ['Meg', 'Amy', 'Jo'], 0, 'She is gentle and shy.', 'Beth plays the piano, catches scarlet fever, and never fully recovers.'),

  // Treasure Island
  m('120.q1', 1, 'Who is the one-legged sea cook who joins the voyage?', 'Long John Silver', ['Captain Flint, the dead pirate', 'Billy Bones', 'Ben Gunn'], 0, 'He has a parrot.', 'Silver seems friendly but secretly leads the mutiny.'),
  m('120.q2', 2, 'How does Jim Hawkins get the treasure map?', 'From the chest of the dead old sailor Billy Bones', ['From a sealed bottle found washed up on the island shore', 'From his father\'s will', 'From a fortune teller'], 0, 'A rough guest dies at the Admiral Benbow inn.', 'Jim finds the map in Billy Bones\'s sea chest at his family\'s inn.'),
  m('120.q3', 2, 'What is a major theme of the novel?', 'Growing up through adventure, and the moral ambiguity of greed', ['The value of idleness', 'The importance of silence', 'Life in a big city'], 0, 'Jim changes during the voyage.', 'Jim learns about courage and judgment amid greed and loyalty.'),
  a('120.q4', 3, 'Jim narrates in first person, looking back on the events. This allows Stevenson to', ['build suspense and share Jim\'s limited knowledge', 'show everyone\'s thoughts through an all-knowing narrator', 'avoid describing the island'], 0, 'He tells what he saw himself.', 'First-person narration limits what we know and creates suspense.'),
  t('120.q5', 1, 'True or false: Long John Silver is a simple villain with no good qualities.', false, 'Jim often likes him.', 'Silver is charming and sometimes protects Jim, making him morally mixed.'),

  // Romeo and Juliet
  m('1513.q1', 1, 'Which two families are feuding in Romeo and Juliet?', 'The Montagues and the Capulets', ['The Tudors and the Stuarts of England', 'The Medicis and the Borgias of Florence', 'The Lancasters and the Yorks of England'], 0, 'Romeo and Juliet belong to rival houses.', 'Romeo is a Montague and Juliet a Capulet.'),
  m('1513.q2', 2, 'Where is the play set?', 'Verona, Italy', ['London, England', 'Elsinore, Denmark', 'Athens, Greece'], 0, 'The opening says "fair Verona."', 'The play is set in the Italian city of Verona, with a trip to Mantua.'),
  m('1513.q3', 3, 'What leads to the lovers\' deaths?', 'Haste, bad timing, and the long family feud', ['A shipwreck that strands the lovers on an island', 'A famine', 'A war with another city'], 0, 'Think of the missed message and impulsive choices.', 'The feud and the lovers\' hurry, plus a missed message, lead to tragedy.'),
  m('1513.q4', 3, 'The play\'s prologue is a sonnet that announces the ending. This is', ['foreshadowing', 'a soliloquy', 'a cliffhanger'], 0, 'We are told what will happen.', 'The prologue tells us that "star-crossed" lovers will die, building dramatic tension.'),
  a('1513.q5', 2, 'When Juliet asks "wherefore art thou Romeo?" she means', ['why are you Romeo, a Montague?', 'where are you hiding in the garden?', 'who are you?'], 0, 'She is lamenting his name.', '"Wherefore" means "why"; she wishes he were not a Montague.'),

  // Hamlet
  m('1524.q1', 1, 'Who is Hamlet\'s uncle, now king after marrying Hamlet\'s mother?', 'Claudius', ['Polonius', 'Laertes', 'Fortinbras'], 0, 'The ghost accuses him.', 'Claudius murdered King Hamlet and took the throne and Queen Gertrude.'),
  m('1524.q2', 2, 'Where is the play set?', 'The royal castle of Elsinore in Denmark', ['The glittering palace of Versailles in France', 'A gloomy castle in the Scottish highlands', 'A busy tavern near the River Thames in London'], 0, 'Something is rotten in the state of Denmark.', 'The play takes place at Elsinore Castle in Denmark.'),
  m('1524.q3', 3, 'Which theme is shown by Hamlet\'s long delay in taking revenge?', 'Action versus overthinking and the moral weight of revenge', ['The joy of conquest', 'The value of a quick temper', 'The pleasure of travel'], 0, 'Hamlet keeps thinking before acting.', 'His hesitation raises questions about revenge, conscience, and certainty.'),
  a('1524.q4', 3, 'In "To be, or not to be," Hamlet speaks his thoughts alone on stage. This device is called', ['a soliloquy', 'an aside to the audience about the plot only', 'a prologue'], 0, 'He is alone with his thoughts.', 'A soliloquy lets the audience hear a character\'s private reasoning.'),
  m('1524.q5', 2, 'Hamlet stages a play to test Claudius. What does he hope to learn?', 'Whether Claudius reacts with guilt to a murder scene like his own crime', ['Whether the players can sing', 'Whether Ophelia loves him', 'Whether the Danes support him'], 0, 'He calls it a mousetrap.', 'Hamlet watches the king\'s reaction to prove the ghost\'s story.'),

  // Great Expectations
  m('1400.q1', 1, 'Who is the narrator of Great Expectations?', 'Pip', ['Joe Gargery', 'Herbert Pocket', 'Magwitch'], 0, 'He is an orphan raised in the marshes.', 'Pip narrates his own story as an adult looking back.'),
  m('1400.q2', 2, 'Who is secretly the source of Pip\'s fortune?', 'Magwitch, the convict Pip helped as a child', ['Miss Havisham', 'Mr. Jaggers, the stern London lawyer', 'Joe Gargery'], 0, 'Pip first meets him on the marshes.', 'Magwitch, grateful to Pip, funds his rise and is the true benefactor.'),
  m('1400.q3', 3, 'What does Pip learn about wealth and class by the end?', 'True worth lies in character and loyalty, not status', ['Wealth and social rank guarantee lasting happiness to anyone', 'Class has no effect on people', 'Education is worthless'], 0, 'Think of how Joe treats him.', 'Pip realizes that Joe\'s kindness is worth more than snobbery.'),
  m('1400.q4', 3, 'Miss Havisham\'s stopped clocks and decaying wedding cake are examples of', ['symbolism for a life frozen in hurt', 'a simile with no meaning beyond decoration', 'dialect used to mock country folk and sailors'], 0, 'She stopped time on her wedding day.', 'The stopped clocks and rotting cake symbolize her clinging to the past.'),
  a('1400.q5', 1, 'Estella was raised by Miss Havisham to', ['break men\'s hearts', 'become a nurse', 'run the forge'], 0, 'It is Miss Havisham\'s revenge.', 'Miss Havisham trains Estella to be cold, using her to hurt men like Pip.'),

  // Oliver Twist
  m('730.q1', 1, 'What famous request does Oliver make in the workhouse?', '"Please, sir, I want some more."', ['"Take me home to my father, please."', '"Where is my father?"', '"I am a gentleman."'], 0, 'It is about food.', 'Oliver asks for more gruel and is punished.'),
  m('730.q2', 2, 'Which gang leader trains boys to pick pockets in London?', 'Fagin', ['Mr. Brownlow', 'Mr. Bumble', 'Bill Sikes'], 0, 'The Artful Dodger works for him.', 'Fagin runs a gang of boy pickpockets in a London den.'),
  a('730.q3', 3, 'Dickens wrote Oliver Twist partly to criticize', ['how society treated poor children and workhouse policy', 'the tax on imported tea and the price of sugar in London shops', 'the cost of theater tickets'], 0, 'Think of the opening chapters.', 'The novel attacks the harsh Poor Law system and the neglect of poor children.'),
  a('730.q4', 3, 'Dickens gives officials like Mr. Bumble comically exaggerated manners. This is', ['satire', 'tragic irony only', 'stream of consciousness'], 0, 'It mocks people in authority.', 'Satire uses humor and exaggeration to criticize.'),
  m('730.q5', 1, 'Which kind man takes Oliver in and tries to help him?', 'Mr. Brownlow', ['Mr. Sowerberry', 'Bill Sikes', 'Noah Claypole'], 0, 'He is a gentleman Oliver is accused of robbing by mistake.', 'Mr. Brownlow shelters Oliver and becomes his protector.'),

  // A Christmas Carol
  m('46.q1', 1, 'Who is Ebenezer Scrooge\'s dead business partner who appears as a ghost?', 'Jacob Marley', ['Bob Cratchit', 'Fred', 'Fezziwig'], 0, 'He wears heavy chains.', 'Marley\'s ghost warns Scrooge that three spirits will visit him.'),
  m('46.q2', 2, 'Which family does Scrooge\'s clerk Bob Cratchit have?', 'A poor family including the sick boy Tiny Tim', ['A rich merchant family in a grand house in London', 'A group of sailors on shore leave in the harbor', 'A family of ghosts who haunt the old counting house'], 0, 'They celebrate Christmas despite little money.', 'Bob Cratchit, underpaid, supports his family including Tiny Tim.'),
  m('46.q3', 3, 'What is the main theme of the story?', 'Generosity and the possibility of redemption', ['Success through greed and hard bargaining in business', 'The danger of the sea and of storms on long voyages', 'The importance of silence and of keeping to oneself'], 0, 'Scrooge changes by the end.', 'Scrooge learns to value kindness and community and reforms.'),
  a('46.q4', 3, 'The ghosts of Christmas Past, Present, and Yet to Come work as a', ['structure moving the story through time', 'chorus in a play that comments on the action', 'set of riddles'], 0, 'Each shows a different time.', 'The three spirits show Scrooge time periods that change his outlook.'),
  a('46.q5', 1, 'When Scrooge calls Christmas "humbug," he means it is', ['nonsense', 'wonderful', 'a type of sweet'], 0, 'He does not like the holiday.', 'Humbug means nonsense or a sham, showing his scorn.'),

  // Crime and Punishment
  m('2554.q1', 1, 'Who is the main character of Crime and Punishment?', 'Rodion Raskolnikov', ['Porfiry Petrovich', 'Razumikhin', 'Svidrigailov'], 0, 'He is a poor former student.', 'Raskolnikov murders a pawnbroker and is tormented by guilt.'),
  m('2554.q2', 2, 'In which city is the novel mostly set?', 'St. Petersburg', ['Moscow', 'Paris', 'Warsaw'], 0, 'Russia\'s capital at the time.', 'The story unfolds in the crowded, poor districts of St. Petersburg.'),
  m('2554.q3', 3, 'Raskolnikov believes extraordinary people may break moral rules. What does the novel show?', 'The theory collapses under his guilt and conscience', ['The theory is proven true and he is richly rewarded for it', 'No one cares what he does', 'He becomes a famous leader'], 0, 'Consider how he feels after the crime.', 'His fever, paranoia, and guilt show the theory cannot silence conscience.'),
  m('2554.q4', 3, 'Dostoevsky shows Raskolnikov\'s fevers, dreams, and racing thoughts. This is an example of', ['psychological realism', 'epistolary form, told through letters', 'fable'], 0, 'The focus is the inner mind.', 'The novel explores the inner life of a guilty mind.'),
  m('2554.q5', 2, 'Which character encourages Raskolnikov toward confession and redemption?', 'Sonya Marmeladova', ['Luzhin', 'Dunya\'s landlady', 'The pawnbroker'], 0, 'She is a young woman of deep faith.', 'Sonya urges him to confess and follows him to Siberia.'),

  // War and Peace
  m('2600.q1', 1, 'Which French leader\'s invasion of Russia is central to War and Peace?', 'Napoleon', ['Louis XIV', 'Charlemagne', 'Robespierre'], 0, 'The 1812 invasion.', 'Napoleon\'s invasion of Russia and the burning of Moscow are major events.'),
  m('2600.q2', 2, 'Which two characters are among the novel\'s main young nobles?', 'Pierre Bezukhov and Andrei Bolkonsky', ['Raskolnikov and Sonya Marmeladova of Petersburg', 'Anna Karenina and Count Vronsky of Moscow', 'Jean Valjean and Inspector Javert of Paris'], 0, 'One is a bastard turned count; the other is a prince.', 'Pierre and Andrei both search for meaning amid war and society.'),
  a('2600.q3', 3, 'Tolstoy argues in the novel that history is', ['driven by countless small forces, not just great men', 'shaped only by the will of Napoleon and his generals', 'decided by luck alone with no pattern'], 0, 'He doubts hero worship.', 'He argues leaders are carried along by vast forces and individual acts.'),
  m('2600.q4', 3, 'Why does Tolstoy alternate between salons and battlefields?', 'To contrast private life and public events and question what matters', ['To save space', 'To avoid describing war', 'Because the story is a diary'], 0, 'Compare ballrooms to battles.', 'The contrast invites the reader to weigh private and public life.'),
  a('2600.q5', 1, 'In the novel, a "salon" is', ['a gathering of aristocrats for conversation', 'a type of ship used by the Russian navy in the war', 'a military order given by the tsar before battle'], 0, 'It opens the book at Anna Scherer\'s party.', 'Salons were upper-class social gatherings.'),

  // Anna Karenina
  m('1399.q1', 1, 'What choice does Anna make that scandalizes St. Petersburg society?', 'She leaves her husband for Count Vronsky', ['She joins the army as a nurse in the Crimean war', 'She sells her estate and moves to the Crimea', 'She becomes a nun in a convent near Moscow'], 0, 'It involves love outside of marriage.', 'Anna\'s affair with Vronsky leads to social ostracism.'),
  m('1399.q2', 2, 'Who is the landowner whose parallel story explores faith and meaning?', 'Konstantin Levin', ['Karenin', 'Oblonsky', 'Dolly'], 0, 'He works on his farm and loves Kitty.', 'Levin seeks meaning through work, family, and faith.'),
  a('1399.q3', 3, 'The novel begins "All happy families are alike; each unhappy family is unhappy in its own way." This sets up', ['a study of different troubled marriages and families', 'a travel narrative about a long journey across the steppe', 'a war story'], 0, 'Think of the Oblonskys, Karenins, and Levins.', 'The opening frames the book\'s many family stories.'),
  m('1399.q4', 3, 'Why does Tolstoy tell Anna\'s and Levin\'s stories in parallel?', 'Their opposite paths comment on each other', ['To confuse the reader with unrelated stories', 'To shorten the book by dividing it into halves', 'Because the two men are bitter enemies in love'], 0, 'Compare their outcomes.', 'The contrasting plots illuminate passion versus purpose.'),
  m('1399.q5', 2, 'How do high society characters generally treat Anna after her affair?', 'They shun her while excusing similar behavior by men', ['They throw a grand party for her to celebrate her return', 'They ask her to run the government', 'They ignore it entirely'], 0, 'Note the double standard.', 'Society judges Anna harshly, unlike men like Oblonsky.'),

  // Don Quixote
  m('996.q1', 1, 'Why does Alonso Quixano become Don Quixote?', 'He reads too many chivalric romances and decides to become a knight', ['He inherits a title from a king', 'He is cursed by a witch', 'He is paid to act in a play'], 0, 'Think of his bookshelf.', 'Reading romances drives him to imitate knights.'),
  m('996.q2', 2, 'Who is Don Quixote\'s down-to-earth companion?', 'Sancho Panza, his squire', ['Dulcinea, the lady he adores', 'Rocinante, his old and faithful horse', 'The village barber of the Mancha'], 0, 'He hopes to be rewarded with an island.', 'Sancho serves as squire and offers a practical view.'),
  a('996.q3', 3, 'When Quixote charges at windmills thinking they are giants, this shows', ['the clash between illusion and reality', 'that he is a great warrior who defeats every giant', 'that windmills were enemies'], 0, 'What does he actually see?', 'He sees what he reads in books rather than what is there.'),
  a('996.q4', 3, 'Cervantes wrote the book largely as', ['a parody of chivalric romances', 'a travel guide to the towns of Spain', 'a legal handbook for Spanish judges'], 0, 'The target is knightly tales.', 'The novel mocks the exaggerated romances of knights.'),
  a('996.q5', 2, 'In Part Two, characters have read Part One. This technique is called', ['metafiction', 'epigram', 'allegory only'], 0, 'The book comments on being a book.', 'Metafiction draws attention to a work as a work of fiction.'),
];

/** Rotate each mcq's choices so correct answers are spread evenly across positions 0-3. */
let mcqCount = 0;
export const CLASSICS_A_QUESTIONS: Question[] = RAW.map((q) => {
  if (q.kind !== 'mcq' || !q.choices) return q;
  const target = mcqCount++ % 4;
  const correct = q.choices[q.answer];
  const others = q.choices.filter((_, i) => i !== q.answer);
  others.splice(target, 0, correct);
  return { ...q, choices: others, answer: target };
});
