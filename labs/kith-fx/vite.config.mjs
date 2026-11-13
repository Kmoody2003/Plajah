import {defineConfig} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const repo=path.resolve(import.meta.dirname,'../..');
export default defineConfig({
 root:import.meta.dirname, publicDir:false, cacheDir:path.join(repo,'node_modules/.vite-kith-fx'),
 plugins:[{name:'kith-assets',configureServer(server){server.middlewares.use('/kith-party',(req,res,next)=>{const root=path.join(repo,'public/kith-party');const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return next();res.setHeader('Content-Type','application/octet-stream');fs.createReadStream(file).pipe(res);});}}],
 server:{host:'127.0.0.1',port:3261,fs:{allow:[repo]}},
});
