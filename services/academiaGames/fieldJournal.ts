/**
 * Living Field Journal compiler — turns solved gameplay artifacts into a persistent,
 * illustrated keepsake book aligned with Plajah's Lorea Living Books format.
 *
 * Pure serialization & HTML keepsake export (safe in Node tests and browsers).
 */

import type { JournalEntry } from './contracts';

const STORAGE_KEY = 'plajah:academiaGames:fieldJournal:v1';

export function loadFieldJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFieldJournal(entries: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 60)));
  } catch {
    /* private browsing / storage unavailable */
  }
}

/** Add an entry without duplicating the same quest artifact id. */
export function appendJournalEntry(entries: JournalEntry[], next: JournalEntry): JournalEntry[] {
  const filtered = entries.filter(e => e.id !== next.id);
  return [next, ...filtered].slice(0, 60);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compiles the student's gameplay entries into a standalone, print-ready Keepsake Field Book
 * HTML document (Lorea Living Book export preview). Zero external network calls.
 */
export function compileKeepsakeBookHtml(learnerName: string, entries: JournalEntry[]): string {
  const safeName = escapeHtml(learnerName || 'Young Naturalist');
  const pages = entries.length
    ? entries
        .map(
          (e, idx) => `
      <article class="page">
        <div class="page-head">
          <span class="folio">Page ${idx + 1} · ${escapeHtml(e.world.toUpperCase())}</span>
          <span class="band">${escapeHtml(e.band.toUpperCase())}</span>
        </div>
        <h2>${escapeHtml(e.title)}</h2>
        <p class="summary">${escapeHtml(e.summary)}</p>
        <div class="artifact-box">${escapeHtml(e.artifactNote)}</div>
        <div class="standards">${e.standards.map(st => `<span>${escapeHtml(st.framework)} ${escapeHtml(st.code)}</span>`).join('')}</div>
      </article>`,
        )
        .join('\n')
    : `<article class="page"><p class="summary">Begin any quest across Reading, Math, Science, History, or Elevate to fill your illustrated Living Field Journal.</p></article>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeName} — Plajah Living Field Journal</title>
<style>
  body { margin: 0; padding: 32px; background: #EFE6D5; color: #36281D; font-family: Georgia, "Palatino Linotype", serif; }
  .book { max-width: 780px; margin: 0 auto; }
  .cover { background: #FAF3E5; border: 2px solid #A8875B; border-radius: 10px; padding: 36px; text-align: center; margin-bottom: 24px; box-shadow: 0 8px 28px rgba(54,40,29,0.12); }
  .cover h1 { margin: 8px 0 4px; font-size: 28px; }
  .cover p { margin: 0; color: #6B5744; font-style: italic; }
  .page { background: #FBF5E8; border: 1px solid #C5B090; border-radius: 8px; padding: 24px 28px; margin-bottom: 18px; page-break-inside: avoid; }
  .page-head { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #7C654E; border-bottom: 1px solid #DECDB2; padding-bottom: 8px; }
  h2 { margin: 14px 0 8px; font-size: 20px; }
  .summary { line-height: 1.6; margin: 0 0 12px; }
  .artifact-box { background: #F2E8D5; border-left: 3px solid #C6923A; padding: 10px 14px; font-style: italic; margin-bottom: 12px; }
  .standards { display: flex; flex-wrap: wrap; gap: 6px; }
  .standards span { font-family: monospace; font-size: 11px; padding: 2px 8px; border: 1px solid #C5B090; border-radius: 999px; color: #5C4938; }
</style>
</head>
<body>
  <main class="book">
    <header class="cover">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7C654E;">Plajah Academia · Lorea Living Field Journal</div>
      <h1>${safeName}’s Field Book</h1>
      <p>Compiled directly from handmade discoveries across the valley (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})</p>
    </header>
    ${pages}
  </main>
</body>
</html>`;
}
