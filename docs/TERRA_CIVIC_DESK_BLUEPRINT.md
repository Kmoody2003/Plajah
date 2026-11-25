# Terra Civic — Civic Desk: the government CRM (Blueprint)

**Home:** Plajah Terra → Terra Civic. Included in the Civic Rate (`TERRA_CIVIC_PRICING.md` §3D); no separate price.
**Status:** preview built (sample data, stored in the browser). Production store not wired.
**Date:** 12 November 2026.

---

## 0. What it is

One place where a government serves the people and organizations it answers to:

- **One record per resident, business and organization,** with every request, reply, preference and
  relationship (who acts for which business or block club). Nobody has to repeat themselves to a second department.
- **Requests become cases** that are routed to the department that owns them, worked against a
  response target, and closed with an answer the person can see.
- **A public status page** shows what's being worked on (type, block, status), never who reported it.

Typical government options are a 311 product, a separate permitting portal, and a sales CRM bent into
shape. Civic Desk is built for casework from the start, and it shares Terra's map, the Law Library,
Meetings, Programs and the Civic Record.

## 1. What's built (preview)

| Piece | File |
|---|---|
| Rules: intake, routing, due dates (business hours), status machine, triage, duplicates, matching, queues, metrics, redaction, reply templates | `services/terra/civic/desk/deskCore.ts` (tests: `tests/civicDesk.test.ts`, 10 passing) |
| Sample tenant: 8 departments, 13 services, 5 reply templates, staff, 9 residents/businesses/orgs, 46 generated cases | `services/terra/civic/desk/deskSample.ts` (all fictional) |
| Preview store (browser only) | `services/terra/civic/desk/deskStore.ts` |
| Staff and resident UI | `components/terra/civic/CivicDesk.tsx`, view `TERRA_DESK` (admins only), card on TerraHub |

**Screens**

- **Queue:** filters (department, open/overdue/due soon/waiting/resolved, assigned to me, search), ordered
  overdue first, then priority, then soonest due. The case view covers the resident and organization, the location
  (with a link to the Terra map), the law behind the service (links into the Law Library), likely duplicates with
  one-click merge, status buttons that only offer legal moves, assign and transfer, a reply composer with templates,
  internal notes, and a timeline that marks staff-only entries.
- **People & orgs:** a 360 view with contact details, language, preferred channel, licences, linked people
  and organizations, request history, and "New request" for that person.
- **Dashboard:** open, overdue, due soon, on-time rate (30 days), median first reply, new today, open by
  department with overdue share, and a live preview of the redacted public view.
- **New request:** the resident form, which staff also use for calls and walk-ins. It has a category and service picker,
  service-specific questions, address and ward, optional anonymity where the service allows it, matching to an existing
  record, "already reported nearby", the routing and target shown before sending, and validation messages in plain language.

## 2. Rules (in `deskCore`, deterministic)

- **Routing:** by service, with ward overrides. Transfers are logged with a reason.
- **Due dates:** service targets in calendar days or business hours (Mon–Fri, 8–5, in the tenant's time zone).
  The states are on track, due soon (last 20% of the window or 4 hours), overdue, met and missed.
- **Triage:** hazard words ("gas leak", "no heat", "downed line", "flooding"…) raise priority to urgent, never lower it,
  and log why.
- **Status machine:** new → triaged → in progress → waiting on resident → resolved → closed, with reopen and un-merge.
  The first public reply stamps first-response time.
- **Duplicates:** same service, open, within 14 days, and the same parcel, the same normalized address, or within 60 m.
  Merging keeps the older case, and the other reporter is told to follow it.
- **Matching people:** same email, the same phone, or the same name and address (reuses `services/crm/crmCore` helpers).
- **Privacy:** `redactCase` for public pages (block-level location, no names or contacts, no internal notes);
  `residentView` hides staff-only entries from the resident.
- **ARIA's role (planned):** draft replies, translate them into the resident's language, and summarize long cases.
  Staff send every reply, and ARIA never routes, prioritizes or closes a case.

## 3. Production plan

1. **Tenant store:** server-only Firestore collections per government (`civicTenants/{id}/constituents|cases|config`)
   with a dedicated rules file (pattern: `firestore.phi.rules`) and routes under `/api/terra/civic/desk/*`. PII stays
   server-side. Staff roles: agent, supervisor, department admin, auditor.
2. **Channels:** email-in (a reply-to address threads into the case), SMS, the public web form, staff phone/walk-in entry,
   and the Plajah app with push notifications. Meeting public comment from Meetings becomes an interaction on the person's record.
3. **Terra links:** an address resolves to a Terra parcel (ward, council district, Property Passport). Cases can appear as a
   map layer, and business records link to Terra Lookup's licence check.
4. **Open311 compatibility:** expose the GeoReport v2 API so existing 311 apps and civic-tech tools can file and read requests.
5. **Civic Record:** daily aggregate metrics, and optionally case closures, hashed onto the ledger, so published response
   times can be checked.
6. **Records and retention:** FOIA export with redaction, retention schedules per service, and a legal hold.
7. **Accessibility and language:** WCAG 2.1 AA, translated forms, and replies in the resident's preferred language.

## 4. Open questions

1. Which service catalog and response targets for the pilot city? Start from its current 311 categories.
2. Should anonymous reports be allowed for code complaints (retaliation risk) as well as street issues?
3. Should email-in go through the tenant's own domain (`help@city.gov`) or a Plajah relay?

## 5. Civic Notices — governments talking to the people who follow them (built, preview)

Plajah users follow what affects them: their address with a radius, their ward, a parcel, a permit or case, a
section of law, a topic, or the whole city. Governments publish notices (service disruptions, hearings, ordinance
changes, permits nearby, programs, emergencies) and Civic Notices decides who gets each one, on which channels, and when.

- **Core:** `services/terra/civic/notices/noticesCore.ts` (tests: `tests/civicNotices.test.ts`).
  - **Matching** covers address radius, ward, parcel, law section, case, topic and citywide. Citywide and topic followers
    don't get hyper-local notices, and a person's case updates go only to that person.
  - **Consent** is per channel and records when and where it was given. In-app is always on for what you follow;
    push and email need consent; SMS is modelled but stays off until platform SMS consent (TCPA) exists.
  - **Timing:** quiet hours, a daily digest for routine notices, and emergencies always sent immediately.
  - **Language:** each person gets the notice in their preferred language when a translation exists.
  - **Statutory checks:** `checkZoningHearingNotice` follows MCL 125.3103 (newspaper notice and mailed or delivered
    notice to owners and occupants within 300 ft, each at least 15 days ahead, plus the required contents). The app
    notice never counts as the legal notice; it's added on top.
  - **Law changes:** `lawChangeNotice` turns a code amendment into a notice to everyone following that section.
- **UI:** the Notices tab in Civic Desk (`components/terra/civic/CivicNotices.tsx`). It has a composer, area selection,
  the attached law, a live "who gets it" count (in-app, push, email, now, delayed, digest, languages), the hearing
  checklist that blocks publishing until it passes, and a preview of what a follower sees.
- **Delivery rails to reuse:** `createNotification` and FCM push (`services/backendService.ts`, `server.ts` /api/push),
  Resend email with HMAC unsubscribe (`services/notify`), and the campaign consent/suppression pattern (`routes/campaigns.ts`).
  The follow model mirrors `services/orgFollowService.ts`, and consent mirrors `BusinessSubscription`.

## 6. Tela Sign from a case

Each case can send its decision letter for signature: the resident signs first (with the ESIGN disclosure if they're
a consumer), then a department approver, and both get the certificate and audit trail. See `TELA_SIGN_BLUEPRINT.md`.
