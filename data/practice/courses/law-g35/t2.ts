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
    id: 'law-g35.t2',
    title: 'How Rules and Laws Are Made',
    blurb: 'From classroom rules to national laws, who makes them, how, and who must follow them.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'law-g35.l05',
        title: 'Rules and Laws',
        blurb: 'A law is a rule made by a government, and it comes with consequences.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'rule of law' }],
        body: `Rules are everywhere. A family has rules, a classroom has rules, and a team has rules. A law is a special kind of rule. It is made by a government, and everyone in that government's area must follow it. If a person breaks a law, the government can step in. That might mean a fine, which is money paid as a penalty, or a different kind of punishment decided in court.

Why do we need laws? Imagine a town where every driver picked their own side of the road. Crashes would be common. A law that says "drive on the right" lets everyone know what to expect. Laws help keep people safe, settle disagreements, protect property, and protect rights.

There is a very important idea called the rule of law. It means that the law applies to everyone, including leaders and police officers. A mayor cannot ignore a speed limit just because she is the mayor. No person is above the law.

Laws should also be known ahead of time. It would not be fair to punish someone for doing something that nobody had told them was against the rules. That is why laws are written down and shared where people can read them.

A law can also be changed. If people think a law is unfair or out of date, there are peaceful ways to ask for a change. Next we will see how that works.`,
      },
      {
        id: 'law-g35.l06',
        title: 'How a Bill Becomes a Law',
        blurb: 'The steps Congress and the President follow to make a national law.',
        minutes: 7,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'federal legislative process' },
          { kind: 'statute', ref: 'United States Constitution, Article I' },
        ],
        body: `A new law starts as an idea. Someone thinks, "We need a rule about this." The idea is written out as a bill. A bill is a proposed law that has not been approved yet.

In the United States, national laws are made by Congress. Congress has two parts, or chambers. One is the House of Representatives, and the other is the Senate. A member of either chamber can introduce a bill. Then it goes to a small group of members called a committee, which studies it, may hold hearings where people share their views, and may change it. If the committee agrees, the bill goes to the whole chamber for a vote.

If the bill passes in one chamber, it goes to the other. Both the House and the Senate must pass the same version. If they have different versions, members must work out the differences.

Then the bill goes to the President. The President has choices. The President can sign the bill, and it becomes a law. Or the President can veto it, which means to say no. Congress can still make the bill a law if two-thirds of the members in both the House and the Senate vote to override the veto. That is a hard thing to do, which makes the President's choice powerful.

Your own state makes laws in a similar way through its state legislature, and a governor signs or vetoes the bills. Many steps help make sure that a law is thought about carefully.`,
      },
      {
        id: 'law-g35.l07',
        title: 'Three Branches, Three Jobs',
        blurb: 'Why the Constitution splits power among three parts of government.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'separation of powers' },
          { kind: 'concept', ref: 'checks and balances' },
          { kind: 'case', ref: 'Marbury v. Madison|1803|US' },
        ],
        body: `The people who wrote the Constitution worried about one person or group getting too much power. So they split the national government into three parts, called branches. Each one has its own job.

The legislative branch makes laws. That is Congress. The executive branch carries out the laws. It is led by the President, and it includes many agencies and workers. The judicial branch is made up of the courts. Judges decide what laws mean and whether they are being followed. At the top is the Supreme Court.

This idea is called the separation of powers. It is like a game where no one player holds every piece.

The branches also have ways to check each other, which we call checks and balances. The President can veto a bill from Congress. Congress can override a veto and can also decide how much money the government spends. The courts can decide that a law or an action goes against the Constitution. The Supreme Court first used this power in a famous 1803 case called Marbury v. Madison. The Senate has a say in who becomes a federal judge, because the President picks the judges and the Senate must approve them.

States have a similar plan. A state has a legislature, a governor, and state courts. Splitting power makes it harder for any one person to rule alone.`,
      },
      {
        id: 'law-g35.l08',
        title: 'Local Government Near You',
        blurb: 'Mayors, councils, school boards and the services that people share.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'local government' }, { kind: 'concept', ref: 'taxes and public services' }],
        body: `Government is not only in Washington, D.C. Much of it is close to your home. There are three main levels in the United States: federal (the national government), state, and local. Local government includes cities, towns, villages and counties. Many places also have special districts, such as a school district.

Local governments do things you see every day. They fix roads and run buses. They keep parks and libraries open. They pick up trash and provide clean water in many places. They run police and fire departments. They also help decide where houses, stores and schools can be built.

Who runs local government? In many cities, voters choose a mayor, who leads the executive part, and a city council, which makes local laws. These local laws are often called ordinances. Counties may have a board of commissioners or supervisors. Public schools are often run by a school board, whose members are chosen by voters in many places, though some are chosen differently. Not every town is set up the same way. Some small towns hold a town meeting where residents gather and vote directly.

How is it paid for? Mostly by taxes. People pay taxes on things like property or purchases, and the money funds the services everyone shares. In a fair system, people should be able to see where the money goes.

Kids can take part too. You can attend a public meeting with a grown-up, write a letter to a council member, or help with a clean-up day. Local government listens most when neighbors speak up.`,
      },
    ],
  },
  questions: [
    q('law-g35.l05', 1, 1, 'What makes a law different from a family rule?', 2, ['A law is made by a government and everyone in its area must follow it', 'A law is made by a family and only the children have to follow it', 'A law is written by a teacher and only applies to one classroom', 'A law is made by a game and only players of that game must follow it'], 'Think about who has the power to make it.', 'Laws come from a government and apply to everyone in its area. Family and classroom rules apply only to those groups.'),
    q('law-g35.l05', 2, 2, 'A town mayor is caught going far over the posted speed limit. Under the rule of law, what should happen?', 0, ['The mayor must follow the same speed-limit law as everyone else', 'The mayor is excused because leaders may ignore small traffic laws', 'The speed limit is cancelled whenever an important person is driving', 'The mayor can pick a new speed limit that matches how fast she drives'], 'The rule of law says no one is above it.', 'The rule of law means the law applies to everyone, including leaders. A mayor has no special permission to break traffic laws.'),
    q('law-g35.l05', 3, 2, 'Why is it fair for laws to be written down and shared ahead of time?', 3, ['People can know what is against the rules before they are punished', 'People can then avoid ever needing to learn about government at all', 'Only lawyers can read them, so ordinary people stay out of trouble', 'Leaders can change the meaning of them each morning in secret'], 'Think about being punished for something nobody told you about.', 'Fairness means people should have a chance to know the rules first. Secret or surprise laws would be unfair.'),
    q('law-g35.l05', 4, 3, 'A town says drivers must keep to the right side of the road. What is the best reason for such a law?', 1, ['It lets everyone know what to expect, which prevents crashes', 'It makes sure that every driver has to buy a new kind of car', 'It proves that the town government is stronger than the others', 'It stops drivers from ever having to look at other cars again'], 'Imagine every driver choosing differently.', 'Shared rules of the road keep people safe because each driver can predict what the others will do.'),
    q('law-g35.l06', 1, 1, 'In the lawmaking process, what is a bill?', 1, ['A proposed law that has not yet been approved', 'A law that has already been in use for many years', 'A paper that tells how much money someone owes a shop', 'A judge\'s order that sends someone to a court hearing'], 'It is the first stage of a possible law.', 'A bill is a proposed law. It becomes a law only after it is approved through the required steps.'),
    q('law-g35.l06', 2, 1, 'Which two chambers make up the United States Congress?', 0, ['The House of Representatives and the Senate', 'The Supreme Court and the Cabinet', 'The State Assembly and the City Council', 'The Electoral College and the Governors'], 'Congress has two parts.', 'Congress is made of the House of Representatives and the Senate. Both must pass a bill before it goes to the President.'),
    q('law-g35.l06', 3, 2, 'The President vetoes a bill. What can Congress do if it still wants the bill to become law?', 2, ['Override the veto with two-thirds of both chambers', 'Ask the Supreme Court to sign the bill in place of the President', 'Wait one year and the bill will automatically become a law then', 'Have the governors of the states vote on it to cancel the veto'], 'Overriding needs a bigger vote than usual.', 'A veto can be overridden if two-thirds of the members in both chambers vote to do so. This is difficult to achieve.'),
    q('law-g35.l06', 4, 3, 'Why does it matter that a committee studies a bill before the whole chamber votes?', 3, ['Members can study and change it before the vote', 'The committee can make the bill a law without the rest of Congress', 'The committee can make sure that the bill is never looked at again', 'The committee lets the President skip signing the bill into law'], 'Think about the benefit of slowing down.', 'Committees study bills, hold hearings and make changes. This helps lawmakers think carefully before voting.'),
    q('law-g35.l07', 1, 1, 'Which branch of government carries out the laws and is led by the President?', 1, ['The executive branch', 'The legislative branch', 'The judicial branch', 'The county branch'], 'The President\'s branch has a name that sounds like "execute."', 'The executive branch carries out laws. Congress is the legislative branch and the courts are the judicial branch.'),
    q('law-g35.l07', 2, 2, 'Why did the writers of the Constitution split power among three branches?', 0, ['To make it harder for any one person or group to hold too much power', 'To give each branch a different state in which to meet each year', 'To make sure that every decision takes much longer than needed', 'To let the President choose which branch will do each job that day'], 'They worried about too much power in one place.', 'Separation of powers aims to prevent any one person or group from ruling alone.'),
    q('law-g35.l07', 3, 2, 'Which is an example of a check and balance?', 2, ['The President vetoes a bill that Congress passed', 'The President moves to a new house before taking office', 'Congress holds a meeting in a building with a big dome', 'A state names a new official bird for its state flag'], 'A check is one branch limiting another.', 'A veto lets the executive limit the legislative branch. The other options are not ways of limiting another branch.'),
    q('law-g35.l07', 4, 3, 'In Marbury v. Madison (1803), the Supreme Court first used what important power?', 3, ['Ruling that a law against the Constitution cannot stand', 'Choosing who the next President of the United States will be', 'Writing new laws about taxes and the cost of mailing letters', 'Deciding how much money Congress is allowed to spend each year'], 'This is called judicial review.', 'In Marbury v. Madison the Court said courts can decide that a law conflicts with the Constitution. This is called judicial review.'),
    q('law-g35.l08', 1, 1, 'Which of these is a service that local government often provides?', 2, ['Fixing roads and running parks and libraries', 'Printing the money used across the whole country', 'Deciding treaties with other countries around the world', 'Choosing who sits on the Supreme Court each year'], 'Think of things you can see in your neighborhood.', 'Local governments maintain roads, parks and libraries and provide many daily services. The other choices are national jobs.'),
    q('law-g35.l08', 2, 1, 'What is a local law made by a city council often called?', 1, ['An ordinance', 'An amendment', 'A treaty', 'A verdict'], 'It is a word used for rules in cities and towns.', 'City and town laws are often called ordinances. An amendment changes the Constitution, and a treaty is between countries.'),
    q('law-g35.l08', 3, 2, 'How are local services like fire departments and parks mostly paid for?', 0, ['By taxes that people and businesses pay', 'By prizes that are won in games of chance', 'By gifts that are given by the President each year', 'By fees collected only from children at schools'], 'Everyone shares in paying for shared services.', 'Taxes on things such as property and purchases fund most public services. Fairness means people can see how it is spent.'),
    q('law-g35.l08', 4, 3, 'Your neighborhood park has broken swings. Which action best uses the way local government works?', 3, ['Attend a public meeting or write to a council member to ask for repairs', 'Wait for the national Congress to vote on a bill about the swings', 'Ask a court in another country to order that new swings be built', 'Fix them yourself by taking parts from the swings at another park'], 'Who is closest to the problem?', 'Local officials are responsible for parks, and they can hear from residents. Taking parts from another park would be wrong.'),
  ],
};
