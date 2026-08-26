/**
 * comparativeCivicsLessons — Civics Hall, Strand VI: "The World's Promises".
 *
 * The reader module in data/comparativeCivics.ts holds the structured reference material
 * (founding texts, structure, rights tradition, civic life, the speech clause) and renders as the
 * Seven Nations tab. THIS file turns that material into graded lessons on the shared School
 * chassis, so comparative civics writes Learner Ledger records under C3_SOCIAL exactly as the
 * five American strands do. Reader and coursework share one dataset; neither is a duplicate of
 * the other.
 *
 * SHAPE: a method lesson, seven nation lessons, and a capstone that puts all eight promises
 * (seven nations plus the US anchor) on one page. The method lesson comes first on purpose —
 * a student who compares countries without a method produces a ranking, which is the failure
 * mode this strand exists to prevent.
 *
 * TEACHING POSTURE, stated once and held throughout: this strand does not rank nations, and it
 * does not treat the United States as the neutral standard the others are measured against. The
 * US is one case among eight. Every lesson separates what a text PROMISES from what a system
 * DELIVERS, and asks for evidence on both, including for the United States.
 *
 * LICENCE POSTURE: constitutional text is quoted from public-domain or officially-published
 * sources only, per the notes in data/comparativeCivics.ts. Germany's English translation of the
 * Basic Law is link-only and is quoted here in short excerpt with attribution rather than
 * reproduced at length. All teaching prose is original.
 */
import type { Track } from '../services/schoolChassis';

// ── Shared sources ────────────────────────────────────────────────────────────
const CCM = { label: 'Constitute Project — searchable constitutions of the world', url: 'https://www.constituteproject.org/' };
const LEGISLATION_UK = { label: 'Human Rights Act 1998, Schedule 1 (legislation.gov.uk, OGL v3.0)', url: 'https://www.legislation.gov.uk/ukpga/1998/42/schedule/1' };
const ECHR = { label: 'European Convention on Human Rights, full text (Council of Europe)', url: 'https://www.echr.coe.int/documents/d/echr/convention_ENG' };
const DDHC = { label: 'Declaration of the Rights of Man and of the Citizen, 1789 (public domain)', url: 'https://www.elysee.fr/en/french-presidency/the-declaration-of-the-rights-of-man-and-of-the-citizen' };
const CONSEIL = { label: 'Conseil constitutionnel — the constitutional bloc and QPC procedure', url: 'https://www.conseil-constitutionnel.fr/en' };
const GG = { label: 'Basic Law for the Federal Republic of Germany — official English translation (link only)', url: 'https://www.gesetze-im-internet.de/englisch_gg/' };
const BVERFG = { label: 'Federal Constitutional Court of Germany — decisions in English', url: 'https://www.bundesverfassungsgericht.de/EN/Homepage/home_node.html' };
const NPC_CN = { label: 'Constitution of the People’s Republic of China — official English text', url: 'http://www.npc.gov.cn/englishnpc/constitution2019/201911/1f65146fb6104dd3a2793875d19b5b29.shtml' };
const JAPAN_GOV = { label: 'The Constitution of Japan, 1946 (public domain, Prime Minister’s Office)', url: 'https://japan.kantei.go.jp/constitution_and_government_of_japan/constitution_e.html' };
const MEIJI = { label: 'Constitution of the Empire of Japan, 1889 (public domain)', url: 'https://en.wikisource.org/wiki/Constitution_of_the_Empire_of_Japan' };
const STF_BR = { label: 'Constitution of Brazil, 1988 — official English translation (Supremo Tribunal Federal)', url: 'https://www.stf.jus.br/arquivo/cms/legislacaoConstituicao/anexo/brazil_federal_constitution.pdf' };
const ARG = { label: 'Constitution of the Argentine Nation (official portal)', url: 'https://www.argentina.gob.ar/normativa/nacional/constituci%C3%B3n-1-0' };
const NUNCA_MAS = { label: 'CONADEP, Nunca Más (1984) — the truth-commission report', url: 'https://www.desaparecidos.org/nuncamas/web/english/library/nevagain/nevagain_001.htm' };
const NARA = { label: 'U.S. National Archives — founding documents (public domain)', url: 'https://www.archives.gov/founding-docs' };

const ASSIGN = { tool: 'NONE' as const, postTag: 'civicshall' };

export const COMPARATIVE_STRAND: Track = {
  id: 'comparative',
  title: "The World's Promises",
  blurb:
    'Seven constitutions read in their own words, against the American one. Every system here promises free expression — the work is learning to tell a promise from a delivery, in every country including your own.',
  level: 'ADVANCED',
  lessons: [
    // ── 1. Method ─────────────────────────────────────────────────────────────
    {
      id: 'civ-comp-method',
      title: 'How to Compare a Country Without Ranking It',
      blurb: 'The method comes first, because comparison without one produces a scoreboard instead of an understanding.',
      minutes: 22,
      standardIds: ['D2.Civ.4.6-8', 'D2.Civ.10.9-12'],
      body: `Most comparative civics goes wrong in the same way. A student reads about another country's government, notices it is different from their own, and concludes it is worse. The comparison produces a ranking, the ranking confirms what they already believed, and nothing has been learned.

The fix is a method, applied identically to every country, including your own.

**Ask the same four questions of every system.** Who makes the law? Who can overrule them, and how? What is written down as a right? What actually happens when someone tries to use that right? The four questions are boring on purpose. They are the same for the United Kingdom and for China, and applying them evenly is the entire discipline.

**Separate the promise from the delivery, and demand evidence for both.** A constitutional text is a promise. Whether the promise is kept is a separate factual question requiring separate evidence — court records, prosecutions, journalists working or not working, elections producing changes of government or not. A country can have a beautiful text and a closed society. A country can have no single constitutional document at all and a functioning free press. Neither fact can be read off the other, and a student who conflates them has learned nothing except how to be fooled by paperwork.

**Do not treat any one country as the neutral standard.** This is the specific trap for an American student. The United States is not the yardstick in this strand; it is the eighth case. When you ask whether Germany's ban on anti-democratic parties is dangerous, you must also ask what the American refusal to ban them has cost. When you note that China's constitution is not judicially enforceable against the state, you must also ask how often the US Supreme Court has ruled against the government that appointed it. Applying the questions evenly is uncomfortable, which is how you know it is working.

**Notice your own position.** You will find some violations obvious and others invisible, and which is which depends on where you are standing. This is not a reason to give up on judgment — some governments genuinely do imprison people for speech and others genuinely do not, and pretending otherwise is its own dishonesty. It is a reason to check whether you applied your standard evenly before you reached the verdict.

**A rule for this strand: name the mechanism, not the vibe.** "Country X is less free" is not an analysis. "Country X permits prior restraint of publication through mechanism Y, which the courts have upheld in cases Z" is an analysis. The first is a feeling wearing the costume of a finding. The second can be checked, argued with, and proved wrong — which is what makes it worth writing.

You will apply this to seven countries. Each lesson gives you the actual constitutional words, the structure that surrounds them, and a question with no settled answer.`,
      resources: [CCM, NARA],
      assignment: {
        prompt: 'Apply the four questions to the United States before you look at anyone else. Who makes the law, who can overrule them, what is written down as a right, and what happens when someone uses it? Write a paragraph on each, citing evidence rather than assertion. Keep this document — you will re-read it after the capstone and mark what you got wrong.',
        ...ASSIGN,
      },
    },

    // ── 2. United Kingdom ─────────────────────────────────────────────────────
    {
      id: 'civ-comp-uk',
      title: 'United Kingdom: The Constitution You Cannot Hold',
      blurb: 'No single document, no power to strike down a law — and the source of most of the ideas in the American constitution.',
      minutes: 24,
      standardIds: ['D2.Civ.4.9-12', 'D2.Civ.6.6-8'],
      body: `Ask for a copy of the British constitution and nobody can hand you one, because it is not in a single document. It is spread across statutes, court decisions and conventions that everyone follows without any court enforcing them. Magna Carta 1215, the Bill of Rights 1689, the Acts of Union, the Parliament Acts of 1911 and 1949, the Human Rights Act 1998, the Constitutional Reform Act 2005 — plus a large body of unwritten practice about what a prime minister or a monarch simply does not do.

The organising principle is **parliamentary sovereignty**. Parliament can make or unmake any law, and no Parliament can bind its successor. Follow that to its conclusion and you reach the thing that most surprises an American student: **British courts cannot strike down an Act of Parliament.** Under section 4 of the Human Rights Act, the higher courts may issue a *declaration of incompatibility* — a formal statement that a statute conflicts with the rights the Act protects. The statute remains fully in force. Parliament is expected to respond, and in practice usually has, but nothing legally compels it.

The rights themselves arrive by an interesting route. The Human Rights Act brought the European Convention on Human Rights into domestic law, so Article 10 became directly usable in a British court:

> "Everyone has the right to freedom of expression. This right shall include freedom to hold opinions and to receive and impart information and ideas without interference by public authority and regardless of frontiers."

Read the second paragraph, which most people skip. Article 10 continues that the exercise of these freedoms "carries with it duties and responsibilities" and may be subject to restrictions "prescribed by law and necessary in a democratic society" — in the interests of national security, public safety, the prevention of disorder or crime, the protection of health or morals, the reputation or rights of others, and more.

That structure is the deep contrast with the American text. The First Amendment states a prohibition on government and lists no exceptions on its face; the exceptions were built later by courts. Article 10 states the right and then writes the exceptions *into the same article*, with a test — prescribed by law, necessary in a democratic society, proportionate — that a judge applies case by case. One system hides its balancing inside doctrine; the other puts the balancing in the text. Neither is obviously better, and arguing about which you prefer is a real argument rather than a patriotic one.

The practical consequences are visible. British courts issue reporting restrictions on active criminal trials that would be unconstitutional prior restraint in the United States; the stated purpose is protecting the fairness of the jury. British defamation law placed the burden on the defendant far more heavily than American law does, which drew enough international criticism — including American statutes passed specifically to blunt it — that Parliament rewrote it in the Defamation Act 2013. Both are cases where you can name the mechanism rather than the vibe.

And then the question that makes this lesson worth teaching. A system with no entrenched constitution, where the legislature can amend any right by ordinary majority, sounds fragile. Yet it has run for centuries without the collapse the theory predicts, and it produced the ideas the Americans entrenched. Either the entrenchment matters less than we assume, or Britain has been lucky, or the unwritten conventions are doing work we are failing to see. Decide which, and say what evidence would change your mind.`,
      resources: [LEGISLATION_UK, ECHR, CCM],
      assignment: {
        prompt: 'Take one real case where a British court issued a declaration of incompatibility. What did Parliament do next, and how long did it take? Then argue the general question: does a right that the legislature can repeal by simple majority still function as a right? Use the case, not the theory, as your evidence.',
        ...ASSIGN,
      },
    },

    // ── 3. France ─────────────────────────────────────────────────────────────
    {
      id: 'civ-comp-france',
      title: 'France: Rights Declared for Everyone',
      blurb: 'The 1789 Declaration claimed universal rights for all humanity — while France held colonies for another 150 years.',
      minutes: 24,
      standardIds: ['D2.Civ.6.9-12', 'D2.Civ.10.9-12'],
      body: `The American Declaration of Independence is addressed to a candid world but argues about one king and thirteen colonies. The French Declaration of the Rights of Man and of the Citizen, adopted in August 1789, does something structurally different: it declares rights belonging to *man*, as such, everywhere.

Article 11 is the free-expression clause:

> "The free communication of ideas and opinions is one of the most precious of the rights of man. Every citizen may thus speak, write and publish freely, except that he shall be responsible for such abuses of this freedom as shall be defined by law."

Notice the last clause, because it is the whole French tradition in one line. The right is declared in the most expansive possible terms — *one of the most precious of the rights of man* — and then handed to the legislature to define its abuses. Where the American text restrains the legislature, the French text trusts it. That is not an accident or a loophole; it follows from the revolutionary conviction that the law expresses the general will, so the body that makes the law is the guardian of liberty rather than its main threat.

This produced a country that for most of its modern history had **no way for a court to protect a right against a statute at all**. The remedy came slowly and from an unexpected place. The Conseil constitutionnel, created in 1958 mainly to police the boundary between government and parliament, held in a 1971 decision that the 1789 Declaration and the 1946 preamble were part of the constitutional standard against which laws must be measured — the *bloc de constitutionnalité*. A 2008 reform then created the *question prioritaire de constitutionnalité*, which since 2010 lets an ordinary litigant have a statute already in force referred for constitutional review. France therefore acquired something close to judicial review of rights roughly two centuries after declaring the rights.

The second thing to hold is the contradiction, and it is not a small one. The Declaration says rights are universal. France maintained an empire for a century and a half afterwards in which those rights plainly were not extended. The revolutionary assembly abolished slavery in 1794; Napoleon restored it in 1802; it was abolished again in 1848. A learner should sit with that sequence rather than resolve it quickly, because the same pattern appears in the American strand of this course, and noticing it in one country while excusing it in the other is exactly the failure the method lesson warned about.

The distinctively French concept you need is **laïcité**, established by the 1905 law separating the churches and the state. It is often translated as secularism, and the translation misleads. The American religion clauses primarily restrain the state from establishing or prohibiting religion, leaving private religious expression very broadly protected. Laïcité is a stronger claim about the neutrality of *public space*, and it has been used to justify restrictions on religious dress in state schools and by public employees — measures that would be plainly unconstitutional in the United States. Whether that protects citizens from religious coercion or imposes a majority's preference on a minority is genuinely contested inside France, along lines that do not map onto American political divisions at all.

So France gives you two lessons that no other case in this strand gives as cleanly: a rights tradition that placed its faith in the legislature rather than the courts and had to invent review afterwards, and a universal declaration that its own authors did not universally apply.`,
      resources: [DDHC, CONSEIL, CCM],
      assignment: {
        prompt: 'Put Article 11 of the 1789 Declaration beside the First Amendment. One protects the citizen and makes him answerable for abuses defined by law; the other forbids Congress to act. Write the strongest case for each design, then identify one real dispute in which the two would reach different outcomes.',
        ...ASSIGN,
      },
    },

    // ── 4. Germany ────────────────────────────────────────────────────────────
    {
      id: 'civ-comp-germany',
      title: 'Germany: The Democracy That Defends Itself',
      blurb: 'Written by people who had watched a democracy vote itself out of existence — and built so it could not happen twice.',
      minutes: 26,
      standardIds: ['D2.Civ.13.9-12', 'D2.Civ.4.9-12'],
      body: `Every constitution is a response to something. Germany's Basic Law of 1949 is a response to the previous fifteen years, and you cannot understand a single one of its unusual features without holding that in mind.

The document opens where no other constitution in this strand opens. Article 1 begins by declaring human dignity inviolable and binding all state authority to respect and protect it. Dignity comes before democracy, before the state, before every other right in the text — a deliberate architectural decision by people who had just seen what a state does when it decides some humans do not have any.

Article 5 carries free expression. In the official English translation, every person has the right freely to express and disseminate their opinions in speech, writing and pictures, and to inform themselves without hindrance from generally accessible sources; freedom of the press and of reporting by broadcast and film are guaranteed; and — in four words that land hard given what preceded them — **there shall be no censorship.** The next paragraph then sets the limits: these rights find their limits in the provisions of general laws, in provisions for the protection of young persons, and in the right to personal honour.

Now the two features that make Germany the most argued-about case in comparative civics.

**The eternity clause.** Article 79(3) declares that amendments affecting the principles laid down in Articles 1 and 20 — human dignity, and the democratic, federal, social and rule-of-law character of the state — are **inadmissible**. Not difficult. Not requiring a supermajority. Inadmissible. The Basic Law places part of itself permanently beyond amendment, which means the Germans of 1949 bound every future generation of Germans on a question the future generation is not permitted to reopen.

**Militant democracy.** Article 21 provides that parties which seek to undermine or abolish the free democratic basic order are unconstitutional, with the Federal Constitutional Court deciding the question. This is not theoretical. A successor to the Nazi party was banned in 1952 and the Communist Party in 1956. In a 2017 case concerning the far-right NPD, the Court found the party's aims incompatible with the free democratic basic order but declined to ban it on the ground that it had no realistic potential to achieve them — after which the constitution was amended to allow such parties to be cut off from state party financing instead.

Set that beside the American answer. The United States has decided, in substance, that the remedy for anti-democratic speech and organisation is more speech and electoral defeat, and it does not ban parties. Germany decided that a democracy is entitled to defend itself, because it had already run the other experiment and lost.

The argument for the German position is that the Weimar Republic's neutrality toward its own enemies was not principled tolerance but a fatal design flaw, and that a constitution which cannot survive its own procedures being used against it is unfinished. The argument against is that "the free democratic basic order" is defined by the very court that applies it, that every government believes its opponents threaten the order, and that a tool built for actual fascists is available to whoever holds the institutions later.

Both arguments are serious. Neither is obviously right. What you must not do is pick the one your country already chose and treat the choosing as the reasoning.`,
      resources: [GG, BVERFG, CCM],
      assignment: {
        prompt: 'Take the eternity clause. Write the strongest defence of a generation binding all future generations on a question they may not reopen — then the strongest attack. Finish by saying which you would want written into your own country’s constitution, and name precisely what you are risking by choosing it.',
        ...ASSIGN,
      },
    },

    // ── 5. China ──────────────────────────────────────────────────────────────
    {
      id: 'civ-comp-china',
      title: 'China: Text and Practice',
      blurb: 'Article 35 names more freedoms than the First Amendment does. The lesson is what a text does and does not tell you.',
      minutes: 26,
      standardIds: ['D2.Civ.6.9-12', 'D2.Civ.13.9-12'],
      body: `This is the lesson where the method from the first lesson stops being an abstraction, so apply it exactly: the promise and the delivery are separate questions, and both need evidence.

Start with the promise. Article 35 of the 1982 Constitution of the People's Republic of China reads:

> "Citizens of the People's Republic of China enjoy freedom of speech, of the press, of assembly, of association, of procession and of demonstration."

Count the freedoms named. Six, explicitly, in one sentence. The First Amendment names religion, speech, press, assembly and petition — five. On the face of the text alone, the Chinese constitution enumerates *more* expressive freedoms than the American one. A student who expected the opposite has just learned the most important thing this lesson teaches: **you cannot read a country's practice off its constitutional text.**

Now read the rest of the document, because the text also contains its own answer. Article 51 provides that citizens, in exercising their freedoms and rights, may not infringe upon the interests of the state, of society or of the collective, or upon the lawful freedoms and rights of other citizens. That is a general limitation clause of very wide reach — and unlike the German limits in Article 5(2) or the ECHR limits in Article 10(2), there is no independent court applying a proportionality test to it.

That is the structural fact, and it matters more than any individual clause. Under Article 1, as amended in 2018, the leadership of the Communist Party of China is the defining feature of socialism with Chinese characteristics. The National People's Congress is the highest organ of state power; its Standing Committee, not a separate constitutional court, holds the power to interpret the constitution. **Chinese courts do not exercise judicial review of legislation, and a citizen cannot go to court to have a statute struck down for violating Article 35.** The rights in the text are not, in the American or German sense, judicially enforceable against the state.

So the four questions produce a coherent picture. Who makes the law: the NPC, under Party leadership. Who can overrule them: no independent body. What is written down as a right: a broad catalogue including six expressive freedoms. What happens when someone uses it: this is the empirical question, and it is the one you must research rather than assume — using press-freedom monitoring, documented prosecutions, and the operation of the censorship and licensing system, and being honest about which sources you trust and why.

Two further things a serious student should hold.

First, do not flatten a country of 1.4 billion people into a single sentence. There is real legal development in China — administrative litigation against state agencies, contract and property law, a civil code — and there is genuine domestic argument about law and governance. "No independent constitutional review of rights against the state" is a precise claim and defensible; "there is no law in China" is neither.

Second, apply the same scrutiny back. If your test is whether a constitutional right is enforceable in practice against the government, run that test on your own country too, with the same evidentiary standard. That is not false equivalence — the answers will differ, and by a lot — but a comparison is only worth something if the measuring instrument does not change when you turn it around.

A note on sources: China's own copyright law excludes laws, regulations and official documents, and their official translations, from copyright protection, which is why the constitutional text can be quoted here directly.`,
      resources: [NPC_CN, CCM],
      assignment: {
        prompt: 'Article 35 names six expressive freedoms; the First Amendment names five. Research how each is enforced when a citizen actually invokes it, citing your sources and saying why you trust them. Then answer the real question: what is a constitutional right worth without an independent body able to enforce it against the state — and what does your answer imply about how you should read any constitution, including your own?',
        ...ASSIGN,
      },
    },

    // ── 6. Japan ──────────────────────────────────────────────────────────────
    {
      id: 'civ-comp-japan',
      title: 'Japan: Four Words of Difference',
      blurb: 'Two constitutions, both public domain, fifty-seven years apart — the cleanest before-and-after pair in the world.',
      minutes: 24,
      standardIds: ['D2.Civ.4.9-12', 'D2.Civ.13.9-12'],
      body: `Japan offers something no other country in this strand does: two complete constitutions, both in the public domain, close enough in time to compare directly and different enough to make the comparison teach.

The Meiji Constitution of 1889, Article 29:

> "Japanese subjects shall, within the limits of law, enjoy the liberty of speech, writing, publication, public meetings and associations."

The Constitution of Japan of 1946, Article 21:

> "Freedom of assembly and association as well as speech, press and all other forms of expression are guaranteed. No censorship shall be maintained, nor shall the secrecy of any means of communication be violated."

Put them side by side and the difference is almost entirely four words: **within the limits of law**. In 1889 the liberty exists inside whatever boundary the law draws, so any statute restricting speech is by definition consistent with the guarantee — the right is real but it is subordinate, and the legislature holds the ceiling. In 1946 the guarantee is stated flat, censorship is prohibited outright, and the secrecy of communications is protected in the same breath.

Notice also *subjects* becoming, in the 1946 document, a people from whom sovereign power derives. The grammatical change tracks the constitutional one exactly.

Two more features make Japan essential to this strand.

**Article 9.** Japan renounces war as a sovereign right of the nation and the threat or use of force as a means of settling international disputes. No other major constitution says this. What it permits in practice — self-defence forces, collective self-defence, the reinterpretations successive governments have adopted — is one of the most sustained constitutional arguments in the democratic world, conducted almost entirely through interpretation rather than amendment.

**It has never been amended.** Article 96 requires a two-thirds vote of both houses of the Diet followed by a majority in a national referendum, and since coming into force in 1947 the text has not changed once. That makes Japan the most stable constitutional text among large democracies by a wide margin, and it raises a genuinely hard question: is a constitution that never changes a sign of durable consensus, or of an amendment procedure so demanding that the country routes real constitutional change through reinterpretation instead — which is precisely what happened with Article 9?

The Japanese Supreme Court has the power of judicial review under Article 81 but has used it to strike down legislation only a small number of times in its history, far less often than its American counterpart. Set that beside a text with strong stated guarantees and you get the question this lesson is really for: how much of a constitution's force comes from the words, and how much from the institutions willing to enforce them? Japan and China give you very different texts; Japan and the United States give you similar texts with different enforcement patterns. Three cases, two variables, and a genuinely instructive triangle.

Both Japanese constitutions are public domain, which is why the whole comparison can be done here in the actual words rather than in someone's summary of them.`,
      resources: [JAPAN_GOV, MEIJI, CCM],
      assignment: {
        prompt: 'Write a close reading of the four words "within the limits of law". Explain precisely what work they do in the 1889 text, what changes when they are removed in 1946, and find one other constitution in this strand that uses a similar device. Then argue: is a constitution that has never been amended in nearly eighty years a strength or a warning sign?',
        ...ASSIGN,
      },
    },

    // ── 7. Brazil ─────────────────────────────────────────────────────────────
    {
      id: 'civ-comp-brazil',
      title: 'Brazil: When Housing Is a Right',
      blurb: 'The "Citizen Constitution" made health, education and housing enforceable rights — and then had to pay for them.',
      minutes: 24,
      standardIds: ['D2.Civ.6.9-12', 'D2.Civ.13.9-12'],
      body: `Brazil's 1988 Constitution was written immediately after two decades of military dictatorship, by people determined that the next document would leave nothing to trust. The result is one of the longest constitutions in the world, and the nickname it was given on the day of its promulgation — *Constituição Cidadã*, the Citizen Constitution — tells you what its authors thought they were doing.

The length is the point, not a flaw to apologise for. A constitution drafted by people who have just watched rights disappear does not leave things implicit. Article 5 alone runs to dozens of enumerated individual rights and guarantees. Two of them cover expression: the expression of thought is free, with anonymity forbidden; and the expression of intellectual, artistic, scientific and communications activity is free, independent of censorship or licence.

Pause on **anonymity being forbidden**. Almost every other constitution in this strand is silent on the question, and American doctrine has protected anonymous political speech since the pamphlet wars. Brazil made the opposite choice in its constitutional text, and the reasoning is traceable: a country emerging from a period of anonymous denunciation and clandestine state violence wrote accountability for one's own words into the guarantee itself. Whether that protects against defamation and disinformation or chills exactly the speech most in need of protection is a live argument, and it has become sharply more live in the era of platform speech.

The feature that makes Brazil indispensable to this strand, though, is Article 6. It lists as **social rights**: education, health, food, work, housing, transport, leisure, security, social security, protection of motherhood and childhood, and assistance to the destitute.

Read that list again as a lawyer rather than as a reader. In the American constitutional tradition, rights are overwhelmingly *negative* — restraints on what government may do to you. Brazil's Article 6 is a list of *positive* rights: things the state must provide. And in Brazil these are not aspirational preamble language. They are justiciable. Citizens sue for them. The most studied consequence is the phenomenon usually called the judicialisation of health — enormous numbers of individual lawsuits demanding that the state supply particular medicines and treatments, which courts frequently grant.

That produces the honest dilemma this lesson exists to teach. When a court orders the state to fund one claimant's expensive treatment, the claimant's constitutional right has been vindicated — genuinely, and the person may be alive because of it. The money comes from a health budget that was allocated by a legislature, so something else is now unfunded, and the people who lose that funding are diffuse, unnamed and did not file suit. Individual litigants are on average better resourced than the median citizen, so a mechanism designed to protect the vulnerable can systematically redirect resources upward.

So: does making a social provision a right a court can enforce make it more real, or does it move allocation decisions from a body that must weigh everyone's claims to a body that only ever sees one claimant at a time? Brazil is the world's largest live experiment in that question, and the answer is contested inside Brazil by people who all support the underlying rights.

The 1988 text has been amended well over a hundred times, which follows from its length: when the constitution specifies detail that other countries leave to ordinary legislation, ordinary policy change requires constitutional amendment.`,
      resources: [STF_BR, CCM],
      assignment: {
        prompt: 'Compare Brazil’s Article 6 social rights with the negative-rights structure of the US Bill of Rights. Then take a position on the judicialisation problem: when a court orders the state to fund one person’s treatment, whose claim was heard and whose was not? Argue it with the money in view, not just the principle.',
        ...ASSIGN,
      },
    },

    // ── 8. Argentina ──────────────────────────────────────────────────────────
    {
      id: 'civ-comp-argentina',
      title: 'Argentina: Constitutions After Rupture',
      blurb: 'A text that survived repeated coups — and a country that built a civic culture out of prosecuting them.',
      minutes: 24,
      standardIds: ['D2.Civ.13.9-12', 'D2.Civ.10.9-12'],
      body: `Argentina's Constitution dates from 1853 and was closely modelled on the United States: a federal republic, a presidential executive, a bicameral congress, a supreme court. If constitutional design alone determined outcomes, the twentieth century of the two countries should have looked broadly similar. It did not. Argentina experienced repeated military coups and long periods in which the constitutional order was suspended outright.

That fact is the lesson, and it should unsettle anyone who believes a well-designed text is sufficient. **The same institutional blueprint produced very different histories**, which means the blueprint was never the whole explanation. Argentina forces a comparative civics student to take seriously the things that are not in any constitution: the military's relationship to civilian authority, the strength of parties and courts as institutions rather than as chapters, economic shocks, and whether losing an election is survivable for those who lose it.

The expressive-freedom provisions come from the American lineage and show it. Article 14 guarantees to all inhabitants the right of publishing their ideas through the press **without prior censorship**. Article 32 provides that the federal Congress shall not enact laws restricting the freedom of the press or establishing federal jurisdiction over it. Note what Article 32 does: it is a federalism provision, restricting the *national* legislature specifically — an unusually explicit structural protection, and a direct descendant of the American debate about which government is the danger.

Two things then make Argentina distinctive rather than derivative.

**The 1994 reform gave a list of international human-rights treaties constitutional rank.** Not merely ratified them — placed them at the top of the domestic hierarchy alongside the constitution itself. That is a genuine transfer of interpretive authority outward, to treaty bodies and international courts whose members no Argentine voter elects. The case for it is that a country which has lost its constitutional order before has good reason to anchor itself to commitments a future domestic government cannot quietly repeal. The case against is that self-government means the governed decide, and a right whose meaning is fixed abroad is one the people can no longer argue about at home. Both are serious, and this is one of the sharpest live questions in comparative constitutional law.

**Argentina prosecuted its own.** After the 1976–83 dictatorship, the CONADEP commission produced the *Nunca Más* report in 1984, and in 1985 the country tried the members of the military juntas in a civilian court — while the officers convicted still had living institutional support. Amnesty laws and pardons followed, and were later annulled, with prosecutions resuming in the 2000s. It is not a clean story, and presenting it as one would be a disservice. But the underlying civic decision — that the crimes of a prior regime are a matter for ordinary courts applying ordinary law, argued in public and on the record — is one of the most consequential things any democracy in this strand has done, and it has shaped how transitional justice is attempted everywhere since.

That gives Argentina a role no other case here fills. Every other lesson asks how a constitution constrains a functioning government. Argentina asks what a country does *after* the constraint has already failed — and whether the answer to that question is itself a part of the constitution, even though it is written nowhere in the text.`,
      resources: [ARG, NUNCA_MAS, CCM],
      assignment: {
        prompt: 'Argentina copied the American constitutional design and got a different twentieth century. Name three factors outside the constitutional text that you think account for the divergence, with evidence for each. Then argue the 1994 question: does giving international human-rights treaties constitutional rank strengthen rights or weaken self-government? Take both sides before you decide.',
        ...ASSIGN,
      },
    },

    // ── 9. Capstone ───────────────────────────────────────────────────────────
    {
      id: 'civ-comp-capstone',
      title: 'The Eight Promises',
      blurb: 'Every constitution here guarantees free expression. Put the eight clauses on one page and account for the differences.',
      minutes: 45,
      standardIds: ['D2.Civ.6.9-12', 'D2.Civ.10.9-12', 'D2.Civ.13.9-12'],
      body: `You now have eight constitutional promises of free expression: the United Kingdom by way of Article 10 of the Convention, France's Article 11 of 1789, Germany's Article 5, China's Article 35, Japan's Article 21, Brazil's Article 5, Argentina's Articles 14 and 32, and the American First Amendment. Open the Seven Nations reader and put them on one page.

Every one of them guarantees free expression. That is the finding that should stop you. If constitutional text alone determined outcomes, these eight countries would have had the same twentieth century, and they did not.

Work through four things, in order.

**First, sort the clauses by their grammar, not by your opinion of the country.** Some restrain a named institution — "Congress shall make no law", "the federal Congress shall not enact laws". Some declare a right belonging to a person — "everyone has the right", "every person shall have the right". Some grant a right to a defined class — "citizens of the People's Republic of China enjoy", "Japanese subjects shall". You will find the sorting does not group the way you expected, and that surprise is the lesson.

**Second, find the limitation clause in each and read it as carefully as the guarantee.** Article 10(2) of the Convention, the "abuses defined by law" of 1789, Article 5(2) of the Basic Law, Article 51 of the Chinese constitution, the "within the limits of law" of Meiji Japan. Almost every real system limits expression somewhere. The interesting question is never *whether* — it is who decides the limit, by what test, and whether anyone independent can say they got it wrong.

**Third, apply the delivery question evenly.** For each country: when a person actually publishes something the government does not want published, what happens? Cite evidence — court records, press-freedom monitoring, documented prosecutions — and state which sources you trust and why. Run the test on the United States with the same instrument you used on everyone else. The answers will differ, and some will differ enormously; the discipline is that the instrument does not change.

**Fourth, answer the question this whole strand was built to ask.** Rank-order the eight by the strength of the *text* alone. Then rank-order them by the strength of the *practice*. Compare your two lists. Wherever a country's position moves, you have found something that a constitution does not contain — an independent judiciary, a professional civil service, a press that survives commercially, a military that stays in barracks, a losing party that concedes. Name what moved each one.

That gap between the two lists is the real content of comparative civics, and it is why this strand refuses to hand you a scoreboard. A constitution is a promise. What a promise is worth depends on everything around it — and that is as true of your own country's promise as of anyone else's.

Finally, go back to the document you wrote in the first lesson, before you had read any of this, and mark what you got wrong.`,
      resources: [CCM, NARA, ECHR],
      assignment: {
        prompt: 'Write the comparative essay: all eight free-expression clauses, sorted by grammar, with each limitation clause read as closely as its guarantee. Produce your two rank-orders — text and practice — and explain every country whose position moves between them. Cite evidence throughout, apply the same standard to the United States as to everyone else, and finish by marking what your first-lesson document got wrong.',
        tool: 'LOREA',
        postTag: 'civicshall',
      },
    },
  ],
};
