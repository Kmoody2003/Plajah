import { COURSE_MODULE } from '../data/practice/courses/law-crimlaw';
const qs:any[]=(COURSE_MODULE as any).bank.questions;
const tail=(x:string)=>x.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(Boolean).slice(-5).join(' ');
const wt:Record<string,number>={},rt:Record<string,number>={};
for(const q of qs)if(q.kind==='mcq')q.choices.forEach((c:string,i:number)=>{const m=i===q.answer?rt:wt;m[tail(c)]=(m[tail(c)]||0)+1});
const f=new Set(Object.entries(wt).filter(([t,n])=>n>=4&&(rt[t]||0)<=1).map(([t])=>t));
console.log([...f].join('\n'));
for(const q of qs){if(q.kind!=='mcq')continue;
 const bad=q.choices.map((c:string,i:number)=>i!==q.answer&&f.has(tail(c)));
 const lg=q.choices.every((x:string,i:number)=>i===q.answer||x.length<q.choices[q.answer].length);
 if(bad.some(Boolean)||lg){console.log(`\n## ${q.id} ans=${q.answer} longest=${lg}\nQ: ${q.prompt}`);q.choices.forEach((c:string,i:number)=>console.log(` ${i}${i===q.answer?'*':' '}${bad[i]?'F':' '} [${c.length}] ${c}`));}}
