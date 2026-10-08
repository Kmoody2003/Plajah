export interface GrammarReading { raw: string; language: string; components: string[][]; complete: boolean; }
const person: Record<string, string> = { '1': 'first person', '2': 'second person', '3': 'third person' };
const gender: Record<string, string> = { m: 'masculine', f: 'feminine', b: 'both genders', c: 'common gender' };
const number: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const state: Record<string, string> = { a: 'absolute state', c: 'construct state', d: 'determined state' };
const stems: Record<string, string> = { q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael', o: 'polel', O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal', k: 'palel', K: 'pulal', Q: 'qal passive', l: 'pilpel', L: 'polpal', f: 'hithpalpel', D: 'nithpael', j: 'pealal', i: 'pilel', u: 'hothpaal', c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel', z: 'hithpoel' };
const aramaic: Record<string, string> = { q: 'peal', Q: 'peil', u: 'hithpeel', p: 'pael', P: 'ithpaal', M: 'hithpaal', a: 'aphel', h: 'haphel', s: 'saphel', e: 'shaphel', H: 'hophal', i: 'ithpeel', t: 'hishtaphel', v: 'ishtaphel', w: 'hithaphel', o: 'polel', z: 'ithpoel', r: 'hithpolel', f: 'hithpalpel', b: 'hephal', c: 'tiphel', m: 'poel', l: 'palpel', L: 'ithpalpel', O: 'ithpolel', G: 'ittaphal' };
const conjugation: Record<string, string> = { p: 'perfect (qatal)', q: 'sequential perfect (weqatal)', i: 'imperfect (yiqtol)', w: 'sequential imperfect (wayyiqtol)', h: 'cohortative', j: 'jussive', v: 'imperative', r: 'active participle', s: 'passive participle', a: 'infinitive absolute', c: 'infinitive construct' };
/** Decode OSHB codes; do not treat aspect labels as automatic English tenses. */
export function decodeHebrewMorphology(raw: string): GrammarReading {
  const result: GrammarReading = { raw, language: raw[0] === 'A' ? 'Aramaic' : 'Hebrew', components: [], complete: true };
  if (!/^[HA]/.test(raw)) return { ...result, language: 'Unknown', complete: false };
  const add = (out: string[], table: Record<string, string>, code: string | undefined) => {
    if (!code || code === 'x') return;
    if (table[code]) out.push(table[code]); else { out.push(`Unrecognized source value: ${code}`); result.complete = false; }
  };
  for (const code of raw.slice(1).split('/')) {
    const out: string[] = [];
    if (['N', 'A'].includes(code[0])) {
      out.push(code[0] === 'N' ? 'noun' : 'adjective');
      add(out, code[0] === 'N' ? { c: 'common noun', g: 'gentilic', p: 'proper name' } : { a: 'adjective', c: 'cardinal number', g: 'gentilic', o: 'ordinal number' }, code[1]);
      add(out, gender, code[2]); add(out, number, code[3]); add(out, state, code[4]);
      if (code.length > 5) result.complete = false;
    } else if (code[0] === 'V') {
      out.push('verb'); add(out, result.language === 'Aramaic' ? aramaic : stems, code[1]); add(out, conjugation, code[2]);
      if (['r', 's'].includes(code[2])) { add(out, gender, code[3]); add(out, number, code[4]); add(out, state, code[5]); if (code.length > 6) result.complete = false; }
      else if (['a', 'c'].includes(code[2])) { if (code.length > 3) result.complete = false; }
      else { add(out, person, code[3]); add(out, gender, code[4]); add(out, number, code[5]); if (code.length > 6) result.complete = false; }
    } else if (['P', 'S'].includes(code[0])) {
      out.push(code[0] === 'P' ? 'pronoun' : 'suffix');
      add(out, code[0] === 'P' ? { d: 'demonstrative', f: 'indefinite', i: 'interrogative', p: 'personal', r: 'relative' } : { d: 'directional he', h: 'paragogic he', n: 'paragogic nun', p: 'pronominal' }, code[1]);
      add(out, person, code[2]); add(out, gender, code[3]); add(out, number, code[4]); if (code.length > 5) result.complete = false;
    } else if (code[0] === 'T') {
      out.push('particle'); add(out, { a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative', j: 'interjection', m: 'demonstrative', n: 'negative', o: 'direct object marker', r: 'relative' }, code[1]); if (code.length > 2) result.complete = false;
    } else if (code[0] === 'R') { out.push('preposition'); add(out, { d: 'with definite article' }, code[1]); if (code.length > 2) result.complete = false; }
    else if (code === 'C') out.push('conjunction');
    else if (code === 'D') out.push('adverb');
    else { out.push('Unrecognized source component'); result.complete = false; }
    result.components.push(out);
  }
  return result;
}
/** UGNT's CNTR chart uses commas as empty character slots, not separators. */
export function decodeGreekMorphology(raw: string): GrammarReading {
  const result: GrammarReading = { raw, language: 'Greek', components: [], complete: true };
  if (!raw.startsWith('Gr,')) return { ...result, complete: false };
  const code = raw.slice(3), out: string[] = [];
  const add = (table: Record<string, string>, value: string | undefined) => {
    if (!value || value === ',') return;
    if (table[value]) out.push(table[value]); else { out.push(`Unrecognized source value: ${value}`); result.complete = false; }
  };
  const roles: Record<string, string> = { N: 'noun', A: 'adjective', E: 'determiner', R: 'pronoun', V: 'verb', I: 'interjection', P: 'preposition', D: 'adverb', C: 'conjunction', T: 'particle' };
  add(roles, code[0]);
  const subtypes: Record<string, Record<string, string>> = { N: { S: 'substantive adjective', P: 'predicate adjective' }, A: { A: 'ascriptive', R: 'restrictive' }, E: { A: 'article', D: 'demonstrative', F: 'differential', P: 'possessive', Q: 'quantifier', N: 'number', O: 'ordinal', R: 'relative', T: 'interrogative' }, R: { D: 'demonstrative', P: 'personal', E: 'reflexive', C: 'reciprocal', I: 'indefinite', R: 'relative', T: 'interrogative' }, V: { T: 'transitive', I: 'intransitive', L: 'linking' }, I: { E: 'exclamation', D: 'directive', R: 'response' }, P: { I: 'improper' }, D: { O: 'correlative' }, C: { C: 'coordinating', S: 'subordinating', O: 'correlative' }, T: { F: 'foreign', E: 'error' } };
  add(subtypes[code[0]] || {}, code[1]);
  add({ I: 'indicative mood', M: 'imperative mood', S: 'subjunctive mood', O: 'optative mood', N: 'infinitive', P: 'participle' }, code[2]);
  add({ P: 'present', I: 'imperfect', F: 'future', A: 'aorist', E: 'perfect', L: 'pluperfect' }, code[3]);
  add({ A: 'active voice', M: 'middle voice', P: 'passive voice' }, code[4]); add(person, code[5]);
  add({ N: 'nominative case', G: 'genitive case', D: 'dative case', A: 'accusative case', V: 'vocative case' }, code[6]);
  add({ M: 'masculine', F: 'feminine', N: 'neuter' }, code[7]); add({ S: 'singular', P: 'plural' }, code[8]);
  if (code.length < 9 || /[^,]/.test(code.slice(9))) result.complete = false;
  result.components.push(out); return result;
}
export const GRAMMAR_HELP: Record<string, string> = {
  'construct state': 'This noun is linked to another expression, often forming a relationship translated with “of.”',
  'absolute state': 'The noun is not marked as construct in this parsing. Its role still depends on the sentence.',
  'perfect (qatal)': 'A Hebrew conjugation often presenting an event as a whole. Context determines its time and use; it does not always mean English past tense.',
  'imperfect (yiqtol)': 'A Hebrew conjugation used for several kinds of incomplete, continuing, future or modal expressions. Read its time and force from context.',
  'aorist': 'A Greek tense-form often viewing an event as a whole. It does not by itself mean the event happened only once.',
  'active voice': 'The subject is presented as performing the action.',
  'passive voice': 'The subject is presented as receiving or undergoing the action.',
  'nominative case': 'Often marks the subject or a predicate expression.',
  'genitive case': 'Often expresses a relationship between words. It has several uses beyond ownership.',
  'dative case': 'Can mark a recipient or other relationships such as means, location or association.',
  'accusative case': 'Often marks an object; prepositions and other constructions also use it.',
  'indicative mood': 'Commonly presents an assertion or a question. Mood alone does not establish whether a statement is true.',
};
