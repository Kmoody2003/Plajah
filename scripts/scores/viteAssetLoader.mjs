// Node loader hook: lets scripts import modules that use Vite asset suffixes (`x.wasm?url`, `?raw`, `?worker`).
// `?url` resolves to the file path string; the renderer loads the wasm from disk itself in Node.
export async function resolve(specifier, context, next) {
  const m = /^(.*)\?(url|raw|worker|worker&url)$/.exec(specifier);
  if (m) {
    const url = new URL(m[1], context.parentURL).href;
    return { url: `${url}?${m[2]}`, shortCircuit: true, format: 'module' };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  const m = /^(file:.*)\?(url|raw|worker|worker&url)$/.exec(url);
  if (m) {
    const { fileURLToPath } = await import('node:url');
    const fs = await import('node:fs');
    const file = fileURLToPath(m[1]);
    const value = m[2] === 'raw' ? fs.readFileSync(file, 'utf8') : file;
    return { format: 'module', source: `export default ${JSON.stringify(value)};`, shortCircuit: true };
  }
  return next(url, context);
}
