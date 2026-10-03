# law-legalwriting fixes (2026-10)

Files: data/practice/courses/law-legalwriting/t1-t5.ts. Correct-answer meaning unchanged in every question; only wording and completeness.

## Facts
- l03 Caselaw Access Project: lesson said CAP "made case law available". Now: static archive, bulk data and readable cases still hosted at case.law, search and API being wound down, cases also in CourtListener (Free Law Project). Anchor updated. Source (opened): https://lil.law.harvard.edu/blog/2024/03/26/transitions-for-the-caselaw-access-project
- l13 Bluebook: now named as 22nd edition (2025), compiled by Columbia, Harvard, Penn, Yale law reviews; noted the new "contrast" signal. Anchor updated. Source (opened): https://heinonline.com/print-publications/the-bluebook-a-uniform-system-of-citation-22nd-edition/
- l10 Twombly (2007) / Iqbal (2009): confirmed correct, no change (plausible on its face; conclusions not entitled to assumption of truth). Sources: https://www.law.cornell.edu/supct/html/05-1126.ZO.html and https://www.law.cornell.edu/supct/html/07-1015.ZO.html
- l18 Rule 3.3: lesson matches the text (a)(1)-(3), (c) in Minnesota's adopted copy; no change. Source: https://www.revisor.mn.gov/court_rules/rule/prcond-3.3
- Other "unverifiable" items were standard doctrine/pedagogy conventions with no contradiction found; left as is. ALWD edition not named (not confirmed).

## Questions (truncated or stub correct answers restored; ids law-legalwriting.)
- l01.q4, l01.q5: stub answers completed (reason added).
- l02.q5: truncated answer now includes the federal-procedure half.
- l05.q1, l06.q3: stub answers expanded.
- l07.q2: removed catch-all "and other tools" from the statute list (undercut expressio unius); distractor reworded to match.
- l08.q5: prompt said a court of appeals faced its own decision but the answer spoke of binding lower courts; prompt now a State X trial court facing a court of appeals decision.
- l11.q1, l11.q3: stub/ungrammatical answers completed.
- l13.q3: answer now explains why an inserted cite breaks id.; l13.q5 completed.
- l14.q1, l14.q3: truncated answers completed (parol evidence now has its predicate).
- l15.q1, l15.q3: severability consequence clause restored; l15.q3 clarified.
- l18.q1, q2, q4, q5; l19.q4, l19.q5: truncated answers completed per Rule 3.3 text.
- All lessons already carried asOf '2026-10'. Validator: `npx tsx scripts/validateCourseModule.ts law-legalwriting --stage pro` clean (100 questions).
