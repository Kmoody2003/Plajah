import type { Question } from './types';

const m = (
  book: string,
  n: number,
  level: 1 | 2 | 3,
  prompt: string,
  choices: [string, string, string, string],
  answer: number,
  hint: string,
  explanation: string,
): Question => {
  // Spread the correct answer position across 0-3 deterministically per book and question.
  const target = (n - 1 + (parseInt(book, 10) % 4)) % 4;
  const correct = choices[answer];
  const rest = choices.filter((_, i) => i !== answer);
  const out = [...rest.slice(0, target), correct, ...rest.slice(target)];
  return { id: `${book}.q${n}`, lessonId: book, kind: 'mcq', prompt, choices: out, answer: target, hint, explanation, level };
};

const tf = (
  book: string,
  n: number,
  level: 1 | 2 | 3,
  prompt: string,
  answer: 0 | 1,
  hint: string,
  explanation: string,
): Question => ({ id: `${book}.q${n}`, lessonId: book, kind: 'tf', prompt, answer, hint, explanation, level });

export const CLASSICS_B_QUESTIONS: Question[] = [
  // The Count of Monte Cristo
  m('1184', 1, 1, 'Why is Edmond Dantes imprisoned in the Chateau d\'If?', ['He is falsely accused of treason by men who envy him', 'He steals a ship from his employer and sails for the Orient', 'He fights a duel and kills a nobleman', 'He refuses to join the army'], 0, 'Think about who benefits from his arrest.', 'Danglars, Fernand, and Caderousse plot against him, and Villefort jails him to protect himself over a letter from Elba.'),
  m('1184', 2, 1, 'Where does Dantes find the treasure that makes him rich?', ['In a Paris bank vault guarded day and night', 'On the island of Monte Cristo', 'Under the Chateau d\'If', 'In a Roman villa'], 1, 'The title gives a clue.', 'The Abbe Faria tells him of a treasure hidden on the island of Monte Cristo, which he later finds.'),
  m('1184', 3, 2, 'Which theme best describes the novel\'s central question?', ['Whether money can buy happiness in a quiet village', 'Whether revenge can ever be fully just', 'How to build a ship', 'Why the monarchy should be restored'], 1, 'Consider what Dantes does after escaping.', 'Dantes pursues elaborate revenge, and the novel questions whether a human can act as an instrument of providence without going too far.'),
  m('1184', 4, 2, 'Dumas hides the Count\'s identity from other characters, but readers know it. This is an example of what?', ['Dramatic irony', 'Personification', 'Onomatopoeia', 'Alliteration'], 0, 'The audience knows more than the characters.', 'Readers know the Count is Dantes while his enemies do not, which creates dramatic irony.'),
  m('1184', 5, 3, 'When the text says Dantes shows "fortitude" in prison, what does it mean?', ['Great wealth', 'Courage and endurance in hardship', 'A love of food', 'A talent for languages'], 1, 'Think about how he survives years in a cell.', 'Fortitude means strength of spirit in the face of suffering, which Dantes shows over fourteen years of imprisonment.'),

  // Les Miserables
  m('135', 1, 1, 'What small crime first sends Jean Valjean to prison?', ['Stealing bread', 'Forging a letter', 'Smuggling', 'Starting a riot'], 0, 'He was trying to feed his sister\'s children.', 'Valjean is jailed for stealing a loaf of bread, and his sentence is extended by escape attempts.'),
  m('135', 2, 1, 'Which major historical event is a setting for part of the novel?', ['The American Civil War and the long years of Reconstruction', 'The Battle of Waterloo and later Paris uprising of 1832', 'The Crusades', 'The Black Death'], 1, 'The story begins after Napoleon\'s fall.', 'The novel includes the Battle of Waterloo and the June 1832 student uprising in Paris.'),
  m('135', 3, 2, 'What act changes Valjean\'s life early in the book?', ['A judge frees him after hearing the whole sad story', 'A bishop shows him mercy after he steals silver', 'A soldier saves him from drowning', 'He inherits money'], 1, 'Consider the silver candlesticks.', 'The Bishop of Digne tells police the silver was a gift and gives Valjean the candlesticks, inspiring him to change.'),
  m('135', 4, 2, 'Hugo often pauses the plot for long essays on topics like Waterloo or the sewers. What is this technique called?', ['Digression', 'Flashback', 'Soliloquy', 'Pun'], 0, 'It means leaving the main subject for a time.', 'These digressions give historical and social background and make Hugo\'s arguments directly.'),
  m('135', 5, 3, 'Why does Inspector Javert struggle at the end of the story?', ['He cannot reconcile his rigid view of law with Valjean\'s mercy', 'He loses his badge', 'He is promoted', 'He learns Valjean is a nobleman'], 0, 'Valjean spares his life.', 'Javert believes in law without mercy; Valjean\'s act of mercy breaks that worldview, and he cannot go on.'),

  // Sense and Sensibility
  m('161', 1, 1, 'Which sisters are the central characters of the novel?', ['Elinor and Marianne Dashwood', 'Jane and Elizabeth Bennet of Longbourn', 'Emma and Isabella Woodhouse', 'Meg and Jo March'], 0, 'The title refers to their qualities.', 'Elinor represents sense and Marianne sensibility.'),
  m('161', 2, 2, 'Why must the Dashwood women leave their home at the beginning?', ['The house burns down in a fire one winter night', 'Inheritance passes to their half-brother John', 'They are in debt to a neighbor', 'A war begins'], 1, 'Think about how property was inherited at the time.', 'Norland Park passes to John Dashwood, leaving his stepmother and half-sisters with little money.'),
  m('161', 3, 2, 'What is a main theme of the book?', ['The balance between reason and emotion', 'The dangers of the sea and of naval life', 'The rise of industry and the growth of cities', 'Life in the Navy and on long sea voyages'], 0, 'See the title.', 'Both sisters learn that neither pure restraint nor pure feeling is enough.'),
  m('161', 4, 2, 'Austen often uses a narrator who gently mocks selfishness, such as in John and Fanny Dashwood\'s conversation about helping the family. This is an example of what?', ['Irony', 'Alliteration', 'Epic simile', 'Onomatopoeia'], 0, 'The narrator says one thing and means another.', 'The narrator shows them reasoning their way out of generosity, a clear case of irony.'),
  m('161', 5, 3, 'Why is Marianne\'s illness a turning point?', ['It makes her rethink her extreme sensibility', 'It reunites her with her father after many years', 'It ends the novel', 'It cancels her wedding'], 0, 'She nearly dies after a long period of grief.', 'After nearly dying, Marianne sees that she brought suffering on herself and her family, and she grows wiser.'),

  // Emma
  m('158', 1, 1, 'What is Emma Woodhouse\'s favorite hobby?', ['Matchmaking', 'Sailing', 'Painting portraits of the poor', 'Politics'], 0, 'She sets Harriet up with various men.', 'Emma loves arranging marriages, with comic and painful results.'),
  m('158', 2, 1, 'Where does the story take place?', ['The village of Highbury', 'A castle in the Scottish highlands', 'London docks', 'A ship at sea'], 0, 'It is a small English village.', 'Almost all action takes place in or near Highbury in Surrey.'),
  m('158', 3, 2, 'Which theme matters most to Emma\'s growth?', ['Self-knowledge', 'Revenge', 'Exploration', 'War'], 0, 'She has to learn she can be wrong.', 'Emma\'s confidence is shaken when she sees how her meddling hurts others, and she gains self-knowledge.'),
  m('158', 4, 3, 'Whose view do we mostly see in the narration, causing readers to believe Emma\'s mistaken ideas at first?', ['Emma\'s, through free indirect discourse', 'Mr. Knightley\'s private diary kept at Donwell Abbey', 'Letters written by Harriet to her friends in town', 'A neutral newspaper account of village events'], 0, 'The narrator slips into her thoughts.', 'Austen filters much of the story through Emma\'s perceptions, so readers share her errors.'),
  m('158', 5, 2, 'Who gently criticizes Emma and eventually becomes her husband?', ['Mr. Knightley', 'Mr. Elton', 'Frank Churchill', 'Mr. Martin'], 0, 'He is a longtime family friend.', 'Mr. Knightley tells Emma the truth when others will not, and they marry at the end.'),

  // The Three Musketeers
  m('1257', 1, 1, 'Who is the young man who travels to Paris hoping to become a musketeer?', ['D\'Artagnan', 'Athos', 'Porthos', 'Aramis'], 0, 'He is from Gascony.', 'D\'Artagnan arrives in Paris and soon befriends the three musketeers.'),
  m('1257', 2, 1, 'In which country and century does the story take place?', ['France in the 1620s', 'England in the 1800s', 'Spain in the 1400s', 'Italy in the 1900s'], 0, 'Louis XIII is on the throne.', 'The story is set under Louis XIII and Cardinal Richelieu.'),
  m('1257', 3, 2, 'What is the motto the friends share?', ['All for one, one for all', 'Honor above gold', 'Death before defeat', 'The sword is mightier than the pen'], 0, 'It sums up their friendship.', 'The slogan "All for one, one for all" captures their loyalty to each other.'),
  m('1257', 4, 3, 'Why do many chapters end at a moment of danger?', ['The book was first published in newspaper installments', 'The author disliked endings and refused to finish any tale', 'It was a school assignment', 'It was originally a play'], 0, 'Think about how readers kept buying the next issue.', 'The serial format encouraged cliffhangers to bring readers back.'),
  m('1257', 5, 2, 'Who is the main female villain, a spy for Cardinal Richelieu?', ['Milady de Winter', 'Constance Bonacieux', 'Queen Anne', 'Madame de Chevreuse'], 0, 'She has a hidden brand on her shoulder.', 'Milady works for Richelieu and plots against d\'Artagnan and his friends.'),

  // Around the World in Eighty Days
  m('103', 1, 1, 'What does Phileas Fogg bet?', ['That he can travel around the world in eighty days', 'That he can climb Mount Everest before the year is over', 'That he can win a chess match', 'That he can find buried treasure'], 0, 'See the title.', 'Fogg wagers 20,000 pounds with fellow Reform Club members.'),
  m('103', 2, 1, 'Who is Fogg\'s French servant?', ['Passepartout', 'Fix', 'Aouda', 'Stuart'], 0, 'His name means "goes everywhere".', 'Passepartout joins Fogg on the trip and gets into many scrapes.'),
  m('103', 3, 2, 'Why was a trip like this newly possible in the 1870s?', ['Steamships, railways, and the Suez Canal', 'Airplanes and fast motor cars that cross the sea', 'Rockets', 'Teleportation'], 0, 'Think about transport technology of Verne\'s time.', 'New steamships, rail lines, and the Suez Canal made faster world travel realistic.'),
  m('103', 4, 3, 'How does Fogg win the bet at the very end?', ['He gains a day by crossing the International Date Line eastward', 'He cheats the clock', 'He takes a balloon', 'The judges extend the deadline'], 0, 'Time zones and the calendar matter.', 'Traveling east, he gained a day without realizing, so he arrives in time.'),
  m('103', 5, 2, 'Detective Fix follows Fogg because he thinks Fogg is:', ['A bank robber', 'A spy', 'A prince', 'A pirate'], 0, 'A robbery has just happened in London.', 'Fix believes Fogg robbed the Bank of England and tries to arrest him.'),

  // Twenty Thousand Leagues
  m('164', 1, 1, 'What is the name of Captain Nemo\'s submarine?', ['The Nautilus', 'The Pequod', 'The Hispaniola', 'The Beagle'], 0, 'It is named for a sea creature.', 'The Nautilus is Nemo\'s advanced electric submarine.'),
  m('164', 2, 1, 'Who tells the story?', ['Professor Pierre Aronnax', 'Captain Nemo', 'Ned Land', 'Conseil'], 0, 'He is a French marine biologist.', 'Aronnax narrates in the first person after being captured with his servant and Ned Land.'),
  m('164', 3, 2, 'The story begins with sailors reporting a mysterious "monster". What is it really?', ['The submarine Nautilus', 'A giant squid', 'A whale', 'A volcano'], 0, 'Humans built it.', 'The "sea monster" turns out to be Nemo\'s ship.'),
  m('164', 4, 3, 'Why does Verne include long lists of fish and sea creatures?', ['To give an air of scientific realism', 'To fill pages and make the book longer', 'To confuse readers with lists of fish names', 'To teach French grammar to young readers'], 0, 'Think about the book\'s mix of fact and fiction.', 'The catalogs lend authority and make the imaginary voyage seem real.'),
  m('164', 5, 2, 'What does Ned Land want throughout the book?', ['To escape the Nautilus', 'To become captain', 'To find Atlantis', 'To hunt whales for profit'], 0, 'He is a prisoner, in effect.', 'Ned, a harpooner, repeatedly seeks to escape captivity.'),

  // The War of the Worlds
  m('36', 1, 1, 'Where do the Martian cylinders first land?', ['Near Woking in Surrey', 'In New York, near the harbor', 'In Paris', 'In Edinburgh'], 0, 'Real English towns are named.', 'The first cylinder falls on Horsell Common near Woking.'),
  m('36', 2, 1, 'Which planet do the invaders come from?', ['Mars', 'Venus', 'Jupiter', 'Mercury'], 0, 'It is in the title of the book\'s first chapter.', 'The invaders come from Mars.'),
  m('36', 3, 2, 'How are the Martians finally defeated?', ['By Earth\'s bacteria', 'By a cannon', 'By a flood', 'By the Royal Navy alone'], 0, 'Something tiny does what armies cannot.', 'They die because they have no immunity to Earth\'s germs.'),
  m('36', 4, 3, 'Wells wrote while Britain ruled a great empire. What idea does reversing roles produce?', ['The invaders treat humans as Europeans treated colonized peoples', 'A friendly alliance', 'A peace treaty', 'An economic boom'], 0, 'Who is the invader now?', 'Wells invites British readers to feel what it is like to be conquered by a stronger power.'),
  m('36', 5, 2, 'What are the Martians\' walking war machines called?', ['Tripods', 'Zeppelins', 'Ironclads', 'Dreadnoughts'], 0, 'They have three legs.', 'The tall three-legged machines are known as tripods.'),

  // The Time Machine
  m('35', 1, 1, 'What are the two groups the Time Traveller meets in 802,701?', ['The Eloi and the Morlocks', 'The Martians and the Venusians', 'The Lilliputians and the Brobdingnagians', 'The Hobbits and the Orcs'], 0, 'One lives above ground, one below.', 'The gentle Eloi live above ground and the Morlocks below.'),
  m('35', 2, 1, 'What is the name of the Eloi woman he saves from drowning?', ['Weena', 'Alice', 'Hester', 'Aouda'], 0, 'Her name rhymes with "Dina".', 'Weena is the Eloi woman who becomes his companion.'),
  m('35', 3, 2, 'What social problem does Wells use the future to comment on?', ['The gap between rich and poor', 'Overpopulation of cities and a food shortage', 'Free schooling', 'Sports'], 0, 'The Eloi and Morlocks represent classes.', 'The two species grew out of the division between the leisured rich and the laboring poor.'),
  m('35', 4, 3, 'Why is the story told as the Traveller\'s account to dinner guests?', ['It forms a frame story that makes the fantastic tale seem like a report', 'To add a second plot', 'To hide the ending', 'Because it is a letter'], 0, 'It is a story within a story.', 'The frame lets the narrator present the account as testimony from a friend.'),
  tf('35', 5, 2, 'The Time Traveller\'s first theory about the Eloi and Morlocks proves entirely correct.', 1, 'He revises his ideas more than once.', 'He keeps correcting his theories as he learns about the Morlocks.'),

  // Jekyll and Hyde
  m('43', 1, 1, 'What is Dr. Jekyll\'s secret?', ['He creates a potion that turns him into Mr. Hyde', 'He is a spy who secretly works for a foreign power', 'He has a twin', 'He is a ghost'], 0, 'Hyde is not a separate person.', 'Jekyll\'s potion transforms him into the brutal Hyde.'),
  m('43', 2, 1, 'In which city is the story set?', ['London', 'Paris', 'New York', 'Dublin'], 0, 'Think about foggy Victorian streets.', 'The story is set in Victorian London.'),
  m('43', 3, 2, 'What central idea does the novel explore?', ['The good and evil that exist in one person', 'The joy of travel and of exploring foreign lands', 'Politics in the colonies', 'Family inheritance'], 0, 'See the characters\' double lives.', 'The book suggests everyone has a hidden darker side.'),
  m('43', 4, 3, 'Why is the full truth revealed late in the book?', ['It is held back for mystery and told in letters', 'The author simply forgot details and left gaps by chance', 'The narrator is lying', 'It is a dream'], 0, 'Utterson investigates before learning more.', 'Stevenson structures the story as a mystery solved by a lawyer, ending in two written confessions.'),
  m('43', 5, 2, 'Who is the lawyer who investigates the strange case?', ['Mr. Utterson', 'Mr. Pickwick', 'Mr. Darcy', 'Mr. Holmes'], 0, 'He is a friend of Jekyll.', 'Gabriel Utterson, Jekyll\'s lawyer, tries to understand the connection with Hyde.'),

  // The Call of the Wild
  m('215', 1, 1, 'What kind of animal is Buck?', ['A large dog', 'A wolf', 'A horse', 'A bear'], 0, 'He is stolen from a California home.', 'Buck, a St. Bernard-Scotch shepherd mix, is sold into sled-dog work.'),
  m('215', 2, 1, 'During which event is the story set?', ['The Klondike Gold Rush', 'The American Revolution', 'World War I', 'The Dust Bowl'], 0, 'Men need dogs to haul sleds.', 'Gold seekers in the Yukon create demand for strong sled dogs.'),
  m('215', 3, 2, 'What is the central conflict in Buck\'s life?', ['Instinct versus civilization', 'Money versus love', 'Town versus city', 'School versus work'], 0, 'He becomes more wild.', 'Buck\'s ancestral instincts awaken as he leaves civilized life behind.'),
  m('215', 4, 3, 'What does "the law of club and fang" refer to?', ['The harsh rule that strength decides survival', 'A formal law written by the Yukon territorial government', 'A rule for judging the best dogs at a winter dog show', 'A rule about how miners must divide their gold'], 0, 'Buck learns it from a man in a red sweater and from fights.', 'It sums up the brutal world in which only the strong and clever survive.'),
  m('215', 5, 2, 'Who is the kind man Buck loves?', ['John Thornton', 'Hal', 'Perrault', 'Spitz'], 0, 'He rescues Buck from cruel owners.', 'John Thornton saves Buck and earns his deepest loyalty.'),

  // The Jungle Book
  m('236', 1, 1, 'Who raises Mowgli in the jungle?', ['Wolves', 'Tigers', 'Monkeys', 'Elephants'], 0, 'Mother Wolf is Raksha.', 'A wolf pack, with Father Wolf and Mother Wolf, raises him.'),
  m('236', 2, 1, 'Which country is the story set in?', ['India', 'Australia', 'Brazil', 'Kenya'], 0, 'Kipling was born there.', 'The stories are set in the jungles of India.'),
  m('236', 3, 2, 'What is the "Law of the Jungle" mostly about?', ['Rules that all animals must obey to keep order', 'A written law book kept by the rulers of the human village', 'A king\'s decrees', 'Rules of a sport'], 0, 'Baloo teaches it to Mowgli.', 'It is the code that guides animals\' behavior and keeps peace.'),
  m('236', 4, 2, 'What technique makes animals talk and obey laws like people?', ['Personification', 'Simile', 'Hyperbole', 'Irony'], 0, 'Human traits are given to animals.', 'Kipling personifies animals in the story.'),
  m('236', 5, 1, 'Who is the main villain hunting Mowgli?', ['Shere Khan the tiger', 'Baloo the bear', 'Bagheera the panther', 'Kaa the python'], 0, 'He has a limp.', 'Shere Khan wants Mowgli and threatens the wolf pack.'),

  // The Importance of Being Earnest
  m('844', 1, 1, 'What fake name does Jack Worthing use in town?', ['Ernest', 'Algernon', 'Bunbury', 'Cecil'], 0, 'It is in the title.', 'Jack calls himself Ernest in London, which Gwendolen adores.'),
  m('844', 2, 1, 'What does "Bunburying" mean in the play?', ['Inventing a fictional person as an excuse to escape duties', 'Baking buns', 'Gardening', 'Public speaking'], 0, 'Algernon invents an invalid friend.', 'Algernon\'s imaginary friend Bunbury lets him leave town whenever he likes.'),
  m('844', 3, 2, 'What is Wilde mostly satirizing?', ['Victorian respectability and marriage customs', 'Sea voyages and the adventure of faraway lands', 'Political revolution', 'Science'], 0, 'The play is a comedy of manners.', 'The play mocks the strict social rules and hypocrisy of upper-class Victorians.'),
  m('844', 4, 3, 'Lady Bracknell\'s short, witty, twisted sayings are known as:', ['Epigrams', 'Sonnets', 'Soliloquies', 'Allegories'], 0, 'Wilde was famous for them.', 'Epigrams are brief clever statements that turn ideas upside down.'),
  m('844', 5, 2, 'What is the final twist about Jack\'s name?', ['His real name is Ernest after all', 'He is a prince from a foreign royal court', 'He is a spy', 'He has no name'], 0, 'The title now makes sense.', 'It turns out Jack was born Ernest, so he has been truthful by accident.'),

  // The Metamorphosis
  m('5200', 1, 1, 'What does Gregor Samsa discover when he wakes up?', ['He has turned into a giant insect', 'He has lost his job', 'He is locked in prison for a crime he did not do', 'He has become famous'], 0, 'It is the very first line.', 'Gregor wakes to find himself transformed into a monstrous insect.'),
  m('5200', 2, 1, 'What was Gregor\'s job?', ['Traveling salesman', 'Doctor', 'Sailor', 'Teacher'], 0, 'He supports his family.', 'Gregor works as a traveling salesman to pay his parents\' debt.'),
  m('5200', 3, 2, 'What happens to the family\'s attitude toward Gregor over time?', ['They grow more resentful and neglectful', 'They give him a medal for his years of service', 'They send him away to a hospital in the country', 'They treat him like a king and feed him the best food'], 0, 'He is no longer earning.', 'As he can no longer work, the family\'s care turns to disgust and neglect.'),
  m('5200', 4, 3, 'The impossible event is told in a calm, matter-of-fact tone. What effect does that have?', ['It makes the situation more unsettling and absurd', 'It makes the situation purely a light and silly comedy', 'It reveals it is a dream', 'It makes it a news report'], 0, 'Gregor worries about being late for work.', 'The contrast between a bizarre event and ordinary worries is central to Kafka\'s absurdism.'),
  m('5200', 5, 2, 'Which family member at first cares for Gregor and plays violin?', ['His sister Grete', 'His mother', 'His father', 'His aunt'], 0, 'She brings him food at first.', 'Grete feeds Gregor at first and plays the violin, but later turns against him.'),

  // Tom Sawyer
  m('74', 1, 1, 'How does Tom get other boys to whitewash his fence?', ['He makes the work seem like a privilege', 'He pays them a few coins for each board they finish', 'He threatens to tell his aunt unless they paint', 'He tricks them with a clever riddle about the fence'], 0, 'Aunt Polly punishes him with the chore.', 'Tom pretends painting is fun, so the other boys pay him to take a turn.'),
  m('74', 2, 1, 'What river runs near the setting of the story?', ['The Mississippi', 'The Thames', 'The Hudson', 'The Nile'], 0, 'Twain grew up in Hannibal.', 'The fictional St. Petersburg is a Mississippi River town.'),
  m('74', 3, 2, 'Which event does Tom witness in the graveyard?', ['A murder by Injun Joe', 'A funeral of a king', 'A ghost parade in the churchyard', 'A robbery by Huck'], 0, 'Tom and Huck were there to try a cure for warts.', 'They witness Injun Joe kill Dr. Robinson, a secret they struggle to keep.'),
  m('74', 4, 3, 'Twain uses spelling to imitate how characters speak. This is called:', ['Dialect', 'Rhyme', 'Meter', 'Allusion'], 0, 'Huck\'s speech reflects his background.', 'Dialect spelling captures regional and social speech.'),
  m('74', 5, 2, 'Where do Tom and Becky get lost?', ['In McDougal\'s Cave', 'On a steamboat', 'In a cornfield', 'In a big city'], 0, 'It is on a school picnic.', 'They wander through a cave and nearly die before Tom finds a way out.'),

  // The Scarlet Letter
  m('25344', 1, 1, 'What is Hester Prynne forced to wear?', ['A scarlet letter A', 'A black hood', 'A red ribbon', 'A gold cross'], 0, 'It marks her sin.', 'The letter A stands for adultery.'),
  m('25344', 2, 1, 'Where and when is the story set?', ['Puritan Boston in the 1600s', 'Victorian London', 'California during the Gold Rush of the 1800s', 'Paris in the 1700s'], 0, 'It is a strictly religious colony.', 'The story takes place in seventeenth-century Puritan Massachusetts.'),
  m('25344', 3, 2, 'Who is the father of Hester\'s daughter Pearl?', ['Arthur Dimmesdale', 'Roger Chillingworth', 'The governor', 'Hester\'s father'], 0, 'He is the town\'s minister.', 'Dimmesdale keeps his secret while suffering from guilt.'),
  m('25344', 4, 3, 'The scarlet letter takes on new meanings across the story. What technique is this?', ['Symbolism', 'Alliteration', 'Onomatopoeia', 'Hyperbole'], 0, 'One object stands for many ideas.', 'Hawthorne makes the A a shifting symbol from "adulterer" to "able" to "angel".'),
  m('25344', 5, 2, 'What is Roger Chillingworth\'s secret relationship to Hester?', ['He is her long-lost husband', 'He is her father, a stern minister', 'He is her brother, newly come from abroad', 'He is her employer, a rich merchant in town'], 0, 'He hides his identity to take revenge.', 'He is her husband, who arrives in town and torments Dimmesdale.'),

  // The Odyssey
  m('1727', 1, 1, 'Where is Odysseus trying to return?', ['Ithaca', 'Troy', 'Sparta', 'Athens'], 0, 'His wife and son wait there.', 'Odysseus spends ten years trying to return to Ithaca.'),
  m('1727', 2, 1, 'Who waits for Odysseus and fends off suitors?', ['Penelope', 'Helen', 'Circe', 'Calypso'], 0, 'She weaves and unweaves a shroud.', 'Penelope is his faithful wife.'),
  m('1727', 3, 2, 'How does Odysseus escape the Cyclops Polyphemus?', ['He blinds him and gives his name as "Nobody"', 'He pays him with a chest of gold and a herd of cattle', 'He wrestles him', 'He sings to him'], 0, 'A trick with his name is key.', 'He blinds Polyphemus and tells him his name is Nobody, so the other Cyclopes do not help.'),
  m('1727', 4, 3, 'Phrases like "rosy-fingered Dawn" repeated through the poem are called:', ['Epithets', 'Couplets', 'Footnotes', 'Soliloquies'], 0, 'They help oral poets remember lines.', 'Fixed epithets are a hallmark of oral epic.'),
  m('1727', 5, 2, 'Which value is tested when strangers arrive at a home in the poem?', ['Hospitality (xenia)', 'Wealth', 'Speed', 'Education'], 0, 'Good hosts are praised; bad hosts are punished.', 'Many episodes judge characters by how they treat guests.'),

  // The Iliad
  m('6130', 1, 1, 'Whose anger begins the poem?', ['Achilles', 'Hector', 'Odysseus', 'Paris'], 0, 'The first word of the poem is "wrath".', 'The poem opens with the rage of Achilles.'),
  m('6130', 2, 1, 'Which war does the poem cover?', ['The Trojan War', 'The Persian Wars', 'The Punic Wars', 'The Peloponnesian War'], 0, 'It is set in the tenth year.', 'The poem is set late in the Greeks\' ten-year siege of Troy.'),
  m('6130', 3, 2, 'What event makes Achilles return to battle?', ['The death of Patroclus', 'A gift of gold from the Trojan king', 'Orders from Zeus', 'An injury to his heel'], 0, 'He loses a close companion.', 'Hector kills Patroclus, and Achilles fights to avenge him.'),
  m('6130', 4, 3, 'Long comparisons that stretch across many lines, like a warrior compared to a lion, are called:', ['Epic similes', 'Puns', 'Acrostics', 'Haiku'], 0, 'The comparison is extended.', 'Epic similes add scale and imagery to battle scenes.'),
  m('6130', 5, 2, 'What happens when King Priam visits Achilles?', ['Priam begs for Hector\'s body and they share grief', 'They duel to the death a second time outside the city', 'They make peace for good', 'Priam steals Achilles\' armor'], 0, 'It is one of the poem\'s most moving scenes.', 'Achilles returns Hector\'s body to Priam, and both mourn their losses.'),

  // Middlemarch
  m('145', 1, 1, 'Who is the idealistic young woman at the center of the novel?', ['Dorothea Brooke', 'Elizabeth Bennet', 'Becky Sharp', 'Jane Eyre'], 0, 'She marries an older scholar.', 'Dorothea is the main heroine.'),
  m('145', 2, 1, 'What is Middlemarch?', ['A fictional provincial English town', 'A ship sailing to the colonies in the East', 'A war', 'A castle in Scotland'], 0, 'The title is a place.', 'Middlemarch is a Midlands town shown around 1830.'),
  m('145', 3, 2, 'Whom does Dorothea marry first, expecting a life of intellectual purpose?', ['Mr. Casaubon', 'Will Ladislaw', 'Dr. Lydgate', 'Sir James Chettam'], 0, 'He is writing the "Key to All Mythologies".', 'She marries Casaubon and finds the marriage disappointing.'),
  m('145', 4, 3, 'Eliot\'s narrator often steps in to comment on characters and morality. This is called:', ['Omniscient narration', 'First-person narration', 'Stream of consciousness', 'Epistolary form'], 0, 'The narrator knows everyone\'s mind.', 'The narrator knows all and comments on events.'),
  m('145', 5, 3, 'What does the novel suggest about a good life?', ['Many small, unrecorded acts can shape the world', 'Only great deeds by famous leaders really matter in history', 'Wealth ensures happiness', 'Reform is impossible'], 0, 'See the final paragraph on "unhistoric acts".', 'The ending says the growing good of the world depends partly on unhistoric acts.'),

  // Sherlock Holmes
  m('1661', 1, 1, 'Who narrates most of the stories?', ['Dr. Watson', 'Holmes', 'Moriarty', 'Inspector Lestrade'], 0, 'He is Holmes\'s friend and housemate.', 'Dr. John Watson narrates, which keeps Holmes\'s method a mystery.'),
  m('1661', 2, 1, 'What is the address of Sherlock Holmes?', ['221B Baker Street', '10 Downing Street', '1 Fleet Street', '12 Grimmauld Place'], 0, 'It is famous.', 'Holmes and Watson live at 221B Baker Street in London.'),
  m('1661', 3, 2, 'Which method does Holmes emphasize in solving cases?', ['Careful observation and logical deduction', 'Guessing and lucky hunches that happen to pay off', 'Magic', 'Confessions only'], 0, 'He notices small details.', 'Holmes reads small clues such as mud, hands, and clothing.'),
  m('1661', 4, 3, 'A false clue that leads away from the truth is called a:', ['Red herring', 'Metaphor', 'Epigraph', 'Prologue'], 0, 'It is also a fish.', 'A red herring misleads readers and characters.'),
  m('1661', 5, 2, 'In "A Scandal in Bohemia", who outwits Holmes?', ['Irene Adler', 'Moriarty', 'Mrs. Hudson', 'Mycroft'], 0, 'She is "the woman".', 'Irene Adler outsmarts Holmes and is called "the woman" by him.'),

  // The Art of War
  m('17405', 1, 1, 'What does Sun Tzu say is the best way to win?', ['Win without fighting', 'Attack at once', 'Raise a larger army', 'Rely on luck'], 0, 'He prefers to avoid costly battles.', 'He says the supreme art is to subdue the enemy without fighting.'),
  m('17405', 2, 1, 'In which country was the text written?', ['China', 'Greece', 'Japan', 'Persia'], 0, 'It dates from the Warring States and earlier period.', 'The Art of War comes from ancient China.'),
  m('17405', 3, 2, 'What does the text say about knowing yourself and your enemy?', ['Knowing both prevents defeat in a hundred battles', 'It is useless', 'Only the enemy matters', 'Only yourself matters'], 0, 'It is a famous line.', 'Sun Tzu says one who knows both will not be in danger in a hundred battles.'),
  m('17405', 4, 3, 'Short, memorable statements of principle in the book are called:', ['Aphorisms', 'Epics', 'Sonnets', 'Ballads'], 0, 'They read like sayings.', 'The text is made up of concise aphorisms.'),
  m('17405', 5, 2, 'A "feint" in strategy is:', ['A move meant to mislead the opponent', 'A retreat to base', 'A formal surrender', 'A tax on soldiers paid to the generals each year'], 0, 'Deception is a theme.', 'A feint misleads the enemy about your true intent.'),
];
