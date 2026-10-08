import { COURSE_MODULE } from '../data/practice/courses/law-crimlaw';
const qs:any[]=(COURSE_MODULE as any).bank.questions;
const r:any[]=[];
for(const q of qs){if(q.kind!=='mcq')continue;const c=q.choices as string[];const a=c[q.answer].length;
 let bi=-1,bl=-1;c.forEach((x,i)=>{if(i!==q.answer&&x.length>bl){bl=x.length;bi=i}});
 if(bl<a)r.push({gap:a-bl,q,bi});}
r.sort((x,y)=>x.gap-y.gap);
const [s,e]=[+process.argv[2],+process.argv[3]];
r.slice(s,e).forEach(({gap,q,bi})=>{console.log(`\n## ${q.id} gap=${gap} ans=${q.answer} longestWrong=${bi}\nQ: ${q.prompt}`);q.choices.forEach((c:string,i:number)=>console.log(` ${i}${i===q.answer?'*':' '}[${c.length}] ${c}`))});
console.log('\nTOTAL',r.length);
