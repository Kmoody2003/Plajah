/**
 * Business simulation: shared types. The simulation is a SIMPLIFIED teaching model, not a forecast:
 * numbers are chosen so cause and effect are visible (price vs demand, marketing vs awareness, legal
 * protection vs the cost of a dispute). It is labelled that way in the product, and every lesson it
 * teaches points to the real-world step in Praxis or the IP toolkit.
 */
export type Tier = 'seedling' | 'sprout' | 'builder' | 'founder' | 'executive';
export type Industry = 'lemonade' | 'shop' | 'music' | 'film' | 'publishing' | 'restaurant' | 'software' | 'ecommerce' | 'services';
export type Rng = () => number;

export interface Config { tier: Tier; industry: Industry; seed: number; name: string }

export type Entity = 'none' | 'sole' | 'llc' | 'ccorp';
export type TmStatus = 'none' | 'searched' | 'pending' | 'registered';
export type PatentStatus = 'none' | 'provisional' | 'pending' | 'granted';

export interface Legal { entity: Entity; ein: boolean; bank: boolean; insurance: boolean; license: boolean; records: boolean }
export interface IpPortfolio { trademark: TmStatus; tmTurnsLeft: number; copyrights: number; patent: PatentStatus; patentTurnsLeft: number; secrets: boolean; licensesOut: number }

/** Effects any decision, quest or event choice can have. All optional; applied once, in the order below. */
export interface Effects {
  cash?: number; debt?: number; reputation?: number; quality?: number; awareness?: number;
  /** Permanent change to price tolerance / demand: +0.1 = 10% more customers from now on. */
  demand?: number; capacity?: number; staff?: number; xp?: number;
  /** Equity sold: percent of the company given away for the cash above. */
  equityPct?: number;
}

/** A change that depends on what the player has protected or set up. */
export type Cond = 'trademark' | 'copyright' | 'patent' | 'llc' | 'insurance' | 'bank' | 'ein' | 'records' | 'secrets' | 'license';
export interface Conditional { when: Cond; then: Effects; else?: Effects }

export interface EventChoice { label: string; desc: string; effects: Effects; conditional?: Conditional[]; result?: string }
export interface SimEvent {
  id: string; title: string; body: string;
  /** What it teaches, shown after the player chooses. */
  learn: string;
  tiers: Tier[]; industries?: Industry[];
  /** Relative weight in the draw (default 1). */
  weight?: number;
  /** Only after this turn. */
  minTurn?: number;
  /** Only when this is true of the state: simple named gates. */
  gate?: 'no-trademark' | 'has-trademark' | 'no-llc' | 'has-copyright' | 'has-patent' | 'has-debt' | 'growing' | 'no-records';
  choices: EventChoice[];
  /** Link kinds (IpLink.kind) or Praxis stage keys to show after the lesson. */
  links?: string[];
}

export interface Quest {
  id: string; title: string; kid: string; learn: string;
  tiers: Tier[]; industries?: Industry[];
  cost: number; turns: number;
  requires?: string[];
  /** Direct effects on the legal/ip state. */
  sets?: Partial<Legal> & { entity?: Entity };
  ip?: Partial<IpPortfolio>;
  effects?: Effects;
  links?: string[];
  /** Counts toward 'copyrights' when done. */
  copyright?: number;
  repeatable?: boolean;
}

export interface Special { id: string; label: string; desc: string; cost: number; effects: Effects; once?: boolean; requires?: string[]; tiers: Tier[] }

export interface IndustryDef {
  id: Industry; label: string; emoji: string; blurb: string;
  unit: string; units: string;
  refPrice: number; unitCost: number; baseMarket: number; fixedCost: number;
  capacityPerStaff: number; salary: number; startStaff: number;
  elasticity: number;
  /** Starting cash multiplier by tier is applied in the engine. */
  startCash: number;
  seasonality: number[];
  specials: Special[];
  ipFocus: string;
}

export interface TierDef {
  id: Tier; label: string; ages: string; turnName: string; turns: number; startCashMul: number;
  taxes: boolean; debt: boolean; staff: boolean; equity: boolean; statements: boolean; events: boolean; quests: boolean; failure: boolean;
  taxRate: number; interest: number; priceSteps: number[];
  blurb: string;
}
