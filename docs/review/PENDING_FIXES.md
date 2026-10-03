# Pending fixes (verification wave 8, 2026-10-02)

Both verifiers have finished for these four courses; no fixer has run yet. For each, dispatch one fixer with the usual rules: confirm every finding at a primary source BEFORE changing it; fix lesson, questions and explanations together; no filler or absolutes in options; correct answer strictly longest in about 20-30% of questions; set `asOf: '2026-10'`; run `npx tsx scripts/validateCourseModule.ts <id> --stage pro` until clean; write `docs/review/<id>.fixes.md`. Verdict files: `scripts/content/out/verdicts/<id>.A.json` (questions only) and `.B.json`.

## law-contracts
- l14.q4 choice 1 says "plus salvage value"; salvage should be subtracted (28,000 under UCC 2-708(2)).
- l03: Restatement (Second) section 90 / reliance "by offeree" should be "by offeror" (verify which section the lesson means; check the lesson text).
- l12 lists substantial performance as excusing conditions generally, but express conditions need strict compliance: qualify.
- UCC 2-210(3) is (4) in the current official text: verify and fix.
- Verifier A medium-confidence items: l04.q5 (2-207(2)(a)), one ambiguous question (about q9), see the A file.
- B could not open Restatement text; check Restatement sections cited.

## law-torts
- l11.q4 (hiker, fenced and signposted boundary): Restatement (Second) 520B says no strict liability to a trespasser, so "barred" is defensible and contradicts the keyed answer: rewrite the question so exactly one option is defensible.
- l15: the "serious harm, compensation feasible" test is Restatement (Second) 826(b), not 829A: fix.
- Verifier A ambiguous: l16.q4 (boat fraud, "opportunity to inspect"), l03.q5 (necessity, gate vs shrubs), l10.q3, l07.q5.

## law-property
- l07.q4: refusing a co-owner entry is generally an ouster, and the stem's "two siblings" also has a third co-owner: rewrite.
- l08.q4: handing over the last six months of the term leaves no reversion, so it reads as an assignment, not a sublease: rewrite.
- l05: mislabeled "alternative contingent remainder"; l06: mis-stated unborn-widow rule: fix.
- l16 omits Pung v. Isabella County (decided June 23, 2026; compensation after a tax sale measured by the sale price, not fair market value): confirm at supremecourt.gov or Cornell, then add; also check Tyler v. Hennepin County and Sheetz.
- Verifier A medium: l02.q5 (adverse possession against a life tenant, loose wording), l12.q1 and l12.q3 (risk of loss varies by state), l03.q3, l06.q4, l16.q4, l16.q5.

## law-profresp
- l10: says Model Rule 1.10(a)(2) screening requires the lawyer be "not substantially involved"; that is California's rule, the Model Rule has no such limit: fix.
- Rule 1.8(e) misses the 2020 gift exception; Rule 8.5 is misparaphrased (verify the "predominant effect" safe harbor and the q4 question); the cannabis lesson misses the 2026 move of medical marijuana to Schedule III (confirm at DEA/Federal Register before teaching).
- Verifier A medium: l03.q3, l06.q2, l10.q3, l11.q5, l15.q5, l20.q2, l20.q5.
- ABA site blocked fetches; use a state bar's adopted copy of the Model Rules.

## Not yet verified at all (about 21 courses)
law-prek2, law-g35, law-g68, law-g912, law-jurisprudence, law-comparative; med-prek2, med-g35, med-g68, med-premed-chem, med-premed-biochem, med-premed-behavioral, med-history, med-anatomy, med-physiology, med-biochem-genetics, med-histo-embryo, med-neuro, med-immuno, med-path, med-epi-biostats, med-ethics-young, med-ethics-hs. Use QUESTIONS-ONLY mode for verifier A on the stable ones; verifier B (Opus) always does the full source-checked review.
