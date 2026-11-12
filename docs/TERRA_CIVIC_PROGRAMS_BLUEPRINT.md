# Terra Civic — Programs: grant and program administration for governments (Blueprint)

**Home:** Plajah **Terra**, as part of Terra Civic (see `TERRA_CIVIC_FORUM_BLUEPRINT.md` §0.1).
**Working name:** *Programs Desk* (placeholder).
**Status:** design only. Nothing wired.
**Date:** 12 November 2026.
**Companion to:** `docs/TERRA_CIVIC_FORUM_BLUEPRINT.md` (Forum). This is the funder-side twin of the
existing applicant-side Grants module (`services/grants/*`, `services/dataCommons/grants.ts`,
`routes/grants.ts`, `components/elevate/Grant*.tsx`).

---

## 0. The thesis

Plajah already helps organizations **apply** for money: the Grant Matcher finds federal opportunities,
the applicant profile answers the shared questions once, readiness finds the gaps, the Grant
Council reviews drafts, and forms prefills PDFs. Nobody on the platform can yet **run** a
program.

Programs Desk lets any city, county, state agency, school district or tribal government open a
self-serve workspace and run its own grant, rebate, scholarship or relief program on Plajah. It
covers the whole cycle: building the program, intake, eligibility screening, review, award,
payment instructions, reporting and public transparency. The government sets every rule and
makes every decision. Plajah supplies the infrastructure, the same way Forum supplies infrastructure for drafting.

The flywheel: applicants who already have a Plajah profile apply in minutes, and the same profile
works for every program on the platform and for federal grants through the Matcher.

### Rules that shape everything

1. **The government decides.** Plajah never sets eligibility, never scores, never chooses awardees,
   and never moves public money unless it is under contract as a fiscal agent (§6). ARIA explains,
   checks completeness, and summarizes. It never recommends who gets funded. This is the same line the Grant
   Council already holds ("advises; people decide and certify").
2. **Open to everyone eligible, not just Plajah users.** A public program can't require someone to
   become a Plajah creator, accept unrelated terms, or have an existing account. Guest applications,
   assisted applications (library or navigator staff), paper intake and multiple languages are required features.
3. **No thumb on the scale.** Being a Plajah creator, business or charity must never help or hurt an
   application. Plajah staff are never reviewers. Platform rankings, followers and earnings are
   invisible to reviewers.
4. **Deterministic where it counts.** Eligibility rules, scoring arithmetic and award totals are code,
   versioned and auditable. Same rule as `readiness.ts`: "no model call decides what is missing."

### 0.1 Terra fit

- **Geography is the parcel spine.** Program boundaries, corridors and set-asides are drawn on
  Terra's map. Eligibility rules like `within_boundary` resolve an applicant's address to a Terra
  parcel, which is more reliable than a geocoder alone.
- **Property-based programs** (façade, home repair, lead abatement, storefront activation) attach the
  application to the parcel. Reviewers see the Property Passport (permits, blight tickets, rental
  certification, Land Bank status), and every fact keeps its source and vintage.
- **Business programs** read Business Compliance and Terra Lookup's licence check to confirm an
  active licence, with the existing honesty rule: "no match" means no match, not "unlicensed".
- **Impact** uses Terra's civic records as indicators. Blight tickets, permits and 311 trends near
  funded parcels, compared with similar unfunded blocks.
- **Public awards dashboard** is a Terra Explorer layer. Funded sites are on the map, and
  privacy-sensitive programs are shown only as aggregates.
- **Code placement:** `services/terra/civic/programs/*`, `components/terra/civic/programs/*`.

---

## 1. Who already sells this

| Vendor | Segment | Takeaway |
|---|---|---|
| Neighborly Software | Municipal housing, CDBG and ARPA programs | Cities buy purpose-built program software; HUD compliance matters |
| Submittable | Foundations, arts councils, some government | Strong form builder and review. Generic, not civic |
| Bonterra (formerly Fluxx), SmartSimple | Large foundations and state agencies | Expensive, consultant-heavy setup |
| ZoomGrants, eCivis, Amplifi | Small and mid government | Cheap, dated UX |
| OpenGrants | Grant discovery plus admin | Closest to Plajah's applicant-plus-funder model |

**Where Plajah is different:** the applicant side already exists and already holds people's
profiles. Live data shows program impact (Forum §7). Programs connect to the legislation and
budget hearings that created them (Forum §8–9). And the whole thing is self-serve.

---

## 2. Tenancy: "plug in at their own discretion"

```
Government tenant (City of X)
 ├─ branding, domain embed (programs.cityofx.gov → white-label), languages
 ├─ SSO (Entra ID / Okta / Google), roles, MFA required for staff
 ├─ jurisdiction geography (boundary polygons, districts, census tracts)
 ├─ finance settings (payment mode, §6), records-retention schedule
 └─ Programs
      ├─ Small Business Façade Grant 2027
      ├─ Artist Guaranteed Income Pilot
      └─ Youth Sports Scholarship
```

- **Self-serve onboarding:** verify that the account belongs to a government (a `.gov` or official domain, plus a signed
  agreement from an authorized official), pick a template, configure, publish. No consultants needed.
- **Roles:** Program Admin, Program Staff, Reviewer, Finance, Auditor (read-only), Navigator
  (applies on someone's behalf, and every action is logged as assisted), Public.
- **Embed and API:** an apply widget and a public awards page that drop into the city's own site, plus a REST
  API and webhooks for the city's ERP or CRM.
- **Data isolation:** each tenant's data is separate. Applicant PII stays in server-only
  collections (pattern: `grantWorkspaces/*` in `routes/grants.ts`) with its own Firestore rules file.

---

## 3. Program builder

| Piece | What it is | Builds on |
|---|---|---|
| **Templates** | Small-business relief, façade or storefront improvement, artist or creator grant, guaranteed income pilot, nonprofit capacity, youth scholarship, utility or housing assistance, participatory budgeting, event sponsorship | — |
| **Eligibility rules** | A visual rule builder that compiles to deterministic predicates: inside the boundary or district, applicant kind (`ApplicantKind` already lists church, nonprofit, small business and more), revenue or employee bands, years operating, income limits, tax status, prior-award limits | `ApplicantKind`, derived geo in `profile.ts` |
| **Application form** | A Tela Form document: sections, conditional questions, uploads, budget tables. Fields map to applicant-profile keys, so they prefill | Tela forms, `profile.ts` field defs |
| **Required documents** | A checklist with a plain-language "how to get this" for each item | `readiness.ts` `Document` |
| **Scoring rubric** | Criteria, weights, scales and scoring guidance. Optional lottery for oversubscribed programs (common in guaranteed-income pilots) | — |
| **Workflow** | Stages (intake → screening → review → panel → decision → agreement → payment → reporting), SLAs, notices | — |
| **Budget and awards** | Total funds, award amount (fixed, tiered or requested-with-cap), set-asides (for example by district), waitlist | — |
| **Funding source tags** | General fund, CDBG, ARPA, state pass-through and so on. Each tag switches on the matching compliance checklist (§7) | — |

Each published program is versioned. Changing a rule after it opens creates a new version, and the
audit log shows who changed what and when.

---

## 4. Applicant experience

- **Discovery:** local programs show up in the existing Grant Matcher alongside Grants.gov, filtered
  by the applicant's address. Guests find them through the city's own site.
- **One profile, many programs:** the applicant profile prefills the form. Values marked `platform`, `derived`
  or `suggested` show as "confirm", never as final, exactly as `profile.ts` does today.
- **Readiness:** before the applicant submits, the same gap-finding logic shows what's missing, longest
  lead time first.
- **Aria help:** plain-language explanations of questions, translation, and drafting help for narratives through
  the existing local-first or consented-cloud lane (`GrantAiLane.tsx`). Integrity rules carry over:
  ARIA never invents a fact, and never signs or certifies.
- **Status tracking** with a reason at every stage. A decline shows the published rule that was
  unmet, and how to appeal if the program allows appeals.
- **Accessibility:** WCAG 2.1 AA, mobile-first, low-bandwidth, saving progress, and a navigator mode for assisted applications.

---

## 5. Review and decision (government staff)

1. **Screening:** the eligibility engine marks each application *eligible / ineligible (rule X) /
   needs staff check*. Staff confirm every ineligible result before the applicant is notified.
2. **Fraud and duplicate checks:** the same bank account, EIN, address or device used across applications;
   ID verification where the program requires it; an exclusions check (SAM.gov exclusions, plus
   Treasury's Do Not Pay where federal money is involved). Pandemic relief programs are the cautionary tale:
   the SBA Inspector General estimated over $200B in potentially fraudulent PPP and EIDL payments.
3. **Reviewer assignment:** reviewers declare conflicts of interest per application before they open it.
   A declared conflict means automatic recusal. Optional blind review hides names and identifying fields.
4. **Scoring:** rubric scores, with normalization across reviewers (z-score) shown as an option, and
   reviewer outliers flagged.
5. **ARIA's role:** a completeness summary and a side-by-side digest of each application. **No score,
   no ranking, no recommendation.** Every summary links to the source answers.
6. **Panel:** if the body has to decide in public, the decision meeting runs through Forum §9 (agenda,
   notice, roll call), with award lists attached to the agenda item.
7. **Decision:** award letters and agreements generated as Tela documents, with e-signature by the authorized official
   and the recipient.

---

## 6. Payments: Plajah does not hold public money by default

| Mode | How money moves | When to use it |
|---|---|---|
| **A. Payment file (default)** | Plajah exports approved awards (payee, amount, bank details captured through a secure vendor form, GL codes) in the format the government's finance or ERP system imports (Tyler Munis, Oracle, Workday, SAP, or CSV/NACHA). The government's treasury pays | Almost every government. Public funds never leave public custody |
| **B. Direct ERP integration** | Same as A, through an API or connector, with payment status synced back | Larger tenants |
| **C. Fiscal agent (opt-in, later)** | The government funds a segregated account and Plajah disburses through Stripe Connect | Small towns without AP capacity. Needs a fiscal-agent contract, bonding and insurance, segregated or collateralized accounts (many states require public funds to sit in qualified public depositories), and per-transaction reconciliation. Legal review first |

Recipients' bank details go through a verified vendor-onboarding form (bank account validation)
and are never shown to reviewers.

---

## 7. Compliance built in

| Area | What Programs Desk does |
|---|---|
| **Federal pass-through funds** (2 CFR 200, the Uniform Guidance) | A decision helper for *subrecipient vs. beneficiary* (§200.331), subrecipient risk assessment and monitoring checklist, a Single Audit reminder (threshold raised to $1M for fiscal years starting on or after 1 Oct 2024), FFATA subaward reporting export, and records retained at least 3 years after the final expenditure report (§200.334) |
| **Program-specific rules** | Checklists for CDBG (national objective, income documentation), ARPA SLFRF (eligible-use categories, reporting), and state pass-throughs, each switched on by the program's funding-source tag |
| **Tax** | Grants to businesses and individuals are usually taxable income. The *government* issues the 1099-G (or 1099-MISC). Programs Desk generates the data file and the W-9 collection |
| **Public records** | Applications may be public records. Fields are tagged as releasable or exempt (PII, bank details, tax IDs) so records requests can be redacted. Award lists are public by default |
| **Religion clauses** | Neutral, generally available programs can include religious applicants (*Carson v. Makin*, 2022), but use restrictions and state "no-aid" provisions vary. The government configures whether and how; Plajah doesn't decide |
| **Equal access** | Civil-rights notices, language access, disability accommodation requests, and no platform-membership requirement (Rule 2) |
| **Security** | SOC 2 Type II. GovRAMP (formerly StateRAMP) for state buyers. Data residency in the US. Encryption at rest and in transit. Staff MFA |
| **Audit trail** | Every rule change, screening result, score, decision and payment export is logged. Award decisions and published rule versions are hashed onto the Registry transparency log, so "the rules changed after I applied" is provably checkable |

---

## 8. After the award and transparency

- **Reporting:** milestones, receipts, photos, outcome metrics and site-visit notes, with reminders and
  late flags.
- **Impact:** outcomes connect to the Forum live-data engine (§7 there). For example, a façade program
  shows storefront vacancy and foot-traffic indicators for the corridors it funded, with the same
  "context, not causation" rule.
- **Public awards dashboard:** who received what, how much, by district and program, embeddable on
  the city's site. This is the anti-favoritism feature. Individual recipients in privacy-sensitive
  programs (housing assistance, guaranteed income) are aggregated, never listed by name.
- **Link back to the law:** each program can cite the ordinance, budget line or Forum bill that created it,
  so constituents can trace a law to the money it spent to the outcome.

---

## 9. Pricing

- **A flat subscription per tenant** (tiered by population or number of programs), plus optional
  fiscal-agent fees (Mode C) and white-glove setup.
- **Never a percentage of grant dollars.** Federal and many state funds cap administrative costs
  (CDBG general administration is capped at 20%), a percentage fee creates an incentive to award
  more, and it reads badly. A flat fee is cleaner, and governments can budget for it.
- Revenue from Programs Desk is Plajah revenue, and it flows into the Community Revenue Pool on the same
  terms as Forum revenue (Forum §13.1). That pool never pays based on how any applicant fared in any
  program.

---

## 10. Data model sketch

```ts
// services/terra/civic/programs/types.ts (Phase 0)
interface GovTenant { id: string; name: string; jurisdiction: { level: 'municipal'|'county'|'state'|'tribal'|'school_district'|'special_district'; fips?: string };
  boundaryRef: string; domains: string[]; sso?: { provider: 'entra'|'okta'|'google'; tenantRef: string };
  paymentMode: 'payment_file'|'erp'|'fiscal_agent'; retentionYears: number }

interface Program { id: string; tenantId: string; version: number; title: string; status: 'draft'|'open'|'closed'|'awarding'|'reporting'|'archived';
  fundingSources: ('general'|'cdbg'|'arpa_slfrf'|'state_passthrough'|'federal_other'|'private')[];
  eligibility: EligibilityRule[]; formDocId: string; rubric?: RubricCriterion[]; selection: 'scored'|'lottery'|'first_come'|'scored_then_lottery';
  budget: { total: number; award: { kind: 'fixed'|'tiered'|'requested_cap'; amounts: number[] }; setAsides?: { label: string; rule: EligibilityRule; amount: number }[] };
  opensAt: string; closesAt: string; ledgerLeaf?: string }

type EligibilityRule =
  | { op: 'within_boundary'|'within_district'; ref: string }
  | { op: 'applicant_kind_in'; kinds: string[] }
  | { op: 'number_between'; profileKey: string; min?: number; max?: number }
  | { op: 'bool_is'; profileKey: string; value: boolean }
  | { op: 'not_previously_awarded'; programIds: string[]; withinMonths?: number }
  | { op: 'all'|'any'; rules: EligibilityRule[] };

interface Application { id: string; programId: string; programVersion: number; applicantRef: string /* uid or guest token */;
  assistedBy?: string; answers: Record<string, unknown>; docs: Record<string, string>;
  screening?: { result: 'eligible'|'ineligible'|'staff_check'; failedRules: string[]; confirmedBy?: string };
  fraudFlags: string[]; status: 'draft'|'submitted'|'screening'|'in_review'|'awarded'|'waitlisted'|'declined'|'withdrawn' }

interface Review { applicationId: string; reviewerId: string; coiDeclared: boolean; recused: boolean; scores: Record<string, number>; notes: string }
interface Award { applicationId: string; amount: number; agreementDocId: string; signedAt?: string; paymentExportId?: string; ledgerLeaf?: string }
```

---

## 11. Roadmap

| Phase | Scope | Exit criterion |
|---|---|---|
| **0** | Types, eligibility engine (pure and tested like `readiness.ts`), program templates, Tela form ↔ profile-key mapping | A template program screens fixture applicants deterministically |
| **1 Pilot** | Tenant onboarding, intake (account and guest), screening, review with COI, decisions, CSV/NACHA payment file, awards dashboard | One real local program (a church/nonprofit coalition fund via Elevate, or a small city's façade grant) runs end to end |
| **2** | Fraud and duplicate checks, lottery, panel via Forum meetings, post-award reporting, records redaction | A second tenant self-onboards without help |
| **3** | Federal compliance packs (2 CFR 200, CDBG, SLFRF), ERP connectors, impact dashboards on live data | A program funded by federal pass-through money passes its monitoring review |
| **4** | Fiscal-agent mode (after legal and insurance review), GovRAMP | First Mode C tenant |

---

## 12. Open questions

1. Best first tenant: an Elevate church/nonprofit coalition running its own community fund
   (fastest to launch and lowest compliance burden), a Detroit property program such as façade or
   home repair (strongest Terra fit), or a small city in Wayne, Oakland or Macomb?
2. Should Mode C (Plajah disburses) exist at all, or should Plajah stay out of moving public money for good?
3. Which ERPs matter first for the pilot region?
4. Which ID-verification vendor? The same one as Forum Tier 2 so applicants verify once.
