# Plajah Platform Economics

## Overview

Plajah is a multi-revenue creator-first platform combining social media, music, video, live streaming, gaming, e-commerce, and community features. The monetization model is designed to reward creators generously while maintaining platform sustainability.

**Infrastructure stack:**
- Firebase Auth, Firestore, Storage, and Hosting
- Custom Node/Express backend (deployed to Cloud Run or similar)
- Mux for video upload, playback, and live streaming
- Stripe for all payment processing
- Client-side media upload and playback flows

---

## 1. Operational Cost Estimates

### Per-user monthly cost at 100 active users
| Usage profile | Total / month | Per user |
|---|---|---|
| Light social use | $12–$14 | $0.12–$0.14 |
| Moderate video/music | $28–$47 | $0.28–$0.47 |
| Heavy creator / live | $51–$87 | $0.51–$0.87 |

### Primary cost drivers
- **Mux** — video encoding, delivery bandwidth, live streaming
- **Firebase Storage** — file uploads (audio, video, images, docs)
- **Firestore** — reads/writes for feeds, profiles, discovery, notifications
- **Cloud Run / hosting** — server uptime and API compute
- **Stripe processing** — 2.9% + $0.30 per transaction (third-party, not platform cost)

---

## 2. Plajah+ Subscription Model

### Pricing & revenue split
| Tier | Price / month | Platform take | Creator share | Storage | Monthly points | Ad boost |
|---|---|---|---|---|---|---|
| Tier 1 — Spark | $4.99 | $1.99 | $3.00 | 100 GB | 100 pts | +15% |
| Tier 2 — Glow | $9.99 | $2.99 | $7.00 | 500 GB | 300 pts | +30% |
| Tier 3 — Nova | $14.99 | $3.99 | $11.00 | 1 TB | 1,000 pts | +50% |

### Subscriber benefits by tier
**Tier 1 — Spark ($4.99)**
- Radio monetization unlocked
- 10% discount on Plajah For Business purchases
- 100 monthly loyalty points
- 100 GB creator storage

**Tier 2 — Glow ($9.99)**
- Radio + Live TV + PPV monetization
- 15% discount on Plajah For Business purchases
- 300 monthly loyalty points
- 500 GB creator storage

**Tier 3 — Nova ($14.99)**
- Full monetization (radio, TV, PPV, exclusive content)
- 20% discount on Plajah For Business purchases
- 1,000 monthly loyalty points
- 1 TB creator storage

### Creator Split System
Creators can split their Plajah+ revenue with up to 3 recipients (other artists, charities, or clubs). Constraints:
- Maximum 3 split recipients
- Split percentages must sum to ≤100%
- Creator must always retain a minimum of **$1.00** after splits
- No third-party gets more than the creator retains

### Plajah+ Morph Mode
- Subscriber binds to the **platform** (via a Club or platform page) instead of one creator
- Revenue is distributed randomly or split evenly across up to 3 creators per billing cycle
- No rebind fee — creator rotation happens automatically
- Ideal for explorers who follow many creators

### Rebind Fee
- Standard subscribers may rebind from one creator to another for a one-time **$2.99** fee (single Stripe payment intent)
- Revenue: 100% platform keep (no creator share on the rebind fee)

### Subscription revenue projections
| Subscribers | Tier 1 only | Blended (50/30/20 mix) | Tier 3 only |
|---|---|---|---|
| 1,000 | $1,990/mo platform | $2,790/mo platform | $3,990/mo platform |
| 10,000 | $19,900/mo platform | $27,900/mo platform | $39,900/mo platform |
| 100,000 | $199,000/mo platform | $279,000/mo platform | $399,000/mo platform |

Creator payouts scale proportionally (platform always retains $1.99–$3.99 per subscriber).

---

## 3. Plajah For Business

### Business page features
Businesses create verified pages with access to:
- **Online ordering** — customers browse menu/catalog and place orders; business confirms, processes, and fulfills
- **In-store radio** — curated licensed music streamed to physical locations
- **Digital signage** — manage image/video/text/promo slides on in-store displays
- **CRM** — contact management, notes, tags, reward points, spend tracking, visit history
- **Loyalty rewards** — points-based rewards system for repeat customers
- **Plajah user discount** — configurable discount % for active Plajah+ subscribers
- **Seed Raiser** — embedded crowdfunding campaign directly tied to the business page

### Business revenue model (platform)
- Business page setup: future potential SaaS pricing ($29–$99/month tiered by features)
- Order processing: future potential 2–5% service fee on order total
- CRM and signage as premium add-ons

*(Current implementation: features are enabled/disabled per page; monetization pricing TBD for launch.)*

---

## 4. Advertising & Promotion Model

### Ad slot distribution (per impression cycle)
| Slot type | Allocation | Description |
|---|---|---|
| On-platform user promo | 50% | Creator/user self-promotion via boost scores |
| Content partner | 20% | Verified content partners and brand deals |
| Third-party advertisers | 30% | External ad network or direct advertisers |

### Boost score algorithm
Each user's `totalBoostScore` determines their weighted share of user-promo slots:

```
totalBoostScore =
  activityScore (0–100, last 7 days)
  × subscriptionTierMultiplier (1.15 / 1.30 / 1.50)
  × achievementBoostMultiplier (1.10 / 1.20 / 1.30, time-limited)
  × pointsBoostMultiplier (up to 1.50 for 500 points spent)
  × activePackageMultiplier (1.5× / 2.5× / 4.0× / 6.0×)
```

Activity score is computed from posts, videos, and music releases in the past 7 days (capped at 100).

### Achievement boosts (time-limited)
| Difficulty | Multiplier | Duration |
|---|---|---|
| Easy | +10% | 1 day |
| Medium | +20% | 7 days |
| Hard | +30% | 30 days |

### On-platform ad packages (one-time purchase)
| Package | Price | Duration | Boost multiplier |
|---|---|---|---|
| Basic | $4.99 | 7 days | 1.5× |
| Featured | $9.99 | 14 days | 2.5× |
| Premium | $14.99 | 21 days | 4.0× |
| Maximum | $20.00 | 30 days | 6.0× |

**Platform revenue from ad packages:**
| Monthly packages sold | Basic only | Premium only | Maximum only |
|---|---|---|---|
| 100 | $499/mo | $1,499/mo | $2,000/mo |
| 1,000 | $4,990/mo | $14,990/mo | $20,000/mo |
| 10,000 | $49,900/mo | $149,900/mo | $200,000/mo |

### Off-platform promotion (monthly subscription)
| Tier | Price / month | Includes |
|---|---|---|
| Standard | $49/month | Social media cross-posting, creator spotlight |
| Premium | $100/month | Standard + digital billboard rotation, priority placement |

**Platform revenue from off-platform:**
| Customers | Standard | Premium | Blended |
|---|---|---|---|
| 100 | $4,900/mo | $10,000/mo | ~$7,450/mo |
| 1,000 | $49,000/mo | $100,000/mo | ~$74,500/mo |

---

## 5. Seed Raiser (Crowdfunding)

### Economics
- **Platform fee:** 5% of total funds raised (deducted at campaign completion)
- **Campaign creator keeps:** 95% of all pledges
- **Pledge processing:** Stripe payment intent per pledge; funds held until campaign ends

### Campaign structure
- Status lifecycle: DRAFT → ACTIVE → FUNDED / FAILED / CANCELLED
- Categories: Music, Video, Art, Tech, Community, Business, Other
- Tiered rewards with optional limited counts and delivery estimates
- Anonymous pledging supported

### Revenue projections
| Campaigns funded | Avg raise | Platform 5% |
|---|---|---|
| 10/month | $5,000 avg | $2,500/mo |
| 50/month | $5,000 avg | $12,500/mo |
| 100/month | $10,000 avg | $50,000/mo |

---

## 6. Combined Revenue Model

### Revenue streams summary
| Stream | Platform margin | Notes |
|---|---|---|
| Plajah+ subscriptions | $1.99–$3.99/sub/mo | Creator gets rest |
| Rebind fees | $2.99 per rebind | 100% platform |
| On-platform ad packages | $4.99–$20 per package | 100% platform |
| Off-platform promotion | $49–$100/mo per customer | 100% platform |
| Seed Raiser fee | 5% of raises | 100% platform |
| Business page SaaS | TBD | 100% platform |
| Gifts/tips | 10% fee | Creator gets 90% |
| Storage add-ons | TBD | 100% platform |

### Blended unit economics (per active subscriber)
| Scenario | Gross revenue | Stripe fees (~3%) | Platform net |
|---|---|---|---|
| Tier 1 sub only | $4.99 | ~$0.45 | ~$1.54 |
| Tier 2 sub only | $9.99 | ~$0.60 | ~$2.39 |
| Tier 3 sub only | $14.99 | ~$0.74 | ~$3.25 |
| Tier 2 + Basic ad pack | $14.98 | ~$0.75 | ~$7.39 |
| Tier 3 + Premium ad pack | $29.98 | ~$1.20 | ~$17.78 |

---

## 7. Storage Economics

Effective storage cost (Firebase/GCS): **$0.03–$0.04 per GB per month**

| Tier | Included storage | Storage cost to platform | Creator share covers it? |
|---|---|---|---|
| Tier 1 | 100 GB | ~$3.00–$4.00/mo | Break-even |
| Tier 2 | 500 GB | ~$15–$20/mo | Platform net ($2.99) is at risk — offset by ad/package revenue |
| Tier 3 | 1 TB | ~$30–$40/mo | Platform net ($3.99) doesn't cover it — offset by ad/package/business revenue |

**Key insight:** Higher tiers are loss-leaders on storage but are offset by the higher probability that Tier 2/3 subscribers also purchase ad packages, generate tips (10% fee), and drive off-platform promotion subscriptions.

---

## 8. Financial Viability

### Breakeven analysis
At $0.50–$0.87/user/month platform operating cost:

| Sub tier | Platform take | Operating cost | Gross margin | Net margin |
|---|---|---|---|---|
| Tier 1 | $1.99 | $0.87 | $1.12 | 56% |
| Tier 2 | $2.99 | $0.87 | $2.12 | 71% |
| Tier 3 | $3.99 | $0.87 | $3.12 | 78% |

(Excluding Stripe processing fees, storage overages, and Mux costs.)

### Path to profitability
1. **1,000 active subscribers (blended):** ~$2,790/mo platform revenue, ~$870 costs → **$1,920 net**
2. **10,000 subscribers + 500 ad packages/mo:** ~$28,400/mo + $2,495 → **~$20,000 net after costs**
3. **100,000 subscribers + Seed Raiser + Business:** Platform revenue exceeds $350,000/mo

---

## 9. Recommended Strategy

1. **Launch Plajah+ immediately** with strong creator payouts to incentivize creator sign-ups and content
2. **On-platform ad packages** as the primary upsell for engaged creators (low friction, high margin)
3. **Seed Raiser** as a viral loop driver — funded campaigns attract new users to the platform
4. **Off-platform promotion** as a recurring revenue anchor for serious creators ($49/$100/mo)
5. **Business pages** as the mid-term B2B growth lever — each business page brings their customer base to Plajah
6. **Storage add-ons** for power users who exceed plan limits
7. **Monitor** Mux egress and Firebase Storage costs monthly — adjust Tier 3 storage limit if costs outpace revenue

---

## 10. Next Steps

- [ ] Set live Stripe price IDs in `.env.local` (`STRIPE_PRICE_TIER1/2/3`)
- [ ] Configure Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`
- [ ] Set `FIREBASE_API_KEY` for server-side token verification
- [ ] Enable Firestore security rules for new collections (`plajahPlusSubscriptions`, `creatorSplits`, `adBoostProfiles`, `adPackages`, `businessPages`, etc.)
- [ ] Monitor actual Mux/Storage/Firestore costs as usage scales
- [ ] Define Business page SaaS pricing tiers and implement billing
- [ ] A/B test ad package pricing at $9.99 vs $12.99 for Featured tier
- [ ] Track gift/tip volume to validate the 10% fee revenue stream
