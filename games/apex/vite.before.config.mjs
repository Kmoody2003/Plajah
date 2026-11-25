// A third Apex dev server (port 4334) for before/after graphics comparisons: the same game as the check server (4333), except the source files
// listed in the folder APEX_BEFORE_DIR (default: none) are served from there instead. Used by scripts/apex-shots.mjs with APEX_URL=http://127.0.0.1:4334.
import base from './vite.config.mjs';
import fs from 'node:fs';
import path from 'node:path';

export default (env) => {
  const c = base(env);
  const dir = process.env.APEX_BEFORE_DIR || '';
  const swap = dir && fs.existsSync(dir) ? new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) : new Set();
  const plugin = {
    name: 'apex-before-swap',
    enforce: 'pre',
    load(id) {
      const p = id.split('?')[0].replace(/\\/g, '/');
      const m = p.match(/\/games\/apex\/src\/([^/]+\.ts)$/);
      if (m && swap.has(m[1])) return fs.readFileSync(path.join(dir, m[1]), 'utf8');
      return null;
    },
  };
  console.log('apex before-server: swapping', [...swap].join(', ') || 'nothing');
  return { ...c, plugins: [plugin, ...(c.plugins || [])], cacheDir: c.cacheDir + '-before', server: { ...c.server, port: 4334, hmr: false, watch: { ignored: ['**/*'] } } };
};
