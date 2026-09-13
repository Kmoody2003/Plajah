# Plajah Fan Leagues — proposed product design

Status: design, not a shipped fantasy system. Prepared September 13, 2026.

Implementation handoff: [Sports Play & Learn beta specification](PLAJAH_SPORTS_PLAY_LEARN_BETA_SPEC.md). That specification governs the first beta wherever this earlier concept differs, including learning, youth privacy, simplified fantasy rules and deferred public reputation features.

## Updated audience direction: family-friendly social sports game

User direction: design for younger fans with an Everyone-style tone. This is a social video game about sports, with no gambling or money mechanics. Everyone-style describes the creative target, not an official ESRB rating or legal age clearance. Exact supported ages and launch jurisdictions remain to be established; do not silently assume an adults-only audience or that under-13 access is authorized for launch.

The primary loop is choose teams, join a league, build a fantasy squad, complete a weekly challenge, watch results and unlock a cosmetic reward. Use friendly rivals, original mascots, avatar customization, collectible achievement cards and optional sports-learning quests. Avoid odds, wagering language, payout animations, player injury jokes, humiliating loss screens and pressure to return. Fantasy roster slots and weekly scored opportunities are equal for everyone. Points are never staked; missed challenges do not erase earned progress.

Younger-fan mode defaults to a pseudonymous avatar and a private profile. Use private invite leagues with controlled membership; public discovery can offer moderated game challenges without exposing a child's searchable identity. Preset cheers and reactions are the first social tools. No open direct messages, voice chat, external profile/social links, precise location or public real-name display in this mode. Existing account social links must not leak through shared profile components. Free-text discussion is a separate capability requiring age-appropriate controls and moderation, not an automatic inheritance from adult fan rooms.

Design caregiver-managed accounts and consent/review/deletion flows for a potential under-13 release; obtain age- and jurisdiction-specific review before activating access. Enforce account capabilities on the server as well as in UI. A child-directed product cannot rely on an age checkbox alone to resolve privacy obligations. Public beta status does not remove these obligations.

For young fans, show personal progress and optional small-league standings before global rankings. Use age-appropriate skill explanations; avoid public authority labels, automatic post boosts or permanent public prediction histories. Store necessary scoring receipts privately with defined retention and correction policies. No public chain anchoring of youth records. Provide report/block tools and an adult support escalation route, plus reduced-motion, screen-reader and asynchronous-play support.

These youth defaults take precedence over the general public Fan Card, discussion and discovery proposals below. The game can have a real fantasy engine without unrestricted social networking. Prototype the complete loop with clearly labeled simulated fixtures while production data permissions and youth launch requirements are resolved.

## Product promise

Your fandom has a record. Free fantasy management, predictions and analysis build a visible history of skill within Plajah communities. Spending cannot improve competitive standing. Fantasy leagues are a required product pillar, not a later substitute for picks.

## Experience

- Sports Hub, when followed teams are off: league standings, upcoming lineup/pick deadlines, next games, analysis and your Fan Card.
- Game Day, when a followed team plays: real game coverage alongside your fantasy matchup and previously locked picks. Clearly distinguish fantasy totals from actual game scores and delayed data from live data.
- Persistent navigation: My Leagues / Picks / Fan Card. Invitations and discussion connect leagues to existing fan rooms.
- First visit: choose sports and teams, join a free league or weekly picks challenge, see a plain explanation of scoring and privacy.

## Three ways to compete

1. Fantasy leagues: NFL first, followed by NBA/WNBA, MLB, NHL and supported soccer competitions. Create/join/invite; asynchronous snake draft with free autodraft; rosters and lineup locks; waivers; trades with conflict review; weekly matchups, standings and playoffs. Each sport has its own roster, scoring, schedule and correction adapter. Midseason leagues start with a fresh future scoring period, never retroactive results.
2. Weekly picks: a published common slate, one pick per question, equal maximum scored opportunities and fixed scoring. No entry fee, stakes, odds payouts, parlays, bought entries or paid retries. Missed picks receive zero contest points; accuracy includes coverage to prevent cherry-picking. Practice challenges do not affect ranked records.
3. Analysis: a post can include an explicit testable prediction with a deadline, evidence and settlement rule. Link its eventual result back to the original post. Subjective debates receive peer feedback for evidence, clarity and sportsmanship, never an automatic declaration of factual truth from likes or AI.

## Fan Card and reputation

Keep distinct dimensions rather than a universal authority score:

| Dimension | Meaning | Protection |
| --- | --- | --- |
| Fan points / level | Capped participation and learning progress; unlocks rewards | Earned only; no cash value, transfer, purchase or currency conversion |
| Prediction record | Correct/settled, coverage, season and competition type | All ranked calls retained; voids and corrections disclosed |
| Forecast skill | Optional probability forecasts evaluated with Brier score against a frozen non-betting baseline | Separate track; show sample size, uncertainty and calibration; publish methodology |
| Fantasy management | Season results within a defined league format | No comparison of raw totals between incompatible sports/formats |
| Community contribution | Helpful explanations and constructive conduct | Independent of prediction accuracy; abuse and collusion review |

Example post badge (illustrative): `NFL • 38/60 calls correct • 60/64 submitted • 2026`. Open it to inspect the complete record. Provisional status until sufficient observations; threshold must be validated before launch. NFL performance grants no implied NBA expertise. A winning call does not establish that its explanation was correct.

Begin with badges and an optional track-record sort. If ranking boosts are introduced, constrain them to the relevant sport, cap their influence, reserve exposure for newcomers and disclose the ranking reason. Never grant moderation powers or suppress disagreement based on scores. Fan levels unlock nontransferable visual distinctions, not competitive tools or access advantages.

## Points and rewards

User decision: use points and rewards; do not introduce Plajah Bucks into this experience. Call the balance Fan Points in Sports, with a Points & Rewards view showing earned points, progress to the next reward and unlocked rewards.

Initial rewards are nontransferable badges, profile frames, fan-card styles, titles and season trophies. Publish the unlock requirements. Points unlock cosmetic rewards at milestones without being staked or lost on a prediction. Lifetime earned points determine level; fantasy standings and prediction accuracy remain separate, evidence-based stats. A cosmetic title must not imply verified accuracy unless the corresponding record qualifies.

No cash conversion, purchase discounts, gift cards, merchandise redemption, purchased points or paid competitive advantages in this initial design. Rewards do not unlock extra ranked entries, better scoring or privileged competitive information. This is a product design decision, not a migration of the existing platform points service.

## Fairness and wellbeing

Free scoring data and essential analysis tools for everyone. Equal ranked slates, accessible asynchronous play and free lineup assistance reduce time and income advantages. Participation points are capped; skill ranking does not reward sheer volume. No loss-chasing prompts, purchasable streak repair, random paid rewards or punitive daily attendance. Offer weekly summaries and notification controls. Detect duplicate accounts, copying before lock and coordinated peer-rating manipulation; provide appeals without default invasive identity collection.

## Trusted records

The server accepts authenticated submissions and enforces event locks using authoritative time. Clients cannot write settled scores or reputation. Record league/event/question IDs, scoring version, selected outcome, accepted time, lock time and receipt ID. Allow revisions before lock while preserving history; only the final accepted submission settles. Keep picks private until lock where appropriate.

Use a dedicated append-only sports ledger with server signatures. Settlement records cite the provider event, source revision and scoring version. Corrections append a superseding entry and rebuild derived standings idempotently; retries cannot award twice. Postponed, abandoned, tied and corrected events follow published sport-specific rules. Provider outages freeze pending results rather than invent outcomes. Provide a dispute window and visible provisional/final status.

Optional later chain anchoring: batch salted record commitments into a Merkle root and anchor the root. Keep identity, picks, posts and deletion-sensitive records off-chain; store nonces privately until an authorized reveal. No token, wallet or user gas fee. A chain proves commitment and integrity, not that source statistics or an argument are true. Retention, account deletion and public badge visibility need explicit policy.

Existing code observations: services/pointsService.ts converts points to purchase-redeemable Plajah Bucks. Sports Fan Points must not use that conversion; the existing platform service has not been migrated by this design change. services/learningLedgerService.ts provides an append/correction design precedent but its browser-side functions are not sufficient evidence of trusted server enforcement. The economic contracts in blockchainContractService.ts are not the required sports receipt system.

## Commercial and legal design

Recommended launch model: entirely free participation; no valuable prizes, deposits, transferable assets or redemption. Revenue can come from contextual sponsorship, optional presentation themes and community production tools. Payment never changes entries, data access needed to compete, rank or earned badges. Exclude betting affiliate funnels. Sponsorship does not imply prizes.

US is a planning assumption, not an established launch jurisdiction. Federal UIGEA excludes certain free contests from its wager definition and separately defines a conditional fantasy exclusion; these are not blanket permission under every state or other applicable law. Single-game winner picks should not be labeled covered by the fantasy exclusion. Counsel should review actual launch locations, age policy, rules, consideration/prize design and the indirect value of reputation features before public rollout. Adding merchandise, discounts, gift cards or redeemable points changes the review even if entry remains free. If children under 13 are included, assess COPPA applicability and consent/privacy requirements.

Data licensing is separate: contract for allowed fantasy scoring, public display, caching, historical records, corrections and audit retention. NFL official data discussions can begin with Genius Sports' media/fan-engagement team. Tracking data and highlight video require their own permitted scope; accessible endpoints are not proof of commercial rights. Prototype with labeled fixtures while obtaining the intended production rights. Never present a generic animated route as measured player tracking.

## Delivery sequence and acceptance

1. Build the free NFL fantasy vertical end to end: league setup through draft, roster locks, licensed scoring, corrections and final standings. Test concurrent draft claims, late submissions, authorization, duplicate settlements, stat corrections and postponed games.
2. Add weekly multi-sport picks, server receipts and Fan Cards, using shared event identity and league adapters. Verify standings can be rebuilt from receipts and settlement revisions.
3. Connect verified predictions to posts; add abuse-resistant community review and evaluate optional bounded discovery effects.
4. Expand fantasy sport by sport with documented scoring fixtures and provider coverage. Anchor receipts only if external verification warrants its operational cost.

Before ranked public launch: confirm jurisdictions/ages, provider rights, published rules and appeal policy; verify client write denials and accurate event locking. Preview UI can ship separately but must identify sample data and cannot imply functioning fantasy competition.

## Sources checked

- Federal definitions, 31 USC 5362: https://www.law.cornell.edu/uscode/text/31/5362
- New York paid-entry fantasy registration example: https://gaming.ny.gov/system/files/documents/2024/05/ifs-operator-application-for-registration.pdf
- FTC COPPA: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- Genius Sports official data API: https://www.geniussports.com/engage/official-sports-data-api/
