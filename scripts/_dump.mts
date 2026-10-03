import path from 'node:path'; import {pathToFileURL} from 'node:url';
const id=process.argv[2];
const mod=(await import(pathToFileURL(path.resolve('data/practice/courses',id+'.ts')).href)).COURSE_MODULE;
let n=0,t=0;
for(const q of mod.bank.questions){ if(q.kind!=='mcq')continue; t++; const c=q.choices; const L=c.map((x:string)=>x.length); const a=q.answer; const mx=Math.max(...L); if(L[a]===mx && L.filter((x:number)=>x===mx).length===1){n++; console.log(q.id,'A='+a,'\n P:',q.prompt.slice(0,200),'\n',c.map((x:string,i:number)=>` ${i}${i===a?'*':' '}[${x.length}] ${x}`).join('\n'));}}
console.log(n,t, Object.keys(mod.bank.questions[0]));
