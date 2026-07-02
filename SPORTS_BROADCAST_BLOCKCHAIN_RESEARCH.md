# Plajah — Sports Broadcast Infrastructure & Athlete Blockchain

**Research & Go-to-Market Analysis**
**Original analysis: June 6, 2026 · Extracted as a standalone document from `PLAJAH_GTM_PLAN.md` §22**

> Scope: the sports broadcaster technology Plajah built (real-time sportscast engine,
> professional score overlay, AI commentary, AI player tracking) and the athlete
> blockchain layer it sits on (AthleteRegistry + five Solidity contracts, NIL escrow,
> highlight NFTs, soulbound career identity, booster DAO). Reflects the sports broadcast
> layer, the AthleteRegistry chain service, and the 10 "On The Horizon" features.

---

## 1. What Was Built (New Systems)

### Sports Broadcast Layer

**`sportscastService.ts`** — Firestore-backed real-time game state engine. `GameState` lives at `live_feeds/{feedId}/sportscast/gameState`. Scores, clock, period, down/distance, and possession sync across all viewers in real time via `onSnapshot`. Highlights fire to a sub-collection and trigger AI commentary.

**`ScoreBugCanvas.tsx`** — Canvas2D professional score overlay. Runs in a `requestAnimationFrame` loop at native display refresh. Features: lerp-animated score transitions, score flash on touchdown/goal, pulsing LIVE indicator, `shadowBlur` glow effects, player tracking rings, period clock, down & distance. Zero React re-renders during animation — all state is held in a ref. Runs as a `position: absolute, inset: 0, pointer-events: none` overlay on any video player.

**`SportsProducerPanel.tsx`** — Fixed-position producer dashboard. Subscribes to game state, auto-inits if none exists. Client-side clock ticks each second, writes to Firestore. Highlight log buttons: TOUCHDOWN, GOAL, THREE_POINTER, HOME_RUN, INTERCEPTION, SAVE, BIG_PLAY. Each fires Web Speech API commentary immediately in a deep male sports-announcer voice.

**`SportsStreamWrapper.tsx`** — Wrapper component that adds highlight toasts, commentary banners, and player tracking badge to any live video. Renders max 4 toasts, auto-dismiss at 6s. Prevents old highlight events from flashing for late-joining viewers (filters events older than stream join time minus 5s).

**`GoLiveWizard.tsx` (modified)** — Added `SPORTS` stream type. Selecting SPORTS shows a dedicated amber info card, uses the front camera, and renders `SportsProducerPanel` after the stream goes live.

**`usePlayerTracker.ts`** — Dynamic TF.js MoveNet MULTIPOSE_LIGHTNING hook. Tracks up to 6 players. Computes speed in mph from frame-delta: `sqrt(dx² + dy²) * 30fps * 0.022`. Imports TF.js dynamically — silent no-op if library is not installed. Player coordinates feed directly into ScoreBugCanvas tracking rings.

### Athlete Blockchain Infrastructure

**`AthleteRegistry.sol`** — ERC-1155 + ERC-2981 + ReentrancyGuard. Revenue splits: 70% athlete / 20% school / 10% platform on NFT first mint. 7.5% secondary royalties via ERC-2981. Records 26 stat event types on-chain. NIL deals with automatic USDC escrow fulfillment when stat threshold is crossed. School scholarship fund with platform-controlled release.

**`athleteChainService.ts`** — TypeScript service layer. Maps highlight event types to on-chain stat categories. `recordHighlightOnChain()` fires as a non-blocking `.catch()`-wrapped call from `pushHighlight()` so broadcast never lags. Mirrors all on-chain activity to Firestore for fast UI reads. Issues PLAJ token rewards per milestone type (TOUCHDOWN: 200 PLAJ, GOAL: 200 PLAJ, INTERCEPTION: 150 PLAJ, etc.).

**`AthleteCareerCard.tsx`** — Four-tab athlete profile: stats, NFTs, earnings, recruit tab. Chain stats and NFTs loaded in parallel on mount. PNG export via html2canvas at 2× scale. Recruit tab shows scout discovery upsell ($49.99).

### "On The Horizon" Infrastructure

**`HorizonFeatureGate.tsx`** — Dual-mode gate component. `cardOnly` mode renders a compact inactive card with status badge, ETA, and Notify CTA. `wrapper` mode blurs children `(filter: blur(3px) brightness(0.35))` and overlays a frosted glass "Coming Soon" panel. Waitlist registrations write to Firestore `horizon_waitlist` collection.

**`OnTheHorizonHub.tsx`** — Full showcase page. Live waitlist counts via Firestore `onSnapshot`. Interactive roadmap timeline across 4 quarters. Category filter (Athlete Economy / Community & Fans / Media & Content / Compliance & Trust). All 10 feature cards with expandable details, revenue model disclosure, and per-feature Notify CTA.

**`horizonFeaturesService.ts`** — Service layer for all 10 features. All functions guarded by `assertFeatureActive()` which checks Firestore `platform_config/horizon_flags`. Throws `HorizonFeatureInactiveError` until activated. Covers: dynamicNFT, predictionMarket, alumniEndorsement, soulbound, boosterDAO, injuryPool, photoLicense, loiNFT, scoutDiscovery, familyMultisig.

**5 Solidity contracts** — `SoulboundAthleteToken.sol` (ERC-5192, non-transferable career record), `PredictionMarket.sol` (PLAJ-staked binary markets), `AlumniEndorsement.sol` (reputation staking), `BoosterClubDAO.sol` (USDC treasury + PLAJ voting), `InjuryInsurancePool.sol` (community-funded micro-insurance).

---

## 2. The New Beachhead — High School Sports

This is Plajah's fourth beachhead segment — and arguably its most defensible.

**The pain:** A high school athlete who scores three touchdowns on Friday night has:
- No official clip that lives anywhere searchable beyond Twitter/Instagram DMs
- No chain-of-record for the stat (MaxPreps gets it wrong; school reporting is manual)
- No way to earn from their talent (NIL is legal in most states, but infrastructure doesn't exist at the HS level)
- No financial protection if they get hurt
- No way to know if a college scout has seen their highlight

The parents filmed the game on an iPhone. The highlight is buried in a Stories archive that disappears in 24 hours. The stat doesn't exist until a school admin manually updates MaxPreps — if they bother. The athlete has zero leverage.

**The fix Plajah uniquely offers:**
- A parent, coach, or authorized producer starts a SPORTS stream on Plajah in 30 seconds
- ScoreBugCanvas renders a professional score overlay over the live video
- Producer logs TOUCHDOWN — highlight fires to Firestore, AI commentary speaks it in a stadium announcer voice, the event records on-chain to AthleteRegistry
- Athlete's career stat is now on Polygon forever, verifiable by any college recruiter
- If a scout pays $49.99 to access the Scout Discovery tab on AthleteCareerCard, they see verified chain data — not a MaxPreps number that might be wrong
- The highlight clip can be minted as an ERC-1155 NFT; the athlete earns 70%, the school earns 20%
- Family fans watch the live stream from anywhere; the score overlay makes it look like ESPN

---

## 3. Competitive Landscape Analysis

### Sports Vertical

| Competitor | What They Do | What They Lack | Plajah Advantage |
|---|---|---|---|
| **MaxPreps** | HS stat aggregation | Manual stat entry, no verification, no video, no athlete revenue | Chain-verified stats, live video, athlete income |
| **Hudl** | Recruiting film hosting | $799–$999/year to athletes, no live broadcast, no blockchain | Free to broadcast, on-chain record, NIL-ready |
| **NFHS Network** | School sports streaming | School-controlled only, no athlete revenue, no stat overlay | Parent/coach-produced, athlete earns on highlights |
| **SportsRecruits** | Recruiting profile management | No verified stats, no video, no NIL infrastructure | AthleteCareerCard = verified stats + video + NIL |
| **Overtime** | HS sports highlight media | Platform owns the highlights, athletes earn nothing | Athlete owns the NFT, earns 70% of all revenue |
| **FloSports** | Niche sports streaming | Subscription-gated, no athlete economy, no live overlay | Free to produce, athlete earns every clip |

**Plajah's irreplaceable moat in sports:** The combination of live broadcast + professional score overlay + on-chain stat verification + athlete revenue is not assembled anywhere. Hudl is a film library. MaxPreps is a stat database. NFHS is a broadcast network. None of them connect these things, and none of them send money to athletes.

### NIL / Athlete Economy Vertical

| Competitor | Model | Take Rate | Athlete Control |
|---|---|---|---|
| **Opendorse** | Brand deal marketplace | 15–20% | Moderate — brand-initiated |
| **Dreamfield** | Fan experience marketplace | 20% | Moderate |
| **Brandr** | Group licensing | Platform-controlled | Low — school/conference deal |
| **OpenSponsorship** | Brand–athlete matching | 10–15% per deal | Moderate |
| **Plajah AthleteRegistry** | Direct NIL + highlight NFT | 10% platform on NFTs, 5% on NIL | High — athlete-triggered |

**Key distinction:** Every competitor routes NIL deals through brand approval. Plajah's model is performance-conditional and self-executing: the smart contract releases USDC when a stat threshold is met. No brand approval required for the NIL payout. No account manager in the middle. The contract IS the deal.

### Blockchain / Sports NFT Vertical

| Competitor | Model | Sport Focus | What's Missing |
|---|---|---|---|
| **Sorare** | Licensed fantasy + NFTs | Pro soccer, baseball, NBA | No HS athletes, no live stat trigger |
| **Chiliz / Socios** | Fan tokens for pro clubs | Pro leagues only | No athlete income, no stat verification |
| **Candy Digital** | Licensed collectible NFTs | MLB, NFL (pro only) | No broadcast integration, no NIL |
| **NBA Top Shot** | Licensed highlight moments | NBA only | No live production tool, no HS athletes |
| **Plajah AthleteRegistry** | Live-broadcast-triggered NFTs | Any sport, any level | — |

**Plajah's blockchain moat:** Competitors have licensed digital collectibles from professional leagues. Plajah mints NFTs from a live broadcast, authenticated by a sport producer who was physically present. The chain record isn't a studio-produced clip — it's a verified game event. No other platform does this for high school athletes.

### Scout / Recruiting Vertical

| Competitor | Data Source | Cost to Scout | Athlete Consent |
|---|---|---|---|
| **247Sports / Rivals** | Journalist-reported | Subscription ($9.95–$29.99/mo) | Not required |
| **On3** | Composite rankings | Subscription | Not required |
| **SportsRecruits** | Self-reported | $150–300/mo per team | Self-reported only |
| **NCSA** | Self-reported | $599–2,999 athlete fee | Opt-in |
| **Plajah Scout Discovery** | Chain-verified | $299 (regional) / $999 (national) per year | Explicit athlete opt-in required |

**Plajah's scout data advantage:** Composite rankings and self-reported stats are guesswork. A scout on Plajah is viewing data from `AthleteRegistry.recordStatEvent()` — signed by the game producer who was present, recorded on Polygon, verifiable on Polygonscan. This is the first scout database with cryptographically authenticated stats.

---

## 4. Unique Strengths — Across All Verticals

1. **Live broadcast as the oracle.** Plajah's sports producer is the authoritative source of truth. The `pushHighlight()` → `recordHighlightOnChain()` pipeline means the moment something happens in a game, it simultaneously: appears as a score bug, triggers AI commentary, toasts to viewers, and records on-chain. No oracle service. No API. The broadcast IS the data.

2. **Full-stack athlete economy.** No competitor touches all of: live streaming → stat verification → NIL deal execution → NFT minting → scout discovery → career record. Plajah does all of it from a single athlete profile.

3. **Custodial-first, chain-optional.** Athletes don't need MetaMask. Wallets are created at signup using the existing `blockchainWalletService.ts` pattern — AES-256 encrypted private key in Firestore. Every chain benefit is automatic. The athlete sees USDC earnings in their dashboard, not gas fees.

4. **Minor athlete protection baked in.** The Family Multi-Sig wallet (2-of-3: athlete + parent + Plajah backup) is built into the platform's legal architecture. NIL for minors is handled with parental co-signature. No competitor has thought about this at the infrastructure level.

5. **Soulbound career token = unforgeable identity.** The ERC-5192 token cannot be transferred, sold, or faked. A college recruiter who reads a Plajah athlete's Soulbound token knows the LOI, game count, and milestone badges are real. This is the first cryptographic recruiting identity in high school sports.

6. **"On The Horizon" as a moat signal.** The 10 horizon features — prediction markets, alumni endorsement, booster DAO, injury insurance, LOI NFT, photo licensing — signal a roadmap that no competitor can replicate quickly. The features are infrastructure, not UI. Competitors can copy a UI. They cannot quickly deploy 5 audited Solidity contracts and a multi-sig family wallet architecture.

7. **Integration across existing Plajah verticals.** The sports layer isn't a standalone app — it runs inside the existing social graph. A parent watching the live stream is already a Plajah user. A musician in the crowd can share their Right Now session. The athlete's Club page at the school gets booster DAO treasury governance. These integrations don't exist for any sports-only competitor.

---

## 5. Projected Growth — Sports Vertical

### Addressable Market

- **High school athletes (USA):** 7.9 million (NFHS 2024–25)
- **HS sports events per year:** ~230,000 schools × ~15 sports × ~10 games = ~34.5M events
- **Parents streaming HS games annually:** Estimated 20–30M unique streamers
- **NIL-eligible HS athletes (state-dependent):** ~4.2M (states with active HS NIL laws)
- **College scouts:** ~22,000 active NCAA coaches actively recruiting

### Revenue Projections — Sports + Athlete Economy

**Year 1 (Conservative — 500 active SPORTS streams/month, 1,000 registered athletes)**

| Revenue stream | Monthly | Annual |
|---|---|---|
| Highlight NFT sales (10% platform take, avg $15/NFT × 3 per stream) | $225 | $2,700 |
| Scout Discovery subscriptions (50 scouts × $299/yr blended) | $1,246 | $14,950 |
| PLAJ token SPORTS stream rewards (gas-neutral, token value accrual) | Indirect | — |
| SPORTS stream upsell to Creator Pro | 100 × $29.99/mo | $35,988 |
| **Year 1 conservative total (sports vertical only)** | **~$4,500/mo** | **~$54,000** |

**Year 2 (Momentum — 10,000 active streams/month, 25,000 registered athletes)**

| Revenue stream | Monthly | Annual |
|---|---|---|
| Highlight NFT volume (platform 10%) | $22,500 | $270,000 |
| Scout subscriptions (500 regional + 100 national scouts) | $24,500 | $294,000 |
| NIL deal platform fee (5% of USDC escrowed, avg $500/deal × 200 deals) | $5,000 | $60,000 |
| Photo licensing (15% platform cut, 1,000 licenses/month avg $50) | $7,500 | $90,000 |
| BoosterDAO 2% fee on USDC contributions ($1M annual DAO treasury) | $1,667 | $20,000 |
| Injury pool management fee (3%, $500K PLAJ staked) | $1,250 | $15,000 |
| **Year 2 momentum total (sports vertical only)** | **~$62,000/mo** | **~$749,000** |

**Year 3 (Scale — 100K streams/month, 250K athletes, national presence)**

| Revenue stream | Monthly | Annual |
|---|---|---|
| NFT volume at scale (platform 10%) | $225,000 | $2.7M |
| Scout network (5,000 subscriptions, blended) | $245,000 | $2.94M |
| NIL deal fees (5%, 2,000 deals/month avg $500) | $50,000 | $600K |
| Dynamic NFT rarity upgrades (new revenue at activation) | $30,000 | $360K |
| Prediction market fees (5% of PLAJ pools) | $50,000 | $600K |
| LOI NFT mint fees ($199 × 5,000 LOIs/year) | $83,000/annual | $83K |
| Alumni endorsement PLAJ activity | Indirect (PLAJ value) | — |
| **Year 3 scale total (sports vertical only)** | **~$600,000/mo** | **~$7.3M** |

**Blended platform (sports + creator + music + science at Year 3):**
- Creator vertical: **~$276K/mo**
- Sports vertical: **~$600K/mo**
- B2B (Cora API, debate white-label, education): **~$50K/mo**
- **Total Year 3 blended MRR: ~$926K/mo → ~$11.1M ARR**

---

## 6. Adoption Challenges

### Challenge 1 — NIL Regulatory Fragmentation

**The problem:** NIL rules for high school athletes vary by state. As of 2026: 33 states allow HS NIL with varying restrictions. 17 states restrict or prohibit HS NIL deals. Some states require school district approval per deal. Some require parental co-signature for minors. Federal legislation (the Student Athlete Level Playing Field Act) is pending and could override all state rules.

**Why this matters for Plajah:** `AthleteRegistry.sol` executes NIL deals automatically when a stat threshold is crossed. If the athlete is in a state where HS NIL is prohibited, executing that contract creates legal exposure.

**Winning strategy:**
1. **State-gating in the UI:** `athleteChainService.ts` checks the athlete's registered state against a maintained `nil_eligible_states` Firestore document. NIL features are disabled for athletes in non-eligible states.
2. **Compliance-first positioning:** Position Plajah as the platform that keeps athletes in compliance — with built-in state law gates, parental co-signature via Family Multi-Sig, and auto-timestamped deal records that can be provided to school administrators.
3. **Engage with NFHS directly:** The National Federation of State High School Associations is the body that sets eligibility policy. A Plajah partnership or endorsement from NFHS would accelerate adoption in all 50 states simultaneously.
4. **Federal advocacy:** Support the federal framework — it would eliminate state fragmentation and make Plajah's national infrastructure immediately compliant everywhere.

### Challenge 2 — School District IT and Policy Barriers

**The problem:** Many school districts block third-party streaming platforms. Athletic directors control what tools coaches use. A coach who wants to broadcast on Plajah may need IT approval, administration sign-off, and a media release form for every student athlete visible on stream.

**Why this matters:** The sports broadcast layer requires at least one person on-site (parent, coach, or designated producer) with a phone and a Plajah account. If that person is a school employee, they may face institutional barriers.

**Winning strategy:**
1. **Parent-first positioning:** The producer doesn't need to be a school employee. A parent with a phone and the Plajah app IS the broadcast infrastructure. Frame SPORTS mode as a parent tool, not a school tool — no IT approval required.
2. **FERPA compliance documentation:** Publish a one-page FERPA compliance brief explaining what data Plajah collects (stream metadata, highlight events, wallet addresses) and what it does NOT collect (student records, grades, enrollment data). School legal teams need to check a box, not investigate from scratch.
3. **Student privacy controls:** Athletes control their own opt-in. Parents co-sign on the Family Multi-Sig. The platform doesn't expose athlete PII to scouts without explicit opt-in. This is a feature, not a concession.
4. **Win the booster club first:** Booster Club parents are not district employees. They are the ones filming games anyway. Win the booster club → the demand comes from inside the school's community → the administration responds to community demand, not vendor sales.

### Challenge 3 — Blockchain Adoption Friction

**The problem:** "Blockchain" is a loaded word with most parents, athletes, and athletic directors. The words "NFT," "wallet," and "smart contract" trigger skepticism or confusion. The exact thing that makes Plajah's athlete data trustworthy (immutability, chain verification) is also the thing most people associate with scams.

**Why this matters:** If the sales pitch leads with "your highlights are minted on Polygon," the conversation is over before it starts.

**Winning strategy:**
1. **Never say "blockchain" to end users.** The scout discovery tab says "verified stats." The career card says "verified career record." The NFT revenue screen says "highlight clip earnings." The chain is invisible. The benefit is visible.
2. **Custodial wallets by default.** Athletes don't open MetaMask. They see a "Career Wallet" in their Plajah dashboard with a USDC balance. The private key management, Polygon gas, and smart contract interaction are entirely hidden. If they want to self-custody later, they export their key.
3. **Lead with the producer panel, not the blockchain.** The sales pitch is: "Point your phone at the court. Start a stream. Hit TOUCHDOWN. Your fans see a score bug. Your athlete gets paid." The fact that TOUCHDOWN writes to AthleteRegistry on Polygon is background infrastructure.
4. **Proof of concept with a single high-profile game.** A state championship game where Plajah's score overlay and AI commentary run professionally will generate more trust than any whitepaper. One good broadcast demo is worth 100 blockchain explanations.

### Challenge 4 — Two-Sided Marketplace Cold Start (Sports Edition)

**The problem:** Scouts won't pay $299/year for scout discovery if there are 50 athletes on the platform. Athletes won't create profiles if there are no scouts looking. This is the classic marketplace chicken-and-egg problem.

**Winning strategy:**
1. **Seed supply first — aggressively.** Target 10 states with active HS NIL laws and strong sports cultures (TX, FL, GA, OH, CA, PA, NC, TN, AL, MI). In each state, find 3–5 booster clubs or sports parents with social media presence and offer them Founding Producer status: their school's games broadcast on Plajah for free, scorebug and AI commentary included, for an entire season.
2. **Manufacture demand from existing users.** Plajah already has users in the music and creator segments. Post-game highlight clips as Plajah content — athletes' highlights become social posts in the existing feed. The social graph creates organic discovery before the scout product even launches.
3. **Scout beta program.** Give 50 college coaches in target states free access to the Scout Discovery tab for the first season. Real coaches seeing real chain-verified data — even with a small athlete pool — creates word of mouth in the coaching community faster than any ad.
4. **Right Now Mode integration.** When a SPORTS stream is live, it appears in the Right Now feed for every follower of the school's Club page. A school with 2,000 social followers has 2,000 potential live viewers before the first game. The existing social layer is the cold-start solution for sports.

### Challenge 5 — Minor Athlete Legal and Parental Consent

**The problem:** USDC earnings flowing to a 15-year-old athlete's wallet raises questions about minors entering contracts, parental consent for financial transactions, and COPPA compliance for athletes under 13.

**Winning strategy:**
1. **Family Multi-Sig as the legal architecture.** The 2-of-3 multi-sig (athlete + parent + Plajah backup) is specifically designed so no USDC moves without parental co-signature for athletes under 18. This is not just a product feature — it's the legal argument that Plajah operates within existing financial regulations for minors.
2. **13+ minimum age, hard-gated.** Athletes under 13 cannot create profiles or receive earnings. This is enforced at signup via age verification and Firestore rules.
3. **Platform as co-signatory.** Plajah's backup key in the multi-sig means the platform can intervene if a wallet is compromised, a parent disputes a transaction, or a court issues a hold. No competitor has thought about this.
4. **Legal partnership:** Engage a sports law firm with NIL expertise to publish a co-branded legal brief on HS athlete NIL compliance using Plajah's architecture. This simultaneously provides legal cover and generates press.

### Challenge 6 — AI Commentary Quality and Voice Rights

**The problem:** The Web Speech API default voice varies dramatically by device. On some iOS devices, the "Daniel" voice sounds robotic. On cheap Android phones, the best available voice may be stilted. If the AI commentary sounds bad, it undermines the premium feel of the scorebug overlay.

**Winning strategy:**
1. **ElevenLabs integration path is already built.** The `speakCommentary()` function in `sportscastService.ts` has an ElevenLabs stub commented out. The upgrade path is one API key swap. When the platform reaches 5,000 SPORTS streams/month, the economics justify ElevenLabs ($0.003/character × avg 80 chars/event × 10 events/stream = $0.024/stream = $120/month at 5K streams).
2. **Voice selection on broadcast start.** The producer panel can offer a "Commentary voice" selector: "Stadium (default, free)" vs. "Pro Announcer (ElevenLabs, included in Creator Pro)." This becomes a Pro tier differentiator.
3. **Commentary is opt-out, not opt-in.** The default is commentary ON. Parents watching at home love hearing a professional-sounding voice say their kid's name on a touchdown. The feature sells itself in the first game.

---

## 7. Winning Strategies — Full Platform Integration

### Strategy 1 — The High School Sports Trojan Horse

Sports is the entry point. Once a school's booster club is streaming on Plajah:
- Athletes create profiles → Plajah social graph grows
- Athletes share highlights → Creator economy grows
- Athletes earn PLAJ → Token economy grows
- Coaches and ADs see the platform → Institutional adoption
- Parents become Plajah users → Creator segment cross-pollination
- School launches a Booster Club DAO → Community funds flow through Plajah

One high school → 500+ new users. One city with 20 high schools → 10,000 users. One state with 400 high schools → 200,000 users.

### Strategy 2 — The Athlete-to-Artist Pipeline

Many high school athletes are also musicians (or are connected to musicians). The Plajah social graph already connects these identities. An athlete who earns USDC from highlight NFTs and discovers the platform through sports has a natural pathway to:
- Upload their music → artist radio
- Live stream practice sessions → SPORTS mode → fan engagement
- Use Sanctuary memberships for fan support across both athletic and musical careers

This cross-vertical user is worth 3–5× the LTV of a single-vertical user.

### Strategy 3 — The "Horizon" Features as Pre-Commitment

The On The Horizon hub is a waitlist-capture engine. Every athlete or parent who clicks "Notify Me" for Scout Discovery, Prediction Markets, or LOI NFT has signaled intent. Before a single Horizon feature is activated:
- Build a list of 10,000 pre-committed athletes → negotiate with college coaches
- Build a list of 500 pre-committed scouts → sell the discovery access a season before launch
- Build a list of 2,000 alumni who want to endorse athletes → activate Alumni Endorsement with a pre-filled roster on day one

The Horizon waitlist IS the go-to-market for each feature. Don't launch a feature until the waitlist justifies it. Each feature launches to a warm audience.

### Strategy 4 — State Championship Game as Launch Event

Target one state championship game in a state with active NIL (Texas, Florida, or Georgia recommended — largest HS sports markets). Negotiate with a school booster club or athletic director to broadcast the championship on Plajah. Offer:
- Free professional overlay (ScoreBugCanvas)
- Free AI commentary
- Professional post-production highlight reel
- School retains broadcast rights; Plajah gets platform credit

The result: A single high-profile game that looks like ESPN. Screenshot. Share. "This was broadcast on Plajah." That is the demo that launches the sports segment.

### Strategy 5 — Leverage the Existing Platform

Athletes are people with social lives outside of sports. Every athlete on Plajah is also a potential:
- Music listener (Artist Radio, Breakdown)
- Content creator (posts, video, live streams)
- Debate participant (Platform Pulse)
- Community member (Clubs, Right Now)

The sports features don't need a separate app, separate auth, or separate social graph. The athlete's friends from school are already potential Plajah users through the creator/social entry points. Sports is the acquisition vector; the full platform is the retention layer.

---

## 8. Pitch Library — Sports Vertical

### The Parent Pitch (30 seconds)
> "Your kid scored three touchdowns last Friday. That moment lives on Instagram Stories for 24 hours and then it's gone.
> On Plajah, it's live on a professional scorebug, called by an AI announcer in real time, and permanently on record — forever.
> And if they go on to play in college, that highlight is authenticated. No one can dispute it. It's on the blockchain.
> All you need is your phone and the Plajah app."

### The Athlete Pitch (45 seconds)
> "You just scored. That moment belongs to you.
> On Plajah, every highlight is logged to your career record. Coaches, scouts, and recruiters can see chain-verified stats — not a MaxPreps number that might be wrong.
> Your highlights can be minted as NFTs. Fans can buy them. You keep 70%. Your school keeps 20%.
> And when you sign your Letter of Intent? We mint a 1-of-3 commemorative token — one for you, one for your school, one for the college. The biggest moment of your career, on-chain forever.
> It's your career. Own it."

### The Scout Pitch (30 seconds)
> "You're reading MaxPreps rushing yards that were entered by a student manager on Monday morning.
> On Plajah, the producer logged that stat in real time — at the game, on a verified account, on-chain.
> You're not reading a number. You're reading a record. Every stat has a timestamp, a game ID, and a producer signature.
> $299 a year for regional access. The data is real."

### The Athletic Director Pitch (30 seconds)
> "Your parents are already filming the games on their phones and posting to Twitter and YouTube. We just give that footage a professional overlay, a real-time scorebug, and a permanent home.
> You don't change anything about how your program operates. The booster club streams the game. The athletes get a verified record. You get a professional-looking broadcast.
> Free for the first season. No school IT changes required."

### The Booster Club DAO Pitch (30 seconds)
> "Your booster club raises $30,000 a year for the athletic program. Do you know where every dollar goes?
> With Plajah, contributions go into a smart contract treasury. Every expenditure is proposed by a member, voted on by the club, and executed on-chain. It's public. It's transparent. No more questions at the end of the season.
> And supporters who hold PLAJ tokens have proportional voting weight. The community decides."

---

## 9. 10-Feature "On The Horizon" GTM Timeline

| Feature | ETA | Pre-Launch Strategy | Launch Trigger |
|---|---|---|---|
| Dynamic Rarity NFTs | Q3 2026 | Notify 5,000 athletes; tier system explained in athlete onboarding | 10,000 registered athlete profiles |
| Soulbound Career Token | Q3 2026 | Automatic issue at signup after activation; no opt-in needed | Legal review complete + 5,000 athlete wallets |
| Scout Discovery Network | Q3 2026 | 500 scout waitlist registrations; 25,000 athlete profiles | 200 scout pre-orders at $299 |
| Prediction Markets | Q4 2026 | PLAJ token pre-sale for market staking; 2,000 waitlist | PLAJ token liquidity > $500K market cap |
| Booster Club DAO | Q4 2026 | 50 school club waitlist; booster club pilot at 5 schools | 5 pilot DAOs + $100K AUM |
| Alumni Endorsement | Q1 2027 | Pro athlete outreach; alumni database from school partner network | 100 verified alumni profiles |
| Injury Insurance Pool | Q1 2027 | Legal review (state insurance regulations); staker waitlist | Legal clearance + $250K PLAJ in test pools |
| Family Multi-Sig | Q1 2027 | Default on for all minor athletes; parental consent workflow built | Family wallet legal review complete |
| Photo Licensing | Q2 2027 | EventPhotoPool photographers waitlist; media buyer outreach | 500 licensed photos + 10 media buyers |
| LOI NFT | Q2 2027 | LOI season (February–April) marketing push; 1,000 athlete waitlist | February 2027 LOI signing season |

---

## 10. Updated Revenue Model — Full Platform + Sports + Horizon

**Revised Scenario C (Year 3, Full Platform Activation):**

| Revenue stream | Monthly | Annual |
|---|---|---|
| Creator vertical (subscriptions, tips, sales) | $276,000 | $3.31M |
| Sports broadcast NIL + NFT (Year 3) | $375,000 | $4.5M |
| Scout discovery network (5,000 scouts) | $245,000 | $2.94M |
| Prediction market fees (5% PLAJ pools) | $50,000 | $600K |
| Booster DAO treasury fees (2% on $10M AUM) | $16,667 | $200K |
| Dynamic NFT rarity upgrades | $30,000 | $360K |
| Photo licensing (15% cut) | $15,000 | $180K |
| LOI NFT mints ($199 × 5,000/year) | $6,917 | $83K |
| Alumni endorsement PLAJ activity (indirect) | Accrual | — |
| B2B (Cora API, Debate white-label, Education) | $50,000 | $600K |
| **Total** | **~$1.065M/mo** | **~$12.78M ARR** |

---

## 11. Risk Registry — Sports + Blockchain

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| State NIL law changes (restrictions) | Medium | High | State-gating in service layer; federal framework support |
| Smart contract exploit on AthleteRegistry | Low | Very High | OpenZeppelin audited patterns; ReentrancyGuard; no admin key with unlimited mint |
| PLAJ token price collapse → prediction market failure | Medium | High | Markets denominated in PLAJ, not USD; no USD exposure for platform |
| School district blocks Plajah streaming | Medium | Medium | Parent-first positioning; FERPA compliance brief |
| ElevenLabs voice cost spike at scale | Low | Low | Web Speech API is the default; ElevenLabs is opt-in Pro feature |
| Scout discovery data accuracy challenge | Medium | High | Chain-verified stats only; dispute mechanism needed in v2 |
| Minor athlete consent failure | Low | Very High | Family Multi-Sig + age-gating + parental co-signature on all financial transactions |
| Competing platform builds blockchain stats | Low (18–24 months to match) | Medium | Head start on data accumulation; PLAJ token lock-in; network effects |
| Injury Insurance regulatory scrutiny (state insurance laws) | High | High | "Staking pool," not "insurance"; legal review before activation; PLANNED status held until cleared |

---

*Source systems: sports broadcast infrastructure (`sportscastService`, `ScoreBugCanvas`, `SportsProducerPanel`, `SportsStreamWrapper`, `usePlayerTracker`), `AthleteRegistry.sol`, `athleteChainService.ts`, `AthleteCareerCard.tsx`, `HorizonFeatureGate.tsx`, `OnTheHorizonHub.tsx`, `horizonFeaturesService.ts`, and five Solidity contracts (`SoulboundAthleteToken`, `PredictionMarket`, `AlumniEndorsement`, `BoosterClubDAO`, `InjuryInsurancePool`). Extracted from `PLAJAH_GTM_PLAN.md` §22 (June 6, 2026 analysis).*
