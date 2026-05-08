import fs from 'fs';
import path from 'path';

const componentsDir = path.join(process.cwd(), 'components');

function walk(dir: string) {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(componentsDir);
const pattern = /<h1 className="text-(?:4xl|5xl|6xl|7xl|8xl)(?:[^"]*)"/g;
const replacement = '<h1 className="text-8xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none"';

files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // We want to skip some files if they shouldn't be touched. Let's just blindly update all matches that fit the pattern.
  // Wait, let's only target page headers. The pattern finds headers that are 4xl-8xl.
  // We'll replace them if they contain "font-black" and "uppercase" which are mostly page headers.
  
  const modifiedContent = content.replace(/<h1 className="(?:[^"]*text-[45678]xl[^"]*)"/g, (match) => {
    // Only replace if it contains font-black and uppercase 
    // and is not already our target style.
    if (match.includes("font-black") && match.includes("uppercase")) {
       return replacement;
    }
    return match;
  });

  if (content !== modifiedContent) {
    fs.writeFileSync(file, modifiedContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
