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
    id: 'law-g35.t3',
    title: 'Courts, Judges and Fair Trials',
    blurb: 'What happens in a court, who is there, and what makes a trial fair.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'law-g35.l09',
        title: 'What a Court Does',
        blurb: 'A court is a place where disagreements are settled and laws are applied fairly.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'civil and criminal cases' }],
        body: `A court is a place where a judge, and sometimes a jury, listens to both sides of a dispute and makes a decision according to the law. Courts exist so that people do not have to settle serious arguments by force or by whoever is loudest or strongest.

There are two big kinds of cases. A civil case is a disagreement between people or groups, often about money, property, a promise, or an injury. One side asks the court for something, such as payment or a fix. The side that brings the case is called the plaintiff, and the side that answers is called the defendant. A criminal case is when the government says that someone broke a criminal law, such as stealing or hurting another person. In a criminal case, the government is the side that brings the charge, and the person charged is the defendant. Prosecutors are the lawyers for the government.

Courts do not make up the rules as they go. They apply the laws that lawmakers wrote and the Constitution. They also look at what earlier courts have decided in similar cases.

Not every disagreement needs a court. Many are solved by talking, by an apology, or by a neutral helper called a mediator. Going to court can take a long time, so people often try other ways first.

Most important, a court is meant to treat everyone the same way, whether they are rich or poor, famous or unknown.`,
      },
      {
        id: 'law-g35.l10',
        title: 'Judges, Juries and Lawyers',
        blurb: 'The people you would find in a courtroom and what each one does.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'courtroom roles' }, { kind: 'concept', ref: 'jury service' }],
        body: `If you could visit a courtroom, you would see several people with different jobs.

The judge sits at the front. A judge keeps order, explains the rules of the court, decides what evidence may be used, and, in many cases, decides the result. A good judge must be neutral. That means a judge does not take a side and does not have a personal reason to favor one person. If a judge knows a person in the case very well, the judge should step aside.

A jury is a group of ordinary citizens chosen from the community. Their job is to listen to the evidence and decide what the facts are. In a criminal trial the jury decides whether the government has proved its case. Being on a jury is a duty for citizens, and it is a way for regular people to take part in justice. Not every case has a jury. Some cases are decided by a judge alone.

Lawyers speak for the people in the case. In a criminal case, a prosecutor speaks for the government, and a defense lawyer speaks for the person charged. In a civil case, each side can have its own lawyer. Lawyers present evidence and ask questions, and then they make arguments.

Witnesses are people who tell what they saw or know. Before testifying, a witness promises to tell the truth. Other helpers include the court clerk, who keeps the records, and the bailiff, who helps keep the room safe and orderly.

Evidence is anything that helps show what is true, such as a witness's story, a document, or a photograph.`,
      },
      {
        id: 'law-g35.l11',
        title: 'What Makes a Trial Fair?',
        blurb: 'The protections that help make sure a person charged with a crime gets justice.',
        minutes: 7,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'presumption of innocence' },
          { kind: 'concept', ref: 'right to a fair trial' },
          { kind: 'case', ref: 'Gideon v. Wainwright|1963|US' },
        ],
        body: `Being accused of a crime does not mean a person did it. A fair trial is a set of protections that help make sure the government treats an accused person justly and gets the facts right. Here are the main ones.

First, a person is presumed innocent. That means the court begins by treating the person as not guilty. The government has to prove its case, and it must prove it beyond a reasonable doubt, which is a very high standard. The accused person does not have to prove anything.

Second, the person has a right to a lawyer. In 1963, in a case called Gideon v. Wainwright, the Supreme Court said that a person charged with a serious crime who cannot afford a lawyer must be given one. Otherwise, a person with less money would be at a big disadvantage.

Third, the person is told what they are accused of, and has a right to hear the evidence and to question the witnesses against them. The person may also present their own evidence and witnesses.

Fourth, in a serious criminal case, the person has a right to a trial by an impartial jury, which means jurors who have not made up their minds in advance.

Fifth, the person has a right not to be forced to say things that would hurt them. People often call this the right to remain silent.

Fair trials are not only for people who seem likely to be innocent. They are for everybody, because anyone could be accused one day, and because a fair process helps courts find the truth.

Children who are accused of breaking the law are usually handled in a special juvenile court. In a 1967 case called In re Gault, the Supreme Court said that children in such cases have important fairness rights too, including notice of the charges and a lawyer.`,
      },
      {
        id: 'law-g35.l12',
        title: 'Higher Courts and Appeals',
        blurb: 'What happens when someone thinks a court made a mistake.',
        minutes: 6,
        asOf: '2026-10',
        anchors: [{ kind: 'concept', ref: 'appeals and court hierarchy' }, { kind: 'concept', ref: 'precedent' }],
        body: `Judges are human, and humans sometimes make mistakes. So the court system has a way to check. If a person thinks the trial court made a legal mistake, that person may be able to appeal. An appeal is a request that a higher court review what happened.

In the United States there are two main systems. There is a federal system for national law, and each state has its own state system. Both usually have three levels. At the bottom are trial courts. These are where cases begin, where witnesses speak, and where judges or juries decide what happened. Above them are appeals courts. Appeals judges usually do not hold a new trial. They read the record and listen to lawyers' arguments about whether the law was applied correctly. At the top is a highest court. In the federal system that is the Supreme Court of the United States, which has nine justices. Each state has its own highest court as well.

The highest court does not take every case. It chooses cases that raise important questions. Its decisions help guide courts everywhere.

Courts often follow something called precedent. That means a court tends to follow what earlier courts decided in similar cases. Precedent helps people know what to expect, and it helps treat similar cases in similar ways. A higher court's decision usually binds the lower courts in its system.

There are also special courts. Juvenile courts handle many cases involving young people. Small claims courts handle disputes about smaller amounts of money, where people often speak for themselves.

Having a way to appeal is part of fairness. It says that one judge's decision is not always the last word.`,
      },
    ],
  },
  questions: [
    q('law-g35.l09', 1, 1, 'What does a court do?', 0, ['Listens to both sides and decides a dispute under the law', 'Writes new laws for the whole country each time it meets', 'Chooses which citizens will be given new houses to live in', 'Collects taxes and spends them on roads and local schools'], 'Think about who settles a disagreement.', 'A court applies the law to settle disputes after listening to both sides. Lawmakers write laws, and other offices collect taxes.'),
    q('law-g35.l09', 2, 2, 'A person asks a court to order a neighbor to pay for a fence that the neighbor broke. What kind of case is this?', 2, ['A civil case', 'A criminal case', 'A treaty case', 'A veto case'], 'Is the government charging someone with a crime?', 'This is a dispute between people about money or property, which is a civil case. In criminal cases, the government brings the charge.'),
    q('law-g35.l09', 3, 1, 'In a civil case, what is the person who brings the case called?', 1, ['The plaintiff', 'The prosecutor', 'The bailiff', 'The witness'], 'The other side is called the defendant.', 'The plaintiff is the side that brings a civil case. A prosecutor represents the government in a criminal case.'),
    q('law-g35.l09', 4, 3, 'Two friends disagree over a borrowed bike, and a neutral person helps them find a deal. Which of these best describes this?', 3, ['Mediation, a way to settle a dispute without a trial', 'A jury trial, where twelve citizens vote on the facts', 'A veto, where the first friend cancels the other\'s claim', 'An appeal, where a higher court reviews a decision made'], 'The helper does not decide but guides.', 'A mediator is a neutral helper who guides people to agreement. Many disagreements are settled this way instead of in court.'),
    q('law-g35.l10', 1, 1, 'What must a judge be when deciding a case?', 3, ['Neutral, without taking a side', 'Friendly with the person who is richer', 'Quick, with decisions made before any evidence', 'Silent, with no questions about the case at all'], 'A good judge is like a referee.', 'A judge must be neutral and fair to both sides. A judge with a personal reason to favor one side should step aside.'),
    q('law-g35.l10', 2, 1, 'What is the main job of a jury?', 1, ['To listen to the evidence and decide what the facts are', 'To write the laws that the judge must follow in the case', 'To keep records and files in the court clerk\'s office', 'To speak for the government against the person charged'], 'A jury is made of ordinary citizens.', 'A jury decides what the facts are in a case. Writing laws is for lawmakers, and speaking for the government is the prosecutor\'s job.'),
    q('law-g35.l10', 3, 2, 'A judge realizes that the person on trial is the judge\'s own sister. What should the judge do?', 0, ['Step aside so that another judge can hear the case', 'Decide the case quickly before anyone else notices', 'Ask the jury to say what the judge should decide', 'Keep the case but be extra kind to the sister'], 'Remember the idea of neutrality.', 'A judge with a personal tie to someone in the case should step aside. Otherwise the court would not be neutral.'),
    q('law-g35.l10', 4, 3, 'Why is serving on a jury considered part of living in a free country?', 2, ['It lets ordinary citizens take part in justice', 'It lets the government avoid ever paying judges for their work', 'It means that all decisions are made by people who are lawyers', 'It guarantees that every jury will agree with the government'], 'Think about who gets to take part.', 'Juries bring community members into the justice system. It spreads responsibility beyond officials alone.'),
    q('law-g35.l11', 1, 1, 'What does "presumed innocent" mean?', 2, ['The court begins by treating the accused person as not guilty', 'The court begins by treating the accused person as probably guilty', 'The court believes that an accused person never needs a lawyer', 'The court believes that only some people are able to be innocent'], 'Who has to prove something in a criminal case?', 'The government must prove guilt. The accused begins as presumed innocent and does not have to prove anything.'),
    q('law-g35.l11', 2, 2, 'What did the Supreme Court say in Gideon v. Wainwright (1963)?', 1, ['A serious-crime defendant who cannot pay must be given a lawyer', 'A person charged with any crime must pay for the cost of the jury', 'A person charged with a crime may choose any judge they would like', 'A person charged with a crime must give up the right to a trial'], 'The case is about lawyers for people with little money.', 'Gideon held that states must provide a lawyer to a person charged with a serious crime who cannot afford one.'),
    q('law-g35.l11', 3, 2, 'Why does it matter that the accused may question the witnesses against them?', 3, ['It helps test whether the evidence is true and complete', 'It lets the accused person make the final decision for the court', 'It means the judge no longer needs to listen to the case', 'It ensures that the government can never bring a witness'], 'A story is easier to trust once it has been tested.', 'Questioning witnesses helps reveal mistakes or gaps. A fair process aims to find the truth.'),
    q('law-g35.l11', 4, 3, 'A classmate says, "Fair trials only matter for people who really did something wrong." What is the best reply?', 0, ['Anyone can be accused, and fair steps help find the truth', 'That is correct, because the innocent never need any protection', 'Fair steps are only useful if the person is already known to be guilty', 'Fair trials are only for adults, so children are never covered by them'], 'Think about people who are accused by mistake.', 'Fair process protects everyone, including people wrongly accused, and helps the court reach a correct result. In re Gault also gave children fairness rights.'),
    q('law-g35.l12', 1, 1, 'In the court system, what is an appeal?', 1, ['A request that a higher court review what a lower court did', 'A new law that Congress writes after a trial is complete', 'A promise that a witness makes before telling their story', 'A letter that a mayor sends to residents about local rules'], 'The word suggests asking for something.', 'An appeal asks a higher court to check whether the law was applied correctly in a lower court.'),
    q('law-g35.l12', 2, 1, 'What is the highest court in the federal system called?', 3, ['The Supreme Court of the United States', 'The Congressional Court of Appeals', 'The National Small Claims Court', 'The Federal Juvenile Court'], 'It has nine justices.', 'The Supreme Court is the highest federal court. It has nine justices.'),
    q('law-g35.l12', 3, 2, 'What do appeals judges usually do?', 2, ['Read the record and hear lawyers\' arguments about whether the law was applied correctly', 'Hold an entirely new trial with new witnesses and a new jury', 'Decide cases without reading anything about the earlier trial', 'Choose which lawyer will speak for each person in the case'], 'They do not usually repeat the whole trial.', 'Appeals courts mostly review the record for legal mistakes, rather than retrying the case.'),
    q('law-g35.l12', 4, 3, 'What is a benefit of courts following precedent?', 0, ['Similar cases are treated alike, so people know what to expect', 'Every case is decided by a coin flip so that judges never need to think', 'Judges can ignore the law whenever they dislike how it will turn out', 'Courts never need to hear a new argument about any question again'], 'Precedent means earlier decisions guide later ones.', 'Following precedent helps courts treat like cases alike and makes the law predictable, though courts can still change course in some situations.'),
  ],
};
