# law-crimpro content-integrity fixes (asOf 2026-10)

Sources opened (Cornell LII slip-opinion pages, syllabus + opinion text):
- Chatrie v. United States, No. 25-112: https://www.law.cornell.edu/supremecourt/text/25-112
- Hunter v. United States, No. 24-1063: https://www.law.cornell.edu/supremecourt/text/24-1063
- Weaver v. Massachusetts, No. 16-240: https://www.law.cornell.edu/supremecourt/text/16-240
- Case v. Montana, No. 24-624: https://www.law.cornell.edu/supremecourt/text/24-624
- Vega v. Tekoh, No. 21-499: https://www.law.cornell.edu/supremecourt/text/21-499
- Barnes v. Felix, No. 23-1239: https://www.law.cornell.edu/supremecourt/text/23-1239

## Facts
1. l01 (t1.ts), Carpenter/location data. Was: Carpenter "narrow", lower courts sorting out location data, silent on Chatrie. Now: adds Chatrie (decided June 29, 2026): obtaining Google Location History is a Fourth Amendment search, even for a short window and despite third-party custody; Kagan opinion for 5, Gorsuch concurring in the judgment (6 for the judgment), Alito and Barrett dissenting; Court did NOT decide warrant validity (particularity/probable cause at each geofence step) and remanded to the Fourth Circuit. Tower dumps and real-time tracking still open. Anchor added. Source: Chatrie URL above.
2. l19 (t5.ts, t3.ts l12 mention), appeal waivers. Was: "generally enforceable". Now: Hunter (June 18, 2026; Kagan; Thomas dissenting): waiver is unenforceable when enforcement would be a miscarriage of justice (egregious error bringing the system into disrepute); rejects both "always enforceable" and the Fifth Circuit's two-exception rule. Lesson, l19.q5 prompt, key option and explanation, l12 cross-reference, anchor updated. Source: Hunter URL.
3. l18 (t5.ts), Weaver. Was: "when raised on direct review through an ineffective-assistance claim". Now: the structural error (public trial) was neither preserved nor raised on direct review but raised later via an IAC claim, so prejudice is required; the same error preserved and raised on direct review means automatic reversal. Anchor added. Source: Weaver URL. Verifier B correct.
4. l04 (t1.ts), emergency aid. Added Case v. Montana (2026, unanimous): Brigham City's objectively reasonable basis standard applies without a probable-cause or caretaker gloss. Anchor added. Source: Case URL.
5. Checked and left unchanged: Vega v. Tekoh (already in l07, accurate), Smith v. Arizona and Erlinger (already in l14/l15, accurate), Barnes v. Felix (not taught; lessons silent on excessive force, nothing wrong, not added). l10.q5 preponderance for flight risk is circuit case law (statute silent); l17.q5 strip-search suspicion level rests on lower-court consensus (Montoya de Hernandez reserved it). Both verifiers only flagged these as medium confidence; wording kept, no source contradicts it.

## Answer-key errors found (not in verifier notes)
l05.q2, l13.q2, l15.q3, l16.q2 had `answer: 1` while the correct text was option 0 (e.g. Hodari D. keyed to "when the officers shouted"; Miller keyed to "Constitutional"). Keys set to 0. Verifiers had already answered with the true correct text.

## Question rewrites
- l08.q2: safe-combination option replaced with "state from memory where the stolen goods are hidden" (unambiguously testimonial); blood sample is the only non-protected option. Explanation updated.
- l04.q4: facts now state a bare "Police" knock, no demand or threat, audible evidence destruction, forced entry, so only the King argument is defensible; two distractors reworded.
- l04.q2: correct option reworded to name Riley (the awkward "present co-occupant").
- l16.q5: option 0 reworded to "the jury found neither an intent to kill nor major participation with reckless indifference".
- Absolutes and stub phrasing removed from about 95 distractors (always/never/every/all/any/automatically/etc.) across l01-l20; legal-rule wording that is itself the rule (Winship "every fact", Brady "regardless of good faith") kept.
- Option length: lengthened or shortened options so the correct answer is the strictly longest in 27 of 100 questions (was 33).

Validation: `npx tsx scripts/validateCourseModule.ts law-crimpro --stage pro` -> ok, no warnings.
