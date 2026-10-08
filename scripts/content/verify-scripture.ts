/**
 * Scripture integrity check: every passage in the tradition layer must EXIST in the text, down to
 * the verse. Fetches each chapter from the same public source the app reads (getBible, KJV) and
 * confirms the first and last verse of every reference are present. Run before shipping new notes:
 *
 *   npx tsx scripts/content/verify-scripture.ts
 *
 * Exits non-zero if any reference is invalid, so it can gate a release.
 */
import { parseRef, formatRef } from '../../services/scriptureRef';
import { fetchChapter } from '../../services/bibleService';

(async () => {
  const lists: Array<{ file: string; notes: any[] }> = [];
  for (const f of ['traditionNotesClassics', 'traditionNotesHistory']) {
    try { const m: any = await import(`../../data/${f}`); lists.push({ file: f, notes: Object.values(m).flat() as any[] }); } catch { /* file not present yet */ }
  }
  const bad: string[] = []; let checked = 0; let unreachable = 0;
  for (const { file, notes } of lists) {
    for (const n of notes) {
      for (const p of n.passages || []) {
        const ref = parseRef(p);
        if (!ref) { bad.push(`${file}: ${n.courseId}/${n.lessonId} "${p}" does not parse`); continue; }
        const endCh = ref.endChapter ?? ref.chapter;
        for (let c = ref.chapter; c <= endCh; c++) {
          const verses = await fetchChapter('kjv', ref.book, c);
          if (!verses.length) { unreachable++; continue; }
          const have = new Set(verses.map(v => v.verse));
          const first = c === ref.chapter ? ref.verse : 1;
          const last = c === endCh ? (ref.endVerse ?? ref.verse) : Math.max(...have);
          for (const v of [first, last]) if (v !== undefined && !have.has(v)) bad.push(`${file}: ${n.courseId}/${n.lessonId} ${formatRef(ref, 'display')}: verse ${v} does not exist in chapter ${c} (has ${Math.min(...have)}-${Math.max(...have)})`);
        }
        checked++;
      }
    }
  }
  console.log(`Checked ${checked} passages. Invalid: ${bad.length}. Chapters unreachable (network): ${unreachable}.`);
  bad.forEach(b => console.log(' - ' + b));
  if (bad.length) process.exit(1);
})();
