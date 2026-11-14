import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { watchIgnored } from './vite.watch-ignore.mjs';
const MIME = { '.svg': 'image/svg+xml', '.css': 'text/css', '.mp3': 'audio/mpeg', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const RHYTHM_ERA_AUDIO = ['music-japan.mp3', 'music-aztec.mp3', 'music-norse.mp3', 'music-italy.mp3', 'music-rome.mp3'];
function serveStatic(prefixDir) {
  const root = path.resolve(prefixDir);
  return (req, res, next) => {
    const file = path.resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  };
}
export default defineConfig({
  base:'./', publicDir:false, cacheDir:'node_modules/.vite-kith-party',
  plugins:[react(),{name:'kith-local-assets',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{const u=(req.url||'').split('?')[0];if(u==='/'||u==='/index.html'){res.statusCode=302;res.setHeader('Location','/kith-party.html');return res.end();}next();});},configureServer(server){server.middlewares.use((req,res,next)=>{const u=(req.url||'').split('?')[0];if(u==='/'||u==='/index.html'){res.statusCode=302;res.setHeader('Location','/kith-party.html');return res.end();}next();});server.middlewares.use('/kith-party', serveStatic('public/kith-party'));server.middlewares.use('/games/era-clash/audio', serveStatic('public/games/era-clash/audio'));},closeBundle(){fs.cpSync('public/kith-party','dist-kith-party/kith-party',{recursive:true});fs.mkdirSync('dist-kith-party/games/era-clash/audio',{recursive:true});for(const f of RHYTHM_ERA_AUDIO){const src=path.join('public/games/era-clash/audio',f);if(fs.existsSync(src))fs.copyFileSync(src,path.join('dist-kith-party/games/era-clash/audio',f));}fs.copyFileSync('scripts/kith-party/serve.mjs','dist-kith-party/start-kith-party.mjs');fs.copyFileSync('docs/KITH_PARTY.md','dist-kith-party/README.md');}}],
  optimizeDeps:{entries:['kith-party.html']},server: { watch: { ignored: [watchIgnored] }, host:'127.0.0.1',port:3188},
  build:{outDir:'dist-kith-party',rollupOptions:{input:'kith-party.html'}},
});
