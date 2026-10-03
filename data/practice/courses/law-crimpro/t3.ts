import { mcq, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'law-crimpro.t3', title: 'Charging, Pretrial Process, and Pleas',
    blurb: 'Double jeopardy, charging and bail, prosecutorial disclosure, and plea bargaining.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: 'law-crimpro.l09', title: 'Double Jeopardy', blurb: 'When the Fifth Amendment bars a second prosecution or punishment.', minutes: 14, asOf: '2026-10',
        anchors: [
          { kind: 'case', ref: 'Blockburger v. United States|1932|US' },
          { kind: 'case', ref: 'Ashe v. Swenson|1970|US' },
          { kind: 'case', ref: 'Gamble v. United States|2019|US' },
          { kind: 'case', ref: 'Burks v. United States|1978|US' },
        ],
        body: `The Double Jeopardy Clause says no person shall "be subject for the same offence to be twice put in jeopardy of life or limb." Incorporated against the states in Benton v. Maryland (1969), it protects against a second prosecution after acquittal, a second prosecution after conviction, and multiple punishments for the same offense in one proceeding. Its heart is finality: the government, with its resources, should not get repeated attempts to convict.

Attachment. Jeopardy attaches in a jury trial when the jury is empaneled and sworn (Crist v. Bretz, 1978), and in a bench trial when the first witness is sworn. A dismissal before attachment does not bar a new prosecution.

Same offense. Under Blockburger v. United States (1932), two offenses are different if each requires proof of an element the other does not. Conversely, a lesser included offense is the same as the greater offense (Brown v. Ohio, 1977), so conviction of one bars prosecution of the other. The Court rejected a broader same-conduct test in United States v. Dixon (1993). The Blockburger test controls successive prosecutions; in a single trial legislatures may authorize cumulative punishment for offenses that overlap, if clearly expressed.

Acquittal is final even if wrong. The government cannot appeal a jury acquittal, and a judge's acquittal on sufficiency grounds is equally final, even if based on a legal error (Evans v. Michigan, 2013). Ashe v. Swenson (1970) held that collateral estoppel is part of the guarantee: if a jury necessarily decided an issue for the defendant, such as identity, the government cannot relitigate that issue in a later trial for a different offense.

Retrial after conviction. A defendant who wins a reversal on appeal because of trial error may be retried (United States v. Ball, 1896). But if the appellate court reverses because the evidence was legally insufficient, retrial is barred, since that is the equivalent of acquittal (Burks v. United States, 1978). A reversal based on the weight of the evidence is different and allows retrial (Tibbs v. Florida, 1982).

Mistrials. A mistrial declared at the defendant's request or with consent generally does not bar retrial. If declared over objection, retrial is allowed only if there was manifest necessity, such as a hung jury (Arizona v. Washington, 1978). If the prosecutor intentionally provokes a defense mistrial to avoid an acquittal, retrial is barred (Oregon v. Kennedy, 1982).

Separate sovereigns. Two governments with independent sources of authority may each prosecute for the same conduct. Gamble v. United States (2019) reaffirmed the dual-sovereignty doctrine for state and federal prosecutions, and Puerto Rico and tribal cases turn on the source of authority. Many states by statute or constitution restrict successive prosecutions. The Clause covers criminal punishment only; civil penalties generally do not trigger it unless so punitive in effect that they are criminal (Hudson v. United States, 1997).

Worked example: the state acquits Ryan of murder, then the federal government charges him with violating the victim's civil rights based on the same killing. Because the sovereigns are separate, the Clause does not bar the federal case, although Ashe may block relitigating an issue if the identical sovereign were involved.`,
      },
      {
        id: 'law-crimpro.l10', title: 'Charging, Initial Appearance, and Bail', blurb: 'From arrest through the grand jury, preliminary hearing, and pretrial release.', minutes: 14, asOf: '2026-10',
        anchors: [
          { kind: 'case', ref: 'Gerstein v. Pugh|1975|US' },
          { kind: 'case', ref: 'United States v. Salerno|1987|US' },
          { kind: 'case', ref: 'Stack v. Boyle|1951|US' },
          { kind: 'statute', ref: 'Bail Reform Act of 1984' },
          { kind: 'regulation', ref: 'Federal Rules of Criminal Procedure' },
        ],
        body: `The usual path begins with a complaint or arrest, then an initial appearance before a magistrate. There the defendant is informed of the charges and rights, counsel is appointed if needed, and bail is considered. If arrested without a warrant, the defendant is entitled to a prompt judicial determination of probable cause, generally within 48 hours (Gerstein v. Pugh, 1975; County of Riverside v. McLaughlin, 1991). It may be combined with the initial appearance.

Formal charging comes by indictment or information. The Fifth Amendment guarantees a grand jury indictment for federal capital or "otherwise infamous" crimes, but that guarantee is not incorporated against the states (Hurtado v. California, 1884), so many states use a prosecutor's information after a preliminary hearing instead. The grand jury, which in federal court has 16 to 23 members, meets in secret, receives evidence from the prosecutor, and decides whether there is probable cause. The defendant has no right to appear, to have counsel in the room, or to present evidence. The exclusionary rule does not apply (Calandra), hearsay is allowed (Costello v. United States, 1956), and the prosecutor has no constitutional duty to present exculpatory evidence (United States v. Williams, 1992). A grand jury subpoena may be challenged if unreasonable, and a witness may invoke the Fifth Amendment. Discrimination in selection of grand jurors by race requires reversal of a conviction (Vasquez v. Hillery, 1986).

A preliminary hearing, where used (Federal Rule of Criminal Procedure 5.1), tests probable cause before a magistrate with counsel, cross-examination, and hearsay generally allowed in many jurisdictions. A later indictment generally moots it. Arraignment follows: the defendant hears the charges and enters a plea. Pretrial motions to dismiss, suppress, or sever are then heard.

Bail. The Eighth Amendment says "excessive bail shall not be required." It does not guarantee a right to bail. Stack v. Boyle (1951) held that bail set higher than is reasonably calculated to assure the defendant's appearance is excessive. United States v. Salerno (1987) upheld the Bail Reform Act of 1984, which permits pretrial detention of a defendant charged with serious crimes upon clear and convincing evidence that no conditions of release can reasonably assure community safety or appearance, after an adversarial hearing. Detention based on dangerousness is regulatory, not punishment. Federal law (18 U.S.C. section 3142) sets a preference for release on the least restrictive conditions and a rebuttable presumption of detention for certain drug and firearm offenses. Cash bail, risk assessment tools, and release without money have been reformed in many states, and approaches vary widely. Debate centers on public safety, the presumption of innocence, and the effect of money-based detention on poor defendants.

Worked example: police arrest Kira without a warrant on Friday night and hold her until Tuesday with no judicial review of probable cause. A 48-hour presumption makes the delay presumptively unreasonable, and the state must show a bona fide emergency or extraordinary circumstance.`,
      },
      {
        id: 'law-crimpro.l11', title: 'Discovery and the Brady Obligation', blurb: 'What the prosecution must disclose, and when its nondisclosure violates due process.', minutes: 14, asOf: '2026-10',
        anchors: [
          { kind: 'case', ref: 'Brady v. Maryland|1963|US' },
          { kind: 'case', ref: 'Giglio v. United States|1972|US' },
          { kind: 'case', ref: 'Kyles v. Whitley|1995|US' },
          { kind: 'regulation', ref: 'Federal Rules of Criminal Procedure' },
        ],
        body: `Criminal discovery is narrower than civil discovery. There is no general constitutional right to discovery (Weatherford v. Bursey, 1977). Instead, obligations come from the Due Process Clause, rules, and statutes.

Brady v. Maryland (1963) holds that the prosecution's suppression of evidence favorable to an accused, upon request, violates due process where the evidence is material either to guilt or to punishment, irrespective of good or bad faith. The Court later held that the duty exists with or without a request. Giglio v. United States (1972) extends it to impeachment evidence, such as a deal with a cooperating witness. A Brady violation has three parts (Strickler v. Greene, 1999): the evidence is favorable, either exculpatory or impeaching; it was suppressed by the state, willfully or inadvertently; and prejudice ensued, which means it was material.

Materiality is evaluated collectively. Evidence is material if there is a reasonable probability that, had it been disclosed, the result would have been different, which is less than a preponderance but enough to undermine confidence in the verdict (United States v. Bagley, 1985; Kyles v. Whitley, 1995). Kyles also held that the prosecutor has a duty to learn of favorable evidence known to others acting on the government's behalf, including police. Because materiality can be assessed only after the trial, the duty is often framed as one of disclosure, and prosecutors are expected to err toward disclosure. Many jurisdictions have adopted broader ethics and statutory rules than the constitutional minimum. The prosecution has no constitutional duty to disclose impeachment material before a guilty plea (United States v. Ruiz, 2002).

Beyond Brady: Federal Rule of Criminal Procedure 16 requires disclosure on request of the defendant's statements, prior record, documents and objects, and reports of examinations and tests, with reciprocal obligations on the defense. The Jencks Act (18 U.S.C. section 3500) requires production of a government witness's prior statements after the witness testifies. Reciprocal discovery from the defendant is limited by the Fifth Amendment but valid where it is fair (Wardius v. Oregon, 1973, requires reciprocity when notice of alibi is demanded). Failure to preserve evidence violates due process only if the police acted in bad faith as to potentially useful evidence (Arizona v. Youngblood, 1988).

Remedies include a new trial, a continuance, or dismissal in rare cases. Prosecutors enjoy absolute immunity from civil suits for trial advocacy conduct (Imbler v. Pachtman, 1976), and the Court has held that a district attorney's office is not liable for a single Brady violation absent a pattern (Connick v. Thompson, 2011), leaving professional discipline as a principal check.

Worked example: a state's key witness testified that he received no benefit for his testimony, but the prosecutor had promised in writing to dismiss his pending charge. After conviction the defense learns of it. The promise is Giglio material, and if there is a reasonable probability that the jury, knowing it, would have returned a different verdict, the conviction must be overturned.`,
      },
      {
        id: 'law-crimpro.l12', title: 'Plea Bargaining', blurb: 'The system that resolves nearly every case, and the constitutional limits on it.', minutes: 14, asOf: '2026-10',
        anchors: [
          { kind: 'case', ref: 'Boykin v. Alabama|1969|US' },
          { kind: 'case', ref: 'Bordenkircher v. Hayes|1978|US' },
          { kind: 'case', ref: 'Missouri v. Frye|2012|US' },
          { kind: 'case', ref: 'Santobello v. New York|1971|US' },
          { kind: 'regulation', ref: 'Federal Rules of Criminal Procedure' },
        ],
        body: `Most criminal convictions in the United States, by widely cited estimates well over 90 percent in both federal and state courts, result from guilty pleas rather than trials. The Court has accepted plea bargaining as legitimate because it benefits the defendant, the prosecutor, and the court, while insisting on constitutional limits.

A guilty plea waives several constitutional rights: the privilege against self-incrimination, the right to a jury trial, and the right to confront witnesses (Boykin v. Alabama, 1969). The record must show that the plea is knowing, intelligent, and voluntary. Federal Rule of Criminal Procedure 11 requires the judge to personally address the defendant, confirm understanding of the charge, rights waived, and maximum and minimum penalties, and find a factual basis. A court may accept a plea even if the defendant maintains innocence where there is strong evidence of guilt (North Carolina v. Alford, 1970), and a nolo contendere plea admits no guilt in later civil actions. Under Rule 11, judges may not participate in plea negotiations.

Prosecutorial leverage is permitted. A prosecutor may offer a lesser charge or sentence recommendation in exchange for a plea (Brady v. United States, 1970). In Bordenkircher v. Hayes (1978), a prosecutor who warned a defendant that he would seek a habitual-offender indictment carrying life if the defendant refused a plea offer did not violate due process, because the threatened charge was supported by probable cause and the defendant was free to accept or reject. A vindictive increase in charges merely for exercising a right after a trial is different. Promises made as part of a plea must be honored: when a prosecutor breaks a promise, the defendant may be entitled to specific performance or withdrawal of the plea (Santobello v. New York, 1971).

Effective assistance applies. Counsel must advise accurately about direct consequences and, under Padilla v. Kentucky (2010), about clear deportation risks. Missouri v. Frye (2012) held that counsel must communicate formal plea offers, and Lafler v. Cooper (2012) held that bad advice causing rejection of a favorable plea can be prejudice, measured by a reasonable probability that the offer would have been accepted, accepted by the court, and led to a lesser sentence. The standard for challenging a plea is a reasonable probability that, but for counsel's error, the defendant would have gone to trial (Hill v. Lockhart, 1985; Lee v. United States, 2017). There is no right to a plea offer, and a defendant has no constitutional right to plead guilty to a particular charge.

Limits on use of pleas. Statements in plea discussions and withdrawn pleas are generally inadmissible (Federal Rule of Evidence 410 and Rule 11(f)), but defendants may waive that protection (United States v. Mezzanatto, 1995). Appeal waivers are common and generally enforceable, subject to a miscarriage-of-justice limit (Hunter v. United States, 2026). A guilty plea normally waives claims of pre-plea constitutional defects, but not a challenge to the government's power to prosecute at all, such as a claim that the statute is unconstitutional (Class v. United States, 2018).

Worked example: defense counsel fails to tell Mara about a prosecutor's formal offer of two years, and she later is convicted at trial and sentenced to six. Under Frye and Lafler, she can show deficient performance, and prejudice if she shows a reasonable probability she would have taken the deal, the court would have approved it, and the sentence would have been lower.`,
      },
    ],
  },
  questions: [
    mcq('law-crimpro.l09', 1, 1, 'Under the Blockburger test, two offenses are treated as different for double jeopardy purposes when:',
      ['Each statute requires proof of a fact that the other does not', 'They arise from a single course of conduct or one criminal episode', 'They were committed against the same victim on the same day', 'One offense is punished more severely than the other'],
      0, 'Look at statutory elements, not conduct.', 'Blockburger compares elements. A same-conduct approach was rejected in Dixon, and punishment severity is irrelevant.'),
    mcq('law-crimpro.l09', 2, 2, 'A jury is sworn in Ed\'s robbery trial, but the judge dismisses the case over Ed\'s objection when the prosecutor\'s key witness cannot be found, with no showing of necessity. The state wants to retry Ed. The retrial is:',
      ['Barred, because jeopardy attached and there was no manifest necessity for the dismissal', 'Permitted, because a dismissal entered before a verdict leaves the case unresolved and open to retrial', 'Permitted, because the dismissal was caused by a witness rather than a prosecutor', 'Barred, only if Ed had first asked the court for a mistrial'],
      0, 'Attachment occurs when the jury is sworn.', 'Once jeopardy attaches, a termination over objection requires manifest necessity (Arizona v. Washington). An unprepared state does not meet it.'),
    mcq('law-crimpro.l09', 3, 2, 'Jan is convicted of burglary, but an appellate court reverses because the trial judge wrongly admitted a confession, and the other evidence was sufficient. May the state retry Jan?',
      ['Yes, because reversal for trial error does not bar a retrial', 'No, because conviction followed by reversal is equivalent to an acquittal', 'No, because the government has already had its one opportunity to convict', 'Yes, but only on a lesser included offense of the burglary charge'],
      0, 'Distinguish trial error from insufficient evidence.', 'A defendant who obtains reversal for trial error may be retried (Ball). Retrial would be barred only if the reversal rested on insufficiency (Burks).'),
    mcq('law-crimpro.l09', 4, 3, 'A jury acquits Lou of robbing a poker player, Pat, after the defense claimed Lou was not present. The jury necessarily decided that Lou was not one of the robbers. The state then charges Lou with robbing a second player in the same game by the same robbers. Lou raises double jeopardy. The best argument is that:',
      ['Collateral estoppel bars relitigating identity, which the first jury necessarily decided in his favor', 'Blockburger bars the second case because both offenses are robbery', 'The two offenses are the same because they arose from one poker game', 'The first acquittal made Lou immune from further charges arising out of the same evening'],
      0, 'The Ashe doctrine concerns issues, not offenses.', 'Ashe v. Swenson applied collateral estoppel to bar relitigating an issue necessarily decided. The Blockburger test would treat the robberies of different victims as different offenses, so the argument must rest on issue preclusion.'),
    mcq('law-crimpro.l09', 5, 3, 'A state jury acquits Cam of assaulting a federal officer under a state statute. Federal prosecutors later charge him under a federal statute for the same assault. Under current doctrine, Cam\'s double jeopardy challenge to the federal prosecution will most likely:',
      ['Fail, because the state and federal governments are separate sovereigns with independent sources of authority', 'Succeed, because the same defendant, victim, and act are involved and the Clause protects against a second prosecution for them', 'Succeed, because incorporation of the Clause erased the dual-sovereignty rule', 'Fail, because the federal statute has an element the state statute lacks, despite the separate sovereigns'],
      0, 'Gamble reaffirmed an old doctrine.', 'Gamble v. United States reaffirmed dual sovereignty. Incorporation did not end it, and the Blockburger analysis is unnecessary when the sovereigns differ.'),

    mcq('law-crimpro.l10', 1, 1, 'Under Gerstein v. Pugh and County of Riverside v. McLaughlin, after a warrantless arrest a judicial determination of probable cause must generally occur within:',
      ['48 hours', '24 hours', '72 hours', 'Seven days'],
      0, 'The presumption is two days.', 'McLaughlin set 48 hours as the presumptive limit for a prompt determination.'),
    mcq('law-crimpro.l10', 2, 2, 'A defendant claims that a grand jury indictment must be dismissed because the prosecutor withheld evidence tending to show innocence. Under United States v. Williams, the court should:',
      ['Reject the claim, because courts do not impose a duty on prosecutors to present exculpatory evidence to the grand jury', 'Grant it, because grand jurors cannot fairly assess probable cause unless they see the material evidence, favorable or not', 'Grant it, because the Brady rule applies fully to grand jury presentations', 'Reject it, but only if the defense was told of the evidence before the vote'],
      0, 'The grand jury is not a mini-trial.', 'Williams held that courts may not dismiss for the prosecutor\'s failure to present substantial exculpatory evidence. Brady is a trial-based obligation.'),
    mcq('law-crimpro.l10', 3, 2, 'Under United States v. Salerno, pretrial detention of an arrestee on the ground that he is dangerous is:',
      ['Permissible as regulatory rather than punitive, if an adversarial hearing supports it by clear and convincing evidence', 'Prohibited by the Eighth Amendment, which guarantees a right to bail once the arrestee is charged', 'Permissible only if the defendant has been charged with a capital offense carrying the death penalty', 'Prohibited by the Due Process Clause, because it punishes the arrestee before a conviction has occurred'],
      0, 'The Eighth Amendment speaks of excessive bail.', 'Salerno upheld preventive detention under the Bail Reform Act. The Eighth Amendment bars excessive bail but does not create an absolute right to it.'),
    mcq('law-crimpro.l10', 4, 3, 'Sam is charged in a state that prosecutes all felonies by information after a preliminary hearing rather than by grand jury. He argues that the Fifth Amendment guarantee of a grand jury entitles him to an indictment. The most likely ruling is that the claim:',
      ['Fails, because the grand jury guarantee has not been incorporated against the states', 'Succeeds, because felonies are infamous crimes under the Fifth Amendment', 'Succeeds, because due process requires a screening of serious charges by lay citizens', 'Fails, because the Fifth Amendment guarantee applies only to misdemeanors'],
      0, 'Which Fifth Amendment guarantees were incorporated?', 'Hurtado v. California and later cases leave states free to use informations. The guarantee applies in federal court to infamous crimes.'),
    mcq('law-crimpro.l10', 5, 3, 'In federal court, Dee is charged with a serious drug offense. The prosecutor seeks detention. At the hearing, the government shows probable cause and that Dee has a record of failures to appear, but offers no evidence about danger. The judge finds that no conditions can reasonably assure her appearance by a preponderance of the evidence and orders detention. Which statement best describes the ruling under the Bail Reform Act?',
      ['It is consistent with the Act, because flight risk need be shown only by a preponderance of the evidence', 'It is invalid, because the Act permits detention only on clear and convincing evidence that the defendant is dangerous', 'It is invalid, because risk of flight is not a permitted ground for pretrial detention under the Act', 'It is consistent with the Act, because detention follows once probable cause has been shown'],
      0, 'The Act uses different standards for the two grounds.', 'Under the Act, risk of flight is shown by a preponderance and danger by clear and convincing evidence. Probable cause alone does not require detention, though it triggers rebuttable presumptions for certain offenses.'),

    mcq('law-crimpro.l11', 1, 1, 'Under Brady v. Maryland, the prosecution\'s suppression of favorable evidence violates due process when the evidence is:',
      ['Material to guilt or punishment, regardless of the prosecutor\'s good or bad faith', 'Suppressed in bad faith by the prosecutor, whether or not it would have affected the result', 'Favorable to the defense, even if cumulative and immaterial', 'Requested in writing and in advance by defense counsel'],
      0, 'Materiality matters; motive does not.', 'Brady requires favorable, suppressed, material evidence, with no bad-faith requirement.'),
    mcq('law-crimpro.l11', 2, 2, 'Which of the following is a Giglio violation?',
      ['The state conceals that a witness was promised leniency for testifying', 'The state calls a witness whose testimony the defense dislikes', 'The state fails to hand over its trial strategy memo', 'The state declines to share the identity of a confidential informant who merely gave a tip'],
      0, 'Giglio concerns impeachment.', 'Giglio extends Brady to impeachment evidence such as a cooperation deal. Work product and ordinary strategy are not covered.'),
    mcq('law-crimpro.l11', 3, 2, 'A detective knows that an eyewitness initially failed to identify the defendant but never tells the prosecutor. At trial the defense does not learn of it. Under Kyles v. Whitley, the Brady duty:',
      ['Extends to favorable evidence known to police acting for the government, even if the prosecutor was unaware', 'Applies only to evidence that the trial prosecutor personally knew about, not to what investigators learned and held back', 'Applies only to evidence the defense specifically asked for', 'Does not apply to police, who are not part of the prosecution team'],
      0, 'The prosecutor has a duty to learn of evidence.', 'Kyles holds that the prosecutor is responsible for favorable evidence known to others acting on the government\'s behalf.'),
    mcq('law-crimpro.l11', 4, 3, 'After Ana\'s murder conviction, she learns that the state concealed a report that another suspect had confessed. The state\'s case relied on one eyewitness who was unsure, and no physical evidence connected Ana to the crime. Ana seeks a new trial. Her strongest argument is that:',
      ['The report was favorable and suppressed, and there is a reasonable probability that the verdict would differ given the weak evidence', 'Suppressed favorable evidence compels reversal of the conviction without regard to its likely effect, because Brady is a per se rule', 'The police acted in bad faith, which is required for a Brady violation', 'The report would have shown the prosecutor\'s theory of the case was untrue'],
      0, 'Materiality is the issue.', 'Brady requires a reasonable probability of a different outcome (Bagley; Kyles). The evidence\'s weight against a thin case supports it, and bad faith is not required.'),
    mcq('law-crimpro.l11', 5, 3, 'Before pleading guilty, Roy asked for impeachment material about the government\'s informant, but the prosecutor refused. Roy pleaded guilty, then learned the informant had been unreliable in earlier cases, and moves to withdraw his plea under Brady. The strongest point for the state is that:',
      ['The Constitution does not require disclosure of impeachment material before a guilty plea', 'A guilty plea waives Brady claims, including claims about exculpatory material evidence withheld before it', 'The informant\'s record was not favorable to the defense', 'Brady applies only if the defendant asked in writing before the plea hearing'],
      0, 'United States v. Ruiz is on point.', 'Ruiz held that due process does not require pre-plea disclosure of impeachment information. It did not hold that every Brady claim is waived by a plea.'),

    mcq('law-crimpro.l12', 1, 1, 'Which rights does a defendant waive by pleading guilty, according to Boykin v. Alabama?',
      ['The privilege against self-incrimination, the right to a jury trial, and the right to confront accusers', 'The right to counsel at sentencing, the right to bail pending sentence, and the right to appeal a conviction', 'The right to a speedy trial and protection against double jeopardy', 'The right to be free from unreasonable searches in a later proceeding'],
      0, 'Three trial rights are at stake.', 'Boykin identifies the self-incrimination privilege, jury trial, and confrontation. Counsel remains, and appeal rights are not automatically waived.'),
    mcq('law-crimpro.l12', 2, 2, 'A prosecutor tells Lena that if she rejects a plea offer, he will add a habitual-offender charge for which there is probable cause. She refuses, and he does add it. Under Bordenkircher v. Hayes this is:',
      ['Permissible, because the charge was supported by probable cause and the defendant was free to choose', 'Unconstitutional, because it penalizes the exercise of the right to trial', 'Unconstitutional, because prosecutors may not threaten harsher charges', 'Permissible only if the prosecutor had planned the charge before offering the deal'],
      0, 'The charge was lawful from the start.', 'Bordenkircher held that the give-and-take of bargaining is acceptable when the threatened charge was supported by probable cause.'),
    mcq('law-crimpro.l12', 3, 2, 'A prosecutor promises to recommend a one-year sentence in a plea agreement, but a different prosecutor at sentencing asks for ten years. Under Santobello v. New York, the court should:',
      ['Allow specific performance or withdrawal of the plea, because the promise induced it', 'Disregard the promise, because the judge decides the sentence and a different prosecutor is not bound by it', 'Treat the promise as unenforceable because it was not in writing', 'Dismiss the charges as a sanction for breach of the agreement'],
      0, 'A bargain is a two-way promise.', 'Santobello holds that promises forming part of the inducement must be fulfilled, with remedies of specific performance or plea withdrawal. Dismissal is not the standard remedy.'),
    mcq('law-crimpro.l12', 4, 3, 'Defense counsel never tells Dev about a prosecutor\'s formal offer of two years. Dev is convicted at trial and sentenced to six. In a postconviction proceeding Dev testifies he would have accepted. To obtain relief under Missouri v. Frye and Lafler v. Cooper, Dev must show deficient performance and also a reasonable probability that:',
      ['He would have accepted the offer, the court would have approved it, and the sentence would have been lower', 'He would have been found innocent had the case gone to trial', 'The prosecutor would have increased the offer after further negotiations with defense counsel over the following weeks', 'The offer would have been accepted even if the court had rejected it'],
      0, 'Prejudice has three components.', 'Frye and Lafler require showing acceptance, court approval, and a less severe outcome. Innocence is not required.'),
    mcq('law-crimpro.l12', 5, 3, 'Under a plea agreement Ian pleaded guilty to a federal firearms offense, then argued on appeal that the statute violates the Second Amendment. The government says that the plea waived the claim. Under Class v. United States the argument most likely:',
      ['Fails for the government, because a guilty plea does not bar a claim that the statute of conviction is unconstitutional', 'Succeeds for the government, because a guilty plea waives constitutional claims', 'Succeeds for the government, because only jurisdictional claims survive a plea', 'Fails for the government, because pleas do not waive a claim about police conduct before the plea'],
      0, 'Class concerns the government\'s power to prosecute.', 'Class held a guilty plea by itself does not bar a direct appeal claiming the statute is unconstitutional. Pleas do generally waive pre-plea claims about police conduct, so the final option misstates the law.'),
  ],
};
