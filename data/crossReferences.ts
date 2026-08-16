// crossReferences — the study rail's cross-reference layer.
//
// HONEST SCOPE: this is a hand-curated seed covering frequently-taught
// passages, not the full apparatus. The complete public-domain set is the
// Treasury of Scripture Knowledge (~340,000 links, public domain) — when that
// dataset is imported it should replace SEED wholesale and keep this module's
// signature, which is why lookup goes through a provider rather than reading
// the map directly. The UI must say when it has nothing for a verse instead of
// implying the verse has no parallels.

import { parseRef, refId, type ScriptureRef } from '../services/scriptureRef';

/** Source verse (as a written reference) → the passages it points at. */
const SEED: Record<string, string[]> = {
  'Genesis 1:1': ['John 1:1', 'Hebrews 11:3', 'Psalm 33:6', 'Colossians 1:16'],
  'Genesis 1:27': ['Genesis 5:1', 'Genesis 9:6', 'Colossians 3:10', 'James 3:9'],
  'Genesis 50:20': ['Romans 8:28', 'Acts 2:23', 'Psalm 105:17'],
  'Exodus 20:3': ['Deuteronomy 5:7', 'Matthew 4:10', 'Isaiah 45:5'],
  'Deuteronomy 6:5': ['Matthew 22:37', 'Mark 12:30', 'Luke 10:27'],
  'Joshua 1:9': ['Deuteronomy 31:6', 'Isaiah 41:10', 'Hebrews 13:5'],
  'Psalm 23:1': ['Isaiah 40:11', 'John 10:11', 'Ezekiel 34:11', 'Revelation 7:17'],
  'Psalm 46:1': ['Psalm 62:8', 'Isaiah 25:4', 'Nahum 1:7'],
  'Psalm 119:105': ['Proverbs 6:23', '2 Peter 1:19', '2 Timothy 3:16'],
  'Proverbs 3:5': ['Jeremiah 17:7', 'Psalm 37:5', 'Proverbs 28:26'],
  'Isaiah 40:31': ['Psalm 103:5', '2 Corinthians 4:16', 'Isaiah 41:1'],
  'Isaiah 41:10': ['Joshua 1:9', 'Deuteronomy 31:6', 'Isaiah 43:5'],
  'Isaiah 53:5': ['1 Peter 2:24', 'Romans 4:25', '2 Corinthians 5:21', 'Matthew 8:17'],
  'Isaiah 53:6': ['1 Peter 2:25', 'Romans 3:23', 'Psalm 119:176'],
  'Jeremiah 29:11': ['Proverbs 23:18', 'Psalm 40:5', 'Romans 8:28'],
  'Micah 6:8': ['Deuteronomy 10:12', 'Hosea 6:6', 'Matthew 23:23'],

  'Matthew 5:14': ['Philippians 2:15', 'John 8:12', 'Ephesians 5:8'],
  'Matthew 6:33': ['Luke 12:31', 'Psalm 37:4', '1 Kings 3:11'],
  'Matthew 11:28': ['John 7:37', 'Jeremiah 31:25', 'Isaiah 55:1'],
  'Matthew 22:37': ['Deuteronomy 6:5', 'Mark 12:30', 'Luke 10:27'],
  'Matthew 28:19': ['Mark 16:15', 'Acts 1:8', 'Luke 24:47'],
  'Mark 12:30': ['Deuteronomy 6:5', 'Matthew 22:37'],
  'Luke 10:27': ['Deuteronomy 6:5', 'Leviticus 19:18', 'Romans 13:9'],

  'John 1:1': ['Genesis 1:1', 'Colossians 1:17', 'Revelation 19:13', '1 John 1:1'],
  'John 1:14': ['Philippians 2:7', 'Colossians 2:9', 'Hebrews 2:14'],
  'John 3:16': ['Romans 5:8', '1 John 4:9', 'John 3:36', 'Ephesians 2:4'],
  'John 10:11': ['Psalm 23:1', 'Ezekiel 34:23', 'Hebrews 13:20'],
  'John 14:6': ['Acts 4:12', 'Hebrews 10:20', 'John 10:9', '1 Timothy 2:5'],
  'John 15:5': ['Philippians 4:13', 'Hosea 14:8', '2 Corinthians 3:5'],

  'Acts 2:38': ['Luke 24:47', 'Acts 3:19', 'Mark 16:16'],
  'Acts 4:12': ['John 14:6', '1 Timothy 2:5', 'Matthew 1:21'],

  'Romans 3:23': ['Romans 3:9', 'Isaiah 53:6', 'Galatians 3:22'],
  'Romans 5:8': ['John 3:16', '1 John 4:10', '1 Peter 3:18'],
  'Romans 6:23': ['Genesis 2:17', 'James 1:15', 'John 10:28'],
  'Romans 8:1': ['John 3:18', 'Romans 8:34', 'Galatians 5:16'],
  'Romans 8:28': ['Genesis 50:20', 'Ephesians 1:11', 'Jeremiah 29:11', '2 Corinthians 4:17'],
  'Romans 8:31': ['Psalm 118:6', 'Numbers 14:9', 'Hebrews 13:6'],
  'Romans 8:38': ['Romans 8:35', 'John 10:28', '1 Corinthians 3:22'],
  'Romans 10:9': ['Matthew 10:32', 'Acts 8:37', '1 John 4:15'],
  'Romans 12:2': ['Ephesians 4:23', '1 Peter 1:14', 'Colossians 3:10'],

  '1 Corinthians 13:4': ['Proverbs 10:12', 'Galatians 5:22', '1 Peter 4:8'],
  '1 Corinthians 15:3': ['Isaiah 53:5', 'Galatians 1:4', '1 Peter 2:24'],
  '2 Corinthians 4:17': ['Romans 8:18', '1 Peter 1:6', 'Romans 8:28'],
  '2 Corinthians 5:17': ['Galatians 6:15', 'Ephesians 4:24', 'Romans 6:4'],
  '2 Corinthians 5:21': ['Isaiah 53:9', '1 Peter 2:22', 'Hebrews 4:15'],
  'Galatians 2:20': ['Romans 6:6', 'Colossians 3:3', 'Philippians 1:21'],
  'Galatians 5:22': ['Ephesians 5:9', 'Colossians 3:12', '1 Corinthians 13:4'],
  'Ephesians 2:8': ['Romans 3:24', 'Titus 3:5', '2 Timothy 1:9'],
  'Ephesians 6:11': ['Romans 13:12', '2 Corinthians 10:4', '1 Peter 5:8'],
  'Philippians 4:6': ['Matthew 6:25', '1 Peter 5:7', 'Psalm 55:22'],
  'Philippians 4:13': ['John 15:5', '2 Corinthians 12:9', 'Colossians 1:11'],
  'Colossians 1:16': ['John 1:3', 'Hebrews 1:2', 'Romans 11:36'],
  '2 Timothy 3:16': ['2 Peter 1:21', 'Psalm 119:105', 'Romans 15:4'],
  'Hebrews 4:12': ['Ephesians 6:17', 'Jeremiah 23:29', '1 Peter 1:23'],
  'Hebrews 11:1': ['Romans 8:24', '2 Corinthians 5:7', 'Hebrews 11:6'],
  'Hebrews 13:5': ['Deuteronomy 31:6', 'Joshua 1:5', 'Psalm 37:25'],
  'James 1:2': ['1 Peter 1:6', 'Romans 5:3', 'Matthew 5:12'],
  '1 Peter 2:24': ['Isaiah 53:5', 'Romans 6:11', '2 Corinthians 5:21'],
  '1 Peter 5:7': ['Psalm 55:22', 'Philippians 4:6', 'Matthew 6:25'],
  '1 John 1:9': ['Proverbs 28:13', 'Psalm 32:5', 'Jeremiah 3:13'],
  '1 John 4:8': ['1 John 4:16', 'John 3:16', '2 Corinthians 13:11'],
  'Revelation 21:4': ['Isaiah 25:8', '1 Corinthians 15:26', 'Revelation 7:17'],
};

/** refId → parsed target refs. Built once at module load. */
const INDEX: Map<string, ScriptureRef[]> = (() => {
  const map = new Map<string, ScriptureRef[]>();
  for (const [source, targets] of Object.entries(SEED)) {
    const from = parseRef(source);
    if (!from) continue;
    const parsed = targets.map(t => parseRef(t)).filter((r): r is ScriptureRef => !!r);
    if (parsed.length) map.set(refId(from), parsed);
  }
  return map;
})();

/** Cross-references for a verse. Empty when the seed doesn't cover it. */
export function crossRefsFor(ref: ScriptureRef): ScriptureRef[] {
  if (ref.verse === undefined) return [];
  return INDEX.get(refId({ ...ref, endChapter: undefined, endVerse: undefined })) ?? [];
}

/** How many verses the seed covers — shown so coverage is never overstated. */
export const CROSS_REF_COVERAGE = INDEX.size;
