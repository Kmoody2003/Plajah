# law-intl-humanitarian-criminal: content-integrity fixes (asOf 2026-10)

Validator: `npx tsx scripts/validateCourseModule.ts law-intl-humanitarian-criminal --stage pro` is clean (only the pre-existing length-tell warning). All 400 options were scanned for stubs or cut-offs: none found, no answer changed.

## Changes

1. **l17 (t5.ts) ECCC Case 002/02.**
   - Was: the ECCC convicted both Nuon Chea and Khieu Samphan of genocide against the Vietnamese and the Cham.
   - Now: Nuon Chea was convicted of genocide against the Vietnamese and the Cham. Khieu Samphan was convicted of genocide against the Vietnamese only. Trial judgment 16 Nov 2018. Nuon Chea died 4 Aug 2019 before his appeal was decided. The Supreme Court Chamber affirmed Khieu Samphan's convictions and life sentence on 22 Sep 2022. Verifier A was right.
   - Sources: https://www.eccc.gov.kh/en/cases/charged-profile/khieu-samphan ("Convicted in Case 002/02 for genocide: By killing members of the Vietnamese group"; SCC affirmed 22 Sep 2022); https://www.eccc.gov.kh/en/cases/charged-profile/nuon-chea (genocide of the Vietnamese and Cham; died 4 Aug 2019); https://www.un.org/ola/fr/node/821 (UN summary: both convicted of genocide against the Vietnamese, Nuon Chea also against the Cham). Anchor for Case 002/02 added.
2. **l18 (t5.ts) ICC states parties.**
   - Was: "about 125 as of this writing"; vague on withdrawals.
   - Now: 125 per the UN depositary in early October 2026. I counted 127 ratification or accession dates, less Burundi and the Philippines, which are shown in brackets as withdrawn. Pending withdrawals, each effective one year after notice: Niger (18 Jun 2026), Burkina Faso (24 Jun 2026), Mali (24 Jun 2026), Venezuela (24 Jul 2026), Chad (27 Jul 2026), Naoero/Nauru (23 Sep 2026). If all take effect, the count falls to 119. Hungary withdrew its 2 Jun 2025 notice on 29 May 2026 and remains a party.
   - Verifier B was right about Burkina Faso, Mali, Niger and Hungary, and incomplete: Venezuela, Chad and Nauru were also pending.
   - Source: https://treaties.un.org/Pages/ViewDetails.aspx?src=TREATY&mtdsg_no=XVIII-10&chapter=18&clang=_en
3. **l10 (t3.ts) starvation in non-international armed conflicts.**
   - Was: implied the 2019 amendment applies generally.
   - Now: the ASP adopted the 8(2)(e)(xix) amendment on 6 Dec 2019. Under Art 121(5) it binds only states parties that accept it. It entered into force 14 Oct 2021 (first for New Zealand), and about 25 states had accepted it as of Oct 2026. Anchor added.
   - Sources: https://treaties.un.org/Pages/ViewDetails.aspx?src=TREATY&mtdsg_no=XVIII-10-g&chapter=18&clang=_en (participant list and entry into force); https://treaties.un.org/doc/Publication/CN/2020/CN.394.2020-Eng.pdf (new article 8(2)(e)(xix), Art 121(5)).
4. **l10.q5 (t3.ts).**
   - Was: "which provision is least likely to be violated", with every option bundling a reason.
   - Now: "which statement about the legal consequences is correct". The answer is still option 0, the cumulative Art 55 threshold not being met. The distractors are plainly wrong: any damage to a river counts, a dual-use object may never be attacked, and any environmental damage is a war crime. The explanation was updated.
   - Sources: the AP I text (https://www.ohchr.org/en/instruments-mechanisms/instruments/protocol-additional-geneva-conventions-12-august-1949-and) and Rome Statute Art 8(2)(b)(iv).
5. **l20 (t5.ts) warrants.**
   - Was: vague, undated references to Ukraine and to Israel and Hamas.
   - Now, dated and framed as allegations only:
     - 17 Mar 2023: Putin and Lvova-Belova, war crimes of unlawful deportation and transfer of children. Source: https://www.icc-cpi.int/news/situation-ukraine-icc-judges-issue-arrest-warrants-against-vladimir-vladimirovich-putin-and
     - 21 Nov 2024: Netanyahu and Gallant (war crimes including starvation as a method of warfare, and crimes against humanity) and Deif. Deif's proceedings were terminated 26 Feb 2025 on notification of his death. Sources: https://www.icc-cpi.int/news/situation-state-palestine-icc-pre-trial-chamber-i-rejects-state-israels-challenges and https://www.icc-cpi.int/palestine
     - 8 Jul 2025: Taliban Supreme Leader Akhundzada and Chief Justice Haqqani, crime against humanity of persecution on gender grounds. Source: https://www.icc-cpi.int/afghanistan
   - Anchor added for the Ukraine warrants.
6. **l16 (t4.ts) crimes against humanity treaty.**
   - Was: "states have considered them since, but a convention has not yet been concluded as of this writing".
   - Now: UNGA res 79/122 (4 Dec 2024) convened a conference of plenipotentiaries, with three-week sessions in early 2028 and in 2029. No convention exists as of Oct 2026.
   - Source: https://legal.un.org/diplomaticconferences/cah/
7. **l11 (t3.ts) autonomous weapons.**
   - Was: "no treaty ... as of this writing".
   - Now: no treaty as of Oct 2026. The CCW Group of Governmental Experts has a "rolling text" and reports to the Seventh CCW Review Conference in November 2026.
   - Source: https://disarmament.unoda.org/en/updates/briefing-chair-ccw-gge-laws-margins-first-committee

## Claims marked unverifiable that I confirmed (no text change)

- Tadic 1995 NIAC formula (para 70) and individual criminal responsibility for common Art 3 violations: https://www.icty.org/x/cases/tadic/acdec/en/51002.htm
- UNSC Res 827 (1993), Chapter VII: https://www.icty.org/x/file/Legal%20Library/Statute/statute_827_1993_en.pdf
- GC I Arts 21 and 22: https://treaties.un.org/doc/Publication/UNTS/Volume%2075/volume-75-I-970-English.pdf
- AP I Art 41: the OHCHR AP I text above.
- ICJ nuclear weapons Advisory Opinion 1996: https://www.icj-cij.org/index.php/node/103787
- Nicaragua para 191, "most grave forms of the use of force": ICJ judgment text, copy at https://iilj.org/wp-content/uploads/2016/08/Case-Concerning-Military-and-Paramilitary-Activities-In-and-Against-Nicaragua-Nicaragua-v.-United-States.pdf (icj-cij.org PDFs return 403).
- CWC in force 29 Apr 1997: https://treaties.un.org/Pages/ViewDetails.aspx?src=TREATY&mtdsg_no=XXVI-3&chapter=26&clang=_en
- TPNW adopted 7 Jul 2017, in force 22 Jan 2021: https://treaties.un.org/Pages/ViewDetails.aspx?src=TREATY&mtdsg_no=XXVI-9&chapter=26&clang=_en
- ICRC 2009 Interpretive Guidance, three cumulative criteria: https://www.icrc.org/en/doc/assets/files/other/icrc-002-0990.pdf
- Nuremberg (24 named; Ley suicide and Krupp severed; 12 death sentences; judgments 30 Sep to 1 Oct 1946): https://avalon.law.yale.edu/imt/09-30-46.asp and https://avalon.law.yale.edu/imt/judsent.asp
- SCSL Kallon and Kamara, 13 Mar 2004: ICRC IRRC article https://international-review.icrc.org/sites/default/files/S1560775500180484a.pdf (found in search; the rscsl.org decision PDF returned 404).

## Not confirmed at a primary source (text left as is; low risk, flagged)

- US signed AP I and II in 1977 without ratifying them, and Protocol III of 2005 added the red crystal. The Swiss depositary and ICRC treaty pages were blocked or JS-only. Only secondary summaries were seen.
- Tokyo tribunal (1946 to 1948, Pal dissent), In re Yamashita, Tadic 1999 JCE, and Celebici (TC 1998, AC 2001) were not re-opened.
- BWC has no standing verification body: not re-opened.
- If any of these must be strictly sourced, hedge or drop them.

## Verifier points left unchanged

- Verifier A's l02.q4, l04.q3, l08.q5, l09.q4 and l12.q5 "medium confidence" notes concern evaluative framing. Each correct answer is still the only defensible option, so none were changed.
- Verifier B's observation that the answer positions form a cycling pattern was not addressed. It is outside this brief.
