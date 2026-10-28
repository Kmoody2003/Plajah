// Chat basics lab: ChatWindow with sample messages (edit, tombstone, files, link cards, forward, mute).
//   npx vite --config chat-basics-lab.vite.config.mjs  ->  http://127.0.0.1:3183/chat-basics-lab.html
// backendService is swapped for labs/chat-basics/backendShim.ts so the window gets sample messages and
// a signed-in user without Firebase. Every other import is the real code.
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { watchIgnored } from './vite.watch-ignore.mjs';

// Real module → lab shim. A shim's own import of its real module is left alone.
const SHIMS = new Map([
  [path.resolve('services/backendService.ts'), path.resolve('labs/chat-basics/backendShim.ts')],
  [path.resolve('services/meetings/meetingRecording.ts'), path.resolve('labs/chat-basics/meetingShim.ts')],
]);
const shimFiles = new Set(SHIMS.values());

export default defineConfig({
  cacheDir: 'node_modules/.vite-chat-basics-lab',
  plugins: [
    {
      name: 'stub-pwa-register',
      resolveId: (id) => (id === 'virtual:pwa-register' ? 'virtual-pwa-stub' : null),
      load: (id) => (id === 'virtual-pwa-stub' ? 'export const registerSW = () => () => {};' : null),
    },
    {
      name: 'chat-basics-backend-shim',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!importer || shimFiles.has(path.resolve(importer)) || !/(backendService|meetingRecording)(\.ts)?$/.test(source)) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return (resolved && SHIMS.get(path.resolve(resolved.id))) || null;
      },
    },
    react(), tailwindcss(),
  ],
  optimizeDeps: { entries: ['chat-basics-lab.html'] },
  server: { host: '127.0.0.1', port: 3183, strictPort: true, hmr: false, watch: { ignored: [watchIgnored, '**/dist*/**', '**/docs/**', '**/public/**', '**/.claude/**', '**/tests/**', '**/scripts/**'] } },
});
