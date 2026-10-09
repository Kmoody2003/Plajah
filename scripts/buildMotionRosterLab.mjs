// Build the Motion Council + Studio Roster lab (src/motionRosterLab.tsx) as a static page — no Express/Firebase,
// no vite. Model calls are stubbed offline, so the panel shows the deterministic localAdvice path.
//   node scripts/buildMotionRosterLab.mjs <outDir>   then serve <outDir> (e.g. npx serve <outDir>)
import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve(process.argv[2]||'.motion-roster-lab');
fs.mkdirSync(out,{recursive:true});
const stub={name:'stub',setup(b){
  b.onResolve({filter:/geminiService$/},()=>({path:'g',namespace:'stub'}));
  b.onLoad({filter:/^g$/,namespace:'stub'},()=>({contents:`export const callGemini=async()=>{throw new Error('offline lab')};`,loader:'js'}));
}};
await build({entryPoints:['src/motionRosterLab.tsx'],bundle:true,outfile:path.join(out,'lab.js'),format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:true,plugins:[stub],logLevel:'warning'});
// Tailwind via the play CDN keeps the lab self-contained; the real app compiles the same classes with @tailwindcss/vite.
fs.writeFileSync(path.join(out,'index.html'),`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Motion roster lab</title>
<script src="https://cdn.tailwindcss.com/3.4.16"></script></head>
<body style="margin:0;background:#06080b;font-family:Inter,system-ui,sans-serif"><div id="root"></div><script type="module" src="./lab.js"></script></body></html>
`);
console.log('motion roster lab →',out);
