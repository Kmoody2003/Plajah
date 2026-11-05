// Standalone dev server for the full product page (components/store/ProductPage.tsx). Products are read live
// (public); sign-in, reviews, waitlist and uploads are lab shims, so nothing is written anywhere:
//   npx vite --config product-page-lab.vite.config.mjs  ->  http://127.0.0.1:3223/product-page-lab.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

const SHIM = path.resolve('labs/product-page/shims.ts');
const INV = path.resolve('labs/product-page/inventoryShim.ts');
const EDITORS = /(components[\\/]store[\\/](ProductLiveEditor|ProductTelaOverlay)\.tsx|components[\\/]inventory[\\/]ProductEditor\.tsx|services[\\/]productTelaBridge\.ts)$/;
const shimForProductPage = () => ({
  name: 'product-page-shims',
  enforce: 'pre',
  resolveId(id, importer) {
    if (!importer) return null;
    // The live-page editor, the Tela overlay and the backend editor save through inventoryService → in-memory here.
    if (EDITORS.test(importer) && /services\/inventoryService$/.test(id)) return INV;
    if (/services[\\/]productTelaBridge\.ts$/.test(importer) && id === './firebase') return SHIM;   // Tela doc owner = the lab user
    if (!/components[\\/]store[\\/]ProductPage\.tsx$/.test(importer)) return null;
    if (/services\/inventoryService$/.test(id)) return INV;
    if (/services\/(backendService|storeService)$/.test(id)) return SHIM;
    return null;
  },
});

export default defineConfig({
  cacheDir: 'node_modules/.vite-product-page-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    shimForProductPage(), react(), tailwindcss(),
  ],
  define: { __PJ_VERSION__: JSON.stringify('lab'), 'process.env.API_KEY': '""', 'process.env.GEMINI_API_KEY': '""' },
  resolve: { alias: { '@': path.resolve('.') }, dedupe: ['firebase', '@firebase/app', '@firebase/app-check'] },
  optimizeDeps: { entries: ['product-page-lab.html', 'components/tela/TelaView.tsx'] },
  server: { host: '127.0.0.1', port: 3223, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
