# Platform Status & Business Architecture Report

## 1. Feature & Mechanic Status

The platform has evolved into an expansive "Creative Microsite & Social Universe," blending social networking, multimedia distribution, e-commerce, and immersive web experiences.

### Working Features (Stable)
- **Multi-tiered Account System:** Fluid role-switching (Fan, Artist, Brand, Writer, Teacher) and customizable public profiles.
- **Multimedia Integration:** Support for photos, video playlists, music albums/tracks, and PDF/EPUB books.
- **Social Graph & Activity Feeds:** Following, user dashboards, visual "Waterfall" global feed.
- **Immersive Theming & Presentation:** Custom video/frosted backgrounds, theme preset libraries, and "Nano Banana" AI insights.
- **Store & E-commerce Scaffolding:** Merch listing, digital product support, payment tracking layouts.
- **Classrooms & "Worlds" (Interactive Zones):** Deep immersion modules for Solar System, Leaf Biology, and WebGL-based exploration.
- **Admin & Live Feeds:** Global control over live streaming/FAST channels, platform-wide themes, and user moderation.

### Incomplete Features (Needs Refinement)
- **Live Broadcasting Integration:** While UI config exists (RTMP/HLS inputs, FAST channel toggles), a real streaming backend (e.g., Mux, AWS IVS) is required for actual video transcoding and delivery at scale.
- **Direct Messaging & Live Chat:** Sockets for real-time multiplayer presence are functioning in a mocked/polling state; they require a robust WebRTC/WebSocket backend (e.g., Firebase Realtime DB, Socket.io, or LiveKit).
- **Payment & Revenue Processing:** UI tracking works, but needs fully wired Stripe Connect integration to handle automated 10% platform fee splits and immediate payouts.
- **Deep 3D/WebGL "Worlds":** Currently reliant on static templates or basic Three.js scenes. Procedural asset loading via user uploads needs sanitization to prevent memory leaks/browser crashes.

### Problems, Conflicts & Smarter Implementations
- **Problem:** *Scalability of File Uploads.* Uploading 220 assets (200 videos, 20 photos) simultaneously (as added in the Themes feature) will hit browser memory limits and Firebase limits.
  - **Smarter Strategy:** Implement staggered, chunked multipart uploads utilizing AWS S3/Cloud Storage directly with signed URLs, allowing users to pause/resume uploads.
- **Problem:** *Data Query Costs.* The current heavily relational data model (NoSQL) queries across multiple collections for feeds and profiles.
  - **Smarter Strategy:** Use a graph database (Neo4j) or implement aggressive edge-caching (Redis, Cloudflare Workers) to serve User Profiles and Global Feeds for pennies per million requests.
- **Problem:** *3D Scene Performance.* High-fidelity images in WebGL contexts crash mobile browsers.
  - **Smarter Strategy:** Automatically generate standard-def and proxy textures on the server immediately upon upload.

---

## 2. Infrastructure & Economics

### Estimated Operational Cost Per User
*Based on a serverless architecture (Firebase/GCP/AWS)*

- **Infrastructure & Compute:** ~$0.02 / user / month
- **Database (Read/Write):** ~$0.05 / user / month
- **Asset Storage & Egress (CDN flow):** ~$0.40 - $1.20 / user / month (Highly variable depending on video/music consumption)
- **AI Processing (Gemini API interactions):** ~$0.15 / user / month
- **Total Blended Cost:** **~$0.62 - $1.42 per active user per month**

### Storage Limit Strategy & Tiers
To ensure a financially healthy 10% margin, we must strictly cap storage on free tiers, as Video/Image ingestion is the #1 cost driver. 

* **FAN (Free Tier):**
  - Storage: 2 GB maximum.
  - Permissions: Profile customization, social interaction, following, commenting, and wallet management.
  - Egress limit: 10 GB/month viewing.

* **CREATOR BASIC ($9.99 / month):**
  - Storage: 50 GB.
  - Features: Upload Music, basic Photos, standard definition standard length videos, sell Merch (platform takes 10%).

* **CREATOR PRO ($29.99 / month):**
  - Storage: 250 GB.
  - Features: 4K Video support, Interactive Worlds, Live Streaming capabilities, FAST Channel routing, Custom Theme Publishing, Advanced Analytics. Platform takes only 8%.

* **ENTERPRISE/BRAND ($99.99+ / month):**
  - Storage: 2 TB+.
  - Features: Multi-seat dashboard, extensive bandwidth pool, dedicated account manager, API hooks, white-labeling.

---

## 3. Terms of Service (Simplest Agreement)

**1. The Quick Read**
Welcome to the Platform. This is a creative sanctuary for you to host, share, and sell your art, music, writing, and digital worlds. By using this platform, you agree that you are solely responsible for what you upload, say, and sell. We provide the tools; you provide the soul. 

**2. Your Content & Copyright**
You retain 100% ownership of your original content. 
**You are legally and financially responsible for everything you upload.** 
Do not upload copyrighted music, videos, images, code, or assets that you do not have explicitly granted, legal permission to use. If we receive a DMCA notice, or if a third party takes legal action regarding a copyright infringement, we will immediately remove the content and you will assume all legal liability and resulting costs. You agree to hold the Platform entirely harmless in any copyright disputes. If you post it, you own the consequences.

**3. Financials, Fees & Margins**
The Platform runs on a split-revenue model to keep the servers running. We charge a standard **10% operational margin** on all transactions (sales, PPV, subscriptions, tips) processed through the Platform. You are responsible for paying your own local taxes on your 90% payout. Payouts are routed through Stripe Connect; standard payment processing fees apply.

**4. Acceptable Use & Conduct**
Do not use the Platform to distribute illegal, exploitative, genuinely harmful, or malicious material. We do not tolerate spam, phishing, or harassment. We reserve the right to suspend or terminate accounts that threaten the physical safety of others or the operational stability of the Platform.

**5. Stability & Data Liability**
We strive for perfection but run on code. We do not guarantee 100% uptime, nor do we guarantee that data will never be lost. You are strongly advised to keep offline backups of all your uploaded art, music, videos, and worlds. We are not liable for lost profits due to downtime or data loss.

**6. Termination**
You can leave and delete your data at any time. We can suspend your account at any time if you violate these rules. When you leave, your recurring billing stops. 

*By creating an account, you legally bind yourself to these terms.*
