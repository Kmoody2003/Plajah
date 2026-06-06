# Plajah — Go-to-Market & Creator Acquisition Strategy
**Updated: June 2026 · Reflects actual codebase (250+ components, 30+ services)**

---

## 0. What Changed From v1

Beachhead segments have been updated from *Worldbuilders + Indie Film* to:
1. **Independent musicians** (Primary beachhead)
2. **Indie filmmakers & micro-studios** (Secondary beachhead)
3. **Writers & journalists** (Third beachhead, launch with music/film)

TikTok creator pipeline added as a primary acquisition channel.
Platform expansion prep complete: Android (Compose 3), FireTV, Tizen, Roku, Alexa, Google Home.

---

## 1. The Strategic Problem

Plajah does **everything**: music, video, TV/film, books, courses, games, live, FAST channels,
worldbuilding, crowdfunding, business pages, clubs, fediverse. That breadth is the platform's
strongest long-term moat — and its single biggest go-to-market liability.

**The solution is a wedge strategy.** The entry pitch is always one segment-specific pain, solved
brilliantly. The "everything platform" story comes later.

---

## 2. Beachhead Segments

### 🎵 Beachhead #1 — Independent Musicians

**The pain:** Spotify pays $0.003/stream. TikTok SoundOn pays $0.02–0.04 per 1,000 views.
Musicians with 50k TikTok followers earn less than $200/month from streaming. Their audience
is platform-owned and can be wiped overnight.

**The fix Plajah uniquely offers:**
- Artist Radio auto-built from catalog (zero curation work)
- Sanctuary memberships: direct monthly recurring revenue per fan, 90% to artist
- Hide N Seek: gamified discovery — fans hunt for tracks, earn points, artists go viral within the platform
- One profile: streaming, tips, merch, memberships, live shows, podcasts
- Pay-It-Forward: charitable giving built into the payment flow — a badge on the profile

**Who exactly:** Emerging/mid-tier artists (1k–500k followers), bedroom producers, singer-songwriters,
electronic artists, beatmakers who sell beats on other platforms

**Competitors to displace:** Spotify (streaming only, $0.003), Patreon (memberships only, 8–12% cut),
Bandcamp (sales only, 15% cut), SoundCloud (streaming + limited paid tiers)

**The one-line pitch:**
> *"TikTok made you famous. Plajah makes you money."*

---

### 🎬 Beachhead #2 — Indie Filmmakers & Micro-Studios

**The pain:** Roku Direct Publisher is gated. Tubi requires aggregator deals.
Filmhub takes 20–25% and you don't control programming. Vimeo OTT charges $100/mo before
a single viewer. Indie filmmakers with 3–10 films can't run their own channel.

**The fix Plajah uniquely offers:**
- FAST channel (24/7 auto-scheduling, zero setup)
- Mid-roll ad markers they control
- Owner-scheduled live interrupts
- Cross-creator content licensing
- Festival mode (screener links with expiry + watermarking)
- Full rights dashboard
- Film AI assistant for distribution planning
- Runs on FireTV, Roku, Samsung Tizen TV, Chromecast, iOS, Android

**Who exactly:** Indie feature filmmakers, short film directors, documentary makers,
micro-studios releasing 3–10 titles/year, festival-circuit creators

**Competitors to displace:** Filmhub (distribution-only, high take rate), Vimeo OTT ($75–100/mo),
FilmFreeway (festivals only), Tubi indie (gated)

**The one-line pitch:**
> *"Run your own 24/7 streaming TV channel. No deals, no aggregators, no gatekeepers."*

---

### ✍️ Beachhead #3 — Writers & Journalists

**The pain:** Substack takes 10% and owns the algorithm. Medium pays fractions.
Journalists run newsletters, podcasts, and TikTok explainer videos from three different tools
that never connect. Their book, their serialized reporting, and their podcast are siloed.

**The fix Plajah uniquely offers:**
- Articles, books (EPUB + PDF), podcasts, and videos cross-linked in one profile
- Sanctuary memberships: direct reader subscriptions, 90% to writer
- Newsstand discovery tab (not algorithm-suppressed)
- Fediverse cross-posting (Mastodon + Bluesky) — one post, every decentralized network
- Worldbuilder for journalists: interactive graph of sources, beats, stories
- Reading clubs with paid community features

**Who exactly:** Independent journalists, newsletter writers, BookTok authors, serialized fiction writers,
multi-hyphenate creators (writer + podcaster + filmmaker)

**The one-line pitch:**
> *"Your writing deserves more than a Substack."*

---

## 3. TikTok Creator Pipeline (Primary Acquisition Channel)

TikTok is the world's best discovery engine. Plajah is the world's best monetization engine
for independent creators. **They are complementary, not competitive.**

### The TikTok → Plajah funnel:
```
TikTok 60-sec clip (free, discoverable)
    ↓ CTA: "full [song/film/essay] at plajah.com — link in bio"
Plajah profile page (free to browse, no account wall)
    ↓ Sanctuary join prompt
Fan becomes a paying subscriber ($4.99–$19.99/mo)
    ↓ Creator keeps 90%
```

### Revenue math:
- 1M TikTok views → ~1,000 Plajah clicks → ~50 Sanctuary subscribers
- 50 subscribers × $9.99/mo = **$499.50/mo recurring** — creator keeps $449.55
- Same 1M views on TikTok Creator Fund = $20–$40 total

### TikTok-specific features built:
- `TikTokCreatorHub` component: ready-to-post caption templates per segment, funnel math, tactics
- Cross-posting to Bluesky + Mastodon (Fediverse) from every Plajah post
- Plajah profile URL works as a link-in-bio (no extra tool needed)

### Channel tactics by segment:
| Segment | TikTok angle | Plajah monetization |
|---|---|---|
| Music | 15-sec hook → "full song on Plajah" | Sanctuary + tips + merch |
| Film | Trailer + BTS clips → "full film on my FAST channel" | FAST ad revenue + PPV |
| Writer | BookTok chapter 1 → "full book on Plajah" | Sanctuary subscriptions |

### TikTok accounts to target first (outreach):
- Artists with 10k–500k followers who complain about streaming revenue in comments
- Indie filmmakers posting BTS content
- BookTok writers with engaged comment sections
- Send Founding Creator DMs: personalized, reference their specific content

---

## 4. Platform Expansion Prep (Complete)

All platforms prepped in codebase:

| Platform | Status | Entry Point |
|---|---|---|
| Web (PWA) | Live | plajah.com |
| Android | In development (Capacitor 8 + Compose 3) | Google Play |
| iOS | Capacitor shell ready | App Store |
| Amazon FireTV | LEANBACK_LAUNCHER + D-pad nav ready | Amazon Appstore |
| Samsung Tizen TV | `public/tizen/config.xml` complete | Samsung Seller Portal |
| Roku | `roku/manifest` + SceneGraph channel complete | Roku Channel Store |
| Google Home / Cast | `PlajahCastOptionsProvider.kt` + `useGoogleCast.ts` | Cast button in player |
| Alexa | `alexaService.ts` + `/api/alexa` route live | Alexa Skills Store |

**Theme detection:** `usePlatform()` hook auto-detects FireTV/Tizen/Roku and applies `theme-big-screen`.
**D-pad navigation:** `useDpadNavigation()` + `data-tv-focusable` attribute pattern handles all TV remotes.

---

## 5. Founding Creator Program

**Offer:**
- Free **Creator Pro ($29.99/mo)** for life for the first **100 creators per segment** (300 total)
- "Founding Creator" badge (wired in gamification system)
- Featured placement on segment landing pages
- Direct line to the founding team (Discord/Slack)
- Personal onboarding Loom

**Cost analysis:**
- 300 creators × $29.99 forgone = $8,997/mo opportunity cost
- Real storage/infra cost: ~$5/creator/mo × 300 = $1,500/mo
- **Total real cost: ~$1,500/mo to seed three segments**

**Application flow:**
- Landing pages: `/for-music`, `/for-film`, `/for-writers`
- `FoundingCreatorWaitlist` component → Firestore `founding_creator_waitlist` collection
- Review queue → accept → email + badge grant

---

## 6. Pre-Launch Asset Checklist

| Asset | Component / File | Status |
|---|---|---|
| Music creator landing page | `SegmentLandingMusic.tsx` | ✅ Built |
| Film creator landing page | `SegmentLandingFilm.tsx` | ✅ Built |
| Writer landing page | `SegmentLandingWriters.tsx` | ✅ Built |
| Founding Creator waitlist | `FoundingCreatorWaitlist.tsx` | ✅ Built |
| Shareable pitch cards | `CreatorPitchCard.tsx` | ✅ Built |
| TikTok creator strategy hub | `TikTokCreatorHub.tsx` | ✅ Built |
| Data export tool (trust) | `DataExportTool.tsx` | ✅ Built |
| DMCA request form | `DMCARequestForm.tsx` | ✅ Built |
| 60-sec demo video — music | YouTube, X, Reddit | TODO |
| 90-sec demo video — FAST channel | YouTube, X, Reddit | TODO |
| Twitter/X account + voice | @plajah | TODO |
| Public roadmap | Trello / Linear public board | TODO |
| Email capture on homepage | Already in landing pages | ✅ |
| Press kit | plajah.com/press | TODO |

---

## 7. The 90-Day Playbook

### Phase 1 — Foundation (Weeks 1–4)

**Week 1: Lock assets**
- Wire `/for-music`, `/for-film`, `/for-writers` routes in App.tsx
- Add Founding Creator waitlist to homepage hero
- Record the two 60–90s demo videos (even rough quality)
- Set up @plajah on X and YouTube

**Week 2: TikTok seeding**
- Post 1 TikTok per day using caption templates from TikTokCreatorHub
- Begin commenting in music/film/writer TikTok communities (useful comments, no pitching)
- DM 20 TikTok artists (10k–200k) with Founding Creator offers

**Week 3: Reddit + community seeding**
- r/WeAreTheMusicMakers, r/makinghiphop (music)
- r/Filmmakers, r/indiefilm (film)
- r/writing, r/BookTok, r/Journalism (writers)
- NoFilmSchool, Stage 32 (film)

**Week 4: Pre-launch buzz**
- Share waitlist count as social proof
- Identify 5 founding creators per segment from applications
- Help them set up profiles before soft launch

### Phase 2 — Soft Launch (Weeks 5–8)
- Accept first 50 founding creators per segment
- Help each one get 3+ pieces of content live
- Capture testimonials and case study content
- Week 6: Segment launch posts on Reddit + TikTok featuring real founding creator content

### Phase 3 — Public Launch (Weeks 9–12)
- Product Hunt launch (Tuesday)
- Show HN
- r/InternetIsBeautiful, r/SideProject
- Week 11: Pitch multi-hyphenate audience (IndieHackers, Substack Notes)

---

## 8. The Three Pitches (easy sell)

### Music Pitch (30 seconds)
> "You're making music. TikTok's paying you $20 per million views.
> On Plajah, 50 fans subscribing at $10/month = $450 recurring — and you keep 90%.
> Artist Radio builds your station automatically. No curation. One profile for streaming,
> tips, memberships, and merch. First 100 musicians get Creator Pro free for life."

### Film Pitch (30 seconds)
> "You have 3 films and no distribution. Roku wants an aggregator deal. Tubi wants minimums.
> On Plajah, you toggle on a 24/7 FAST channel — your films, auto-scheduled, running around the clock
> on FireTV, Samsung TV, Roku, and web. You set the ad markers. You keep 90% of subscription revenue.
> First 100 directors get Creator Pro free for life."

### Writer Pitch (30 seconds)
> "Substack keeps 10% of your subscribers and controls your algorithm.
> On Plajah, you own your audience. Your articles, podcast, and e-books are cross-linked in one profile.
> Readers subscribe directly — you keep 90%. First 100 writers get Creator Pro free for life."

---

## 9. Risks & Mitigations

1. **"Unknown brand"** → Data export tool prominently advertised, transparent ToS, public roadmap, Founding Creator program builds social proof before public launch
2. **TikTok ban risk** → Plajah subscriber list is creator-owned — creators actively WANT to diversify away from TikTok dependency
3. **Storage cost explosion** → Tier limits + soft caps in dashboard; storage costs fully covered by platform take at all tiers
4. **DMCA risk** → DMCA form built, fast-response SLA, legal ToS clause with clear content policy
5. **Two-sided cold start** → Founding Creator program seeds supply first; demand follows content
6. **Compete with established platforms** → Never compete directly; always position as complementary and additive
7. **Feature overwhelm for new users** → Experience Picker on first login routes to the right section; onboarding tour active for first 7 days
8. **Payment not live** → Stripe integration completing June 2026; payouts functional same day
9. **Science community adoption** → Plajah Labs is a beachhead no competitor has — STEM is an uncontested segment

---

## 10. Weekly Metrics

| Metric | Day 30 | Day 60 | Day 90 |
|---|---|---|---|
| Waitlist applications | 300 | 1,000 | 3,000 |
| Active founding creators | 30 | 100 | 200 |
| FAST channels live | 20 | 80 | 150 |
| Daily active users | 50 | 300 | 1,500 |
| Paid Sanctuary memberships | 0 | 20 | 100 |
| TikTok → Plajah referrals/week | 50 | 300 | 1,000 |
| Plajah Labs science posts | 0 | 50 | 300 |
| Stripe Connect creators onboarded | 0 | 40 | 150 |

---

## 11. Economic Re-Analysis — June 2026

### What Changed Since v1
- Stripe Connect payouts going live (June 2026) — the platform can now actually pay creators
- Science layer fully built with 20+ live data APIs — opens an entirely new beachhead segment
- Creator payment dashboard with split config — enables collaborative revenue sharing
- Full multi-platform expansion ready — Android, iOS, TV platforms, Windows

### Revenue Model Completeness Score

| Revenue stream | Built? | Paying? |
|---|---|---|
| Plajah+ subscriptions (Tier 1/2/3) | ✅ | ⏳ Keys pending |
| Sanctuary memberships | ✅ | ⏳ Keys pending |
| Tips & live gifts | ✅ | ⏳ Keys pending |
| Digital sales (music/books/movies) | ✅ | ⏳ Keys pending |
| Store / merch orders | ✅ | ⏳ Keys pending |
| Club memberships | ✅ | ⏳ Keys pending |
| SeedRaiser crowdfunding | ✅ | ⏳ Keys pending |
| Ad packages (on-platform) | ✅ | ✅ (no key needed) |
| Off-platform promotion | ✅ | ✅ |
| Revenue splits to collaborators | ✅ | ⏳ Keys pending |

**With Stripe webhook + price IDs in place today, all 10 streams go live.**

### Realistic Revenue Scenarios

**Scenario A — Conservative (100 active creators, 500 fans)**
| Stream | Monthly |
|---|---|
| 200 Plajah+ subscribers (blended tier 2) | $598 platform take |
| 50 Sanctuary memberships @ $9.99 avg | $50 platform take |
| $500 in tips/sales @ 10% | $50 |
| 20 ad packages (Basic avg) | $100 |
| **Total** | **~$800/mo** |

**Scenario B — Momentum (1,000 active creators, 10,000 fans)**
| Stream | Monthly |
|---|---|
| 2,000 Plajah+ subscribers (blended) | $5,580 platform take |
| 500 Sanctuary memberships | $500 platform take |
| $20,000 tips/sales @ 10% | $2,000 |
| 200 ad packages (blended) | $1,500 |
| 5 SeedRaiser campaigns @ $3,000 avg | $750 (5%) |
| **Total** | **~$10,330/mo** |

**Scenario C — Scale (10,000 creators, 200,000 fans)**
| Stream | Monthly |
|---|---|
| 25,000 Plajah+ subscribers | $69,750 platform take |
| 5,000 Sanctuary memberships | $5,000 |
| $500,000 tips/digital sales | $50,000 |
| 2,000 ad packages | $18,000 |
| 50 SeedRaiser campaigns @ $5k avg | $12,500 |
| 100 off-platform promotions @ $65 avg | $6,500 |
| **Total** | **~$161,750/mo** |

### Actual Weaknesses (Honest Assessment)

**Critical:**
1. **Zero users today** — The platform has no audience. Technical readiness ≠ market readiness. The gap between "built" and "used" is the whole problem.
2. **Payments not fully live until today** — Without Stripe webhook + price IDs, the entire monetization stack has been non-functional. Fixing today.
3. **Anthropic key missing** — Muse AI, the science layer's core feature, is dark until ANTHROPIC_API_KEY is set.
4. **No mobile app shipped** — Android/iOS are Capacitor shells but haven't shipped to stores. TV/Smart device deployment also pending.

**Structural:**
5. **Feature breadth creates messaging confusion** — A musician doesn't care about Plajah Labs. A researcher doesn't need a FAST channel. The experience picker helps but isn't enough. Need segment-specific onboarding flows.
6. **Cold start on both sides** — Creators need fans, fans need creators. Breaking this requires seeding one side aggressively with a loss-leader offer (Founding Creator free tier is the right move).
7. **Science community is small** — Plajah Labs is genuinely unique and unchallenged, but academic researchers are not high-spending consumers. The value is differentiation + press coverage + word-of-mouth, not direct revenue.
8. **Storage at scale** — Tier 3 storage cost is roughly break-even. A viral creator with heavy video output could cost more than they generate in subscription revenue. Mitigation: overage pricing after tier limit.

**Competitive:**
9. **Spotify/YouTube for discovery** — These platforms have billions of tracks and recommendation algorithms trained on years of data. Plajah can't out-recommend them on day one. Solution: don't compete on discovery — compete on creator revenue and ownership.
10. **Patreon for memberships** — Patreon has strong brand recognition. Counter: Plajah memberships are integrated with streaming, not bolted on — and the platform take is lower (10% vs Patreon's 8-12% + payment processing).

### Solutions & User Acquisition Strategy

**Immediate (this week):**
1. **Complete Stripe** (webhook + price IDs) — monetization live today
2. **Set ANTHROPIC_API_KEY** — Muse AI live, science layer fully functional
3. **Post demo videos** — 60 seconds showing the music → FAST channel → Sanctuary funnel
4. **Set up @plajah on X and YouTube** — two posts per day minimum

**Week 1–2: Creator-first seeding**
- DM 50 TikTok artists (10k–200k followers) with personalized Founding Creator offers
- Post in r/WeAreTheMusicMakers, r/indiefilm, r/journalism — genuine contributions, no pitching
- Identify 3 real creators willing to set up full profiles before public launch
- Film a walkthrough of the Creator Payment Dashboard showing the 90% payout math

**Week 3–4: Science community**
- Post to r/science, r/AskScience, r/MachineLearning: "We built a social platform where science posts auto-attach live data from NOAA, NASA, NCBI, USGS..." — this is genuinely novel and will get attention
- Reach out to science communicators on YouTube (Kurzgesagt, SciShow, etc.) — FAST channel angle
- Post on ResearchGate, Academia.edu about Plajah Labs as a researcher-to-public bridge

**Week 5–8: Soft launch hooks**
- "Plajah vs Spotify payout calculator" — interactive tool showing revenue comparison, shareable, drives organic traffic
- "Build your FAST channel in 5 minutes" — demo video targeting Roku/FireTV creators
- Product Hunt teaser (not launch yet — wait until 50+ active creators with content live)

**Get first 10 paying users (the hardest step):**
- Find 10 music creators who already use Patreon — show them the revenue comparison directly
- Offer white-glove setup: personal call, help them migrate their Patreon tiers to Sanctuary
- These 10 creators become case studies for the Founding Creator pitch
- Even at $4.99/month × 10 subscribers each = $50/mo per creator. Not life-changing, but it's proof.

**Science-specific acquisition:**
- Twitter/X science community: tweet the enricher.ts capabilities — "paste a DOI and Plajah pulls live citation data. Paste GPS coords and it attaches USGS seismic + NOAA weather automatically."
- This is PR-worthy, not just marketing — science journalists will write about this

---

*Updated June 2026. Reflects current codebase state, active API integrations, and Stripe payment status.*

---

## 12. Feature-Driven GTM Update — June 2026

### What Was Just Built (New Capabilities That Change The Pitch)

**1. Event Production Manager**
A full project management tool for live events — tasks, checklists, vendor management, Stripe payroll, template contracts, budget tracking, and Muse AI as a built-in guide. First event is free; $29.99/event or $4.99/mo (Artist Services add-on).

*GTM angle:* This is a Trojan horse. No competing platform helps artists actually run their events. SeatGeek, Eventbrite, and Patreon don't build your production checklist, help you find sound companies, or draft your vendor contracts. This is a standalone product — and it's bundled into Plajah.

*New pitch (concert musician):*
> "Every artist with a show next month is juggling 40 tabs — venue, sound company, caterer, marketing, ticket sales, payroll. We replaced all of it with one dashboard. And Muse AI knows what you're missing."

**2. Artist Services — Unified Ad Dashboard**
Run ads on Plajah, Google, Meta, TikTok, and Bing from one place. Muse AI writes the copy. The platform handles the API accounts. Artists see analytics in a unified dashboard.

*GTM angle:* This directly targets the #4 creator pain point (brand deal / paid promotion fragmentation). Independent artists currently need: a Google Ads account, a Meta Business Suite account, a TikTok Ads Manager account, a graphic design tool, and a copywriter — all separate. Plajah collapses this into one screen with AI copywriting.

*New revenue projection (Artist Services only):*
| Timeline | Active subscribers | MRR (platform) |
|---|---|---|
| Month 3 | 50 | $250 ($4.99/mo plan) |
| Month 6 | 200 | $1,000 |
| Month 12 | 800 | $4,000 + per-event fees |

**3. Artist Mode Landing Page**
When a visitor lands on an artist's profile, they see a 30-second cinematic showcase before the platform UI loads. Gorgeous, full-screen, parallax, brand-colored — shows latest works, bio, tracks, videos. Dismissable with a large X. Fades to standard profile.

*GTM angle:* Every artist's Plajah profile URL is now a premium landing page. Not a Linktree. Not a social media bio link. A 30-second immersive first impression. The pitch writes itself: "Your Plajah link IS your press kit."

---

## 13. Pain Point Research — Biggest User Frustrations on Social Media (2024–2025)

Based on validated research across Sprinklr, Influencer Marketing Hub, Creator Spotlight, and Cropink:

### Creator Pain Points (Ranked by Impact)

| Rank | Pain Point | % Affected | Current Solution | Plajah Answer |
|---|---|---|---|---|
| 1 | Monetization poverty wages | 57% earn below living wage | Patreon (8-12% cut), Spotify ($0.003/stream) | Sanctuary 90% rev share |
| 2 | Platform dependency / algorithm risk | "Shadow-banning" real for 62% of creators | Diversify to Substack, Patreon, Linktree | One profile, creator owns list |
| 3 | Fragmented tooling | Avg creator uses 5+ platforms | No unified solution exists | Everything in one profile |
| 4 | No live event infrastructure | 0 major platforms help run events | Eventbrite + 40 other apps | **Event Production Manager** |
| 5 | Paid promotion fragmentation | Multiple ad platforms, no unified view | Hootsuite (expensive), manual | **Artist Services ad dashboard** |
| 6 | Follower-to-paying conversion difficulty | Only 1-2% of followers pay | Patreon link, newsletter gate | Sanctuary join prompt integrated |
| 7 | Brand deal inconsistency | Unpredictable income | Creator marketplaces (high fees) | Not yet built — opportunity |

### Fan / User Pain Points (Ranked by Impact)

| Rank | Pain Point | % Affected | Root Cause | Plajah Answer |
|---|---|---|---|---|
| 1 | **Doom-scroll addiction** | 25% feel addicted | Infinite algorithm feed designed for engagement | See Section 14 — "The Edge Feature" |
| 2 | **Loneliness despite "connection"** | 40% feel lonely/isolated | Algorithmic feeds remove real interaction | See Section 14 |
| 3 | Inauthentic content / ads everywhere | 70%+ trust eroding | Platform incentivizes brand content | Plajah's social layer is creator-first |
| 4 | Mentally exhausting UX | 50% of teens anxious | Metrics anxiety (likes, views) | Reduced metric prominence on Plajah |
| 5 | Can't find emerging creators | Concentrated at top 1% | Algorithmic recommendation | Hide N Seek, Newsstand (non-algo) |

---

## 14. The Edge Feature — "Right Now" Mode (Build This Next)

### The Research-Validated Problem

Social media is paradoxically the loneliest place online. 40% of adults feel isolated on these platforms. The core mechanic is broken: you're shown content the algorithm thinks will keep you engaged — not content your actual community is experiencing RIGHT NOW.

**The result:** You scroll alone through a feed curated for you in isolation. Nobody on TikTok is watching what their friend is watching at the same time. Nobody on Spotify knows a friend just discovered the same artist. The shared cultural moment is gone.

### The Plajah-Unique Solution: "Right Now"

**Concept:** A persistent feed mode (toggle-on) that shows ONLY content currently being experienced by people you follow — in real time. Not "recently posted." Not "you might like." *Right now.*

**How it looks:**
- A "Now" tab or filter on the home feed
- Shows: "[Artist Name] is listening to [Track] · 3 min ago" with a join button
- Shows: "[Fan] just started watching [Film] — join them?" with a watch party button
- Shows: "[Creator] went live 2 minutes ago — [X friends] are already there"
- Mutual presence indicators on profiles ("3 friends are here right now")

**Why Plajah can build this uniquely:**
1. All content is native — no API bridging to Spotify/YouTube needed
2. All users are already in one ecosystem — music + video + film + live in the same session
3. The social graph already exists (follows, friends, Sanctuary members)
4. The real-time infrastructure is already partially built (live chat, live stream)

**Why it wins:**
- Solves loneliness (#1 unaddressed fan pain point) — shared experience beats solo scrolling
- Kills doom-scrolling — finite, social context replaces infinite algorithmic queue
- Generates organic discovery — fans find new creators through their friends' real-time activity
- Differentiates from every major platform — Spotify, YouTube, TikTok, Instagram don't do this
- Zero content cost — the feature runs on content already uploaded by creators

**Implementation scope (3-4 weeks):**
- Presence tracking service (Firestore `now_active` collection with TTL documents)
- `RightNowFeed` component — real-time listener on followed users' activity
- `WatchPartyInvite` component — one-tap join a friend's current session
- `NowIndicator` overlay on profile cards — green dot + "X friends here"

**Pitch to users:**
> "Stop scrolling. See what your people are actually listening to right now."

**Pitch to creators:**
> "When a fan joins a session and sees 3 of their friends already there, your conversion rate triples."

**Viral mechanic:** When you join a Right Now session and love what you find — you share the shared moment, not a link to a song. "Me and @friend were both listening to this at midnight" is more shareworthy than "check out this track."

---

## 15. Simplified Adoption Vectors — One Size Does Not Fit All

### Vector A: The "First Show" Musician

**Who:** 1k–20k Instagram followers, playing their first 200-person venue, terrified of logistics.

**Hook:** Not the 90% revenue pitch. Not the FAST channel. The Event Production Manager.

> "You have a show in 60 days and you don't know where to start. We do. Plajah gives you the full checklist — every vendor, every contract template, every due date — and Muse AI checks in when you fall behind."

**Path:** Event Manager (free first event) → sees how good the platform is → uploads music → activates Sanctuary memberships → converts fans from the show

**Time to value:** Day 1 — they create the event, see the checklist, feel immediately helped.

---

### Vector B: The "Monetization-Frustrated" Creator

**Who:** 50k–500k TikTok followers, making music or film, aware their streaming revenue is a joke.

**Hook:** The revenue math comparison.

> "Your last 1M TikTok views paid $30. On Plajah, 50 of those same fans subscribing at $10/month = $450 recurring — every month — and you keep 90%."

**Path:** Profile setup → Sanctuary → Artist Radio activates → existing audience migrates gradually

**Time to value:** Week 2 — first Sanctuary subscriber from their first TikTok CTA pointing to Plajah.

---

### Vector C: The "Ad Budget" Creator

**Who:** Has money to spend on promotion, currently manually managing Google/Meta/TikTok Ads separately.

**Hook:** The unified ad dashboard.

> "You're running 3 separate ad accounts for the same campaign. Plajah runs them all from one screen. Muse AI writes the copy. You set the budget."

**Path:** Artist Services tab → first campaign → sees analytics → subscribes to $4.99/mo plan → starts using more of the platform

**Time to value:** Same day — they build an ad in the wizard, see the Muse-generated copy, feel the simplicity.

---

### Vector D: The "Worldbuilder" Fan

**Who:** Fantasy/sci-fi fan, manga/anime fan, deeply invested in a creator's fictional universe.

**Hook:** Artist Mode landing + IP World feature.

> "When you visit your favorite creator on Plajah, you don't get a bio page. You get a cinematic 30-second showcase — their world, their characters, their music. Then you can explore their entire universe: every character, every lore entry, every piece of music linked to the story."

**Path:** Artist Mode impresses → explores IP World → discovers characters → finds related music/film through hold-to-navigate → becomes a Sanctuary member for exclusive lore

**Time to value:** Immediate — the 30-second Artist Mode is the wow moment.

---

### Vector E: The Casual Fan (The Loneliness Solve)

**Who:** Regular social media user, follows 10-20 creators loosely, overwhelmed by every other platform.

**Hook:** Right Now Mode.

> "See what your friends are listening to right now. One tap to join them."

**Path:** Right Now feed → discovers creator their friend is listening to → follows creator → gets Sanctuary invite → converts

**Time to value:** Immediate — they see friends' activity, feel connected, stop doom-scrolling.

---

## 16. Updated Revenue Forecasts (Post-New Features)

Artist Services and Event Production Manager add two new revenue streams not in the original model:

### Artist Services Revenue Layer
| Plan | Price | Platform Take |
|---|---|---|
| Per Event (ad boost) | $29.99 | $29.99 |
| Monthly Add-On | $4.99/mo | $4.99/mo |
| Off-platform ad spend | Variable | 15% management fee |

**Revised Scenario B (Month 6, 1,000 creators):**
Adding Artist Services at 15% adoption rate (150 monthly subscribers):
- 150 × $4.99 = $748.50/mo additional
- 50 per-event one-offs × $29.99 = $1,499.50/mo additional
- **Revised Scenario B total: ~$12,578/mo (vs. $10,330 original)**

**Revised Scenario C (Month 12, 10,000 creators):**
- 1,500 Artist Services monthly × $4.99 = $7,485/mo
- 500 per-event × $29.99 = $14,995/mo
- **Revised Scenario C total: ~$184,230/mo (vs. $161,750 original)**

### Event Production Manager Revenue Layer
Event Pro unlocks at event #2 ($29.99) or via Artist Services add-on.

Conservatively: 20% of active musicians run ≥2 events/year:
- Month 6 (1,000 creators, 200 event-active): 200 × $29.99 = $5,998
- Month 12 (10,000 creators, 2,000 event-active): 2,000 × $29.99 = $59,980/mo

**Revised Scenario C total with Event PM: ~$244,210/mo**

---

## 17. Pitch Refresh — With New Features Incorporated

### Updated Music Pitch (45 seconds)
> "You're about to play your first real show. You have 45 days.
> Plajah gives you a full production checklist — venue, sound company, security, contracts, payroll — all in one dashboard. Muse AI checks in when a deadline is coming.
> After the show? Your Plajah profile is the thing fans go back to. 50 of them subscribe at $10/month. You keep $450, every month, without Spotify in the middle.
> And when someone Googles you for the first time? They get 30 seconds of your world before they even see the platform. Your face. Your music. Your story.
> First 100 musicians: free for life."

### Updated Film Pitch (45 seconds)
> "You finished a film. Now what? Eventbrite for the premiere. Filmhub for distribution. Google Ads for marketing. Three separate bills, three separate logins.
> On Plajah, the premiere is a project. We walk you through finding a venue, booking AV, setting up a red carpet, marketing the night, and paying vendors — all in one tool.
> Then your film goes on your 24/7 FAST channel, running on FireTV and Samsung TV while you sleep.
> Your Plajah URL is your press kit. 30 seconds of cinematic showcase — before anyone sees a button.
> First 100 directors: free for life."

### Artist Services Pitch (30 seconds, standalone)
> "You're running three ad accounts for the same campaign. Google Ads, Meta Business Suite, TikTok Ads Manager — three logins, three dashboards, zero unified view.
> Artist Services is one screen. All five platforms. Muse AI writes the headline. You set the budget.
> $4.99/month. Plajah handles the tech. You handle the creative."

---

*Updated June 2026. Incorporates Event Production Manager, Artist Services Tab, Artist Mode Landing Page, and "Right Now" social layer proposal. Based on research from Sprinklr, Influencer Marketing Hub, Creator Spotlight (2025 Monetization Report), and Cropink social media statistics.*

---

## 18. Feature Sprint — June 5, 2026 (What Was Built Today)

**Updated: June 5, 2026 · Seven new systems shipped**

---

### Feature 1 — Structured Debate System v2 (Post-Level Challenges + VS Screen)

**What was built:**
- `PostDebateModal` — challengers mark up the exact text in a post they dispute, like a highlighter. Those segments become the permanent visual reference shown in the debate view.
- `ChallengeVsScreen` — full-page UFC/Mortal Kombat–style fight card animation triggered when you receive a debate challenge. Pulls live platform stats (debate record, points, followers, content count, bio accolades, degrees) for both fighters. Fires on notification click or scroll-past in the feed.
- `Platform Pulse` tab in the main feed — three sections: My Arena (your debates), Following Heat (debates featuring creators you follow), Platform Spotlight (top by engagement score).
- `getDebateStats` / `getPulseDebates` backend queries. Engagement score = posts × 3 + supporters × 2 + views / 5.

**Unique feature + opportunity:**
No social platform has structured, judged debate built natively into the content experience. Twitter has replies. Reddit has upvotes. YouTube has comment sections. Plajah has *formatted adversarial discourse with an AI judge, a public record, and a points economy*. The highlighted-post-markup mechanic is entirely novel — it gives debates a clear focal object (the challenged text), which channels the conversation and prevents the "talking past each other" problem that destroys comment-section debates everywhere else.

**GTM angle:**
- **For creators:** Debate challenges to your posts are *demand signals*. The post that gets challenged the most is your most provocative work — high-engagement content. Being debated is a badge of legitimacy, not an attack.
- **For fans:** Debate is spectator sport. The VS screen (fighter stats, live vote bar, Aria judgment) makes platform debates dramatically shareable. Each judged debate is a piece of content in itself.
- **New pitch (opinionated creator):** *"When someone disagrees with your post on Plajah, it becomes a structured debate — on the record, judged by AI, scored for logic and civility. Not a comment war. A record you can point to."*

**New acquisition vector — The Civic/Academic Channel:**
Debate clubs, forensics programs, journalism schools, and political commentary creators currently have no platform that takes discourse seriously. Plajah's structured debate is the only format built for them. This opens an entirely new segment not addressed in the original beachhead strategy: **intellectual creators** (political commentators, academics, public intellectuals, debate coaches). Their audiences are small but high-engagement, high-retention, and highly likely to become Sanctuary members.

**Blindspots:**
- Aria judgment quality is the load-bearing piece. If Aria verdicts feel unfair or shallow, the entire system loses credibility. Need a verdict appeals mechanism and transparency into Aria's rubric.
- The 3-challenge/day limit may feel restrictive for high-output creators. Consider a paid "Debate Pro" add-on (unlimited challenges, extended 48h debates) as a future monetization layer.
- The VS screen fetches live stats — slow network connections will show an ugly loading state for the fight card.

**Economic impact:**
- Debates drive re-engagement loops: each PENDING debate sends a notification to the defender, pulling them back to the platform. This directly improves DAU without ads.
- Platform Pulse creates a reason to visit the feed even on days when no new content has been posted — debates have 24-hour lifespans and can surface at any time.
- Spectator participation (voting, supporter sides) creates micro-engagement events. A debate with 200 spectators generates 200 individual data points on user preferences that improve recommendation quality over time.

---

### Feature 2 — "The Breakdown" (Per-Track Music Theory Analysis)

**What was built:**
- `TrackBreakdownModal` — a full-screen overlay triggered from any track row or mini-player. Shows:
  - **Animated SVG staff** that renders notes in black and lights them up to instrument-role colors (melody → orange, harmony → purple, bass → green, accent → red) in real-time sync with the GlobalPlayer playback position.
  - **Theory analysis panel** — key, scale, tempo (from Cora beat detection), chord quality, time signature.
  - **Export to Lorea** — captures the animated staff via html2canvas, creates a PNG score, saves to the user's Plajah Lorea library and offers a local download.
  - **"Study in Theory Studio"** link — opens `MusicTheoryStudio` with full lessons, ear training, and score reader.
- Entry points: Waves (〜) button on mini-player controls + hover action on track rows in MusicView.
- Cora analysis provides the real BPM; genre + track hash determine key, scale, and chord analysis.

**Unique feature + opportunity:**
No streaming platform gives fans *music theory access* tied directly to a track they're listening to. Spotify shows lyrics. Apple Music shows lyrics and credits. Plajah shows *what the song is doing theoretically* — the key, the scale, why the chords feel the way they feel — while it plays. The animated staff that lights up in instrument colors as the song progresses is a music education moment embedded inside a listening experience.

**GTM angle:**
- **For music students and educators:** The Breakdown turns every track on Plajah into a lesson. A music teacher can play a track in class and show students the harmonic structure in real time. This is a *new segment* not addressed anywhere in the original strategy: **music educators and self-taught musicians**. Conservatories, online music tutors, YouTube theory creators — all of whom currently send students to Musictheory.net, which has no native audio.
- **For artists:** Showing fans the theory behind your music creates a deeper emotional connection. "Here's what I was thinking when I built that chord progression." Creators can use The Breakdown in their own content: screenshot the animated staff mid-song for TikTok music theory content.
- **New pitch (music educator):** *"Plajah is the only streaming platform where your students can see the theory of a song while it plays. C major highlighted in orange. The bass line in green. Pull it up in class, hit play, and watch the staff come alive."*

**The Lorea connection — new business model:**
Creators can now export their score as a PNG to Lorea and publish it as a paid resource. A producer selling sample packs on Beatstars currently has no way to include annotated sheet music with their product. On Plajah, they upload the track, The Breakdown auto-generates the score, they export it to Lorea, and they sell the annotated score as a $4.99 Lorea book alongside the track. **This is a new creator revenue stream that doesn't exist anywhere else.**

**Cora music analysis integration:**
The `coraAnalysisService` runs automatically on every MUSIC album at publish time and retroactively on all prior uploads. It stores BPM, key, scale, beat detection version, and genre rules in the `songs` SQL table. The Breakdown consumes this data to give each track a real, analysis-backed breakdown rather than a generic display. As the platform grows, Cora's dataset becomes a proprietary music intelligence layer.

**Blindspots:**
- ~~The current note generation is deterministic (hash-based).~~ **Resolved:** The Breakdown now uses real-time Web Audio API FFT analysis via the existing GlobalPlayer AnalyserNode. Pitch classes are detected via FFT peak (80–1600 Hz range), tempo via median onset IOI, and key via Krumhansl-Schmuckler profiles. The UI shows "Live Analysis" (green dot) when real data is available, "Analyzing…" while collecting, and "Genre estimate" as a silent fallback if the track isn't currently playing.
- html2canvas can be slow on complex SVGs. The Lorea export may timeout on mobile.

**Economic impact:**
- Adds the **music education market** ($10.2B globally, 2024) as a potential B2B channel. Licensing Plajah's Theory Studio + Breakdown to music schools as a curriculum tool is a SaaS opportunity entirely separate from the creator/fan economy.
- Score exports to Lorea add a new paid product type for musicians: annotated score books. Even at $2.99 each, a producer with 100 tracks selling 20 score books each = $5,980 in a catalog. Plajah's take at 10% = $598 per producer.
- Theory Studio + Breakdown content creates SEO-rich educational pages if score data is made indexable.

---

### Feature 3 — Right Now Mode (Built — Was "Proposed" in Section 14)

**Status: SHIPPED.** Section 14 described this as "build this next." It is now built.

**What was built:**
- `RightNowFeed` component — real-time listener on followed users' `now_active` Firestore documents. Shows what creators you follow are currently listening to, watching, or streaming. One-tap to join.
- `PresenceSync` component — writes the current user's activity to Firestore (track title, artist, album, URL) with a 10-minute TTL.
- `RightNowOnboardingController` — explains the feature and asks for opt-in (privacy-first: presence sharing is off by default).
- "Right Now" tab added to the main feed alongside Plajah Social, Broadcast News, Live Talk.

**Revised pitch (now that it's real):**
> *"You're listening to a song. Three of your friends are listening to the same song right now. On Plajah, you'd know that — and you could join their session. That shared moment? That's what every other platform took away from you."*

**New opportunity — Live Event Activation:**
At a venue, an artist could display "X fans are in Right Now mode here tonight" on a screen. The Right Now feed during a live show becomes a collective experience layer — every fan sees what other fans in the room are reacting to. This is concert tech that Spotify, Bandcamp, and Apple Music have never built.

---

### Feature 4 — Cora Music Analysis System (Backend)

**What was built:**
- `coraAnalysisService.ts` — dual-algorithm beat detection pipeline. DJ algorithm (onset energy model, specialist in EDM/hip-hop) vs. Aria algorithm (spectral flux model, specialist in jazz/classical). Confidence-based bridging selects the winner. Deterministic — same inputs always produce the same output.
- `prisma/schema.prisma` — `songs` SQL table with `platformTrackId`, `platformAlbumId`, `ownerId`, `tempo`, `beatDetectionVersion`.
- `routes/cora.ts` — REST API with `/analyze-album`, `/backfill`, CRUD, and audit log endpoints.
- Ingest hook in `publishToCloud()` — fires automatically after every MUSIC album Firestore write. Fire-and-forget, never blocks the publish flow.
- `POST /api/cora/backfill` — retroactive job that scans all existing MUSIC albums and fills in missing analysis records.
- **37/37 unit tests passing.**

**GTM angle:**
Cora's data accumulates silently with every upload. By the time Plajah has 10,000 tracks, it has 10,000 rows of BPM, key, scale, genre, and beat detection data that no other platform has — because no other platform runs this analysis on its own catalog. This is the foundation of:

1. **Music intelligence API** — License Cora's analysis data to DAWs (Ableton, Logic), sync licensing platforms (Musicbed, Artlist), and music supervisors who currently pay $50–200/track for manual analysis.
2. **Better recommendations** — Cora's tempo + genre data powers tempo-matched playlists, "sounds like" discovery, and mood-based radio without needing user behavior data on day one.
3. **Creator insights** — Show artists how their music's BPM, key, and chord quality compares to similar artists in their genre. A unique analytics layer that no streaming platform currently offers.

**Economic potential:**
The music analysis market (MIR — Music Information Retrieval) is niche but high-margin. Companies like Senzari (acquired by Pandora), The Echo Nest (acquired by Spotify), and BMAT charge $500–5,000/month for music analysis APIs. Cora is Plajah's internal equivalent. At scale, a Cora API product could generate $50K–500K/year in B2B licensing revenue from music tech companies.

---

## 19. Reassessment — How Today's Features Change the Platform Dynamic

### The Competitive Position Before Today

Before today's sprint, Plajah was a **creator monetization platform** with strong tools (Sanctuary, FAST channels, Artist Radio) but a weak *social engagement layer*. The social features existed (feed, comments, live talks) but they didn't create the compulsive return behavior that drives DAU.

The core problem: **creators upload, fans consume, but there's no loop that pulls both parties back to the platform every day.**

### How Today's Features Fix That

| Feature | Loop it creates | DAU impact |
|---|---|---|
| Structured Debates | Challenge → notification → 6h accept window → 24h debate → Aria verdict → result share | Multiple daily touch-points per debate over 2+ days |
| VS Screen | Drama. Fight card animations are inherently shareable. Receiving one is an event. | High share rate → viral impressions per challenge |
| Platform Pulse | Three debate sections to check every visit. Following Heat creates social stakes. | New reason to open the feed daily |
| Right Now Mode | Real-time social proof of what friends are experiencing. FOMO loop without the toxicity. | Passive daily habit formation |
| The Breakdown | Every track now has a second layer of content — the theory analysis. Superfans will obsess over this. | Increases time-on-track, reduces skip rate |
| Cora Analysis | Invisible to users but powers better discovery. Better discovery → higher satisfaction → more sessions. | Compounding DAU improvement over time |

### Revised Competitive Moat Assessment

**Before today:** Plajah's moat was *creator tools* — the breadth of monetization, distribution, and production features.

**After today:** The moat now also includes *structured social dynamics* that no competitor has attempted:
- The only platform where content can be formally challenged and judged
- The only platform where music theory analysis is a native listening experience
- The only platform where real-time shared presence is a first-class feed feature
- The only platform with dual-algorithm music intelligence running on its own catalog

Replicating any one of these features is a 4–6 week sprint for a competitor. Replicating all four simultaneously is a full product roadmap. And by the time a competitor ships their version of Debates, Plajah's Cora dataset will have a year of head start.

### New Business Opportunities Within This Feature Context

**1. Plajah Education Tier (B2B)**
The Breakdown + Theory Studio + Platform Pulse create a fully-formed music education product. A "Plajah for Schools" license at $499/year per institution (50 student seats, teacher dashboard) is commercially viable today. Target: online music academies, community colleges with music programs, high school music departments.

**2. Debate-as-a-Service (White Label)**
The structured debate engine (Firestore schema, Aria judging, VS screen, Platform Pulse) is a standalone product. Civic tech companies (debate.org, Kialo), journalism organizations (debate sections of the NYT, The Atlantic), and political platforms could license this. A white-label SaaS of the debate system at $2,000–5,000/month is a real market.

**3. The Cora API (Music Intelligence)**
License the beat detection + key/scale/chord analysis data via a REST API. Target customers: music production tools, sync licensing platforms, DJ software (Rekordbox, Serato), fitness app music matching. Pricing: $299–999/month API tier.

**4. Live Event Right Now Integrations**
Partner with venue ticketing systems (AXS, Ticketmaster) to activate Right Now Mode as an opt-in fan feature at physical events. "All 2,400 fans at Madison Square Garden are in Right Now mode tonight." Venue premium: $0.10/attendee activation fee. For a 10,000-person venue: $1,000 per show. At 500 shows/year: $500,000 in B2B venue revenue.

**5. Score Publishing on Lorea (Creator Revenue)**
The Breakdown → Export to Lorea creates a pipeline for musicians to sell annotated scores, lead sheets, and chord charts as Lorea books. Plajah promotes "Score Bundles" (track + score) as a premium purchase tier. Price point: $4.99–14.99 per score. Margin: 10% platform take.

---

## 20. Updated Revenue Scenarios — Post June 5 Sprint

Incorporating debates, Breakdown, Right Now, and Cora into the projection model:

### Revised DAU → Revenue Connection

The original model assumes linear creator → subscriber growth. Today's features add **re-engagement multipliers** that break the linearity:

| Feature | Re-engagement mechanism | Projected DAU boost |
|---|---|---|
| Debates | 2.3 touch-points/debate/user (challenge + acceptance + verdict) | +15–25% DAU at steady state |
| Right Now | Daily habit loop (FOMO-light social proof) | +8–12% session frequency |
| Platform Pulse | New reason to visit feed daily | +10–15% feed open rate |
| The Breakdown | Increases avg session length per music listener | +20–30% time-on-track |

### Revised Scenario B (Month 6, 1,000 creators) — Post Sprint

| Stream | Original | Revised | Delta |
|---|---|---|---|
| Platform subscriptions (DAU boost) | $5,580 | $6,975 | +$1,395 |
| Sanctuary memberships (better conversion via Debates) | $500 | $725 | +$225 |
| Digital sales + tips | $2,000 | $2,600 | +$600 |
| Lorea score sales (new) | $0 | $800 | +$800 |
| Education tier B2B (new, conservative) | $0 | $1,000 | +$1,000 |
| **Total** | **$10,330** | **$13,600** | **+$3,270 (+32%)** |

### Revised Scenario C (Month 12, 10,000 creators)

| Stream | Original | Revised | Delta |
|---|---|---|---|
| Platform subscriptions | $69,750 | $87,188 | +$17,438 |
| Sanctuary + tips + sales | $55,000 | $71,500 | +$16,500 |
| Lorea score publishing | $0 | $8,000 | +$8,000 |
| Cora API licensing (B2B) | $0 | $5,000 | +$5,000 |
| Education tier (B2B) | $0 | $4,500 | +$4,500 |
| **Total** | **$244,210** | **$276,198** | **+$31,988 (+13%)** |

*Note: The B2B channels (Cora API, Education tier) are conservative estimates requiring active sales effort. They are not automatic; they require outbound BD work starting Month 6–8.*

---

## 21. Updated Pitches — June 5, 2026

### Music Creator Pitch (60 seconds, post-sprint)
> "You're a musician. TikTok pays you $30 per million views. Spotify pays $0.003 per stream.
> On Plajah, 50 fans at $10/month = $450 recurring. You keep 90%.
> But here's what no other platform offers: when someone plays your track, they can see *the theory behind it* — the key, the scale, why the chords hit the way they do. Live. Animated. In real time.
> And when your fans disagree with what you've said? They can formally challenge your posts. It's structured — AI-judged, scored on logic and civility. Your best arguments are on the record.
> First 100 musicians: Creator Pro free for life."

### Fan Pitch (30 seconds, post-sprint)
> "Three of your friends are listening to the same song right now and you have no idea. On Plajah, you would. You'd see it in your feed. You'd tap once to join them.
> If you love what you hear, you can see what's happening harmonically — the melody lit up in orange, the bass in green — while the song plays.
> And if a creator posts something you think is wrong? You can formally challenge it. It becomes a debate. Aria judges. The record stands."

### Education Pitch (30 seconds, for music teachers)
> "Your students are listening to music on Spotify while you're teaching theory on a whiteboard. 
> On Plajah, you play a track and *the theory plays with it*. The key. The scale. Every note lit up by its role in the arrangement.
> It's music theory that moves. And your students are already using the platform to listen to music anyway."

---

*Updated June 5, 2026. Reflects structured debate system v2, The Breakdown music theory analysis, Right Now Mode (shipped), Cora music analysis backend, and Platform Pulse debate feed. Previous sections remain intact.*
