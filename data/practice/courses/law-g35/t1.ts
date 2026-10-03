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
    id: 'law-g35.t1',
    title: 'Rights and Responsibilities',
    blurb: 'What a right is, what a responsibility is, and how the two go together.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'law-g35.l01',
        title: 'What Is a Right?',
        blurb: 'A right is something every person is free to do or is owed, just for being a person.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'meaning of rights' }, { kind: 'concept', ref: 'rights versus privileges' }],
        body: `A right is something that people are free to do, or are owed, because they are people. You do not have to earn it by being good or by being popular. Nobody can take it away just because they feel like it.

Here are some rights that people in the United States have. You may believe what you like and say what you think. You may practice a religion, or no religion. You may gather peacefully with other people. If someone accuses you of a crime, you are allowed a fair trial. These rights are written in the Constitution and in its first ten amendments, which are called the Bill of Rights.

A right is different from a privilege. A privilege is something extra that a person may be allowed to do, and it can be taken back. Staying up late on a weekend might be a privilege your family gives you. A right is stronger. A government may only limit a right for very good reasons, and usually it must follow fair steps first.

Rights also have limits. Your right to swing your arms ends where another person's nose begins. Your freedom to speak does not mean you can say anything at all with no care for what it does to other people. Rights have to fit together so that everyone can have them.

When we say "everyone has rights," we mean you, your neighbor, and the person you disagree with.`,
      },
      {
        id: 'law-g35.l02',
        title: 'Responsibilities: The Other Half',
        blurb: 'Rights work best when people also do their part.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'civic responsibility' }],
        body: `A responsibility is a job or duty that you are expected to do. Rights and responsibilities go together, like two sides of a coin.

Think about a school library. Everyone has the right to borrow books. But that only works if everyone also has the responsibility to bring the books back and to take good care of them. If nobody returned books, the shelves would soon be empty, and nobody could use the library.

Some responsibilities are about the law. For example, adults in the United States must pay taxes, and drivers must obey traffic laws. People who are called for jury duty must go and listen carefully. Some responsibilities are not written in laws, but good citizens try to meet them anyway. These include being honest, helping a neighbor, voting when you are old enough, and respecting other people's rights.

Children have responsibilities too. You might be responsible for doing your schoolwork, for treating classmates kindly, and for following the safety rules of your school. These are real jobs, and they are part of how a group stays fair.

Here is a helpful way to think. When you use a right, ask: "Am I also respecting the rights of others?" When you hold a responsibility, ask: "Who is counting on me to do this?"`,
      },
      {
        id: 'law-g35.l03',
        title: 'Equal Treatment',
        blurb: 'The idea that the law should treat people fairly and the same way.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'equal protection' },
          { kind: 'case', ref: 'Brown v. Board of Education|1954|US' },
        ],
        body: `One of the biggest ideas in American law is equal treatment. It means that the law should not treat people worse because of who they are, such as their skin color, their religion, or whether they are a boy or a girl.

This idea took a long time to become real. For many years, some places in the United States kept Black children and white children in separate schools, and the schools for Black children were often given much less. In 1954, in a case called Brown v. Board of Education, the Supreme Court said that separate public schools for children of different races were unequal and not allowed. That decision helped lead to changes across the country, though the changes took many years.

The Constitution has a part called the Fourteenth Amendment. It says that states must give everyone "equal protection of the laws." That is where the idea of equal treatment gets some of its strength.

Equal treatment does not always mean everyone gets exactly the same thing. A school can add a ramp for a student who uses a wheelchair. That is not unfair to anyone. It gives that student the same chance to get into the building as everybody else.

You can see equal treatment in small ways too. A fair teacher uses the same rules for every child in the room.`,
      },
      {
        id: 'law-g35.l04',
        title: 'Freedom to Speak and to Believe',
        blurb: 'Why people may share ideas, even ones we dislike, and where the limits are.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'First Amendment freedoms' },
          { kind: 'case', ref: 'Tinker v. Des Moines Independent Community School District|1969|US' },
        ],
        body: `The First Amendment to the Constitution protects several freedoms. People may speak and write what they think. They may practice a religion or none. They may gather peacefully, ask the government to fix problems, and share news and opinions in the press.

Why are these freedoms so important? A country where people can share ideas can find its mistakes and fix them. A person who is afraid to disagree cannot help make things better. Free speech also means that you may hear ideas you do not like. The rule protects the ideas of people you agree with and people you do not.

The First Amendment mostly limits what the government can do. It says the government cannot punish you for most kinds of speech. It does not mean that every private person or group must let you say anything at all. A teacher can ask you to wait your turn to talk in class, and a store owner can ask you to stop shouting inside the store.

There are limits even for the government. Speech that is a true threat, or that is designed to cause immediate danger, is not protected in the same way. Spreading lies about a particular person to hurt them can also lead to a lawsuit.

Students have rights too. In a 1969 Supreme Court case called Tinker v. Des Moines, students wore black armbands to school to protest a war. The Court said students do not lose their free speech rights at the school door, but schools may stop speech that seriously disrupts learning.`,
      },
    ],
  },
  questions: [
    q('law-g35.l01', 1, 1, 'Which sentence best describes a right?', 2, ['Something people are free to do or are owed just for being people', 'Something extra that a person may use only when they behave well', 'Something that a person must earn by getting very high grades', 'Something that the government hands out to a few chosen people'], 'A right is not something you have to earn.', 'A right belongs to people simply because they are people. A privilege is the thing that can be taken back for behaving badly.'),
    q('law-g35.l01', 2, 2, 'Staying up late on weekends is allowed in Maya\'s house, but her parents can end it if she skips chores. This is best called what?', 0, ['A privilege, since the family can take it back', 'A right, since nobody is ever able to limit it', 'A law, since it was made by a national government', 'A treaty, since two people have agreed to it together'], 'Can the rule-maker take it back?', 'A privilege is a permission that can be taken away. A right is stronger and may be limited only for very good reasons.'),
    q('law-g35.l01', 3, 2, 'Where are many rights of people in the United States written down?', 3, ['The Constitution and its first ten amendments, the Bill of Rights', 'The rulebook of the Supreme Court and the White House gardens', 'The list of school lunch menus used in each state each year', 'The map of the borders of every city and town in the country'], 'The first ten amendments have a special name.', 'The Constitution and the Bill of Rights set out important rights such as free speech and a fair trial.'),
    q('law-g35.l01', 4, 3, 'Why is "Your right to swing your arms ends where another person\'s nose begins" a good way to think about rights?', 1, ['Because rights have to fit together so everyone can have them', 'Because only people who are standing near others have rights', 'Because rights are lost whenever someone else is nearby', 'Because it proves that rights are the same as privileges'], 'Think about how one person\'s right affects another.', 'Rights are limited so that one person\'s freedom does not hurt another person\'s. This lets everyone keep their rights.'),
    q('law-g35.l02', 1, 1, 'What is a responsibility?', 1, ['A job or duty that you are expected to do', 'A reward you are given for having won a game', 'A secret that you are asked to keep from friends', 'A choice that you can ignore without any result'], 'It is something people count on you to do.', 'A responsibility is a duty. Rights and responsibilities go together.'),
    q('law-g35.l02', 2, 2, 'Everyone in a school has the right to borrow library books. Which responsibility makes that right work?', 3, ['Returning books on time and taking care of them', 'Keeping the books at home for as long as you wish', 'Choosing the longest books so that others cannot', 'Hiding the best books where only you can find them'], 'What keeps the shelves full for the next reader?', 'If books are returned and cared for, the library can keep serving everyone. If not, the right becomes empty.'),
    q('law-g35.l02', 3, 1, 'Which of these is a responsibility that the law asks of many adults in the United States?', 0, ['Paying taxes', 'Choosing a favorite sports team', 'Keeping a pet goldfish', 'Learning to play an instrument'], 'Think about how governments pay for roads and schools.', 'Adults must pay taxes, which fund public services. The others are personal choices, not legal duties.'),
    q('law-g35.l02', 4, 3, 'A classmate says, "I have the right to say anything, so I do not need to be careful of other people." What is the best reply?', 2, ['Rights come with responsibilities, including respecting others\' rights', 'You are correct, because rights mean doing whatever you want', 'Only grown-ups have to think about other people at all times', 'Rights do not exist until someone writes them on the board'], 'Remember the two sides of the coin.', 'Using a right still means respecting the rights and safety of others. A right does not remove the duty to be fair.'),
    q('law-g35.l03', 1, 1, 'What does equal treatment mean?', 3, ['The law should not treat people worse because of who they are', 'Everybody should get exactly the same thing at all times', 'People should be treated differently by their favorite color', 'The strongest people should get to make all the rules'], 'It is about fairness regardless of who you are.', 'Equal treatment means the law should not unfairly treat people worse because of things like race, religion or sex.'),
    q('law-g35.l03', 2, 1, 'In 1954, what did the Supreme Court say in Brown v. Board of Education?', 1, ['Racially separate public schools were unequal and not allowed', 'Children must go to the school that is closest to their home', 'Schools may decide for themselves which children can attend', 'Private clubs must open their doors to every child on request'], 'This case was about separate schools.', 'The Court held that racially separate public schools were unequal. The change took many years to put into practice.'),
    q('law-g35.l03', 3, 3, 'A school builds a ramp so a student in a wheelchair can enter the building. Why is that not unfair to other students?', 0, ['It gives that student the same chance to enter as everyone else', 'It gives one student a special reward for not using stairs', 'It makes the building harder for everyone else to use', 'It shows that some students are more important than others'], 'Fair does not always mean identical.', 'Equal treatment can mean giving people what they need to have the same chance. The ramp is about access, not special favors.'),
    q('law-g35.l03', 4, 2, 'Which part of the Constitution says states must give everyone "equal protection of the laws"?', 2, ['The Fourteenth Amendment', 'The preamble to the Declaration', 'The rule about presidential terms', 'The section about coining money'], 'It is one of the amendments added after the Civil War.', 'The Fourteenth Amendment contains the Equal Protection Clause, a key source of the idea of equal treatment.'),
    q('law-g35.l04', 1, 1, 'Which of these is protected by the First Amendment?', 1, ['Speaking and writing what you think', 'Taking something that belongs to another person', 'Ignoring a safety rule in your school building', 'Entering any building without being invited'], 'The First Amendment is about expression, religion and gathering.', 'The First Amendment protects speech, religion, peaceful assembly, petition and the press.'),
    q('law-g35.l04', 2, 2, 'A store owner asks a customer to stop shouting inside the store. Is that a violation of the First Amendment?', 3, ['No, because the First Amendment mostly limits the government, not private owners', 'Yes, because nobody may ever ask a person to be quiet', 'Yes, because stores are required to let people say anything', 'No, because the First Amendment only covers speech by children'], 'Who does the First Amendment mostly stop from punishing speech?', 'The First Amendment mostly restricts government action. A private store can set its own rules for behavior in its space.'),
    q('law-g35.l04', 3, 2, 'In Tinker v. Des Moines (1969), what did the Supreme Court say about students?', 2, ['They keep speech rights, but schools may stop serious disruption', 'Students have no free speech rights at all while they are in school', 'Students may say anything they like in class at any moment', 'Schools may punish any opinion that teachers happen to dislike'], 'The case is about armbands worn in protest.', 'The Court said students do not lose speech rights at the school door, though schools can limit seriously disruptive speech.'),
    q('law-g35.l04', 4, 3, 'Why does a country do better when people are free to share ideas, even unpopular ones?', 0, ['It can find its mistakes and fix them by hearing different views', 'It makes sure that everyone will always agree with one another', 'It means that the government never has to make any decisions', 'It stops people from learning anything that is new or different'], 'Think about what happens when people are afraid to disagree.', 'Open discussion lets a society notice problems and improve. A country where people stay silent cannot easily correct errors.'),
  ],
};
