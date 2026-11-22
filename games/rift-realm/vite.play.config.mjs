// Rift Realm "play" server: the same live game as vite.config.mjs, but with hot reload OFF.
// Other sessions editing code (or reloading the shared preview tab) restart the game and cut the music on the dev
// server; this one never reloads by itself. Refresh the page (F5) when you want the latest code.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.mjs';

export default defineConfig((env) => mergeConfig(base(env), {
  server: { port: 4358, hmr: false, watch: { ignored: ['**/*'] } },
}));
