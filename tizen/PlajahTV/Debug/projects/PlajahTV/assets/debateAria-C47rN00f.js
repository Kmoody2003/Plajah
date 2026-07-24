import{bb as I,b0 as p,aZ as y}from"./index-CRiTVTbV.js";const c={},D=`You are Aria, the AI adjudicator for Plajah structured debates. You assess debates using academic debate standards:

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
}`;async function C(S,e,s,n){var l,u,h;const i=c==null?void 0:c.VITE_MAI_ENDPOINT,d=c==null?void 0:c.VITE_MAI_API_KEY;if(!i||!d)return;const m=s.filter(t=>!t.isDisqualified&&t.authorId!=="PLAJAH_SYSTEM").map(t=>`[${t.side} — ${t.authorName} @ ${new Date(t.timestamp).toISOString()}]
${t.text}`).join(`

---

`),E=e.disqualified.length>0?`

DISQUALIFICATIONS: ${e.disqualified.map(t=>`${t.name}: ${t.reason}`).join("; ")}`:"",A=`TOPIC: "${e.topic}"

CHALLENGER: ${e.challengerName}
DEFENDER: ${e.defenderName}
DURATION: ${Math.round((e.endsAt-(e.acceptedAt||e.createdAt))/36e5)} hours
POSTS: ${s.filter(t=>t.authorId!=="PLAJAH_SYSTEM").length}
PUBLIC SUPPORT — Challenger: ${e.challengerSupporters.length} | Defender: ${e.defenderSupporters.length}
${E}

FULL TRANSCRIPT:
${m}

Please adjudicate this debate according to the academic debate rubric.`;try{const t=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json","api-key":d},body:JSON.stringify({messages:[{role:"system",content:D},{role:"user",content:A}],max_tokens:800,temperature:.3})});if(!t.ok)return;const r=await t.json(),N=((h=(u=(l=r==null?void 0:r.choices)==null?void 0:l[0])==null?void 0:u.message)==null?void 0:h.content)||"",a=JSON.parse(N.replace(/```json\n?|\n?```/g,"").trim()),g=e.challengerSupporters.length+e.defenderSupporters.length,o=g>0?Math.round(e.challengerSupporters.length/g*100):50,f=100-o,w={winner:a.winner||n.winner,winnerUid:a.winner==="CHALLENGER"?e.challengerId:a.winner==="DEFENDER"?e.defenderId:void 0,winnerName:a.winnerName||n.winnerName,challengerScore:a.challengerScore??n.challengerScore,defenderScore:a.defenderScore??n.defenderScore,consensusScore:a.winner==="CHALLENGER"?o:f,publicVoteChallenger:o,publicVoteDefender:f,summary:a.summary||n.summary,factCheck:a.factCheck||n.factCheck,ignoredFacts:a.ignoredFacts||n.ignoredFacts,debateQuality:a.debateQuality||n.debateQuality,academicScore:a.academicScore||n.academicScore,disqualificationNotes:n.disqualificationNotes,generatedAt:Date.now()};await I(p(y,"debates",S),{verdict:w})}catch{}}export{C as sendAriaDebateJudgment};
