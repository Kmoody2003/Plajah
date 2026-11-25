/**
 * Terra — owner-of-record privacy.
 *
 * Owner names on assessment rolls are public record, and republishing them is
 * generally lawful in the US. Compiling them in one place is the risk: it powers
 * name → home-address lookups, bulk scraping for mailers and scams, and deed-fraud
 * targeting, and laws such as New Jersey's Daniel's Law (and Michigan's Address
 * Confidentiality Program) put liability on whoever republishes a protected
 * person's details. So Terra's rule is:
 *
 *   - ORGANIZATIONS are shown by name (LLCs, corporations, banks, governments,
 *     land banks, churches, housing authorities). Who owns the vacant lots and
 *     the absentee rentals is the civic value.
 *   - PRIVATE INDIVIDUALS are omitted: no name and no mailing address ever enter
 *     Terra's records, search, exports or feeds. The inspector says "Private
 *     individual" and links to the publisher's own public record instead.
 *   - Anything unknown, ambiguous or mixed (a person co-owning with an LLC) is
 *     treated as an individual. Trusts and estates are individuals.
 *
 * Apply `applyOwnerPolicy` at normalization, so a private owner's name is
 * dropped before anything is stored, cached or rendered.
 */

export type OwnerKind = 'organization' | 'individual';

/** How a source may surface its owner field. Every parcel source declares one. */
export type OwnerPolicy = 'organizations-only' | 'none';

// Words that only appear in an organization's name, matched as whole words on the
// uppercased name. Deliberately excludes TRUST/ESTATE/FAMILY (usually a private
// person's holding) and HOA (also part of Vietnamese given names).
const ORG_WORDS = [
  'LLC', 'L L C', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED',
  'LP', 'LLP', 'PLLC', 'PC', 'LDHA', 'PARTNERS', 'PARTNERSHIP', 'HOLDINGS', 'ENTERPRISES', 'PROPERTIES',
  'INVESTMENTS', 'INVESTMENT', 'REALTY', 'DEVELOPMENT', 'DEVELOPERS', 'GROUP', 'VENTURES', 'CAPITAL',
  'MANAGEMENT', 'ASSOCIATES', 'ASSOCIATION', 'ASSN', 'ASSOC', 'BANK', 'MORTGAGE', 'FINANCIAL', 'CREDIT UNION',
  'FUND', 'FOUNDATION', 'MINISTRIES', 'MINISTRY', 'MOSQUE', 'SYNAGOGUE', 'DIOCESE', 'ARCHDIOCESE',
  'CONGREGATION', 'UNIVERSITY', 'HOSPITAL', 'HEALTH', 'AUTHORITY',
  'COMMISSION', 'DEPARTMENT', 'DEPT', 'BOARD OF', 'DISTRICT', 'CITY OF', 'COUNTY OF', 'COUNTY', 'TREASURER',
  'FEDERAL', 'NATIONAL', 'GOVERNMENT', 'STATE OF', 'TOWNSHIP', 'VILLAGE OF', 'UNITED STATES', 'LAND BANK',
  'LANDBANK', 'HOUSING', 'COOPERATIVE', 'CO-OP', 'CONDOMINIUM', 'CONDO', 'HOMEOWNERS', 'NONPROFIT', 'NON-PROFIT',
  'SOCIETY', 'COUNCIL', 'INSTITUTE', 'SERVICES', 'SERVICE', 'RAILROAD', 'RAILWAY', 'UTILITY', 'UTILITIES',
  'ENERGY', 'ELECTRIC', 'EDISON', 'DTE', 'REIT', 'PLC',
];
// Also surnames (John Church, Mary Ann Temple, Ann Lodge, and Ottawa's Dutch
// "School"): they count only with a second clue — "OF"/"THE", a religious or
// institutional word, or another of these words ("LOMAX TEMPLE CHURCH").
const WEAK_ORG_WORDS = ['CHURCH', 'TEMPLE', 'PARISH', 'LODGE', 'UNION', 'CENTER', 'CENTRE', 'CLUB', 'VILLAGE', 'COMMONS', 'HOMES', 'PLACE', 'SCHOOL', 'SCHOOLS', 'ACADEMY', 'COLLEGE', 'CHAPEL'];
const WEAK_CLUE_RE = /\b(OF|THE|BAPTIST|AME|CME|METHODIST|PRESBYTERIAN|MISSIONARY|PENTECOSTAL|LUTHERAN|CATHOLIC|EPISCOPAL|APOSTOLIC|EVANGELICAL|REFORMED|CHRISTIAN|GOD|CHRIST|HOLY|SAINT|ST|OUR LADY|GOSPEL|BIBLE|FELLOWSHIP|TABERNACLE|ZION|BETHEL|DELIVERANCE|KINGDOM|COMMUNITY|PUBLIC|CHARTER|ELEMENTARY|HIGH|MIDDLE|PREPARATORY|PREP|MONTESSORI|MASONIC|ELKS|MOOSE|AMERICAN LEGION|VFW|CREDIT|TRAILER|MOBILE HOME)\b/;

const alternation = (list: string[]) =>
  list.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
const ORG_RE = new RegExp(`(?:^|[^A-Z0-9])(?:${alternation(ORG_WORDS)})\\.?(?=$|[^A-Z0-9])`);
const WEAK_ORG_RE = new RegExp(`(?:^|[^A-Z0-9])(?:${alternation(WEAK_ORG_WORDS)})(?=$|[^A-Z0-9])`);

// Government bodies are never a private person, whatever else is in the name.
const GOVERNMENT_RE = /\b(CITY OF|COUNTY OF|STATE OF|VILLAGE OF|TOWNSHIP OF|UNITED STATES|LAND BANK|LANDBANK|HOUSING COMMISSION|AUTHORITY|TREASURER|BOARD OF EDUCATION|PUBLIC SCHOOLS|POSTAL SERVICE)\b/;
// A private person somewhere in the name: "SMITH, JOHN", "LOVE, MICO/ ... LLC",
// "PHAM, CHAU VAN & TRAN, ...". A comma followed by a legal suffix ("ACME, LLC")
// is not a person.
const PERSON_COMMA_RE = /(?:^|[/&;]\s*)[A-Z][A-Z'-]*(?:\s+[A-Z][A-Z'-]*)?,\s*(?!(?:L\.?L\.?C|INC|CORP|LTD|LP|LLP|PLLC|PC|CO|N\.?A)\b\.?)[A-Z]/;
const CO_OWNERS_RE = /\b(ET AL|ETAL|ET UX|ETUX)\b/;
const PERSONAL_HOLDING_RE = /\b(TRUST|TRUSTEE|TRUSTEES|TR|LIVING|REVOCABLE|IRREVOCABLE|FAMILY|ESTATE OF|ESTATE|HEIRS|JTWROS|LIFE ESTATE)\b/;
// A clear legal-entity word beats a trust word ("CHASE BANK TRUST CO").
const LEGAL_ENTITY_RE = /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|BANK|LDHA|LP|LLP)\b/;

/** Organization or private individual. Unknown, mixed or ambiguous reads as an individual. */
export function classifyOwner(name?: string | null): OwnerKind {
  const n = (name ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!n) return 'individual';
  if (GOVERNMENT_RE.test(n)) return 'organization';
  // Any person in the name keeps the whole name private (co-owned with an LLC, et al).
  if (PERSON_COMMA_RE.test(n) || CO_OWNERS_RE.test(n)) return 'individual';
  if (PERSONAL_HOLDING_RE.test(n) && !LEGAL_ENTITY_RE.test(n)) return 'individual';
  if (ORG_RE.test(n)) return 'organization';
  if (WEAK_ORG_RE.test(n)) {
    const weakCount = n.split(/[^A-Z]+/).filter(w => WEAK_ORG_WORDS.includes(w)).length;
    if (weakCount >= 2 || WEAK_CLUE_RE.test(n)) return 'organization';
  }
  return 'individual';
}

interface OwnerFields {
  taxpayerName?: string;
  taxpayerAddress?: string;
  ownerKind?: OwnerKind;
}

/**
 * Apply a source's owner policy to a normalized record. Keeps an organization's
 * name and address; removes both for a private individual or when the source
 * allows no owner display. Always sets `ownerKind` when an owner was present.
 */
export function applyOwnerPolicy<T extends OwnerFields>(rec: T, policy: OwnerPolicy): T {
  const name = rec.taxpayerName;
  if (!name) { delete rec.taxpayerName; delete rec.taxpayerAddress; return rec; }
  const kind = classifyOwner(name);
  rec.ownerKind = kind;
  if (policy === 'none' || kind === 'individual') {
    delete rec.taxpayerName;
    delete rec.taxpayerAddress;
  }
  return rec;
}

/*
 * Raw civic rows (blight tickets, code cases). The rule: public data about an
 * issue of public concern stays public; only what identifies a PRIVATE person
 * goes.
 *   - The record itself (violation, dates, fines, status, property address) stays.
 *   - An ORGANIZATION responsible for the property keeps its name and address:
 *     an LLC piling up violations is public business.
 *   - Officials acting in their role (inspectors, agencies) stay: the city
 *     publishes them as accountability for official acts.
 *   - A PRIVATE owner/respondent's name, mailing address and contact details go.
 */

// Fields that name or locate the party a record is about (owner, violator...).
const PARTY_KEY_RE = /(owner|taxpayer|violator|respondent|applicant|landlord|tenant|mail(ing)?_?addr)/i;
// The party's name, used to decide organization vs private person.
const PARTY_NAME_KEY_RE = /(owner|taxpayer|violator|respondent|applicant|landlord)_?(1|_name|name)?$|(owner|taxpayer|violator|respondent|applicant|landlord)_name/i;
// Contact details that identify a private person wherever they appear.
const CONTACT_KEY_RE = /(^|_)(contact|phone|email|first_?name|last_?name|full_?name)($|_)|person(?!al_?prop)|resident(?!ial)/i;

function partyIsOrganization(raw: Record<string, any>): boolean {
  const nameKey = Object.keys(raw).find(k => PARTY_NAME_KEY_RE.test(k) && typeof raw[k] === 'string' && raw[k].trim());
  return nameKey ? classifyOwner(raw[nameKey]) === 'organization' : false;
}

/** The raw keys to drop: a private party's identity and contact details. */
export function personalRawKeys(raw: Record<string, any> | undefined | null): string[] {
  if (!raw) return [];
  const keepParty = partyIsOrganization(raw);
  return Object.keys(raw).filter(k => CONTACT_KEY_RE.test(k) || (!keepParty && PARTY_KEY_RE.test(k)));
}

/** A copy of a raw source row with a private party's identity removed. */
export function scrubRaw(raw: Record<string, any> | undefined | null): Record<string, any> | undefined {
  if (!raw) return undefined;
  const drop = new Set(personalRawKeys(raw));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) if (!drop.has(k)) out[k] = v;
  return out;
}
