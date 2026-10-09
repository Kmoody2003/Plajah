// Portability: carry the book elsewhere. Two outputs, both pure string builders.
//
//  1. toOnix(): a MINIMAL ONIX 3.0 (reference tags) <Product> for one ebook. It follows the ONIX 3.0 composite order
//     for the blocks it emits and uses code-list values from the EDItEUR lists, but it has NOT been validated against
//     the ONIX XSD and does not cover every retailer's profile (e.g. no AudienceRange precision variants, no
//     ProductFormFeature accessibility codes). Treat it as a starting file for a distributor, not a certified feed.
//  2. toDistributionCsv(): a flat "distribution pack" CSV with the fields the self-publishing dashboards ask for
//     (KDP / IngramSpark / Draft2Digital / Smashwords / Kobo Writing Life / Apple Books for Authors). Column NAMES are
//     conceptual groupings — those platforms use web forms or their own templates that change often, so map by
//     meaning rather than expecting a drop-in import.

import type { BookDraft, BookMetadata, BookPricing, CoverInfo } from './types';
import { stripTags } from './util';
import { checkIsbn } from './isbn';
import { bisacByCode } from './bisac';

export interface ExportBook {
  id: string;
  metadata: BookMetadata;
  pricing: BookPricing;
  cover: CoverInfo | null;
  wordCount: number;
  chapterCount: number;
  sourceFileName?: string;
}

export function exportBookFromDraft(d: BookDraft): ExportBook {
  const inc = (d.manuscript?.chapters || []).filter(c => c.included && (c.kind ?? 'chapter') === 'chapter');
  return { id: d.id, metadata: d.metadata, pricing: d.pricing, cover: d.cover, wordCount: inc.reduce((s, c) => s + c.wordCount, 0), chapterCount: inc.length, sourceFileName: d.manuscript?.fileName };
}

const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (n: string, v: string | number | undefined, attrs = '') => v === undefined || v === '' ? '' : `<${n}${attrs}>${esc(String(v))}</${n}>`;
const ymd = (d: string) => d.replace(/-/g, '').slice(0, 8);

/** ISO 639-1 -> ISO 639-2/B (ONIX uses the 3-letter bibliographic code). Common languages only; unknown -> 'und'. */
const LANG3: Record<string, string> = {
  en: 'eng', es: 'spa', fr: 'fre', de: 'ger', it: 'ita', pt: 'por', nl: 'dut', sv: 'swe', da: 'dan', no: 'nor', fi: 'fin', pl: 'pol', ru: 'rus',
  uk: 'ukr', tr: 'tur', ar: 'ara', he: 'heb', hi: 'hin', bn: 'ben', ur: 'urd', zh: 'chi', ja: 'jpn', ko: 'kor', vi: 'vie', th: 'tha', id: 'ind',
  sw: 'swa', yo: 'yor', ig: 'ibo', ha: 'hau', zu: 'zul', xh: 'xho', af: 'afr', am: 'amh', la: 'lat', el: 'gre', cs: 'cze', hu: 'hun', ro: 'rum',
};
export const lang3 = (l: string) => LANG3[(l || '').toLowerCase().split('-')[0]] ?? 'und';

/** ONIX list 17 contributor roles. */
const ROLE_CODE: Record<string, string> = { author: 'A01', editor: 'B01', translator: 'B06', illustrator: 'A12', narrator: 'E07', foreword: 'A23', cover_designer: 'A36' };

function inverted(name: string): { inv: string; keys: string; before: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { inv: name.trim(), keys: name.trim(), before: '' };
  const keys = parts[parts.length - 1];
  const before = parts.slice(0, -1).join(' ');
  return { inv: `${keys}, ${before}`, keys, before };
}

export function toOnix(b: ExportBook, opts: { senderName?: string; sentAt?: Date; supplierName?: string } = {}): string {
  const m = b.metadata, p = b.pricing;
  const sent = (opts.sentAt ?? new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15);
  const c = checkIsbn(m.isbn.mode === 'own' ? m.isbn.value : '');
  const publicationDate = m.publicationDate || new Date().toISOString().slice(0, 10);
  const forthcoming = Date.parse(publicationDate) > (opts.sentAt ?? new Date()).getTime();
  const authorName = m.penName || m.contributors.find(x => x.role === 'author')?.name || '';

  const idBlocks = [
    `<ProductIdentifier><ProductIDType>01</ProductIDType><IDTypeName>Plajah</IDTypeName><IDValue>${esc(b.id)}</IDValue></ProductIdentifier>`,
    c.valid && c.isbn13 ? `<ProductIdentifier><ProductIDType>15</ProductIDType><IDValue>${c.isbn13}</IDValue></ProductIdentifier>` : '',
    m.isbn.mode === 'platform' && m.isbn.ark ? `<ProductIdentifier><ProductIDType>01</ProductIDType><IDTypeName>ARK</IDTypeName><IDValue>${esc(m.isbn.ark)}</IDValue></ProductIdentifier>` : '',
  ].join('');

  const contributors = (m.contributors.length ? m.contributors : authorName ? [{ name: authorName, role: 'author' as const }] : [])
    .filter(x => x.name.trim())
    .map((x, i) => {
      const n = inverted(x.name);
      return `<Contributor>${tag('SequenceNumber', i + 1)}${tag('ContributorRole', ROLE_CODE[x.role] || 'A01')}${tag('PersonName', x.name.trim())}${tag('PersonNameInverted', n.inv)}${tag('NamesBeforeKey', n.before)}${tag('KeyNames', n.keys)}</Contributor>`;
    }).join('');

  const subjects = [
    ...m.bisac.map((code, i) => `<Subject>${i === 0 ? '<MainSubject/>' : ''}<SubjectSchemeIdentifier>10</SubjectSchemeIdentifier>${tag('SubjectSchemeVersion', '2021')}${tag('SubjectCode', code)}${tag('SubjectHeadingText', bisacByCode(code)?.label)}</Subject>`),
    ...m.thema.map(code => `<Subject><SubjectSchemeIdentifier>93</SubjectSchemeIdentifier>${tag('SubjectCode', code)}</Subject>`),
    m.keywords.filter(k => k.trim()).length ? `<Subject><SubjectSchemeIdentifier>20</SubjectSchemeIdentifier>${tag('SubjectHeadingText', m.keywords.filter(k => k.trim()).join('; '))}</Subject>` : '',
  ].join('');

  const audience = (m.audience.minAge != null || m.audience.maxAge != null)
    ? `<AudienceRange><AudienceRangeQualifier>17</AudienceRangeQualifier>${m.audience.minAge != null ? `<AudienceRangePrecision>03</AudienceRangePrecision>${tag('AudienceRangeValue', m.audience.minAge)}` : ''}${m.audience.maxAge != null ? `<AudienceRangePrecision>04</AudienceRangePrecision>${tag('AudienceRangeValue', m.audience.maxAge)}` : ''}</AudienceRange>`
    : '';

  const series = m.seriesName
    ? `<Collection><CollectionType>10</CollectionType><TitleDetail><TitleType>01</TitleType><TitleElement><TitleElementLevel>02</TitleElementLevel>${tag('PartNumber', m.seriesNumber)}${tag('TitleText', m.seriesName)}</TitleElement></TitleDetail></Collection>` : '';

  const regions = m.territories.worldwide
    ? `<Territory><RegionsIncluded>WORLD</RegionsIncluded></Territory>`
    : `<Territory><CountriesIncluded>${esc(m.territories.countries.join(' '))}</CountriesIncluded></Territory>`;

  const prices = p.model === 'FREE'
    ? `<Price><PriceType>02</PriceType><PriceAmount>0.00</PriceAmount><CurrencyCode>USD</CurrencyCode></Price>`
    : Object.entries(p.prices).filter(([, v]) => v > 0).map(([cur, v]) => `<Price><PriceType>02</PriceType><PriceAmount>${v.toFixed(2)}</PriceAmount><CurrencyCode>${esc(cur)}</CurrencyCode></Price>`).join('');

  const desc = stripTags(m.description);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ONIXMessage release="3.0" xmlns="http://ns.editeur.org/onix/3.0/reference">
<Header><Sender>${tag('SenderName', opts.senderName || 'Plajah (author export)')}</Sender>${tag('SentDateTime', sent + 'Z')}</Header>
<Product>
<RecordReference>${esc(b.id)}</RecordReference>
<NotificationType>03</NotificationType>
${idBlocks}
<DescriptiveDetail>
<ProductComposition>00</ProductComposition>
<ProductForm>ED</ProductForm>
<ProductFormDetail>E101</ProductFormDetail>
<EpubTechnicalProtection>${p.delivery === 'DOWNLOAD_OPEN' ? '00' : '02'}</EpubTechnicalProtection>
${series}
<TitleDetail><TitleType>01</TitleType><TitleElement><TitleElementLevel>01</TitleElementLevel>${tag('TitleText', m.title)}${tag('Subtitle', m.subtitle)}</TitleElement></TitleDetail>
${contributors}
${m.edition ? tag('EditionStatement', m.edition) : ''}
<Language><LanguageRole>01</LanguageRole><LanguageCode>${lang3(m.language)}</LanguageCode></Language>
${b.wordCount ? `<Extent><ExtentType>02</ExtentType><ExtentValue>${b.wordCount}</ExtentValue><ExtentUnit>02</ExtentUnit></Extent>` : ''}
${subjects}
${m.audience.adult || m.matureContent ? '<Audience><AudienceCodeType>01</AudienceCodeType><AudienceCodeValue>03</AudienceCodeValue></Audience>' : ''}
${audience}
</DescriptiveDetail>
<CollateralDetail>
${desc ? `<TextContent><TextType>03</TextType><ContentAudience>00</ContentAudience><Text textformat="06">${esc(desc)}</Text></TextContent>` : ''}
${b.cover?.url ? `<SupportingResource><ResourceContentType>01</ResourceContentType><ContentAudience>00</ContentAudience><ResourceMode>03</ResourceMode><ResourceVersion><ResourceForm>02</ResourceForm><ResourceLink>${esc(b.cover.url)}</ResourceLink></ResourceVersion></SupportingResource>` : ''}
</CollateralDetail>
<PublishingDetail>
<Publisher><PublishingRole>01</PublishingRole>${tag('PublisherName', authorName || 'Independent')}</Publisher>
<PublishingStatus>${forthcoming ? '02' : '04'}</PublishingStatus>
<PublishingDate><PublishingDateRole>01</PublishingDateRole><DateFormat>00</DateFormat><Date>${ymd(publicationDate)}</Date></PublishingDate>
${m.originalPublicationDate ? `<PublishingDate><PublishingDateRole>11</PublishingDateRole><DateFormat>00</DateFormat><Date>${ymd(m.originalPublicationDate)}</Date></PublishingDate>` : ''}
${m.copyrightHolder && !m.publicDomain ? `<CopyrightStatement><CopyrightType>01</CopyrightType>${tag('CopyrightYear', m.copyrightYear)}<CopyrightOwner>${tag('PersonName', m.copyrightHolder)}</CopyrightOwner></CopyrightStatement>` : ''}
<SalesRights><SalesRightsType>02</SalesRightsType>${regions}</SalesRights>
</PublishingDetail>
<ProductSupply><SupplyDetail><Supplier><SupplierRole>01</SupplierRole>${tag('SupplierName', opts.supplierName || authorName || 'Independent')}</Supplier><ProductAvailability>${forthcoming ? '10' : '20'}</ProductAvailability>${prices}</SupplyDetail></ProductSupply>
</Product>
</ONIXMessage>
`.replace(/\n{2,}/g, '\n');
}

// ── CSV ───────────────────────────────────────────────────────────────────────────

const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const DISTRIBUTION_COLUMNS = [
  'Title', 'Subtitle', 'Series Name', 'Series Number', 'Edition', 'Language', 'Author', 'Pen Name',
  'Editor', 'Translator', 'Illustrator', 'Narrator', 'Description (plain text)', 'Description (HTML)',
  'Keyword 1', 'Keyword 2', 'Keyword 3', 'Keyword 4', 'Keyword 5', 'Keyword 6', 'Keyword 7',
  'BISAC 1', 'BISAC 2', 'BISAC 3', 'Thema', 'Reading Age Min', 'Reading Age Max', 'Adult Content',
  'Publication Date', 'Original Publication Date', 'Public Domain', 'ISBN-13', 'Plajah Identifier',
  'Copyright Holder', 'Copyright Year', 'Territories', 'AI Generated Text', 'AI Generated Images', 'AI Assisted', 'License',
  'List Price USD', 'List Price EUR', 'List Price GBP', 'Other Prices', 'Pre-order', 'Pre-order Date', 'Free Sample %', 'DRM', 'Word Count', 'Cover Width', 'Cover Height', 'Cover URL',
] as const;

export function toDistributionRow(b: ExportBook): Record<(typeof DISTRIBUTION_COLUMNS)[number], string | number> {
  const m = b.metadata, p = b.pricing;
  const names = (role: string) => m.contributors.filter(c => c.role === role).map(c => c.name.trim()).filter(Boolean).join('; ');
  const k = (i: number) => m.keywords[i] ?? '';
  const c = checkIsbn(m.isbn.mode === 'own' ? m.isbn.value : '');
  const priceOf = (cur: string) => p.model === 'FREE' ? '0.00' : p.prices[cur] != null ? p.prices[cur].toFixed(2) : '';
  const other = Object.entries(p.prices).filter(([cur]) => !['USD', 'EUR', 'GBP'].includes(cur)).map(([cur, v]) => `${cur} ${v.toFixed(2)}`).join('; ');
  return {
    'Title': m.title, 'Subtitle': m.subtitle, 'Series Name': m.seriesName, 'Series Number': m.seriesNumber, 'Edition': m.edition,
    'Language': m.language, 'Author': names('author'), 'Pen Name': m.penName, 'Editor': names('editor'), 'Translator': names('translator'),
    'Illustrator': names('illustrator'), 'Narrator': names('narrator'),
    'Description (plain text)': stripTags(m.description), 'Description (HTML)': m.description,
    'Keyword 1': k(0), 'Keyword 2': k(1), 'Keyword 3': k(2), 'Keyword 4': k(3), 'Keyword 5': k(4), 'Keyword 6': k(5), 'Keyword 7': k(6),
    'BISAC 1': m.bisac[0] ?? '', 'BISAC 2': m.bisac[1] ?? '', 'BISAC 3': m.bisac[2] ?? '', 'Thema': m.thema.join('; '),
    'Reading Age Min': m.audience.minAge ?? '', 'Reading Age Max': m.audience.maxAge ?? '', 'Adult Content': m.matureContent || m.audience.adult ? 'Yes' : 'No',
    'Publication Date': m.publicationDate, 'Original Publication Date': m.originalPublicationDate, 'Public Domain': m.publicDomain ? 'Yes' : 'No',
    'ISBN-13': c.valid ? c.isbn13! : '', 'Plajah Identifier': m.isbn.ark ?? '',
    'Copyright Holder': m.copyrightHolder, 'Copyright Year': m.copyrightYear,
    'Territories': m.territories.worldwide ? 'WORLD' : m.territories.countries.join(' '),
    'AI Generated Text': m.ai.text === 'generated' ? 'Yes' : 'No', 'AI Generated Images': m.ai.images === 'generated' ? 'Yes' : 'No',
    'AI Assisted': (m.ai.text === 'assisted' || m.ai.images === 'assisted' || m.ai.translation !== 'none') ? 'Yes' : 'No', 'License': m.license,
    'List Price USD': priceOf('USD'), 'List Price EUR': priceOf('EUR'), 'List Price GBP': priceOf('GBP'), 'Other Prices': other,
    'Pre-order': p.preorder.enabled ? 'Yes' : 'No', 'Pre-order Date': p.preorder.enabled ? p.preorder.date : '', 'Free Sample %': p.freeSamplePct,
    'DRM': p.delivery === 'DOWNLOAD_OPEN' ? 'No DRM' : 'Plajah-only', 'Word Count': b.wordCount,
    'Cover Width': b.cover?.width ?? '', 'Cover Height': b.cover?.height ?? '', 'Cover URL': b.cover?.url ?? '',
  };
}

export function toDistributionCsv(books: ExportBook[]): string {
  const rows = books.map(toDistributionRow);
  return [DISTRIBUTION_COLUMNS.map(csvCell).join(','), ...rows.map(r => DISTRIBUTION_COLUMNS.map(col => csvCell(r[col])).join(','))].join('\r\n') + '\r\n';
}
