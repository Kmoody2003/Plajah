// Standalone dev server for the full Tela document editor (Type tool, text layers, tool-options row):
//   npx vite --config tela-typetool-lab.vite.config.mjs  ->  http://127.0.0.1:3170/tela-typetool-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-tela-typetool-lab',
  plugins: [react(), tailwindcss()],
  // TelaView's graph reaches the app entry; the PWA plugin's virtual module is stubbed here.
  resolve: { alias: { 'virtual:pwa-register': '/src/labStubs/pwaRegister.ts' } },
  // Export libraries load lazily; pre-bundle them so the first export doesn't reload the page.
  optimizeDeps: { entries: ['tela-typetool-lab.html'], include: ['mediabunny', 'fflate'] },
  server: {
    host: '127.0.0.1',
    port: 3170,
    strictPort: true,
    // The app's own index.html can't build here (no PWA plugin); don't let its error cover lab pages.
    hmr: { overlay: false },
    watch: {
      // Only Tela's own files, so other sessions' edits elsewhere don't reload the editor.
      ignored: (p) => {
        const f = p.replace(/\\/g, '/');
        if (/\/node_modules\//.test(f)) return true;
        return !/\/plajah\/(components\/tela|components\/text|services\/tela|services\/text|src\/telaTypeToolLab)/.test(f) && !/\/plajah\/types\.ts$/.test(f) && !/\/plajah\/?$/.test(f) && !/\/plajah\/(components|services|src)\/?$/.test(f);
      },
    },
  },
});
