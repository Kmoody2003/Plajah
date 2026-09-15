import fs from 'node:fs/promises';const root='https://huggingface.co/datasets/gbionics/cmu-fbx/resolve/main/';
const r=await fetch(root+'metadata.csv');const t=await r.text();await fs.writeFile('firstlight-mocap-metadata.csv',t);console.log(t.split('\n').filter(l=>/football|^35_17|^02_03/.test(l)).slice(0,15).join('\n'));console.log(t.slice(0,800));
const j=await(await fetch('https://huggingface.co/api/datasets/gbionics/cmu-fbx/tree/main/animations')).json();console.log(JSON.stringify(j).slice(0,1200));
