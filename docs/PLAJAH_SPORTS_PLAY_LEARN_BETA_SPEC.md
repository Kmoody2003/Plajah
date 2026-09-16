# Plajah Sports: Play & Learn — public beta specification

Status: implementation specification, not implemented or approved for public release.
Date: September 13, 2026.
Audience: product, design, engineering, content, moderation and launch reviewers.

This specification supersedes conflicting first-beta proposals in PLAJAH_FAN_LEAGUES_DESIGN.md. That document retains longer-term ideas. The user-directed product is a family-friendly social sports game with real fantasy mechanics, learning, free participation and points/rewards. No Plajah Bucks. “Everyone-style” is a creative target, not a claimed ESRB rating. Exact launch ages and locations are unresolved release decisions; younger fans are central to the design, not an adults-only fallback.

## 1. Product outcome

A newcomer can understand a sport better by playing it as a fan: build a fantasy squad, recognize what players do, make a friendly prediction, follow an explained game and understand the resulting score. Experienced fans can skip instruction without gaining additional competitive opportunities.

Core loop: discover a concept → try it in a short interactive lesson → use it in a squad or challenge → follow an event → review what happened → unlock a cosmetic reward.

The first beta must include a complete playable fantasy season. A landing page, picks widget or static team builder alone does not satisfy this specification.

## 2. First-beta boundaries

| Included | Deferred |
| --- | --- |
| Football learning path; genuine roster and season management | Other sports' playable fantasy modes until adapters/content pass validation |
| Original fictional teams/athletes and deterministic simulated events | Production real-game scoring until permitted data is configured |
| Private 4–8-person leagues; optional clearly labeled computer managers | Public user matchmaking and searchable youth profiles |
| Weekly round-based picks and explained results | Continuous in-play predictions and probability-based rankings |
| Preset social reactions; reporting and blocking | Free text, DMs, voice, uploaded avatars and external links |
| Fan Points, personal progress, badges and cosmetic unlocks | Valuable prizes, purchases, currency conversion and paid advantages |
| Private server-verified results and corrections | Public blockchain records and public authority/post boosts |
| Family-account capability architecture and caregiver controls | Under-13 activation before applicable consent and launch review |

Open beta means eligible users in enabled locations can join without an invitation to the product. It does not mean children are placed in open chat with strangers. A user can explore a sample lesson without an account; persistent competition requires an eligible account. Sample mode must not persist identifiers or load nonessential third-party tracking by default.

Simulation is a real playable mode with real saved progress. It must say “Simulation League — fictional players and generated results” in setup, squad, game, standings and shared receipts. Do not use league marks or real player likenesses in this mode. Simulation history never becomes a real-world predictive credential. Future real-data leagues are separate; existing leagues cannot switch source mode midseason.

## 3. Navigation and visual design

Within Sports: Play / My Squad / Learn / My League / Rewards. On mobile, keep primary navigation compact and expose remaining destinations through a labeled menu. Preserve existing Sports Hub/Game Day behavior; a simulation event must not trigger a real followed team's Game Day state.

Use the Plajah design system, existing Surface/Button primitives, theme tokens and typography. Purple/magenta establish brand; orange identifies action; semantic colors communicate results. Scores and status also have text labels. Use original sports illustrations and controllable field diagrams, not sportsbook-style panels. Show one clear next action per card.

Screen requirements:

| Screen | Required content and actions |
| --- | --- |
| Play home | Continue learning, current squad/round, next lock time in local timezone, one optional challenge, simulation/beta label |
| Learn | Football path, estimated lesson time, resume, glossary, private skill progress; all lessons available without currency |
| Lesson player | Objective, visual explanation, interactive check, hint, explanation, retry, skip and return-to-game link |
| Squad | Starters/bench, position definitions, availability, projected values explicitly labeled estimates, lineup deadline, free suggested lineup with reasons |
| League | Alias-only member list, membership controls, published rules, draft, round matchups, standings, report/block |
| Game | Actual event score separate from fantasy score, play explanation, source/status/time, pending/corrected state, safe cheers |
| Recap | Result, exact scoring breakdown, “what this play means,” prediction outcome, one optional practice concept, reward receipt |
| Rewards | Earned total, next milestone, owned cosmetics, equip action, explanations of point awards |
| Family controls | Linked accounts, league membership approval, visibility, activity summary, support, consent status and deletion request |

Empty, loading, offline, denied, expired invitation, full league, pending result, void round and service outage states must have explicit copy. Never replace a failed real-data fetch with unlabeled simulated scores. Failed saves remain visibly unsaved with retry; never show an unaccepted pick as locked successfully.

## 4. Learning design

Lessons last approximately 2–4 minutes, are untimed and can be replayed without penalty. Instruction is optional before competitive play. Hints and suggested lineups are free and equally available. Reading speed, audio use or number of retries never affect standings.

Football beta curriculum: 12 authored lessons across four chapters.

| Chapter | Lessons | Evidence of learning |
| --- | --- | --- |
| Understand the field | Field and direction; downs and distance; scoring basics | Identify the direction of attack, interpret a simple down/distance situation, distinguish scoring events |
| Meet your squad | Quarterback; running back; receivers and tight ends | Match a role to a described action and place a player in an eligible roster slot |
| Read a game | Run/pass concepts; possession changes; game clock basics | Identify an event from a diagram and describe its immediate consequence |
| Become a manager | Real versus fantasy points; lineup and bench; evidence and uncertainty | Calculate a simple fantasy result, set a valid lineup and distinguish an observation from a prediction |

Every lesson contains: one explicit objective, plain-language explanation, original diagram or animation, text alternative, worked example, two practice checks with hints, and one new unassisted transfer question. Each incorrect choice has a specific explanation. A transfer question tests the same concept in a different situation instead of repeating the example.

Progress labels: Not started → Practicing → Demonstrated. “Practicing” means completed supported examples. “Demonstrated” requires two correct unassisted transfer checks on distinct question variants. Assisted answers remain useful practice, not failure. These are informal game-learning labels, not academic credentials. Changing a materially incorrect lesson version marks affected evidence for review; it must not silently preserve a false mastery claim.

Example lesson: “Real points and fantasy points.” In a fictional example, a rushing touchdown adds six real team points. Under this beta's declared fantasy rules, 20 rushing yards plus one rushing touchdown award the athlete 8 fantasy points. The learner assembles 2 + 6 and sees why fantasy totals differ from the scoreboard. Use this explanation in the actual recap when the corresponding event occurs.

Learning integration:

- Tap a term such as “bench” or a position abbreviation anywhere for a short definition without leaving the current task.
- “Explain this play” opens an authored concept panel anchored to structured event data.
- Recaps suggest at most one relevant lesson; losing never triggers shame language or mandatory remedial work.
- Suggested lineups explain eligibility and available evidence, and are labeled assistance rather than certainty.
- Practice questions may ask what happened in a completed event; ranked predictions must lock before it starts. Do not mix the two.
- Lessons use authored, reviewed answers in beta. No open-ended AI chat with children or unreviewed AI-generated sports rules.

Content model: sport, competition/ruleset, ruleset season/version, concept ID, prerequisites, objective, reading level, glossary terms, assets/text alternatives, practice variants, accepted answers, explanations, source references, reviewer, reviewed date and content version. Named content reviewers verify against current official rules before publication; NFL rules must not be silently presented as all football rules. This document defines the curriculum, not final approved instructional copy.

Expansion uses the same lesson shell and separate sport content: basketball possessions/positions/shooting; baseball innings/outs/batting; hockey shifts/penalties; soccer possession/offside. These are roadmap topics, not advertised playable beta features.

## 5. Fantasy engine: minimum complete season

Beta preset: 4–8 managers, one squad per account per league, six regular rounds followed by semifinals and a final for the top four. Remaining squads receive placement games. Computer managers fill optional empty slots and are visibly identified. No synthetic public testimonials or fictitious human activity.

Roster: 1 QB, 1 RB, 2 WR, 1 TE, 1 FLEX (RB/WR/TE), 3 bench; nine athletes total. Fictional catalog must support eight squads with ample positional reserves: minimum 20 QB, 30 RB, 40 WR and 20 TE. Eligibility is frozen for the season except a disclosed corrective revision. No kickers/defense units in this learning preset; label the simplified format clearly.

Draft: server-randomized snake order, displayed before the first pick. Nine rounds, 12-hour pick deadline, queue-based autopick on expiry. Managers can opt into autopick immediately; the host can start an all-autodraft league. Pool exclusivity and turn ownership are transactional. No advantage from paid or privileged timing. A missed turn never removes an account from the league. Minimum four squads before draft starts.

Lineups: one round-wide lock at the published first event start for the simplified beta. A draft saves atomically and must satisfy positions, roster ownership and uniqueness. Existing valid lineups carry forward; if none exists, the published deterministic auto-lineup is applied and labeled. Pre-lock event postponement can change the deadline only through a logged server revision communicated to managers. Locks never move backward to invalidate an accepted action retroactively.

Scoring preset v1 (fantasy rules, not official game scoring): passing yards 0.04 each; passing TD 4; interception thrown −2; rushing/receiving yards 0.1 each; rushing/receiving TD 6; reception 1; lost fumble −2. Count passing and receiving contributions separately for their respective athletes. No bonuses or unlisted categories. Use integer hundredths internally, round only display, preserve negative fantasy totals. Fan Points are independent and are never deducted for a negative fantasy score.

Transactions: allow bench/free-agent changes between rounds, with a rolling waiver priority initialized in reverse draft order. A successful claim moves that squad to the back; unsuccessful claims preserve priority. Claims identify a drop athlete and are validated/settled transactionally. No auction balance. Trades are deferred for first beta to reduce collusion/moderation complexity; show no dead trade controls.

Regular matchup ties stand. Standings sort wins (tie = half win), total fantasy points, then a public seeded tiebreak order fixed before round one. Playoff ties use the higher regular-season seed. Generate a balanced opponent schedule, minimizing repeat opponents before all pairs meet; show it before the season. Odd squad counts receive balanced byes; bye rounds do not count as wins or accuracy opportunities.

Stat corrections produce a visible revision and recomputed standings. Each round has a published correction window of 48 hours after its last event finalizes; playoffs start only after the prior round closes. Later material errors require an operator incident/correction record and notification, not hidden edits. An abandoned event is void; no invented zero-performance claim. If any required event remains unresolved beyond seven days after the scheduled round end, void the entire round under the published beta rules and adjust its matchups out of standings. Operator cannot favor individual squads with ad hoc outcomes.

Simulation publisher: independently scheduled server worker with seeded reproducible outcomes, valid football event/stat relationships and immutable round fixtures. Seeds/outcomes remain private until all associated choices lock; seeds may then be disclosed for reproducibility. Scheduling and simulation generation cannot read managers' picks to choose outcomes. A private quick-test league may accelerate rounds; its standings never compete against normal-pace leagues.

## 6. Picks, points and rewards

Weekly picks: three published outcome questions per round, same questions within a league, fixed 1 competition point per correct answer and 0 otherwise. No confidence stakes, combined payouts or extra attempts. Tie/void outcomes follow each question's declared rule; questions cannot be published without it. One final accepted answer per user/question; pre-lock edits retain revision history. Do not expose peers' choices until lock. Accuracy denominator excludes voids; show submitted versus offered opportunities alongside it.

Fan Points are separate from pick standings, fantasy scores and learning evidence. Proposed beta reward schedule:

| Action | Fan Points | Limit |
| --- | --- | --- |
| Finish a reviewed lesson with its practice | 20 | Once per lesson, not per retry or minor content revision |
| Demonstrate the concept | 10 | Once per concept |
| Submit a valid round lineup | 10 | Once per account/round, not per league |
| Complete a weekly picks slate | 10 | Once per account/round, regardless of result |
| Complete the recap practice check | 5 | Once per account/round |

No points for sending reactions, recruiting users, time spent online or posting frequently. Learning awards are finite rather than daily-grind incentives. Repeating a completed lesson remains available without awards. Additional leagues cannot multiply participation awards. Success in competition earns a clearly labeled season trophy; participation points do not imply prediction skill.

Milestone unlocks: 50 points original profile frame; 100 fan-card background; 200 avatar accessory; 300 playbook theme. All are nontransferable, have no cash/redemption value and do not consume points. No random loot boxes or scarcity countdowns. Trophy and cosmetic titles must not imply official expertise. Rules and reward versions are fixed for an active season; publish prospective changes.

## 7. Youth account and social capabilities

Use a centralized server-resolved capability policy, not client checks scattered across components. Capabilities include canJoinBeta, canCreateLeague, canApproveMembership, canUsePresetReactions, canReadLeagueRoster and canViewOwnProgress. Missing eligibility/consent state fails closed for saved play while allowing the untracked sample lesson where permitted.

Model pending, eligible, consent-required, consent-revoked and suspended states. Exact age bands, verification/parental consent method and jurisdiction rules are launch decisions to be configured following review. Do not collect identity documents or full dates of birth by default without a defined need and retention policy. Do not treat an unverified “I am a parent” checkbox as verified consent.

Younger-fan defaults: generated alias and moderated original avatar choices; no public profile search; no external account links; no open chat/DM/voice; no public individual learning or prediction record. Restrict adult visibility to game-relevant alias and scores within approved membership. Invites are random, expiring and revocable; possessing a link never bypasses membership approval. A caregiver/approved host controls youth league membership. Adult and youth capabilities cannot be switched by editing a profile field.

Preset reactions: “Great play,” “Good game,” “Nice teamwork,” and “I'm learning this.” Rate limit and allow mute/block. No user-supplied reaction text or uploaded images. Reporting routes to a staffed operator queue with a defined response owner; urgent safety reports can suspend interaction pending review. Blocking stops reactions/invites while preserving necessary matchup scoring under an alias. No behavioral ads in the youth beta.

Privacy: separate eligibility/caregiver records from game records; never expose exact age or caregiver contact in league documents. Define and approve retention periods before launch. Delete/anonymize personal data through a server workflow including derived views; document limited security/legal retention and backup expiry. “Append-only” means no silent competitive edits, not an excuse to deny deletion rights. No youth records on a public chain. Feedback uses structured categories without requiring free-text personal disclosures.

## 8. Proposed technical architecture

Reuse React/TypeScript and existing Firebase infrastructure. File names below are proposed implementation boundaries, not claims of existing code:

- components/sports/play/ — home, league setup, draft, squad, recap and rewards.
- components/sports/learn/ — lesson player, glossary, interactive field, progress.
- services/sportsGameRules.ts — pure roster/scoring/standings functions with versioned presets.
- services/sportsLearningContent.ts — reviewed static content and variant definitions.
- services/sportsPlayService.ts — authenticated client requests only; no score/eligibility authority.
- Server-side sports domain handlers — capability enforcement, submissions, draft/waivers, settlement, rewards, corrections and deletion. Place in the repository's established server deployment after implementation discovery.

Integrate with PersonalizedSportsLanding and PlajahSportsView using capability-aware navigation. Reuse event normalization concepts from nflScoreboard/followedTeamSchedule only after checking identifier and licensing requirements. Do not embed existing unrestricted MatchFanRoom or shared public profile views in youth mode. Do not use pointsService.ts's Plajah Bucks conversion. Borrow the ledger's append/correction concept, not its client-side authority model.

Proposed server collections/entities:

| Entity | Essential fields and authority |
| --- | --- |
| sportsEligibility | uid, capabilityPolicyVersion, eligibility/consent state, jurisdiction decision; restricted server/private access |
| sportsLeagues | mode, sport, season, rulesVersion, schedule, lifecycle; server validated |
| sportsMemberships | leagueId, uid, alias, role, approval; scoped reads, server writes |
| sportsSquads | leagueId, owner, athleteIds, starters, revision; server validated |
| sportsRounds/events | sourceMode, provider IDs, startsAt, lockAt, status, sourceRevision; server only |
| sportsSubmissions | uid, question/round, value, acceptedAt, revision, idempotencyKey; owner-only pre-lock |
| sportsSettlements | subject, ruleVersion, sourceRevision, totals, supersedes, status; server only |
| sportsRewardEvents | uid, reason, unique award key, amount, version; server only |
| sportsLearningProgress | uid, concept/content version, supported/independent evidence; owner/caregiver scoped |
| sportsReports | reporter, target/context, category, status; restricted moderation access |

Authenticated commands: createLeague, requestJoin, approveMember, draftAthlete, saveLineup, submitPick, claimWaiver, submitLessonAttempt, equipReward and reportConcern. Each checks capabilities, membership, schema, size limits and rate limits. Mutations carry idempotency keys and relevant expected revisions; accept/deny returns a server receipt or explicit reason. Lesson award validation uses server-known variants and scoring rather than trusting a client completion flag.

Core invariants: one athlete owner per league; one accepted draft action per turn; no accepted post-lock changes; rewards at most once per award key; repeat settlements are harmless; simulation/real histories never merge; denied users cannot bypass UI through direct API/Firestore writes. Store server timestamps, not caller-provided acceptance times. Worker failures queue retries and expose pending states. Keep audit details out of child-facing errors.

## 9. Accessibility and feedback

Keyboard-operable drafting and lineups with button alternatives to drag/drop. Visible focus, useful labels, screen-reader score summaries and text explanations for diagrams. Support reduced motion, pause/replay, captions for any instructional audio/video, 200% text zoom and narrow screens without horizontal page overflow. Avoid flashing effects and color-only field markings. Do not require audio, speed or memorization to participate.

After a lesson: optional “Clear / A little confusing / Need another example.” After a round: “Was the scoring clear?” and structured bug categories. Send aggregate, minimized analytics rather than public child-level metrics or session replay. Do not collect text keystrokes or sensitive caregiver data in telemetry.

Evaluate learning separately from engagement: first-attempt transfer performance, improvement on distinct concept variants, hint use and explanation clarity. Engagement measures include completion of a full round and successful return to a saved squad; do not optimize time spent or compulsive daily retention. Segment only when privacy thresholds allow, never publish small identifiable cohorts.

## 10. Acceptance and release gates

| Requirement | Verification |
| --- | --- |
| Complete game | Four test accounts finish draft, six rounds, playoffs, recap and reward unlock; repeat with eight squads and computer managers |
| Learning | All 12 lessons have reviewed sources, text alternatives, hints and distinct transfer variants; novice usability review confirms understandable instructions |
| Fairness | Autodraft cannot produce invalid rosters; extra leagues and replayed lessons cannot duplicate awards |
| Lock integrity | Concurrent draft/lineup/pick requests, client clock changes and late requests cannot defeat server locks |
| Scoring | Golden fixtures cover every scoring category, negative values, ties, byes, corrections, voids and reproducible rebuilds |
| Youth isolation | Direct API and Firestore tests deny unauthorized progress/profile reads, membership changes and score writes; public shared components leak no external links |
| Lifecycle | Revoked consent/eligibility blocks new actions; deletion removes personal derived views according to policy |
| Accessibility | Keyboard/screen-reader pass; reduced motion and 200% zoom; phone/tablet/desktop layout review |
| Operations | Tested outage/pending states, worker retries, reporting queue, kill switch, backup/restore and incident ownership |
| Release | Actual ages/locations, consent/privacy/retention procedures, content/data permissions and moderation staffing reviewed before public activation |

Feature flags: sportsPlayBeta, sportsLearningBeta, sportsSimulationMode, sportsRealDataMode and youthEnrollmentEnabled. Flags are server enforced for protected actions. Default production flags off until acceptance gates pass. Kill switch can pause submissions/interactions without destroying saved records. Beta resets require advance in-product notice; preserve or explicitly explain treatment of earned cosmetic rewards.

Delivery milestones:

1. Foundation: capability model, reviewed content schema, rules engine and test fixtures.
2. Playable simulation: league → draft → lineup → round → standings → playoff → reward, including save/resume.
3. Learning integration: 12 lessons, glossary, explained scoring and private progress.
4. Family/social protection: approved membership, preset reactions, reporting, consent integration and deletion tests.
5. Public beta readiness: accessibility/usability checks, launch review, operational rehearsal and enabled-location rollout.
6. Expansion: permitted real data, then additional sports with independently validated rules and learning content.

## 11. Decisions needed before activation, not before prototyping

- Supported launch locations and precise age eligibility; caregiver/consent provider and verification approach where required.
- Content-review owner, moderation coverage, support escalation and data-retention schedule.
- Hosting/worker deployment, provider contract for any real-data mode and release acceptance owner.

Public-facing draft copy: “Plajah Sports Play & Learn — Beta. Build a squad, learn the game and play together. Free to play. Earn points and unlock profile rewards. Simulation leagues use fictional players and generated results. Beta scores may be corrected or reset with notice.” Show eligibility and privacy information separately in understandable onboarding; this copy is not a legal exemption.

Reference context: [Plajah design system](PLAJAH_DESIGN_SYSTEM.md), [initial concept and previously checked legal/data sources](PLAJAH_FAN_LEAGUES_DESIGN.md). Recheck applicable law and data terms for actual release; this specification is product/engineering work, not a legal clearance.
