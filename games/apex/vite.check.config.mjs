// A second Apex dev server for long automated checks (scripts/apex-lapdrive.mjs, apex-shots.mjs with APEX_URL=http://127.0.0.1:4333): no hot reload and
// no file watching, so a page keeps running the code it loaded while other work saves files (the main server on 4332 reloads the page on every save).
import base from './vite.config.mjs';

export default (env) => {
  const c = base(env);
  return { ...c, cacheDir: c.cacheDir + '-check', server: { ...c.server, port: 4333, hmr: false, watch: { ignored: ['**/*'] } } };
};
