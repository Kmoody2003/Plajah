# law-intl-public: content-integrity fixes (asOf 2026-10)

Validator: `npx tsx scripts/validateCourseModule.ts law-intl-public --stage pro` is clean (no length, filler or reverse-tell warnings; correct answer longest in 23% of MCQs). All lessons carry `asOf: '2026-10'`.

Method note: the icj-cij.org PDFs (judgments, press releases) are behind a bot challenge and were not fetched. ICJ texts were read from the UN-hosted copies (un.org/unispal, documents.un.org A/79/979, legal.un.org ICJ summaries) and the icj-cij.org HTML case pages that did load.

## Factual changes

| Lesson | Was wrong | Now | Source opened |
|---|---|---|---|
| l18 | US "signed but not ratified" UNCLOS | US never signed the 1982 Convention; it signed only the 1994 Part XI Agreement (29 Jul 1994) and has not ratified it. UNCLOS in force 16 Nov 1994, 172 parties. No question depended on the US claim. | https://treaties.un.org/pages/ViewDetailsIII.aspx?src=TREATY&mtdsg_no=XXI-6&chapter=21 (157 signatories, 172 parties, US absent); https://treaties.un.org/pages/ViewDetailsIII.aspx?src=TREATY&mtdsg_no=XXI-6-a&chapter=21 ; https://www.un.org/depts/los/reference_files/chronological_lists_of_ratifications.htm |
| l18 | BBNJ missing | BBNJ Agreement in force 17 Jan 2026, 101 parties (status 2 Oct 2026), content summarised | https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=XXI-10&chapter=21 ; https://www.un.org/bbnjagreement/ |
| l18 | 2,500 m isobath limit vague; warship passage stated as settled | 350 nm / 100 nm from the 2,500 m isobath; warship passage described as contested (q4 rewritten to match) | UNCLOS Arts 17, 76 (verifier-read text; my own fetch of the UNCLOS PDF timed out, so unchanged-in-substance) |
| l03 | Fisheries case: "UK did not object for decades, so rule not opposable to Norway" | Anglo-Norwegian Fisheries (1951): ten-mile rule not general law, and inapplicable against Norway because Norway always opposed it; separately UK's protest only in 1933 showed toleration of Norway's baseline system. Anchor renamed. q4 rewritten. | https://legal.un.org/icjsummaries/documents/english/st_leg_serf1.pdf (summary of Fisheries judgment) |
| l19 | Paris ambition "largely left to the states" | ICJ AO 23 Jul 2025: limited discretion over NDCs (para 245), highest possible ambition not left entirely to parties (para 242), 1.5 C is the agreed primary temperature goal, stringent due diligence, best efforts, customary prevention duty binds non-parties, consequences of breach. Closing paragraph rewritten. | https://documents.un.org/api/symbol/access?s=A/79/979&l=en&t=pdf (full text of the opinion); https://www.icj-cij.org/case/187 |
| l15 | No ES-10/23 or OPT opinions | Added ES-10/23 (10 May 2024, 143 in favour, additional rights, not admission); OPT AO 19 Jul 2024 (11-4 presence unlawful, 12-3 non-recognition duties for states and international organisations); AO 22 Oct 2025 noted | https://www.un.org/unispal/wp-content/uploads/2025/01/n2413111.pdf (A/ES-10/PV.50); https://www.un.org/unispal/document/advisory-opinion-icj-19jul24/ ; https://www.icj-cij.org/case/196 |
| l16 | No recent opinions or pending cases; US declaration "withdrawn after Nicaragua" | Recent AOs listed. Pending, described without predicting outcomes: Gambia v. Myanmar (filed 11 Nov 2019, PO judgment 22 Jul 2022, merits hearings 12-29 Jan 2026), South Africa v. Israel (filed 29 Dec 2023, many Art 63 interventions, 21 May 2026 order fixing Reply/Rejoinder), Ukraine v. Russia genocide case (PO judgment 2 Feb 2024, counter-claims admissible 8 Dec 2025). US declaration: terminated 1985 after the 1984 jurisdiction ruling. | https://www.icj-cij.org/case/192 ; /case/178 ; /case/182 ; https://legal.un.org/icjsummaries/documents/english/st_leg_serf1.pdf |
| l17 | WTO AB "continues as of this writing" | WTO records last member's term expired 30 Nov 2020; still unable to hear appeals. Art 292 prompt release cited. | https://www.wto.org/english/tratop_e/dispu_e/appellate_body_e.htm |
| l13 | "WTO findings can authorise trade retaliation" (unverifiable) | DSB may authorise suspension of concessions if no compliance or compensation (DSU Art 22) | https://www.wto.org/english/docs_e/legal_e/28-dsu_e.htm |
| l10 | Serbia breached duty "to cooperate with the ICTY" | Breach of the duty to punish genocide, by failing to cooperate fully with the ICTY on handing over General Mladic | https://www.icj-cij.org/case/91 |
| l12 | 2004 Immunities Convention "not in force" without detail | 25 parties, 30 needed | https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=III-13&chapter=3 |
| l06 | VCLT details | In force 27 Jan 1980, 119 parties; US signed 24 Apr 1970, never ratified (verifier claim confirmed) | https://treaties.un.org/pages/ViewDetailsIII.aspx?src=TREATY&mtdsg_no=XXIII-1&chapter=23 |

Claims marked unverifiable and now confirmed, no text change: Reparation for Injuries objective personality and Genocide Convention reservations compatibility test (legal.un.org ICJ summaries, same URL as above); Art 2(1) sovereign equality and Art 4 admission procedure (https://www.un.org/en/about-us/un-charter/full-text).

Left unchanged (not opened, standard doctrine, no verifier contradiction): Montevideo Art 1/3, Lotus, Island of Palmas, Paquete Habana, Missouri v. Holland, Chorzow Factory, ILC Articles 2001 article numbers, Liability Convention Arts II/III, Moon Agreement. The treaties.un.org Liability Convention and ILC pages were not reopened in this pass.

## Question quality

Truncated or incomplete correct options restored: l10.q1 (attribution and breach), l12.q5 (personal immunity ended, functional immunity continues), l17.q4 (ITLOS prompt release under Art 292 plus Annex VII), l17.q5 (territorial basis plus admissibility), l18.q4 (Art 17 innocent passage), l18.q5 (hot pursuit conditions), l20.q1 (full Art II wording), l14.q4 (S lawful, T unlawful without request), l19.q4 (impact assessment and notification), l11.q5 (threat to bombard is unlawful), l16.q3 (authorised organs and agencies), l12.q4, l10.q5.

Garbled or weak distractors rewritten into specific plausible errors: l11.q4 (necessity option no longer garbled), l03.q4, l04.q4, l06.q4, l09.q4, l12.q5, l17.q4/q5, l18.q4/q5, l19.q4, l20.q1. About 45 further options were lengthened or trimmed so correct and incorrect options are of similar length and no option is a bare fragment.

Verifier items not changed: l16.q5 (awkward but only reciprocity answer, wording retained); l20.q5 (intended answer is fault liability under Art III; stem unchanged).
