// Standalone dev server for Photoshop / Illustrator import in the full Tela editor:
//   npx vite --config tela-import-lab.vite.config.mjs  ->  http://127.0.0.1:3199/tela-import-lab.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-tela-import-lab',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { 'virtual:pwa-register': '/src/labStubs/pwaRegister.ts' } },
  optimizeDeps: { entries: ['tela-import-lab.html'], include: ['ag-psd', 'ag-psd/dist/psdReader', 'pdfjs-dist', 'fzstd', 'fflate'] },
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1', port: 3199, strictPort: true, hmr: { overlay: false },
    // The lab reads sample PSDs from any local drive.
    fs: { strict: false },
    watch: {
      ignored: (p) => {
        const f = p.replace(/\\/g, '/');
        if (/\/node_modules\//.test(f)) return true;
        return !/\/plajah\/(components\/tela|services\/tela|src\/telaImportLab)/.test(f) && !/\/plajah\/?$/.test(f) && !/\/plajah\/(components|services|src)\/?$/.test(f);
      },
    },
  },
});
