/**
 * Praxis — the learn-by-building venture journey.
 *
 * The curriculum IS the act of building your business: every stage teaches
 * something AND produces a real artifact for your venture. The spine is the
 * Three P's — Provide, Protect, Prosper — and every stage leads with one.
 *
 * Content is intentionally plain; the depth adapts to the founder's level
 * (see FounderBand) so the same journey serves someone who knows nothing and
 * someone who's raised before.
 */

export type PKey = 'provide' | 'protect' | 'prosper';
export type FounderBand = 'new' | 'some' | 'pro';

export interface PDef { key: PKey; label: string; color: string; blurb: string; }

/** The Three P's — Aria tags every action, lesson, and nudge to one of these. */
export const THREE_P: Record<PKey, PDef> = {
  provide: { key: 'provide', label: 'Provide', color: '#b692f6',
    blurb: 'The knowledge + the actual instrument — plan, templates, books.' },
  protect: { key: 'protect', label: 'Protect', color: '#00daf3',
    blurb: 'Your guardian — liability, deadlines, compliance, contracts, IP.' },
  prosper: { key: 'prosper', label: 'Prosper', color: '#ff8c00',
    blurb: 'Pricing, margin, cash flow, the capital ladder, and wealth.' },
};

export interface Stage {
  key: string;
  order: number;
  title: string;
  lead: PKey;
  oneLiner: string;
  /** what this stage teaches you */
  learn: string;
  /** the real artifact it produces for your venture */
  produces: string;
  /** the Plajah features / tools it uses */
  tools: string[];
}

export const STAGES: Stage[] = [
  { key: 'spark', order: 1, title: 'Spark', lead: 'provide',
    oneLiner: 'Turn a hunch into a clear idea you can build on.',
    learn: 'What a business really is — value, a customer, and a reason you exist. We shape your one-line thesis and your Business Model Canvas.',
    produces: 'Venture thesis + a Business Model Canvas you can keep editing.',
    tools: ['Aria coach', 'Business Model Canvas'] },
  { key: 'validate', order: 2, title: 'Validate', lead: 'prosper',
    oneLiner: 'Prove people actually want it — before you spend.',
    learn: 'Market sizing (TAM/SAM/SOM), who exactly you serve, and a first price. We ground it in open data (Census, BLS, FRED).',
    produces: 'A validation memo + your ideal-customer profile + a pricing draft.',
    tools: ['U.S. Census', 'BLS', 'FRED', 'Aria research'] },
  { key: 'form', order: 3, title: 'Form', lead: 'protect',
    oneLiner: 'Make it real and legal — the right way for your state.',
    learn: 'Sole prop vs LLC vs S-corp vs C-corp vs nonprofit — liability and taxes explained. Then EIN, registration, licenses, and a business bank account.',
    produces: 'A live formation checklist with official deep-links (IRS EIN, your state).',
    tools: ['IRS EIN', 'State SoS', 'SBA', 'Bank account'] },
  { key: 'books', order: 4, title: 'Books', lead: 'provide',
    oneLiner: 'Understand your money — not just record it.',
    learn: 'Double-entry basics, cash vs accrual, and the three statements (P&L, balance sheet, cash flow) — and why each one exists.',
    produces: 'A starting chart of accounts + a P&L that fills from your Plajah sales.',
    tools: ['Plajah POS / Orders', 'Chart of accounts'] },
  { key: 'operate', order: 5, title: 'Operate', lead: 'prosper',
    oneLiner: 'Build the thing and run it day to day.',
    learn: 'Your storefront, products/services, pricing, suppliers, and the roles you need. We stand up your real Plajah business page.',
    produces: 'A launched Plajah business page + an operating playbook.',
    tools: ['Business page', 'Roles & employees', 'Store / POS'] },
  { key: 'comply', order: 6, title: 'Comply', lead: 'protect',
    oneLiner: 'Stay out of trouble — automatically.',
    learn: 'The governance calendar: sales tax, payroll tax, quarterly estimates, annual reports, 1099s, licenses, insurance, and basic contracts.',
    produces: 'A compliance calendar that reminds you before every deadline.',
    tools: ['Compliance calendar', 'Notifications', 'Contracts'] },
  { key: 'fund', order: 7, title: 'Fund', lead: 'prosper',
    oneLiner: 'Get the capital that fits your business.',
    learn: 'The whole ladder — bootstrapping, business credit, grants, crowdfunding, angels, VC — plus SAFEs, cap tables, and dilution, at your level.',
    produces: 'A funding plan + a pitch deck + a cap table.',
    tools: ['Sanctuary / SeedRaiser', 'Pitch deck', 'Cap table'] },
  { key: 'grow', order: 8, title: 'Grow', lead: 'prosper',
    oneLiner: 'Scale up — and build real wealth while you do.',
    learn: 'Unit economics, hiring, and growth — woven with financial literacy: personal & business credit, investing, stocks, and crypto (honest about risk).',
    produces: 'A growth plan + a personal & business money dashboard.',
    tools: ['Financial literacy sandbox', 'Credit builder', 'Investing basics'] },
];

export interface Archetype { id: string; label: string; emoji: string; note: string; }

export const ARCHETYPES: Archetype[] = [
  { id: 'local_service', label: 'Local service', emoji: '🧰', note: 'Trades, salons, cleaning, tutoring — you sell your time & skill.' },
  { id: 'retail', label: 'Shop / retail', emoji: '🛍️', note: 'You sell physical goods, in person or online.' },
  { id: 'restaurant', label: 'Food & drink', emoji: '☕', note: 'Café, restaurant, truck — permits & health rules matter.' },
  { id: 'ecommerce', label: 'Online store', emoji: '📦', note: 'You ship products or sell digital goods at a distance.' },
  { id: 'creator', label: 'Creator / solo', emoji: '🎨', note: 'You monetize your art, audience, or expertise.' },
  { id: 'startup', label: 'Startup', emoji: '🚀', note: 'High-growth, likely to raise — the VC track.' },
  { id: 'nonprofit', label: 'Nonprofit', emoji: '🤝', note: 'Mission-first — 501(c)(3), grants, donors.' },
];

export interface Band { id: FounderBand; label: string; sub: string; }

export const FOUNDER_BANDS: Band[] = [
  { id: 'new', label: 'New to this', sub: 'Explain everything, plain and simple.' },
  { id: 'some', label: 'Some experience', sub: 'I know the basics — move a bit faster.' },
  { id: 'pro', label: 'Experienced', sub: 'Give me the checklist and the advanced options.' },
];

/** Adaptive Spark lesson — same idea, told at the reader's depth. */
export const SPARK_LESSON: Record<FounderBand, { intro: string; why: string }> = {
  new: {
    intro: "A business is simple at its heart: you help someone with a real problem, and they pay you because it's worth it. That's it. Everything else — the paperwork, the money, the growth — is just how you protect and grow that one exchange.",
    why: "Your 'why' keeps you going when it's hard, and it's what makes customers choose you. We'll write it in one honest sentence.",
  },
  some: {
    intro: "You've got the gist. Let's sharpen it: a business turns a specific customer's problem into value they'll pay for, repeatably. The Business Model Canvas maps how — value prop, customers, channels, revenue.",
    why: "A crisp purpose aligns your model and your marketing. One sentence: who you serve, the change you make, and why it matters.",
  },
  pro: {
    intro: "Straight to it: define the wedge. Which customer segment, which acute problem, and what's your unfair angle. We'll draft the thesis and seed a Business Model Canvas you can pressure-test in Validate.",
    why: "Purpose is positioning. Nail the one-liner — segment, transformation, differentiation — it'll anchor pricing, GTM, and the raise.",
  },
};

/** Open / public sources Praxis draws on — surfaced so founders can go deeper. */
export const KNOWLEDGE_SOURCES: { name: string; url: string; what: string }[] = [
  { name: 'IRS — Apply for an EIN', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', what: 'Get your federal tax ID — free, official.' },
  { name: 'SBA.gov', url: 'https://www.sba.gov/business-guide', what: 'Federal small-business guides, loans, and size standards.' },
  { name: 'U.S. Census — Business data', url: 'https://www.census.gov/topics/business-economy.html', what: 'Market sizing: County Business Patterns, demographics.' },
  { name: 'BLS', url: 'https://www.bls.gov/', what: 'Wages, industry employment, cost benchmarks.' },
  { name: 'FRED (St. Louis Fed)', url: 'https://fred.stlouisfed.org/', what: 'Economic indicators for your assumptions.' },
  { name: 'USPTO', url: 'https://www.uspto.gov/trademarks', what: 'Protect your name and brand — trademarks.' },
  { name: 'Investor.gov (SEC)', url: 'https://www.investor.gov/', what: 'Plain-English investing & markets education.' },
  { name: 'CFPB — MyMoney', url: 'https://www.consumerfinance.gov/', what: 'Personal finance, credit, and debt basics.' },
  { name: 'OpenStax (free textbooks)', url: 'https://openstax.org/subjects/business', what: 'Accounting, Entrepreneurship, Business Ethics — free.' },
];
