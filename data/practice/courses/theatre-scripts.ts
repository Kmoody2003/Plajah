import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// [level, prompt, choices (null = true/false), answer, hint, explanation]
type QSpec = [1 | 2 | 3, string, string[] | null, number, string, string];

const QS: Question[] = [];

const lesson = (id: string, title: string, blurb: string, minutes: number, body: string, specs: QSpec[]) => {
  specs.forEach(([level, prompt, choices, answer, hint, explanation], i) => {
    const qid = `${id}.q${i + 1}`;
    if (choices === null) {
      QS.push({ id: qid, lessonId: id, kind: 'tf', prompt, answer: answer as 0 | 1, hint, explanation, level });
    } else {
      // Spread the correct answer across positions by rotating the choices (authored with the answer first).
      const shift = (QS.length * 3 + 1) % choices.length;
      const rotated = choices.map((_, k) => choices[(k - shift + choices.length) % choices.length]);
      const newAnswer = (answer + shift) % choices.length;
      QS.push({ id: qid, lessonId: id, kind: 'mcq', prompt, choices: rotated, answer: newAnswer, hint, explanation, level });
    }
  });
  return { id, title, blurb, minutes, body };
};

const t1 = [
  lesson('theatre-scripts.l01', 'Reading a Play on the Page', 'A script is a blueprint: acts, scenes, dialogue and stage directions.', 6,
`A play script is a blueprint for a performance rather than a finished experience. It is built from a few basic parts. Dialogue is what the characters say to each other, and in a play it does almost all the work, because there is no narrator to explain things. Stage directions are the writer's notes about movement, setting, sound and mood. The plays are divided into acts, which are the big movements of the story, and scenes, which are smaller units usually marked by a change of place or time.

Different writers use these tools very differently. Bernard Shaw's Pygmalion (1913) is a good case: the library's own note observes that Shaw's stage directions are essays, and that reading them shows how to write character on the page. Other writers keep directions to a bare minimum and let the speeches do everything.

Plays are also meant to be sized for the stage. Riders to the Sea (1904) by J. M. Synge is described as a one-act, around twenty minutes in a single room. Others, like the Oresteia, span a whole trilogy. Knowing the parts lets you read any script, from any century, and see how it was put together.`,
  [
    [1, 'In a play script, what are stage directions?', ['The writer\'s notes about movement, setting, sound and mood', 'The lines the characters speak aloud to one another on stage', 'A list of the actors in the cast', 'The price and seating plan of the theatre'], 0, 'They are not spoken by the characters.', 'Stage directions are the writer\'s instructions for how the scene looks and moves, separate from the dialogue.'],
    [1, 'Which part of a play carries most of the storytelling, since there is no narrator?', ['Dialogue', 'The programme', 'The scenery', 'The intermission'], 0, 'Think about what the characters do to each other with words.', 'In a script, characters mostly reveal the story through what they say to one another.'],
    [2, 'Which Shaw play is noted in the library for stage directions that read like essays?', ['Pygmalion', 'Hamlet', 'Riders to the Sea', 'Medea'], 0, 'It is the one about a phonetics professor.', 'The library note on Pygmalion (1913) says Shaw\'s stage directions are essays and worth reading for how to write character.'],
    [3, 'How is a scene usually different from an act?', ['A scene is a smaller unit within the larger movement of an act', 'A scene is always longer than an act', 'A scene has no dialogue', 'A scene is the same thing as a whole trilogy'], 0, 'Think of one as a section and the other as a sub-section.', 'Acts are the big movements of a story, and scenes are smaller units marked by a change of place or time.'],
  ]),
  lesson('theatre-scripts.l02', 'Protagonists and Conflict', 'Every play needs someone who wants something and something in the way.', 7,
`A protagonist is the central character whose wants and choices drive the story. A play becomes dramatic when that character meets conflict: someone or something that stands between them and what they want. The conflict can come from other people, from the world, or from inside the protagonist.

The plays in the library show all three. In Macbeth (c. 1606), a soldier is told he will be king, kills to make it true, and then has to keep killing to stay there; the library calls it the shortest tragedy and the most ruthlessly efficient, with every scene raising the cost. In Hamlet (c. 1600), the prince is told by a ghost that his uncle murdered his father, and the central struggle is that he cannot bring himself to act, so the main conflict is within him.

Corneille's The Cid (1637) is described as the purest dilemma: a young man must avenge his father by killing the father of the woman he loves, and she must then demand his death. Two obligations cannot both be satisfied. Compare this with a mere obstacle. A real bind forces a choice that costs something, and that is what keeps an audience watching.`,
  [
    [1, 'What is a protagonist?', ['The central character whose wants and choices drive the story', 'The person who writes the play', 'The actor who plays the smallest role', 'The audience member who watches closely'], 0, 'Think about who the story follows.', 'The protagonist is the main character whose desires and decisions push the plot forward.'],
    [1, 'In Hamlet, the prince\'s father is described by a ghost as having been what?', ['Murdered by his uncle', 'Drowned at sea during a voyage to England', 'Banished abroad by the king of Norway', 'Turned into a king of the fairies'], 0, 'The ghost has a grievance about the king\'s death.', 'The library blurb says Hamlet is told by his father\'s ghost that his uncle murdered him.'],
    [2, 'Which play is described in the library as the purest dilemma, with two irreconcilable obligations?', ['The Cid', 'Volpone, or The Fox', 'The Tempest', 'Lysistrata'], 0, 'Corneille, 1637.', 'The Cid forces its hero to avenge his father by killing the father of the woman he loves.'],
    [3, 'Why is a dilemma stronger than a simple obstacle in drama?', ['It forces a choice that costs something whichever way the character goes', 'It lets the character avoid choosing', 'It removes the need for dialogue', 'It guarantees a happy ending'], 0, 'Consider what the character loses.', 'A bind between two obligations means every option has a price, which keeps tension high.'],
  ]),
  lesson('theatre-scripts.l03', 'Comedy and Tragedy', 'The two great masks of the theatre and how the library labels each.', 7,
`Western theatre is often described through two masks: tragedy and comedy. Tragedy follows a protagonist toward a fall or catastrophe, usually with heavy consequences. Comedy generally plays with misunderstanding, satire or mistaken identity, and tends to end in resolution rather than ruin.

The library labels its plays accordingly. Sophocles' Theban plays, Medea, Macbeth, Hamlet and King Lear are tragedies. Aristophanes' Lysistrata (411 BCE) and The Frogs (405 BCE) are comedies, labelled in the library as Comedy / Satire. In Lysistrata, the women of warring Greek city-states withhold sex until the men negotiate peace. In The Frogs, Dionysus goes down to the underworld to bring a great playwright back to Athens.

Some plays mix the two: the library lists The Cid as a tragicomedy, and Ibsen's The Wild Duck as a tragicomedy. Romeo and Juliet is labelled Tragedy / Romance, and The Tempest as Romance / Fantasy. Labels are guides rather than boxes. Satire is a related idea: comedy used to criticise people or society. Volpone, Tartuffe and The Inspector-General all use laughter to expose greed or hypocrisy.`,
  [
    [1, 'Which of these is a comedy in the library?', ['Lysistrata', 'Macbeth', 'Medea', 'Antony and Cleopatra'], 0, 'It is by Aristophanes.', 'Lysistrata (411 BCE) is listed as Comedy / Satire; the others are tragedies.'],
    [1, 'What does The Frogs show Dionysus doing?', ['Going to the underworld to bring a great playwright back to Athens', 'Hiding in a farmhouse kitchen', 'Marrying a hermitage-raised woman', 'Climbing a tower'], 0, 'It involves a descent and a contest between playwrights.', 'In The Frogs, Dionysus descends to the underworld and stages a contest between Aeschylus and Euripides.'],
    [2, 'Which pairing of play and label matches the library?', ['The Cid, tragicomedy', 'Macbeth, comedy', 'Lysistrata, tragedy', 'Medea, farce'], 0, 'One label means a blend of two modes.', 'The Cid is labelled a tragicomedy in the library data.'],
    [3, 'What is satire?', ['Comedy used to criticise people or society', 'A play with no dialogue', 'A tragedy about a king who loses his throne by pride', 'A play performed outdoors'], 0, 'Think about Tartuffe and the hypocrite.', 'Satire uses humour to expose greed, hypocrisy or folly, as in Volpone and Tartuffe.'],
  ]),
  lesson('theatre-scripts.l04', 'Soliloquy and Aside', 'How a stage character lets us hear their thoughts.', 6,
`Theatre has no camera to slip inside a character's head, so playwrights invented speech that does the job. A soliloquy is a speech delivered by a character alone, or as if alone, so the audience hears their reasoning. An aside is a brief remark spoken to the audience, or to oneself, that the other characters on stage are not supposed to hear.

The library points to the soliloquy as one of the signature tools of the English Renaissance, a tradition noted for blank verse, the soliloquy and the public playhouse. Its guidance on Hamlet is revealing: it says the play achieves the deepest interior life written for the stage almost entirely through a character talking himself out of things, and advises studying the soliloquies as structure, not poetry. In other words, each speech is a step in the story, not a decoration.

Marlowe's Doctor Faustus (1604) puts a scholar who trades his soul at the centre, and its verse is described as the place where English dramatic verse learned to move at speed. Soliloquy and aside both give the audience private knowledge that characters lack, which creates suspense and intimacy at once.`,
  [
    [1, 'What is a soliloquy?', ['A speech by a character alone that reveals their thoughts to the audience', 'A song sung by the whole chorus', 'A scene change', 'A short intermission'], 0, 'Solo speech.', 'A soliloquy lets the audience hear a character\'s private reasoning.'],
    [1, 'An aside is usually heard by whom?', ['The audience but not the other characters on stage', 'Only the director and the stage manager in the booth', 'Every character on stage', 'Nobody at all'], 0, 'It is a quick whisper outside the scene.', 'An aside is a brief remark meant for the audience while the others on stage are not supposed to hear it.'],
    [2, 'According to the library, how should one study the Hamlet soliloquies?', ['As structure, not just poetry', 'As optional decoration added to the plot', 'Only as comic relief between scenes', 'By skipping them to reach the action'], 0, 'They move the story forward.', 'The library says to study Hamlet\'s soliloquies as structure, not poetry.'],
    [3, 'Why do soliloquies and asides create suspense?', ['They give the audience knowledge that other characters lack', 'They make the play shorter', 'They remove the conflict', 'They replace the stage directions'], 0, 'Think about who knows what.', 'When the audience hears private thoughts the other characters do not, tension and intimacy grow together.'],
  ]),
];

const t2 = [
  lesson('theatre-scripts.l05', 'Greek Tragedy: Where the Form Began', 'Chorus, reversal and recognition in Aeschylus, Sophocles and Euripides.', 8,
`The library's first shelf is Ancient Greece, described as where the form was invented, with the chorus, reversal and recognition. The chorus is a group that comments on the action; reversal is a turn of fortune; recognition is the moment a character learns a crucial truth.

Aeschylus' The House of Atreus, also known as the Oresteia (458 BCE), is the only surviving complete Greek trilogy: Agamemnon, The Libation Bearers and The Furies. It tells of a chain of blood-vengeance that ends only when a court of law is invented to stop it. Sophocles' three Theban plays, Oedipus the King, Oedipus at Colonus and Antigone (c. 441-401 BCE), include a king hunting a murderer who turns out to be himself. The library says Aristotle used Oedipus the King as the worked example in the Poetics.

Euripides' Medea (431 BCE) follows a woman abandoned by Jason for a younger, better-connected bride, who takes a revenge so total it destroys her own future along with his. The library praises how Euripides makes the audience follow every step of the reasoning before the horror lands. These three playwrights set patterns still used today.`,
  [
    [1, 'Which Greek work is the only surviving complete trilogy, according to the library?', ['The Oresteia (The House of Atreus)', 'Medea', 'Lysistrata', 'Prometheus Bound and its two lost sequels'], 0, 'Aeschylus, 458 BCE.', 'The Oresteia is described as the only surviving complete Greek trilogy.'],
    [1, 'Which playwright wrote Medea?', ['Euripides', 'Sophocles of Colonus', 'Aeschylus of Eleusis', 'Aristophanes'], 0, 'The library dates it to 431 BCE.', 'Medea is by Euripides.'],
    [2, 'In Oedipus the King, who is the murderer the king is hunting?', ['Himself', 'His brother-in-law', 'The chorus leader', 'A foreign general'], 0, 'This is the reversal and recognition.', 'The library says the king hunts a murderer who turns out to be himself.'],
    [3, 'What ends the cycle of blood-vengeance in the Oresteia?', ['A court of law is invented', 'The gods destroy the city in anger', 'The chorus leaves', 'An army arrives'], 0, 'It is a civic institution.', 'The trilogy resolves the chain of vengeance when a court of law replaces revenge.'],
  ]),
  lesson('theatre-scripts.l06', 'Greek Comedy: Aristophanes', 'Satire, absurd premises and criticism written as comedy.', 6,
`Greek theatre was not only tragedy. Aristophanes wrote comedies full of satire and absurd ideas, two of which the library hosts. Lysistrata (411 BCE) has a one-line premise: the women of the warring Greek city-states agree to withhold sex until the men negotiate peace. The library calls it the purest demonstration that a comic engine only works if every character takes it completely seriously.

The Frogs (405 BCE) sends the god Dionysus down to the underworld to bring a great playwright back to Athens, and he stages a contest between Aeschylus and Euripides to choose. The library describes this as the first great piece of criticism written as comedy, and says the debate is still among the sharpest arguments about what dialogue is for.

Both plays show that comedy can carry political and artistic arguments. A strong premise, repeated with total commitment, produces escalation, and the audience laughs at the situation while also thinking about a real subject: war in one case, art in the other. The library also tags both as Comedy / Satire, a reminder that satire means criticism through humour.`,
  [
    [1, 'Who wrote Lysistrata?', ['Aristophanes', 'Euripides the tragedian', 'Molière the French comic', 'William Congreve'], 0, 'He also wrote The Frogs.', 'Lysistrata (411 BCE) is by Aristophanes.'],
    [1, 'In Lysistrata, what do the women of the Greek city-states withhold?', ['Sex, until the men negotiate peace', 'Food, until the taxes on the city are lowered', 'Their votes in the assembly', 'Their songs for the festival'], 0, 'It is a protest aimed at ending a war.', 'The women agree to withhold sex until the men make peace.'],
    [2, 'In The Frogs, whom does Dionysus want to bring back to Athens?', ['A great playwright', 'A famous general from the war', 'A lost child', 'A king'], 0, 'He holds a contest in the underworld.', 'He goes to the underworld to bring back a great playwright, choosing between Aeschylus and Euripides.'],
    [3, 'What does the library say about how a comic premise like Lysistrata works?', ['Every character must take it completely seriously', 'The characters must joke about it constantly', 'It works best with no plot', 'It needs a tragic ending'], 0, 'Think about commitment.', 'The library says a comic engine only works if every character takes it completely seriously.'],
  ]),
  lesson('theatre-scripts.l07', 'Classical India: Rasa and Sakoontala', 'Sanskrit drama organised around emotional flavour rather than conflict.', 6,
`Not every theatre tradition is built around conflict. The library's Classical India shelf notes Sanskrit drama and the rasa tradition. Rasa means the emotional flavour that an audience is meant to taste in a scene, and the library says Sanskrit drama builds around rasa rather than conflict, so reading it recalibrates what a scene can be organised around.

The work in the library is Sakoontala; or, The Lost Ring by Kalidasa, dated c. 4th-5th century CE and read here in Monier Williams' 19th-century English translation. Its genre is Romance. A king falls in love with a woman raised in a hermitage, then forgets her entirely under a curse, until a ring is recovered from a fish.

The plot uses a physical object, the ring, as the hinge of the story, a technique also noted in other plays like Wilde's Lady Windermere's Fan. Reading it beside Greek tragedy shows how different the goals can be: Aristotle's reversal and recognition on one side, an emotional flavour on the other. A writer can learn that a scene need not be a fight to be dramatic. It can aim to create a mood the audience will feel.`,
  [
    [1, 'What does rasa mean in Sanskrit drama?', ['The emotional flavour an audience is meant to taste', 'The name given to the raised stage used in a royal temple court', 'The number of acts a play must be divided into by law', 'A type of costume worn by the lead dancer in the court'], 0, 'Think taste.', 'Rasa is the emotional flavour that Sanskrit drama is built around.'],
    [1, 'Who wrote Sakoontala; or, The Lost Ring?', ['Kalidasa', 'Sophocles', 'Henrik Ibsen', 'John Gay, the ballad opera author'], 0, 'A Sanskrit playwright.', 'The library credits Kalidasa, in Monier Williams\' translation.'],
    [2, 'What object brings the king\'s memory back in Sakoontala?', ['A ring recovered from a fish', 'A sword given by the old king', 'A letter carried by a messenger from the court', 'A crown passed down through the royal line'], 0, 'It is in the title.', 'A ring found in a fish ends the effect of the curse.'],
    [3, 'How does the library say Sanskrit drama differs from conflict-driven drama?', ['It builds around emotional flavour, rasa, rather than conflict', 'It has no characters', 'It is always a tragedy', 'It uses only monologues'], 0, 'Reading it changes what a scene can be built around.', 'The library says it recalibrates what a scene can be organised around: rasa instead of conflict.'],
  ]),
  lesson('theatre-scripts.l08', 'The English Renaissance Stage', 'Blank verse, public playhouses and the great plays of Marlowe, Shakespeare, Jonson and Webster.', 8,
`The English Renaissance shelf is noted for blank verse, the soliloquy and the public playhouse. It is the largest tradition in the library. Christopher Marlowe's The Tragical History of Doctor Faustus (1604) is the study of a protagonist who gets exactly what he asked for; his scholar trades his soul for twenty-four years of power and knowledge.

William Shakespeare is represented by Romeo and Juliet (c. 1595), A Midsummer Night's Dream (c. 1595), Hamlet (c. 1600), Macbeth (c. 1606), King Lear (c. 1606) and The Tempest (c. 1611). The library notes that The Tempest observes the classical unities almost exactly, one place and one day, and that A Midsummer Night's Dream braids four plots so cleanly you never lose one. King Lear is praised for its double plot.

Ben Jonson's Volpone (1606) follows a rich Venetian who fakes an illness so heirs shower him with gifts. John Webster's The Duchess of Malfi (c. 1614) is a revenge tragedy of Jacobean darkness. Together these works show how the stage could hold comedy, tragedy, romance and satire at once, in the same decades and often in the same theatres.`,
  [
    [1, 'Which play is by Christopher Marlowe?', ['Doctor Faustus', 'Volpone, or The Fox', 'Macbeth, Thane of Cawdor', 'The Duchess of Malfi'], 0, 'A scholar trades his soul.', 'The Tragical History of Doctor Faustus is Marlowe\'s.'],
    [1, 'Which of these Shakespeare plays does the library date to c. 1611?', ['The Tempest', 'Romeo and Juliet', 'Hamlet', 'A Midsummer Night\'s Dream'], 0, 'It is a romance set on an island.', 'The library dates The Tempest to c. 1611, the latest of the group.'],
    [2, 'Who wrote Volpone, dated 1606 in the library?', ['Ben Jonson', 'John Webster', 'William Congreve', 'Molière'], 0, 'A rich Venetian fakes an illness.', 'Volpone; or, The Fox is by Ben Jonson.'],
    [3, 'What does the library say about The Tempest and the classical unities?', ['It observes them almost exactly: one place, one day', 'It breaks them completely', 'It uses ten locations', 'It spans many years and takes place in several countries'], 0, 'Tight constraints.', 'The library says the play keeps one place and one day, showing constraints can concentrate a story.'],
  ]),
  lesson('theatre-scripts.l09', 'Classicism and Comedy of Manners', 'Spanish, French and English plays from 1635 to 1777.', 8,
`From the 1600s to the 1700s, the library follows two shelves that came after the Renaissance. Continental Classicism covers the Spanish Golden Age and French neoclassical tragedy. Calderon's Life Is a Dream (1635) has a prince imprisoned since birth on the strength of a prophecy. Corneille's The Cid (1637), Moliere's Tartuffe (1664) and Racine's Phaedra (1677) represent the French stage; Tartuffe does not appear until Act III, and the first two acts are all about him.

The Restoration and Georgian shelf is about English comedy of manners at its sharpest. Congreve's The Way of the World (1700) features a proviso scene in which a couple negotiate the terms of their marriage. John Gay's The Beggar's Opera (1728) stages highwaymen and thief-takers as an opera with popular tunes instead of arias. Goldsmith's She Stoops to Conquer (1773), Sheridan's The Rivals (1775) and The School for Scandal (1777) are comedies built on misunderstanding, disguise and gossip.

Taken together, these plays show how comedy of manners uses wit and social rules to expose vanity, and how character can be built before an entrance.`,
  [
    [1, 'Who wrote Tartuffe?', ['Moliere', 'Jean Racine', 'Pierre Corneille', 'Pedro Calderon'], 0, 'French comedy, 1664.', 'Tartuffe; or, The Hypocrite is by Moliere.'],
    [1, 'Which play is by Sheridan?', ['The School for Scandal', 'Phaedra', 'The Importance of Being Earnest', 'The Beggar\'s Opera'], 0, 'It was first performed 1777.', 'The School for Scandal is by Richard Brinsley Sheridan.'],
    [2, 'In Tartuffe, when does the title character first appear, according to the library?', ['Act III', 'Act I', 'Act V', 'In the Prologue'], 0, 'The first two acts are all about him.', 'The library says Tartuffe does not appear until Act III.'],
    [3, 'What does the library say about the form of The Beggar\'s Opera?', ['Its songs use popular tunes rather than arias', 'It has no music because the stage rules forbade any singing', 'It is a single long monologue delivered by one actor', 'It is a silent play performed only through gesture and dance'], 0, 'It is a ballad opera.', 'The Beggar\'s Opera is a ballad opera: highwaymen and thief-takers staged with popular tunes.'],
  ]),
];

const t3 = [
  lesson('theatre-scripts.l10', 'Ibsen and the Realist Stage', 'When the living room became the battlefield.', 7,
`The library describes its Ibsen shelf as modern realism, where the living room becomes the battlefield. Henrik Ibsen's plays set ordinary people in ordinary rooms and let hidden truths surface. A Doll's House (1879) follows a wife who forged a signature years ago to save her husband's life and discovers what he thinks of her when it comes out. The library calls it the play that made modern drama modern, noting that its last sound, a door closing, is the most famous ending beat in theatre.

Ghosts (1881) begins after the catastrophe, and the plot is the excavation of it, which the library calls Ibsen's retrospective method. An Enemy of the People (1882) is the template for every whistleblower story: a doctor discovers that the spa baths are contaminated and finds the town would rather he hadn't. The Wild Duck (1884), Hedda Gabler (1891) and The Master Builder (1892) complete the shelf.

The lesson is that suspense can come from a slow-released secret rather than a duel. Realism trusts the audience to find the drama in what a family does not say as much as in what it says.`,
  [
    [1, 'Which play ends with the famous sound of a door closing?', ['A Doll\'s House', 'Ghosts', 'Hamlet', 'The Importance of Being Earnest'], 0, 'A wife forged a signature.', 'The library notes the door closing at the end of A Doll\'s House.'],
    [1, 'Which Ibsen play is the template for every whistleblower story?', ['An Enemy of the People', 'Hedda Gabler', 'The Master Builder', 'Ghosts'], 0, 'A doctor finds contaminated baths.', 'In An Enemy of the People a doctor reveals the spa baths are contaminated.'],
    [2, 'What does the library call Ibsen\'s method in Ghosts?', ['Retrospective: the play begins after the catastrophe', 'Epic: it follows a family across a century and several wars', 'Musical: it relies on songs', 'Symbolist: it has no plot'], 0, 'Think excavation.', 'The plot of Ghosts is the digging up of something that already happened.'],
    [3, 'Which year is A Doll\'s House dated to in the library?', ['1879', '1891', '1904', '1920'], 0, 'Ibsen\'s earliest of these titles.', 'The library lists A Doll\'s House as 1879.'],
  ]),
  lesson('theatre-scripts.l11', 'Chekhov, Gogol and the Russian Stage', 'Subtext, ensemble and the drama of what is not said.', 7,
`The library describes the Russian stage as the home of subtext, ensemble and the drama of what is not said. Subtext is the meaning beneath the words, so what characters say differs from what they want.

Nikolai Gogol's The Inspector-General (1836) is a satire in which a corrupt provincial town mistakes a penniless clerk for a government inspector travelling incognito and bribes him lavishly. The library notes its closing silent tableau, proof that a play can land its hardest blow with no dialogue at all.

Anton Chekhov is the master of subtext. The Sea-Gull (1896) sets a young writer, his actress mother, her famous lover and a girl who wants to be an actress on a country estate. The library calls it the founding text of subtext: nobody says what they mean and the play is entirely legible anyway. Uncle Vanya (1897) is a play in which the violent act fails and everyone goes back to work. His second collected series includes The Cherry Orchard and Three Sisters as well as farces like The Bear, The Proposal and The Wedding.

Maxim Gorky's The Lower Depths (1902) is an ensemble play with no protagonist, set in a cellar flophouse, where residents argue whether a comforting lie is better than the truth.`,
  [
    [1, 'What is subtext?', ['The meaning beneath the words characters say', 'Text printed at the bottom of a page of the script as notes', 'A list of props', 'The title of a play'], 0, 'Say one thing, mean another.', 'Subtext is what characters really mean or want beneath their spoken words.'],
    [1, 'Which play features a town that mistakes a clerk for a government inspector?', ['The Inspector-General', 'The Marriage of Figaro', 'The Lower Depths', 'Uncle Vanya'], 0, 'Gogol, 1836.', 'In The Inspector-General a provincial town bribes a penniless clerk it takes for an inspector.'],
    [2, 'Which play does the library call the founding text of subtext?', ['The Sea-Gull', 'The Master Builder', 'Salome', 'Hedda Gabler'], 0, 'Chekhov, 1896.', 'The library says The Sea-Gull is the founding text of subtext.'],
    [3, 'What is notable about Gorky\'s The Lower Depths, according to the library?', ['It is an ensemble play with no protagonist that never loses focus', 'It has a single speaker', 'It was written in verse by Shakespeare', 'It has no setting'], 0, 'It takes place in a flophouse cellar.', 'The library calls it an ensemble with no protagonist that holds focus, a model for many voices in one place.'],
  ]),
  lesson('theatre-scripts.l12', 'Wilde and Shaw: Dialogue as Spectacle', 'The most quotable dialogue in English.', 7,
`The library's Wilde and Shaw shelf is described as the most quotable dialogue in English. Oscar Wilde's The Importance of Being Earnest (1895) has two men each invent a fictitious relative to escape their obligations. The library says almost every line is both a joke and a plot move, and calls it the most efficiently funny script in English. Lady Windermere's Fan (1892) uses a physical object, the fan, as the plot's spine. Salome (1893) is the opposite: Wilde with the wit removed, incantatory and repetitive, a distinct dialogue register carrying a one-act on rhythm.

Bernard Shaw writes plays of ideas. Arms and the Man (1894) is a comedy built by puncturing the genre it lives in. Caesar and Cleopatra (1898) is a deliberate anti-epic. Man and Superman (1903) inserts a dream sequence in hell into the third act of a romantic comedy. Major Barbara (1905) is called the great argument play, scrupulously fair to the side it disagrees with. Pygmalion (1913) is the origin of the makeover story, with stage directions that read as essays.

Both men show that dialogue can be plot, character and argument at once.`,
  [
    [1, 'Which play has two men each inventing a fictitious relative?', ['The Importance of Being Earnest', 'Major Barbara', 'Salome', 'Pygmalion'], 0, 'Oscar Wilde, 1895.', 'The Importance of Being Earnest is built on those invented relatives.'],
    [1, 'Which Shaw play is the origin of the makeover story?', ['Pygmalion', 'Man and Superman', 'Arms and the Man', 'Caesar and Cleopatra'], 0, 'A flower girl is passed off as a duchess.', 'Pygmalion (1913) is described as the origin of the makeover story.'],
    [2, 'What object is the spine of Lady Windermere\'s Fan?', ['A fan', 'A ring', 'A letter', 'A key'], 0, 'It is in the title.', 'The library says everything turns on where the fan is and who saw it there.'],
    [3, 'What does the library say about Salome compared with Wilde\'s comedies?', ['It has the wit removed and relies on rhythm and repetition', 'It is a farce', 'It is longer than Earnest', 'It was written by Shaw'], 0, 'Think incantatory.', 'Salome is called Wilde with the wit removed, hypnotic and repetitive.'],
  ]),
  lesson('theatre-scripts.l13', 'One-Acts, Irish Voices and the American Stage', 'Short forms, vernacular speech and the arrival of American drama.', 8,
`The last shelves show how theatre kept reinventing itself in the early twentieth century. J. M. Synge's Riders to the Sea (1904) is arguably the most perfect one-act in English: a mother who has lost her husband and sons to the sea on the Aran Islands loses the last of them. His The Playboy of the Western World (1907) is a comedy about a young man celebrated for claiming to have killed his father. W. B. Yeats's Cathleen ni Houlihan, in the 1908 collection The Unicorn from the Stars, turns an old woman into Ireland.

The American stage is called the birth of a native dramatic voice. Susan Glaspell's Trifles (1916-1920) tells a murder story through props in a farmhouse kitchen while the accused never appears. Angelina Weld Grimke's Rachel (1916) is noted as one of the first plays by a Black American woman to be professionally staged. Eugene O'Neill's Beyond the Horizon (1920) was his first Pulitzer, and Anna Christie (1921) builds to a confession scene.

Luigi Pirandello's Six Characters in Search of an Author is the founding text of metafiction on stage, in which unfinished characters interrupt a rehearsal.`,
  [
    [1, 'Which play is described as arguably the most perfect one-act in English?', ['Riders to the Sea', 'Trifles', 'Rachel', 'Beyond the Horizon'], 0, 'Synge, set on the Aran Islands.', 'The library calls Riders to the Sea arguably the most perfect one-act in English.'],
    [1, 'Which playwright wrote Trifles?', ['Susan Glaspell', 'Eugene O\'Neill', 'Maxim Gorky', 'W. B. Yeats'], 0, 'A murder is solved with props in a kitchen.', 'Trifles is by Susan Glaspell.'],
    [2, 'In Pirandello\'s Six Characters in Search of an Author, what do the characters demand?', ['That their story be completed', 'That the theatre be closed', 'That the audience leave the theatre at once', 'That the play be translated'], 0, 'They interrupt a rehearsal.', 'The six unfinished characters demand that their story be completed.'],
    [3, 'Which statement about Rachel matches the library?', ['It is noted as one of the first plays by a Black American woman to be professionally staged', 'It is a Greek comedy', 'It is a Sanskrit romance', 'It was written by Eugene O\'Neill'], 0, 'Angelina Weld Grimke.', 'The library says Rachel is one of the first plays by a Black American woman to be professionally staged.'],
  ]),
];

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'theatre-scripts',
    label: 'Theatre and Scripts',
    blurb: 'How plays work, from acts and soliloquies to conflict and comedy, taught through the public-domain scripts in the library.',
    accent: '#e23b6d',
    framework: 'ncas',
    tracks: [
      { id: 'theatre-scripts.t1', title: 'How a Play Works', blurb: 'The parts of a script, the people in it and the voices on stage.', level: 'FOUNDATION', lessons: t1 },
      { id: 'theatre-scripts.t2', title: 'Theatre Through the Ages', blurb: 'From Athens and classical India to Renaissance England and the age of comedy.', level: 'INTERMEDIATE', lessons: t2 },
      { id: 'theatre-scripts.t3', title: 'The Modern Stage', blurb: 'Realism, subtext, wit and the short forms of the early twentieth century.', level: 'ADVANCED', lessons: t3 },
    ],
  },
  bank: { curriculumId: 'theatre-scripts', questions: QS },
};
