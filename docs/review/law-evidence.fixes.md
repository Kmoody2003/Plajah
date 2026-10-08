# law-evidence fixes (stage pro, asOf 2026-10)

Validator: `npx tsx scripts/validateCourseModule.ts law-evidence --stage pro` is clean. Correct answer is strictly longest in 25 of 100 questions.

## Rule changes
- **l06 / l14, Rule 801(d)(1)(A)**: lessons taught the oath requirement without the pending change. Now: current rule (penalty of perjury at a proceeding or deposition) plus the amendment the Supreme Court adopted April 8, 2026, effective Dec 1, 2026 unless Congress acts, reducing (A) to "is inconsistent with the declarant's testimony"; flagged fast-moving. l06.q1 and l06.q3 now name the date and the rule in force, so one answer is defensible. Sources: https://www.supremecourt.gov/orders/courtorders/frev26_da3i.pdf (order and rule text), https://www.law.cornell.edu/rules/fre/rule_801 (current text), https://www.uscourts.gov/forms-rules/pending-rules-and-forms-amendments (Rule 801 listed for Dec 1, 2026).
- **l04, Rule 404(b)(3)**: said notice needs a defense request. Now: notice is mandatory, in writing before trial, must articulate the permitted purpose and reasoning, excusable for good cause (2020 amendment). Source: https://www.law.cornell.edu/rules/fre/rule_404
- **l14, Rule 613(b)**: "justice so requires" removed; now the Dec 1, 2024 text ("unless the court orders otherwise", prior foundation before extrinsic evidence), with the 2024 committee note. Source: https://www.law.cornell.edu/rules/fre/rule_613
- **l12, Rules 107 / 1006(c)**: lesson cited Rule 611(a) for demonstratives. Now Rule 107 (illustrative aids, Dec 1, 2024), Rule 1006(a) (summary admissible whether or not the underlying materials were introduced) and 1006(c). l12.q5 rewritten (aid under Rule 107; distractor wording cleaned). Sources: https://www.law.cornell.edu/rules/fre/rule_107, .../rule_1006
- **l06, Rule 801(d)(2)** closing sentence (Dec 1, 2024, claims derived from a declarant) added. Source: rule_801 page.
- **l08, Rule 804(b)(3)**: added the Dec 1, 2024 "totality of circumstances ... evidence that supports or undermines it" language. Source: https://www.law.cornell.edu/rules/fre/rule_804
- **l13, Rule 615**: now "must" exclude on request, one designated entity representative, and 615(b) (Dec 1, 2023) disclosure/access orders. Source: https://www.law.cornell.edu/rules/fre/rule_615
- **l15, Rule 702 / 707**: 702 text (preponderance, Dec 2023) checked against https://www.law.cornell.edu/rules/fre/rule_702 and already current. Added: no Rule 707 exists (Article VII ends at 706; https://www.law.cornell.edu/rules/fre lists the Rules as amended to Dec 1, 2024; rule_707 returns 404; no 707 on the uscourts.gov pending list). The verifier's claim about a June 2026 Standing Committee decision on a proposed 707 could not be confirmed at a primary source, so it is not taught.
- **l16**: Frye state list (CA, IL, NY, PA) was unverified and secondary sources disagree; replaced with "some states retain Frye or a variant, check the forum".

## Case and rule claims resolved
- **Hillmon (l05)**: opened https://www.law.cornell.edu/supremecourt/text/145/285. Letters stating Walters' intent to go with Hillmon were held competent to show he went and went with Hillmon. Lesson's "not allowed to prove what another person did" was too strong (Hillmon itself used it that way); reworded as disputed.
- **803(5), 803(8)(A)(ii), 803(22) (l07)**: confirmed verbatim at https://www.law.cornell.edu/rules/fre/rule_803; no change.
- **Michelson (l03)**: "did you know" for opinion witnesses is later practice, not Michelson; lesson now says so. Supreme Court case claims (Bourjaily, Bruton, Old Chief, Huddleston, Tome) were confirmed by verifier B on Justia; left as is.
- **Bullcoming (l10 lesson, l10.q2)**: exception requires the analyst to be unavailable and a prior chance to cross; added to both.
- **l08 / l14 "break mid-sentence"**: checked the course text; both paragraphs are intact (export artifact). No change.

## Questions
- Rewritten for single defensible answer: l06.q1, l06.q3, l09.q5 (facts now show no evidence of intent), l12.q5, l13.q3 (prompt stub "Under Rule 611(c)?" fixed), l10.q2, l11.q5 (distractor mislabelled 803(8) as business records).
- Removed absolutes and filler clauses (never, always, every, automatically, entirely, solely, regardless, "on the facts as the problem presents them", etc.) from about 90 distractors across l01 to l20. No cut-off or stub options found.
- Shortened 20 correct options so the correct answer is strictly longest in 25% of questions.
- Anchors added: l04, l06, l12, l13, l14. All lessons asOf '2026-10'.
