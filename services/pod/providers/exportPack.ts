// Export-pack "providers": printers with NO public ordering/publishing API (or partner-gated). Plajah builds the
// print-ready files + metadata; the author uploads them in the printer's own dashboard. We never claim a direct connection.
//   - Amazon KDP: no public API (upload via kdp.amazon.com bookshelf).
//   - IngramSpark: no public self-serve API found (upload via myaccount.ingramspark.com); Ingram's data feeds are for accounts, not us.
//   - Draft2Digital Print: no public API found for print.
//   - Blurb: print API exists but is partner-gated; adapter is a documented stub.
import type { PodProvider, PrinterId, PrintEdition } from '../podTypes';
import { getTrim } from '../printSpec';

export interface ExportGuide { printer: PrinterId; name: string; dashboardUrl: string; steps: string[]; notes: string[] }

const mk = (id: PrinterId, name: string, summary: string, hardcover: boolean, partner = false): PodProvider => ({
  id, name, configured: () => true,
  capabilities: { directOrder: false, directPublish: false, quote: false, webhooks: false, hardcover, exportPack: true, requiresPartnership: partner, summary },
});

export const kdpExport = mk('kdp', 'Amazon KDP', 'Export pack: upload the interior + cover in KDP yourself. KDP has no public API.', true);
export const ingramExport = mk('ingramspark', 'IngramSpark', 'Export pack: upload in your IngramSpark account. No public API found.', true);
export const draft2digitalExport = mk('draft2digital', 'Draft2Digital Print', 'Export pack: upload in D2D. No public print API found.', false);
export const blurbExport = mk('blurb', 'Blurb', 'Requires a Blurb partnership for API access. Until then: export pack for manual upload.', true, true);

export const EXPORT_GUIDES: Record<string, ExportGuide> = {
  kdp: {
    printer: 'kdp', name: 'Amazon KDP', dashboardUrl: 'https://kdp.amazon.com/bookshelf',
    steps: ['Create a new paperback (or hardcover) title and paste the metadata from metadata.csv.', 'Choose the same trim size, paper and bleed setting shown in the Plajah spec sheet.',
      'Upload interior.pdf, then use KDP\'s cover calculator with your final page count to confirm the cover size, then upload cover.pdf.', 'Use KDP\'s previewer; fix any margin warnings and publish.'],
    notes: ['KDP can assign a free ISBN; if you do, re-export so the barcode matches.', 'KDP\'s own previewer is the final authority on cover dimensions.'],
  },
  ingramspark: {
    printer: 'ingramspark', name: 'IngramSpark', dashboardUrl: 'https://myaccount.ingramspark.com/',
    steps: ['Add a new title; supply your own ISBN (Ingram requires one, and it must match the cover barcode).', 'Match trim, paper and binding to the spec sheet.',
      'Upload interior.pdf and cover.pdf (generate Ingram\'s cover template with your final page count and compare dimensions).', 'Use onix.xml / metadata.csv to fill or bulk-load metadata.'],
    notes: ['Ingram spine width comes from their cover template generator; our figure is a third-party-sourced estimate.', 'Hardcover case-laminate spines follow Ingram\'s stepped table; use their generator.'],
  },
  draft2digital: {
    printer: 'draft2digital', name: 'Draft2Digital Print', dashboardUrl: 'https://draft2digital.com/',
    steps: ['Start a print edition from your D2D book page.', 'Upload interior.pdf and cover.pdf; confirm trim and spine in their preview.'],
    notes: ['No API was found for print uploads; this is a manual path.'],
  },
  blurb: {
    printer: 'blurb', name: 'Blurb', dashboardUrl: 'https://www.blurb.com/',
    steps: ['Blurb\'s print API is partner-only. Use Blurb\'s own tools or BookWright with the exported PDFs where the format allows.'],
    notes: ['Adapter stub: apply for a Blurb partnership to enable direct ordering.'],
  },
};

const csvCell = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;

export function buildMetadataCsv(e: PrintEdition, pageCount: number, description: string): string {
  const t = getTrim(e.trimId);
  const rows: Array<[string, unknown]> = [
    ['title', e.title], ['author', e.author], ['publisher', e.publisher || 'Self-published'], ['isbn13', e.isbn13 || ''],
    ['description', description], ['trim_width_in', t.wIn], ['trim_height_in', t.hIn], ['page_count', pageCount],
    ['binding', e.binding], ['paper', `${e.paperWeight}lb ${e.paperColor}`], ['interior_ink', e.colorInterior ? 'color' : 'black_and_white'],
    ['list_price_usd', (e.listPriceCents / 100).toFixed(2)], ['language', 'en'],
  ];
  return 'field,value\n' + rows.map(([k, v]) => `${k},${csvCell(v)}`).join('\n') + '\n';
}

const xml = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

/** Starter ONIX 3.0 short-tag record. Validate against your distributor before submission. */
export function buildOnix(e: PrintEdition, pageCount: number, description: string): string {
  const form = e.binding === 'HARDCOVER_CASEWRAP' ? 'BB' : e.binding === 'SADDLE_STITCH' ? 'BF' : 'BC';
  const t = getTrim(e.trimId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ONIXMessage release="3.0" xmlns="http://ns.editeur.org/onix/3.0/reference">
  <Header><Sender><SenderName>${xml(e.publisher || e.author)}</SenderName></Sender><SentDateTime>${new Date().toISOString().slice(0, 10).replace(/-/g, '')}</SentDateTime></Header>
  <Product>
    <RecordReference>plajah-${xml(e.albumId)}</RecordReference>
    <NotificationType>03</NotificationType>
    ${e.isbn13 ? `<ProductIdentifier><ProductIDType>15</ProductIDType><IDValue>${xml(e.isbn13)}</IDValue></ProductIdentifier>` : ''}
    <DescriptiveDetail>
      <ProductComposition>00</ProductComposition><ProductForm>${form}</ProductForm>
      <TitleDetail><TitleType>01</TitleType><TitleElement><TitleElementLevel>01</TitleElementLevel><TitleText>${xml(e.title)}</TitleText></TitleElement></TitleDetail>
      <Contributor><SequenceNumber>1</SequenceNumber><ContributorRole>A01</ContributorRole><PersonName>${xml(e.author)}</PersonName></Contributor>
      <Extent><ExtentType>00</ExtentType><ExtentValue>${pageCount}</ExtentValue><ExtentUnit>03</ExtentUnit></Extent>
      <Measure><MeasureType>01</MeasureType><Measurement>${Math.round(t.hIn * 25.4)}</Measurement><MeasureUnitCode>mm</MeasureUnitCode></Measure>
      <Measure><MeasureType>02</MeasureType><Measurement>${Math.round(t.wIn * 25.4)}</Measurement><MeasureUnitCode>mm</MeasureUnitCode></Measure>
    </DescriptiveDetail>
    <CollateralDetail><TextContent><TextType>03</TextType><ContentAudience>00</ContentAudience><Text>${xml(description)}</Text></TextContent></CollateralDetail>
    <ProductSupply><SupplyDetail><Price><PriceType>02</PriceType><PriceAmount>${(e.listPriceCents / 100).toFixed(2)}</PriceAmount><CurrencyCode>USD</CurrencyCode></Price></SupplyDetail></ProductSupply>
  </Product>
</ONIXMessage>
`;
}
