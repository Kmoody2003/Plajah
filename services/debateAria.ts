/**
 * Aria Debate Judgment — sends the full debate transcript to the AI
 * and updates the stored verdict with a nuanced analysis.
 *
 * Called async after triggerAriaJudgment() stores the preliminary verdict.
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Debate, DebatePost, DebateVerdict } from '../types';

const ARIA_DEBATE_SYSTEM = `You are Aria, the AI adjudicator for Plajah structured debates. You assess debates using academic debate standards:

RUBRIC (0–10 per category):
1. Logic — sound reasoning, valid inferences, no fallacies
2. Evidence — factual accuracy, cited sources or verifiable claims
3. Civility — respectful tone, addresses the argument not the person
4. Clarity — clear thesis, well-organized argument structure

PROCESS:
1. Read all posts chronologically
2. Identify the core claim each side is defending
3. Fact-check key claims against your knowledge
4. Note any logical fallacies (ad hominem, strawman, appeal to emotion, etc.)
5. Note important facts neither party raised that would strengthen the debate
6. Assign scores per category for each participant
7. Determine winner based on total rubric score + factual accuracy
8. If one side was disqualified for incivility, they auto-lose

OUTPUT FORMAT (respond only with a JSON object, no markdown):
{
  "winner": "CHALLENGER" | "DEFENDER" | "DRAW",
  "winnerName": "...",
  "challengerScore": 0-100,
  "defenderScore": 0-100,
  "summary": "2-3 sentence narrative overview of how the debate played out",
  "factCheck": "What each side got factually right and wrong",
  "ignoredFacts": "Important context or evidence neither party raised",
  "debateQuality": "EXCELLENT" | "GOOD" | "FAIR" | "POOR",
  "academicScore": { "logic": 0-10, "evidence": 0-10, "civility": 0-10, "clarity": 0-10 }
}`;

export async function sendAriaDebateJudgment(
  debateId: string,
  debate: Debate,
  posts: DebatePost[],
  preliminary: DebateVerdict
): Promise<void> {
  const ENDPOINT = (import.meta as any).env?.VITE_MAI_ENDPOINT as string | undefined;
  const API_KEY  = (import.meta as any).env?.VITE_MAI_API_KEY  as string | undefined;
  if (!ENDPOINT || !API_KEY) return;

  const transcript = posts
    .filter(p => !p.isDisqualified && p.authorId !== 'PLAJAH_SYSTEM')
    .map(p => `[${p.side} — ${p.authorName} @ ${new Date(p.timestamp).toISOString()}]\n${p.text}`)
    .join('\n\n---\n\n');

  const dqNote = debate.disqualified.length > 0
    ? `\n\nDISQUALIFICATIONS: ${debate.disqualified.map(d => `${d.name}: ${d.reason}`).join('; ')}`
    : '';

  const userMessage = `TOPIC: "${debate.topic}"

CHALLENGER: ${debate.challengerName}
DEFENDER: ${debate.defenderName}
DURATION: ${Math.round((debate.endsAt - (debate.acceptedAt || debate.createdAt)) / 3_600_000)} hours
POSTS: ${posts.filter(p => p.authorId !== 'PLAJAH_SYSTEM').length}
PUBLIC SUPPORT — Challenger: ${debate.challengerSupporters.length} | Defender: ${debate.defenderSupporters.length}
${dqNote}

FULL TRANSCRIPT:
${transcript}

Please adjudicate this debate according to the academic debate rubric.`;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: ARIA_DEBATE_SYSTEM },
          { role: 'user',   content: userMessage },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';

    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    const total = debate.challengerSupporters.length + debate.defenderSupporters.length;
    const cPct  = total > 0 ? Math.round((debate.challengerSupporters.length / total) * 100) : 50;
    const dPct  = 100 - cPct;

    const refined: DebateVerdict = {
      winner:              parsed.winner || preliminary.winner,
      winnerUid:           parsed.winner === 'CHALLENGER' ? debate.challengerId : parsed.winner === 'DEFENDER' ? debate.defenderId : undefined,
      winnerName:          parsed.winnerName || preliminary.winnerName,
      challengerScore:     parsed.challengerScore ?? preliminary.challengerScore,
      defenderScore:       parsed.defenderScore   ?? preliminary.defenderScore,
      consensusScore:      parsed.winner === 'CHALLENGER' ? cPct : dPct,
      publicVoteChallenger: cPct,
      publicVoteDefender:   dPct,
      summary:             parsed.summary         || preliminary.summary,
      factCheck:           parsed.factCheck       || preliminary.factCheck,
      ignoredFacts:        parsed.ignoredFacts    || preliminary.ignoredFacts,
      debateQuality:       parsed.debateQuality   || preliminary.debateQuality,
      academicScore:       parsed.academicScore   || preliminary.academicScore,
      disqualificationNotes: preliminary.disqualificationNotes,
      generatedAt:         Date.now(),
    };

    await updateDoc(doc(db, 'debates', debateId), { verdict: refined });
  } catch {
    // Preliminary verdict already stored — silent fail
  }
}
