# law-business-orgs fixes (asOf 2026-10)

Validator: `npx tsx scripts/validateCourseModule.ts law-business-orgs --stage pro` passes (20 lessons, 100 questions).

## Changes

1. **l05 (t2.ts), SB 21 "still litigated"**. Was: constitutionality "continues to be litigated and debated". Now: Delaware Supreme Court upheld the section 144 amendments in Rutledge v. Clearway Energy Group LLC (Feb 27, 2026). Also added the Texas Business Court (opened Sept 1, 2024) and Texas SB 29 (2025, business judgment rule codified, derivative-suit ownership thresholds up to 3%). Sources: https://www.debevoise.com/insights/publications/2026/02/delaware-supreme-court-upholds-constitutionality ; https://capitol.texas.gov/tlodocs/89R/analysis/html/SB00029S.htm . Justia (law.justia.com/cases/delaware/supreme-court/2026/248-2025.html) returned 403.
2. **l10 (t3.ts), "void or voidable" framework**. Was: DGCL 144 says not void/voidable if cleansed. Now: pre-2025 wording labelled as such; current 144(a) says a covered transaction "may not be the subject of equitable relief, or give rise to an award of damages" if (1) disinterested-director approval (committee of 2+ disinterested directors where a majority of the board is not disinterested), (2) majority of votes cast by disinterested stockholders, or (3) fairness. Source: https://delcode.delaware.gov/title8/c001/sc04/index.html (text read directly).
3. **l10 "in transition" paragraph**. Replaced with Rutledge v. Clearway (Feb 27, 2026) upholding SB 21 (source as in 1).
4. **l10.q5**. Stem now says "Under section 144(a) as amended in 2025", so the key is unambiguous. Answer now rests on the 144(a)(1) proviso (no 2+ disinterested committee can be formed from one disinterested director). Options 1-3 reworded to match the safe-harbour framework and stay similar in length; explanation rewritten. Source: 144 text above.
5. **l10.q1**. Stem and key moved from "not voidable" to "cannot be the subject of equitable relief or damages" under current 144(a); explanation updated. Source: 144 text.
6. **Benihana**. Del. 2005 changed to Del. 2006 in body and anchor (906 A.2d 114). Source: https://en.wikipedia.org/wiki/Benihana_of_Tokyo,_Inc._v._Benihana,_Inc. (secondary, from verifier B; reporter citation not reopened).
7. **l11 (t3.ts), controller safe harbours**. Was a vague "added safe harbour options". Now: 144(b) non-going-private deals need committee OR disinterested vote OR fairness; 144(c) going-private needs committee AND vote, or fairness; cites Rutledge. Source: 144 text. Kahn v. M&F wording unchanged (that is the common-law rule, still correct).
8. **l03 (t1.ts), "half the partners"**. Was wrong: at-will partnership dissolves on notice of any one partner's express will to withdraw; "at least half of remaining partners" applies only to term partnerships within 90 days of a death or wrongful dissociation. Source: https://delcode.delaware.gov/title6/c015/sc08/index.html (15-801; Delaware RUPA mirrors uniform RUPA 801).
9. **l07 (t2.ts), contract vs tort piercing**. First sentence contradicted the empirical finding after "however". Now: theory favours tort victims, but Thompson (76 Cornell L. Rev. 1036, 1991) found piercing in about 40% of contract and 30% of tort cases. Source: https://scholarship.law.cornell.edu/cgi/viewcontent.cgi?article=4647&context=clr (via search result; paper not opened in full).
10. **l13/l15 area (t4.ts), section 220**. Was "narrowly"; now describes the statutory list of "books and records" (current 8 Del. C. 220(a)(1)), including 122(18) agreements and independence questionnaires. Source: https://delcode.delaware.gov/title8/c001/sc07/index.html .
11. **t4.ts, MBCA 14.30**. Removed unsupported "toward the complaining shareholder"; now "directors or those in control have acted, are acting or will act in a manner that is illegal, oppressive or fraudulent" (wording confirmed in Arizona's MBCA-derived A.R.S. 10-1430, https://www.azleg.gov/ars/10/01430.htm; official MBCA text not opened).

## Checked, no change needed
- Rule 10b5-1 2022 amendments (cooling-off, good faith, disclosure): confirmed, https://www.sec.gov/newsroom/press-releases/2022-222
- Morrison v. National Australia Bank: confirmed, https://www.law.cornell.edu/supremecourt/text/08-1191
- Zuckerberg (Del. 2021) director-by-director, at least half: confirmed via secondary (ABA, Skadden snippets); Justia page returned 403.
- Paramount v. QVC (637 A.2d 34, Del. 1994): confirmed via Justia/Wikipedia search results.
- Moelis, Tornetta: not taught anywhere in the course; nothing to fix. Section 220 now includes 122(18) agreements (the Moelis fix) in the list.

## Not confirmed at a primary source (left unchanged, standard doctrine)
- Restatement (Third) of Agency formation/ratification points (l01), partially disclosed principal (l02): no free primary text opened.
- MBCA 2.04 promoter/de facto liability (l06): MBCA text not opened.
