import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ChevronRight } from 'lucide-react';

// ── Data ──────────────────────────────────────────────────────────────────────

const SUPERPOWERS = [
  { num: '01', color: '#3DFFC0', icon: '🎬', title: 'Science as Living Media', subtitle: 'not static papers',
    body: 'On ResearchGate you upload a PDF and wait for citations. On Plajah, your research is media: it has a feed presence, a comment thread that updates in real time, a Muse translation for non-specialists, a replication scoreboard, and it can go viral in the broader culture — all while being fully citable and versioned.',
    why: 'Only possible on Plajah: A media platform\'s reach + a scientific platform\'s trust infrastructure, fused. ResearchGate has no culture. Twitter has no rigor. Plajah has both.' },
  { num: '02', color: '#E8B84B', icon: '🌐', title: 'Public Replication', subtitle: 'crowdsourced verification in real time',
    body: 'Publish a finding. Anyone on the platform — anywhere on Earth, any institution — can attempt a replication and submit structured results. You watch your reproducibility score update live. Failed replications open investigation threads. Successful ones build your career score.',
    why: 'Only possible on Plajah: Replication needs a community. A community needs a platform. The platform needs to be built for it from the schema up.' },
  { num: '03', color: '#FF4D6A', icon: '🔗', title: 'Cross-Discipline Discovery', subtitle: 'serendipity at scale',
    body: 'A materials scientist posts about silicate grain boundary behavior. A civil engineer building in a seismic zone is working on the same problem. A geologist has field data that\'s directly relevant. On every other platform, these people never find each other. On Plajah, Muse surfaces the connection.',
    why: 'Only possible on Plajah: Requires a unified platform where all 13 disciplines exist together, with a graph that reads across all of them, and an AI agent with full platform context.' },
  { num: '04', color: '#4DB8FF', icon: '📡', title: 'Instrument-to-Post Pipeline', subtitle: 'field data as social content',
    body: 'A geologist in the field opens the Plajah PWA. GPS locks. They take a photo of an outcrop. The app auto-queries Macrostrat for the formation, attaches USGS seismic history for that location, pulls the local weather from Open-Meteo, and creates a structured post — all before they have cell signal.',
    why: 'Only possible on Plajah: Requires offline PWA + GPS + free API enrichment layer + structured post schema + social distribution — all integrated.' },
  { num: '05', color: '#A78BFA', icon: 'μ', title: 'Muse: AI That Bridges Science and Culture', subtitle: 'universally',
    body: 'When a climate scientist posts technical findings, Muse auto-generates a plain-language translation — accurate, not dumbed down — that any curious person can read. The scientific community gains public reach without sacrificing rigor. The public gains accurate science without needing a PhD.',
    why: 'Only possible on Plajah: Muse has context across both scientific and general feeds, user discipline profiles, live data, and the full post history.' },
  { num: '06', color: '#FF8C42', icon: '📜', title: 'The Grey Literature Revolution', subtitle: 'invisible knowledge made visible',
    body: 'Most scientific knowledge never gets published: failed experiments, field logs, site reports, unpublished datasets. On Plajah, these are first-class posts with DOI-like permanent links, structured metadata, and full community engagement. 80% of science that currently disappears — doesn\'t.',
    why: 'Only possible on Plajah: Requires a platform where informal scientific content is treated with the same data structure as formal papers — with claim tags, confidence levels, and permanent citable links.' },
  { num: '07', color: '#7EC8A0', icon: '🏛️', title: 'Version-Controlled Scientific Discourse', subtitle: 'decisions that don\'t disappear',
    body: 'A civil engineering team debates a load specification in a Plajah thread. They reach consensus. The decision is committed with a hash, the rationale is preserved, and it\'s linked to the design document. Three years later, the full debate is there — timestamped, attributed, immutable.',
    why: 'Only possible on Plajah: Requires version-controlled discussions natively integrated with the post and document layer. No existing platform combines social discourse with immutable decision versioning.' },
  { num: '08', color: '#3DFFC0', icon: '🎯', title: 'Contribution-Based Reputation', subtitle: 'earned, not claimed',
    body: 'LinkedIn lets anyone call themselves an expert. ResearchGate uses citation count — gamed constantly. Plajah\'s expertise graph is built from actual platform behavior: posts you wrote, replications you confirmed, peer reviews you gave. A first-year PhD student who posts extraordinary field data outranks a tenured professor who posts nothing.',
    why: 'Only possible on Plajah: Requires a graph database reading across all platform activity in real time. No other platform has both the activity data AND the scientific structure to make this meaningful.' },
  { num: '09', color: '#E8B84B', icon: '🌿', title: 'Longitudinal Science', subtitle: 'the platform remembers',
    body: 'An ecologist starts a phenology monitoring thread in 2026. Every spring, they and others add new observations. By 2031, the thread is a 5-year longitudinal dataset — searchable, citable, graphable. The platform itself becomes a scientific instrument.',
    why: 'Only possible on Plajah: Requires permanent API snapshots baked into every post, thread-linked longitudinal tagging, and a social platform that makes contributing observations feel natural.' },
  { num: '10', color: '#FF4D6A', icon: '🔬', title: 'Lab Notebook to Viral Post', subtitle: 'one continuous workflow',
    body: 'Plajah\'s writing tools create a seamless continuum: private lab notebook → shared team workspace → pre-print post → peer-reviewed paper → public feed post → Muse-translated viral science moment. Every step happens on the same platform with the same identity.',
    why: 'Only possible on Plajah: The notebook → paper → post → feed pipeline requires all four to be natively integrated in one platform. Currently these live in 4 separate applications.' },
  { num: '11', color: '#4DB8FF', icon: '⚡', title: 'Real-Time Science Events', subtitle: 'living participation',
    body: 'A major earthquake hits. Plajah\'s USGS integration instantly alerts geologists. A Nowcast thread opens. Meteorologists post model updates. Geologists post field observations. Muse synthesizes a public-facing summary as it evolves. After the event, the thread automatically becomes a structured case study — citable by future students.',
    why: 'Only possible on Plajah: Requires live API monitoring + Muse alerting + discipline-specific communities + real-time collaborative threads + public media reach — all in one platform simultaneously.' },
  { num: '12', color: '#A78BFA', icon: '🤝', title: 'Taxonomy-Deep Collaboration Matching', subtitle: 'beyond shared interests',
    body: 'LinkedIn connects people who work in "chemistry." Plajah connects people who work on "palladium-catalyzed cross-coupling reactions in flow chemistry systems for continuous manufacturing." The taxonomy goes 5 levels deep. A researcher with a specific open problem gets matched to the exact person on the platform.',
    why: 'Only possible on Plajah: Requires a technical taxonomy tree built into the platform from the data model up, plus an expertise graph built from actual posts — not self-reported skills.' },
];

const SCENARIOS = [
  { num: '01', tag: 'Ecology · Field Science', tagColor: '#3DFFC0', title: 'The Phenology Discovery That Goes Mainstream',
    body: 'Dr. Vasquez is doing spring phenology monitoring in Michigan. She opens Plajah Field Mode. Her GPS locks, she photographs a blooming cherry tree, types "18 days early vs 30yr mean." The app auto-fetches February temperature anomaly from Open-Meteo (+2.1°C) and attaches it. She hits post. Two other ecologists in Wisconsin and Ontario post similar observations within the hour — Muse detects the cluster and surfaces it as a "Pattern Alert." By afternoon, a science journalist sees the Muse-translated version: "Cherry blossoms blooming nearly 3 weeks early across Great Lakes — scientists tracking it live on Plajah." It reaches 80,000 people. Dr. Vasquez gains 400 followers, 12 replication requests, and a DM from a climatologist who has exactly the long-term temperature data she needs to publish.',
    unique: 'The field observation → auto-enrichment → cluster detection → Muse translation → viral public moment → researcher connection — as a single unbroken workflow on one platform, credited at every step.' },
  { num: '02', tag: 'Materials Science × Civil Engineering', tagColor: '#A78BFA', title: 'The Cross-Discipline Collision That Saves a Bridge',
    body: 'Dr. Osei posts her superconductor XRD findings. Muse reads her post and cross-references the expertise graph — it finds Dr. Kim, a civil engineer, posted an open question about concrete aggregate degradation under thermal cycling. The grain boundary behavior in Dr. Osei\'s ceramic data is mechanistically identical to Dr. Kim\'s concrete problem, just at a different scale. Muse sends both researchers a "Cross-Discipline Connection" notification. They meet in a Plajah DM, start a collaborative workspace, and within two months have a co-authored paper that directly informs a bridge maintenance protocol in Seoul.',
    unique: 'Mechanical matching across disciplines requires all 13 fields in one platform with a unified expertise graph and an AI that reads across all of them. No siloed tool can make this connection.' },
  { num: '03', tag: 'Archaeology · History', tagColor: '#FF4D6A', title: 'The Grey Literature That Changes the Textbook',
    body: 'An archaeologist in Turkey uploads a 1974 site report from an excavation that was never formally published — the team ran out of funding. Three other archaeologists recognize the pottery typology — it predates what\'s currently in the literature by 400 years. A historian of the Byzantine period sees Muse\'s plain-language summary and realizes it changes the prevailing understanding of trade routes. Within a week, the 50-year-old report has 34 citations, the original excavator (now 82, still alive) has been contacted and adds a commentary post.',
    unique: 'Grey literature with permanent citable links, community peer engagement, Muse translation for cross-discipline reach, and credit to the original contributor — all in one system.' },
  { num: '04', tag: 'Meteorology · Real-Time Event', tagColor: '#4DB8FF', title: 'The Storm That Gets Scientifically Documented Live',
    body: 'A derecho is developing over Iowa. Plajah\'s NOAA integration detects the 992mb mesoscale convective system and Muse sends alerts to 340 meteorologists. A Nowcast Thread opens. Forecasters post model comparisons (GFS vs EURO vs NAM). Storm chasers post GPS-tagged field observations. Civil engineers post real-time infrastructure stress data. Muse synthesizes all contributions into a public-facing event post that 200,000 Plajah users read as the storm unfolds. After the event, the thread automatically becomes a structured case study — citable by future meteorology students as a real-time primary source.',
    unique: 'Live multi-discipline real-time event documentation that is simultaneously a scientific instrument, a social event, and a public media moment — then automatically becomes a permanent, citable scientific record.' },
  { num: '05', tag: 'Mathematics · Open Problem', tagColor: '#E8B84B', title: 'The Conjecture That Gets Solved in Public',
    body: 'A mathematician posts a conjecture to the Plajah Math Labs Open Questions board. Within 48 hours, a grad student in Singapore has posted a partial proof attempt with claim tags on each logical step. A second mathematician from Brazil spots a flaw in step 4 and posts a structured review comment. Over 3 weeks, 7 mathematicians across 5 countries iterate on the proof in a version-controlled thread. When the proof is complete, the thread is automatically exportable as a co-authored paper in LaTeX.',
    unique: 'Collaborative proof development with version control, claim tagging on individual logical steps, structured review, transparent attribution, and one-click paper export — as a social, public, real-time event.' },
];

const HOOKS = [
  { title: 'Post Schema Extension', system: 'Data Layer · Existing Post Model',
    code: `Post {\n  // existing fields...\n  science_meta: {\n    claim_type: ClaimType?,\n    confidence: Float?,\n    discipline: Discipline[],\n    repro_score: Float?,\n    api_snapshot: JSONBlob?,\n    dependencies: Post[]\n  }\n}`,
    desc: 'Add science_meta as an optional field on Plajah\'s existing post model. Posts without it behave identically to today. Posts with it gain the full science layer — feed ranking, Muse analysis, replication tracking — all opt-in.' },
  { title: 'Comment Type Extension', system: 'Comment System · Universal Thread Layer',
    code: `enum CommentType {\n  REPLY,        // existing\n  REACTION,     // existing\n  REPLICATION,  // new ✦\n  PEER_REVIEW,  // new ✦\n  EXTENSION,    // new ✦\n  ARIA_SUMMARY  // new ✦ (auto-generated)\n}`,
    desc: 'New comment types extend Plajah\'s existing universal comment system without breaking it. All render in existing threads. Replication and PeerReview types feed the reproducibility engine automatically when submitted.' },
  { title: 'Renderer Plugin System', system: 'Rich Writing Tools · Existing Editor',
    code: `registerRenderer({\n  detect: (input) => isSmiles(input),\n  render: (input) => MoleculeViewer3D,\n  contexts: ['post', 'comment', 'message']\n})\n// Same pattern for LaTeX, CIF, FASTA, coords`,
    desc: 'The science renderers (LaTeX, SMILES, crystal structures, sequences, geo overlays) plug into Plajah\'s existing rich writing tool as a renderer plugin system.' },
  { title: 'Muse Hook into Messaging', system: 'Messaging Layer · Existing DM & Group Chat',
    code: `onMention('@Muse', async (ctx) => {\n  const context = await buildContext({\n    thread: ctx.thread,\n    linkedPosts: ctx.linkedPosts,\n    disciplines: ctx.participants.disciplines,\n    liveData: await fetchRelevantFeeds(ctx)\n  })\n  return Muse.respond(ctx.query, context)\n})`,
    desc: 'Muse drops into Plajah\'s existing messaging system via a @mention hook. It has full context: the message thread, linked posts, participant discipline profiles, and relevant live data feeds.' },
  { title: 'API Enrichment Middleware', system: 'Post Creation Pipeline · Background Worker',
    code: `postCreationPipeline\n  .use(validateContent)     // existing\n  .use(processMedia)        // existing\n  .use(scienceEnricher)     // new ✦\n  .use(distributeToFeeds)   // existing\n\nasync scienceEnricher(post) {\n  if (!post.science_meta) return post\n  post.api_snapshot = await enrichAll(post)\n}`,
    desc: 'The API enrichment layer inserts as middleware in Plajah\'s existing post creation pipeline. It only fires when science_meta is present — zero performance impact on regular posts.' },
  { title: 'Feed Ranking Signal', system: 'Feed Algorithm · Existing Ranking System',
    code: `score(post, user) {\n  base = existingEngagementScore(post)\n  if (!post.science_meta) return base\n  sciBoost = weighted(\n    post.repro_score * 0.3,\n    disciplineMatch(post, user) * 0.4,\n    expertiseRelevance(post, user) * 0.3\n  )\n  return base + sciBoost\n}`,
    desc: 'Science signals extend Plajah\'s existing feed ranking algorithm as additive weights. Regular content ranking is unchanged. Scientists see more relevant science.' },
  { title: 'Collaborative Workspace Extension', system: 'Collab Tools · Existing Workspace Foundation',
    code: `Workspace {\n  // existing: members, files, messages\n  labNotebook: NotebookEntry[],  // new\n  paperDraft: PaperDraft?,        // new\n  openQuestions: Question[],     // new\n  replicationLog: Replication[]  // new\n}`,
    desc: 'Lab notebook, paper drafting, and replication logging extend Plajah\'s existing collaborative workspace model. The existing members, permissions, and messaging infrastructure is reused.' },
  { title: 'Profile Expertise Graph', system: 'User Profile · Existing Profile System',
    code: `computeExpertise(userId, topic) {\n  signals = [\n    postsOnTopic(userId, topic),\n    citationsReceived(userId, topic),\n    replications(userId, topic),\n    reviewsGiven(userId, topic)\n  ]\n  return weightedScore(signals)\n}\n// Exposed on existing profile page`,
    desc: 'The expertise graph reads from Plajah\'s existing activity data — posts, citations, reviews — and surfaces the computed expertise on the existing user profile.' },
];

type CellVal = boolean | 'partial';
const COMPARISON: { cap: string; rg: CellVal; gh: CellVal; tw: CellVal; sl: CellVal; ol: CellVal }[] = [
  { cap: 'Science as living media with public reach',       rg: false, gh: false, tw: 'partial', sl: false, ol: false },
  { cap: 'Real-time public replication tracking',          rg: false, gh: false, tw: false,     sl: false, ol: false },
  { cap: 'Cross-discipline AI matchmaking',                rg: false, gh: false, tw: false,     sl: false, ol: false },
  { cap: 'Field data → social post pipeline',              rg: false, gh: false, tw: 'partial', sl: false, ol: false },
  { cap: 'AI plain language for general audiences',        rg: false, gh: false, tw: false,     sl: false, ol: false },
  { cap: 'Grey literature with permanent citable links',   rg: 'partial', gh: false, tw: false, sl: false, ol: false },
  { cap: 'Version-controlled scientific discussion',       rg: false, gh: 'partial', tw: false, sl: false, ol: 'partial' },
  { cap: 'Contribution-based expertise scoring',           rg: 'partial', gh: 'partial', tw: false, sl: false, ol: false },
  { cap: 'Longitudinal data accumulation in threads',      rg: false, gh: false, tw: false,     sl: false, ol: false },
  { cap: 'Notebook → paper → post → feed pipeline',       rg: false, gh: false, tw: false,     sl: false, ol: 'partial' },
  { cap: 'Live event scientific documentation',            rg: false, gh: false, tw: 'partial', sl: false, ol: false },
  { cap: 'Deep taxonomy collaboration matching',           rg: 'partial', gh: false, tw: false, sl: false, ol: false },
];

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'transform' | 'superpowers' | 'scenarios' | 'codebase' | 'comparison';

interface PlajahResearchPageProps {
  onBack: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'transform',    label: 'The Transformation' },
  { id: 'superpowers',  label: 'Research Superpowers' },
  { id: 'scenarios',    label: 'Real Scenarios' },
  { id: 'codebase',     label: 'Codebase Hooks' },
  { id: 'comparison',   label: 'Why Nowhere Else' },
];

function Cell({ v }: { v: boolean | 'partial' }) {
  if (v === 'partial') return <span className="text-[#E8B84B] font-bold">½</span>;
  if (v) return <span className="text-[#3DFFC0] font-bold">✓</span>;
  return <span className="text-white/15">✗</span>;
}

const PlajahResearchPage: React.FC<PlajahResearchPageProps> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('transform');
  const navRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view in the sticky nav
  useEffect(() => {
    const active = navRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [tab]);

  return (
    <div className="min-h-screen text-white">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden min-h-[60vh] flex flex-col justify-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[#3DFFC0]/4 rounded-full blur-[140px]" />
          <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-[#A78BFA]/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative px-6 lg:px-16 py-12 max-w-7xl mx-auto w-full">
          <button onClick={onBack} className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white mb-8 transition-colors">
            <ArrowLeft size={13} /> Back to Plajah Labs
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3DFFC0]/10 border border-[#3DFFC0]/20 mb-6">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0]">Plajah Platform Strategy · Research Layer</span>
          </div>

          <h1 className="text-5xl lg:text-8xl font-black leading-[0.9] mb-6" style={{ letterSpacing: '-3px' }}>
            What <span className="text-[#3DFFC0] italic">researchers</span> can do<br />
            on Plajah that they<br />
            <span className="text-white/20">can't do anywhere else.</span>
          </h1>

          <p className="text-lg lg:text-xl text-white/35 max-w-2xl leading-relaxed italic mb-10" style={{ fontFamily: 'Georgia, serif' }}>
            Plajah is a media platform. That's the key — not a journal, not a repository, not a productivity tool. A living, breathing media platform where scientific work becomes media, media becomes science, and the line between public culture and research dissolves.
          </p>

          <div className="flex flex-wrap gap-8">
            {[
              { n: '13', l: 'Disciplines natively supported' },
              { n: '14', l: 'Free live data APIs wired in' },
              { n: '∞',  l: 'Reach: science × culture × public' },
              { n: '1',  l: 'Platform that does all of it' },
            ].map(s => (
              <div key={s.l} className="border-l border-white/15 pl-5">
                <p className="text-3xl font-black text-white">{s.n}</p>
                <p className="text-[9px] text-white/30 uppercase tracking-widest mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sticky tab nav ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-2xl border-b border-white/6">
        <div ref={navRef} className="flex overflow-x-auto no-scrollbar px-6 lg:px-16 max-w-7xl mx-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${
                tab === t.id ? 'border-[#3DFFC0] text-[#3DFFC0]' : 'border-transparent text-white/25 hover:text-white/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section bodies ────────────────────────────────────────────────── */}
      <div className="px-6 lg:px-16 py-16 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {/* ─── TRANSFORM ─────────────────────────────────────────────── */}
          {tab === 'transform' && (
            <motion.div key="transform" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Section 01</p>
              <h2 className="text-4xl lg:text-6xl font-black mb-3" style={{ letterSpacing: '-2px' }}>
                How Science <span className="text-[#3DFFC0] italic">transforms</span><br />the Plajah experience
              </h2>
              <p className="text-base text-white/35 italic max-w-2xl mb-12 border-l-2 border-white/15 pl-5 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                Adding researchers to a media platform doesn't just add a new user type — it fundamentally upgrades what the platform is capable of for everyone.
              </p>

              {/* Before / After grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-px mb-12 bg-white/6 rounded-2xl overflow-hidden">
                <div className="bg-[#0D0F14] p-8">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-6">Plajah without Science Layer</p>
                  {['Posts are opinions, stories, media, creativity',
                    'Comments are reactions, thoughts, takes',
                    'Trending = most engagement in last hour',
                    'Truth has no mechanism — just likes',
                    'Data is screenshots and infographics',
                    'Expertise is self-reported or follower-count',
                    'Collaboration is DMs and vibes',
                    'News breaks then disappears',
                    'Media and knowledge exist in separate apps'
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                      <span className="text-white/20 shrink-0 mt-0.5">—</span>
                      <span className="text-[12px] text-white/50">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-[#12151C] p-8">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] mb-6">Plajah with Science Layer</p>
                  {['Posts carry verifiable claims with confidence levels and source chains',
                    'Comments can replicate, review, or formally extend the original work',
                    'Trending + Verified = high engagement AND high reproducibility score',
                    'Truth has a mechanism: replication, peer review, and expertise graph weighting',
                    'Data is live, interactive, citable, and attached to real instruments',
                    'Expertise is inferred from actual contributions — not claimed',
                    'Collaboration has a formal scaffold: workspace, notebook, paper, match',
                    'Events accumulate into longitudinal records — the platform remembers',
                    'Knowledge and culture are one feed — with Muse bridging them'
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                      <span className="text-[#3DFFC0] shrink-0 mt-0.5">✦</span>
                      <span className="text-[12px] text-white/70">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pull quote */}
              <blockquote className="border-l-4 border-[#3DFFC0] pl-8 py-2 mb-12 bg-[#3DFFC0]/2 rounded-r-2xl">
                <p className="text-xl lg:text-2xl text-white/55 italic leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                  "Plajah becomes the first platform where a geologist can share a field observation in the morning, a materials scientist on the other side of the world builds on it by afternoon, a journalist covers it by evening — and every step is on the same platform, fully linked, fully credited."
                </p>
              </blockquote>

              {/* Feed comparison */}
              <h3 className="text-xl font-black mb-2">The Feed Transformation</h3>
              <p className="text-[11px] text-white/30 mb-6">This is what changes for every Plajah user — not just scientists — when the science layer is live.</p>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_40px_1fr] gap-0 items-start rounded-2xl overflow-hidden border border-white/6">
                <div className="bg-[#0D0F14]">
                  <div className="px-5 py-3 border-b border-white/6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Standard Media Platform Feed</p>
                  </div>
                  {[
                    { meta: '@journalist · 2h', body: 'Breaking: New study says coffee causes cancer. Again. 😂' },
                    { meta: '@influencer · 4h', body: 'Scientists have confirmed that [thing you like] is actually bad for you' },
                    { meta: '@user · 6h', body: 'Is anyone else noticing the weird weather? Asking for a friend 🌪️' },
                  ].map((p, i) => (
                    <div key={i} className="px-5 py-4 border-b border-white/5 last:border-0">
                      <p className="text-[9px] text-white/25 mb-1">{p.meta}</p>
                      <p className="text-[12px] text-white/55">{p.body}</p>
                    </div>
                  ))}
                </div>
                <div className="hidden lg:flex items-start justify-center pt-12 bg-[#0D0F14]">
                  <span className="text-[#3DFFC0] text-xl">→</span>
                </div>
                <div className="bg-[#12151C]">
                  <div className="px-5 py-3 border-b border-white/6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0]">Plajah Science-Enriched Feed</p>
                  </div>
                  <div className="px-5 py-4 border-b border-white/5">
                    <p className="text-[9px] text-white/25 mb-2">Dr. Amara Diallo · Materials Science · MIT · 2h</p>
                    <p className="text-[12px] text-white/70 mb-2">Phase transition confirmed at T_c = 91.3K independent of grain boundary density.</p>
                    <div className="flex gap-2 flex-wrap mb-2">
                      <span className="px-2 py-0.5 bg-[#3DFFC0]/8 text-[#3DFFC0] text-[9px] rounded">Observation · 87% confidence</span>
                      <span className="px-2 py-0.5 bg-[#4DB8FF]/8 text-[#4DB8FF] text-[9px] rounded">Repro score: 0.82</span>
                    </div>
                    <div className="bg-[#E8B84B]/6 border border-[#E8B84B]/12 rounded-lg px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#E8B84B] mb-1">μ Muse · For everyone</p>
                      <p className="text-[10px] text-white/40">This team found a superconducting material that works reliably regardless of how its crystals are structured — a significant step toward room-temp superconductors.</p>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-[9px] text-white/25 mb-2">@user · 4h · Plajah Meteo Labs</p>
                    <p className="text-[12px] text-white/70 mb-2">NOAA GFS showing 988mb low developing over Lake Superior — tracking toward Detroit by Thursday.</p>
                    <div className="bg-[#E8B84B]/6 border border-[#E8B84B]/12 rounded-lg px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#E8B84B] mb-1">μ Muse · Plain language</p>
                      <p className="text-[10px] text-white/40">A strengthening storm system is forming over the Great Lakes. Detroit-area residents should watch for significant wind and rain Thursday.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── SUPERPOWERS ───────────────────────────────────────────── */}
          {tab === 'superpowers' && (
            <motion.div key="superpowers" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Section 02</p>
              <h2 className="text-4xl lg:text-6xl font-black mb-3" style={{ letterSpacing: '-2px' }}>
                Capabilities researchers<br />get <span className="text-[#3DFFC0] italic">nowhere else</span>
              </h2>
              <p className="text-base text-white/35 italic max-w-2xl mb-12 border-l-2 border-white/15 pl-5 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                Not features borrowed from academic software. Not social features bolted onto a journal. Things that are only possible because Plajah is a media platform — with reach, culture, real-time feeds, and a creative community — running a full science layer underneath.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden">
                {SUPERPOWERS.map((sp, i) => (
                  <motion.div
                    key={sp.num}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-[#0D0F14] hover:bg-[#12151C] transition-colors p-8 relative overflow-hidden"
                  >
                    {/* Accent top line */}
                    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, ${sp.color}, transparent)` }} />
                    {/* Ghost number */}
                    <span className="absolute top-3 right-5 text-7xl font-black text-white/[0.025] leading-none select-none" style={{ letterSpacing: '-4px' }}>{sp.num}</span>

                    <div className="text-3xl mb-4">{sp.icon}</div>
                    <p style={{ fontFamily: 'Georgia, serif' }} className="text-[18px] font-bold text-white mb-1 leading-tight">{sp.title}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: sp.color }}>— {sp.subtitle}</p>
                    <p className="text-[11px] text-white/40 leading-relaxed mb-5">{sp.body}</p>
                    <div className="rounded-lg px-4 py-3 text-[10px] leading-relaxed border-l-2 bg-white/[0.02]" style={{ borderColor: sp.color, color: sp.color }}>
                      {sp.why}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── SCENARIOS ─────────────────────────────────────────────── */}
          {tab === 'scenarios' && (
            <motion.div key="scenarios" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Section 03</p>
              <h2 className="text-4xl lg:text-6xl font-black mb-3" style={{ letterSpacing: '-2px' }}>
                Real scenarios —{' '}
                <span className="text-[#3DFFC0] italic">day in the life</span>
                <br />of a Plajah researcher
              </h2>
              <p className="text-base text-white/35 italic max-w-2xl mb-12 border-l-2 border-white/15 pl-5 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                These aren't hypothetical features. These are concrete situations that become possible only because Plajah is simultaneously a media platform, a scientific infrastructure, and a social network.
              </p>

              <div className="space-y-5">
                {SCENARIOS.map((sc, i) => (
                  <motion.div
                    key={sc.num}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="bg-[#0D0F14] border border-white/6 rounded-2xl p-8 relative overflow-hidden"
                  >
                    <span className="absolute top-4 right-6 text-[60px] font-black text-white/[0.03] leading-none select-none">{sc.num}</span>
                    <span className="inline-block px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest mb-4"
                          style={{ background: `${sc.tagColor}12`, color: sc.tagColor }}>
                      {sc.tag}
                    </span>
                    <h3 className="text-xl font-black text-white mb-3" style={{ fontFamily: 'Georgia, serif' }}>{sc.title}</h3>
                    <p className="text-[12px] text-white/45 leading-relaxed mb-5">{sc.body}</p>
                    <div className="rounded-lg px-4 py-3 bg-[#3DFFC0]/4 border border-[#3DFFC0]/12">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#3DFFC0] mb-1">What's impossible anywhere else</p>
                      <p className="text-[11px] text-[#3DFFC0]/80 leading-relaxed">{sc.unique}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── CODEBASE HOOKS ────────────────────────────────────────── */}
          {tab === 'codebase' && (
            <motion.div key="codebase" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Section 04</p>
              <h2 className="text-4xl lg:text-6xl font-black mb-3" style={{ letterSpacing: '-2px' }}>
                Codebase hooks —{' '}
                <span className="text-[#3DFFC0] italic">where to build</span>
              </h2>
              <p className="text-base text-white/35 italic max-w-2xl mb-12 border-l-2 border-white/15 pl-5 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                Based on Plajah's existing architecture — rich writing tools, universal comment system, messaging layer, collaborative tools, media platform foundation — these are the specific integration points that unlock the research superpowers.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {HOOKS.map((h, i) => (
                  <motion.div
                    key={h.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-[#0D0F14] border border-white/6 rounded-xl p-6"
                  >
                    <h4 className="text-[15px] font-black text-white mb-1" style={{ fontFamily: 'Georgia, serif' }}>{h.title}</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-4">{h.system}</p>
                    <pre className="bg-black/40 border border-white/5 rounded-lg p-4 text-[10px] text-[#3DFFC0] font-mono leading-relaxed mb-4 overflow-x-auto whitespace-pre-wrap break-words">{h.code}</pre>
                    <p className="text-[11px] text-white/40 leading-relaxed">{h.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── COMPARISON ────────────────────────────────────────────── */}
          {tab === 'comparison' && (
            <motion.div key="comparison" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-3">Section 05</p>
              <h2 className="text-4xl lg:text-6xl font-black mb-3" style={{ letterSpacing: '-2px' }}>
                Why <span className="text-[#3DFFC0] italic">nowhere else</span><br />can offer this
              </h2>
              <p className="text-base text-white/35 italic max-w-2xl mb-12 border-l-2 border-white/15 pl-5 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                The 12 research superpowers require a very specific combination of capabilities. No existing platform — academic or social — has all of them. Plajah is the only platform where the combination is architecturally possible.
              </p>

              <div className="overflow-x-auto rounded-2xl border border-white/6">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th className="text-left px-5 py-4 bg-[#12151C] text-[9px] font-black uppercase tracking-widest text-white/25 border-b border-white/6">Capability</th>
                      {['ResearchGate', 'GitHub', 'Twitter/X', 'Slack', 'Overleaf', '✦ Plajah'].map(p => (
                        <th key={p} className={`px-4 py-4 text-[9px] font-black uppercase tracking-widest text-center border-b border-white/6 ${p.includes('Plajah') ? 'bg-[#3DFFC0]/5 text-[#3DFFC0]' : 'bg-[#12151C] text-white/25'}`}>{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row, i) => (
                      <tr key={i} className="border-b border-white/4 hover:bg-white/[0.01] transition-colors">
                        <td className="px-5 py-4 text-white/60">{row.cap}</td>
                        <td className="px-4 py-4 text-center"><Cell v={row.rg} /></td>
                        <td className="px-4 py-4 text-center"><Cell v={row.gh} /></td>
                        <td className="px-4 py-4 text-center"><Cell v={row.tw} /></td>
                        <td className="px-4 py-4 text-center"><Cell v={row.sl} /></td>
                        <td className="px-4 py-4 text-center"><Cell v={row.ol} /></td>
                        <td className="px-4 py-4 text-center bg-[#3DFFC0]/[0.02] font-black text-[#3DFFC0]">✓ Plajah</td>
                      </tr>
                    ))}
                    <tr className="bg-[#3DFFC0]/[0.03] border-t border-[#3DFFC0]/15">
                      <td className="px-5 py-4 font-black text-white text-[11px]">Requires: media reach + scientific rigor + real-time data + AI context</td>
                      {['✗', '✗', '✗', '✗', '✗'].map((v, i) => (
                        <td key={i} className="px-4 py-4 text-center text-white/15 font-bold">{v}</td>
                      ))}
                      <td className="px-4 py-4 text-center bg-[#3DFFC0]/[0.04] font-black text-[#3DFFC0]">✓ Only Plajah</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <blockquote className="border-l-4 border-[#3DFFC0] pl-8 py-2 mt-12 bg-[#3DFFC0]/2 rounded-r-2xl">
                <p className="text-xl text-white/55 italic leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                  "Every other platform optimizes for one thing: reach, or rigor, or collaboration, or data. Plajah is the first to treat these as inseparable — because on Plajah, a research finding that can't reach anyone doesn't exist, and reach without rigor isn't worth having."
                </p>
              </blockquote>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PlajahResearchPage;
