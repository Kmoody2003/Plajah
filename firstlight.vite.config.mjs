import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';
export default defineConfig({
  cacheDir: 'node_modules/.vite-firstlight',
  plugins: [react(),tailwindcss()],
  optimizeDeps: { entries: ['firstlight.html'] },
  server: { watch: { ignored: [watchIgnored] }, host:'127.0.0.1',port:3100},
  build: {outDir:'dist-firstlight',rollupOptions:{input:'firstlight.html'}},
});
