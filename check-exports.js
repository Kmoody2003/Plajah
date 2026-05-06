import fs from 'fs';

const appTsx = fs.readFileSync('App.tsx', 'utf8');
const lazyImports = [...appTsx.matchAll(/retryLazy\(\(\) => import\('\.\/(components\/[^']+)'\)\)/g)].map(m => m[1]);

for (const comp of lazyImports) {
  const compPath = comp + '.tsx';
  let content;
  try {
     content = fs.readFileSync(compPath, 'utf8');
  } catch(e) {
     try {
       content = fs.readFileSync(comp + '/index.tsx', 'utf8');
     } catch (e2) {
       console.log("Could not find file for", comp);
       continue;
     }
  }
  
  if (!content.includes('export default')) {
    console.log("Missing export default:", compPath);
  }
}
