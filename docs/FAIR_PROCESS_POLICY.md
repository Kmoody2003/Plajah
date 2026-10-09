# Fair Process: how Plajah handles rule violations

## Part 1. For users (plain language)

**We never lock you out completely.** Even while we look into a possible problem, you can still sign in, read, watch, and message people.

**You always find out exactly what happened.** Every limit tells you:
- **What**: the post, comment, upload or activity involved
- **Which rule**: the rule we think it broke, in plain words
- **What's limited**: exactly which features are paused
- **For how long**: an end time, or "until a reviewer decides"

You get this as a notification, an email, and a banner at the top of Plajah.

**Limits match the problem.** We start small and only go further when the harm is more serious:
1. Fewer people see your posts
2. You can't publish public posts or comments, or go live
3. You also can't upload media, and private messages are text-only
4. During a serious legal review, private messages still work but are limited (see below)

**You can always fix it.** If you edit, remove or relabel the content, tap **Fix it**. We check fixes on a fast track and lift the limit if the fix solves the problem.

**You can always appeal.** Tap **Appeal**, tell us your side in your own words and add links to anything that helps. A person reviews every appeal. For anything stricter than reduced reach, the appeal goes to a **different reviewer** from the one who made the first decision. You can follow the status of your appeal, and you'll see the date we're aiming to decide by.

**One exception, required by law.** If content is confirmed to be child sexual abuse material (CSAM), US law requires us to report it to the National Center for Missing & Exploited Children (NCMEC) and to keep the evidence. That content is never restored. If law enforcement asks us to, we may hold back some details. You can still appeal the decision on your account, and your private messages keep working at the most limited level.

## Part 2. Internal enforcement ladder

The source of truth is `user_sanctions/{uid}`. It holds `actions.{id}` summaries, the legacy `suspendedUntil`, and `criminalReview` from `services/safety/*`. Capabilities are computed in `services/enforcement/standingCore.ts`, a pure module that is unit tested and shared by the client and server.

| Level | Post / comment | Go live | Upload | DMs | Reach |
|---|---|---|---|---|---|
| GOOD | yes | yes | yes | open | 1.0 |
| LIMITED_REACH | yes | yes | yes | open | 0.25 |
| RESTRICTED_PUBLIC | **no** | **no** | yes | open | 0.25 |
| RESTRICTED_MEDIA | **no** | **no** | **no** | text-only | 0.25 |
| CRIMINAL_REVIEW | **no** | **no** | **no** | text-only, 20/hour, existing threads only, no minors | 0 |

Rules that hold at every level:
- Sign-in, reading, DMs and appeals are always available (`canSignIn`, `canRead`, `canDM.allowed`, `canAppeal` are always true).
- Child safety comes before access. Under CRIMINAL_REVIEW, messaging any minor account is blocked. If we can't tell whether an account belongs to a minor, we treat it as a minor's.
- Every action must include `rule`, `ruleText` and either a duration or an explicit `indefinite: true`. CRIMINAL_REVIEW may be indefinite. When several actions are in force, the strictest level applies.
- ReportsQueue maps **warn** to LIMITED_REACH for 72 hours and **suspend** to RESTRICTED_PUBLIC for 7 days.
- A legacy `suspendedUntil` value counts as RESTRICTED_PUBLIC until it passes.
- An appeal can uphold, modify or overturn an action. It can never make an action harsher; a harsher response needs a new action.
- Second reviewer: for any level above LIMITED_REACH, the person who created the action can't decide its appeal. The server enforces this (`SECOND_REVIEWER_REQUIRED`).

## Part 3. SLA targets (time to first human decision)

| Item | Target |
|---|---|
| Correction ("I fixed it") | 24 hours |
| Appeal of LIMITED_REACH | 72 hours |
| Appeal of RESTRICTED_PUBLIC or RESTRICTED_MEDIA | 48 hours |
| Appeal of CRIMINAL_REVIEW | 7 days |

The admin queue (Reports queue, then Appeals & fixes) is sorted by due time, and overdue items are shown in red.

## Part 4. The CSAM exception (internal)

- Confirmed CSAM is reported to NCMEC and the evidence is preserved (`services/safety/*`). Content flagged `csam: true` is never restored, and an overturn doesn't restore it (`contentRestorable: false`).
- The user still sees that an action exists, along with its level and duration. The content snapshot and path are withheld from them.
- The safety pipeline owns `criminalReview`. A decision on a `criminal-review` appeal is recorded and flagged `needsSafetyTeam`, but this route never clears the hold itself.
- "I fixed it" is turned off for CSAM actions. Appeals stay open.
