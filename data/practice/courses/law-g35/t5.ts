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
    id: 'law-g35.t5',
    title: 'Rules Between Countries',
    blurb: 'How countries make agreements, what the United Nations does, and the treaty about children\'s rights.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'law-g35.l17',
        title: 'Why Countries Need Rules Too',
        blurb: 'There is no world government, so countries make agreements with each other.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'international law basics' }, { kind: 'concept', ref: 'state sovereignty' }],
        body: `Inside a country, the government makes laws and courts help settle disputes. But what about rules between countries? There is no single government for the whole world that can make laws for everyone. Each country is independent. We say it is sovereign, which means it governs itself and makes its own decisions inside its borders.

Still, countries need to get along. Ships cross oceans, planes cross borders, goods are traded, and rivers and air do not stop at a line on a map. If there were no shared rules, every disagreement could turn into a dangerous fight.

So countries make rules together. The set of rules and principles that countries follow in their dealings with each other is called international law. It covers many topics, such as how ships may sail the seas, how diplomats must be treated, how countries trade, and how people should be protected during war.

Where do these rules come from? Mostly from agreements that countries make, which are called treaties. They also come from long-standing customs that countries have followed because they feel they must.

International law works differently from the law in your town. There is no world police force that can arrest a country. Instead, countries mostly follow the rules because they want others to follow them too, because breaking promises harms their reputation, and because other countries can respond, for example by ending trade or by joining together in organizations. International law is imperfect, and countries sometimes break it, but it still shapes how most nations behave most of the time.`,
      },
      {
        id: 'law-g35.l18',
        title: 'Treaties: Promises Between Countries',
        blurb: 'A treaty is a written agreement that countries make with each other.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [
          { kind: 'treaty', ref: 'Vienna Convention on the Law of Treaties 1969' },
          { kind: 'treaty', ref: 'Antarctic Treaty 1959' },
          { kind: 'statute', ref: 'United States Constitution, Article II, Section 2' },
        ],
        body: `A treaty is a formal, written agreement between countries. It is like a contract, but the parties are nations. Some treaties are between two countries. Others are signed by many countries.

Countries have made treaties about all sorts of things. The Antarctic Treaty of 1959, for example, set aside the continent of Antarctica for peaceful uses and science. Other treaties cover trade, the protection of the ocean, and how countries treat each other's citizens.

How does a treaty become binding? Usually a country's leaders negotiate the text, then sign it. In many countries, including the United States, signing is not the final step. The United States Constitution says the President can make a treaty, but only with the "advice and consent" of the Senate, and two-thirds of the senators present must agree. After that, the country formally joins, which is often called ratifying. A country that has joined a treaty is called a party to it.

One basic rule of treaties is that agreements must be kept. This idea has a Latin name, pacta sunt servanda, which means "agreements must be kept." A treaty about treaties, the Vienna Convention on the Law of Treaties of 1969, sets out many of the rules for how they are made and understood.

A country can sometimes join a treaty with a reservation, which is a statement that it will not follow one part. And a country may leave some treaties if the treaty allows it.

When countries disagree about a treaty, they may talk it out, ask a neutral country to help, or bring the case to a court, if both sides accept that court's authority.`,
      },
      {
        id: 'law-g35.l19',
        title: 'The United Nations',
        blurb: 'An organization where countries work on peace, rights and cooperation.',
        minutes: 7,
        asOf: '2026-10',
        anchors: [
          { kind: 'treaty', ref: 'Charter of the United Nations 1945' },
          { kind: 'concept', ref: 'Universal Declaration of Human Rights 1948' },
          { kind: 'concept', ref: 'International Court of Justice' },
        ],
        body: `After the Second World War, which caused terrible suffering around the world, countries wanted a better way to keep peace. In 1945 they created the United Nations, often called the UN. Its founding treaty is the Charter of the United Nations. Today almost every recognized country in the world is a member. Its main headquarters are in New York City.

The UN has several main parts. The General Assembly is where all member countries have a seat and a vote to discuss world issues. The Security Council has fifteen members, and its main job is to work for international peace and security. Five countries hold permanent seats there: China, France, Russia, the United Kingdom and the United States. The International Court of Justice, often called the World Court, is in The Hague in the Netherlands. It settles legal disputes between countries that agree to bring them, and it gives opinions on legal questions. The UN also has agencies that help with children, health, food and education, such as UNICEF and the World Health Organization.

In 1948 the UN General Assembly adopted the Universal Declaration of Human Rights. It is a statement of rights that belong to every person, such as the right to life, to be free from slavery, and to an education. It is a declaration, not a treaty, so it does not bind countries in the way a treaty does. But it has been very influential, and later treaties built on its ideas.

The UN cannot do everything. Its power comes from what its members agree to. Many people believe it does important work, and many also criticize it, for example because the five permanent members of the Security Council can block decisions. Understanding both views is part of understanding how the world works.`,
      },
      {
        id: 'law-g35.l20',
        title: 'The Convention on the Rights of the Child',
        blurb: 'A worldwide promise about what every child needs and deserves.',
        minutes: 7,
        asOf: '2026-10',
        anchors: [
          { kind: 'treaty', ref: 'Convention on the Rights of the Child 1989' },
          { kind: 'concept', ref: 'best interests of the child' },
        ],
        body: `In 1989 the United Nations General Assembly adopted a treaty called the Convention on the Rights of the Child. It is a list of rights for every person under eighteen, no matter who they are or where they live. It became one of the most widely accepted human rights treaties in history. Almost every country in the world has joined it.

The Convention has many parts, called articles. Several big ideas run through them. Children have a right to survive and grow, which includes food, clean water, health care and a place to live. Children have a right to learn, to play and to rest. Children have a right to be protected from harm, such as abuse, neglect and work that is dangerous for them. Children also have a right to take part, which means that they may share their views and be listened to on matters that affect them, with their age and maturity taken into account.

Another key idea is the best interests of the child. It says that when adults or governments make decisions that affect children, the child's best interests should be a main concern. Another is non-discrimination, which means every child has these rights whatever their background.

The Convention also respects families. It says that parents or guardians have the main responsibility for raising children, and that governments should support them.

Countries that join the treaty promise to follow it and to report on their progress to a UN committee of experts. The committee can give advice, but it cannot force a country to act. How well the promises are kept varies a great deal from place to place.

The United States signed the Convention in 1995 but has not ratified it. People who support ratifying it say it would show a commitment to children everywhere. Some people who disagree worry about its effect on parents' rights or on how the United States makes its own laws. Both views are part of an ongoing debate, and the United States has other laws that protect children.`,
      },
    ],
  },
  questions: [
    q('law-g35.l17', 1, 1, 'What does it mean for a country to be sovereign?', 1, ['It governs itself and makes its own decisions within its borders', 'It takes orders from one government that rules the whole world', 'It has the right to decide how other countries must be governed', 'It is part of a larger country that makes all of its laws'], 'Think about self-government.', 'A sovereign country governs itself. There is no single world government above countries.'),
    q('law-g35.l17', 2, 1, 'What is international law?', 3, ['The rules and principles countries follow in their dealings with each other', 'The laws that apply only inside one large city and its suburbs', 'The rules that a school makes for children from other lands', 'A list of laws that a world police force uses to arrest leaders'], 'It is about relations between countries.', 'International law is the body of rules that govern how countries deal with each other. There is no world police force.'),
    q('law-g35.l17', 3, 2, 'There is no world police force that can arrest a country. Why do countries still often follow international law?', 0, ['They want others to follow too, and breaking promises hurts their reputation', 'They are afraid that a judge will arrive and arrest their leader right away', 'They have no way of making their own laws about any subject at all', 'They believe that treaties are made only to be broken as soon as possible'], 'Think about reasons beyond force.', 'Countries gain from a predictable system, value their reputation, and can face responses from others if they break rules.'),
    q('law-g35.l17', 4, 3, 'Which situation best shows why countries need shared rules?', 2, ['Ships from many countries sail the same oceans and need rules', 'Every country uses a different color on the cover of its school textbooks', 'Some countries have mountains while others have flat land and open plains', 'People in different countries like to eat their own kinds of favorite foods'], 'Look for something that crosses borders.', 'Oceans, air and trade cross borders, so shared rules help avoid conflict. Differences like food or landscape do not need international rules.'),
    q('law-g35.l18', 1, 1, 'In international law, what is a treaty?', 2, ['A formal written agreement between countries', 'A new law that is made by a single city council', 'A decision that a jury makes at the end of a trial', 'A speech that a leader gives to people in their own country'], 'It is like a contract between nations.', 'A treaty is a written agreement between countries. Some are between two nations and some include many.'),
    q('law-g35.l18', 2, 2, 'In the United States, what is needed before the President can make a treaty that binds the country?', 3, ['Two-thirds of the senators present must agree', 'A majority of the nine justices of the Supreme Court must agree', 'All fifty state governors must sign the written treaty', 'A vote by the House of Representatives alone must be taken'], 'The Constitution gives a role to one chamber of Congress.', 'The Constitution requires the Senate\'s advice and consent, with two-thirds of senators present agreeing. The House does not vote on treaties.'),
    q('law-g35.l18', 3, 1, 'What does the Latin phrase "pacta sunt servanda" mean?', 1, ['Agreements must be kept', 'Treaties are broken in war', 'Countries may rule the seas', 'Peace is better than trade'], 'It is the basic rule of treaties.', 'The phrase means that agreements must be kept. It is a basic principle of treaty law.'),
    q('law-g35.l18', 4, 3, 'A country signs a treaty, but its leaders have not yet completed the steps to formally join it. What is the most accurate description?', 0, ['It has shown support but is not fully bound until it ratifies', 'It is fully bound in every way as soon as the first signature is made', 'It can never be bound by the treaty because signing has no meaning', 'It has automatically become a member of the United Nations by signing'], 'Signing and ratifying are different steps.', 'Signing shows support, but in many countries a further step, ratification, is needed to be fully bound. The US Senate\'s consent is part of that.'),
    q('law-g35.l19', 1, 1, 'When was the United Nations created?', 2, ['In 1945, after the Second World War', 'In 1789, when the Constitution was drafted', 'In 1989, when the children\'s treaty was adopted', 'In 2001, at the start of a new century'], 'It followed a great world war.', 'The UN was created in 1945 after the Second World War to help keep peace.'),
    q('law-g35.l19', 2, 2, 'Which UN body is made up of all member countries, each with a vote?', 1, ['The General Assembly', 'The Security Council', 'The International Court of Justice', 'The Secretariat of the Court'], 'It is the large meeting of all members.', 'Every member state has a seat and a vote in the General Assembly. The Security Council has fifteen members.'),
    q('law-g35.l19', 3, 2, 'What is the International Court of Justice?', 3, ['A court in The Hague that settles disputes between states', 'A world police force that arrests leaders who break a rule', 'A group in New York that writes the laws for every country', 'A children\'s agency that supplies food and school books'], 'It is sometimes called the World Court.', 'The ICJ is in The Hague. It decides disputes between states that accept its authority and gives legal opinions.'),
    q('law-g35.l19', 4, 3, 'The Universal Declaration of Human Rights (1948) is described as a declaration, not a treaty. What does that mean?', 0, ['It does not bind like a treaty, but has been very influential', 'It has no connection to rights and was only a list of famous dates', 'It binds every country exactly as a treaty does with full punishments', 'It was written only for the United States and is not for other lands'], 'Think about the difference in legal force.', 'The Declaration is a statement adopted by the General Assembly, not a treaty. Many later treaties built on its ideas.'),
    q('law-g35.l20', 1, 1, 'What is the Convention on the Rights of the Child?', 1, ['A UN treaty adopted in 1989 that lists rights for every person under eighteen', 'A law of the United States that only applies to children in one state', 'A school rulebook that is used by teachers in a single district', 'A court that hears cases about children from every country'], 'It was adopted by the UN.', 'The Convention is a treaty adopted by the UN General Assembly in 1989. It covers children under eighteen.'),
    q('law-g35.l20', 2, 2, 'Which is one of the big ideas in the Convention?', 3, ['When decisions affect children, the child\'s best interests should be a main concern', 'Children are in charge of every decision made about their own lives', 'Governments should replace families in raising every child they can', 'Children should be treated differently depending on their background'], 'One idea guides decisions made by adults.', 'The best interests of the child is a key principle. The Convention also respects families and says every child has these rights.'),
    q('law-g35.l20', 3, 2, 'A UN committee reviews how countries are keeping the Convention. What can it do?', 2, ['Give advice, but it cannot force a country to act', 'Arrest officials who it believes are not keeping the treaty', 'Rewrite the laws of a country that has not followed the treaty', 'Remove a country from the world map if it does not report in'], 'Think about the difference between advice and force.', 'The committee reviews reports and advises, but it has no power to compel countries.'),
    q('law-g35.l20', 4, 3, 'Which statement about the United States and the Convention is accurate?', 0, ['It signed in 1995 but has not ratified, and people disagree', 'It was the first country to ratify it and has kept it without any debate', 'It has never taken part in any talks at all about children\'s rights', 'It has ratified it, and the Senate approved it with a unanimous vote'], 'Remember the difference between signing and ratifying.', 'The US signed the Convention but has not ratified it. Supporters and critics give different reasons, and US law has its own child protections.'),
  ],
};
