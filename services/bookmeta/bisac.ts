// A searchable SUBSET of BISAC Subject Headings (~150 common codes) plus Thema top-level sections.
//
// HONESTY NOTE: BISAC is maintained and licensed by BISG (bisg.org). The full list has ~3,500 codes and is
// revised every year. This file is a hand-compiled convenience subset: the two-level/top-level codes ("XXX000000")
// are the stable ones; the sub-codes below were compiled from memory of recent editions and must be checked
// against the current BISG list before you depend on one for a retailer feed. The wizard says so in the UI and
// the exports carry the code verbatim. Codes are shape-validated (3 letters + 6 digits), not looked up in the
// full list. Nothing here is copied wholesale from the BISG file.

export interface BisacCode { code: string; label: string; group: string; }

const T = (code: string, label: string, group: string): BisacCode => ({ code, label, group });

export const BISAC_SUBSET: BisacCode[] = [
  // ── Fiction ──
  T('FIC000000', 'Fiction / General', 'Fiction'),
  T('FIC002000', 'Fiction / Action & Adventure', 'Fiction'),
  T('FIC004000', 'Fiction / Classics', 'Fiction'),
  T('FIC009000', 'Fiction / Fantasy / General', 'Fiction'),
  T('FIC009020', 'Fiction / Fantasy / Epic', 'Fiction'),
  T('FIC014000', 'Fiction / Historical / General', 'Fiction'),
  T('FIC015000', 'Fiction / Horror', 'Fiction'),
  T('FIC016000', 'Fiction / Humorous / General', 'Fiction'),
  T('FIC019000', 'Fiction / Literary', 'Fiction'),
  T('FIC022000', 'Fiction / Mystery & Detective / General', 'Fiction'),
  T('FIC027000', 'Fiction / Romance / General', 'Fiction'),
  T('FIC027020', 'Fiction / Romance / Contemporary', 'Fiction'),
  T('FIC027050', 'Fiction / Romance / Historical / General', 'Fiction'),
  T('FIC028000', 'Fiction / Science Fiction / General', 'Fiction'),
  T('FIC028010', 'Fiction / Science Fiction / Action & Adventure', 'Fiction'),
  T('FIC028020', 'Fiction / Science Fiction / Apocalyptic & Post-Apocalyptic', 'Fiction'),
  T('FIC029000', 'Fiction / Short Stories (single author)', 'Fiction'),
  T('FIC031000', 'Fiction / Thrillers / General', 'Fiction'),
  T('FIC031080', 'Fiction / Thrillers / Suspense', 'Fiction'),
  T('FIC042000', 'Fiction / Christian / General', 'Fiction'),
  T('FIC044000', 'Fiction / Contemporary Women', 'Fiction'),
  // ── Young adult & juvenile ──
  T('YAF000000', 'Young Adult Fiction / General', 'Young Adult & Juvenile'),
  T('YAF019000', 'Young Adult Fiction / Fantasy / General', 'Young Adult & Juvenile'),
  T('YAF024000', 'Young Adult Fiction / Romance / General', 'Young Adult & Juvenile'),
  T('YAN000000', 'Young Adult Nonfiction / General', 'Young Adult & Juvenile'),
  T('JUV000000', 'Juvenile Fiction / General', 'Young Adult & Juvenile'),
  T('JUV001000', 'Juvenile Fiction / Action & Adventure / General', 'Young Adult & Juvenile'),
  T('JUV002000', 'Juvenile Fiction / Animals / General', 'Young Adult & Juvenile'),
  T('JUV037000', 'Juvenile Fiction / Fantasy & Magic', 'Young Adult & Juvenile'),
  T('JNF000000', 'Juvenile Nonfiction / General', 'Young Adult & Juvenile'),
  // ── Comics ──
  T('CGN000000', 'Comics & Graphic Novels / General', 'Comics'),
  // ── Biography & memoir ──
  T('BIO000000', 'Biography & Autobiography / General', 'Biography & Memoir'),
  T('BIO016000', 'Biography & Autobiography / Historical', 'Biography & Memoir'),
  T('BIO022000', 'Biography & Autobiography / Political', 'Biography & Memoir'),
  T('BIO026000', 'Biography & Autobiography / Personal Memoirs', 'Biography & Memoir'),
  // ── Business ──
  T('BUS000000', 'Business & Economics / General', 'Business'),
  T('BUS025000', 'Business & Economics / Entrepreneurship', 'Business'),
  T('BUS036000', 'Business & Economics / Investments & Securities / General', 'Business'),
  T('BUS041000', 'Business & Economics / Management', 'Business'),
  T('BUS043000', 'Business & Economics / Marketing / General', 'Business'),
  T('BUS050000', 'Business & Economics / Personal Finance / General', 'Business'),
  T('BUS069000', 'Business & Economics / Economics / General', 'Business'),
  T('BUS071000', 'Business & Economics / Leadership', 'Business'),
  // ── Self-help, health, family ──
  T('SEL000000', 'Self-Help / General', 'Self-Help & Health'),
  T('SEL016000', 'Self-Help / Motivational & Inspirational', 'Self-Help & Health'),
  T('SEL024000', 'Self-Help / Stress Management', 'Self-Help & Health'),
  T('SEL027000', 'Self-Help / Personal Growth / General', 'Self-Help & Health'),
  T('HEA000000', 'Health & Fitness / General', 'Self-Help & Health'),
  T('HEA017000', 'Health & Fitness / Diet & Nutrition / General', 'Self-Help & Health'),
  T('HEA039000', 'Health & Fitness / Healthy Living', 'Self-Help & Health'),
  T('PSY000000', 'Psychology / General', 'Self-Help & Health'),
  T('PSY036000', 'Psychology / Mental Health', 'Self-Help & Health'),
  T('FAM000000', 'Family & Relationships / General', 'Self-Help & Health'),
  T('FAM034000', 'Family & Relationships / Parenting / General', 'Self-Help & Health'),
  T('OCC000000', 'Body, Mind & Spirit / General', 'Self-Help & Health'),
  T('MED000000', 'Medical / General', 'Self-Help & Health'),
  // ── History, politics, society ──
  T('HIS000000', 'History / General', 'History & Society'),
  T('HIS002000', 'History / Ancient / General', 'History & Society'),
  T('HIS010000', 'History / Europe / General', 'History & Society'),
  T('HIS027000', 'History / Military / General', 'History & Society'),
  T('HIS036000', 'History / United States / General', 'History & Society'),
  T('HIS037000', 'History / World', 'History & Society'),
  T('POL000000', 'Political Science / General', 'History & Society'),
  T('POL040000', 'Political Science / History & Theory', 'History & Society'),
  T('SOC000000', 'Social Science / General', 'History & Society'),
  T('SOC026000', 'Social Science / Sociology / General', 'History & Society'),
  T('LAW000000', 'Law / General', 'History & Society'),
  T('TRU000000', 'True Crime / General', 'History & Society'),
  // ── Religion & philosophy ──
  T('REL000000', 'Religion / General', 'Religion & Philosophy'),
  T('REL006000', 'Religion / Biblical Studies / General', 'Religion & Philosophy'),
  T('REL007000', 'Religion / Buddhism / General', 'Religion & Philosophy'),
  T('REL012000', 'Religion / Christian Living / General', 'Religion & Philosophy'),
  T('REL037000', 'Religion / Islam / General', 'Religion & Philosophy'),
  T('REL040000', 'Religion / Judaism / General', 'Religion & Philosophy'),
  T('REL067000', 'Religion / Christian Theology / General', 'Religion & Philosophy'),
  T('BIB000000', 'Bibles / General', 'Religion & Philosophy'),
  T('PHI000000', 'Philosophy / General', 'Religion & Philosophy'),
  // ── Science & technology ──
  T('SCI000000', 'Science / General', 'Science & Technology'),
  T('SCI004000', 'Science / Astronomy', 'Science & Technology'),
  T('SCI013000', 'Science / Chemistry / General', 'Science & Technology'),
  T('SCI055000', 'Science / Physics / General', 'Science & Technology'),
  T('MAT000000', 'Mathematics / General', 'Science & Technology'),
  T('NAT000000', 'Nature / General', 'Science & Technology'),
  T('TEC000000', 'Technology & Engineering / General', 'Science & Technology'),
  T('TEC009000', 'Technology & Engineering / Engineering (General)', 'Science & Technology'),
  T('COM000000', 'Computers / General', 'Science & Technology'),
  T('COM004000', 'Computers / Intelligence (AI) & Semantics', 'Science & Technology'),
  T('COM051000', 'Computers / Programming / General', 'Science & Technology'),
  T('COM060000', 'Computers / Internet / General', 'Science & Technology'),
  // ── Arts, culture, lifestyle ──
  T('ART000000', 'Art / General', 'Arts & Culture'),
  T('ARC000000', 'Architecture / General', 'Arts & Culture'),
  T('DES000000', 'Design / General', 'Arts & Culture'),
  T('DRA000000', 'Drama / General', 'Arts & Culture'),
  T('LCO000000', 'Literary Collections / General', 'Arts & Culture'),
  T('LCO008000', 'Literary Collections / Essays', 'Arts & Culture'),
  T('LIT000000', 'Literary Criticism / General', 'Arts & Culture'),
  T('MUS000000', 'Music / General', 'Arts & Culture'),
  T('PER000000', 'Performing Arts / General', 'Arts & Culture'),
  T('PHO000000', 'Photography / General', 'Arts & Culture'),
  T('POE000000', 'Poetry / General', 'Arts & Culture'),
  T('HUM000000', 'Humor / General', 'Arts & Culture'),
  T('ANT000000', 'Antiques & Collectibles / General', 'Arts & Culture'),
  T('CKB000000', 'Cooking / General', 'Home & Hobbies'),
  T('CRA000000', 'Crafts & Hobbies / General', 'Home & Hobbies'),
  T('GAM000000', 'Games & Activities / General', 'Home & Hobbies'),
  T('GAR000000', 'Gardening / General', 'Home & Hobbies'),
  T('HOM000000', 'House & Home / General', 'Home & Hobbies'),
  T('PET000000', 'Pets / General', 'Home & Hobbies'),
  T('SPO000000', 'Sports & Recreation / General', 'Home & Hobbies'),
  T('TRV000000', 'Travel / General', 'Home & Hobbies'),
  // ── Education & reference ──
  T('EDU000000', 'Education / General', 'Education & Reference'),
  T('FOR000000', 'Foreign Language Study / General', 'Education & Reference'),
  T('LAN000000', 'Language Arts & Disciplines / General', 'Education & Reference'),
  T('REF000000', 'Reference / General', 'Education & Reference'),
  T('STU000000', 'Study Aids / General', 'Education & Reference'),
];

export const BISAC_SHAPE = /^[A-Z]{3}\d{6}$/;
export const isBisacShape = (c: string) => BISAC_SHAPE.test((c || '').trim().toUpperCase());
export const bisacByCode = (c: string) => BISAC_SUBSET.find(b => b.code === c.trim().toUpperCase());

/** Case-insensitive search over code + label; all whitespace-separated terms must match. */
export function searchBisac(query: string, limit = 12): BisacCode[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return BISAC_SUBSET.slice(0, limit);
  return BISAC_SUBSET
    .map(b => {
      const hay = `${b.code} ${b.label} ${b.group}`.toLowerCase();
      if (!terms.every(t => hay.includes(t))) return null;
      return { b, score: terms.reduce((s, t) => s + (b.label.toLowerCase().startsWith(t) ? 3 : b.label.toLowerCase().includes(t) ? 2 : 1), 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, limit)
    .map(x => x!.b);
}

/** Thema top-level sections (the 20 letters of the Thema subject scheme, EDItEUR). Optional in the UI. */
export const THEMA_SECTIONS: { code: string; label: string }[] = [
  { code: 'A', label: 'The arts' }, { code: 'B', label: 'Biography & true stories' }, { code: 'C', label: 'Language' },
  { code: 'D', label: 'Literature & literary studies' }, { code: 'F', label: 'Fiction & related items' }, { code: 'G', label: 'Reference, information & interdisciplinary subjects' },
  { code: 'J', label: 'Society & social sciences' }, { code: 'K', label: 'Economics, finance, business & management' }, { code: 'L', label: 'Law' },
  { code: 'M', label: 'Medicine & nursing' }, { code: 'P', label: 'Mathematics & science' }, { code: 'Q', label: 'Philosophy & religion' },
  { code: 'R', label: 'Earth sciences, geography, environment, planning' }, { code: 'S', label: 'Sports & active outdoor recreation' }, { code: 'T', label: 'Technology, engineering, agriculture' },
  { code: 'U', label: 'Computing & information technology' }, { code: 'V', label: 'Health & personal development' }, { code: 'W', label: 'Lifestyle, hobbies & leisure' },
  { code: 'Y', label: "Children's, teenage & educational" }, { code: 'Z', label: 'Other / unclassified' },
];
export const isThemaShape = (c: string) => /^[A-Z][A-Z0-9]{0,7}(-[A-Z0-9]{1,6})?$/.test((c || '').trim().toUpperCase());
