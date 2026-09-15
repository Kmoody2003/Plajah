import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  cacheDir: 'node_modules/.vite-firstlight',
  plugins: [react(),tailwindcss()],
  optimizeDeps: { entries: ['firstlight.html'] },
  server: {host:'127.0.0.1',port:3100},
  build: {outDir:'dist-firstlight',rollupOptions:{input:'firstlight.html'}},
});
