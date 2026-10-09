// Model-assisted suggestions for the journalist tools. Every function here returns SUGGESTIONS
// only. Nothing in this file can mark a claim verified (factCheck.setClaimStatus refuses
// non-human actors) and nothing publishes. Output is parsed defensively: a model that returns
// prose, markdown fences or garbage yields [] rather than an error the user must debug.

export function parseJsonStringList(raw: string | null | undefined, max = 30): string[] {
  if (!raw) return [];
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = t.indexOf('['); const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  t = t.slice(start, end + 1);
  try {
    const v = JSON.parse(t);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(s => s.length > 8 && s.length < 600).slice(0, max);
  } catch { return []; }
}

/** Keep only suggestions that really occur in the text (models paraphrase; a claim must point at the copy). */
export function groundInText(suggestions: string[], text: string): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
  const hay = norm(text);
  return suggestions.filter(s => hay.includes(norm(s)));
}

async function ask(prompt: string): Promise<string | null> {
  try {
    const { callGemini } = await import('../geminiService');
    return await callGemini(prompt);
  } catch { return null; }
}

/** Sentences that make checkable factual assertions. The model is told not to judge truth. */
export async function suggestClaimsWithAI(articleText: string): Promise<string[]> {
  const body = articleText.slice(0, 12000);
  const raw = await ask(
    `You help a journalist's fact-checker. From the article below, copy out, EXACTLY as written, up to 15 sentences that make a specific, checkable factual assertion (numbers, dates, names, quotes' factual content, legal or causal claims). Do NOT judge whether they are true. Do NOT add or fix anything. Reply with ONLY a JSON array of strings.\n\nARTICLE:\n${body}`,
  );
  return groundInText(parseJsonStringList(raw, 15), body);
}

/** Headline alternatives that use only facts present in the article. */
export async function suggestHeadlinesWithAI(title: string, articleText: string): Promise<string[]> {
  const raw = await ask(
    `Write 5 alternative news headlines for this article. Rules: sentence case, under 70 characters, active voice, no clickbait, no exclamation marks, and use ONLY facts stated in the article. Reply with ONLY a JSON array of strings.\n\nCURRENT HEADLINE: ${title}\n\nARTICLE:\n${articleText.slice(0, 8000)}`,
  );
  return parseJsonStringList(raw, 5).filter(h => h.length <= 100);
}
