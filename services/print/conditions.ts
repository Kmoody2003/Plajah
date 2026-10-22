// Printing conditions — the colour and ink rules a press runs to.
//
// TAC limits and registry identifiers follow the published characterisations as commonly specified by
// printers. They were written from industry references, not re-fetched from the ICC registry this
// session, so each carries `verified: false` until checked; the printer's own spec always wins.
// Tela separates with an ICC-less model (services/tela/raster/color.ts), so CMYK output is a close
// approximation of a real profile conversion — good for proofing and most digital/offset jobs, and
// labelled as such. Colour-critical work should be converted by the printer's RIP or a profile.

import type { OutputCondition, PaperStock } from './types';

export const OUTPUT_CONDITIONS: OutputCondition[] = [
  {
    id: 'HOME_RGB', label: 'Home / office printer (RGB)', intent: 'home', colorModel: 'RGB', tac: 400, gcr: 0,
    ppi: { min: 120, recommended: 200 }, minStrokePt: 0.25, minReverseTextPt: 6,
    verified: true, source: 'Desktop inkjet/laser drivers take RGB and separate internally.',
  },
  {
    id: 'FOGRA39', label: 'Coated offset — FOGRA39 (ISO Coated v2)', intent: 'offset', colorModel: 'CMYK', tac: 330, gcr: 0.6,
    ppi: { min: 250, recommended: 300 }, minStrokePt: 0.25, minReverseTextPt: 7,
    outputConditionIdentifier: 'FOGRA39', registryName: 'http://www.color.org',
    verified: false, source: 'ISO 12647-2 PC1 coated; 330% TAC per ISO Coated v2 (ECI).',
  },
  {
    id: 'FOGRA52', label: 'Uncoated offset — FOGRA52 (PSO Uncoated v3)', intent: 'offset', colorModel: 'CMYK', tac: 300, gcr: 0.7,
    ppi: { min: 250, recommended: 300 }, minStrokePt: 0.3, minReverseTextPt: 8,
    outputConditionIdentifier: 'FOGRA52', registryName: 'http://www.color.org',
    verified: false, source: 'PSO Uncoated v3 (FOGRA52) commonly run at 300% TAC.',
  },
  {
    id: 'GRACOL2013', label: 'US sheetfed coated — GRACoL 2013 (CRPC6)', intent: 'offset', colorModel: 'CMYK', tac: 320, gcr: 0.6,
    ppi: { min: 250, recommended: 300 }, minStrokePt: 0.25, minReverseTextPt: 7,
    outputConditionIdentifier: 'CGATS21-2-CRPC6', registryName: 'http://www.color.org',
    verified: false, source: 'CGATS 21-2 CRPC6; 320% TAC is the usual GRACoL spec.',
  },
  {
    id: 'SWOP', label: 'US web offset — SWOP (magazines, catalogs)', intent: 'offset', colorModel: 'CMYK', tac: 300, gcr: 0.65,
    ppi: { min: 250, recommended: 300 }, minStrokePt: 0.25, minReverseTextPt: 8,
    outputConditionIdentifier: 'CGATS TR 001', registryName: 'http://www.color.org',
    verified: false, source: 'SWOP publication printing; 300% TAC is the long-standing SWOP limit.',
  },
  {
    id: 'NEWSPRINT26', label: 'Newsprint — ISOnewspaper26 (IFRA26)', intent: 'newsprint', colorModel: 'CMYK', tac: 240, gcr: 0.8,
    ppi: { min: 170, recommended: 200 }, minStrokePt: 0.5, minReverseTextPt: 10,
    outputConditionIdentifier: 'IFRA26', registryName: 'http://www.color.org',
    verified: false, source: 'ISO 12647-3 coldset newsprint; 240% TAC; heavier GCR keeps grey balance on press.',
  },
  {
    id: 'WIDE_FORMAT', label: 'Wide format — vinyl, banner, wrap (latex/solvent/UV)', intent: 'wide-format', colorModel: 'RGB', tac: 300, gcr: 0.5,
    // Measured at FULL size. Wraps are seen from metres away; 100 ppi at full size is the common floor.
    ppi: { min: 72, recommended: 120 }, minStrokePt: 2, minReverseTextPt: 24,
    verified: false, source: 'Wide-format shops typically RIP RGB or CMYK artwork at 100–150 ppi full size.',
  },
];

export const conditionById = (id: OutputCondition['id']): OutputCondition =>
  OUTPUT_CONDITIONS.find(c => c.id === id) || OUTPUT_CONDITIONS[0];

// Leaf calipers (inches per leaf). Approximations for planning; printers publish exact PPI values.
export const PAPER_STOCKS: PaperStock[] = [
  { id: 'home-20lb', label: 'Office paper 20 lb / 75 gsm', caliperIn: 0.0040, coated: false, family: 'uncoated' },
  { id: 'news-45gsm', label: 'Newsprint 45 gsm', caliperIn: 0.0030, coated: false, family: 'newsprint' },
  { id: 'uncoated-50lb', label: 'Uncoated text 50 lb / 74 gsm', caliperIn: 0.0040, coated: false, family: 'uncoated' },
  { id: 'uncoated-60lb', label: 'Uncoated text 60 lb / 90 gsm', caliperIn: 0.0045, coated: false, family: 'uncoated' },
  { id: 'gloss-70lb', label: 'Gloss text 70 lb / 105 gsm', caliperIn: 0.0035, coated: true, family: 'coated' },
  { id: 'gloss-100lb', label: 'Gloss text 100 lb / 150 gsm', caliperIn: 0.0050, coated: true, family: 'coated' },
  { id: 'cover-100lb', label: 'Cover 100 lb / 270 gsm', caliperIn: 0.0100, coated: true, family: 'cover' },
  { id: 'vinyl-cast', label: 'Cast wrap vinyl + laminate', caliperIn: 0.0040, coated: false, family: 'vinyl' },
];

export const paperById = (id: string): PaperStock => PAPER_STOCKS.find(p => p.id === id) || PAPER_STOCKS[0];
