// Headline -> broadcast graphics. Feature-detected: if the Fabula lower-third registry or the Tela
// ticker collection is missing in this build, these resolve to { ok: false } instead of throwing.
// The result opens in Tela as an editable document; Fabula's own gallery adds the same designs to a
// timeline with motion. Nothing is sent to Fabula automatically.

import { tightenTo } from './headlineTester';

export interface BroadcastResult { ok: boolean; docId?: string; error?: string }

export const lowerThirdText = (title: string, byline?: string) => ({ title: tightenTo(title, 56), subtitle: byline ? byline.slice(0, 64) : undefined, tag: 'NEWS' });

/** Choose a news-appropriate lower third (a broadcast-group spec if any), or the first available. */
export function pickLowerThird<T extends { id: string; group: string; format?: string; tags: string[] }>(specs: ReadonlyArray<T>, preferredId?: string): T | undefined {
  if (preferredId) { const hit = specs.find(s => s.id === preferredId); if (hit) return hit; }
  const lt = specs.filter(s => s.format !== 'full-page');
  return lt.find(s => /news|broadcast/i.test(s.group) || s.tags.some(t => /news|broadcast/i.test(t))) || lt[0] || specs[0];
}

export async function headlineToLowerThird(title: string, byline?: string, specId?: string): Promise<BroadcastResult> {
  try {
    const [{ LOWER_THIRDS }, { openLowerThirdInTela }] = await Promise.all([import('../fabula/lowerThirdRegistry'), import('../fabula/lowerThirdToTela')]);
    const spec = pickLowerThird(LOWER_THIRDS as any, specId) as (typeof LOWER_THIRDS)[number] | undefined;
    if (!spec) return { ok: false, error: 'No lower-third designs are available in this build.' };
    const doc = await openLowerThirdInTela(spec, null, lowerThirdText(title, byline));
    return { ok: true, docId: doc.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Lower thirds are unavailable.' }; }
}

/** A continuous-crawl ticker whose crawl text is the given headlines. */
export async function headlinesToTicker(headlines: string[], templateId?: string): Promise<BroadcastResult> {
  const list = headlines.map(h => h.trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: 'No headlines to put in the ticker.' };
  try {
    const [{ TICKER_REVIEW_TEMPLATES, buildTickerTemplateDocument }, { saveTelaDoc, newTelaId }] = await Promise.all([import('../tela/tickerTemplateCollection'), import('../telaStore')]);
    const tpl = TICKER_REVIEW_TEMPLATES.find(t => t.id === templateId) || TICKER_REVIEW_TEMPLATES[0];
    if (!tpl) return { ok: false, error: 'No ticker templates are available in this build.' };
    const doc: any = JSON.parse(JSON.stringify(buildTickerTemplateDocument(tpl.id)));
    const crawl = list.join('     ●     ');
    for (const d of Object.values<any>(doc.devices)) if (d.type === 'VECTOR') for (const o of d.objects) if (typeof o.id === 'string' && o.id.includes('-crawl-')) o.text = crawl;
    doc.id = newTelaId(); doc.title = 'News ticker'; doc.createdAt = doc.updatedAt = Date.now();
    await saveTelaDoc(doc);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
    return { ok: true, docId: doc.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tickers are unavailable.' }; }
}
