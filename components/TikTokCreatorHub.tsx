import React, { useState } from 'react';
import { Zap, TrendingUp, Music, Film, Share2, Download, Copy, ExternalLink, CheckCircle, Clock, DollarSign, Users, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── TikTok Creator Win Strategy ──────────────────────────────────────────────
//
// WHY TIKTOK CREATORS ARE THE TARGET:
//  - 1B+ monthly active users → TikTok music creators reach massive audiences
//    but earn fractions of a cent per stream when fans go to Spotify
//  - TikTok sound creators ("SoundOn" artists) have zero monetization for
//    the actual audio — all revenue goes to the platform
//  - Film creators on TikTok can't monetize long-form content at all
//  - TikTok's algorithm can kill an account overnight — no owned audience
//
// THE PITCH (one-line per segment):
//  Music: "TikTok made you famous. Plajah makes you money."
//  Film:  "TikTok gave you 100k views. Plajah gives you a FAST channel."
//  Writer: "TikTok BookTok built your audience. Plajah pays them to subscribe."
//
// THE WORKFLOW:
//  TikTok creator posts short clips → drives traffic to Plajah
//  On Plajah: full song / film / book behind a Sanctuary membership
//  Fan tips, subscribes, buys merch → creator keeps 90%
//  Creator re-posts their Plajah profile link in TikTok bio

const MUSIC_STRATEGIES = [
  {
    icon: Music,
    hook: '"TikTok made you famous. Plajah makes you money."',
    steps: [
      'Post 15-sec preview clip on TikTok with Plajah link in bio',
      'Full track lives on Plajah — play it free, or unlock early access via Sanctuary',
      'Enable Artist Radio so the algorithm auto-builds your station',
      'Fans who convert earn PlajahBucks by finding hidden tracks (Hide N Seek)',
    ],
    metric: 'Avg $3.20/month per subscribing fan vs $0.003/stream on Spotify',
  },
  {
    icon: TrendingUp,
    hook: 'The "TikTok-to-owned-audience" funnel',
    steps: [
      'Use TikTok to grow — Plajah to monetize. They aren\'t in competition.',
      'Every Plajah profile has a shareable URL that works as a link-in-bio',
      'When you go viral, your Plajah memberships capture the spike — not just streams',
      'TikTok can ban your account. Plajah subscribers are yours forever.',
    ],
    metric: 'One 1M-view TikTok video → 1,000 Plajah clicks → ~50 Sanctuary members = $500/mo recurring',
  },
];

const FILM_STRATEGIES = [
  {
    icon: Film,
    hook: '"TikTok gave you 100k views. Plajah gives you a FAST channel."',
    steps: [
      'Post 60-sec film trailers and BTS clips on TikTok',
      'Full film streams on your 24/7 Plajah FAST channel — no gatekeeper',
      'Set mid-roll ad markers inside your films for passive ad revenue',
      'License clips to other TikTok creators via Plajah\'s cross-creator licensing',
    ],
    metric: 'A FAST channel with 10 films running 24/7 can generate $200–800/mo in ad revenue',
  },
];

const CAPTION_TEMPLATES: Record<string, string[]> = {
  music: [
    "full song is on plajah — link in bio 🎵 #newmusic #indieartist",
    "can't put the full track here bc TikTok will mute it 🙃 it's on my Plajah for free — link in bio",
    "y'all asked for the full version — it's up on Plajah with the stems too. link in bio #producer #musicproduction",
    "Plajah pays me 90% of every tip. Spotify pays $0.003. just saying. link in bio",
    "join my Sanctuary on Plajah for early access + stems + the demos 🎧 link in bio",
  ],
  film: [
    "full short film is on my Plajah channel — streaming 24/7. link in bio 🎬",
    "my FAST channel has [X] films running around the clock — no subscription needed. link in bio #indiefilm",
    "premiering on my Plajah channel this Saturday — set a reminder. link in bio",
    "festival screener mode is wild — DM me or hit the link in bio to watch",
    "the full documentary is on Plajah. no gatekeepers. no aggregators. link in bio #documentary",
  ],
  writer: [
    "the full essay is on my Plajah — link in bio 📖 #BookTok #writer",
    "chapter 1 is free on Plajah. full book is $4.99 — also in my bio",
    "my newsletter, articles, AND the podcast are all on Plajah now. one link in bio",
    "Substack keeps 10% of my revenue. Plajah keeps 10%. at least Plajah also gives me a podcast tab lol. link in bio",
  ],
};

const TIKTOK_TACTICS = [
  { title: 'Link-in-bio funnel', body: 'Your Plajah profile URL IS your link-in-bio. One link — music, video, merch, membership, all live.' },
  { title: 'Duet-friendly music', body: 'TikTok\'s duet/stitch feature works best with tracks under 60s. Upload the full song on Plajah, post the hook on TikTok.' },
  { title: 'Cross-post to Bluesky + Mastodon', body: 'Every Plajah post can broadcast to Mastodon and Bluesky via Fediverse — hit creator communities that don\'t use TikTok.' },
  { title: 'Viral moment monetization', body: 'When a clip goes viral, your Plajah memberships capture the spike. Email all new visitors with a Sanctuary pitch.' },
  { title: 'TikTok LIVE → Plajah FAST', body: 'After a TikTok LIVE, download it and schedule it as a FAST channel broadcast on Plajah. One live session = 24/7 content.' },
  { title: 'Collab with other creators', body: 'License your film clips or music to other creators\' FAST channels via Plajah. Cross-creator discovery + passive income.' },
];

type Segment = 'music' | 'film' | 'writer';

export default function TikTokCreatorHub() {
  const [activeSegment, setActiveSegment] = useState<Segment>('music');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyCaption = async (caption: string, idx: number) => {
    await navigator.clipboard.writeText(caption);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const strategies = activeSegment === 'music' ? MUSIC_STRATEGIES : activeSegment === 'film' ? FILM_STRATEGIES : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-pink-500/10 border border-pink-500/30 rounded-full px-4 py-1.5 text-sm text-pink-400 mb-4">
          <Zap size={14} />
          TikTok Creator Strategy
        </div>
        <h2 className="text-2xl font-black mb-2">Win TikTok creators to Plajah</h2>
        <p className="text-white/50 text-sm max-w-xl mx-auto">
          TikTok grows audiences. Plajah monetizes them. These two platforms work together —
          use TikTok for discovery, Plajah for sustainable revenue.
        </p>
      </div>

      {/* Segment selector */}
      <div className="flex bg-white/[0.03] border border-white/5 rounded-xl p-1 gap-1">
        {(['music', 'film', 'writer'] as Segment[]).map((s) => (
          <button
            key={s}
            onClick={() => setActiveSegment(s)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeSegment === s
                ? 'bg-pink-500 text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {s === 'writer' ? 'Writers / BookTok' : `${s.charAt(0).toUpperCase()}${s.slice(1)}`}
          </button>
        ))}
      </div>

      {/* Strategies */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSegment}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-4"
        >
          {strategies.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
              <h3 className="font-bold mb-2 text-emerald-400">"TikTok BookTok built your audience. Plajah pays them to subscribe."</h3>
              <p className="text-sm text-white/50 mb-4">
                BookTok writers have 100k+ engaged followers but no owned platform. Plajah gives you a
                subscriber list, a reading room, a podcast tab, and recurring revenue — all behind your TikTok bio link.
              </p>
              <div className="space-y-2">
                {[
                  'Post chapter 1 teaser on TikTok → full book on Plajah ($4.99 or free with membership)',
                  'Run a reading club via Plajah\'s Club feature — fans pay monthly to read and discuss together',
                  'Cross-post your newsletter via Postman to Plajah + Mastodon + Bluesky simultaneously',
                  'BookTok Q&A on TikTok LIVE → record and host the replay as a Plajah article + podcast episode',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-white/70">
                    <span className="text-emerald-400 shrink-0">→</span>
                    {step}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-emerald-500/10 rounded-xl text-xs text-emerald-400">
                1 viral BookTok → 2,000 Plajah clicks → ~80 Sanctuary readers at $4.99/mo = $400/mo recurring
              </div>
            </div>
          ) : (
            strategies.map((strategy, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-3">
                  <strategy.icon size={18} className="text-pink-400 mt-0.5 shrink-0" />
                  <h3 className="font-bold text-sm">{strategy.hook}</h3>
                </div>
                <div className="space-y-2 mb-4">
                  {strategy.steps.map((step, j) => (
                    <div key={j} className="flex items-start gap-2 text-sm text-white/60">
                      <ArrowRight size={14} className="text-pink-400 mt-0.5 shrink-0" />
                      {step}
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-pink-500/10 rounded-xl text-xs text-pink-300">
                  {strategy.metric}
                </div>
              </div>
            ))
          )}
        </motion.div>
      </AnimatePresence>

      {/* Caption templates */}
      <div>
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <Copy size={16} className="text-pink-400" />
          Ready-to-post TikTok captions for {activeSegment} creators
        </h3>
        <div className="space-y-2">
          {(CAPTION_TEMPLATES[activeSegment] ?? []).map((caption, idx) => (
            <div
              key={idx}
              className="bg-white/[0.03] border border-white/5 rounded-xl p-4 flex items-start justify-between gap-4"
            >
              <p className="text-sm text-white/70 flex-1">{caption}</p>
              <button
                onClick={() => copyCaption(caption, idx)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/50 hover:bg-white/10 transition-colors"
              >
                {copiedIdx === idx ? (
                  <><CheckCircle size={12} className="text-green-400" /> Copied</>
                ) : (
                  <><Copy size={12} /> Copy</>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* General TikTok tactics */}
      <div>
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-pink-400" />
          Universal TikTok → Plajah tactics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TIKTOK_TACTICS.map(({ title, body }) => (
            <div key={title} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="font-medium text-sm mb-1">{title}</div>
              <div className="text-xs text-white/40">{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue comparison */}
      <div className="bg-gradient-to-r from-pink-500/10 to-orange-500/10 border border-pink-500/20 rounded-2xl p-6">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-orange-400" />
          Revenue reality check
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-white/40 text-xs mb-2">TikTok SoundOn / Creator Fund</div>
            <div className="text-red-400 font-bold">$0.02–0.04 per 1,000 views</div>
            <div className="text-white/30 text-xs mt-1">Algorithm controls reach. No memberships. No direct payments.</div>
          </div>
          <div>
            <div className="text-white/40 text-xs mb-2">Plajah Sanctuary Membership</div>
            <div className="text-green-400 font-bold">$4.99–19.99/mo per subscriber</div>
            <div className="text-white/30 text-xs mt-1">You keep 90%. Algorithm doesn't control it. Yours forever.</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/40">
          <span className="text-orange-400 font-bold">The math:</span> 200 TikTok fans subscribing at $4.99/mo = $898.20/mo. That requires 22,000,000 TikTok views to earn the same from their Creator Fund.
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <a
          href="#waitlist"
          className="inline-flex items-center gap-2 px-6 py-3 bg-pink-500 text-white font-bold rounded-xl hover:bg-pink-400 transition-colors"
        >
          <Users size={16} />
          Claim a Founding Creator spot
        </a>
        <p className="mt-2 text-xs text-white/25">100 founding spots — free Creator Pro for life</p>
      </div>
    </div>
  );
}
