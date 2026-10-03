# med-clin-im fixes (2026-10)

Sources: many publisher pages (ahajournals, diabetesjournals, PubMed) block fetch, so some points rest on search-result excerpts plus fetched pages noted below. The verdict files contain only answer keys; fixes follow the coordinator's finding list. No answer key changed. All lessons already had asOf '2026-10'.

- l14 (t4) andexanet: lesson said apixaban/rivaroxaban reversed with andexanet or PCC. Now 4F-PCC is the US option; andexanet withdrawn Dec 22 2025 (thrombosis risk), available elsewhere. Anchor added. https://www.tctmd.com/news/andexanet-alfa-pulled-us-market
- l11 (t3) DKA insulin: potassium threshold 3.3 -> above 3.5 (replace first, delay insulin); q3 explanation 3.3 -> 3.5. DKA glucose criterion added: 200 mg/dL or higher or known diabetes. https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/ ; https://www.ccjm.org/content/92/3/152
- l11 HHS: "effective osmolality above about 320" -> effective above 300 mOsm/kg (or total above 320). Verifier B is right; the PMC page's figure text was unreadable via fetch, so this rests on the CCJM review of the consensus. https://www.ccjm.org/content/92/3/152
- l11 ADA Standards 2024 -> 2026 edition (text and anchor); 2024 hyperglycemic-crises consensus anchor added. https://diabetes.org/newsroom/press-releases/american-diabetes-association-releases-standards-care-diabetes-2026
- l04 (t1) hypertension: 2017 ACC/AHA -> 2025 AHA/ACC; 130/80 definition retained; stage 2 "single-pill combination"; PREVENT used to guide stage 1 drug therapy (7.5% threshold not stated in lesson). q1 stem, hint, explanation and anchor updated. Category cut-points beyond 130/80 not confirmed, so not taught. https://www.acc.org/latest-in-cardiology/articles/2025/10/01/01/new-in-clinical-guidance-hbp
- l04 endocarditis: modified Duke -> noted as updated by 2023 Duke-ISCVID; anchor changed. Details of the new criteria not taught. https://academic.oup.com/cid/article/77/4/518/7151107
- l05 (t2) GINA 2024 -> 2026 edition; GOLD 2024 -> 2026 edition (text and anchors). Claims (no SABA-only; ICS-formoterol preferred; LAMA/LABA base) remain consistent. https://ginasthma.org/whats-new-in-gina-2026/ ; https://www.guidelinecentral.com/insights/nov-2025-gold-copd-guideline-spotlight/
- l06 pneumonia: ATS/IDSA 2019 kept, plus ATS 2025 update (systemic corticosteroids for severe CAP); anchor added. https://www.guidelinecentral.com/insights/dec-2025-ats-cap-guideline-nursing/
- l08 hepatitis C: "all adults" -> adults aged 18 to 79 (USPSTF 2020). https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/hepatitis-c-screening
- l12 adrenal incidentaloma: metanephrines are omitted per 2023 ESE guideline when unenhanced CT is 10 HU or less; anchor added. https://academic.oup.com/ejendo/article/189/1/G1/7198474
- l17 (t5) Surviving Sepsis 2021 -> 2026 edition (Mar 2026); 1-hour antimicrobials in shock, 30 mL/kg, norepinephrine first-line, MAP 65 all reconfirmed. https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026

Validator: `npx tsx scripts/validateCourseModule.ts med-clin-im --stage pro` ok.
