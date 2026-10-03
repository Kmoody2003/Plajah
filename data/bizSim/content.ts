/**
 * Business simulation content: age tiers, industries, the establishment campaign (quests), and the
 * random events that teach. All numbers are teaching numbers chosen to make cause and effect visible.
 * Real filing fees and rules change; the product says so and links to the official source.
 */
import type { TierDef, IndustryDef, Quest, SimEvent, Tier } from './types';

export const TIERS: TierDef[] = [
  { id: 'seedling', label: 'Seedling', ages: 'PreK to Grade 2', turnName: 'Day', turns: 6, startCashMul: 1, taxes: false, debt: false, staff: false, equity: false, statements: false, events: true, quests: true, failure: false, taxRate: 0, interest: 0, priceSteps: [0.75, 1, 1.25], blurb: 'Run a tiny shop for six days. Pick a price, make a sign, count your coins.' },
  { id: 'sprout', label: 'Sprout', ages: 'Grades 3 to 5', turnName: 'Week', turns: 8, startCashMul: 1, taxes: false, debt: true, staff: true, equity: false, statements: false, events: true, quests: true, failure: false, taxRate: 0, interest: 0.04, priceSteps: [0.7, 0.85, 1, 1.15, 1.3], blurb: 'Run a market stall for eight weeks. Set prices, hire a helper, and learn what profit really is.' },
  { id: 'builder', label: 'Builder', ages: 'Grades 6 to 8', turnName: 'Month', turns: 12, startCashMul: 1, taxes: true, debt: true, staff: true, equity: false, statements: true, events: true, quests: true, failure: true, taxRate: 0.15, interest: 0.03, priceSteps: [0.7, 0.85, 1, 1.15, 1.3, 1.5], blurb: 'Run a small business for a year: legal basics, a bank account, loans, taxes and your first financial statements.' },
  { id: 'founder', label: 'Founder', ages: 'Grades 9 to 12', turnName: 'Month', turns: 18, startCashMul: 1, taxes: true, debt: true, staff: true, equity: true, statements: true, events: true, quests: true, failure: true, taxRate: 0.21, interest: 0.025, priceSteps: [0.6, 0.8, 1, 1.2, 1.4, 1.6, 2], blurb: 'Build a startup for 18 months: form a company, protect your name and work, raise money and survive real surprises.' },
  { id: 'executive', label: 'Executive', ages: 'College and adults', turnName: 'Month', turns: 24, startCashMul: 1, taxes: true, debt: true, staff: true, equity: true, statements: true, events: true, quests: true, failure: true, taxRate: 0.24, interest: 0.02, priceSteps: [0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.6, 2, 2.5], blurb: 'Run a venture for two years with the full toolkit: entity, IP portfolio, licensing, funding rounds and complete statements.' },
];
export const tierDef = (t: Tier) => TIERS.find(x => x.id === t)!;

/** Teaching-scale multipliers per tier: market size, fixed costs and starting cash. */
export const TIER_SCALE: Record<Tier, { market: number; fixed: number; cash: number }> = {
  seedling: { market: 0.08, fixed: 0.05, cash: 20 },
  sprout: { market: 0.2, fixed: 0.2, cash: 60 },
  builder: { market: 0.8, fixed: 0.8, cash: 1500 },
  founder: { market: 3, fixed: 3, cash: 12000 },
  executive: { market: 12, fixed: 12, cash: 90000 },
};

const flat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export const INDUSTRIES: IndustryDef[] = [
  { id: 'lemonade', label: 'Lemonade and snacks', emoji: '🍋', blurb: 'The classic first business.', unit: 'cup', units: 'cups', refPrice: 2, unitCost: 0.5, baseMarket: 150, fixedCost: 20, capacityPerStaff: 100, salary: 80, startStaff: 1, elasticity: 1.4, startCash: 1, seasonality: [0.7, 0.7, 0.9, 1, 1.2, 1.4, 1.5, 1.4, 1.1, 0.9, 0.7, 0.7], ipFocus: 'Your name and recipe: a trademark on the brand, a trade secret in the recipe.', specials: [
    { id: 'sp-recipe', label: 'Perfect your recipe', desc: 'Test recipes with taste testers.', cost: 20, effects: { quality: 10, xp: 10 }, once: true, tiers: ['seedling', 'sprout', 'builder', 'founder', 'executive'] },
  ] },
  { id: 'shop', label: 'Crafts and goods shop', emoji: '🛍️', blurb: 'Make or source goods and sell them.', unit: 'item', units: 'items', refPrice: 12, unitCost: 5, baseMarket: 90, fixedCost: 150, capacityPerStaff: 70, salary: 600, startStaff: 1, elasticity: 1.3, startCash: 1, seasonality: [0.8, 0.8, 0.9, 1, 1, 1, 0.9, 1, 1, 1.1, 1.4, 1.7], ipFocus: 'Your brand and your original designs: trademark the name, copyright the artwork.', specials: [
    { id: 'sp-design', label: 'Commission an original design', desc: 'A distinctive design customers cannot find elsewhere.', cost: 120, effects: { quality: 8, demand: 0.05, xp: 10 }, once: true, tiers: ['builder', 'founder', 'executive'] },
  ] },
  { id: 'music', label: 'Music artist or label', emoji: '🎤', blurb: 'Build a fanbase and earn from music, merch and shows.', unit: 'fan', units: 'paying fans', refPrice: 8, unitCost: 2.5, baseMarket: 120, fixedCost: 200, capacityPerStaff: 90, salary: 800, startStaff: 1, elasticity: 1.2, startCash: 1, seasonality: [0.9, 0.9, 1, 1, 1.1, 1.2, 1.2, 1.1, 1, 1, 1.1, 1.2], ipFocus: 'Two copyrights (the song and the recording), your artist name as a trademark, and licensing.', specials: [
    { id: 'sp-release', label: 'Release a single', desc: 'Distribution and a small promo push.', cost: 300, effects: { awareness: 15, quality: 3, xp: 12 }, tiers: ['builder', 'founder', 'executive'] },
    { id: 'sp-pro', label: 'Join a PRO and register your songs', desc: 'A performing rights organization collects performance royalties for songwriters.', cost: 50, effects: { reputation: 3, xp: 12 }, once: true, tiers: ['founder', 'executive'] },
    { id: 'sp-sync', label: 'Pitch to film and TV', desc: 'Sync licensing: a short licence for your music in a production.', cost: 100, effects: { cash: 600, reputation: 4, xp: 15 }, once: true, requires: ['copyright'], tiers: ['executive'] },
  ] },
  { id: 'film', label: 'Film production company', emoji: '🎬', blurb: 'Make films and sell them to audiences and platforms.', unit: 'view', units: 'paid views', refPrice: 10, unitCost: 4, baseMarket: 100, fixedCost: 500, capacityPerStaff: 80, salary: 1200, startStaff: 1, elasticity: 1.1, startCash: 1, seasonality: [0.9, 0.9, 1, 1, 1.1, 1.3, 1.3, 1.1, 1, 1.1, 1.2, 1.3], ipFocus: 'Chain of title: you must hold the rights to everything in the film; register the finished work.', specials: [
    { id: 'sp-fest', label: 'Submit to festivals', desc: 'Fees plus travel; festivals build reputation and sales leads.', cost: 400, effects: { awareness: 12, reputation: 6, xp: 12 }, tiers: ['founder', 'executive'] },
    { id: 'sp-option', label: 'Option a script with a signed agreement', desc: 'A written option secures the rights before you spend on the shoot.', cost: 250, effects: { quality: 8, xp: 15 }, once: true, tiers: ['founder', 'executive'] },
  ] },
  { id: 'publishing', label: 'Book publishing', emoji: '📚', blurb: 'Write and publish books; sell copies.', unit: 'copy', units: 'copies', refPrice: 15, unitCost: 5, baseMarket: 80, fixedCost: 120, capacityPerStaff: 90, salary: 700, startStaff: 1, elasticity: 1.3, startCash: 1, seasonality: [0.9, 0.9, 1, 1, 1, 1, 1, 1, 1.1, 1.1, 1.3, 1.5], ipFocus: 'Copyright in the text; ISBNs per format; permissions for anything you quote or reproduce.', specials: [
    { id: 'sp-editor', label: 'Hire a professional editor', desc: 'Editing is the biggest quality lever in a book.', cost: 350, effects: { quality: 15, reputation: 3, xp: 12 }, once: true, tiers: ['builder', 'founder', 'executive'] },
    { id: 'sp-isbn', label: 'Buy ISBNs and set up metadata', desc: 'Retailers and libraries identify each format by ISBN.', cost: 125, effects: { awareness: 6, xp: 10 }, once: true, tiers: ['founder', 'executive'] },
  ] },
  { id: 'restaurant', label: 'Restaurant or cafe', emoji: '🍽️', blurb: 'Serve food. High volume, thin margins.', unit: 'meal', units: 'meals', refPrice: 14, unitCost: 5.5, baseMarket: 200, fixedCost: 1200, capacityPerStaff: 180, salary: 1800, startStaff: 2, elasticity: 1.2, startCash: 1, seasonality: flat, ipFocus: 'Your restaurant name and logo as trademarks; signature recipes as trade secrets.', specials: [
    { id: 'sp-health', label: 'Pass the health inspection with flying colours', desc: 'Required to operate; a clean record builds trust.', cost: 150, effects: { reputation: 6, xp: 10 }, once: true, tiers: ['builder', 'founder', 'executive'] },
  ] },
  { id: 'software', label: 'Software or app', emoji: '💻', blurb: 'Build a product people subscribe to.', unit: 'subscriber', units: 'subscribers', refPrice: 20, unitCost: 3, baseMarket: 60, fixedCost: 800, capacityPerStaff: 400, salary: 3500, startStaff: 1, elasticity: 1.1, startCash: 1, seasonality: flat, ipFocus: 'Code is copyrighted automatically; the name is a trademark; inventions may be patentable; keep trade secrets secret.', specials: [
    { id: 'sp-security', label: 'Security review', desc: 'Protects customer data and your reputation.', cost: 500, effects: { reputation: 5, quality: 4, xp: 12 }, once: true, tiers: ['founder', 'executive'] },
  ] },
  { id: 'ecommerce', label: 'Online store', emoji: '📦', blurb: 'Sell products online and ship them.', unit: 'order', units: 'orders', refPrice: 30, unitCost: 14, baseMarket: 100, fixedCost: 300, capacityPerStaff: 120, salary: 2000, startStaff: 1, elasticity: 1.4, startCash: 1, seasonality: [0.8, 0.8, 0.9, 1, 1, 1, 0.9, 1, 1, 1.1, 1.5, 1.8], ipFocus: 'Brand name and logo as trademarks; photos and copy as copyrights; watch for counterfeits.', specials: [
    { id: 'sp-ship', label: 'Negotiate better shipping rates', desc: 'Lower unit costs on every order.', cost: 200, effects: { demand: 0.04, xp: 10 }, once: true, tiers: ['builder', 'founder', 'executive'] },
  ] },
  { id: 'services', label: 'Service business', emoji: '🛠️', blurb: 'Sell your skills by the hour or the project.', unit: 'hour', units: 'hours', refPrice: 60, unitCost: 8, baseMarket: 40, fixedCost: 100, capacityPerStaff: 60, salary: 3200, startStaff: 1, elasticity: 1.0, startCash: 1, seasonality: flat, ipFocus: 'Your business name as a trademark; contracts that say who owns the work you create.', specials: [
    { id: 'sp-contract', label: 'Have a lawyer review your client contract', desc: 'A good template protects you on every future job.', cost: 300, effects: { reputation: 3, xp: 12 }, once: true, tiers: ['founder', 'executive'] },
  ] },
];
export const industryDef = (id: string) => INDUSTRIES.find(i => i.id === id)!;

// ── The establishment campaign ───────────────────────────────────────────────────────────────
const KID: Tier[] = ['seedling', 'sprout'];
const BIG: Tier[] = ['founder', 'executive'];
export const QUESTS: Quest[] = [
  // Seedling / Sprout: play-scale
  { id: 'k-name', title: 'Name your shop', kid: 'Pick a name that is easy to remember and nobody else has.', learn: 'A name tells customers who you are. Before you pick one, check nobody else near you already uses it.', tiers: KID, cost: 0, turns: 0, effects: { reputation: 3, xp: 10 } },
  { id: 'k-sign', title: 'Make a sign', kid: 'A bright sign helps people find you.', learn: 'Advertising lets people know you exist. Your sign is your first advertisement. Art you make is yours: that is called copyright.', tiers: KID, cost: 2, turns: 0, effects: { awareness: 12, xp: 10 }, links: ['copyright'] },
  { id: 'k-bank', title: 'Open a piggy bank', kid: 'Keep your shop money apart from your own money.', learn: 'Real businesses keep business money in a separate bank account so they always know how they are doing.', tiers: KID, cost: 0, turns: 0, effects: { reputation: 2, xp: 10 }, sets: { bank: true } },
  { id: 'k-prices', title: 'Write a price list', kid: 'Everybody can see what things cost.', learn: 'A price must cover what it cost to make something, plus some extra so you can earn. That extra is profit.', tiers: ['sprout'], cost: 1, turns: 0, effects: { reputation: 3, xp: 12 }, sets: { records: true } },
  // Builder: small business basics
  { id: 'b-name', title: 'Choose and check a business name', kid: 'Search for names already in use before you pick yours.', learn: 'Search state business records and the web first. Using a name that someone else already uses can cause trouble later.', tiers: ['builder'], cost: 0, turns: 0, effects: { reputation: 2, xp: 12 }, ip: { trademark: 'searched' }, links: ['trademark'] },
  { id: 'b-sole', title: 'Register as a sole proprietor', kid: 'The simplest way to be a business: you and the business are the same in law.', learn: 'A sole proprietor is easy and cheap to start, but there is no separation between you and the business, so you are personally responsible for its debts.', tiers: ['builder'], cost: 40, turns: 0, sets: { entity: 'sole', license: true }, effects: { reputation: 3, xp: 15 }, links: ['form'] },
  { id: 'b-bank', title: 'Open a business bank account', kid: 'Keep business and personal money separate.', learn: 'Mixing personal and business money makes records messy and, for companies, can weaken legal protection.', tiers: ['builder'], cost: 25, turns: 0, requires: ['b-sole'], sets: { bank: true }, effects: { reputation: 3, xp: 12 }, links: ['form'] },
  { id: 'b-books', title: 'Start your record book', kid: 'Write down every dollar in and out.', learn: 'Good records tell you if you are making money, and are required for taxes.', tiers: ['builder'], cost: 0, turns: 0, sets: { records: true }, effects: { xp: 12 }, links: ['books'] },
  { id: 'b-logo', title: 'Create an original logo', kid: 'A logo you make is protected by copyright the moment it exists.', learn: 'Copyright protects original creative work automatically. Registering it later adds important legal advantages.', tiers: ['builder'], cost: 30, turns: 0, effects: { awareness: 6, xp: 12 }, copyright: 1, links: ['copyright'] },
  // Founder / Executive: the full establishment campaign
  { id: 'f-search', title: 'Search names and trademarks', kid: 'Clear your name before you invest in it.', learn: 'Search state records, the USPTO trademark database, domain names and social handles. A conflicting mark is far cheaper to avoid than to fight.', tiers: BIG, cost: 0, turns: 0, effects: { xp: 15 }, ip: { trademark: 'searched' }, links: ['trademark'] },
  { id: 'f-llc', title: 'Form an LLC', kid: 'A company the law treats as separate from you.', learn: 'An LLC separates your personal assets from business debts and lawsuits (with limits). It costs a filing fee and some paperwork, and it matters most once you have customers, employees or contracts.', tiers: BIG, cost: 200, turns: 1, requires: ['f-search'], sets: { entity: 'llc', license: true }, effects: { reputation: 4, xp: 25 }, links: ['form'] },
  { id: 'f-ein', title: 'Get an EIN', kid: 'A tax ID number for your business.', learn: 'An Employer Identification Number identifies the business for taxes and opening a bank account. In the US the IRS issues it free; avoid sites that charge for it.', tiers: BIG, cost: 0, turns: 0, requires: ['f-llc'], sets: { ein: true }, effects: { xp: 15 }, links: ['form'] },
  { id: 'f-bank', title: 'Open a business bank account', kid: 'Business money in business accounts.', learn: 'Keep business and personal money separate. Mixing them can undermine the legal protection an LLC gives you.', tiers: BIG, cost: 100, turns: 0, requires: ['f-ein'], sets: { bank: true }, effects: { reputation: 3, xp: 15 }, links: ['form'] },
  { id: 'f-insure', title: 'Buy business insurance', kid: 'Protection when something goes wrong.', learn: 'General liability and, for creators, errors and omissions cover claims that would otherwise come out of your pocket.', tiers: BIG, cost: 400, turns: 0, requires: ['f-llc'], sets: { insurance: true }, effects: { reputation: 3, xp: 15 }, links: ['form'] },
  { id: 'f-books', title: 'Set up accounting', kid: 'Track every dollar.', learn: 'Clean books show profit, support your taxes and are the first thing investors and lenders ask for.', tiers: BIG, cost: 120, turns: 0, sets: { records: true }, effects: { xp: 15 }, links: ['books'] },
  { id: 'f-tm', title: 'File a trademark application', kid: 'Protect your brand name and logo.', learn: 'Trademark rights come from using a mark in commerce; federal registration with the USPTO adds nationwide advantages and the right to use the registered symbol. Examination takes months, so plan ahead.', tiers: BIG, cost: 350, turns: 3, requires: ['f-search'], ip: { trademark: 'pending', tmTurnsLeft: 3 }, effects: { xp: 25 }, links: ['trademark'] },
  { id: 'f-copyright', title: 'Register a copyright', kid: 'Register your key creative work.', learn: 'Copyright exists automatically, but in the US you generally must register before suing, and registration affects the damages you can recover. Registration is per work.', tiers: BIG, cost: 65, turns: 0, copyright: 1, effects: { xp: 20 }, links: ['copyright'], repeatable: true },
  { id: 'f-patent', title: 'File a provisional patent application', kid: 'Hold your place for an invention.', learn: 'A provisional application secures a filing date for up to a year while you test the market. You must then file a full application. Only inventions that are new, useful and non-obvious qualify.', tiers: ['executive'], cost: 300, turns: 0, ip: { patent: 'provisional', patentTurnsLeft: 12 }, effects: { xp: 25 }, links: ['patent'] },
  { id: 'f-nda', title: 'Put NDAs and a secrets policy in place', kid: 'Keep valuable know-how secret.', learn: 'A trade secret is protected only while you take reasonable steps to keep it secret: NDAs, access limits and clear employee and contractor agreements.', tiers: BIG, cost: 150, turns: 0, ip: { secrets: true }, effects: { xp: 15 }, links: ['trade-secret'] },
  { id: 'f-license', title: 'License your work to others', kid: 'Earn income from what you own.', learn: 'A licence lets someone use your IP on agreed terms for a fee, while you keep ownership. Without ownership you have nothing to license.', tiers: ['executive'], cost: 250, turns: 1, requires: ['f-llc'], ip: { licensesOut: 1 }, effects: { xp: 25 }, links: ['licensing'], repeatable: true },
];
export const questById = (id: string) => QUESTS.find(q => q.id === id)!;

// ── Events that teach ──────────────────────────────────────────────────────────────────────────
const ALL: Tier[] = ['seedling', 'sprout', 'builder', 'founder', 'executive'];
const MID: Tier[] = ['sprout', 'builder', 'founder', 'executive'];
const BLD: Tier[] = ['builder', 'founder', 'executive'];

export const EVENTS: SimEvent[] = [
  { id: 'e-rainy', title: 'A rainy week', body: 'Fewer people than usual come by.', learn: 'Demand changes with seasons and weather. Plan cash for slow times.', tiers: ALL, choices: [
    { label: 'Wait it out', desc: 'Sales are slower.', effects: { awareness: -4, xp: 8 } },
    { label: 'Offer a rainy-day deal', desc: 'A small discount brings people in.', effects: { cash: -4, reputation: 3, xp: 12 } } ] },
  { id: 'e-friend', title: 'A friend tells everyone about you', body: 'Word of mouth brings new customers.', learn: 'Happy customers are the best marketing: reputation grows when you do good work.', tiers: ALL, gate: 'growing', choices: [
    { label: 'Say thank you', desc: 'A thank-you note.', effects: { awareness: 8, reputation: 4, xp: 10 } } ] },
  { id: 'e-supplier', title: 'Supplier raises prices', body: 'What you buy to make your product costs more.', learn: 'Costs can rise. Check your margin and adjust prices or find a cheaper supplier.', tiers: MID, choices: [
    { label: 'Raise your price a little', desc: 'Keep your margin.', effects: { demand: -0.03, xp: 12 } },
    { label: 'Absorb the cost', desc: 'Your profit shrinks.', effects: { cash: -25, xp: 8 } },
    { label: 'Search for a new supplier', desc: 'Takes time and money.', effects: { cash: -15, quality: 2, xp: 14 } } ] },
  { id: 'e-review', title: 'A customer leaves a bad review', body: 'Someone says your product was not as good as they hoped.', learn: 'Reviews shape reputation. Respond politely and fix the cause.', tiers: MID, choices: [
    { label: 'Reply kindly and offer a refund', desc: 'Costs a little.', effects: { cash: -10, reputation: 3, xp: 14 } },
    { label: 'Ignore it', desc: 'It stays unanswered.', effects: { reputation: -5, xp: 4 } } ] },
  { id: 'e-bigorder', title: 'A big order', body: 'A local group wants a large order, soon.', learn: 'Big orders mean cash flow strain: you pay for supplies before you are paid. Capacity matters.', tiers: MID, choices: [
    { label: 'Accept it', desc: 'Strain your capacity for a big sale.', effects: { cash: 80, reputation: -2, xp: 14 } },
    { label: 'Negotiate a deposit first', desc: 'Safer for your cash.', effects: { cash: 60, reputation: 2, xp: 18 }, result: 'Asking for a deposit is standard practice and protects your cash flow.' } ] },
  { id: 'e-copycat', title: 'A copycat appears', body: 'Someone starts selling something that looks and sounds just like yours, under a similar name.', learn: 'A registered trademark lets you stop confusingly similar names. Without one you must rely on weaker common-law rights and prove you were first. This is why brand protection is done early.', tiers: ['builder', 'founder', 'executive'], gate: 'no-trademark', links: ['trademark'], choices: [
    { label: 'Ignore them', desc: 'Customers get confused.', effects: { demand: -0.08, reputation: -4, xp: 8 } },
    { label: 'Hire a lawyer', desc: 'Costly, and your case is weaker without registration.', effects: { cash: -300, demand: -0.03, xp: 14 } },
    { label: 'Rebrand', desc: 'Lose some awareness but end the confusion.', effects: { cash: -120, awareness: -15, xp: 12 } } ] },
  { id: 'e-copycat-tm', title: 'A copycat appears (you are protected)', body: 'Someone starts using a name very close to yours.', learn: 'Because you hold a trademark registration, you can send a firm letter and the issue is usually resolved quickly and cheaply. Registration paid for itself.', tiers: ['builder', 'founder', 'executive'], gate: 'has-trademark', links: ['trademark'], choices: [
    { label: 'Send a cease-and-desist letter', desc: 'A letter citing your registration.', effects: { cash: -40, reputation: 4, xp: 25 } } ] },
  { id: 'e-infringe', title: 'Someone copied your work', body: 'You find your original artwork and writing on another seller\'s site.', learn: 'Copyright protects original work automatically, but registering it first lets you sue for statutory damages and attorney\'s fees in the US. A takedown notice under the DMCA is a fast first step.', tiers: ['founder', 'executive', 'builder'], gate: 'has-copyright', links: ['copyright'], choices: [
    { label: 'File a takedown notice', desc: 'The DMCA process is quick and free.', effects: { cash: 0, reputation: 3, xp: 22 } },
    { label: 'Sue for damages', desc: 'Strong, because you registered.', effects: { cash: 400, reputation: 2, xp: 25 } } ] },
  { id: 'e-infringe-no', title: 'Someone copied your work', body: 'You find your original work on another seller\'s site.', learn: 'You own the copyright automatically, but without registration you cannot sue in the US and cannot get statutory damages. A takedown notice can still work. Registering your key works early keeps your options open.', tiers: ['founder', 'executive'], gate: 'no-trademark', links: ['copyright'], choices: [
    { label: 'File a takedown notice', desc: 'Works, but less leverage.', effects: { reputation: 1, xp: 14 } },
    { label: 'Try to sue', desc: 'Hard without registration.', effects: { cash: -250, xp: 8 } } ] },
  { id: 'e-claim', title: 'You receive an infringement claim', body: 'A company says your logo looks like theirs and demands payment.', learn: 'Searching for existing marks before you adopt a name or logo avoids many claims. Insurance and a company structure can limit the damage.', tiers: ['founder', 'executive'], minTurn: 3, links: ['trademark'], choices: [
    { label: 'Respond with a lawyer', desc: 'Costs money, may settle.', effects: { cash: -250, xp: 18 }, conditional: [{ when: 'insurance', then: { cash: 200, xp: 8 } }] },
    { label: 'Change your logo', desc: 'Settle by rebranding.', effects: { cash: -100, awareness: -6, xp: 12 } } ] },
  { id: 'e-sued', title: 'A customer sues over an injury', body: 'A customer says your product caused harm and sues.', learn: 'A company structure and insurance protect your personal assets. A sole proprietor can lose personal savings.', tiers: ['founder', 'executive', 'builder'], minTurn: 3, gate: 'no-llc', weight: 0.8, links: ['form'], choices: [
    { label: 'Settle', desc: 'Pay from your own pocket.', effects: { cash: -600, reputation: -3, xp: 14 }, conditional: [{ when: 'insurance', then: { cash: 450 } }] },
    { label: 'Fight it', desc: 'Costly and risky.', effects: { cash: -900, reputation: 1, xp: 10 }, conditional: [{ when: 'insurance', then: { cash: 700 } }] } ] },
  { id: 'e-sued-llc', title: 'A customer sues over an injury', body: 'A customer sues your company after an accident.', learn: 'Because your business is an LLC, the claim is against the company, not your personal home and savings (with limits). Insurance covers much of the cost.', tiers: ['founder', 'executive'], minTurn: 3, links: ['form'], choices: [
    { label: 'Let the insurer handle it', desc: 'That is what it is for.', effects: { cash: -80, xp: 20 }, conditional: [{ when: 'insurance', then: { cash: 60 }, else: { cash: -400 } }] } ] },
  { id: 'e-audit', title: 'Tax questions', body: 'The tax office asks you to explain last quarter\'s numbers.', learn: 'Good records make tax questions easy. Without them you pay penalties and lose time.', tiers: ['builder', 'founder', 'executive'], minTurn: 4, links: ['books'], choices: [
    { label: 'Provide your records', desc: 'Show what you have.', effects: { xp: 14 }, conditional: [{ when: 'records', then: { cash: 0, reputation: 2, xp: 10 }, else: { cash: -250, reputation: -3 } }] } ] },
  { id: 'e-grant', title: 'A small business grant', body: 'A local program offers a grant to businesses with a plan and clean books.', learn: 'Grants are money you do not repay, but programs require paperwork, a registered entity and records.', tiers: ['builder', 'founder', 'executive'], minTurn: 2, links: ['fund'], choices: [
    { label: 'Apply', desc: 'Needs a bank account and records.', effects: { xp: 14 }, conditional: [{ when: 'records', then: { cash: 500, reputation: 3, xp: 14 }, else: { cash: 0, xp: 4 } }] } ] },
  { id: 'e-breakdown', title: 'Equipment breaks', body: 'Something you rely on stops working.', learn: 'Plan a repair budget: equipment fails when you least expect it.', tiers: MID, choices: [
    { label: 'Repair it', desc: 'Pay for the repair.', effects: { cash: -60, xp: 10 } },
    { label: 'Replace it', desc: 'More expensive, lasts longer.', effects: { cash: -140, capacity: 15, xp: 12 } } ] },
  { id: 'e-viral', title: 'A post about you goes viral', body: 'Thousands of people suddenly know your name.', learn: 'Attention comes in waves. Can you serve everyone who shows up? A registered name and a ready product turn attention into lasting customers.', tiers: BLD, gate: 'growing', choices: [
    { label: 'Ride the wave', desc: 'Big awareness, capacity strained.', effects: { awareness: 20, reputation: -2, xp: 14 }, conditional: [{ when: 'trademark', then: { awareness: 8, reputation: 3 } }] } ] },
  { id: 'e-license', title: 'A company asks to license your work', body: 'A larger company would like to pay to use your original work or brand.', learn: 'Licensing turns IP into income without selling it. You can only license what you own, and the contract sets how long, where and for how much.', tiers: ['founder', 'executive'], minTurn: 4, gate: 'has-copyright', links: ['licensing'], choices: [
    { label: 'Sign a limited licence', desc: 'Earn a fee, keep ownership.', effects: { cash: 700, reputation: 3, xp: 25 } },
    { label: 'Decline', desc: 'Keep things simple.', effects: { xp: 6 } } ] },
  { id: 'e-investor', title: 'An investor shows interest', body: 'An angel investor offers cash for a share of your company.', learn: 'Equity money does not need repaying but you give up ownership. Clean legal structure and protected IP make a company worth more.', tiers: ['founder', 'executive'], minTurn: 5, links: ['fund'], choices: [
    { label: 'Take the offer', desc: 'Sell 15 percent.', effects: { cash: 5000, equityPct: 15, xp: 20 }, conditional: [{ when: 'llc', then: { cash: 1500 }, else: { cash: -2500 } }, { when: 'trademark', then: { cash: 800 } }] },
    { label: 'Decline', desc: 'Stay in full control.', effects: { xp: 8 } } ] },
  { id: 'e-competitor', title: 'A big competitor opens nearby', body: 'A well-known company starts selling something similar.', learn: 'Competition pushes you to differentiate: quality, service or a brand people trust.', tiers: MID, minTurn: 3, choices: [
    { label: 'Invest in quality', desc: 'Stand out.', effects: { cash: -120, quality: 10, xp: 14 } },
    { label: 'Cut your price', desc: 'Keep volume, lose margin.', effects: { demand: -0.02, xp: 8 } },
    { label: 'Do nothing', desc: 'Lose some customers.', effects: { demand: -0.07, xp: 4 } } ] },
  { id: 'e-cash', title: 'Customers pay late', body: 'A few customers take weeks to pay what they owe.', learn: 'Profit on paper is not cash in the bank. Cash flow can sink a profitable business.', tiers: ['builder', 'founder', 'executive'], minTurn: 3, choices: [
    { label: 'Chase the payments', desc: 'Costs time, brings the cash in.', effects: { cash: 0, reputation: -1, xp: 14 } },
    { label: 'Wait', desc: 'Cash is tight this month.', effects: { cash: -150, xp: 8 } } ] },
  { id: 'e-secret', title: 'A former helper starts a rival', body: 'Someone who worked for you begins a business using your methods.', learn: 'Without written confidentiality agreements, trade secrets are hard to protect. NDAs and clear agreements make the line obvious.', tiers: ['founder', 'executive'], minTurn: 4, links: ['trade-secret'], choices: [
    { label: 'Talk to a lawyer', desc: 'Depends on what you signed.', effects: { cash: -200, xp: 14 }, conditional: [{ when: 'secrets', then: { cash: 350, demand: 0.03, xp: 14 }, else: { demand: -0.06 } }] } ] },
];

export const eventById = (id: string) => EVENTS.find(e => e.id === id)!;

// ── Badges ───────────────────────────────────────────────────────────────────────────────────────────
export const BADGES: Array<{ id: string; label: string; emoji: string; blurb: string }> = [
  { id: 'first-sale', label: 'First sale', emoji: '🪙', blurb: 'You made your first sale.' },
  { id: 'profit', label: 'In the black', emoji: '🌱', blurb: 'Made a profit in a turn.' },
  { id: 'streak', label: 'Steady grower', emoji: '📈', blurb: 'Three profitable turns in a row.' },
  { id: 'protected', label: 'Brand protector', emoji: '🛡️', blurb: 'Registered a trademark.' },
  { id: 'creator', label: 'Rights holder', emoji: '©️', blurb: 'Registered a copyright.' },
  { id: 'official', label: 'Official business', emoji: '🏛️', blurb: 'Set up a legal entity, bank account and records.' },
  { id: 'survivor', label: 'Survivor', emoji: '⚓', blurb: 'Got through a crisis event.' },
  { id: 'cash-king', label: 'Cash cushion', emoji: '💰', blurb: 'Ended with more than double your starting cash.' },
  { id: 'licensor', label: 'Licensor', emoji: '🤝', blurb: 'Earned from licensing your work.' },
];
