import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function exportArchitecture() {
  const result = await build({entryPoints:['scripts/halloween/architecture-preview.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false});
  const source = await readFile('scripts/halloween/architecture-preview.html','utf8');
  const script = result.outputFiles[0].text.replaceAll('</script','<\\/script');
  const html = source.replace(/<script type="module" src="[^\"]+"><\/script>/,()=>`<script>${script}</script>`);
  const file = path.resolve('artifacts/ravencrest-review/residential-construction-viewer.html');
  await mkdir(path.dirname(file),{recursive:true});
  await writeFile(file,html);
  return file;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await exportArchitecture());
