import { mcq, type CoursePart } from '../../courseKit';

type Pos = 0 | 1 | 2 | 3;
// right answer is listed first; `pos` is where it lands among the four choices
const q = (l: string, n: number, lvl: 1 | 2 | 3, prompt: string, pos: Pos, c: [string, string, string, string], hint: string, expl: string) => {
  const w = c.slice(1);
  const arr = [...w.slice(0, pos), c[0], ...w.slice(pos)] as [string, string, string, string];
  return mcq(l, n, lvl, prompt, arr, pos, hint, expl);
};

export const PART: CoursePart = {
  track: {
    id: 'law-g35.t4',
    title: 'Promises, Property and Kids\' Rights',
    blurb: 'What a contract is, who owns what, how sharing works, and the rights that belong to children.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'law-g35.l13',
        title: 'Promises and Contracts',
        blurb: 'A contract is a promise that the law will help to enforce.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'contract basics' }],
        body: `A promise is when you say you will do something. Keeping promises is part of being trustworthy. Some promises are so important that the law gets involved. A contract is an agreement between two or more people that the law will enforce. That means a court can step in if someone does not do what they agreed.

Here is a simple example. Sam agrees to mow Mr. Lopez's lawn on Saturday, and Mr. Lopez agrees to pay Sam twenty dollars. Each person has promised something, and each is getting something in return. That give-and-take is a key part of most contracts.

Contracts have a few main ingredients.
- First, there is an offer: "I will mow your lawn for twenty dollars."
- Second, there is an acceptance: "Yes, I agree."
- Third, both sides give something of value, such as work, money or goods.
- Fourth, both sides must truly agree, without being tricked or forced.

Many contracts do not have to be written down, but writing them down helps. Everyone can read the same terms and remember what was agreed. Some kinds of contracts must be in writing to be enforced.

If one person breaks a contract, we call it a breach. A court may order the person to pay money to make up for the harm. Often people try to work out the problem first by talking.

The best contracts are clear and fair. Before agreeing to something big, it is wise to read it carefully and ask questions.`,
      },
      {
        id: 'law-g35.l14',
        title: 'Agreeing Fairly: Kids and Contracts',
        blurb: 'Why clear, honest agreements matter, and how the law treats children.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'minors and contracts' }, { kind: 'concept', ref: 'consent and fairness in agreements' }],
        body: `A contract only works if people really agree. If someone is tricked, forced, or does not understand what they are agreeing to, the agreement may not be fair, and a court might not enforce it.

Imagine a shop tells you a toy is brand new, but it is actually used and broken. You agreed because of something untrue. In such cases, the law often lets the person who was misled undo the deal.

The law also pays special attention to children. Children are still learning, and adults could take advantage of them. In many states, a contract made by a child under eighteen can usually be cancelled by the child, though the details differ from state to state. There are exceptions for some things, such as basic needs. This is not a license to be unfair. It is a protection, so that younger people are not tied to deals they could not fully understand.

That is why a parent or guardian usually signs for important things on behalf of a child, such as a phone plan, a school trip form, or a sports team sign-up.

Online agreements count too. When you see "I agree to the terms" on a website or an app, that is a kind of contract. Very few people read all the words, but it can matter. If you are a child, ask a grown-up to read it with you before you click.

A good habit: if an agreement seems confusing, pressures you to hurry, or asks you to keep it secret, stop and talk to a trusted adult.`,
      },
      {
        id: 'law-g35.l15',
        title: 'Property and Sharing',
        blurb: 'Owning, borrowing, renting and using shared things like parks and libraries.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'property ownership' }, { kind: 'concept', ref: 'copyright basics' }],
        body: `Property is anything that can be owned. Some property is a thing you can touch, like a bike, a house or a book. This is called physical property. Some property is an idea or creation, like a song, a story or a drawing. This is sometimes called intellectual property.

Private property belongs to a person or a company. The owner usually gets to decide how it is used. If you own a bike, you can ride it, lend it, sell it or give it away. Other people need your permission to use it. Taking someone's property without permission is theft.

Property can also be rented. When a family rents an apartment, they pay money to the owner to live there for a time. They do not own it, so they must follow the rental agreement and take care of the place.

Some property is public. A city park, a public library and a sidewalk belong to everyone, and are paid for by the community through taxes. Public property comes with rules so that everyone can enjoy it, such as returning library books on time and not harming the playground.

Some property is shared by a group, such as the toys in a classroom. Sharing works best when everyone takes care of the items and takes turns.

Creations have rules too. If you write a story, the law gives you certain rights over it. This is called copyright. It generally means other people need your permission before they copy and sell your story. This is also why we give credit when we use someone else's words, and why we do not hand in another person's work as our own.

Respecting property, whether it is private, public or shared, is part of getting along in a community.`,
      },
      {
        id: 'law-g35.l16',
        title: 'The Rights of Children',
        blurb: 'Children have rights that protect their safety, learning, voices and families.',
        minutes: 7,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'children\'s rights' },
          { kind: 'case', ref: 'In re Gault|1967|US' },
          { kind: 'concept', ref: 'compulsory education' },
        ],
        body: `Children are people, and people have rights. Because children are young and still growing, they also need extra care and protection. The law tries to do both: it protects children and it listens to them.

Here are some important ones. Children have a right to be safe from harm. Grown-ups who hurt or neglect children are breaking the law, and there are people whose job is to help, such as teachers, doctors and child protection workers. If a child is not safe, telling a trusted adult is the right step.

Children have a right to learn. In every state, children must go to school until a certain age, and public schools are open to all children. Children with disabilities have special rights in the United States to the help they need to learn, under a law called the Individuals with Disabilities Education Act.

Children have a right to be treated fairly by the law. If a child is accused of breaking the law, the case usually goes to juvenile court, and in a 1967 case called In re Gault the Supreme Court said children there have important fairness rights, such as being told the charges and getting a lawyer.

Children also have a right to have their voices heard. In school, students may share their views in respectful ways. Courts and agencies often listen to a child's wishes about their own lives, especially as the child gets older.

Children also have responsibilities, like going to school, respecting others, and following safety rules. As children grow, the law gives them more freedom and more choices. At eighteen, a person is an adult for most legal purposes, including voting, though some ages differ by state and by activity.`,
      },
    ],
  },
  questions: [
    q('law-g35.l13', 1, 1, 'In the law, what is a contract?', 3, ['An agreement between people that the law will enforce', 'A list of rules posted on the wall of a classroom', 'A speech that a leader gives on a day of celebration', 'A wish that someone keeps secret from everyone else'], 'Think of a promise that a court can step in on.', 'A contract is an agreement that a court can enforce. Each side usually gives something of value.'),
    q('law-g35.l13', 2, 2, 'Sam agrees to mow a lawn and the owner agrees to pay twenty dollars. What makes this a typical contract?', 1, ['Each person promises something and gets something in return', 'Only one person promises something and the other just watches', 'Both people have said that they will think about it someday', 'Neither person has said what they will do or what they will get'], 'Look for the give-and-take.', 'Most contracts have an exchange: work for money. Each side gives something of value.'),
    q('law-g35.l13', 3, 1, 'What do we call it when someone breaks a contract?', 2, ['A breach', 'An override', 'A precedent', 'A mediation'], 'The word sounds like a gap or break.', 'Breaking a contract is called a breach. A court may order money to make up for the harm.'),
    q('law-g35.l13', 4, 3, 'A friend says, "A contract only counts if it is written." What is the best response?', 0, ['Many need not be written, but writing helps everyone remember', 'No contract of any kind could ever be written in any way', 'A contract only counts if one side does not understand it', 'Written contracts matter only for people who are over a hundred'], 'Think about both parts: not required, but helpful.', 'Many agreements are valid without writing, but a few kinds must be written. Written terms help avoid confusion later.'),
    q('law-g35.l14', 1, 1, 'Why might a court refuse to enforce an agreement?', 1, ['One person was tricked or forced into agreeing', 'Both people had agreed to it on a sunny afternoon', 'The agreement was spoken in a quiet voice at the time', 'The people shook hands when they said it was settled'], 'A real agreement needs real consent.', 'An agreement must be freely made. If someone was tricked or forced, the law may not enforce it.'),
    q('law-g35.l14', 2, 2, 'Why does the law often let children cancel contracts they make?', 3, ['To protect young people from deals they might not fully understand', 'To let children make new deals without ever being held to them', 'To stop adults from ever making agreements with anyone again', 'To make sure that children do not need to go to school at all'], 'It is a protection, not a trick.', 'In many states, minors can usually cancel contracts, which protects them from being taken advantage of. The details differ by state.'),
    q('law-g35.l14', 3, 2, 'You see an app that says "I agree to the terms." What is a wise step for a child?', 0, ['Ask a grown-up to read it with you before clicking', 'Click quickly because nobody ever has to follow terms', 'Click and then delete the app so that the deal is ended', 'Share the app\'s password with friends to see what happens'], 'Online agreements can matter.', 'Clicking to agree can be a kind of contract. Reading it with a trusted adult helps you understand what you are agreeing to.'),
    q('law-g35.l14', 4, 3, 'An agreement pressures you to hurry and to keep it secret. What is the best action?', 2, ['Stop and talk to a trusted adult before agreeing', 'Agree right away so that you do not miss out on it', 'Agree, but promise yourself that you will never tell anyone', 'Ask the person who is pressuring you to decide for you'], 'Pressure and secrecy are warning signs.', 'Pressure and secrecy are signs that an agreement may not be fair. A trusted adult can help you decide.'),
    q('law-g35.l15', 1, 1, 'Which of these is an example of public property?', 1, ['A city park that is paid for by the community', 'A bike that belongs to a single person', 'A secret recipe owned by a small bakery', 'A phone that a family has bought for a child'], 'Public property is for everyone.', 'Parks, libraries and sidewalks are public. They belong to the community and are paid for by taxes.'),
    q('law-g35.l15', 2, 2, 'A family rents an apartment. What does that mean?', 3, ['They pay the owner to live there for a time, but they do not own it', 'They own the apartment fully and may sell it without asking', 'They may take the apartment away from the owner at any time', 'They do not need to follow the rules in any rental agreement'], 'Renting means using, not owning.', 'Renters pay to use a place for a time and must follow the rental agreement. The owner keeps ownership.'),
    q('law-g35.l15', 3, 2, 'Why do we give credit when we use someone else\'s words in a report?', 0, ['It respects the creator\'s work and is honest about where ideas came from', 'It means the words now belong to the person who copied them', 'It allows the report to be much longer than the teacher wants', 'It lets you avoid reading the real book that the words came from'], 'Creations can be property too.', 'Creations are a kind of property. Giving credit is honest and respects the creator\'s rights, including copyright.'),
    q('law-g35.l15', 4, 3, 'Which statement about owning a bike is correct?', 2, ['The owner can lend or sell it, and others need permission', 'Anyone who sees the bike may use it as long as they bring it back', 'The owner may use the bike but may never lend it to another person', 'Only the government may decide when a bike is ridden by anyone'], 'Owners get to decide how their property is used.', 'Ownership gives control over use, so others need permission. Taking property without permission is theft.'),
    q('law-g35.l16', 1, 1, 'Which of these is a right that children have?', 2, ['To be safe from harm', 'To skip school on any day', 'To choose the laws of the state', 'To be paid by the government'], 'Think about protection.', 'Children have a right to be safe from harm. School is required, and children do not make state laws.'),
    q('law-g35.l16', 2, 2, 'What did the Supreme Court say in In re Gault (1967) about children accused of crimes in juvenile court?', 0, ['They have key fairness rights, like notice of charges and a lawyer', 'They have no rights of any kind because they are not yet adults', 'They must be tried by a jury of other children and nobody else', 'They must be treated exactly like adults, with no special court'], 'The case gave children fairness protections.', 'Gault held that children in juvenile court have key due process rights like notice of the charges and a lawyer.'),
    q('law-g35.l16', 3, 2, 'Why does the law both protect children and listen to them?', 1, ['Children need care, but they are also people with their own views', 'Children cannot ever have views, so listening to them is only a game', 'Children should be in charge of every decision about their lives', 'Protection is only for adults and listening is only for children'], 'There are two ideas to balance.', 'The law balances protection, because children are young, with respect for children as people whose views matter.'),
    q('law-g35.l16', 4, 3, 'A child is not safe at home and tells a trusted adult. Which statement best explains why that is the right step?', 3, ['Teachers and child protection workers can help keep children safe', 'Children are expected to solve every problem of safety by themselves', 'Telling an adult will get the child into trouble for speaking up', 'Only a judge may ever hear a child say that they are unsafe'], 'Think about whose job it is to help.', 'Telling a trusted adult connects a child with people whose job is to help. A child is never in trouble for telling.'),
  ],
};
