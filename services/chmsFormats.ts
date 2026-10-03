// chmsFormats — parsing, detection and normalization for church-management exports.
// Pure functions (no Firestore). Supports Servant Keeper, Planning Center, Breeze, CCB and generic CSVs.
// Nothing here throws on bad data: every normalizer returns a value or a warning.

import type { ChmsMemberStatus, ChmsGiftMethod, ChmsPledge } from '../types';

export type ChmsFileKind = 'people' | 'households' | 'contributions' | 'pledges' | 'funds' | 'attendance' | 'groups';
export type ChmsSourceSystem = 'servantkeeper' | 'planningcenter' | 'breeze' | 'ccb' | 'generic';

export const KIND_LABEL: Record<ChmsFileKind, string> = {
  people: 'People', households: 'Households / families', contributions: 'Contributions (gifts)', pledges: 'Pledges',
  funds: 'Funds', attendance: 'Attendance', groups: 'Group membership',
};
export const SOURCE_LABEL: Record<ChmsSourceSystem, string> = {
  servantkeeper: 'Servant Keeper', planningcenter: 'Planning Center', breeze: 'Breeze', ccb: 'Church Community Builder', generic: 'Generic CSV',
};
export const ALL_KINDS: ChmsFileKind[] = ['people', 'households', 'contributions', 'pledges', 'funds', 'attendance', 'groups'];

// ── CSV parsing ──────────────────────────────────────────────────────────────

export interface ParsedTable { headers: string[]; rows: string[][]; delimiter: string; leadingRowsSkipped: number; encoding: string }

/** Pick the delimiter by counting candidates outside quotes on the first few lines. */
export function sniffDelimiter(sample: string): string {
  const cands = [',', ';', '\t', '|'];
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQ = false, lines = 0;
  for (let i = 0; i < sample.length && lines < 5; i++) {
    const c = sample[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === '\n') lines++;
    else if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  let best = ',';
  for (const d of cands) if (counts[d] > counts[best]) best = d;
  return best;
}

/** Incremental RFC-4180 parser: handles quoted newlines, escaped quotes, CRLF / lone CR. */
export function createCsvParser(delim: string, onRow: (r: string[]) => void) {
  let field = '', row: string[] = [], inQ = false, pendingQuote = false, atStart = true, skipLF = false;
  const pushField = () => { row.push(field); field = ''; atStart = true; };
  const pushRow = () => { pushField(); onRow(row); row = []; };
  return {
    push(chunk: string) {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (skipLF) { skipLF = false; if (c === '\n') continue; }
        if (inQ) {
          if (pendingQuote) {
            pendingQuote = false;
            if (c === '"') { field += '"'; continue; }
            inQ = false; // that quote closed the field; treat c as unquoted
          } else {
            if (c === '"') { pendingQuote = true; continue; }
            field += c; continue;
          }
        }
        if (c === '"' && atStart) { inQ = true; atStart = false; continue; }
        if (c === delim) { pushField(); continue; }
        if (c === '\r') { pushRow(); skipLF = true; continue; }
        if (c === '\n') { pushRow(); continue; }
        field += c; atStart = false;
      }
    },
    end() {
      pendingQuote = false; inQ = false;
      if (field !== '' || row.length) pushRow();
    },
  };
}

/** Decode bytes: UTF-8/16 BOMs, strict UTF-8, else Windows-1252 (the usual Servant Keeper / Excel export). */
export function decodeBytes(buf: ArrayBuffer): { text: string; encoding: string } {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(u8.subarray(2)), encoding: 'utf-16le' };
  if (u8[0] === 0xFE && u8[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(u8.subarray(2)), encoding: 'utf-16be' };
  const body = u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF ? u8.subarray(3) : u8;
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' }; } catch { /* fall through */ }
  try { return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' }; } catch { /* fall through */ }
  return { text: new TextDecoder('utf-8').decode(body), encoding: 'utf-8 (lossy)' };
}

const tick = () => new Promise<void>(r => setTimeout(r, 0));

/** Parse delimited text in chunks (yielding to the UI between chunks) and tidy into headers + rows. */
export async function parseDelimited(text: string, onProgress?: (frac: number) => void): Promise<ParsedTable> {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const delimiter = sniffDelimiter(clean.slice(0, 8000));
  const raw: string[][] = [];
  const parser = createCsvParser(delimiter, r => { if (r.some(c => c.trim() !== '')) raw.push(r); });
  const CHUNK = 262144;
  for (let i = 0; i < clean.length; i += CHUNK) {
    parser.push(clean.slice(i, i + CHUNK));
    onProgress?.(Math.min(1, (i + CHUNK) / clean.length));
    if (clean.length > CHUNK) await tick();
  }
  parser.end();
  onProgress?.(1);
  return tidyTable(raw, delimiter, '');
}

export async function parseCsvFile(file: File, onProgress?: (frac: number) => void): Promise<ParsedTable> {
  if (/\.xlsx?$/i.test(file.name)) throw new Error('Excel files are not supported directly yet - in Excel use File > Save As > CSV (Comma delimited), then drop the CSV here.');
  const { text, encoding } = decodeBytes(await file.arrayBuffer());
  const t = await parseDelimited(text, onProgress);
  t.encoding = encoding;
  return t;
}

export function tidyTable(raw: string[][], delimiter: string, encoding: string): ParsedTable {
  const maxCols = raw.slice(0, 50).reduce((m, r) => Math.max(m, r.filter(c => c.trim()).length), 0);
  let h = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (raw[i].filter(c => c.trim()).length >= Math.max(2, Math.ceil(maxCols * 0.6))) { h = i; break; }
  }
  const headerRow = raw[h] || [];
  let width = headerRow.length;
  for (let i = h + 1; i < raw.length; i++) if (raw[i].length > width) width = raw[i].length;
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    let name = (headerRow[c] || '').trim();
    if (!name) name = `Column ${c + 1}`;
    const n = (seen.get(name.toLowerCase()) || 0) + 1;
    seen.set(name.toLowerCase(), n);
    headers.push(n > 1 ? `${name} (${n})` : name);
  }
  const rows = raw.slice(h + 1).map(r => { const o = r.map(c => c.trim()); while (o.length < width) o.push(''); return o; });
  return { headers, rows, delimiter, leadingRowsSkipped: h, encoding };
}

/** Quote-safe CSV writer (used by exports, error reports and templates). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(r => r.map(v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n') + '\r\n';
}

// ── Header matching ──────────────────────────────────────────────────────────

export interface FieldDef { key: string; label: string; aliases: string[]; required?: boolean }
export interface ColumnMapping { index: number; header: string; field: string | null; confidence: number }

const F = (key: string, label: string, aliases: string[], required = false): FieldDef => ({ key, label, aliases, required });

const NAME_FIELDS: FieldDef[] = [
  F('firstName', 'First name', ['first name', 'firstname', 'first', 'given name', 'given', 'fname', 'first nm']),
  F('lastName', 'Last name', ['last name', 'lastname', 'last', 'surname', 'family name', 'lname', 'last nm']),
  F('fullName', 'Full name (combined)', ['name', 'full name', 'fullname', 'donor', 'giver', 'donor name', 'giver name', 'contributor', 'contributor name', 'member name', 'individual name', 'person']),
];
const IDENT_FIELDS: FieldDef[] = [
  F('personId', 'Person / member ID', ['individual id', 'individual no', 'individual number', 'person id', 'member id', 'member no', 'member number', 'contributor id', 'contributor no', 'donor id', 'breeze id', 'pco id', 'people id', 'ind id', 'individualid', 'individual', 'record id']),
  F('familyId', 'Family / household ID', ['family id', 'family no', 'family number', 'household id', 'household no', 'family code', 'famid', 'hh id', 'family key']),
  F('envelope', 'Envelope #', ['envelope', 'envelope #', 'envelope no', 'envelope number', 'env no', 'env #', 'giving number', 'giving no', 'contributor number', 'envelope id']),
];

export const FIELD_DEFS: Record<ChmsFileKind, FieldDef[]> = {
  people: [
    F('sourceId', 'Source record ID', ['id', 'individual id', 'individual no', 'individual number', 'member id', 'member no', 'member number', 'person id', 'breeze id', 'pco id', 'people id', 'record id', 'ind id', 'individualid', 'contributor id', 'unique id']),
    F('householdId', 'Family / household ID', ['family id', 'family no', 'family number', 'household id', 'household no', 'family code', 'famid', 'hh id', 'family key']),
    F('householdName', 'Family / household name', ['household', 'household name', 'family', 'family label', 'family name', 'salutation']),
    F('householdRole', 'Family role', ['family role', 'family position', 'relationship', 'role in family', 'household role', 'position in family', 'family relationship']),
    F('envelope', 'Envelope #', ['envelope', 'envelope #', 'envelope no', 'envelope number', 'env no', 'env #', 'giving number', 'giving no', 'contributor number', 'envelope id']),
    F('firstName', 'First name', ['first name', 'firstname', 'first', 'given name', 'given', 'fname', 'first nm']),
    F('lastName', 'Last name', ['last name', 'lastname', 'last', 'surname', 'lname', 'last nm']),
    F('fullName', 'Full name (combined)', ['name', 'full name', 'fullname', 'individual name', 'member name', 'person']),
    F('preferredName', 'Preferred / nickname', ['nickname', 'nick name', 'preferred name', 'goes by', 'preferred', 'known as']),
    F('email', 'Email', ['email', 'e-mail', 'email address', 'e-mail address', 'home email', 'primary email', 'email 1', 'personal email', 'emailaddress']),
    F('email2', 'Second email', ['email 2', 'e-mail 2', 'alternate email', 'work email', 'other email', 'secondary email', 'email2']),
    F('cellPhone', 'Cell phone', ['cell', 'cell phone', 'mobile', 'mobile phone', 'mobile phone number', 'cell phone number', 'cellular', 'mobile number', 'cellphone']),
    F('homePhone', 'Home phone', ['home phone', 'home phone number', 'home', 'phone', 'telephone', 'phone number', 'phone 1', 'primary phone', 'homephone']),
    F('workPhone', 'Work phone', ['work phone', 'work', 'business phone', 'work phone number', 'office phone', 'workphone']),
    F('address1', 'Address line 1', ['address 1', 'address1', 'address', 'street', 'street address', 'home address street', 'address line 1', 'addr1', 'mailing address', 'home street', 'street 1']),
    F('address2', 'Address line 2', ['address 2', 'address2', 'address line 2', 'addr2', 'apt', 'suite', 'street 2', 'home address street 2']),
    F('city', 'City', ['city', 'home address city', 'town']),
    F('state', 'State', ['state', 'st', 'province', 'region', 'home address state', 'state province']),
    F('zip', 'Postal code', ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postcode', 'home address zip', 'zip postal']),
    F('birthDate', 'Birth date', ['birth date', 'birthdate', 'birthday', 'date of birth', 'dob', 'born', 'birth']),
    F('anniversary', 'Anniversary', ['anniversary', 'wedding date', 'anniversary date', 'married date', 'date married']),
    F('gender', 'Gender', ['gender', 'sex']),
    F('maritalStatus', 'Marital status', ['marital status', 'marital', 'marriage status', 'married']),
    F('status', 'Member status', ['member status', 'membership status', 'status', 'membership', 'member type', 'membership type', 'individual type', 'type', 'church status', 'person status', 'attendance status']),
    F('memberSince', 'Member since', ['date joined', 'joined', 'member since', 'membership date', 'join date', 'date received', 'joined date', 'date of membership', 'received', 'membership start date', 'date became member']),
    F('baptismDate', 'Baptism date', ['baptism date', 'date baptized', 'baptized', 'baptism', 'baptized date', 'date of baptism']),
    F('tags', 'Tags / groups', ['tags', 'tag', 'categories', 'category', 'labels', 'groups', 'group']),
    F('skills', 'Skills / gifts', ['skills', 'spiritual gifts', 'gifts', 'talents', 'volunteer skills', 'abilities']),
  ],
  households: [
    F('sourceId', 'Family ID', ['family id', 'family no', 'family number', 'household id', 'household no', 'id', 'family code', 'famid', 'record id', 'family key']),
    F('name', 'Family name', ['family name', 'household name', 'name', 'family', 'household', 'family label', 'salutation']),
    F('headSourceId', 'Head of household ID', ['head id', 'head of household id', 'head individual id', 'primary individual id', 'head of household']),
    F('envelope', 'Envelope #', ['envelope', 'envelope #', 'envelope no', 'envelope number', 'env no']),
    F('address1', 'Address line 1', ['address 1', 'address1', 'address', 'street', 'street address', 'home address street', 'address line 1', 'mailing address']),
    F('address2', 'Address line 2', ['address 2', 'address2', 'address line 2', 'apt', 'suite']),
    F('city', 'City', ['city', 'home address city', 'town']),
    F('state', 'State', ['state', 'st', 'province', 'region', 'home address state']),
    F('zip', 'Postal code', ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postcode', 'home address zip']),
    F('phone', 'Phone', ['phone', 'home phone', 'telephone', 'phone number']),
    F('email', 'Email', ['email', 'e-mail', 'email address']),
  ],
  contributions: [
    F('sourceId', 'Gift / transaction ID', ['contribution id', 'gift id', 'transaction id', 'donation id', 'id', 'record id', 'reference id', 'trans id', 'transaction no', 'transaction number', 'gift no']),
    F('date', 'Gift date', ['gift date', 'contribution date', 'transaction date', 'donation date', 'date given', 'date', 'received date', 'date received', 'deposit date', 'paid date', 'giving date', 'trans date']),
    F('amount', 'Amount', ['amount', 'gift amount', 'contribution amount', 'donation amount', 'payment amount', 'total', 'contribution', 'gift', 'net amount', 'amt'], true),
    F('fund', 'Fund name', ['fund', 'fund name', 'designation', 'account', 'fund description', 'contribution fund', 'category', 'fund label', 'account name', 'purpose']),
    F('fundCode', 'Fund code', ['fund code', 'fund id', 'fund no', 'fund number', 'account number', 'account code', 'fund #', 'gl code']),
    ...IDENT_FIELDS,
    ...NAME_FIELDS,
    F('method', 'Payment method', ['payment method', 'method', 'payment type', 'gift type', 'tender', 'type', 'form of payment', 'source', 'payment source', 'pay method']),
    F('checkNumber', 'Check #', ['check #', 'check no', 'check number', 'checknumber', 'check', 'reference number', 'ref no', 'check ref', 'ref', 'reference', 'check/ref', 'cheque number']),
    F('batch', 'Batch', ['batch', 'batch number', 'batch id', 'batch name', 'batch no', 'deposit', 'deposit id', 'batch #']),
    F('memo', 'Memo / note', ['memo', 'note', 'notes', 'comment', 'comments', 'description', 'gift note']),
    F('pledge', 'Pledge reference', ['pledge', 'pledge id', 'pledge no', 'pledge number']),
    F('tribute', 'Tribute (memorial / honor)', ['in memory of', 'in honor of', 'tribute', 'memorial', 'honor', 'in memory', 'dedication']),
    F('deductible', 'Tax deductible', ['tax deductible', 'deductible', 'tax-deductible', 'taxdeductible', 'non deductible', 'nondeductible', 'tax status', 'deductible amount flag']),
    F('splitId', 'Split group ID', ['split id', 'split group', 'splitid', 'transaction group', 'receipt number', 'receipt no']),
  ],
  pledges: [
    F('sourceId', 'Pledge ID', ['pledge id', 'id', 'record id', 'pledge no', 'pledge number']),
    ...IDENT_FIELDS,
    ...NAME_FIELDS,
    F('fund', 'Fund name', ['fund', 'fund name', 'designation', 'campaign', 'account', 'fund description', 'pledge fund']),
    F('fundCode', 'Fund code', ['fund code', 'fund id', 'fund no', 'fund number']),
    F('amount', 'Pledge amount', ['pledge amount', 'amount', 'total pledge', 'pledged', 'total amount', 'pledge total', 'pledge', 'amount pledged', 'goal amount'], true),
    F('frequency', 'Frequency', ['frequency', 'schedule', 'interval', 'pledge frequency', 'pay frequency', 'payment frequency', 'period']),
    F('startDate', 'Start date', ['start date', 'pledge date', 'date', 'begin date', 'start', 'date pledged', 'from date', 'beginning']),
    F('endDate', 'End date', ['end date', 'stop date', 'end', 'to date', 'through', 'date ended', 'expiration date']),
    F('status', 'Status', ['status', 'pledge status', 'state']),
  ],
  funds: [
    F('code', 'Fund code', ['fund code', 'code', 'fund id', 'id', 'fund no', 'fund number', 'account number', 'account code']),
    F('name', 'Fund name', ['fund name', 'name', 'fund', 'description', 'fund description', 'designation', 'account', 'account name', 'title'], true),
    F('goal', 'Goal', ['goal', 'budget', 'target', 'goal amount', 'fund goal']),
  ],
  attendance: [
    F('sourceId', 'Record ID', ['id', 'record id', 'attendance id']),
    F('date', 'Date', ['attendance date', 'date', 'service date', 'event date', 'meeting date', 'check in date', 'checkin date', 'check-in date', 'week of'], true),
    ...IDENT_FIELDS,
    ...NAME_FIELDS,
    F('event', 'Event / service', ['event', 'service', 'event name', 'activity', 'meeting', 'class', 'service type', 'attendance type', 'service name', 'event type', 'schedule']),
    F('group', 'Group / ministry', ['group', 'ministry', 'group name', 'class name', 'team', 'department']),
    F('count', 'Head count', ['count', 'headcount', 'head count', 'attendance count', 'total attendance', 'total', 'attendance', 'attendees']),
  ],
  groups: [
    ...IDENT_FIELDS,
    ...NAME_FIELDS,
    F('group', 'Group name', ['group', 'group name', 'ministry', 'class', 'team', 'category', 'small group', 'group description', 'committee', 'activity'], true),
    F('role', 'Role in group', ['role', 'position', 'member type', 'group role', 'title', 'leader']),
  ],
};

export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '');
const tokens = (h: string) => h.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export const nameSimilarity = (a: string, b: string): number => {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, ''), y = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!x || !y) return 0;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
};

function aliasScore(header: string, alias: string): number {
  const hn = normHeader(header), an = normHeader(alias);
  if (!hn || !an) return 0;
  if (hn === an) return 1;
  if (an.length <= 3) return 0; // short aliases ("id", "st") must match exactly
  const ht = tokens(header), at = tokens(alias);
  if (at.length > 0 && at.every(t => ht.includes(t)) && ht.length <= at.length + 2) return 0.72;
  if (hn.endsWith(an) && an.length >= 5) return 0.7;
  if (an.length >= 5) { const s = 1 - lev(hn, an) / Math.max(hn.length, an.length); if (s >= 0.82) return 0.6; }
  return 0;
}

/** Fuzzy header -> field mapping. Each header and each field is used at most once (best score wins). */
export function mapHeaders(headers: string[], kind: ChmsFileKind): ColumnMapping[] {
  const defs = FIELD_DEFS[kind];
  const cands: { hi: number; field: string; score: number }[] = [];
  headers.forEach((h, hi) => {
    for (const d of defs) {
      let best = 0;
      for (const a of d.aliases) best = Math.max(best, aliasScore(h, a));
      if (best > 0) cands.push({ hi, field: d.key, score: best });
    }
  });
  cands.sort((a, b) => b.score - a.score);
  const usedH = new Set<number>(), usedF = new Set<string>();
  const out: ColumnMapping[] = headers.map((h, i) => ({ index: i, header: h, field: null, confidence: 0 }));
  for (const c of cands) {
    if (usedH.has(c.hi) || usedF.has(c.field)) continue;
    usedH.add(c.hi); usedF.add(c.field);
    out[c.hi].field = c.field; out[c.hi].confidence = c.score;
  }
  return out;
}

// ── Detection (source system + file kind) ────────────────────────────────────

const SIGS: Record<Exclude<ChmsSourceSystem, 'generic'>, string[]> = {
  servantkeeper: ['envelope', 'envelopeno', 'envelopenumber', 'memberstatus', 'familyid', 'familyno', 'datejoined', 'giftdate', 'individualno', 'baptismdate', 'datebaptized', 'contributionmanager', 'cell', 'address1', 'membertype', 'checkno', 'fundcode', 'spousename', 'headofhousehold'],
  planningcenter: ['donationid', 'paymentmethod', 'paymentsource', 'campus', 'grade', 'membership', 'homeaddressstreet', 'mobilephonenumber', 'homephonenumber', 'homeemail', 'pcoid', 'donorid', 'paymentchannel', 'refunded', 'designation'],
  breeze: ['breezeid', 'familyrole', 'maidenname', 'nickname', 'batchnumber', 'birthdateyear', 'streetaddress', 'personid', 'checknumber', 'familyname'],
  ccb: ['individualid', 'familyid', 'familyposition', 'individualtype', 'membershiptype', 'transactiondate', 'ccb', 'primarycontactemail', 'membershipdate', 'giverid', 'inactive'],
};

export function detectSource(headers: string[]): { source: ChmsSourceSystem; confidence: number } {
  const hs = new Set(headers.map(normHeader));
  const scores = (Object.keys(SIGS) as (keyof typeof SIGS)[]).map(k => ({ k, s: SIGS[k].filter(x => hs.has(x)).length / Math.min(6, SIGS[k].length) }));
  // Distinctive markers get a boost.
  const bonus: Record<string, string[]> = { servantkeeper: ['envelope', 'envelopeno', 'envelopenumber', 'memberstatus', 'datejoined', 'contributionmanager'], planningcenter: ['donationid', 'pcoid', 'homeaddressstreet', 'paymentsource'], breeze: ['breezeid', 'familyrole', 'batchnumber'], ccb: ['individualtype', 'familyposition', 'ccb'] };
  for (const sc of scores) if (bonus[sc.k].some(x => hs.has(x))) sc.s += 0.5;
  scores.sort((a, b) => b.s - a.s);
  if (scores[0].s < 0.34) return { source: 'generic', confidence: 0.5 };
  return { source: scores[0].k, confidence: Math.min(1, scores[0].s) };
}

export interface Detection { kind: ChmsFileKind; confidence: number; mapping: ColumnMapping[]; alternatives: ChmsFileKind[] }

export function detectKind(headers: string[]): Detection {
  const maps = {} as Record<ChmsFileKind, ColumnMapping[]>;
  for (const k of ALL_KINDS) maps[k] = mapHeaders(headers, k);
  const has = (k: ChmsFileKind, f: string, min = 0.6) => maps[k].some(m => m.field === f && m.confidence >= min);
  const hn = headers.map(normHeader);
  const anyHeader = (frag: string) => hn.some(h => h.includes(frag));
  const scores: Partial<Record<ChmsFileKind, number>> = {};

  const nameish = (k: ChmsFileKind) => (has(k, 'firstName') && has(k, 'lastName')) || has(k, 'fullName');
  const identish = (k: ChmsFileKind) => has(k, 'personId') || has(k, 'envelope') || has(k, 'familyId') || nameish(k);

  if (has('contributions', 'amount') && has('contributions', 'date')) {
    let s = 8 + (has('contributions', 'fund') || has('contributions', 'fundCode') ? 2 : 0) + (has('contributions', 'checkNumber') ? 1 : 0) + (has('contributions', 'batch') ? 1.5 : 0) + (identish('contributions') ? 1 : 0);
    if (anyHeader('giftdate') || anyHeader('contribution')) s += 1;
    scores.contributions = s;
  }
  const pledgeish = has('pledges', 'frequency') || anyHeader('pledgeamount') || anyHeader('pledgedate') || anyHeader('pledgefrequency');
  if (has('pledges', 'amount') && (pledgeish || (anyHeader('pledge') && !has('contributions', 'date') && !has('contributions', 'batch')))) {
    scores.pledges = 9 + (pledgeish ? 3 : 0) + (has('pledges', 'startDate') ? 1 : 0) - (has('contributions', 'checkNumber') || has('contributions', 'batch') ? 4 : 0);
  }
  if (has('people', 'firstName') && has('people', 'lastName') || (has('people', 'fullName') && !scores.contributions)) {
    let s = 7;
    for (const f of ['email', 'cellPhone', 'homePhone', 'address1', 'birthDate', 'status', 'memberSince', 'gender', 'maritalStatus', 'zip']) if (has('people', f)) s += 0.7;
    if (scores.contributions) s -= 4; // gift files also carry names
    scores.people = s;
  }
  if (has('households', 'name') && !has('people', 'firstName') && (has('households', 'sourceId') || has('households', 'address1')) && !has('contributions', 'amount')) {
    scores.households = 7 + (has('households', 'address1') ? 1 : 0) + (has('households', 'headSourceId') ? 1.5 : 0);
  }
  if (has('attendance', 'date') && !has('contributions', 'amount') && (has('attendance', 'event') || has('attendance', 'group') || has('attendance', 'count') || identish('attendance')) && (identish('attendance') || has('attendance', 'count'))) {
    scores.attendance = 7.5 + (has('attendance', 'event') ? 1.5 : 0) + (anyHeader('attend') ? 1 : 0);
  }
  if (has('groups', 'group') && identish('groups') && !has('attendance', 'date') && !has('contributions', 'amount')) {
    scores.groups = 8 + (has('groups', 'role') ? 1 : 0);
  }
  if ((has('funds', 'name') || has('funds', 'code')) && headers.length <= 6 && !has('contributions', 'amount') && !has('attendance', 'date') && !nameish('people')) {
    scores.funds = 8 + (has('funds', 'code') ? 1 : 0);
  }
  const ranked = (Object.entries(scores) as [ChmsFileKind, number][]).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { kind: 'people', confidence: 0.1, mapping: maps.people, alternatives: ALL_KINDS.filter(k => k !== 'people') };
  const [kind, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const confidence = Math.max(0.3, Math.min(1, 0.55 + (top - second) / 12 + top / 40));
  return { kind, confidence, mapping: maps[kind], alternatives: ranked.slice(1).map(r => r[0]) };
}

// ── Normalizers ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const validYmd = (y: number, m: number, d: number) => {
  if (y < 1800 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function excelSerialToIso(n: number): string | undefined {
  if (!isFinite(n) || n < 1 || n > 80000) return undefined;
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Normalize any common date shape to YYYY-MM-DD. `past` pushes 2-digit years into the past (birth dates). */
export function normDate(raw: string | undefined, opts: { past?: boolean } = {}): { value?: string; warning?: string } {
  let s = (raw || '').trim();
  if (!s || /^(0+([\/\-.]0+){0,2}|\/+|-+|n\/?a|none|unknown|null)$/i.test(s)) return {};
  s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm|z)?.*$/i, '').trim();
  const nowYy = new Date().getFullYear() % 100;
  const fixYear = (y: number) => {
    if (y >= 100) return y;
    let full = y > nowYy + (opts.past ? 0 : 10) ? 1900 + y : 2000 + y;
    if (opts.past && full > new Date().getFullYear()) full -= 100;
    return full;
  };
  let m: RegExpMatchArray | null;
  let y = 0, mo = 0, d = 0;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) {
    mo = +m[1]; d = +m[2]; y = fixYear(+m[3]);
    if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; }
  } else if ((m = s.match(/^(\d{8})$/))) {
    const a = +m[1].slice(0, 4);
    if (a >= 1800 && a <= 2100) { y = a; mo = +m[1].slice(4, 6); d = +m[1].slice(6, 8); }
    else { mo = +m[1].slice(0, 2); d = +m[1].slice(2, 4); y = +m[1].slice(4, 8); }
  } else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/))) { mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()] || 0; d = +m[2]; y = fixYear(+m[3]); }
  else if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})\.?[\s\-,]+(\d{2,4})$/))) { d = +m[1]; mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()] || 0; y = fixYear(+m[3]); }
  else if ((m = s.match(/^(\d{4,5})(?:\.\d+)?$/))) {
    const iso = excelSerialToIso(+m[1]);
    if (iso && +iso.slice(0, 4) >= 1900) return { value: iso };
  }
  if (validYmd(y, mo, d)) return { value: `${y}-${pad(mo)}-${pad(d)}` };
  return { warning: `Unrecognized date "${raw}"` };
}

export function normPhone(raw: string | undefined): string | undefined {
  const s = (raw || '').trim();
  if (!s) return undefined;
  let ext = '';
  const em = s.match(/(?:ext\.?|extension|x)\s*(\d{1,6})\s*$/i);
  const body = em ? s.slice(0, em.index) : s;
  if (em) ext = ` x${em[1]}`;
  let d = body.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}${ext}`;
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}${ext}`;
  return s;
}

const STATES: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
export function normState(raw: string | undefined): string | undefined {
  const s = (raw || '').trim();
  if (!s) return undefined;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return STATES[s.toLowerCase()] || s;
}
export function normZip(raw: string | undefined): string | undefined {
  const s = (raw || '').trim();
  if (!s) return undefined;
  if (/^\d{4}$/.test(s)) return `0${s}`;       // Excel ate the leading zero
  if (/^\d{8}$/.test(s)) return `0${s.slice(0, 4)}-${s.slice(4)}`;
  if (/^\d{9}$/.test(s)) return `${s.slice(0, 5)}-${s.slice(5)}`;
  return s;
}
export function normEmail(raw: string | undefined): string | undefined {
  const s = (raw || '').trim().toLowerCase().split(/[;, ]+/)[0];
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : undefined;
}
export function normGender(raw: string | undefined): string | undefined {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'm' || s.startsWith('male') || s === 'man' || s === 'boy') return 'Male';
  if (s === 'f' || s.startsWith('female') || s === 'woman' || s === 'girl') return 'Female';
  return raw!.trim();
}

export interface ParsedAmount { value: number; ok: boolean; negative: boolean }
/** "$1,234.50" -> 1234.5 ; "(12.00)" / "-12" / "12.00-" / "12 CR" -> negative (flagged). */
export function parseAmount(raw: string | undefined): ParsedAmount {
  const s = (raw || '').trim();
  if (!s) return { value: 0, ok: false, negative: false };
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-\s*$/.test(s) || /\bCR\b/i.test(s) || /^\$-/.test(s);
  let n = s.replace(/[^0-9.,]/g, '');
  if (!/\d/.test(n)) return { value: 0, ok: false, negative };
  if (n.includes(',') && n.includes('.')) n = n.lastIndexOf(',') > n.lastIndexOf('.') ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
  else if (n.includes(',')) n = /,\d{1,2}$/.test(n) && n.split(',').length === 2 ? n.replace(',', '.') : n.replace(/,/g, '');
  const v = Math.round(parseFloat(n) * 100) / 100;
  return { value: Math.abs(v), ok: isFinite(v), negative: negative && v !== 0 };
}

export function mapStatus(raw: string | undefined): ChmsMemberStatus {
  const s = (raw || '').toLowerCase();
  if (!s.trim()) return 'REGULAR';
  if (/decea|death|died|passed/.test(s)) return 'DECEASED';
  if (/transfer|moved|letter|relocat|left/.test(s)) return 'TRANSFERRED';
  if (/inactive|former|drop|remov|resign|discipl|lapsed|excluded/.test(s)) return 'INACTIVE';
  if (/visit|guest|prospect|first.?time|new.?comer|seeker/.test(s)) return 'VISITOR';
  if (/regular|attend|non.?member|friend|adherent|constituent|affiliate|child|youth|student/.test(s)) return 'REGULAR';
  if (/member|active|baptized|confirmed|full/.test(s)) return 'MEMBER';
  return 'REGULAR';
}

export function mapMethod(raw: string | undefined, checkNumber?: string): ChmsGiftMethod {
  const s = (raw || '').toLowerCase();
  if (/check|cheque|chk/.test(s)) return 'CHECK';
  if (/cash|currency/.test(s)) return 'CASH';
  if (/online|web|paypal|stripe|venmo|pushpay|text|give|app|kiosk|tithe\.?ly/.test(s)) return 'ONLINE';
  if (/credit|debit|card|visa|master|amex|discover/.test(s)) return 'CARD';
  if (/ach|eft|bank|draft|direct|wire|transfer|recurring/.test(s)) return 'ACH';
  if (/stock|securit|share/.test(s)) return 'STOCK';
  if (/in.?kind|goods|non.?cash|service/.test(s)) return 'INKIND';
  if (!s && checkNumber) return 'CHECK';
  return 'OTHER';
}

export function mapFrequency(raw: string | undefined): ChmsPledge['frequency'] {
  const s = (raw || '').toLowerCase();
  if (/week/.test(s)) return 'WEEKLY';
  if (/month/.test(s)) return 'MONTHLY';
  if (/quarter/.test(s)) return 'QUARTERLY';
  if (/year|annual/.test(s)) return 'YEARLY';
  return 'ONCE';
}

export function mapHouseholdRole(raw: string | undefined): 'HEAD' | 'SPOUSE' | 'CHILD' | 'OTHER' | undefined {
  const s = (raw || '').toLowerCase().trim();
  if (!s) return undefined;
  if (/head|primary|husband|father|^adult$|main/.test(s)) return 'HEAD';
  if (/spouse|wife|partner/.test(s)) return 'SPOUSE';
  if (/child|son|daughter|kid|youth|dependent|minor/.test(s)) return 'CHILD';
  return 'OTHER';
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'fund';
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** Fix SHOUTING / lowercase names from legacy systems without wrecking "McDonald" or "DeShawn". */
export function tidyName(raw: string | undefined): string {
  const s = (raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s === s.toUpperCase() || s === s.toLowerCase() ? titleCase(s) : s;
}

/** "Smith, John A" -> {last:'Smith', first:'John A'}; "John Smith" -> {first:'John', last:'Smith'}. */
export function splitFullName(raw: string | undefined): { first: string; last: string } {
  const s = (raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return { first: '', last: '' };
  if (s.includes(',')) { const [l, ...f] = s.split(','); return { first: tidyName(f.join(' ')), last: tidyName(l) }; }
  const parts = s.split(' ');
  if (parts.length === 1) return { first: '', last: tidyName(parts[0]) };
  return { first: tidyName(parts.slice(0, -1).join(' ')), last: tidyName(parts[parts.length - 1]) };
}

/** 53-bit string hash (cyrb53), base36 — used for deterministic doc ids so re-imports are idempotent. */
export function hashId(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const stableId = (s: string) => hashId(s, 1) + hashId(s, 7);

/** Sanitize a header for use as a Firestore map key. */
export const safeKey = (h: string) => h.replace(/[.\/\[\]*`~]+/g, '_').trim().slice(0, 60) || 'column';

// ── Sample templates (downloadable) ──────────────────────────────────────────

export const SAMPLE_TEMPLATES: Record<'people' | 'contributions' | 'pledges' | 'attendance', string> = {
  people: toCsv([
    ['Individual ID', 'Family ID', 'Envelope #', 'First Name', 'Last Name', 'Family Role', 'Email', 'Cell Phone', 'Home Phone', 'Address 1', 'City', 'State', 'Zip', 'Birth Date', 'Member Status', 'Date Joined', 'Baptism Date', 'Marital Status'],
    ['1001', 'F100', '214', 'John', 'Smith', 'Head', 'john@example.com', '313-555-0100', '', '12 Main St', 'Detroit', 'MI', '48201', '03/14/1975', 'Active Member', '06/01/2005', '05/20/1990', 'Married'],
    ['1002', 'F100', '214', 'Mary', 'Smith', 'Spouse', 'mary@example.com', '313-555-0101', '', '12 Main St', 'Detroit', 'MI', '48201', '11/02/1977', 'Active Member', '06/01/2005', '', 'Married'],
  ]),
  contributions: toCsv([
    ['Gift Date', 'Envelope #', 'Last Name', 'First Name', 'Fund', 'Amount', 'Check #', 'Batch', 'Memo'],
    ['01/07/2024', '214', 'Smith', 'John', 'General Fund', '$250.00', '4411', 'B-2024-01', 'Tithe'],
    ['01/07/2024', '214', 'Smith', 'John', 'Missions', '$50.00', '4411', 'B-2024-01', ''],
  ]),
  pledges: toCsv([
    ['Envelope #', 'Last Name', 'First Name', 'Fund', 'Pledge Amount', 'Frequency', 'Start Date', 'End Date'],
    ['214', 'Smith', 'John', 'Building Fund', '$6000.00', 'Monthly', '01/01/2024', '12/31/2024'],
  ]),
  attendance: toCsv([
    ['Attendance Date', 'Individual ID', 'Last Name', 'First Name', 'Event', 'Group'],
    ['01/07/2024', '1001', 'Smith', 'John', 'Sunday Worship 10am', ''],
  ]),
};
