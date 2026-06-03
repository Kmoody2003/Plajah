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
