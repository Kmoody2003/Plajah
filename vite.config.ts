import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        // Honor a PORT assigned by the harness (autoPort) so a second dev server
        // can run alongside one already holding 3000; defaults to 3000 otherwise.
        port: Number(process.env.PORT) || 3000,
        host: '0.0.0.0',
        hmr: false
      },
      plugins: [
        react(), 
        tailwindcss(),
        VitePWA({
          // 'prompt' (NOT autoUpdate). autoUpdate force-reloads the whole page the
          // instant any new deploy lands — interrupting video/audio/games/uploads
          // mid-session, which reads as the platform "randomly reloading". It also
          // bypassed the careful update logic in index.tsx. In 'prompt' mode the new
          // version is fetched and WAITS; index.tsx applies it only on a clean load
          // (page <6s old + nothing playing) or the next time the app is opened
          // fresh — so updates are invisible and never reload an active session.
          registerType: 'prompt',
          // Never run a service worker in dev. Otherwise a Workbox SW shadows the
          // Vite dev server — it answers /assets/* from its precache (CacheFirst),
          // so you edit source and the browser keeps serving the last prod build.
          devOptions: { enabled: false },
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
          manifest: {
            name: "Plajah",
            short_name: "Plajah",
            theme_color: "#020202",
            background_color: "#020202",
            display: "standalone",
            orientation: "portrait",
            start_url: "/",
            icons: [
              {
                src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Circle-icons-dev.svg/192px-Circle-icons-dev.svg.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any maskable"
              },
              {
                src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Circle-icons-dev.svg/512px-Circle-icons-dev.svg.png",
                sizes: "512x512",
                type: "image/png"
              }
            ]
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            cleanupOutdatedCaches: true,
            navigateFallback: null,
            // Keep the optional Basic Pitch model + TensorFlow.js OUT of the install
            // precache so they only download when a user actually taps "Enhance with
            // AI". They're cached on first real fetch by the runtime rules below.
            globIgnores: [
              '**/register_all_kernels-*.js',
              '**/basicPitchBackend-*.js',
              'models/basic-pitch/**',
              '**/models/basic-pitch/**',
              // Verovio (~8 MB) + ONNX Runtime wasm (~27 MB) are lazy, optional features —
              // keep them OUT of the install precache (they exceed the size limit and would
              // bloat every install). Cached on first real use by the runtime rule below.
              '**/verovio-*.js',
              '**/ort-*.wasm',
              '**/ort-*.mjs',
              '**/ort.bundle*.js',
            ],
            runtimeCaching: [
              {
                // Lazy ML/engraving assets (tfjs, Basic Pitch, Verovio, ONNX Runtime): cache on first use.
                urlPattern: ({ url }: { url: URL }) =>
                  url.pathname.startsWith('/models/') ||
                  /register_all_kernels-|basicPitchBackend-|verovio-|ort-|ort\.bundle/.test(url.pathname),
                handler: 'CacheFirst' as const,
                options: { cacheName: 'plajah-ml', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
              },
              {
                // HTML documents: always hit network first. Falls back to cache only when offline.
                // Combined with no-cache HTTP headers this guarantees users see new deploys.
                urlPattern: ({ request }: { request: Request }) => request.destination === 'document',
                handler: 'NetworkFirst' as const,
                options: {
                  cacheName: 'plajah-html',
                  networkTimeoutSeconds: 4,
                  expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 }
                }
              },
              {
                // Hashed JS/CSS: content hash changes on every deploy so CacheFirst is safe.
                // Server also sends immutable headers for these.
                urlPattern: ({ request, url }: { request: Request; url: URL }) =>
                  (request.destination === 'script' || request.destination === 'style') &&
                  url.pathname.startsWith('/assets/'),
                handler: 'CacheFirst' as const,
                options: {
                  cacheName: 'plajah-assets',
                  expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 }
                }
              },
              {
                urlPattern: ({ url }: { url: URL }) =>
                  url.origin === 'https://fonts.googleapis.com' ||
                  url.origin === 'https://fonts.gstatic.com',
                handler: 'CacheFirst' as const,
                options: { cacheName: 'plajah-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } }
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      build: {
        // AudioWorklet processors must stay REAL FILES. Small assets are inlined as data: URLs
        // by default, which changes addModule()'s behaviour between dev (a served URL) and prod
        // (an opaque-origin data: URL) — the exact dev/prod divergence that makes worklet bugs
        // only appear in production. Melos Beats' clock is ~1.5KB, well under the inline limit,
        // so it has to be excluded explicitly.
        assetsInlineLimit: (filePath: string) => (filePath.endsWith('.worklet.js') ? false : undefined),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          // jsmediatags' package.json `browser` field points to dist/jsmediatags.js
          // which doesn't exist (only dist/jsmediatags.min.js ships) — alias the bare
          // import to the real file so Vite can resolve it in the browser.
          'jsmediatags': path.resolve(__dirname, 'node_modules/jsmediatags/dist/jsmediatags.min.js'),
        },
        // Force a single @firebase/app instance. Without this, Vite can
        // pre-bundle firebase/app-check into a separate chunk carrying its own
        // @firebase/app copy, so App Check registers into a different component
        // container than initializeApp() used → "Component app-check has not
        // been registered yet".
        // Force a single @firebase/app instance (App Check) AND a single
        // TensorFlow.js instance. Without the tfjs dedupe, Vite pre-bundles
        // @tensorflow/tfjs and @spotify/basic-pitch's tfjs separately, so two
        // copies register their WebGL kernels ("kernel already registered")
        // and a GraphModel from one copy operates on tensors from the other →
        // unstable / hanging inference.
        dedupe: [
          'firebase', '@firebase/app', '@firebase/app-check',
          '@tensorflow/tfjs', '@tensorflow/tfjs-core',
          '@tensorflow/tfjs-backend-webgl', '@tensorflow/tfjs-backend-cpu',
        ],
      },
      optimizeDeps: {
        // Pre-bundle App Check alongside the other firebase modules so they
        // share one optimized firebase/app dependency. Pre-bundle tfjs +
        // basic-pitch together so they share ONE tfjs instance.
        include: [
          'firebase/app',
          'firebase/app-check',
          'firebase/auth',
          'firebase/firestore',
          'firebase/storage',
          '@tensorflow/tfjs',
          '@spotify/basic-pitch',
        ],
        // Verovio ships an embedded-WASM ESM module; let Vite serve it as-is instead of
        // pre-bundling. onnxruntime-web (on-device Demucs) ships wasm/worker assets that must
        // not be pre-bundled either.
        exclude: ['verovio', 'onnxruntime-web'],
      },
    };
});
