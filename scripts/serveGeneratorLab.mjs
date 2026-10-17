// Generator lab — bundles components/plajahPixels/dev/generatorGallery.ts and serves generator-gallery.html.
//
// The bundle is rebuilt on every page load (esbuild context, incremental), so a shader edit only
// needs a browser reload — never a server restart. The page remembers the loaded track across
// reloads, so iterating on a shader no longer cuts the music.
import { context } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const ctx = await context({
  entryPoints: ['components/plajahPixels/dev/generatorGallery.ts'],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, outfile: 'gallery.js',
});
let bundle = '';
let buildError = '';
async function rebuild() {
  try {
    const r = await ctx.rebuild();
    bundle = r.outputFiles[0].text; buildError = '';
  } catch (e) {
    buildError = String(e && e.message || e);
  }
}
await rebuild();

const port = Number(process.env.PORT || 5177);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    // Dev only: the lab POSTs rendered stills (genLab.sheet(..., name)) so they can be reviewed as files.
    if (req.method === 'POST' && url.pathname === '/__still') {
      const name = (url.searchParams.get('name') || 'still').replace(/[^\w.-]/g, '_');
      const chunks = []; for await (const c of req) chunks.push(c);
      const dir = join(tmpdir(), 'plajah-gen-stills'); await mkdir(dir, { recursive: true });
      const file = join(dir, name + '.png'); await writeFile(file, Buffer.concat(chunks));
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ file })); return;
    }
    if (url.pathname === '/gallery.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end(buildError ? `document.getElementById('error').textContent = ${JSON.stringify('BUILD ERROR\n' + buildError)};` : bundle);
      return;
    }
    await rebuild();                                   // fresh code on every page load
    const html = (await readFile('generator-gallery.html', 'utf8')).replace('/components/plajahPixels/dev/generatorGallery.ts', '/gallery.js');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
  } catch { res.writeHead(500); res.end('Preview unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`Generator lab: http://127.0.0.1:${port}/generator-gallery.html`));
