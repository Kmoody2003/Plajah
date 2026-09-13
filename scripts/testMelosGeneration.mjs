// The instrument factory imports Vite ?url assets. Preserve their URL semantics in Node tests.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'artifacts/melos-generation-tests/test.mjs');
await build({
  absWorkingDir: root, entryPoints: ['./tests/melosGeneration.test.ts'], outfile,
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'vite-url-imports', setup(builder) {
    builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'asset-url' }));
    builder.onLoad({ filter: /.*/, namespace: 'asset-url' }, args => ({ contents: `export default ${JSON.stringify(args.path)};`, loader: 'js' }));
  } }],
});
const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit', windowsHide: true });
process.exit(result.status ?? 1);
