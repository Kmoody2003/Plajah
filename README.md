<div align="center">
<img width="1200" height="475" alt="Plajah Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Plajah — The Creator Platform

Plajah is a multi-format creator platform combining music, video, film, TV, books, games, live streaming, education, science, and commerce under a single creator identity. Creators publish everything from one profile, fans consume everything from one place, and the platform takes 10% — creators keep 90%.

---

## What's on the Platform

| Section | What it does |
|---|---|
| **Chora** | Music streaming, albums, singles, podcasts, artist radio |
| **Reello** | Short & long-form video, YouTube import, FAST channels |
| **Taleo** | Movies, TV series, trailers, public domain film library |
| **Library** | Books (EPUB), audiobooks, graphic novels |
| **Newsstand** | Articles, editorial content, serialized writing |
| **Radio** | Curated genre stations + creator-built stations |
| **Live Hub** | WebRTC live streams, tipping, co-streams |
| **Classrooms** | Courses, lessons, assignments, live sessions |
| **Plajah Labs** | Science & research community (14 disciplines + live data) |
| **Sanctuary** | Creator membership tiers, exclusive content, private community |
| **Store** | Creator merch, digital products, physical orders |
| **Clubs** | Fan clubs with paid membership, chat, and events |
| **SeedRaiser** | Creator crowdfunding with tiered rewards |
| **World Builder** | Interactive 3D IP universe builder with lore, timeline, characters |
| **Sports** | Team pages, player profiles, sports news |
| **Games** | HTML5/WebGL games embedded natively |
| **Plajah Business** | Business pages, ordering, loyalty, CRM, digital signage |

---

## Creator Monetization

| Revenue type | Creator share | Platform take |
|---|---|---|
| Plajah+ subscriptions (bound) | $3.00–$11.00/sub/mo | $1.99–$3.99/sub/mo |
| Sanctuary memberships | 90% | 10% |
| Tips & gifts | 90% | 10% |
| Digital sales | 90% | 10% |
| Store orders | 90% | 10% |
| SeedRaiser pledges | 95% | 5% |
| Ad packages | — | 100% (platform only) |

Payouts via **Stripe Connect Express** — direct to creator bank accounts with automatic revenue splits.

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion
- **Backend:** Node.js / Express (`server.ts`)
- **Database:** Firebase Firestore (named DB)
- **Auth:** Firebase Auth (Google, Twitter/X, Facebook, Microsoft, Email)
- **Storage:** Firebase Storage
- **Video:** Mux (transcoding, live streaming, FAST channels)
- **Payments:** Stripe Connect (subscriptions, one-time, splits)
- **AI:** Google Gemini (content generation), Anthropic Claude (Muse science AI)
- **Fediverse:** AT Protocol (Bluesky), Mastodon OAuth
- **Science APIs:** NCBI, NASA, NOAA CDO, Wolfram Alpha, Materials Project, GBIF, RCSB PDB, FEMA, Macrostrat, Wikidata, OpenStreetMap, Wikipedia, Library of Congress, Getty AAT, CrossRef, arXiv, PubChem, Open-Meteo, USGS

---

## Platform Targets

| Platform | Status |
|---|---|
| Web (PWA) | Live |
| Android (Capacitor) | In development |
| iOS (Capacitor) | Shell ready |
| Amazon FireTV | Leanback + D-pad complete |
| Samsung Tizen TV | `config.xml` complete |
| Roku | SceneGraph channel complete |
| Google Chromecast | Cast provider wired |
| Amazon Alexa | Skill fulfillment live |
| Google Home | Actions webhook live |
| Windows (WinUI 3) | Shell complete |

---

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Required keys for full functionality — see `.env.local` comments for where to get each:

| Key | Service | Required for |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | AI content generation |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Mux | Video & live streaming |
| `STRIPE_SECRET_KEY` | Stripe | All payments |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe | Checkout UI |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Subscription events |
| `ANTHROPIC_API_KEY` | Anthropic | Muse AI (science layer) |
| `NASA_API_KEY` | NASA | Astronomy data |
| `NOAA_TOKEN` | NOAA | Climate data |
| `NCBI_API_KEY` | NIH | Biology/medicine data |
| `WOLFRAM_APP_ID` | Wolfram Alpha | Math/physics computation |
| `MATERIALS_PROJECT_API_KEY` | Materials Project | Crystal structure data |

Science APIs with no key (live immediately): Open-Meteo, USGS, Macrostrat, PubChem, CrossRef, arXiv, RCSB PDB, GBIF, FEMA, Wikidata, OpenStreetMap, Wikipedia, Library of Congress, Getty AAT, OpenContext.
