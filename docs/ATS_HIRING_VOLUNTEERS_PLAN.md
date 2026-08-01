# Plajah Hiring & Volunteers — a native ATS for small business and orgs

## Why

Small/medium businesses on Plajah need to hire; churches, nonprofits and cultural orgs need to sign up volunteers. Today both happen off-platform (Indeed/ZipRecruiter + spreadsheets, or paper volunteer sheets), disconnected from the workforce identity Plajah already owns. Because Phase 2 shipped the employee accept-handshake, Plajah is ~60% of the way to a lean **ATS** (applicant tracking system) already — the interview→hire→badge tail exists; only the front of the funnel and a real pipeline are missing.

**Wedge / pain points solved:**
- Job boards cost per-post and export to spreadsheets; native posting is free and stays connected.
- Applicants re-type resumes everywhere → **one-tap apply from a Plajah profile** kills the biggest drop-off.
- SMBs track candidates in DMs and sticky notes → a simple **kanban board** without Greenhouse-level cost/complexity.
- Hire→onboard is a cliff everywhere else → here **"Hired" IS the employee record + role + work badge**, instantly.
- One engine serves **paid hiring and volunteer recruiting** — nobody serves the restaurant and the church next door with the same tool.

## What already exists (reuse, don't rebuild)

| ATS concept | Existing primitive |
|---|---|
| Apply | `applyToOrg()` → PENDING `OrgMembership` (`services/organizationService.ts`) |
| Hire | `acceptOrgMember()` + `createManagedEmployee()` + work badge (Phase 2/3) |
| Open roles | template `roleDefs` (`services/businessTemplates.ts`) |
| Permissions | `orgCan(member, org, 'MANAGE_EMPLOYEES')` (`services/orgPermissions.ts`) |
| Messaging | DMs / business messaging + `notifications` + push |
| Interviews | Rooms primitive (video/live) |
| Audit | `services/orgAudit.ts` |
| Resume | applicant profile / Creator Passport |
| Public page sections | org `pageSections` (`businessTemplates.ts`) |

## The delta to build

### 1. Data model (`types.ts`)
- **`JobPosting`**: `{ id, orgId, postingType: 'JOB' | 'VOLUNTEER', title, roleKey?, description, location?, isRemote?, employmentType?: 'FULL_TIME'|'PART_TIME'|'CONTRACT'|'GIG'|'VOLUNTEER', compRange?, shiftNeeds?, questions?: ApplicationQuestion[], status: 'OPEN'|'PAUSED'|'CLOSED', createdAt, createdBy }`.
- **`Application`** (its own entity — an applicant is NOT a member yet, so never overload `OrgMembership`): `{ id, jobId, orgId, applicantUid?, applicantName, applicantEmail?, applicantPhoto?, answers?, resumeUrl?, links?, stage: ApplicationStage, rating?, notes?: StaffNote[], source?, createdAt, updatedAt }`.
- **`ApplicationStage`** = `'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN'`.
- **`ApplicationQuestion`** = `{ id, prompt, type: 'TEXT'|'CHOICE'|'BOOLEAN'|'FILE', required?, options? }`.
- Firestore: `jobPostings` (top-level, `orgId` field) and `applications` (top-level, `orgId`+`jobId` fields) — flat collections so owner queries are single-equality (avoids composite-index traps, cf. `plajah-firestore-gotchas`).

### 2. Services (new `services/hiringService.ts`)
- `createJobPosting`, `updateJobPosting`, `closeJobPosting`, `fetchOrgPostings(orgId)`, `fetchOpenPostings()` (public board).
- `submitApplication(jobId, {answers, resumeUrl})` — auto-seeds name/photo/email from the applicant's profile; anonymous/no-account apply allowed for volunteers.
- `fetchApplications(orgId, jobId?)`, `moveApplicationStage(appId, stage)`, `rateApplication`, `addApplicationNote`.
- `hireApplicant(appId, roleKey)` → calls `createManagedEmployee` (or `acceptOrgMember` if they applied as themselves) → issues the work badge → `logOrgAction('EMPLOYEE_ADDED')` → sets stage `HIRED`.
- All mutations gated by `orgCan(..., 'MANAGE_EMPLOYEES')`; every stage move logs to `orgAudit`.

### 3. UI
- **Public "Careers" / "Get Involved" tab** on the org page (via `pageSections`; label flips by `postingType`). Lists OPEN postings → **one-tap apply** form pre-filled from the profile.
- **Applicant board** (new `components/business/HiringBoard.tsx`) — kanban columns by `ApplicationStage`, drag to move, per-candidate drawer (profile, answers, notes, rating, "Message", "Interview room", "Hire"). Lives beside EmployeeManager in OrgHub.
- **Volunteer mode**: same board; posting form swaps comp for shift/availability; hire → MEMBER-tier badge instead of STAFF.

### 4. Firestore rules
- `jobPostings`: public read when `status=='OPEN'`; write by org admins (`get(organizations/$(orgId)).data.admins`).
- `applications`: **create** by any authed user (or anon for volunteer postings) where `orgId`/`jobId` match an OPEN posting; **read/update** restricted to org admins + the applicant reading their own. Applicant may set stage only to `WITHDRAWN`. PII-sensitive — mirror the audit-log scoping.

## Differentiators (only Plajah can do these)
- **Zero-resume apply** — the profile *is* the application; Creator Passport = verified work history.
- **Applicant → employee → badge in one system** — hiring just flips an identity's state.
- **Interview rooms** built in.
- **Paid + volunteer recruiting on one engine.**

## Watch-outs (keep scope lean)
- **Compliance is the real cost, not the code.** US hiring touches EEO, "ban-the-box," and adverse-action rules once rejections/screening exist. MVP = *post → collect → stage → hire*. **Defer** background checks, assessments, payroll (integrations + liability).
- **PII**: lock application reads to org admins + the applicant; allow applicants to delete their application.
- Do **not** rebuild Greenhouse. Value = simple + native + free, not feature parity.

## Delivery (proposed Phase 6, after current business-page phases)
1. `JobPosting` + `Application` model + `hiringService` + rules.
2. Public Careers/Get-Involved tab + one-tap application form.
3. Applicant kanban board + hire-to-badge.
4. Volunteer variant (posting toggle + shift signup).
Cut everything else from the MVP.

## Verification
- tsc clean (`NODE_OPTIONS=--max-old-space-size=8192`, per repo gotcha) + Vite transform on all touched files.
- Round-trip: post a job → apply from a second profile → it lands in APPLIED → drag to HIRED → confirm a managed employee + badge is created and an audit entry logged.
