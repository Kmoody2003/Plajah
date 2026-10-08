import type { CourseModule } from '../courseModule';
import { mcq } from '../courseKit';

const ID = 'law-conlaw';
const lid = (n: number) => `${ID}.l${String(n).padStart(2, '0')}`;
const m = (l: number, n: number, lv: 1 | 2 | 3, p: string, c: [string, string, string, string], a: 0 | 1 | 2 | 3, h: string, e: string) =>
  mcq(lid(l), n, lv, p, c, a, h, e);
const cs = (ref: string) => ({ kind: 'case' as const, ref });
const cn = (ref: string) => ({ kind: 'concept' as const, ref });
const st = (ref: string) => ({ kind: 'statute' as const, ref });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: ID,
    label: 'Constitutional Law',
    blurb: 'A first-year course in United States constitutional law: judicial review, the structure of government, federalism, individual rights, the First Amendment, access to courts, and how to understand doctrinal change.',
    accent: '#C9A227',
    framework: 'plajah-law',
    tracks: [
      {
        id: `${ID}.t1`,
        title: 'Structure: Courts, Branches and States',
        blurb: 'Who decides, who governs, and how power is divided.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: lid(1),
            title: 'Judicial Review',
            blurb: 'Marbury v. Madison and the courts\' power to say what the Constitution means.',
            minutes: 13,
            body:
`Judicial review is the power of courts to decide whether government action conforms to the Constitution and to refuse to give effect to action that does not. The Constitution does not state this power in so many words. Its textual hooks are Article III, which extends the judicial power to cases arising under the Constitution, and Article VI, which makes the Constitution the supreme law of the land. The classic source is Marbury v. Madison (1803). William Marbury was appointed a justice of the peace by the outgoing Adams administration, but his commission was not delivered, and he asked the Supreme Court for a writ of mandamus under a provision of the Judiciary Act of 1789. Chief Justice Marshall reasoned in three steps: Marbury had a right to the commission, the law ordinarily provides a remedy for a violated right, but the Court could not issue the writ because the statute purported to give the Court original jurisdiction beyond what Article III allows. The statute conflicted with the Constitution, and since it is emphatically the province and duty of the judicial department to say what the law is, the conflicting statute could not be applied. The decision let the Court avoid a confrontation with the Jefferson administration while establishing its authority.

The practice extended to the states. Martin v. Hunter's Lessee (1816) upheld the Supreme Court's power to review state court decisions on federal questions, and Cooper v. Aaron (1958), arising from resistance to school desegregation in Little Rock, announced that the Court's interpretation of the Constitution in Brown v. Board of Education is binding on the states. Critics of the strong version of that claim point out that other officials also take an oath to the Constitution and may interpret it in carrying out their own duties; defenders respond that a stable settlement of meaning requires a final arbiter. Both positions are held by serious scholars, and a student should be able to state each.

Judicial review has limits built into doctrine. Courts decide only cases or controversies, so they do not give advisory opinions, and they require standing, ripeness and the absence of mootness, which later lessons examine. They avoid deciding constitutional questions when a case can be resolved on other grounds, and they presume statutes are constitutional, with the challenger carrying the burden under deferential standards. Congress can control much of the federal courts' jurisdiction, subject to constitutional limits. Some questions are called nonjusticiable political questions, a doctrine in which courts leave matters to the political branches.

The countermajoritarian difficulty, a phrase from Alexander Bickel, names the tension in unelected judges overriding elected legislatures. Responses include the argument that the Constitution is a precommitment by the people that legislatures cannot override, that courts protect minorities and the democratic process itself, and, from skeptics, that courts should defer more and leave disputed questions to politics. How these views shape doctrine recurs through the course.

Worked example. A state statute requires every government employee to take an oath that conflicts with a First Amendment right. A court hears a worker's challenge and, if it finds a conflict, declares the statute unconstitutional as applied or on its face and enjoins enforcement against the parties; the statute remains on the books until repealed, though precedent makes enforcement unlikely.`,
            asOf: '2026-10',
            anchors: [cs('Marbury v. Madison|1803|US'), cs('Martin v. Hunter\'s Lessee|1816|US'), cs('Cooper v. Aaron|1958|US'), cn('Judicial review and the countermajoritarian difficulty')],
          },
          {
            id: lid(2),
            title: 'Separation of Powers',
            blurb: 'Presidential power, removal, delegation and the administrative state.',
            minutes: 16,
            body:
`The Constitution vests legislative power in Congress, executive power in the President, and judicial power in the courts. Separation of powers doctrine asks whether one branch has taken on powers belonging to another, or has interfered too much with another. Two methods compete. A formalist approach insists on bright lines: if a function is legislative, only Congress, following the procedures of bicameralism and presentment, can perform it. A functionalist approach asks whether the arrangement unduly weakens a branch or aggrandizes another, even if it blurs categories. Real cases often mix them.

Youngstown Sheet & Tube Co. v. Sawyer (1952), the steel seizure case, invalidated President Truman's seizure of steel mills during the Korean War. Justice Jackson's concurrence set out three zones that are still used to analyze presidential power: when the President acts with congressional authorization his power is at its maximum; when Congress is silent he acts in a zone of twilight where the outcome depends on circumstances; and when he acts against Congress's express or implied will, his power is at its lowest ebb and must rest on the President's own constitutional powers.

Legislative action must follow Article I's procedures. INS v. Chadha (1983) held a one-house legislative veto unconstitutional because it altered legal rights without bicameral passage and presentment to the President. Nondelegation doctrine holds that Congress may not give away its legislative power, but the Court has long required only an intelligible principle to guide the agency, a test under which delegations have been upheld, as in Mistretta v. United States (1989). Some justices have urged a stricter approach, as in Gundy v. United States (2019), in which a plurality upheld a delegation while other justices signaled interest in revisiting the doctrine. As of this writing, the Court in FCC v. Consumers' Research (2025) again upheld a delegation under the intelligible principle test. The major questions doctrine, applied in West Virginia v. EPA (2022), asks for clear congressional authorization when an agency claims power of vast economic and political significance. In Loper Bright Enterprises v. Raimondo (2024), the Court overruled Chevron deference, holding that courts must exercise independent judgment about what a statute means.

Removal power is a central issue. Humphrey's Executor v. United States (1935) upheld protections against presidential removal of commissioners of a multimember expert agency, but later cases, including Seila Law LLC v. Consumer Financial Protection Bureau (2020), limited its reach and held that a single director removable only for cause was unconstitutional. Morrison v. Olson (1988) upheld the independent counsel statute under a functional analysis, though the dissent by Justice Scalia has been influential. The question was settled in Trump v. Slaughter (June 29, 2026), where a 6-3 Court held the FTC Act's for-cause removal protection unconstitutional and overruled Humphrey's Executor to the extent anything remained of it. The majority treated the FTC as exercising executive power the President may control; three justices dissented. The opinion noted that agencies exercising no part of the executive power might fall outside the rule, so its reach to such bodies is left for later cases.

The scope of presidential immunity from criminal prosecution was addressed in Trump v. United States (2024), which held that a former President has absolute immunity for core constitutional powers, presumptive immunity for other official acts, and no immunity for unofficial acts. Critics and supporters of the decision differ strongly on its reasoning, and the doctrine continues to develop in lower courts.

Worked example. Congress passes a statute that allows a committee of one chamber to veto any agency rule by resolution. Under Chadha, the veto is unconstitutional because it is legislative in effect but did not pass both houses or go to the President.`,
            asOf: '2026-10',
            anchors: [cs('Youngstown Sheet & Tube Co. v. Sawyer|1952|US'), cs('INS v. Chadha|1983|US'), cs('Trump v. Slaughter|2026|US'), cs('Loper Bright Enterprises v. Raimondo|2024|US'), cs('Seila Law LLC v. Consumer Financial Protection Bureau|2020|US'), cs('Trump v. United States|2024|US'), cs('FCC v. Consumers\' Research|2025|US')],
          },
          {
            id: lid(3),
            title: 'Federalism and the Commerce Clause',
            blurb: 'Enumerated powers and the changing reach of the Commerce Clause.',
            minutes: 15,
            body:
`The federal government is one of enumerated powers, meaning it has only those powers that the Constitution grants. States retain general police power. The Necessary and Proper Clause lets Congress use means that are appropriate to carry out its enumerated powers. McCulloch v. Maryland (1819) upheld Congress's power to charter a national bank, reading the clause as allowing any means that are appropriate, plainly adapted to a legitimate end, and not prohibited, and held that a state cannot tax the federal bank. The case also supports the idea that the Constitution creates a supremacy of federal law within its sphere.

The Commerce Clause gives Congress power to regulate commerce among the several states. Gibbons v. Ogden (1824) read commerce broadly to include navigation and held the power covers commerce that concerns more than one state. During the early twentieth century the Court limited federal power with distinctions between commerce and production, but after 1937 the Court accepted broader power, culminating in Wickard v. Filburn (1942), which upheld federal limits on wheat grown for home consumption because, in the aggregate, such wheat affects the interstate market.

Modern doctrine recognizes three categories of regulation: the channels of interstate commerce, the instrumentalities of interstate commerce and persons or things in it, and activities that substantially affect interstate commerce. United States v. Lopez (1995) struck down the Gun-Free School Zones Act because possessing a gun in a school zone is not an economic activity, and the statute had no jurisdictional element requiring a connection to interstate commerce. United States v. Morrison (2000) held that the civil remedy of the Violence Against Women Act regulated noneconomic activity and exceeded the commerce power. Gonzales v. Raich (2005), by contrast, upheld the application of the Controlled Substances Act to homegrown medical marijuana as part of a broader regulatory scheme for an economic market. In National Federation of Independent Business v. Sebelius (2012), a majority held that the individual insurance mandate was not authorized by the Commerce Clause because it compelled commerce rather than regulating existing activity; the mandate was upheld, however, under the taxing power, as the next lesson explains.

Two ways of reading these cases are useful. One view sees the post-1937 cases as a recognition that a national economy requires national regulation and that the political process, not courts, should police the balance. The other sees Lopez and Morrison as limits that keep the clause from becoming a general police power and preserve state authority, in line with enumeration. Students should be able to frame both.

Worked example. Congress forbids the possession of a firearm within a thousand feet of a school without any finding or jurisdictional element. Under Lopez, the statute is not within the Commerce power, though a different statute with a jurisdictional element requiring that the gun traveled in interstate commerce could be valid.`,
            asOf: '2026-10',
            anchors: [cs('McCulloch v. Maryland|1819|US'), cs('Wickard v. Filburn|1942|US'), cs('United States v. Lopez|1995|US'), cs('Gonzales v. Raich|2005|US'), cs('National Federation of Independent Business v. Sebelius|2012|US')],
          },
          {
            id: lid(4),
            title: 'Taxing, Spending and the Tenth Amendment',
            blurb: 'Money as a federal lever, and the anticommandeering rule.',
            minutes: 14,
            body:
`Congress may lay and collect taxes and spend for the general welfare. The taxing power is broad and does not depend on motive: a tax that raises revenue is valid even if it also discourages conduct. NFIB v. Sebelius (2012) held, in an opinion by Chief Justice Roberts, that the shared responsibility payment for the individual mandate was a valid exercise of the taxing power because it operated like a tax, was collected by the IRS, and was not a penalty for unlawful conduct. Four dissenting justices disagreed, and the Chief Justice's reading of the statute is a good example of reading a law to avoid a constitutional problem.

The spending power lets Congress offer conditioned funds to states. South Dakota v. Dole (1987) upheld a statute withholding a small percentage of federal highway funds from states with a drinking age under twenty-one, and set conditions: the spending must serve the general welfare; conditions must be unambiguous so states can choose knowingly; conditions must be related to the federal interest in the funded program; there must be no independent constitutional bar; and the pressure must not become coercion. In NFIB, seven justices found that the Affordable Care Act's threat to withdraw all existing Medicaid funding if a state refused the expansion was unconstitutionally coercive, the first time the Court found the spending power exceeded on that ground.

The Tenth Amendment reserves to the states or the people powers not delegated to the United States. It does not by itself create a list of state powers, but the Court uses it to protect the states' structural position. National League of Cities v. Usery (1976) tried to protect traditional state functions from federal wage rules and was overruled by Garcia v. San Antonio Metropolitan Transit Authority (1985), which left the protection to the political process. The Court then developed the anticommandeering doctrine: Congress may not command state legislatures to enact or administer a federal regulatory program. New York v. United States (1992) struck down a provision requiring states to take title to radioactive waste, and Printz v. United States (1997) held that Congress cannot require state executive officers to conduct background checks. Murphy v. National Collegiate Athletic Association (2018) held that a federal law prohibiting states from authorizing sports betting commandeered state legislatures. The doctrine does not bar Congress from regulating private parties, from imposing generally applicable laws on states acting as market participants, or from offering conditional incentives. Reno v. Condon (2000) is the usual example: a federal law limiting the resale of driver records was upheld because it regulated state and private databases alike and did not commandeer state officials.

Sovereign immunity under the Eleventh Amendment, as developed, provides states with protection from private suits. Students should keep the doctrines apart: anticommandeering protects states from being conscripted, while sovereign immunity protects them from being sued.

Worked example. Congress passes a statute telling every state legislature to enact a particular gun-licensing scheme. That is a direct command to state legislatures and is invalid under New York and Murphy. Congress could instead offer funds on the condition that states adopt the scheme, subject to the Dole limits.`,
            asOf: '2026-10',
            anchors: [cs('Reno v. Condon|2000|US'), cs('South Dakota v. Dole|1987|US'), cs('New York v. United States|1992|US'), cs('Printz v. United States|1997|US'), cs('Murphy v. National Collegiate Athletic Association|2018|US'), cs('Garcia v. San Antonio Metropolitan Transit Authority|1985|US'), cs('National Federation of Independent Business v. Sebelius|2012|US')],
          },
          {
            id: lid(5),
            title: 'The Dormant Commerce Clause and Preemption',
            blurb: 'When state laws burden interstate commerce or conflict with federal law.',
            minutes: 14,
            body:
`Even when Congress has not acted, the Commerce Clause is read to limit state power. This negative or dormant Commerce Clause doctrine is a judicial inference from the grant to Congress and the concern of the Framers about economic rivalry among states. Critics, including some justices, doubt that the text supports it; defenders point to a long history and the need for a national market. In practice the Court asks first whether a state law discriminates against interstate commerce, in its text or in purpose or effect. Discrimination, such as protecting local business by blocking out-of-state goods, is virtually per se invalid, and survives only if the state shows it serves a legitimate local purpose that cannot be served by nondiscriminatory alternatives. City of Philadelphia v. New Jersey (1978) struck down a state ban on importing out-of-state solid waste.

If the law is facially neutral and has only incidental effects on interstate commerce, courts apply the balancing test of Pike v. Bruce Church, Inc. (1970): the law is valid unless the burden on interstate commerce is clearly excessive in relation to the putative local benefits. National Pork Producers Council v. Ross (2023) rejected a challenge to California's rules on pork sold in the state, with a fractured majority emphasizing that the dormant Commerce Clause does not prohibit all extraterritorial effects and that Pike balancing is difficult for courts to apply when the interests are incommensurable. The case did not overrule Pike but illustrates its narrowing in practice. A state acting as a market participant, buying or selling goods itself, may prefer its own residents, and Congress can authorize state burdens that would otherwise be invalid.

Preemption arises from the Supremacy Clause in Article VI, which makes federal law supreme. Federal law can preempt state law expressly, when a statute says so. It can also do so by implication in two ways. Field preemption occurs when federal regulation is so pervasive that Congress is inferred to have left no room for the states, and conflict preemption occurs when it is impossible to comply with both laws or when state law stands as an obstacle to the accomplishment of federal purposes. Courts begin with a presumption against preemption in fields traditionally occupied by the states, though the strength of the presumption varies in the cases. Arizona v. United States (2012) held several provisions of an Arizona immigration law preempted, in part under field and obstacle theories, illustrating the federal power over immigration.

Students should distinguish the three tools. The dormant Commerce Clause applies when Congress is silent; preemption applies when Congress has spoken or occupied a field; and anticommandeering limits what Congress can demand of states. The Privileges and Immunities Clause of Article IV also protects out-of-state citizens against discrimination regarding fundamental rights, and is distinct from the Fourteenth Amendment's clause of the same name.

Worked example. A state requires that all milk sold there be processed within the state. This facially discriminates against out-of-state processors, so it is virtually per se invalid unless the state shows no less discriminatory alternative could serve a legitimate local purpose. A neutral rule on milk container sizes with some burden on out-of-state sellers is tested under Pike.`,
            asOf: '2026-10',
            anchors: [cs('City of Philadelphia v. New Jersey|1978|US'), cs('Pike v. Bruce Church, Inc.|1970|US'), cs('National Pork Producers Council v. Ross|2023|US'), cs('Arizona v. United States|2012|US')],
          },
        ],
      },
      {
        id: `${ID}.t2`,
        title: 'Individual Rights and the Fourteenth Amendment',
        blurb: 'Incorporation, state action, due process and equal protection.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: lid(6),
            title: 'Incorporation of the Bill of Rights',
            blurb: 'How most of the first ten amendments came to bind the states.',
            minutes: 13,
            body:
`The Bill of Rights was ratified in 1791 as a limit on the federal government. Barron v. Baltimore (1833) held that it did not apply to the states. After the Civil War, the Fourteenth Amendment (1868) provided that no state shall abridge the privileges or immunities of citizens of the United States, deprive any person of life, liberty or property without due process of law, or deny equal protection. The question of whether, and how, the new amendment made the Bill of Rights applicable to the states is called incorporation.

The Privileges or Immunities Clause might have been the natural textual vehicle, but the Slaughter-House Cases (1873) read it narrowly, as protecting only a small set of rights of national citizenship, and the clause has been little used since. The Court instead used the Due Process Clause. Early on, it held that some liberties are so fundamental that they are part of due process, and in Gitlow v. New York (1925) it assumed that freedom of speech is among them. The modern method, selective incorporation, asks whether a given right is fundamental to the American scheme of justice, or deeply rooted in the nation's history and tradition. Duncan v. Louisiana (1968) incorporated the jury trial right in serious criminal cases using the first formulation, and McDonald v. City of Chicago (2010) held the Second Amendment right to keep and bear arms for self-defense applies to the states, using the historical test. Timbs v. Indiana (2019) held that the Excessive Fines Clause is incorporated. Ramos v. Louisiana (2020) held that the Sixth Amendment requires a unanimous jury verdict for serious crimes in state as well as federal court, and rejected the idea that the incorporated right is a watered-down version of the federal right. Few provisions remain unincorporated, including the Third Amendment, the grand jury clause of the Fifth Amendment, the Seventh Amendment civil jury right, and, in some analyses, the prohibition on excessive bail, which the Court has often assumed but not squarely held.

The doctrine matters because of how rights are enforced. Once a right is incorporated, the same standards apply against states and the federal government. The debate among judges and scholars is over method. Total incorporationists, such as Justice Black, argued that the amendment was meant to apply the whole Bill of Rights. Justice Frankfurter favored a case-by-case fundamental fairness test. Some modern justices and scholars, including Justice Thomas in McDonald, would locate incorporation in the Privileges or Immunities Clause, arguing that the original meaning supports it, and that doing so would tie incorporation to the text. Others defend due process incorporation because it is settled and a change would unsettle precedent for little gain, while some argue it is wrong in principle because it intrudes on state autonomy. A student should be able to explain these positions without choosing among them.

Worked example. A state court jury convicts a defendant of a serious felony by a vote of 10 to 2. After Ramos, the verdict violates the Sixth Amendment as incorporated, since unanimity is required in both federal and state trials for serious offenses; the Court later held in Edwards v. Vannoy (2021) that Ramos does not apply retroactively on federal collateral review.`,
            asOf: '2026-10',
            anchors: [cs('Barron v. Baltimore|1833|US'), cs('Duncan v. Louisiana|1968|US'), cs('McDonald v. City of Chicago|2010|US'), cs('Ramos v. Louisiana|2020|US'), cs('Slaughter-House Cases|1873|US')],
          },
          {
            id: lid(7),
            title: 'State Action',
            blurb: 'Why most constitutional rights bind only the government.',
            minutes: 12,
            body:
`Most constitutional rights restrain the government, not private parties. The Fourteenth Amendment says no state shall deny due process or equal protection, so the Constitution generally applies only when there is state action. The Civil Rights Cases (1883) held that Congress could not use the Fourteenth Amendment to forbid private discrimination by inns and theaters, because the amendment reaches state action and not private wrongs. The Thirteenth Amendment, by contrast, applies to private conduct, and no state action requirement limits it. It is the best-known example, though not the only text of its kind: a few other provisions, such as the Eighteenth Amendment's (since repealed) ban on private manufacture and sale of liquor, also reached private parties. The justification for the requirement is that it protects individual liberty by leaving a sphere of private action free from constitutional limits, and preserves federalism and the role of legislatures in regulating private conduct. Critics argue that the line between public and private is porous and that formal private status can disguise the exercise of public power.

The Court has recognized exceptions in which private conduct is treated as state action. Under the public function exception, a private party who performs a function traditionally and exclusively performed by the government is bound. Marsh v. Alabama (1946) applied the First Amendment to a company-owned town. The category is narrow today: Manhattan Community Access Corp. v. Halleck (2019) held that a private operator of public access cable channels is not a state actor, because operating a forum for speech is not a function traditionally and exclusively performed by government. The Court has also held that running elections, in some contexts, counts as a public function.

Under the entanglement or symbiotic relationship exception, when the government is deeply involved in the private conduct, the Constitution applies. Burton v. Wilmington Parking Authority (1961) found state action in a private restaurant that leased space in a public parking building, in light of the interdependence of the two. Shelley v. Kraemer (1948) held that judicial enforcement of racially restrictive covenants is state action. Yet that case has not been extended to all judicial enforcement of private agreements, because that would make state action nearly universal. Private actors who act jointly with state officials, or who exercise coercive power or significant encouragement from the state, can also be state actors, as in the cases on joint participation. Mere state regulation, licensing or funding of a private entity is generally not enough: Blum v. Yaretsky (1982) and Rendell-Baker v. Kohn (1982) found no state action for private nursing homes and a private school largely funded by public money. A related issue is that of entwinement in Brentwood Academy v. Tennessee Secondary School Athletic Ass'n (2001), where the Court found state action for an athletic association run largely by public school officials.

Congress can sometimes reach private conduct through other powers, such as the Commerce Clause, as in the Civil Rights Act of 1964 and Heart of Atlanta Motel v. United States (1964), even though the Fourteenth Amendment would not support it.

Worked example. A privately owned shopping mall removes a speaker handing out leaflets. The leafleteer sues under the First Amendment. Because a private owner is not performing a function traditionally and exclusively governmental, there is no state action in the usual view, and the federal Constitution does not protect the speaker, although some states' constitutions may.`,
            asOf: '2026-10',
            anchors: [cs('Civil Rights Cases|1883|US'), cs('Marsh v. Alabama|1946|US'), cs('Burton v. Wilmington Parking Authority|1961|US'), cs('Manhattan Community Access Corp. v. Halleck|2019|US'), cs('Brentwood Academy v. Tennessee Secondary School Athletic Association|2001|US')],
          },
          {
            id: lid(8),
            title: 'Substantive Due Process',
            blurb: 'Unenumerated rights, the Lochner era and modern methods.',
            minutes: 17,
            body:
`The Due Process Clauses of the Fifth and Fourteenth Amendments forbid government from depriving a person of life, liberty or property without due process of law. Procedural due process asks what process is owed. Substantive due process asks whether the government has a sufficient reason at all for restricting liberty. Critics say the phrase is an oxymoron and that courts using it make policy; defenders say that liberty has substantive content that process alone cannot protect, and that the practice is old and settled. Everyone agrees on the doctrine's structure: if a right is fundamental, laws that burden it receive strict scrutiny; if not, rational basis review applies.

The history helps. In the Lochner era, Lochner v. New York (1905) struck down a maximum-hours law for bakers as an infringement of liberty of contract. The Court retreated in 1937, and United States v. Carolene Products Co. (1938) established deference for economic regulation, with a famous footnote suggesting that more searching review may be warranted for laws that restrict political processes or target discrete and insular minorities. After that, economic liberty was reviewed under rational basis.

Noneconomic substantive due process continued. Meyer v. Nebraska (1923) and Pierce v. Society of Sisters (1925) protected parents' right to direct their children's education. Griswold v. Connecticut (1965) struck down a ban on contraceptives for married couples, with the majority finding a right to privacy in the penumbras of several amendments, and the later Eisenstadt v. Baird (1972) extended the right to unmarried persons. Loving v. Virginia (1967) found a fundamental right to marry. Roe v. Wade (1973) held that the right of privacy included a woman's decision to terminate a pregnancy, and Planned Parenthood v. Casey (1992) reaffirmed a right to abortion before viability but replaced the trimester framework with the undue burden standard. In Dobbs v. Jackson Women's Health Organization (2022), the Court overruled Roe and Casey, holding that the Constitution does not confer a right to abortion and that authority to regulate abortion returns to the people and their elected representatives. The Court's method was that an unenumerated right must be deeply rooted in the nation's history and tradition and implicit in the concept of ordered liberty, the formula of Washington v. Glucksberg (1997), which rejected a right to assisted suicide under the clause. Supporters of Dobbs argue that the decision restored democratic decision-making and fits a disciplined method; critics argue that it undermined reliance interests, women's equality and liberty, and the broader line of privacy cases. The Court's opinion stated that it concerned abortion and did not cast doubt on precedents involving other rights, a statement that scholars interpret differently. As a legal fact, the law today is that there is no federal constitutional right to abortion, and states regulate it under rational basis review.

Other cases continue to matter. Lawrence v. Texas (2003) struck down a law criminalizing same-sex intimate conduct, and Obergefell v. Hodges (2015) held that the Fourteenth Amendment requires states to license and recognize same-sex marriages, relying on both due process and equal protection. These decisions have not been overruled, and the Respect for Marriage Act of 2022 is a federal statute that requires recognition of marriages valid where entered. Cruzan v. Director, Missouri Department of Health (1990) assumed a right to refuse unwanted medical treatment.

Worked example. A state bans a form of private adult conduct. The challenger asserts a fundamental right. A court first asks whether the right is fundamental under Glucksberg's careful description, and if so applies strict scrutiny; if not, the law survives if rationally related to a legitimate end.`,
            asOf: '2026-10',
            anchors: [cs('Lochner v. New York|1905|US'), cs('Griswold v. Connecticut|1965|US'), cs('Washington v. Glucksberg|1997|US'), cs('Dobbs v. Jackson Women\'s Health Organization|2022|US'), cs('Obergefell v. Hodges|2015|US'), cs('Planned Parenthood v. Casey|1992|US')],
          },
          {
            id: lid(9),
            title: 'Procedural Due Process',
            blurb: 'When life, liberty or property is at stake, what process is due.',
            minutes: 13,
            body:
`Procedural due process addresses how government must act before it deprives someone of life, liberty or property. A claim has two steps. First, ask whether the government is depriving the person of a protected interest. Second, ask what procedures are required. The answer to the first question is not found only in the Constitution. Property interests arise from independent sources such as state law, statutes, regulations and contracts, as Board of Regents v. Roth (1972) held: a person must have a legitimate claim of entitlement, not merely a unilateral expectation. A university's decision not to renew a non-tenured teacher with no right to renewal did not deprive Roth of property. Perry v. Sindermann (1972) recognized that mutually explicit understandings may create entitlement even without formal tenure.

Entitlements include public benefits. Goldberg v. Kelly (1970) held that welfare recipients are entitled to an evidentiary hearing before benefits are terminated, because the loss is so severe for people who depend on them to live. Cleveland Board of Education v. Loudermill (1985) held that public employees with tenure or for-cause protection are entitled to notice and an opportunity to respond before termination, with a fuller hearing afterward. The Loudermill Court said that while property interests are defined by state law, the procedures required are a matter of federal constitutional law, so the legislature cannot define its way around the requirement by attaching limiting procedures to the entitlement.

Liberty interests include physical freedom, and some others recognized in the cases such as parental rights and the right to be free of state-imposed stigma coupled with a tangible change in status. Paul v. Davis (1976) held that harm to reputation alone is not a liberty interest, the so-called stigma-plus rule. Prisoners keep some liberty interests, and Sandin v. Conner (1995) limited them to atypical and significant hardships in relation to ordinary prison life.

Once a protected interest exists, courts determine the process due under the balancing test of Mathews v. Eldridge (1976). It weighs the private interest affected, the risk of erroneous deprivation under current procedures and the value of added safeguards, and the government's interest including fiscal and administrative burdens. In Mathews, the Court held that disability benefits could be terminated before a full evidentiary hearing as long as there was a later hearing, because the decision turned on medical records and the claimant's interest was less dire than in Goldberg. The core of due process is notice and a meaningful opportunity to be heard at a meaningful time before an impartial decisionmaker, though emergency situations may allow a postdeprivation hearing.

Negligent acts by state officials do not deprive a person of due process within the meaning of the Fourteenth Amendment, as Daniels v. Williams (1986) held. Where an official's act is random and unauthorized, a meaningful postdeprivation remedy under state law may suffice. In addition, the Due Process Clause limits the size of punitive damages awards that are grossly excessive, as BMW of North America v. Gore (1996) and State Farm v. Campbell (2003) show.

Worked example. A state university dismisses a tenured professor without any notice or hearing, stating that funding was reduced. The professor has a property interest under state law and the university's rules. Under Loudermill and Mathews, the professor is entitled to notice of the reasons and an opportunity to respond before termination, with a fuller hearing.`,
            asOf: '2026-10',
            anchors: [cs('Mathews v. Eldridge|1976|US'), cs('Goldberg v. Kelly|1970|US'), cs('Board of Regents of State Colleges v. Roth|1972|US'), cs('Cleveland Board of Education v. Loudermill|1985|US'), cs('Paul v. Davis|1976|US')],
          },
          {
            id: lid(10),
            title: 'Equal Protection and the Tiers of Scrutiny',
            blurb: 'Classifications, suspect classes and the standards of review.',
            minutes: 18,
            body:
`The Equal Protection Clause of the Fourteenth Amendment says no state shall deny any person the equal protection of the laws. It applies to the federal government through the Fifth Amendment's Due Process Clause, as Bolling v. Sharpe (1954) held. The clause does not require that all persons be treated alike; nearly every law classifies. It asks whether a classification is justified, and the intensity of review depends on the classification.

Rational basis review is the default. A law survives if it is rationally related to a legitimate government interest, the challenger bears the burden, and courts accept even hypothetical rationales, as in Railway Express Agency v. New York (1949) and FCC v. Beach Communications (1993). Review of economic and social legislation is highly deferential. The Court has occasionally struck down laws under rational basis when it found animus, a bare desire to harm a politically unpopular group, as in City of Cleburne v. Cleburne Living Center (1985) and Romer v. Evans (1996), which invalidated a Colorado constitutional amendment barring protections based on sexual orientation.

Strict scrutiny applies to suspect classifications, including race, national origin and, usually, alienage when imposed by states, and to laws that burden fundamental rights such as voting. The government must show the classification is narrowly tailored to a compelling interest. Strict scrutiny applies to every racial classification regardless of which group it burdens, as in Adarand Constructors v. Peña (1995). Korematsu v. United States (1944) applied what the Court called rigid scrutiny but upheld the exclusion of Japanese Americans; it is now widely repudiated and was disavowed in Trump v. Hawaii (2018). Brown v. Board of Education (1954) held that separate educational facilities are inherently unequal, and Loving v. Virginia (1967) struck down a ban on interracial marriage.

Intermediate scrutiny applies to classifications based on sex and to nonmarital birth. The government must show an important interest and that the classification is substantially related to it. Craig v. Boren (1976) established the test, and United States v. Virginia (1996) required an exceedingly persuasive justification for excluding women from the Virginia Military Institute. The Court has not made sexual orientation or gender identity a suspect or quasi-suspect classification for federal equal protection purposes. In United States v. Skrmetti (2025), the Court upheld a Tennessee law restricting certain medical treatments for minors, concluding that the law classified by age and medical use and that rational basis applied, and it did not decide whether transgender status is a suspect class. The ruling, as of this writing, is recent and contested in commentary. In West Virginia v. B.P.J. (June 30, 2026, 6-3), the Court upheld state laws limiting girls' school sports teams to biological females. It applied intermediate scrutiny to the sex-based classification, found it substantially related to important interests in safety and fairness, and again declined to hold that transgender status is a suspect or quasi-suspect class.

A facially neutral law violates equal protection only if it has both a discriminatory effect and a discriminatory purpose, as Washington v. Davis (1976) and Village of Arlington Heights v. Metropolitan Housing Development Corp. (1977) hold. Disparate impact alone is not enough, though it can be evidence of purpose. This is a major difference between constitutional law and many statutes, such as Title VII, which reach disparate impact.

Affirmative action is analyzed under strict scrutiny. Grutter v. Bollinger (2003) accepted the educational benefits of diversity as a compelling interest in law school admissions, but Students for Fair Admissions v. Harvard (2023) held that the admissions programs of Harvard and the University of North Carolina violated equal protection because their interests were not sufficiently measurable, used race as a negative and a stereotype, and lacked a logical endpoint. Supporters argue the decision enforces color blindness; critics say it ignores continuing inequality. The law is that race-conscious admissions in these forms are unlawful, with a note that the opinion did not forbid consideration of an applicant's discussion of how race affected his or her life.

Worked example. In Craig v. Boren (1976), an Oklahoma statute let women aged 18 to 20 buy 3.2 percent beer but did not let men of the same ages buy it. Oklahoma defended the sex line with traffic-safety statistics showing that young men were arrested for drunk driving more often than young women. The Court applied intermediate scrutiny: a sex-based classification must serve important governmental objectives and be substantially related to them. Traffic safety was an important objective, but the statistics were too weak a fit, and the law rested on a broad generalization about young men and women, so it violated equal protection.`,
            asOf: '2026-10',
            anchors: [cs('Craig v. Boren|1976|US'), cs('West Virginia v. B.P.J.|2026|US'), cs('United States v. Virginia|1996|US'), cs('Washington v. Davis|1976|US'), cs('Students for Fair Admissions, Inc. v. President and Fellows of Harvard College|2023|US'), cs('Romer v. Evans|1996|US'), cs('United States v. Skrmetti|2025|US')],
          },
        ],
      },
      {
        id: `${ID}.t3`,
        title: 'The First Amendment',
        blurb: 'Speech doctrines and the religion clauses.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(11),
            title: 'Free Speech: The Framework',
            blurb: 'Content discrimination, prior restraint, forums and advocacy of crime.',
            minutes: 17,
            body:
`The First Amendment says Congress shall make no law abridging the freedom of speech, and it applies to the states by incorporation. The first question in nearly every speech case is whether the government's regulation is content-based or content-neutral. A content-based law targets speech because of the topic discussed or the idea expressed, and it is presumed invalid and subject to strict scrutiny, meaning it must be narrowly tailored to a compelling interest. Reed v. Town of Gilbert (2015) held that a sign ordinance that applied different rules depending on a sign's message, such as political, ideological or directional, was content-based on its face and subject to strict scrutiny, even without hostile motive. Viewpoint discrimination, in which government favors one side of a topic, is the most disfavored kind of content discrimination. A content-neutral regulation of the time, place or manner of speech is reviewed under intermediate scrutiny: it must be narrowly tailored to a significant governmental interest and leave open ample alternative channels, as in Ward v. Rock Against Racism (1989), and need not be the least restrictive means.

A prior restraint, a government order that bars speech before it occurs, bears a heavy presumption of invalidity. Near v. Minnesota (1931) struck down an injunction against a scandal newspaper, and New York Times Co. v. United States (1971), the Pentagon Papers case, refused to allow an injunction against publishing classified documents, with the government failing to meet its heavy burden. Licensing schemes that give officials unbridled discretion are also suspect.

Advocacy of illegal conduct is protected unless it meets the test of Brandenburg v. Ohio (1969): the speech must be directed to inciting or producing imminent lawless action and be likely to do so. This replaced the earlier clear and present danger approach used in cases such as Schenck v. United States (1919) and the Dennis line. The imminence requirement means that abstract advocacy of violence, even of overthrowing the government, is protected.

Government property is analyzed by forum. Traditional public forums, such as streets and parks, and designated public forums, opened by the government for expressive use, allow only content-neutral time, place and manner regulations or narrowly tailored content-based ones. A limited public forum, such as a school board meeting, allows restrictions that are reasonable and viewpoint-neutral, and a nonpublic forum is subject to the same reasonableness and viewpoint-neutral test. Speech may also be restricted when the government is itself the speaker. In Pleasant Grove City v. Summum (2009), a city could choose which monuments to accept in a park, because the monuments were government speech, which is not subject to the Free Speech Clause. Government employees speaking as part of their official duties have no First Amendment protection from employer discipline under Garcetti v. Ceballos (2006), though speech as a citizen on matters of public concern is protected under the Pickering balancing test.

The First Amendment also covers expressive conduct. Texas v. Johnson (1989) held that burning a flag as political protest is protected expression, and United States v. O'Brien (1968) supplied an intermediate test when the government regulates conduct with incidental effects on speech. Compelled speech is as suspect as restricted speech: West Virginia State Board of Education v. Barnette (1943) held that students could not be compelled to salute the flag, and 303 Creative LLC v. Elenis (2023) held that Colorado could not use its public accommodations law to compel a website designer to create expressive designs for same-sex weddings that she objected to. Students should note that the decision turned on the speech nature of the services, and that a state's interest in access to goods and services generally remains.

Worked example. A city bans all signs over six square feet in a park, whatever they say. This is content-neutral, and the court asks whether the rule serves a significant interest, such as aesthetics or safety, leaves alternative channels, and is narrowly tailored. A rule allowing larger signs only for sports-related messages would be content-based and subjected to strict scrutiny.`,
            asOf: '2026-10',
            anchors: [cs('Reed v. Town of Gilbert|2015|US'), cs('Brandenburg v. Ohio|1969|US'), cs('Near v. Minnesota|1931|US'), cs('Ward v. Rock Against Racism|1989|US'), cs('Texas v. Johnson|1989|US'), cs('303 Creative LLC v. Elenis|2023|US')],
          },
          {
            id: lid(12),
            title: 'Categories of Less-Protected Speech and Modern Questions',
            blurb: 'Threats, defamation, obscenity, commercial speech and online platforms.',
            minutes: 17,
            body:
`The Court has said that the First Amendment does not protect certain historic categories of speech, but it has been cautious about adding new ones. United States v. Stevens (2010) rejected a claim that the government may create new categories of unprotected speech based on a balancing of value against harm, and Brown v. Entertainment Merchants Association (2011) applied that to violent video games sold to minors. In each category, the definition is narrow and the rules for the category matter.

Incitement, as the previous lesson showed, must be directed to imminent lawless action. True threats are serious expressions of intent to commit unlawful violence against a person or group. Counterman v. Colorado (2023) held that the First Amendment requires proof that the speaker had some subjective understanding of the threatening nature of the statements, and set recklessness as the minimum standard. Fighting words, from Chaplinsky v. New Hampshire (1942), are words likely to provoke immediate violence in the person addressed, and have been narrowly applied since.

Defamation is a false statement of fact harming reputation, and the Constitution shapes the common law of it. New York Times Co. v. Sullivan (1964) held that a public official may not recover damages for defamation relating to official conduct unless he proves actual malice, that is, knowledge of falsity or reckless disregard for the truth. The rule was extended to public figures, while private figures may recover on a lesser showing of fault on matters of public concern, and presumed damages require actual malice in such cases. Some justices have questioned Sullivan, but as of this writing it remains law.

Obscenity is unprotected under Miller v. California (1973), which asks whether the average person applying contemporary community standards would find the work as a whole appeals to the prurient interest, whether it depicts sexual conduct in a patently offensive way as defined by state law, and whether it lacks serious literary, artistic, political or scientific value. Child pornography is unprotected because of the harm in its production, as in New York v. Ferber (1982), and Ashcroft v. Free Speech Coalition (2002) held that virtual images not made with real children cannot be banned on that ground.

Commercial speech receives intermediate scrutiny. Under Central Hudson Gas & Electric Corp. v. Public Service Commission (1980), truthful speech about lawful activity may be restricted only if the government has a substantial interest, the regulation directly advances it, and it is not more extensive than necessary. Misleading or unlawful commercial speech is unprotected. Sorrell v. IMS Health Inc. (2011) suggested that content- and speaker-based restrictions on commercial speech may deserve more demanding review.

Online platforms present current questions. In Moody v. NetChoice, LLC (2024), the Court vacated and remanded decisions on Florida and Texas laws regulating social media content moderation, explaining that when a platform curates and arranges others' speech in a feed it is engaging in expressive activity, while leaving the facial challenges to be analyzed more fully below. In TikTok Inc. v. Garland (2025), the Court upheld a federal law requiring divestiture or a ban of a foreign-controlled application, assuming without deciding that the law was subject to First Amendment scrutiny at all, then holding it content neutral on its face and applying intermediate scrutiny, under which it survived because it addressed data collection concerns tied to a foreign adversary. Two 2026 decisions also matter. Chiles v. Salazar (March 31, 2026, 8-1) held that Colorado's ban on conversion therapy, as applied to talk therapy, regulates speech by viewpoint and must satisfy strict scrutiny; relabeling speech as conduct does not avoid the First Amendment. NRSC v. FEC (June 30, 2026, 6-3) held that limits on political parties' coordinated expenditures with candidates violate the First Amendment and overruled FEC v. Colorado Republican Federal Campaign Committee (2001). These decisions, as of this writing, are recent and are likely to be developed by later cases, so a student should treat them as anchors and not as final settlements.

The categories are also commonly misunderstood by the public. Hate speech, as such, is not a category of unprotected speech in the United States, as Matal v. Tam (2017) and Snyder v. Phelps (2011) illustrate, although it may fall within another unprotected category, such as true threats, or be restricted as part of conduct like harassment under the law of employment. Other democracies draw lines differently, and the arguments on both sides, including the harm and dignity concerns and the dangers of giving government power to decide which ideas are acceptable, are part of a fair account.

Worked example. A candidate writes that a rival official took bribes, knowing it is false. The rival is a public official, and the statement concerns official conduct; with actual malice proven, the claim can succeed under Sullivan.`,
            asOf: '2026-10',
            anchors: [cs('New York Times Co. v. Sullivan|1964|US'), cs('Miller v. California|1973|US'), cs('Counterman v. Colorado|2023|US'), cs('Central Hudson Gas & Electric Corp. v. Public Service Commission|1980|US'), cs('Moody v. NetChoice, LLC|2024|US'), cs('TikTok Inc. v. Garland|2025|US'), cs('Chiles v. Salazar|2026|US')],
          },
          {
            id: lid(13),
            title: 'The Establishment Clause',
            blurb: 'Government and religion: from Lemon to history and tradition.',
            minutes: 15,
            body:
`The Establishment Clause says Congress shall make no law respecting an establishment of religion. It applies to the states through incorporation, as Everson v. Board of Education (1947) assumed, while upholding public reimbursement of bus fares for children attending parochial schools. The central problem is how to separate government from religion without hostility to religion, and the Court has used different approaches in different periods. The major competing ideas are strict separation, the view that government must stay out of religious matters; neutrality, the view that government may neither favor nor disfavor religion; accommodation, the view that government may recognize and sometimes support religion; and a coercion approach, which focuses on whether government pressures participation.

For decades the dominant test came from Lemon v. Kurtzman (1971): a law must have a secular purpose, a primary effect that neither advances nor inhibits religion, and must not foster excessive government entanglement with religion. The test was criticized as unpredictable and was not applied in all cases. Marsh v. Chambers (1983) upheld legislative prayer on historical grounds. In Kennedy v. Bremerton School District (2022), the Court said that it had long ago abandoned Lemon and its endorsement test, and that the Establishment Clause must be interpreted by reference to historical practices and understandings. The Court held that a public school coach's brief personal prayer on the field after games was private religious expression protected by the Free Exercise and Free Speech Clauses, rejecting the school's reliance on the Establishment Clause. Town of Greece v. Galloway (2014) upheld sectarian legislative prayer as consistent with tradition and noncoercive. American Legion v. American Humanist Association (2019) upheld a long-standing cross-shaped war memorial and said that long-standing monuments are generally given a presumption of constitutionality. The effect is that many older cases and many lower court rulings need to be reread in light of the history-and-tradition approach, and there is open debate over how it will apply to novel questions.

Education funding shows another shift. Earlier cases limited aid to religious schools, but Zelman v. Simmons-Harris (2002) upheld a voucher program that gave aid to parents who chose among many options, treating the program as neutral and the result of private choice. Trinity Lutheran Church of Columbia, Inc. v. Comer (2017), Espinoza v. Montana Department of Revenue (2020) and Carson v. Makin (2022) held that if a state offers a general public benefit, it cannot exclude religious schools or churches solely because of their religious status or use, as that would violate the Free Exercise Clause. These cases blur the line between permitted and required funding. As a fact of current law, states may choose to fund religious options neutrally, and cannot exclude them from general programs simply because they are religious. Students should present the strongest positions: those who favor separation fear that taxpayers are compelled to support religion and that sectarian entanglement harms both government and religion, while those who favor neutrality argue that excluding religious options from general benefits discriminates against religion.

Other applications include prayer in public schools, where Engel v. Vitale (1962) held that official school prayer is unconstitutional, and Lee v. Weisman (1992) held that clergy-led prayer at a public school graduation is impermissibly coercive. Religious displays, curricula such as Edwards v. Aguillard (1987) striking a law requiring balanced treatment of creationism, and government support for religious organizations carrying out social services, are also governed by these lines, although the standards are in flux after Kennedy.

Worked example. A town council opens its meetings with a prayer delivered by volunteer local clergy of various faiths, with no pressure on attendees. Under Town of Greece, the practice is likely valid as consistent with historical tradition, so long as the invocation is not coercive or discriminatory in selecting speakers. Note that school board meetings are contested: some lower courts treat them as legislative bodies, while others stress that students attend and apply the school-prayer cases, so this example should not be extended to them without checking the circuit's law.`,
            asOf: '2026-10',
            anchors: [cs('Kennedy v. Bremerton School District|2022|US'), cs('Lemon v. Kurtzman|1971|US'), cs('Town of Greece v. Galloway|2014|US'), cs('Carson v. Makin|2022|US'), cs('Zelman v. Simmons-Harris|2002|US'), cs('Engel v. Vitale|1962|US')],
          },
          {
            id: lid(14),
            title: 'The Free Exercise Clause',
            blurb: 'Religious liberty, neutral laws and statutory protections.',
            minutes: 15,
            body:
`The Free Exercise Clause protects the right to believe and to practice religion. Belief is absolutely protected, but conduct is not. The core question is when a person can claim an exemption from a law that applies to everyone. Over the twentieth century the Court used different standards. Sherbert v. Verner (1963) required the government to show a compelling interest and the least restrictive means when a law substantially burdened religious exercise, and the Court applied it to unemployment benefits denied to a Sabbath observer. Wisconsin v. Yoder (1972) exempted Amish families from compulsory school attendance beyond the eighth grade, relying on the strength of the religious claim and the longstanding nature of the community's practice.

Employment Division v. Smith (1990) changed the framework. Two members of a Native American church were denied unemployment benefits after being fired for using peyote in a ceremony. The Court held that a neutral law of general applicability does not violate the Free Exercise Clause even if it burdens religious practice incidentally, and no compelling interest is required. The Court reasoned that a contrary rule would make each person a law unto himself and that exemptions are best left to the political process. Critics said that it left minority religions without protection; supporters said that it prevents courts from weighing the importance of religious claims. Congress responded with the Religious Freedom Restoration Act of 1993 (RFRA), requiring strict scrutiny for substantial burdens on religion imposed by the federal government. City of Boerne v. Flores (1997) held that RFRA could not be applied to the states because Congress exceeded its Section 5 power, but it applies to federal law, as Burwell v. Hobby Lobby Stores, Inc. (2014) held in finding that closely held for-profit corporations could object to a contraceptive coverage rule. Many states have their own RFRAs, and the Religious Land Use and Institutionalized Persons Act of 2000 protects some land uses and prisoners.

Smith still applies when a law is neutral and generally applicable, and strict scrutiny applies when a law is not. Church of the Lukumi Babalu Aye, Inc. v. City of Hialeah (1993) struck down ordinances that targeted animal sacrifice practiced by one faith, because they were not neutral. Fulton v. City of Philadelphia (2021) held that the city could not refuse to contract with a Catholic foster agency that would not certify same-sex couples, because the contract's provision for discretionary exceptions meant the policy was not generally applicable. The ruling avoided overruling Smith, although several justices have expressed willingness to reconsider it. Tandon v. Newsom (2021) clarified that a law is not neutral and generally applicable if it treats any comparable secular activity more favorably than religious exercise, whatever the asserted reason for the secular exemption. Mahmoud v. Taylor (2025) held, on the record before it, that parents were entitled to opt their children out of instruction involving certain storybooks because the requirement burdened their religious exercise, a ruling that has been described differently by supporters and critics and is recent as of this writing.

The ministerial exception, recognized in Hosanna-Tabor Evangelical Lutheran Church and School v. EEOC (2012) and extended in Our Lady of Guadalupe School v. Morrissey-Berru (2020), bars employment-discrimination suits by employees who perform important religious functions, in order to protect the autonomy of religious bodies in the selection of those who teach and carry out their faith.

Worked example. A city allows exemptions from a rule against keeping chickens for dozens of secular reasons but denies one for a religious ritual. Under Fulton and Tandon, the discretion and comparable secular exemptions mean the law is not generally applicable, and strict scrutiny applies.`,
            asOf: '2026-10',
            anchors: [cs('Employment Division v. Smith|1990|US'), cs('Church of the Lukumi Babalu Aye, Inc. v. City of Hialeah|1993|US'), cs('Fulton v. City of Philadelphia|2021|US'), cs('Burwell v. Hobby Lobby Stores, Inc.|2014|US'), st('Religious Freedom Restoration Act'), cs('Mahmoud v. Taylor|2025|US')],
          },
        ],
      },
      {
        id: `${ID}.t4`,
        title: 'Access to Courts, Congress and Doctrinal Change',
        blurb: 'Who may sue, what Congress may enforce, and how to teach change fairly.',
        level: 'ADVANCED',
        lessons: [
          {
            id: lid(15),
            title: 'Standing and Justiciability',
            blurb: 'Cases and controversies, injury in fact and the political question doctrine.',
            minutes: 15,
            body:
`Article III limits federal courts to cases and controversies. Justiciability doctrines translate that into practical rules, and they are among the most frequently tested topics in constitutional law. They include the rule against advisory opinions, standing, ripeness, mootness, and the political question doctrine. They serve to keep courts out of abstract disputes, to ensure that litigants are adverse and have a real stake, and to maintain the separation of powers.

Standing is the core doctrine. The plaintiff must show an injury in fact that is concrete, particularized and actual or imminent; the injury must be fairly traceable to the defendant's conduct; and it must be likely to be redressed by a favorable decision, as Lujan v. Defenders of Wildlife (1992) held. A generalized grievance shared by all citizens is not enough. Allen v. Wright (1984) denied standing to parents who claimed that the tax-exempt status of discriminatory private schools harmed the integration of public schools, because the chain of causation was too speculative. Massachusetts v. EPA (2007) gave states special solicitude, in a case on greenhouse gas regulation. Spokeo, Inc. v. Robins (2016) and TransUnion LLC v. Ramirez (2021) hold that a bare statutory violation does not establish a concrete injury without a harm with a close relationship to one traditionally recognized, so many plaintiffs who suffered only a risk of harm or an unpublished error lack standing to seek damages in federal court. United States v. Texas (2023) held that states lacked standing to challenge federal immigration enforcement priorities, in part because a litigant ordinarily lacks a judicially cognizable interest in the prosecution or non-prosecution of another, and Murthy v. Missouri (2024) found that plaintiffs lacked standing in a challenge to government communications with social media platforms. FDA v. Alliance for Hippocratic Medicine (2024) held that doctors and groups lacked standing to challenge the FDA's regulation of a drug they did not take or prescribe. Standing is not about the merits: a person can lose on standing even if the law is clearly illegal. Critics say that the doctrine has been used inconsistently to close courthouse doors, while supporters say it enforces the limits of judicial power, and a student should be able to explain both.

Prudential and related doctrines. Third-party standing is generally disfavored unless there is a close relationship and a hindrance to the third party. Taxpayer standing is generally unavailable, with a narrow exception for Establishment Clause challenges to congressional spending under Flast v. Cohen (1968), whose scope has been sharply limited.

Ripeness bars cases that are premature, requiring fitness of issues for decision and hardship to the parties from withholding review. Mootness bars cases in which the controversy has ended, with exceptions for wrongs capable of repetition yet evading review, voluntary cessation, and class actions. The political question doctrine, from Baker v. Carr (1962), identifies issues committed to another branch or lacking judicially manageable standards. Rucho v. Common Cause (2019) held that partisan gerrymandering claims present political questions in federal court, while racial gerrymandering and one-person-one-vote claims remain justiciable. Trump v. CASA, Inc. (2025) addressed the remedial question of universal injunctions, holding that federal courts likely lack equitable authority to issue them beyond what is necessary to give the plaintiffs complete relief, a decision that is recent and still developing in terms of class actions and state suits.

Worked example. A citizen sues because a federal agency spends money in a way that she thinks is unlawful, and she has no personal harm beyond being a taxpayer. She lacks standing: her injury is a generalized grievance shared with all taxpayers, and the Flast exception for Establishment Clause spending claims does not apply.`,
            asOf: '2026-10',
            anchors: [cs('Lujan v. Defenders of Wildlife|1992|US'), cs('TransUnion LLC v. Ramirez|2021|US'), cs('Baker v. Carr|1962|US'), cs('Rucho v. Common Cause|2019|US'), cs('FDA v. Alliance for Hippocratic Medicine|2024|US'), cs('Trump v. CASA, Inc.|2025|US')],
          },
          {
            id: lid(16),
            title: 'Congress\'s Enforcement Powers and State Sovereign Immunity',
            blurb: 'Section 5, the Reconstruction Amendments and the limits on suing states.',
            minutes: 15,
            body:
`The Thirteenth, Fourteenth and Fifteenth Amendments each contain a clause giving Congress the power to enforce them by appropriate legislation. These enforcement powers are an important source of federal authority apart from the Commerce Clause, and they have been central to civil rights legislation. The doctrinal question is how far Congress can go beyond what courts would themselves hold the amendments to forbid.

Section 5 of the Fourteenth Amendment gives Congress the power to enforce the amendment's guarantees. Katzenbach v. Morgan (1966) suggested that Congress could, in some circumstances, define the scope of the rights itself. City of Boerne v. Flores (1997) rejected that reading: Congress may enforce rights but not change their meaning, and legislation must show congruence and proportionality between the injury to be prevented and the means adopted. Under that test, remedial and preventive legislation is permitted, but substantive redefinition is not. Boerne invalidated the application of RFRA to the states. The standard has been applied to strike down parts of several statutes, including the Violence Against Women Act's civil remedy in United States v. Morrison (2000), which also failed under the Commerce Clause. By contrast, Nevada Department of Human Resources v. Hibbs (2003) upheld the Family and Medical Leave Act's family-care provision as a response to sex discrimination in leave policies, and Tennessee v. Lane (2004) upheld the Americans with Disabilities Act's courthouse access provision as applied.

The Fifteenth Amendment gives Congress power to enforce the ban on racial discrimination in voting. South Carolina v. Katzenbach (1966) upheld the Voting Rights Act of 1965, including the preclearance system for places with a history of discrimination. Shelby County v. Holder (2013) held that the coverage formula in the Act, based on data from decades earlier, was unconstitutional because it no longer reflected current conditions and so exceeded Congress's power given the burdens on state sovereignty. Allen v. Milligan (2023) then applied the Section 2 results test to an Alabama congressional map, rejecting arguments that would have weakened the provision. Louisiana v. Callais (April 29, 2026, 6-3) then held Louisiana's second majority-Black congressional district an unconstitutional racial gerrymander, because Section 2 did not require it and so compliance gave no compelling interest. The majority also reworked the Gingles framework: illustrative maps must meet the state's legitimate nonracial goals, racial bloc voting must be separated from partisanship, and courts must give weight to present-day evidence of intentional discrimination. Three justices dissented, and the full effect on Milligan-style claims remains to be worked out. Voting law is still developing, and a student should check current status as of this writing.

The Thirteenth Amendment abolishes slavery and involuntary servitude and, unlike the Fourteenth, reaches private conduct. Jones v. Alfred H. Mayer Co. (1968) held that Congress may rationally determine what the badges and incidents of slavery are and enact legislation against them, and applied a post-Civil War statute to private racial discrimination in the sale of housing.

State sovereign immunity limits private damages suits against states. The Eleventh Amendment's text bars certain suits by citizens of other states, and Seminole Tribe of Florida v. Florida (1996) and Alden v. Maine (1999) read it as part of a broader constitutional principle of sovereign immunity that Congress cannot abrogate under its Article I powers, even in state court. Congress can abrogate under Section 5 if it clearly does so and the legislation passes the congruence and proportionality test. Ex parte Young (1908) allows suits for prospective relief against state officials who are violating federal law, even though the state itself cannot be sued, and local governments and officers sued in individual capacity do not share the state's immunity. Students should understand that the doctrine does not mean that states can violate federal law without remedy, because there are alternative routes such as suits for injunction and suits by the federal government.

Worked example. Congress passes a statute under Section 5 that bars states from using any policy that has a disparate impact on a religion, even if no discriminatory purpose exists, based on findings of only a few incidents. Under Boerne's congruence and proportionality test, the statute is likely invalid because the remedy is out of proportion to the pattern of unconstitutional conduct.`,
            asOf: '2026-10',
            anchors: [cs('City of Boerne v. Flores|1997|US'), cs('Shelby County v. Holder|2013|US'), cs('Allen v. Milligan|2023|US'), cs('Louisiana v. Callais|2026|US'), cs('Seminole Tribe of Florida v. Florida|1996|US'), cs('Ex parte Young|1908|US'), cs('Jones v. Alfred H. Mayer Co.|1968|US')],
          },
          {
            id: lid(17),
            title: 'Teaching Doctrinal Shifts Fairly',
            blurb: 'Precedent, method and how to present recent changes with anchors.',
            minutes: 16,
            body:
`Constitutional doctrine changes. Recent years have seen the Court overrule or reshape major precedents and adopt new methods of interpretation, and a good student learns to describe those changes accurately, to separate what the law is from arguments about whether it should be, and to identify what a lesson depends on so it can be updated. This lesson sets out a method for doing so, using cases already studied as anchors.

Start with stare decisis, the principle that courts follow their precedent. It is a policy and not an absolute command, and it is strongest in statutory cases and weaker in constitutional ones, since only a constitutional amendment or a later decision can correct a constitutional error. The Court looks at factors such as the quality of the original reasoning, the workability of the rule, its consistency with related decisions, later developments and reliance interests. Planned Parenthood v. Casey (1992) applied such factors to reaffirm Roe v. Wade's central holding, and Dobbs v. Jackson Women's Health Organization (2022) applied similar factors to overrule it, finding the reasoning exceptionally weak and the rule unworkable. The Court also overruled precedent in Janus v. AFSCME (2018), on public-sector union fees, and in Ramos v. Louisiana (2020), in which several justices wrote on when it is proper to overrule. Defenders of continuity argue that precedent promotes stability, legitimacy and equal treatment of like cases; defenders of correction argue that fidelity to the Constitution outweighs fidelity to mistaken decisions. Both are respectable positions.

Next, identify the interpretive method behind a decision. Originalism seeks the meaning of the text at the time it was adopted. It has variants, including original intent and original public meaning, and the latter is more common today. Living constitutionalism or common-law constitutionalism holds that meaning develops through precedent and evolving understandings. Pragmatic, structural and moral-reading approaches also exist. Many recent decisions use history and tradition: Dobbs relied on it for unenumerated rights, and Kennedy v. Bremerton used it for the Establishment Clause. In New York State Rifle & Pistol Association v. Bruen (2022), the Court held that when a firearm regulation covers conduct protected by the Second Amendment text, the government must show that it is consistent with the nation's historical tradition of firearm regulation, rejecting the means-end scrutiny that lower courts had used. United States v. Rahimi (2024) upheld a federal ban on firearm possession by people subject to domestic-violence restraining orders and clarified that courts should look for a principle underlying historical laws, not a historical twin. Two 2026 decisions applied the test further: Wolford v. Lopez (June 25, 2026, 6-3) struck down Hawaii's rule barring licensed carriers from carrying onto private property open to the public without the owner's express permission, and United States v. Hemani (June 18, 2026, 7-2) held the federal ban on firearm possession by unlawful drug users unconstitutional as applied to the defendant, a marijuana user, because the historical analogies offered did not fit. District of Columbia v. Heller (2008) held that the Second Amendment protects an individual right to keep and bear arms for self-defense in the home. Supporters of the history-focused test say it constrains judges; critics say that judges are not trained historians and that history can be selected to fit conclusions. The fact of current law is separate from these arguments.

A teaching routine for any contested shift can be followed in five steps. First, state the holding in neutral words, naming the court, year and vote. Second, say exactly what was decided and what was left open, separating holding from dicta. Third, give the strongest argument of each side in terms its own supporters would accept. Fourth, identify the anchors, the cases, statutes and constitutional provisions on which the lesson relies, and note when a lesson uses the phrase as of this writing so that later developments can be flagged. Fifth, avoid loaded labels and do not characterize the Court's motives. Recent examples include Loper Bright (2024) on agency deference, SFFA v. Harvard (2023) on race-conscious admissions, and Trump v. United States (2024) on presidential immunity.

Worked example. A learner asks whether abortion is constitutionally protected. A fair answer says that, as a matter of current federal law, Dobbs held that the Constitution does not confer such a right, that states regulate under rational basis review, and that supporters regard the decision as returning an issue to democratic choice while critics regard it as removing a protection of liberty and equality. The answer then points to the anchors so the learner can check later developments.`,
            asOf: '2026-10',
            anchors: [cs('Dobbs v. Jackson Women\'s Health Organization|2022|US'), cs('New York State Rifle & Pistol Association, Inc. v. Bruen|2022|US'), cs('United States v. Rahimi|2024|US'), cs('Wolford v. Lopez|2026|US'), cs('United States v. Hemani|2026|US'), cs('Janus v. AFSCME, Council 31|2018|US'), cs('District of Columbia v. Heller|2008|US'), cn('Stare decisis and interpretive methods')],
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: ID,
    questions: [
      m(1, 1, 1, 'In Marbury v. Madison, why could the Supreme Court not issue the writ of mandamus that Marbury requested?',
        ['The statute giving the Court original jurisdiction over such writs conflicted with Article III, so the Court declined to apply it',
         'The commission had never been signed by the President, so Marbury had no legal right to the office he claimed to hold',
         'The Court lacked any power to review actions of the executive branch, since the President is immune from all judicial orders',
         'Marbury had waited too long after the delivery date, so the statute of limitations on his claim for the commission had run'], 0,
        'The Court found a problem with the statute, not with Marbury\'s right.', 'Marshall found that Marbury had a right to the commission, but the statute enlarging the Court\'s original jurisdiction conflicted with Article III. The Court held the statute void and so could not grant the writ.'),
      m(1, 2, 1, 'Which of the following best states the holding of Cooper v. Aaron?',
        ['The Court\'s interpretation of the Constitution in Brown is binding on the states, and state officials may not nullify it',
         'Federal courts have no power to order school districts to desegregate when a state legislature has acted to prevent it',
         'States may delay compliance with desegregation orders for as long as local conditions create a risk of public disorder',
         'The Court\'s constitutional interpretations bind only the parties to the particular case in which they are announced'], 0,
        'Little Rock resisted the Brown decision.', 'Cooper declared that the federal judiciary\'s interpretation of the Constitution is supreme and that states cannot nullify it, though critics debate how far that claim reaches.'),
      m(1, 3, 2, 'A federal statute authorizes a court to issue advisory opinions to Congress about the constitutionality of pending bills, without any actual dispute. Which doctrine most directly makes this unconstitutional?',
        ['The requirement of Article III that federal courts decide only cases or controversies',
         'The Tenth Amendment reservation of unenumerated judicial functions to state courts and the people',
         'The Eleventh Amendment bar on suits by individuals against an arm of the Congress',
         'The nondelegation doctrine, because courts may not exercise any power that is also exercised by a legislature'], 0,
        'Think about what Article III extends the judicial power to.', 'Federal courts decide cases or controversies and do not issue advisory opinions. The nondelegation and Eleventh Amendment doctrines concern different problems.'),
      m(1, 4, 3, 'A state official, sworn to uphold the Constitution, refuses to enforce a state statute because the official believes the statute violates the First Amendment, although no court has addressed the issue. Under the competing views of judicial supremacy, which statement is most accurate?',
        ['Under the departmentalist view the official may act on a reasonable independent interpretation, while under the judicial-supremacy reading of Cooper a final Supreme Court ruling on the point would bind the official',
         'Under the departmentalist view the official may disregard a statute only after the state attorney general issues a formal opinion, while under judicial supremacy the official must enforce every statute until a court strikes it down',
         'Under the departmentalist view the Supreme Court\'s reading of the Constitution binds the official in every case, while under Cooper v. Aaron the official may follow an independent reading until Congress responds',
         'Under the departmentalist view only the President may decline to enforce a statute on constitutional grounds, while under the judicial-supremacy reading of Cooper state officials share that power with the state\'s highest court'], 0,
        'Distinguish the open question from the settled one.', 'The debate concerns how far the oath and the Court\'s interpretations bind other officials. Where the Supreme Court has ruled, Cooper treats the ruling as binding; where it has not, departmentalists say officials may use their own judgment. Both views accept judicial review exists.'),
      m(1, 5, 3, 'Congress passes a law removing the Supreme Court\'s appellate jurisdiction over every case in which a person challenges a federal statute on First Amendment grounds. Which analysis best reflects the current understanding?',
        ['Congress has broad control over federal jurisdiction under the Exceptions Clause, but a court would likely examine whether the measure is a bar on constitutional enforcement that violates other provisions',
         'The law is valid because Article III gives Congress plenary authority over the Supreme Court\'s appellate jurisdiction, so no other constitutional provision can limit how Congress uses the Exceptions Clause',
         'The law is invalid because the Supreme Court\'s appellate jurisdiction is fixed by Article III itself, and Congress may regulate only the jurisdiction of the lower federal courts that it creates',
         'The law is valid because Congress may strip appellate jurisdiction, and the Supreme Court would keep original jurisdiction over First Amendment claims, so litigants lose no federal forum for any claim'], 0,
        'Congress has power over jurisdiction, but not unlimited power.', 'Article III lets Congress make exceptions to the Court\'s appellate jurisdiction, which is wide, but scholars debate its limits where the exclusion would deny any forum or aim at particular outcomes. The question is unsettled.'),

      m(2, 1, 1, 'In Justice Jackson\'s concurrence in Youngstown, when is presidential power at its lowest ebb?',
        ['When the President acts contrary to the express or implied will of Congress',
         'When the President acts in a field where Congress has not legislated either way',
         'When the President acts under an express authorization from Congress to do so',
         'When the President acts during a declared war against a foreign nation'], 0,
        'Three zones of power.', 'In the third zone, where the President acts against Congress, he can rely only on his own constitutional powers minus any power of Congress over the matter.'),
      m(2, 2, 1, 'What did INS v. Chadha hold about the one-house legislative veto?',
        ['It is unconstitutional because it has legislative effect without passage by both houses and presentment to the President',
         'It is valid because Congress may retain control over any power it delegates to an agency in the same statute',
         'It is valid only if the President signs a separate order approving each use of the veto by a single house',
         'It is unconstitutional only because it applied to an immigration matter, which belongs exclusively to the executive'], 0,
        'Bicameralism and presentment.', 'Chadha held that a one-house veto altered legal rights and was legislative action requiring both houses and presentment.'),
      m(2, 3, 2, 'Congress passes a statute telling an agency to set air-quality standards that are "requisite to protect the public health," with findings and procedures. A challenger says Congress unconstitutionally delegated legislative power. How would the Court most likely analyze the claim under current doctrine?',
        ['Under the intelligible principle test, a delegation is valid if Congress gives the agency a standard to guide its discretion, so the statute is likely valid',
         'The delegation is invalid, because Article I allows Congress to legislate only by listing in the statute every rule that will apply to private parties',
         'The delegation is invalid unless the President personally approves each standard issued by the agency before it takes effect',
         'The delegation is valid only if the agency is headed by a single official removable at the will of the President'], 0,
        'Think of the standard from Mistretta.', 'The Court has applied the intelligible principle test and has upheld broad delegations; whether it will tighten the test is debated, though recent cases have upheld delegations.'),
      m(2, 4, 3, 'A statute creates an agency headed by a single director with a five-year term and removable by the President only for inefficiency, neglect of duty or malfeasance. The agency has significant executive authority over private parties. The director is sued to invalidate an enforcement action. What is the strongest argument for the challenger under Seila Law?',
        ['The for-cause removal limit on a single head of an agency with substantial executive power violates the separation of powers, because it limits the President\'s control of executive power',
         'Seila Law overruled Humphrey\'s Executor in full, so no removal limit on any federal officer is valid, including limits on the members of multimember commissions and on inferior officers',
         'The five-year term is unconstitutional because Article II permits Congress to fix terms only for judges, so a fixed term for an executive director intrudes on the President\'s appointment power',
         'The agency is unconstitutional because Article III vests the power to enforce federal law against private parties in the courts, so an executive director cannot bring enforcement actions'], 0,
        'Think about single-headed agencies.', 'Seila Law limited Humphrey\'s Executor and held that a single director with significant power cannot be insulated by for-cause removal. Seila Law did not overrule Humphrey\'s; that came later, in Trump v. Slaughter (2026), and neither case holds that every limit on every officer is invalid.'),
      m(2, 5, 3, 'An agency claims a statute from decades ago, written in general terms, authorizes it to impose a nationwide program that would reshape a large portion of the economy and affect millions of people. Congress never mentioned such authority. Under the major questions doctrine, how is the claim most likely treated?',
        ['The agency must point to clear congressional authorization, and ambiguity in a general statute will likely be read against the claim of such power',
         'The agency prevails if its reading is reasonable, because courts always defer to an agency\'s plausible reading of an ambiguous statute',
         'The agency prevails because the nondelegation doctrine allows broad authority whenever the program serves the public interest',
         'The claim is invalid only if the President opposes it, since the major questions doctrine applies solely to disputes between branches'], 0,
        'Think West Virginia v. EPA and Loper Bright.', 'The major questions doctrine requires clear authorization for powers of vast economic and political significance, and Loper Bright rejected Chevron deference in general, so ambiguity does not favor the agency.'),

      m(3, 1, 1, 'Which case upheld federal regulation of wheat grown for personal consumption because of its aggregate effect on interstate commerce?',
        ['Wickard v. Filburn', 'United States v. Lopez', 'Gibbons v. Ogden', 'McCulloch v. Maryland'], 0,
        'The 1942 farmer.', 'Wickard held that the aggregate effect of home-grown wheat on the national market allowed regulation under the Commerce Clause.'),
      m(3, 2, 1, 'Why did the Court strike down the Gun-Free School Zones Act in United States v. Lopez?',
        ['Possessing a gun in a school zone was not economic activity and the statute had no jurisdictional element tying it to interstate commerce',
         'The statute regulated state officers directly, commandeering local police to enforce a federal firearms ban on school grounds, in violation of the Tenth Amendment',
         'Congress made no legislative findings on the effect of guns near schools, and the Court held that findings are a constitutional requirement for commerce legislation',
         'Possession of a firearm is a local police matter, so the Tenth Amendment reserves it to the states even if the possession substantially affects interstate commerce'], 0,
        'Economic activity and a jurisdictional hook.', 'Lopez held that the statute regulated noneconomic activity without a jurisdictional element and was outside the substantial effects category.'),
      m(3, 3, 2, 'Congress bans the interstate shipment of goods made by a factory that employs workers for more than a statutory number of hours per week. A manufacturer argues that production is local and outside the commerce power. Which statement best describes the doctrine now?',
        ['Congress may regulate the channels of interstate commerce, so a ban on shipping those goods is likely valid regardless of how the goods were made',
         'The ban is invalid because production of goods is a local activity that Congress cannot reach under any category of the commerce power',
         'The ban is invalid unless the manufacturer is shown to have intended to affect the market in another state through shipment',
         'The ban is valid only if the hours of work are shown to have substantially affected interstate commerce by a separate empirical study'], 0,
        'Which category of Commerce power is involved?', 'The modern Court recognizes the power to regulate the channels of interstate commerce, and the older production-commerce distinction was abandoned after 1937.'),
      m(3, 4, 3, 'Congress passes a law requiring every adult to purchase a specific product from a private company, justified under the Commerce Clause as a means to regulate the market in related goods. Which is the strongest argument against the law under NFIB v. Sebelius?',
        ['The Commerce Clause regulates existing activity and does not allow Congress to compel individuals to enter commerce by purchasing a product',
         'Congress may not regulate any activity of individuals under the Commerce Clause, only the activity of states and corporations',
         'The law is invalid because the Tenth Amendment gives states exclusive power over the regulation of insurance and related markets',
         'The law is invalid because Congress may regulate only goods that have already crossed a state line, not sales within a state'], 0,
        'Activity versus inactivity.', 'A majority in NFIB held that the Commerce Clause does not authorize compelling people to engage in commerce. The same mandate was sustained under the taxing power by Chief Justice Roberts.'),
      m(3, 5, 3, 'A state resident grows and uses marijuana at home under a state medical program, and none of it enters commerce. Federal agents seize the plants under the Controlled Substances Act. Under Gonzales v. Raich, what is the most likely result of a Commerce Clause challenge?',
        ['The federal law is valid as applied, because Congress could rationally conclude that intrastate cultivation affects the interstate market in a comprehensive scheme',
         'The federal law is invalid as applied, because the homegrown plants were noneconomic and Lopez and Morrison bar aggregating local activity of that kind to reach it',
         'The federal law is invalid as applied, because the Tenth Amendment protects a state\'s medical-use program from conflicting federal drug enforcement within its territory',
         'The federal law is valid only if the government shows that these specific plants, or this grower\'s output, would actually have entered interstate commerce'], 0,
        'Compare Lopez and Morrison with a broader regulatory scheme.', 'Raich upheld application of the Controlled Substances Act because homegrown marijuana is part of an economic class of activity that Congress can regulate as part of a comprehensive scheme.'),

      m(4, 1, 1, 'What did the Court hold in NFIB v. Sebelius about the individual mandate\'s payment under the taxing power?',
        ['It was a valid exercise of the taxing power because it functioned as a tax collected by the IRS',
         'It was invalid because Congress may impose taxes only on income and not on the failure to buy a product',
         'It was invalid because the payment was a penalty for unlawful conduct, which the taxing power cannot support',
         'It was valid only because the Commerce Clause independently authorized the requirement to obtain insurance'], 0,
        'Chief Justice Roberts\'s controlling analysis.', 'The Chief Justice held that the payment could be read as a tax, though the Commerce Clause did not authorize the mandate itself.'),
      m(4, 2, 1, 'What is the anticommandeering doctrine?',
        ['Congress may not command state legislatures or executive officers to enact or administer a federal regulatory program',
         'Congress may not offer funds to states on any condition that relates to how the states regulate their own citizens',
         'States may not tax federal instrumentalities, such as a national bank, unless Congress consents to the tax',
         'States may not pass laws that discriminate against goods from other states in order to protect local industry'], 0,
        'New York v. United States and Printz.', 'Anticommandeering protects states from being conscripted into federal service. The second option describes limits on conditional spending, the third McCulloch, and the fourth the dormant Commerce Clause.'),
      m(4, 3, 2, 'Congress threatens to withhold a small percentage of highway funds from states that do not adopt a minimum drinking age of 21. A state claims the condition is unconstitutional. Under South Dakota v. Dole, what is the likely result?',
        ['The condition is valid because it is related to highway safety, is unambiguous, and the financial incentive is not so large as to be coercive',
         'The condition is invalid because it is unrelated to the federal interest in highway spending, since the minimum drinking age does not bear on highway safety',
         'The condition is invalid because the Twenty-first Amendment gives states exclusive authority over alcohol, which bars Congress from using its spending power to influence it',
         'The condition is invalid because, under NFIB v. Sebelius, any condition that places a portion of existing highway funds at risk is unconstitutionally coercive'], 0,
        'Five conditions on the spending power.', 'Dole upheld the condition as related to the federal interest in safe interstate travel, with modest financial pressure. The Twenty-first Amendment does not bar conditional spending.'),
      m(4, 4, 3, 'Congress enacts a statute prohibiting any state from authorizing or licensing a certain category of private gambling, and the state has an existing licensing program. Under Murphy v. NCAA, what is the most likely result?',
        ['The statute is invalid because it directs the states how to legislate and so commandeers state legislatures',
         'The statute is valid because Congress may preempt state law whenever the preempted subject affects interstate commerce',
         'The statute is valid because the Tenth Amendment protects only the administrative duties of state executive officers',
         'The statute is invalid only because the state spent money on its licensing program before the federal law was enacted'], 0,
        'Compare a command to states with regulation of private actors.', 'Murphy held that a federal law prohibiting states from authorizing sports betting regulated the states, not private parties, and so violated the anticommandeering rule. Preemption must regulate private conduct.'),
      m(4, 5, 3, 'Congress passes a statute that makes it illegal for any person, including state agencies, to sell personal information from motor vehicle records. A state challenges the statute as commandeering. Under Reno v. Condon, what is the best analysis?',
        ['The statute likely survives because it regulates the state as a market participant in the same way as private actors and does not require the state to enact or enforce federal law',
         'The statute is invalid because under Printz and New York Congress may not regulate state agencies directly in any area that involves state-held records, since that commandeers state sovereignty',
         'The statute is invalid because state databases are part of the traditional state functions that the Tenth Amendment exempts from federal regulation, even when private actors do the same thing',
         'The statute is valid only if Congress made findings that each state agency had misused the personal information in its motor vehicle records, as the Commerce Clause requires'], 0,
        'Generally applicable laws are different from commands to states.', 'Reno v. Condon upheld a law that regulated both state and private actors in the resale of data, with no requirement that the state legislate or enforce federal rules.'),

      m(5, 1, 1, 'What is the first question a court asks in a dormant Commerce Clause challenge?',
        ['Whether the state law discriminates against interstate commerce in its text, purpose or effect',
         'Whether Congress has authorized the state law by a statute that clearly says so in its text',
         'Whether the state law was passed by a legislature that includes members from every region',
         'Whether the state law applies to the federal government or to private citizens within the state'], 0,
        'Discrimination triggers the strictest review.', 'Discriminatory laws are virtually per se invalid; neutral laws receive Pike balancing. Congressional authorization can validate a law, but it is not the first question.'),
      m(5, 2, 1, 'Which describes conflict preemption?',
        ['Compliance with both federal and state law is impossible, or state law blocks the accomplishment of federal purposes',
         'Congress has stated expressly in the statute that state laws on the subject are displaced in every respect',
         'Federal regulation of a field is so pervasive that no room for supplemental state regulation is inferred',
         'A state law burdens commerce in ways that Congress would be likely to find excessive if it considered them'], 0,
        'Impossibility or obstacle.', 'Conflict preemption includes impossibility and obstacle preemption. Express preemption depends on statutory text, and field preemption on pervasive regulation.'),
      m(5, 3, 2, 'A state bans the sale of milk that was processed outside the state. Producers from other states sue. What standard applies?',
        ['The law is virtually per se invalid because it discriminates on its face, unless the state shows a legitimate purpose that cannot be served by nondiscriminatory means',
         'The law is valid because it is a health regulation, and courts defer to a state\'s health and safety judgment even when the law favors in-state processors over out-of-state ones',
         'The law is reviewed under Pike balancing, with the challengers bearing the burden to show that the burden on interstate commerce clearly exceeds the local benefits',
         'The law is invalid only if Congress has enacted a federal milk statute that expressly preempts state processing rules, because the dormant Commerce Clause has no independent force'], 0,
        'Facial discrimination against out-of-state interests.', 'Discrimination on its face triggers the strictest scrutiny in the dormant Commerce Clause, such as in Philadelphia v. New Jersey. Pike balancing applies to evenhanded laws.'),
      m(5, 4, 3, 'A state adopts a neutral rule requiring all trucks to use a particular type of mudflap, which is different from the rule in neighboring states and forces carriers to change equipment at the border. The rule is claimed to improve safety but evidence of the benefit is thin. Which analysis best fits?',
        ['Pike balancing applies, and the rule may be invalid if the burden on interstate commerce is clearly excessive in relation to the local benefits',
         'The rule is invalid under strict scrutiny because a regulation that differs from those of the neighboring states is presumed discriminatory against interstate carriers',
         'The rule is valid because states have exclusive authority to regulate highway safety within their own territory, which places it beyond Commerce Clause review',
         'The rule is invalid because only Congress may set equipment standards for vehicles that cross state lines, and the states retain no concurrent regulatory power'], 0,
        'Neutral law with a burden on commerce.', 'A neutral law with incidental burdens is analyzed under Pike. Courts weigh the burden against the benefit, but in practice challengers often have difficulty prevailing, as National Pork Producers shows.'),
      m(5, 5, 3, 'A state buys cement for its own highway projects and, by statute, sells only to in-state buyers the cement from a plant it owns. An out-of-state contractor challenges the sales policy under the dormant Commerce Clause. What is the likely result?',
        ['The policy is likely valid under the market participant doctrine, because the state is acting as a buyer and seller and not as a regulator',
         'The policy is invalid because the dormant Commerce Clause bars a state from favoring its own residents in any transaction, including its sales of state-owned goods',
         'The policy is invalid unless Congress has expressly authorized the in-state preference, because market participation is not an exception to the dormant Commerce Clause',
         'The policy is valid only if the state sells to out-of-state buyers at the same price as in-state buyers, because price discrimination is all that the market participant doctrine forbids'], 0,
        'The state is not regulating; it is trading.', 'Under the market participant exception the state may prefer its own residents when it acts as a participant in the market, subject to limits on downstream restrictions.'),

      m(6, 1, 1, 'What is selective incorporation?',
        ['The doctrine that most provisions of the Bill of Rights apply to the states through the Fourteenth Amendment\'s Due Process Clause, one at a time',
         'The doctrine that the Bill of Rights applies to the states only through Acts of Congress passed under Section 5 of the Fourteenth Amendment, provision by provision',
         'The doctrine, urged by Justice Black, that the Fourteenth Amendment applied the entire Bill of Rights to the states in a single step',
         'The doctrine that the Equal Protection Clause, rather than the Due Process Clause, carries individual Bill of Rights guarantees to state governments one at a time'], 0,
        'One right at a time.', 'Selective incorporation applies particular rights to states if they are fundamental to the scheme of ordered liberty or deeply rooted in history and tradition.'),
      m(6, 2, 1, 'Which case held that the Second Amendment right to keep and bear arms applies to the states?',
        ['McDonald v. City of Chicago', 'District of Columbia v. Heller', 'Barron v. Baltimore', 'Duncan v. Louisiana'], 0,
        'The Chicago handgun ban.', 'McDonald (2010) incorporated the Second Amendment. Heller (2008) addressed the federal enclave of the District of Columbia.'),
      m(6, 3, 2, 'A state convicts a defendant of a serious crime by a 10-to-2 jury vote. Which decision most directly bears on the validity of the verdict?',
        ['Ramos v. Louisiana, which requires a unanimous jury verdict in serious criminal cases tried in state court',
         'Barron v. Baltimore, which held that the Bill of Rights does not apply to the states',
         'Slaughter-House Cases, which held that the Fourteenth Amendment protects only a narrow list of national rights',
         'Gitlow v. New York, which held that free speech rights bind the states and not the jury trial right'], 0,
        'Sixth Amendment, unanimity.', 'Ramos held that the Sixth Amendment\'s unanimity requirement applies to the states through the Fourteenth Amendment. Barron and Slaughter-House stand for older limits.'),
      m(6, 4, 3, 'A county imposes a very large fine and forfeiture on a person for a minor drug offense. Which argument best uses the incorporation doctrine?',
        ['The Excessive Fines Clause of the Eighth Amendment is incorporated and so limits state and local governments, as Timbs v. Indiana held',
         'The Eighth Amendment limits only the federal government, so a state may impose any fine its legislature authorizes under state law',
         'The Fifth Amendment\'s grand jury clause is incorporated and requires that any fine over a certain amount be approved by a grand jury',
         'The Ninth Amendment protects unenumerated rights against excessive fines, and thus applies directly to the states without incorporation'], 0,
        'A 2019 case on civil forfeiture.', 'Timbs incorporated the Excessive Fines Clause, so it applies to states and localities. The grand jury clause is not incorporated.'),
      m(6, 5, 3, 'A justice argues that the original meaning of the Privileges or Immunities Clause of the Fourteenth Amendment, rather than the Due Process Clause, is the proper basis for applying the Bill of Rights to the states. Which is the most accurate description of this view\'s status?',
        ['It has been advanced by some justices and scholars, but the Court\'s incorporation decisions have rested on the Due Process Clause since Slaughter-House narrowed the clause',
         'It is the governing basis of the Court\'s incorporation doctrine, which a majority adopted in McDonald v. Chicago when it incorporated the Second Amendment against the states',
         'It was rejected in Slaughter-House, which held that the clause protects no federal rights, and the Court has since treated the clause as a dead letter in every context',
         'It would apply the Bill of Rights to the states only for rights that Congress has listed in a statute enacted under the Enforcement Clause, as in Katzenbach v. Morgan'], 0,
        'Think about who wrote what in McDonald.', 'Justice Thomas, concurring in McDonald, urged the Privileges or Immunities route, but the majority used due process. The Slaughter-House Cases narrowed the clause long ago.'),

      m(7, 1, 1, 'Which of these constitutional provisions applies to private conduct and is not limited by the state action requirement?',
        ['The Thirteenth Amendment', 'The Fourteenth Amendment\'s Equal Protection Clause', 'The Fifteenth Amendment', 'The First Amendment\'s Free Speech Clause'], 0,
        'The amendment abolishing slavery.', 'The Thirteenth Amendment reaches private conduct. The Fourteenth generally requires state action, and the Fifteenth and the First are likewise directed at government.'),
      m(7, 2, 1, 'Under the public function exception, when is a private party treated as a state actor?',
        ['When it performs a function that has traditionally and exclusively been performed by the government',
         'When it receives any public funding or is licensed and regulated by a government agency',
         'When it provides a service that the public considers important, such as education or health care',
         'When it holds a contract with a state agency that exceeds a certain amount of money per year'], 0,
        'Both traditionally and exclusively.', 'The exception is narrow. Funding, licensing and regulation alone are not enough, as in Rendell-Baker and Blum.'),
      m(7, 3, 2, 'A private nonprofit operates a company-owned town whose streets are open to the public and has the sidewalks function as a town center. It bars a person from distributing religious pamphlets. Under Marsh v. Alabama, what is the best argument for the speaker?',
        ['The private owner performs a public function by operating the town, so the First Amendment applies to its restrictions',
         'The private owner is bound because any private property open to the public must follow the First Amendment',
         'The private owner is bound only if the state has given it a tax exemption as a nonprofit corporation',
         'The private owner is not bound because the First Amendment never applies to a corporation that holds title to land'], 0,
        'The company town case.', 'Marsh applied the First Amendment to a company town that functioned like a municipality. The Court has not extended the holding to all private property open to the public.'),
      m(7, 4, 3, 'A private nonprofit operates public access cable channels under an arrangement with a city and removes two producers after they criticize the nonprofit. The producers sue under the First Amendment. What is the likely outcome under Halleck?',
        ['The nonprofit is not a state actor, because operating a forum for speech is not a function traditionally and exclusively performed by government',
         'The nonprofit is a state actor because it was designated by the city and so exercises delegated governmental power',
         'The nonprofit is a state actor because any entity that holds itself out as providing a public forum for speech must follow the First Amendment',
         'The nonprofit is not a state actor only because it has chosen to operate as a charity rather than as a commercial corporation'], 0,
        'Recent Supreme Court public function case.', 'Halleck held that merely hosting speech is not a traditional and exclusive government function, and a government designation or regulation does not change that.'),
      m(7, 5, 3, 'A private restaurant leases space in a city-owned parking garage, and the garage\'s financial success is tied to the restaurant\'s rent. The restaurant refuses service to a customer because of race. Which doctrine best supports a claim that the restaurant is a state actor?',
        ['Symbiotic relationship or entanglement, as in Burton v. Wilmington Parking Authority, where the government\'s involvement made it a joint participant in the discrimination',
         'Public function, because operating a restaurant in a government building is a function traditionally and exclusively performed by the state, as in Marsh v. Alabama',
         'Judicial enforcement, as in Shelley v. Kraemer, because the restaurant could ask the police to remove the customer and a court to enforce the exclusion',
         'State compulsion, as in Blum v. Yaretsky, because the city required the restaurant to refuse service to such customers by a written term of its lease'], 0,
        'Interdependence between state and private actor.', 'Burton found state action where the state was so entwined with the private business that it was a joint participant. Restaurants are not a traditional exclusive state function.'),

      m(8, 1, 1, 'What standard does a court apply to a law burdening a right it holds to be fundamental under substantive due process?',
        ['Strict scrutiny', 'Rational basis review', 'Intermediate scrutiny', 'The Pike balancing test'], 0,
        'Compelling interest, narrow tailoring.', 'Fundamental rights receive strict scrutiny. Rational basis applies if no fundamental right is involved. Pike is a dormant Commerce Clause test.'),
      m(8, 2, 1, 'What method did Washington v. Glucksberg set for identifying unenumerated fundamental rights?',
        ['The right must be deeply rooted in the nation\'s history and tradition and implicit in the concept of ordered liberty, carefully described',
         'The right must be recognized in the law of a majority of states when the claim is brought, as shown by a survey of current state statutes and constitutions',
         'The right must follow from a prior Supreme Court decision that applied strict scrutiny to a similar claim, extended by analogy to the new context',
         'The right must be essential to personal autonomy and identity, as the justices judge it under the evolving standards of a maturing society'], 0,
        'History and tradition, careful description.', 'Glucksberg used the history-and-tradition test with a careful description, and rejected a right to assisted suicide.'),
      m(8, 3, 2, 'What does it mean to say that the current federal law on abortion, after Dobbs, is a matter of rational basis review?',
        ['Because the Constitution does not confer a right to abortion, state regulation is reviewed deferentially and must be rationally related to a legitimate interest',
         'Courts apply intermediate scrutiny to state laws that ban abortion before viability, because Dobbs treated abortion regulation as a sex-based classification',
         'Courts apply the undue burden standard from Casey to every state regulation of abortion, because Dobbs left the Casey framework in place for pre-viability laws',
         'Courts decline to review state abortion laws as nonjusticiable political questions, leaving the issue to the democratic process in each state without judicial review'], 0,
        'State the law as a fact.', 'Dobbs held that there is no constitutional right to abortion, and that abortion regulations are subject to rational basis review. The undue burden test was overruled with Casey.'),
      m(8, 4, 3, 'A state law forbids parents from sending their children to any school but a public school. Parents sue. Which line of authority gives the strongest support to the parents\' claim?',
        ['Pierce v. Society of Sisters, which held that parents have a liberty interest in directing their children\'s education',
         'Lochner v. New York, which held that all economic regulations of private contracts violate due process',
         'Griswold v. Connecticut, which held that married couples have a right to be free from searches of their homes',
         'Carolene Products, which established that every law burdening a personal liberty receives strict scrutiny'], 0,
        'Parental rights in education.', 'Pierce (1925) struck down a law requiring public school attendance. Griswold concerned contraception, Lochner economic liberty, and Carolene Products deference to economic regulation.'),
      m(8, 5, 3, 'A challenger argues that same-sex couples have the right to marry under both due process and equal protection. Which statement correctly describes the current law?',
        ['Obergefell held that states must license and recognize such marriages, has not been overruled, and the Respect for Marriage Act of 2022 adds a statutory requirement of recognition',
         'Obergefell was overruled in Dobbs, which rejected all unenumerated substantive due process rights, so states may again refuse to license or recognize such marriages',
         'Obergefell held only that states must recognize marriages validly performed elsewhere, and left each state free to decline to license such marriages itself',
         'Obergefell rested only on equal protection and left the due process question open, and the Respect for Marriage Act of 2022 later codified that equal protection holding'], 0,
        'Distinguish what was decided from what is argued.', 'Obergefell remains good law as of this writing. Dobbs did not overrule it, and it relied on both due process and equal protection.'),

      m(9, 1, 1, 'What are the two steps of a procedural due process claim?',
        ['First whether a protected life, liberty or property interest is at stake, then what process is due',
         'First whether a statute is unconstitutional on its face, then whether it is unconstitutional as applied',
         'First whether the plaintiff has standing, then whether the government has sovereign immunity',
         'First whether a state actor is involved, then whether a fundamental right is burdened'], 0,
        'Interest, then process.', 'Courts ask whether there is a deprivation of a protected interest and then apply Mathews to decide what procedure is required.'),
      m(9, 2, 1, 'Where do property interests protected by due process come from, according to Board of Regents v. Roth?',
        ['Independent sources such as state law, statutes, contracts and understandings creating a legitimate claim of entitlement',
         'Only from the text of the Constitution and federal statutes, which list the property interests that due process protects from deprivation by government',
         'From any subjective expectation that a person has of a continuing benefit, so long as the person relied on the benefit in good faith',
         'Only from common-law ownership interests in real or personal property, which excludes government benefits and public employment positions'], 0,
        'Entitlement, not mere expectation.', 'Roth held that property interests arise from independent sources and must be more than a unilateral expectation.'),
      m(9, 3, 2, 'A public university terminates a tenured professor without notice or hearing. Which authority most directly supports the professor\'s claim that some process was due before the termination?',
        ['Cleveland Board of Education v. Loudermill, which requires notice and an opportunity to respond before termination of a public employee with a property interest',
         'Daniels v. Williams, which held that an official\'s negligent act does not deprive a person of life, liberty or property under the Due Process Clause',
         'Paul v. Davis, which held that defamation by a state official, without more, does not deprive a person of a protected liberty interest',
         'Sandin v. Conner, which held that prison regulations create protected liberty interests only when they impose an atypical and significant hardship'], 0,
        'Tenured public employee.', 'Loudermill requires pretermination notice and an opportunity to respond, followed by a fuller hearing. Daniels and Paul limit due process claims.'),
      m(9, 4, 3, 'A state terminates a person\'s disability benefits after reviewing medical records and offers a full hearing only after the termination. The recipient argues a pretermination evidentiary hearing is required. Under the Mathews balancing test, what is the most likely result?',
        ['The state likely prevails, because the decision turns on medical records, the risk of error is modest, and a postdeprivation hearing may suffice',
         'The recipient prevails, because Goldberg v. Kelly requires a full evidentiary hearing before termination of any government benefit, whatever the nature of the dispute',
         'The recipient prevails, because under Mathews the government\'s fiscal and administrative burden may not be weighed against the private interest at stake',
         'The recipient prevails, because disability benefits depend on medical judgment and Mathews requires live testimony and cross-examination before any termination'], 0,
        'This is the Mathews fact pattern.', 'Mathews upheld the procedure because the decision was based on documents, the private interest was less dire than in Goldberg, and the government\'s interest weighed against more process.'),
      m(9, 5, 3, 'A prison guard negligently leaves a mop on a stair, and an inmate slips and is injured. The inmate sues under the Fourteenth Amendment for deprivation of liberty without due process. What is the most likely result?',
        ['The claim fails, because negligence by a state official does not constitute a deprivation under the Due Process Clause',
         'The claim succeeds, because any injury to an inmate in state custody is a deprivation of liberty requiring a hearing',
         'The claim succeeds because the state must compensate every inmate for any physical harm suffered during imprisonment',
         'The claim fails only if the guard was off duty at the time, since on-duty acts are always attributed to the state as deprivations'], 0,
        'Think of Daniels v. Williams.', 'Daniels held that mere negligence is not a deprivation within the Due Process Clause. State tort law may supply a remedy.'),

      m(10, 1, 1, 'What standard of review applies to classifications based on sex?',
        ['Intermediate scrutiny, requiring an important interest and a substantial relationship to it', 'Strict scrutiny, requiring a compelling interest and narrow tailoring', 'Rational basis review, requiring only a legitimate interest and a rational means', 'Absolute prohibition, with no justification accepted by the courts'], 0,
        'Craig v. Boren.', 'Sex classifications receive intermediate scrutiny. In United States v. Virginia the Court spoke of an exceedingly persuasive justification.'),
      m(10, 2, 1, 'What must a plaintiff show to prove that a facially neutral law violates equal protection?',
        ['Both a discriminatory effect and a discriminatory purpose', 'A disparate impact on a protected group, without any need to prove motive', 'That the law was enacted by a legislature in which the group lacked representation', 'That a federal statute prohibits the same disparate impact in the same context'], 0,
        'Washington v. Davis.', 'Disparate impact alone is not enough for an equal protection claim, although it can be evidence of purpose under Arlington Heights.'),
      m(10, 3, 2, 'A state law gives a hiring preference in public jobs to veterans, who are overwhelmingly male. A woman challenges the preference as sex discrimination. What is the most likely analysis?',
        ['The law is neutral on its face, so the claim fails unless she shows it was adopted because of its adverse effect on women, not just in spite of it',
         'Strict scrutiny applies, because a preference that falls overwhelmingly on one sex has a disparate impact that triggers heightened review under Craig v. Boren',
         'Intermediate scrutiny applies, and the preference is invalid unless the state shows an exceedingly persuasive justification for the disparity that it produces',
         'The law is valid because rational basis review governs all hiring preferences, so veterans preferences are not open to any equal protection challenge'], 0,
        'Purpose, not merely effect.', 'A facially neutral law that has a disparate effect requires discriminatory purpose, defined as acting because of, not merely in spite of, the effect on a group. This follows Washington v. Davis and Personnel Administrator v. Feeney.'),
      m(10, 4, 3, 'A state university uses race as one factor in admissions to obtain the educational benefits of diversity and says it will review the program every five years. After SFFA v. Harvard, what is the strongest argument against the program?',
        ['Race-based admissions are subject to strict scrutiny, and the interests are not sufficiently measurable, the program uses race as a negative and lacks a logical endpoint',
         'Race-conscious admissions by public universities receive intermediate scrutiny as benign classifications, and the program fails because the diversity interest is not important',
         'The program is unconstitutional because the Equal Protection Clause bars a university from considering any factor other than test scores and grades, including essays and activities',
         'The program is valid under Grutter v. Bollinger, which SFFA reaffirmed by holding that a periodic review every five years supplies the logical endpoint required'], 0,
        'Strict scrutiny in 2023.', 'SFFA applied strict scrutiny and found that the programs lacked measurable objectives, used race negatively and stereotypically, and had no endpoint. The opinion did not bar considering an applicant\'s own discussion of how race affected his or her life.'),
      m(10, 5, 3, 'A city denies a zoning permit for a group home for people with intellectual disabilities, citing neighbors\' fears. The law applies rational basis review to disability classifications. Under Cleburne, how might the challenger prevail?',
        ['By showing that the denial rests on irrational prejudice and bare hostility, which is not a legitimate government interest even under rational basis review',
         'By showing that disability is a suspect classification under Cleburne, so that the denial must meet strict scrutiny, which the city cannot satisfy',
         'By showing that the zoning rule has a disparate impact on people with disabilities, which Cleburne held is enough to violate equal protection',
         'By showing that disability is a quasi-suspect classification, so that the denial must meet intermediate scrutiny as with sex-based classifications'], 0,
        'Rational basis with bite.', 'Cleburne held disability is not a suspect class but struck the permit requirement as based on irrational fear and prejudice. This line of cases is often called rational basis with bite.'),

      m(11, 1, 1, 'What review applies to a content-based restriction on speech?',
        ['Strict scrutiny', 'Intermediate scrutiny', 'Rational basis review', 'Pike balancing'], 0,
        'Presumed invalid.', 'Content-based laws are presumptively invalid and survive only if narrowly tailored to a compelling interest.'),
      m(11, 2, 1, 'What test governs advocacy of unlawful conduct under the First Amendment?',
        ['Brandenburg: the speech must be directed to inciting imminent lawless action and likely to produce it', 'Schenck: any speech that creates a clear and present danger may be punished under the statute', 'Miller: speech that appeals to the prurient interest may be restricted under community standards', 'Central Hudson: speech about unlawful activity is protected only if the restriction is not more extensive than necessary'], 0,
        'Imminence is the key.', 'Brandenburg replaced the older tests with a demanding rule requiring imminence and likelihood.'),
      m(11, 3, 2, 'A town ordinance bans all signs larger than six square feet in public parks, regardless of message. A resident challenges it. What is the best statement of the standard?',
        ['The ordinance is content-neutral, so it is reviewed as a time, place and manner rule: significant interest, narrow tailoring, and ample alternatives',
         'The ordinance is content-based because it limits how much speech occurs, so it is reviewed under strict scrutiny and must be the least restrictive means',
         'The ordinance is valid because parks are government property, and the government may regulate speech there under rational basis review as the owner of the land',
         'The ordinance is reviewed as a regulation of a nonpublic forum, so it need only be reasonable in light of the park\'s purpose and viewpoint neutral'], 0,
        'Does the rule depend on the message?', 'A neutral size limit is analyzed under intermediate scrutiny, which does not require the least restrictive means (Ward). Parks are traditional public forums, so regulation is limited.'),
      m(11, 4, 3, 'A town allows temporary directional signs for religious services up to six square feet, but permits signs about political candidates up to twenty square feet, and signs for ideological messages up to twenty. A church challenges the rule. Under Reed v. Gilbert, what is the most accurate analysis?',
        ['The code is content-based on its face because the rules depend on message, so strict scrutiny applies regardless of the town\'s motive',
         'The code is content-neutral because the town has no hostile motive toward the church or its message',
         'The code is reviewed under intermediate scrutiny because it regulates signs and not speech by individual persons',
         'The code is automatically invalid because every sign ordinance that distinguishes between signs violates the First Amendment'], 0,
        'Look at the face of the law.', 'Reed held that a law distinguishing signs by their message is content-based, no matter its motive, and must survive strict scrutiny. Not every sign law is invalid.'),
      m(11, 5, 3, 'A court issues an injunction barring a newspaper from publishing a lawful, truthful story based on a leaked government document that the government says may embarrass officials and harm the national interest in general terms. What is the strongest argument against the injunction?',
        ['It is a prior restraint, which bears a heavy presumption of invalidity, and the government has not shown the direct, immediate and irreparable harm needed under the Pentagon Papers decision',
         'It is invalid because the First Amendment bars any injunction against a news organization, including one that would prevent publication of troop movements during wartime',
         'It is invalid because the leaked document was obtained unlawfully, and the Court held in the Pentagon Papers case that a newspaper may not publish unlawfully obtained material',
         'It is valid because the executive\'s claim of harm to national security is entitled to deference, and courts must enjoin publication whenever the government invokes it'], 0,
        'Think of New York Times Co. v. United States.', 'Prior restraints are presumptively invalid, and the Pentagon Papers case required a very heavy showing. The Court has not said that no prior restraint can ever be justified.'),

      m(12, 1, 1, 'What must a public official prove to win a defamation claim under New York Times Co. v. Sullivan?',
        ['That the statement was false and made with actual malice, meaning knowledge of falsity or reckless disregard for the truth', 'That the statement was false and damaging, and that the publisher was negligent in failing to verify the facts before publishing it', 'That the statement was defamatory and widely published, and that the official suffered actual economic loss, whether or not it was false', 'That the statement was made with ill will or spite toward the official, and that the official\'s reputation suffered as a result of it'], 0,
        'A term of art.', 'Sullivan requires actual malice, which is knowledge of falsity or reckless disregard, not ill will.'),
      m(12, 2, 1, 'Which standard does Counterman v. Colorado set as the minimum for prosecuting a true threat?',
        ['The speaker must have consciously disregarded a substantial risk that the statements would be viewed as threatening violence', 'The statement must be objectively threatening to a reasonable listener, with no showing of the speaker\'s mental state required for conviction', 'The speaker must have intended to carry out the threat, so that a prosecutor must prove a purpose of committing the violence', 'The speaker must have known for certain that the statement would be taken as a threat, since recklessness is not enough'], 0,
        'Recklessness.', 'Counterman held that the First Amendment requires proof of subjective mental state, and recklessness suffices.'),
      m(12, 3, 2, 'A state bans truthful advertising of a lawful product on the ground that it will increase consumption. Under Central Hudson, what must the state show?',
        ['A substantial interest, that the ban directly advances it, and that the ban is not more extensive than necessary', 'A compelling interest, and that the ban is the least restrictive means of serving it, as with content-based limits on political speech', 'Only a rational basis for the ban, since truthful commercial speech about lawful products receives no First Amendment protection', 'That the advertising is false or misleading, because truthful commercial speech about a lawful product can never be restricted'], 0,
        'Intermediate scrutiny for commercial speech.', 'Central Hudson sets a four-part intermediate scrutiny test for truthful speech about lawful activity.'),
      m(12, 4, 3, 'A candidate for public office publishes a statement that a rival has been convicted of fraud, which is false. The candidate had a doubt about the claim and did not check it, though the candidate genuinely believed it to be true. The rival is a public figure. What is the strongest defense under Sullivan?',
        ['The rival cannot show actual malice, because failing to investigate, without more, does not show knowledge of falsity or reckless disregard for the truth',
         'The statement is protected opinion, because a campaign accusation of criminal conduct is rhetorical hyperbole that a reasonable reader would not take as fact',
         'The rival cannot recover without proving negligence, which the candidate defeats by showing that the candidate genuinely believed the claim to be true',
         'Garrison v. Louisiana held that criminal accusations about a public figure are protected whether or not they are false, so the candidate cannot be liable'], 0,
        'Actual malice is not negligence.', 'Failure to investigate does not prove reckless disregard without a serious doubt about truth; the standard is subjective. The candidate\'s belief matters, though doubts alleged may be tested at trial.'),
      m(12, 5, 3, 'A group publicly advocates, in offensive and hateful terms, a position that many find deeply hurtful, without threatening anyone or inciting imminent violence. A state prosecutes the speakers under a statute against hate speech. How would the Court most likely analyze it?',
        ['The speech is protected, because hate speech as such is not an unprotected category, and the law targets viewpoint', 'The speech is unprotected because speech that causes serious emotional harm to a group is a category the Court has recognized', 'The speech is unprotected because it fits the fighting words doctrine, which covers any insulting statements on public streets', 'The speech is protected only if it is spoken in private, because public hate speech has no value for democratic debate'], 0,
        'Matal v. Tam and Snyder v. Phelps.', 'The Court has held that offensive speech is protected unless it falls within an established category such as true threats or incitement. Fighting words are narrowly confined.'),

      m(13, 1, 1, 'What did Kennedy v. Bremerton School District say about the Lemon test?',
        ['The Court said it had abandoned Lemon and that the Establishment Clause is interpreted by reference to historical practices and understandings', 'The Court reaffirmed Lemon as the controlling test for every Establishment Clause claim and held that the school\'s prayer failed its secular purpose prong', 'The Court replaced Lemon with the endorsement test, under which any government act a reasonable observer would see as favoring religion is invalid', 'The Court limited Lemon to cases about public schools and held that other religious displays are reviewed under strict scrutiny'], 0,
        '2022 decision about a coach\'s prayer.', 'Kennedy said that the Court had long ago abandoned Lemon and its endorsement offshoot, and relied on history and tradition.'),
      m(13, 2, 1, 'Which case held that government-sponsored prayer in public schools violates the Establishment Clause?',
        ['Engel v. Vitale', 'Zelman v. Simmons-Harris', 'Town of Greece v. Galloway', 'Carson v. Makin'], 0,
        'A 1962 decision about a regents\' prayer.', 'Engel held that official school prayer is unconstitutional. Zelman and Carson concern funding and Greece concerns legislative prayer.'),
      m(13, 3, 2, 'A town council opens its meetings with a prayer given by volunteer local clergy, most of them Christian, but the town has not excluded other faiths and no one is pressured to join. Under Town of Greece v. Galloway, what is the likely result?',
        ['The practice is likely valid as consistent with historical tradition, so long as there is no coercion and no discrimination in selecting speakers', 'The practice is invalid because a prayer sponsored by a government body endorses religion under the Lemon test, even when attendance is voluntary', 'The practice is invalid because Marsh v. Chambers required prayers to be nonsectarian, and these prayers were predominantly Christian in content', 'The practice is valid only if the town invites clergy from a wide range of faiths and the council reviews each prayer\'s content in advance'], 0,
        'Legislative prayer has a long history.', 'Greece upheld sectarian legislative prayer as part of tradition and noncoercive. Marsh did not require nonsectarian prayers.'),
      m(13, 4, 3, 'A state offers a tuition program that pays for private schooling in towns without public high schools, but excludes schools that provide religious instruction. A family wants to use the funds at a religious school. After Carson v. Makin, what is the strongest argument?',
        ['The exclusion violates the Free Exercise Clause because it denies a generally available benefit based on the religious character of the school', 'The exclusion is required by the Establishment Clause, which forbids any government payment to a school that teaches religion', 'The exclusion is valid because a state may choose not to fund any activity that it considers inconsistent with its secular purposes', 'The exclusion is invalid only if the state also bars students from using funds at non-religious private schools'], 0,
        'Status and use of religion in funding.', 'Carson held that a state that offers a generally available benefit may not exclude religious schools because of their religious exercise. The Establishment Clause does not require the exclusion.'),
      m(13, 5, 3, 'A public school principal invites a local clergy member to deliver a prayer at a graduation ceremony; students are expected to stand respectfully. Under Lee v. Weisman, how is this analyzed?',
        ['The prayer is likely unconstitutional because the setting creates subtle coercive pressure on students to participate', 'The prayer is valid because graduation is a voluntary ceremony and so no student can feel pressure', 'The prayer is valid because Town of Greece overruled Lee v. Weisman for all school settings', 'The prayer is unconstitutional only if the clergy member belongs to a religion that is the majority faith in the district'], 0,
        'Coercion in school settings.', 'Lee held that clergy-led prayer at a graduation was impermissibly coercive. Greece distinguished school settings from legislative prayer by adult audiences.'),

      m(14, 1, 1, 'What did Employment Division v. Smith hold about neutral laws of general applicability?',
        ['They do not violate the Free Exercise Clause even if they incidentally burden religious practice, and no compelling interest is required', 'They violate the clause whenever they burden a sincere religious practice unless the government shows a compelling interest', 'They are invalid when they burden any religious practice, unless the group is a recognized church', 'They are valid only when Congress has explicitly said that no religious exemptions will be available'], 0,
        'Peyote and unemployment benefits.', 'Smith held that neutral, generally applicable laws are valid without exemptions. RFRA and many state laws later restored a stricter standard by statute.'),
      m(14, 2, 1, 'What does the Religious Freedom Restoration Act of 1993 require of the federal government?',
        ['Strict scrutiny for any substantial burden on the exercise of religion, even from a rule of general applicability', 'Deference to any federal law that is neutral toward religion, with no individual exemptions allowed', 'Exemptions for religious believers from every federal law without any weighing of governmental interests', 'The same standard as the Establishment Clause for any federal funds that go to religious bodies'], 0,
        'Congress responded to Smith.', 'RFRA provides strict scrutiny for substantial burdens by federal action; Boerne held that it cannot apply to the states.'),
      m(14, 3, 2, 'A city passes ordinances prohibiting ritual animal sacrifice but allows slaughter for food, hunting, pest control and kosher slaughter. The ordinances were passed after a particular church announced its plans. Under Lukumi, what is the likely result?',
        ['The ordinances are not neutral or generally applicable because they target one faith, so strict scrutiny applies and they likely fail', 'The ordinances are valid because they are laws of general applicability under Smith, whatever their origin', 'The ordinances are valid because the city has a compelling interest in the prevention of cruelty to animals in every setting', 'The ordinances are invalid only because the church had applied for an exemption, which the city denied'], 0,
        'Object and design of the law.', 'Lukumi found the ordinances were gerrymandered to target one religion and underinclusive, so they failed strict scrutiny.'),
      m(14, 4, 3, 'A state\'s public health order limits attendance at religious services to 25 people but allows gatherings at retail stores and similar businesses to be larger. A church sues. Under Tandon v. Newsom, what is the best analysis?',
        ['The order is not neutral and generally applicable if it treats any comparable secular activity more favorably than religious activity, so strict scrutiny applies', 'The order is generally applicable because retail stores and churches differ in function, and Tandon lets a state treat them differently without strict scrutiny', 'The order is invalid because the Free Exercise Clause bars public health authorities from capping attendance at religious services during an emergency', 'The order is valid only if the state proves that religious services have caused outbreaks of the disease, since strict scrutiny requires proof of causation'], 0,
        'Comparable secular activities.', 'Tandon said the comparison is based on the risks posed, and the government\'s asserted interest does not alone decide comparability. If secular activity is treated better, strict scrutiny applies.'),
      m(14, 5, 3, 'A teacher at a religious school who teaches religion classes and leads prayer sues the school for disability discrimination after being dismissed. Under the ministerial exception, what is the most likely result?',
        ['The suit is likely barred, because the exception protects a religious school\'s autonomy in choosing those who carry out its faith', 'The suit proceeds because all schools are subject to anti-discrimination statutes without exception', 'The suit is barred only if the teacher has a formal title of minister or ordained clergy member', 'The suit proceeds because religious schools receive an exemption only for hiring decisions made at the time of employment'], 0,
        'Hosanna-Tabor and Our Lady of Guadalupe.', 'The exception turns on the employee\'s function and not title, as Our Lady of Guadalupe held in extending Hosanna-Tabor.'),

      m(15, 1, 1, 'Which set lists the three elements of Article III standing?',
        ['Injury in fact, causation, and redressability', 'Notice, hearing, and decision by a neutral judge', 'Ripeness, mootness, and the political question doctrine', 'Jurisdiction, venue, and a valid cause of action'], 0,
        'Lujan v. Defenders of Wildlife.', 'Plaintiffs must show concrete injury, traceable to the defendant, and likely redressable. The other lists describe due process, other justiciability doctrines and civil procedure.'),
      m(15, 2, 1, 'What is the political question doctrine?',
        ['A doctrine that withholds from courts issues committed to another branch or lacking judicially manageable standards', 'A doctrine that forbids courts from hearing cases in which a political party is a party to the dispute', 'A doctrine that requires courts to dismiss cases that are brought during a federal election campaign', 'A doctrine that permits courts to decide only cases that the President has certified as presenting a political question'], 0,
        'Baker v. Carr and Rucho.', 'The doctrine identifies issues for the political branches. Rucho held partisan gerrymandering claims to be nonjusticiable.'),
      m(15, 3, 2, 'A citizen sues to stop the federal government from spending funds in a way she believes violates the Constitution, claiming only her status as a federal taxpayer. What is the likely result?',
        ['The suit is dismissed for lack of standing, because a generalized taxpayer grievance is not an injury in fact', 'The suit proceeds because every taxpayer is directly injured by any unconstitutional use of tax revenue', 'The suit proceeds because standing is a prudential doctrine that courts may waive when the issue is important', 'The suit is dismissed on the merits because the spending power is unlimited under the General Welfare Clause'], 0,
        'Flast is narrow.', 'Taxpayer status alone is a generalized grievance. The Flast exception for Establishment Clause challenges to congressional spending has been narrowly confined.'),
      m(15, 4, 3, 'A group sues over a data-sharing practice that violated a federal statute but caused no loss and no risk of harm to the plaintiffs. The statute provides statutory damages for each violation. Under TransUnion, what is the strongest ground for dismissal?',
        ['The plaintiffs lack a concrete injury, because a bare statutory violation without a harm bearing a close relationship to a traditionally recognized harm does not confer Article III standing', 'The plaintiffs lack standing because Congress may not create statutory damages for a violation of federal law, since only courts can define which harms are legal injuries', 'The plaintiffs lack ripeness because the data practice has not yet been challenged in an administrative proceeding before the agency charged with enforcing the statute', 'The plaintiffs lack standing because only the Department of Justice may enforce a federal consumer-protection statute, and private suits require a state-law cause of action'], 0,
        'Concreteness of injury.', 'TransUnion held that Congress cannot confer standing by creating a cause of action for violations that lack a concrete harm. The cause of action may exist, but the federal court lacks jurisdiction.'),
      m(15, 5, 3, 'A challenger sued to stop enforcement of a law and then the law is repealed before the court rules. The legislature says it may re-enact the law if the suit is dismissed. Which doctrine is most useful to the plaintiff?',
        ['The voluntary cessation exception to mootness, under which a case continues if the defendant could resume the challenged conduct', 'The ripeness doctrine, because the dispute is no longer premature once the law has been repealed', 'The political question doctrine, because repeal of a law is always a nonjusticiable matter for legislatures', 'The advisory opinion doctrine, which requires that a case be decided whenever the parties have asked for a ruling'], 0,
        'The defendant can start again.', 'Voluntary cessation does not moot a case unless it is absolutely clear that the conduct will not recur. A repeal by statute is sometimes treated differently, but a stated intent to re-enact weighs against mootness.'),

      m(16, 1, 1, 'What standard did City of Boerne v. Flores set for legislation under Section 5 of the Fourteenth Amendment?',
        ['Congruence and proportionality between the injury to be prevented and the means adopted', 'Any rational means of enforcing the amendment, with no inquiry into the connection to a violation', 'A requirement that Congress act only where the Supreme Court has already declared the violation', 'A requirement that every enforcement statute be approved by the legislatures of two-thirds of the states'], 0,
        'Remedial, not substantive.', 'Boerne limits Congress to enforcing and not redefining rights, and requires congruence and proportionality.'),
      m(16, 2, 1, 'Which case held that Congress may reach private racial discrimination in the sale of housing under the Thirteenth Amendment?',
        ['Jones v. Alfred H. Mayer Co.', 'Shelby County v. Holder', 'Civil Rights Cases', 'Katzenbach v. Morgan'], 0,
        'Badges and incidents of slavery.', 'Jones held that Congress could rationally determine the badges and incidents of slavery and bar discrimination in property sales.'),
      m(16, 3, 2, 'What did Shelby County v. Holder hold?',
        ['The coverage formula in the Voting Rights Act was unconstitutional because it was based on outdated data and burdened state sovereignty', 'The preclearance requirement of the Voting Rights Act was upheld in all respects as a valid enforcement of the Fifteenth Amendment', 'All federal regulation of state voting laws is unconstitutional under the Tenth Amendment', 'Section 2 of the Voting Rights Act may not be enforced by private parties in federal court in any circumstances'], 0,
        'The coverage formula.', 'Shelby County struck the formula that determined which jurisdictions needed preclearance. It left Section 2 in force; the Court applied it in Allen v. Milligan (2023) and narrowed vote-dilution claims in Louisiana v. Callais (2026).'),
      m(16, 4, 3, 'A private individual sues a state agency for damages under a federal statute that Congress enacted under the Commerce Clause, and the statute purports to allow suits against states. The state asserts sovereign immunity. Under Seminole Tribe and Alden, what is the likely result?',
        ['The suit is barred because Congress cannot abrogate state sovereign immunity under its Article I powers', 'The suit proceeds because the Eleventh Amendment bars only suits in federal court by citizens of other states', 'The suit proceeds because the Commerce Clause is a source of power that overrides all state immunities', 'The suit is barred only if the state legislature has passed a resolution explicitly asserting its immunity before the suit'], 0,
        'Article I versus Section 5.', 'Seminole Tribe held Congress cannot abrogate under Article I; Alden extended the principle to suits in state courts. Section 5 abrogation requires congruence and proportionality.'),
      m(16, 5, 3, 'A state official is violating a federal civil rights law by enforcing a policy against a group of residents. The state has sovereign immunity from damages suits. Which route is most likely to give the residents relief?',
        ['A suit against the official in her official capacity for prospective injunctive relief under Ex parte Young', 'A suit against the state in federal court for money damages for past violations, because the policy is unlawful', 'A suit against the United States for failing to prevent the state\'s violation of the rights of residents', 'No route exists, because a state\'s sovereign immunity bars any action to enforce federal law against a state official'], 0,
        'Ex parte Young fiction.', 'Ex parte Young permits suits for prospective relief against state officials who violate federal law, even if the state itself cannot be sued for damages.'),

      m(17, 1, 1, 'What is stare decisis?',
        ['The principle that courts generally follow their own precedents, which is weaker for constitutional decisions', 'The rule that the Supreme Court must follow decisions of the other branches of the federal government', 'The rule that no court may overrule a precedent that is more than fifty years old', 'The principle that a lower court may overrule a higher court when circumstances have changed'], 0,
        'Following precedent.', 'Stare decisis is a policy of adhering to precedent, and the Court has said it is at its weakest in constitutional cases where only the Court or an amendment can correct a mistake.'),
      m(17, 2, 1, 'Which test did New York State Rifle & Pistol Association v. Bruen adopt for Second Amendment claims?',
        ['If the text covers the conduct, the government must show that the regulation is consistent with the nation\'s historical tradition of firearm regulation', 'Courts apply intermediate scrutiny, balancing the public-safety interest against the burden on the right in each case, as the lower courts did before Bruen', 'Courts apply rational basis review to carrying restrictions, reserving heightened scrutiny for laws that ban possession of firearms in the home', 'Courts ask whether the law reflects reasoned legislative findings about public safety, deferring to the legislature as in the Heller dissent'], 0,
        'History, not means-end scrutiny.', 'Bruen rejected the two-step means-end scrutiny used by lower courts and required historical analogues. Rahimi later explained that principles, not twins, are the point.'),
      m(17, 3, 2, 'A student summary says, "The Court ruled that originalism is the only legitimate way to read the Constitution." What is the best fair-teaching critique of the summary?',
        ['It states a method as a holding and omits that justices differ about methods and that opinions often combine text, history, precedent and structure', 'It is accurate, because the Court has overruled every precedent that used a method other than originalism', 'It is inaccurate only because the Court has never used history in any decision about the meaning of a constitutional provision', 'It is acceptable as long as the summary also states that the Court has ruled that precedent has no weight in constitutional cases'], 0,
        'Separate method from holding.', 'The Court has not declared a single exclusive method. Fair teaching distinguishes holdings from arguments and acknowledges the use of multiple sources.'),
      m(17, 4, 3, 'A study guide on Dobbs lists only the arguments of the majority and describes the dissenters\' position as a mistake. Which revision best follows a fair-teaching routine?',
        ['State the holding neutrally, separate it from reasoning, present the strongest arguments on each side in terms its supporters would use, and anchor the lesson to the case and related precedents', 'Omit the dissent from the study guide, since the majority opinion states the holding and the dissent has no legal effect that a learner needs to know for exams', 'Replace the summary of the arguments with the author\'s own view of the correct outcome, presented as a model of careful reasoning for learners to follow', 'Describe each justice\'s vote in terms of the party of the President who appointed that justice, because ideology best explains how the Court decided the case'], 0,
        'Holding, strongest arguments, anchors.', 'A fair lesson states the law as a fact, then presents each side at its best and identifies anchors so changes can be tracked. Dissents are part of the legal landscape and often shape later cases.'),
      m(17, 5, 3, 'Rahimi upheld a federal ban on firearm possession by a person subject to a domestic-violence restraining order. What does this case most clearly show about the Bruen test?',
        ['Courts should look to the principles underlying historical regulations, and need not find a historical twin to the modern law', 'Bruen was overruled, and courts again apply interest balancing in Second Amendment cases', 'No firearm regulation may ever be upheld unless an identical law existed at the time of the founding of the nation', 'The Second Amendment does not protect an individual right to keep and bear arms, and Heller was limited to the District of Columbia'], 0,
        'Principle, not an identical law.', 'Rahimi, decided in 2024, clarified Bruen: the government must show consistency with the principles that underlie the tradition, not a dead ringer. Heller remains the anchor for the individual right.'),
    ],
  },
};
