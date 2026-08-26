/**
 * comparativeCivics — the nation modules for Civics Hall.
 *
 * One template, re-instantiated seven times: **Founding Texts · Government Structure · Rights
 * Tradition · Civic Life Today**. Every module ends with the same capstone question, which is the
 * whole point of the exercise:
 *
 *   "Read their founding text next to ours — what did they promise, and how is it kept?"
 *
 * WHY TEXT, NOT SUMMARY: the comparison only teaches something if learners read the actual
 * constitutional language. Putting the US First Amendment beside Germany's Article 5, Japan's
 * Article 21, Brazil's Article 5-IV and China's Article 35 — in the real words — is a different
 * exercise from reading four paragraphs about free speech, and it is only possible because every
 * text below is public domain or an official translation excluded from copyright.
 *
 * LICENCE NOTES, verified (see docs/ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md):
 *  - UK: as-enacted texts on legislation.gov.uk are Open Government Licence v3.0 (CC BY compatible).
 *  - France: French official acts are excluded from copyright; the Conseil constitutionnel publishes
 *    an official English 1958 Constitution, and the 1789 Declaration is public domain everywhere.
 *  - Germany: the Basic Law's *German* text is free under §5 UrhG, but the standard English
 *    translation is commissioned — so it is **LINK-ONLY**. The 1849 Paulskirche constitution is PD.
 *  - China: PRC Copyright Law Art. 5 excludes laws and their **official translations** from
 *    protection, so the official English 1982 Constitution is usable; the 1912 provisional
 *    constitution is PD.
 *  - Japan: the 1946 Constitution's official English text is a 1946 government edict — public
 *    domain. The 1889 Meiji Constitution is PD, giving a rare before/after pair.
 *  - Brazil: Law 9.610/98 Art. 8 excludes official texts; the STF/Senate English edition is an
 *    official publication.
 *  - Argentina: the 1853/1994 text is PD; the Library of Congress English PDF is distributed free.
 *    Treated as link-preferred out of caution.
 *
 * TEACHING POSTURE: this module does not rank nations. It asks learners to read what each state
 * promised its people and to investigate, with evidence, how that promise is honoured — including
 * for their own country. The comparison is meant to be uncomfortable in every direction.
 */

export interface NationClause {
  /** e.g. 'Article 5' — how the source itself labels it. */
  label: string;
  /** The actual constitutional text. Public domain or an official translation. */
  text: string;
  /** What a learner should notice, phrased as a question rather than a verdict. */
  probe: string;
}

export interface NationModule {
  id: string;
  nation: string;
  flag: string;
  accent: string;
  /** One line naming what makes this case instructive. */
  hook: string;
  foundingTexts: { title: string; year: string; note: string; source: { label: string; url: string }; hostable: boolean }[];
  structure: string;
  rightsTradition: string;
  civicLife: string;
  /** The free-expression clause, for the side-by-side exercise. */
  speechClause: NationClause;
  capstone: string;
}

/** The United States entry is included so the side-by-side always has its anchor. */
export const US_ANCHOR: NationClause = {
  label: 'First Amendment (1791)',
  text: '“Congress shall make no law respecting an establishment of religion, or prohibiting the free exercise thereof; or abridging the freedom of speech, or of the press; or the right of the people peaceably to assemble, and to petition the Government for a redress of grievances.”',
  probe: 'It restrains Congress — a branch of government — rather than granting a right. Who is bound, and who is not?',
};

export const NATION_MODULES: NationModule[] = [
  {
    id: 'uk',
    nation: 'United Kingdom',
    flag: '🇬🇧',
    accent: '#3B82F6',
    hook: 'A constitution with no single document — and the origin of most of the ideas in the American one.',
    foundingTexts: [
      { title: 'Magna Carta', year: '1215', note: 'Clauses 39–40 survive in force and seeded due process.', source: { label: 'Wikisource — Magna Carta', url: 'https://en.wikisource.org/wiki/Magna_Carta' }, hostable: true },
      { title: 'Bill of Rights', year: '1689', note: 'Settled that the Crown cannot suspend laws or tax without Parliament.', source: { label: 'legislation.gov.uk (OGL v3.0)', url: 'https://www.legislation.gov.uk/aep/WillandMarSess2/1/2' }, hostable: true },
      { title: 'Human Rights Act', year: '1998', note: 'Brought the European Convention rights into domestic courts.', source: { label: 'legislation.gov.uk (OGL v3.0)', url: 'https://www.legislation.gov.uk/ukpga/1998/42' }, hostable: true },
    ],
    structure: 'Parliamentary sovereignty rather than a supreme written constitution: Parliament can, in principle, change any rule by ordinary legislation, and no court may strike a statute down. The head of state is hereditary and almost entirely ceremonial; the executive sits inside the legislature rather than separate from it. Power has been devolved unevenly to Scotland, Wales and Northern Ireland, which creates a federal-feeling system without a federal constitution.',
    rightsTradition: 'Rights emerged case by case through the common law — protections built by judges resolving disputes, rather than declared in advance. The 1998 Act layered a declared-rights model on top, and the tension between the two approaches is a live constitutional argument.',
    civicLife: 'No codified constitution means constitutional change can happen by ordinary vote, which makes convention and self-restraint load-bearing. Recent decades have added referendums and citizens’ assemblies to a system built around representation.',
    speechClause: {
      label: 'Human Rights Act 1998, Schedule 1, Article 10',
      text: '“Everyone has the right to freedom of expression. This right shall include freedom to hold opinions and to receive and impart information and ideas without interference by public authority and regardless of frontiers… The exercise of these freedoms, since it carries with it duties and responsibilities, may be subject to such formalities, conditions, restrictions or penalties as are prescribed by law and are necessary in a democratic society…”',
      probe: 'The right arrives with an explicit limitation clause attached. Compare that with the American text, which states the protection and leaves the limits to be worked out by courts. Which approach is more honest, and which is more protective?',
    },
    capstone: 'The UK has rights without a single document; the US has a document that constrains its legislature. Which system better protected free expression in the last decade — and what evidence would settle it?',
  },
  {
    id: 'france',
    nation: 'France',
    flag: '🇫🇷',
    accent: '#6B0099',
    hook: 'Rights declared as universal truths — for all humanity, not just citizens of one state.',
    foundingTexts: [
      { title: 'Declaration of the Rights of Man and of the Citizen', year: '1789', note: 'Still legally operative — the Conseil constitutionnel decides cases on it.', source: { label: 'Conseil constitutionnel (English)', url: 'https://www.conseil-constitutionnel.fr/en/declaration-of-human-and-civic-rights-of-26-august-1789' }, hostable: true },
      { title: 'Constitution of the Fifth Republic', year: '1958', note: 'Created a strong presidency after the instability of the Fourth Republic.', source: { label: 'Conseil constitutionnel (English)', url: 'https://www.conseil-constitutionnel.fr/en/constitution-of-4-october-1958' }, hostable: true },
      { title: 'Law on the Separation of the Churches and the State', year: '1905', note: 'The legal foundation of laïcité.', source: { label: 'Légifrance', url: 'https://www.legifrance.gouv.fr/' }, hostable: false },
    ],
    structure: 'Semi-presidential: a directly elected president with substantial independent powers, alongside a prime minister accountable to the National Assembly. When president and assembly majority come from opposing parties — cohabitation — the balance shifts markedly, which makes France an unusually clear case study in how the same text produces different governments.',
    rightsTradition: 'The 1789 Declaration speaks of the rights of *man*, not of Frenchmen — a universalist claim rather than an inheritance. That framing produces a distinctive approach: the republic recognises citizens as individuals and is reluctant to recognise groups, which is why French law resists collecting ethnic statistics and why laïcité restricts religious display in public institutions in ways many other democracies do not.',
    civicLife: 'Protest has genuine constitutional standing as a mode of participation, not merely a nuisance to be policed. Referendums have been used to settle constitutional questions, and the republican model of citizenship — assimilationist rather than multicultural — remains actively contested.',
    speechClause: {
      label: 'Declaration of 1789, Article 11',
      text: '“The free communication of thoughts and of opinions is one of the most precious rights of man: any citizen thus may speak, write, print freely, save to respond to the abuse of this liberty in the cases determined by the law.”',
      probe: 'The limitation — “abuse of this liberty… determined by the law” — is inside the sentence that grants the right. What does building the exception into the grant do, compared with the American structure?',
    },
    capstone: 'France declared rights for all humanity in 1789 while maintaining colonies for a century and a half afterwards. What does that gap teach about the relationship between a declared right and a delivered one?',
  },
  {
    id: 'germany',
    nation: 'Germany',
    flag: '🇩🇪',
    accent: '#F59E0B',
    hook: 'A constitution written by people who had watched a democracy vote itself out of existence.',
    foundingTexts: [
      { title: 'Paulskirche Constitution', year: '1849', note: 'The liberal constitution that failed — the “before” in the pair.', source: { label: 'Wikisource (public domain)', url: 'https://en.wikisource.org/wiki/Constitution_of_the_German_Empire_(1849)' }, hostable: true },
      { title: 'Basic Law (Grundgesetz)', year: '1949', note: 'Deliberately called a Basic Law rather than a constitution, pending reunification.', source: { label: 'gesetze-im-internet.de — English translation (link only)', url: 'https://www.gesetze-im-internet.de/englisch_gg/englisch_gg.html' }, hostable: false },
    ],
    structure: 'Federal parliamentary republic with a mostly ceremonial president and a chancellor who can only be removed by a *constructive* vote of no confidence — the Bundestag must elect a successor in the same act. That single mechanism, designed to prevent the paralysis of the Weimar years, has made German governments unusually stable. The Federal Constitutional Court is powerful and frequently decisive.',
    rightsTradition: 'Article 1 begins “Human dignity shall be inviolable”, and dignity — rather than liberty — is the organising value from which other rights are read. Germany also practises *streitbare Demokratie*, militant democracy: parties and associations aiming to abolish the democratic order can be banned, and some articles are protected by an eternity clause that cannot be amended at all. That is a democracy that has decided it will not consent to its own abolition.',
    civicLife: 'The state funds civic education directly through a federal agency, on the reasoning that democratic competence is public infrastructure rather than a private matter. Works councils give employees formal voice in firms.',
    speechClause: {
      label: 'Basic Law, Article 5',
      text: '“Every person shall have the right freely to express and disseminate his opinions in speech, writing and pictures… There shall be no censorship. These rights shall find their limits in the provisions of general laws, in provisions for the protection of young persons, and in the right to personal honour.”',
      probe: '“No censorship” sits in the same article as limits protecting personal honour. Germany also bans some symbols and denial of historical atrocity. Is that a restriction of free expression, or a condition of it?',
    },
    capstone: 'Germany decided that a democracy may defend itself by banning anti-democratic parties. The US made the opposite choice. Argue both — then say which you would want in your own country, and what you are risking either way.',
  },
  {
    id: 'china',
    nation: 'China',
    flag: '🇨🇳',
    accent: '#EF4444',
    hook: 'A written constitution with a broad rights catalogue, inside a party-led state — the sharpest text-versus-practice case available.',
    foundingTexts: [
      { title: 'Provisional Constitution of the Republic of China', year: '1912', note: 'The republican “before” — public domain, and a useful contrast.', source: { label: 'Wikisource (public domain)', url: 'https://en.wikisource.org/wiki/Provisional_Constitution_of_the_Republic_of_China' }, hostable: true },
      { title: 'Constitution of the People’s Republic of China', year: '1982 (amended 2018)', note: 'Official English translation; PRC law excludes official translations from copyright.', source: { label: 'The State Council of the PRC (official English)', url: 'https://english.www.gov.cn/archive/lawsregulations/201911/20/content_WS5ed8856ec6d0b3f0e9499913.html' }, hostable: true },
    ],
    structure: 'The National People’s Congress is constitutionally the highest organ of state power, operating on democratic centralism — decisions, once made, bind all levels. In practice the Communist Party leads the state, a relationship the 2018 amendment wrote explicitly into the constitution’s body. Courts are not designed as an independent check in the separation-of-powers sense.',
    rightsTradition: 'The text contains an extensive rights catalogue — speech, press, assembly, religious belief, and social and economic rights that many Western constitutions omit. It also conditions rights on not harming the interests of the state and society. This is precisely why the module is here: it forces the question of what a written right *is* when the mechanism for enforcing it against the state differs fundamentally.',
    civicLife: 'Participation runs through local people’s congresses, the petitioning (xinfang) system for grievances, and dense neighbourhood-level administration. Village-level elections exist. The relationship between these channels and the ones a Western reader expects is a genuine object of study, not a rhetorical question.',
    speechClause: {
      label: 'Constitution of the PRC, Article 35',
      text: '“Citizens of the People’s Republic of China enjoy freedom of speech, of the press, of assembly, of association, of procession and of demonstration.”',
      probe: 'The words are as broad as any in this module — broader than the American text in what they enumerate. Read it with Article 51, which conditions rights on not infringing state and collective interests. What does the pairing do?',
    },
    capstone: 'Article 35 promises more freedoms by name than the First Amendment does. Investigate how each is enforced — and then ask what your findings imply about the value of constitutional text on its own.',
  },
  {
    id: 'japan',
    nation: 'Japan',
    flag: '🇯🇵',
    accent: '#EC4899',
    hook: 'Two constitutions, both public domain, fifty-seven years apart — the clearest before/after pair in the world.',
    foundingTexts: [
      { title: 'Constitution of the Empire of Japan (Meiji)', year: '1889', note: 'Sovereignty in the Emperor; rights granted “within the limits of law”.', source: { label: 'Wikisource (public domain)', url: 'https://en.wikisource.org/wiki/Constitution_of_the_Empire_of_Japan' }, hostable: true },
      { title: 'The Constitution of Japan', year: '1946', note: 'Official English text, promulgated 1946 — public domain. Never amended since.', source: { label: 'Japanese Law Translation (official)', url: 'https://www.japaneselawtranslation.go.jp/en/laws/view/174/en' }, hostable: true },
    ],
    structure: 'Parliamentary cabinet government under an emperor who is “the symbol of the State” with no powers of government. The Diet is bicameral and the prime minister is designated from it. Sovereignty was relocated from the Emperor to the people in a single document, which is why the pair is so instructive.',
    rightsTradition: 'The 1946 text contains an unusually generous rights catalogue, including Article 25’s right to “minimum standards of wholesome and cultured living” — a social right stated as an entitlement. And Article 9 renounces war and the maintenance of war potential, a provision with no close parallel, which has been reinterpreted repeatedly rather than amended.',
    civicLife: 'Neighbourhood associations handle a great deal of local coordination; PTA structures are unusually strong; candidate support organisations (kōenkai) shape electoral politics in ways party labels do not capture.',
    speechClause: {
      label: 'Constitution of Japan, Article 21',
      text: '“Freedom of assembly and association as well as speech, press and all other forms of expression are guaranteed. No censorship shall be maintained, nor shall the secrecy of any means of communication be violated.”',
      probe: 'The clause guarantees expression and separately protects the secrecy of communications. What does adding communications privacy to a speech article recognise that the eighteenth-century texts could not have?',
    },
    capstone: 'Read Meiji Article 29 (“Japanese subjects shall, within the limits of law, enjoy the liberty of speech”) beside 1946 Article 21. The four words “within the limits of law” are the entire difference. What do they do?',
  },
  {
    id: 'brazil',
    nation: 'Brazil',
    flag: '🇧🇷',
    accent: '#06D6A0',
    hook: 'The “Citizen Constitution” — one of the longest rights catalogues on earth, written straight out of a dictatorship.',
    foundingTexts: [
      { title: 'Constitution of the Empire of Brazil', year: '1824', note: 'Imperial constitution with a “moderating power” held by the emperor.', source: { label: 'Wikisource (public domain)', url: 'https://en.wikisource.org/wiki/Constitution_of_the_Empire_of_Brazil' }, hostable: true },
      { title: 'Constitution of the Federative Republic of Brazil', year: '1988', note: 'Official English edition published by the Supreme Federal Court.', source: { label: 'Supremo Tribunal Federal (official English)', url: 'https://www.stf.jus.br/arquivo/cms/legislacaoConstituicao/anexo/brazil_federal_constitution.pdf' }, hostable: true },
    ],
    structure: 'Presidential federalism with a directly elected president, a bicameral national congress, and states with real autonomy. The Supreme Federal Court has an exceptionally wide docket and decides constitutional questions that in other systems would be resolved politically — making it unusually visible in national life.',
    rightsTradition: 'Article 5 alone runs to dozens of numbered guarantees, and the constitution extends well beyond civil liberties into education, health, housing and social security as constitutional rights. Written in 1988 by people emerging from twenty-one years of military rule, it is a document that tried to make backsliding textually difficult, and its length is a direct consequence of that intent.',
    civicLife: 'Voting is compulsory for most adults. Brazil pioneered participatory budgeting in Porto Alegre — residents allocating a real portion of municipal spending directly — which has since been adopted in cities worldwide.',
    speechClause: {
      label: 'Constitution of 1988, Article 5, IV and IX',
      text: '“IV — the expression of thought is free, anonymity being forbidden… IX — the expression of intellectual, artistic, scientific, and communications activities is free, independently of censorship or license.”',
      probe: 'Brazil guarantees free expression and in the same clause forbids anonymity. The United States has protected anonymous speech. Which position better serves accountability, and which better serves the vulnerable speaker?',
    },
    capstone: 'Brazil made housing, health and education constitutional rights. What changes when a social provision is a right a court can enforce rather than a policy a legislature may choose?',
  },
  {
    id: 'argentina',
    nation: 'Argentina',
    flag: '🇦🇷',
    accent: '#00DAF3',
    hook: 'A constitution that survived repeated ruptures — and a country that built a civic culture around remembering them.',
    foundingTexts: [
      { title: 'Constitution of the Argentine Nation', year: '1853 (reformed 1994)', note: 'Heavily influenced by the US model, with significant divergences.', source: { label: 'Biblioteca del Congreso de la Nación (English)', url: 'https://bcn.gob.ar/uploads/Constitucion-Nacional-Argentina-en.pdf' }, hostable: false },
      { title: 'Alberdi, Bases y puntos de partida', year: '1852', note: 'The intellectual blueprint the 1853 constitution was drafted from.', source: { label: 'Public domain (Spanish)', url: 'https://es.wikisource.org/wiki/Bases_y_puntos_de_partida_para_la_organizaci%C3%B3n_pol%C3%ADtica_de_la_Rep%C3%BAblica_Argentina' }, hostable: true },
    ],
    structure: 'Presidential federal republic modelled partly on the United States, with provinces retaining significant powers. The federal government has historically held a power of intervention in provinces, used often enough to shape the real balance. The 1994 reform added a chief of cabinet and gave constitutional rank to a set of international human-rights treaties — an unusual and consequential move.',
    rightsTradition: 'Argentina developed the *amparo*, a fast judicial remedy for the violation of a constitutional right, which spread across Latin America and has no exact US equivalent. Giving human-rights treaties constitutional rank means international standards are directly enforceable domestically.',
    civicLife: 'Voting is compulsory. Civic memory is an organised public practice: after the last dictatorship, the *Nunca Más* report and subsequent trials made accountability for state violence a continuing part of national life rather than a closed chapter.',
    speechClause: {
      label: 'Constitution of the Argentine Nation, Article 14',
      text: '“All the inhabitants of the Nation are entitled to the following rights, in accordance with the laws that regulate their exercise, namely: … of publishing their ideas through the press without previous censorship…”',
      probe: 'Note the two qualifications in one sentence: rights belong to all *inhabitants* rather than citizens, and are exercised “in accordance with the laws that regulate” them. What does each phrase change?',
    },
    capstone: 'Argentina gave international human-rights treaties constitutional rank. Does binding a nation to outside standards strengthen rights, or weaken self-government? Argue both before deciding.',
  },
];

export const nationById = (id: string) => NATION_MODULES.find(n => n.id === id);
export default NATION_MODULES;
