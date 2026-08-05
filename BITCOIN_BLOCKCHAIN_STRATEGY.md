# Plajah — Bitcoin & Blockchain Strategy
**Classification: Internal Strategy Document — Admin Access Only**
**Version: 1.0 | Last Updated: June 2026**

---

## Executive Summary

Plajah is building the first hybrid centralized/decentralized creator platform — one that gives independent artists, filmmakers, authors, journalists, and world-builders the financial infrastructure that only major labels and studios have historically accessed. The blockchain layer is invisible to most users, automatic by default, and permanently running underneath the platform. Revenue flows to creators faster, more transparently, and at higher percentages than any existing platform.

This document captures the full strategy, architecture decisions, feature roadmap, and rollout plan for Plajah's Web3 infrastructure layer.

**Core principle:** The blockchain is the plumbing. Users experience Plajah — not crypto.

---

## Why Now

The creator economy generates ~$250B annually. Independent creators receive approximately 12–20 cents on every dollar their work generates. The rest goes to labels, distributors, aggregators, and platforms. This is not a technology problem — it is an infrastructure problem. Smart contracts solve it structurally.

Additionally:
- Bitcoin Ordinals (launched Feb 2023) now allow permanent proof of creative ownership on the most secure ledger in existence
- Polygon (Ethereum L2) makes smart contract execution cost-effective ($0.001–$0.01 per transaction vs. $5–50 on mainnet)
- USDC stablecoins eliminate volatility — all contracts denominated in dollars
- Fiat on-ramp providers (Transak, Stripe) handle KYC/AML globally so Plajah doesn't need a money transmitter license
- The Lightning Network enables sub-cent micropayments to artists in real time

---

## Architecture Overview

```
USER EXPERIENCE LAYER (what users see)
  Plajah UI — no crypto language, no wallets, no complexity
  "Protect your work" | "Earn from licensing" | "Fan Investment" | "Instant tips"

PLAJAH MIDDLEWARE LAYER (what the platform manages)
  blockchainWalletService  — custodial wallets, key management
  blockchainContractService — deploy + call Polygon contracts
  fiatBridgeService        — USD ↔ USDC via Transak/Stripe
  ordinalsService          — Bitcoin Ordinals inscriptions
  featureFlagService       — admin-controlled rollout gates

BLOCKCHAIN LAYER (immutable, always-on)
  Polygon Mainnet:
    PLAJToken.sol           — ERC-20 utility token
    MusicNFT.sol            — Music ownership registry
    ContentNFT.sol          — Books, Film, TV, IP Worlds ownership
    FractionalShares.sol    — Fan investment (fractional ownership)
    LicenseRegistry.sol     — On-chain licensing marketplace
    RoyaltyDistributor.sol  — Automated payment splits
    CollaborativeOwnership.sol — Multi-creator contracts

  Bitcoin:
    Ordinals inscriptions   — Permanent creation timestamps

  Lightning Network:
    Real-time micropayments — sats to creators while content plays

DECENTRALIZED BACKUP LAYER (user nodes — future phase)
  IPFS content nodes       — encrypted audio/video/book chunks
  Peer discovery           — WebRTC-based content delivery
  Node reward contracts    — PLAJ earned for contributing resources
```

---

## Revenue Model (No Mining)

Mining was explicitly removed from this strategy. It is economically marginal and burdens user hardware for negligible return.

### Platform Revenue Streams

| Stream | Mechanism | Plajah Take |
|---|---|---|
| Transaction fee on all platform activity | Baked into every smart contract | 10–15% |
| Creator subscription tiers | Pro ($9.99/mo), Studio ($29.99/mo) | 100% of sub revenue |
| Minting / inscription service fee | Markup on gas cost + service | $3–12 per action |
| Fiat ↔ USDC conversion spread | Exchange rate margin on on-ramp/off-ramp | 0.5–1.5% |
| Enterprise licensing portal | Bulk API for labels, studios, publishers | $199–999/month |
| DeFi advance interest spread | Lend against royalties at 8–15% APR | 4–8% margin |
| Data licensing | Verified on-chain analytics sold to brands | $500–5,000/month |
| White-label infrastructure | Other platforms using Plajah contract rails | SaaS pricing |
| PLAJ token treasury appreciation | Platform holds portion of PLAJ supply | Long-term asset |

### One-Time Fees (Paid Once, Permanent)

| Action | Cost | Permanence |
|---|---|---|
| Deploy smart contract template | $50–200 MATIC gas (Plajah pays) | Serves all users forever |
| Mint NFT (Music, Film, Book) | $0.01–0.50 gas + $3–5 service fee | Permanent on-chain record |
| Bitcoin Ordinal inscription | $5–15 BTC fees + $5 service fee | Exists as long as Bitcoin exists |
| Open Lightning channel | $5–20 BTC fees (Plajah infrastructure) | Active for months per channel |

---

## The Seven Revenue Strategies for Creators

### Strategy 1 — Lightning Network Streaming Micropayments
Tiny Bitcoin payments flow to creators in real time as content is consumed. Artist gets paid per second of listening. No monthly royalty check. No 90-day distributor processing. Money moves as the music plays.

- Music: sats per minute of stream
- Film/TV: sats per minute of viewing
- Books: sats per chapter read (chapter completion triggers payment)
- Journalism: sats per article read
- Lorea scores: sats per measure of score viewed

**Platform cut:** 15% of all Lightning flows routed through platform

### Strategy 2 — Asset Fractionalization (Fan Investment)
Creators sell fractional ownership stakes in their work's future revenue. Fans become investors. Smart contracts distribute earnings proportionally and automatically.

- Music: fractional track royalties
- Film: production investment shares
- Books: translation/adaptation rights shares
- IP Worlds: universe equity
- Taleo talent: athlete endorsement futures

**Platform cut:** 5% of initial sale + 10% of secondary market trades

### Strategy 3 — On-Chain Licensing Marketplace
Brands, studios, publishers, and sync agents license content directly through smart contracts. Price set by creator. Payment instant. Contract immutable.

- Music: sync, commercial, public performance
- Film/TV: broadcast, streaming, international
- Books: translation, adaptation, audiobook
- IP Worlds: character/world licensing for games, merchandise

**Platform cut:** 15% of every license executed

### Strategy 4 — Bitcoin Ordinals (Creation Certificates)
Every creative work's cryptographic fingerprint inscribed permanently on Bitcoin. Immutable proof of authorship and timestamp. Copyright registration that costs $10 and settles in 10 minutes.

- Presented to users as: "Creation Certificate"
- Use cases: dispute resolution, AI training opt-out, publishing record
- Builds Plajah's reputation as creator-protective platform

**Platform cut:** $5 service fee per inscription

### Strategy 5 — Heritage Archives
Detroit-native cultural archives preserved permanently on-chain. Fundable through grants, institutional partnerships, and licensing. Positions Plajah as a cultural institution beyond a tech startup.

- Detroit music archive (Motown, techno, hip-hop origins)
- Detroit literary archive
- Detroit film archive
- Detroit journalism archive
- Detroit IP/creative archive

**Revenue:** Grant funding, institutional licensing, academic access fees

### Strategy 6 — Collaborative Ownership Smart Contracts
Multi-creator projects (bands, film crews, co-authors, journalist teams) define ownership splits at creation. Every revenue stream auto-distributes with no human processing.

- Replaces: label contracts, publishing deals, accountants
- Standard templates: music (artist/producer/engineer), film (director/producer/cast), book (author/illustrator/editor)

**Platform cut:** 10% of all revenue flowing through collaborative contracts

### Strategy 7 — DeFi Creator Advances
Creators with verifiable on-chain revenue history borrow against future earnings. No credit check. No label. No predatory advance terms. Smart contract routes future royalties to repay automatically.

- Available to: artists with 6+ months verified earnings history
- Terms: borrow up to 5× monthly average revenue
- Repayment: smart contract auto-routes until cleared

**Platform cut:** 4–8% interest margin on all advances

---

## Vertical-by-Vertical Implementation

### Music
- Creation Certificates for every track upload
- Collaborative contracts for multi-creator productions
- Lightning tips while listening
- Track fractionalization for fan investment
- Sync licensing portal
- Cora BPM/key data stored as on-chain metadata

### Lorea (Score Library)
- Score minting as Polygon NFT
- Performance licensing via smart contract
- Pay-per-download via Lightning
- Historic scores as fractionalized collectibles

### Books
- Manuscript inscription at creation (proof of authorship)
- Chapter-by-chapter Lightning payments
- Translation/adaptation rights on-chain
- Author advance against pre-order revenue

### Film & TV Series
- Pre-production fractional investment
- Script/footage hash inscribed on Bitcoin at principal photography
- Distribution licensing via smart contract
- Lightning per-minute streaming payments

### Journalism
- Article hash inscribed at publish (anti-censorship, anti-fabrication proof)
- Pay-per-article Lightning micropayments
- Syndication rights on-chain
- Investigation funding via fractional journalism model
- ZK-proof source verification (future phase)

### Taleo (Talent Platform)
- Booking contracts and escrow via smart contract
- Athlete endorsement futures (fractional)
- Portfolio/credentials inscribed on Bitcoin
- Instant post-performance payment via Lightning

### Rello (Social Commerce)
- Community project funding via fractional offerings
- Creator-to-creator Lightning tips
- Community DAOs with PLAJ governance tokens

### IP Worlds
- Universe canonical bible inscribed on Bitcoin
- Character NFTs with revenue rights
- Derivative works licensing (fan art, fan fiction) via micro-contracts
- Cross-world licensing between Plajah IP Worlds
- Fractional world ownership for early believers

---

## Fiat Handling — Global Architecture

**Core principle:** USDC is the universal bridge. All contracts denominated in dollars. Users never hold volatile crypto unless they choose to.

### On-Ramp (USD → USDC → blockchain action)
1. User pays with credit card / Apple Pay / Google Pay / local payment
2. Plajah calls Transak or Stripe fiat-to-crypto API
3. USD converted to USDC at current rate
4. USDC deposited to Plajah contract wallet
5. Smart contract executes
6. User experience: "Payment successful"

### Off-Ramp (blockchain earnings → USD → bank)
1. Creator has USDC balance in custodial Plajah wallet
2. Creator requests bank withdrawal
3. Plajah calls Transak off-ramp API
4. USDC converted to USD
5. ACH/SEPA/local rail sends to bank
6. Creator experience: "Withdrawal sent"

### Global Provider Coverage

| Region | On-ramp Provider | Local Payment Method |
|---|---|---|
| United States | Stripe, Coinbase Commerce | Credit card, ACH, Apple Pay |
| Europe | Transak, MoonPay | SEPA, credit card |
| Nigeria / Africa | MoonPay, Kotani Pay | M-Pesa, mobile money |
| Brazil | Transak | PIX |
| India | Transak | UPI |
| Southeast Asia | Transak | Local bank rails |
| Latin America | Transak, Bitso | Local bank rails |

### Third-Party Access (Brands, Studios, Publishers)

External parties licensing content have three access paths:

1. **Licensing portal** (licensing.plajah.com) — pay with credit card, Plajah handles crypto on backend
2. **Direct contract** — any EVM wallet, pay USDC directly on Polygon
3. **Enterprise API** — HTTP endpoints, monthly USD invoice, Plajah executes on-chain

---

## User Experience Tiers

### Tier 1 — Casual (90% of users)
- Auto-created custodial wallet at signup
- No seed phrases, no crypto UI
- Earn and withdraw in dollars
- All blockchain activity invisible

### Tier 2 — Creator (engaged creators)
- Prompted to use features contextually ("Protect this track?")
- Simple forms generate smart contracts
- Creation Certificates presented as achievements
- Earnings dashboard in dollars with Lightning activity

### Tier 3 — Web3 Native (power users)
- Connect own MetaMask / Rainbow / Phantom wallet
- Direct contract interaction available
- Full on-chain transparency
- Self-custody option for all earnings

---

## Rollout Plan

All features behind feature flags. Zero user visibility until each flag is activated. Admin dashboard shows all feature status.

### Phase 0 — Infrastructure (Current)
- Feature flag system deployed
- Custodial wallet service (no UI)
- Smart contracts deployed to Polygon testnet
- Admin dashboard operational

### Phase 1 — Creation Certificates (First public feature)
- Bitcoin Ordinals inscriptions for track uploads
- Music only, opt-in
- "Protect your work" UI prompt
- No financial transactions yet

### Phase 2 — On-Chain Licensing
- Licensing portal for music
- Smart contract execution with fiat payments
- Enterprise API access
- Extend to Film + Books

### Phase 3 — Fan Investment
- Music fractionalization (track royalty shares)
- Film pre-production investment
- Book rights shares

### Phase 4 — Lightning Tips
- Micro-tipping while listening/watching/reading
- Artist Lightning wallets
- Real-time earnings display

### Phase 5 — Full Ecosystem
- All verticals live
- Cross-vertical PLAJ token economy
- DeFi advances
- Decentralized node network

---

## Hardware Requirements

**None required to launch.** Everything runs in software:

| Component | Software Implementation |
|---|---|
| Lightning Network node | LND daemon on Plajah's existing server |
| Smart contracts | Solidity deployed to Polygon, no server hardware |
| Bitcoin Ordinals | `ord` CLI tool on server |
| IPFS content nodes | go-ipfs daemon |
| Key management | AWS KMS (cloud HSM) for custody |

Optional at scale: dedicated VPS for Lightning node (~$20–40/month with static IP).

---

## Competitive Positioning

| Platform | What They Do | What Plajah Does Differently |
|---|---|---|
| Spotify | Stream, pay $0.003/stream after 6 months | Lightning pays $0.01/minute instantly |
| Audius | Decentralized music, complex UX | Hybrid: centralized UX, decentralized backend |
| Royal.io | Music fractionalization for established artists | Accessible at $2–$20 share price for independent artists |
| Sound.xyz | NFT-based music releases | Full ecosystem across all creative verticals |
| Mirror.xyz | Writing NFTs | Integrated across all Plajah verticals with fiat support |

Plajah is the only platform integrating all of these strategies across Music, Film, TV, Books, Journalism, and IP Worlds — with a fiat-first UX that doesn't require crypto knowledge.

---

## Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| PLAJ token classified as security | Structure as utility token only; no profit promise; legal review before launch |
| Fiat on-ramp KYC friction | Transak handles KYC; Plajah never touches user financial data |
| Smart contract exploit | Audited contracts (OpenZeppelin); bug bounty program; upgradeable proxy pattern |
| Regulatory uncertainty (global) | Jurisdictional filtering; compliance monitoring; legal counsel per market |
| User confusion about crypto | Language policy: never say blockchain/wallet/gas to Tier 1 users |
| Polygon network congestion | Fallback to Polygon zkEVM or Base |

---

*Document maintained by: Plajah Core Team*
*Access: Admin-level only — not for public distribution*
