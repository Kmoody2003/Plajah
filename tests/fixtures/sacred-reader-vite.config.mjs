import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwind()], cacheDir: 'node_modules/.vite-sacred-readers', optimizeDeps: { entries: ['tests/fixtures/sacred-reader-preview.html'] }, server: { host: '127.0.0.1', port: 4318, strictPort: true }, build: { outDir: 'tmp/sacred-reader-build', rollupOptions: { input: 'tests/fixtures/sacred-reader-preview.html' }, copyPublicDir: false } });
