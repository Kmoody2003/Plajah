import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
const dir=path.resolve('.flux-math-preview');await mkdir(dir,{recursive:true});
await build({entryPoints:['components/plajahPixels/dev/fluxGallery.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(dir,'gallery.js')});
await build({entryPoints:['services/fabula/fluxTempo.worker.ts'],bundle:true,format:'esm',platform:'browser',outfile:path.join(dir,'tempo.js')});
const html=(await readFile('flux-gallery.html','utf8')).replace('/components/plajahPixels/dev/fluxGallery.ts','/gallery.js');
await writeFile(path.join(dir,'index.html'),html);
createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://localhost');const file=url.pathname.endsWith('fluxTempo.worker.ts')?'tempo.js':url.pathname==='/gallery.js'?'gallery.js':url.pathname==='/favicon.ico'?null:'index.html';
    if(!file){res.writeHead(204);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(path.join(dir,file)));
  }catch{res.writeHead(500);res.end('Preview unavailable');}
}).listen(5176,'127.0.0.1',()=>console.log('Flux gallery: http://127.0.0.1:5176/flux-gallery.html'));
