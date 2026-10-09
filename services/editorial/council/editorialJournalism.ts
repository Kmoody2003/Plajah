// editorialJournalism — journalistic integrity as ethics and philosophy, not only mechanics.
//
// Two layers. (1) FRAMEWORKS: the public codes the lenses are grounded in, paraphrased with their sources
// (see docs/EDITORIAL_COUNCIL.md for which links were fetched and verified). (2) CHECKS: deterministic
// mechanics that turn those principles into QUESTIONS about a specific text. The editors ask; they do not
// convict. The council READS the fact-check workbench and never marks a claim verified: only a person with a
// source can (services/journalist/factCheck.ts enforces that in code). Press-law notes are orientation only.
import { detectCheckableClaims } from '../../journalist/factCheck';
import { anchorAt, flatten, sentencesOf, wordCount, type Flat } from './editorialMetrics';
import { NOT_LEGAL_ADVICE, type Anchor, type EditorId, type ManuscriptInput, type Note, type Severity } from './editorialTypes';

/* ─── Frameworks (paraphrase only; follow the links for the real text) ─────────────────────── */
export interface Framework { id: string; name: string; url: string; verified: 'fetched' | 'not-fetched'; principles: Array<{ key: string; summary: string }> }
export const JOURNALISM_FRAMEWORKS: Framework[] = [
  { id: 'SPJ', name: 'SPJ Code of Ethics (Society of Professional Journalists)', url: 'https://www.spj.org/spj-code-of-ethics/', verified: 'fetched', principles: [
    { key: 'Seek truth and report it', summary: 'Be accurate, fair and complete; verify before publishing; give context; do not distort with headlines or images.' },
    { key: 'Minimize harm', summary: 'Weigh the public\'s need to know against the damage; treat sources, subjects and colleagues as human beings; take extra care with minors, victims and inexperienced sources.' },
    { key: 'Act independently', summary: 'Serve the public, not interests: avoid conflicts of interest, real or perceived; disclose unavoidable ones; keep advertising and news distinct.' },
    { key: 'Be accountable and transparent', summary: 'Explain choices and methods, respond to questions, acknowledge mistakes and correct them promptly and visibly.' } ] },
  { id: 'ELEMENTS', name: 'The Elements of Journalism (Kovach and Rosenstiel)', url: 'https://www.americanpressinstitute.org/', verified: 'not-fetched', principles: [
    { key: 'Obligation to the truth', summary: 'Journalism\'s first obligation is to a practical, functional truth that emerges through verification.' },
    { key: 'Loyalty to citizens', summary: 'First loyalty is to the audience, not to employers, sponsors or sources.' },
    { key: 'Discipline of verification', summary: 'Method matters more than assertion: be transparent about what you know and how you know it.' },
    { key: 'Independence', summary: 'Independence of spirit and mind from those covered; do not mistake neutrality for the point.' },
    { key: 'Power monitoring', summary: 'Serve as an independent monitor of power.' },
    { key: 'A forum for public criticism and compromise', summary: 'Give voice to the voiceless and test claims in public.' },
    { key: 'Relevance and engagement', summary: 'Make the significant interesting and relevant.' },
    { key: 'Comprehensiveness and proportion', summary: 'Keep news proportional and comprehensive, not a distortion.' },
    { key: 'Conscience', summary: 'Practitioners should be free to follow their personal conscience.' } ] },
  { id: 'AP', name: 'AP News Values and Principles', url: 'https://www.ap.org/about/news-values-and-principles/', verified: 'not-fetched', principles: [
    { key: 'Accuracy and fairness', summary: 'Get it right, get all sides, avoid unattributed claims where a source can be named.' },
    { key: 'Anonymous sources', summary: 'Use them as a last resort for information the AP considers vital and otherwise unavailable, and say why.' },
    { key: 'Corrections', summary: 'Correct errors openly and promptly.' } ] },
  { id: 'REUTERS', name: 'Thomson Reuters Trust Principles', url: 'https://www.thomsonreuters.com/en/about-us/trust-principles.html', verified: 'fetched', principles: [
    { key: 'Independence, integrity, freedom from bias', summary: 'The organisation should stay independent, honest and impartial, and not be controlled by any single party or faction.' } ] },
  { id: 'NPR', name: 'NPR Ethics Handbook', url: 'https://www.npr.org/about-npr/688875732/these-are-the-standards-of-our-journalism', verified: 'not-fetched', principles: [
    { key: 'Honesty, fairness, transparency, independence, accountability', summary: 'Cover the story honestly and fairly, tell the audience how it was done, keep independent, and take responsibility for errors.' } ] },
];
export const PRESS_LAW_ORIENTATION = [
  'Libel and defamation: in many places a false statement of fact that harms reputation can be actionable; public officials and public figures in the United States must show "actual malice" (knowledge of falsity or reckless disregard for the truth). Truth is generally a strong defence; opinion is treated differently from fact.',
  'Privacy: private facts, intrusion and use of likeness are separate risks from defamation, and vary by country and state.',
  'Shield laws protect reporters from being forced to reveal sources only in some places and only to a degree.',
  NOT_LEGAL_ADVICE,
];
export const JOURNALISM_PHILOSOPHY = [
  'Public interest is not public curiosity: ask what the public needs to know in order to govern itself, not what it would like to read.',
  'Harm should be proportionate to the public value gained, and the less power a person has, the more care they are owed.',
  'Verification beats assertion: what is claimed is not what is known, and method should be visible to the reader.',
  'Transparency about method: say how you know, what you could not confirm, and what you chose not to publish.',
  'Anonymous sources are a cost to accountability and need a reason the reader can understand.',
  'Conflicts of interest are disclosed, not merely avoided; independence is also an appearance to the reader.',
  'Advocacy, reporting and opinion are different promises to the reader and should be labelled as such.',
  'Correct the record visibly: a silent edit is a small lie about the past.',
  'AI-generated or AI-assisted content is disclosed because the reader is owed knowledge of how the text was made.',
];

/* ─── Checks → questions ────────────────────────────────────────────────────────────────────── */
export interface JournalismFinding {
  id: string; principle: string; severity: Severity; editorId: EditorId; headline: string; observation: string; options: string[]; yourCall: string; anchor?: Anchor; fingerprint: string;
}
const fp = (kind: string, s: string) => { let h = 5381; const t = `${kind}:${s.toLowerCase().replace(/\s+/g, ' ').slice(0, 140)}`; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return `${kind}-${h.toString(36)}`; };

const ATTRIBUTION = /\b(?:said|says|told|according to|reported|reports|wrote|writes|testified|stated|announced|confirmed|denied|per\b|data from|a (?:study|report|survey|poll) (?:by|from)|in an? (?:interview|statement|email|filing)|court (?:records|documents)|documents show|\bsource:|https?:\/\/)/i;
const VAGUE = /\b(?:some (?:say|believe|people|experts|critics)|many (?:say|believe|people|experts|critics)|experts (?:say|agree|warn)|critics (?:say|argue|claim)|it is (?:said|believed|thought|widely known)|studies (?:show|suggest|prove)|research (?:shows|proves)|everyone (?:knows|agrees)|sources say)\b/i;
const LOADED = ['slammed', 'blasted', 'ripped', 'destroyed', 'demolished', 'shocking', 'outrageous', 'devastating', 'bombshell', 'explosive', 'radical', 'extremist', 'so-called', 'regime', 'thug', 'thugs', 'mob', 'cronies', 'scheme', 'cover-up', 'admitted', 'claimed', 'refused to', 'lashed out', 'ranted', 'gushed', 'slams', 'blasts', 'rips'];
const OPINION_SIGNAL = /\b(?:I (?:think|believe|feel|argue)|we (?:must|need to|should)|should (?:be|have)|must (?:be|now)|it is time to|clearly|obviously|disgraceful|shameful|nonsense)\b/gi;
const OPINION_LABEL = /\b(?:opinion|analysis|commentary|column|editorial|op-?ed|perspective|essay|review)\b/i;
const SENSITIVE: Array<[RegExp, string]> = [
  [/\b\d{1,2}-year-old\s+(?:girl|boy|child|student|teen|teenager)\b|\bminors?\b|\bjuveniles?\b|\b(?:child|children) (?:were|was)\b/i, 'a child or minor'],
  [/\b(?:sexual assault|rape[ds]?|molest\w*|sexually abused)\b/i, 'sexual violence'],
  [/\b(?:suicide|took (?:his|her|their) own life|self-harm)\b/i, 'suicide or self-harm'],
  [/\b(?:overdos\w*|addict\w*)\b/i, 'overdose or addiction'],
  [/\b(?:victim|survivor)s?\b/i, 'a victim or survivor'],
];
const STAKE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:my (?:friend|brother|sister|wife|husband|partner|boss|employer|company|client)|our (?:company|client|sponsor))\b/i, 'a personal or business tie'],
  [/\bI (?:work(?:ed)? (?:for|at|with)|own|invested|am (?:an? )?(?:investor|founder|donor))\b/i, 'a stake in the subject'],
];
const SPONSOR_SIGNALS = /\b(?:sponsored|in partnership with|partnered with|paid partnership|use (?:my )?(?:code|promo)|promo code|affiliate|#ad\b|gifted)\b/i;
const ACCUSE = /\b(?:arrested|charged|accused|indicted|suspect|alleged(?:ly)?)\b/i;
const CAUTION = /\b(?:alleged(?:ly)?|pleaded|pled|denied|has not been charged|presumed innocent|according to (?:police|prosecutors|court))\b/i;

function finding(f: Omit<JournalismFinding, 'fingerprint' | 'yourCall'> & { yourCall?: string; seed?: string }): JournalismFinding {
  return { ...f, yourCall: f.yourCall ?? 'Your call: this would change if you can point a reader to the source, or if the framing is a deliberate editorial choice you are prepared to explain.', fingerprint: fp(f.id, f.seed ?? f.anchor?.quote ?? f.headline) };
}

export function journalismChecks(m: ManuscriptInput, flat: Flat = flatten(m.chapters)): JournalismFinding[] {
  const out: JournalismFinding[] = []; const a = m.article; const text = flat.text; const d = a?.disclosures;
  const ss = sentencesOf(text);

  // Attribution gaps: sentences the claim detector flags that carry no attribution or link.
  const claims = detectCheckableClaims(text, 3);
  const bare = claims.filter(c => !ATTRIBUTION.test(c.text));
  for (const c of bare.slice(0, 5)) out.push(finding({ id: 'attribution-gap', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: 'Who says so, and can a reader check?',
    observation: `This sentence contains a checkable claim (${c.reasons.join('; ')}) with no attribution or link nearby. That does not make it wrong; it means a reader cannot tell where it comes from.`, anchor: anchorAt(flat, c.start, c.start + c.text.length),
    options: ['Attribute it in the sentence ("according to ..."), with a link or document if there is one.', 'Move it to a framing that you can stand behind firsthand, such as what you observed.', 'Cut it or mark it for the fact-check workbench until you have a source.'] }));
  if (bare.length > 5) out.push(finding({ id: 'attribution-many', principle: 'Elements: discipline of verification', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: `${bare.length} checkable claims lack attribution`, observation: 'Beyond the examples flagged individually, several more sentences with figures, causes or superlatives carry no source. A reader sees a lot of assertion.', options: ['Run the fact-check workbench over the piece and attach sources.', 'Group sourcing into a short "How we know" note.', 'Soften or cut what you cannot support.'], seed: 'many' }));

  // Single-source: many factual claims but one or no named attribution target.
  const attribs = new Set<string>(); const re = /\b(?:according to|said|says|told|wrote|reported by)\s+([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/g; let mm: RegExpExecArray | null;
  while ((mm = re.exec(text))) attribs.add(mm[1].toLowerCase());
  if (claims.length >= 4 && attribs.size <= 1 && wordCount(text) > 250) out.push(finding({ id: 'single-source', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: 'Is this resting on one voice?',
    observation: `There are ${claims.length} checkable claims and ${attribs.size === 0 ? 'no named sources' : 'one named source'} in the text. Single-source stories are sometimes unavoidable; readers deserve to know when that is the case.`,
    options: ['Add an independent source, or a document that stands apart from the first voice.', 'Say plainly that you rely on one source and why.', 'Narrow the claims to what that source can speak to firsthand.'], seed: 'single' }));

  // Vague attribution
  for (const s of ss.filter(s => VAGUE.test(s.text)).slice(0, 3)) out.push(finding({ id: 'vague-attribution', principle: 'AP: accuracy and fairness', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: 'Which experts, which critics, which studies?', observation: 'Vague attribution gives a claim authority without letting the reader weigh it.', anchor: anchorAt(flat, s.start, s.end), options: ['Name the person, organisation or study.', 'Say how many and what they hold in common.', 'Cut the line if you cannot name them.'] }));

  // Loaded language
  const loadedHits = LOADED.flatMap(w => { const r = new RegExp(`\\b${w.replace(/[-]/g, '[- ]')}\\b`, 'gi'); const hits: Array<{ w: string; i: number }> = []; let x: RegExpExecArray | null; while ((x = r.exec(text))) hits.push({ w, i: x.index }); return hits; }).sort((p, q) => p.i - q.i);
  for (const h of loadedHits.slice(0, 4)) out.push(finding({ id: 'loaded-language', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_ETHICS', headline: `"${h.w}": a verdict or a description?`, observation: 'Strongly charged or verb-of-attitude words can state a conclusion the reporting has not earned, or imply a speaker\'s state of mind the reporter cannot see (for example "claimed" suggests doubt; "said" does not).', anchor: anchorAt(flat, Math.max(0, h.i - 60), h.i + 80), options: ['Replace with a neutral verb or description and let the facts carry it.', 'Keep it and attribute it to the person who said it.', 'Keep it and move the piece into an opinion label, which is a different promise to the reader.'] }));

  // Quote integrity
  const qre = /["“]([^"”\n]{25,500})["”]/g; let qm: RegExpExecArray | null; let unattr = 0; let firstUnattr: Anchor | undefined; let ellipsis: Anchor | undefined;
  while ((qm = qre.exec(text))) {
    const ctx = text.slice(Math.max(0, qm.index - 90), qm.index + qm[0].length + 90);
    if (!ATTRIBUTION.test(ctx)) { unattr++; firstUnattr = firstUnattr ?? anchorAt(flat, qm.index, qm.index + qm[0].length); }
    if (/\.\.\.|…|\[[^\]]{1,20}\]/.test(qm[1]) && !ellipsis) ellipsis = anchorAt(flat, qm.index, qm.index + qm[0].length);
  }
  if (unattr) out.push(finding({ id: 'quote-unattributed', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: `${unattr} quotation${unattr > 1 ? 's' : ''} with no speaker or source nearby`, observation: 'A quotation without a named speaker (or document) cannot be weighed or checked.', anchor: firstUnattr, options: ['Add who said it, when and in what setting.', 'Paraphrase if you cannot attribute it.', 'If anonymous, say why anonymity was granted.'] }));
  if (ellipsis) out.push(finding({ id: 'quote-integrity', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: 'Does the trimmed quote keep its meaning?', observation: 'This quotation is shortened or altered with an ellipsis or brackets. Editing is accepted practice; the question is whether the speaker\'s meaning survives.', anchor: ellipsis, options: ['Read the omitted words aloud against the original and confirm nothing reverses.', 'Quote the fuller passage.', 'Paraphrase and link the recording or transcript.'] }));

  // Headline vs body
  const head = (a?.headline || m.title || '').trim();
  if (head) {
    const bodyLower = text.toLowerCase();
    const nums = head.match(/\b\d[\d,.]*\b/g) || []; const missingNum = nums.filter(n => !bodyLower.includes(n.toLowerCase()));
    const words = (head.toLowerCase().match(/[a-z]{5,}/g) || []).filter(w => !['about', 'after', 'could', 'would', 'should', 'there', 'their', 'where', 'which', 'while', 'these', 'those'].includes(w));
    const cover = words.length ? words.filter(w => bodyLower.includes(w.slice(0, Math.max(4, w.length - 2)))).length / words.length : 1;
    const strong = /\b(?:all|every|never|always|proves?|confirms?|reveals?|exposed|shocking|secret|truth about|finally)\b/i.exec(head);
    if (missingNum.length || (words.length >= 4 && cover < 0.5)) out.push(finding({ id: 'headline-mismatch', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: 'Does the body deliver what the headline promises?', observation: missingNum.length ? `The headline contains ${missingNum.join(', ')}, which does not appear in the text.` : 'Fewer than half of the headline\'s key words appear in the body.', options: ['Rewrite the headline to match the strongest claim in the text.', 'Add the support to the body.', 'Keep a curiosity-style headline only if the body resolves it plainly and early.'], seed: head }));
    else if (strong) out.push(finding({ id: 'headline-strong', principle: 'SPJ: Seek truth and report it', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: `The headline says "${strong[0]}": does the evidence carry it?`, observation: 'Absolute or revelatory words raise the bar: the body needs to prove the largest claim in the headline.', options: ['Soften to what the evidence shows.', 'Make sure the lede proves it.', 'Attribute the claim in the headline.'], seed: head }));
  }

  // Opinion vs reporting labelling
  const opinionHits = (text.match(OPINION_SIGNAL) || []).length; const words = wordCount(text);
  if (words > 200 && opinionHits / (words / 100) >= 0.8 && !OPINION_LABEL.test(`${head} ${m.title ?? ''}`)) out.push(finding({ id: 'opinion-label', principle: 'Elements: independence · SPJ: accountability and transparency', severity: 'Clarity', editorId: 'JOURNALISM_ETHICS', headline: 'Is this reporting, analysis or opinion?', observation: `About ${opinionHits} opinion-style phrases appear in ${words} words and nothing in the headline marks the piece as opinion or analysis. Readers treat the three kinds of piece differently.`, options: ['Label the piece (opinion / analysis / commentary) in the headline or kicker.', 'Rework the judgments into attributed positions to keep it a report.', 'Keep it as-is and say in a note what kind of piece it is.'], seed: 'opinion' }));

  // Sensitive handling
  const seenSens = new Set<string>();
  for (const [r, label] of SENSITIVE) { const x = r.exec(text); if (x && !seenSens.has(label)) { seenSens.add(label); out.push(finding({ id: 'sensitive', principle: 'SPJ: Minimize harm', severity: 'Risk', editorId: 'JOURNALISM_ETHICS', headline: `The text touches ${label}: is every detail necessary?`, observation: 'Extra care is owed to minors, victims, survivors and people who did not choose to be in the news. The question is whether each identifying or graphic detail serves the public interest, not just interest.', anchor: anchorAt(flat, Math.max(0, x.index - 60), x.index + 120), options: ['Remove details that identify the person without adding public value.', 'Ask the person or a guardian for their view and say that you did.', 'For suicide and self-harm, follow published safe-reporting guidance and consider adding help resources.'], seed: label })); } }
  const accuseSent = ss.find(s => ACCUSE.test(s.text) && /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(s.text) && !CAUTION.test(s.text));
  if (accuseSent) out.push(finding({ id: 'presumption', principle: 'SPJ: Minimize harm', severity: 'Risk', editorId: 'JOURNALISM_ETHICS', headline: 'Does this keep the difference between accused and guilty clear?', observation: 'A named person appears alongside an accusation, arrest or charge without wording that signals what is alleged and what is established. This is a reputation question and may be a legal one.', anchor: anchorAt(flat, accuseSent.start, accuseSent.end), options: ['State precisely who alleges what, and the stage of the process.', 'Include the person\'s response, or record that you asked.', 'Ask an attorney if the allegation concerns a private individual.'] }));

  // Conflicts and sponsorship (compare the text with the declared disclosures)
  for (const [r, label] of STAKE_PATTERNS) { const x = r.exec(text); if (x && !d?.conflictOfInterest) { out.push(finding({ id: 'conflict-undisclosed', principle: 'SPJ: Act independently', severity: 'Risk', editorId: 'JOURNALISM_ETHICS', headline: 'Would a reader want to know about this tie?', observation: `The text suggests ${label}, but the conflict-of-interest disclosure is off. Disclosing is not a confession: it is what lets the reader weigh your reporting.`, anchor: anchorAt(flat, Math.max(0, x.index - 40), x.index + 100), options: ['Turn on the disclosure and describe the tie plainly.', 'Recuse the piece to another writer.', 'If it is not a conflict, add a sentence that says why.'], seed: label })); break; } }
  if (SPONSOR_SIGNALS.test(text) && !(d?.sponsored || d?.affiliateLinks)) { const x = SPONSOR_SIGNALS.exec(text)!; out.push(finding({ id: 'sponsor-undisclosed', principle: 'SPJ: Act independently', severity: 'Risk', editorId: 'JOURNALISM_ETHICS', headline: 'Is there a commercial relationship the reader should know about?', observation: 'The text uses sponsorship or affiliate wording but neither the sponsored nor the affiliate-link disclosure is on.', anchor: anchorAt(flat, Math.max(0, x.index - 40), x.index + 100), options: ['Turn on the matching disclosure.', 'Reword if it was not a commercial relationship.', 'Keep paid and editorial content visibly separate.'] })); }
  if (a?.aiUsedInEditor && !d?.aiAssisted) out.push(finding({ id: 'ai-disclosure', principle: 'SPJ: Be accountable and transparent', severity: 'Clarity', editorId: 'JOURNALISM_ETHICS', headline: 'AI tools were used in the draft but the disclosure is off', observation: 'Transparency about method is part of accountability. How you disclose AI help is your newsroom\'s policy.', options: ['Turn the disclosure on and say what the AI did and did not do.', 'If you rewrote the AI-assisted text yourself, record that in your notes.', 'Never present AI-generated quotes or sources as real.'], seed: 'ai' }));
  if (d?.aiAssisted && !(d.aiNote || '').trim()) out.push(finding({ id: 'ai-note', principle: 'SPJ: Be accountable and transparent', severity: 'Clarity', editorId: 'JOURNALISM_ETHICS', headline: 'AI use is disclosed, but not described', observation: 'A bare tick-box tells the reader little.', options: ['Say in a sentence what the AI did (drafting, translation, headline ideas) and that a person checked the facts.'], seed: 'ai-note' }));

  // Images
  const needing = (a?.imageRefs ?? []).filter(r => { const x = a?.imageRights?.find(y => y.ref === r); return !x || !x.credit.trim() || !x.license; });
  if (needing.length) out.push(finding({ id: 'image-credit', principle: 'SPJ: Be accountable and transparent', severity: 'Risk', editorId: 'COPYRIGHT', headline: `${needing.length} image${needing.length > 1 ? 's' : ''} missing a credit or rights basis`, observation: 'Credit and basis for use tell the reader and the rights holder what you relied on. Fair use is a defence, not a licence.', options: ['Add the credit and the licence or source link.', 'Replace the image with one you can document.', 'For an unavoidable fair-use claim, record your reasoning and consider asking an attorney.'], seed: needing.join(',') }));

  // Fact-check workbench (read-only). The council never marks anything verified.
  if (a?.claims?.length) {
    const unver = a.claims.filter(c => !(c.status === 'VERIFIED' && c.humanVerified && c.sources > 0) && c.status !== 'DISPUTED'); const disp = a.claims.filter(c => c.status === 'DISPUTED');
    if (disp.length) out.push(finding({ id: 'claims-disputed', principle: 'Elements: discipline of verification', severity: 'Risk', editorId: 'JOURNALISM_VERIFY', headline: `${disp.length} claim${disp.length > 1 ? 's are' : ' is'} marked disputed in your workbench`, observation: 'A disputed claim in the draft is an open question you flagged yourself.', options: ['Resolve it with a source and update the workbench.', 'Soften or attribute the claim.', 'Remove it.'], seed: disp.map(c => c.text).join('|') }));
    if (unver.length) out.push(finding({ id: 'claims-unverified', principle: 'Elements: discipline of verification', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: `${unver.length} claim${unver.length > 1 ? 's have' : ' has'} not been verified by a person with a source`, observation: 'The council cannot verify a claim and will not mark one verified. Only you can, in the fact-check workbench, with a source attached.', options: ['Work through them in the Fact-check tab.', 'Attribute the ones you cannot verify.', 'Cut what you cannot support.'], seed: unver.map(c => c.text).join('|') }));
  } else if (claims.length >= 3) out.push(finding({ id: 'no-workbench', principle: 'Elements: discipline of verification', severity: 'Clarity', editorId: 'JOURNALISM_VERIFY', headline: 'Checkable claims, but nothing in the fact-check workbench yet', observation: `${claims.length} sentences look checkable. Nothing has been logged for checking.`, options: ['Open the Fact-check tab and log the ones that matter.', 'Skip it for a short, opinion-labelled piece.'], seed: 'no-workbench' }));

  return out;
}

export function findingToNote(f: JournalismFinding, idx: number): Note {
  return { id: `j${idx}-${f.fingerprint}`, editorId: f.editorId, severity: f.severity, dimension: f.severity === 'Risk' ? 'harm' : 'sourcing', fingerprint: f.fingerprint, headline: f.headline, observation: f.observation, anchor: f.anchor, options: f.options, yourCall: f.yourCall, source: 'local', metric: { name: f.principle, value: '', explanation: 'Raised by a deterministic check; the editors are asking, not convicting.' } };
}
