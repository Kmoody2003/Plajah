# med-global-health fixes (asOf 2026-10, stage pro)

Validator: `npx tsx scripts/validateCourseModule.ts med-global-health --stage pro` is clean (one warning: correct option is the longest in 54% of MCQs).

## Lesson changes (each confirmed at a source I opened)
- l10 US withdrawal: was "announced withdrawal"; now completed 22 Jan 2026, funding stopped. https://www.cdc.gov/media/releases/2026/united-states-completes-who-withdrawal.html
- l10 mpox: 2024 PHEIC listed without end; now ended 5 Sep 2025, standing recommendations to 20 Aug 2026. https://www.who.int/news/item/30-10-2025-fifth-meeting-of-the-international-health-regulations-%282005%29-emergency-committee-regarding-the-upsurge-of-mpox-2024
- l10 polio still a PHEIC at Aug 2026 meeting; WPV1 52 cases in 2025 (21 Afghanistan, 31 Pakistan). https://www.who.int/news/item/25-08-2026-statement-of-the-forty-fifth-meeting-of-the-polio-ihr-emergency-committee
- l10 IHR 2024 amendments: "in force for most states" now in force 19 Sep 2025 (19 Sep 2026 for states that rejected the 2022 amendments). https://www.who.int/news-room/questions-and-answers/item/international-health-regulations-amendments
- l10 Pandemic Agreement: adopted 20 May 2025, opens for signature only after the PABS annex is adopted. https://www.who.int/news-room/questions-and-answers/item/pandemic-prevention--preparedness-and-response-accord ; PABS missed May 2026, outcome due WHA May 2027 or a 2026 special session. https://www.who.int/news/item/01-05-2026-who-member-states-agree-to-extend-negotiations-on-pathogen-access-and-benefit-sharing-annex
- l16 workforce shortfall ~10M now 11.1M by 2030 (nurse-share claim not taught, not confirmed at an opened page). https://www.who.int/health-topics/health-workforce
- l20 Gavi (>US$9bn vs 11.9bn target, June 2025) https://www.gavi.org/news/media-room/world-leaders-recommit-immunisation-amid-global-funding-shortfall ; Global Fund 8th replenishment US$12.64bn vs 18bn, announced 18 Feb 2026 https://www.theglobalfund.org/en/investment-case/
- l06 malaria added 2024: 282M cases, 610,000 deaths, ~95% African Region. https://www.who.int/news-room/fact-sheets/detail/malaria
- l07 TB added 2024: 10.7M cases, 1.23M deaths. https://www.who.int/news-room/fact-sheets/detail/tuberculosis
- l05 measles added: ~95,000 deaths 2024, first-dose coverage ~84% (2025). https://www.who.int/news-room/fact-sheets/detail/measles
- l08 HIV added 2025: 41.0M living with HIV, ~1.2M new, ~570,000 deaths, 32.1M on ART; noted the 2025 95-95-95 deadline has passed. https://www.unaids.org/en/resources/fact-sheet
- l08 lenacapavir: WHO recommendation 14 Jul 2025 https://www.who.int/news/item/14-07-2025-who-recommends-injectable-lenacapavir-for-hiv-prevention ; Global Fund first deliveries Eswatini/Zambia Nov 2025, nine countries and ~49,000 people by end June 2026 https://www.theglobalfund.org/en/stories/2026/2026-09-16-prevention-breakthrough-historic-hiv-innovation-delivered-unprecedented-speed/

## Question changes
- l03.q5: "pro-poor" removed; keyed option now "inequality works against the poor"; explanation states a negative index means concentrated among the poor. Answer unchanged.
- l08.q1: option rewritten "95% diagnosed, 95% of those diagnosed on treatment, 95% of those on treatment suppressed" (verifier B); stem names UNAIDS. Answer unchanged.
- l08.q4 and q5: filler and absolutes removed from distractors; q5 explanation adds the 3 and 5 point gaps.
- About 145 further distractors across l01-l20 had filler clauses ("since/because ...") or absolutes ("always", "only", "every", "any"); trimmed with no change to keys.

## Not changed
- Mojibake in l18 (Médecins Sans Frontières, témoignage): the source file is correct UTF-8; the garbling was in the verifier's rendering. No mojibake sequences exist in any course file.
- No cut-off or stub options found; the short options (drug names, species, years, percentages) are complete.
- Verifier A l18.q3 (threshold) already matches key: more than 1 death per 10,000 per day. Stable-history claims marked unverifiable (Ottawa Charter, Whitehall, Alma-Ata, TRIPS, Nuremberg/Helsinki, etc.) were left as written; they are standard and I did not edit them.
- All lessons already carry asOf '2026-10'.
