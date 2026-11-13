import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
// Standalone dev harness for Kith Quest. Serves /kith-party assets like the main kith-party config.
export default defineConfig({
  root:path.resolve('labs/kith-quest'),publicDir:false,cacheDir:path.resolve('node_modules/.vite-kith-quest'),
  plugins:[react(),{name:'kith-local-assets',configureServer(server){server.middlewares.use('/kith-party',(req,res,next)=>{const root=path.resolve('public/kith-party');const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return next();res.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(file).pipe(res);});}}],
  server:{host:'127.0.0.1',port:3254,fs:{allow:[path.resolve('.')]}},
});
