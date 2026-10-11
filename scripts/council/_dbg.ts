import { readFileSync } from 'node:fs';
for (const l of readFileSync('.env.local','utf8').split(/\r?\n/)) { const m=/^([A-Z0-9_]+)=(.*)$/.exec(l); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^"|"$/g,''); }
import { directorSystem, proposalUser, parseJson, readProposal } from '../../services/council/councilPrompts';
import { emptyProfile } from '../../services/council/councilDirectors';
const brief = { ask: 'Set the art direction for 12 anniversary evites.', audience: 'couples', feeling: 'intimate' };
const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1100, temperature: 0.9, system: directorSystem('BAROQUE' as any, emptyProfile('BAROQUE' as any, [])), messages: [{ role: 'user', content: proposalUser(brief as any, ['CLASSICAL'] as any) }] }) });
const d: any = await r.json();
const text = d?.content?.[0]?.text || JSON.stringify(d).slice(0, 500);
console.log('stop:', d.stop_reason, 'len', text.length); console.log(text.slice(0, 400)); console.log('...', text.slice(-300));
console.log('parsed?', !!parseJson(text), 'proposal?', !!readProposal('BAROQUE' as any, parseJson(text)));
