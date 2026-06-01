# Plajah — Go-to-Market & User Acquisition Plan

> Written from a scan of the actual codebase (212 components, 25+ services, Firebase/Mux/Stripe/Gemini/Fediverse/Audius live). This is a real platform, not a prototype.

---

## 1. The Strategic Problem (read this first)

Plajah does **everything**: music, video, TV/film, books, courses, games, live, FAST channels, worldbuilding, crowdfunding, business pages, clubs, fediverse. That breadth is the platform's strongest long-term moat — and its single biggest go-to-market liability.

When you tell a creator "Plajah is the everything-platform for creators," it slots into **no existing mental model**. They already use YouTube for video, Spotify for music, Patreon for memberships, Substack for writing, Discord for community. "Replace all of them with one tool from a brand I've never heard of" is a 12-month decision, not a sign-up.

**The solution is a wedge strategy.** Pick 2–3 sharp beachhead segments where one Plajah feature uniquely solves a real, unsolved pain. Win those communities deeply. Use them as proof and case studies to open the broader "everything-platform" pitch.

---

## 2. Recommended Beachhead Segments

### 🥇 Wedge #1 — Worldbuilders & multi-format IP creators
**Why this wedge is the sharpest:**
- The World Builder feature (3D Force Graph, lore conflict detection, custom timelines, per-world themes) is **genuinely unique**. No competitor combines all of it.
- The audience is concentrated and vocal: r/worldbuilding has 1.5M+ members, World Anvil has 1M+ users, and the community evangelizes good tools loudly.
- Switching cost is high — once a worldbuilder has their universe in your tool, they don't leave.
- The "show your world as a 3D graph" demo is a thumb-stopping social video format.

**Who exactly:** Fantasy/sci-fi novelists, TTRPG homebrewers, indie comic creators, narrative game designers, fan-fiction worldbuilders.

**Competitors to displace:** World Anvil (paid wiki — strong but not visual), Campfire (writing-focused), Notion (generic), Obsidian (technical).

**The one-line pitch:** *"Stop hiding your world inside a wiki. Plajah turns your characters, lore, and timeline into an interactive 3D universe your readers can actually explore."*

---

### 🥈 Wedge #2 — Indie filmmakers & micro-studios needing FAST distribution
**Why this wedge matters:**
- FAST (Free Ad-Supported Streaming TV) is one of the hottest distribution categories — Pluto, Tubi, Roku, Samsung TV+ are all spending heavily. But indies can't get on them. Roku Direct Publisher is gated, Tubi's indie program requires aggregator deals.
- Plajah uniquely lets any creator launch a 24/7 FAST channel with zero setup, plus mid-roll ad markers, bumpers, live interrupts, cross-creator licensing.
- Combine that with the Film Distribution Hub, Festival Mode, Transmedia Hub, Rights Dashboard, and AI Assistant components already built — this is a serious indie-film stack.
- Revenue density per user is high: indie filmmakers pay hundreds of dollars a year for distribution tooling (Filmhub, Vimeo OTT, FilmFreeway).

**Who exactly:** Indie feature filmmakers, short film directors, micro-studios releasing 3–10 titles/year, documentary makers, festival-circuit creators.

**Competitors to displace:** Filmhub (distribution-only), Vimeo OTT ($75–$100/mo, no FAST), Eko, Tubi indie (gated).

**The one-line pitch:** *"Run your own 24/7 streaming TV channel. No deals, no aggregators, no gatekeepers — your library, your schedule, your ad breaks."*

---

### 🥉 Wedge #3 — Multi-hyphenate creators (musician + writer, podcaster + filmmaker, etc.)
**Why this is the umbrella for later:**
- This is the *real* Plajah pitch — but it's a slow sell because it asks creators to consolidate, which is friction.
- Use Wedges #1 and #2 first to build credibility and case studies, then aim this wedge at the broader creator economy.
- These people exist on r/CreatorEconomy, IndieHackers, in the Substack creator network, and in the post-Patreon migration discussions.

**Save this wedge for Month 3+.**

---

## 3. Channel Map (concrete, not categorical)

### For Wedge #1 — Worldbuilders

| Channel | Why | First action |
|---|---|---|
| **r/worldbuilding** (1.5M) | Highest concentration of the buyer | Post a "I built a tool that visualizes worlds as 3D graphs — looking for 20 testers" thread with video demo |
| **r/Fantasy** (3M), **r/scifiwriting** (200k) | Adjacent — writers building worlds | "Show your world" thread + tool intro |
| **World Anvil Discord & forums** | Direct competitor's community — handle tactfully | Engage genuinely first, don't pitch cold. Find frustrated power users. |
| **r/RPGdesign**, **r/DnDHomebrew**, **r/PathfinderRPG** | TTRPG worldbuilders are rabid users | Demo: "I built my homebrew setting in Plajah — here's the 3D map" |
| **Tumblr writeblr / writing community** | Underrated, highly engaged | Visual demos do extremely well |
| **X/Twitter #WritingCommunity, #worldbuilding** | Daily visual posts | 1 lore-graph screenshot per day |
| **Brandon Sanderson Discord, Critical Role Reddit** | High-value pockets | Soft engagement, look for natural openings |
| **YouTube: Hello Future Me, Tale Foundry, Quinn's Quest** | Worldbuilding YouTubers, ~100k–1M subs each | Send a free founding-creator account + a 3-minute demo; offer affiliate cut |

### For Wedge #2 — Indie filmmakers

| Channel | Why | First action |
|---|---|---|
| **r/Filmmakers** (3M) | The buyer is here | Show HN-style post: "We built free FAST channels for indie filmmakers — want one?" |
| **r/indiefilm**, **r/cinematography**, **r/editors** | Adjacent | Tailored variants |
| **NoFilmSchool community + comments** | High-trust outlet for indie film tooling | Pitch a guest article: "How indie filmmakers can run their own FAST channel" |
| **Stage 32** | Industry social network for film | Post in the Distribution and Streaming lounges |
| **FilmFreeway forums + IndieWire reader audience** | Festival-circuit filmmakers | Direct outreach via festival contacts |
| **Sundance Co//ab community** | Highly qualified | Apply to participate as a partner |
| **X: #FilmTwitter** | Vocal, opinionated, will signal-boost good tools | Daily clips of indie creators' FAST channels |
| **YouTube: Indy Mogul, Film Riot, Corridor Crew comments** | Where indie filmmakers learn | Founding creator outreach to mid-tier YouTubers |
| **Filmhub user base** | Already paying for distribution | LinkedIn outreach to "indie film distribution" job titles |

### For Wedge #3 — Multi-hyphenates (later)
IndieHackers, r/CreatorEconomy, Substack Notes, Beacons/Stan.store user discussions, Product Hunt, Hacker News.

---

## 4. The Founding Creator Program (the single biggest lever)

This is the #1 mechanic to bootstrap supply (creators) before demand (fans).

**Offer:**
- Free **Tier 3 / Nova** ($14.99/mo) plan for life for the first **100 creators per beachhead segment** (200 total).
- "Founding Creator" badge (already in your gamification system — wire it up).
- Personal onboarding call with you (or a Loom walk-through).
- Featured placement on the relevant landing page section.
- Co-marketing: you make their channel/world look amazing in social demos.
- Direct Discord/Slack channel with you for feedback.

**Why it works:**
- Solves the cold-start problem — early creators get attention they can't get on any other platform.
- Builds switching-cost moat fast — once their world or FAST channel is on Plajah, they're sticky.
- Creates the social proof you'll wave at Wedge #3 in Month 3.

**Cost analysis (from your economics doc):**
- 200 creators × $3.99 platform take/mo forgone = $798/mo opportunity cost.
- Storage cost: ~$3–4/creator/mo × 200 = $600–800/mo real cost.
- **Total: under $1.6k/mo to seed two segments.** Cheapest paid acquisition you'll ever run.

---

## 5. Pre-Launch Assets to Build

| Asset | Where it lives | Priority |
|---|---|---|
| Segment landing page: `/for-worldbuilders` | Plajah site | P0 |
| Segment landing page: `/for-filmmakers` | Plajah site | P0 |
| 60-second demo video — "Your world as a 3D graph" | YouTube, X, Reddit | P0 |
| 90-second demo video — "Launch your FAST channel in 5 clicks" | YouTube, X, Reddit | P0 |
| Founding Creator application form | Tally/Typeform → Firebase | P0 |
| Twitter/X account with cohesive brand voice | X | P0 |
| Public roadmap (Trello or Linear public board) | Web | P1 |
| Plajah blog with launch announcement | Plajah site | P1 |
| Email capture on plajah.com waitlist | Plajah site | P0 |
| Press kit (logos, screenshots, founder bio, fact sheet) | plajah.com/press | P1 |

---

## 6. The 90-Day Playbook (week by week)

### Phase 1 — Foundation (Weeks 1–4)

**Week 1: Position & build assets**
- Lock the two beachhead segment messages (use copy in §7 below as starting point).
- Spin up `/for-worldbuilders` and `/for-filmmakers` landing pages.
- Open the Founding Creator waitlist (Typeform → Firestore).
- Set up @plajah on X, Reddit accounts (separate from personal), YouTube channel.
- Record the two 60–90s demo videos.

**Week 2: Begin seeding (lurk-mode)**
- Start participating in r/worldbuilding, r/Filmmakers, r/RPGdesign — useful comments only, no pitching.
- Identify and DM 30 mid-tier YouTubers (10k–500k subs) per segment with founding creator offers.
- Begin daily X posts: 1 visual demo per day, alternating segments.

**Week 3: Soft outreach**
- Email/DM 50 worldbuilders and 50 indie filmmakers (from the Reddit/Discord/YouTube lists) with personalized founding creator invites.
- Pitch NoFilmSchool, IndieWire, World Anvil-adjacent blogs for guest content.
- First "Show your world" Reddit post on r/worldbuilding.

**Week 4: Pre-launch buzz**
- Public roadmap goes live.
- Founding Creator waitlist count gets shared as social proof ("147 creators on the waitlist…").
- Lock launch date for Week 6.

### Phase 2 — Soft Launch (Weeks 5–8)

**Week 5: Onboard founding creators**
- Accept first 50 worldbuilders + 50 filmmakers off the waitlist.
- Run individual onboarding Looms or 20-min calls.
- Help them populate their worlds/channels with at least 3 pieces of content each.
- Capture before/after screenshots and quotes for testimonials.

**Week 6: Segment launches**
- Reddit launch posts in r/worldbuilding and r/Filmmakers — featuring founding creators' actual content.
- "I built a free 24/7 FAST channel for indie filmmakers" — link to live channels of your founding creators.
- "I built a tool that shows your world as a 3D graph" — link to live worlds.

**Week 7: Press push**
- Pitches to: NoFilmSchool, IndieWire, Cartoon Brew (if any animation creators), TechCrunch (creator economy), The Verge, Tor.com (sci-fi readership), Polygon.
- Reach out to creator-economy newsletters: Means of Creation, The Rebooting, Workweek, Creator Spotlight, Passion Economy.

**Week 8: Iterate**
- Pause and review: which segment converted better? Which content style worked?
- Double down on the winner.

### Phase 3 — Public Launch (Weeks 9–12)

**Week 9: Public launch prep**
- Show HN draft (see §7).
- Product Hunt hunter lined up (DM @kevin, @rrhoover via X — or use a hunter service).
- 5–10 founding creators teed up to upvote and comment on launch day with their real Plajah profiles.

**Week 10: LAUNCH WEEK**
- Tuesday: Product Hunt launch (best day historically).
- Wednesday: Show HN.
- Thursday: Big Reddit posts on r/InternetIsBeautiful, r/SideProject, r/webdev.
- Friday: Twitter launch thread with greatest-hits demos.

**Week 11: Wedge #3 introduction**
- With launch momentum + 100+ active founding creators, now pitch the multi-hyphenate audience.
- IndieHackers post: "I built one platform for music + video + writing + film — here's why."
- Substack Notes campaign.

**Week 12: Loops & retention**
- Audit: who churned? Why?
- Build the first viral loop — likely Seed Raiser (crowdfunding is share-driven by design) or Hide N Seek (gamified discovery).
- Set quarterly KPIs for Months 4–6.

---

## 7. Copy Library (drop-in ready)

### A. Reddit launch post — r/worldbuilding

> **Title:** I built a tool that turns your worldbuilding into an interactive 3D graph (free for the first 100 worldbuilders)
>
> Hey r/worldbuilding,
>
> I've been a lurker here for years. Like most of you, I've watched my universe sprawl across a wiki, three Notion pages, a Discord channel, and the back of a notebook. The thing that always bugged me: nobody ever *sees* my world the way I see it in my head — interconnected, alive, evolving.
>
> So I built Plajah. It's a creative platform with a feature I'm calling World Builder:
>
> - Every character, lore entry, timeline event, and piece of linked content renders as a node in an interactive 3D force graph. Click any node, fall into that part of the world.
> - Built-in lore conflict detection — flags contradictions so your continuity stops slipping.
> - Custom timeline units (Ages, Cycles, whatever you invent), with branching alternate histories.
> - Per-world themes — your dark fantasy world doesn't have to look like your sci-fi setting.
> - Music, art, articles, even short films and books can be linked into the world so readers discover how everything connects.
>
> I'm opening 100 Founding Creator spots for r/worldbuilding members — free Nova tier ($14.99/mo) for life, founding badge, featured placement.
>
> [Link]
>
> Honest critique, hard questions, "this won't work because…" — all welcome. I'll be in the comments all day.

### B. Reddit launch post — r/Filmmakers

> **Title:** We built free 24/7 FAST channels for indie filmmakers — looking for 100 founding directors to launch with
>
> Hey r/Filmmakers,
>
> Independent FAST distribution is broken. Roku Direct Publisher is gated, Tubi's indie program needs an aggregator, Filmhub is great but you don't control programming. Indie filmmakers who already have 3+ films can't easily run their own channel.
>
> We built Plajah to fix that. On the platform you can:
>
> - Toggle on a 24/7 FAST channel from your profile. Auto-scheduled from your videos. Zero setup.
> - Set mid-roll ad markers per video for monetization.
> - Upload your own bumpers (intro, outro, station ID) — Plajah inserts them between content blocks automatically.
> - Schedule live interrupts: at the set time, the channel switches to a live feed, then returns to FAST when you're done.
> - License clips to (or from) other creators per video or whole library — free or paid.
> - Pull from a public-domain library (Internet Archive integration).
>
> Plus the rest of the indie film stack: distribution hub, festival mode, rights dashboard, AI assistant, pricing manager.
>
> Founding Director program: 100 spots, free Nova tier for life, badge, featured channel placement, 1:1 onboarding with our team.
>
> [Link]
>
> Tear it apart — what's missing for your workflow?

### C. Show HN

> **Title:** Show HN: Plajah – every format under one creator identity (music, video, FAST TV, books, worlds)
>
> Hi HN,
>
> Plajah is a creator platform that unifies music, video, TV/film, books, courses, games, live, and worldbuilding under one identity. Guest browsing — no signup wall. Built on Firebase/Mux/Stripe with Gemini for AI features.
>
> A few things I think are interesting:
>
> - **FAST channels for anyone**: any creator can run a 24/7 ad-supported TV channel with auto-scheduling, bumpers, ad markers, and live interrupts. Cross-creator licensing built in.
> - **World Builder**: 3D force graph of every character/lore entry/event in a creator's universe, with lore conflict detection and custom timeline units.
> - **Sanctuary**: native Patreon-style memberships with per-content public/private/members-only toggles.
> - **Plajah+ Morph Mode**: subscribers can bind to the platform instead of one creator; revenue splits randomly across multiple creators.
> - **Hide N Seek**: creators hide tracks across the platform; fans find them via search and earn points. Gamified discovery.
>
> The thesis: creators are tired of stitching together Patreon + Spotify + YouTube + Substack + Discord. One identity, one membership, every format.
>
> Live at [link]. Founding Creator program open if you ship music, video, film, or worldbuilding content.
>
> Happy to answer hard questions on architecture, economics, or strategy.

### D. Product Hunt tagline

> **Plajah — One creator, every format. Music, video, FAST TV, books, worlds.**

### E. Twitter/X founding creator DM

> Hi [Name] — saw your [specific work] and wanted to reach out. I'm building Plajah, a platform where creators run music, video, FAST channels, and worldbuilding from one profile. I'd love to give you a Founding Creator spot (free Nova tier for life, featured placement, direct line to me for feedback). Mind if I send you a 90-second Loom?

### F. Landing page hero (worldbuilders)

> # Your world deserves more than a wiki.
> ### Plajah turns your characters, lore, and timeline into an interactive 3D universe your readers can actually explore.
> [Get a Founding Creator spot — 100 left]

### G. Landing page hero (filmmakers)

> # Your own 24/7 streaming TV channel. Live in five clicks.
> ### No aggregators, no gatekeepers. Your library, your schedule, your ad breaks. Free to start.
> [Apply to be a Founding Director]

---

## 8. Metrics & Decision Gates

Track these weekly:

| Metric | Target by Day 30 | Target by Day 60 | Target by Day 90 |
|---|---|---|---|
| Waitlist signups | 500 | 2,000 | 5,000 |
| Active founding creators | 50 | 150 | 250 |
| Worlds or FAST channels live | 30 | 120 | 250 |
| Daily active users | 100 | 500 | 2,500 |
| Plajah+ paid conversions | 0 (free founding) | 10 | 75 |
| Press mentions | 1 | 5 | 15 |

**Decision gates:**
- **Day 30:** If waitlist < 250, the wedge messaging isn't landing — rewrite landing pages, try different hooks.
- **Day 60:** If founding creators aren't producing content (<50% have 3+ items), onboarding is broken — fix UX before scaling.
- **Day 90:** If <50 Plajah+ conversions among non-founding users, pricing or value prop needs revisiting.

---

## 9. Risks & How to Defuse

1. **"Plajah does too much" objection.** Defuse by leading with one segment at a time. Never show the full menu in a first impression.
2. **Trust deficit (unknown brand holding their work).** Defuse with: data export tool prominently advertised, transparent ToS (you already have a solid one in PLATFORM_REPORT.md), public roadmap.
3. **Storage/Mux costs explode if a creator goes viral.** Tier limits + soft caps + a clear overage policy in the dashboard. Don't get caught manually paying for someone's success.
4. **DMCA risk from user uploads.** Your ToS is solid. Add a fast-response DMCA form and a documented takedown SLA before launch — investors and partners will ask.
5. **Two-sided cold start.** This is why Founding Creator > Founding Fan. Supply first, demand follows.
6. **Founder bandwidth.** Doing both segments in parallel is hard solo. If you only have time for one, pick **worldbuilders** — smaller competitive surface, tighter community.

---

## 10. What To Do This Week (3 concrete next steps)

1. **Lock the wedge.** Decide today: lead with worldbuilders, filmmakers, or both. (Recommendation: both, with worldbuilders as the primary if forced to pick.)
2. **Set up the waitlist.** A Typeform feeding into Firestore — collect name, segment, links to current work, what they need. Live by end of this week.
3. **Record the two demo videos.** 60–90 seconds each. Even rough quality is fine. Without these, none of the channel work will convert.

---

*This document was generated from a scan of your actual codebase. Wedges, channel maps, and copy are tuned to what Plajah uniquely ships, not generic creator-platform advice.*
