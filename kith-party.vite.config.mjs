import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { watchIgnored } from './vite.watch-ignore.mjs';
export default defineConfig({
  base:'./', publicDir:false, cacheDir:'node_modules/.vite-kith-party',
  plugins:[react(),{name:'kith-local-assets',configureServer(server){server.middlewares.use('/kith-party', (req,res,next)=>{const root=path.resolve('public/kith-party');const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return next();res.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(file).pipe(res);});},closeBundle(){fs.cpSync('public/kith-party','dist-kith-party/kith-party',{recursive:true});fs.copyFileSync('scripts/kith-party/serve.mjs','dist-kith-party/start-kith-party.mjs');fs.copyFileSync('docs/KITH_PARTY.md','dist-kith-party/README.md');}}],
  optimizeDeps:{entries:['kith-party.html']},server: { watch: { ignored: [watchIgnored] }, host:'127.0.0.1',port:3188},
  build:{outDir:'dist-kith-party',rollupOptions:{input:'kith-party.html'}},
});
